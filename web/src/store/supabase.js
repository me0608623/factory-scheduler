// Supabase 模式：資料在雲端資料庫，登入後依角色決定能不能改；別人的變更會即時推過來

import { fromSnapshot, blockToDb } from "../convert.js";
import { rowsOf, diffRows, UPSERT_ORDER, DELETE_ORDER, TABLE_KEYS, blocksKey } from "./diff.js";

// 畫面的紀錄種類 ↔ 資料庫 change_sets.kind
const KIND_TO_DB = { ot: "edit", save: "edit", move: "move", edit: "edit", auto: "auto", fault: "fault", leave: "leave", order: "order", recover: "recover" };
const KIND_FROM_DB = { recover: "fault", order: "edit", import: "edit" };

const jsAbs = (date, min) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5) * 1440 + min;
};

const TABLE_NAME = { processes: "工序", employees: "員工", employee_skills: "員工技能", leaves: "請假",
  employee_overtime_days: "單日加班意願", machines: "機台",
  machine_products: "機台模具", machine_faults: "機台故障", products: "產品", product_steps: "產品工序", orders: "工單",
  calendar_weekly: "每週上班日", calendar_days: "單日上班設定" };

// 資料庫拒絕（權限不足）時，換成看得懂的訊息
function writeError(t, error, verb) {
  const e = new Error(/row-level security|permission denied/i.test(error.message)
    ? `你的帳號沒有權限${verb}「${TABLE_NAME[t] || t}」` : `${verb}「${TABLE_NAME[t] || t}」失敗：${error.message}`);
  e.permission = /row-level security|permission denied/i.test(error.message);
  return e;
}

export class ConflictError extends Error {
  constructor(msg = "別人剛更新過排程") { super(msg); this.conflict = true; }
}

export class SupabaseStore {
  kind = "supabase";

  constructor(client) {
    this.sb = client;
    this.base = null;
    this.baseBlocks = "";
    this.version = 0;
    this.role = null;
    this.userName = "";
    this.session = null;
  }

  // ---------- 帳號 ----------
  async init() {
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    if (!this.session) return { needLogin: true };
    await this._profile();
    return { needLogin: false };
  }

  async login(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? "帳號或密碼不對" : error.message);
    this.session = data.session;
    await this._profile();
  }

  async requestPasswordReset(email, redirectTo) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error("寄送密碼設定信失敗：" + error.message);
  }

  async setPassword(password) {
    if (!this.session) throw new Error("請先登入或開啟邀請信中的連結");
    if (password.length < 12) throw new Error("密碼至少需要 12 個字元");
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error("設定密碼失敗：" + error.message);
  }

  async logout() {
    await this.sb.auth.signOut();
    this.session = null;
  }

  async _profile() {
    const { data } = await this.sb.from("profiles").select("display_name,role").eq("user_id", this.session.user.id).maybeSingle();
    this.role = data?.role || null;
    this.userName = data?.display_name || this.session.user.email || "";
  }

  jwt() { return this.session?.access_token || null; }

  // 舊版 Excel 作為獨立歷史資料儲存，絕不更動目前排程快照。
  async listLegacyArchives() {
    const { data, error } = await this.sb.from("legacy_schedule_archives")
      .select("id,source_name,source_sha256,date_from,date_to,imported_at")
      .order("imported_at", { ascending: false });
    if (error) throw new Error("讀取歷史排程失敗：" + error.message);
    return data || [];
  }

  async getLegacyArchive(id) {
    const { data, error } = await this.sb.from("legacy_schedule_archives")
      .select("payload").eq("id", id).single();
    if (error) throw new Error("讀取歷史排程內容失敗：" + error.message);
    return data.payload;
  }

  async saveLegacyArchive({ sourceName, sourceSha256, legacy }) {
    const table = this.sb.from("legacy_schedule_archives");
    const { data: found, error: lookupError } = await table
      .select("id,source_name,source_sha256,date_from,date_to,imported_at")
      .eq("source_sha256", sourceSha256).maybeSingle();
    if (lookupError) throw new Error("檢查歷史排程失敗：" + lookupError.message);
    if (found) return found;
    const { data, error } = await this.sb.from("legacy_schedule_archives")
      .insert({ source_name: sourceName, source_sha256: sourceSha256,
        date_from: legacy.dates[0], date_to: legacy.dates.at(-1), payload: legacy })
      .select("id,source_name,source_sha256,date_from,date_to,imported_at").single();
    if (error) throw new Error("儲存歷史排程失敗：" + error.message);
    return data;
  }

  // ---------- 讀 ----------
  async load() {
    const { data, error } = await this.sb.rpc("schedule_snapshot");
    if (error) throw new Error("讀取排程失敗：" + error.message);
    const S = fromSnapshot(data);
    const { data: logs } = await this.sb.from("change_sets").select("*").order("created_at", { ascending: false }).limit(200);
    S.log = (logs || []).map(logFromDb);
    this.version = S.version;
    this._remember(S);
    return S;
  }

  _remember(S) {
    this.base = rowsOf(S);
    this.baseBlocks = blocksKey(S);
  }

  // ---------- 寫：只寫有變的列；排程方塊整批用 save_blocks（有版本號檢查） ----------
  async sync(S, entry) {
    const d = diffRows(this.base, rowsOf(S));
    for (const t of UPSERT_ORDER) {
      if (!d[t]?.upsert.length) continue;
      const { error } = await this.sb.from(t).upsert(d[t].upsert, { onConflict: TABLE_KEYS[t].join(",") });
      if (error) throw writeError(t, error, "修改");
    }
    if (blocksKey(S) !== this.baseBlocks) {
      const { error } = await this.sb.rpc("save_blocks", {
        p_base_version: this.version, p_blocks: S.blocks.map(blockToDb),
        p_title: entry?.title || "調整排程", p_detail: detailOf(entry), p_kind: KIND_TO_DB[entry?.kind] || "edit",
      });
      if (error) {
        if (error.code === "40001") throw new ConflictError();
        throw new Error("儲存排程失敗：" + error.message);
      }
      this.version += 1;
      S.version = this.version;
    } else if (entry) {
      const { error } = await this.sb.rpc("log_change", { p_kind: KIND_TO_DB[entry.kind] || "edit", p_title: entry.title, p_detail: detailOf(entry) });
      if (error) throw new Error("寫入紀錄失敗：" + error.message);
    }
    for (const t of DELETE_ORDER) {
      for (const row of d[t]?.del || []) {
        let q = this.sb.from(t).delete();
        for (const k of TABLE_KEYS[t]) q = q.eq(k, row[k]);
        const { error } = await q;
        if (error) throw writeError(t, error, "刪除");
      }
    }
    this._remember(S);
  }

  // 套用排程服務存好的方案（整批在資料庫的一個交易裡完成）
  async applyPlan(previewId, optionId, note, ai) {
    const { error } = await this.sb.rpc("apply_plan", { p_preview: previewId, p_option: optionId, p_note: note || null, p_ai: ai || null });
    if (error) {
      if (error.code === "40001") throw new ConflictError("別人剛更新過排程，請重新計算方案");
      throw new Error(error.message);
    }
  }

  // ---------- 即時推送 ----------
  subscribe(onChange) {
    const ch = this.sb.channel("schedule-changes");
    for (const t of ["schedule_state", "change_sets", "machine_faults", "leaves", "employee_overtime_days", "orders", "calendar_days"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => onChange(t));
    }
    ch.subscribe();
    this.channel = ch;
  }
}

function detailOf(e) {
  if (!e) return {};
  return { summary: e.sum || null, lines: e.lines || [], people: e.people || [], shifts: e.shifts || [],
           ai: e.ai || null, note: e.note || null, alts: e.alts || [] };
}

export function logFromDb(r) {
  const d = r.detail || {};
  return {
    id: r.id,
    t: Date.parse(r.created_at),
    kind: KIND_FROM_DB[r.kind] || r.kind,
    title: r.title,
    sum: r.summary || d.summary || "",
    lines: d.lines || [],
    people: (d.people || []).map((p) => ({ name: p.name, items: (p.items || []).map((x) => typeof x === "string" ? x : (x.t === "in" ? "新增 " : "拿掉 ") + x.text) })),
    shifts: (d.shifts || []).map((s) => s.before ? { code: s.code, b: jsAbs(s.before.date, s.before.min), a: jsAbs(s.after.date, s.after.min) } : s),
    ai: r.ai || d.ai || null,
    note: r.note || d.note || "",
    alts: (d.alts || []).map((a) => typeof a === "string" ? a
      : `方案 ${a.id} ${a.name}：延誤 ${a.metrics?.late?.length ?? 0}、異動 ${a.metrics?.moved ?? 0}、影響他天 ${a.metrics?.other_days ?? 0}、加班 ${a.metrics?.ot_h ?? 0} 小時`),
  };
}

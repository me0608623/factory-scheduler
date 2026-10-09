// Supabase 模式：資料在雲端資料庫，登入後依角色決定能不能改；別人的變更會即時推過來

import { fromSnapshot, blockToDb } from "../convert.js";
import { rowsOf, diffRows, UPSERT_ORDER, DELETE_ORDER, TABLE_KEYS, blocksKey } from "./diff.js";
import { groupCatalog } from "../groups.js";
import { assertExecutionProtected } from '../execution.js';
import { generalKey,validateGeneralWork,assignmentToDb } from '../general-work.js';
import { transferKey,validateTransfers } from '../transfers.js';
import { validateRush } from '../rush.js';
import { validateWorkLog } from '../worklog.js';
import { rosterKey,validateRosters } from '../roster.js';
import { effectivePermission } from '../permissions.js';

// 畫面的紀錄種類 ↔ 資料庫 change_sets.kind
const KIND_TO_DB = { ot: "edit", save: "edit", move: "move", edit: "edit", auto: "auto", fault: "fault", leave: "leave", order: "order", recover: "recover" };
const KIND_FROM_DB = { recover: "fault", order: "edit", import: "edit" };

const jsAbs = (date, min) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5) * 1440 + min;
};

const rushKey = (S) => JSON.stringify(S.rushOrders || []);
const workLogKey = (S) => JSON.stringify(S.workLog || []);

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
    this.permissions = {};
    this.userName = "";
    this.session = null;
  }

  // ---------- 帳號 ----------
  async init() {
    this._watchAuthSession();
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    if (!this.session) return { needLogin: true };
    await this._profile();
    return { needLogin: false };
  }

  async login(email, password) {
    this._watchAuthSession();
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

  async signup(email, password, name) {
    const { data, error } = await this.sb.auth.signUp({ email, password,
      options: { data: { name: name || "" }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw new Error(error.message);
    return data; // 需要信箱驗證時 data.session為 null
  }
  async logout() {
    await this.sb.auth.signOut();
    this._clearSession();
  }

  _clearSession() {
    this.session=null;this.role=null;this.permissions={};this.userName='';this.employeeId=null;
  }

  _watchAuthSession() {
    if(this.authSubscription)return;
    // Keep the callback synchronous: do not make auth/DB calls under the SDK lock.
    const {data}=this.sb.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){this._clearSession();return;}
      if(event!=='TOKEN_REFRESHED'||!this.session)return;
      if(session?.user?.id!==this.session.user.id){this._clearSession();return;}
      this.session=session;
    });
    this.authSubscription=data.subscription;
  }

  async _profile() {
    const { data } = await this.sb.from("profiles").select("display_name,role,employee_id").eq("user_id", this.session.user.id).maybeSingle();
    this.role = data?.role || null;
    this.employeeId = data?.employee_id || null;
    this.userName = data?.display_name || this.session.user.email || "";
    const {data:permissionRows,error:permissionError}=await this.sb.from('account_permissions').select('permission,allowed').eq('user_id',this.session.user.id);
    if(permissionError)throw new Error('讀取帳號權限失敗：'+permissionError.message);
    this.permissions=Object.fromEntries((Array.isArray(permissionRows)?permissionRows:[]).map(x=>[x.permission,!!x.allowed]));
  }

  can(permission) { return effectivePermission(this.role,this.permissions,permission); }

  async listAccessAccounts() {
    const {data,error}=await this.sb.rpc('list_access_accounts');
    if(error)throw new Error('讀取帳號權限失敗：'+error.message);
    return data||[];
  }

  async setAccessPermissions(userId,permissions) {
    const {error}=await this.sb.rpc('set_account_permissions',{p_user:userId,p_permissions:permissions});
    if(error)throw new Error('儲存帳號權限失敗：'+error.message);
  }

  async updateProfile({displayName}) {
    const name=String(displayName||'').trim();if(name.length<1||name.length>60)throw new Error('顯示名稱需要 1–60 個字');
    const {data,error}=await this.sb.rpc('update_own_profile',{p_display_name:name});
    if(error)throw new Error('儲存個人資料失敗：'+error.message);this.userName=data?.displayName||name;
  }

  jwt() { return this.session?.access_token || null; }

  async listScenarios() {
    const {data,error}=await this.sb.from('planning_scenarios').select('id,name,created_at').order('created_at',{ascending:false});
    if(error)throw new Error('讀取試排情境失敗：'+error.message);return data||[];
  }
  async getScenario(id) {
    const {data,error}=await this.sb.from('planning_scenarios').select('*').eq('id',id).single();
    if(error)throw new Error('讀取試排情境失敗：'+error.message);if(!data)throw new Error('情境不存在或沒有權限');return data;
  }
  async saveScenario(item) {
    const {data,error}=await this.sb.rpc('save_planning_scenario',{p_id:item.id,p_name:item.name,p_payload:item.payload});
    if(error)throw new Error('保存情境失敗：'+error.message);return data;
  }
  async reportExecution(request) {
    const {data,error}=await this.sb.rpc('report_work_execution',{p_request:request.id,p_block:request.blockId,p_action:request.action,p_qty:request.qtyDone,p_revision:request.expectedRevision});
    if(error){if(error.code==='40001')throw new ConflictError('進度已被更新，請重新載入');throw Object.assign(new Error(error.message),{rejected:!!error.code});}
    return data;
  }
  async confirmExecution(blockId, confirmed) {
    const {error}=await this.sb.rpc('confirm_work_execution',{p_block:blockId,p_confirmed:confirmed});
    if(error)throw new Error(error.message);
  }

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

  async createLeaveRequest(request) {
    const {error}=await this.sb.from('leave_requests').insert({id:request.id,employee_id:request.employeeId,date:request.date,note:request.note||'',status:'pending'});
    if(error)throw writeError('請假詢問',error,'新增');
  }

  async resolveLeaveRequest(id,status) {
    const {error}=await this.sb.rpc('resolve_leave_request',{p_id:id,p_status:status});
    if(error)throw writeError('請假詢問',error,'處理');
  }

  async saveMemo(memo) {
    const row={id:memo.id,text:memo.text,machine_id:memo.machineId||null,employee_id:memo.employeeId||null,pinned:!!memo.pinned,author:memo.author||this.userName||''};
    const {error}=await this.sb.from('schedule_memos').upsert([row],{onConflict:'id'});
    if(error)throw writeError('備忘',error,'儲存');
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
    this.protectedBase=structuredClone({blocks:S.blocks,execution:S.execution||[],employees:S.employees.map(e=>({id:e.id})),machines:S.machines.map(m=>({id:m.id})),orders:S.orders.map(o=>({id:o.id}))});
    this.base = rowsOf(S);
    this.baseBlocks = blocksKey(S);
    this.baseGroups = JSON.stringify(groupCatalog(S));
    this.baseGeneral=generalKey(S);this.baseContents=JSON.stringify(S.workContents||[]);
    this.baseTransfers=transferKey(S);this.transferBase=structuredClone(S);
    this.baseRush=rushKey(S);
    this.baseWorkLog=workLogKey(S);
    this.baseRosters=rosterKey(S);
  }

  // ---------- 寫：只寫有變的列；排程方塊整批用 save_blocks（有版本號檢查） ----------
  async sync(S, entry) {
    try{validateRosters(S);}catch(e){e.permission=true;throw e;}
    try{validateTransfers(S,{before:this.transferBase});}catch(e){e.permission=true;throw e;}
    try{validateGeneralWork(S,{today:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()),baseAssignments:JSON.parse(this.baseGeneral||'{}').assignments||[]});if(this.protectedBase){assertExecutionProtected(this.protectedBase,S);
      if(JSON.stringify(this.protectedBase.execution)!==JSON.stringify(S.execution||[]))throw new Error('現場進度只能由回報流程更新');}}
    catch(e){e.permission=true;throw e;}
    const d = diffRows(this.base, rowsOf(S));
    if(rosterKey(S)!==this.baseRosters){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||transferKey(S)!==this.baseTransfers||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將輪班草稿與產線排程／基本資料分開儲存'),{permission:true});
      const {data,error}=await this.sb.rpc('save_staff_rosters',{p_version:this.version,p_rosters:S.staffRosters||[]});
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=Number(data);this._remember(S);return;
    }
    if(transferKey(S)!==this.baseTransfers){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將跨廠加工紀錄與排程／基本資料分開儲存'),{permission:true});
      const {data,error}=await this.sb.rpc('save_transfer_orders',{p_version:this.version,p_orders:S.transferOrders||[]});
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=Number(data);this._remember(S);return;
    }
    if(rushKey(S)!==this.baseRush){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||transferKey(S)!==this.baseTransfers||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將特別趕貨紀錄與排程／基本資料分開儲存'),{permission:true});
      try{validateRush(S.rushOrders||[]);}catch(e){throw Object.assign(e,{permission:true});}
      const {data,error}=await this.sb.rpc('save_rush_orders',{p_version:this.version,p_orders:S.rushOrders||[]});
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=Number(data);this._remember(S);return;
    }
    if(workLogKey(S)!==this.baseWorkLog){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||transferKey(S)!==this.baseTransfers||rushKey(S)!==this.baseRush||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將工作紀錄與排程／基本資料分開儲存'),{permission:true});
      try{validateWorkLog(S.workLog||[]);}catch(e){throw Object.assign(e,{permission:true});}
      const {data,error}=await this.sb.rpc('save_work_log',{p_version:this.version,p_rows:S.workLog||[]});
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=Number(data);this._remember(S);return;
    }
    if(generalKey(S)!==this.baseGeneral){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw new Error('請將工作內容／一般工作排班與產品排程、名冊分開儲存');
      const contentsChanged=JSON.stringify(S.workContents||[])!==this.baseContents;
      if(contentsChanged&&JSON.stringify(S.workAssignments||[])!==JSON.stringify(JSON.parse(this.baseGeneral).assignments))throw new Error('請先儲存工作內容，再安排工作');
      const args=contentsChanged?{p_version:this.version,p_contents:S.workContents||[]}:{p_version:this.version,p_assignments:(S.workAssignments||[]).map(assignmentToDb)};
      const {data,error}=await this.sb.rpc(contentsChanged?'save_work_contents':'save_work_assignments',args);
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=Number(data);this._remember(S);return;
    }
    const catalog=groupCatalog(S),groupsChanged=JSON.stringify(catalog)!==this.baseGroups;
    if(groupsChanged){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks)
        throw new Error('請將員工分組與排班／基本資料分開儲存');
      const {data,error}=await this.sb.rpc('save_staff_groups',{p_base_version:this.version,p_groups:catalog.groups,p_members:catalog.members,p_title:entry?.title||'更新員工分組'});
      if(error){if(error.code==='40001')throw new ConflictError();throw writeError('員工分組',error,'修改');}
      S.version=this.version=Number(data);this._remember(S);return;
    }
    // 基本資料逐表寫入，若排程版本已過期，應在第一筆寫入前先拒絕；
    // 否則後續 save_blocks 才報衝突時，工單等列可能已部分留下。
    if (Object.values(d).some(change => change.upsert.length || change.del.length)) {
      const { data, error } = await this.sb.from("schedule_state").select("version").single();
      if (error) throw new Error("檢查排程版本失敗：" + error.message);
      if (Number(data.version) !== this.version) throw new ConflictError();
    }
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
    for (const t of ["schedule_state", "change_sets", "machine_faults", "leaves", "employee_overtime_days", "orders", "calendar_days", "work_execution","work_contents","work_assignments","transfer_orders","rush_orders","work_log","staff_rosters","leave_requests","schedule_memos","machine_layout","employees","machines","products","calendar_weekly"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => onChange(t));
    }
    if(this.session?.user?.id)ch.on("postgres_changes",{event:"*",schema:"public",table:"account_permissions",filter:"user_id=eq."+this.session.user.id},
      async()=>{try{await this._profile();onChange("account_permissions");}catch{onChange("account_permissions");}});
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

// 隔離副本模擬驗收驅動程式（C1–C7）
// 設計要點：
// 1. 單一連線交易：全程用一個 `docker exec -i <container> psql` 子程序（單一資料庫連線）。
//    驅動程式透過 stdin 寫入 SQL、stdout 讀取結果（哨兵同步），案例交易內呼叫 solver
//    （solver 是無狀態 stdin/stdout 程式，吃的是交易內導出的快照 JSON，不連資料庫）。
// 2. 每案 BEGIN → 案例條件 → 求解 → 套用 → 斷言 → ROLLBACK，基準完全一致。
// 3. 「命中故障時段／跨越休息日」是案例前置條件：未命中回報「案例設定未成立」，
//    不算通過、也不判功能失敗。
// 4. 累計產量用區段實際 qty 與實際時長內插（時長有 10 分鐘進位，rate×時長會高估），
//    跨日期用統一時間軸（day*1440+分）。容差 0.5 件＝「半件容差」，與既有累計流轉檢查
//    相同（0015_manual_material_flow / 0029 / validate.py 的 ready 與 produced_at 檢查）。
//    validate.py 另有一處 1e-8，那是「件數 vs 速率×時長」的整數檢查，不是本檢查。
// 5. 隱私：員工一律輸出 TEST-E01/02/03 代號；不查詢、不輸出姓名與來源編號；
//    所有輸出（含錯誤訊息、solver stderr 尾段）先以 clean() 把 UUID 換成 [ID]。
// 離開代碼：0＝全過；1＝有 FAIL；3＝有「案例設定未成立」（且無 FAIL）。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const solverDir = path.resolve(root, "solver");
const EPS = 0.5; // 半件容差：與 0015/0029 累計流轉檢查及 validate.py 的 ready/produced_at 檢查一致
const clean = (t) => String(t).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[ID]");

const args = Object.fromEntries(process.argv.slice(2).map((s, i, a) => (s.startsWith("--") ? [s.slice(2), a[i + 1]] : [])));
const MONDAY = args.monday;
const CONTAINER = args.container || "sim-pg";
if (!/^\d{4}-\d{2}-\d{2}$/.test(MONDAY || "")) { console.error("需 --monday YYYY-MM-DD"); process.exit(1); }
const dayIdx = (d) => Math.round((Date.parse(d) - Date.parse(MONDAY)) / 86400000);
const D = (n) => { const t = new Date(Date.parse(MONDAY) + n * 86400000); return t.toISOString().slice(0, 10); };
const T = MONDAY;
const SHUTDOWN = D(9); // T+9：第二週週三（額外測試停工日，非法定假日）

// ---------- 單一連線 psql 工作階段 ----------
class Session {
  constructor() {
    this.child = spawn("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=0"]);
    this.buf = ""; this.seq = 0; this.waiters = [];
    this.child.stdout.on("data", (c) => { this.buf += c; this.pump(); });
    this.child.stderr.on("data", (c) => { this.buf += c.toString().split("\n").map((l) => "STDERR|" + l).join("\n") + "\n"; this.pump(); });
    this.child.on("exit", (code) => { this.dead = `psql 結束（exit ${code}）`; this.pump(); });
  }
  pump() {
    while (true) {
      const i = this.buf.indexOf("\n");
      if (i < 0) break;
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (this.waiters.length) this.waiters[0].lines.push(line);
      if (this.waiters.length && line === this.waiters[0].mark) { const w = this.waiters.shift(); w.resolve({ lines: w.lines.slice(0, -1) }); }
    }
  }
  async run(sql) {
    if (this.dead) throw new Error(this.dead);
    const mark = `__SIM${++this.seq}__`;
    const t0 = Date.now();
    if (process.env.SIM_DEBUG) console.error(`[sql#${this.seq}] ${clean(String(sql).replace(/\s+/g, " ").slice(0, 140))}`);
    return new Promise((resolve) => {
      this.waiters.push({ mark, lines: [], resolve });
      this.child.stdin.write(sql + `;\nSELECT '${mark}';\n`);
      setTimeout(() => {
        const i = this.waiters.findIndex((x) => x.mark === mark);
        if (i >= 0) {
          const w = this.waiters.splice(i, 1)[0];
          if (process.env.SIM_DEBUG || Date.now() - t0 > 2000) console.error(`[逾時 ${Date.now() - t0}ms] sql#${this.seq}（session dead=${!!this.dead}，waiters=${this.waiters.length}）`);
          resolve({ lines: [...w.lines, `ERROR: 逾時（session dead=${!!this.dead}）`] });
        }
      }, 180000);
    });
  }
  // psql 的 SQL 錯誤走 stderr（此處帶 STDERR| 前綴）——兩條流都要檢查，
  // 否則錯誤被吞掉（交易內出錯後 tx 進入 aborted，後續語句全被拒）。
  async one(sql) {
    const r = await this.run(sql);
    const errs = r.lines.filter((l) => l.replace(/^STDERR\|/, "").startsWith("ERROR"));
    if (errs.length) throw new Error("SQL 錯誤：" + clean(errs.join(" ⏎ ").slice(0, 300)));
    return r.lines.filter((l) => l && !l.startsWith("STDERR|")).join("\n").trim();
  }
}

const s = new Session();
const results = [];
function record(id, outcome, details) {
  const d = details.map(clean);
  results.push({ id, outcome, details: d });
  console.log(`[${outcome}] ${id}${d.length ? " — " + d.join("；") : ""}`);
}
function writeReport(extra) {
  const pass = results.filter((r) => r.outcome === "PASS").length;
  const fail = results.filter((r) => r.outcome === "FAIL");
  const notEstablished = results.filter((r) => r.outcome === "未成立");
  const report = [`# 模擬驗收結果（T=${MONDAY}）`, ...(extra ? ["", `[!] ${extra}`] : []), "",
    ...results.map((r) => `- [${r.outcome}] ${r.id}${r.details.length ? "：" + r.details.join("；") : ""}`), "",
    `PASS=${pass} FAIL=${fail.length} 案例設定未成立=${notEstablished.length}`].join("\n");
  fs.writeFileSync("/tmp/acceptance-report.md", report);
  console.log("\n" + report);
  return { fail: fail.length, notEstablished: notEstablished.length };
}
process.on("uncaughtException", (e) => {
  try { s.run("ROLLBACK"); } catch {}
  try { s.child.stdin.end(); } catch {}
  writeReport(`未預期錯誤：${clean(e?.message || e)}`);
  process.exit(1);
});

// ---------- solver（runner 上執行；失敗即整案失敗） ----------
function solve(request) {
  const child = spawnSync("uv", ["run", "--frozen", "python", "-m", "scripts.plan_stdio"], {
    cwd: solverDir, input: JSON.stringify(request), encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) throw new Error(`solver 失敗：${clean(child.error?.message || child.stderr?.slice(-400) || "exit " + child.status)}`);
  return JSON.parse(child.stdout);
}

// 選項診斷摘要（找不到可套用方案時列原因）
const noOpt = (plan, out, label) => {
  const d = (plan.options || []).map((o) => [o.id, o.status, o.applicable ? "適用" : "不適用", (o.diagnostics || []).join(" "), (o.lines || []).map((l) => l.t).join(" ")].join("|")).join(" ； ");
  out.push((label || "無可套用方案") + "：" + clean(d).slice(0, 900));
};

// ---------- 共用查詢 ----------
const orderBlocks = (code) => s.one(
  `SELECT coalesce(jsonb_agg(jsonb_build_object('step',b.step_seq,'date',b.date::text,'start',b.start_min,'end',b.end_min,'qty',b.qty,'machine',b.machine_id) ORDER BY b.date,b.start_min),'[]')
   FROM schedule_blocks b JOIN orders o ON o.id=b.order_id WHERE o.code='${code}'`);
const stateVersion = async () => Number(await s.one("SELECT version FROM schedule_state"));
const blocksOn = (dates) => s.one(
  `SELECT count(*) FROM schedule_blocks b JOIN orders o ON o.id=b.order_id
   WHERE o.code LIKE 'TEST-%' AND b.date IN (${dates.map((d) => `'${d}'`).join(",")})`);
const blockDump = async () => clean(await s.one(String.raw`SELECT coalesce(string_agg(o.code||'#'||b.step_seq||'@'||b.date||'x'||b.qty,'、'),'(無)') FROM schedule_blocks b JOIN orders o ON o.id=b.order_id WHERE o.code LIKE 'TEST-%'`));
const stationQty = (code, step) => Number(s.one(
  `SELECT coalesce(sum(b.qty),0) FROM schedule_blocks b JOIN orders o ON o.id=b.order_id WHERE o.code='${code}' AND b.step_seq=${step}`));
const lastBlockAbs = async (code) => {
  const bs = JSON.parse(await orderBlocks(code));
  return bs.length ? Math.max(...bs.map((b) => dayIdx(b.date) * 1440 + b.end)) : -1;
};

// 套用方案：插入 plan_previews 並以老闆身分 apply_plan（同一連線、同一交易）
const j = (v) => JSON.stringify(v).replace(/'/g, "''");
async function applyOption(plan, event, optionId, title, kind = "order") {
  const pv = await s.one(`INSERT INTO plan_previews (kind,title,event,base_version,options)
    VALUES ('${kind}','${title}','${j(event)}'::jsonb,${await stateVersion()},'${j(plan.options)}'::jsonb) RETURNING id`);
  return s.one(`SELECT apply_plan('${pv}','${optionId}')`);
}

// 累計產量（區段實際 qty／實際時長內插；統一時間軸）
const cumAt = (segs, abs) => segs.reduce((acc, g) => {
  const s0 = dayIdx(g.date) * 1440 + g.start, s1 = dayIdx(g.date) * 1440 + g.end;
  if (s1 <= abs + EPS) return acc + g.qty;
  if (s0 < abs && abs < s1) return acc + (g.qty * (abs - s0)) / (s1 - s0);
  return acc;
}, 0);

async function assertFlow(orderCode, upstreamStep, downstreamStep, batch, out) {
  const all = JSON.parse(await orderBlocks(orderCode));
  const up = all.filter((b) => b.step === upstreamStep).sort((a, b) => dayIdx(a.date) * 1440 + a.start - (dayIdx(b.date) * 1440 + b.start));
  const down = all.filter((b) => b.step === downstreamStep);
  const boundaries = [...up, ...down].flatMap((g) => [dayIdx(g.date) * 1440 + g.start, dayIdx(g.date) * 1440 + g.end]);
  for (const tb of boundaries) {
    if (cumAt(down, tb) > cumAt(up, tb) + EPS) { out.push(`t=${tb} 分：下游累計 ${cumAt(down, tb).toFixed(2)} 超過上游 ${cumAt(up, tb).toFixed(2)}`); return false; }
  }
  for (const g of down) {
    const ts = dayIdx(g.date) * 1440 + g.start;
    if (cumAt(up, ts) < batch - EPS) { out.push(`下游 ${g.date} ${g.start} 起跑時上游累計 ${cumAt(up, ts).toFixed(2)} < batch ${batch}`); return false; }
  }
  return true;
}

function assertWindows(blocks, out) {
  for (const b of blocks) {
    const okWin = (b.start >= 480 && b.end <= 720) || (b.start >= 780 && b.end <= 1020);
    const dow = new Date(Date.parse(b.date)).getUTCDay();
    const okDay = dow >= 1 && dow <= 5 && b.date !== SHUTDOWN;
    if (!okWin) out.push(`${b.date} ${b.start}-${b.end} 不在上班時段`);
    if (!okDay) out.push(`${b.date} 排在休假日`);
  }
  return out.length === 0;
}

// ---------- 基準建立（commit；全部 TEST_ 假設） ----------
console.log(`基準日 T=${T}（週一）；T+9=${SHUTDOWN}（週三，測試停工日）`);
const setup = [];
const must = async (label, sql) => { try { await s.one(sql); } catch (e) { throw new Error(`基準失敗 ${label}：${e.message}`); } setup.push(label); };

await must("週休", `UPDATE calendar_weekly SET is_open=(weekday NOT IN (0,6))`);
await must("停工日", `INSERT INTO calendar_days (date,is_open,note) VALUES ('${SHUTDOWN}',false,'TEST 停工日（非法定假日）') ON CONFLICT (date) DO UPDATE SET is_open=false,note=EXCLUDED.note`);
await must("機台工序", `UPDATE machines SET process='裁切' WHERE id='f1e'; UPDATE machines SET process='焊接' WHERE id='f1b'; UPDATE machines SET process='沖壓' WHERE id='f2k'; UPDATE machines SET process='包裝' WHERE id='f2ac'`);
await must("產品", `INSERT INTO products (id,code,name) VALUES ('11111111-aaaa-4aaa-8aaa-111111111101','TEST-P01','TEST 跨廠品'),('11111111-aaaa-4aaa-8aaa-111111111102','TEST-P02','TEST 單廠品') ON CONFLICT (code) DO NOTHING`);
await must("工序", `INSERT INTO product_steps (product_id,seq,process,rate,transfer_batch,factory) VALUES
  ('11111111-aaaa-4aaa-8aaa-111111111101',0,'裁切',2,60,1),
  ('11111111-aaaa-4aaa-8aaa-111111111101',1,'沖壓',1,60,2),
  ('11111111-aaaa-4aaa-8aaa-111111111101',2,'包裝',4,60,2),
  ('11111111-aaaa-4aaa-8aaa-111111111102',0,'裁切',2,60,1),
  ('11111111-aaaa-4aaa-8aaa-111111111102',1,'焊接',1,0,1) ON CONFLICT (product_id,seq) DO NOTHING`);
await must("模具", `INSERT INTO machine_products (machine_id,product_id) VALUES
  ('f1e','11111111-aaaa-4aaa-8aaa-111111111101'),('f1e','11111111-aaaa-4aaa-8aaa-111111111102'),
  ('f1b','11111111-aaaa-4aaa-8aaa-111111111102'),
  ('f2k','11111111-aaaa-4aaa-8aaa-111111111101'),
  ('f2ac','11111111-aaaa-4aaa-8aaa-111111111101') ON CONFLICT DO NOTHING`);
// 員工：取碼序最小的啟用員工（內部記 id，對外只有 TEST-E01/02/03）
// 註：外層 string_agg 不能 ORDER BY 子查詢沒輸出的欄位（先前的錯誤來源）
const pick = async (fac, n) => {
  const v = await s.one(`SELECT coalesce(string_agg(id::text,','),'') FROM (SELECT id FROM employees WHERE active AND factory=${fac} ORDER BY source_employee_code NULLS LAST, code LIMIT ${n}) z`);
  const ids = v ? v.split(",") : [];
  if (ids.length < n || ids.some((x) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)))
    throw new Error(`無法選出 ${n} 位啟用員工（廠別 ${fac}，取得 ${ids.length} 筆）——案例設定未成立`);
  return ids;
};
const eF1 = await pick(1, 2), eF2 = await pick(2, 1);
const [E01, E02, E03] = [...eF1, ...eF2];
await must("技能", `INSERT INTO employee_skills (employee_id,machine_id) VALUES ('${E01}','f1e'),('${E01}','f1b'),('${E02}','f1e'),('${E03}','f2k'),('${E03}','f2ac') ON CONFLICT DO NOTHING`);
const boss = await s.one("SELECT user_id FROM profiles WHERE role='boss' LIMIT 1");
await must("身分", `SET request.jwt.claim.sub='${boss}'`);
await must("解除 setup_pending（僅副本）", `UPDATE schedule_state SET setup_pending=false`);
await must("加班時段維持預設", `SELECT count(*) FROM work_windows`);
console.log(`基準完成：${setup.length} 項；員工 F1×2（TEST-E01/E02）、F2×1（TEST-E03）`);

// ---------- 案例執行 ----------
const now = { date: T, min: 480 };
const orderEvent = (code, productId, qty, dueOffset, priority = 1) =>
  ({ type: "order", order: { id: crypto.randomUUID(), code, product: productId, qty, due: D(dueOffset), priority } });
const P1 = "11111111-aaaa-4aaa-8aaa-111111111101", P2 = "11111111-aaaa-4aaa-8aaa-111111111102";

async function runCase(id, fn) {
  await s.run("BEGIN");
  const out = []; let outcome = "PASS";
  try { outcome = await fn(out) || "PASS"; }
  catch (e) { outcome = "FAIL"; out.push(clean(e?.stack || e?.message || String(e)).split("\n").slice(0, 3).join(" ⏎ ")); }
  if (outcome !== "PASS") { try { out.push("當時排程：" + (await blockDump())); } catch {} }
  await s.run("ROLLBACK");
  record(id, outcome, out);
}

await runCase("C1 正常單廠", async (out) => {
  const plan = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: orderEvent("TEST-O1", P2, 120, 14), now, time_limit: 3 });
  console.error(`[選項] 共${(plan.options||[]).length}個：${(plan.options||[]).map(o=>o.id+(o.applicable?"+":"-")+(o.solver_method==="keep"?"k":"")).join("")}`);
  const opt = plan.options.find((o) => o.applicable && o.solver_method !== "keep");
  if (!opt) { noOpt(plan, out); return "FAIL"; }
  await applyOption(plan, orderEvent("TEST-O1", P2, 120, 14), opt.id, "TEST-O1");
  const blocks = JSON.parse(await orderBlocks("TEST-O1"));
  if (stationQty("TEST-O1", 0) !== 120) out.push("裁切站件數≠120");
  if (stationQty("TEST-O1", 1) !== 120) out.push("焊接站件數≠120");
  const cut = blocks.filter((b) => b.step === 0), weld = blocks.filter((b) => b.step === 1);
  if (Math.min(...weld.map((b) => dayIdx(b.date) * 1440 + b.start)) < Math.max(...cut.map((b) => dayIdx(b.date) * 1440 + b.end)) - EPS) out.push("焊接開始早於裁切結束（batch=0 應整批流轉）");
  assertWindows(blocks, out);
  return out.length ? "FAIL" : "PASS";
});

await runCase("C2 正常跨廠", async (out) => {
  const ev = orderEvent("TEST-O2", P1, 120, 14);
  const plan = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: ev, now, time_limit: 3 });
  console.error(`[選項] 共${(plan.options||[]).length}個：${(plan.options||[]).map(o=>o.id+(o.applicable?"+":"-")+(o.solver_method==="keep"?"k":"")).join("")}`);
  const opt = plan.options.find((o) => o.applicable && o.solver_method !== "keep");
  if (!opt) { noOpt(plan, out); return "FAIL"; }
  await applyOption(plan, ev, opt.id, "TEST-O2");
  for (const st of [0, 1, 2]) if (stationQty("TEST-O2", st) !== 120) out.push(`站 ${st} 件數≠120`);
  await assertFlow("TEST-O2", 0, 1, 60, out) || out.push("裁切→沖壓 累計流轉檢查未過");
  await assertFlow("TEST-O2", 1, 2, 60, out) || out.push("沖壓→包裝 累計流轉檢查未過");
  const bad = await s.one(`SELECT count(*) FROM schedule_blocks b JOIN orders o ON o.id=b.order_id
    JOIN employees e ON e.id=b.employee_id JOIN machines m ON m.id=b.machine_id
    WHERE o.code='TEST-O2' AND e.factory<>m.factory`);
  if (Number(bad) > 0) out.push("有員工與機台不同廠的排程");
  assertWindows(JSON.parse(await orderBlocks("TEST-O2")), out);
  return out.length ? "FAIL" : "PASS";
});

await runCase("C3 技能不足", async (out) => {
  await s.run(`DELETE FROM employee_skills WHERE employee_id='${E01}' AND machine_id='f1b'`);
  const ev = orderEvent("TEST-O3", P2, 120, 14);
  const plan = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: ev, now, time_limit: 3 });
  const applicable = plan.options.filter((o) => o.applicable);
  if (applicable.length > 0) out.push(`技能不足竟有 ${applicable.length} 個可套用方案`);
  const diag = plan.options.map((o) => (o.diagnostics || []).join(" ")).join(" ");
  const re=/沒有具操作資格|沒有人員|不會操作/;
  if (!re.test(diag)) out.push("診斷未出現人員缺失訊息（實際診斷：" + clean(diag).slice(0, 300) + "）");
  const n = Number(await blocksOn([D(0), D(1), D(2)]));
  if (n > 0) out.push("不該有排程寫入");
  return out.length ? "FAIL" : "PASS";
});

await runCase("C4 機台故障（兩階段）", async (out) => {
  await s.run(`INSERT INTO leaves (employee_id,date,start_min,end_min,note) VALUES ('${E01}','${T}',780,1020,'TEST 下午請假')`);
  const v0 = await stateVersion();
  const ev = orderEvent("TEST-O4", P2, 120, 1, 0);
  const plan1 = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: ev, now, time_limit: 3 });
  const opt1 = plan1.options.find((o) => o.applicable && o.solver_method !== "keep");
  if (!opt1) { noOpt(plan1, out, "基準階段無可套用方案"); return "FAIL"; }
  await applyOption(plan1, ev, opt1.id, "TEST-O4 基準");
  const hit = Number(await s.one(`SELECT count(*) FROM schedule_blocks b JOIN orders o ON o.id=b.order_id
    WHERE o.code='TEST-O4' AND b.machine_id='f1b' AND b.date='${T}' AND b.start_min<720`));
  if (hit === 0) return (out.push("基準未使用 T 上午 f1b——案例設定未成立（不判功能失敗）"), "未成立");
  const plan2 = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: { type: "fault", machine: "f1b", date: T, start: 480, end: 720, note: "TEST 故障" }, now, time_limit: 3 });
  const opt2 = plan2.options.find((o) => o.applicable);
  if (!opt2) { noOpt(plan2, out, "故障階段無可套用方案"); return "FAIL"; }
  await applyOption(plan2, { type: "fault", machine: "f1b", date: T, start: 480, end: 720, note: "TEST 故障" }, opt2.id, "TEST-O4 故障", "fault");
  const f1bOnT = Number(await s.one(`SELECT count(*) FROM schedule_blocks b JOIN orders o ON o.id=b.order_id WHERE o.code='TEST-O4' AND b.machine_id='f1b' AND b.date='${T}'`));
  if (f1bOnT !== 0) out.push(`故障日 T 的 f1b 仍有 ${f1bOnT} 段排程`);
  if (stationQty("TEST-O4", 0) !== 120 || stationQty("TEST-O4", 1) !== 120) out.push("件數未保留（工作消失）");
  const end = await lastBlockAbs("TEST-O4");
  if (end > dayIdx(D(1)) * 1440 + 1020 + EPS) out.push("未在 T+1 內完成");
  const leaveOK = Number(await s.one(`SELECT count(*) FROM schedule_blocks b JOIN orders o ON o.id=b.order_id JOIN employees e ON e.id=b.employee_id WHERE o.code='TEST-O4' AND e.id='${E01}' AND b.date='${T}' AND b.start_min>=780`));
  if (leaveOK > 0) out.push("E01 的下午請假被排程違反");
  return out.length ? "FAIL" : "PASS";
});

await runCase("C5 交期不足（軟限制）", async (out) => {
  const ev = orderEvent("TEST-O5", P2, 1200, 1);
  const plan = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: ev, now, time_limit: 3 });
  console.error(`[選項] 共${(plan.options||[]).length}個：${(plan.options||[]).map(o=>o.id+(o.applicable?"+":"-")+(o.solver_method==="keep"?"k":"")).join("")}`);
  const opt = plan.options.find((o) => o.applicable && o.solver_method !== "keep");
  if (!opt) { noOpt(plan, out, "逾期訂單應仍可套用（軟限制）——卻無可套用方案"); return "FAIL"; }
  const summary = [JSON.stringify(plan.options.map((o) => o.diagnostics || [])), JSON.stringify(plan.summary || plan.options.map((o) => o.lines || []))].join(" ");
  if (!/超過期限/.test(summary)) out.push("方案資訊未標示逾期（超過期限）");
  await applyOption(plan, ev, opt.id, "TEST-O5");
  if (stationQty("TEST-O5", 0) !== 1200 || stationQty("TEST-O5", 1) !== 1200) out.push("站件數≠1200");
  const end = await lastBlockAbs("TEST-O5");
  if (end <= dayIdx(D(1)) * 1440 + 1020) out.push("完工未超過交期（與逾期診斷矛盾）");
  return out.length ? "FAIL" : "PASS";
});

await runCase("C6 週末跨越", async (out) => {
  await s.run(`INSERT INTO leaves (employee_id,date,note) VALUES ('${E03}','${D(0)}','TEST'),('${E03}','${D(1)}','TEST'),('${E03}','${D(2)}','TEST')`);
  const ev = orderEvent("TEST-O6", P1, 1200, 14);
  const plan = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: ev, now, time_limit: 3 });
  console.error(`[選項] 共${(plan.options||[]).length}個：${(plan.options||[]).map(o=>o.id+(o.applicable?"+":"-")+(o.solver_method==="keep"?"k":"")).join("")}`);
  const opt = plan.options.find((o) => o.applicable && o.solver_method !== "keep");
  if (!opt) { noOpt(plan, out); return "FAIL"; }
  await applyOption(plan, ev, opt.id, "TEST-O6");
  const weekend = Number(await blocksOn([D(5), D(6)]));
  if (weekend !== 0) out.push(`週末 T+5/T+6 有 ${weekend} 段排程`);
  for (const st of [0, 1, 2]) if (stationQty("TEST-O6", st) !== 1200) out.push(`站 ${st} 件數≠1200`);
  const leaveBlocks = Number(await s.one(`SELECT count(*) FROM schedule_blocks b JOIN employees e ON e.id=b.employee_id WHERE e.id='${E03}' AND b.date IN ('${D(0)}','${D(1)}','${D(2)}')`));
  if (leaveBlocks > 0) out.push("E03 請假日期被排程違反");
  const before = Number(await blocksOn([D(3), D(4)])), after = Number(await blocksOn([D(7), D(8)]));
  if (before === 0 || after === 0) return (out.push(`跨越證據不足（T+3/T+4=${before}、T+7/T+8=${after}）——案例設定未成立`), "未成立");
  return out.length ? "FAIL" : "PASS";
});

await runCase("C7 停工日跨越", async (out) => {
  const ev = orderEvent("TEST-O7", P1, 3600, 16);
  const plan = solve({ snapshot: JSON.parse(await s.one(`SELECT schedule_snapshot('${D(-7)}','${D(40)}')`)), event: ev, now, time_limit: 3 });
  console.error(`[選項] 共${(plan.options||[]).length}個：${(plan.options||[]).map(o=>o.id+(o.applicable?"+":"-")+(o.solver_method==="keep"?"k":"")).join("")}`);
  const opt = plan.options.find((o) => o.applicable && o.solver_method !== "keep");
  if (!opt) { noOpt(plan, out); return "FAIL"; }
  await applyOption(plan, ev, opt.id, "TEST-O7");
  const shutdownN = Number(await blocksOn([SHUTDOWN]));
  if (shutdownN !== 0) out.push(`停工日 ${SHUTDOWN} 有 ${shutdownN} 段排程`);
  for (const st of [0, 1, 2]) if (stationQty("TEST-O7", st) !== 3600) out.push(`站 ${st} 件數≠3600`);
  const before = Number(await blocksOn([D(7), D(8)])), after = Number(await blocksOn([D(10), D(11)]));
  if (before === 0 || after === 0) return (out.push(`跨越證據不足（T+7/T+8=${before}、T+10/T+11=${after}）——案例設定未成立`), "未成立");
  const weekend = Number(await blocksOn([D(5), D(6), D(12), D(13)]));
  if (weekend !== 0) out.push(`週末有 ${weekend} 段排程`);
  return out.length ? "FAIL" : "PASS";
});

// ---------- 總結 ----------
try { s.child.stdin.end(); } catch {}
const summary = writeReport();
process.exit(summary.fail ? 1 : summary.notEstablished ? 3 : 0);

// 用 PGlite（WASM 版 PostgreSQL）驗證 migrations：權限、稽核、apply_plan、版本衝突
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.on("uncaughtException",e=>{console.log("  ✗ 錯誤：",e.message,e.where||"",e.query||"");process.exit(1)});
process.on("unhandledRejection",e=>{console.log("  ✗ 錯誤：",e.message,e.where||"",e.query||"");process.exit(1)});
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };
async function expectErr(sql, params, re, msg) {
  try { await db.query(sql, params); ok(false, msg + "（應該失敗但成功了）"); }
  catch (e) { ok(re.test(e.message), msg + " → " + e.message); }
}
async function as(uid, fn) {           // 模擬 Supabase：切到 authenticated 角色，帶使用者 id
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); }
}

// ---- Supabase 環境的最小替身 ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
try { await db.exec("create publication supabase_realtime"); } catch (e) { console.log("（PGlite 不支援 publication，略過 0005）"); }

console.log("執行 migrations");
for (const f of fs.readdirSync(path.join(ROOT, "migrations")).sort()) {
  const sql = fs.readFileSync(path.join(ROOT, "migrations", f), "utf8");
  try { await db.exec(sql); ok(true, f); }
  catch (e) { if (f.includes("realtime")) { console.log("  - 略過", f, e.message); } else { ok(false, f + " → " + e.message + (e.position?" @"+e.position:"")); process.exit(1); } }
}
await db.exec(fs.readFileSync(path.join(ROOT, "seed.sql"), "utf8")); ok(true, "seed.sql");

console.log("帳號與角色");
const BOSS = "11111111-1111-4111-8111-111111111111", LEAD = "22222222-2222-4222-8222-222222222222", TV = "33333333-3333-4333-8333-333333333333";
await db.query("insert into auth.users (id, email) values ($1,'boss@x'),($2,'lead@x'),($3,'tv@x')", [BOSS, LEAD, TV]);
const roles = (await db.query("select user_id, role from profiles order by created_at, role")).rows;
ok(roles.length === 3 && roles.every(r => r.role === "viewer"), "新帳號不分註冊順序都只能看");
await as(BOSS, async () => {
  const r = await db.query("update profiles set role='boss' where user_id=$1", [BOSS]);
  ok(r.affectedRows === 0, "新帳號不能把自己升成老闆");
});
await db.query("update profiles set role='boss' where user_id=$1", [BOSS]);
ok((await db.query("select role from profiles where user_id=$1", [BOSS])).rows[0].role === "boss", "管理員核對身分後可指定老闆");
await as(BOSS, () => db.query("update profiles set role='lead' where user_id=$1", [LEAD]));
ok((await db.query("select role from profiles where user_id=$1", [LEAD])).rows[0].role === "lead", "老闆可以把帳號改成組長");
await as(LEAD, async () => {
  const r = await db.query("update profiles set role='boss' where user_id=$1", [LEAD]);
  ok(r.affectedRows === 0, "組長不能把自己升成老闆");
});

console.log("舊版排程歷史資料");
const archiveHash = "0f118c081f872fc05f08e699f91582799fe98077fdbeb62e0ad0b7e0c9e6c913";
await as(LEAD, async () => {
  const r = await db.query("insert into legacy_schedule_archives (source_name,source_sha256,date_from,date_to,payload) values ('排程1023.xlsx',$1,'2024-06-19','2024-11-02',$2::jsonb) returning id,imported_by", [archiveHash, JSON.stringify({ dates: ["2024-10-23"], days: { "2024-10-23": { "1廠": [{ cell: "B788", value: "A040*2400" }], "2廠": [] } } })]);
  ok(r.rows.length === 1 && r.rows[0].imported_by === LEAD, "組長可存入獨立的歷史排程");
  await expectErr("insert into legacy_schedule_archives (source_name,source_sha256,date_from,date_to,payload) values ('重複',$1,'2024-06-19','2024-11-02','{}')", [archiveHash], /duplicate key|unique constraint/, "相同來源不能重複匯入");
});
await db.exec(fs.readFileSync(path.join(ROOT, "migrations", "0013_legacy_catalog.sql"), "utf8"));
const catalog = (await as(LEAD, () => db.query("select payload->'catalog' as catalog from legacy_schedule_archives where source_sha256=$1", [archiveHash]))).rows[0].catalog;
ok(catalog?.["1廠"]?.stations?.length === 24 && catalog?.["2廠"]?.people?.length === 13, "原檔製作項目與人名候選存進歷史名冊，不更動正式基本資料");
await as(TV, async () => {
  const n = (await db.query("select count(*)::int n from legacy_schedule_archives")).rows[0].n;
  ok(n === 0, "唯讀電視帳號看不到歷史原表");
  await expectErr("insert into legacy_schedule_archives (source_name,source_sha256,date_from,date_to,payload) values ('測試',$1,'2024-06-19','2024-11-02','{}')", ["b".repeat(64)], /row-level security|not-null constraint/, "唯讀帳號不能上傳歷史原表");
});
ok((await db.query("select count(*)::int n from schedule_blocks")).rows[0].n === 0, "歷史匯入不改目前排程方塊");

console.log("權限（RLS）");
await as(TV, async () => {
  const n = (await db.query("select count(*)::int n from machines")).rows[0].n;
  ok(n === 5, "電視帳號看得到機台（5 台）");
  await expectErr("insert into orders (code, product_id, qty, due_date) values ('X1','00000000-0000-4000-8000-0000000000a1',10,current_date)", [], /row-level security/, "電視帳號不能新增工單");
  await expectErr("insert into schedule_blocks (order_id, step_seq, machine_id, date, start_min, end_min, qty) values ('00000000-0000-4000-8000-0000000000b1',0,'a',current_date,480,540,10)", [], /row-level security/, "不能直接寫排程表");
});
await as(LEAD, async () => {
  await db.query("insert into machine_faults (machine_id, date, start_min, end_min, note) values ('c', current_date, 480, 600, '測試')");
  ok(true, "組長可以報故障");
  const r = await db.query("update machines set label='x' where id='a'");
  ok(r.affectedRows === 0, "組長改機台基本資料不會生效");
  const a = (await db.query("select count(*)::int n from audit_log")).rows[0].n;
  ok(a === 0, "組長看不到稽核紀錄（RLS 過濾後為 0）");
});
const auditF = (await db.query("select actor, op from audit_log where table_name='machine_faults'")).rows;
ok(auditF.length === 1 && auditF[0].actor === LEAD && auditF[0].op === "INSERT", "報故障自動寫入稽核紀錄，記下是誰");

console.log("快照 schedule_snapshot()");
const snap = await as(TV, async () => (await db.query("select schedule_snapshot() s")).rows[0].s);
ok(snap.machines.length === 5 && snap.employees.length === 5 && snap.orders.length === 6, "快照含機台 5、員工 5、工單 6");
ok(snap.machines.every(m => m.factory === 1) && snap.employees.every(e => e.factory === 1)
  && snap.products.every(p => p.steps.every(s => s.factory === 1)), "既有示範資料留在 1 廠，快照帶廠別");
ok(snap.calendar.week.length === 7 && snap.products[0].steps.length === 3, "快照含每週上班日與產品工序");
ok(snap.machines.find(m => m.id === "c").faults.length === 1, "快照含故障");

console.log("員工加班星期與當日調整");
const EMP1 = "00000000-0000-4000-8000-0000000000e1";
await as(BOSS, () => db.query("update employees set overtime_weekdays=array[1,3,5]::smallint[] where id=$1", [EMP1]));
await as(LEAD, () => db.query("insert into employee_overtime_days (employee_id,date,available) values ($1,'2026-10-01',true)", [EMP1]));
await as(TV, () => expectErr("insert into employee_overtime_days (employee_id,date,available) values ($1,'2026-10-02',true)", [EMP1], /row-level security/, "電視帳號不能改單日加班意願"));
const leadWeekly = await as(LEAD, () => db.query("update employees set overtime_weekdays=array[1]::smallint[] where id=$1", [EMP1]));
ok(leadWeekly.affectedRows === 0, "組長不能改固定加班星期");
const otSnap = await as(TV, async () => (await db.query("select schedule_snapshot() s")).rows[0].s);
const otEmp = otSnap.employees.find(e => e.id === EMP1);
ok(JSON.stringify(otEmp.overtime_weekdays) === JSON.stringify([1,3,5]) && otEmp.overtime_overrides["2026-10-01"] === true,
  "快照含固定星期與單日臨時意願");

console.log("員工同時顧機台上限");
ok(otEmp.max_concurrent_machines === 1, "既有員工預設最多顧一台");
await as(BOSS, () => db.query("update employees set max_concurrent_machines=2 where id=$1", [EMP1]));
const capacitySnap = await as(TV, async () => (await db.query("select schedule_snapshot() s")).rows[0].s);
ok(capacitySnap.employees.find(e => e.id === EMP1).max_concurrent_machines === 2, "快照含老闆設定的上限");
await as(BOSS, () => expectErr("update employees set max_concurrent_machines=0 where id=$1", [EMP1], /check constraint/, "上限不可小於一台"));
const leadCapacity = await as(LEAD, () => db.query("update employees set max_concurrent_machines=3 where id=$1", [EMP1]));
ok(leadCapacity.affectedRows === 0, "組長不能修改員工上限");

console.log("套用方案 apply_plan()");
const blocks = [
  { order_id: "00000000-0000-4000-8000-0000000000b1", step_seq: 0, machine_id: "a", employee_id: "00000000-0000-4000-8000-0000000000e1", date: "2026-10-05", start_min: 480, end_min: 540, qty: 120 },
  { order_id: "00000000-0000-4000-8000-0000000000b1", step_seq: 1, machine_id: "c", employee_id: "00000000-0000-4000-8000-0000000000e2", date: "2026-10-05", start_min: 540, end_min: 580, qty: 120 },
];
const opt = (id, bl, eff = {}) => ({ id, name: "方案" + id, summary: "測試", metrics: { moved: 1 }, lines: [], blocks: bl, effects: eff });
const blockedPreview = (await db.query("insert into plan_previews (kind, title, event, base_version, options) values ('auto','超時方案','{}',0,$1) returning id",
  [JSON.stringify([{ ...opt("A", []), applicable: false, diagnostics: ["計算超時"] }])])).rows[0].id;
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [blockedPreview], /不能套用/, "計算超時或不完整的方案不能透過資料庫直接套用"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 0, "被拒絕的方案不會修改排程版本");
const pv1 = (await db.query("insert into plan_previews (kind, title, event, base_version, options) values ('auto','重新排程','{}',0,$1) returning id",
  [JSON.stringify([opt("A", blocks, { overtime_on: ["2026-10-05"] })])])).rows[0].id;
await as(TV, () => expectErr("select apply_plan($1,'A')", [pv1], /只有老闆或組長/, "電視帳號不能套用方案"));
const cs1 = await as(LEAD, async () => (await db.query("select apply_plan($1,'A','第一次') cs", [pv1])).rows[0].cs);
ok(!!cs1, "組長可以套用方案");
ok((await db.query("select version from schedule_state")).rows[0].version === 1n || (await db.query("select version::int v from schedule_state")).rows[0].v === 1, "版本號 +1");
ok((await db.query("select count(*)::int n from schedule_blocks")).rows[0].n === 2, "排程表寫入 2 段");
ok((await db.query("select overtime from calendar_days where date='2026-10-05'")).rows[0]?.overtime === true, "方案附帶的加班日也一起寫入");
const aud = (await db.query("select count(*)::int n from audit_log where change_set_id=$1", [cs1])).rows[0].n;
ok(aud === 3, "這次變更的 3 筆稽核（2 段排程＋1 個加班日）都帶著變更編號");
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pv1], /已經套用過/, "同一個方案不能套用兩次"));

// 第二個方案：沿用第 1 段（帶 id）、移動第 2 段、新增一段
const cur = (await db.query("select * from schedule_blocks order by step_seq")).rows;
const keep = { ...blocks[0], id: cur[0].id };
const moved = { ...blocks[1], id: cur[1].id, start_min: 600, end_min: 640 };
const add = { order_id: "00000000-0000-4000-8000-0000000000b1", step_seq: 2, machine_id: "e", employee_id: "00000000-0000-4000-8000-0000000000e1", date: "2026-10-05", start_min: 660, end_min: 690, qty: 120 };
const pv2 = (await db.query("insert into plan_previews (kind, title, event, base_version, options) values ('fault','c 故障','{}',1,$1) returning id",
  [JSON.stringify([opt("A", [keep, moved, add], { faults_insert: [{ machine_id: "c", date: "2026-10-05", start_min: 540, end_min: 600, note: "馬達", original_blocks: [blocks[1]] }] })])])).rows[0].id;
const pvOld = (await db.query("insert into plan_previews (kind, title, event, base_version, options) values ('auto','舊方案','{}',0,$1) returning id",
  [JSON.stringify([opt("A", [])])])).rows[0].id;
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvOld], /其他人更新/, "排程已被更新時，舊方案會被拒絕（防止兩人同時改）"));
const cs2 = await as(BOSS, async () => (await db.query("select apply_plan($1,'A') cs", [pv2])).rows[0].cs);
const ops = (await db.query("select op, count(*)::int n from audit_log where change_set_id=$1 and table_name='schedule_blocks' group by op order by op", [cs2])).rows;
ok(JSON.stringify(ops) === JSON.stringify([{ op: "INSERT", n: 1 }, { op: "UPDATE", n: 1 }]), "只記真的有變的：沒動的那段不會出現在稽核裡 " + JSON.stringify(ops));
ok((await db.query("select count(*)::int n from machine_faults where note='馬達' and jsonb_array_length(original_blocks)=1")).rows[0].n === 1, "故障記錄保存了原本位置（恢復時用）");
ok((await db.query("select title from change_sets where id=$1", [cs2])).rows[0].title === "c 故障：採用「方案A」", "變更紀錄標題");

console.log("手動調整 save_blocks()");
const all = (await db.query("select id, order_id, step_seq, machine_id, employee_id, date::text, start_min, end_min, qty, pinned from schedule_blocks")).rows;
all[0].pinned = true;
await as(TV, () => expectErr("select save_blocks(2, $1, '拖曳')", [JSON.stringify(all)], /只有老闆或組長/, "電視帳號不能拖曳"));
await as(LEAD, () => expectErr("select save_blocks(1, $1, '拖曳')", [JSON.stringify(all)], /其他人更新/, "版本號不對會被拒絕"));
await as(LEAD, async () => { await db.query("select save_blocks(2, $1, '拖曳')", [JSON.stringify(all)]); ok(true, "組長可以儲存手動調整"); });
ok((await db.query("select count(*)::int n from schedule_blocks where pinned")).rows[0].n === 1, "手動調整寫入（固定 1 段）");

await as(LEAD, () => expectErr("select _apply_blocks('[]'::jsonb)", [], /permission denied/, "前端不能直接呼叫內部函式"));

console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);

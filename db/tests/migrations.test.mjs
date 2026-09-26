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
ok(otSnap.employees.find(e => e.id === "00000000-0000-4000-8000-0000000000e5")?.overtime_weekdays?.length === 0,
  "不能加班的示範員工匯入後沒有可加班星期");

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
// 上述方案測完後移除測試故障，避免後續部分完成量案例剛好排在該故障時段。
await db.query("delete from machine_faults where note='馬達'");

console.log("手動調整 save_blocks()");
const all = (await db.query("select id, order_id, step_seq, machine_id, employee_id, date::text, start_min, end_min, qty, pinned from schedule_blocks")).rows;
all[0].pinned = true;
await as(TV, () => expectErr("select save_blocks(2, $1, '拖曳')", [JSON.stringify(all)], /只有老闆或組長/, "電視帳號不能拖曳"));
await as(LEAD, () => expectErr("select save_blocks(1, $1, '拖曳')", [JSON.stringify(all)], /其他人更新/, "版本號不對會被拒絕"));
await as(LEAD, async () => { await db.query("select save_blocks(2, $1, '拖曳')", [JSON.stringify(all)]); ok(true, "組長可以儲存手動調整"); });
ok((await db.query("select count(*)::int n from schedule_blocks where pinned")).rows[0].n === 1, "手動調整寫入（固定 1 段）");

const tooEarly = all.map(b => ({ ...b }));
tooEarly[1].start_min = 500;
tooEarly[1].end_min = 540;
await as(LEAD, () => expectErr("select save_blocks(3, $1, '提早後站')", [JSON.stringify(tooEarly)], /交接批量/, "RPC 不接受首批產量未做出時的後站工作"));
const materialGap = [
  { ...all[0], qty: 60 },
  { ...all[0], id: null, machine_id: "b", start_min: 960, end_min: 1020, qty: 60, pinned: false },
  { ...all[1], start_min: 660, end_min: 900, qty: 120 },
];
await as(LEAD, () => expectErr("select save_blocks(3, $1, '物料未到')", [JSON.stringify(materialGap)], /累積產量/, "RPC 不接受後站中途用完尚未做出的件數"));
const parallelFirst = [
  { order_id: blocks[0].order_id, step_seq: 0, date: "2026-10-05", start_min: 480, end_min: 540, qty: 50 },
  { order_id: blocks[0].order_id, step_seq: 0, date: "2026-10-05", start_min: 480, end_min: 540, qty: 50 },
];
await expectErr("select _assert_manual_material_flow($1::jsonb)",
  [JSON.stringify([...parallelFirst, { order_id: blocks[0].order_id, step_seq: 1, date: "2026-10-05", start_min: 510, end_min: 520, qty: 10 }])],
  /交接批量/, "並行兩台各做 50 件，08:30 合計尚未達到 60 件交接門檻");
await db.query("select _assert_manual_material_flow($1::jsonb)",
  [JSON.stringify([...parallelFirst, { order_id: blocks[0].order_id, step_seq: 1, date: "2026-10-05", start_min: 520, end_min: 530, qty: 10 }])]);
ok(true, "並行兩台合計在 08:40 達門檻後可開始少量加工");
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 3, "被拒絕的手動安排不增加版本");
const partialBatch = [{ ...all[0], qty: 60 }, { ...all[1], start_min: 540, end_min: 550, qty: 30 }];
await as(LEAD, () => db.query("select save_blocks(3, $1, '先交接一批')", [JSON.stringify(partialBatch)]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 4, "前站只做滿首批、後站先做一部分可儲存");
await as(LEAD, () => expectErr("select save_blocks(4, $1, '刪掉前站')", [JSON.stringify([partialBatch[1]])], /交接批量/, "刪除前站時也會重驗受影響工單"));
const anotherOrder = (await db.query("insert into orders (code, product_id, qty, due_date) values ('MOVE-TEST',$1,120,'2026-10-05') returning id", ["00000000-0000-4000-8000-0000000000a1"])).rows[0].id;
const movedOrder = [{ ...partialBatch[0], order_id: anotherOrder }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '換工單')", [JSON.stringify(movedOrder)], /交接批量/, "方塊改屬其他工單時，舊工單也會重驗"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 4, "刪除與換工單被拒絕後版本保持不變");
const tooManyPieces = [{ ...partialBatch[0], end_min: 550, qty: 121 }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '超出工單件數')", [JSON.stringify(tooManyPieces)], /超過工單件數/, "RPC 不接受一道工序排出超過工單總件數"));
const tooManyParts = [...partialBatch,
  { ...partialBatch[0], id: null, start_min: 960, end_min: 1020, qty: 70 }];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '分段超出工單件數')", [JSON.stringify(tooManyParts)], /超過工單件數/, "RPC 不接受多段各自合理、合計卻超量"));
const tooFast = [{ ...partialBatch[0], end_min: 510, qty: 61 }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '超出工序速率')", [JSON.stringify(tooFast)], /超過工序速率/, "RPC 不接受工作時間不足以做出宣稱件數"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 4, "超量與超速被拒後版本保持不變");
const machineClash = [...partialBatch,
  { ...partialBatch[0], id: null, order_id: anotherOrder, qty: 30, start_min: 500, end_min: 550 }];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '重疊機台')", [JSON.stringify(machineClash)], /機台.*重疊/, "RPC 不接受同一機台同時排兩段工作"));
await db.query("insert into machines (id,label,process) values ('f','測試裁切機','裁切')");
await db.query("insert into machine_products (machine_id,product_id) values ('f',$1)", ["00000000-0000-4000-8000-0000000000a1"]);
await db.query("insert into employee_skills (employee_id,machine_id) values ($1,'f')", [EMP1]);
const employeeOverload = [...partialBatch,
  { ...partialBatch[0], id: null, order_id: anotherOrder, machine_id: "b", qty: 30, start_min: 500, end_min: 550 },
  { ...partialBatch[0], id: null, order_id: anotherOrder, machine_id: "f", qty: 30, start_min: 500, end_min: 550 }];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '超出顧機台上限')", [JSON.stringify(employeeOverload)], /同時顧機台數超過上限/, "RPC 不接受員工同時顧超過設定台數"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 4, "資源衝突被拒後版本保持不變");

const wrongSkill = [{ ...partialBatch[0], employee_id: "00000000-0000-4000-8000-0000000000e3" }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '不會操作')", [JSON.stringify(wrongSkill)], /員工.*不會操作機台/, "RPC 不接受沒有該機台技能的員工"));
const wrongProcess = [{ ...partialBatch[0], machine_id: "d" }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '工序不符')", [JSON.stringify(wrongProcess)], /機台.*不符合產品工序/, "RPC 不接受用焊接機做裁切工序"));
const secondProductOrder = (await db.query("insert into orders (code, product_id, qty, due_date) values ('MOULD-TEST',$1,120,'2026-10-05') returning id", ["00000000-0000-4000-8000-0000000000a2"])).rows[0].id;
const wrongProduct = [...partialBatch,
  { ...partialBatch[0], id: null, order_id: secondProductOrder, machine_id: "b", qty: 30, start_min: 660, end_min: 690 }];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '缺少模具')", [JSON.stringify(wrongProduct)], /機台.*不符合產品工序/, "RPC 不接受機台沒有此產品模具的指派"));
await db.query("update machines set factory=2 where id='b'");
const wrongMachineFactory = [{ ...partialBatch[0], machine_id: "b" }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '機台跨廠')", [JSON.stringify(wrongMachineFactory)], /機台.*不符合產品工序/, "RPC 不接受一廠工序分給二廠機台"));
await db.query("update machines set factory=1 where id='b'");
await db.query("update employees set factory=2 where id=$1", [EMP1]);
const wrongEmployeeFactory = [{ ...partialBatch[0], pinned: false }, partialBatch[1]];
await as(LEAD, () => expectErr("select save_blocks(4, $1, '員工跨廠')", [JSON.stringify(wrongEmployeeFactory)], /員工.*不會操作機台/, "RPC 不接受二廠員工分到一廠機台"));
await db.query("update employees set factory=1 where id=$1", [EMP1]);
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 4, "不相容指派被拒後版本保持不變");

await db.query("update machines set factory=2 where id='b'");
await db.query("update employees set factory=2 where id=$1", [EMP1]);
await db.query("update product_steps set factory=2 where product_id=$1 and seq=0", ["00000000-0000-4000-8000-0000000000a1"]);
const validCrossFactory = [{ ...partialBatch[0], machine_id: "b" }, partialBatch[1]];
await as(LEAD, () => db.query("select save_blocks(4, $1, '兩廠交接')", [JSON.stringify(validCrossFactory)]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 5, "人機及工序廠別一致時，可儲存真正的跨廠安排");
await db.query("update product_steps set factory=1 where product_id=$1 and seq=0", ["00000000-0000-4000-8000-0000000000a1"]);
await db.query("update machines set factory=1 where id='b'");
await db.query("update employees set factory=1 where id=$1", [EMP1]);

const laterBlocks = (await db.query("select id, order_id, step_seq, machine_id, employee_id, date::text, start_min, end_min, qty, pinned from schedule_blocks")).rows;
const newManual = { id: null, order_id: anotherOrder, step_seq: 0, machine_id: "a", employee_id: EMP1,
  date: "2026-10-05", start_min: 480, end_min: 540, qty: 30, pinned: true };
await db.query("insert into leaves (employee_id,date,start_min,end_min,note) values ($1,'2026-10-05',500,560,'測試半日請假')", [EMP1]);
await as(LEAD, () => expectErr("select save_blocks(5, $1, '請假仍排工作')", [JSON.stringify([...laterBlocks, newManual])], /請假時段/, "RPC 不接受員工請假時段內的新工作"));
await db.query("delete from leaves where employee_id=$1 and date='2026-10-05'", [EMP1]);
await db.query("insert into machine_faults (machine_id,date,start_min,end_min,note) values ('a','2026-10-05',500,560,'測試故障')");
await as(LEAD, () => expectErr("select save_blocks(5, $1, '故障仍排工作')", [JSON.stringify([...laterBlocks, newManual])], /機台故障時段/, "RPC 不接受機台故障時段內的新工作"));
await db.query("delete from machine_faults where note='測試故障'");
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 5, "請假與故障衝突被拒後版本保持不變");
await db.query("insert into leaves (employee_id,date,note) values ($1,'2026-10-05','測試整日請假')", [EMP1]);
await as(LEAD, () => expectErr("select save_blocks(5, $1, '整日請假仍排工作')", [JSON.stringify([...laterBlocks, newManual])], /請假時段/, "RPC 不接受整日請假時的新工作"));
await db.query("delete from leaves where employee_id=$1 and date='2026-10-05'", [EMP1]);
await db.query("insert into leaves (employee_id,date,start_min,end_min,note) values ($1,'2026-10-05',540,600,'測試相鄰請假')", [EMP1]);
await db.query("insert into machine_faults (machine_id,date,start_min,end_min,note) values ('a','2026-10-05',540,600,'測試相鄰故障')");
await as(LEAD, () => db.query("select save_blocks(5, $1, '工作在請假故障前結束')", [JSON.stringify([...laterBlocks, newManual])]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 6, "工作剛好在請假與故障開始時結束，仍可儲存");
await db.query("delete from leaves where employee_id=$1 and date='2026-10-05'", [EMP1]);
await db.query("delete from machine_faults where note='測試相鄰故障'");
const afterAvailability = (await db.query("select id, order_id, step_seq, machine_id, employee_id, date::text, start_min, end_min, qty, pinned from schedule_blocks")).rows;
await as(LEAD, () => expectErr("select save_blocks(6, $1, '停工日排班')",
  [JSON.stringify([...afterAvailability, { ...newManual, date: "2026-10-04" }])], /停工日/, "RPC 不接受週日停工時排工作"));
await as(LEAD, () => expectErr("select save_blocks(6, $1, '午休排班')",
  [JSON.stringify([...afterAvailability, { ...newManual, start_min: 720, end_min: 780 }])], /上班時段/, "RPC 不接受工作方塊跨入午休"));
await as(LEAD, () => expectErr("select save_blocks(6, $1, '未開加班')",
  [JSON.stringify([...afterAvailability, { ...newManual, date: "2026-10-06", start_min: 1020, end_min: 1080 }])], /上班時段/, "RPC 不接受未開加班日的晚間工作"));
await as(LEAD, () => expectErr("select save_blocks(6, $1, '員工不加班')",
  [JSON.stringify([...afterAvailability, { ...newManual, employee_id: "00000000-0000-4000-8000-0000000000e5", start_min: 1020, end_min: 1080 }])], /不可加班/, "RPC 不接受員工不願加班的晚間工作"));
await as(LEAD, () => expectErr("select save_blocks(6, $1, '假日員工不出勤')",
  [JSON.stringify([...afterAvailability, { ...newManual, employee_id: "00000000-0000-4000-8000-0000000000e5", date: "2026-10-26" }])], /不可加班/, "RPC 不接受員工不願假日出勤的工作"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 6, "停工、午休與不許加班被拒後版本保持不變");
await as(LEAD, () => db.query("select save_blocks(6, $1, '合法加班')",
  [JSON.stringify([...afterAvailability, { ...newManual, start_min: 1020, end_min: 1080 }])]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 7, "已開加班且員工當日可加班時，仍可儲存晚間工作");
const afterOvertime = (await db.query("select id, order_id, step_seq, machine_id, employee_id, date::text, start_min, end_min, qty, pinned from schedule_blocks")).rows;
const extraOvertime = { ...newManual, start_min: 1080, end_min: 1140 };
await db.query("update calendar_days set is_open=false where date='2026-10-05'");
await as(LEAD, () => expectErr("select save_blocks(7, $1, '單日改停工')",
  [JSON.stringify([...afterOvertime, extraOvertime])], /停工日/, "RPC 尊重單日停工覆蓋每週開工設定"));
await db.query("update calendar_days set is_open=null where date='2026-10-05'");
await db.query("insert into employee_overtime_days (employee_id,date,available) values ($1,'2026-10-05',false)", [EMP1]);
await as(LEAD, () => expectErr("select save_blocks(7, $1, '當天臨時不加班')",
  [JSON.stringify([...afterOvertime, extraOvertime])], /不可加班/, "RPC 尊重員工單日臨時改成不加班"));
await db.query("delete from employee_overtime_days where employee_id=$1 and date='2026-10-05'", [EMP1]);
await db.query("insert into employee_overtime_days (employee_id,date,available) values ($1,'2026-10-05',true)", ["00000000-0000-4000-8000-0000000000e5"]);
await as(LEAD, () => db.query("select save_blocks(7, $1, '臨時同意加班')",
  [JSON.stringify([...afterOvertime, { ...extraOvertime, employee_id: "00000000-0000-4000-8000-0000000000e5" }])]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 8, "原本不加班的員工當日臨時同意後可儲存工作");

await as(LEAD, () => expectErr("select _apply_blocks('[]'::jsonb)", [], /permission denied/, "前端不能直接呼叫內部函式"));

console.log("預覽生成後，基本資料變更仍須重新驗證");
// 先建立一張「已完整排好」的單站測試工單；其他示範工單保持歷史資料，
// 讓方案完整性測試不把前面刻意保留的部分完成量當成失敗原因。
const planProduct = (await db.query("insert into products (code,name) values ('PLAN-ONE','單站方案測試') returning id")).rows[0].id;
await db.query("insert into product_steps (product_id,seq,process,rate) values ($1,0,'裁切',2)", [planProduct]);
await db.query("insert into machine_products (machine_id,product_id) values ('a',$1)", [planProduct]);
await db.query("update orders set status='done' where id<>$1", [anotherOrder]);
await db.query("update orders set product_id=$1,qty=90 where id=$2", [planProduct, anotherOrder]);
const previewBlocks = (await db.query("select id, order_id, step_seq, machine_id, employee_id, date::text, start_min, end_min, qty, pinned from schedule_blocks")).rows;
const pvSkill = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','技能變更前方案','{}',8,$1) returning id",
  [JSON.stringify([{ ...opt("A", previewBlocks), applicable: true }])])).rows[0].id;
await db.query("delete from employee_skills where employee_id=$1 and machine_id='a'", ["00000000-0000-4000-8000-0000000000e5"]);
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvSkill], /不會操作機台/, "方案預覽後技能被移除，套用時仍須拒絕"));
await db.query("insert into employee_skills (employee_id,machine_id) values ($1,'a')", ["00000000-0000-4000-8000-0000000000e5"]);
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 8, "過期技能方案被拒後版本保持不變");
const pvCalendar = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','停工前方案','{}',8,$1) returning id",
  [JSON.stringify([{ ...opt("A", previewBlocks), applicable: true }])])).rows[0].id;
await db.query("update calendar_days set is_open=false where date='2026-10-05'");
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvCalendar], /停工日/, "方案預覽後改為停工，套用時仍須拒絕"));
await db.query("update calendar_days set is_open=null where date='2026-10-05'");
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 8, "過期行事曆方案被拒後版本保持不變");
await as(LEAD, () => db.query("select apply_plan($1,'A')", [pvSkill]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 9, "資料恢復後，原方案仍可經驗證套用");
const pvQty = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','件數變更前方案','{}',9,$1) returning id",
  [JSON.stringify([{ ...opt("A", previewBlocks), applicable: true }])])).rows[0].id;
await db.query("update orders set qty=150 where id=$1", [anotherOrder]);
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvQty], /數量.*不等於/, "預覽後工單件數增加，舊方案未排滿時拒絕套用"));
await db.query("update orders set qty=90 where id=$1", [anotherOrder]);
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 9, "舊件數方案被拒後版本保持不變");
const pvNewOrder = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','新單前方案','{}',9,$1) returning id",
  [JSON.stringify([{ ...opt("A", previewBlocks), applicable: true }])])).rows[0].id;
const addedOrder = (await db.query("insert into orders (code,product_id,qty,due_date) values ('AFTER-PREVIEW',$1,10,'2026-10-06') returning id",
  ["00000000-0000-4000-8000-0000000000a1"])).rows[0].id;
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvNewOrder], /數量.*不等於/, "預覽後新增工單，舊方案漏排該單時拒絕套用"));
await db.query("delete from orders where id=$1", [addedOrder]);
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 9, "漏新單方案被拒後版本保持不變");
const beforeRollbackLog = (await db.query("select count(*)::int n from change_sets")).rows[0].n;
const rollbackEffects = { overtime_on: ["2026-10-06"], faults_insert: [
  { machine_id: "f", date: "2026-10-06", start_min: 480, end_min: 540, note: "方案回滾測試" }] };
const pvRollback = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','回滾測試方案','{}',9,$1) returning id",
  [JSON.stringify([{ ...opt("A", previewBlocks, rollbackEffects), applicable: true }])])).rows[0].id;
await db.query("delete from employee_skills where employee_id=$1 and machine_id='a'", ["00000000-0000-4000-8000-0000000000e5"]);
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvRollback], /不會操作機台/, "套用附帶效果後發現技能已失效，整筆方案須拒絕"));
await db.query("insert into employee_skills (employee_id,machine_id) values ($1,'a')", ["00000000-0000-4000-8000-0000000000e5"]);
const afterRollback = (await db.query(`select
  (select count(*)::int from machine_faults where note='方案回滾測試') as faults,
  (select count(*)::int from calendar_days where date='2026-10-06' and overtime) as overtime,
  (select count(*)::int from change_sets) as logs,
  (select version::int from schedule_state) as version,
  (select applied_option from plan_previews where id=$1) as applied`, [pvRollback])).rows[0];
ok(afterRollback.faults === 0 && afterRollback.overtime === 0 && afterRollback.logs === beforeRollbackLog
  && afterRollback.version === 9 && afterRollback.applied === null,
"驗證失敗時，故障、加班、紀錄、版本與已套用狀態全部回滾");

console.log("過去已完成的方塊不因今日行事曆或請假改變而擋住未來排班");
const historicalOrder = (await db.query("insert into orders (code,product_id,qty,due_date) values ('HIST-MOVE',$1,60,'2026-10-09') returning id", [planProduct])).rows[0].id;
const historicalPast = { ...newManual, order_id: historicalOrder, date: "2025-10-05", qty: 30, pinned: true };
const historicalFuture = { ...newManual, order_id: historicalOrder, date: "2026-10-07", qty: 30, pinned: false };
await db.query("select _apply_blocks($1::jsonb)", [JSON.stringify([...previewBlocks, historicalPast, historicalFuture])]);
await db.query("insert into leaves (employee_id,date,note) values ($1,'2025-10-05','後補歷史請假')", [EMP1]);
await db.query("insert into machine_faults (machine_id,date,start_min,end_min,note) values ('a','2025-10-05',480,540,'後補歷史故障')");
const historicalBlocks = (await db.query("select id,order_id,step_seq,machine_id,employee_id,date::text,start_min,end_min,qty,pinned from schedule_blocks")).rows;
const futureSaved = historicalBlocks.find(b => b.order_id === historicalOrder && b.date === "2026-10-07");
const historicalChanged = historicalBlocks.map(b => b.id === futureSaved.id ? { ...b, pinned: true } : b);
await as(LEAD, () => db.query("select save_blocks(9, $1, '只固定未來方塊')", [JSON.stringify(historicalChanged)]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 10,
  "過去的週日方塊有後補請假與故障時，仍可調整同張工單的未來方塊");
const pvHistory = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','含歷史方塊方案','{}',10,$1) returning id",
  [JSON.stringify([{ ...opt("A", historicalChanged), applicable: true }])])).rows[0].id;
await as(LEAD, () => db.query("select apply_plan($1,'A')", [pvHistory]));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 11,
  "完整方案保留已完成的歷史方塊時仍可套用");
const currentHistory = (await db.query("select id,order_id,step_seq,machine_id,employee_id,date::text,start_min,end_min,qty,pinned from schedule_blocks")).rows;
const changedPast = currentHistory.map(b => b.order_id === historicalOrder && b.date === "2025-10-05"
  ? { ...b, start_min: 540, end_min: 600 } : b);
await as(LEAD, () => expectErr("select save_blocks(11, $1, '改動過去停工日工作')", [JSON.stringify(changedPast)], /停工日/,
  "舊方塊的人機或時間真的被改動時，仍檢查現在的行事曆"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 11,
  "不合法的歷史修改被拒後版本保持不變");
const emptyProduct = (await db.query("insert into products (code,name) values ('NO-STEP','尚未設定工序') returning id")).rows[0].id;
const emptyOrder = (await db.query("insert into orders (code,product_id,qty,due_date) values ('NO-STEP-ORDER',$1,20,'2026-10-09') returning id", [emptyProduct])).rows[0].id;
const pvEmpty = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','未建工序方案','{}',11,$1) returning id",
  [JSON.stringify([{ ...opt("A", currentHistory), applicable: true }])])).rows[0].id;
await as(LEAD, () => expectErr("select apply_plan($1,'A')", [pvEmpty], /沒有工序/,
  "產品還沒有任何工序時，不能把空工作當成完整方案"));
ok((await db.query("select version::int v from schedule_state")).rows[0].v === 11,
  "缺工序方案被拒後版本保持不變");
await db.query("delete from orders where id=$1", [emptyOrder]);
await db.query("delete from products where id=$1", [emptyProduct]);

console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);

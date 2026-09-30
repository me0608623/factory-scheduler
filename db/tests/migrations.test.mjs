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
const unsafeStateWriters = await db.query(`
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ~* 'update[[:space:]]+schedule_state[[:space:]]+set'
    and pg_get_functiondef(p.oid) !~* 'update[[:space:]]+schedule_state[[:space:]]+set[^;]*[[:space:]]where[[:space:]]'
`);
ok(unsafeStateWriters.rows.length === 0, "所有排程版本更新都有 WHERE 範圍，可在 Supabase safeupdate 下執行");
await db.exec(`
  create function _qa_legacy_state_writer() returns void language plpgsql as $$
  begin
    update schedule_state set updated_at = now();
  end $$;
`);
await db.exec(fs.readFileSync(path.join(ROOT, "migrations", "0025_safe_singleton_updates.sql"), "utf8"));
const repairedLegacyWriter = (await db.query(`
  select pg_get_functiondef('public._qa_legacy_state_writer()'::regprocedure) as source
`)).rows[0].source;
ok(/update\s+schedule_state\s+set[^;]*\swhere\sid/i.test(repairedLegacyWriter), "0025 會原地修正既有環境中的舊函式");
await db.exec("drop function _qa_legacy_state_writer()");
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

console.log("職位與逐項授權");
const accessAccounts = (await as(BOSS, async () => (await db.query("select list_access_accounts() a")).rows[0].a));
ok(accessAccounts.length === 3 && accessAccounts.find(x => x.userId === TV)?.permissions?.["orders.manage"] === false,
  "老闆可查看既有帳號與每項有效權限");
await as(BOSS, () => db.query("select set_account_permissions($1,$2::jsonb)", [TV, JSON.stringify({"orders.manage":true,"schedule.manage":false})]));
await as(TV, async () => {
  ok((await db.query("select has_permission('orders.manage') p")).rows[0].p === true &&
     (await db.query("select has_permission('schedule.manage') p")).rows[0].p === false,
    "老闆可讓唯讀職位只取得指定功能");
  await db.query("insert into orders (code, product_id, qty, due_date) values ('DELEGATED-ORDER','00000000-0000-4000-8000-0000000000a1',10,current_date)");
  ok(true,"取得工單權限的既有帳號可新增工單");
  await expectErr("insert into machine_faults (machine_id,date,start_min,end_min) values ('c',current_date,480,540)",[],/row-level security/,
    "未授予故障權限時仍不能報故障");
  await expectErr("select set_account_permissions($1,'{}'::jsonb)",[LEAD],/只有老闆/,
    "非老闆不能轉授權限");
});
await db.query("delete from orders where code='DELEGATED-ORDER'");
await as(BOSS, () => db.query("select set_account_permissions($1,$2::jsonb)", [LEAD, JSON.stringify({"incidents.manage":false})]));
await as(LEAD, () => expectErr("insert into machine_faults (machine_id,date,start_min,end_min) values ('c',current_date,480,540)",[],/row-level security/,
  "老闆可收回組長職位原本擁有的單項權限"));
await as(BOSS, async () => {
  await db.query("select set_account_permissions($1,$2::jsonb)", [BOSS, JSON.stringify({"schedule.manage":false})]);
  ok((await db.query("select has_permission('schedule.manage') p")).rows[0].p === true,"老闆本人的管理權限不能被關閉");
  await db.query("select set_account_permissions(user_id,'{}'::jsonb) from (values ($1::uuid),($2::uuid),($3::uuid)) v(user_id)", [BOSS,LEAD,TV]);
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
await as(TV, () => expectErr("select apply_plan($1,'A')", [pv1], /沒有套用這類方案的權限/, "電視帳號不能套用方案"));
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
const previewBlocks = (await db.query("select b.id, b.order_id, b.step_seq, b.machine_id, b.employee_id, b.date::text, b.start_min, b.end_min, b.qty, b.pinned from schedule_blocks b join orders o on o.id=b.order_id where o.status='open'")).rows;
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
const historicalBlocks = (await db.query("select b.id,b.order_id,b.step_seq,b.machine_id,b.employee_id,b.date::text,b.start_min,b.end_min,b.qty,b.pinned from schedule_blocks b join orders o on o.id=b.order_id where o.status='open'")).rows;
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
const currentHistory = (await db.query("select b.id,b.order_id,b.step_seq,b.machine_id,b.employee_id,b.date::text,b.start_min,b.end_min,b.qty,b.pinned from schedule_blocks b join orders o on o.id=b.order_id where o.status='open'")).rows;
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

console.log("已結案工單的歷史方塊不可被新排程抹除");
const closedOrder = (await db.query(`insert into orders (code,product_id,qty,due_date,status)
  values ('ARCHIVED-WORK',$1,60,'2026-10-09','done') returning id`, [planProduct])).rows[0].id;
await db.query(`insert into schedule_blocks (order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty)
  values ($1,0,'a',$2,'2024-07-01',480,510,30),($1,0,'a',$2,'2026-10-07',540,570,30)`, [closedOrder, EMP1]);
const openSnapshot = (await db.query("select schedule_snapshot('2026-09-28','2026-12-31') as data")).rows[0].data;
ok(!openSnapshot.blocks.some(b => b.order === closedOrder), "快照不混入已結案工單，即使歷史方塊在查詢日期內");
await as(LEAD, () => db.query("select save_blocks(11,$1,'未結案排程微調')", [JSON.stringify(currentHistory)]));
ok((await db.query("select count(*)::int n from schedule_blocks where order_id=$1", [closedOrder])).rows[0].n === 2,
  "手動儲存完整未結案排程仍保留兩段已結案歷史");
const pvOpenOnly = (await db.query(`insert into plan_previews (kind,title,event,base_version,options)
  values ('auto','僅替換未結案工單','{}',12,$1) returning id`,
  [JSON.stringify([{ ...opt("A", currentHistory), applicable: true }])])).rows[0].id;
await as(LEAD, () => db.query("select apply_plan($1,'A')", [pvOpenOnly]));
ok((await db.query("select count(*)::int n from schedule_blocks where order_id=$1", [closedOrder])).rows[0].n === 2,
  "自動方案套用仍保留兩段已結案歷史");
const closedRow = (await db.query("select id,order_id,step_seq,machine_id,employee_id,date::text,start_min,end_min,qty,pinned from schedule_blocks where order_id=$1 order by date limit 1", [closedOrder])).rows[0];
await as(LEAD, () => expectErr("select save_blocks(13,$1,'過時快照含結案方塊')",
  [JSON.stringify([...currentHistory, closedRow])], /只能修改未結案工單/, "過時手動快照不能改寫已結案工單"));
ok((await db.query("select version::int n from schedule_state")).rows[0].n === 13 &&
  (await db.query("select count(*)::int n from schedule_blocks where order_id=$1", [closedOrder])).rows[0].n === 2,
  "結案方塊寫入被拒後，版本及歷史皆不變");
const reusedClosedId = currentHistory.map(block => block.order_id === historicalOrder && block.date === "2026-10-07"
  ? { ...block, id: closedRow.id } : block);
await as(LEAD, () => expectErr("select save_blocks(13,$1,'重用結案方塊 ID')",
  [JSON.stringify(reusedClosedId)], /只能修改未結案工單/, "未結案工單不能重用已結案歷史方塊的 ID"));
ok((await db.query("select version::int n from schedule_state")).rows[0].n === 13 &&
  (await db.query("select count(*)::int n from schedule_blocks where order_id=$1", [closedOrder])).rows[0].n === 2,
  "重用結案 ID 被拒後，版本及歷史皆不變");
const repeatedBlock = currentHistory.find(block => block.order_id === historicalOrder && block.date === "2026-10-07");
await as(LEAD, () => expectErr("select save_blocks(13,$1,'重複方塊 ID')",
  [JSON.stringify([...currentHistory, repeatedBlock])], /重複的工作方塊 ID/, "同一份提交不能重複使用方塊 ID"));
ok((await db.query("select version::int n from schedule_state")).rows[0].n === 13,
  "重複方塊 ID 被拒後版本不變");

console.log("正式名冊待確認保護");
await db.query("update employees set review_status='pending',source_ref='test.xlsx · 1廠!B2' where id=$1", [EMP1]);
await db.query("update machines set review_status='pending',source_ref='test.xlsx · 1廠!C2' where id='a'");
await db.query("update schedule_state set setup_pending=true");
const pendingSnap = (await as(LEAD, () => db.query("select schedule_snapshot() s"))).rows[0].s;
ok(pendingSnap.setup_pending && pendingSnap.employees.find(e=>e.id===EMP1).review_status==='pending'
  && pendingSnap.machines.find(m=>m.id==='a').source_ref==='test.xlsx · 1廠!C2', "組長快照可看到待確認名冊與原檔來源");
await expectErr("insert into plan_previews(kind,title,event,base_version,options) values('auto','pending','{}',13,'[]')", [], /尚待確認/, "待確認名冊不接受新求解預覽");
await expectErr("update schedule_blocks set pinned=not pinned where id=$1", [closedRow.id], /尚待確認/, "待確認名冊不接受排班變動");

console.log("原檔名冊正式匯入（可恢復替換）");
await db.exec(fs.readFileSync(path.join(ROOT,'maintenance','import_legacy_roster.sql'),'utf8'));
const sourceId=(await db.query("select id from legacy_schedule_archives where source_sha256=$1",[archiveHash])).rows[0].id;
await expectErr("select pg_temp.import_legacy_roster($1,13)",[sourceId],/已有實際排班/,"有實際排班時拒絕覆蓋名冊");
await db.query("update schedule_state set setup_pending=false");
await db.query("delete from schedule_blocks");
await db.query("update employees set source_ref=null");
await db.query("update machines set source_ref=null");
await db.exec('begin');
const imported=(await db.query("select pg_temp.import_legacy_roster($1,13) r",[sourceId])).rows[0].r;
await db.exec('commit');
ok(imported.employees===20 && imported.stations===45 && imported.setup_pending,"匯入20個人員候選與45個機台／工作站欄位");
const importedSnap=(await as(LEAD,()=>db.query("select schedule_snapshot() s"))).rows[0].s;
ok(importedSnap.employees.filter(e=>e.factory===1).length===4 && importedSnap.employees.filter(e=>e.factory===2).length===16
  && importedSnap.machines.filter(m=>m.factory===1).length===24 && importedSnap.machines.filter(m=>m.factory===2).length===21,"正式快照正確分1廠、2廠");
ok(importedSnap.employees.every(e=>e.skills.length===0 && e.review_status==='pending')
  && importedSnap.orders.length===0 && importedSnap.blocks.length===0,"不推測技能、工單件數或工作時間");
ok((await db.query("select count(*)::int n from employees where not active")).rows[0].n>=5
  && (await db.query("select count(*)::int n from orders where status='cancelled'")).rows[0].n>0,"舊名冊與工單仍保留，未刪除");
await expectErr("select pg_temp.import_legacy_roster($1,14)",[sourceId],/不可重複匯入/,"重複匯入拒絕，不再建立重複人員");

console.log('完整名冊補齊與身份來源');
await db.exec(fs.readFileSync(path.join(ROOT,'maintenance','complete_legacy_catalog.sql'),'utf8'));
const originalPeople=(await db.query('select id,name,factory,source_ref from employees where active order by factory,name')).rows;
let codeIndex=0, secondIndex=0;
const completionPeople=originalPeople.map(e=>{
  const idx=e.factory===2?secondIndex++:-1;
  const action=e.factory===1||idx===15?'retain':idx<4?'hold_alias_mapping':idx===4?'propose_name_note_split':'retain_and_propose_source_code';
  return {factory:e.factory,current_name:e.name,name:action==='hold_alias_mapping'?'候選'+idx:action==='propose_name_note_split'?e.name+'（整理）':e.name,
    source_code:action==='retain'?null:'TEST'+(++codeIndex),source:'工作表3!A'+(codeIndex+1),action,preserved_note:'保留原文備註'};
});
for(let i=0;i<10;i++) completionPeople.push({factory:i<9?1:2,name:'新增測試'+i,current_name:null,
  source_code:i===8?null:'NEW'+i,source:'來源表!B'+(i+1),action:'propose_add_pending'});
const originalMachines=(await db.query('select id,factory from machines where active order by factory,id')).rows;
let groups=originalMachines.map((m,i)=>({factory:m.factory,proposed_parent_key:'test-group-'+i,positions:[{current_id:m.id,side:null}]}));
const secondGroups=groups.filter(g=>g.factory===2);
for(let i=0;i<7;i++) {
  const left=secondGroups[i*2],right=secondGroups[i*2+1];
  left.positions[0].side='左';right.positions[0].side='右';
  left.positions.push(...right.positions);groups=groups.filter(g=>g!==right);
}
const args=[sourceId,archiveHash,14,JSON.stringify(completionPeople),JSON.stringify(groups)];
await expectErr('select pg_temp.complete_legacy_catalog($1,$2,$3,$4,$5)',[...args.slice(0,2),13,...args.slice(3)],/版本已變/,'補齊拒絕過期版本');
const duplicatePositions=structuredClone(groups);duplicatePositions[0].positions[0].current_id=duplicatePositions[1].positions[0].current_id;
await expectErr('select pg_temp.complete_legacy_catalog($1,$2,$3,$4,$5)',[...args.slice(0,4),JSON.stringify(duplicatePositions)],/duplicate key|unique constraint/,'位置ID重複時整次補齊撤回');
ok((await db.query('select count(*)::int n from employees where active')).rows[0].n===20,'失敗交易未留下新增人員');
const collisionPeople=structuredClone(completionPeople);collisionPeople.at(-1).source_code=collisionPeople.find(p=>p.action==='retain_and_propose_source_code').source_code;
await expectErr('select pg_temp.complete_legacy_catalog($1,$2,$3,$4,$5)',[...args.slice(0,3),JSON.stringify(collisionPeople),args[4]],/duplicate key|unique constraint/,'原始代號衝突時整筆撤回');
await db.exec('begin');
const completed=(await db.query('select pg_temp.complete_legacy_catalog($1,$2,$3,$4,$5) r',args)).rows[0].r;
await db.exec('commit');
ok(completed.added===10&&completed.held_aliases===4&&completed.setup_pending,'只補齊10個候選，4組別名不合併');
const completeSnap=(await as(LEAD,()=>db.query('select schedule_snapshot() s'))).rows[0].s;
ok(completeSnap.employees.length===30&&completeSnap.employees.filter(e=>e.factory===1).length===13,'補齊後快照一廠13人、二廠17人');
ok(originalPeople.every(e=>completeSnap.employees.some(x=>x.id===e.id)),'既有20個人員UUID保留');
ok(completeSnap.employees.filter(e=>e.identity_candidates.length===1).length===4,'4組候選保持待確認且不套用姓名');
ok(completeSnap.employees.find(e=>e.source_notes)?.source_notes==='保留原文備註','拆分姓名不刪原文備註');
ok(completeSnap.employees.every(e=>e.skills.length===0&&e.review_status==='pending')&&completeSnap.blocks.length===0,'不推測技能或新增排班');
ok(new Set(completeSnap.machines.map(m=>m.catalog_group)).size===38&&completeSnap.machines.length===45,'38來源群組保留45原位置ID');
ok(originalMachines.every(m=>completeSnap.machines.some(x=>x.id===m.id)),'機台原ID全部保留');
await expectErr('select pg_temp.complete_legacy_catalog($1,$2,$3,$4,$5)',[...args.slice(0,2),15,...args.slice(3)],/不可重複/,'已補齊拒絕再次執行');
await expectErr("insert into plan_previews(kind,title,event,base_version,options) values('auto','pending','{}',15,'[]')",[],/尚待確認/,'補齊後仍拒絕未確認資料啟用求解');

console.log('來源員工分組匯入');
await db.exec(fs.readFileSync(path.join(ROOT,'maintenance','import_legacy_groups.sql'),'utf8'));
const staffGroupDefs=Array.from({length:7},(_,i)=>({id:`dddddddd-dddd-4ddd-8ddd-${String(i+1).padStart(12,'0')}`,name:'來源組'+i,home_factory:i<4?1:2,source_ref:'fixture!A'+i}));
const firstStaff=completeSnap.employees.filter(e=>e.factory===1),secondStaff=completeSnap.employees.filter(e=>e.factory===2);
const staffImportMembers=[...firstStaff,...secondStaff.slice(0,16)].map((e,i)=>({
  group_id:staffGroupDefs[e.factory===1?Math.min(3,Math.floor(i/4)):4+(i-13)%3].id,
  factory:e.factory,current_name:e.name,source_code:e.identity_candidates[0]?.source_employee_code||e.source_employee_code,
  review_status:e.identity_candidates.length?'pending':'source',source_ref:e.source_ref.split(' · ').at(-1)}));
const groupArgs=[archiveHash,15,JSON.stringify(staffGroupDefs),JSON.stringify(staffImportMembers)];
await expectErr('select pg_temp.import_legacy_groups($1,$2,$3,$4)',[archiveHash,14,...groupArgs.slice(2)],/版本已變/,'来源分組拒絕過期版本');
const badStaff=structuredClone(staffImportMembers);badStaff[0].source_code='NOT-IN-SOURCE';
await expectErr('select pg_temp.import_legacy_groups($1,$2,$3,$4)',[...groupArgs.slice(0,3),JSON.stringify(badStaff)],/員工對照/,'身份對照不符整次匯入撤回');
ok((await db.query('select count(*)::int n from staff_groups')).rows[0].n===0,'失敗匯入沒有留下分組');
await db.exec('begin');
const grouped=(await db.query('select pg_temp.import_legacy_groups($1,$2,$3,$4) r',groupArgs)).rows[0].r;
await db.exec('commit');
ok(grouped.groups===7&&grouped.members===29&&grouped.pending===4,'建立7個來源組、29筆對照、4筆待核對');
const groupedSnap=(await as(LEAD,()=>db.query('select schedule_snapshot() s'))).rows[0].s;
ok(groupedSnap.staff_groups.length===7&&groupedSnap.staff_group_members.length===29,'登入快照包含分組與成員');
ok(groupedSnap.employees.length===30&&groupedSnap.employees.every(e=>e.skills.length===0)&&groupedSnap.setup_pending,'分組不新增身份、技能或啟用排程');
await expectErr('select pg_temp.import_legacy_groups($1,$2,$3,$4)',[archiveHash,16,...groupArgs.slice(2)],/不可覆寫|重複/,'來源分組不可重複覆寫');
await as(LEAD,()=>expectErr('select save_staff_groups($1,$2,$3)',[16,'[]','[]'],/只有老闆/,'組長不得變更固定分組'));
await as(BOSS,()=>expectErr('select save_staff_groups($1,$2,$3)',[15,'[]','[]'],/版本已變/,'分組修改版本衝突整次拒絕'));

console.log('特別趕貨紀錄與工單備註（0030）');
const rushRow={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',f1:{shipDate:'2026-10-01',vendor:'AVK-5',desc:'521F00137',shortQty:100,note:''},f2:{startDate:'2026-10-02',dueDate:'',itemProcess:'521F00137',desc:'進貨布輪擦拭',qty:240,note:''}};
const rushVer=(await db.query('select version::int v from schedule_state')).rows[0].v;
await as(TV,()=>expectErr('select save_rush_orders($1,$2)',[rushVer,JSON.stringify([rushRow])],/只有老闆或組長/,'電視帳號不能改趕貨紀錄'));
await as(LEAD,()=>db.query('select save_rush_orders($1,$2)',[rushVer,JSON.stringify([rushRow])]));
ok((await db.query('select count(*)::int n from rush_orders')).rows[0].n===1,'組長可新增趕貨紀錄');
const rushSnap=(await as(LEAD,()=>db.query('select schedule_snapshot() s'))).rows[0].s;
ok(rushSnap.rush_orders.length===1&&rushSnap.rush_orders[0].f1.vendor==='AVK-5','登入快照包含趕貨紀錄');
ok(Array.isArray(rushSnap.orders)&&rushSnap.orders.every(o=>'note' in o),'快照工單格式都帶 note 欄位');
await as(LEAD,()=>expectErr('select save_rush_orders($1,$2)',[rushVer,'[]'],/版本已變/,'趕貨版本衝突整次拒絕'));
const rushVer2=rushVer+1;
const badQty=structuredClone(rushRow);badQty.f1.shortQty=-5;
await as(LEAD,()=>expectErr('select save_rush_orders($1,$2)',[rushVer2,JSON.stringify([badQty])],/整數/,'負數數量拒絕'));
const emptyRush={id:'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',f1:{shipDate:'',vendor:'',desc:'',shortQty:null,note:''},f2:{startDate:'',dueDate:'',itemProcess:'',desc:'',qty:null,note:''}};
await as(LEAD,()=>expectErr('select save_rush_orders($1,$2)',[rushVer2,JSON.stringify([emptyRush])],/至少要填/,'兩邊全空的列拒絕'));
const zeroQty=structuredClone(rushRow);zeroQty.f2.qty=0;
await as(LEAD,()=>db.query('select save_rush_orders($1,$2)',[rushVer2,JSON.stringify([zeroQty])]));
ok((await db.query('select count(*)::int n from rush_orders')).rows[0].n===1,'0 件可儲存（覆蓋同一列）');
await as(LEAD,()=>db.query('select save_rush_orders($1,$2)',[rushVer2+1,'[]']));
ok((await db.query('select count(*)::int n from rush_orders')).rows[0].n===0,'整批替換可移除趕貨列');
ok((await db.query("select count(*)::int n from change_sets where title='更新特別趕貨紀錄'")).rows[0].n>=3,'趕貨寫入留下變更紀錄');
const anyProduct=(await db.query('select id from products limit 1')).rows[0]?.id;
if(anyProduct){
  await as(BOSS,()=>db.query("insert into orders(id,code,product_id,qty,due_date,priority,note) values('99999999-9999-4999-8999-999999999999','RN-1',$1,10,'2026-10-31',2,'客戶指定第一批') on conflict(id) do update set note=excluded.note",[anyProduct]));
  const noteSnap=(await as(LEAD,()=>db.query('select schedule_snapshot() s'))).rows[0].s;
  const rn=noteSnap.orders.find(o=>o.code==='RN-1');
  ok(rn&&rn.note==='客戶指定第一批','快照可讀回工單備註');
}else ok(false,'缺少產品資料，無法驗證工單備註讀回');

console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);

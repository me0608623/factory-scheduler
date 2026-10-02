// 本機跨層驗收：PGlite 快照 → OR-Tools 預覽 → PGlite apply_plan → 獨立驗證。
// 只用合成種子；不讀取正式環境金鑰、沒有網路請求。
import { PGlite } from "@electric-sql/pglite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const solver = path.resolve(root, "../solver");
const preferredOption = process.argv[2] || "A";
if (!["A", "B", "C", "D"].includes(preferredOption)) throw new Error(`Unknown strategy ${preferredOption}`);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
// Supabase 預先提供這個 publication；PGlite 必須建立同名替身，才能完整執行
// 後續新增的 realtime migration，而不是靠檔名略過 migration。
await db.exec("create publication supabase_realtime");
for (const name of fs.readdirSync(path.join(root, "migrations")).sort()) {
  await db.exec(fs.readFileSync(path.join(root, "migrations", name), "utf8"));
}
await db.exec(fs.readFileSync(path.join(root, "seed.sql"), "utf8"));
// seed.sql uses current_date for demo due dates; pin them so this regression stays repeatable.
await db.query(`update orders set due_date=date '2026-09-27' + case code
  when 'A01' then 4 when 'B02' then 5 when 'C03' then 6
  when 'A04' then 9 when 'B05' then 10 when 'C06' then 11 end`);

// 三個產品都在二廠包裝；裁切、沖壓與焊接留在一廠，形成實際跨廠路線。
await db.query("update product_steps set factory=2 where process='包裝'");
await db.query("update product_steps set transfer_batch=60 where process='包裝' and product_id='00000000-0000-4000-8000-0000000000a1'");
await db.query("update machines set factory=2 where id='e'");
await db.query("update employees set factory=2 where code in ('E03','E04')");
const closedOrder = "00000000-0000-4000-8000-0000000000c1";
await db.query(`insert into orders (id,code,product_id,qty,due_date,status)
  values ($1,'CLOSED-HISTORY','00000000-0000-4000-8000-0000000000a1',60,'2026-09-28','done')`, [closedOrder]);
await db.query(`insert into schedule_blocks (order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty)
  values ($1,0,'a','00000000-0000-4000-8000-0000000000e1','2024-07-01',480,495,30),
         ($1,0,'a','00000000-0000-4000-8000-0000000000e1','2026-09-28',480,495,30)`, [closedOrder]);
const uid = "11111111-1111-4111-8111-111111111111";
await db.query("insert into auth.users (id,email) values ($1,'integration@example.test')", [uid]);
await db.query("update profiles set role='lead' where user_id=$1", [uid]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);

function solverCall(request) {
  const child = spawnSync("uv", ["run", "python", "-m", "scripts.plan_stdio"], {
    cwd: solver, input: JSON.stringify(request), encoding: "utf8", timeout: 90000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message || child.stderr || `solver exit ${child.status}`);
  return JSON.parse(child.stdout);
}

try {
  const readSnapshot = async () => (await db.query("select schedule_snapshot('2026-09-28','2026-12-31') as data")).rows[0].data;
  const now = { date: "2026-09-29", min: 480 };
  if ((await readSnapshot()).blocks.some(block => block.order === closedOrder)) {
    throw new Error("Closed-order blocks leaked into the solver snapshot");
  }
  const outcomes = [];
  async function planAndApply(event) {
    const snapshot = await readSnapshot();
    const plan = solverCall({ snapshot, event, now, time_limit: 3 });
    const target = event.type === "auto" && ["C", "D"].includes(preferredOption) ? "A"
      : event.type === "recover" && preferredOption === "D" ? "C" : preferredOption;
    const option = plan.options.find(item => item.id === target && item.applicable && item.solver_method !== "keep");
    if (!option) throw new Error(`${event.type}: option ${target} unavailable: ${JSON.stringify(plan.options.map(o => ({ id: o.id, status: o.status, applicable: o.applicable, diagnostics: o.diagnostics })))}`);
    const preview = (await db.query(`insert into plan_previews (kind,title,event,base_version,options)
      values ($1,$2,$3::jsonb,$4,$5::jsonb) returning id`,
    [plan.kind, plan.title, JSON.stringify(plan.event), plan.base_version, JSON.stringify(plan.options)])).rows[0].id;
    try { await db.query("select apply_plan($1,$2)", [preview, option.id]); }
    catch (error) { throw new Error(`${event.type} option ${option.id} was marked applicable but apply_plan rejected it: ${error.message}`); }
    const after = await readSnapshot();
    const issues = solverCall({ mode: "check", snapshot: after, now }).issues;
    if (issues.length) throw new Error(`${event.type}: ${JSON.stringify(issues)}`);
    outcomes.push({ event: event.type, option: option.id, status: option.status, blocks: after.blocks.length });
    return option;
  }

  await planAndApply({ type: "auto" });
  const earlyTransfers = (await db.query(`select count(*)::int as value from schedule_blocks pack
    join orders o on o.id=pack.order_id
    where o.product_id='00000000-0000-4000-8000-0000000000a1' and pack.step_seq=2
      and (pack.date + pack.start_min * interval '1 minute') < (
        select max(upstream.date + upstream.end_min * interval '1 minute')
          from schedule_blocks upstream where upstream.order_id=pack.order_id and upstream.step_seq=1)`)).rows[0].value;
  const fault = await planAndApply({ type: "fault", machine: "c", date: "2026-09-29", start: 480, end: 720, note: "integration" });
  await planAndApply({ type: "leave", employee: "00000000-0000-4000-8000-0000000000e3", date: "2026-09-30", note: "integration" });
  await planAndApply({ type: "order", order: { id: "00000000-0000-4000-8000-0000000000b7", code: "Z07",
    product: "00000000-0000-4000-8000-0000000000a1", qty: 80, due: "2026-10-02", priority: 0 } });
  await planAndApply({ type: "recover", fault_id: fault.effects.faults_insert[0].id });
  const version = (await db.query("select version::int as value from schedule_state")).rows[0].value;
  const counts = (await db.query(`select count(*)::int as blocks,
    count(*) filter (where m.factory=2)::int as second_factory
    from schedule_blocks b join machines m on m.id=b.machine_id`)).rows[0];
  const effects = (await db.query(`select
    (select count(*)::int from machine_faults where id=$1) as remaining_faults,
    (select count(*)::int from leaves where employee_id=$2 and date='2026-09-30') as leaves,
    (select count(*)::int from orders where code='Z07' and qty=80) as rush_orders,
    (select count(*)::int from calendar_days where overtime) as overtime_days,
    (select count(*)::int from schedule_blocks where order_id=$3) as closed_history_blocks,
    (select count(*)::int from change_sets) as changes`,
  [fault.effects.faults_insert[0].id, "00000000-0000-4000-8000-0000000000e3", closedOrder])).rows[0];
  if (version !== outcomes.length || counts.blocks < 21 || counts.second_factory < 7 || earlyTransfers < 1 ||
      effects.remaining_faults !== 0 || effects.leaves !== 1 || effects.rush_orders !== 1 || effects.changes !== 5 ||
      effects.closed_history_blocks !== 2 ||
      (preferredOption === "C" && effects.overtime_days < 1)) {
    throw new Error(JSON.stringify({ version, counts, effects, outcomes }));
  }

  // ---------- 現場流程：worker 回報 → 組長確認完工 → 快照一致性（模擬重新整理） ----------
  // 完工回報不可提前：只挑今天（台北）或以前的排程段。
  const reportable = (await db.query(`select b.id, b.employee_id, b.qty from schedule_blocks b
    join orders o on o.id=b.order_id
    where b.employee_id is not null and o.status='open'
      and b.date <= (clock_timestamp() at time zone 'Asia/Taipei')::date
    order by b.date limit 2`)).rows;
  if (reportable.length < 1) throw new Error("沒有可回報的排程段，無法驗收現場流程");
  const mine = reportable[0];
  const notMine = reportable[1] && reportable[1].employee_id !== mine.employee_id ? reportable[1] : null;
  const workerUid = "22222222-2222-4222-8222-222222222222";
  await db.query("insert into auth.users (id,email) values ($1,'worker@example.test')", [workerUid]);
  // on_auth_user_created 觸發器已自動建立 viewer profile；改為指派角色，模擬老闆設定的現場帳號
  await db.query("update profiles set role='worker', employee_id=$2, display_name='drill-worker' where user_id=$1", [workerUid, mine.employee_id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [workerUid]);
  const report = async (block, action, qty, rev) =>
    (await db.query("select (report_work_execution(gen_random_uuid(),$1,$2,$3,$4)) as r", [block, action, qty, rev])).rows[0].r;
  if (notMine) {
    let denied = false;
    try { await report(notMine.id, "start", 0, 0); } catch (e) { denied = /綁定給自己/.test(e.message); }
    if (!denied) throw new Error("worker 竟可回報綁給別人的工作");
  }
  let s1 = await report(mine.id, "start", 0, 0);
  if (s1.status !== "running") throw new Error(`start 後狀態應為 running：${JSON.stringify(s1)}`);
  const half = Math.max(1, Math.floor(mine.qty / 2));
  let s2 = await report(mine.id, "quantity", half, s1.revision);
  if (s2.qtyDone !== half) throw new Error(`回報件數不一致：${JSON.stringify(s2)}`);
  let s3 = await report(mine.id, "finish", mine.qty, s2.revision);
  if (s3.status !== "done" || s3.qtyDone !== mine.qty) throw new Error(`完工回報不一致：${JSON.stringify(s3)}`);
  let doneBlocked = false;
  try { await report(mine.id, "quantity", mine.qty, s3.revision); } catch (e) { doneBlocked = /不可再修改/.test(e.message); }
  if (!doneBlocked) throw new Error("已完成的回報竟可再修改");

  // 切回組長確認完工；worker 不行。
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const workerDenied = await (async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [workerUid]);
    try { await db.query("select confirm_work_execution($1,true)", [mine.id]); return false; }
    catch (e) { return /只有老闆或組長/.test(e.message); }
    finally { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]); }
  })();
  if (!workerDenied) throw new Error("worker 竟可確認完工");
  const confirmed = (await db.query("select (confirm_work_execution($1,true)) as r", [mine.id])).rows[0].r;
  if (confirmed.confirmed !== true) throw new Error(`確認完工失敗：${JSON.stringify(confirmed)}`);

  // 模擬畫面重新整理：重新讀兩次快照，完工量與確認狀態必須一致（ERP CSV 即讀這些欄位）。
  const execEntry = async () => {
    const snap = await readSnapshot();
    return snap.work_execution.find(x => x.blockId === mine.id) || null;
  };
  const e1 = await execEntry(), e2 = await execEntry();
  if (!e1 || e1.status !== "done" || e1.qtyDone !== mine.qty || e1.confirmed !== true)
    throw new Error(`快照中的回報不一致（ERP 來源）：${JSON.stringify(e1)}`);
  if (JSON.stringify(e1) !== JSON.stringify(e2))
    throw new Error(`兩次快照不一致（模擬重新整理）：${JSON.stringify(e1)} vs ${JSON.stringify(e2)}`);
  const erpRow = (await db.query(`select o.code, b.date, x.qty_done, x.confirmed from work_execution x
    join schedule_blocks b on b.id=x.block_id join orders o on o.id=b.order_id
    where x.block_id=$1`, [mine.id])).rows[0];
  if (!erpRow.code || erpRow.qty_done !== mine.qty || erpRow.confirmed !== true)
    throw new Error(`ERP CSV 資料來源不一致：${JSON.stringify(erpRow)}`);

  console.log(JSON.stringify({ version, second_factory_blocks: counts.second_factory, earlyTransfers, effects, outcomes,
    execution: { block: mine.id, qtyDone: e1.qtyDone, confirmed: e1.confirmed, erpOrder: erpRow.code } }));
} finally {
  await db.close();
}

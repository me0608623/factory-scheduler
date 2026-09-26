// Synthetic-only benchmark for the save_blocks material-flow guard.
// Run here: node benchmark_manual_flow.mjs 100 500 1000 [--rpc|--plan] [--closed-history=5000]
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const measureRpc = process.argv.includes("--rpc");
const measurePlan = process.argv.includes("--plan");
if (measureRpc && measurePlan) throw new Error("Use --rpc or --plan, not both");
const closedArg = process.argv.find(arg => arg.startsWith("--closed-history="));
const closedHistory = closedArg ? Number(closedArg.split("=")[1]) : 0;
if (!Number.isInteger(closedHistory) || closedHistory < 0 || closedHistory > 10000) {
  throw new Error("--closed-history must be between 0 and 10000");
}
const sizes = process.argv.slice(2).filter(arg => arg !== "--rpc" && arg !== "--plan" && arg !== closedArg).map(Number);
if (!sizes.length || sizes.some(n => !Number.isInteger(n) || n < 1 || n > 2000)) {
  throw new Error("Provide order counts between 1 and 2000");
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
for (const name of fs.readdirSync(path.join(root, "migrations")).sort()) {
  try { await db.exec(fs.readFileSync(path.join(root, "migrations", name), "utf8")); }
  catch (error) { if (!name.includes("realtime")) throw error; }
}
await db.exec(fs.readFileSync(path.join(root, "seed.sql"), "utf8"));
if (measureRpc || measurePlan) {
  const userId = "11111111-1111-4111-8111-111111111111";
  await db.query("insert into auth.users (id,email) values ($1,'benchmark@example.test')", [userId]);
  await db.query("update profiles set role='boss' where user_id=$1", [userId]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
}
if (measurePlan) {
  await db.query("update calendar_weekly set is_open=true");
  // 此基準只衡量合成 BENCH 工單；示範種子工單沒有附排程，先標為已結案。
  await db.query("update orders set status='done' where code not like 'BENCH-%'");
}
const product = "00000000-0000-4000-8000-0000000000a1";
const employee = [1, 2, 3].map(n => `00000000-0000-4000-8000-0000000000e${n}`);
if (closedHistory) {
  await db.query(`insert into orders (code,product_id,qty,due_date,status)
    select 'CLOSED-BENCH-' || n, $1, 1, date '2000-01-01' + n, 'done'
      from generate_series(1,$2) n`, [product, closedHistory]);
  await db.query(`insert into schedule_blocks (order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty)
    select o.id,0,'a',$1,date '2000-01-01' + split_part(o.code,'-',3)::int,480,490,1
      from orders o where o.code like 'CLOSED-BENCH-%'`, [employee[0]]);
}
for (const count of sizes) {
  const orders = (await db.query(`
    insert into orders (code, product_id, qty, due_date)
    select 'BENCH-' || n, $1, 120, date '2026-10-05'
      from generate_series(1, $2) n
    on conflict (code) do update set qty = excluded.qty
    returning id`, [product, count])).rows;
  const blocks = orders.flatMap(({ id }, index) => {
    // 每張工單分到不同日期，避免合成測試本身造成機台衝突。
    const date = new Date(Date.UTC(2026, 9, 5 + index)).toISOString().slice(0, 10);
    return [
      { order_id: id, step_seq: 0, machine_id: "a", employee_id: employee[0], date, start_min: 480, end_min: 540, qty: 120 },
      { order_id: id, step_seq: 1, machine_id: "c", employee_id: employee[1], date, start_min: 540, end_min: 580, qty: 120 },
      { order_id: id, step_seq: 2, machine_id: "e", employee_id: employee[2], date, start_min: 580, end_min: 610, qty: 120 },
    ];
  });
  const start = performance.now();
  await db.query("select _assert_manual_material_flow($1::jsonb)", [JSON.stringify(blocks)]);
  const fullMs = Math.round(performance.now() - start);
  const changedStart = performance.now();
  await db.query("select _assert_manual_material_flow($1::jsonb, array[$2]::uuid[])", [JSON.stringify(blocks), orders[0].id]);
  const line = { orders: count, blocks: blocks.length, closedHistory, fullMs,
    oneChangedOrderMs: Math.round(performance.now() - changedStart) };
  if (measureRpc) {
    await db.query("select _apply_blocks($1::jsonb)", [JSON.stringify(blocks)]);
    const saved = (await db.query(`select b.id, b.order_id, b.step_seq, b.machine_id, b.employee_id,
      b.date::text, b.start_min, b.end_min, b.qty, b.pinned
      from schedule_blocks b join orders o on o.id=b.order_id where o.status='open'`)).rows;
    const first = saved.find(block => block.order_id === orders[0].id && block.step_seq === 0);
    first.start_min = 490;
    first.end_min = 550;
    const version = (await db.query("select version::int as version from schedule_state")).rows[0].version;
    const rpcStart = performance.now();
    await db.query("select save_blocks($1, $2::jsonb, 'Benchmark')", [version, JSON.stringify(saved)]);
    line.saveBlocksMs = Math.round(performance.now() - rpcStart);
  }
  if (measurePlan) {
    const version = (await db.query("select version::int as version from schedule_state")).rows[0].version;
    const options = [{ id: "A", name: "合成方案", applicable: true, blocks, effects: {} }];
    const previewStart = performance.now();
    const preview = (await db.query(`insert into plan_previews (kind,title,event,base_version,options)
      values ('auto','合成壓力方案','{}',$1,$2::jsonb) returning id`, [version, JSON.stringify(options)])).rows[0].id;
    line.previewWriteMs = Math.round(performance.now() - previewStart);
    const planStart = performance.now();
    await db.query("select apply_plan($1,'A')", [preview]);
    line.applyPlanMs = Math.round(performance.now() - planStart);
  }
  if (measureRpc || measurePlan) {
    const snapshotStart = performance.now();
    const snapshot = (await db.query("select schedule_snapshot('2026-10-05','2026-12-31') as data")).rows[0].data;
    line.snapshotMs = Math.round(performance.now() - snapshotStart);
    if (snapshot.blocks.length !== blocks.length) {
      throw new Error(`Expected ${blocks.length} open blocks in snapshot, got ${snapshot.blocks.length}`);
    }
  }
  if (closedHistory) {
    const kept = (await db.query("select count(*)::int n from schedule_blocks b join orders o on o.id=b.order_id where o.status='done' and o.code like 'CLOSED-BENCH-%'")).rows[0].n;
    if (kept !== closedHistory) throw new Error(`Expected ${closedHistory} closed blocks, got ${kept}`);
  }
  console.log(JSON.stringify(line));
}
await db.close();

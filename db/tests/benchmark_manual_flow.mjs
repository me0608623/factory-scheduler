// Synthetic-only benchmark for the save_blocks material-flow guard.
// Run here: node benchmark_manual_flow.mjs 100 500 1000
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const sizes = process.argv.slice(2).map(Number);
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
const product = "00000000-0000-4000-8000-0000000000a1";
for (const count of sizes) {
  const orders = (await db.query(`
    insert into orders (code, product_id, qty, due_date)
    select 'BENCH-' || n, $1, 120, date '2026-10-05'
      from generate_series(1, $2) n
    on conflict (code) do update set qty = excluded.qty
    returning id`, [product, count])).rows;
  const blocks = orders.flatMap(({ id }) => [
    { order_id: id, step_seq: 0, date: "2026-10-05", start_min: 480, end_min: 540, qty: 120 },
    { order_id: id, step_seq: 1, date: "2026-10-05", start_min: 540, end_min: 580, qty: 120 },
    { order_id: id, step_seq: 2, date: "2026-10-05", start_min: 580, end_min: 610, qty: 120 },
  ]);
  const start = performance.now();
  await db.query("select _assert_manual_material_flow($1::jsonb)", [JSON.stringify(blocks)]);
  const fullMs = Math.round(performance.now() - start);
  const changedStart = performance.now();
  await db.query("select _assert_manual_material_flow($1::jsonb, array[$2]::uuid[])", [JSON.stringify(blocks), orders[0].id]);
  console.log(JSON.stringify({ orders: count, blocks: blocks.length, fullMs,
    oneChangedOrderMs: Math.round(performance.now() - changedStart) }));
}
await db.close();

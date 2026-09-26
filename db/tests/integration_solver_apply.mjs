// 本機跨層驗收：PGlite 快照 → OR-Tools 預覽 → PGlite apply_plan → 獨立驗證。
// 只用合成種子；不讀取正式環境金鑰、沒有網路請求。
import { PGlite } from "@electric-sql/pglite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const solver = path.resolve(root, "../solver");
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

// 三個產品都在二廠包裝；裁切、沖壓與焊接留在一廠，形成實際跨廠路線。
await db.query("update product_steps set factory=2 where process='包裝'");
await db.query("update machines set factory=2 where id='e'");
await db.query("update employees set factory=2 where code in ('E03','E04')");
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
  const outcomes = [];
  async function planAndApply(event) {
    const snapshot = await readSnapshot();
    const plan = solverCall({ snapshot, event, now, time_limit: 3 });
    const option = plan.options.find(item => item.applicable && item.solver_method !== "keep");
    if (!option) throw new Error(`${event.type}: no applicable OR-Tools option: ${JSON.stringify(plan.options.map(o => ({ id: o.id, status: o.status, diagnostics: o.diagnostics })))}`);
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
    (select count(*)::int from change_sets) as changes`,
  [fault.effects.faults_insert[0].id, "00000000-0000-4000-8000-0000000000e3"])).rows[0];
  if (version !== outcomes.length || counts.blocks < 21 || counts.second_factory < 7 ||
      effects.remaining_faults !== 0 || effects.leaves !== 1 || effects.rush_orders !== 1 || effects.changes !== 5) {
    throw new Error(JSON.stringify({ version, counts, effects, outcomes }));
  }
  console.log(JSON.stringify({ version, second_factory_blocks: counts.second_factory, effects, outcomes }));
} finally {
  await db.close();
}

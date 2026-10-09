// Migration 0036 machine_layout 測試（PGlite 隔離環境）
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite();

// 建立基礎環境
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec("create publication supabase_realtime");

// 跑完所有 migration（含 0036）
for (const f of fs.readdirSync(path.join(root, "migrations")).sort()) {
  await db.exec(fs.readFileSync(path.join(root, "migrations", f), "utf8"));
}

test("0036：machine_layout 表存在且有 RLS", async () => {
  const r = await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='machine_layout'");
  assert.equal(r.rows[0].relrowsecurity, true, "RLS 已啟用");
});

test("0036：machine_layout 有 PK + FK 到 machines", async () => {
  const r = await db.query(`
    SELECT tc.constraint_type, ccu.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'machine_layout'`);
  const types = r.rows.map(x => x.constraint_type);
  assert.ok(types.includes("PRIMARY KEY"), "有 PK");
  assert.ok(types.includes("FOREIGN KEY"), "有 FK");
});

test("0036：schedule_snapshot 包含 machine_layout", async () => {
  // 先建 machine（FK 目標）
  await db.query("insert into processes (name) values ('cut') on conflict do nothing");
  await db.query("insert into machines (id, label, process) values ('zztest', 'Test Machine', 'cut') on conflict (id) do nothing");
  const snap = (await db.query("select schedule_snapshot(current_date, current_date + 1) as s")).rows[0].s;
  assert.ok(Array.isArray(snap.machine_layout), "machine_layout 是陣列");
  await db.query("insert into machine_layout (machine_id, x, y) values ('zztest', 25.5, 75.0)");
  const snap2 = (await db.query("select schedule_snapshot(current_date, current_date + 1) as s")).rows[0].s;
  assert.equal(snap2.machine_layout.length, 1);
  assert.equal(snap2.machine_layout[0].machineId, 'zztest');
  assert.equal(snap2.machine_layout[0].x, 25.5);
  await db.query("delete from machine_layout");
});

test("0036：machine_layout 有稽核觸發器", async () => {
  const r = await db.query("select * from pg_trigger where tgrelid = 'machine_layout'::regclass and tgname = 'audit'");
  assert.ok(r.rows.length >= 1, "audit 觸發器存在");
});

test("0036：座標 CHECK 約束 0-100", async () => {
  await assert.rejects(
    db.query("insert into machine_layout (machine_id, x, y) values ('a', 150, 50)"),
    /check constraint/i
  );
});

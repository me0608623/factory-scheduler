// SupabaseStore 對真的資料庫結構（PGlite ＋ migrations）的測試：登入、讀取、只寫有變的列、衝突、權限
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb, FakeSupabase } from "./fake-supabase.mjs";
import { SupabaseStore } from "../src/store/supabase.js";
import { toSnapshot, fromSnapshot, applyOption } from "../src/convert.js";

const BOSS = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const TV = "33333333-3333-4333-8333-333333333333";
const USERS = { "boss@x": { id: BOSS, password: "pw" }, "lead@x": { id: LEAD, password: "pw" }, "tv@x": { id: TV, password: "pw" } };
const A01 = "00000000-0000-4000-8000-0000000000b1";
const E1 = "00000000-0000-4000-8000-0000000000e1";
const E2 = "00000000-0000-4000-8000-0000000000e2";

async function setup() {
  const db = await makeDb();
  await db.query("insert into auth.users (id, email) values ($1,'boss@x'),($2,'lead@x'),($3,'tv@x')", [BOSS, LEAD, TV]);
  await db.query("update profiles set role='boss' where user_id=$1", [BOSS]);
  await db.query("update profiles set role='lead' where user_id=$1", [LEAD]);
  const store = async (email) => {
    const s = new SupabaseStore(new FakeSupabase(db, USERS));
    assert.equal((await s.init()).needLogin, true);
    await s.login(email, "pw");
    return s;
  };
  const count = async (sql, p = []) => (await db.query(sql, p)).rows[0].n;
  return { db, store, count };
}
const blk = (o) => ({ id: crypto.randomUUID(), oid: A01, step: 0, m: "a", emp: E1, date: "2026-10-05", s: 480, e: 540, qty: 120, pin: false, ...o });

test("登入：密碼錯誤、角色", async () => {
  const { store, db } = await setup();
  const s = new SupabaseStore(new FakeSupabase(db, USERS));
  await s.init();
  await assert.rejects(s.login("boss@x", "wrong"), /帳號或密碼不對/);
  const boss = await store("boss@x");
  assert.equal(boss.role, "boss");
  assert.equal((await store("tv@x")).role, "viewer");
});

test("受邀帳號可設定密碼，忘記密碼信導向指定網址", async () => {
  const { db } = await setup();
  const sb = new FakeSupabase(db, structuredClone(USERS));
  const s = new SupabaseStore(sb);
  await s.requestPasswordReset("lead@x", "https://factory-scheduler-web.onrender.com/");
  assert.deepEqual(sb.resetRequests, [{ email: "lead@x", redirectTo: "https://factory-scheduler-web.onrender.com/" }]);
  await assert.rejects(s.setPassword("a-very-long-password"), /請先登入/);
  await s.login("lead@x", "pw");
  await assert.rejects(s.setPassword("short"), /至少需要 12 個字元/);
  await s.setPassword("a-very-long-password");
  await s.logout();
  await assert.rejects(s.login("lead@x", "pw"), /帳號或密碼不對/);
  await s.login("lead@x", "a-very-long-password");
  assert.equal(s.role, "lead");
});

test("組長匯入舊版歷史排程，不改示範資料與排程版本", async () => {
  const { store, count } = await setup();
  const lead = await store("lead@x"), viewer = await store("tv@x");
  const before = await lead.load();
  const legacy = { dates: ["2024-10-23"], selectedDate: "2024-10-23",
    days: { "2024-10-23": { "1廠": [{ cell: "B788", machine: "焊接", value: "A040*2400" }], "2廠": [], overtime: {} } } };
  const input = { sourceName: "排程1023.xlsx", sourceSha256: "a".repeat(64), legacy };
  const saved = await lead.saveLegacyArchive(input);
  assert.equal(saved.source_name, "排程1023.xlsx");
  assert.equal((await lead.listLegacyArchives()).length, 1);
  assert.deepEqual(await lead.getLegacyArchive(saved.id), legacy);
  assert.equal((await lead.saveLegacyArchive(input)).id, saved.id, "再次上傳同檔不會重複");
  assert.deepEqual(await viewer.listLegacyArchives(), [], "唯讀帳號不能查看歷史原表");
  await assert.rejects(viewer.saveLegacyArchive({ ...input, sourceSha256: "b".repeat(64) }), /儲存歷史排程失敗/);
  assert.equal(await count("select count(*)::int n from legacy_schedule_archives"), 1);
  assert.equal(await count("select version::int n from schedule_state"), before.version);
  assert.equal(await count("select count(*)::int n from schedule_blocks"), before.blocks.length);
  assert.equal((await lead.load()).employees.length, before.employees.length);
});

test("老闆設定 2 廠人員、機台與工序後可存回快照", async () => {
  const { store } = await setup();
  const boss = await store("boss@x");
  const state = await boss.load();
  state.employees[0].factory = 2;
  state.machines[0].factory = 2;
  state.products[0].steps[0].factory = 2;
  await boss.sync(state, { kind: "edit", title: "設定廠別" });
  const loaded = await boss.load();
  assert.equal(loaded.employees[0].factory, 2);
  assert.equal(loaded.machines[0].factory, 2);
  assert.equal(loaded.products[0].steps[0].factory, 2);
});

test("讀取、只寫有變的列、紀錄", async () => {
  const { store, count } = await setup();
  const boss = await store("boss@x");
  const S = await boss.load();
  assert.equal(S.employees.length, 5);
  assert.equal(S.employees[0].maxMachines, 1, "既有員工預設同時顧一台");
  assert.equal(S.orders.length, 6);
  assert.equal(S.blocks.length, 0);

  // 排兩段工作 → save_blocks，版本 +1，留一筆紀錄
  S.blocks.push(blk(), blk({ step: 1, m: "c", emp: E2, s: 540, e: 580 }));
  await boss.sync(S, { kind: "auto", title: "排程", lines: [{ k: "info", t: "測試" }], sum: "排了兩段" });
  assert.equal(await count("select count(*)::int n from schedule_blocks"), 2);
  assert.equal(await count("select version::int n from schedule_state"), 1);
  assert.equal(await count("select count(*)::int n from change_sets where title='排程' and summary='排了兩段'"), 1);

  // 改名字、請假、報故障、開加班：不動排程 → 各表只寫有變的列，紀錄走 log_change
  const before = await count("select count(*)::int n from audit_log");
  S.employees[0].name = "張三豐";
  S.employees[0].maxMachines = 2;
  S.employees[1].leaves.push("2026-10-06");
  S.machines.find((m) => m.id === "c").faults.push({ id: crypto.randomUUID(), date: "2026-10-06", s: 480, e: 600, note: "馬達", fixed: false, orig: [S.blocks[1]] });
  S.dayOT["2026-10-06"] = true;
  await boss.sync(S, { kind: "leave", title: "李四 10/6 請假", lines: [] });
  const after = await count("select count(*)::int n from audit_log");
  assert.equal(after - before, 4, "只有 4 列真的改變（員工、請假、故障、加班日）");
  assert.equal(await count("select count(*)::int n from change_sets where title='李四 10/6 請假'"), 1);
  assert.equal(await count("select version::int n from schedule_state"), 1, "沒動排程，版本不變");

  // 刪除技能
  S.employees[0].skills = S.employees[0].skills.filter((m) => m !== "b");
  await boss.sync(S, null);
  assert.equal(await count("select count(*)::int n from employee_skills where machine_id='b' and employee_id=$1", [E1]), 0);

  // 重新讀回來，資料一致（故障的原本位置也在）
  const S2 = await boss.load();
  assert.equal(S2.employees.find((e) => e.id === E1).name, "張三豐");
  assert.equal(S2.employees.find((e) => e.id === E1).maxMachines, 2);
  assert.equal(await count("select max_concurrent_machines::int n from employees where id=$1", [E1]), 2);
  const f = S2.machines.find((m) => m.id === "c").faults[0];
  assert.equal(f.note, "馬達");
  assert.equal(f.orig.length, 1);
  assert.equal(S2.dayOT["2026-10-06"], true);
  assert.equal(S2.log[0].title, "李四 10/6 請假");
  assert.equal(S2.log[1].sum, "排了兩段");
  assert.deepEqual(toSnapshot(S2).blocks.length, 2);
});

test("兩個人同時改：後存的人收到衝突", async () => {
  const { store } = await setup();
  const boss = await store("boss@x"), lead = await store("lead@x");
  const Sb = await boss.load(), Sl = await lead.load();
  Sb.blocks.push(blk());
  await boss.sync(Sb, { kind: "move", title: "老闆排的" });
  Sl.blocks.push(blk({ m: "b" }));
  await assert.rejects(lead.sync(Sl, { kind: "move", title: "組長排的" }), (e) => e.conflict === true);
  const fresh = await lead.load();
  assert.equal(fresh.blocks[0].m, "a", "重新讀取後看到老闆的版本");
});

test("權限：電視帳號寫不進去、組長不能改基本資料", async () => {
  const { store, count } = await setup();
  const tv = await store("tv@x");
  const S = await tv.load();
  S.orders[0].qty = 999;
  await assert.rejects(tv.sync(S, null), /沒有權限修改「工單」/);
  assert.equal(await count("select qty n from orders where code='A01'"), 120);

  const lead = await store("lead@x");
  const L = await lead.load();
  L.machines[0].label = "亂改";
  await assert.rejects(lead.sync(L, null), (e) => e.permission === true && /沒有權限修改「機台」/.test(e.message));
  assert.equal((await (await store("boss@x")).load()).machines[0].label, "裁切機 1");
});

test("每週加班設定僅老闆可改，單日臨時意願組長可改", async () => {
  const { store, count } = await setup();
  const lead = await store("lead@x");
  const L = await lead.load();
  L.employees.find(e => e.id === E1).otOverrides["2026-10-06"] = false;
  await lead.sync(L, { kind: "ot", title: "張三今天不加班" });
  assert.equal(await count("select count(*)::int n from employee_overtime_days where employee_id=$1 and date='2026-10-06' and not available", [E1]), 1);
  assert.equal((await lead.load()).employees.find(e => e.id === E1).otOverrides["2026-10-06"], false);

  const boss = await store("boss@x");
  const B = await boss.load();
  B.employees.find(e => e.id === E1).otWeekdays = [1, 3, 5];
  await boss.sync(B, { kind: "edit", title: "張三固定加班日" });
  assert.deepEqual((await boss.load()).employees.find(e => e.id === E1).otWeekdays, [1, 3, 5]);

  const Tv = await store("tv@x");
  const T = await Tv.load();
  T.employees.find(e => e.id === E1).otOverrides["2026-10-07"] = true;
  await assert.rejects(Tv.sync(T, null), /沒有權限修改「單日加班意願」/);
});

test("套用排程服務的方案（apply_plan）", async () => {
  const { db, store, count } = await setup();
  const lead = await store("lead@x");
  const S = await lead.load();
  const opt = { id: "A", name: "少動為主", summary: "測試方案", lines: [], blocks: [
    { order_id: A01, step_seq: 0, machine_id: "a", employee_id: E1, date: "2026-10-05", start_min: 480, end_min: 540, qty: 120 }],
    effects: { overtime_on: ["2026-10-05"] } };
  // 預覽就是方案套用後的畫面資料
  const A = applyOption(S, opt);
  assert.equal(A.blocks.length, 1);
  assert.equal(A.dayOT["2026-10-05"], true);
  const pv = (await db.query("insert into plan_previews (kind,title,event,base_version,options) values ('auto','重新排程','{}',0,$1) returning id",
    [JSON.stringify([opt])])).rows[0].id;
  await lead.applyPlan(pv, "A", "備註", { pick: "A", reason: "少動" });
  assert.equal(await count("select count(*)::int n from schedule_blocks"), 1);
  const S2 = await lead.load();
  assert.equal(S2.log[0].title, "重新排程：採用「少動為主」");
  assert.equal(S2.log[0].note, "備註");
  assert.equal(S2.version, 1);
  await assert.rejects(lead.applyPlan(pv, "A"), /已經套用過/);
});

test("格式轉換：畫面 → 快照 → 畫面", () => {
  const S = { cal: { week: [false, true, true, true, true, true, true], over: { "2026-10-01": "off" } }, dayOT: { "2026-10-02": true },
    employees: [{ id: "e", name: "甲", factory: 2, color: 1, skills: ["a"], maxMachines: 2, leaves: ["2026-10-03"], noOT: true,
      otWeekdays: [], otOverrides: {} }],
    machines: [{ id: "a", label: "A", factory: 2, proc: "裁切", products: ["p"], faults: [{ id: "f", date: "2026-10-04", s: 480, e: 600, note: "", fixed: false, orig: [] }] }],
    products: [{ id: "p", name: "P", steps: [{ proc: "裁切", factory: 2, rate: 2, batch: 0 }] }],
    orders: [{ id: "o", code: "O1", pid: "p", qty: 10, due: "2026-10-09", pri: 0 }],
    blocks: [{ id: "b", oid: "o", step: 0, m: "a", emp: "e", date: "2026-10-05", s: 480, e: 490, qty: 10, pin: true }] };
  const back = fromSnapshot({ ...toSnapshot(S), calendar: toSnapshot(S).calendar });
  for (const k of ["employees", "orders", "blocks", "products"]) assert.deepEqual(back[k], S[k], k);
  assert.deepEqual(back.cal, S.cal);
  assert.deepEqual(back.dayOT, S.dayOT);
  assert.equal(back.machines[0].faults[0].s, 480);
  assert.equal(back.machines[0].factory, 2);
});

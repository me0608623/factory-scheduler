import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudSeed,assertTestTarget,seedSql,testId,TEST_URL} from '../../tools/cloud-test-seed.mjs';
import {makeDb} from './fake-supabase.mjs';
test('cloud seed maps UUID identities and valid equipment IDs without losing skills/routes/groups',()=>{
  const s=cloudSeed('2026-10-12'),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/;
  assert.equal(s.employees.length,12);assert.equal(s.machines.length,8);assert.equal(s.orders.length,20);assert.equal(s.groupMembers.length,12);
  for(const list of [s.employees,s.products,s.orders,s.groups,s.rushOrders])for(const x of list)assert.match(x.id,uuid);
  for(const m of s.machines)assert.match(m.id,/^[a-z0-9]{1,8}$/);
  for(const p of s.products)for(const st of p.steps)assert.ok(s.machines.some(m=>m.factory===st.factory&&m.proc===st.proc&&m.products.includes(p.id)),p.name+st.proc);
  assert.equal(s.setupPending,false);assert.equal(s.employees[0].id,testId('t-e01'));
});
test('cloud seed refuses production/arbitrary projects, unplanned seed and invalid dates',()=>{
  for(const url of ['https://kjnnguekhshkhgycmryl.supabase.co','http://localhost',TEST_URL+'.evil.example'])assert.throws(()=>assertTestTarget(url));
  assert.throws(()=>seedSql(cloudSeed('2026-10-12'),TEST_URL),/空表/);assert.throws(()=>cloudSeed('2026-02-30'));
});
test('SQL is additive and transactional, guards existing catalog and cannot reset an existing test run',()=>{
  const s=cloudSeed('2026-10-12');s.blocks=[{id:testId('b1'),oid:s.orders[0].id,step:0,m:s.machines[0].id,emp:s.employees[0].id,date:'2026-10-12',s:480,e:540,qty:120,pin:true}];
  const sql=seedSql(s,TEST_URL);assert.match(sql,/^-- ONLY .*\nbegin;/);assert.match(sql,/commit;/);assert.match(sql,/禁止重置/);
  assert.doesNotMatch(sql,/^\s*(delete from|truncate|drop table)\b/im);assert.match(sql,/insert into schedule_blocks/);
});
test('cloud seed SQL executes against real migrations, preserves demo catalog and refuses re-import',async()=>{
  const db=await makeDb();
  try{
    const before=(await db.query('select count(*)::int as n from employees')).rows[0].n;
    const s=cloudSeed('2026-10-12');s.blocks=[{id:testId('b1'),oid:s.orders[0].id,step:0,m:s.machines[0].id,emp:s.employees[0].id,date:'2026-10-12',s:480,e:540,qty:120,pin:true}];
    await db.exec(seedSql(s,TEST_URL));
    assert.equal((await db.query('select count(*)::int as n from employees')).rows[0].n,before+12);
    assert.equal((await db.query('select setup_pending from schedule_state')).rows[0].setup_pending,false);
    await assert.rejects(db.exec(seedSql(s,TEST_URL)),/禁止重置/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from employees')).rows[0].n,before+12);
  }finally{await db.close();}
});

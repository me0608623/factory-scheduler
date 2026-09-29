import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedEmployees,employeeGroups,groupCatalog } from '../src/groups.js';
import { fromSnapshot,toSnapshot } from '../src/convert.js';
import { makeDb,FakeSupabase } from './fake-supabase.mjs';
import { SupabaseStore } from '../src/store/supabase.js';

test('一人多組、跨部門、待核對與未分組篩選不產生重複員工',()=>{
  const S={employees:[{id:'a'},{id:'b'},{id:'c'}],groups:[{id:'g1',department:'加工'},{id:'g2',department:'包裝'}],groupMembers:[
    {groupId:'g1',employeeId:'a',reviewStatus:'source'},{groupId:'g2',employeeId:'a',reviewStatus:'confirmed'},
    {groupId:'g1',employeeId:'b',reviewStatus:'pending'}]};
  assert.equal(employeeGroups(S,'a').length,2);
  assert.deepEqual(groupedEmployees(S,S.employees,'g1').map(x=>x.id),['a','b']);
  assert.deepEqual(groupedEmployees(S,S.employees,'ungrouped').map(x=>x.id),['c']);
  assert.equal(groupedEmployees(S,S.employees).length,3);
});
test('分組快照往返保留範圍及待核對，不改員工技能',()=>{
  const S=fromSnapshot({employees:[{id:'e',name:'E',skills:[]}],machines:[],staff_groups:[{id:'g',name:'G',department:'D',home_factory:null}],staff_group_members:[{group_id:'g',employee_id:'e',review_status:'pending',source_ref:'fixture!A1'}]});
  const back=fromSnapshot(toSnapshot(S));
  assert.deepEqual(groupCatalog(back),groupCatalog(S));assert.deepEqual(back.employees[0].skills,[]);
});
test('雲端分組儲存一次完成、角色權限、版本衝突及失敗完整撤回',async()=>{
  const db=await makeDb(),boss='11111111-1111-4111-8111-111111111111',lead='22222222-2222-4222-8222-222222222222';
  await db.query("insert into auth.users(id,email) values($1,'boss@x'),($2,'lead@x')",[boss,lead]);
  await db.query("update profiles set role='boss' where user_id=$1",[boss]);
  await db.query("update profiles set role='lead' where user_id=$1",[lead]);
  const users={'boss@x':{id:boss,password:'pw'},'lead@x':{id:lead,password:'pw'}};
  const store=async email=>{const s=new SupabaseStore(new FakeSupabase(db,users));await s.login(email,'pw');return s;};
  const first=await store('boss@x'),other=await store('boss@x'),unauthorized=await store('lead@x');
  const S=await first.load(),stale=await other.load(),L=await unauthorized.load();
  const g='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  S.groups.push({id:g,name:'跨部門支援',department:'支援',homeFactory:null,sourceRef:null});
  S.groupMembers.push({groupId:g,employeeId:S.employees[0].id,reviewStatus:'confirmed',sourceRef:null});
  const skills=JSON.stringify(S.employees.map(e=>e.skills));await first.sync(S,{kind:'edit',title:'分組測試'});
  assert.equal(S.version,1);assert.equal((await first.load()).groupMembers.length,1);
  assert.equal(JSON.stringify((await first.load()).employees.map(e=>e.skills)),skills);
  stale.groups.push({id:crypto.randomUUID(),name:'過期組'});await assert.rejects(other.sync(stale),e=>e.conflict);
  const denied=await unauthorized.load();denied.groups[0].name='不允許';await assert.rejects(unauthorized.sync(denied),/只有老闆/);
  const invalid=await first.load();invalid.groups[0].name='不得留下';invalid.groupMembers.push({groupId:g,employeeId:crypto.randomUUID(),reviewStatus:'confirmed'});
  await assert.rejects(first.sync(invalid),/組員不存在/);assert.equal((await first.load()).groups[0].name,'跨部門支援');assert.equal(first.version,1);
  const retired=await first.load();retired.groups=[];retired.groupMembers=[];await first.sync(retired,{kind:'edit',title:'停用'});
  assert.equal((await first.load()).groups.length,0);
  assert.equal((await db.query('select active from staff_groups where id=$1',[g])).rows[0].active,false);
  assert.equal((await db.query("select count(*)::int n from audit_log where table_name='staff_group_members'")).rows[0].n>0,true);
  await db.close();
});

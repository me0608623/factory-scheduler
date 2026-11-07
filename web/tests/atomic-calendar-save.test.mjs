import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';
import {blockToDb} from '../src/convert.js';
import {workingDate} from './working-date.mjs';
const boss='11111111-1111-4111-8111-111111111111',viewer='22222222-2222-4222-8222-222222222222';
const users={'boss@x':{id:boss,password:'pw'},'viewer@x':{id:viewer,password:'pw'}};
class TransactionFake extends FakeSupabase {
  async _run(sql,params=[]){
    await this.db.exec(`savepoint request;set role authenticated;select set_config('request.jwt.claim.sub','${this.uid||''}',false)`);
    try{const r=await this.db.query(sql,params);return {data:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString():v]))),error:null};}
    catch(e){await this.db.exec('rollback to savepoint request');return {data:null,error:{message:e.message,code:e.code}};}
    finally{await this.db.exec('reset role;release savepoint request');}
  }
}
test('calendar and schedule transaction with migrated PGlite',async t=>{
 const db=await makeDb();try{
  await db.query("insert into auth.users(id,email) values($1,'boss@x'),($2,'viewer@x')",[boss,viewer]);
  await db.query("update profiles set role='boss' where user_id=$1",[boss]);
  const initial=new SupabaseStore(new FakeSupabase(db,users));await initial.login('boss@x','pw');
  const S=await initial.load(),date=await workingDate(db),nextDate=await workingDate(db,date),emp=S.employees[0].id;
  S.cal.over[date]='work';S.blocks=[{id:crypto.randomUUID(),oid:'00000000-0000-4000-8000-0000000000b1',step:0,m:'a',emp,date,s:480,e:540,qty:120,pin:false}];
  await initial.sync(S);
  const digest=async()=>JSON.stringify((await db.query(`select jsonb_build_object('days',(select jsonb_agg(c order by date) from calendar_days c),'weekly',(select jsonb_agg(c order by weekday) from calendar_weekly c),'ot',(select jsonb_agg(c order by employee_id,date) from employee_overtime_days c),'blocks',(select jsonb_agg(b order by id) from schedule_blocks b),'state',(select to_jsonb(s) from schedule_state s),'audit',(select count(*) from audit_log),'changes',(select count(*) from change_sets)) x`)).rows[0].x);
  const run=async(name,fn)=>t.test(name,async()=>{await db.exec('begin');try{
    const sb=new TransactionFake(db,users),store=new SupabaseStore(sb);await store.login('boss@x','pw');const base=await store.load(),next=structuredClone(base);
    next.cal.over[date]='off';next.blocks[0].date=nextDate;
    await fn({sb,store,base,next,before:await digest()});
  }finally{await db.exec('rollback');}});
  await run('success closes day and moves exact candidate once',async({store,base,next})=>{
    const expected=JSON.stringify(next.blocks);await store.sync(next);assert.equal(store.version,base.version+1);
    const actual=await store.load();assert.equal(actual.cal.over[date],'off');assert.equal(JSON.stringify(actual.blocks),expected);
  });
  await run('stale version rolls back calendar, schedule, audit and version',async({store,next,before})=>{
    store.version--;await assert.rejects(store.sync(next),e=>e.conflict);assert.equal(await digest(),before);
  });
  await run('competing real schedule RPC wins without leaving calendar closed',async({sb,store,base,next})=>{
    const competitor=new SupabaseStore(sb);competitor.session=store.session;competitor.acceptLoaded(structuredClone(base));
    const b=structuredClone(base);b.blocks[0].pin=true;await competitor.sync(b);
    const expected=await digest();await assert.rejects(store.sync(next),e=>e.conflict);assert.equal(await digest(),expected);
    assert.equal((await store.load()).cal.over[date],'work');
  });
  await run('late SQL validation rolls back calendar writes',async({store,next,before})=>{
    next.blocks[0].date=date;next.blocks[0].pin=true;
    await assert.rejects(store.sync(next),/停工/);assert.equal(await digest(),before);
  });
  await run('calendar deletions are applied before schedule validation',async({store,next})=>{
    next.cal.week[new Date(date+'T00:00Z').getUTCDay()]=false;delete next.cal.over[date];
    await store.sync(next);assert.equal((await db.query('select count(*) n from calendar_days where date=$1',[date])).rows[0].n,0);
    assert.equal((await store.load()).blocks[0].date,nextDate);
  });
  await run('employee overtime upsert shares transaction and rollback',async({store,next,before})=>{
    next.employees[0].otOverrides[date]=false;next.blocks[0].date=date;next.blocks[0].pin=true;
    await assert.rejects(store.sync(next));assert.equal(await digest(),before);
  });
  await run('employee overtime removal shares transaction',async({store,base,next})=>{
    await db.query('insert into employee_overtime_days(employee_id,date,available) values($1,$2,false)',[emp,date]);
    base=await store.load();next=structuredClone(base);delete next.employees[0].otOverrides[date];next.blocks[0].date=nextDate;
    await store.sync(next);assert.equal((await db.query('select count(*) n from employee_overtime_days where employee_id=$1 and date=$2',[emp,date])).rows[0].n,0);
  });
  for(const [name,permissions,ok] of [
    ['neither',{},false],['calendar only',{'calendar.manage':true},false],['schedule only',{'schedule.manage':true},false],
    ['both existing rights',{'calendar.manage':true,'schedule.manage':true},true],['master plus schedule',{'master.manage':true,'schedule.manage':true},false],
  ])await run(name,async({store,next})=>{
    for(const [key,value] of Object.entries(permissions))await db.query('insert into account_permissions(user_id,permission,allowed,granted_by) values($1,$2,$3,$4)',[viewer,key,value,boss]);
    const before=await digest();await store.login('viewer@x','pw');
    if(ok)await store.sync(next);else{await assert.rejects(store.sync(next));assert.equal(await digest(),before);}
  });
  await run('calendar-only delegate remains on original route',async({sb,store,base})=>{
    await db.query("insert into account_permissions(user_id,permission,allowed,granted_by) values($1,'calendar.manage',true,$2)",[viewer,boss]);
    await store.login('viewer@x','pw');const next=structuredClone(base);next.cal.over[nextDate]='off';
    const rpc=sb.rpc.bind(sb);sb.rpc=(name,args)=>{assert.notEqual(name,'save_calendar_and_blocks');return rpc(name,args);};
    await store.sync(next);assert.equal((await store.load()).cal.over[nextDate],'off');
  });
  for(const [name,mutate] of [
    ['extra root key',p=>p.orders=[]],['wrong list',p=>p.days={}],['extra row key',p=>p.days[0].note='unsupported'],
    ['missing row key',p=>delete p.days[0].overtime],['null delete key',p=>p.delete_days=[{date:null}]],
    ['duplicate day',p=>p.days.push({...p.days[0]})],['duplicate delete',p=>p.delete_days=[{date:nextDate},{date:nextDate}]],
    ['upsert and delete',p=>p.delete_days=[{date}]],['bad weekday',p=>p.weekly=[{weekday:8,is_open:false}]],
    ['employee FK after calendar DML',p=>p.employee_days=[{employee_id:'99999999-9999-4999-8999-999999999999',date,available:false}]],
  ])await run('direct malformed RPC rolls back: '+name,async({sb,store,next,before})=>{
    const p={weekly:[],days:[{date,is_open:false,overtime:false,overtime_end:null}],delete_days:[],employee_days:[],delete_employee_days:[]};mutate(p);
    const result=await sb.rpc('save_calendar_and_blocks',{p_base_version:store.version,p_calendar:p,p_blocks:next.blocks.map(blockToDb),p_title:'Synthetic'});
    assert.ok(result.error);assert.equal(await digest(),before);
  });
  await run('no newly exposed state write or lock rights',async({sb})=>{
    assert.deepEqual((await sb._run('select version from schedule_state for update')).data,[]);
    assert.equal((await db.query("select prosecdef from pg_proc where proname='save_calendar_and_blocks'")).rows[0].prosecdef,false);
  });
 }finally{await db.close();}
});

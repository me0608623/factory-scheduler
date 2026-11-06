import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';
import {rowsOf} from '../src/store/diff.js';
import {blockToDb} from '../src/convert.js';
const boss='11111111-1111-4111-8111-111111111111',lead='22222222-2222-4222-8222-222222222222',viewer='33333333-3333-4333-8333-333333333333';
const oid='00000000-0000-4000-8000-0000000000b1',emp='00000000-0000-4000-8000-0000000000e1';
const done=crypto.randomUUID(),pending=crypto.randomUUID();
const users={'boss@x':{id:boss,password:'pw'},'lead@x':{id:lead,password:'pw'},'viewer@x':{id:viewer,password:'pw'}};
// Each fake HTTP request is its own transaction boundary inside the fixture's
// outer rollback scope, including PostgreSQL's failed-statement rollback.
class TransactionFake extends FakeSupabase {
  async _run(sql,params=[]){
    await this.db.exec(`savepoint request;set role authenticated;select set_config('request.jwt.claim.sub','${this.uid||''}',false)`);
    try{const r=await this.db.query(sql,params);return {data:r.rows,error:null};}
    catch(e){await this.db.exec('rollback to savepoint request');return {data:null,error:{message:e.message,code:e.code}};}
    finally{await this.db.exec('reset role;release savepoint request');}
  }
}
test('atomic order and schedule persistence against real migrations',async t=>{
  const db=await makeDb();
  try{
    await db.query("insert into auth.users(id,email) values($1,'boss@x'),($2,'lead@x'),($3,'viewer@x')",[boss,lead,viewer]);
    await db.query("update profiles set role='boss' where user_id=$1",[boss]);
    await db.query("update profiles set role='lead' where user_id=$1",[lead]);
    await db.query('update orders set qty=100 where id=$1',[oid]);
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty,pinned) values($1,$2,0,'a',$3,'2025-01-02',480,580,100,true),($4,$2,0,'a',$3,'2025-01-03',480,500,20,false)",[done,oid,emp,pending]);
    const initial=new SupabaseStore(new FakeSupabase(db,users));await initial.login('boss@x','pw');await initial.load();
    await initial.reportExecution({id:crypto.randomUUID(),blockId:done,action:'start',qtyDone:0,expectedRevision:0});
    await initial.reportExecution({id:crypto.randomUUID(),blockId:done,action:'finish',qtyDone:80,expectedRevision:1});
    const digest=async()=>JSON.stringify((await db.query(`select jsonb_build_object('orders',(select jsonb_agg(o order by id) from orders o),'blocks',(select jsonb_agg(b order by id) from schedule_blocks b),'state',(select to_jsonb(s) from schedule_state s),'audit',(select count(*) from audit_log),'changes',(select count(*) from change_sets),'execution',(select jsonb_agg(w) from work_execution w)) x`)).rows[0].x);
    const run=async(name,fn)=>t.test(name,async()=>{
      await db.exec('begin');
      try{const sb=new TransactionFake(db,users),store=new SupabaseStore(sb);await store.login('boss@x','pw');
        const base=await store.load(),next=structuredClone(base);next.orders.find(o=>o.id===oid).qty=80;next.blocks=next.blocks.filter(b=>b.id!==pending);
        await fn({sb,store,base,next,before:await digest(),digest});
      }finally{await db.exec('rollback');}
    });
    await run('success preserves nominal historical quantity and commits once',async({store,base,next})=>{
      await store.sync(next);assert.equal(store.version,base.version+1);assert.equal(next.version,store.version);
      const loaded=await store.load();assert.equal(loaded.orders.find(o=>o.id===oid).qty,80);assert.equal(loaded.blocks.length,1);assert.equal(loaded.blocks[0].qty,100);assert.equal(loaded.execution[0].qtyDone,80);
      const audit=(await db.query("select table_name,change_set_id from audit_log where (table_name='orders' and row_id=$1 and op='UPDATE') or (table_name='schedule_blocks' and row_id=$2 and op='DELETE') order by id desc limit 2",[oid,pending])).rows;
      assert.equal(audit.find(a=>a.table_name==='orders').change_set_id,null);
      assert.ok(audit.find(a=>a.table_name==='schedule_blocks').change_set_id);
    });
    await run('later database rejection rolls back orders, blocks, execution, version and audit',async({store,next,before,digest})=>{
      await db.exec("create function qa_reject() returns trigger language plpgsql as $$begin raise exception 'Synthetic reject';end$$;create trigger qa_reject before delete on schedule_blocks for each row execute function qa_reject()");
      await assert.rejects(store.sync(next),/Synthetic reject/);assert.equal(await digest(),before);
    });
    await run('lost committed receipt blocks later sync even after load; fresh store reconciles',async({sb,store,next})=>{
      const original=sb.rpc.bind(sb);let writes=0;
      sb.rpc=(name,args)=>{const request=original(name,args);if(name!=='save_orders_and_blocks')return request;
        return {setHeader(...args){request.setHeader(...args);return this;},then(resolve,reject){writes++;return Promise.resolve(request).then(result=>result.error?result:{data:null,error:null}).then(resolve,reject);}};};
      await assert.rejects(store.sync(next),e=>e.unconfirmed);assert.equal(writes,1);
      const actual=await store.load();assert.equal(actual.orders.find(o=>o.id===oid).qty,80);
      await assert.rejects(store.sync(actual),e=>e.unconfirmed);assert.equal(writes,1);
      const fresh=new SupabaseStore(new TransactionFake(db,users));await fresh.login('boss@x','pw');
      const recovered=await fresh.load();assert.equal(fresh.hasPendingConfirmations(),false);
      recovered.orders.find(o=>o.id===oid).note='After authoritative reload';await fresh.sync(recovered);
      assert.equal((await fresh.load()).orders.find(o=>o.id===oid).note,'After authoritative reload');
    });
    await run('stale version rolls back order writes',async({store,next,before,digest})=>{
      store.version--;await assert.rejects(store.sync(next),e=>e.conflict);assert.equal(await digest(),before);
    });
    await run('invalid order constraint rolls back',async({store,next,before,digest})=>{
      next.orders.find(o=>o.id===oid).qty=-1;await assert.rejects(store.sync(next));assert.equal(await digest(),before);
    });
    await run('effective completed quantity cannot exceed the reduced order',async({store,next,before,digest})=>{
      next.orders.find(o=>o.id===oid).qty=70;await assert.rejects(store.sync(next),/超過工單件數/);assert.equal(await digest(),before);
    });
    await run('another order block change cannot bypass order quantity cap',async({store,base,next,before,digest})=>{
      next.blocks=structuredClone(base.blocks);next.orders.find(o=>o.id===oid).qty=80;
      const other=next.orders.find(o=>o.id!==oid);next.blocks.push({...next.blocks.find(b=>b.id===pending),id:crypto.randomUUID(),oid:other.id});
      await assert.rejects(store.sync(next),/超過工單件數/);assert.equal(await digest(),before);
    });
    for(const [name,role,permissions,allowed] of [
      ['lead',lead,{},true],['viewer',viewer,{},false],['orders delegate',viewer,{'orders.manage':true},false],
      ['schedule delegate',viewer,{'schedule.manage':true},false],['both delegated',viewer,{'orders.manage':true,'schedule.manage':true},true],
      ['revoked lead orders',lead,{'orders.manage':false},false],['revoked lead schedule',lead,{'schedule.manage':false},false],
    ])await run(name,async({store,next,before,digest})=>{
      for(const [key,value] of Object.entries(permissions))await db.query('insert into account_permissions(user_id,permission,allowed,granted_by) values($1,$2,$3,$4)',[role,key,value,boss]);
      const expected=await digest();await store.login(role===lead?'lead@x':'viewer@x','pw');
      if(allowed)await store.sync(next);else{await assert.rejects(store.sync(next));assert.equal(await digest(),expected);}
    });
    await run('authenticated account without profile is denied',async({sb,store,next,before,digest})=>{
      sb.uid=crypto.randomUUID();await assert.rejects(store.sync(next),/權限/);assert.equal(await digest(),before);
    });
    await run('anonymous invocation denied',async({next,base,before,digest})=>{
      await db.exec("savepoint anonymous_request;set role anon;select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(db.query('select save_orders_and_blocks($1,$2::jsonb,$3::jsonb,$4)',[base.version,JSON.stringify([...rowsOf(next).orders.values()]),JSON.stringify(next.blocks.map(blockToDb)),'Synthetic']),/permission denied/);
      await db.exec('rollback to savepoint anonymous_request;reset role');assert.equal(await digest(),before);
    });
    for(const extra of [{status:'closed'},{qty:80,unexpected:true}])await run('rejects non-whitelisted fields '+JSON.stringify(extra),async({sb,next,base,before,digest})=>{
      const order={...rowsOf(next).orders.get(oid),...extra};const result=await sb.rpc('save_orders_and_blocks',{p_base_version:base.version,p_orders:[order],p_blocks:next.blocks.map(blockToDb),p_title:'Synthetic'});assert.ok(result.error);assert.equal(await digest(),before);
    });
  }finally{await db.close();}
});

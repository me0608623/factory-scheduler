import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const block='abcdefab-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fail=()=>new Response(JSON.stringify({code:'SYNTHETIC_GATEWAY',message:'synthetic'}),{status:503,headers:{'Content-Type':'application/json'}});
const ack=args=>new Response(JSON.stringify({blockId:args.p_block,confirmed:args.p_confirmed,version:3}),{headers:{'Content-Type':'application/json'}});
function fixture(respond=()=>fail()){
  const calls=[];const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
    const args=JSON.parse(options.body);calls.push(args);return respond(args,calls.length);
  }}});
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic'};return {store,calls};
}
test('unknown confirmation blocks both repeat and opposite flags across casing, but not another block',async()=>{
  const f=fixture((args,n)=>n===1?fail():ack(args));await assert.rejects(f.store.confirmExecution(block,true),e=>e.unconfirmed);
  for(const flag of [true,false])await assert.rejects(f.store.confirmExecution(block.toUpperCase(),flag),e=>e.unconfirmed);
  assert.equal(f.calls.length,1);assert.equal(f.store.hasPendingConfirmation(block),true);
  await f.store.confirmExecution(other,true);assert.equal(f.calls.length,2);assert.equal(f.store.hasPendingConfirmation(other),false);
});
test('in-flight SDK confirmation cannot dispatch a duplicate; a valid ACK unlocks later changes',async()=>{
  let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  const f=fixture(async(args,n)=>{if(n===1){started();await gate;}return n===1?ack(args):fail();});
  const first=f.store.confirmExecution(block,true);await ready;
  await assert.rejects(f.store.confirmExecution(block,false),e=>e.unconfirmed);assert.equal(f.calls.length,1);
  release();await first;assert.equal(f.store.hasPendingConfirmation(block),false);
  await assert.rejects(f.store.confirmExecution(block,false),e=>e.unconfirmed);assert.equal(f.calls.length,2);
});
test('known SQL rejection unlocks the same block; missing or malformed ACK does not',async()=>{
  for(const mode of ['reject','missing','wrongFlag']){
    const f=fixture((args,n)=>n>1?ack(args):mode==='reject'?new Response(JSON.stringify({code:'42501',message:'synthetic denied'}),{status:403}):
      new Response(JSON.stringify(mode==='missing'?null:{blockId:block,confirmed:false,version:3})));
    await assert.rejects(f.store.confirmExecution(block,true),e=>mode==='reject'?e.rejected:e.unconfirmed);
    assert.equal(f.store.hasPendingConfirmation(block),mode!=='reject');
    if(mode==='reject')await f.store.confirmExecution(block,true);
    else await assert.rejects(f.store.confirmExecution(block,true),e=>e.unconfirmed);
    assert.equal(f.calls.length,mode==='reject'?2:1);
  }
});
test('confirmation ledger is local to its store, account, client and login epoch',async()=>{
  for(const change of ['user','client','epoch']){
    const f=fixture();await assert.rejects(f.store.confirmExecution(block,true));
    if(change==='user')f.store.session={user:{id:'B'},access_token:'synthetic-B'};
    if(change==='client')f.store.sb=fixture().store.sb;
    if(change==='epoch')f.store.authEpoch++;
    assert.equal(f.store.hasPendingConfirmation(block),false,change);
    await assert.rejects(f.store.confirmExecution(block,false),e=>e.unconfirmed);
    assert.equal(f.store.hasPendingConfirmation(block),true,change);
  }
  const first=fixture(),second=fixture();await assert.rejects(first.store.confirmExecution(block,true));assert.equal(second.store.hasPendingConfirmation(block),false);
});
test('late old-account ACK cannot erase a new account unresolved confirmation',async()=>{
  let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  const f=fixture(async(args,n)=>{if(n===1){started();await gate;return ack(args);}return fail();});
  const first=f.store.confirmExecution(block,true);await ready;
  f.store.session={user:{id:'B'},access_token:'synthetic-B'};
  await assert.rejects(f.store.confirmExecution(block,false),e=>e.unconfirmed);
  release();await assert.rejects(first,/登入狀態/);assert.equal(f.store.hasPendingConfirmation(block),true);
  await assert.rejects(f.store.confirmExecution(block,true),e=>e.unconfirmed);assert.equal(f.calls.length,2);
});
test('actual workbench suppresses pending confirmation controls after reopening or accepting a fresh snapshot',async()=>{
  const f=fixture();await assert.rejects(f.store.confirmExecution(block,true));
  const ctx={S:{blocks:[{id:block,date:'2000-01-01',m:'M',emp:'E',oid:'O',s:480,e:540,qty:60}],execution:[{blockId:block,status:'done',qtyDone:40,confirmed:false}]},UI:{date:'2000-01-01',factory:1},STORE:f.store,MODALS:{},
    reportingRole:()=> 'boss',inFactory:()=>true,mach:()=>({label:'synthetic machine'}),emp:()=>({name:'synthetic employee'}),order:()=>({code:'synthetic order'}),stepName:()=> 'synthetic step',
    hm:x=>x,mdw:x=>x,esc:x=>String(x??''),tx:x=>x,executionOf:(s,id)=>s.execution.find(r=>r.blockId===id),reportStatus:()=> 'done',canReport:()=>true,canPermission:()=>true};
  vm.createContext(ctx);const at=source.indexOf('MODALS.execution=');vm.runInContext(source.slice(at,source.indexOf("MODALS['execution-report']",at)),ctx);
  for(const flag of [false,true]){ctx.S.execution[0].confirmed=flag;const html=ctx.MODALS.execution({}).body;
    assert.doesNotMatch(html,/data-act="exec-(?:un)?confirm"/);assert.match(html,/待核對/);assert.match(html,/role="alert"/);}
  const changed={...f.store.session,user:{id:'B'}};f.store.session=changed;
  assert.match(ctx.MODALS.execution({}).body,/data-act="exec-unconfirm"/);
});
test('actual beforeunload warns about unresolved confirmation even with no modal or in-flight UI write',async()=>{
  const f=fixture();await assert.rejects(f.store.confirmExecution(block,true));let unload;
  const ctx={STORE:f.store,syncPending:0,SYNC:{state:'ok'},UI:{},executionRetries:{has:()=>false},addEventListener:(_,fn)=>unload=fn};
  vm.createContext(ctx);const at=source.indexOf('addEventListener("beforeunload"');vm.runInContext(source.slice(at,source.indexOf('\n',at)),ctx);
  let warned=false;unload({preventDefault:()=>warned=true});assert.equal(warned,true);
  f.store.authEpoch++;warned=false;unload({preventDefault:()=>warned=true});assert.equal(warned,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SupabaseStore} from '../src/store/supabase.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('async function pvApply(){'),source.indexOf('\nObject.assign(MODAL_ACT,{',source.indexOf('async function pvApply(){')));
const receipt='11111111-1111-4111-8111-111111111111';
function harness(){
  let resolve,reject;const log=[];
  const store={session:{user:{id:'lead'}},authEpoch:0,version:4,applyPlan:()=>{log.push('rpc');return new Promise((a,b)=>{resolve=a;reject=b;});}};
  const option={id:'A',A:{blocks:[]},applicable:true};
  const ctx={STORE:store,PV:{previewId:'preview',cur:'A',opts:[option]},S:{blocks:[]},UI:{},
    pvOpt:()=>ctx.PV?.opts[0],$:()=>null,assertExecutionProtected:()=>{},
    tx:x=>x,toast:x=>log.push(x),render:()=>log.push('render'),pushUndo:()=>log.push('undo'),
    reloadFromStore:async()=>{log.push('reload');return 'applied';},showResult:()=>log.push('success'),lastLocalWrite:0,pendingReload:false};
  vm.createContext(ctx);vm.runInContext(implementation,ctx);
  return {ctx,log,finish:()=>resolve(receipt),fail:e=>reject(e)};
}

test('cloud automatic apply coalesces rapid confirmations while RPC is pending',async()=>{
  const h=harness(),first=h.ctx.pvApply();
  const second=h.ctx.pvApply();
  assert.equal(h.log.filter(x=>x==='rpc').length,1);
  h.finish();await Promise.all([first,second]);
  assert.equal(h.log.filter(x=>x==='undo').length,1);
  assert.equal(h.log.filter(x=>x==='success').length,1);
});
test('late apply reply cannot clear another preview or show success after owner changes',async()=>{
  for(const change of ['preview','store','user','epoch','state','mutation','version']){
    const h=harness(),task=h.ctx.pvApply();
    if(change==='preview')h.ctx.PV={replacement:true};
    if(change==='store')h.ctx.STORE={...h.ctx.STORE};
    if(change==='user')h.ctx.STORE.session={user:{id:'other'}};
    if(change==='epoch')h.ctx.STORE.authEpoch++;
    if(change==='state')h.ctx.S={blocks:[]};
    if(change==='mutation')h.ctx.S.blocks.push({id:'draft'});
    if(change==='version')h.ctx.STORE.version++;
    const current=h.ctx.PV;h.finish();await task;
    assert.equal(h.ctx.PV,current,change);
    assert.ok(!h.log.includes('undo')&&!h.log.includes('reload')&&!h.log.includes('success'),change);
  }
});
test('acknowledged apply with failed refresh does not display result success',async()=>{
  const h=harness();h.ctx.reloadFromStore=async()=> 'failed';
  const task=h.ctx.pvApply();h.finish();await task;
  assert.ok(!h.log.includes('success'));
});
test('RPC failure keeps current preview and unlocks confirmation without undo',async()=>{
  const h=harness(),p=h.ctx.PV,task=h.ctx.pvApply();
  h.fail(new Error('offline'));await task;
  assert.equal(h.ctx.PV,p);assert.equal(!!p.applying,false);
  assert.ok(h.log.includes('offline')&&!h.log.includes('undo')&&!h.log.includes('success'));
});
test('applyPlan requires UUID receipt; null or malformed HTTP success is unconfirmed',async()=>{
  for(const data of [null,undefined,{},'',4,'not-a-uuid']){
    const s=new SupabaseStore({rpc:async()=>({data,error:null})});s.session={user:{id:'lead'}};
    await assert.rejects(s.applyPlan('preview','A'),e=>e.unconfirmed===true);
  }
});
test('applyPlan validates the same client and auth lifetime before accepting receipt',async()=>{
  for(const change of ['user','epoch','client']){
    let reply;const client={rpc:()=>new Promise(resolve=>reply=resolve)};
    const s=new SupabaseStore(client);s.session={user:{id:'lead'}};
    const task=s.applyPlan('preview','A');
    if(change==='user')s.session={user:{id:'other'}};
    if(change==='epoch')s.authEpoch++;
    if(change==='client')s.sb={};
    reply({data:receipt,error:null});await assert.rejects(task,e=>e.unconfirmed===true);
  }
});
test('valid apply receipt preserves baseline until an actual snapshot refresh',async()=>{
  const s=new SupabaseStore({rpc:async()=>({data:receipt,error:null})});s.session={user:{id:'lead'}};s.version=4;
  await s.applyPlan('preview','A');assert.equal(s.version,4);assert.equal(s.base,null);
});
test('current apply cannot be canceled or switched through retained event handlers',async()=>{
  const h=harness();h.ctx.MODAL_ACT={};
  const pick=source.slice(source.indexOf('  "pv-pick":'),source.indexOf('  "pv-mode":'));
  const cancel=source.slice(source.indexOf('  "pv-cancel":'),source.indexOf('\n  // -----',source.indexOf('  "pv-cancel":')));
  vm.runInContext('Object.assign(MODAL_ACT,{'+pick+cancel+'});',h.ctx);
  const p=h.ctx.PV,task=h.ctx.pvApply();
  h.ctx.MODAL_ACT['pv-pick']({dataset:{v:'B'}});h.ctx.MODAL_ACT['pv-cancel']();
  assert.equal(h.ctx.PV,p);assert.equal(p.cur,'A');
  assert.ok(!h.log.includes('已取消，排程沒有改變'));
  h.finish();await task;
});
test('auth changes during snapshot refresh cannot show previous account success',async()=>{
  const h=harness();h.ctx.reloadFromStore=async()=>{h.ctx.STORE.authEpoch++;return 'applied';};
  const task=h.ctx.pvApply();h.finish();await task;
  assert.ok(!h.log.includes('success'));
});
test('unconfirmed reply exits preview and reconciles without success or undo',async()=>{
  const h=harness(),task=h.ctx.pvApply();
  h.fail(Object.assign(new Error('unconfirmed'),{unconfirmed:true}));await task;
  assert.equal(h.ctx.PV,null);assert.ok(h.log.includes('reload'));
  assert.ok(!h.log.includes('undo')&&!h.log.includes('success'));
});
test('signed-out caller never invokes apply RPC',async()=>{
  let calls=0;const s=new SupabaseStore({rpc:async()=>{calls++;return {data:receipt};}});
  await assert.rejects(s.applyPlan('preview','A'),e=>e.unconfirmed===true);assert.equal(calls,0);
});
test('saved read-only scenario never sends an apply request',async()=>{
  const h=harness();h.ctx.PV.savedScenario=true;await h.ctx.pvApply();assert.ok(!h.log.includes('rpc'));
});

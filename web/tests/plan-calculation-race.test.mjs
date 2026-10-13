import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function functionText(name){
  const start=source.indexOf('function '+name+'(');
  return source.slice(start,source.indexOf('\n}',start)+2);
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(local=false){
  const request=deferred(),calls=[],previews=[],timers=[],messages=[];
  const store={kind:'supabase',version:4,authEpoch:1,session:{user:{id:'test-user'}},can:()=>true,jwt:()=> 'synthetic-token'};
  const ctx={S:{setupPending:false,blocks:[],orders:[],machines:[]},UI:{modal:{t:'auto'}},PV:null,STORE:store,
    SOLVER:{up:!local,capabilities:[],plansDb:()=>{calls.push('request');return request.promise;}},
    assignments:()=>[],planTimeLimit:()=>3,todayStr:()=> '2026-10-15',nowMin:()=>480,
    toast:x=>messages.push(x),tx:x=>x,renderModal:()=>{},maybeReload:()=>{},$:()=>null,
    modalReturnFocus:null,HTMLElement:class {},document:{activeElement:null,body:{}},requestAnimationFrame:()=>{},
    setTimeout:fn=>timers.push(fn),applyOption:B=>structuredClone(B),measure:()=>({}),HOLI:{},
    enterPreview:P=>previews.push(P),buildPlans:()=>{calls.push('build');const base=JSON.stringify(ctx.S);return {base,ev:{date:'2026-10-15'},opts:[{state:base}]};}};
  vm.createContext(ctx);
  const start=source.includes('let planCalculationJob=')?source.indexOf('let planCalculationJob='):source.indexOf('function openPlans(');
  vm.runInContext(source.slice(start,source.indexOf('\nfunction enterPreview(',start)),ctx);
  vm.runInContext(functionText('openModal')+'\n'+functionText('closeModal'),ctx);
  const run=()=>ctx.openPlans('Test','Test','auto',()=>({}),[],{event:{type:'auto'}});
  const reply=()=>request.resolve({date:'2026-10-15',options:[{id:'A',name:'Test',effects:{}}]});
  return {ctx,calls,previews,timers,messages,request,run,reply};
}

test('rapid repeated calculation dispatches one solver request',async()=>{
  const h=harness(),a=h.run(),b=h.run(),c=h.run();
  h.reply();await Promise.all([a,b,c]);assert.equal(h.calls.length,1);assert.equal(h.previews.length,1);
});
test('close during solver request discards its successful late reply',async()=>{
  const h=harness(),before=JSON.stringify(h.ctx.S),p=h.run();h.ctx.closeModal();h.reply();await p;
  assert.equal(h.previews.length,0);assert.equal(JSON.stringify(h.ctx.S),before);
});
test('cancelled solver failure cannot schedule a browser fallback',async()=>{
  const h=harness(),p=h.run();h.ctx.closeModal();h.request.reject(new Error('offline'));await p;
  assert.equal(h.timers.length,0);assert.equal(h.previews.length,0);
});
test('replacing a calculating modal preserves the new modal and discards old results',async()=>{
  const h=harness(),p=h.run(),next={t:'settings'};h.ctx.openModal(next);h.reply();await p;
  assert.equal(h.ctx.UI.modal,next);assert.equal(h.previews.length,0);
});
test('changed schedule cannot be silently rebased under an old solver response',async()=>{
  const h=harness(),p=h.run();h.ctx.S.blocks.push({id:'new-block'});h.reply();await p;
  assert.equal(h.previews.length,0);assert.equal(h.ctx.S.blocks.length,1);
});
test('changed user, login lifetime, store or version rejects the late proposal',async()=>{
  for(const change of [h=>h.ctx.STORE.session={user:{id:'other'}},h=>h.ctx.STORE.authEpoch++,h=>h.ctx.STORE={...h.ctx.STORE},h=>h.ctx.STORE.version++]){
    const h=harness(),p=h.run();change(h);h.reply();await p;assert.equal(h.previews.length,0);
  }
});
test('local fallback timer also respects cancellation',async()=>{
  const h=harness(true),p=h.run();h.ctx.closeModal();h.timers.forEach(f=>f());await p;
  assert.equal(h.calls.length,0);assert.equal(h.previews.length,0);
});
test('loading is explicit and an empty response enables retry',async()=>{
  const h=harness(),m=h.ctx.UI.modal,p=h.run();assert.equal(m.planBusy,true);
  h.request.resolve({options:[]});await p;assert.equal(m.planBusy,false);assert.equal(h.previews.length,0);
  h.ctx.SOLVER.plansDb=async()=>({date:'2026-10-15',options:[{id:'A'}]});await h.run();assert.equal(h.previews.length,1);
});
test('an old cancelled request cannot clear a newer calculation or its loading state',async()=>{
  const h=harness(),old=h.run();h.ctx.closeModal();h.ctx.openModal({t:'auto'});
  const next=deferred();h.ctx.SOLVER.plansDb=()=>next.promise;const newer=h.run(),m=h.ctx.UI.modal;
  h.reply();await old;assert.equal(m.planBusy,true);assert.equal(h.previews.length,0);
  next.resolve({date:'2026-10-15',options:[{id:'B'}]});await newer;
  assert.equal(h.previews.length,1);assert.equal(h.previews[0].opts[0].id,'B');assert.equal(m.planBusy,false);
});
test('active solver failure falls back once and normal local calculation still previews',async()=>{
  const h=harness(),p=h.run();h.request.reject(new Error('timeout'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.timers.length,1);h.timers.forEach(f=>f());await p;
  assert.equal(h.calls.filter(x=>x==='build').length,1);assert.equal(h.previews[0].extra.engine,'瀏覽器');
});
test('local calculation failures are reported and leave a retryable modal',async()=>{
  const h=harness(true);h.ctx.buildPlans=()=>{throw new Error('test exception');};
  const p=h.run();h.timers.forEach(f=>f());await p;
  assert.equal(h.ctx.UI.modal.planBusy,false);assert.equal(h.previews.length,0);
  assert.ok(h.messages.includes('排程計算失敗，請重試。'));
});

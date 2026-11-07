import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const base=new URL('../src/',import.meta.url);
const solver=fs.readFileSync(new URL('solver.js',base),'utf8');
const app=fs.readFileSync(new URL('app.js',base),'utf8');
function harness(){
 const timers=new Map(),requests=[],events=[];let next=0;
 const ctx=vm.createContext({AbortController,JSON,Number,Array,Promise,Error,console,RUNTIME:{solverUrl:'https://mock.invalid',solverKey:'',mode:'local'},setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,opt)=>new Promise((resolve,reject)=>{requests.push({url,opt,resolve,reject});opt.signal.addEventListener('abort',()=>reject(new Error('mock request-specific abort')),{once:true});}),UI:{modal:{t:'synthetic'}},PV:null,S:{},STORE:{kind:'local',version:1,can:()=>true},renderModal:()=>{},toast:x=>events.push(x),tx:x=>x,assignments:()=>[],planTimeLimit:()=>3,todayStr:()=> '2026-11-07',nowMin:()=>480,toSnapshot:x=>x,HOLI:{},$:()=>null,maybeReload:()=>{},requestAnimationFrame:()=>{},modalReturnFocus:null});
 vm.runInContext(solver.replace("import { RUNTIME } from './runtime-config.js';",'').replace('export const SOLVER','globalThis.SOLVER'),ctx);
 vm.runInContext(app.slice(app.indexOf('let planCalculationJob=null;'),app.indexOf('function openPlansLocal(')),ctx);
 for(const name of ['openModal','closeModal']){const start=app.indexOf('function '+name+'(');vm.runInContext(app.slice(start,app.indexOf('\n}',start)+2),ctx);}
 vm.runInContext('globalThis.localCalls=0;function openPlansLocal(){localCalls++;}',ctx);
 return {ctx,timers,requests,events,ok:(req,body={})=>req.resolve({ok:true,json:async()=>body}),health:async()=>{const p=ctx.SOLVER.check();requests.at(-1).resolve({ok:true,json:async()=>({ok:true,ortools:'new',capabilities:[]})});return p;},timeout:()=>{const t=[...timers.values()].find(x=>x.ms===60000);assert.ok(t);t.fn();}};
}

const run=h=>h.ctx.openPlans('synthetic','synthetic','synthetic',()=>{},[],{event:{}});
const changes={
 close:h=>h.ctx.closeModal(),
 replacement:h=>h.ctx.openModal({t:'new'}),
 state:h=>{h.ctx.S.changed=true;},
 stateIdentity:h=>{h.ctx.S={...h.ctx.S};},
 user:h=>{h.ctx.STORE.session={user:{id:'other'}};},
 epoch:h=>{h.ctx.STORE.authEpoch=2;},
 store:h=>{h.ctx.STORE={...h.ctx.STORE};},
 version:h=>{h.ctx.STORE.version++;},
 preview:h=>{h.ctx.PV={};}
};
for(const [name,change] of Object.entries(changes))for(const health of ['success','failure','pending']){
 test(`${name}: abandoned timeout preserves ${health} health and skips fallback`,async()=>{
  const h=harness();h.ctx.SOLVER.up=true;const p=run(h),old=h.requests[0];change(h);
  const hp=h.ctx.SOLVER.check(),hr=h.requests.at(-1);
  if(health==='success'){h.ok(hr,{ok:true,ortools:'new',capabilities:['new']});await hp;}
  if(health==='failure'){hr.reject(new Error('health failed'));await hp;}
  const before={up:h.ctx.SOLVER.up,version:h.ctx.SOLVER.version,capabilities:[...h.ctx.SOLVER.capabilities],epoch:h.ctx.SOLVER.healthEpoch};
  assert.equal(old.opt.signal.aborted,false,'ownership invalidation does not roll back backend work');
  h.timeout();await p;
  assert.deepEqual({up:h.ctx.SOLVER.up,version:h.ctx.SOLVER.version,capabilities:[...h.ctx.SOLVER.capabilities],epoch:h.ctx.SOLVER.healthEpoch},before);
  assert.equal(h.ctx.localCalls,0);
  if(health==='pending'){h.ok(hr,{ok:true});await hp;assert.equal(h.ctx.SOLVER.up,true);}
 });
}
test('Close then reconnect keeps the next local plan on the solver route',async()=>{
 const h=harness();h.ctx.SOLVER.up=true;const old=run(h);h.ctx.closeModal();await h.health();h.timeout();await old;
 h.ctx.UI.modal={t:'new'};const next=run(h);assert.equal(h.requests.length,3);assert.equal(h.ctx.localCalls,0);h.ok(h.requests.at(-1),{options:[]});await next;
});
for(const method of ['plans','plansDb'])test(`${method}: explicit abandoned ownership preserves health but still rejects`,async()=>{
 const h=harness();await h.health();let current=true;
 const args=method==='plans'?[{}, {}, {}, 7, {keep:true}]:[{}, {}, 'synthetic-token',7,{keep:true}];
 const p=h.ctx.SOLVER[method](...args,{isCurrent:()=>current}).catch(e=>e),req=h.requests.at(-1);
 assert.deepEqual(JSON.parse(req.opt.body).hints,{keep:true});assert.equal(JSON.parse(req.opt.body).time_limit,7);
 if(method==='plansDb')assert.equal(req.opt.headers.Authorization,'Bearer synthetic-token');
 current=false;h.timeout();assert.equal((await p).message,'排程服務沒有回應');assert.equal(h.ctx.SOLVER.up,true);
});
for(const mode of ['timeout','body','network','http503','http403','success'])for(const health of ['success','failure','pending'])test(`current ${mode} after newer ${health} check retains original behavior`,async()=>{
 const h=harness();h.ctx.SOLVER.up=true;const p=run(h),req=h.requests[0];
 if(mode==='body')req.resolve({ok:true,json:()=>new Promise((resolve,reject)=>req.opt.signal.addEventListener('abort',()=>reject(new Error('body timeout')),{once:true}))});
 await Promise.resolve();await Promise.resolve();
 const hp=h.ctx.SOLVER.check(),hr=h.requests.at(-1);
 if(health==='success'){h.ok(hr,{ok:true});await hp;}
 if(health==='failure'){hr.reject(new Error('health failure'));await hp;}
 if(mode==='timeout'||mode==='body')h.timeout();
 else if(mode==='network')req.reject(new Error('network'));
 else if(mode.startsWith('http'))req.resolve({ok:false,status:Number(mode.slice(4)),json:async()=>({detail:'test HTTP'})});
 else h.ok(req,{options:[]});
 await p;
 const transport=['timeout','body','network'].includes(mode);
 assert.equal(h.ctx.SOLVER.up,transport?false:health!=='failure');
 assert.equal(h.ctx.localCalls,transport||mode==='http503'?1:0);
 if(health==='pending'){h.ok(hr,{ok:true});await hp;assert.equal(h.ctx.SOLVER.up,true);}
});
test('abandoned successful DB response remains a server result, not rollback or status revival',async()=>{
 const h=harness();h.ctx.STORE.kind='supabase';h.ctx.STORE.jwt=()=> 'synthetic-token';h.ctx.SOLVER.up=true;
 const p=run(h),req=h.requests[0];h.ctx.closeModal();const hp=h.ctx.SOLVER.check();h.requests.at(-1).reject(new Error('down'));await hp;
 h.ok(req,{preview_id:'server-created-preview',options:[{id:'A'}]});await p;
 assert.equal(h.ctx.SOLVER.up,false);assert.equal(h.ctx.PV,null);assert.equal(h.ctx.localCalls,0);
});
for(const method of ['chat','roster'])test(`${method}: unrelated current callers still mark down after a newer health success`,async()=>{
 const h=harness(),p=h.ctx.SOLVER[method]({},null).catch(e=>e);await h.health();h.timeout();
 assert.equal((await p).message,'排程服務沒有回應');assert.equal(h.ctx.SOLVER.up,false);
});
for(const outcome of ['body','http403','http503'])test(`abandoned ${outcome} preserves newer health without fallback`,async()=>{
 const h=harness();h.ctx.SOLVER.up=true;const p=run(h),req=h.requests[0];
 if(outcome==='body'){
  req.resolve({ok:true,json:()=>new Promise((resolve,reject)=>req.opt.signal.addEventListener('abort',()=>reject(new Error('body timeout')),{once:true}))});
  await Promise.resolve();await Promise.resolve();
 }
 h.ctx.closeModal();await h.health();
 if(outcome==='body')h.timeout();
 else req.resolve({ok:false,status:Number(outcome.slice(4)),json:async()=>({detail:'test HTTP'})});
 await p;assert.equal(h.ctx.SOLVER.up,true);assert.equal(h.ctx.localCalls,0);
});
test('old timeout cannot clear a replacement calculation or its status ownership',async()=>{
 const h=harness();h.ctx.SOLVER.up=true;const old=run(h),oldRequest=h.requests[0];
 h.ctx.closeModal();h.ctx.UI.modal={t:'new'};const next=run(h),newRequest=h.requests[1];
 await h.health();oldRequest.reject(new Error('old transport error'));await old;
 assert.equal(h.ctx.UI.modal.planBusy,true);assert.equal(h.ctx.SOLVER.up,true);assert.equal(h.ctx.localCalls,0);
 newRequest.reject(new Error('current transport error'));await next;
 assert.equal(h.ctx.UI.modal.planBusy,false);assert.equal(h.ctx.SOLVER.up,false);assert.equal(h.ctx.localCalls,1);
});

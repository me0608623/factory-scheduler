import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const applyCode=source.slice(source.indexOf('function samePreviewState('),source.indexOf('function pvDrawerActionsHTML('))+source.slice(source.indexOf('async function pvApply(){'),source.indexOf('\nObject.assign(MODAL_ACT,{',source.indexOf('async function pvApply(){')));
const commitCode=source.slice(source.indexOf('function commit('),source.indexOf('\nasync function undo('));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(){
  const log=[],wait=deferred(),before={blocks:[{id:'original'}],machines:[],log:[]};
  const next={...structuredClone(before),blocks:[{id:'candidate'}]};
  const option={id:'C',name:'Fallback',A:next,state:JSON.stringify(next),applicable:true,lines:[],mt:{shifts:[],lateCodes:[],moved:0,otherDays:0,otH:0}};
  const store={kind:'local',session:null,authEpoch:0};
  const ctx={STORE:store,S:before,PV:{kind:'auto',base:JSON.stringify(before),opts:[option],cur:'C',logTitle:'Fallback'},
    pvOpt:()=>ctx.PV?.opts[0],withState:(state,fn)=>fn(),pvSummary:()=>'',peopleOf:()=>[],assertExecutionProtected:()=>{},
    $:()=>null,canPermissionRaw:()=>true,canPermission:()=>true,tx:x=>x,toast:x=>log.push(x),render:()=>log.push('render'),
    undoStack:[],pushUndo:()=>ctx.undoStack.push(JSON.stringify(ctx.S)),showResult:()=>log.push('success'),
    commit:()=>{log.push('commit');return wait.promise;}};
  vm.createContext(ctx);vm.runInContext(applyCode,ctx);return {ctx,log,wait,before,next};
}
test('fallback waits for confirmed persistence before showing result',async()=>{
  const h=harness(),task=h.ctx.pvApply();
  assert.ok(h.log.includes('commit'));assert.ok(!h.log.includes('success'));
  h.wait.resolve(true);await task;assert.equal(h.log.filter(x=>x==='success').length,1);
});
test('failed fallback keeps unsaved candidate for retry, but never opens a success result',async()=>{
  const h=harness(),task=h.ctx.pvApply();h.wait.resolve(false);await task;
  assert.ok(!h.log.includes('success'));assert.equal(h.ctx.S.blocks[0].id,'candidate');
});
test('late fallback confirmation cannot open a result over another account, draft or preview',async()=>{
  for(const change of ['store','user','epoch','state','preview','mutation']){
    const h=harness(),task=h.ctx.pvApply();
    if(change==='store')h.ctx.STORE={...h.ctx.STORE};
    if(change==='user')h.ctx.STORE.session={user:{id:'other'}};
    if(change==='epoch')h.ctx.STORE.authEpoch++;
    if(change==='state')h.ctx.S={blocks:[{id:'fresh'}]};
    if(change==='preview')h.ctx.PV={replacement:true};
    if(change==='mutation')h.ctx.S.blocks.push({id:'draft'});
    const state=h.ctx.S,preview=h.ctx.PV;h.wait.resolve(true);await task;
    assert.equal(h.ctx.S,state);assert.equal(h.ctx.PV,preview);assert.ok(!h.log.includes('success'),change);
  }
});
test('revoked fallback permission is rejected before board, log, undo or write mutation',async()=>{
  const h=harness();h.ctx.canPermissionRaw=()=>false;const before=JSON.stringify(h.ctx.S);
  await h.ctx.pvApply();assert.equal(JSON.stringify(h.ctx.S),before);
  assert.equal(h.ctx.undoStack.length,0);assert.ok(!h.log.includes('commit'));
});
test('actual commit and LocalStore quota failure cannot open fallback success',async()=>{
  const h=harness(),old=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
  try{
    const local=new LocalStore();h.ctx.STORE=local;h.ctx.uid=()=> 'test-change';h.ctx.SOLVER=null;
    h.ctx.structuredClone=structuredClone;h.ctx.SYNC={state:'ok',msg:''};h.ctx.syncChain=Promise.resolve();h.ctx.syncPending=0;h.ctx.syncEpoch=0;h.ctx.lastSyncState='ok';h.ctx.lastLocalWrite=0;
    h.ctx.updateSyncChip=()=>{};h.ctx.maybeReload=()=>{};
    const start=source.indexOf('function queueSync(entry){');
    vm.runInContext(source.slice(start,source.indexOf('// ---------- 別人改了',start))+commitCode,h.ctx);
    await h.ctx.pvApply();assert.equal(h.ctx.SYNC.state,'error');assert.match(h.ctx.SYNC.msg,/儲存空間不足/);assert.ok(!h.log.includes('success'));
    assert.equal(h.ctx.S.blocks[0].id,'candidate');
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('actual commit sends LINE notification only after a confirmed write',async()=>{
  for(const saved of [true,false]){
    const h=harness(),pending=deferred();h.ctx.uid=()=> 'test-change';h.ctx.STORE={kind:'supabase',session:{user:{id:'lead'}},authEpoch:0,jwt:()=> 'synthetic-token'};
    h.ctx.SOLVER={url:'https://solver.invalid'};h.ctx.queueSync=()=>pending.promise;
    h.ctx.sendLineNotify=async()=>h.log.push('notify');vm.runInContext(commitCode,h.ctx);
    const task=h.ctx.commit({kind:'auto',title:'Test'});
    assert.ok(!h.log.includes('notify'));pending.resolve(saved);assert.equal(await task,saved);
    assert.equal(h.log.filter(x=>x==='notify').length,saved?1:0);
  }
});
test('stale fallback base is rejected before a write or undo entry',async()=>{
  const h=harness();h.ctx.S.blocks.push({id:'newer'});const before=JSON.stringify(h.ctx.S);
  await h.ctx.pvApply();assert.equal(JSON.stringify(h.ctx.S),before);assert.equal(h.ctx.undoStack.length,0);assert.ok(!h.log.includes('commit'));
});
test('actual commit permission denial adds no log, write or notification',async()=>{
  const h=harness();h.ctx.uid=()=> 'test-change';h.ctx.canPermission=()=>false;
  h.ctx.queueSync=()=>{throw new Error('should not write');};h.ctx.sendLineNotify=async()=>h.log.push('notify');
  vm.runInContext(commitCode,h.ctx);const before=JSON.stringify(h.ctx.S);
  assert.equal(await h.ctx.commit({kind:'auto',title:'Denied'}),false);
  assert.equal(JSON.stringify(h.ctx.S),before);assert.ok(!h.log.includes('notify'));
});
test('confirmed old-account save does not send notifications with the new identity',async()=>{
  for(const change of ['store','user','epoch']){
    const h=harness(),pending=deferred();h.ctx.uid=()=> 'test-change';
    h.ctx.STORE={kind:'supabase',session:{user:{id:'lead'}},authEpoch:0,jwt:()=> 'synthetic-token'};
    h.ctx.SOLVER={url:'https://solver.invalid'};h.ctx.queueSync=()=>pending.promise;h.ctx.sendLineNotify=async()=>h.log.push('notify');
    vm.runInContext(commitCode,h.ctx);const task=h.ctx.commit({kind:'auto',title:'Old'});
    if(change==='store')h.ctx.STORE={...h.ctx.STORE};
    if(change==='user')h.ctx.STORE.session={user:{id:'other'}};
    if(change==='epoch')h.ctx.STORE.authEpoch++;
    pending.resolve(true);assert.equal(await task,true);assert.ok(!h.log.includes('notify'));
  }
});
test('notification failure never turns a confirmed write into a failed save',async()=>{
  for(const fail of ['sync','async']){
    const h=harness();h.ctx.uid=()=> 'test-change';h.ctx.STORE={kind:'supabase',session:{user:{id:'lead'}},authEpoch:0,jwt:()=> 'synthetic-token'};
    h.ctx.SOLVER={url:'https://solver.invalid'};h.ctx.queueSync=async()=>true;
    h.ctx.sendLineNotify=fail==='sync'?()=>{throw new Error('notify');}:async()=>{throw new Error('notify');};
    vm.runInContext(commitCode,h.ctx);assert.equal(await h.ctx.commit({kind:'auto',title:'OK'}),true);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const at=source.indexOf('case "person-day":{'),end=source.indexOf('case "person-month":',at);
const code='this.click=a=>{switch(a.dataset.act){'+source.slice(at,end)+'}};';
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function fixture(){
  const pending=deferred(),events=[];
  const ctx={S:{employees:[{id:'test',name:'Synthetic',leaves:[]}],leaveRequests:[],blocks:[],log:[]},
    UI:{leaveBrush:'leave',brushStart:{eid:'test',d:'2026-10-20'},drawer:'people',date:'2026-10-14',modal:null},PV:null,
    STORE:{kind:'local',session:{user:{id:'test-user'}},authEpoch:1},canIncidents:()=>true,uid:()=> 'synthetic',
    emp:id=>ctx.S.employees.find(e=>e.id===id),md:x=>x,addDays:d=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+1);return t.toISOString().slice(0,10);},futureOf:()=>false,
    undoStack:[],pushUndo:()=>ctx.undoStack.push(JSON.stringify(ctx.S)),render:()=>events.push('render'),maybeReload:()=>{},tx:x=>x,
    commit:()=>{events.push('commit');return pending.promise;},reloadFromStore:async options=>{events.push({type:'reload',options});return 'applied';},toast:s=>events.push({type:'toast',text:s}),openModal:m=>{ctx.UI.modal=m;}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const click=()=>ctx.click({dataset:{act:'person-day',id:'test',d:'2026-10-20'}});
  return {ctx,pending,events,click};
}
const success=f=>f.events.filter(e=>e?.type==='toast'&&e.text.startsWith('已套用'));
const reloads=f=>f.events.filter(e=>e?.type==='reload');
test('failed brush commit keeps unsaved candidate and never reloads old data or announces applied',async()=>{
  const f=fixture();f.click();await tick();f.pending.resolve(false);await tick();
  assert.equal(success(f).length,0);assert.equal(reloads(f).length,0);assert.deepEqual(Array.from(f.ctx.S.employees[0].leaves),['2026-10-20']);
  assert.equal(f.ctx.UI.leaveBrushSaving,null);
});
test('pending brush blocks repeated day selection and brush switching; one undo/write',async()=>{
  const f=fixture();f.click();await tick();f.click();f.ctx.click({dataset:{act:'cal-brush',v:'work'}});
  assert.ok(f.ctx.UI.leaveBrushSaving);assert.equal(f.ctx.UI.brushStart,null);assert.equal(f.ctx.UI.leaveBrush,'leave');
  assert.equal(f.ctx.undoStack.length,1);assert.equal(f.events.filter(e=>e==='commit').length,1);
  f.pending.resolve(true);await tick();assert.equal(success(f).length,1);assert.equal(f.ctx.UI.leaveBrushSaving,null);
});
test('only acknowledged unchanged brush may request protected background reload',async()=>{
  const f=fixture();f.click();await tick();assert.equal(reloads(f).length,0);f.pending.resolve(true);await tick();
  assert.equal(reloads(f).length,1);assert.equal(reloads(f)[0].options.background,true);assert.equal(success(f).length,1);
});
test('late brush acknowledgment does not reload, toast or reopen people after state/session/view changes',async()=>{
  for(const kind of ['store','user','epoch','state','mutation','permission','modal','drawer']){
    const f=fixture();f.click();await tick();
    if(kind==='store')f.ctx.STORE={...f.ctx.STORE};
    if(kind==='user')f.ctx.STORE.session={user:{id:'other'}};
    if(kind==='epoch')f.ctx.STORE.authEpoch++;
    if(kind==='state')f.ctx.S={...f.ctx.S,blocks:[{id:'other'}]};
    if(kind==='mutation')f.ctx.S.employees[0].name='new edit';
    if(kind==='permission')f.ctx.canIncidents=()=>false;
    if(kind==='modal')f.ctx.UI.modal={t:'order-edit'};
    if(kind==='drawer')f.ctx.UI.drawer='orders';
    const state=f.ctx.S,modal=f.ctx.UI.modal,drawer=f.ctx.UI.drawer;f.pending.resolve(true);await tick();
    assert.equal(reloads(f).length,0,kind);assert.equal(success(f).length,0,kind);
    assert.equal(f.ctx.S,state,kind);assert.equal(f.ctx.UI.modal,modal,kind);assert.equal(f.ctx.UI.drawer,drawer,kind);
  }
});
test('protected reread failing or deferred is not presented as applied range',async()=>{
  for(const result of ['failed','deferred']){
    const f=fixture();f.ctx.reloadFromStore=async()=>result;f.click();await tick();f.pending.resolve(true);await tick();
    assert.equal(success(f).length,0,result);assert.equal(f.ctx.UI.leaveBrushSaving,null);
  }
});
test('request API rejection is not swallowed and cannot create a fake inquiry or hide a pending one',async()=>{
  for(const kind of ['create','resolve']){
    const f=fixture();f.ctx.STORE.kind='supabase';
    f.ctx.STORE.createLeaveRequest=async()=>{throw new Error('synthetic offline');};
    f.ctx.STORE.resolveLeaveRequest=async()=>{throw new Error('synthetic denied');};
    if(kind==='create'){f.ctx.UI.leaveBrush='uncertain';f.ctx.S.employees[0].leaves=['2026-10-20'];}
    else f.ctx.S.leaveRequests=[{id:'pending',employeeId:'test',date:'2026-10-20',status:'pending'}];
    const before=JSON.stringify(f.ctx.S);f.click();await tick();
    assert.equal(JSON.stringify(f.ctx.S),before,kind);assert.equal(success(f).length,0);assert.equal(reloads(f).length,0);
    assert.equal(f.events.filter(e=>e==='commit').length,0);assert.ok(f.ctx.UI.leaveBrushError);assert.equal(f.ctx.UI.leaveBrushSaving,null);
  }
});
test('account/state mutation while request RPC waits stops before local mutation or another write',async()=>{
  for(const kind of ['owner','state']){
    const f=fixture(),rpc=deferred();f.ctx.STORE.kind='supabase';f.ctx.STORE.createLeaveRequest=()=>rpc.promise;f.ctx.UI.leaveBrush='uncertain';
    f.click();await tick();
    if(kind==='owner')f.ctx.STORE.session={user:{id:'after'}};
    else f.ctx.S.employees[0].name='newer edit';
    const before=JSON.stringify(f.ctx.S);rpc.resolve();await tick();
    assert.equal(JSON.stringify(f.ctx.S),before,kind);assert.equal(f.events.filter(e=>e==='commit').length,0);assert.equal(success(f).length,0);
  }
});
test('older protected reread cannot report its result into a newer brush operation',async()=>{
  const f=fixture(),read=deferred();f.ctx.reloadFromStore=()=>read.promise;
  f.click();await tick();f.pending.resolve(true);await tick();
  f.ctx.UI.leaveBrushOperation={newer:true};f.ctx.UI.leaveBrushError='newer error';
  read.resolve('deferred');await tick();assert.equal(f.ctx.UI.leaveBrushError,'newer error');assert.equal(success(f).length,0);
});
test('real commit/queueSync/LocalStore quota failure leaves brush data unconfirmed, not reloaded',async()=>{
  const f=fixture(),old=globalThis.localStorage;let reads=0;
  globalThis.localStorage={getItem:()=>{reads++;return null;},setItem:()=>{throw new Error('quota');}};
  try{
    f.ctx.STORE=new LocalStore();Object.assign(f.ctx,{structuredClone,SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,updateSyncChip:()=>{},SOLVER:null});
    const queue=source.indexOf('function queueSync(entry){'),commit=source.indexOf('function commit(');
    f.ctx.canPermission=()=>true;
    vm.runInContext(source.slice(queue,source.indexOf('// ---------- 別人改了',queue))+source.slice(commit,source.indexOf('\nasync function undo(',commit)),f.ctx);
    f.click();await tick();await f.ctx.syncChain;await tick();
    assert.equal(f.ctx.SYNC.state,'error');assert.match(f.ctx.SYNC.msg,/儲存空間不足/);
    assert.equal(success(f).length,0);assert.equal(reloads(f).length,0);assert.equal(reads,1);
    assert.deepEqual(Array.from(f.ctx.S.employees[0].leaves),['2026-10-20']);assert.ok(f.ctx.UI.leaveBrushError);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('partial request range failure preserves confirmed dates, invents no later inquiry, and makes no all-range success claim',async()=>{
  const f=fixture();let requests=0;f.ctx.STORE.kind='supabase';f.ctx.UI.leaveBrush='uncertain';
  f.ctx.STORE.createLeaveRequest=async()=>{requests++;if(requests===2)throw new Error('synthetic second date failed');};
  f.ctx.click({dataset:{act:'person-day',id:'test',d:'2026-10-21'}});await tick();
  assert.equal(requests,2);assert.deepEqual(Array.from(f.ctx.S.leaveRequests,r=>r.date),['2026-10-20']);
  assert.equal(f.events.filter(e=>e==='commit').length,0);assert.equal(success(f).length,0);assert.ok(f.ctx.UI.leaveBrushError);
});

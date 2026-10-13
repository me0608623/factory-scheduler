import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {executionOf} from '../src/execution.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const queue=deferred(),write=deferred(),writes=[],events=[];
  const ctx={UI:{date:'2026-10-14',factory:1,page:'schedule',drawer:null,modal:{t:'execution-report',id:'B'}},PV:null,
    S:{blocks:[{id:'B',qty:100}]},STORE:{employeeId:'E',session:{user:{id:'A'}},sb:{},authEpoch:1,reportExecution:r=>{writes.push(r);return write.promise;}},
    syncChain:queue.promise,undoStack:['original'],canReport:()=>true,reportingRole:()=> 'lead',executionOf:()=>({qtyDone:10,revision:1}),
    $:()=>({value:'25'}),uid:()=> 'synthetic-request',tx:x=>x,toast:text=>events.push({type:'toast',text}),renderModal:()=>events.push('render'),
    closeModal:()=>{events.push('close');ctx.UI.modal=null;},maybeReload:()=>{},reloadFromStore:async options=>{events.push({type:'reload',options});return 'applied';}};
  vm.createContext(ctx);const helper=source.indexOf('function directWriteOwner(');
  vm.runInContext(source.slice(helper,source.indexOf('async function runDrawerWrite(',helper)),ctx);
  const at=source.indexOf('async function reportWork(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 工作內容',at)),ctx);
  return {ctx,queue,write,writes,events,m:ctx.UI.modal,button:{disabled:false,dataset:{v:'quantity'}},run:()=>ctx.reportWork({disabled:false,dataset:{v:'quantity'}})};
}
function change(f,kind){
  if(kind==='user')f.ctx.STORE.session={user:{id:'OTHER'}};
  if(kind==='client')f.ctx.STORE.sb={};if(kind==='epoch')f.ctx.STORE.authEpoch++;
  if(kind==='store')f.ctx.STORE={...f.ctx.STORE,reportExecution:async()=>{f.writes.push('WRONG_ACTOR');}};
  if(kind==='modal')f.ctx.UI.modal={t:'new-draft'};if(kind==='preview')f.ctx.PV={};
  if(kind==='state')f.ctx.S={...f.ctx.S};if(kind==='mutation')f.ctx.S.blocks[0].qty=90;
  if(kind==='date')f.ctx.UI.date='2026-10-15';if(kind==='permission')f.ctx.canReport=()=>false;
}
const changes=['user','client','epoch','store','modal','preview','state','mutation','date','permission'];
test('queued report never dispatches after identity, view, state or permission changes',async()=>{
  for(const kind of changes){const f=fixture(),job=f.run();change(f,kind);f.queue.resolve();f.write.resolve();await job;
    assert.equal(f.writes.length,0,kind);assert.equal(f.events.filter(e=>e?.type==='reload').length,0,kind);assert.equal(f.events.filter(e=>e?.type==='toast').length,0,kind);}
});
test('late report ACK cannot reload, close a new draft, clear new undo or announce success',async()=>{
  for(const kind of changes){const f=fixture(),job=f.run();f.queue.resolve();await tick();change(f,kind);const modal=f.ctx.UI.modal;f.ctx.undoStack=['new-draft'];f.write.resolve();await job;
    assert.equal(f.ctx.UI.modal,modal,kind);assert.equal(f.ctx.undoStack[0],'new-draft',kind);assert.equal(f.events.filter(e=>e?.type==='reload'||e?.type==='toast').length,0,kind);}
});
test('late rejection never injects a stale error into a new dialog',async()=>{
  const f=fixture(),job=f.run();f.queue.resolve();await tick();change(f,'modal');f.write.reject(new Error('OLD_ERROR'));await job;
  assert.equal(f.events.filter(e=>e?.type==='toast').length,0);assert.equal(f.ctx.UI.modal.t,'new-draft');
});
test('report is single flight and guards pending writes after closing the dialog',async()=>{
  const f=fixture(),job=f.run();f.queue.resolve();await tick();await f.run();assert.equal(f.writes.length,1);assert.ok(f.ctx.UI.executionSaving);
  change(f,'modal');f.write.resolve();await job;assert.equal(f.ctx.UI.executionSaving,null);
});
test('unconfirmed report preserves quantity and stable retry ID, but not across accounts',async()=>{
  const f=fixture(),job=f.run();f.queue.resolve();await tick();f.write.reject(new Error('NETWORK_UNCONFIRMED'));await job;
  assert.equal(f.m.qtyDraft,25);assert.equal(f.m.pendingRequest.id,'synthetic-request');assert.ok(f.m.error);
  const rows=[];f.ctx.STORE.reportExecution=async r=>rows.push(r);f.ctx.STORE.session={user:{id:'OTHER'}};
  await f.run();assert.equal(rows.length,0);assert.match(f.m.error,/登入狀態已變更/);
});
test('same-owner retry uses the original request and accepted reread restores the report dialog',async()=>{
  const f=fixture(),job=f.run();f.queue.resolve();await tick();f.write.reject(new Error('NETWORK_UNCONFIRMED'));await job;
  const request=f.m.pendingRequest;f.ctx.$=()=>({value:'99'});f.ctx.STORE.reportExecution=async r=>{assert.equal(r,request);};await f.run();
  assert.equal(f.ctx.UI.modal,f.m);assert.equal(f.m.pendingRequest,null);assert.equal(f.m.qtyDraft,undefined);assert.equal(f.ctx.undoStack.length,0);
  assert.equal(f.events.find(e=>e?.type==='reload').options.background,true);assert.equal(f.events.filter(e=>e?.type==='toast').at(-1).text,'進度已保存');
});
test('failed/deferred reread never reopens stale reporting facts or claims a full refresh',async()=>{
  for(const result of ['failed','deferred']){const f=fixture();f.ctx.reloadFromStore=async()=>result;const job=f.run();f.queue.resolve();f.write.resolve();await job;
    assert.equal(f.ctx.UI.modal,null);assert.match(f.events.filter(e=>e?.type==='toast').at(-1).text,/尚未讀到最新/);}
});
test('new dialog during report reread remains intact and suppresses old completion',async()=>{
  const f=fixture(),read=deferred();f.ctx.reloadFromStore=()=>read.promise;const job=f.run();f.queue.resolve();f.write.resolve();await tick();change(f,'modal');read.resolve('applied');await job;
  assert.equal(f.ctx.UI.modal.t,'new-draft');assert.equal(f.events.filter(e=>e?.type==='toast').length,0);
});
test('pending setup and other in-flight direct writes cannot start reporting',async()=>{
  for(const kind of ['setup','memo','direct','brush']){const f=fixture();if(kind==='setup')f.ctx.S.setupPending=true;else f.ctx.UI[kind==='brush'?'leaveBrushSaving':kind+'Saving']={};
    f.queue.resolve();f.write.resolve();await f.run();assert.equal(f.writes.length,0,kind);}
});
test('actual reload and beforeunload guards protect a report even after its dialog closes',()=>{
  const f=fixture();Object.assign(f.ctx,{drag:null,generalDrag:null,syncPending:0,SYNC:{state:'ok'},addEventListener:(_,handler)=>f.ctx.unload=handler});f.ctx.UI.modal=null;
  const at=source.indexOf('function remoteReloadBlocked(');vm.runInContext(source.slice(at,source.indexOf('\n',at)),f.ctx);
  const unload=source.indexOf('addEventListener("beforeunload"');vm.runInContext(source.slice(unload,source.indexOf('\n',unload)),f.ctx);
  assert.equal(f.ctx.remoteReloadBlocked(),false);f.ctx.UI.executionSaving={};assert.equal(f.ctx.remoteReloadBlocked(),true);
  let prevented=false;f.ctx.unload({preventDefault:()=>prevented=true});assert.equal(prevented,true);f.ctx.UI.executionSaving=null;assert.equal(f.ctx.remoteReloadBlocked(),false);
});
test('confirmed revision conflict clears the stale retry and quantity only after current-owner rejection',async()=>{
  const f=fixture(),job=f.run();f.queue.resolve();await tick();f.write.reject(Object.assign(new Error('SYNTHETIC_CONFLICT'),{conflict:true}));await job;
  assert.equal(f.m.pendingRequest,null);assert.equal(f.m.reportOwner,null);assert.equal(f.m.qtyDraft,undefined);assert.equal(f.ctx.UI.modal,f.m);
  assert.equal(f.events.find(e=>e?.type==='reload').options.background,true);assert.equal(f.events.filter(e=>e?.type==='toast').at(-1).text,'SYNTHETIC_CONFLICT');
});
test('actual LocalStore report and protected reread accept real progress without altering the planned times or quantity',async()=>{
  const previous=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{
    const f=fixture();f.ctx.STORE=new LocalStore();f.ctx.S={blocks:[{id:'B',oid:'O',m:'M',emp:'E',qty:100,date:'2000-01-01',s:480,e:540}],employees:[{id:'E',leaves:[]}],machines:[{id:'M'}],orders:[{id:'O'}],products:[],execution:[]};
    await f.ctx.STORE.sync(f.ctx.S);Object.assign(f.ctx,{executionOf,lastLocalWrite:0,pendingReload:false,normalizeState:()=>{},render:()=>{},remoteReloadBlocked:()=>!!(f.ctx.UI.modal||f.ctx.UI.executionSaving||f.ctx.PV)});
    const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('async function refreshCloudSnapshot',at)),f.ctx);
    f.queue.resolve();await f.ctx.reportWork({disabled:false,dataset:{v:'start'}});
    assert.equal(f.ctx.S.execution[0].status,'running');assert.equal(f.ctx.S.execution[0].qtyDone,0);assert.equal(f.ctx.S.blocks[0].pin,true);assert.equal(f.ctx.UI.modal,f.m);
    assert.equal(f.ctx.S.blocks[0].s,480);assert.equal(f.ctx.S.blocks[0].e,540);assert.equal(f.ctx.S.blocks[0].qty,100);assert.equal((await f.ctx.STORE.load()).executionEvents.length,1);
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

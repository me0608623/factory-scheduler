import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(confirm=true){
  const queue=defer(),write=defer(),events=[],writes=[];
  const ctx={S:{blocks:[{id:'B'}],employees:[],machines:[],orders:[],products:[],execution:[{blockId:'B',status:'done',qtyDone:40,revision:2,confirmed:!confirm}]},UI:{date:'2026-10-14',factory:1,page:'schedule',drawer:null,modal:{t:'execution'}},PV:null,
    STORE:{session:{user:{id:'A'}},sb:{},authEpoch:1,confirmExecution:(id,flag)=>{writes.push({id,flag});return write.promise;}},SYNC:{state:'ok'},syncChain:queue.promise,
    canPermission:()=>true,toast:text=>events.push({type:'toast',text}),tx:x=>x,DB_MIGRATION_PENDING:/missing migration/,renderModal:()=>events.push('modal'),render:()=>events.push('render'),maybeReload:()=>{},
    closeModal:()=>{events.push('close');ctx.UI.modal=null;},reloadFromStore:async options=>{events.push({type:'reload',options});return 'applied';}};
  vm.createContext(ctx);const owner=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(owner,source.indexOf('async function runDrawerWrite(',owner)),ctx);
  const helper=source.indexOf('async function changeExecutionConfirmation(');if(helper>=0)vm.runInContext(source.slice(helper,source.indexOf("MODALS['scenario-list']",helper)),ctx);
  const at=source.indexOf("case 'exec-confirm':"),end=source.indexOf('case "group-edit":',at);vm.runInContext('function invoke(a){switch(a.dataset.act){'+source.slice(at,end)+'}}',ctx);
  const button={disabled:false,dataset:{act:confirm?'exec-confirm':'exec-unconfirm',id:'B'}};
  return {ctx,queue,write,writes,events,button,m:ctx.UI.modal,start:(b=button)=>ctx.invoke(b)};
}
const changes=['modal','drawer','date','factory','page','focus','user','epoch','client','store','preview','state','mutation','permission'];
function change(f,k){
  if(k==='modal')f.ctx.UI.modal={t:'new-draft'};if(k==='drawer')f.ctx.UI.drawer='people';if(k==='date')f.ctx.UI.date='2026-10-15';if(k==='factory')f.ctx.UI.factory=2;if(k==='page')f.ctx.UI.page='worklog';if(k==='focus')f.ctx.UI.focus={id:'other'};
  if(k==='user')f.ctx.STORE.session={user:{id:'B'}};if(k==='epoch')f.ctx.STORE.authEpoch++;if(k==='client')f.ctx.STORE.sb={};if(k==='store')f.ctx.STORE={...f.ctx.STORE};if(k==='preview')f.ctx.PV={};if(k==='state')f.ctx.S={...f.ctx.S};if(k==='mutation')f.ctx.S.execution[0].confirmed=!f.ctx.S.execution[0].confirmed;if(k==='permission')f.ctx.canPermission=()=>false;
}
const feedback=f=>f.events.filter(e=>e?.type==='reload'||e?.type==='toast');
function reconcileFixture(f){
  f.ctx.S.log=[];
  const timers=[],loads=[];Object.assign(f.ctx,{drag:null,generalDrag:null,syncPending:0,lastLocalWrite:0,pendingReload:false,undoStack:[],reloadTimer:null,remoteLoading:false,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},normalizeState:()=>{},notificationEnabled:()=>false,showDeviceNotification:()=>{}});
  f.ctx.STORE.version=1;f.ctx.STORE.load=async()=>{loads.push('read');return {...f.ctx.S,version:3,execution:[{...f.ctx.S.execution[0],confirmed:true}]};};
  const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 帳號與連線',at)),f.ctx);
  return {timers,loads};
}

test('late successful confirmation after closing queues a protected reread without reopening the old dialog',async()=>{
  const f=fixture(),h=reconcileFixture(f);f.queue.resolve();f.start();await tick();f.ctx.closeModal();f.write.resolve();await tick();
  assert.equal(h.timers.length,1);assert.equal(f.ctx.UI.modal,null);assert.equal(f.ctx.S.execution[0].confirmed,false);
  await h.timers.shift()();assert.equal(h.loads.length,1);assert.equal(f.ctx.S.execution[0].confirmed,true);assert.equal(f.ctx.UI.modal,null);
  assert.equal(f.events.filter(e=>e?.type==='toast').length,0);
});

test('late successful confirmation waits for a new draft or preview to finish before rereading',async()=>{
  for(const mode of ['modal','preview','date','state']){
    const f=fixture(),h=reconcileFixture(f);f.queue.resolve();f.start();await tick();change(f,mode);const draft=f.ctx.UI.modal,state=f.ctx.S;
    f.write.resolve();await tick();assert.equal(h.loads.length,0);assert.equal(f.ctx.S,state);assert.equal(f.ctx.UI.modal,draft);
    if(mode==='modal'||mode==='preview'){assert.equal(f.ctx.pendingReload,true);assert.equal(h.timers.length,0);f.ctx.UI.modal=null;f.ctx.PV=null;f.ctx.maybeReload();}
    else {f.ctx.UI.modal=null;f.ctx.maybeReload();}
    assert.equal(h.timers.length,1);await h.timers.shift()();assert.equal(h.loads.length,1);assert.equal(f.ctx.S.execution[0].confirmed,true);
  }
});

test('late confirmation ACK from an old store, client, account or login never schedules a new-actor reread',async()=>{
  for(const mode of ['store','client','user','epoch']){
    const f=fixture(),h=reconcileFixture(f);f.queue.resolve();f.start();await tick();change(f,mode);f.ctx.UI.modal=null;f.write.resolve();await tick();
    assert.equal(f.ctx.pendingReload,false);assert.equal(h.timers.length,0);assert.equal(h.loads.length,0);
  }
});
test('both actual confirmation cases ignore late ACK after owner, state, view or dialog changes',async()=>{
  for(const confirm of [true,false])for(const kind of changes){const f=fixture(confirm);f.queue.resolve();f.start();await tick();change(f,kind);const modal=f.ctx.UI.modal;f.write.resolve();await tick();assert.equal(f.ctx.UI.modal,modal);assert.equal(feedback(f).length,0,confirm+'/'+kind);}
});
test('both confirmation cases suppress freshly rendered double-tap and keep a pending guard after close',async()=>{
  for(const confirm of [true,false]){const f=fixture(confirm);f.queue.resolve();f.start();await tick();f.start({...f.button,disabled:false});await tick();assert.equal(f.writes.length,1);assert.ok(f.ctx.UI.executionSaving);
    change(f,'modal');f.write.resolve();await tick();assert.equal(f.ctx.UI.executionSaving,null);}
});
test('queued confirmation never dispatches after identity or dialog changes',async()=>{
  for(const confirm of [true,false])for(const kind of changes){const f=fixture(confirm);f.start();change(f,kind);f.queue.resolve();f.write.resolve();await tick();assert.equal(f.writes.length,0,confirm+'/'+kind);assert.equal(feedback(f).length,0);}
});
test('stale confirmation failure cannot toast into a new draft',async()=>{
  for(const confirm of [true,false]){const f=fixture(confirm);f.queue.resolve();f.start();await tick();change(f,'modal');f.write.reject(new Error('OLD_ERROR'));await tick();assert.equal(feedback(f).length,0);assert.equal(f.ctx.UI.modal.t,'new-draft');}
});
test('failed or deferred reread closes stale facts and reports saved-but-not-refreshed, not full success',async()=>{
  for(const confirm of [true,false])for(const result of ['failed','deferred']){const f=fixture(confirm);f.ctx.reloadFromStore=async options=>{f.events.push({type:'reload',options});return result;};f.queue.resolve();f.start();f.write.resolve();await tick();
    assert.equal(f.ctx.UI.modal,null);assert.equal(f.events.find(e=>e?.type==='reload').options.background,true);assert.match(f.events.filter(e=>e?.type==='toast').at(-1).text,/尚未讀到最新/);}
});
test('new modal during protected confirmation reread is not replaced by old final handling',async()=>{
  const f=fixture(),read=defer();f.ctx.reloadFromStore=()=>read.promise;f.queue.resolve();f.start();f.write.resolve();await tick();change(f,'modal');read.resolve('applied');await tick();assert.equal(f.ctx.UI.modal.t,'new-draft');assert.equal(f.events.filter(e=>e?.type==='toast').length,0);
});
test('confirmation permission, setup, sync error and other in-flight writes are checked before dispatch',async()=>{
  for(const confirm of [true,false])for(const mode of ['permission','setup','sync','memo','direct','execution']){const f=fixture(confirm);if(mode==='permission')f.ctx.canPermission=()=>false;if(mode==='setup')f.ctx.S.setupPending=true;if(mode==='sync')f.ctx.SYNC.state='error';if(['memo','direct','execution'].includes(mode))f.ctx.UI[mode+'Saving']={};f.queue.resolve();f.write.resolve();f.start();await tick();assert.equal(f.writes.length,0,confirm+'/'+mode);}
});
test('confirmed ACK opens refreshed owning workbench only; unconfirmed failure never changes facts or auto-retries',async()=>{
  const good=fixture();good.queue.resolve();good.start();good.write.resolve();await tick();assert.equal(good.ctx.UI.modal,good.m);assert.equal(good.events.find(e=>e?.type==='reload').options.background,true);
  const f=fixture();f.queue.resolve();f.start();await tick();f.write.reject(Object.assign(new Error('SYNTHETIC_UNCONFIRMED'),{unconfirmed:true}));await tick();assert.equal(f.ctx.UI.modal,f.m);assert.equal(f.ctx.S.execution[0].confirmed,false);assert.equal(f.writes.length,1);assert.equal(f.events.filter(e=>e?.type==='toast').at(-1).text,'SYNTHETIC_UNCONFIRMED');assert.equal(f.ctx.UI.executionSaving,null);
});
test('actual LocalStore confirm and unconfirm plus actual protected reread persist facts without changing schedule blocks',async()=>{
  const old=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{for(const confirm of [true,false]){const f=fixture(confirm);f.ctx.STORE=new LocalStore();Object.assign(f.ctx.S,{employees:[{id:'E',leaves:[]}],machines:[{id:'M'}],orders:[{id:'O'}],blocks:[{id:'B',oid:'O',emp:'E',m:'M',date:'2000-01-01',qty:100,s:480,e:540,pin:true}]});await f.ctx.STORE.sync(f.ctx.S);const before=JSON.stringify(f.ctx.S.blocks);
    Object.assign(f.ctx,{lastLocalWrite:0,pendingReload:false,undoStack:[],normalizeState:()=>{},remoteReloadBlocked:()=>!!(f.ctx.UI.modal||f.ctx.UI.executionSaving||f.ctx.PV)});
    const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('async function refreshCloudSnapshot',at)),f.ctx);
    f.queue.resolve();f.start();await tick();assert.equal(f.ctx.S.execution[0].confirmed,confirm,JSON.stringify(f.events));assert.equal((await f.ctx.STORE.load()).execution[0].confirmed,confirm);assert.equal(JSON.stringify(f.ctx.S.blocks),before);assert.equal(f.ctx.UI.modal,f.m);
    if(confirm)assert.match(f.events.filter(e=>e?.type==='toast').at(-1).text,/存在這台裝置/);}
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('actual execution workbench exposes confirmation controls only for authorized completed work',()=>{
  const f=fixture();Object.assign(f.ctx,{MODALS:{},reportingRole:()=> 'boss',inFactory:()=>true,mach:()=>({label:'Synthetic machine'}),emp:()=>({name:'Synthetic employee'}),order:()=>({code:'Synthetic order'}),stepName:()=> 'Synthetic step',hm:x=>String(x),mdw:x=>x,esc:x=>String(x),executionOf:(s,id)=>s.execution.find(e=>e.blockId===id),reportStatus:r=>r.status,canReport:()=>true});
  Object.assign(f.ctx.S.blocks[0],{date:f.ctx.UI.date,m:'M',qty:100,s:480,e:540});
  const at=source.indexOf('MODALS.execution=');vm.runInContext(source.slice(at,source.indexOf("MODALS['execution-report']",at)),f.ctx);
  const html=()=>f.ctx.MODALS.execution(f.m).body;
  assert.match(html(),/data-act="exec-confirm"/);f.ctx.S.execution[0].confirmed=true;assert.match(html(),/data-act="exec-unconfirm"/);
  f.ctx.canPermission=()=>false;assert.doesNotMatch(html(),/data-act="exec-(?:un)?confirm"/);
  f.ctx.canPermission=()=>true;f.ctx.S.execution[0].status='running';assert.doesNotMatch(html(),/data-act="exec-(?:un)?confirm"/);
  f.ctx.S.execution[0].status='done';f.ctx.S.setupPending=true;assert.doesNotMatch(html(),/data-act="exec-(?:un)?confirm"/);
});

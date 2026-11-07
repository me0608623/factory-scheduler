import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Actual application functions and LocalStore; DOM, clock and solver boundaries
// are synthetic. This is not browser E2E coverage.
const root=fileURLToPath(new URL('..',import.meta.url));
const KEY='fsched-local-v1';
const initial=()=>({v:1,demo:false,employees:[{id:'sole',name:'Only employee',skills:[],leaves:[]}],machines:[{id:'custom-machine',label:'Keep this machine',proc:'Cut',products:['custom-product'],faults:[]}],products:[{id:'custom-product',name:'Keep this product',steps:[{proc:'Cut',rate:1,batch:0}]}],orders:[{id:'custom-order',code:'KEEP-ORDER',pid:'custom-product',qty:20,due:'2026-12-01',pri:1}],blocks:[],log:[],memos:[{id:'memo',text:'Keep this note'}],cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{}});
async function harness(t){
 const {LocalStore}=await import(pathToFileURL(resolve(root,'src/store/local.js')));
 const {factoryOf}=await import(pathToFileURL(resolve(root,'src/factory.js')));
 const {overtimeWeekdays}=await import(pathToFileURL(resolve(root,'src/overtime.js')));
 const {employeeGroups}=await import(pathToFileURL(resolve(root,'src/groups.js')));
 const source=readFileSync(resolve(root,'src/app.js'),'utf8');
 const slice=(a,b)=>{const i=source.indexOf(a);assert.ok(i>=0,a);const j=source.indexOf(b,i);assert.ok(j>i,b);return source.slice(i,j);};
 const data=new Map();let writes=0,mode='ok',unload;
 const previousStorage=globalThis.localStorage;
 t.after(()=>{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;});
 globalThis.localStorage={getItem:k=>{if(mode==='blocked')throw new DOMException('Blocked','SecurityError');return data.get(k)??null;},setItem:(k,v)=>{if(mode==='quota'||mode==='blocked')throw new DOMException('Blocked',mode==='quota'?'QuotaExceededError':'SecurityError');writes++;data.set(k,v);}};
 const store=new LocalStore(),messages=[];
 const ctx={STORE:store,S:initial(),UI:{modal:{id:'sole'},date:'2026-11-09'},SYNC:{state:'ok',msg:''},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,executionRetries:new Map(),readOnly:false,undoStack:[],SOLVER:{check:async()=>false},scheduleChat:null,location:{search:''},URLSearchParams,structuredClone,DEF_WEEK:[false,true,true,true,true,true,true],
 canPermission:()=>true,uid:()=> 'probe-id',render:()=>{},updateSyncChip:()=>{},maybeReload:()=>{},toast:(m)=>messages.push(m),tx:x=>x,reloadFromStore:async()=>'failed',changedWriteSession:()=>{},addEventListener:(type,h)=>{if(type==='beforeunload')unload=h;},employeeGroups,factoryOf,overtimeWeekdays,HOLI:{},confirmStep:()=>true,futureOf:()=>true,repair:()=>assert.fail('No schedule repairs expected'),closeModal:()=>{ctx.UI.modal=null;},showResult:()=>{},emp:id=>ctx.S.employees.find(e=>e.id===id),
 stopLoginViz:()=>{},showLogin:()=>{ctx.loginShown=true;},loadPreferencesForDevice:()=>{},loadFactory:()=>{},todayStr:()=> '2026-11-09',flashReturnRow:()=>{},tourDone:()=>true,onRemoteChange:()=>{},onRealtimeStatus:()=>{},installScheduleChat:()=>({refresh:()=>{},destroy:()=>{}}),setInterval:()=>0,workdaysFrom:()=>Array.from({length:8},(_,i)=>`2026-11-${String(9+i).padStart(2,'0')}`),autoPlan:()=>[],nowAbs:()=>0};
 vm.createContext(ctx);
 vm.runInContext(slice('function normalizeState(){','async function reloadFromStore(')+slice('function commit(','/* ===== 5.')+slice('function queueSync(','function changedWriteSession(')+slice('function pushUndo()','function commit(')+slice('function makeDemo(){','/* ===== 4.')+slice('async function start(){','const crossFactoryUI='),ctx);
 const deletion=slice('  "m-emp-del":a=>{','  "m-proc":');vm.runInContext('var actions={'+deletion+'};',ctx);
 return {ctx,store,data,writes:()=>writes,failWrites:value=>{mode=value;}};
}

const plain=value=>JSON.parse(JSON.stringify(value));
async function restart(h){await h.ctx.start();await h.ctx.syncChain;}
function unrelated(s){return plain({machines:s.machines,products:s.products,orders:s.orders,memos:s.memos});}

test('confirmed final-employee deletion survives local restart without replacing unrelated records',async t=>{
  const h=await harness(t);await h.store.sync(h.ctx.S);await restart(h);
  const before=unrelated(h.ctx.S);
  h.ctx.UI.modal={id:'sole'};h.ctx.actions['m-emp-del']({});await h.ctx.syncChain;
  assert.equal(h.ctx.SYNC.state,'ok');
  const saved=await h.store.load();assert.deepEqual(saved.employees,[]);assert.deepEqual(unrelated(saved),before);
  const bytes=h.data.get(KEY),writes=h.writes();
  await restart(h);
  assert.equal(h.writes(),writes,'startup must not write a replacement snapshot');
  assert.equal(h.data.get(KEY),bytes,'saved bytes remain untouched');
  assert.deepEqual(plain(h.ctx.S.employees),[]);assert.equal(h.ctx.S.demo,false);
  assert.deepEqual(unrelated(h.ctx.S),before);assert.deepEqual(await h.store.load(),saved);
});

test('valid all-empty local snapshot remains empty and is not automatically saved',async t=>{
  const h=await harness(t),empty=initial();
  for(const k of ['employees','machines','products','orders','blocks','log','memos'])empty[k]=[];
  await h.store.sync(empty);const bytes=h.data.get(KEY),writes=h.writes();await restart(h);
  assert.equal(h.writes(),writes);assert.equal(h.data.get(KEY),bytes);assert.equal(h.ctx.S.demo,false);
  for(const k of ['employees','machines','products','orders','blocks','log','memos'])assert.deepEqual(plain(h.ctx.S[k]),[],k);
});

test('absent local snapshot still creates and saves first-use demo exactly once',async t=>{
  const h=await harness(t);assert.equal(await h.store.load(),null);await restart(h);
  assert.equal(h.writes(),1);assert.equal(h.ctx.S.demo,true);assert.equal(h.ctx.S.employees.length,5);
  assert.deepEqual(await h.store.load(),plain(h.ctx.S));
  const bytes=h.data.get(KEY);await restart(h);assert.equal(h.writes(),1);assert.equal(h.data.get(KEY),bytes);
});

test('normal nonempty reload and deletion Undo continue to persist through LocalStore',async t=>{
  const h=await harness(t);await h.store.sync(h.ctx.S);const bytes=h.data.get(KEY);await restart(h);
  assert.equal(h.data.get(KEY),bytes);assert.equal(h.writes(),1);
  h.ctx.UI.modal={id:'sole'};h.ctx.actions['m-emp-del']({});await h.ctx.syncChain;
  assert.equal((await h.store.load()).employees.length,0);await h.ctx.undo();
  assert.equal((await h.store.load()).employees[0].id,'sole');
  const restored=h.data.get(KEY),writes=h.writes();await restart(h);
  assert.equal(h.data.get(KEY),restored);assert.equal(h.writes(),writes);assert.equal(h.ctx.S.employees[0].id,'sole');
});

test('empty cloud state is retained without a write and cloud read errors still reject',async t=>{
  const h=await harness(t);h.ctx.normalizeState();const cloud=plain(h.ctx.S);cloud.employees=[];
  h.ctx.STORE={kind:'supabase',init:async()=>({}),can:()=>true,load:async()=>structuredClone(cloud),subscribe:()=>{},sync:()=>assert.fail('no cloud startup write')};
  await restart(h);assert.deepEqual(unrelated(h.ctx.S),unrelated(cloud));assert.equal(h.ctx.S.demo,false);assert.equal(h.writes(),0);
  h.ctx.STORE.load=async()=>{throw new Error('synthetic cloud read failure');};
  await assert.rejects(h.ctx.start(),/synthetic cloud read failure/);assert.equal(h.writes(),0);
});

test('cloud setup requiring login does not load data or initialize a demo',async t=>{
  const h=await harness(t),before=plain(h.ctx.S);
  h.ctx.STORE={kind:'supabase',init:async()=>({needLogin:true}),load:()=>assert.fail('login must precede load')};
  await restart(h);assert.equal(h.ctx.loginShown,true);assert.deepEqual(plain(h.ctx.S),before);assert.equal(h.writes(),0);
});

test('first-use demo save failure still reports error and a later retry persists it',async t=>{
  const h=await harness(t);h.failWrites('quota');await restart(h);
  assert.equal(h.ctx.SYNC.state,'error');assert.equal(h.data.has(KEY),false);
  h.failWrites('ok');assert.equal(await h.ctx.commit(null),true);assert.equal(h.ctx.SYNC.state,'ok');
  assert.equal((await h.store.load()).demo,true);
});

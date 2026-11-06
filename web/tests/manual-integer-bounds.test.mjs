import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {I18N,tx} from '../src/i18n.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';

const appUrl=new URL('../src/app.js',import.meta.url),app=readFileSync(appUrl,'utf8');
// Supports the combined product-rate / save-confirmation source in compatibility checks.
const rateImport=app.match(/import\s*{\s*productRate\s*}\s*from\s*['"]([^'"]+)['"]/);
const productRate=rateImport?(await import(new URL(rateImport[1],appUrl))).productRate:undefined;
function segment(a,b){const start=app.indexOf(a),end=app.indexOf(b,start);assert.ok(start>=0&&end>start);return app.slice(start,end);}
const pid='22222222-2222-4222-8222-222222222222',oid='44444444-4444-4444-8444-444444444444';
const product=()=>({id:pid,name:'BOUND-PRODUCT',steps:[{proc:'裁切',factory:1,rate:2,batch:0}]});
function harness(kind='batch',store={kind:'local',sync:async()=>{}},state={products:[product()],orders:[],blocks:[],log:[]}){
 const calls={sync:0,preview:0,toasts:[]},nodes=[];
 const c={S:state,STORE:store,UI:{modal:{t:kind==='batch'?'products':'ord',draft:kind==='batch'?structuredClone(state.products):{id:oid,code:'BOUND-ORDER',pid,qty:1,due:'2026-12-01',pri:2}}},productRate,structuredClone,tx,uid:randomUUID,readOnly:true,canOrders:()=>true,canMaster:()=>true,canPermission:()=>true,canPermissionRaw:()=>true,factoryOf:s=>s.factory||1,todayStr:()=> '2026-11-06',sum:(a,f)=>a.reduce((n,x)=>n+f(x),0),STRAT_ORDER:[],undoStack:[],SOLVER:null,SYNC:{state:'ok',msg:''},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,
 document:{querySelectorAll:()=>nodes},render:()=>{},renderModal:()=>{},updateSyncChip:()=>{},maybeReload:()=>{},runAuto:()=>{},openPlans:()=>{calls.preview++;},reloadFromStore:async()=>{throw Error('unexpected recovery');}};
 c.prod=id=>c.S.products.find(p=>p.id===id);c.order=id=>c.S.orders.find(o=>o.id===id);c.toast=(...args)=>calls.toasts.push(args);c.closeModal=()=>{c.UI.modal=null;};
 const active=Object.create(store);active.sync=async(...args)=>{calls.sync++;return store.sync(...args);};c.STORE=active;
 c.UI.modal.productOwner={store:active,writer:active.session?.user?.id,epoch:active.authEpoch};c.UI.modal.productBase=JSON.stringify(state);
 vm.createContext(c);vm.runInContext(segment('function setPath(','function renderModal(')+segment('function pushUndo()','async function undo(')+segment('function queueSync(','function changedWriteSession(')+'const actions={'+segment('"p-save":','"b-emp":')+segment('"o-save":','"o-del":')+'};this.save=actions["'+(kind==='batch'?'p-save':'o-save')+'"];',c);
 return {c,calls,nodes,input:(raw,path=kind==='batch'?'0.steps.0.batch':'qty')=>{nodes.push({type:'number',value:String(raw),dataset:{bind:path},hasAttribute:()=>false});}};
}
async function save(h){await h.c.save();await h.c.syncChain;}
function noEffects(h,before,modal){assert.equal(JSON.stringify(h.c.S),before);assert.equal(h.c.undoStack.length,0);assert.equal(h.calls.sync,0);assert.equal(h.calls.preview,0);assert.equal(h.c.UI.modal,modal);assert.equal(h.calls.toasts.length,1);assert.match(h.calls.toasts[0][0],/2147483647/);}

test('real syncInputs and manual handlers reject normalized overflow before state, undo, preview or writes',async()=>{
 for(const kind of ['batch','qty'])for(const raw of ['2147483648','2147483647.5','9007199254740993','1e308','Infinity'])for(const readOnly of [true,false]){
  const h=harness(kind),before=JSON.stringify(h.c.S),modal=h.c.UI.modal;h.c.readOnly=readOnly;h.input(raw);await save(h);noEffects(h,before,modal);assert.equal(h.nodes[0].value,raw);
  const draft=kind==='batch'?modal.draft[0].steps[0].batch:modal.draft.qty;assert.equal(draft,+raw); // Infinity never passes through JSON cloning to null.
 }
 // One invalid later product must prevent even an earlier valid rename from being written.
 const h=harness(),before=JSON.stringify(h.c.S),modal=h.c.UI.modal;modal.draft[0].name='Unsent rename';modal.draft.push({...product(),id:randomUUID(),name:'Second'});h.input('2147483648','1.steps.0.batch');await save(h);noEffects(h,before,modal);
});

test('manual normalization retains fractions, negative batch clamp and blank batch behavior',async()=>{
 for(const kind of ['batch','qty'])for(const [raw,expected] of [['2147483647',2147483647],['2147483647.4',2147483647],['1.5',2],...(kind==='batch'?[['-1',0],['',0],['0',0],['NaN',0],['-Infinity',0]]:[])]){
  const h=harness(kind);h.input(raw);await save(h);assert.equal(h.calls.sync,1);assert.equal(h.c.SYNC.state,'ok');assert.equal(kind==='batch'?h.c.S.products[0].steps[0].batch:h.c.S.orders[0].qty,expected);
 }
 for(const raw of ['','0','-1']){const h=harness('qty');h.input(raw);await save(h);assert.equal(h.calls.sync,0);assert.equal(h.c.undoStack.length,0);assert.ok(h.c.UI.modal);}
});

test('existing order overflow preserves quantity and blocks; valid scheduler-enabled quantity reaches preview',async()=>{
 for(const readOnly of [true,false]){
  const h=harness('qty');h.c.S.orders=[{id:oid,code:'EXISTING',pid,qty:10,due:'2026-12-01',pri:2}];h.c.S.blocks=[{id:'existing-block',oid,step:0,qty:5}];h.c.UI.modal.draft=structuredClone(h.c.S.orders[0]);h.c.readOnly=readOnly;
  const before=JSON.stringify(h.c.S),modal=h.c.UI.modal;h.input('2147483648');await save(h);noEffects(h,before,modal);assert.equal(h.c.S.orders[0].qty,10);assert.equal(h.c.S.blocks[0].qty,5);
 }
 const h=harness('qty');h.c.readOnly=false;h.input('2147483647');let event;
 h.c.openPlans=(...args)=>{h.calls.preview++;event=args[5].event;};const before=JSON.stringify(h.c.S);await save(h);
 assert.equal(h.calls.preview,1);assert.equal(event.order.qty,2147483647);assert.equal(JSON.stringify(h.c.S),before);assert.equal(h.calls.sync,0);assert.equal(h.c.undoStack.length,0);
});

test('both rendered number inputs expose the int32 maximum and integer step',()=>{
 assert.match(app,/type="number" min="1" max="2147483647" step="1" id="f-qty"/);
 assert.match(app,/type="number" min="0" max="2147483647" step="1" data-bind="[^\n]+\.batch/);
});

test('both rejection messages have English, Vietnamese and Thai translations',async()=>{
 try{for(const kind of ['batch','qty'])for(const lang of ['en','vi','th']){I18N.lang=lang;const h=harness(kind);h.input('2147483648');await save(h);const message=h.calls.toasts[0][0];assert.match(message,/2147483647/);assert.doesNotMatch(message,/不可超過/);if(kind==='batch')assert.ok(message.includes('BOUND-PRODUCT'));}}finally{I18N.lang='zh-TW';}
});

test('real handlers and SupabaseStore persist valid maximum/normalizations and reject overflow with zero SQL effects',async()=>{
 const db=await makeDb();try{
  const actor=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[actor,'bounds@synthetic']);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
  const fake=new FakeSupabase(db,{});fake.uid=actor;const store=new SupabaseStore(fake);await store.init();
  for(const [raw,expected] of [['2147483647',2147483647],['1.5',2],['-1',0],['',0]]){
   const S=await store.load();S.products.push({...product(),id:randomUUID(),name:randomUUID()});const h=harness('batch',store,S),index=S.products.length-1;h.input(raw,index+'.steps.0.batch');await save(h);assert.equal(h.c.SYNC.state,'ok',h.c.SYNC.msg);assert.equal((await db.query('select transfer_batch from product_steps where product_id=$1',[S.products[index].id])).rows[0].transfer_batch,expected);
  }
  const parent=(await store.load()).products[0];
  for(const [raw,expected] of [['2147483647',2147483647],['1.5',2]]){
   const h=harness('qty',store,await store.load());Object.assign(h.c.UI.modal.draft,{id:randomUUID(),code:randomUUID(),pid:parent.id});const id=h.c.UI.modal.draft.id;h.input(raw);await save(h);assert.equal(h.c.SYNC.state,'ok',h.c.SYNC.msg);assert.equal((await db.query('select qty from orders where id=$1',[id])).rows[0].qty,expected);
  }
  const snapshot=async()=>JSON.stringify((await db.query("select jsonb_build_object('products',(select jsonb_agg(p order by id) from products p),'steps',(select jsonb_agg(p order by product_id,seq) from product_steps p),'orders',(select jsonb_agg(o order by id) from orders o),'version',(select version from schedule_state)) as data")).rows);
  for(const kind of ['batch','qty'])for(const raw of ['2147483648','Infinity']){
   const S=await store.load(),h=harness(kind,store,S),before=JSON.stringify(S),modal=h.c.UI.modal,dbBefore=await snapshot();if(kind==='batch'){modal.draft.push({...product(),id:randomUUID(),name:randomUUID()});h.input(raw,(modal.draft.length-1)+'.steps.0.batch');}else{modal.draft.pid=parent.id;h.input(raw);}await save(h);noEffects(h,before,modal);assert.equal(await snapshot(),dbBefore);
  }
 }finally{await db.close();}
});

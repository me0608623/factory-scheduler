import {pendingBlockStore} from "./pending-block-store.mjs";
import {requestQuery} from "./request-query.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {UI_TEXT} from '../src/i18n.js';
const appUrl=new URL('../src/app.js',import.meta.url);
const source=readFileSync(appUrl,'utf8');
// Follow the real app import when combined with product-rate validation. The
// baseline has no helper, so do not invent one or replace its guard with a stub.
const rateImport=source.match(/import\s*{\s*productRate\s*}\s*from\s*['"]([^'"]+)['"]/);
const productRate=rateImport?(await import(new URL(rateImport[1],appUrl))).productRate:undefined;
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const product={id:'22222222-2222-4222-8222-222222222222',name:'ACK-PRODUCT',steps:[{proc:'CUT',factory:1,rate:2,batch:0}]};
const blank=()=>({employees:[],machines:[],products:[],orders:[],blocks:[],log:[]});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(store={kind:'local'},state=blank()){
  const events=[],pending=deferred(),modal={t:'products'},c={STORE:store,S:state,UI:{modal},SYNC:{state:'ok',msg:''},PV:null,readOnly:false,syncPending:0,syncChain:Promise.resolve(),canMaster:()=>true,canPermission:()=>true,structuredClone,
    ...(rateImport?{productRate}:{}),syncInputs:()=>{},factoryOf:s=>s.factory||1,tx:x=>x,esc:x=>String(x).replaceAll('<','&lt;'),FACTORIES:[1,2],factoryName:String,
    uid:()=> '33333333-3333-4333-8333-333333333333',render:()=>{},renderModal:()=>events.push({type:'render'}),undoStack:[],toast:(text,label,callback)=>events.push({text,label,callback}),SOLVER:null,runAuto:()=>events.push({type:'auto'})};
  c.prod=id=>c.S.products.find(p=>p.id===id);c.order=id=>c.S.orders.find(o=>o.id===id);c.pushUndo=()=>c.undoStack.push(JSON.stringify(c.S));c.closeModal=()=>{c.UI.modal=null;};
  c.commit=entry=>{events.push({type:'commit',entry});if(entry)c.S.log.unshift(entry);return pending.promise;};
  vm.createContext(c);vm.runInContext('const actions={'+section('"p-addstep":','"b-emp":')+'};this.actions=actions;this.save=actions["p-save"];const views={'+section('products(m){','/* ---------- 單一方塊')+'};this.view=views.products;',c);
  c.view(modal);modal.draft.push(structuredClone(product));return {c,modal,events,pending,success:()=>events.filter(e=>e.text?.startsWith('工序已更新'))};
}
function realQueue(f){Object.assign(f.c,{syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,updateSyncChip:()=>{},maybeReload:()=>{},reloadFromStore:async()=> 'applied'});vm.runInContext(section('function commit(','async function undo(')+section('function queueSync(entry){','// ---------- 別人改了'),f.c);}
test('product confirmation waits, freezes inputs, ignores repeated saves, then offers rescheduling only after ACK',async()=>{
  const f=fixture(),task=f.c.save();await f.c.save();assert.equal(f.modal.saving,true);assert.equal(f.c.UI.modal,f.modal);assert.equal(f.success().length,0);
  assert.equal(f.events.filter(e=>e.type==='commit').length,1);assert.equal(f.c.undoStack.length,1);assert.notEqual(f.c.S.products,f.modal.draft);
  const view=f.c.view(f.modal);assert.match(view.body,/role="status"/);assert.match(view.body,/data-bind="0.name"[^>]*disabled/);assert.match(view.foot,/p-save" disabled/);assert.match(view.foot,/close" disabled/);
  f.pending.resolve(true);await task;assert.equal(f.c.UI.modal,null);assert.equal(f.success().length,1);assert.equal(f.events.filter(e=>e.type==='auto').length,0);f.success()[0].callback();assert.equal(f.events.filter(e=>e.type==='auto').length,1);
});
test('failed product save retains input and isolated candidate; retry adds no undo or log',async()=>{
  const f=fixture();f.modal.draft[0].name='  Input  ';const task=f.c.save();f.pending.resolve(false);await task;
  assert.equal(f.success().length,0);assert.equal(f.c.UI.modal,f.modal);assert.equal(f.modal.draft[0].name,'  Input  ');assert.equal(f.c.S.products[0].name,'Input');
  const view=f.c.view(f.modal);assert.match(view.body,/role="alert"/);assert.match(view.body,/關閉不會撤銷/);assert.match(view.foot,/重試儲存/);assert.doesNotMatch(view.body,/data-act="p-add/);
  for(const name of ['p-add','p-addstep','p-delstep'])f.c.actions[name]({dataset:{v:'0'}});assert.equal(f.modal.draft.length,1);assert.equal(f.modal.draft[0].steps.length,1);
  f.c.document={querySelectorAll:()=>[{type:'text',hasAttribute:()=>false,value:'unsaved field',dataset:{bind:'0.name'}}]};f.c.setPath=(o,key,value)=>{const [i,k]=key.split('.');o[i][k]=value;};vm.runInContext(section('function syncInputs(){','function renderModal(){'),f.c);f.c.syncInputs();assert.equal(f.c.S.products[0].name,'Input');
  const candidate=f.c.S;f.c.commit=async entry=>{assert.equal(entry,null);return true;};await f.c.save();assert.equal(f.c.S,candidate);assert.equal(f.c.S.log.length,1);assert.equal(f.c.undoStack.length,1);assert.equal(f.success().length,1);
});
test('stale, wrong modal, signed-out and denied entry have zero write, undo or state side effects',async()=>{
  for(const kind of ['stale','modal','permission','owner','signed-out']){const f=fixture(kind==='signed-out'?{kind:'supabase',session:null}:undefined);if(kind==='stale')f.c.S.log.push({title:'new'});if(kind==='modal')f.c.UI.modal={t:'settings'};if(kind==='permission')f.c.canMaster=()=>false;if(kind==='owner')f.c.STORE={...f.c.STORE};const before=JSON.stringify(f.c.S);await f.c.save();assert.equal(JSON.stringify(f.c.S),before,kind);assert.equal(f.c.undoStack.length,0,kind);assert.equal(f.events.filter(e=>e.type==='commit').length,0,kind);assert.equal(f.success().length,0,kind);}
});
test('late owner, modal, state, content or permission changes cannot announce success or touch newer UI',async()=>{
  for(const kind of ['store','user','epoch','modal','state','mutation','permission']){const f=fixture({kind:'supabase',session:{user:{id:'old'}},authEpoch:0});const task=f.c.save();if(kind==='store')f.c.STORE={...f.c.STORE};if(kind==='user')f.c.STORE.session.user.id='new';if(kind==='epoch')f.c.STORE.authEpoch++;if(kind==='modal')f.c.UI.modal={t:'settings'};if(kind==='state')f.c.S=blank();if(kind==='mutation')f.c.S.products[0].name='newer';if(kind==='permission')f.c.canMaster=()=>false;const state=f.c.S,modal=f.c.UI.modal;f.pending.resolve(true);await task;assert.equal(f.success().length,0,kind);assert.equal(f.c.S,state);assert.equal(f.c.UI.modal,modal);}
});
test('old reschedule callback cannot act after owner, epoch, state or permission changes',async()=>{
  for(const kind of ['store','user','epoch','state','mutation','permission','busy','error']){const f=fixture({kind:'supabase',session:{user:{id:'old'}},authEpoch:0}),task=f.c.save();f.pending.resolve(true);await task;const callback=f.success()[0].callback;if(kind==='store')f.c.STORE={...f.c.STORE};if(kind==='user')f.c.STORE.session.user.id='new';if(kind==='epoch')f.c.STORE.authEpoch++;if(kind==='state')f.c.S=blank();if(kind==='mutation')f.c.S.products[0].name='newer';if(kind==='permission')f.c.canMaster=()=>false;if(kind==='busy'||kind==='error')f.c.SYNC.state=kind;callback();assert.equal(f.events.filter(e=>e.type==='auto').length,0,kind);assert.match(f.events.at(-1).text,/重新開啟產品工序/);}
});
test('recovery or another owner cannot retry a frozen old candidate',async()=>{
  for(const kind of ['state','mutation','store','user','epoch']){const f=fixture({kind:'supabase',session:{user:{id:'old'}},authEpoch:0}),task=f.c.save();f.pending.resolve(false);await task;if(kind==='state')f.c.S=blank();if(kind==='mutation')f.c.S.products[0].name='remote';if(kind==='store')f.c.STORE={...f.c.STORE};if(kind==='user')f.c.STORE.session.user.id='new';if(kind==='epoch')f.c.STORE.authEpoch++;const before=JSON.stringify(f.c.S);await f.c.save();assert.equal(JSON.stringify(f.c.S),before);assert.equal(f.events.filter(e=>e.type==='commit').length,1);assert.equal(f.modal.productRetryable,false);assert.doesNotMatch(f.c.view(f.modal).foot,/p-save/);}
});
test('actual close guard blocks a saving product dialog but permits closing failed or unsaved input',async()=>{
  const f=fixture();Object.assign(f.c,{cancelPlanCalculation:()=>{},$:()=>null,maybeReload:()=>{},modalReturnFocus:null,requestAnimationFrame:fn=>fn()});vm.runInContext(section('function closeModal(){','function ownsLegacyRequest('),f.c);
  const task=f.c.save();f.c.closeModal();assert.equal(f.c.UI.modal,f.modal);f.pending.resolve(false);await task;f.c.closeModal();assert.equal(f.c.UI.modal,null);assert.equal(f.c.S.products.length,1);
  const untouched=fixture();untouched.c.closeModal();assert.equal(untouched.c.S.products.length,0);
});
test('actual commit/queueSync/LocalStore quota is unconfirmed; explicit retry stores one log and undo',async()=>{
  const old=globalThis.localStorage;let fail=true,writes=0,stored=null;globalThis.localStorage={getItem:()=>stored,setItem:(_k,v)=>{writes++;if(fail)throw Error('quota');stored=v;}};
  try{const f=fixture(new LocalStore());realQueue(f);await f.c.save();assert.equal(f.success().length,0);assert.equal(f.c.SYNC.state,'error');assert.match(f.c.SYNC.msg,/儲存空間不足/);assert.equal(f.c.UI.modal,f.modal);fail=false;await f.c.save();assert.equal(f.success().length,1);assert.equal(writes,2);assert.equal(JSON.parse(stored).log.length,1);assert.equal(f.c.undoStack.length,1);}finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('actual SupabaseStore and migrated SQL ACK gates product success and plansDb',async()=>{
  const db=await makeDb();try{const boss='11111111-1111-4111-8111-111111111111';await db.query("insert into auth.users(id,email) values($1,'test@invalid')",[boss]);await db.query("update profiles set role='boss' where user_id=$1",[boss]);const sb=new FakeSupabase(db,{test:{id:boss,password:'test-only'}});await sb.auth.signInWithPassword({email:'test',password:'test-only'});const store=new SupabaseStore(sb);await store.init();const state=await store.load();const f=fixture(store,state);realQueue(f);
    const gate=deferred(),started=deferred(),from=sb.from.bind(sb);sb.from=t=>{const q=from(t);if(t==='products'){const up=q.upsert.bind(q);q.upsert=(...args)=>{const request=up(...args),wrapped={setHeader(){return wrapped;},then(resolve,reject){started.resolve();return gate.promise.then(()=>request).then(resolve,reject);}};return wrapped;};}return q;};
    let calls=0;Object.assign(f.c,{SOLVER:{up:true,capabilities:['work_assignments_v1'],plansDb:async()=>{calls++;assert.equal((await db.query('select count(*)::int n from products where id=$1',[product.id])).rows[0].n,1);return {options:[]};}},STRAT_AUTO:[],todayStr:()=> '2026-11-06',nowMin:()=>480,assignments:()=>[],planTimeLimit:()=>3});vm.runInContext(section('function runAuto(){','/* ===== 11.')+section('let planCalculationJob=null;','function enterPreview('),f.c);
    const task=f.c.save();await started.promise;assert.equal(f.success().length,0);assert.equal(calls,0);assert.equal(f.c.SYNC.state,'busy');assert.equal((await db.query('select count(*)::int n from products where id=$1',[product.id])).rows[0].n,0);gate.resolve();await task;assert.equal(f.c.SYNC.state,'ok');assert.equal(f.success().length,1);f.success()[0].callback();await new Promise(r=>setTimeout(r,10));assert.equal(calls,1);assert.equal((await db.query("select count(*)::int n from change_sets where title='修改產品工序'")).rows[0].n,1);
  }finally{await db.close();}
});
test('product pending and failure messages have all UI translations and escape errors',()=>{const f=fixture();f.modal.productError='<unsafe>';assert.match(f.c.view(f.modal).body,/&lt;unsafe>/);for(const key of ['正在儲存產品工序，請稍候；此時無法取消。','產品工序尚未確認儲存；已保留本次內容且暫停編輯，請重試儲存。關閉不會撤銷本次修改。','產品資料或登入狀態已變更，請關閉後重新開啟產品工序。'])for(const lang of ['en','vi','th'])assert.ok(UI_TEXT[key][lang]);});
test('actual renderModal disables product controls and overlay close while saving',async()=>{
  const f=fixture(),controls=[{disabled:false},{disabled:false}],box={focus(){}},ov={scrollTop:0,querySelector:()=>box,addEventListener:(_event,fn)=>{ov.click=fn;}},root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>controls};
  Object.assign(f.c,{$:id=>id==='#modal-root'?root:id==='#ov'?ov:null,MODALS:{products:f.c.view},modalFocusFromToken:()=>null,modalFocusable:()=>[],modalReturnFocus:null,requestAnimationFrame:fn=>fn(),cancelPlanCalculation:()=>{},maybeReload:()=>{}});
  f.c.document={querySelector:()=>null,activeElement:null};
  vm.runInContext(section('function sizeBlockDetailModal(){','function rerender(){')+section('function closeModal(){','function ownsLegacyRequest('),f.c);
  const task=f.c.save();assert.match(root.innerHTML,/aria-busy="true"/);assert.ok(controls.every(c=>c.disabled));ov.click({target:ov});assert.equal(f.c.UI.modal,f.modal);f.pending.resolve(false);await task;assert.match(root.innerHTML,/aria-busy="false"/);ov.click({target:ov});assert.equal(f.c.UI.modal,null);
});
test('actual SupabaseStore SQL transport failure keeps candidate; explicit retry commits once',async()=>{
  const db=await makeDb();try{const boss='11111111-1111-4111-8111-111111111111';await db.query("insert into auth.users(id,email) values($1,'test@invalid')",[boss]);await db.query("update profiles set role='boss' where user_id=$1",[boss]);const sb=new FakeSupabase(db,{test:{id:boss,password:'test-only'}});await sb.auth.signInWithPassword({email:'test',password:'test-only'});const store=new SupabaseStore(sb);await store.init();const f=fixture(store,await store.load());realQueue(f);
    const from=sb.from.bind(sb);let fail=true;sb.from=t=>{const q=from(t);if(t==='products'){const up=q.upsert.bind(q);q.upsert=(...args)=>{const request=up(...args),wrapped={setHeader(){return wrapped;},then(resolve,reject){return Promise.resolve(fail?{data:null,error:{message:'TEST-OFFLINE'}}:request).then(resolve,reject);}};return wrapped;};}return q;};
    await f.c.save();assert.equal(f.success().length,0);assert.match(f.c.SYNC.msg,/TEST-OFFLINE/);assert.equal(f.c.UI.modal,f.modal);assert.equal((await db.query('select count(*)::int n from products where id=$1',[product.id])).rows[0].n,0);fail=false;await f.c.save();assert.equal(f.success().length,1);assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.log.filter(e=>e.title==='修改產品工序').length,1);assert.equal((await db.query('select count(*)::int n from products where id=$1',[product.id])).rows[0].n,1);
    // Catalog retries with null entry do not write a duplicate audit event.
    assert.equal((await db.query("select count(*)::int n from change_sets where title='修改產品工序'")).rows[0].n,0);
  }finally{await db.close();}
});
test('stale rejection captures unbound DOM input without replacing live state; changed owner releases original busy UI',async()=>{
  const f=fixture();f.c.document={querySelectorAll:()=>[{type:'text',hasAttribute:()=>false,value:'Keep my typed name',dataset:{bind:'0.name'}}]};f.c.setPath=(o,key,value)=>{const [i,k]=key.split('.');o[i][k]=value;};vm.runInContext(section('function syncInputs(){','function renderModal(){'),f.c);f.c.S.log.push({title:'remote'});const state=JSON.stringify(f.c.S);await f.c.save();assert.equal(f.modal.draft[0].name,'Keep my typed name');assert.equal(JSON.stringify(f.c.S),state);assert.match(f.c.view(f.modal).body,/Keep my typed name/);
  const g=fixture({kind:'supabase',session:{user:{id:'old'}},authEpoch:0}),task=g.c.save();g.c.STORE.authEpoch++;g.pending.resolve(true);await task;assert.equal(g.modal.saving,false);assert.equal(g.modal.productRetryable,false);assert.match(g.modal.productError,/登入狀態已變更/);assert.equal(g.success().length,0);assert.doesNotMatch(g.c.view(g.modal).foot,/disabled/);
});

test('combined numeric validation never submits or announces success for invalid product drafts',async()=>{
  assert.equal(typeof productRate,'function','exercise the integrated precision guard');
  for(const change of [
    {rate:'0.0001'},{rate:'1.0000000000000001'},{rate:'99999.9994'},
    {rate:'100000'},{rate:Infinity},{batch:2147483648},{batch:Infinity},
    {rate:'0.0014',batch:2147483648},
  ]){
    const f=fixture(),state=f.c.S,before=JSON.stringify(state);
    Object.assign(f.modal.draft[0].steps[0],change);
    await f.c.save();
    assert.equal(f.c.S,state);assert.equal(JSON.stringify(state),before);
    assert.equal(f.c.undoStack.length,0);assert.equal(f.events.filter(e=>e.type==='commit').length,0);
    assert.equal(f.success().length,0);assert.equal(f.events.filter(e=>e.type==='auto').length,0);
    assert.equal(f.c.UI.modal,f.modal);assert.equal(f.modal.productCandidate,undefined);
    assert.equal(f.modal.saving,undefined);
  }
});
test('combined precision and batch boundaries remain gated on acknowledgement and retain exact candidate on retry',async()=>{
  for(const rate of ['0.001','1.001','99999.999','1000e-6','99999999e-3']){
    const f=fixture();Object.assign(f.modal.draft[0].steps[0],{rate,batch:2147483647});
    const task=f.c.save();assert.equal(f.success().length,0);assert.equal(f.modal.saving,true);
    assert.equal(f.c.S.products[0].steps[0].rate,Number(rate));
    assert.equal(f.c.S.products[0].steps[0].batch,2147483647);
    f.pending.resolve(false);await task;assert.equal(f.success().length,0);
    const candidate=f.c.S;f.c.commit=async entry=>{assert.equal(entry,null);return true;};
    await f.c.save();assert.equal(f.c.S,candidate);assert.equal(f.success().length,1);
    assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.log.length,1);
  }
});

test('existing unknown schedule receipt preserves typed product draft without live or undo changes',async()=>{
  const p=await pendingBlockStore(),f=fixture(p.store,p.initial);realQueue(f);
  f.c.document={querySelectorAll:()=>[{type:'text',hasAttribute:()=>false,value:'Typed while blocked',dataset:{bind:'0.name'}}]};
  f.c.setPath=(o,key,value)=>{const [i,k]=key.split('.');o[i][k]=value;};
  vm.runInContext(section('function syncInputs(){','function renderModal(){'),f.c);
  const before=JSON.stringify(f.c.S),state=f.c.S,calls=p.calls.length;
  for(let i=0;i<2;i++){
    await f.c.save();assert.equal(f.c.S,state);assert.equal(JSON.stringify(f.c.S),before);
    assert.equal(f.c.undoStack.length,0);assert.equal(p.calls.length,calls);assert.equal(f.success().length,0);
    assert.equal(f.modal.draft[0].name,'Typed while blocked');assert.equal(f.modal.productRetryable,false);
    assert.equal(f.modal.productError,p.store.pendingScheduleSaveMessage());
    assert.match(f.c.view(f.modal).body,/完整重新整理/);assert.doesNotMatch(f.c.view(f.modal).foot,/data-act="p-save"/);
  }
});

async function productBehindSchedule(){
  const p=await pendingBlockStore({pending:false});p.initial.blocks[0].pin=true;
  const f=fixture(p.store,p.initial);realQueue(f);
  const entered=deferred(),response=deferred(),calls=[];
  p.store.sb.rpc=(name,args)=>requestQuery(()=>{calls.push({name,args});entered.resolve();return response.promise;});
  const first=f.c.queueSync(null);await entered.promise;
  return {p,f,first,response,calls};
}
test('unknown preceding schedule save never installs queued product draft or an undo entry',async()=>{
  const {p,f,first,response,calls}=await productBehindSchedule(),state=f.c.S,before=JSON.stringify(state);
  const task=f.c.save();assert.equal(f.modal.saving,true);assert.equal(f.c.S,state);assert.equal(f.c.undoStack.length,0);
  await f.c.save(); // Repeated clicks while the earlier write is in flight do nothing.
  response.resolve({data:null,error:null});await first;await task;
  assert.equal(f.c.S,state);assert.equal(JSON.stringify(state),before);assert.equal(f.c.undoStack.length,0);
  assert.equal(f.modal.productCandidate,undefined);assert.equal(f.modal.draft[0].name,product.name);
  assert.equal(f.modal.productError,p.store.pendingScheduleSaveMessage());assert.equal(f.modal.productRetryable,false);
  assert.doesNotMatch(f.c.view(f.modal).foot,/data-act="p-save"/);assert.equal(f.success().length,0);
  await f.c.save();assert.equal(calls.length,1);assert.equal(f.modal.productError,p.store.pendingScheduleSaveMessage());
});

test('session, modal and newer-state changes during queue wait never install or roll back products',async()=>{
  for(const change of ['store','user','epoch','signed-out','modal','state','permission']){
    const {p,f,first,response,calls}=await productBehindSchedule(),task=f.c.save();
    if(change==='permission')f.c.canMaster=()=>false;
    if(change==='store')f.c.STORE={kind:'local'};
    if(change==='user')p.store.session={user:{id:'another'},access_token:'other-test-token'};
    if(change==='epoch')p.store.authEpoch++;
    if(change==='signed-out')p.store.session=null;
    if(change==='modal')f.c.UI.modal={t:'settings'};
    if(change==='state')f.c.S={...f.c.S,log:[{title:'newer state'}]};
    const state=f.c.S,before=JSON.stringify(state),modal=f.c.UI.modal;
    response.resolve({data:null,error:null});await first;await task;
    assert.equal(f.c.S,state,change);assert.equal(JSON.stringify(state),before,change);assert.equal(f.c.UI.modal,modal,change);
    assert.equal(f.c.undoStack.length,0,change);assert.equal(calls.length,1,change);assert.equal(f.success().length,0,change);
    assert.equal(f.modal.saving,false,change);
  }
});

test('clean preceding receipt and same-owner token refresh still permit the product save',async()=>{
  const {p,f,first,response,calls}=await productBehindSchedule(),task=f.c.save(),writes=[];
  p.store.session={...p.store.session,access_token:'refreshed-test-token'};
  p.store.sb.from=table=>({
    select:()=>({setHeader(){return this;},single:async()=>({data:{version:p.store.version},error:null})}),
    upsert:rows=>requestQuery(()=>{writes.push({table,rows});return {data:null,error:null};}),
  });
  response.resolve({data:'44444444-4444-4444-8444-444444444444',error:null});await first;await task;
  assert.equal(p.store.pendingScheduleSaveMessage(),'');assert.equal(f.success().length,1);
  assert.equal(f.c.UI.modal,null);assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.products[0].name,product.name);
  assert.ok(writes.some(x=>x.table==='products'));assert.ok(calls.length>=2);
});

test('a product save that itself gets an unknown schedule receipt cannot advertise or resubmit retry',async()=>{
  const p=await pendingBlockStore({pending:false}),f=fixture(p.store,p.initial),writes=[];realQueue(f);
  p.store.sb.from=table=>({
    select:()=>({setHeader(){return this;},single:async()=>({data:{version:p.store.version},error:null})}),
    upsert:rows=>requestQuery(()=>{writes.push({table,rows});return {data:null,error:null};}),
  });
  // The fixture's unmatched old block is pruned by the actual product handler,
  // so this product change also dispatches save_blocks and receives no UUID.
  await f.c.save();assert.ok(writes.length>0);assert.equal(p.calls.length,1);
  assert.equal(f.modal.productError,p.store.pendingScheduleSaveMessage());assert.equal(f.modal.productRetryable,false);
  assert.equal(f.success().length,0);assert.doesNotMatch(f.c.view(f.modal).foot,/data-act="p-save"/);
  const candidate=f.c.S,before=JSON.stringify(candidate),count=writes.length;
  await f.c.save();assert.equal(p.calls.length,1);assert.equal(writes.length,count);assert.equal(f.c.S,candidate);
  assert.equal(JSON.stringify(candidate),before);assert.equal(f.c.undoStack.length,1);
  assert.equal(f.modal.productError,p.store.pendingScheduleSaveMessage());
});

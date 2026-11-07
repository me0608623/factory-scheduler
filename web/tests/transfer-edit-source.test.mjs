import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transferUI} from '../src/transfer-ui.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {FakeSupabase,makeDb} from './fake-supabase.mjs';
import {createClient} from '@supabase/supabase-js';
const src=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('transfer editor survives SQL reread but rejects pause, reactivation and batch changes after SDK409 recovery',async()=>{
const db=await makeDb();
try {
const actor=crypto.randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[actor,'transfer-audit@invalid']);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
const users={'transfer-audit@invalid':{id:actor,password:'pw'}};
const store=new SupabaseStore(new FakeSupabase(db,users));await store.login('transfer-audit@invalid','pw');let S=await store.load();
const mk=(code)=>({id:crypto.randomUUID(),code,itemCode:'TEST',fromFactory:1,toFactory:2,returnFactory:1,totalQty:100,urgentQty:0,notified:null,expectedSend:null,due:null,urgentDue:null,workIds:[],status:'active',note:'original',batches:[],events:[]});
S.transferOrders=[mk('TARGET'),mk('OTHER')];await store.sync(S);S=await store.load();
const events=[];const ctx={S,STORE:store,UI:{modal:null,factory:'all'},PV:null,drag:null,generalDrag:null,SOLVER:null,SYNC:{state:'ok'},lastLocalWrite:0,pendingReload:false,remoteLoading:false,undoStack:[],reloadTimer:null,
canPermission:key=>store.can(key),normalizeState:()=>{},updateSyncChip:()=>{},setTimeout,clearTimeout,addEventListener:()=>{},notificationEnabled:()=>false,showDeviceNotification:()=>{},tx:x=>x,uid:()=>crypto.randomUUID(),structuredClone,toast:x=>events.push(x)};
vm.createContext(ctx);
let at=src.indexOf('let syncChain=Promise.resolve()');vm.runInContext(src.slice(at,src.indexOf('// ---------- 別人改了',at)),ctx);
at=src.indexOf('async function reloadFromStore(');vm.runInContext(src.slice(at,src.indexOf('async function refreshCloudSnapshot',at)),ctx);
at=src.indexOf('function remoteReloadBlocked()');vm.runInContext(src.slice(at,src.indexOf('\n',at)),ctx);
at=src.indexOf('function onRemoteChange(');vm.runInContext(src.slice(at,src.indexOf('// ---------- 帳號與連線',at)),ctx);
at=src.indexOf('function commit(');vm.runInContext(src.slice(at,src.indexOf('\nasync function undo',at)),ctx);
let html;
let clears=0,closes=0;
const ui=transferUI({state:()=>ctx.S,owner:()=>({store:ctx.STORE,client:ctx.STORE?.sb,user:ctx.STORE?.session?.user?.id,epoch:ctx.STORE?.authEpoch||0}),ui:ctx.UI,esc:x=>String(x??''),uid:ctx.uid,canEdit:()=>ctx.canPermission('transfers.manage'),open:m=>{ctx.UI.modal=m;ctx.render()},close:()=>{closes++;ctx.UI.modal=null},syncInputs:()=>{},commit:e=>ctx.commit(e,'transfers.manage'),toast:ctx.toast,today:()=> '2026-11-07',clearUndo:()=>{clears++;ctx.undoStack=[]}});
ctx.render=()=>{if(ctx.UI.modal)html=ui.modals[ctx.UI.modal.t](ctx.UI.modal)};
globalThis.document={getElementById:id=>({value:ctx.UI.modal?.draft?.[id.replace('tf-','')]??''})};
const target=S.transferOrders.find(o=>o.code==='TARGET').id,other=S.transferOrders.find(o=>o.code==='OTHER').id;
const remote=new SupabaseStore(new FakeSupabase(db,users));await remote.login('transfer-audit@invalid','pw');
let release,entered,gate,ready;const responses=[],transport=store.sb;
const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
assert.equal(new URL(url).pathname,'/rest/v1/rpc/save_transfer_orders');entered();await gate;
const result=await FakeSupabase.prototype.rpc.call(transport,'save_transfer_orders',JSON.parse(options.body)),status=result.error?(result.error.code==='40001'?409:400):200;responses.push({status,code:result.error?.code});
return new Response(JSON.stringify(result.error||result.data),{status,headers:{'content-type':'application/json'}});
}}});
transport.rpc=(name,args)=>name==='save_transfer_orders'?sdk.rpc(name,args):FakeSupabase.prototype.rpc.call(transport,name,args);
for(const change of ['pause','reactivation','new-batch']){
// Prepare each starting status using remote Store, then accept actual foreground reload.
let R=await remote.load();const t=R.transferOrders.find(o=>o.id===target);t.status=change==='reactivation'?'paused':'active';t.note='original';await remote.sync(R);await ctx.reloadFromStore();R=await remote.load();
gate=new Promise(r=>release=r);ready=new Promise(r=>entered=r);
ui.actions['tf-edit']({dataset:{id:other}});ctx.UI.modal.draft.note+=' local';ui.actions['tf-save']();await ready;
ui.actions['tf-edit']({dataset:{id:target}});const draftModal=ctx.UI.modal;draftModal.draft.note='local note only';
assert.equal(await ctx.reloadFromStore({background:true}),'deferred');
const rt=R.transferOrders.find(o=>o.id===target);if(change==='pause')rt.status='paused';if(change==='reactivation')rt.status='active';if(change==='new-batch')rt.batches.push({id:crypto.randomUUID(),code:'NEW BATCH',plannedQty:50});
await remote.sync(R);release();await vm.runInContext('syncChain',ctx);
assert.equal(ctx.UI.modal,draftModal);assert.match(html.foot,/tf-save/);assert.equal(responses.at(-1).status,409);
const loaded=structuredClone(ctx.S.transferOrders.find(o=>o.id===target)),before=JSON.stringify(ctx.S),cleared=clears,closed=closes,writes=responses.length;
ui.actions['tf-save']();await vm.runInContext('syncChain',ctx);
const saved=(await remote.load()).transferOrders.find(o=>o.id===target);
assert.equal(responses.length,writes,'rejected edit dispatches no RPC');
assert.equal(JSON.stringify(ctx.S),before,'no state mutation or log entry');assert.equal(clears,cleared);assert.equal(closes,closed);assert.equal(ctx.UI.modal,draftModal);
assert.deepEqual(saved,loaded);assert.match(events.at(-1),/已變更/);

}
// Persist events, then reconstruct an equivalent pre-JSONB key layout before opening.
// The subsequent real SQL reload must not invalidate an unchanged editor or its immutable events.
transport.rpc=(name,args)=>FakeSupabase.prototype.rpc.call(transport,name,args);
let R=await remote.load();const rt=R.transferOrders.find(o=>o.id===target);rt.batches=[];rt.events=[];rt.status='active';
const batch={id:crypto.randomUUID(),code:'CANONICAL BATCH',plannedQty:10};rt.batches.push(batch);rt.events.push({id:crypto.randomUUID(),batchId:batch.id,action:'send',at:'2026-01-01T00:00',qty:5,badQty:0,note:''});await remote.sync(R);await ctx.reloadFromStore();
const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().filter(([k,v])=>v!==null).map(([k,v])=>[k,reorder(v)])):value;
ctx.S.transferOrders=ctx.S.transferOrders.map(reorder);
ui.actions['tf-edit']({dataset:{id:target}});ctx.UI.modal.draft.note='JSONB reread control';
const originalEvents=JSON.stringify(ctx.UI.modal.draft.events);await ctx.reloadFromStore();assert.notEqual(JSON.stringify(ctx.S.transferOrders.find(o=>o.id===target).events),originalEvents);
ui.actions['tf-save']();await vm.runInContext('syncChain',ctx);assert.equal((await remote.load()).transferOrders.find(o=>o.id===target).note,'JSONB reread control');
// Controls: no change or unrelated target change should retain editable source.
for(const control of ['unchanged','unrelated','new-event']) {
await ctx.reloadFromStore();
ui.actions['tf-edit']({dataset:{id:target}});const modal=ctx.UI.modal;modal.draft.note='control '+control;
let R=await remote.load();const rt=R.transferOrders.find(o=>o.id===target);
if(control==='unrelated')R.transferOrders.find(o=>o.id===other).note='remote unrelated';
if(control==='new-event'){rt.batches.push({id:crypto.randomUUID(),code:'EVENT BATCH',plannedQty:50});rt.events.push({id:crypto.randomUUID(),batchId:rt.batches.at(-1).id,action:'send',at:'2026-01-01T00:00',qty:10,badQty:0,note:''});}
if(control!=='unchanged')await remote.sync(R);
assert.equal(await ctx.reloadFromStore(),'applied');assert.equal(ctx.UI.modal,modal);
ui.actions['tf-save']();await vm.runInContext('syncChain',ctx);
const persisted=(await remote.load()).transferOrders.find(o=>o.id===target);
if(control==='new-event'){assert.equal(persisted.events.length,2);assert.notEqual(persisted.note,'control new-event');assert.match(events.at(-1),/已變更/);}
else{assert.equal(persisted.note,'control '+control);}
}

}finally{delete globalThis.document;await db.close()}
});

const row=(more={})=>({id:'target',code:'TARGET',itemCode:'TEST',fromFactory:1,toFactory:2,returnFactory:1,totalQty:100,urgentQty:0,notified:null,expectedSend:null,due:null,urgentDue:null,workIds:[],status:'active',note:'original',batches:[],events:[],...more});
function fixture(){
  const S={transferOrders:[row()],workContents:[],workAssignments:[]},ui={modal:null},calls=[];
  const f={S,ui,calls,store:{sb:{},session:{user:{id:'user'},access_token:'old'},authEpoch:0}};
  const api=transferUI({state:()=>f.S,owner:()=>({store:f.store,client:f.store.sb,user:f.store.session.user.id,epoch:f.store.authEpoch||0}),ui,esc:x=>String(x??''),uid:()=> 'new-order',canEdit:()=>true,
    open:m=>{ui.modal=m;api.modals[m.t](m)},close:()=>{calls.push('close');ui.modal=null},clearUndo:()=>calls.push('undo'),commit:()=>calls.push('commit'),toast:t=>calls.push(t),syncInputs:()=>{},today:()=> '2026-01-01'});
  f.api=api;f.open=(id='target')=>{api.actions[id?'tf-edit':'tf-new']({dataset:{id}});return ui.modal};
  f.save=()=>{globalThis.document={getElementById:id=>({value:ui.modal?.draft?.[id.slice(3)]??''})};try{api.actions['tf-save']()}finally{delete globalThis.document}};
  return f;
}
function rejected(f,modal){const before=JSON.stringify(f.S);f.save();assert.equal(JSON.stringify(f.S),before);assert.equal(f.ui.modal,modal);assert.equal(f.calls.length,1);assert.match(f.calls[0],/已變更/);}
test('editor retains source across renders and rejects changed persisted fields, missing target, or identity collision without side effects',()=>{
  const mutations=[s=>s.transferOrders=[],s=>s.transferOrders[0].status='paused',s=>s.transferOrders[0].note='remote',s=>s.transferOrders[0].totalQty=200,
    s=>s.transferOrders[0].batches.push({id:'b',code:'B',plannedQty:10}),s=>s.transferOrders[0].events.push({id:'event'}),s=>s.transferOrders[0].returned=true];
  for(const mutate of mutations){const f=fixture(),m=f.open(),source=m.source;m.draft.note='local';mutate(f.S);f.api.modals['transfer-edit'](m);assert.equal(m.source,source);assert.equal(m.draft.note,'local');rejected(f,m);}
  const f=fixture(),m=f.open(null);m.draft.itemCode='TEST';f.S.transferOrders.push(row({id:m.draft.id,code:'COLLISION'}));rejected(f,m);
  const missing=fixture();rejected(missing,missing.open('disappeared'));
  const collision=fixture();collision.S.transferOrders.push(row({id:'new-order',code:'PREEXISTING'}));const fresh=collision.open(null);fresh.draft.itemCode='TEST';rejected(collision,fresh);
});
test('store, client, user and auth epoch changes reject; same-user token refresh succeeds',()=>{
  for(const change of ['store','client','user','epoch']){const f=fixture(),m=f.open();m.draft.note='local';if(change==='store')f.store={...f.store};if(change==='client')f.store.sb={};if(change==='user')f.store.session.user.id='different';if(change==='epoch')f.store.authEpoch++;rejected(f,m);}
  const f=fixture();f.open().draft.note='refreshed';f.store.session={user:{id:'user'},access_token:'new'};f.save();assert.ok(f.calls.includes('commit'));assert.equal(f.S.transferOrders[0].note,'refreshed');
});
test('canonical source accepts reordered JSON objects and equivalent nullable fields; new and unrelated target edits remain valid',()=>{
  for(const mode of ['canonical','unrelated','new']){const f=fixture(),m=f.open(mode==='new'?null:'target');m.draft.note='local';m.draft.itemCode='TEST';
    if(mode==='canonical'){f.S.transferOrders[0]=Object.fromEntries(Object.entries(f.S.transferOrders[0]).reverse().filter(([k,v])=>v!==null));}
    if(mode==='unrelated')f.S.transferOrders.push(row({id:'other',code:'OTHER',note:'remote'}));
    f.save();assert.deepEqual(f.calls,['undo','close','commit']);assert.equal(f.S.transferOrders.find(o=>o.id===m.draft.id).note,'local');
  }
});
test('source protection does not replace immutable-event validation for an unchanged source',()=>{
  const f=fixture();f.S.transferOrders[0].batches=[{id:'b',code:'B',plannedQty:10}];f.S.transferOrders[0].events=[{id:'e',batchId:'b',action:'send',at:'2026-01-01T00:00',qty:5,badQty:0,note:''}];
  const m=f.open();m.draft.events=[];const before=JSON.stringify(f.S);f.save();assert.equal(JSON.stringify(f.S),before);assert.equal(f.ui.modal,m);assert.equal(f.calls.length,1);assert.match(f.calls[0],/不可刪改/);
});
test('actual app wires transfer source owner and all languages translate stale-source feedback',async()=>{
  assert.match(src,/transferUI\(\{state:\(\)=>S,owner:\(\)=>\(\{store:STORE,client:STORE\?\.sb,user:STORE\?\.session\?\.user\?\.id,epoch:STORE\?\.authEpoch\|\|0\}\)/);
  const {I18N,UI_TEXT}=await import('../src/i18n.js');const key='這張加工單或登入狀態已變更，未儲存；請關閉後重新開啟最新加工單再調整。';
  try{for(const lang of ['en','vi','th']){I18N.lang=lang;const f=fixture();f.open();f.S.transferOrders[0].note='remote';f.save();assert.equal(f.calls[0],UI_TEXT[key][lang]);assert.notEqual(f.calls[0],key);}}finally{I18N.lang='zh-TW';}
});

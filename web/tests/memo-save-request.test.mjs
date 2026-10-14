import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {createClient} from '@supabase/supabase-js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const pending=deferred(),events=[],writes=[];let ids=0;
  const ctx={UI:{modal:{t:'memo-edit'},drawer:'notes',date:'2026-10-14',factory:1},PV:null,S:{blocks:[{id:'synthetic'}],memos:[]},
    STORE:{userName:'Synthetic',session:{user:{id:'A'}},authEpoch:1,saveMemo:row=>{writes.push(row);return pending.promise;}},
    canPermission:()=>true,uid:()=> 'synthetic-'+(++ids),tx:x=>x,renderModal:()=>events.push('modal-render'),maybeReload:()=>events.push('maybe'),
    $:selector=>({value:selector==='#memo-text'?'Synthetic memo':selector==='#memo-machine'?'synthetic-machine':'',checked:false}),
    closeModal:()=>{events.push('close');ctx.UI.modal=null;},reloadFromStore:async options=>{events.push({type:'reload',options});return 'applied';},render:()=>events.push('render'),toast:text=>events.push({type:'toast',text})};
  vm.createContext(ctx);const at=source.indexOf("'memo-save':");vm.runInContext('const actions={'+source.slice(at,source.indexOf('\n});',at))+'};this.save=actions["memo-save"];',ctx);
  return {ctx,pending,events,writes,button:{disabled:false},m:ctx.UI.modal};
}
const reloads=f=>f.events.filter(e=>e?.type==='reload');
const toasts=f=>f.events.filter(e=>e?.type==='toast');
function reconciliation(f){
  const timers=[],reads=[];f.ctx.S.log=[];Object.assign(f.ctx,{drag:null,generalDrag:null,syncPending:0,SYNC:{state:'ok'},lastLocalWrite:0,pendingReload:false,reloadTimer:null,remoteLoading:false,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},normalizeState:()=>{},notificationEnabled:()=>false,showDeviceNotification:()=>{}});
  f.ctx.STORE.load=async()=>{reads.push('read');return {...f.ctx.S,memos:[{id:'saved-memo',text:'Synthetic memo'}]};};
  const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 帳號與連線',at)),f.ctx);
  return {timers,reads};
}

test('late successful new memo after close queues one read without reopening, replaying or toasting',async()=>{
  const f=fixture(),h=reconciliation(f),job=f.ctx.save(f.button);f.ctx.closeModal();f.pending.resolve();await job;
  assert.equal(h.timers.length,1);assert.equal(h.reads.length,0);await h.timers.shift()();assert.equal(h.reads.length,1);
  assert.equal(f.ctx.S.memos[0].id,'saved-memo');assert.equal(f.ctx.UI.modal,null);assert.equal(f.writes.length,1);assert.equal(toasts(f).length,0);
});

test('late successful new memo preserves the newer draft, preview or failed write until safe reread',async()=>{
  for(const mode of ['modal','preview','unsaved']){
    const f=fixture(),h=reconciliation(f),job=f.ctx.save(f.button),state=f.ctx.S;
    f.ctx.UI.modal=mode==='modal'?{t:'new-draft',value:'keep'}:null;if(mode==='preview')f.ctx.PV={draft:'keep'};if(mode==='unsaved'){f.ctx.UI.date='2026-10-15';f.ctx.SYNC.state='error';}
    const modal=f.ctx.UI.modal,preview=f.ctx.PV;f.pending.resolve();await job;
    assert.equal(f.ctx.pendingReload,true,mode);assert.equal(h.timers.length,0);assert.equal(f.ctx.S,state);assert.equal(f.ctx.UI.modal,modal);assert.equal(f.ctx.PV,preview);
    f.ctx.UI.modal=null;f.ctx.PV=null;f.ctx.SYNC.state='ok';f.ctx.maybeReload();assert.equal(h.timers.length,1);await h.timers.shift()();assert.equal(h.reads.length,1);assert.equal(f.writes.length,1);
  }
});

test('old account, client, store or epoch memo ACK cannot enqueue reconciliation for another session',async()=>{
  for(const mode of ['user','client','store','epoch']){
    const f=fixture(),h=reconciliation(f),job=f.ctx.save(f.button);f.ctx.UI.modal=null;
    if(mode==='user')f.ctx.STORE.session={user:{id:'B'}};if(mode==='client')f.ctx.STORE.sb={};if(mode==='store')f.ctx.STORE={...f.ctx.STORE};if(mode==='epoch')f.ctx.STORE.authEpoch++;
    f.pending.resolve();await job;assert.equal(f.ctx.pendingReload,false);assert.equal(h.timers.length,0);assert.equal(h.reads.length,0);
  }
});

test('real SQL and SDK new memo late success keeps a newer draft and reconciles one persisted row after close',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555';
    await db.query("insert into auth.users(id,email) values($1,'synthetic-memo@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();const state=await reader.load(),before=JSON.stringify(state.blocks);
    const ready=deferred(),gate=deferred();let calls=0;
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/schedule_memos');calls++;const result=await fake.from('schedule_memos').upsert(JSON.parse(options.body),{onConflict:'id'});
      assert.equal(result.error,null);ready.resolve();await gate.promise;return new Response(null,{status:204});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};store.userName='Synthetic';
    const f=fixture();f.ctx.S=state;f.ctx.STORE=store;f.ctx.uid=()=>id;f.ctx.$=s=>({value:s==='#memo-text'?'Synthetic memo':s==='#memo-machine'?'a':'',checked:false});
    const h=reconciliation(f);store.load=async options=>{assert.equal(options.remember,false);h.reads.push('read');return reader.load({remember:false});};
    const job=f.ctx.save(f.button),dispatched=await Promise.race([ready.promise.then(()=>true),job.then(()=>false)]);assert.equal(dispatched,true,f.m.error);
    const draft=f.ctx.UI.modal={t:'new-draft',value:'keep'};gate.resolve();await job;
    assert.equal(f.ctx.pendingReload,true);assert.equal(h.reads.length,0);assert.equal(f.ctx.S,state);assert.equal(f.ctx.UI.modal,draft);
    f.ctx.UI.modal=null;f.ctx.maybeReload();assert.equal(h.timers.length,1);await h.timers.shift()();
    assert.equal(h.reads.length,1);assert.equal(calls,1);assert.equal(f.ctx.S.memos.find(m=>m.id===id).text,'Synthetic memo');assert.equal(toasts(f).length,0);
    assert.equal(JSON.stringify(f.ctx.S.blocks),before);assert.equal((await db.query('select count(*)::int n from schedule_memos where id=$1',[id])).rows[0].n,1);
  }finally{await db.close();}
});
test('late memo ACK never closes a newer dialog, reloads drafts or reports success in another context',async()=>{
  for(const kind of ['closed','modal','store','client','user','epoch','preview','state','mutation','date','factory','permission']){
    const f=fixture(),job=f.ctx.save(f.button);
    if(kind==='closed')f.ctx.UI.modal=null;if(kind==='modal')f.ctx.UI.modal={t:'order-edit'};
    if(kind==='store')f.ctx.STORE={...f.ctx.STORE};if(kind==='client')f.ctx.STORE.sb={};if(kind==='user')f.ctx.STORE.session={user:{id:'B'}};if(kind==='epoch')f.ctx.STORE.authEpoch++;
    if(kind==='preview')f.ctx.PV={kind:'manual'};if(kind==='state')f.ctx.S={...f.ctx.S};if(kind==='mutation')f.ctx.S.memos.push({id:'new-draft'});
    if(kind==='date')f.ctx.UI.date='2026-10-15';if(kind==='factory')f.ctx.UI.factory=2;if(kind==='permission')f.ctx.canPermission=()=>false;
    const latest=f.ctx.UI.modal;f.pending.resolve();await job;
    assert.equal(f.ctx.UI.modal,latest,kind);assert.equal(reloads(f).length,0,kind);assert.equal(toasts(f).length,0,kind);
    assert.equal(f.m.saving,false);assert.equal(f.ctx.UI.memoSaving,null);
  }
});
test('current memo save blocks double submit and only ACK then protected reread reports success',async()=>{
  const f=fixture(),before=JSON.stringify(f.ctx.S),job=f.ctx.save(f.button),double=f.ctx.save({disabled:false});
  try{assert.equal(f.writes.length,1);assert.equal(f.m.saving,true);assert.equal(f.ctx.UI.memoSaving,f.m);assert.equal(reloads(f).length,0);}
  finally{f.pending.resolve();await Promise.all([job,double]);}
  assert.equal(reloads(f).length,1);assert.equal(reloads(f)[0].options.background,true);
  assert.equal(toasts(f).length,1);assert.equal(f.ctx.UI.modal,null);assert.equal(JSON.stringify(f.ctx.S),before);
});
test('current failure preserves values and stable id for retry, without duplicate logical memo',async()=>{
  const f=fixture(),job=f.ctx.save(f.button);f.pending.reject(new Error('Synthetic failed'));await job;
  assert.equal(f.ctx.UI.modal,f.m);assert.equal(f.m.error,'Synthetic failed');assert.equal(f.m.memoDraft.text,'Synthetic memo');assert.equal(f.m.saving,false);
  f.ctx.STORE.saveMemo=async row=>{f.writes.push(row);};await f.ctx.save({disabled:false});
  assert.equal(f.writes[0].id,f.writes[1].id);assert.equal(f.writes[0].createdAt,f.writes[1].createdAt);assert.equal(reloads(f).length,1);
});
test('late memo rejection does not put its error into a newer dialog',async()=>{
  const f=fixture(),job=f.ctx.save(f.button),latest=f.ctx.UI.modal={t:'settings'};f.pending.reject(new Error('OLD_ERROR'));await job;
  assert.equal(f.ctx.UI.modal,latest);assert.equal(toasts(f).length,0);assert.equal(reloads(f).length,0);
});
test('new draft/preview during protected reread never gets closed or replaced by final success handling',async()=>{
  for(const kind of ['modal','preview','date','factory','user']){
    const f=fixture(),read=deferred();f.ctx.reloadFromStore=options=>{f.events.push({type:'reload',options});return read.promise;};
    const job=f.ctx.save(f.button);f.pending.resolve();await tick();assert.equal(f.ctx.UI.modal,null);
    if(kind==='modal')f.ctx.UI.modal={t:'new-draft'};if(kind==='preview')f.ctx.PV={kind:'manual'};if(kind==='date')f.ctx.UI.date='2026-10-15';
    if(kind==='factory')f.ctx.UI.factory=2;if(kind==='user')f.ctx.STORE.session={user:{id:'B'}};
    const current=f.ctx.UI.modal;read.resolve('applied');await job;assert.equal(f.ctx.UI.modal,current);assert.equal(toasts(f).length,0);
  }
});
test('failed or deferred reread is not announced as a fully refreshed saved memo',async()=>{
  for(const result of ['failed','deferred']){const f=fixture();f.ctx.reloadFromStore=async()=>result;
    const job=f.ctx.save(f.button);f.pending.resolve();await job;assert.equal(toasts(f).length,1);assert.match(toasts(f)[0].text,/尚未讀到最新/);}
});
test('actual memo renderer preserves draft fields, describes close while saving, escapes failure and disables repeat save',()=>{
  const f=fixture();Object.assign(f.ctx,{MODALS:{},shownMachines:()=>[{id:'synthetic-machine',label:'Synthetic'}],shownEmployees:()=>[{id:'synthetic-person',name:'Synthetic'}],
    esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
  const at=source.indexOf("MODALS['memo-edit']");vm.runInContext(source.slice(at,source.indexOf('async function resolveLeaveRequest',at)),f.ctx);
  Object.assign(f.m,{saving:true,error:'<script>unsafe</script>',memoDraft:{text:'<Synthetic>',machineId:'synthetic-machine',employeeId:'synthetic-person',pinned:true}});
  const html=f.ctx.MODALS['memo-edit'](f.m);assert.match(html.body,/role="status"/);assert.match(html.body,/關閉視窗不會取消/);assert.match(html.body,/role="alert"/);
  assert.ok(!html.body.includes('<script>'));assert.match(html.body,/value="synthetic-machine" selected/);assert.match(html.body,/value="synthetic-person" selected/);
  assert.match(html.body,/value="&lt;Synthetic&gt;"/);assert.match(html.body,/id="memo-pinned" type="checkbox" checked/);assert.match(html.foot,/data-act="memo-save" disabled/);assert.match(html.foot,/>關閉</);
});
test('actual LocalStore save plus actual protected reload adds one memo without changing schedule blocks',async()=>{
  const f=fixture(),old=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{
    f.ctx.S={...f.ctx.S,employees:[],machines:[],products:[],orders:[]};f.ctx.STORE=new LocalStore();await f.ctx.STORE.sync(f.ctx.S);
    const before=JSON.stringify(f.ctx.S.blocks);Object.assign(f.ctx,{lastLocalWrite:0,pendingReload:false,normalizeState:()=>{},remoteReloadBlocked:()=>!!(f.ctx.UI.modal||f.ctx.PV||f.ctx.UI.memoSaving)});
    const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('async function refreshCloudSnapshot',at)),f.ctx);
    await f.ctx.save(f.button);assert.equal(f.ctx.UI.modal,null);assert.equal(f.ctx.S.memos.length,1);assert.equal(f.ctx.S.memos[0].text,'Synthetic memo');
    assert.equal(JSON.stringify(f.ctx.S.blocks),before);assert.equal((await f.ctx.STORE.load()).memos.length,1);assert.equal(toasts(f).at(-1).text,'備忘已保存');
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('actual LocalStore quota failure preserves retry and retry uses the same id exactly once',async()=>{
  const f=fixture(),old=globalThis.localStorage,data=new Map();let fail=false;globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw new Error('Synthetic quota');data.set(k,v);}};
  try{
    f.ctx.S={...f.ctx.S,employees:[],machines:[],products:[],orders:[]};f.ctx.STORE=new LocalStore();await f.ctx.STORE.sync(f.ctx.S);const before=JSON.stringify(f.ctx.S);
    fail=true;await f.ctx.save(f.button);assert.equal(f.ctx.UI.modal,f.m);assert.match(f.m.error,/儲存空間不足/);assert.equal((await f.ctx.STORE.load()).memos.length,0);
    assert.equal(JSON.stringify(f.ctx.S),before);const id=f.m.memoId;fail=false;await f.ctx.save({disabled:false});
    const stored=await f.ctx.STORE.load();assert.equal(stored.memos.length,1);assert.equal(stored.memos[0].id,id);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

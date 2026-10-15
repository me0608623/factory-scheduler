import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SupabaseStore} from '../src/store/supabase.js';
import {LocalStore} from '../src/store/local.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const archives=[{id:'a',source_name:'Synthetic A'},{id:'b',source_name:'Synthetic B'}];
const legacy=id=>({dates:['2026-10-14'],days:{},selectedDate:'2026-10-14',tag:id});
function fixture(){
  const writes=deferred(),list=deferred(),reads=new Map(archives.map(a=>[a.id,deferred()])),events=[];
  const ctx={UI:{modal:null},S:{blocks:[{id:'preserved'}]},STORE:{kind:'local',session:{user:{id:'test'}},authEpoch:1,
    saveLegacyArchive:()=>writes.promise,listLegacyArchives:()=>list.promise,getLegacyArchive:id=>{events.push({type:'read',id});return reads.get(id).promise;}},canArchive:()=>true,
    tx:x=>x,renderModal:()=>events.push({type:'render'}),openModal:m=>{ctx.UI.modal=m;},toast:text=>events.push({type:'toast',text})};
  vm.createContext(ctx);
  const at=source.indexOf('function ownsLegacyRequest('),begin=at>=0?at:source.indexOf('async function openLegacyHistory(');
  vm.runInContext(source.slice(begin,source.indexOf('function setPath(',begin)),ctx);
  const save=source.indexOf('"legacy-save":');vm.runInContext('const actions={'+source.slice(save,source.indexOf('"history-factory":',save))+'};this.save=actions["legacy-save"];this.retry=actions["history-retry"];',ctx);
  const preview=()=>ctx.UI.modal={t:'legacy-preview',filename:'synthetic.xlsx',sourceSha256:'synthetic',legacy:legacy('original')};
  return {ctx,writes,list,reads,events,preview};
}
function change(f,kind){
  if(kind==='closed')f.ctx.UI.modal=null;
  if(kind==='modal')f.ctx.UI.modal={t:'order-edit'};
  if(kind==='user')f.ctx.STORE.session={user:{id:'new'}};
  if(kind==='epoch')f.ctx.STORE.authEpoch++;
  if(kind==='store')f.ctx.STORE={...f.ctx.STORE};
  if(kind==='permission')f.ctx.canArchive=()=>false;
}
test('late archive save cannot reopen closed/replaced dialog or toast under another owner',async()=>{
  for(const kind of ['closed','modal','user','epoch','store','permission']){
    const f=fixture();f.preview();f.ctx.openLegacyHistory=async id=>{f.events.push({type:'history',id});f.ctx.UI.modal={t:'legacy-history'};};
    const job=f.ctx.save();change(f,kind);const expected=f.ctx.UI.modal;f.writes.resolve({id:'saved'});await job;
    assert.equal(f.ctx.UI.modal,expected,kind);assert.equal(f.events.filter(e=>e.type==='history'||e.type==='toast').length,0,kind);
  }
});
test('current save acknowledges exactly once, blocks double click and leaves S unchanged',async()=>{
  const f=fixture(),m=f.preview(),before=JSON.stringify(f.ctx.S);let calls=0;
  f.ctx.STORE.saveLegacyArchive=()=>{calls++;return f.writes.promise;};f.ctx.openLegacyHistory=async id=>f.events.push({type:'history',id});
  const job=f.ctx.save();await f.ctx.save();assert.equal(calls,1);assert.equal(m.saving,true);
  f.writes.resolve({id:'saved'});await job;assert.equal(m.saving,false);assert.equal(f.events.filter(e=>e.type==='toast').length,1);assert.equal(JSON.stringify(f.ctx.S),before);
});
test('null save acknowledgment is an error, not a completed archive import',async()=>{
  const f=fixture(),m=f.preview();f.ctx.openLegacyHistory=async()=>f.events.push({type:'history'});const job=f.ctx.save();f.writes.resolve(null);await job;
  assert.equal(f.events.filter(e=>e.type==='toast'||e.type==='history').length,0);assert.ok(m.error);assert.equal(m.saving,false);
});
test('older history list completion cannot overwrite a newer history request or issue its payload read',async()=>{
  const f=fixture(),second=deferred();let calls=0;f.ctx.STORE.listLegacyArchives=()=>++calls===1?f.list.promise:second.promise;
  const first=f.ctx.openLegacyHistory('a'),next=f.ctx.openLegacyHistory('b'),newModal=f.ctx.UI.modal;
  f.list.resolve(archives);f.reads.get('a').resolve(legacy('a'));await first;assert.equal(f.ctx.UI.modal,newModal);assert.equal(f.events.filter(e=>e.type==='read').length,0);
  second.resolve(archives);f.reads.get('b').resolve(legacy('b'));await next;assert.equal(f.ctx.UI.modal.archive.id,'b');
});
test('closed or changed owner cannot display late list/payload success or error',async()=>{
  for(const phase of ['list','payload'])for(const kind of ['closed','modal','user','epoch','store','permission']){
    const f=fixture(),job=f.ctx.openLegacyHistory('a');
    if(phase==='payload'){f.list.resolve(archives);await new Promise(r=>setImmediate(r));}
    change(f,kind);const expected=f.ctx.UI.modal;
    if(phase==='list')f.list.resolve(archives);else f.reads.get('a').resolve(legacy('a'));
    // Old implementation still performs the payload fetch after losing ownership.
    f.reads.get('a').resolve(legacy('a'));await job;assert.equal(f.ctx.UI.modal,expected,phase+kind);
  }
});
test('latest selected history source wins even when same-modal payload responses arrive in reverse order',async()=>{
  const f=fixture();f.ctx.UI.modal={t:'legacy-history',archives,archive:archives[0],legacy:legacy('old')};
  const first=f.ctx.changeLegacyHistorySource('a'),second=f.ctx.changeLegacyHistorySource('b');
  f.reads.get('b').resolve(legacy('b'));await second;f.reads.get('a').resolve(legacy('a'));await first;
  assert.equal(f.ctx.UI.modal.archive.id,'b');assert.equal(f.ctx.UI.modal.legacy.tag,'b');assert.equal(f.ctx.UI.modal.loading,false);
});
test('stale source error cannot put the newer loaded source back into error',async()=>{
  const f=fixture();f.ctx.UI.modal={t:'legacy-history',archives};const first=f.ctx.changeLegacyHistorySource('a'),second=f.ctx.changeLegacyHistorySource('b');
  f.reads.get('b').resolve(legacy('b'));await second;f.reads.get('a').reject(new Error('OLD_ERROR'));await first;
  assert.ok(!f.ctx.UI.modal.error);assert.equal(f.ctx.UI.modal.archive.id,'b');
});
test('actual SupabaseStore never inserts old archive payload after lookup changed account or client',async()=>{
  for(const kind of ['user','epoch','client']){
    const lookup=deferred();let inserts=0;
    const chain={setHeader:()=>chain,select:()=>chain,eq:()=>chain,maybeSingle:()=>lookup.promise,insert:()=>{inserts++;return chain;},single:async()=>({data:{id:'saved'},error:null})};
    const client={from:()=>chain},store=new SupabaseStore(client);store.session={user:{id:'original'},access_token:'synthetic-token'};store.authEpoch=1;
    const job=store.saveLegacyArchive({sourceName:'synthetic',sourceSha256:'hash',legacy:legacy('a')});
    if(kind==='user')store.session={user:{id:'new'}};if(kind==='epoch')store.authEpoch++;if(kind==='client')store.sb={from:()=>chain};
    lookup.resolve({data:null,error:null});await assert.rejects(job,/登入狀態已變更/);assert.equal(inserts,0,kind);
  }
});
test('late history list/payload errors cannot replace a closed or newer dialog',async()=>{
  for(const phase of ['list','payload']){
    const f=fixture(),job=f.ctx.openLegacyHistory('a');
    if(phase==='payload'){f.list.resolve(archives);await new Promise(r=>setImmediate(r));}
    const latest=f.ctx.UI.modal={t:'settings'};
    if(phase==='list')f.list.reject(new Error('OLD_LIST_ERROR'));else f.reads.get('a').reject(new Error('OLD_PAYLOAD_ERROR'));
    await job;assert.equal(f.ctx.UI.modal,latest);assert.equal(f.events.filter(e=>e.type==='toast').length,0);
  }
});
test('current history failure is recoverable and current empty list is not a fabricated archive',async()=>{
  const f=fixture(),before=JSON.stringify(f.ctx.S),job=f.ctx.openLegacyHistory();f.list.reject(new Error('CURRENT_LIST_ERROR'));await job;
  assert.equal(f.ctx.UI.modal.error,'CURRENT_LIST_ERROR');assert.equal(f.ctx.UI.modal.loading,false);
  f.ctx.STORE.listLegacyArchives=async()=>[];await f.ctx.openLegacyHistory();
  assert.equal(f.ctx.UI.modal.archive,null);assert.equal(f.ctx.UI.modal.loading,false);assert.ok(!f.ctx.UI.modal.error);assert.equal(JSON.stringify(f.ctx.S),before);
});
test('missing history payload reports a read error instead of rendering a false empty history',async()=>{
  const f=fixture(),job=f.ctx.openLegacyHistory('a');f.list.resolve(archives);f.reads.get('a').resolve(null);await job;
  assert.ok(f.ctx.UI.modal.error);assert.equal(f.ctx.UI.modal.loading,false);
});
test('actual SupabaseStore read guards reject late old-owner list and payload responses',async()=>{
  for(const method of ['listLegacyArchives','getLegacyArchive']){
    const pending=deferred(),chain={setHeader:()=>chain,select:()=>chain,eq:()=>chain,order:()=>pending.promise,single:()=>pending.promise},store=new SupabaseStore({from:()=>chain});
    store.session={user:{id:'old'},access_token:'synthetic-token'};store.authEpoch=1;const job=store[method]('a');store.session={user:{id:'new'}};
    pending.resolve({data:method==='getLegacyArchive'?{payload:legacy('old')}:archives,error:null});await assert.rejects(job,/登入狀態已變更/);
  }
});
test('actual SupabaseStore rejects stale insert acknowledgment, but accepts a same-owner token refresh and deduplicated archive',async()=>{
  const insert=deferred(),chain={setHeader:()=>chain,select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:null,error:null}),insert:()=>chain,single:()=>insert.promise};
  const store=new SupabaseStore({from:()=>chain});store.session={user:{id:'old'},access_token:'synthetic-token'};store.authEpoch=1;
  const job=store.saveLegacyArchive({sourceName:'synthetic',sourceSha256:'hash',legacy:legacy('a')});await new Promise(r=>setImmediate(r));
  store.authEpoch++;insert.resolve({data:{id:'saved'},error:null});await assert.rejects(job,/登入狀態已變更/);
  let inserts=0;chain.maybeSingle=async()=>({data:{id:'found'},error:null});chain.insert=()=>{inserts++;return chain;};
  store.session={user:{id:'old'},access_token:'synthetic-refreshed-token'};
  const found=await store.saveLegacyArchive({sourceName:'synthetic',sourceSha256:'hash',legacy:legacy('a')});assert.equal(found.id,'found');assert.equal(inserts,0);
});
test('actual LocalStore save/read round trip and duplicate file keep one archive and do not modify S',async()=>{
  const f=fixture(),old=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  try{
    f.ctx.STORE=new LocalStore();const before=JSON.stringify(f.ctx.S);f.preview();await f.ctx.save();
    assert.equal(f.ctx.UI.modal.archive.id,'synthetic');assert.equal(f.ctx.UI.modal.legacy.tag,'original');assert.equal(f.ctx.UI.modal.loading,false);
    f.preview();await f.ctx.save();assert.equal((await f.ctx.STORE.listLegacyArchives()).length,1);assert.equal(JSON.stringify(f.ctx.S),before);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('actual LocalStore quota failure rolls back archive payload and retains a retryable preview error',async()=>{
  const f=fixture(),old=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(k==='fsched-legacy-index-v1')throw new Error('quota');data.set(k,v);},removeItem:k=>data.delete(k)};
  try{
    f.ctx.STORE=new LocalStore();const m=f.preview(),before=JSON.stringify(f.ctx.S);await f.ctx.save();
    assert.equal(f.ctx.UI.modal,m);assert.equal(m.saving,false);assert.match(m.error,/儲存空間不足/);assert.equal(data.size,0);
    assert.equal(f.events.filter(e=>e.type==='toast').length,0);assert.equal(JSON.stringify(f.ctx.S),before);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('history retry reopens the requested source, not another default archive',async()=>{
  const f=fixture();f.ctx.UI.modal={t:'legacy-history',historyId:'b',error:'failed'};f.ctx.STORE.listLegacyArchives=async()=>archives;f.reads.get('b').resolve(legacy('b'));
  await f.ctx.retry();assert.equal(f.ctx.UI.modal.archive.id,'b');assert.ok(!f.ctx.UI.modal.error);
});
test('actual preview and history error renderer explain closing an in-flight save and expose read retry',()=>{
  const f=fixture(),m=f.preview();Object.assign(f.ctx,{esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),legacyFactoryHTML:()=>''});
  const at=source.indexOf('"legacy-preview"(m){');vm.runInContext('const modals={'+source.slice(at,source.indexOf('\n};',at))+'};this.previewHTML=modals["legacy-preview"];this.historyHTML=modals["legacy-history"];',f.ctx);
  m.saving=true;const saving=f.ctx.previewHTML(m);assert.match(saving.body,/role="status"/);assert.match(saving.body,/關閉視窗不會取消/);assert.match(saving.foot,/data-act="legacy-save" disabled/);assert.match(saving.foot,/>關閉</);
  const error=f.ctx.historyHTML({error:'<script>unsafe</script>'});assert.match(error.body,/role="alert"/);assert.ok(!error.body.includes('<script>'));assert.match(error.foot,/data-act="history-retry"/);
});

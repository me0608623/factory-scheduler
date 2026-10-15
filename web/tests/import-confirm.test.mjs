import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {SaxesParser} from 'saxes';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('"x-import-confirm":'),end=source.indexOf('"legacy-save":',start);
const confirmCode='const actions={'+source.slice(start,end)+'};this.confirm=actions["x-import-confirm"];';
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(){
  const events=[],pending=deferred();
  const before={employees:[{id:'old',factory:1}],machines:[],products:[],orders:[],blocks:[{id:'old-block'}],groups:[],log:[]};
  const data={employees:[{id:'new',factory:1}],machines:[],products:[],orders:[]};
  const modal={t:'import-preview',base:JSON.stringify(before),filename:'synthetic.xlsx',errors:[],data};
  const store={kind:'local',session:null,authEpoch:0};
  const ctx={S:before,UI:{modal},STORE:store,SYNC:{state:'ok',msg:''},canMaster:()=>true,readOnly:false,
    canPermission:()=>true,workCatalog:()=>[],assignments:()=>[],transferOrders:()=>[],factoryOf:e=>e.factory??1,
    undoStack:[],pushUndo:()=>ctx.undoStack.push(JSON.stringify(ctx.S)),
    commit:entry=>{events.push({type:'commit',entry});return pending.promise;},
    closeModal:()=>{ctx.UI.modal=null;events.push({type:'close'});},renderModal:()=>events.push({type:'render'}),
    tx:x=>x,toast:x=>events.push({type:'toast',text:x}),runAuto:()=>{},uid:()=> 'test-entry',render:()=>{},SOLVER:null};
  vm.createContext(ctx);vm.runInContext(confirmCode,ctx);return {ctx,events,pending,before,data,modal,store};
}
const successes=f=>f.events.filter(e=>e.type==='toast'&&e.text==='Excel 匯入完成。請建立新排程');
test('import confirm waits for persistence, keeps its dialog busy and rejects repeated confirmation',async()=>{
  const f=fixture(),task=f.ctx.confirm();f.ctx.confirm();
  assert.equal(f.modal.saving,true);assert.equal(f.ctx.UI.modal,f.modal);assert.equal(successes(f).length,0);
  assert.equal(f.events.filter(e=>e.type==='commit').length,1);assert.equal(f.ctx.undoStack.length,1);
  f.pending.resolve(true);await task;assert.equal(successes(f).length,1);assert.equal(f.ctx.UI.modal,null);
});
test('failed import never announces completion, preserving candidate and file for retry',async()=>{
  const f=fixture(),task=f.ctx.confirm();f.pending.resolve(false);await task;
  assert.equal(successes(f).length,0);assert.equal(f.ctx.UI.modal,f.modal);assert.equal(f.modal.saving,false);
  assert.ok(f.modal.importError);assert.equal(f.ctx.S.employees[0].id,'new');assert.equal(f.modal.filename,'synthetic.xlsx');
});
test('late successful import cannot close another dialog or announce completion after owner/state changes',async()=>{
  for(const kind of ['store','user','epoch','modal','state','mutation']){
    const f=fixture(),task=f.ctx.confirm();
    if(kind==='store')f.ctx.STORE={...f.ctx.STORE};
    if(kind==='user')f.ctx.STORE.session={user:{id:'other'}};
    if(kind==='epoch')f.ctx.STORE.authEpoch++;
    if(kind==='modal')f.ctx.UI.modal={t:'settings'};
    if(kind==='state')f.ctx.S={...f.ctx.S,blocks:[{id:'newer'}]};
    if(kind==='mutation')f.ctx.S.employees[0].name='newer edit';
    const state=f.ctx.S,modal=f.ctx.UI.modal;f.pending.resolve(true);await task;
    assert.equal(f.ctx.S,state);assert.equal(f.ctx.UI.modal,modal);assert.equal(successes(f).length,0,kind);
  }
});
test('stale or unauthorized import is rejected before undo, mutation or saving',async()=>{
  for(const kind of ['stale','master','schedule','loading','no-data']){
    const f=fixture();if(kind==='stale')f.modal.base='stale';if(kind==='master')f.ctx.canMaster=()=>false;
    if(kind==='schedule')f.ctx.readOnly=true;if(kind==='loading')f.modal.loading=true;if(kind==='no-data')f.modal.data=null;
    const before=JSON.stringify(f.ctx.S);await f.ctx.confirm();
    assert.equal(JSON.stringify(f.ctx.S),before,kind);assert.equal(f.ctx.undoStack.length,0,kind);
    assert.equal(f.events.filter(e=>e.type==='commit').length,0,kind);
  }
});
test('retry saves the same candidate once, without another undo or duplicate import log',async()=>{
  const f=fixture(),first=f.ctx.confirm();f.pending.resolve(false);await first;
  const candidate=f.ctx.S,second=deferred();f.ctx.commit=entry=>{f.events.push({type:'commit',entry});return second.promise;};
  const retry=f.ctx.confirm();assert.equal(f.ctx.S,candidate);assert.equal(f.ctx.undoStack.length,1);assert.equal(f.modal.saving,true);
  assert.equal(f.events.filter(e=>e.type==='commit').at(-1).entry,null);
  second.resolve(true);await retry;assert.equal(successes(f).length,1);
});
test('retry after recovery loaded another snapshot cannot replace it with the old imported file',async()=>{
  const f=fixture(),first=f.ctx.confirm();f.ctx.S={...f.ctx.S,employees:[{id:'remote'}]};f.pending.resolve(false);await first;
  const current=JSON.stringify(f.ctx.S);await f.ctx.confirm();assert.equal(JSON.stringify(f.ctx.S),current);
  assert.equal(f.events.filter(e=>e.type==='commit').length,1);assert.equal(successes(f).length,0);
});
test('actual commit, queueSync and LocalStore quota failure keep import unconfirmed',async()=>{
  const f=fixture(),old=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
  try{
    f.ctx.STORE=new LocalStore();Object.assign(f.ctx,{structuredClone,syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,updateSyncChip:()=>{},maybeReload:()=>{}});
    const queue=source.indexOf('function queueSync(entry){'),commit=source.indexOf('function commit(');
    vm.runInContext(source.slice(queue,source.indexOf('// ---------- 別人改了',queue))+source.slice(commit,source.indexOf('\nasync function undo(',commit)),f.ctx);
    await f.ctx.confirm();assert.equal(successes(f).length,0);assert.equal(f.ctx.SYNC.state,'error');
    assert.match(f.ctx.SYNC.msg,/儲存空間不足/);assert.equal(f.ctx.UI.modal,f.modal);assert.equal(f.modal.saving,false);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('normal close, Escape and overlay close share a guard that cannot discard a saving import',()=>{
  const f=fixture();f.modal.saving=true;
  Object.assign(f.ctx,{cancelPlanCalculation:()=>{},$:()=>null,maybeReload:()=>{},modalReturnFocus:null,requestAnimationFrame:fn=>fn()});
  const at=source.indexOf('function closeModal(){');vm.runInContext(source.slice(at,source.indexOf('async function openLegacyHistory(',at)),f.ctx);
  f.ctx.closeModal();assert.equal(f.ctx.UI.modal,f.modal);
});

function preview(f){
  f.ctx.esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  f.ctx.translateImportError=x=>x;
  const at=source.indexOf('"import-preview"(m){');
  vm.runInContext('{const modals={'+source.slice(at,source.indexOf('"legacy-preview"(m){',at))+'};this.preview=modals["import-preview"];} ',f.ctx);
  return f.ctx.preview(f.modal);
}
function buttons(html){
  const found=[],p=new SaxesParser({fragment:true});
  p.on('opentag',t=>{if(t.name==='button')found.push(t.attributes);});p.write(html.replace(/ disabled(?=[ >])/g,' disabled="disabled"')).close();return found;
}
test('actual preview renders busy status and disables both footer actions until acknowledgment',async()=>{
  const f=fixture(),task=f.ctx.confirm(),c=preview(f);
  assert.match(c.body,/role="status"/);assert.match(c.body,/正在儲存匯入資料/);
  const actions=buttons(c.foot);assert.equal(actions.length,2);assert.ok(actions.every(a=>'disabled' in a));
  f.pending.resolve(false);await task;
  const failed=preview(f);assert.match(failed.body,/role="alert"/);assert.match(failed.foot,/重試儲存/);
  assert.ok(buttons(failed.foot).every(a=>!('disabled' in a)));
});
test('preview escapes file and failure messages; no retry offered after recovered remote snapshot',async()=>{
  const f=fixture(),task=f.ctx.confirm();f.ctx.S={...f.ctx.S,blocks:[{id:'remote'}]};f.pending.resolve(false);await task;
  f.modal.filename='<img onerror="bad">';f.modal.importError='<script>bad</script>';
  const c=preview(f);assert.ok(!c.body.includes('<script>'));assert.ok(!c.body.includes('<img'));
  assert.equal(buttons(c.foot).length,1);assert.ok(!c.foot.includes('x-import-confirm'));
});
test('retry respects original schedule permission and changed owner before another write',async()=>{
  for(const kind of ['schedule','store','user','epoch','mutation']){
    const f=fixture(),task=f.ctx.confirm();f.pending.resolve(false);await task;
    if(kind==='schedule')f.ctx.readOnly=true;
    if(kind==='store')f.ctx.STORE={...f.ctx.STORE};
    if(kind==='user')f.ctx.STORE.session={user:{id:'other'}};
    if(kind==='epoch')f.ctx.STORE.authEpoch++;
    if(kind==='mutation')f.ctx.S.blocks.push({id:'newer'});
    const before=JSON.stringify(f.ctx.S);await f.ctx.confirm();
    assert.equal(JSON.stringify(f.ctx.S),before,kind);assert.equal(f.ctx.undoStack.length,1,kind);
    assert.equal(f.events.filter(e=>e.type==='commit').length,1,kind);
  }
});
test('actual LocalStore failure followed by retry persists once and keeps one import log',async()=>{
  const f=fixture(),old=globalThis.localStorage;let value=null,writes=0,fail=true;
  globalThis.localStorage={getItem:()=>value,setItem:(k,v)=>{writes++;if(fail)throw new Error('quota');value=v;}};
  try{
    f.ctx.STORE=new LocalStore();Object.assign(f.ctx,{structuredClone,syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,updateSyncChip:()=>{},maybeReload:()=>{}});
    const queue=source.indexOf('function queueSync(entry){'),commit=source.indexOf('function commit(');
    vm.runInContext(source.slice(queue,source.indexOf('// ---------- 別人改了',queue))+source.slice(commit,source.indexOf('\nasync function undo(',commit)),f.ctx);
    await f.ctx.confirm();assert.equal(successes(f).length,0);assert.equal(value,null);
    fail=false;await f.ctx.confirm();assert.equal(successes(f).length,1);assert.equal(writes,2);
    const stored=JSON.parse(value);assert.equal(stored.employees[0].id,'new');assert.equal(stored.log.length,1);
    assert.equal(f.ctx.undoStack.length,1);assert.equal(f.ctx.SYNC.state,'ok');
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

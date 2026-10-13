import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(kind='leave'){
  const pending=deferred(),events=[],writes=[];
  const ctx={UI:{modal:kind==='leave'?{t:'leave-request'}:null,drawer:kind==='pin'?'notes':'people',date:'2026-10-14',factory:1,page:'schedule'},PV:null,
    S:{blocks:[{id:'synthetic-block'}],memos:[{id:'synthetic-memo',text:'Synthetic memo',machineId:'synthetic-machine',pinned:false}],leaveRequests:[{id:'synthetic-request',status:'pending'}]},
    STORE:{kind:'local',session:{user:{id:'A'}},authEpoch:1,createLeaveRequest:row=>{writes.push(row);return pending.promise;},
      resolveLeaveRequest:(id,status)=>{writes.push({id,status});return pending.promise;},saveMemo:row=>{writes.push(row);return pending.promise;}},
    canPermission:()=>true,canIncidents:()=>true,uid:()=> 'synthetic-new-request',tx:x=>x,emp:()=>({name:'Synthetic'}),md:x=>x,SOLVER:null,sendLineNotify:()=>{events.push('notify');return Promise.resolve();},
    renderModal:()=>events.push('modal-render'),render:()=>events.push('render'),maybeReload:()=>events.push('maybe'),
    $:s=>({value:s==='#leave-request-employee'?'synthetic-person':s==='#leave-request-date'?'2026-10-15':'Synthetic note'}),
    closeModal:()=>{events.push('close');ctx.UI.modal=null;},reloadFromStore:async options=>{events.push({type:'reload',options});return 'applied';},toast:text=>events.push({type:'toast',text}),MODAL_ACT:{}};
  const helperAt=source.indexOf('function directWriteStatus('),at=source.indexOf('async function resolveLeaveRequest(');
  vm.createContext(ctx);vm.runInContext(source.slice(helperAt<0?at:helperAt,source.indexOf('\n});',at)+5),ctx);
  const run=kind==='leave'?ctx.MODAL_ACT['leave-request-save']:kind==='pin'?ctx.toggleMemoPin:ctx.resolveLeaveRequest;
  return {ctx,pending,events,writes,run,m:ctx.UI.modal,button:{disabled:false,dataset:{id:kind==='pin'?'synthetic-memo':'synthetic-request',v:'approved'}}};
}
const reloads=f=>f.events.filter(e=>e?.type==='reload');
const toasts=f=>f.events.filter(e=>e?.type==='toast');

test('memo pin CSS keeps a 44px target and room for its neighboring author label',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const rule=css.match(/\.memo-pin\{([^}]+)\}/)?.[1];assert.match(rule,/width:44px/);assert.match(rule,/height:44px/);
  assert.match(css,/\.memo-card b\{[^}]*margin-right:38px/);
});

test('all three direct actions discard late ACKs after dialog, drawer, owner, preview or state changes',async()=>{
  for(const kind of ['leave','pin','resolve'])for(const change of ['modal','drawer','date','factory','page','focus','user','epoch','store','client','preview','state','mutation','permission']){
    const f=fixture(kind),job=f.run(f.button);
    if(change==='modal')f.ctx.UI.modal={t:'new-draft'};if(change==='drawer')f.ctx.UI.drawer='output';if(change==='date')f.ctx.UI.date='2026-10-16';
    if(change==='factory')f.ctx.UI.factory=2;if(change==='page')f.ctx.UI.page='worklog';if(change==='focus')f.ctx.UI.focus={type:'machine',id:'other'};
    if(change==='user')f.ctx.STORE.session={user:{id:'B'}};if(change==='epoch')f.ctx.STORE.authEpoch++;if(change==='store')f.ctx.STORE={...f.ctx.STORE};if(change==='client')f.ctx.STORE.client={};
    if(change==='preview')f.ctx.PV={kind:'manual'};if(change==='state')f.ctx.S={...f.ctx.S};if(change==='mutation')f.ctx.S.blocks[0].id='draft';
    if(change==='permission'){f.ctx.canPermission=()=>false;f.ctx.canIncidents=()=>false;}
    const modal=f.ctx.UI.modal,drawer=f.ctx.UI.drawer;f.pending.resolve();await job;
    assert.equal(f.ctx.UI.modal,modal,kind+'/'+change);assert.equal(f.ctx.UI.drawer,drawer,kind+'/'+change);
    assert.equal(reloads(f).length,0,kind+'/'+change);assert.equal(toasts(f).length,0,kind+'/'+change);
  }
});

test('all three actions suppress double submit including a second freshly rendered button',async()=>{
  for(const kind of ['leave','pin','resolve']){
    const f=fixture(kind),job=f.run(f.button),second=f.run({...f.button,disabled:false});
    try{assert.equal(f.writes.length,1,kind);assert.ok(f.ctx.UI.directSaving,kind);assert.equal(reloads(f).length,0);}
    finally{f.pending.resolve();await Promise.all([job,second]);}
    assert.equal(f.ctx.UI.directSaving,null);assert.equal(reloads(f).length,1);assert.equal(reloads(f)[0].options?.background,true);
  }
});

test('old rejection does not announce an error or touch a new draft',async()=>{
  for(const kind of ['leave','pin','resolve']){const f=fixture(kind),job=f.run(f.button),modal=f.ctx.UI.modal={t:'new-draft'};
    f.pending.reject(new Error('OLD_SYNTHETIC_ERROR'));await job;assert.equal(f.ctx.UI.modal,modal);assert.equal(toasts(f).length,0,kind);assert.equal(reloads(f).length,0);}
});

test('a new dialog, drawer or preview during protected reread is never replaced by old final handling',async()=>{
  for(const kind of ['leave','pin','resolve'])for(const change of ['modal','drawer','preview']){
    const f=fixture(kind),read=deferred();f.ctx.reloadFromStore=options=>{f.events.push({type:'reload',options});return read.promise;};
    const job=f.run(f.button);f.pending.resolve();await tick();
    if(change==='modal')f.ctx.UI.modal={t:'new-draft'};if(change==='drawer')f.ctx.UI.drawer='output';if(change==='preview')f.ctx.PV={kind:'manual'};
    const modal=f.ctx.UI.modal,drawer=f.ctx.UI.drawer;read.resolve('applied');await job;
    assert.equal(f.ctx.UI.modal,modal);assert.equal(f.ctx.UI.drawer,drawer);assert.equal(toasts(f).length,0,kind+'/'+change);
  }
});

test('failed/deferred reread is not reported as fully refreshed leave or pin data',async()=>{
  for(const kind of ['leave','pin','resolve'])for(const result of ['failed','deferred']){const f=fixture(kind);f.ctx.reloadFromStore=async()=>result;
    const job=f.run(f.button);f.pending.resolve();await job;assert.equal(toasts(f).length,1);assert.match(toasts(f)[0].text,/尚未讀到最新/,kind+'/'+result);}
});

test('current leave failure preserves submitted fields on modal rerender without claiming approval',async()=>{
  const f=fixture(),job=f.run(f.button);f.pending.reject(new Error('<Synthetic failure>'));await job;
  assert.equal(f.ctx.UI.modal,f.m);assert.equal(f.m.error,'<Synthetic failure>');assert.equal(f.m.leaveDraft.note,'Synthetic note');assert.equal(f.m.saving,false);
  assert.equal(f.ctx.S.leaveRequests[0].status,'pending');assert.equal(reloads(f).length,0);
});

test('a leave ACK that loses UI ownership does not dispatch an optional LINE side effect',async()=>{
  const f=fixture();f.ctx.STORE.kind='supabase';f.ctx.STORE.jwt=()=> 'synthetic-token';f.ctx.SOLVER={url:'https://synthetic.invalid'};
  const job=f.run(f.button);f.ctx.UI.modal={t:'new-draft'};f.pending.resolve();await job;assert.equal(f.events.includes('notify'),false);
});

test('leave renderer keeps submitted values and truthful close/busy/error semantics',()=>{
  const f=fixture();Object.assign(f.ctx,{MODALS:{},shownEmployees:()=>[{id:'synthetic-person',name:'Synthetic'}],esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
  const at=source.indexOf("MODALS['leave-request']=");vm.runInContext(source.slice(at,source.indexOf('/* ---------- 員工月曆',at)),f.ctx);
  Object.assign(f.m,{saving:true,error:'<unsafe>',leaveDraft:{employeeId:'synthetic-person',date:'2026-10-15',note:'<Synthetic>'}});
  const html=f.ctx.MODALS['leave-request'](f.m);assert.match(html.body,/role="status"/);assert.match(html.body,/關閉視窗不會取消/);
  assert.match(html.body,/role="alert"/);assert.ok(!html.body.includes('<unsafe>'));assert.match(html.body,/value="synthetic-person" selected/);
  assert.match(html.body,/value="2026-10-15"/);assert.match(html.body,/value="&lt;Synthetic&gt;"/);assert.match(html.foot,/data-act="leave-request-save" disabled/);assert.match(html.foot,/>關閉</);
});

test('stale completion clears only request controls/spinner, not the newer draft DOM',async()=>{
  const f=fixture('pin'),controls=[{dataset:{act:'memo-pin'},disabled:true},{dataset:{act:'leave-resolve'},disabled:true}],removed=[];
  f.ctx.document={querySelectorAll:selector=>selector==='[data-direct-write-control]'?controls:[{remove:()=>removed.push('spinner')}]};
  const job=f.run(f.button);f.ctx.UI.modal={t:'new-draft'};const before=f.events.filter(x=>x==='render').length;
  f.pending.resolve();await job;assert.equal(f.events.filter(x=>x==='render').length,before);assert.equal(f.ctx.UI.modal.t,'new-draft');
  assert.ok(controls.every(x=>!x.disabled));assert.deepEqual(removed,['spinner']);
});

test('read-only roles and pending memo writes cannot dispatch leave or pin requests',async()=>{
  for(const kind of ['leave','pin','resolve'])for(const mode of ['permission','memo','brush']){
    const f=fixture(kind);if(mode==='permission'){f.ctx.canPermission=()=>false;f.ctx.canIncidents=()=>false;}
    if(mode==='memo')f.ctx.UI.memoSaving={};if(mode==='brush')f.ctx.UI.leaveBrushSaving={};
    await f.run(f.button);assert.equal(f.writes.length,0,kind+'/'+mode);assert.equal(reloads(f).length,0);
  }
});

test('actual LocalStore leave, approval and pin handlers keep schedules intact and reread persisted results',async()=>{
  const old=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{
    for(const kind of ['leave','pin','resolve']){
      const f=fixture(kind);f.ctx.STORE=new LocalStore();f.ctx.S={...f.ctx.S,employees:[{id:'synthetic-person',name:'Synthetic'}],machines:[],products:[],orders:[],calendar:{},leaves:[]};
      f.ctx.S.employees[0].leaves=[];f.ctx.S.leaveRequests[0].employeeId='synthetic-person';f.ctx.S.leaveRequests[0].date='2026-10-16';await f.ctx.STORE.sync(f.ctx.S);const before=JSON.stringify(f.ctx.S.blocks);
      Object.assign(f.ctx,{lastLocalWrite:0,pendingReload:false,normalizeState:()=>{},remoteReloadBlocked:()=>!!(f.ctx.UI.modal||f.ctx.PV||f.ctx.UI.directSaving)});
      const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('async function refreshCloudSnapshot',at)),f.ctx);
      await f.run(f.button);const stored=await f.ctx.STORE.load();assert.equal(JSON.stringify(stored.blocks),before);assert.equal(JSON.stringify(f.ctx.S.blocks),before);
      if(kind==='leave'){assert.equal(stored.leaveRequests.length,2);assert.equal(stored.leaveRequests[1].status,'pending');assert.equal(Object.keys(stored.calendar).length,0);}
      if(kind==='pin')assert.equal(f.ctx.S.memos[0].pinned,true);
      if(kind==='resolve')assert.equal(f.ctx.S.leaveRequests[0].status,'approved');
      assert.equal(toasts(f).length,1);assert.equal(f.ctx.UI.directSaving,null);
    }
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

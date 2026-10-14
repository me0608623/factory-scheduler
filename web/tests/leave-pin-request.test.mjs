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
function reconciliation(f){
  const timers=[],reads=[];f.ctx.S.log=[];Object.assign(f.ctx,{drag:null,generalDrag:null,syncPending:0,SYNC:{state:'ok'},lastLocalWrite:0,pendingReload:false,reloadTimer:null,remoteLoading:false,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},normalizeState:()=>{},notificationEnabled:()=>false,showDeviceNotification:()=>{}});
  f.ctx.STORE.load=async()=>{reads.push('read');return {...f.ctx.S,memos:[{...f.ctx.S.memos[0],pinned:true}],leaveRequests:[{...f.ctx.S.leaveRequests[0],status:'approved'}]};};
  const at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 帳號與連線',at)),f.ctx);
  return {timers,reads};
}

test('late successful leave creation, approval and pin queue one read after their drawer closes',async()=>{
  for(const kind of ['leave','resolve','pin']){
    const f=fixture(kind),h=reconciliation(f),job=f.run(f.button);f.ctx.UI.modal=null;f.ctx.UI.drawer=null;f.pending.resolve();await job;
    assert.equal(h.timers.length,1,kind);assert.equal(h.reads.length,0);await h.timers.shift()();assert.equal(h.reads.length,1);
    assert.equal(f.ctx.UI.modal,null);assert.equal(f.ctx.UI.drawer,null);assert.equal(f.writes.length,1);assert.equal(toasts(f).length,0);
  }
});

test('late direct successes leave new drafts and previews intact until one safe reread',async()=>{
  for(const kind of ['leave','resolve','pin'])for(const mode of ['modal','preview']){
    const f=fixture(kind),h=reconciliation(f),job=f.run(f.button),state=f.ctx.S;
    f.ctx.UI.modal=mode==='modal'?{t:'new-draft',value:'keep'}:null;if(mode==='preview')f.ctx.PV={draft:'keep'};const modal=f.ctx.UI.modal,preview=f.ctx.PV;
    f.pending.resolve();await job;assert.equal(f.ctx.pendingReload,true,kind+'/'+mode);assert.equal(h.timers.length,0);
    assert.equal(f.ctx.S,state);assert.equal(f.ctx.UI.modal,modal);assert.equal(f.ctx.PV,preview);assert.equal(toasts(f).length,0);
    f.ctx.UI.modal=null;f.ctx.PV=null;f.ctx.maybeReload();assert.equal(h.timers.length,1);await h.timers.shift()();assert.equal(h.reads.length,1);assert.equal(f.writes.length,1);
  }
});

test('old account, store, client and epoch ACKs never schedule direct-action reconciliation for a new session',async()=>{
  for(const kind of ['leave','resolve','pin'])for(const mode of ['user','store','client','epoch']){
    const f=fixture(kind),h=reconciliation(f),job=f.run(f.button);f.ctx.UI.modal=null;
    if(mode==='user')f.ctx.STORE.session={user:{id:'B'}};if(mode==='store')f.ctx.STORE={...f.ctx.STORE};if(mode==='client')f.ctx.STORE.sb={};if(mode==='epoch')f.ctx.STORE.authEpoch++;
    f.pending.resolve();await job;assert.equal(f.ctx.pendingReload,false);assert.equal(h.timers.length,0);assert.equal(h.reads.length,0);
  }
});

for(const kind of ['leave','resolve','pin'])test('real SQL and SDK '+kind+' late success reconciles after the new draft closes, without replay',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444',memo='55555555-5555-4555-8555-555555555555',leave='66666666-6666-4666-8666-666666666666',newLeave='77777777-7777-4777-8777-777777777777';
    await db.query("insert into auth.users(id,email) values($1,'synthetic-direct@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const employee=(await db.query("select id from employees where name='張三'")).rows[0].id,date=(await db.query('select (current_date+1)::text date')).rows[0].date;
    await db.query("insert into schedule_memos(id,text,machine_id,pinned,author,created_by) values($1,'Synthetic memo','a',false,'Synthetic',$2)",[memo,actor]);
    if(kind!=='leave')await db.query("insert into leave_requests(id,employee_id,date,note,status,created_by) values($1,$2,$3,'Synthetic','pending',$4)",[leave,employee,date,actor]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();const state=await reader.load(),before=JSON.stringify(state.blocks);
    const ready=deferred(),gate=deferred();let calls=0;const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      calls++;const args=JSON.parse(options.body),path=new URL(url).pathname;
      const result=kind==='resolve'?(assert.equal(path,'/rest/v1/rpc/resolve_leave_request'),await fake.rpc('resolve_leave_request',args)):
        kind==='pin'?(assert.equal(path,'/rest/v1/schedule_memos'),await fake.from('schedule_memos').upsert(args,{onConflict:'id'})):
        (assert.equal(path,'/rest/v1/leave_requests'),await fake.from('leave_requests').insert(args));
      assert.equal(result.error,null);ready.resolve();await gate.promise;return new Response(null,{status:204});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};
    const f=fixture(kind);f.ctx.S=state;f.ctx.STORE=store;f.ctx.uid=()=>newLeave;f.ctx.$=s=>({value:s==='#leave-request-employee'?employee:s==='#leave-request-date'?date:'Synthetic note'});
    f.button.dataset.id=kind==='pin'?memo:leave;const h=reconciliation(f);store.load=async options=>{assert.equal(options.remember,false);h.reads.push('read');return reader.load({remember:false});};
    const job=f.run(f.button);const dispatched=await Promise.race([ready.promise.then(()=>true),job.then(()=>false)]);
    assert.equal(dispatched,true,f.m?.error||JSON.stringify(toasts(f)));const draft=f.ctx.UI.modal={t:'new-draft',value:'keep'};gate.resolve();await job;
    assert.equal(f.ctx.pendingReload,true);assert.equal(h.reads.length,0);assert.equal(f.ctx.S,state);assert.equal(f.ctx.UI.modal,draft);
    f.ctx.UI.modal=null;f.ctx.maybeReload();assert.equal(h.timers.length,1);await h.timers.shift()();
    assert.equal(h.reads.length,1);assert.equal(calls,1);assert.equal(toasts(f).length,0);assert.equal(JSON.stringify(f.ctx.S.blocks),before);
    if(kind==='pin')assert.equal(f.ctx.S.memos.find(m=>m.id===memo).pinned,true);
    if(kind==='resolve'){assert.equal(f.ctx.S.leaveRequests.find(r=>r.id===leave).status,'approved');assert.equal((await db.query('select count(*)::int n from leaves where employee_id=$1 and date=$2',[employee,date])).rows[0].n,1);}
    if(kind==='leave'){assert.equal(f.ctx.S.leaveRequests.find(r=>r.id===newLeave).status,'pending');assert.equal((await db.query('select count(*)::int n from leave_requests where id=$1',[newLeave])).rows[0].n,1);}
  }finally{await db.close();}
});

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
    if(change==='user')f.ctx.STORE.session={user:{id:'B'}};if(change==='epoch')f.ctx.STORE.authEpoch++;if(change==='store')f.ctx.STORE={...f.ctx.STORE};if(change==='client')f.ctx.STORE.sb={};
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

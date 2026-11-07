import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Optional roots let the same regression execute complete composed handlers and
// that checkout's real stores/migrations, rather than a shortened hand-written copy.
const root=process.env.SCHEDULER_TEST_ROOT?pathToFileURL(resolve(process.env.SCHEDULER_TEST_ROOT)+'/'):new URL('../../',import.meta.url);
const source=readFileSync(process.env.SCHEDULER_APP_SOURCE||new URL('web/src/app.js',root),'utf8');
const {LocalStore}=await import(new URL('web/src/store/local.js',root));
const {SupabaseStore}=await import(new URL('web/src/store/supabase.js',root));
const {makeDb,FakeSupabase}=await import(new URL('web/tests/fake-supabase.mjs',root));
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`complete source section ${start}`);return source.slice(a,b);};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const today=new Date().toISOString().slice(0,10),target=new Date(Date.parse(today+'T00:00:00Z')+3*864e5).toISOString().slice(0,10);
const notice='已記錄故障，這段時間沒有工作受影響';
let ids=0;
function fixture(store,state){
  const events=[],plans=[];
  const c={S:state||{v:1,machines:[{id:'m1',label:'Synthetic machine',proc:'cut',products:[],faults:[]}],employees:[],products:[],orders:[],blocks:[],log:[],cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{}},
    STORE:store,UI:{date:target,view:'day',layout:'resource',factory:1,group:'all',modal:null},PV:null,SYNC:{state:'ok',msg:''},
    syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,MODAL_ACT:{},undoStack:[],
    uid:()=>`99999999-0000-4000-8000-${String(++ids).padStart(12,'0')}`,SOLVER:{url:'https://never-used.invalid',up:false},
    render:()=>{},renderModal:()=>{},rerender:()=>{},updateSyncChip:()=>{},toast:(text,label,callback)=>events.push({type:'toast',text,label,callback}),
    maybeReload:()=>{},reloadFromStore:async()=> 'applied',cancelPlanCalculation:()=>{},$:()=>null,modalReturnFocus:null,
    requestAnimationFrame:fn=>fn(),document:{activeElement:null,body:{}},HTMLElement:class {},executionRetries:{get:()=>null},
    tx:x=>x,esc:String,todayStr:()=>today,md:x=>x,mdw:x=>x,hm:x=>String(x),DAY1:1080,REG_END:1020,
    absOf:(d,m)=>Date.parse(d+'T00:00:00Z')/60000+m,nowMin:()=>600,syncInputs:()=>{},
    openPlans:(...args)=>plans.push(args),STRAT_EVENT:[],STRAT_RECOVER:[],effectivePermission:()=>true,
    sendLineNotify:async(...args)=>events.push({type:'line-spy',args})};
  c.mach=id=>c.S.machines.find(m=>m.id===id);
  vm.createContext(c);
  vm.runInContext(section('function canPermissionRaw(key){','const ROLE_NAME=')+
    section('function pushUndo(){','async function undo(){')+
    section('function queueSync(entry){','// ---------- 別人改了')+
    section('function openModal(m){','function ownsLegacyRequest(')+
    section(['async function saveFaultWithNotice(', 'function faultGeneralWorkConflicts(', 'function captureFault(m){']
      .filter(start=>source.includes(start)).sort((a,b)=>source.indexOf(a)-source.indexOf(b))[0],'Object.assign(MODAL_ACT,{')+
    'Object.assign(MODAL_ACT,{'+section('"m-fault":()=>{','"m-mach-save":()=>{')+'});',c);
  c.UI.modal={t:'mach',id:c.S.machines[0].id,fs:600,fd:60,note:'Synthetic regression only'};
  return {c,events,plans,click:()=>c.MODAL_ACT['m-fault'](),notices:()=>events.filter(x=>x.type==='toast'&&x.text===notice),retry:()=>events.find(x=>x.label==='重試')?.callback};
}
async function localCase(run,{quota=false,throwSync=false}={}){
  const old=globalThis.localStorage;let stored=null,writes=0,fail=quota;
  globalThis.localStorage={getItem:()=>stored,setItem:(_k,s)=>{writes++;if(fail)throw Error('SYNTHETIC-QUOTA');stored=s;}};
  const store=new LocalStore(),sync=store.sync.bind(store),gate=deferred(),started=deferred();
  store.session={user:{id:'synthetic-owner'}};store.authEpoch=1;store.sb={synthetic:true};
  if(throwSync)store.sync=()=>{started.resolve();throw Error('SYNTHETIC-SYNC-THROW');};
  else store.sync=async(s,e)=>{started.resolve();await gate.promise;return sync(s,e);};
  const f=fixture(store);
  try{await run({...f,store,gate,started,saved:()=>stored&&JSON.parse(stored),writes:()=>writes,allow:()=>{fail=false;store.sync=sync;}});}
  finally{gate.resolve();await f.c.syncChain;if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
}

test('actual LocalStore ACK: close immediately, retain candidate, announce only after persistence; double click writes once',async()=>{
  await localCase(async f=>{
    const task=f.click();await f.started.promise;
    const early=f.notices().length;assert.equal(f.c.UI.modal,null);assert.equal(f.saved(),null);assert.equal(f.c.SYNC.state,'busy');
    assert.equal(f.c.S.machines[0].faults.length,1);await f.click();
    f.gate.resolve();await task;await f.c.syncChain;
    assert.equal(early,0,'no completion before persistence ACK');assert.equal(f.notices().length,1);
    assert.equal(f.saved().machines[0].faults.length,1);assert.equal(f.writes(),1);assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.log.length,1);
    assert.equal(f.c.SYNC.state,'ok');assert.equal(f.events.filter(e=>e.type==='line-spy').length,0);
  });
});
for(const outcome of ['reject','quota','throw'])test(`actual commit/queue ${outcome}: no success, retained candidate and generic retry`,async()=>{
  await localCase(async f=>{
    const task=f.click();await f.started.promise;
    if(outcome==='reject')f.gate.reject(Error('SYNTHETIC-OFFLINE'));else f.gate.resolve();
    await task;await f.c.syncChain;
    assert.equal(f.notices().length,0);assert.equal(f.saved(),null);assert.equal(f.c.SYNC.state,'error');assert.equal(f.c.S.machines[0].faults.length,1);
    assert.equal(typeof f.retry(),'function');const state=f.c.S;f.allow();assert.equal(await f.retry()(),true);
    assert.equal(f.c.S,state);assert.equal(f.saved().machines[0].faults.length,1);assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.log.length,1);
    assert.equal(f.notices().length,0,'retry must not revive the closed action notice');
  },{quota:outcome==='quota',throwSync:outcome==='throw'});
});
const changes={
  store:c=>{c.STORE={...c.STORE};},client:c=>{c.STORE.sb={newer:true};},user:c=>{c.STORE.session={user:{id:'other'}};},
  authEpoch:c=>{c.STORE.authEpoch++;},syncEpoch:c=>{c.syncEpoch++;},signedOut:c=>{c.STORE.session=null;},
  state:c=>{c.S=structuredClone(c.S);},mutation:c=>{c.S.machines[0].label='newer edit';},
  permission:c=>{c.STORE.kind='supabase';c.STORE.can=()=>false;},
  modal:c=>c.openModal({t:'settings'}),modalRoundtrip:c=>{c.openModal({t:'settings'});c.closeModal();},
  preview:c=>{c.PV={title:'new preview'};},date:c=>{c.UI.date=today;},view:c=>{c.UI.view='month';},
  layout:c=>{c.UI.layout='employee';},factory:c=>{c.UI.factory=2;},group:c=>{c.UI.group='other';},
  page:c=>{c.UI.page='worklog';},drawer:c=>{c.UI.drawer='orders';},focus:c=>{c.UI.focus={id:'new focus'};},
  returnTo:c=>{c.UI.returnTo='other';},editCell:c=>{c.UI.editCell={table:'machines',id:'m1',key:'label'};},
  leaveBrush:c=>{c.UI.leaveBrush=true;},brushStart:c=>{c.UI.brushStart=today;},
};
for(const [name,change] of Object.entries(changes))test(`late ACK does not announce or change newer ${name}`,async()=>{
  await localCase(async f=>{
    const task=f.click();await f.started.promise;change(f.c);
    const state=f.c.S,json=JSON.stringify(state),modal=f.c.UI.modal,view=JSON.stringify(f.c.UI);
    f.gate.resolve();await task;await f.c.syncChain;
    assert.equal(f.notices().length,0);assert.equal(f.c.S,state);assert.equal(JSON.stringify(f.c.S),json);assert.equal(f.c.UI.modal,modal);
    const clean=x=>{const v=JSON.parse(x);delete v.faultSaveNotice;return v;};assert.deepEqual(clean(JSON.stringify(f.c.UI)),clean(view));
  });
});
test('same-user session refresh still announces one confirmed fault',async()=>{
  await localCase(async f=>{
    const task=f.click();await f.started.promise;f.c.STORE.session={user:{id:'synthetic-owner'},access_token:'not-used'};
    f.gate.resolve();await task;await f.c.syncChain;assert.equal(f.notices().length,1);assert.equal(f.saved().machines[0].faults.length,1);
  });
});
test('new fault dialog roundtrip owns its notice; older ACK cannot clear the new token',async()=>{
  await localCase(async f=>{
    const first=f.click();await f.started.promise;
    f.c.openModal({t:'mach',id:f.c.S.machines[0].id,fs:700,fd:30});const second=f.click(),token=f.c.UI.faultSaveNotice;
    const gate2=deferred(),started2=deferred(),sync=f.store.sync;
    f.store.sync=async(...args)=>{started2.resolve();await gate2.promise;return sync(...args);};
    f.gate.resolve();await first;await started2.promise;
    const olderNotices=f.notices().length,keptToken=f.c.UI.faultSaveNotice===token;
    gate2.resolve();await second;await f.c.syncChain;
    assert.equal(olderNotices,0);assert.equal(keptToken,true);
    assert.equal(f.notices().length,1);assert.equal(f.saved().machines[0].faults.length,2);assert.equal(f.c.S.log.length,2);assert.equal(f.c.undoStack.length,2);
  });
});

test('permission refusal and already-closed modal do not create fault writes',async()=>{
  for(const kind of ['permission','closed'])await localCase(async f=>{
    if(kind==='permission'){f.store.kind='supabase';f.store.can=()=>false;}else f.c.UI.modal=null;
    await f.click();await f.c.syncChain;assert.equal(f.writes(),0);assert.equal(f.c.undoStack.length,0);assert.equal(f.c.S.log.length,0);assert.equal(f.notices().length,0);
  });
});
test('product-work fault preview and early LINE policy remain unchanged',async()=>{
  await localCase(async f=>{
    f.store.kind='supabase';f.c.S.blocks=[{m:f.c.S.machines[0].id,date:target,s:600,e:660}];
    await f.click();await f.c.syncChain;
    assert.equal(f.plans.length,1);assert.equal(f.plans[0][2],'fault');assert.equal(f.c.S.machines[0].faults.length,0);
    assert.equal(f.writes(),0);assert.equal(f.c.S.log.length,0);assert.equal(f.notices().length,0);assert.equal(f.events.filter(e=>e.type==='line-spy').length,1);
  });
});
test('m-fix is still preview-only, with no direct commit or completion notice',async()=>{
  await localCase(async f=>{
    f.c.S.machines[0].faults=[{id:'fault-control',date:target,s:600,e:660}];
    const state=JSON.stringify(f.c.S);f.c.MODAL_ACT['m-fix']({dataset:{v:'0'}});await f.c.syncChain;
    assert.equal(f.plans.length,1);assert.equal(f.plans[0][2],'recover');assert.equal(JSON.stringify(f.c.S),state);
    assert.equal(f.writes(),0);assert.equal(f.c.undoStack.length,0);assert.equal(f.notices().length,0);
  });
});
test('real SupabaseStore with isolated migrated SQL gates fault ACK/reject/throw and retry',async t=>{
  const db=await makeDb();
  try{
    const boss='11111111-1111-4111-8111-111111111111';await db.query("insert into auth.users(id,email) values($1,'fault-ack@invalid')",[boss]);await db.query("update profiles set role='boss' where user_id=$1",[boss]);
    const sb=new FakeSupabase(db,{test:{id:boss,password:'synthetic'}});await sb.auth.signInWithPassword({email:'test',password:'synthetic'});
    for(const outcome of ['ack','reject','throw'])await t.test(`SQL ${outcome}`,async()=>{
      const store=new SupabaseStore(sb);await store.init();const state=await store.load();
      const from=sb.from.bind(sb),gate=deferred(),started=deferred();let faultWrites=0;
      sb.from=table=>{const q=from(table);if(table==='machine_faults'){
        const then=q.then.bind(q);q.then=(resolve,reject)=>{faultWrites++;started.resolve();return gate.promise.then(()=>{
          if(outcome==='reject')return {data:null,error:{message:'SYNTHETIC-FAULT-REJECT'}};
          if(outcome==='throw')throw Error('SYNTHETIC-FAULT-THROW');return {then};
        }).then(resolve,reject);};
      }return q;};
      try{
        const f=fixture(store,state),task=f.click();
        await Promise.race([started.promise,f.c.syncChain.then(()=>{throw Error('ended before SQL fault write: '+f.c.SYNC.msg);})]);
        const id=f.c.S.machines[0].faults.at(-1).id,count=async()=>(await db.query('select count(*)::int n from machine_faults where id=$1',[id])).rows[0].n;
        const early=f.notices().length;assert.equal(await count(),0);assert.equal(f.c.UI.modal,null);assert.equal(f.c.SYNC.state,'busy');await f.click();
        gate.resolve();await task;await f.c.syncChain;
        assert.equal(early,0,'no success before SQL persistence');assert.equal(await count(),outcome==='ack'?1:0);
        assert.equal(f.notices().length,outcome==='ack'?1:0);assert.equal(f.c.SYNC.state,outcome==='ack'?'ok':'error');assert.equal(faultWrites,1);assert.equal(f.c.undoStack.length,1);
        assert.equal(f.events.filter(e=>e.type==='line-spy').length,outcome==='ack'?1:0);
        if(outcome!=='ack'){
          sb.from=from;const candidate=f.c.S,logs=f.c.S.log.length;assert.equal(await f.retry()(),true);
          assert.equal(await count(),1);assert.equal(f.c.S,candidate);assert.equal(f.c.S.log.length,logs);assert.equal(f.c.undoStack.length,1);assert.equal(f.notices().length,0);
          assert.equal(f.events.filter(e=>e.type==='line-spy').length,0,'generic retry keeps existing LINE policy');
        }
      }finally{gate.resolve();sb.from=from;}
    });
  }finally{await db.close();}
});

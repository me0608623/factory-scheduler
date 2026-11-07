import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const section=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`source section ${start}`);
  return source.slice(a,b);
};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const day=(date,offset)=>new Date(Date.parse(date+'T00:00:00Z')+offset*864e5).toISOString().slice(0,10);
const today=new Date().toISOString().slice(0,10),target=day(today,3);
const monthStart=target.slice(0,7)+'-01',nextMonth=day(monthStart,32).slice(0,7)+'-01';
const pastMonth=day(today.slice(0,7)+'-01',-1).slice(0,7)+'-01';
const cases=[['no-work leave','lq',true],['monthly add','pm',true],['monthly cancel','pm',false]];
function fixture({store,state,mode='lq',want=true}={}){
  const transport=deferred(),started=deferred(),events=[],snapshots=[];
  const c={S:state||{employees:[{id:'employee',name:'Synthetic employee',leaves:want?[]:[target]}],blocks:[],log:[],cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{}},
    STORE:store||{kind:'local',session:{user:{id:'owner'}},authEpoch:1,sync:async(s)=>{snapshots.push(structuredClone(s));started.resolve();await transport.promise;}},
    UI:{date:target,view:'month',layout:'resource',factory:1,group:'all',modal:null,page:null,drawer:'people',focus:null,editCell:null},
    PV:null,SYNC:{state:'ok',msg:''},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,
    structuredClone,MODALS:{},MODAL_ACT:{},undoStack:[],uid:()=> '33333333-3333-4333-8333-333333333333',SOLVER:null,
    render:()=>events.push({type:'render'}),renderModal:()=>{},rerender:()=>{},updateSyncChip:()=>events.push({type:'sync',state:c.SYNC.state}),
    toast:(text,label,callback)=>events.push({type:'toast',text,label,callback}),maybeReload:()=>{},reloadFromStore:async()=> 'applied',
    cancelPlanCalculation:()=>{},$:()=>null,modalReturnFocus:null,requestAnimationFrame:fn=>fn(),
    document:{activeElement:null,body:{}},HTMLElement:class {},executionRetries:{get:()=>null},
    tx:x=>x,esc:String,tg:()=>'',WEEK_LABELS:[],todayStr:()=>today,futureOf:()=>true,md:x=>x,mdw:x=>x,
    openPlans:()=>events.push({type:'plans'}),STRAT_EVENT:[],effectivePermission:()=>true,pad:n=>String(n).padStart(2,'0')};
  c.emp=id=>c.S.employees.find(e=>e.id===id);
  vm.createContext(c);
  vm.runInContext(section('function parseD(ds){','function dayNum(ds){')+
    section('function monthDates(ds){','function peopleDrawerHTML(){')+
    section('function canPermissionRaw(key){','const ROLE_NAME=')+
    section('function pushUndo(){','async function undo(){')+
    section('function queueSync(entry){','// ---------- 別人改了')+
    section('function openModal(m){','function ownsLegacyRequest(')+
    (source.includes('async function saveLeaveWithNotice(')?section('async function saveLeaveWithNotice(','MODALS.leaveq='):'')+
    (source.includes('function personDayGeneralWork(')?section('function personDayGeneralWork(','function applyPersonDay('):'')+
    'Object.assign(MODAL_ACT,{'+section('"lq-go":()=>{','/* ---------- 操作手冊 ----------')+
    section("MODALS['person-day']=",'/* ---------- 整頁三張表'),c);
  const id=c.S.employees[0].id;
  c.UI.modal=mode==='lq'?{t:'leaveq',id,date:target}:{t:'person-month',id,off:new Set(want?[0,1,2,3,4,5,6]:[])};
  return {c,events,transport,started,snapshots,
    click:()=>c.MODAL_ACT[mode==='lq'?'lq-go':'pm-save'](),
    notices:()=>events.filter(x=>x.type==='toast'&&/^(已套用整月設定|已登記，當天沒有他的工作)|當天有排工作，已先跳過/.test(x.text))};
}

for(const [label,mode,want] of cases){
  test(`${label}: actual handler/commit/queue waits for ACK and repeated clicks do not write twice`,async()=>{
    const f=fixture({mode,want}),task=f.click();
    await f.started.promise;
    const early=f.notices().length;
    assert.equal(f.c.UI.modal,null);assert.equal(f.c.SYNC.state,'busy');
    await f.click();
    f.transport.resolve();await task;await f.c.syncChain;
    assert.equal(early,0,'must not announce before ACK');assert.equal(f.notices().length,1);
    assert.equal(f.snapshots.length,1);assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.log.length,1);
    assert.equal(f.c.S.employees[0].leaves.includes(target),want);assert.equal(f.c.SYNC.state,'ok');
  });
  test(`${label}: rejected transport retains candidate and existing retry without duplicate log/undo`,async()=>{
    const f=fixture({mode,want}),task=f.click();await f.started.promise;
    f.transport.reject(Error('SYNTHETIC-OFFLINE'));await task;await f.c.syncChain;
    assert.equal(f.notices().length,0);assert.equal(f.c.SYNC.state,'error');
    assert.match(f.c.SYNC.msg,/SYNTHETIC-OFFLINE/);assert.equal(f.c.S.employees[0].leaves.includes(target),want);
    const retry=f.events.find(x=>x.label==='重試');assert.equal(typeof retry.callback,'function');
    const state=f.c.S;f.c.STORE.sync=async s=>f.snapshots.push(structuredClone(s));
    assert.equal(await retry.callback(),true);assert.equal(f.c.S,state);
    assert.equal(f.snapshots.length,2);assert.equal(f.c.undoStack.length,1);assert.equal(f.c.S.log.length,1);
    assert.equal(f.notices().length,0,'retry must not revive a closed action notice');
  });
  test(`${label}: late ACK is silent after owner, candidate or relevant view changes`,async()=>{
    const changes={
      store:c=>{c.STORE={...c.STORE};},client:c=>{c.STORE.sb={newer:true};},user:c=>{c.STORE.session={user:{id:'other'}};},
      epoch:c=>{c.STORE.authEpoch++;},signedOut:c=>{c.STORE.session=null;},
      state:c=>{c.S=structuredClone(c.S);},mutation:c=>{c.S.employees[0].name='newer edit';},
      permission:c=>{c.effectivePermission=()=>false;c.STORE.kind='supabase';},
      modal:c=>c.openModal({t:'settings'}),modalRoundtrip:c=>{c.openModal({t:'settings'});c.closeModal();},
      preview:c=>{c.PV={title:'new preview'};},date:c=>{c.UI.date=nextMonth;},view:c=>{c.UI.view='day';},
      layout:c=>{c.UI.layout='employee';},factory:c=>{c.UI.factory=2;},group:c=>{c.UI.group='other';},
      page:c=>{c.UI.page='worklog';},drawer:c=>{c.UI.drawer='orders';},focus:c=>{c.UI.focus={id:'new focus'};},
      edit:c=>{c.UI.editCell={table:'employees',id:'employee',key:'name'};},
    };
    for(const [kind,change] of Object.entries(changes)){
      const f=fixture({mode,want}),task=f.click();await f.started.promise;change(f.c);
      const state=f.c.S,json=JSON.stringify(state),modal=f.c.UI.modal,view=JSON.stringify(f.c.UI);
      f.transport.resolve();await task;await f.c.syncChain;
      assert.equal(f.notices().length,0,kind);assert.equal(f.c.S,state,kind);assert.equal(JSON.stringify(f.c.S),json,kind);
      assert.equal(f.c.UI.modal,modal,kind);
      // Only the private completion token may be released, never the newer view.
      const clean=x=>{const v=JSON.parse(x);delete v.leaveSaveNotice;return v;};
      assert.deepEqual(clean(JSON.stringify(f.c.UI)),clean(view),kind);
    }
  });
  test(`${label}: false, rejected or synchronously thrown commit cannot announce or reject the handler`,async()=>{
    for(const outcome of ['false','reject','throw']){
      const f=fixture({mode,want});
      f.c.commit=()=>{if(outcome==='throw')throw Error('SYNTHETIC-THROW');return outcome==='false'?Promise.resolve(false):Promise.reject(Error('SYNTHETIC-REJECT'));};
      await assert.doesNotReject(async()=>f.click());assert.equal(f.notices().length,0,outcome);
      if(outcome!=='false')assert.match(f.events.find(x=>x.type==='toast')?.text||'',/沒存到：SYNTHETIC/);
    }
    for(const kind of ['user','epoch','state','modal','view']){
      const f=fixture({mode,want}),pending=deferred();f.c.commit=()=>pending.promise;
      const task=f.click();
      if(kind==='user')f.c.STORE.session={user:{id:'newer'}};
      if(kind==='epoch')f.c.STORE.authEpoch++;
      if(kind==='state')f.c.S=structuredClone(f.c.S);
      if(kind==='modal')f.c.openModal({t:'settings'});
      if(kind==='view')f.c.UI.date=nextMonth;
      const state=f.c.S,modal=f.c.UI.modal;
      pending.reject(Error('SYNTHETIC-STALE-REJECT'));
      await assert.doesNotReject(async()=>task);
      assert.equal(f.events.filter(x=>x.type==='toast').length,0,kind);
      assert.equal(f.c.S,state);assert.equal(f.c.UI.modal,modal);
    }
  });
}

test('same-user token refresh keeps confirmed notice valid',async()=>{
  const f=fixture(),task=f.click();await f.started.promise;
  f.c.STORE.session={user:{id:'owner'},access_token:'refreshed-synthetic'};
  f.transport.resolve();await task;assert.equal(f.notices().length,1);
});
test('monthly no-change and past-month actions do not save or claim completion',async()=>{
  for(const kind of ['unchanged','past']){
    const f=fixture({mode:'pm',want:false});f.c.S.employees[0].leaves=[];
    if(kind==='past')f.c.UI.date=pastMonth;
    await f.click();await f.c.syncChain;
    assert.equal(f.snapshots.length,0);assert.equal(f.c.undoStack.length,0);assert.equal(f.c.S.log.length,0);assert.equal(f.notices().length,0);
    assert.equal(f.events.filter(e=>e.type==='toast').at(-1).text,kind==='past'?'這個月今天之後沒有日期':'沒有變更');
  }
});
test('monthly skipped-date notice is gated on ACK for mixed and fully blocked dates',async()=>{
  for(const allBlocked of [false,true])for(const saved of [false,true]){
    const f=fixture({mode:'pm'}),days=f.c.monthDates(target).filter(Boolean).filter(d=>d>=f.c.todayStr());
    f.c.S.blocks=(allBlocked?days:[target]).map(date=>({id:date,emp:'employee',date}));
    const task=f.click();await f.started.promise;const early=f.notices().length;
    if(saved)f.transport.resolve();else f.transport.reject(Error('SYNTHETIC-BLOCKED-FAILURE'));
    await task;await f.c.syncChain;assert.equal(early,0);assert.equal(f.notices().length,saved?1:0);
    assert.equal(f.c.S.employees[0].leaves.includes(target),false);
    if(saved){assert.ok(f.notices()[0].text.includes(target));assert.match(f.notices()[0].text,/當天有排工作，已先跳過/);}
  }
});
test('permission refusal, closed modal and product-work planner path do not become direct saves',async()=>{
  for(const kind of ['permission','closed','planned']){
    const f=fixture();
    if(kind==='permission'){f.c.STORE.kind='supabase';f.c.effectivePermission=()=>false;}
    if(kind==='closed')f.c.UI.modal=null;
    if(kind==='planned')f.c.S.blocks=[{emp:'employee',date:target}];
    await f.click();await f.c.syncChain;
    assert.equal(f.snapshots.length,0);assert.equal(f.c.undoStack.length,0);assert.equal(f.c.S.log.length,0);assert.equal(f.notices().length,0);
    assert.equal(f.events.filter(e=>e.type==='plans').length,kind==='planned'?1:0);
  }
});
test('actual LocalStore quota failure and generic retry retain one candidate, log and undo',async()=>{
  const old=globalThis.localStorage;let fail=true,stored=null,writes=0;
  globalThis.localStorage={getItem:()=>stored,setItem:(_key,value)=>{writes++;if(fail)throw Error('quota');stored=value;}};
  try{
    const f=fixture({store:new LocalStore()});await f.click();await f.c.syncChain;
    assert.equal(f.notices().length,0);assert.match(f.c.SYNC.msg,/儲存空間不足/);assert.equal(stored,null);
    fail=false;await f.events.find(x=>x.label==='重試').callback();assert.equal(writes,2);
    assert.equal(JSON.parse(stored).employees[0].leaves.includes(target),true);
    assert.equal(f.c.undoStack.length,1);assert.equal(JSON.parse(stored).log.length,1);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('actual SupabaseStore and migrated isolated SQL gate add/cancel feedback and preserve failed writes',async t=>{
  const db=await makeDb();
  try{
    const boss='11111111-1111-4111-8111-111111111111';
    await db.query("insert into auth.users(id,email) values($1,'leave-ack@invalid')",[boss]);
    await db.query("update profiles set role='boss' where user_id=$1",[boss]);
    const sb=new FakeSupabase(db,{test:{id:boss,password:'test-only'}});await sb.auth.signInWithPassword({email:'test',password:'test-only'});
    for(const [label,mode,want] of cases)for(const outcome of ['ack','reject','throw'])await t.test(`${label}: SQL ${outcome}`,async()=>{
      const store=new SupabaseStore(sb);await store.init();let state=await store.load();const employee=state.employees[0].id;
      await db.query('delete from leaves where employee_id=$1 and date >= $2 and date < $3',[employee,monthStart,nextMonth]);
      if(!want)await db.query('insert into leaves(employee_id,date) values($1,$2)',[employee,target]);state=await store.load();
      const from=sb.from.bind(sb),gate=deferred(),started=deferred();let leafWrites=0;
      sb.from=table=>{
        const q=from(table);if(table==='leaves'){
          const then=q.then.bind(q);
          q.then=(resolve,reject)=>{leafWrites++;started.resolve();return gate.promise.then(()=>{
            if(outcome==='reject')return {data:null,error:{message:'SYNTHETIC-SQL-REJECT'}};
            if(outcome==='throw')throw Error('SYNTHETIC-SQL-THROW');
            return {then};
          }).then(resolve,reject);};
        }return q;
      };
      const count=async()=>(await db.query('select count(*)::int n from leaves where employee_id=$1 and date=$2',[employee,target])).rows[0].n;
      try{
        const f=fixture({store,state,mode,want}),task=f.click();
        await Promise.race([started.promise,f.c.syncChain.then(()=>{throw Error('ended before leaf write: '+f.c.SYNC.msg);})]);
        const early=f.notices().length,before=await count();assert.equal(before,want?0:1);assert.equal(f.c.SYNC.state,'busy');
        gate.resolve();await task;await f.c.syncChain;
        assert.equal(early,0,'no success while SQL is unchanged');assert.equal(f.notices().length,outcome==='ack'?1:0);
        assert.equal(await count(),outcome==='ack'?(want?1:0):before);
        assert.equal(f.c.SYNC.state,outcome==='ack'?'ok':'error');assert.equal(f.c.S.employees[0].leaves.includes(target),want);
        assert.equal(f.c.undoStack.length,1);assert.equal(leafWrites,1);
        if(outcome!=='ack'){
          const candidate=f.c.S,logs=f.c.S.log.length;sb.from=from;
          await f.events.find(x=>x.label==='重試').callback();
          assert.equal(f.c.S,candidate);assert.equal(f.c.S.log.length,logs);assert.equal(f.c.undoStack.length,1);
          assert.equal(await count(),want?1:0);assert.equal(f.notices().length,0);
        }
      }finally{gate.resolve();sb.from=from;}
    });
  }finally{await db.close();}
});

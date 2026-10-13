import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore,ConflictError} from '../src/store/supabase.js';
import {fromSnapshot} from '../src/convert.js';
import {newRoster} from '../src/roster.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {UI_TEXT} from '../src/i18n.js';

const work={id:'TEST-W',name:'Test manual work',factory:1,requiresResource:false,employeeIds:['TEST-E'],resourceIds:[],reviewStatus:'confirmed'};
const cases=[
  ['save_staff_rosters',s=>{s.staffRosters=[newRoster(s,{id:'TEST-R',start:'2100-01-04'})];},s=>{s.staffRosters=[];}],
  ['save_transfer_orders',()=>{},s=>{s.transferOrders=[{id:'TEST-T',code:'TEST-T',itemCode:'TEST-ITEM',fromFactory:1,toFactory:2,returnFactory:1,totalQty:10,urgentQty:0,notified:null,expectedSend:null,due:null,urgentDue:null,workIds:[],batches:[],events:[],status:'active',note:''}];}],
  ['save_rush_orders',s=>{s.rushOrders=[{id:'TEST-RUSH',f1:{desc:'Test'},f2:{}}];},s=>{s.rushOrders=[];}],
  ['save_work_log',s=>{s.workLog=[{id:'TEST-LOG'}];},s=>{s.workLog=[];}],
  ['save_work_contents',s=>{s.workContents=[structuredClone(work)];},s=>{s.workContents=[];}],
  ['save_work_assignments',s=>{s.workContents=[structuredClone(work)];s.workAssignments=[{id:'TEST-A',workId:'TEST-W',emp:'TEST-E',resourceId:null,date:'2100-01-04',s:480,e:540,qty:null,note:''}];},s=>{s.workAssignments=[];}],
  ['save_staff_groups',s=>{s.groups=[{id:'TEST-G',name:'Test group'}];},s=>{s.groups=[];}],
];
function setup(init,change,response){
  const calls=[],s=fromSnapshot({version:12,employees:[{id:'TEST-E',name:'Test',factory:1,skills:[]}],machines:[],products:[],orders:[],blocks:[],calendar:{}});
  init(s);
  const store=new SupabaseStore({rpc:async(name,args)=>{calls.push({name,args});return response;},from:()=>assert.fail('no unrelated table writes')});
  store.acceptLoaded(s);const baseline=store.base,protectedBase=store.protectedBase;
  const candidate=structuredClone(s);change(candidate);
  return {store,candidate,calls,baseline,protectedBase};
}
for(const [name,init,change] of cases){
  test(name+' rejects missing/coercible/wrong confirmations without poisoning version or remembered data',async()=>{
    for(const data of [null,undefined,{},[],false,'13',0,12,14,-1,NaN,Infinity,2**53]){
      const h=setup(init,change,{data,error:null});
      await assert.rejects(h.store.sync(h.candidate),e=>e.unconfirmed===true);
      assert.equal(h.store.version,12);assert.equal(h.candidate.version,12);
      assert.equal(h.store.base,h.baseline);assert.equal(h.store.protectedBase,h.protectedBase);
      assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,name);
    }
  });
}
test('all versioned write paths accept exactly the next version once and retain conflict handling',async()=>{
  for(const [name,init,change] of cases){
    const h=setup(init,change,{data:13,error:null});await h.store.sync(h.candidate);
    assert.equal(h.store.version,13);assert.equal(h.candidate.version,13);assert.notEqual(h.store.base,h.baseline);
    await h.store.sync(h.candidate);assert.equal(h.calls.length,1,name+' retry must not issue a duplicate RPC');
    const conflict=setup(init,change,{data:null,error:{code:'40001',message:'TEST-CONFLICT'}});
    await assert.rejects(conflict.store.sync(conflict.candidate),ConflictError);assert.equal(conflict.store.version,12);
  }
});
const boss='11111111-1111-4111-8111-111111111111';
function queueHarness(){
  const messages=[],calls=[],ctx={STORE:{sync:async snapshot=>calls.push(snapshot)},S:{blocks:[]},SYNC:{state:'ok',msg:''},
    syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,tx:x=>x,
    toast:x=>messages.push(x),updateSyncChip:()=>{},maybeReload:()=>{},reloadFromStore:async()=> 'applied'};
  vm.createContext(ctx);const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),start=source.indexOf('function queueSync(entry){');
  vm.runInContext(source.slice(start,source.indexOf('// ---------- 別人改了',start)),ctx);return {ctx,messages,calls};
}
async function realClient(){
  const db=await makeDb();await db.query("insert into auth.users(id,email) values($1,'test@invalid')",[boss]);
  await db.query("update profiles set role='boss' where user_id=$1",[boss]);
  const sb=new FakeSupabase(db,{test:{id:boss,password:'test-only'}});await sb.auth.signInWithPassword({email:'test',password:'test-only'});
  return {db,sb};
}
test('actual migrated SQL returns numeric next-version confirmations for all seven RPC contracts',async()=>{
  const {db,sb}=await realClient();
  try{
    let version=0;
    for(const [name,args] of [['save_staff_rosters',{p_rosters:[]}],['save_transfer_orders',{p_orders:[]}],['save_rush_orders',{p_orders:[]}],['save_work_log',{p_rows:[]}],['save_work_contents',{p_contents:[]}],['save_work_assignments',{p_assignments:[]}],['save_staff_groups',{p_groups:[],p_members:[]}]]){
      const {data,error}=await sb.rpc(name,{[name==='save_staff_groups'?'p_base_version':'p_version']:version,...args});
      assert.equal(error,null,name);assert.equal(typeof data,'number',name);assert.equal(data,++version,name);
    }
  }finally{await db.close();}
});
test('actual queue/store/SQL preserves an uncertain write and retry reconciles without duplicate data or audit writes',async()=>{
  const {db,sb}=await realClient();
  try{
    const store=new SupabaseStore(sb);await store.init();const state=await store.load();
    state.groups=[{id:'00000000-0000-4000-8000-0000000000a1',name:'TEST-ACK'}];
    const rpc=sb.rpc.bind(sb),calls=[];let drop=true;
    sb.rpc=async(name,args)=>{calls.push(name);const response=await rpc(name,args);if(name==='save_staff_groups'&&drop){drop=false;assert.equal(response.error,null);return {data:null,error:null};}return response;};
    const messages=[],ctx={STORE:store,S:state,SYNC:{state:'ok',msg:''},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,
      tx:x=>x,toast:x=>messages.push(x),updateSyncChip:()=>{},maybeReload:()=>{}};
    ctx.reloadFromStore=async()=>{ctx.S=await store.load();return 'applied';};vm.createContext(ctx);
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),start=source.indexOf('function queueSync(entry){');
    vm.runInContext(source.slice(start,source.indexOf('// ---------- 別人改了',start)),ctx);
    assert.equal(await ctx.queueSync({kind:'edit',title:'TEST-ACK'}),false);
    assert.equal(ctx.SYNC.state,'error');assert.equal(store.version,0);assert.equal(ctx.S.version,0);
    assert.equal(ctx.S.groups[0].name,'TEST-ACK');assert.match(messages.at(-1),/結果待確認/);assert.doesNotMatch(messages.at(-1),/沒存到/);
    assert.equal(await ctx.queueSync(null),false,'a conflict reconciliation is not a newly successful write');
    assert.equal(ctx.SYNC.state,'ok');assert.equal(store.version,1);assert.equal(ctx.S.version,1);assert.equal(ctx.S.groups[0].name,'TEST-ACK');
    assert.deepEqual(calls,['save_staff_groups','save_staff_groups','schedule_snapshot']);
    const query=await db.query("select count(*)::int as n from change_sets where title='TEST-ACK'");assert.equal(query.rows[0].n,1);
    for(const lang of ['en','vi','th'])assert.ok(UI_TEXT['雲端儲存結果待確認，請按重試核對；目前修改仍保留。'][lang]);
  }finally{await db.close();}
});
test('queued older snapshots cannot replay over another writer after the first request conflicts',async()=>{
  const {db,sb}=await realClient();
  try{
    const store=new SupabaseStore(sb);await store.init();const initial=await store.load();
    const rpc=sb.rpc.bind(sb);let releaseFirst,first=true,started;
    const firstStarted=new Promise(resolve=>started=resolve);
    sb.rpc=async(name,args)=>{if(name==='save_staff_groups'&&first){first=false;await new Promise(resolve=>{releaseFirst=resolve;started();});}return rpc(name,args);};
    const group=(n,name)=>({id:'00000000-0000-4000-8000-'+n.padStart(12,'0'),name});
    const messages=[],ctx={STORE:store,S:structuredClone(initial),SYNC:{state:'ok',msg:''},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,
      tx:x=>x,toast:x=>messages.push(x),updateSyncChip:()=>{},maybeReload:()=>{}};
    ctx.reloadFromStore=async()=>{ctx.S=await store.load();return 'applied';};vm.createContext(ctx);
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),start=source.indexOf('function queueSync(entry){');
    vm.runInContext(source.slice(start,source.indexOf('// ---------- 別人改了',start)),ctx);
    ctx.S.groups=[group('11','LOCAL-A')];const firstTask=ctx.queueSync({kind:'edit',title:'LOCAL-A'});
    await firstStarted;
    ctx.S.groups.push(group('12','LOCAL-B'));const secondTask=ctx.queueSync({kind:'edit',title:'LOCAL-B'});
    const remote=await rpc('save_staff_groups',{p_base_version:0,p_groups:[{id:group('13','REMOTE').id,name:'REMOTE'}],p_members:[],p_title:'REMOTE'});
    assert.equal(remote.error,null);releaseFirst();await firstTask;await secondTask;
    const final=await store.load();
    assert.deepEqual(final.groups.map(x=>x.name),['REMOTE'],'stale queued snapshots must not delete the accepted remote group');
    assert.equal(final.version,1);assert.equal(ctx.SYNC.state,'ok');assert.equal(ctx.syncPending,0);
    assert.equal((await db.query("select count(*)::int as n from change_sets where title in ('LOCAL-A','LOCAL-B')")).rows[0].n,0);
  }finally{await db.close();}
});
test('failed conflict/permission recovery remains not-confirmed and never writes queued stale snapshots',async()=>{
  for(const kind of ['conflict','permission'])for(const rejects of [false,true]){
    const h=queueHarness();let rejectFirst;
    h.ctx.STORE.sync=async snapshot=>{h.calls.push(snapshot);return new Promise((resolve,reject)=>rejectFirst=reject);};
    h.ctx.reloadFromStore=async()=>{if(rejects)throw new Error('TEST-READ-REJECT');return 'failed';};
    const first=h.ctx.queueSync(null);await new Promise(resolve=>setImmediate(resolve));
    h.ctx.S.blocks.push({id:'QUEUED'});const second=h.ctx.queueSync(null);
    rejectFirst(Object.assign(new Error('TEST-RECOVERY'),{[kind]:true}));
    assert.equal(await first,false);assert.equal(await second,false);assert.equal(h.calls.length,1);
    assert.equal(h.ctx.SYNC.state,'error');assert.match(h.ctx.SYNC.msg,/尚未確認儲存/);
    assert.ok(h.messages.every(x=>!x.includes('已載入最新版本')&&!x.includes('已還原')));
  }
});
test('jobs captured during recovery are discarded but a new edit after recovery can save',async()=>{
  const h=queueHarness();let rejectFirst,finishRead;const reading=new Promise(resolve=>{
    h.ctx.reloadFromStore=()=>{resolve();return new Promise(finish=>finishRead=()=>{h.ctx.S={blocks:[{id:'REMOTE'}]};finish('applied');});};
  });
  h.ctx.STORE.sync=async snapshot=>{h.calls.push(snapshot);if(h.calls.length===1)return new Promise((resolve,reject)=>rejectFirst=reject);};
  const first=h.ctx.queueSync(null);await new Promise(resolve=>setImmediate(resolve));
  rejectFirst(new ConflictError());await reading;
  h.ctx.S.blocks.push({id:'DURING-RECOVERY'});const stale=h.ctx.queueSync(null);finishRead();
  assert.equal(await first,false);assert.equal(await stale,false);assert.equal(h.calls.length,1);
  h.ctx.S.blocks.push({id:'NEW-AFTER-RECOVERY'});assert.equal(await h.ctx.queueSync(null),true);
  assert.deepEqual(h.calls[1].blocks.map(x=>x.id),['REMOTE','NEW-AFTER-RECOVERY']);assert.equal(h.ctx.SYNC.state,'ok');
});
test('ordinary consecutive successful edits still persist in order without being discarded',async()=>{
  const h=queueHarness();h.ctx.S.blocks=[{id:'FIRST'}];const first=h.ctx.queueSync(null);
  h.ctx.S.blocks.push({id:'SECOND'});const second=h.ctx.queueSync(null);
  assert.equal(await first,true);assert.equal(await second,true);assert.equal(h.calls.length,2);
  assert.deepEqual(h.calls.map(s=>s.blocks.map(b=>b.id)),[['FIRST'],['FIRST','SECOND']]);assert.equal(h.ctx.syncEpoch,0);
});

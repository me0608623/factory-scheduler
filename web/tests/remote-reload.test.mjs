import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SupabaseStore} from '../src/store/supabase.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function reloadFromStore(');
const implementation=source.slice(start,source.indexOf('// ---------- 帳號與連線',start));
function harness(){
  const timers=[],writes=[],ctx={S:{version:1,blocks:[{id:'local'}],log:[]},PV:null,drag:null,generalDrag:null,UI:{modal:null,prefs:{}},SYNC:{state:'ok'},syncPending:0,
    STORE:{kind:'supabase',version:1,load:async()=>{writes.push('load');return {version:2,blocks:[{id:'remote'}],log:[]};},can:()=>true},
    lastLocalWrite:0,pendingReload:false,undoStack:[],reloadTimer:null,remoteLoading:false,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},normalizeState:()=>{},render:()=>writes.push('render'),toast:()=>{},
    tx:x=>x,notificationEnabled:()=>false,showDeviceNotification:()=>{},closeModal:()=>{ctx.UI.modal=null;}};
  vm.createContext(ctx);vm.runInContext(implementation,ctx);
  return {ctx,timers,writes};
}

test('attendance request/brush in flight defers background reads until its write guard is released',async()=>{
  const h=harness();h.ctx.UI.leaveBrushSaving={};h.ctx.onRemoteChange('leave_requests');
  if(h.timers.length)await h.timers.shift()();assert.equal(h.writes.filter(x=>x==='load').length,0);
  h.ctx.UI.leaveBrushSaving=null;h.ctx.maybeReload();assert.equal(h.timers.length,1);
  await h.timers.shift()();assert.equal(h.writes.filter(x=>x==='load').length,1);
});
test('closed memo dialog with its write still pending defers remote reads until memo write guard is released',async()=>{
  const h=harness();h.ctx.UI.memoSaving={};h.ctx.onRemoteChange('schedule_memos');
  if(h.timers.length)await h.timers.shift()();assert.equal(h.writes.filter(x=>x==='load').length,0);
  h.ctx.UI.memoSaving=null;h.ctx.maybeReload();assert.equal(h.timers.length,1);
  await h.timers.shift()();assert.equal(h.writes.filter(x=>x==='load').length,1);
});

test('leave/pin direct request continues protecting background reads after its drawer or dialog closes',async()=>{
  const h=harness();h.ctx.UI.directSaving={drawer:'people'};h.ctx.onRemoteChange('leave_requests');
  if(h.timers.length)await h.timers.shift()();assert.equal(h.writes.filter(x=>x==='load').length,0);
  h.ctx.UI.directSaving=null;h.ctx.maybeReload();assert.equal(h.timers.length,1);
  await h.timers.shift()();assert.equal(h.writes.filter(x=>x==='load').length,1);
});

test('actual Store rejects an incomplete background RPC without replacing the visible board or baseline',async()=>{
  const h=harness();let data={version:1,employees:[{id:'TEST-E',name:'測試',skills:[]}],machines:[],products:[],orders:[],blocks:[],calendar:{}},history=0;
  const chain={select:()=>chain,order:()=>chain,limit:async()=>{history++;return {data:[],error:null};}};
  const store=new SupabaseStore({rpc:async()=>({data,error:null}),from:()=>chain});
  store.session={user:{id:'TEST-USER'}};store.role='lead';
  const visible=await store.load();h.ctx.STORE=store;h.ctx.S=visible;
  const base=store.base,protectedBase=store.protectedBase,before=JSON.stringify(visible);
  data={};h.ctx.onRemoteChange('reconcile');await h.timers.shift()();
  assert.equal(h.ctx.S,visible);assert.equal(JSON.stringify(h.ctx.S),before);
  assert.equal(store.version,1);assert.equal(store.base,base);assert.equal(store.protectedBase,protectedBase);
  assert.equal(history,1);assert.deepEqual(h.writes,[],'no rendered empty board or optimistic write');
});
test('remote timer rechecks preview/modal/drag/write guards before reading',async()=>{
  for(const mode of ['preview','modal','drag','generalDrag','writing','unsaved','cell','confirm','profile']){
    const h=harness();h.ctx.onRemoteChange('orders');
    if(mode==='preview')h.ctx.PV={kind:'manual'};
    if(mode==='modal')h.ctx.UI.modal={draft:{name:'not saved'}};
    if(mode==='drag'||mode==='generalDrag')h.ctx[mode]={};
    if(mode==='writing')h.ctx.SYNC.state='busy';
    if(mode==='unsaved')h.ctx.SYNC.state='error';
    if(mode==='cell')h.ctx.UI.editCell={table:'rush',id:'TEST-ROW',key:'code'};
    if(mode==='confirm')h.ctx.UI.confirmRow='del:TEST-ROW';
    if(mode==='profile')h.ctx.UI.drawer='settings';
    await h.timers.shift()();
    assert.deepEqual(h.writes,[],mode+' must defer without reading or rerendering');
    assert.equal(h.ctx.pendingReload,true);
    assert.equal(h.ctx.S.blocks[0].id,'local');
  }
});
test('modal opened while remote request is in flight rejects its result without rerendering',async()=>{
  const h=harness();let finish;
  h.ctx.STORE.load=async()=>new Promise(resolve=>finish=resolve);
  h.ctx.onRemoteChange('orders');const task=h.timers.shift()();
  h.ctx.UI.modal={draft:{name:'still typing'}};finish({version:2,blocks:[{id:'remote'}],log:[]});await task;
  assert.equal(h.ctx.S.blocks[0].id,'local');assert.deepEqual(h.writes,[]);assert.equal(h.ctx.pendingReload,true);
});
test('successful local write during remote request makes the earlier response stale',async()=>{
  const h=harness();let finish;
  h.ctx.STORE.load=async()=>new Promise(resolve=>finish=resolve);
  h.ctx.onRemoteChange('orders');const task=h.timers.shift()();
  h.ctx.STORE.version=3;h.ctx.lastLocalWrite=100;finish({version:2,blocks:[{id:'remote'}],log:[]});await task;
  assert.equal(h.ctx.S.blocks[0].id,'local');assert.deepEqual(h.writes,[]);
});
test('failed read is not announced as a remote update',async()=>{
  const h=harness();h.ctx.STORE.load=async()=>{throw new Error('offline');};h.ctx.notificationEnabled=()=>true;
  h.ctx.showDeviceNotification=()=>assert.fail('must not announce a failed read');
  h.ctx.onRemoteChange('orders');await h.timers.shift()();assert.equal(h.ctx.S.version,1);
  assert.equal(h.ctx.pendingReload,true);assert.equal(h.timers.length,0,'failure must not create an immediate retry loop');
  assert.deepEqual(h.writes,[]);
});
test('idle remote read advances the baseline and visible state together, once',async()=>{
  const h=harness();let calls=0;
  h.ctx.STORE.load=async options=>{assert.equal(options.remember,false);return {version:2,blocks:[{id:'remote'}],log:[]};};
  h.ctx.STORE.acceptLoaded=s=>{calls++;h.ctx.STORE.version=s.version;};
  h.ctx.onRemoteChange('orders');await h.timers.shift()();
  assert.equal(h.ctx.S.blocks[0].id,'remote');assert.equal(h.ctx.STORE.version,2);
  assert.equal(calls,1);assert.deepEqual(h.writes,['render']);
});
test('multiple events during a read coalesce into one later refresh, not parallel loads',async()=>{
  const h=harness();let finish,calls=0;
  h.ctx.STORE.load=async()=>{calls++;return new Promise(resolve=>finish=resolve);};
  h.ctx.onRemoteChange('orders');const task=h.timers.shift()();
  h.ctx.onRemoteChange('calendar_days');h.ctx.onRemoteChange('orders');
  assert.equal(calls,1);assert.equal(h.timers.length,0);
  finish({version:2,blocks:[{id:'remote'}],log:[]});await task;
  assert.equal(h.timers.length,1,'coalesced follow-up can read the latest version');
});

test('deferred read resumes once after the draft closes, without accepting the old response',async()=>{
  const h=harness();let finish,accepted=0;
  h.ctx.STORE.acceptLoaded=()=>accepted++;
  h.ctx.STORE.load=async()=>new Promise(resolve=>finish=resolve);
  h.ctx.onRemoteChange('orders');const task=h.timers.shift()();
  h.ctx.UI.modal={draft:{name:'typing'}};finish({version:2,blocks:[{id:'old-remote'}],log:[]});await task;
  assert.equal(accepted,0);assert.equal(h.timers.length,0);
  h.ctx.UI.modal=null;h.ctx.STORE.load=async()=>({version:3,blocks:[{id:'latest'}],log:[]});
  h.ctx.maybeReload();h.ctx.maybeReload();assert.equal(h.timers.length,1);
  await h.timers.shift()();assert.equal(h.ctx.S.blocks[0].id,'latest');assert.equal(accepted,1);
});

test('an in-memory edit during a remote read preserves the draft even without a version change',async()=>{
  const h=harness();let finish;
  h.ctx.STORE.load=async()=>new Promise(resolve=>finish=resolve);
  h.ctx.STORE.acceptLoaded=()=>assert.fail('must not advance the baseline for a discarded snapshot');
  h.ctx.onRemoteChange('orders');const task=h.timers.shift()();
  h.ctx.S.blocks[0].id='unsaved-draft';finish({version:2,blocks:[{id:'remote'}],log:[]});await task;
  assert.equal(h.ctx.S.blocks[0].id,'unsaved-draft');assert.deepEqual(h.writes,[]);
});

test('a switched account or replaced store invalidates an in-flight remote response',async()=>{
  for(const mode of ['account','store']){
    const h=harness();let finish;
    h.ctx.STORE.session={user:{id:'first'}};
    h.ctx.STORE.load=async()=>new Promise(resolve=>finish=resolve);
    h.ctx.onRemoteChange('orders');const task=h.timers.shift()();
    if(mode==='account')h.ctx.STORE.session={user:{id:'second'}};
    else h.ctx.STORE={...h.ctx.STORE};
    finish({version:2,blocks:[{id:'first-account-data'}],log:[]});await task;
    assert.equal(h.ctx.S.blocks[0].id,'local',mode);assert.deepEqual(h.writes,[],mode);
  }
});

test('foreground recovery also rejects old account, store and login-lifetime responses',async()=>{
  for(const mode of ['account','store','login']){
    const h=harness();let finish,accepted=0,options;
    h.ctx.STORE.session={user:{id:'TEST-A'}};h.ctx.STORE.authEpoch=0;
    h.ctx.STORE.acceptLoaded=()=>accepted++;
    h.ctx.STORE.load=async o=>{options=o;return new Promise(resolve=>finish=resolve);};
    const task=h.ctx.reloadFromStore();
    if(mode==='account')h.ctx.STORE.session={user:{id:'TEST-B'}};
    if(mode==='store')h.ctx.STORE={...h.ctx.STORE};
    if(mode==='login')h.ctx.STORE.authEpoch=2;
    h.ctx.S={version:100,blocks:[{id:'FRESH-BOARD'}],log:[]};
    finish({version:2,blocks:[{id:'OLD-BOARD'}],log:[]});
    assert.equal(await task,'deferred',mode);assert.equal(options.remember,false);
    assert.equal(h.ctx.S.blocks[0].id,'FRESH-BOARD');assert.equal(accepted,0);assert.deepEqual(h.writes,[]);
  }
});

test('foreground recovery accepts a same-account token refresh and remembers the accepted state once',async()=>{
  const h=harness();let finish,accepted=0;
  h.ctx.STORE.session={user:{id:'TEST-A'},access_token:'synthetic-old'};
  h.ctx.STORE.load=async()=>new Promise(resolve=>finish=resolve);
  h.ctx.STORE.acceptLoaded=s=>{accepted++;h.ctx.STORE.version=s.version;};
  const task=h.ctx.reloadFromStore();h.ctx.STORE.session={user:{id:'TEST-A'},access_token:'synthetic-new'};
  finish({version:2,blocks:[{id:'CURRENT-BOARD'}],log:[]});
  assert.equal(await task,'applied');assert.equal(accepted,1);assert.equal(h.ctx.STORE.version,2);
  assert.equal(h.ctx.S.blocks[0].id,'CURRENT-BOARD');assert.deepEqual(h.writes,['render']);
});

test('queued updates stay deferred while a write is pending or has failed',()=>{
  const h=harness();h.ctx.pendingReload=true;h.ctx.syncPending=1;h.ctx.maybeReload();
  assert.equal(h.timers.length,0);h.ctx.syncPending=0;h.ctx.SYNC.state='error';h.ctx.maybeReload();
  assert.equal(h.timers.length,0);assert.equal(h.ctx.pendingReload,true);
  h.ctx.SYNC.state='ok';h.ctx.maybeReload();assert.equal(h.timers.length,1);
});

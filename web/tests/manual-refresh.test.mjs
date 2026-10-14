import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SupabaseStore} from '../src/store/supabase.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function reloadFromStore(');
const code=source.slice(start,source.indexOf('// ---------- 帳號與連線',start));
const action=source.slice(source.indexOf('    case "sync":'),source.indexOf('    case "account":'));
function harness(){
  const messages=[],reads=[],writes=[],timers=[];
  const ctx={S:{version:1,blocks:[{id:'LOCAL'}],log:[]},UI:{date:'2026-10-15',factory:'F1',modal:null,prefs:{}},
    SYNC:{state:'ok',realtime:'CHANNEL_ERROR'},PV:null,drag:null,generalDrag:null,syncPending:0,
    STORE:{kind:'supabase',version:1,session:{user:{id:'TEST-USER'}},load:async opts=>{reads.push(opts);return {version:2,blocks:[{id:'REMOTE'}],log:[]};},acceptLoaded:s=>{ctx.STORE.version=s.version;}},
    pendingReload:false,undoStack:[],reloadTimer:null,remoteLoading:false,lastLocalWrite:0,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},tx:x=>x,toast:t=>messages.push(t),
    render:()=>{},normalizeState:()=>{},updateSyncChip:()=>{},queueSync:entry=>writes.push(entry),notificationEnabled:()=>false};
  vm.createContext(ctx);vm.runInContext(code+'\nasync function clickSync(){switch("sync"){'+action+'}}',ctx);
  return {ctx,messages,reads,writes,timers};
}
test('actual disconnected sync action reads once, advances baseline and keeps date and factory',async()=>{
  const h=harness();await h.ctx.clickSync();
  assert.equal(h.reads.length,1);assert.equal(h.reads[0].remember,false);
  assert.equal(h.ctx.S.blocks[0].id,'REMOTE');assert.equal(h.ctx.STORE.version,2);
  assert.equal(h.ctx.UI.date,'2026-10-15');assert.equal(h.ctx.UI.factory,'F1');assert.deepEqual(h.writes,[]);
  assert.match(h.messages.at(-1),/已讀取最新班表/);assert.equal(h.ctx.SYNC.realtime,'CHANNEL_ERROR');
});
test('manual refresh never reads over a draft, preview, drag or pending write',async()=>{
  for(const kind of ['modal','preview','drag','generalDrag','pending','cell','confirm','profile']){
    const h=harness();if(kind==='modal')h.ctx.UI.modal={draft:'not saved'};
    if(kind==='preview')h.ctx.PV={};if(kind==='drag'||kind==='generalDrag')h.ctx[kind]={};if(kind==='pending')h.ctx.syncPending=1;
    if(kind==='cell')h.ctx.UI.editCell={table:'rush',id:'TEST-ROW',key:'code'};
    if(kind==='confirm')h.ctx.UI.confirmRow='del:TEST-ROW';
    if(kind==='profile')h.ctx.UI.drawer='settings';
    await h.ctx.clickSync();assert.equal(h.reads.length,0,kind);assert.equal(h.ctx.S.blocks[0].id,'LOCAL');
    assert.match(h.messages.at(-1),/完成或取消/,kind);
  }
});
test('rapid sync clicks share one in-flight read without enqueueing duplicates',async()=>{
  const h=harness();let finish;
  h.ctx.STORE.load=opts=>{h.reads.push(opts);return new Promise(resolve=>finish=resolve);};
  const first=h.ctx.clickSync();await h.ctx.clickSync();await h.ctx.clickSync();
  assert.equal(h.reads.length,1);assert.equal(h.ctx.pendingReload,false);
  finish({version:2,blocks:[{id:'REMOTE'}],log:[]});await first;
  assert.equal(h.timers.length,0);assert.equal(h.ctx.remoteLoading,false);
});
test('draft opened during manual read is retained and the speculative baseline is not accepted',async()=>{
  const h=harness();let finish;h.ctx.STORE.load=()=>new Promise(resolve=>finish=resolve);
  const task=h.ctx.clickSync();h.ctx.UI.modal={draft:'typing'};
  assert.equal(typeof finish,'function');finish({version:2,blocks:[{id:'REMOTE'}],log:[]});await task;
  assert.equal(h.ctx.S.blocks[0].id,'LOCAL');assert.equal(h.ctx.STORE.version,1);
  assert.equal(h.ctx.pendingReload,true);assert.equal(h.timers.length,0);assert.match(h.messages.at(-1),/保留/);
});
test('offline manual read retains board, reports failure and does not loop or claim success',async()=>{
  const h=harness();h.ctx.STORE.load=async()=>{throw new Error('SYNTHETIC_OFFLINE');};await h.ctx.clickSync();
  assert.equal(h.ctx.S.blocks[0].id,'LOCAL');assert.equal(h.ctx.STORE.version,1);assert.equal(h.ctx.remoteLoading,false);
  assert.ok(h.messages.some(x=>x.includes('SYNTHETIC_OFFLINE')));assert.ok(!h.messages.some(x=>x.includes('已讀取')));
  assert.equal(h.timers.length,0);assert.equal(h.writes.length,0);
});
test('existing unsaved write retry, local information and live-channel information retain their behavior',async()=>{
  const failed=harness();failed.ctx.SYNC.state='error';await failed.ctx.clickSync();assert.deepEqual(failed.writes,[null]);assert.equal(failed.reads.length,0);
  const local=harness();local.ctx.STORE.kind='local';await local.ctx.clickSync();assert.equal(local.reads.length,0);assert.match(local.messages[0],/這台電腦/);
  const live=harness();live.ctx.SYNC.realtime='SUBSCRIBED';await live.ctx.clickSync();assert.equal(live.reads.length,0);assert.match(live.messages[0],/不代表/);
  const busy=harness();busy.ctx.SYNC.state='busy';await busy.ctx.clickSync();assert.equal(busy.reads.length,0);assert.deepEqual(busy.messages,['同步中']);
});
test('manual action with actual SupabaseStore accepts a complete RPC and rejects malformed RPC without erasing data',async()=>{
  for(const malformed of [false,true]){
    const h=harness();let data={version:1,employees:[{id:'TEST-E',name:'Test',skills:[]}],machines:[],products:[],orders:[],blocks:[],calendar:{}};
    const chain={select:()=>chain,order:()=>chain,limit:async()=>({data:[],error:null})};
    const calls=[];const store=new SupabaseStore({rpc:async name=>{calls.push(name);return {data,error:null};},from:()=>chain});
    store.role='lead';store.session={user:{id:'TEST-USER'}};h.ctx.STORE=store;h.ctx.S=await store.load();
    const visible=h.ctx.S,base=store.base;
    data=malformed?{}:{...data,version:2};await h.ctx.clickSync();
    assert.deepEqual(calls,['schedule_snapshot','schedule_snapshot']);
    if(malformed){assert.equal(h.ctx.S,visible);assert.equal(store.base,base);assert.equal(store.version,1);assert.ok(!h.messages.some(x=>x.includes('已讀取')));}
    else{assert.equal(h.ctx.S.version,2);assert.equal(store.version,2);assert.notEqual(store.base,base);}
    assert.deepEqual(h.writes,[]);assert.equal(h.timers.length,0);
  }
});
test('manual in-flight response cannot overwrite a newer write or another account',async()=>{
  for(const kind of ['version','account','store']){
    const h=harness();let finish;h.ctx.STORE.load=()=>new Promise(resolve=>finish=resolve);
    const task=h.ctx.clickSync();
    if(kind==='version'){h.ctx.STORE.version=3;h.ctx.lastLocalWrite=100;}
    if(kind==='account')h.ctx.STORE.session={user:{id:'SECOND-USER'}};
    if(kind==='store')h.ctx.STORE={...h.ctx.STORE};
    finish({version:2,blocks:[{id:'OLD-RESPONSE'}],log:[]});await task;
    assert.equal(h.ctx.S.blocks[0].id,'LOCAL',kind);assert.ok(!h.messages.some(x=>x.includes('已讀取')),kind);
  }
});
test('non-Error transport rejection still reports a readable failure instead of an unhandled rejection',async()=>{
  for(const failure of [null,undefined,'SYNTHETIC_FAILURE',{}]){
    const h=harness();h.ctx.STORE.load=async()=>{throw failure;};
    await assert.doesNotReject(h.ctx.clickSync());
    assert.equal(h.ctx.S.blocks[0].id,'LOCAL');assert.equal(h.ctx.remoteLoading,false);
    assert.match(h.messages.at(-1),/無法讀取最新班表/);assert.equal(h.timers.length,0);
  }
});

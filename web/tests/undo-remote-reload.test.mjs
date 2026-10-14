// R26：遠端補讀（背景 onRemoteChange／前景衝突恢復）替換 S 後，undoStack 仍是舊基準的快照。
// 按「復原」會把同事變更前的整份狀態套回並以當前版本同步成功＝靜默覆蓋遠端變更。
// 守門：基準替換（applied）時清空 undoStack；之後的新 pushes 仍可正常復原；deferred 不清。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

function harness(){
  const events=[];
  const ctx={};
  ctx.STORE={kind:'supabase',session:{user:{id:'u1'}},authEpoch:0,version:7,
    load:async()=>({v:'remote',blocks:[],employees:[],orders:[],products:[],machines:[],log:[]}),acceptLocked:0};
  ctx.STORE.acceptLoaded=s=>{ctx.STORE.acceptLocked++};
  ctx.S={v:'local0',blocks:[],employees:[],orders:[],products:[],machines:[],log:[]};
  ctx.UI={};ctx.undoStack=[];ctx.pendingReload=false;ctx.lastLocalWrite=0;ctx.remoteReloadBlocked=()=>false;ctx.remoteLoading=false;
  ctx.normalizeState=()=>{};ctx.render=()=>{events.push('render')};ctx.toast=t=>events.push(['toast',t]);ctx.tx=x=>x;
  ctx.commit=async()=>{events.push(['commit']);return true};ctx.uid=()=>'id1';
  vm.createContext(ctx);
  const atRU=source.indexOf('async function reloadFromStore(');
  vm.runInContext(source.slice(atRU,source.indexOf('\nasync function refreshCloudSnapshot',atRU)),ctx);
  const atUN=source.indexOf('async function undo(){');
  vm.runInContext(source.slice(atUN,source.indexOf('\n}',atUN)+2),ctx);
  const atPU=source.indexOf('function pushUndo(');
  vm.runInContext(source.slice(atPU,source.indexOf('\n',atPU)+1),ctx);
  return {ctx,events};
}

test('applied remote reload must clear the stale undo stack',async()=>{
  const h=harness();
  vm.runInContext('pushUndo();S={...S,v:"local1"};',h.ctx);   // 本地寫入前的快照進棧
  const r=await h.ctx.reloadFromStore();
  assert.equal(r,'applied','remote baseline applied');
  assert.equal(h.ctx.undoStack.length,0,'stale snapshots must be dropped with the old baseline');
});

test('undo after an applied remote reload must not revert the remote change',async()=>{
  const h=harness();
  vm.runInContext('pushUndo();',h.ctx);
  await h.ctx.reloadFromStore();
  await h.ctx.undo();
  assert.equal(h.ctx.S.v,'remote','remote state survives undo');
  assert.equal(h.events.some(e=>e[0]==='commit'),false,'no write may be issued');
  assert.equal(h.events.some(e=>e[0]==='toast'),true,'user is told there is nothing to undo');
});

test('undo still works for edits made after the remote reload',async()=>{
  const h=harness();
  await h.ctx.reloadFromStore();
  vm.runInContext('pushUndo();S={...S,v:"local-after"};',h.ctx);
  await h.ctx.undo();
  assert.equal(h.ctx.S.v,'remote','fresh snapshot after reload is undoable');
  assert.equal(h.events.some(e=>e[0]==='commit'),true,'undo of a post-reload edit still commits');
});

test('deferred reload (local unsaved changes) keeps the undo stack',async()=>{
  const h=harness();
  vm.runInContext('pushUndo();S={...S,v:"dirty-unsynced"};',h.ctx);
  h.ctx.remoteReloadBlocked=()=>true;                        // 背景補讀被未存變更擋下
  const r=await h.ctx.reloadFromStore({background:true});
  assert.equal(r,'deferred','reload deferred');
  assert.equal(h.ctx.undoStack.length,1,'stack intact while local state is preserved');
});

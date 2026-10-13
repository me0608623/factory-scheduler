import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.lastIndexOf('\n',source.indexOf('function undo(){'))+1;
const undoCode=source.slice(start,source.indexOf('/* ===== 5.',start));
function harness({empty=false}={}){
  let finish,commits=0;
  const messages=[],before={blocks:[{id:'TEST-B',s:480,e:540}]};
  const ctx={S:{blocks:[{id:'TEST-B',s:490,e:550}]},undoStack:empty?[]:[JSON.stringify(before)],tx:x=>x,toast:t=>messages.push(t),
    commit:()=>{commits++;return new Promise(resolve=>{finish=resolve;});}};
  vm.createContext(ctx);vm.runInContext(undoCode,ctx);
  return {ctx,before,messages,commits:()=>commits,finish:value=>finish(value)};
}
test('actual undo handler waits for confirmed persistence before reporting success',async()=>{
  const h=harness(),pending=h.ctx.undo();
  assert.equal(h.commits(),1);assert.equal(h.ctx.S.blocks[0].s,480,'existing optimistic undo must remain unchanged');
  assert.deepEqual(h.messages,[],'pending cloud write must not claim success');
  h.finish(true);await pending;assert.deepEqual(h.messages,['已復原上一步']);
});
test('failed undo write never overwrites the existing not-saved feedback with success',async()=>{
  const h=harness(),pending=h.ctx.undo();h.messages.push('沒存到：SYNTHETIC_OFFLINE');h.finish(false);await pending;
  assert.deepEqual(h.messages,['沒存到：SYNTHETIC_OFFLINE']);
});
test('conflict reload remains authoritative and is not followed by an undo success toast',async()=>{
  const h=harness(),pending=h.ctx.undo();h.ctx.S={blocks:[{id:'REMOTE',s:600}]};
  h.messages.push('已載入最新版本');h.finish(false);await pending;
  assert.equal(h.ctx.S.blocks[0].id,'REMOTE');assert.deepEqual(h.messages,['已載入最新版本']);
});
test('empty undo history does not send a write request',async()=>{
  const h=harness({empty:true});await h.ctx.undo();assert.equal(h.commits(),0);assert.deepEqual(h.messages,['沒有可以復原的動作']);
});

test('actual undo, commit and queueSync keep loading/offline feedback aligned with persistence',async()=>{
  const commitStart=source.indexOf('function commit('),queueStart=source.indexOf('function queueSync(entry){');
  const commitCode=source.slice(commitStart,start),queueCode=source.slice(queueStart,source.indexOf('// ---------- 別人改了',queueStart));
  for(const offline of [false,true]){
    let resolveWrite,rejectWrite;const messages=[],writes=[];
    const ctx={S:{blocks:[{id:'TEST-B',s:490,e:550}],log:[]},undoStack:[JSON.stringify({blocks:[{id:'TEST-B',s:480,e:540}],log:[]})],
      SYNC:{state:'ok',msg:''},syncPending:0,syncChain:Promise.resolve(),syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,
      STORE:{kind:'supabase',sync:s=>{writes.push(s);return new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});},jwt:()=>assert.fail('undo must not send notifications')},
      SOLVER:{url:'https://example.invalid'},sendLineNotify:()=>assert.fail('undo must not send notifications'),
      uid:()=> 'TEST-LOG',tx:x=>x,toast:t=>messages.push(t),render:()=>{},canPermission:()=>true,updateSyncChip:()=>{},maybeReload:()=>{},reloadFromStore:()=>assert.fail('network failure must retain the unsaved state')};
    vm.createContext(ctx);vm.runInContext(commitCode+queueCode+undoCode,ctx);
    const pending=ctx.undo();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ctx.SYNC.state,'busy');assert.equal(ctx.syncPending,1);assert.deepEqual(messages,[]);assert.equal(writes.length,1);assert.equal(writes[0].blocks[0].s,480);
    if(offline)rejectWrite(new Error('SYNTHETIC_OFFLINE'));else resolveWrite();await pending;
    assert.equal(ctx.syncPending,0);
    if(offline){assert.equal(ctx.SYNC.state,'error');assert.deepEqual(messages,['沒存到：SYNTHETIC_OFFLINE']);}
    else{assert.equal(ctx.SYNC.state,'ok');assert.deepEqual(messages,['已復原上一步']);}
  }
});

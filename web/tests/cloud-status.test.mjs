import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {syncStatusView} from '../src/cloud-status.js';
import {UI_TEXT} from '../src/i18n.js';

test('write success never hides a failed realtime channel',()=>{
  for(const s of ['CHANNEL_ERROR','TIMED_OUT','CLOSED']){
    assert.deepEqual(syncStatusView('supabase','ok',s),{text:'雲端已儲存',detail:'即時更新中斷',tone:'stale'});
  }
});
test('failed or pending writes always take priority over a healthy connection',()=>{
  assert.equal(syncStatusView('supabase','error','SUBSCRIBED').tone,'error');
  assert.equal(syncStatusView('supabase','busy','SUBSCRIBED').text,'同步中');
});
test('local mode and initial connection never claim a live cloud channel',()=>{
  assert.equal(syncStatusView('local','ok','SUBSCRIBED').detail,'');
  assert.equal(syncStatusView('supabase','ok',null).detail,'即時連線中');
  assert.equal(syncStatusView('supabase','ok','SUBSCRIBED').detail,'即時已連線');
});
test('real badge renderer shows separate write/connection states without mutating data',()=>{
  const src=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const start=src.indexOf('function syncChipHTML('),end=src.indexOf('function updateSyncChip(',start);
  const ctx={STORE:{kind:'supabase'},SYNC:{state:'ok',realtime:'TIMED_OUT',msg:''},IC:{save:''},tx:x=>x,esc:x=>x,syncStatusView};
  vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
  const before=JSON.stringify(ctx.SYNC),html=ctx.syncChipHTML();
  assert.match(html,/雲端已儲存/);assert.match(html,/<small>即時更新中斷<\/small>/);
  assert.equal(JSON.stringify(ctx.SYNC),before);assert.doesNotMatch(html,/>已同步</);
});
test('new status labels are translated in all supported languages',()=>{
  for(const k of ['雲端已儲存','即時已連線','即時連線中','即時更新中斷'])
    for(const lang of ['en','vi','th'])assert.ok(UI_TEXT[k][lang]);
});
test('real sidebar and top badge share channel failure state',()=>{
  const src=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const start=src.indexOf('function syncChipHTML('),end=src.indexOf('function updateSyncChip(',start);
  const ctx={STORE:{kind:'supabase'},SYNC:{state:'ok',realtime:'CHANNEL_ERROR',msg:''},IC:{save:''},tx:x=>x,esc:x=>x,syncStatusView};
  vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
  assert.match(ctx.sideHealthHTML(),/side-health stale/);assert.match(ctx.sideHealthHTML(),/即時更新中斷/);
  ctx.SYNC.realtime='SUBSCRIBED';
  assert.match(ctx.sideHealthHTML(),/即時已連線/);assert.match(ctx.syncChipHTML(),/即時已連線/);
});

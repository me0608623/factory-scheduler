// R35：平台 Realtime 故障（CHANNEL_ERROR/TIMED_OUT/CLOSED，staging 已知 WS 500）期間，
// 跨裝置同步靜默中斷。有界安全補讀：通道失敗時定時走 onRemoteChange('reconcile')
// ——完全重用既有守門（remoteReloadBlocked／S 未變 accept），不覆蓋草稿／預覽／在途寫入。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

function harness(){
  const events=[];const timers=new Map();let nextId=1;
  const ctx={STORE:{kind:'supabase',session:{user:{id:'u1'}}},SYNC:{state:'ok',realtime:null},realtimePoll:null,
    updateSyncChip:()=>events.push('chip'),
    onRemoteChange:src=>events.push(['reconcile',src]),
    setInterval:(fn,ms)=>{const id=nextId++;timers.set(id,{fn,ms});events.push(['start',ms]);return id;},
    clearInterval:id=>{timers.delete(id);events.push(['clear']);}};
  vm.createContext(ctx);
  const at=source.indexOf('function onRealtimeStatus(');
  vm.runInContext(source.slice(at,source.indexOf('\nfunction onRemoteChange(',at)),ctx);
  return {ctx,events,timers};
}

test('channel failure starts a bounded poll through the guarded reconcile path',()=>{
  const h=harness();
  h.ctx.onRealtimeStatus('CHANNEL_ERROR');
  assert.ok(h.events.some(e=>e[0]==='start'),'poll scheduled on channel failure');
  const started=h.events.find(e=>e[0]==='start');
  assert.ok(started[1]>=30000&&started[1]<=120000,'poll interval is bounded (30s–2min), got '+started[1]);
  // 觸發一輪：必須走 onRemoteChange('reconcile')（含 remoteReloadBlocked 守門的既有路徑）
  for(const {fn} of h.timers.values())fn();
  assert.ok(h.events.some(e=>e[0]==='reconcile'&&e[1]==='reconcile'),'poll goes through the guarded reconcile');
});

test('CONNECTING alone does not start the poll',()=>{
  const h=harness();
  h.ctx.onRealtimeStatus('CONNECTING');
  assert.equal(h.events.some(e=>e[0]==='start'),false,'no poll while connecting');
});

test('recovery clears the poll',()=>{
  const h=harness();
  h.ctx.onRealtimeStatus('CHANNEL_ERROR');
  h.ctx.onRealtimeStatus('SUBSCRIBED');
  assert.ok(h.events.some(e=>e[0]==='clear'),'poll cleared on recovery');
  assert.ok(h.events.some(e=>e[0]==='reconcile'),'recovery itself reconciles');
  assert.equal(h.timers.size,0,'no timers left');
});

test('poll self-clears when the session is gone (login screen)',()=>{
  const h=harness();
  h.ctx.onRealtimeStatus('CHANNEL_ERROR');
  h.ctx.STORE={kind:'supabase',session:null};
  for(const {fn} of [...h.timers.values()])fn();
  assert.equal(h.timers.size,0,'poll removed itself when no session');
  assert.equal(h.events.some(e=>e[0]==='reconcile'),false,'no reconcile fired without session');
});

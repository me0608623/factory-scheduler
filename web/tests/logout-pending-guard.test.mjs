// R25：同步失敗／在途寫入未確認時登出＝靜默丟失本機變更（beforeunload 已攔同一風險，logout 沒攔）。
// 守門：syncPending>0 或 SYNC.state!=='ok' 或有未確認回報時，登出先提示不上路。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const at=source.indexOf('case "logout":');
assert.ok(at>=0,'logout case found');
const end=source.indexOf('break;',at);
const slice=source.slice(at,end+6);   // case ... break;

function harness(state){
  const events=[];
  const ctx={STORE:{kind:'supabase',hasPendingConfirmations:()=>state.confirmations||false},
    toast:t=>events.push(['toast',t]),tx:x=>x,closeModal:()=>events.push(['closeModal']),
    showLogin:()=>events.push(['showLogin']),
    syncPending:state.pending??0,SYNC:{state:state.sync||'ok'},executionRetries:new Map(),
    STORE_logout:undefined};
  ctx.STORE.logout=async()=>{events.push(['logout'])};
  vm.createContext(ctx);
  vm.runInContext('switch("logout"){\n'+slice+'\n}',ctx);
  return {events,wait:async()=>{await new Promise(r=>setTimeout(r,5));}};
}

test('logout proceeds normally when everything is saved',async()=>{
  const h=harness({});
  await h.wait();
  assert.ok(h.events.some(e=>e[0]==='logout'),'logout runs');
  assert.ok(h.events.some(e=>e[0]==='showLogin'),'login screen shown');
});

test('logout is blocked while a write is in flight',async()=>{
  const h=harness({pending:1});
  await h.wait();
  assert.equal(h.events.some(e=>e[0]==='logout'),false,'must not log out');
  assert.equal(h.events.some(e=>e[0]==='toast'),true,'user is warned');
});

test('logout is blocked when the last sync failed (unsaved local changes)',async()=>{
  const h=harness({sync:'error'});
  await h.wait();
  assert.equal(h.events.some(e=>e[0]==='logout'),false,'must not log out');
  assert.equal(h.events.some(e=>e[0]==='toast'),true,'user is warned');
});

test('logout is blocked when execution reports are unconfirmed',async()=>{
  const h=harness({confirmations:true});
  await h.wait();
  assert.equal(h.events.some(e=>e[0]==='logout'),false,'must not log out');
  assert.equal(h.events.some(e=>e[0]==='toast'),true,'user is warned');
});

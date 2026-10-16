import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';

// 每張表一個頻道後的彙總語意：任一頻道壞 → CHANNEL_ERROR（不宣稱即時）、
// 全部 SUBSCRIBED 才回 SUBSCRIBED；舊 generation 回呼一律無效。
function fixture(){
  const channels=[];
  const sb={channel(name){const ch={name,events:[],on(type,filter,cb){this.events.push({type,filter,cb});return this;},subscribe(cb){this.status=cb;return this;}};channels.push(ch);return ch;},removeChannel(ch){ch.status?.('CLOSED');}};
  return {store:new SupabaseStore(sb),channels};
}
const healthy=chs=>{for(const ch of chs){ch.status('SUBSCRIBED');ch.events.find(e=>e.type==='system').cb({extension:'postgres_changes',status:'ok'});}};
const ordersOf=chs=>chs.find(c=>c.events.some(e=>e.filter&&e.filter.table==='orders'));

test('subscription failures are reported without claiming live delivery',()=>{
  const {store,channels}=fixture(),statuses=[];
  store.subscribe(()=>{},status=>statuses.push(status));
  assert.ok(channels.length>1&&channels.every(c=>typeof c.status==='function'),'每張表頻道都須註冊 status callback');
  healthy(channels);
  assert.equal(statuses.at(-1),'SUBSCRIBED');
  channels[0].status('CHANNEL_ERROR');
  assert.equal(store.realtimeStatus,'CHANNEL_ERROR');
  for(const status of ['TIMED_OUT','CLOSED']){channels[0].status(status);assert.equal(store.realtimeStatus,'CHANNEL_ERROR','任一頻道失效不得宣稱即時');}
});

test('replaced channel cannot overwrite current connection state or deliver stale events',()=>{
  const {store,channels}=fixture(),statuses=[],changes=[];
  store.subscribe(t=>changes.push(t),s=>statuses.push(s));
  const stale=channels.slice();
  store.subscribe(t=>changes.push(t),s=>statuses.push(s));
  const fresh=channels.slice(stale.length);
  for(const ch of fresh)ch.status('SUBSCRIBED');
  assert.equal(store.realtimeStatus,'SUBSCRIBED');
  for(const ch of stale)ch.status('CHANNEL_ERROR'); // 舊 generation 全壞也不影響新狀態
  ordersOf(stale).events.find(e=>e.filter.table==='orders').cb();
  assert.equal(store.realtimeStatus,'SUBSCRIBED');assert.deepEqual(changes,[]);
});

test('database stream system errors degrade channel status even after successful join',()=>{
  const {store,channels}=fixture(),statuses=[];
  store.subscribe(()=>{},s=>statuses.push(s));
  healthy(channels);
  assert.equal(store.realtimeStatus,'SUBSCRIBED');
  const sys=channels[0].events.find(e=>e.type==='system');
  sys.cb({extension:'postgres_changes',status:'error',message:'do not expose internals'});
  assert.equal(store.realtimeStatus,'CHANNEL_ERROR');assert.equal(statuses.at(-1),'CHANNEL_ERROR');
  channels[0].status('SUBSCRIBED');
  assert.equal(store.realtimeStatus,'CHANNEL_ERROR','channel join cannot hide a broken database stream');
  sys.cb({extension:'postgres_changes',status:'ok'});
  assert.equal(store.realtimeStatus,'SUBSCRIBED');
});

test('sign out invalidates callbacks before channel removal and preserves schedule',()=>{
  const {store,channels}=fixture(),statuses=[];store.base={blocks:[{id:'saved'}]};
  store.subscribe(()=>{},s=>statuses.push(s));
  const ch0=channels[0];ch0.status('SUBSCRIBED');
  store._clearSession();
  ch0.status('TIMED_OUT');
  assert.deepEqual(store.channels,[]);assert.equal(store.realtimeStatus,null);
  assert.deepEqual(store.base,{blocks:[{id:'saved'}]});
  assert.deepEqual(statuses,['CONNECTING']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';

function fixture(){
  const channels=[];
  const sb={channel(){const ch={events:[],on(type,filter,cb){this.events.push({type,filter,cb});return this;},subscribe(cb){this.status=cb;return this;}};channels.push(ch);return ch;},removeChannel(ch){ch.status?.('CLOSED');}};
  return {store:new SupabaseStore(sb),channels};
}
test('subscription failures are reported without claiming live delivery',()=>{
  const {store,channels}=fixture(),statuses=[];
  store.subscribe(()=>{},status=>statuses.push(status));
  assert.equal(typeof channels[0].status,'function','status callback must be registered');
  for(const status of ['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'])channels[0].status(status);
  assert.deepEqual(statuses,['CONNECTING','SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED']);
});
test('replaced channel cannot overwrite current connection state or deliver stale events',()=>{
  const {store,channels}=fixture(),statuses=[],changes=[];
  store.subscribe(t=>changes.push(t),s=>statuses.push(s));
  store.subscribe(t=>changes.push(t),s=>statuses.push(s));
  channels[1].status('SUBSCRIBED');
  channels[0].status('CHANNEL_ERROR');
  channels[0].events.find(e=>e.filter.table==='orders').cb();
  assert.equal(store.realtimeStatus,'SUBSCRIBED');assert.deepEqual(changes,[]);
  assert.deepEqual(statuses,['CONNECTING','CONNECTING','SUBSCRIBED']);
});
test('database stream system errors degrade channel status even after successful join',()=>{
  const {store,channels}=fixture(),statuses=[];
  store.subscribe(()=>{},s=>statuses.push(s));channels[0].status('SUBSCRIBED');
  channels[0].events.find(e=>e.type==='system').cb({extension:'postgres_changes',status:'error',message:'do not expose internals'});
  assert.equal(store.realtimeStatus,'CHANNEL_ERROR');assert.equal(statuses.at(-1),'CHANNEL_ERROR');
  channels[0].status('SUBSCRIBED');
  assert.equal(store.realtimeStatus,'CHANNEL_ERROR','channel join cannot hide a broken database stream');
  channels[0].events.find(e=>e.type==='system').cb({extension:'postgres_changes',status:'ok'});
  assert.equal(store.realtimeStatus,'SUBSCRIBED');
});
test('sign out invalidates callbacks before channel removal and preserves schedule',()=>{
  const {store,channels}=fixture(),statuses=[];store.base={blocks:[{id:'saved'}]};
  store.subscribe(()=>{},s=>statuses.push(s));channels[0].status('SUBSCRIBED');
  store._clearSession();channels[0].status('TIMED_OUT');
  assert.equal(store.channel,null);assert.equal(store.realtimeStatus,null);
  assert.deepEqual(store.base,{blocks:[{id:'saved'}]});
  assert.deepEqual(statuses,['CONNECTING','SUBSCRIBED']);
});

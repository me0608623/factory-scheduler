import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../src/store/supabase.js';

// 每張表一個頻道：一張表未進 publication 只毒化自己，其餘表照常即時；
// 彙總語意不變（任一壞→CHANNEL_ERROR 維持安全補讀、全好才 SUBSCRIBED）。
function makeFakeSb() {
  const channels = [];
  return {
    channels,
    channel(name) {
      const ch = {
        name, handlers: {}, removed: false, subCb: null,
        on(kind, cfg, cb) { (this.handlers[kind] ??= []).push({ cfg, cb }); },
        subscribe(cb) { this.subCb = cb; },
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch) { ch.removed = true; },
  };
}

function makeStore(withSession = true) {
  const sb = makeFakeSb();
  const store = new SupabaseStore(sb);
  if (withSession) store.session = { user: { id: 'u1' } };
  store._profile = async () => {};
  return { sb, store };
}

// 模擬 phx_join ok + postgres_changes 串流 ok 的健康頻道
function driveHealthy(ch) {
  ch.subCb('SUBSCRIBED');
  ch.handlers.system[0].cb({ extension: 'postgres_changes', status: 'ok' });
}
const pgHandler = ch => ch.handlers.postgres_changes[0].cb;

test('one channel per table; all healthy aggregates to SUBSCRIBED and routes table events', async () => {
  const { sb, store } = makeStore();
  const statuses = []; const changes = [];
  store.subscribe(t => changes.push(t), s => statuses.push(s));
  assert.equal(sb.channels.length, 22); // 21 tables + account_permissions
  assert.equal(statuses[0], 'CONNECTING');
  for (const ch of sb.channels) driveHealthy(ch);
  assert.equal(store.realtimeStatus, 'SUBSCRIBED');
  assert.equal(statuses.at(-1), 'SUBSCRIBED');
  pgHandler(sb.channels.find(c => c.name === 'schedule-changes:orders'))();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(changes, ['orders']);
});

test('a table missing from the publication degrades to CHANNEL_ERROR but healthy tables keep pushing', async () => {
  const { sb, store } = makeStore();
  const statuses = []; const changes = [];
  store.subscribe(t => changes.push(t), s => statuses.push(s));
  for (const ch of sb.channels) driveHealthy(ch);
  assert.equal(store.realtimeStatus, 'SUBSCRIBED');       // 先全好
  const machines = sb.channels.find(c => c.name === 'schedule-changes:machines');
  machines.handlers.system[0].cb({ extension: 'postgres_changes', status: 'error' }); // 之後毒化
  assert.equal(store.realtimeStatus, 'CHANNEL_ERROR');    // 降級（安全補讀繼續）
  assert.equal(statuses.at(-1), 'CHANNEL_ERROR');
  pgHandler(sb.channels.find(c => c.name === 'schedule-changes:orders'))();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(changes, ['orders']); // 健康表仍即時
});

test('resubscribe removes old channels and stale callbacks cannot affect the new generation', async () => {
  const { sb, store } = makeStore();
  const statuses1 = [];
  store.subscribe(() => {}, s => statuses1.push(s));
  const oldMachines = sb.channels.find(c => c.name === 'schedule-changes:machines');
  const oldOrders = sb.channels.find(c => c.name === 'schedule-changes:orders');
  const statuses2 = []; const changes2 = [];
  store.subscribe(t => changes2.push(t), s => statuses2.push(s));
  assert.ok(sb.channels.slice(0, 22).every(c => c.removed)); // 舊頻道全移除
  assert.equal(sb.channels.length, 44);
  // 舊 generation 的回呼：不得改新狀態、不得推送
  oldMachines.handlers.system[0].cb({ extension: 'postgres_changes', status: 'error' });
  pgHandler(oldOrders)();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(statuses2, ['CONNECTING']);
  assert.deepEqual(changes2, []);
  // 新 generation 正常運作
  for (const ch of sb.channels.slice(22)) driveHealthy(ch);
  assert.equal(store.realtimeStatus, 'SUBSCRIBED');
});

test('without a session only the 21 table channels are created', () => {
  const { sb, store } = makeStore(false);
  store.subscribe(() => {}, () => {});
  assert.equal(sb.channels.length, 21);
  assert.ok(sb.channels.every(c => !c.name.includes('account_permissions')));
});

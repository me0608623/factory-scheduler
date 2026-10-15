import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore } from '../src/store/local.js';

const key = 'fsched-scenarios-v1';
const state = {cal:{week:[],over:{}},dayOT:{},employees:[],machines:[],products:[],orders:[],blocks:[]};
const item = id => ({id,name:id,payload:{base:state,candidate:state}});

test('failed scenario read cannot overwrite existing scenarios; retry preserves both', async () => {
  const previous = globalThis.localStorage;
  const original = JSON.stringify([item('old')]);
  const data = new Map([[key,original],['unrelated','keep']]);
  let blocked = true, writes = 0;
  globalThis.localStorage = {
    getItem(k) { if (blocked && k === key) throw new Error('read unavailable'); return data.get(k) ?? null; },
    setItem(k,v) { writes++; data.set(k,v); }
  };
  try {
    const store = new LocalStore();
    await assert.rejects(store.saveScenario(item('new')), /情境清單讀取失敗/);
    assert.equal(writes,0);
    assert.equal(data.get(key),original);
    blocked = false;
    assert.equal(await store.saveScenario(item('new')),'new');
    assert.deepEqual((await store.listScenarios()).map(x=>x.id),['new','old']);
    assert.equal(await store.saveScenario(item('new')),'new');
    assert.equal(writes,1,'identical retry does not rewrite');
    assert.equal(data.get('unrelated'),'keep');
  } finally { globalThis.localStorage = previous; }
});

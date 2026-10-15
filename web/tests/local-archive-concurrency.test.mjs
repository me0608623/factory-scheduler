import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalStore} from '../src/store/local.js';

const archive=(id)=>({sourceName:id,sourceSha256:id,legacy:{dates:['2026-10-01'],rows:[id]}});
function storage(){
  const data=new Map();
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  return data;
}

test('concurrent successful archive saves retain both index entries and payloads',async()=>{
  storage();const store=new LocalStore();
  const saved=await Promise.all([store.saveLegacyArchive(archive('a')),store.saveLegacyArchive(archive('b'))]);
  assert.equal(saved.length,2);
  assert.deepEqual(new Set((await store.listLegacyArchives()).map(x=>x.id)),new Set(['a','b']));
  for(const id of ['a','b'])assert.deepEqual(await store.getLegacyArchive(id),archive(id).legacy);
});

test('concurrent duplicate archive saves stay idempotent',async()=>{
  storage();const store=new LocalStore();
  await Promise.all([store.saveLegacyArchive(archive('a')),store.saveLegacyArchive(archive('a'))]);
  assert.equal((await store.listLegacyArchives()).length,1);
  assert.deepEqual(await store.getLegacyArchive('a'),archive('a').legacy);
});

test('failed index publication rolls back only the new payload; retry preserves prior archives',async()=>{
  const data=storage(),store=new LocalStore();
  await store.saveLegacyArchive(archive('a'));
  const write=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k==='fsched-legacy-index-v1')throw new Error('QuotaExceededError');write(k,v);};
  await assert.rejects(store.saveLegacyArchive(archive('b')));
  assert.equal(data.has('fsched-legacy-b'),false);
  assert.deepEqual(await store.getLegacyArchive('a'),archive('a').legacy);
  localStorage.setItem=write;
  await store.saveLegacyArchive(archive('b'));
  assert.deepEqual(new Set((await store.listLegacyArchives()).map(x=>x.id)),new Set(['a','b']));
});

test('an unreadable or damaged index does not overwrite or delete retained archive data',async()=>{
  for(const mode of ['read-error','invalid-json','invalid-shape']){
    const data=storage(),store=new LocalStore();
    await store.saveLegacyArchive(archive('a'));
    if(mode==='invalid-json')data.set('fsched-legacy-index-v1','{incomplete');
    if(mode==='invalid-shape')data.set('fsched-legacy-index-v1','{}');
    const before=new Map(data),read=localStorage.getItem;
    if(mode==='read-error')localStorage.getItem=k=>{if(k==='fsched-legacy-index-v1')throw new Error('Read failed');return read(k);};
    await assert.rejects(store.saveLegacyArchive(archive('a')));
    assert.deepEqual(data,before);
  }
});

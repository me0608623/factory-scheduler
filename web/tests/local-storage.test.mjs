import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore } from '../src/store/local.js';
import { makeScenario } from '../src/scenarios.js';

const day='2025-01-02';
function state() {return {version:0,cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{},
  employees:[{id:'e',name:'E',skills:['a'],leaves:[],maxMachines:1,factory:1}],
  machines:[{id:'a',label:'A',proc:'切',products:['p'],faults:[],factory:1}],
  products:[{id:'p',name:'P',steps:[{proc:'切',rate:2,batch:0,factory:1}]}],
  orders:[{id:'o',code:'O',pid:'p',qty:100,due:day,pri:1}],blocks:[{id:'b',oid:'o',step:0,m:'a',emp:'e',date:day,s:480,e:540,qty:60,pin:false}],log:[]};}

const withStorage=storage=>{const previous=globalThis.localStorage;globalThis.localStorage=storage;return ()=>{globalThis.localStorage=previous;};};
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),dump:m};};

test('瀏覽器儲存被停用時本機模式不崩潰，讀取退回空值',async()=>{
  const blocked={getItem(){throw new Error('SecurityError')},setItem(){throw new Error('SecurityError')},removeItem(){throw new Error('SecurityError')}};
  const restore=withStorage(blocked);
  try{
    const store=new LocalStore();
    assert.deepEqual(await store.init(),{needLogin:false});
    assert.equal(await store.load(),null);
    assert.deepEqual(await store.listScenarios(),[]);
    assert.equal(await store.getScenario('x'),null);
    await assert.rejects(store.sync(state()),/儲存空間不足或被停用/);
  }finally{restore();}
});

test('情境清單 JSON 損毀時退回空清單，下次保存可恢復',async()=>{
  const s=memory();s.setItem('fsched-scenarios-v1','{損毀');
  const restore=withStorage(s);
  try{
    const store=new LocalStore(),S=state();
    assert.deepEqual(await store.listScenarios(),[]);
    assert.equal(await store.getScenario('any'),null);
    await store.saveScenario(makeScenario('復原',S,S));
    assert.equal((await store.listScenarios()).length,1);
  }finally{restore();}
});

test('同步寫入超過容量時擋下友善錯誤且原資料不動',async()=>{
  const S=state(),bigger=structuredClone(S);bigger.orders[0].note='x'.repeat(100);
  let quotaFull=false;const m=new Map();
  const restore=withStorage({getItem:k=>m.get(k)??null,setItem(k,v){if(quotaFull)throw new Error('QuotaExceededError');m.set(k,v);},removeItem:k=>m.delete(k)});
  try{
    const store=new LocalStore();await store.sync(S);
    quotaFull=true;
    await assert.rejects(store.sync(bigger),/儲存空間不足或被停用/);
    assert.deepEqual((await store.load()).orders[0],S.orders[0]);
  }finally{restore();}
});

test('歷史排程索引寫入失敗不留孤兒資料佔空間',async()=>{
  const m=new Map();
  const restore=withStorage({getItem:k=>m.get(k)??null,
    setItem(k,v){if(k==='fsched-legacy-index-v1')throw new Error('QuotaExceededError');m.set(k,v);},
    removeItem:k=>m.delete(k)});
  try{
    const store=new LocalStore();
    await assert.rejects(store.saveLegacyArchive({sourceName:'舊檔',sourceSha256:'a'.repeat(64),legacy:{dates:['2024-01-01','2024-01-02'],rows:[]}}),/儲存空間不足，歷史排程未存入/);
    assert.equal([...m.keys()].filter(k=>k.startsWith('fsched-legacy-')).length,0,'失敗後不留孤兒鍵');
    assert.deepEqual(await store.listLegacyArchives(),[]);
  }finally{restore();}
});

test('歷史排程本機保存成功會建索引且同檔不重複',async()=>{
  const s=memory();const restore=withStorage(s);
  try{
    const store=new LocalStore();
    const first=await store.saveLegacyArchive({sourceName:'舊檔',sourceSha256:'a'.repeat(64),legacy:{dates:['2024-01-01'],rows:[1]}});
    assert.equal((await store.listLegacyArchives()).length,1);
    assert.deepEqual((await store.getLegacyArchive('a'.repeat(64))).dates,['2024-01-01']);
    assert.equal((await store.saveLegacyArchive({sourceName:'舊檔',sourceSha256:'a'.repeat(64),legacy:{dates:['2024-01-01'],rows:[1]}})).id,first.id);
  }finally{restore();}
});

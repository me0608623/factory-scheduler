import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';

test('invalid snapshot RPC payload never replaces the remembered cloud write baseline',async()=>{
  for(const data of [null,undefined,[], 'invalid',42]){
    const store=new SupabaseStore({rpc:async()=>({data,error:null}),from:()=>assert.fail('must reject before loading audit history')});
    store.version=12;store.base={employees:[{id:'TEST-E01'}]};
    const before=JSON.stringify({version:store.version,base:store.base});
    await assert.rejects(store.load(),/讀取排程失敗/);
    assert.equal(JSON.stringify({version:store.version,base:store.base}),before);
  }
});

test('valid zero-row cloud snapshot is not confused with a failed RPC',async()=>{
  const chain={select:()=>chain,order:()=>chain,limit:async()=>({data:[],error:null})};
  const store=new SupabaseStore({rpc:async()=>({data:{version:3,employees:[],machines:[],products:[],orders:[],blocks:[],calendar:{}},error:null}),from:()=>chain});
  const snapshot=await store.load();assert.equal(snapshot.demo,false);assert.equal(snapshot.employees.length,0);assert.equal(store.version,3);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';
import {fromSnapshot} from '../src/convert.js';

const empty=()=>({version:12,employees:[],machines:[],products:[],orders:[],blocks:[],calendar:{}});
const remembered=store=>JSON.stringify(Object.fromEntries(['version','base','baseBlocks','protectedBase','baseGroups',
  'baseGeneral','baseContents','baseTransfers','transferBase','baseRush','baseWorkLog','baseRosters'].map(key=>[key,store[key]])),
  (_,value)=>value instanceof Map?[...value]:value);
async function rejectWithoutRemembering(payloads){
  let data={...empty(),employees:[{id:'TEST-E01',name:'測試🧪',skills:[]}]},history=0;
  const chain={select:()=>chain,order:()=>chain,limit:async()=>{history++;return {data:[],error:null};}};
  const store=new SupabaseStore({rpc:async()=>({data,error:null}),from:()=>chain});
  await store.load();const before=remembered(store);
  for(const payload of payloads){
    data=payload;
    await assert.rejects(store.load(),/讀取排程失敗/);
    assert.equal(remembered(store),before,'all write/protected baselines remain unchanged');
    assert.equal(history,1,'reject before fetching history or doing any write');
  }
}

test('malformed objects and missing core collections cannot silently become an empty cloud board',async()=>{
  const missing=['employees','machines','products','orders','blocks','calendar'].map(key=>{
    const value=empty();delete value[key];return value;
  });
  await rejectWithoutRemembering([{}, {error:'PRIVATE-INVALID-PAYLOAD'},...missing]);
});
test('missing, coercible, negative and unsafe snapshot versions cannot reset the write baseline',async()=>{
  const missing=empty();delete missing.version;
  await rejectWithoutRemembering([missing,...[null,'12',false,-1,0.5,NaN,Infinity,2**53].map(version=>({...empty(),version}))]);
});
test('core and extension collections require record arrays instead of null or malformed data',async()=>{
  const lists=['employees','machines','products','orders','blocks','work_execution','machine_layout','work_contents',
    'work_assignments','work_reference_orders','transfer_orders','rush_orders','work_log','staff_rosters',
    'leave_requests','schedule_memos','staff_groups','staff_group_members'];
  await rejectWithoutRemembering(lists.flatMap(key=>[null,{},'PRIVATE-ROW',[null],['PRIVATE-ROW']].map(value=>({...empty(),[key]:value}))));
});
test('duplicate/missing core identities and malformed nested arrays are rejected before conversion',async()=>{
  await rejectWithoutRemembering([
    {...empty(),employees:[{id:'TEST-E01',skills:[]},{id:'TEST-E01',skills:[]}]},
    {...empty(),employees:[{skills:[]}]},
    {...empty(),employees:[{id:'TEST-E01',skills:'a'}]},
    {...empty(),machines:[{id:'TEST-M01',products:null}]},
    {...empty(),products:[{id:'TEST-P01',steps:{}}]},
    {...empty(),products:[{id:'TEST-P01',steps:[null]}]},
  ]);
});
test('malformed calendars cannot silently invent weekly or override availability',async()=>{
  await rejectWithoutRemembering([null,[],false,'PRIVATE-CALENDAR'].map(calendar=>({...empty(),calendar})));
  await rejectWithoutRemembering([
    {...empty(),calendar:{week:'1111111'}}, {...empty(),calendar:{week:[true]}},
    {...empty(),calendar:{overrides:[]}}, {...empty(),calendar:{overrides:{'2026-10-12':'false'}}},
    {...empty(),calendar:{overtime:{'2026-10-12':'yes'}}}, {...empty(),calendar:{holidays:[]}},
  ]);
});

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
test('an old snapshot cannot replace a different account or a new login lifetime baseline',async()=>{
  for(const mode of ['account','login','history']){
    let finish,entered;const waiting=new Promise(resolve=>entered=resolve);
    const chain={select:()=>chain,order:()=>chain,limit:async()=>mode==='history'?new Promise(resolve=>{finish=resolve;entered();}):({data:[],error:null})};
    const client={rpc:async()=>mode==='history'?({data:empty(),error:null}):new Promise(resolve=>{finish=resolve;entered();}),from:()=>chain};
    const store=new SupabaseStore(client);store.session={user:{id:'TEST-A'}};
    const old=store.load();await waiting;
    store._clearSession();store.session={user:{id:mode==='login'?'TEST-A':'TEST-B'}};
    const fresh=fromSnapshot({...empty(),version:100});store.acceptLoaded(fresh);const baseline=store.base;
    finish(mode==='history'?{data:[],error:null}:{data:empty(),error:null});
    await assert.rejects(old,/登入狀態已變更/);assert.equal(store.version,100);assert.equal(store.base,baseline);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCloudSnapshot} from '../src/store/snapshot-contract.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb} from './fake-supabase.mjs';

const empty=()=>({version:0,employees:[],machines:[],products:[],orders:[],blocks:[],calendar:{}});

test('actual latest-migration RPC data loads without inventing or changing catalog data',async()=>{
  const db=await makeDb();
  try{
    const raw=(await db.query('SELECT schedule_snapshot() AS data')).rows[0].data;
    const before=JSON.stringify(raw);assertCloudSnapshot(raw);
    const chain={select:()=>chain,order:()=>chain,limit:async()=>({data:[],error:null})};
    const store=new SupabaseStore({rpc:async()=>({data:raw,error:null}),from:()=>chain});
    const loaded=await store.load();
    assert.equal(loaded.version,raw.version);assert.equal(store.version,raw.version);
    assert.equal(loaded.employees.length,raw.employees.length);
    assert.deepEqual(loaded.employees.map(e=>[e.id,e.name]),raw.employees.map(e=>[e.id,e.name]));
    assert.equal(JSON.stringify(raw),before,'validation and loading do not mutate the RPC object');
    // A true zero-row snapshot from the real function, including SQL-null weekly aggregation.
    await db.exec("UPDATE employees SET active=false; UPDATE machines SET active=false; UPDATE products SET active=false; UPDATE orders SET status='done'; DELETE FROM calendar_weekly;");
    const zero=(await db.query('SELECT schedule_snapshot() AS data')).rows[0].data;
    assert.equal(zero.employees.length,0);assert.equal(zero.calendar.week,null);
    assertCloudSnapshot(zero);
  }finally{await db.close();}
});

test('version zero, omitted legacy extensions and unknown future fields remain supported',()=>{
  const raw={...empty(),future_feature:{illustrative:true},calendar:{week:null},setup_pending:true};
  assert.doesNotThrow(()=>assertCloudSnapshot(raw));
  assert.doesNotThrow(()=>assertCloudSnapshot({...raw,calendar:{week:[false,true,true,true,true,true,false],
    overrides:{'2026-10-12':false},overtime:{'2026-10-12':true},holidays:{'2026-10-12':'測試🧪'}}}));
});

test('invalid data errors never disclose source values or change the input',()=>{
  const raw={...empty(),version:'PRIVATE-SNAPSHOT-email@example.test'},before=JSON.stringify(raw);
  assert.throws(()=>assertCloudSnapshot(raw),error=>/讀取排程失敗/.test(error.message)&&!error.message.includes('PRIVATE-'));
  assert.equal(JSON.stringify(raw),before);
});

test('bounded 10000-row transport validation is linear and does not rewrite the schedule',()=>{
  // Deliberately overlapping synthetic segments: this tests transport shape,
  // not feasibility, capacity or an authorized production schedule.
  const raw={...empty(),blocks:Array.from({length:10000},(_,i)=>({id:'TEST-B'+i,order:'TEST-O',step:0,
    machine:'TEST-M',employee:'TEST-E',date:'2026-10-12',start:480,end:540,qty:10,pinned:false}))};
  const before=JSON.stringify(raw),started=performance.now();assertCloudSnapshot(raw);
  assert.ok(performance.now()-started<250,'bounded validation must finish under 250ms');
  assert.equal(JSON.stringify(raw),before);
});

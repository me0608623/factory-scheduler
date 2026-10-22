import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyFixtureSql,assertDailyTestTarget,TEST_URL,FIXTURE_MACHINE_IDS,LEGACY_MACHINE_ID} from '../../tools/daily-test-fixtures.mjs';
import {makeDb} from './fake-supabase.mjs';

test('realistic fixtures refuse every target except the isolated test project',()=>{
  for(const url of ['https://kjnnguekhshkhgycmryl.supabase.co','http://localhost',`${TEST_URL}.evil.example`])
    assert.throws(()=>assertDailyTestTarget(url),/禁止正式/);
  assert.doesNotThrow(()=>assertDailyTestTarget(`${TEST_URL}/`));
});

test('SQL is bounded and cleanup is limited to the tool-owned legacy identifiers',()=>{
  assert.throws(()=>dailyFixtureSql({url:TEST_URL,start:'2026-02-30',days:1}),/日期不存在/);
  assert.throws(()=>dailyFixtureSql({url:TEST_URL,start:'2026-10-20',days:401}),/介於 1 到 400/);
  const sql=dailyFixtureSql({url:TEST_URL,start:'2026-10-20',days:3});
  assert.match(sql,/2026-10-20 through 2026-10-22/);
  assert.match(sql,/10 blocks per day/);
  assert.match(sql,new RegExp(LEGACY_MACHINE_ID,'g'));
  assert.doesNotMatch(sql,/\b(truncate|drop)\b/i);
  assert.doesNotMatch(sql,/delete from (employees|machines|products|orders|schedule_blocks)\s*;/i);
  for(const machine of FIXTURE_MACHINE_IDS)assert.match(sql,new RegExp(machine));
});

async function seedResources(db){
  const processes=['裁切','沖壓','焊接','組裝','包裝'];
  await db.exec(processes.map((p,i)=>`insert into processes(name,sort) values('${p}',${i}) on conflict do nothing;`).join('\n'));
  for(let i=0;i<5;i++){
    const id=`10000000-0000-4000-8000-00000000000${i+1}`;
    await db.exec(`insert into employees(id,code,name,color,active,factory,review_status,max_concurrent_machines)
      values('${id}', 'T${i+1}', '測試-人員${i+1}', ${i}, true, 1, 'confirmed', 1);
      insert into machines(id,label,process,active,factory,review_status)
      values('${FIXTURE_MACHINE_IDS[i]}','測試-${processes[i]}機','${processes[i]}',true,1,'confirmed');`);
  }
}

test('fixtures use existing resources, cover weekends, rerun safely and remain draggable',async()=>{
  const db=await makeDb();
  try{
    const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
    await seedResources(db);
    const sql=dailyFixtureSql({url:TEST_URL,start:'2026-10-23',days:4});
    const version0=Number((await db.query('select version from schedule_state')).rows[0].version);
    await db.exec(sql);
    const rows=(await db.query(`select date,machine_id,start_min,end_min from schedule_blocks order by date,machine_id,start_min`)).rows;
    assert.equal(rows.length,40);
    assert.deepEqual([...new Set(rows.map(row=>day(row.date)))],['2026-10-23','2026-10-24','2026-10-25','2026-10-26']);
    assert.deepEqual([...new Set(rows.map(row=>row.machine_id))],FIXTURE_MACHINE_IDS);
    assert.equal((await db.query("select count(*)::int n from calendar_days where date between '2026-10-23' and '2026-10-26' and is_open")).rows[0].n,4);
    assert.equal((await db.query(`select count(*)::int n from machines where id='${LEGACY_MACHINE_ID}'`)).rows[0].n,0);
    const version1=Number((await db.query('select version from schedule_state')).rows[0].version);
    assert.equal(version1,version0+1);
    await db.exec(sql);
    assert.equal(Number((await db.query('select version from schedule_state')).rows[0].version),version1);

    const uid='99999999-9999-4999-8999-999999999999';
    await db.exec(`insert into auth.users(id,email) values('${uid}','simulation-lead@example.test');
      update profiles set display_name='模擬排班組長',role='lead' where user_id='${uid}';`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    const current=(await db.query("select coalesce(jsonb_agg(to_jsonb(sb) order by sb.date,sb.id),'[]'::jsonb) blocks from schedule_blocks sb join orders o on o.id=sb.order_id where o.status='open'")).rows[0].blocks;
    const target=current.find(block=>block.machine_id==='tst01'&&day(block.date)==='2026-10-26'&&block.start_min===480);
    target.start_min=500;target.end_min=710;
    await db.query("select save_blocks($1,$2::jsonb,'測試拖曳')",[version1,JSON.stringify(current)]);
    const moved=(await db.query('select start_min,end_min from schedule_blocks where id=$1',[target.id])).rows[0];
    assert.deepEqual(moved,{start_min:500,end_min:710});
  }finally{await db.close();}
});

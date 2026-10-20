import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyFixtureSql,assertDailyTestTarget,TEST_URL,FIXTURE_MACHINE_ID} from '../../tools/daily-test-fixtures.mjs';
import {makeDb} from './fake-supabase.mjs';

test('daily fixtures refuse every target except the isolated test project',()=>{
  for(const url of ['https://kjnnguekhshkhgycmryl.supabase.co','http://localhost',`${TEST_URL}.evil.example`])
    assert.throws(()=>assertDailyTestTarget(url),/禁止正式/);
  assert.doesNotThrow(()=>assertDailyTestTarget(`${TEST_URL}/`));
});

test('daily fixture SQL is bounded, additive and contains no destructive statements',()=>{
  assert.throws(()=>dailyFixtureSql({url:TEST_URL,start:'2026-02-30',days:1}),/日期不存在/);
  assert.throws(()=>dailyFixtureSql({url:TEST_URL,start:'2026-10-20',days:401}),/介於 1 到 400/);
  const sql=dailyFixtureSql({url:TEST_URL,start:'2026-10-20',days:3});
  assert.match(sql,/2026-10-20 through 2026-10-22/);
  assert.match(sql,/on conflict\(id\) do nothing/i);
  assert.doesNotMatch(sql,/^\s*(delete|truncate|drop)\b/im);
  assert.match(sql,new RegExp(FIXTURE_MACHINE_ID,'g'));
});

test('daily fixtures execute on real migrations, cover weekends, rerun safely and remain draggable',async()=>{
  const db=await makeDb();
  try{
    const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
    const sql=dailyFixtureSql({url:TEST_URL,start:'2026-10-23',days:4});
    const version0=Number((await db.query('select version from schedule_state')).rows[0].version);
    await db.exec(sql);
    const rows=(await db.query(`select date,start_min,end_min from schedule_blocks where machine_id='${FIXTURE_MACHINE_ID}' order by date`)).rows;
    assert.deepEqual(rows.map(row=>day(row.date)),['2026-10-23','2026-10-24','2026-10-25','2026-10-26']);
    assert.equal((await db.query("select count(*)::int n from calendar_days where date between '2026-10-23' and '2026-10-26' and is_open")).rows[0].n,4);
    const version1=Number((await db.query('select version from schedule_state')).rows[0].version);
    assert.equal(version1,version0+1);
    await db.exec(sql);
    assert.equal(Number((await db.query('select version from schedule_state')).rows[0].version),version1);

    const uid='99999999-9999-4999-8999-999999999999';
    await db.exec(`insert into auth.users(id,email) values('${uid}','daily-lead@example.test');
      update profiles set display_name='每日練習組長',role='lead' where user_id='${uid}';`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    const current=(await db.query("select coalesce(jsonb_agg(to_jsonb(sb) order by sb.date,sb.id),'[]'::jsonb) blocks from schedule_blocks sb join orders o on o.id=sb.order_id where o.status='open'")).rows[0].blocks;
    const target=current.find(block=>block.machine_id===FIXTURE_MACHINE_ID&&day(block.date)==='2026-10-26');
    target.start_min=600;target.end_min=630;
    await db.query("select save_blocks($1,$2::jsonb,'測試拖曳')",[version1,JSON.stringify(current)]);
    const moved=(await db.query('select start_min,end_min from schedule_blocks where id=$1',[target.id])).rows[0];
    assert.deepEqual(moved,{start_min:600,end_min:630});
  }finally{await db.close();}
});

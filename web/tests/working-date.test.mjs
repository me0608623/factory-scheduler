import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './fake-supabase.mjs';
import {workingDate} from './working-date.mjs';

test('ordinary working fixtures handle every anchor weekday and calendar exceptions', async () => {
  const db = await makeDb();
  try {
    // Explicit query anchors test all weekdays without changing the clock/TZ.
    for (const [anchor, expected] of [
      ['2032-06-06','2032-06-07'], ['2032-06-07','2032-06-08'],
      ['2032-06-08','2032-06-09'], ['2032-06-09','2032-06-10'],
      ['2032-06-10','2032-06-11'], ['2032-06-11','2032-06-14'],
      ['2032-06-12','2032-06-14'],
    ]) assert.equal(await workingDate(db, anchor), expected);
    await db.query("insert into calendar_days(date,is_open) values ('2032-06-13',true),('2032-06-14',false)");
    await db.query("insert into holidays(date,name) values ('2032-06-15','Synthetic holiday')");
    assert.equal(await workingDate(db, '2032-06-12'), '2032-06-16', 'open Sunday, closed Monday and holiday Tuesday are not ordinary working days');
    await db.query('update calendar_weekly set is_open=false where weekday=3');
    assert.equal(await workingDate(db, '2032-06-12'), '2032-06-17');
    await db.query("insert into calendar_days(date,is_open) values ('2032-06-16',true)");
    assert.equal(await workingDate(db, '2032-06-12'), '2032-06-16', 'explicit open weekday overrides weekly closure');
    const date = await workingDate(db);
    assert.equal((await db.query('select $1::date > current_date and $1::date <= current_date + 90 as within_window',[date])).rows[0].within_window, true);
    await db.query("insert into calendar_days(date,is_open) select '2032-07-01'::date+n,false from generate_series(1,90) n");
    await assert.rejects(workingDate(db, '2032-07-01'), /No ordinary working date in the next 90 days/);
  } finally { await db.close(); }
});

// Ordinary synthetic work uses weekday daytime slots, without holiday/overtime
// consent. Use the database's date and calendar, not the host clock. The default
// range stays inside schedule_snapshot's current_date - 7 .. +90 window.
export async function workingDate(db, anchor = null) {
  const {rows} = await db.query(`
    select d.date::text as date
    from (select coalesce($1::date, current_date) + n as date
          from generate_series(1, 90) as n) d
    join calendar_weekly w on w.weekday = extract(dow from d.date)::int
    left join calendar_days c on c.date = d.date
    where extract(dow from d.date) between 1 and 5
      and coalesce(c.is_open, w.is_open) is true
      and not exists (select 1 from holidays h where h.date = d.date)
    order by d.date limit 1
  `, [anchor]);
  if (!rows.length) throw new Error('No ordinary working date in the next 90 days');
  return rows[0].date;
}

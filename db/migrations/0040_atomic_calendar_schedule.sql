-- Calendar and replacement schedule share one transaction. Caller RLS remains
-- responsible for calendar DML; save_blocks retains its protected lock/check.
-- Do not SELECT FOR UPDATE schedule_state here: invoker RLS permits only reads.
create function save_calendar_and_blocks(p_base_version bigint, p_calendar jsonb, p_blocks jsonb,
  p_title text, p_detail jsonb default '{}', p_kind text default 'edit')
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  k text;
  allowed text[];
  required text[];
  rows jsonb;
begin
  if has_permission('calendar.manage') is not true or has_permission('schedule.manage') is not true then
    raise exception '沒有修改上班日與排程的權限' using errcode='42501';
  end if;
  if p_base_version is null or jsonb_typeof(p_calendar) is distinct from 'object'
     or jsonb_typeof(p_blocks) is distinct from 'array' then
    raise exception '上班日與排程格式不正確';
  end if;
  if exists(select 1 from jsonb_object_keys(p_calendar) x where x <> all(array[
    'weekly','days','delete_days','employee_days','delete_employee_days'])) then
    raise exception '上班日欄位不正確';
  end if;
  if not (p_calendar ?& array['weekly','days','delete_days','employee_days','delete_employee_days']) then
    raise exception '上班日欄位不完整';
  end if;
  foreach k in array array['weekly','days','delete_days','employee_days','delete_employee_days'] loop
    rows:=p_calendar->k;
    if jsonb_typeof(rows) is distinct from 'array' then raise exception '上班日清單格式不正確'; end if;
    allowed:=case k when 'weekly' then array['weekday','is_open']
      when 'days' then array['date','is_open','overtime','overtime_end']
      when 'delete_days' then array['date']
      when 'employee_days' then array['employee_id','date','available']
      else array['employee_id','date'] end;
    required:=allowed;
    if exists(select 1 from jsonb_array_elements(rows) r where jsonb_typeof(r) is distinct from 'object') then
      raise exception '上班日列格式不正確';
    end if;
    if exists(select 1 from jsonb_array_elements(rows) r where not (r ?& required))
      or exists(select 1 from jsonb_array_elements(rows) r,jsonb_object_keys(r) field where field <> all(allowed)) then
      raise exception '上班日列欄位不正確';
    end if;
    if exists(select 1 from jsonb_array_elements(rows) r where
      (k='weekly' and r->>'weekday' is null) or
      (k<>'weekly' and r->>'date' is null) or
      (k in ('employee_days','delete_employee_days') and r->>'employee_id' is null)) then
      raise exception '上班日列識別欄位不可空白';
    end if;
    if exists(select 1 from jsonb_array_elements(rows) r group by
      case when k='weekly' then (r->>'weekday')::smallint::text else (r->>'date')::date::text end,
      case when k in ('employee_days','delete_employee_days') then (r->>'employee_id')::uuid end
      having count(*)>1) then raise exception '上班日列不可重複'; end if;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_calendar->'days') a(date date)
    join jsonb_to_recordset(p_calendar->'delete_days') b(date date) using(date))
    or exists(select 1 from jsonb_to_recordset(p_calendar->'employee_days') a(employee_id uuid,date date)
    join jsonb_to_recordset(p_calendar->'delete_employee_days') b(employee_id uuid,date date) using(employee_id,date)) then
    raise exception '上班日列不可同時修改與刪除';
  end if;
  if not exists(select 1 from jsonb_each(p_calendar) x where jsonb_array_length(x.value)>0) then
    raise exception '沒有需要儲存的上班日變更';
  end if;
  insert into calendar_weekly(weekday,is_open)
    select x.weekday,x.is_open from jsonb_to_recordset(p_calendar->'weekly') x(weekday smallint,is_open boolean)
    on conflict(weekday) do update set is_open=excluded.is_open;
  insert into calendar_days(date,is_open,overtime,overtime_end)
    select x.date,x.is_open,x.overtime,x.overtime_end from jsonb_to_recordset(p_calendar->'days')
      x(date date,is_open boolean,overtime boolean,overtime_end smallint)
    on conflict(date) do update set is_open=excluded.is_open,overtime=excluded.overtime,overtime_end=excluded.overtime_end;
  delete from calendar_days where date in
    (select x.date from jsonb_to_recordset(p_calendar->'delete_days') x(date date));
  insert into employee_overtime_days(employee_id,date,available)
    select x.employee_id,x.date,x.available from jsonb_to_recordset(p_calendar->'employee_days')
      x(employee_id uuid,date date,available boolean)
    on conflict(employee_id,date) do update set available=excluded.available;
  delete from employee_overtime_days d using
    jsonb_to_recordset(p_calendar->'delete_employee_days') x(employee_id uuid,date date)
    where d.employee_id=x.employee_id and d.date=x.date;
  -- Any failure, including the version conflict, rolls all calendar DML back.
  -- No new table rights are granted; existing save_blocks owns its state lock.
  return save_blocks(p_base_version,p_blocks,p_title,p_detail,p_kind);
end $$;
revoke all on function save_calendar_and_blocks(bigint,jsonb,jsonb,text,jsonb,text) from public,anon;
grant execute on function save_calendar_and_blocks(bigint,jsonb,jsonb,text,jsonb,text) to authenticated;

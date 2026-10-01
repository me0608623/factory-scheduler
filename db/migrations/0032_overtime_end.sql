-- 0032：加班終點時間（老闆自選，不再固定 20:00）
-- calendar_days.overtime 維持 boolean（開/不開）；新增 overtime_end smallint（加班到幾點，分鐘）
alter table calendar_days add column if not exists overtime_end smallint check(overtime_end is null or overtime_end between 1020 and 1320);

-- 既有 overtime=true 的日子，預設 1200（20:00）
update calendar_days set overtime_end = 1200 where overtime and overtime_end is null;

-- 快照：overtime_end 帶出
alter function schedule_snapshot(date,date) rename to _snapshot_before_ot_end;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb language sql stable security invoker set search_path=public as $$
 select _snapshot_before_ot_end(p_from,p_to)||jsonb_build_object(
   'ot_ends',(select coalesce(jsonb_object_agg(date::text, overtime_end), '{}') from calendar_days where overtime and overtime_end is not null and date between p_from and p_to));
$$;
revoke all on function _snapshot_before_ot_end(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_ot_end(date,date),schedule_snapshot(date,date) to authenticated;

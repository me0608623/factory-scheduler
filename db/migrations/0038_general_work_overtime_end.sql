-- Honor the existing per-day overtime endpoint for new or changed general assignments.
-- Replaces only the guard body; existing trigger and function privileges are unchanged.
-- The overtime editor preflights calendar edits; this is not a calendar-table trigger.
create or replace function _guard_work_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare w work_contents; e employees; allowed boolean;
begin
 if (select setup_pending from schedule_state) then raise exception '名冊與工時尚待確認，不能新增排班'; end if;
 select * into strict w from work_contents where id=new.work_id;
 select * into strict e from employees where id=new.employee_id;
 if w.review_status='pending' or not e.active or e.review_status='pending' or e.factory<>w.factory or not e.id=any(w.employee_ids) then
   raise exception '工作、人員或資格尚未核定'; end if;
 if w.requires_resource then
   if new.resource_id is null or not new.resource_id=any(w.resource_ids) or not exists(
     select 1 from machines m join employee_skills s on s.machine_id=m.id and s.employee_id=e.id
     where m.id=new.resource_id and m.active and m.review_status='confirmed' and m.factory=w.factory) then raise exception '需要指定已核定的設備／工位及操作技能'; end if;
   if exists(select 1 from machine_faults where machine_id=new.resource_id and date=new.date and start_min<new.end_min and end_min>new.start_min) then raise exception '設備在此時段故障'; end if;
 elsif new.resource_id is not null then raise exception '純人工工作不應指定設備'; end if;
 if exists(select 1 from leaves where employee_id=e.id and date=new.date) then raise exception '員工當天請假'; end if;
 allowed:=coalesce((select is_open from calendar_days where date=new.date),(select is_open from calendar_weekly where weekday=extract(dow from new.date)::int));
 if not coalesce(allowed,false) or not exists(select 1 from work_windows ww
   where new.start_min>=ww.start_min and new.end_min<=case when ww.is_overtime
     then coalesce((select overtime_end from calendar_days where date=new.date),ww.end_min) else ww.end_min end and
     (not ww.is_overtime or coalesce((select overtime from calendar_days where date=new.date),false))) then raise exception '跨午休、停工或未開放上班時段'; end if;
 if ((extract(dow from new.date)::int in (0,6)) or exists(select 1 from holidays where date=new.date) or new.end_min>1020) and
   not coalesce((select available from employee_overtime_days where employee_id=e.id and date=new.date),extract(dow from new.date)::int=any(e.overtime_weekdays)) then raise exception '員工當天不可加班'; end if;
 perform _assert_work_slot(new.employee_id,new.resource_id,new.date,new.start_min,new.end_min,new.id,true);
 return new;
end $$;

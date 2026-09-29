-- Additive model: work content, optional equipment/workstation, and planned assignment.
-- Existing production steps/blocks and pending legacy positions are not converted.
create table work_contents (
 id uuid primary key, name text not null check(length(trim(name)) between 1 and 80),
 factory smallint not null check(factory in (1,2)), requires_resource boolean not null,
 employee_ids uuid[] not null default '{}', resource_ids text[] not null default '{}',
 review_status text not null default 'confirmed' check(review_status in ('pending','confirmed')),
 check(requires_resource or cardinality(resource_ids)=0)
);
create table work_assignments (
 id uuid primary key, work_id uuid not null references work_contents(id),
 employee_id uuid not null references employees(id), resource_id text references machines(id),
 date date not null, start_min smallint not null check(start_min>=0),
 end_min smallint not null check(end_min<=1440 and end_min>start_min),
 qty integer check(qty>=0), order_id uuid references orders(id), note text not null default '' check(length(note)<=500)
);
alter table work_contents enable row level security;
create index work_assignments_employee_day on work_assignments(employee_id,date,start_min,end_min);
create index work_assignments_resource_day on work_assignments(resource_id,date,start_min,end_min) where resource_id is not null;
alter table work_assignments enable row level security;
create policy contents_read on work_contents for select to authenticated using(is_member());
create policy assignments_read on work_assignments for select to authenticated using(is_member());
revoke all on work_contents,work_assignments from authenticated,anon;
grant select on work_contents,work_assignments to authenticated;
create trigger audit after insert or update or delete on work_contents for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on work_assignments for each row execute function audit_trigger('id');

create function _assert_work_slot(p_emp uuid,p_resource text,p_date date,p_s int,p_e int,p_id uuid,p_general boolean) returns void
language plpgsql security definer set search_path=public as $$
declare lim int;
begin
 select max_concurrent_machines into strict lim from employees where id=p_emp;
 if p_resource is not null and (
   exists(select 1 from schedule_blocks b where machine_id=p_resource and date=p_date and start_min<p_e and end_min>p_s and (p_general or id<>p_id)) or
   exists(select 1 from work_assignments a where resource_id=p_resource and date=p_date and start_min<p_e and end_min>p_s and (not p_general or id<>p_id))) then
   raise exception '設備／工位已被其他工作占用';
 end if;
 if exists(
   with spans as (
     select start_min s,end_min e,1 demand from schedule_blocks where employee_id=p_emp and date=p_date and (p_general or id<>p_id)
     union all select start_min,end_min,case when resource_id is null then lim else 1 end from work_assignments where employee_id=p_emp and date=p_date and (not p_general or id<>p_id)
     union all select p_s,p_e,case when p_resource is null then lim else 1 end
   ), events as (
     select s t,demand d from spans union all select e,-demand from spans
   ), totals as (select t,sum(sum(d)) over(order by t) load from events group by t)
   select 1 from totals where t>=p_s and t<p_e and load>lim
 ) then raise exception '員工時間衝突：純人工需專心執行，設備工作不能超過顧機上限'; end if;
end $$;
revoke all on function _assert_work_slot(uuid,text,date,int,int,uuid,boolean) from public,anon,authenticated;

create function _guard_work_assignment() returns trigger language plpgsql security definer set search_path=public as $$
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
   where new.start_min>=ww.start_min and new.end_min<=ww.end_min and
     (not ww.is_overtime or coalesce((select overtime from calendar_days where date=new.date),false))) then raise exception '跨午休、停工或未開放上班時段'; end if;
 if ((extract(dow from new.date)::int in (0,6)) or exists(select 1 from holidays where date=new.date) or new.end_min>1020) and
   not coalesce((select available from employee_overtime_days where employee_id=e.id and date=new.date),extract(dow from new.date)::int=any(e.overtime_weekdays)) then raise exception '員工當天不可加班'; end if;
 perform _assert_work_slot(new.employee_id,new.resource_id,new.date,new.start_min,new.end_min,new.id,true);
 return new;
end $$;
revoke all on function _guard_work_assignment() from public,anon,authenticated;
create trigger guard_work before insert or update on work_assignments for each row execute function _guard_work_assignment();

create function _guard_production_work() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.employee_id is null and exists(select 1 from work_assignments where resource_id=new.machine_id and date=new.date and start_min<new.end_min and end_min>new.start_min) then
   raise exception '設備／工位已被其他工作占用'; end if;
 if new.employee_id is not null and exists(select 1 from work_assignments where date=new.date and start_min<new.end_min and end_min>new.start_min and (employee_id=new.employee_id or resource_id=new.machine_id)) then
   perform _assert_work_slot(new.employee_id,new.machine_id,new.date,new.start_min,new.end_min,new.id,false);
 end if;
 return new;
end $$;
revoke all on function _guard_production_work() from public,anon,authenticated;
-- Only run when general assignments exist, preserving the legacy replacement path.
create trigger guard_general_work before insert or update on schedule_blocks for each row execute function _guard_production_work();

create function _guard_work_master() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.factory=old.factory and new.active then return new; end if;
 if tg_table_name='employees' then
   if exists(select 1 from work_contents where old.id::uuid=any(employee_ids)) then
     raise exception '此人員仍屬於工作內容，請先調整工作內容與一般工作排班'; end if;
 else
   if exists(select 1 from work_contents where old.id::text=any(resource_ids)) then
     raise exception '此設備仍屬於工作內容，請先調整工作內容與一般工作排班'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
revoke all on function _guard_work_master() from public,anon,authenticated;
create trigger guard_work_master before update or delete on employees for each row execute function _guard_work_master();
create trigger guard_work_master before update or delete on machines for each row execute function _guard_work_master();

create function save_work_contents(p_version bigint,p_contents jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare ver bigint; cs uuid:=gen_random_uuid(); x jsonb;
begin
 if app_role() is distinct from 'boss' then raise exception '只有老闆可以修改工作內容' using errcode='42501'; end if;
 select version into ver from schedule_state for update;
 if ver is distinct from p_version then raise exception '工作內容或排程版本已變，請重新載入' using errcode='40001'; end if;
 if jsonb_typeof(p_contents) is distinct from 'array' or jsonb_array_length(p_contents)>200 then raise exception '工作內容格式或數量不正確'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_contents))<>jsonb_array_length(p_contents) then raise exception '工作內容代號重複'; end if;
 for x in select value from jsonb_array_elements(p_contents) loop
   if jsonb_typeof(x->'employeeIds') is distinct from 'array' or jsonb_typeof(x->'resourceIds') is distinct from 'array' or jsonb_typeof(x->'requiresResource') is distinct from 'boolean' or
      exists(select 1 from jsonb_array_elements_text(x->'employeeIds') v where not exists(select 1 from employees where id=v::uuid and active and factory=(x->>'factory')::int)) or
      exists(select 1 from jsonb_array_elements_text(x->'resourceIds') v where not exists(select 1 from machines where id=v and active and factory=(x->>'factory')::int)) then raise exception '工作內容含有無效人員或設備'; end if;
 end loop;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','更新工作內容',ver,ver+1);
 perform set_config('app.change_set_id',cs::text,true);
 delete from work_contents where id not in (select (value->>'id')::uuid from jsonb_array_elements(p_contents));
 insert into work_contents(id,name,factory,requires_resource,employee_ids,resource_ids,review_status)
 select (item->>'id')::uuid,trim(item->>'name'),(item->>'factory')::int,(item->>'requiresResource')::boolean,
   array(select v::uuid from jsonb_array_elements_text(item->'employeeIds') v),array(select v from jsonb_array_elements_text(item->'resourceIds') v),coalesce(item->>'reviewStatus','confirmed')
 from jsonb_array_elements(p_contents) item
 on conflict(id) do update set name=excluded.name,factory=excluded.factory,requires_resource=excluded.requires_resource,employee_ids=excluded.employee_ids,resource_ids=excluded.resource_ids,review_status=excluded.review_status;
 -- Changing a definition must not make existing assignments incompatible.
 if exists(select 1 from work_assignments a join work_contents w on w.id=a.work_id join employees e on e.id=a.employee_id where
   w.factory<>e.factory or not e.id=any(w.employee_ids) or (w.requires_resource and (a.resource_id is null or not a.resource_id=any(w.resource_ids))) or (not w.requires_resource and a.resource_id is not null)) then raise exception '已有排班不符合新的工作定義，整次撤回'; end if;
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid();return ver+1;
end $$;

create function save_work_assignments(p_version bigint,p_assignments jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare ver bigint; cs uuid:=gen_random_uuid();
begin
 if not is_editor() then raise exception '只有老闆或組長可以安排工作' using errcode='42501'; end if;
 select version into ver from schedule_state for update;
 if ver is distinct from p_version then raise exception '工作或排程版本已變，請重新載入' using errcode='40001'; end if;
 if (select setup_pending from schedule_state) then raise exception '名冊與工時尚待確認，不能新增排班'; end if;
 if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments)>10000 then raise exception '工作排班格式或數量不正確'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_assignments))<>jsonb_array_length(p_assignments) then raise exception '工作排班代號重複或缺少'; end if;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','安排工作內容',ver,ver+1);
 perform set_config('app.change_set_id',cs::text,true);
 -- Keep identical rows: a later calendar change must not rewrite historical work.
 delete from work_assignments a where not exists (
   select 1 from jsonb_to_recordset(p_assignments) as x(id uuid,work_id uuid,employee_id uuid,resource_id text,date date,start_min smallint,end_min smallint,qty integer,order_id uuid,note text)
   where a.id=x.id and row(a.work_id,a.employee_id,a.resource_id,a.date,a.start_min,a.end_min,a.qty,a.order_id,a.note)
     is not distinct from row(x.work_id,x.employee_id,x.resource_id,x.date,x.start_min,x.end_min,x.qty,x.order_id,coalesce(x.note,'')));
 insert into work_assignments(id,work_id,employee_id,resource_id,date,start_min,end_min,qty,order_id,note)
 select id,work_id,employee_id,resource_id,date,start_min,end_min,qty,order_id,coalesce(note,'') from jsonb_to_recordset(p_assignments)
   as x(id uuid,work_id uuid,employee_id uuid,resource_id text,date date,start_min smallint,end_min smallint,qty integer,order_id uuid,note text)
   where not exists(select 1 from work_assignments a where a.id=x.id);
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid();return ver+1;
end $$;
revoke all on function save_work_contents(bigint,jsonb),save_work_assignments(bigint,jsonb) from public,anon;
grant execute on function save_work_contents(bigint,jsonb),save_work_assignments(bigint,jsonb) to authenticated;

alter function schedule_snapshot(date,date) rename to _snapshot_before_work_contents;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb
language sql stable security invoker set search_path=public as $$
 select _snapshot_before_work_contents(p_from,p_to)||jsonb_build_object(
 'work_contents',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'factory',factory,'requiresResource',requires_resource,'employeeIds',employee_ids,'resourceIds',resource_ids,'reviewStatus',review_status) order by id),'[]') from work_contents),
 'work_assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'workId',work_id,'emp',employee_id,'resourceId',resource_id,'date',date,'s',start_min,'e',end_min,'qty',qty,'orderId',order_id,'note',note) order by id),'[]') from work_assignments),
 'work_reference_orders',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'code',o.code) order by o.id),'[]') from orders o where o.id in(select order_id from work_assignments)))
$$;
revoke all on function _snapshot_before_work_contents(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_work_contents(date,date),schedule_snapshot(date,date) to authenticated;
alter publication supabase_realtime add table work_contents,work_assignments;

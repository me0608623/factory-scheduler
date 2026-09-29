-- Organizational membership is independent of skills, home factory and work assignment.
create table staff_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  department text check (department is null or length(trim(department)) between 1 and 80),
  home_factory smallint check (home_factory in (1,2)),
  source_ref text,
  active boolean not null default true
);
create table staff_group_members (
  group_id uuid not null references staff_groups(id),
  employee_id uuid not null references employees(id) on delete cascade,
  review_status text not null default 'confirmed' check (review_status in ('source','pending','confirmed')),
  source_ref text,
  primary key(group_id,employee_id)
);
alter table staff_groups enable row level security;
alter table staff_group_members enable row level security;
create policy member_read on staff_groups for select to authenticated using(is_member());
create policy member_read on staff_group_members for select to authenticated using(is_member());
grant select on staff_groups,staff_group_members to authenticated;
revoke insert,update,delete on staff_groups,staff_group_members from authenticated,anon;
create trigger audit after insert or update or delete on staff_groups for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on staff_group_members for each row execute function audit_trigger('group_id','employee_id');

create function save_staff_groups(p_base_version bigint,p_groups jsonb,p_members jsonb,p_title text default '更新員工分組')
returns bigint language plpgsql security definer set search_path=public as $$
declare v bigint; cs uuid:=gen_random_uuid();
begin
  if not is_boss() then raise exception '只有老闆可以修改員工分組' using errcode='42501'; end if;
  select version into v from schedule_state for update;
  if v is distinct from p_base_version then raise exception '分組或排程版本已變，請重新載入' using errcode='40001'; end if;
  lock table staff_groups,staff_group_members in share row exclusive mode;
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_typeof(p_members) is distinct from 'array' then
    raise exception '分組資料格式錯誤'; end if;
  if jsonb_array_length(p_groups)>200 or jsonb_array_length(p_members)>2000 then raise exception '分組資料超過上限'; end if;
  if exists(select 1 from jsonb_to_recordset(p_groups) g(id uuid,name text,department text,home_factory int)
    where id is null or name is null or length(trim(name)) not between 1 and 80
      or (department is not null and length(trim(department)) not between 1 and 80)
      or (home_factory is not null and home_factory not in (1,2)))
    or (select count(distinct x->>'id') from jsonb_array_elements(p_groups) x)<>jsonb_array_length(p_groups) then
    raise exception '分組名稱或代號錯誤'; end if;
  if exists(select 1 from jsonb_to_recordset(p_members) m(group_id uuid,employee_id uuid,review_status text)
    where group_id is null or employee_id is null or coalesce(review_status,'') not in ('source','pending','confirmed')
      or not exists(select 1 from employees e where e.id=m.employee_id and e.active)
      or not exists(select 1 from jsonb_to_recordset(p_groups) g(id uuid) where g.id=m.group_id))
    or (select count(distinct (x->>'group_id',x->>'employee_id')) from jsonb_array_elements(p_members) x)<>jsonb_array_length(p_members) then
    raise exception '組員不存在、重複或狀態錯誤'; end if;
  insert into change_sets(id,kind,title,detail,version_before,version_after)
    values(cs,'edit',coalesce(nullif(trim(p_title),''),'更新員工分組'),jsonb_build_object('groups',jsonb_array_length(p_groups),'members',jsonb_array_length(p_members)),v,v+1);
  perform set_config('app.change_set_id',cs::text,true);
  -- Retire omitted groups, keeping their definitions and audit history recoverable.
  update staff_groups set active=false where active and id not in(select g.id from jsonb_to_recordset(p_groups) g(id uuid));
  insert into staff_groups(id,name,department,home_factory,source_ref,active)
    select id,trim(name),department,home_factory,source_ref,true from jsonb_to_recordset(p_groups)
      g(id uuid,name text,department text,home_factory smallint,source_ref text)
    on conflict(id) do update set name=excluded.name,department=excluded.department,home_factory=excluded.home_factory,source_ref=excluded.source_ref,active=true;
  delete from staff_group_members where group_id in(select g.id from jsonb_to_recordset(p_groups) g(id uuid));
  insert into staff_group_members(group_id,employee_id,review_status,source_ref)
    select group_id,employee_id,review_status,source_ref from jsonb_to_recordset(p_members)
      m(group_id uuid,employee_id uuid,review_status text,source_ref text);
  update schedule_state set version=v+1,updated_at=now();
  return v+1;
end $$;
revoke all on function save_staff_groups(bigint,jsonb,jsonb,text) from public,anon;
grant execute on function save_staff_groups(bigint,jsonb,jsonb,text) to authenticated;

alter function schedule_snapshot(date,date) rename to _snapshot_before_staff_groups;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90)
returns jsonb language sql stable security invoker set search_path=public as $$
  select _snapshot_before_staff_groups(p_from,p_to) || jsonb_build_object(
    'staff_groups',(select coalesce(jsonb_agg(to_jsonb(g)-'active' order by g.home_factory,g.name,g.id),'[]') from staff_groups g where g.active),
    'staff_group_members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.group_id,m.employee_id),'[]') from staff_group_members m
       join staff_groups g on g.id=m.group_id join employees e on e.id=m.employee_id where g.active and e.active))
$$;
revoke all on function _snapshot_before_staff_groups(date,date) from public,anon;
grant execute on function _snapshot_before_staff_groups(date,date) to authenticated;
revoke all on function schedule_snapshot(date,date) from public,anon;
grant execute on function schedule_snapshot(date,date) to authenticated;

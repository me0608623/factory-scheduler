-- Job titles remain descriptive defaults. The boss can override each write scope
-- for any existing account without changing that account's job title.
create table account_permissions (
  user_id uuid not null references profiles(user_id) on delete cascade,
  permission text not null check(permission in (
    'schedule.manage','incidents.manage','orders.manage','calendar.manage',
    'master.manage','groups.manage','work_contents.manage','transfers.manage',
    'rosters.manage','scenarios.manage','execution.manage','archives.manage'
  )),
  allowed boolean not null,
  granted_by uuid not null default auth.uid() references profiles(user_id),
  updated_at timestamptz not null default now(),
  primary key(user_id,permission)
);
alter table account_permissions enable row level security;
create policy own_permission_read on account_permissions for select to authenticated
  using(user_id=auth.uid() or is_boss());
grant select on account_permissions to authenticated;
revoke insert,update,delete on account_permissions from authenticated,anon;
create trigger audit after insert or update or delete on account_permissions
  for each row execute function audit_trigger('user_id','permission');
alter publication supabase_realtime add table account_permissions;

create function role_has_permission(p_role app_role,p_permission text) returns boolean
language sql immutable set search_path=public as $$
  select case
    when p_role='boss' then true
    when p_role='lead' then p_permission=any(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage',
      'transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage'
    ])
    else false
  end
$$;

create function permission_for_user(p_user uuid,p_permission text) returns boolean
language sql stable security definer set search_path=public as $$
  select case when p.role='boss' then true else coalesce(
    (select ap.allowed from account_permissions ap where ap.user_id=p_user and ap.permission=p_permission),
    role_has_permission(p.role,p_permission),false) end
  from profiles p where p.user_id=p_user
$$;

create function has_permission(p_permission text) returns boolean
language sql stable security definer set search_path=public as $$
  select permission_for_user(auth.uid(),p_permission)
$$;

create function has_any_write_permission() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from unnest(array[
    'schedule.manage','incidents.manage','orders.manage','calendar.manage',
    'master.manage','groups.manage','work_contents.manage','transfers.manage',
    'rosters.manage','scenarios.manage','execution.manage','archives.manage'
  ]) p where has_permission(p))
$$;

-- Keep compatibility for existing scheduling functions while allowing overrides.
create or replace function is_editor() returns boolean language sql stable as $$
  select has_permission('schedule.manage')
$$;

create function list_access_accounts() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not is_boss() then raise exception '只有老闆可以管理帳號權限' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId',p.user_id,'displayName',p.display_name,'role',p.role,'employeeId',p.employee_id,
    'customized',exists(select 1 from account_permissions a where a.user_id=p.user_id),
    'permissions',(select jsonb_object_agg(k,permission_for_user(p.user_id,k)) from unnest(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage',
      'master.manage','groups.manage','work_contents.manage','transfers.manage',
      'rosters.manage','scenarios.manage','execution.manage','archives.manage'
    ]) k)
  ) order by case p.role when 'boss' then 0 when 'lead' then 1 when 'worker' then 2 else 3 end,p.display_name),'[]')
  into result from profiles p;
  return result;
end $$;

create function set_account_permissions(p_user uuid,p_permissions jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare k text;v jsonb;
begin
  if not is_boss() then raise exception '只有老闆可以管理帳號權限' using errcode='42501'; end if;
  if not exists(select 1 from profiles where user_id=p_user) then raise exception '找不到這個帳號'; end if;
  if jsonb_typeof(p_permissions) is distinct from 'object' then raise exception '權限格式不正確'; end if;
  for k,v in select key,value from jsonb_each(p_permissions) loop
    if k<>all(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage',
      'master.manage','groups.manage','work_contents.manage','transfers.manage',
      'rosters.manage','scenarios.manage','execution.manage','archives.manage'
    ]) or jsonb_typeof(v)<>'boolean' then raise exception '含未知權限或非布林值'; end if;
  end loop;
  delete from account_permissions where user_id=p_user;
  insert into account_permissions(user_id,permission,allowed,granted_by)
    select p_user,key,(value#>>'{}')::boolean,auth.uid() from jsonb_each(p_permissions);
end $$;

revoke all on function role_has_permission(app_role,text),permission_for_user(uuid,text),has_permission(text),
  has_any_write_permission(),list_access_accounts(),set_account_permissions(uuid,jsonb) from public,anon;
grant execute on function has_permission(text),has_any_write_permission(),list_access_accounts(),
  set_account_permissions(uuid,jsonb) to authenticated;

-- Direct table writes use the feature scope, not the job title.
do $$ declare t text; begin
  foreach t in array array['calendar_days','leaves','machine_faults','orders'] loop
    execute format('drop policy if exists editor_write on %I',t);
  end loop;
end $$;
create policy calendar_permission_write on calendar_days for all to authenticated
  using(has_permission('calendar.manage')) with check(has_permission('calendar.manage'));
create policy incident_permission_write on leaves for all to authenticated
  using(has_permission('incidents.manage')) with check(has_permission('incidents.manage'));
create policy incident_permission_write on machine_faults for all to authenticated
  using(has_permission('incidents.manage')) with check(has_permission('incidents.manage'));
create policy order_permission_write on orders for all to authenticated
  using(has_permission('orders.manage')) with check(has_permission('orders.manage'));
drop policy if exists editor_write on employee_overtime_days;
create policy calendar_permission_write on employee_overtime_days for all to authenticated
  using(has_permission('calendar.manage')) with check(has_permission('calendar.manage'));

do $$ declare t text; begin
  foreach t in array array['calendar_weekly','holidays','work_windows'] loop
    execute format('create policy delegated_calendar_write on %I for all to authenticated using (has_permission(''calendar.manage'')) with check (has_permission(''calendar.manage''))',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['employees','processes','machines','employee_skills','products','product_steps',
    'machine_products','work_windows','calendar_weekly','holidays'] loop
    execute format('create policy delegated_master_write on %I for all to authenticated using (has_permission(''master.manage'')) with check (has_permission(''master.manage''))',t);
  end loop;
end $$;

drop policy if exists editor_read on legacy_schedule_archives;
drop policy if exists editor_insert on legacy_schedule_archives;
create policy archive_permission_read on legacy_schedule_archives for select to authenticated
  using(has_permission('archives.manage'));
create policy archive_permission_insert on legacy_schedule_archives for insert to authenticated
  with check(has_permission('archives.manage') and imported_by=auth.uid());

drop policy if exists scenario_owner_read on planning_scenarios;
create policy scenario_owner_read on planning_scenarios for select to authenticated
  using(has_permission('scenarios.manage') and created_by=auth.uid());

-- Existing validated RPCs keep all validation/atomicity; only their authorization predicate changes.
do $$
declare r record;src text;before text;scope text;
begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('save_staff_groups','save_work_contents','save_transfer_orders','save_staff_rosters','save_planning_scenario') loop
    scope:=case r.proname when 'save_staff_groups' then 'groups.manage' when 'save_work_contents' then 'work_contents.manage'
      when 'save_transfer_orders' then 'transfers.manage' when 'save_staff_rosters' then 'rosters.manage' else 'scenarios.manage' end;
    src:=pg_get_functiondef(r.oid);before:=src;
    src:=regexp_replace(src,'if\s+not\s+is_boss\(\)\s+then','if not has_permission('''||scope||''') then','i');
    src:=regexp_replace(src,'if\s+app_role\(\)\s+is\s+distinct\s+from\s+''boss''\s+then','if not has_permission('''||scope||''') then','i');
    src:=regexp_replace(src,'if\s+not\s+is_editor\(\)\s+then','if not has_permission('''||scope||''') then','i');
    if src=before then raise exception '0026 could not patch permission check in %',r.proname; end if;
    execute src;
  end loop;
end $$;

do $$ declare r record;src text;before text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='log_change' loop
    src:=pg_get_functiondef(r.oid);before:=src;
    src:=regexp_replace(src,'if\s+not\s+is_editor\(\)\s+then','if not has_any_write_permission() then','i');
    if src=before then raise exception '0026 could not patch log_change'; end if;execute src;
  end loop;
end $$;

-- A preview is authorized by the feature that created it. This lets a delegated
-- incident/order manager apply that specific plan without granting all scheduling.
do $$ declare r record;src text;before text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='apply_plan' loop
    src:=pg_get_functiondef(r.oid);before:=src;
    src:=regexp_replace(src,
      'if\s+not\s+is_editor\(\)\s+then\s+raise exception ''[^'']*'' using errcode\s*=\s*''42501'';\s+end if;',
      '','i');
    src:=regexp_replace(src,'(if\s+not\s+found\s+then\s+raise exception ''[^'']*'' using errcode\s*=\s*''P0002'';\s+end if;)',
      E'\\1\n  if (pv.kind in (''fault'',''leave'',''recover'') and not has_permission(''incidents.manage''))\n     or (pv.kind=''order'' and not has_permission(''orders.manage''))\n     or (pv.kind not in (''fault'',''leave'',''recover'',''order'') and not has_permission(''schedule.manage'')) then\n    raise exception ''沒有套用這類方案的權限'' using errcode=''42501'';\n  end if;','i');
    if src=before or position('沒有套用這類方案的權限' in src)=0 then
      raise exception '0026 could not patch apply_plan permission check';
    end if;
    execute src;
  end loop;
end $$;

do $$ declare r record;src text;before text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='report_work_execution' loop
    src:=pg_get_functiondef(r.oid);before:=src;
    src:=regexp_replace(src,'if\s+role\s+is\s+null\s+or\s+role\s*=\s*''viewer''\s+then',
      'if role is null or (role=''viewer'' and not has_permission(''execution.manage'')) then','i');
    src:=regexp_replace(src,'if\s+not\s+is_editor\(\)\s+and\s*\(',
      'if not has_permission(''execution.manage'') and (','i');
    if src=before then raise exception '0026 could not patch report_work_execution'; end if;execute src;
  end loop;
end $$;

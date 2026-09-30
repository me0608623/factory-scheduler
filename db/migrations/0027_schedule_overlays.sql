-- Lightweight operational overlays around the schedule. These records never
-- replace the machine x time schedule and do not silently move blocks.
create type leave_request_status as enum ('pending','approved','rejected');

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  status leave_request_status not null default 'pending',
  note text not null default '' check(length(note)<=140),
  created_by uuid not null default auth.uid() references profiles(user_id),
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(user_id),
  resolved_at timestamptz
);
create unique index leave_requests_one_pending on leave_requests(employee_id,date) where status='pending';

create table schedule_memos (
  id uuid primary key default gen_random_uuid(),
  text text not null check(length(btrim(text)) between 1 and 140),
  machine_id text references machines(id) on delete cascade on update cascade,
  employee_id uuid references employees(id) on delete cascade,
  pinned boolean not null default false,
  author text not null default '',
  created_by uuid not null default auth.uid() references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(machine_id is not null or employee_id is not null)
);

alter table leave_requests enable row level security;
alter table schedule_memos enable row level security;
create policy member_read on leave_requests for select to authenticated using(is_member());
create policy leave_request_insert on leave_requests for insert to authenticated with check(
  is_member() and (has_permission('incidents.manage') or employee_id=(select employee_id from profiles where user_id=auth.uid()))
);
create policy incident_resolve on leave_requests for update to authenticated
  using(has_permission('incidents.manage')) with check(has_permission('incidents.manage'));
create policy incident_delete on leave_requests for delete to authenticated using(has_permission('incidents.manage'));
create policy member_read on schedule_memos for select to authenticated using(is_member());
create policy notes_write on schedule_memos for all to authenticated
  using(has_permission('notes.manage')) with check(has_permission('notes.manage'));
grant select,insert,update,delete on leave_requests,schedule_memos to authenticated;

create trigger audit after insert or update or delete on leave_requests
  for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on schedule_memos
  for each row execute function audit_trigger('id');

create or replace function resolve_leave_request(p_id uuid,p_status leave_request_status) returns void
language plpgsql security definer set search_path=public as $$
declare r leave_requests%rowtype;employee_name text;
begin
  if not has_permission('incidents.manage') then raise exception '沒有決定請假詢問的權限' using errcode='42501';end if;
  if p_status not in ('approved','rejected') then raise exception '決定狀態不正確';end if;
  select * into r from leave_requests where id=p_id for update;
  if not found or r.status<>'pending' then raise exception '這筆詢問已處理或不存在';end if;
  update leave_requests set status=p_status,resolved_by=auth.uid(),resolved_at=now() where id=p_id;
  select name into employee_name from employees where id=r.employee_id;
  if p_status='approved' then
    insert into leaves(employee_id,date,note,created_by) values(r.employee_id,r.date,nullif(r.note,''),auth.uid())
      on conflict(employee_id,date) do update set note=coalesce(excluded.note,leaves.note);
    perform log_change('leave','准假 '||coalesce(employee_name,'')||' '||r.date,jsonb_build_object('summary','請假詢問已核准；排程未自動移動'));
  else
    perform log_change('leave','駁回請假詢問 '||coalesce(employee_name,'')||' '||r.date,jsonb_build_object('summary','正式請假與排程均未變更'));
  end if;
end $$;
revoke all on function resolve_leave_request(uuid,leave_request_status) from public,anon;
grant execute on function resolve_leave_request(uuid,leave_request_status) to authenticated;

-- Add memo delegation without coupling it to job titles.
alter table account_permissions drop constraint if exists account_permissions_permission_check;
alter table account_permissions add constraint account_permissions_permission_check check(permission in (
  'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
  'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage','notes.manage'
));

create or replace function role_has_permission(p_role app_role,p_permission text) returns boolean
language sql immutable set search_path=public as $$
  select case when p_role='boss' then true when p_role='lead' then p_permission=any(array[
    'schedule.manage','incidents.manage','orders.manage','calendar.manage','transfers.manage','rosters.manage',
    'scenarios.manage','execution.manage','archives.manage','notes.manage']) else false end
$$;

create or replace function has_any_write_permission() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from unnest(array[
    'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
    'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage','notes.manage'
  ]) p where has_permission(p))
$$;

create or replace function list_access_accounts() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not is_boss() then raise exception '只有老闆可以管理帳號權限' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId',p.user_id,'displayName',p.display_name,'role',p.role,'employeeId',p.employee_id,
    'customized',exists(select 1 from account_permissions a where a.user_id=p.user_id),
    'permissions',(select jsonb_object_agg(k,permission_for_user(p.user_id,k)) from unnest(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
      'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage','notes.manage'
    ]) k)
  ) order by case p.role when 'boss' then 0 when 'lead' then 1 when 'worker' then 2 else 3 end,p.display_name),'[]')
  into result from profiles p;return result;
end $$;

create or replace function set_account_permissions(p_user uuid,p_permissions jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare k text;v jsonb;
begin
  if not is_boss() then raise exception '只有老闆可以管理帳號權限' using errcode='42501';end if;
  if not exists(select 1 from profiles where user_id=p_user) then raise exception '找不到這個帳號';end if;
  if jsonb_typeof(p_permissions) is distinct from 'object' then raise exception '權限格式不正確';end if;
  for k,v in select key,value from jsonb_each(p_permissions) loop
    if k<>all(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
      'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage','notes.manage'
    ]) or jsonb_typeof(v)<>'boolean' then raise exception '含未知權限或非布林值';end if;
  end loop;
  delete from account_permissions where user_id=p_user;
  insert into account_permissions(user_id,permission,allowed,granted_by)
    select p_user,key,(value#>>'{}')::boolean,auth.uid() from jsonb_each(p_permissions);
end $$;

alter function schedule_snapshot(date,date) rename to _snapshot_before_schedule_overlays;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb
language sql stable security invoker set search_path=public as $$
  select _snapshot_before_schedule_overlays(p_from,p_to)||jsonb_build_object(
    'leave_requests',(select coalesce(jsonb_agg(to_jsonb(x) order by x.date,x.created_at),'[]') from leave_requests x where x.date between p_from and p_to),
    'schedule_memos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.pinned desc,x.created_at desc),'[]') from schedule_memos x)
  );
$$;
revoke all on function _snapshot_before_schedule_overlays(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_schedule_overlays(date,date),schedule_snapshot(date,date) to authenticated;

alter publication supabase_realtime add table leave_requests;
alter publication supabase_realtime add table schedule_memos;

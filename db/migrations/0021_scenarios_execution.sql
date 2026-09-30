-- Isolated, read-only what-if archives. No archive can be applied through this API.
create table planning_scenarios (
  id uuid primary key,
  name text not null check(length(trim(name)) between 1 and 80),
  payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=2000000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table planning_scenarios enable row level security;
create policy scenario_owner_read on planning_scenarios for select to authenticated
  using(is_editor() and created_by=auth.uid());
grant select on planning_scenarios to authenticated;
revoke insert,update,delete on planning_scenarios from authenticated,anon;
create function save_planning_scenario(p_id uuid,p_name text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare old planning_scenarios; state jsonb; array_name text;
begin
  if not is_editor() then raise exception '只有老闆或組長可保存試排情境' using errcode='42501'; end if;
  if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 80
     or p_payload is null or pg_column_size(p_payload)>2000000
     or jsonb_typeof(p_payload) is distinct from 'object' then raise exception '情境格式不正確'; end if;
  if jsonb_typeof(p_payload->'base'->'blocks') is distinct from 'array'
     or jsonb_typeof(p_payload->'candidate'->'blocks') is distinct from 'array' then raise exception '情境缺少排程資料'; end if;
  for state in select p_payload->'base' union all select p_payload->'candidate' loop
    if jsonb_typeof(state->'cal'->'week') is distinct from 'array'
       or jsonb_typeof(state->'cal'->'over') is distinct from 'object'
       or jsonb_typeof(state->'dayOT') is distinct from 'object' then raise exception '情境缺少工時資料'; end if;
    foreach array_name in array array['employees','machines','products','orders','blocks'] loop
      if jsonb_typeof(state->array_name) is distinct from 'array' then raise exception '情境缺少名冊或工單資料'; end if;
    end loop;
  end loop;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select * into old from planning_scenarios where id=p_id;
  if found then
    if old.created_by<>auth.uid() or old.name<>trim(p_name) or old.payload<>p_payload then raise exception '情境代號已使用'; end if;
    return p_id;
  end if;
  if (select count(*) from planning_scenarios where created_by=auth.uid())>=20 then raise exception '每個帳號最多保存 20 個情境'; end if;
  insert into planning_scenarios(id,name,payload,created_by) values(p_id,trim(p_name),p_payload,auth.uid());
  return p_id;
end $$;
revoke all on function save_planning_scenario(uuid,text,jsonb) from public,anon;
grant execute on function save_planning_scenario(uuid,text,jsonb) to authenticated;

-- Existing progress_reports are left intact as legacy history, but no arbitrary
-- direct writes can bypass the new validated execution lifecycle.
revoke insert,update,delete on progress_reports from authenticated,anon;
create table work_execution (
  block_id uuid primary key references schedule_blocks(id) on delete restrict,
  employee_id uuid not null references employees(id),
  status text not null check(status in ('running','done')),
  qty_done integer not null check(qty_done>=0),
  started_at timestamptz not null,
  finished_at timestamptz,
  revision integer not null check(revision>0),
  check((status='done')=(finished_at is not null)),
  check(finished_at is null or finished_at>=started_at)
);
create table work_execution_events (
  id uuid primary key,
  block_id uuid not null references work_execution(block_id),
  created_by uuid not null references auth.users(id),
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table work_execution enable row level security;
alter table work_execution_events enable row level security;
create policy execution_member_read on work_execution for select to authenticated using(is_member());
create policy execution_event_read on work_execution_events for select to authenticated using(is_editor() or created_by=auth.uid());
grant select on work_execution,work_execution_events to authenticated;
revoke insert,update,delete on work_execution,work_execution_events from authenticated,anon;
create trigger audit after insert or update on work_execution for each row execute function audit_trigger('block_id');
create trigger audit after insert on work_execution_events for each row execute function audit_trigger('id');

create function report_work_execution(p_request uuid,p_block uuid,p_action text,p_qty integer,p_revision integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b schedule_blocks; old work_execution; event work_execution_events; role app_role;
  req jsonb; result jsonb; ver bigint; cs uuid:=gen_random_uuid(); at_time timestamptz:=clock_timestamp();
begin
  role:=app_role();
  if role is null or role='viewer' then raise exception '沒有現場回報權限' using errcode='42501'; end if;
  if p_request is null or p_block is null or p_action is null or p_action not in ('start','quantity','finish')
     or p_qty is null or p_qty<0 or p_revision is null or p_revision<0 then raise exception '回報格式不正確'; end if;
  -- Serialize starts and planning commits in the same lock order.
  select version into ver from schedule_state for update;
  at_time:=clock_timestamp();
  select * into b from schedule_blocks where id=p_block for update;
  if not found or b.employee_id is null then raise exception '找不到已指定人員的工作'; end if;
  if not is_editor() and (role<>'worker' or b.employee_id is distinct from
      (select employee_id from profiles where user_id=auth.uid())) then
    raise exception '只能回報綁定給自己的工作' using errcode='42501';
  end if;
  req:=jsonb_build_object('block',p_block,'action',p_action,'qty',p_qty,'revision',p_revision);
  select * into event from work_execution_events where id=p_request;
  if found then
    if event.created_by<>auth.uid() or event.request<>req then raise exception '重送代號不能用於不同回報'; end if;
    return event.result;
  end if;
  if (select setup_pending from schedule_state) or
     exists(select 1 from employees where id=b.employee_id and (not active or review_status='pending')) or
     exists(select 1 from machines where id=b.machine_id and (not active or review_status='pending')) or
     not exists(select 1 from orders where id=b.order_id and status='open') then
    raise exception '名冊或工作資料尚待確認，或工單已結案，不能回報';
  end if;
  if b.date>(at_time at time zone 'Asia/Taipei')::date then raise exception '不能提前回報未來日期的工作'; end if;
  select * into old from work_execution where block_id=p_block;
  if coalesce(old.revision,0)<>p_revision then raise exception '進度已被更新，請重新載入' using errcode='40001'; end if;
  if old.status='done' then raise exception '已完成的回報不可再修改'; end if;
  if p_qty>b.qty or p_qty<coalesce(old.qty_done,0) then raise exception '累計件數不可倒退或超過這段原定件數'; end if;
  if (p_action='start' and (old.block_id is not null or p_qty<>0)) or
     (p_action<>'start' and old.block_id is null) then raise exception '請先開始，再回報累計件數或完成'; end if;
  if p_action='start' then
    if exists(select 1 from work_execution x join schedule_blocks sb on sb.id=x.block_id
      where x.status='running' and sb.machine_id=b.machine_id) then raise exception '機台已有進行中的工作'; end if;
    if (select count(*) from work_execution where employee_id=b.employee_id and status='running')>=
      (select max_concurrent_machines from employees where id=b.employee_id) then raise exception '進行中的工作已達員工顧機上限'; end if;
  end if;
  insert into change_sets(id,kind,title,detail,version_before,version_after)
    values(cs,'edit','現場回報：'||p_action,jsonb_build_object('block',p_block,'qty_done',p_qty),ver,ver+1);
  perform set_config('app.change_set_id',cs::text,true);
  if old.block_id is null then update schedule_blocks set pinned=true where id=p_block; end if;
  insert into work_execution(block_id,employee_id,status,qty_done,started_at,finished_at,revision)
    values(p_block,b.employee_id,case when p_action='finish' then 'done' else 'running' end,p_qty,
      coalesce(old.started_at,at_time),case when p_action='finish' then at_time end,p_revision+1)
    on conflict(block_id) do update set status=excluded.status,qty_done=excluded.qty_done,
      finished_at=excluded.finished_at,revision=excluded.revision;
  update schedule_state set version=ver+1,updated_at=at_time,updated_by=auth.uid() where id;
  select jsonb_build_object('blockId',block_id,'employeeId',employee_id,'status',status,'qtyDone',qty_done,
    'startedAt',started_at,'finishedAt',finished_at,'revision',revision) into result from work_execution where block_id=p_block;
  result:=result||jsonb_build_object('version',ver+1);
  insert into work_execution_events(id,block_id,created_by,request,result) values(p_request,p_block,auth.uid(),req,result);
  return result;
end $$;
revoke all on function report_work_execution(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function report_work_execution(uuid,uuid,text,integer,integer) to authenticated;

create function _guard_work_execution() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from work_execution where block_id=old.id) and
    (TG_OP='DELETE' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception '已有現場回報的工作不能移動、改量、解除固定或刪除';
  end if;
  return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function _guard_work_execution() from public,anon,authenticated;
create trigger guard_work_execution before update or delete on schedule_blocks for each row execute function _guard_work_execution();

alter function schedule_snapshot(date,date) rename to _snapshot_before_execution;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90)
returns jsonb language sql stable security invoker set search_path=public as $$
  select _snapshot_before_execution(p_from,p_to)||jsonb_build_object('work_execution',
    (select coalesce(jsonb_agg(jsonb_build_object('blockId',x.block_id,'employeeId',x.employee_id,
      'status',x.status,'qtyDone',x.qty_done,'startedAt',x.started_at,'finishedAt',x.finished_at,'revision',x.revision)
      order by x.block_id),'[]') from work_execution x join schedule_blocks b on b.id=x.block_id join orders o on o.id=b.order_id where o.status='open'))
$$;
revoke all on function _snapshot_before_execution(date,date) from public,anon;
grant execute on function _snapshot_before_execution(date,date) to authenticated;
revoke all on function schedule_snapshot(date,date) from public,anon;
grant execute on function schedule_snapshot(date,date) to authenticated;
alter publication supabase_realtime add table work_execution;

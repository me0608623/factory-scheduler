-- Administrative import of reviewed provenance. Invoke after a verified full backup.
-- Session-local only; no new employee, skill, work order or schedule block is created.
create function pg_temp.import_legacy_groups(p_hash text,p_version bigint,p_groups jsonb,p_members jsonb)
returns jsonb language plpgsql as $$
declare v bigint; src legacy_schedule_archives%rowtype; g jsonb; m jsonb; eid uuid; matches int; cs uuid:=gen_random_uuid();
begin
  select version into v from schedule_state for update;
  lock table employees,staff_groups,staff_group_members in share row exclusive mode;
  if v is distinct from p_version then raise exception '版本已變，停止分組匯入'; end if;
  select * into strict src from legacy_schedule_archives where source_sha256=p_hash;
  if not (select setup_pending from schedule_state) or exists(select 1 from schedule_blocks)
    or exists(select 1 from orders where status='open') or (select count(*) from employees where active)<>30
    or (select count(*) from employees where active and source_ref like src.source_name||' · %')<>30
    or exists(select 1 from staff_groups) or exists(select 1 from staff_group_members) then
    raise exception '正式名冊或分組已變，不可覆寫或重複匯入'; end if;
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_typeof(p_members) is distinct from 'array'
    or jsonb_array_length(p_groups)<>7 or jsonb_array_length(p_members)<>29 then raise exception '來源分組數量錯誤'; end if;
  insert into change_sets(id,kind,title,summary,detail,version_before,version_after)
    values(cs,'import',src.source_name||' 來源員工分組','7組、29筆分組對照；4筆別名待核對；不推測技能',
      jsonb_build_object('source_archive',src.id),v,v+1);
  perform set_config('app.change_set_id',cs::text,true);
  for g in select value from jsonb_array_elements(p_groups) loop
    insert into staff_groups(id,name,home_factory,source_ref)
      values((g->>'id')::uuid,g->>'name',(g->>'home_factory')::smallint,src.source_name||' · '||(g->>'source_ref'));
  end loop;
  for m in select value from jsonb_array_elements(p_members) loop
    if coalesce(m->>'review_status','') not in ('source','pending') or nullif(trim(m->>'source_ref'),'') is null then raise exception '來源分組狀態或來源缺漏'; end if;
    if m->>'review_status'='pending' then
      select count(*) into matches from employees e where e.active and e.factory=(m->>'factory')::int and e.name=m->>'current_name'
        and exists(select 1 from jsonb_array_elements(e.identity_candidates) c where c->>'source_employee_code'=m->>'source_code' and c->>'status'='pending');
      select id into eid from employees e where e.active and e.factory=(m->>'factory')::int and e.name=m->>'current_name'
        and exists(select 1 from jsonb_array_elements(e.identity_candidates) c where c->>'source_employee_code'=m->>'source_code' and c->>'status'='pending');
    else
      select count(*) into matches from employees e where e.active and e.factory=(m->>'factory')::int
        and ((m->>'source_code' is not null and e.source_employee_code=m->>'source_code')
          or (m->>'source_code' is null and e.name=m->>'current_name' and e.source_ref=src.source_name||' · '||(m->>'source_ref')));
      select id into eid from employees e where e.active and e.factory=(m->>'factory')::int
        and ((m->>'source_code' is not null and e.source_employee_code=m->>'source_code')
          or (m->>'source_code' is null and e.name=m->>'current_name' and e.source_ref=src.source_name||' · '||(m->>'source_ref')));
    end if;
    if matches<>1 then raise exception '員工對照不唯一或已變，整次分組撤回'; end if;
    insert into staff_group_members(group_id,employee_id,review_status,source_ref)
      values((m->>'group_id')::uuid,eid,m->>'review_status',src.source_name||' · '||(m->>'source_ref'));
  end loop;
  if (select count(*) from staff_group_members where review_status='pending')<>4
    or (select count(distinct employee_id) from staff_group_members)<>29
    or (select count(*) from staff_group_members m join staff_groups g on g.id=m.group_id join employees e on e.id=m.employee_id where g.home_factory<>e.factory)<>0
    or (select count(*) from staff_groups where home_factory=1)<>4
    or (select count(*) from staff_groups where home_factory=2)<>3 then raise exception '來源分組結果不符，整次撤回'; end if;
  update schedule_state set version=v+1,updated_at=now();
  return jsonb_build_object('groups',7,'members',29,'pending',4,'version',v+1,'setup_pending',true);
end $$;
revoke all on function pg_temp.import_legacy_groups(text,bigint,jsonb,jsonb) from public;

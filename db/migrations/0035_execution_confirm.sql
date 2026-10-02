-- 確認完工的持久化：之前 confirmed 只存在瀏覽器記憶體，雲端模式重新整理後
-- 「已確認」會變回「待確認」，匯出給會計的完工量 CSV 確認欄也會不對。
alter table work_execution add column confirmed boolean not null default false;

create function confirm_work_execution(p_block uuid, p_confirmed boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r work_execution; ver bigint; cs uuid := gen_random_uuid();
begin
  if not has_permission('execution.manage') then
    raise exception '只有老闆或組長可以確認完工' using errcode = '42501';
  end if;
  select * into r from work_execution where block_id = p_block;
  if not found then raise exception '找不到這段工作的回報' using errcode = 'P0002'; end if;
  if p_confirmed and r.status <> 'done' then raise exception '這項工作還未報完工'; end if;
  select version into ver from schedule_state for update;
  insert into change_sets (id, kind, title, detail, version_before, version_after)
  values (cs, 'edit', case when p_confirmed then '確認完工' else '取消確認完工' end,
          jsonb_build_object('block', p_block, 'confirmed', p_confirmed), ver, ver + 1);
  perform set_config('app.change_set_id', cs::text, true);
  update work_execution set confirmed = p_confirmed where block_id = p_block;
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid() where id;
  return jsonb_build_object('blockId', p_block, 'confirmed', p_confirmed, 'version', ver + 1);
end $$;
revoke all on function confirm_work_execution(uuid, boolean) from public, anon;
grant execute on function confirm_work_execution(uuid, boolean) to authenticated;

alter function schedule_snapshot(date, date) rename to _snapshot_before_confirm;
create function schedule_snapshot(p_from date default current_date - 7, p_to date default current_date + 90)
returns jsonb language sql stable security invoker set search_path = public as $$
  select _snapshot_before_confirm(p_from, p_to) || jsonb_build_object('work_execution',
    (select coalesce(jsonb_agg(jsonb_build_object('blockId', x.block_id, 'employeeId', x.employee_id,
      'status', x.status, 'qtyDone', x.qty_done, 'startedAt', x.started_at, 'finishedAt', x.finished_at,
      'revision', x.revision, 'confirmed', x.confirmed)
      order by x.block_id), '[]')
     from work_execution x
     join schedule_blocks b on b.id = x.block_id
     join orders o on o.id = b.order_id
     where o.status = 'open'))
$$;
revoke all on function _snapshot_before_confirm(date, date), schedule_snapshot(date, date) from public, anon;
grant execute on function _snapshot_before_confirm(date, date), schedule_snapshot(date, date) to authenticated;

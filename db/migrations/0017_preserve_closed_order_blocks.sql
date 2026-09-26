-- 快照及完整替換只涵蓋未結案工單；結案歷史永久留在 schedule_blocks。
-- 既有函式把近 97 天的結案方塊混入快照，卻在 _apply_blocks 刪除全表未列出的方塊。
create or replace function schedule_snapshot(p_from date default current_date - 7, p_to date default current_date + 90)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'version', (select version from schedule_state),
    'calendar', jsonb_build_object(
      'week',      (select jsonb_agg(is_open order by weekday) from calendar_weekly),
      'overrides', (select coalesce(jsonb_object_agg(date::text, is_open), '{}') from calendar_days where is_open is not null and date between p_from and p_to),
      'overtime',  (select coalesce(jsonb_object_agg(date::text, true), '{}') from calendar_days where overtime and date between p_from and p_to),
      'holidays',  (select coalesce(jsonb_object_agg(date::text, name), '{}') from holidays where date between p_from and p_to),
      'windows',   (select jsonb_agg(jsonb_build_object('start', start_min, 'end', end_min, 'overtime', is_overtime) order by start_min) from work_windows)),
    'employees', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'factory', e.factory, 'color', e.color, 'no_overtime', e.no_overtime,
        'max_concurrent_machines', e.max_concurrent_machines,
        'overtime_weekdays', e.overtime_weekdays,
        'overtime_overrides', (select coalesce(jsonb_object_agg(d.date::text, d.available), '{}')
          from employee_overtime_days d where d.employee_id = e.id and d.date between p_from and p_to),
        'skills', (select coalesce(jsonb_agg(s.machine_id), '[]') from employee_skills s where s.employee_id = e.id),
        'leaves', (select coalesce(jsonb_agg(l.date::text), '[]') from leaves l where l.employee_id = e.id and l.date between p_from and p_to))
        order by e.name), '[]') from employees e where e.active),
    'machines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'label', m.label, 'factory', m.factory, 'process', m.process,
        'products', (select coalesce(jsonb_agg(mp.product_id), '[]') from machine_products mp where mp.machine_id = m.id),
        'faults', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'date', f.date::text, 'start', f.start_min, 'end', f.end_min, 'note', f.note,
            'fixed', f.fixed_at is not null, 'fixed_at', f.fixed_at, 'original_blocks', f.original_blocks) order by f.date, f.start_min), '[]')
          from machine_faults f where f.machine_id = m.id and f.date between p_from and p_to))
        order by m.id), '[]') from machines m where m.active),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name,
        'steps', (select coalesce(jsonb_agg(jsonb_build_object('process', s.process, 'factory', s.factory, 'rate', s.rate, 'batch', s.transfer_batch) order by s.seq), '[]')
                  from product_steps s where s.product_id = p.id))), '[]') from products p where p.active),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'code', o.code, 'product', o.product_id, 'qty', o.qty, 'due', o.due_date::text, 'priority', o.priority)
        order by o.due_date, o.priority), '[]') from orders o where o.status = 'open'),
    'blocks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'order', b.order_id, 'step', b.step_seq, 'machine', b.machine_id, 'employee', b.employee_id,
        'date', b.date::text, 'start', b.start_min, 'end', b.end_min, 'qty', b.qty, 'pinned', b.pinned)
        order by b.date, b.start_min), '[]')
      from schedule_blocks b join orders o on o.id = b.order_id
      where o.status = 'open')
  )
$$;

create or replace function _apply_blocks(p_blocks jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- 舊預覽或手動請求若攜帶已結案方塊，拒絕而非修改／重用其 ID。
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as n(id uuid, order_id uuid)
      left join orders target on target.id = n.order_id
      left join schedule_blocks old on old.id = n.id
      left join orders previous on previous.id = old.order_id
     where target.status is distinct from 'open'
        or (previous.id is not null and previous.status <> 'open')
  ) then
    raise exception '完整排程只能修改未結案工單；請重新載入最新排程';
  end if;

  with n as (select * from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(id uuid))
  delete from schedule_blocks sb using orders o
   where sb.order_id = o.id and o.status = 'open'
     and not exists (select 1 from n where n.id = sb.id);

  with n as (
    select * from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
      id uuid, order_id uuid, step_seq smallint, machine_id text, employee_id uuid,
      date date, start_min smallint, end_min smallint, qty integer, pinned boolean))
  update schedule_blocks sb
     set order_id = n.order_id, step_seq = n.step_seq, machine_id = n.machine_id, employee_id = n.employee_id,
         date = n.date, start_min = n.start_min, end_min = n.end_min, qty = n.qty, pinned = coalesce(n.pinned, false)
    from n
   where n.id = sb.id
     and (sb.order_id, sb.step_seq, sb.machine_id, sb.employee_id, sb.date, sb.start_min, sb.end_min, sb.qty, sb.pinned)
         is distinct from
         (n.order_id, n.step_seq, n.machine_id, n.employee_id, n.date, n.start_min, n.end_min, n.qty, coalesce(n.pinned, false));

  with n as (
    select * from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
      id uuid, order_id uuid, step_seq smallint, machine_id text, employee_id uuid,
      date date, start_min smallint, end_min smallint, qty integer, pinned boolean))
  insert into schedule_blocks (id, order_id, step_seq, machine_id, employee_id, date, start_min, end_min, qty, pinned)
  select coalesce(n.id, gen_random_uuid()), n.order_id, n.step_seq, n.machine_id, n.employee_id,
         n.date, n.start_min, n.end_min, n.qty, coalesce(n.pinned, false)
    from n
   where n.id is null or not exists (select 1 from schedule_blocks sb where sb.id = n.id);
end $$;

-- 差異偵測也只看未結案方塊，避免累積多年的結案歷史被當成「本次刪除」。
create or replace function save_blocks(p_base_version bigint, p_blocks jsonb, p_title text,
                            p_detail jsonb default '{}', p_kind text default 'move')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ver bigint;
  cs uuid := gen_random_uuid();
  changed_orders uuid[];
begin
  if not is_editor() then
    raise exception '只有老闆或組長可以調整排程' using errcode = '42501';
  end if;
  select version into ver from schedule_state for update;
  if ver <> p_base_version then
    raise exception '排程剛被其他人更新，請重新整理後再調整' using errcode = '40001';
  end if;
  with incoming as (
    select * from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
      id uuid, order_id uuid, step_seq smallint, machine_id text, employee_id uuid,
      date date, start_min smallint, end_min smallint, qty integer, pinned boolean)
  ), changed as (
    select n.order_id as new_order, old.order_id as old_order
      from incoming n full join (
        select sb.* from schedule_blocks sb join orders o on o.id = sb.order_id where o.status = 'open'
      ) old on old.id = n.id
     where n.id is null or old.id is null
        or (old.order_id, old.step_seq, old.machine_id, old.employee_id,
            old.date, old.start_min, old.end_min, old.qty, old.pinned)
           is distinct from
           (n.order_id, n.step_seq, n.machine_id, n.employee_id,
            n.date, n.start_min, n.end_min, n.qty, coalesce(n.pinned, false))
  )
  select array_agg(distinct order_id) into changed_orders
    from (select new_order as order_id from changed where new_order is not null
          union select old_order from changed where old_order is not null) x;
  if changed_orders is not null then
    perform _assert_manual_quantity(p_blocks, changed_orders);
    perform _assert_manual_material_flow(p_blocks, changed_orders);
    perform _assert_manual_assignments(p_blocks, changed_orders);
    perform _assert_manual_calendar(p_blocks, changed_orders);
    perform _assert_manual_absences(p_blocks, changed_orders);
    perform _assert_manual_resources(p_blocks, changed_orders);
  end if;
  perform set_config('app.change_set_id', cs::text, true);
  insert into change_sets (id, kind, title, summary, detail, version_before, version_after)
  values (cs, p_kind, p_title, p_detail ->> 'summary', p_detail, ver, ver + 1);
  perform _apply_blocks(p_blocks);
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid();
  return cs;
end $$;

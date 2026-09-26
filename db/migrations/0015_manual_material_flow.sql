-- 手動排程 RPC 也檢查跨工序物料交接，避免繞過瀏覽器預覽直接寫入。
-- 方塊中的件數按其起訖時間線性累積；與排程服務驗證器使用相同的半件容差。
create function _assert_manual_material_flow(p_blocks jsonb, p_order_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_order uuid;
  bad_step smallint;
begin
  with b as (
    select x.order_id, x.step_seq, x.qty,
           ((x.date - date '2000-01-01') * 1440 + x.start_min)::numeric as start_at,
           ((x.date - date '2000-01-01') * 1440 + x.end_min)::numeric as end_at
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, step_seq smallint, date date, start_min smallint, end_min smallint, qty integer)
     where p_order_ids is null or x.order_id = any(p_order_ids)
  ), starts as (
    select c.order_id, c.step_seq,
           case when ps.transfer_batch > 0 and ps.transfer_batch < o.qty
                then ps.transfer_batch else o.qty end as required,
           coalesce((select sum(p.qty * greatest(0, least(1,
             (c.start_at - p.start_at) / nullif(p.end_at - p.start_at, 0))))
             from b p where p.order_id = c.order_id and p.step_seq = c.step_seq - 1), 0) as available
      from b c
      join orders o on o.id = c.order_id
      join product_steps ps on ps.product_id = o.product_id and ps.seq = c.step_seq
     where c.step_seq > 0
  )
  select order_id, step_seq into bad_order, bad_step
    from starts where available + 0.00000001 < required limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：前站尚未完成交接批量', bad_order, bad_step;
  end if;

  with b as (
    select x.order_id, x.step_seq, x.qty,
           ((x.date - date '2000-01-01') * 1440 + x.start_min)::numeric as start_at,
           ((x.date - date '2000-01-01') * 1440 + x.end_min)::numeric as end_at
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, step_seq smallint, date date, start_min smallint, end_min smallint, qty integer)
     where p_order_ids is null or x.order_id = any(p_order_ids)
  ), steps as (
    select distinct order_id, step_seq from b where step_seq > 0
  ), points as (
    select distinct s.order_id, s.step_seq, b.start_at as at_min
      from steps s join b on b.order_id = s.order_id and b.step_seq in (s.step_seq, s.step_seq - 1)
    union
    select distinct s.order_id, s.step_seq, b.end_at as at_min
      from steps s join b on b.order_id = s.order_id and b.step_seq in (s.step_seq, s.step_seq - 1)
  ), totals as (
    select p.order_id, p.step_seq,
           coalesce((select sum(c.qty * greatest(0, least(1,
             (p.at_min - c.start_at) / nullif(c.end_at - c.start_at, 0))))
             from b c where c.order_id = p.order_id and c.step_seq = p.step_seq), 0) as used,
           coalesce((select sum(c.qty * greatest(0, least(1,
             (p.at_min - c.start_at) / nullif(c.end_at - c.start_at, 0))))
             from b c where c.order_id = p.order_id and c.step_seq = p.step_seq - 1), 0) as made
      from points p
  )
  select order_id, step_seq into bad_order, bad_step
    from totals where used > made + 0.5 limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：後站累積產量超過前站已完成件數', bad_order, bad_step;
  end if;
end $$;

-- 手動安排可以只做部分數量，但每站合計不得超過工單數量，單段也不得超出標準產能。
create function _assert_manual_quantity(p_blocks jsonb, p_order_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_order uuid;
  bad_step smallint;
begin
  with b as (
    select x.order_id, x.step_seq, x.qty, x.end_min - x.start_min as minutes
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, step_seq smallint, start_min smallint, end_min smallint, qty integer)
     where x.order_id = any(p_order_ids)
  )
  select b.order_id, b.step_seq into bad_order, bad_step
    from b join orders o on o.id = b.order_id
           join product_steps ps on ps.product_id = o.product_id and ps.seq = b.step_seq
   where b.qty > floor(b.minutes * ps.rate + 0.00000001)
   limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：宣稱件數超過工序速率可完成的數量', bad_order, bad_step;
  end if;

  with b as (
    select x.order_id, x.step_seq, x.qty
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, step_seq smallint, qty integer)
     where x.order_id = any(p_order_ids)
  )
  select b.order_id, b.step_seq into bad_order, bad_step
    from b join orders o on o.id = b.order_id
   group by b.order_id, b.step_seq, o.qty
  having sum(b.qty) > o.qty
   limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：已排件數超過工單件數', bad_order, bad_step;
  end if;
end $$;

-- 拖曳與手動新增不只要避開時間衝突；被改動工單的人、機、產品工序和廠別也需相容。
create function _assert_manual_assignments(p_blocks jsonb, p_order_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_order uuid;
  bad_step smallint;
  bad_machine text;
  bad_employee uuid;
begin
  with b as (
    select x.order_id, x.step_seq, x.machine_id, x.employee_id
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, step_seq smallint, machine_id text, employee_id uuid)
     where x.order_id = any(p_order_ids)
  )
  select b.order_id, b.step_seq, b.machine_id
    into bad_order, bad_step, bad_machine
    from b join orders o on o.id = b.order_id
    left join product_steps ps on ps.product_id = o.product_id and ps.seq = b.step_seq
    left join machines m on m.id = b.machine_id
    left join machine_products mp on mp.machine_id = b.machine_id and mp.product_id = o.product_id
   where ps.product_id is null or m.active is not true
      or m.process is distinct from ps.process or m.factory is distinct from ps.factory
      or mp.machine_id is null
   limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：機台 % 不符合產品工序、廠別或可加工產品', bad_order, bad_step, bad_machine;
  end if;

  with b as (
    select x.order_id, x.machine_id, x.employee_id
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, machine_id text, employee_id uuid)
     where x.order_id = any(p_order_ids) and x.employee_id is not null
  )
  select b.employee_id, b.machine_id into bad_employee, bad_machine
    from b join machines m on m.id = b.machine_id
    left join employees e on e.id = b.employee_id
    left join employee_skills es on es.employee_id = b.employee_id and es.machine_id = b.machine_id
   where e.active is not true or e.factory is distinct from m.factory or es.employee_id is null
   limit 1;
  if found then
    raise exception '員工 % 不會操作機台 % 或所屬廠別不符', bad_employee, bad_machine;
  end if;
end $$;

-- 新增／移動的工單不可占用請假或故障分鐘；已有的部分時段也需逐段檢查。
create function _assert_manual_absences(p_blocks jsonb, p_order_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_employee uuid;
  bad_machine text;
  bad_date date;
begin
  with b as (
    select x.order_id, x.employee_id, x.date as work_date, x.start_min, x.end_min
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, employee_id uuid, date date, start_min smallint, end_min smallint)
     where x.order_id = any(p_order_ids) and x.employee_id is not null
  )
  select b.employee_id, b.work_date into bad_employee, bad_date
    from b join leaves l on l.employee_id = b.employee_id and l.date = b.work_date
   where coalesce(l.start_min, 0) < b.end_min and coalesce(l.end_min, 1440) > b.start_min
   limit 1;
  if found then
    raise exception '員工 % 在 % 的請假時段不能排工作', bad_employee, bad_date;
  end if;

  with b as (
    select x.order_id, x.machine_id, x.date as work_date, x.start_min, x.end_min
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, machine_id text, date date, start_min smallint, end_min smallint)
     where x.order_id = any(p_order_ids)
  )
  select b.machine_id, b.work_date into bad_machine, bad_date
    from b join machine_faults f on f.machine_id = b.machine_id and f.date = b.work_date
   where f.start_min < b.end_min and f.end_min > b.start_min
   limit 1;
  if found then
    raise exception '機台 % 在 % 的機台故障時段不能排工作', bad_machine, bad_date;
  end if;
end $$;

-- 只檢查此次異動工單涉及的資源，但與完整新排程的所有方塊比較。
create function _assert_manual_resources(p_blocks jsonb, p_order_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_machine text;
  bad_employee uuid;
begin
  with b as (
    select x.position, (x.value ->> 'order_id')::uuid as order_id,
           x.value ->> 'machine_id' as machine_id,
           (x.value ->> 'employee_id')::uuid as employee_id,
           (x.value ->> 'date')::date as work_date,
           (x.value ->> 'start_min')::integer as start_min,
           (x.value ->> 'end_min')::integer as end_min
      from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) with ordinality as x(value, position)
  )
  select a.machine_id into bad_machine
    from b a join b other on other.position <> a.position
     and other.machine_id = a.machine_id and other.work_date = a.work_date
     and other.start_min < a.end_min and other.end_min > a.start_min
   where a.order_id = any(p_order_ids) limit 1;
  if found then
    raise exception '機台 % 同一時段有重疊工作', bad_machine;
  end if;

  with b as (
    select (x.value ->> 'order_id')::uuid as order_id,
           x.value ->> 'machine_id' as machine_id,
           (x.value ->> 'employee_id')::uuid as employee_id,
           (x.value ->> 'date')::date as work_date,
           (x.value ->> 'start_min')::integer as start_min,
           (x.value ->> 'end_min')::integer as end_min
      from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as x(value)
  ), touched as (
    select distinct employee_id from b
     where order_id = any(p_order_ids) and employee_id is not null
  ), starts as (
    select distinct b.employee_id, b.work_date, b.start_min as minute
      from b join touched using (employee_id)
  )
  select s.employee_id into bad_employee
    from starts s
    join b work on work.employee_id = s.employee_id and work.work_date = s.work_date
               and work.start_min <= s.minute and work.end_min > s.minute
    join employees e on e.id = s.employee_id
   group by s.employee_id, s.work_date, s.minute, e.max_concurrent_machines
  having count(distinct work.machine_id) > e.max_concurrent_machines
   limit 1;
  if found then
    raise exception '員工 % 同時顧機台數超過上限', bad_employee;
  end if;
end $$;

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
      from incoming n full join schedule_blocks old on old.id = n.id
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

revoke all on function _assert_manual_material_flow(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function _assert_manual_quantity(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function _assert_manual_assignments(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function _assert_manual_absences(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function _assert_manual_resources(jsonb, uuid[]) from public, anon, authenticated;

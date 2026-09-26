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
    perform _assert_manual_material_flow(p_blocks, changed_orders);
  end if;
  perform set_config('app.change_set_id', cs::text, true);
  insert into change_sets (id, kind, title, summary, detail, version_before, version_after)
  values (cs, p_kind, p_title, p_detail ->> 'summary', p_detail, ver, ver + 1);
  perform _apply_blocks(p_blocks);
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid();
  return cs;
end $$;

revoke all on function _assert_manual_material_flow(jsonb, uuid[]) from public, anon, authenticated;

-- 報工完成後，正式排程與跨站物料檢核都以實際完成件數為準。
-- 原工作方塊保留原定件數供計畫／實績比較；短少量由新的補排方塊補足。

create or replace function _assert_manual_quantity(p_blocks jsonb, p_order_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_order uuid;
  bad_step smallint;
begin
  with b as (
    select x.order_id, x.step_seq, x.qty, x.end_min - x.start_min as minutes
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        id uuid, order_id uuid, step_seq smallint, start_min smallint, end_min smallint, qty integer)
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
    select x.order_id, x.step_seq,
           case when we.status = 'done' then we.qty_done else x.qty end as qty
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        id uuid, order_id uuid, step_seq smallint, qty integer)
      left join work_execution we on we.block_id = x.id
     where x.order_id = any(p_order_ids)
  )
  select b.order_id, b.step_seq into bad_order, bad_step
    from b join orders o on o.id = b.order_id
   group by b.order_id, b.step_seq, o.qty
  having sum(b.qty) > o.qty
   limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：實際完成加待做件數超過工單件數', bad_order, bad_step;
  end if;
end $$;

create or replace function _assert_manual_material_flow(p_blocks jsonb, p_order_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_order uuid;
  bad_step smallint;
begin
  with b as (
    select x.order_id, x.step_seq,
           (case when we.status = 'done' then we.qty_done else x.qty end)::numeric as qty,
           ((x.date - date '2000-01-01') * 1440 + x.start_min)::numeric as start_at,
           ((x.date - date '2000-01-01') * 1440 + x.end_min)::numeric as end_at
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        id uuid, order_id uuid, step_seq smallint, date date, start_min smallint, end_min smallint, qty integer)
      left join work_execution we on we.block_id = x.id
     where p_order_ids is null or x.order_id = any(p_order_ids)
  ), starts as (
    select c.order_id, c.step_seq,
           case when ps.transfer_batch > 0 and ps.transfer_batch < o.qty
                then ps.transfer_batch else o.qty end as required,
           coalesce(sum(p.qty * greatest(0, least(1,
             (c.start_at - p.start_at) / nullif(p.end_at - p.start_at, 0)))), 0) as available
      from b c
      join orders o on o.id = c.order_id
      join product_steps ps on ps.product_id = o.product_id and ps.seq = c.step_seq
      left join b p on p.order_id = c.order_id and p.step_seq = c.step_seq - 1
     where c.step_seq > 0
     group by c.order_id, c.step_seq, c.start_at, c.end_at, c.qty,
              ps.transfer_batch, o.qty
  )
  select order_id, step_seq into bad_order, bad_step
    from starts where available + 0.00000001 < required limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：前站實際完成量尚未達交接批量', bad_order, bad_step;
  end if;

  with b as (
    select x.order_id, x.step_seq,
           (case when we.status = 'done' then we.qty_done else x.qty end)::numeric as qty,
           ((x.date - date '2000-01-01') * 1440 + x.start_min)::numeric as start_at,
           ((x.date - date '2000-01-01') * 1440 + x.end_min)::numeric as end_at
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        id uuid, order_id uuid, step_seq smallint, date date, start_min smallint, end_min smallint, qty integer)
      left join work_execution we on we.block_id = x.id
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
           coalesce(sum(case when c.step_seq = p.step_seq then
             c.qty * greatest(0, least(1, (p.at_min - c.start_at) / nullif(c.end_at - c.start_at, 0))) else 0 end), 0) as used,
           coalesce(sum(case when c.step_seq = p.step_seq - 1 then
             c.qty * greatest(0, least(1, (p.at_min - c.start_at) / nullif(c.end_at - c.start_at, 0))) else 0 end), 0) as made
      from points p
      left join b c on c.order_id = p.order_id and c.step_seq in (p.step_seq, p.step_seq - 1)
     group by p.order_id, p.step_seq, p.at_min
  )
  select order_id, step_seq into bad_order, bad_step
    from totals where used > made + 0.5 limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：後站累積產量超過前站實際完成件數', bad_order, bad_step;
  end if;
end $$;

create or replace function _assert_plan_complete(p_blocks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  bad_order uuid;
  bad_step smallint;
  planned integer;
  required integer;
begin
  select o.id into bad_order from orders o
   where o.status = 'open' and not exists (
     select 1 from product_steps ps where ps.product_id = o.product_id)
   limit 1;
  if found then
    raise exception '工單 % 的產品沒有工序，請先建立產品工序再計算方案', bad_order;
  end if;

  with b as (
    select x.order_id, x.step_seq,
           sum(case when we.status = 'done' then we.qty_done else x.qty end)::integer as qty
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        id uuid, order_id uuid, step_seq smallint, qty integer)
      left join work_execution we on we.block_id = x.id
     group by x.order_id, x.step_seq
  )
  select o.id, ps.seq, coalesce(b.qty, 0), o.qty
    into bad_order, bad_step, planned, required
    from orders o join product_steps ps on ps.product_id = o.product_id
    left join b on b.order_id = o.id and b.step_seq = ps.seq
   where o.status = 'open' and coalesce(b.qty, 0) <> o.qty
   limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：實際完成加待做數量 % 不等於目前工單 % 件，請重新計算',
      bad_order, bad_step, planned, required;
  end if;
end $$;

revoke all on function _assert_manual_quantity(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function _assert_manual_material_flow(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function _assert_plan_complete(jsonb) from public, anon, authenticated;

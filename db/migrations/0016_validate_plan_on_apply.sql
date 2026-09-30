-- 預覽後若技能、機台、請假或行事曆被改，版本號未必變動；套用前須在同一交易重驗。
create function _assert_plan_complete(p_blocks jsonb) returns void
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
    select x.order_id, x.step_seq, sum(x.qty)::integer as qty
      from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as x(
        order_id uuid, step_seq smallint, qty integer)
     group by x.order_id, x.step_seq
  )
  select o.id, ps.seq, coalesce(b.qty, 0), o.qty
    into bad_order, bad_step, planned, required
    from orders o join product_steps ps on ps.product_id = o.product_id
    left join b on b.order_id = o.id and b.step_seq = ps.seq
   where o.status = 'open' and coalesce(b.qty, 0) <> o.qty
   limit 1;
  if found then
    raise exception '工單 % 第 % 道工序：方案數量 % 不等於目前工單 % 件，請重新計算',
      bad_order, bad_step, planned, required;
  end if;
end $$;

create or replace function apply_plan(p_preview uuid, p_option text, p_note text default null, p_ai jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pv plan_previews;
  opt jsonb;
  ver bigint;
  cs uuid := gen_random_uuid();
  touched_orders uuid[];
begin
  if not is_editor() then
    raise exception '只有老闆或組長可以套用方案' using errcode = '42501';
  end if;
  select * into pv from plan_previews where id = p_preview for update;
  if not found then
    raise exception '找不到這個方案' using errcode = 'P0002';
  end if;
  if pv.applied_option is not null then
    raise exception '這個方案已經套用過了';
  end if;
  if pv.expires_at < now() then
    raise exception '方案已過期，請重新計算';
  end if;
  select version into ver from schedule_state for update;
  if ver <> pv.base_version then
    raise exception '排程剛被其他人更新，請重新計算方案' using errcode = '40001';
  end if;
  select o into opt from jsonb_array_elements(pv.options) as o where o ->> 'id' = p_option;
  if opt is null then
    raise exception '沒有這個方案' using errcode = 'P0002';
  end if;
  if opt ->> 'applicable' = 'false' then
    raise exception '這個方案尚未排完或計算超時，不能套用；請查看原因與建議後重新計算';
  end if;

  perform set_config('app.change_set_id', cs::text, true);
  insert into change_sets (id, kind, title, summary, detail, ai, note, preview_id, option_id, version_before, version_after)
  values (cs, pv.kind, pv.title || '：採用「' || (opt ->> 'name') || '」', opt ->> 'summary',
          jsonb_build_object(
            'lines', opt -> 'lines', 'shifts', opt -> 'shifts', 'people', opt -> 'people',
            'alts', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'name', o ->> 'name', 'metrics', o -> 'metrics'))
                       from jsonb_array_elements(pv.options) o)),
          p_ai, p_note, pv.id, p_option, ver, ver + 1);
  perform _apply_effects(coalesce(opt -> 'effects', '{}'));

  select array_agg(distinct x.order_id) into touched_orders
    from jsonb_to_recordset(coalesce(opt -> 'blocks', '[]'::jsonb)) as x(order_id uuid);
  -- 正式求解服務會明確標記 applicable=true；舊版沒有此欄的預覽仍沿用既有行為。
  if opt ->> 'applicable' = 'true' then
    perform _assert_plan_complete(opt -> 'blocks');
  end if;
  if touched_orders is not null then
    perform _assert_manual_quantity(opt -> 'blocks', touched_orders);
    perform _assert_manual_material_flow(opt -> 'blocks', touched_orders);
    perform _assert_manual_assignments(opt -> 'blocks', touched_orders);
    perform _assert_manual_calendar(opt -> 'blocks', touched_orders);
    perform _assert_manual_absences(opt -> 'blocks', touched_orders);
    perform _assert_manual_resources(opt -> 'blocks', touched_orders);
  end if;

  perform _apply_blocks(coalesce(opt -> 'blocks', '[]'));
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid() where id;
  update plan_previews set applied_option = p_option where id = p_preview;
  return cs;
end $$;

revoke all on function _assert_plan_complete(jsonb) from public, anon, authenticated;

-- 資料庫函式：讀取排程快照、套用方案、儲存手動調整
-- 套用都在單一交易內完成，並用 schedule_state.version 擋掉「兩個人同時改」

-- ---------- 一次讀出排程服務與畫面需要的全部資料 ----------
-- 欄位名稱和排程服務（solver/app/schemas.py）的 Snapshot 一致
create function schedule_snapshot(p_from date default current_date - 7, p_to date default current_date + 90)
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
        'id', e.id, 'name', e.name, 'color', e.color, 'no_overtime', e.no_overtime,
        'skills', (select coalesce(jsonb_agg(s.machine_id), '[]') from employee_skills s where s.employee_id = e.id),
        'leaves', (select coalesce(jsonb_agg(l.date::text), '[]') from leaves l where l.employee_id = e.id and l.date between p_from and p_to))
        order by e.name), '[]') from employees e where e.active),
    'machines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'label', m.label, 'process', m.process,
        'products', (select coalesce(jsonb_agg(mp.product_id), '[]') from machine_products mp where mp.machine_id = m.id),
        'faults', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', f.id, 'date', f.date::text, 'start', f.start_min, 'end', f.end_min, 'note', f.note,
            'fixed', f.fixed_at is not null, 'fixed_at', f.fixed_at, 'original_blocks', f.original_blocks) order by f.date, f.start_min), '[]')
          from machine_faults f where f.machine_id = m.id and f.date between p_from and p_to))
        order by m.id), '[]') from machines m where m.active),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name,
        'steps', (select coalesce(jsonb_agg(jsonb_build_object('process', s.process, 'rate', s.rate, 'batch', s.transfer_batch) order by s.seq), '[]')
                  from product_steps s where s.product_id = p.id))), '[]') from products p where p.active),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'code', o.code, 'product', o.product_id, 'qty', o.qty, 'due', o.due_date::text, 'priority', o.priority)
        order by o.due_date, o.priority), '[]') from orders o where o.status = 'open'),
    'blocks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'order', b.order_id, 'step', b.step_seq, 'machine', b.machine_id, 'employee', b.employee_id,
        'date', b.date::text, 'start', b.start_min, 'end', b.end_min, 'qty', b.qty, 'pinned', b.pinned)
        order by b.date, b.start_min), '[]')
      from schedule_blocks b join orders o on o.id = b.order_id
      where o.status = 'open' or b.date between p_from and p_to)
  )
$$;

-- ---------- 內部：把完整的排程換上去（只動真的有變的列，稽核紀錄才乾淨） ----------
-- p_blocks 是「完整的新排程」：沿用的方塊帶 id，新的方塊不帶 id
create function _apply_blocks(p_blocks jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  with n as (select * from jsonb_to_recordset(p_blocks) as x(id uuid))
  delete from schedule_blocks sb where not exists (select 1 from n where n.id = sb.id);

  with n as (
    select * from jsonb_to_recordset(p_blocks) as x(
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
    select * from jsonb_to_recordset(p_blocks) as x(
      id uuid, order_id uuid, step_seq smallint, machine_id text, employee_id uuid,
      date date, start_min smallint, end_min smallint, qty integer, pinned boolean))
  insert into schedule_blocks (id, order_id, step_seq, machine_id, employee_id, date, start_min, end_min, qty, pinned)
  select coalesce(n.id, gen_random_uuid()), n.order_id, n.step_seq, n.machine_id, n.employee_id,
         n.date, n.start_min, n.end_min, n.qty, coalesce(n.pinned, false)
    from n
   where n.id is null or not exists (select 1 from schedule_blocks sb where sb.id = n.id);
end $$;

-- ---------- 內部：套用方案附帶的變更（新增故障、請假、加班日、工單） ----------
create function _apply_effects(e jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into orders (id, code, product_id, qty, due_date, priority, note)
  select coalesce(x.id, gen_random_uuid()), x.code, x.product_id, x.qty, x.due_date, coalesce(x.priority, 2), x.note
    from jsonb_to_recordset(coalesce(e -> 'orders_upsert', '[]')) as x(
      id uuid, code text, product_id uuid, qty integer, due_date date, priority smallint, note text)
  on conflict (id) do update
    set code = excluded.code, product_id = excluded.product_id, qty = excluded.qty,
        due_date = excluded.due_date, priority = excluded.priority, note = excluded.note;

  insert into machine_faults (id, machine_id, date, start_min, end_min, note, original_blocks)
  select coalesce(x.id, gen_random_uuid()), x.machine_id, x.date, x.start_min, x.end_min, x.note, coalesce(x.original_blocks, '[]')
    from jsonb_to_recordset(coalesce(e -> 'faults_insert', '[]')) as x(
      id uuid, machine_id text, date date, start_min smallint, end_min smallint, note text, original_blocks jsonb);

  update machine_faults f
     set end_min = coalesce(x.end_min, f.end_min),
         fixed_at = coalesce(x.fixed_at, f.fixed_at),
         original_blocks = coalesce(x.original_blocks, f.original_blocks)
    from jsonb_to_recordset(coalesce(e -> 'faults_update', '[]')) as x(
      id uuid, end_min smallint, fixed_at timestamptz, original_blocks jsonb)
   where f.id = x.id;

  delete from machine_faults
   where id in (select (v #>> '{}')::uuid from jsonb_array_elements(coalesce(e -> 'faults_delete', '[]')) v);

  insert into leaves (employee_id, date, start_min, end_min, note)
  select x.employee_id, x.date, x.start_min, x.end_min, x.note
    from jsonb_to_recordset(coalesce(e -> 'leaves_insert', '[]')) as x(
      employee_id uuid, date date, start_min smallint, end_min smallint, note text)
  on conflict (employee_id, date) do nothing;

  insert into calendar_days (date, overtime)
  select (v #>> '{}')::date, true from jsonb_array_elements(coalesce(e -> 'overtime_on', '[]')) v
  on conflict (date) do update set overtime = true;
end $$;

-- ---------- 套用排程服務算好的方案 ----------
create function apply_plan(p_preview uuid, p_option text, p_note text default null, p_ai jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pv  plan_previews;
  opt jsonb;
  ver bigint;
  cs  uuid := gen_random_uuid();
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

  perform set_config('app.change_set_id', cs::text, true);
  insert into change_sets (id, kind, title, summary, detail, ai, note, preview_id, option_id, version_before, version_after)
  values (cs, pv.kind, pv.title || '：採用「' || (opt ->> 'name') || '」', opt ->> 'summary',
          jsonb_build_object(
            'lines', opt -> 'lines', 'shifts', opt -> 'shifts', 'people', opt -> 'people',
            'alts', (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'name', o ->> 'name', 'metrics', o -> 'metrics'))
                       from jsonb_array_elements(pv.options) o)),
          p_ai, p_note, pv.id, p_option, ver, ver + 1);
  perform _apply_effects(coalesce(opt -> 'effects', '{}'));
  perform _apply_blocks(coalesce(opt -> 'blocks', '[]'));
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid();
  update plan_previews set applied_option = p_option where id = p_preview;
  return cs;
end $$;

-- ---------- 儲存手動調整（拖曳、換人、改時間） ----------
create function save_blocks(p_base_version bigint, p_blocks jsonb, p_title text,
                            p_detail jsonb default '{}', p_kind text default 'move')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ver bigint;
  cs  uuid := gen_random_uuid();
begin
  if not is_editor() then
    raise exception '只有老闆或組長可以調整排程' using errcode = '42501';
  end if;
  select version into ver from schedule_state for update;
  if ver <> p_base_version then
    raise exception '排程剛被其他人更新，請重新整理後再調整' using errcode = '40001';
  end if;
  perform set_config('app.change_set_id', cs::text, true);
  insert into change_sets (id, kind, title, summary, detail, version_before, version_after)
  values (cs, p_kind, p_title, p_detail ->> 'summary', p_detail, ver, ver + 1);
  perform _apply_blocks(p_blocks);
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid();
  return cs;
end $$;

-- 內部函式不給前端直接呼叫
revoke all on function _apply_blocks(jsonb) from public, anon, authenticated;
revoke all on function _apply_effects(jsonb) from public, anon, authenticated;

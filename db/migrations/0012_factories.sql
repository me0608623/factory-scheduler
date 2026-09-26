-- 資源歸屬各廠；工單共用，產品每站決定加工廠別。
-- 舊資料預設為 1 廠，不搬動既有排程。
alter table employees add column factory smallint not null default 1 check (factory in (1, 2));
alter table machines add column factory smallint not null default 1 check (factory in (1, 2));
alter table product_steps add column factory smallint not null default 1 check (factory in (1, 2));

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
      where o.status = 'open' or b.date between p_from and p_to)
  )
$$;

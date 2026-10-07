-- 廠區平面圖佈局：機台在廠內的正規化座標（0–100）。
-- 沒有資料時前端自動按工序分組排列；此表是選用的精確化。
create table machine_layout (
  machine_id text primary key references machines (id) on delete cascade on update cascade,
  x numeric(5,2) not null check (x between 0 and 100),
  y numeric(5,2) not null check (y between 0 and 100),
  updated_at timestamptz not null default now()
);
alter table machine_layout enable row level security;
create policy member_read_layout on machine_layout for select to authenticated using (is_member());
create policy boss_write_layout on machine_layout for all to authenticated
  using (has_permission('master.manage')) with check (has_permission('master.manage'));
create trigger audit after insert or update or delete on machine_layout
  for each row execute function audit_trigger('machine_id');

alter function schedule_snapshot(date, date) rename to _snapshot_before_layout;
create function schedule_snapshot(p_from date default current_date - 7, p_to date default current_date + 90)
returns jsonb language sql stable security invoker set search_path = public as $$
  select _snapshot_before_layout(p_from, p_to) || jsonb_build_object('machine_layout',
    (select coalesce(jsonb_agg(jsonb_build_object('machineId', machine_id, 'x', x, 'y', y) order by machine_id), '[]')
     from machine_layout))
$$;
revoke all on function _snapshot_before_layout(date, date), schedule_snapshot(date, date) from public, anon;
grant execute on function _snapshot_before_layout(date, date), schedule_snapshot(date, date) to authenticated;

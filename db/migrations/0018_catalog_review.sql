-- 原檔名冊可先建立正式資料列，但未確認技能、設備用途前不得求解或排班。
alter table employees add column review_status text not null default 'confirmed' check (review_status in ('pending', 'confirmed'));
alter table employees add column source_ref text;
alter table machines add column review_status text not null default 'confirmed' check (review_status in ('pending', 'confirmed'));
alter table machines add column source_ref text;
alter table schedule_state add column setup_pending boolean not null default false;

alter function schedule_snapshot(date, date) rename to _snapshot_before_catalog_review;
create function schedule_snapshot(p_from date default current_date - 7, p_to date default current_date + 90)
returns jsonb language sql stable security invoker set search_path = public as $$
  with base as (select _snapshot_before_catalog_review(p_from, p_to) as data)
  select data || jsonb_build_object(
    'setup_pending', (select setup_pending from schedule_state),
    'employees', (select coalesce(jsonb_agg(x.value || jsonb_build_object('review_status', e.review_status, 'source_ref', e.source_ref) order by x.position), '[]')
      from jsonb_array_elements(data -> 'employees') with ordinality x(value, position) join employees e on e.id = (x.value ->> 'id')::uuid),
    'machines', (select coalesce(jsonb_agg(x.value || jsonb_build_object('review_status', m.review_status, 'source_ref', m.source_ref) order by x.position), '[]')
      from jsonb_array_elements(data -> 'machines') with ordinality x(value, position) join machines m on m.id = (x.value ->> 'id')))
  from base
$$;
revoke all on function _snapshot_before_catalog_review(date, date) from public, anon;
grant execute on function _snapshot_before_catalog_review(date, date) to authenticated;
revoke all on function schedule_snapshot(date, date) from public, anon;
grant execute on function schedule_snapshot(date, date) to authenticated;

create function _guard_catalog_setup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select setup_pending from schedule_state) then
    raise exception '原檔名冊與工作資料尚待確認，暫不開放排程計算或新增排班';
  end if;
  return new;
end $$;
revoke all on function _guard_catalog_setup() from public, anon, authenticated;
create trigger guard_catalog_setup before insert on plan_previews for each row execute function _guard_catalog_setup();
create trigger guard_catalog_setup before insert or update on schedule_blocks for each row execute function _guard_catalog_setup();

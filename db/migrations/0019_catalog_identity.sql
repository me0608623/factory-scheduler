-- Source identity and position metadata only. This does not confirm skills or capacity.
alter table employees add column source_employee_code text unique;
alter table employees add column source_notes text;
alter table employees add column catalog_sources jsonb not null default '[]' check (jsonb_typeof(catalog_sources)='array');
alter table employees add column identity_candidates jsonb not null default '[]' check (jsonb_typeof(identity_candidates)='array');
alter table machines add column catalog_group text;
alter table machines add column catalog_side text check (catalog_side in ('左','右'));

alter function schedule_snapshot(date,date) rename to _snapshot_before_catalog_identity;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90)
returns jsonb language sql stable security invoker set search_path=public as $$
  with base as (select _snapshot_before_catalog_identity(p_from,p_to) as data)
  select data || jsonb_build_object(
    'employees',(select coalesce(jsonb_agg(x.value || jsonb_build_object(
      'source_employee_code',e.source_employee_code,'source_notes',e.source_notes,
      'catalog_sources',e.catalog_sources,'identity_candidates',e.identity_candidates) order by x.position),'[]')
      from jsonb_array_elements(data->'employees') with ordinality x(value,position)
      join employees e on e.id=(x.value->>'id')::uuid),
    'machines',(select coalesce(jsonb_agg(x.value || jsonb_build_object(
      'catalog_group',m.catalog_group,'catalog_side',m.catalog_side) order by x.position),'[]')
      from jsonb_array_elements(data->'machines') with ordinality x(value,position)
      join machines m on m.id=x.value->>'id'))
  from base
$$;
revoke all on function _snapshot_before_catalog_identity(date,date) from public,anon;
grant execute on function _snapshot_before_catalog_identity(date,date) to authenticated;
revoke all on function schedule_snapshot(date,date) from public,anon;
grant execute on function schedule_snapshot(date,date) to authenticated;

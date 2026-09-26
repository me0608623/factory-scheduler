-- 舊版手填排程只作歷史參考，不進入目前的機台／工單／時段排程表。
create table legacy_schedule_archives (
  id uuid primary key default gen_random_uuid(),
  source_name text not null check (length(trim(source_name)) > 0),
  source_sha256 text not null unique check (source_sha256 ~ '^[0-9a-f]{64}$'),
  date_from date not null,
  date_to date not null check (date_to >= date_from),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 2000000),
  imported_by uuid not null default auth.uid() references auth.users (id),
  imported_at timestamptz not null default now()
);

alter table legacy_schedule_archives enable row level security;
create policy editor_read on legacy_schedule_archives for select to authenticated using (is_editor());
create policy editor_insert on legacy_schedule_archives for insert to authenticated
  with check (is_editor() and imported_by = auth.uid());

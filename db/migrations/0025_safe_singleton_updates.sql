-- Supabase loads pg-safeupdate for API sessions. Keep that protection enabled
-- and make every schedule-state write explicitly target its one permitted row.
--
-- Earlier installations already have the affected function bodies, so this
-- migration also repairs those definitions in place. Fresh installations use
-- the qualified statements in the earlier migrations and make no changes here.
do $migration$
declare
  fn record;
  source text;
  patched text;
begin
  for fn in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'update[[:space:]]+schedule_state[[:space:]]+set'
  loop
    source := pg_get_functiondef(fn.oid);

    -- Every affected function currently has exactly one schedule_state UPDATE.
    -- Do not touch a function that has already been repaired.
    if source !~* 'update[[:space:]]+schedule_state[[:space:]]+set[^;]*[[:space:]]where[[:space:]]' then
      patched := regexp_replace(
        source,
        '(update[[:space:]]+schedule_state[[:space:]]+set[^;]*)(;)',
        E'\\1 where id\\2',
        'gi'
      );

      if patched = source then
        raise exception '無法修正函式 % 的 schedule_state 更新', fn.proname;
      end if;

      execute patched;
    end if;
  end loop;
end
$migration$;

-- Fail the deployment rather than leave an API function that Supabase will
-- reject at runtime.
do $verify$
declare
  fn record;
begin
  for fn in
    select p.proname, pg_get_functiondef(p.oid) as source
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'update[[:space:]]+schedule_state[[:space:]]+set'
  loop
    if fn.source !~* 'update[[:space:]]+schedule_state[[:space:]]+set[^;]*[[:space:]]where[[:space:]]' then
      raise exception '函式 % 仍有未限定範圍的 schedule_state 更新', fn.proname;
    end if;
  end loop;
end
$verify$;

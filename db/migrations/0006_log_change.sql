-- 沒有動到排程方塊的變更（例如登記請假、改員工資料、開加班）也要留一筆給人看的紀錄
create function log_change(p_kind text, p_title text, p_detail jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cs uuid := gen_random_uuid();
begin
  if not is_editor() then
    raise exception '只有老闆或組長可以寫入紀錄' using errcode = '42501';
  end if;
  insert into change_sets (id, kind, title, summary, detail)
  values (cs, p_kind, p_title, p_detail ->> 'summary', coalesce(p_detail, '{}'));
  return cs;
end $$;

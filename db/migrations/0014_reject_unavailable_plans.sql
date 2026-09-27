-- 方案可能因求解超時或缺少機台／人員而無法套用；資料庫也必須擋住直接呼叫 RPC。
create or replace function apply_plan(p_preview uuid, p_option text, p_note text default null, p_ai jsonb default null)
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
  perform _apply_blocks(coalesce(opt -> 'blocks', '[]'));
  update schedule_state set version = ver + 1, updated_at = now(), updated_by = auth.uid();
  update plan_previews set applied_option = p_option where id = p_preview;
  return cs;
end $$;

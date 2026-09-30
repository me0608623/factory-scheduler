-- Device display preferences stay in each browser. Only the user's display name
-- is shared, through this narrow self-service function.
create or replace function update_own_profile(p_display_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cleaned text;
begin
  if auth.uid() is null or not is_member() then
    raise exception '請先登入' using errcode='42501';
  end if;
  cleaned:=btrim(coalesce(p_display_name,''));
  if length(cleaned)<1 or length(cleaned)>60 then
    raise exception '顯示名稱需要 1–60 個字';
  end if;
  update profiles set display_name=cleaned where user_id=auth.uid();
  if not found then raise exception '找不到帳號資料';end if;
  return jsonb_build_object('displayName',cleaned);
end $$;

revoke all on function update_own_profile(text) from public,anon;
grant execute on function update_own_profile(text) to authenticated;

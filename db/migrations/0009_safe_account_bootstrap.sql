-- 公開部署安全性：註冊順序不能決定權限。
-- 所有新帳號一律先為 viewer；老闆帳號只能由 Supabase 管理員核對身分後提升。
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email, ''));
  return new;
end $$;

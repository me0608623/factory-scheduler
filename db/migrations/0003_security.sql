-- 權限：由資料庫強制執行（Row Level Security），不靠前端藏按鈕
--   boss   老闆：全部
--   lead   組長：報故障、請假、工單、套用方案、拖曳調整
--   worker 員工：看；之後回報自己的進度
--   viewer 電視：只能看

create function app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;
create function is_member() returns boolean language sql stable as $$ select app_role() is not null $$;
create function is_editor() returns boolean language sql stable as $$ select coalesce(app_role() in ('boss', 'lead'), false) $$;
create function is_boss()   returns boolean language sql stable as $$ select coalesce(app_role() = 'boss', false) $$;

-- 新帳號自動建立 profile；系統裡第一個帳號是老闆，之後的預設只能看（由老闆改角色）
-- 上線後請在 Supabase 關閉「開放註冊」，改由老闆邀請
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'name', new.email, ''),
          (case when exists (select 1 from profiles where role = 'boss') then 'viewer' else 'boss' end)::app_role);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- 全部開啟 RLS
alter table profiles         enable row level security;
alter table employees        enable row level security;
alter table processes        enable row level security;
alter table machines         enable row level security;
alter table employee_skills  enable row level security;
alter table products         enable row level security;
alter table product_steps    enable row level security;
alter table machine_products enable row level security;
alter table work_windows     enable row level security;
alter table calendar_weekly  enable row level security;
alter table holidays         enable row level security;
alter table calendar_days    enable row level security;
alter table leaves           enable row level security;
alter table machine_faults   enable row level security;
alter table orders           enable row level security;
alter table schedule_state   enable row level security;
alter table schedule_blocks  enable row level security;
alter table plan_previews    enable row level security;
alter table change_sets      enable row level security;
alter table progress_reports enable row level security;
alter table audit_log        enable row level security;

-- 所有登入的成員都能看排程相關資料
do $$
declare t text;
begin
  foreach t in array array['employees', 'processes', 'machines', 'employee_skills', 'products', 'product_steps',
                           'machine_products', 'work_windows', 'calendar_weekly', 'holidays', 'calendar_days',
                           'leaves', 'machine_faults', 'orders', 'schedule_state', 'schedule_blocks',
                           'plan_previews', 'change_sets', 'progress_reports'] loop
    execute format('create policy member_read on %I for select to authenticated using (is_member())', t);
  end loop;
end $$;

-- 基本資料、上班日設定：只有老闆能改
do $$
declare t text;
begin
  foreach t in array array['employees', 'processes', 'machines', 'employee_skills', 'products', 'product_steps',
                           'machine_products', 'work_windows', 'calendar_weekly', 'holidays'] loop
    execute format('create policy boss_write on %I for all to authenticated using (is_boss()) with check (is_boss())', t);
  end loop;
end $$;

-- 日常狀況：老闆、組長能改
do $$
declare t text;
begin
  foreach t in array array['calendar_days', 'leaves', 'machine_faults', 'orders'] loop
    execute format('create policy editor_write on %I for all to authenticated using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

-- schedule_blocks、schedule_state、plan_previews、change_sets：不開放直接寫，
-- 只能透過 apply_plan／save_blocks（會檢查角色與版本號）或排程服務（service role）寫入

-- 帳號：自己看得到自己；老闆看得到全部、可以改角色
create policy own_profile on profiles for select to authenticated using (user_id = auth.uid() or is_boss());
create policy boss_manage_profiles on profiles for update to authenticated using (is_boss()) with check (is_boss());

-- 稽核紀錄：只有老闆能看，沒有人能改
create policy boss_read_audit on audit_log for select to authenticated using (is_boss());

-- 現場回報：員工只能替自己回報
create policy report_own on progress_reports for insert to authenticated
  with check (is_editor() or employee_id = (select employee_id from profiles where user_id = auth.uid()));

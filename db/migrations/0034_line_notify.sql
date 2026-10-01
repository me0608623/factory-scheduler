-- 0034：LINE 通知設定與推播紀錄
create table if not exists line_notify_settings(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null unique,
  line_user_id text,  -- LINE User ID (從 LINE Login 取得，或手動填)
  line_group_id text, -- LINE Group ID (推播到群組)
  events jsonb not null default '{"schedule_change":true,"leave_request":true,"rush_order":true,"fault":true,"daily_summary":false}',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table line_notify_settings enable row level security;
create policy line_notify_read on line_notify_settings for select to authenticated using(user_id=auth.uid() or is_boss());
create policy line_notify_write on line_notify_settings for insert to authenticated with check(user_id=auth.uid());
create policy line_notify_update on line_notify_settings for update to authenticated using(user_id=auth.uid());
revoke all on line_notify_settings from authenticated,anon;
grant select,insert,update on line_notify_settings to authenticated;

-- 推播紀錄（老闆可看）
create table if not exists line_notify_log(
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_type text not null,
  message text not null,
  sent_at timestamptz not null default now(),
  success boolean not null default true
);
alter table line_notify_log enable row level security;
create policy line_log_read on line_notify_log for select to authenticated using(is_boss());
create policy line_log_write on line_notify_log for insert to authenticated with check(true);
revoke all on line_notify_log from authenticated,anon;
grant select,insert on line_notify_log to authenticated;

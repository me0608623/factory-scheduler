-- 0033：意見反饋（所有登入者可提交，存進資料庫）
create table if not exists feedback(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  author_name text not null default '',
  category text not null default 'other' check(category in('bug','feature','ux','other')),
  message text not null check(length(trim(message)) between 1 and 2000),
  page_url text,
  status text not null default 'new' check(status in('new','read','resolved')),
  created_at timestamptz not null default now()
);
alter table feedback enable row level security;
create policy feedback_insert on feedback for insert to authenticated with check(true);
create policy feedback_read_own on feedback for select to authenticated using(user_id=auth.uid());
revoke all on feedback from authenticated,anon;
grant insert,select on feedback to authenticated;
create trigger audit after insert or update or delete on feedback for each row execute function audit_trigger('id');

-- 快照：老闆可看全部反饋
create or replace function list_feedback(p_limit int default 50)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'author',f.author_name,'category',f.category,'message',f.message,
    'status',f.status,'createdAt',f.created_at,'pageUrl',f.page_url
  ) order by f.created_at desc),'[]')
  from (select * from feedback order by created_at desc limit p_limit) f
  where is_boss();
$$;
revoke all on function list_feedback(int) from public,anon;
grant execute on function list_feedback(int) to authenticated;

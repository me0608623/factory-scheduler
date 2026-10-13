-- 修正權限管理無法儲存：前端 PERMISSIONS 有 15 個鍵，但資料庫三處仍是 13 鍵
-- （0027 補了 notes.manage，仍缺 rush.manage 與 worklog.manage）：
--   1) set_account_permissions 白名單 → 存檔直接被拒（含未知權限）
--   2) account_permissions_permission_check 資料表 CHECK → 白名單放行後 INSERT 仍失敗
--   3) role_has_permission 組長預設／has_any_write_permission 寫入閘門 →
--      與前端 LEAD_DEFAULT 不一致（雲端組長少了趕貨／工作紀錄，僅授這兩項的帳號被當成唯讀）
create or replace function set_account_permissions(p_user uuid,p_permissions jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare k text;v jsonb;
begin
  if not is_boss() then raise exception '只有老闆可以管理帳號權限' using errcode='42501';end if;
  if not exists(select 1 from profiles where user_id=p_user) then raise exception '找不到這個帳號';end if;
  if jsonb_typeof(p_permissions) is distinct from 'object' then raise exception '權限格式不正確';end if;
  for k,v in select key,value from jsonb_each(p_permissions) loop
    if k<>all(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
      'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage',
      'notes.manage','rush.manage','worklog.manage'
    ]) or jsonb_typeof(v)<>'boolean' then raise exception '含未知權限或非布林值';end if;
  end loop;
  delete from account_permissions where user_id=p_user;
  insert into account_permissions(user_id,permission,allowed,granted_by)
    select p_user,key,(value#>>'{}')::boolean,auth.uid() from jsonb_each(p_permissions);
end $$;

alter table account_permissions drop constraint if exists account_permissions_permission_check;
alter table account_permissions add constraint account_permissions_permission_check check(permission in (
  'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
  'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage',
  'notes.manage','rush.manage','worklog.manage'
));

-- 組長預設與前端 permissions.js 的 LEAD_DEFAULT 對齊（12 鍵）
create or replace function role_has_permission(p_role app_role,p_permission text) returns boolean
language sql immutable set search_path=public as $$
  select case when p_role='boss' then true when p_role='lead' then p_permission=any(array[
    'schedule.manage','incidents.manage','orders.manage','calendar.manage','transfers.manage','rush.manage','worklog.manage',
    'rosters.manage','scenarios.manage','execution.manage','archives.manage','notes.manage']) else false end
$$;

create or replace function has_any_write_permission() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from unnest(array[
    'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
    'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage',
    'notes.manage','rush.manage','worklog.manage'
  ]) p where has_permission(p))
$$;

-- 清掉誤建的孤兒函式（同號錯版曾以 set_access_permissions 名義建立，未被任何程式呼叫）
drop function if exists set_access_permissions(uuid,jsonb);

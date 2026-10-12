-- 修正權限管理無法儲存：前端 PERMISSIONS 有 15 個鍵，但 set_access_permissions
-- 白名單只有 13 個（0027 補了 notes.manage，仍缺 rush.manage 與 worklog.manage）。
-- 老闆在「權限管理」按「儲存權限」必被 DB 拒絕（含未知權限），整個委派功能失效。
create or replace function set_access_permissions(p_user uuid, p_permissions jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if not is_boss() then raise exception '只有老闆可以管理帳號權限' using errcode = '42501'; end if;
  if not exists(select 1 from profiles where user_id=p_user) then raise exception '找不到這個帳號'; end if;
  if jsonb_typeof(p_permissions) is distinct from 'object' then raise exception '權限格式不正確'; end if;
  for k,v in select key,value from jsonb_each(p_permissions) loop
    if k<>all(array[
      'schedule.manage','incidents.manage','orders.manage','calendar.manage','master.manage','groups.manage',
      'work_contents.manage','transfers.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage',
      'notes.manage','rush.manage','worklog.manage'
    ]) or jsonb_typeof(v)<>'boolean' then raise exception '含未知權限或非布林值'; end if;
  end loop;
  delete from account_permissions where user_id=p_user;
  insert into account_permissions(user_id,permission,allowed,granted_by)
    select p_user,key,(value#>>'{}')::boolean,auth.uid() from jsonb_each(p_permissions);
end $$;
revoke all on function set_access_permissions(uuid,jsonb) from public,anon;
grant execute on function set_access_permissions(uuid,jsonb) to authenticated;

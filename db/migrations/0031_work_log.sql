-- 0031：工作紀錄表（分頁「工作紀錄表」）＋ 快照輸出
-- 欄位固定：日期、加工編號、合格數、不良、開工時/分、完工時/分、修模時間、加工者、備註
-- 讀取限會員；寫入只有老闆／組長經 save_work_log RPC（版本衝突 40001）；不連動排程。
create table work_log(id uuid primary key,body jsonb not null check(jsonb_typeof(body)='object'));
alter table work_log enable row level security;
create policy work_log_read on work_log for select to authenticated using(is_member());
revoke all on work_log from authenticated,anon;
grant select on work_log to authenticated;
create trigger audit after insert or update or delete on work_log for each row execute function audit_trigger('id');

create function _assert_work_log(o jsonb) returns void language plpgsql security definer set search_path=public as $$
declare d text;n text;f text;
begin
 if (o->>'id') is null then raise exception '工作紀錄缺少 id'; end if;
 perform (o->>'id')::uuid;
 if length(o::text)>4000 then raise exception '單列工作紀錄過大'; end if;
 d:=coalesce(o->>'date','');
 if d<>'' and (d !~ '^\d{4}-\d{2}-\d{2}$' or d::date::text<>d) then raise exception '工作紀錄日期格式不正確'; end if;
 if coalesce(length(o->>'code'),0)>80 or coalesce(length(o->>'worker'),0)>60 or coalesce(length(o->>'note'),0)>500 then raise exception '工作紀錄文字過長'; end if;
 for n in select unnest(array['goodQty','badQty','reworkMin','startH','startM','endH','endM']) loop
   f:=coalesce(o->>n,'');
   if f<>'' and (f !~ '^\d+$' or f::bigint>1000000000) then raise exception '工作紀錄數字欄需為 0 以上的整數'; end if;
 end loop;
 for n in select unnest(array['startH','endH']) loop
   if coalesce(o->>n,'')<>'' and (o->>n)::int>23 then raise exception '時請填 0–23'; end if;
 end loop;
 for n in select unnest(array['startM','endM']) loop
   if coalesce(o->>n,'')<>'' and (o->>n)::int>59 then raise exception '分請填 0–59'; end if;
 end loop;
 if d='' and coalesce(o->>'code','')='' and coalesce(o->>'worker','')='' and coalesce(o->>'note','')=''
   and coalesce(o->>'goodQty','')='' and coalesce(o->>'badQty','')='' and coalesce(o->>'reworkMin','')='' then
   raise exception '每一列至少要填一個欄位'; end if;
end $$;
revoke all on function _assert_work_log(jsonb) from public,anon,authenticated;

create function save_work_log(p_version bigint,p_rows jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare ver bigint;x jsonb;cs uuid:=gen_random_uuid();
begin
 if not is_editor() then raise exception '只有老闆或組長可修改工作紀錄' using errcode='42501'; end if;
 select version into ver from schedule_state for update;
 if ver is distinct from p_version then raise exception '工作紀錄或排程版本已變' using errcode='40001'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>5000 or
   (select count(distinct value->>'id') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception '工作紀錄格式或代號重複'; end if;
 if length(p_rows::text)>3000000 then raise exception '工作紀錄超過本版容量'; end if;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','更新工作紀錄',ver,ver+1);
 perform set_config('app.change_set_id',cs::text,true);
 for x in select value from jsonb_array_elements(p_rows) loop perform _assert_work_log(x); end loop;
 delete from work_log where not exists(select 1 from jsonb_array_elements(p_rows) v where v->>'id'=work_log.id::text);
 insert into work_log(id,body) select (value->>'id')::uuid,value from jsonb_array_elements(p_rows)
   on conflict(id) do update set body=excluded.body;
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid() where id;
 return ver+1;
end $$;
revoke all on function save_work_log(bigint,jsonb) from public,anon;
grant execute on function save_work_log(bigint,jsonb) to authenticated;

alter function schedule_snapshot(date,date) rename to _snapshot_before_work_log;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb language sql stable security invoker set search_path=public as $$
 select _snapshot_before_work_log(p_from,p_to)||jsonb_build_object(
   'work_log',(select coalesce(jsonb_agg(body order by (body->>'date') desc nulls last,(body->>'id')),'[]') from work_log));
$$;
revoke all on function _snapshot_before_work_log(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_work_log(date,date),schedule_snapshot(date,date) to authenticated;
alter publication supabase_realtime add table work_log;

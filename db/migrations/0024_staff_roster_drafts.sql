-- Presence plans only. No published/compliant status, attendance or production writes.
create table staff_rosters(id uuid primary key,body jsonb not null check(jsonb_typeof(body)='object'));
alter table staff_rosters enable row level security;
create policy staff_roster_read on staff_rosters for select to authenticated using(is_member());
revoke all on staff_rosters from authenticated,anon;
grant select on staff_rosters to authenticated;
create trigger audit after insert or update or delete on staff_rosters for each row execute function audit_trigger('id');

create function _assert_staff_roster(p jsonb) returns void language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
declare n int;st date;an date;x jsonb;s jsonb;w jsonb;last_end int;cnt int;
begin
 if jsonb_typeof(p) is distinct from 'object' or p->>'status' is distinct from 'draft' or
   coalesce(length(trim(p->>'name')),0) not between 1 and 80 or coalesce(p->>'factory','') not in ('1','2') or
   coalesce(p->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p->>'anchor','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '輪班草稿格式無效';end if;
 perform (p->>'id')::uuid;if p->>'id' is null then raise exception '缺班表代號';end if;
 n:=case p->>'regime' when 'fixed' then 7 when 'two' then 14 when 'four' then 28 when 'eight' then 56 else null end;
 st:=(p->>'start')::date;an:=(p->>'anchor')::date;
 if n is null or (st-an)%n<>0 then raise exception '班表起日未對齊連續週期';end if;
 for x in select to_jsonb(k) from unnest(array['eligibilityRef','consentRef','rotationConsentRef']) k loop
   if jsonb_typeof(p->(x#>>'{}')) is distinct from 'string' or length(p->>(x#>>'{}'))>500 then raise exception '同意／適用依據格式無效';end if;
 end loop;
 for x in select to_jsonb(k) from unnest(array['shifts','positions','employees','cells','demands']) k loop
   if jsonb_typeof(p->(x#>>'{}')) is distinct from 'array' then raise exception '班表清單格式無效';end if;
 end loop;
 if jsonb_array_length(p->'shifts') not between 1 and 8 or jsonb_array_length(p->'positions')>40 or jsonb_array_length(p->'employees')>100 or jsonb_array_length(p->'cells')>5600 or jsonb_array_length(p->'demands')>4480 then raise exception '班表超過容量';end if;
 for x in select value from jsonb_array_elements(p->'shifts') union all select value from jsonb_array_elements(p->'positions') loop
   if coalesce(length(x->>'id'),0) not between 1 and 80 or coalesce(length(trim(x->>'name')),0) not between 1 and 80 then raise exception '班別／崗位缺代號名稱';end if;
 end loop;
 if (select count(distinct v->>'id') from jsonb_array_elements(p->'shifts') v)<>jsonb_array_length(p->'shifts') or
    (select count(distinct v->>'id') from jsonb_array_elements(p->'positions') v)<>jsonb_array_length(p->'positions') then raise exception '班別／崗位代號重複';end if;
 for s in select value from jsonb_array_elements(p->'shifts') loop
   if jsonb_typeof(s->'segments') is distinct from 'array' or jsonb_array_length(s->'segments') not between 1 and 8 then raise exception '班別缺工作時段';end if;
   last_end:=-1;
   for w in select value from jsonb_array_elements(s->'segments') with ordinality order by ordinality loop
     if jsonb_typeof(w) is distinct from 'array' or jsonb_array_length(w)<>2 or coalesce(w->>0,'') !~ '^\d+$' or coalesce(w->>1,'') !~ '^\d+$' or
       (w->>0)::int<last_end or (w->>0)::int not between 0 and 2879 or (w->>1)::int not between 1 and 2880 or (w->>0)::int>=(w->>1)::int then raise exception '班別時段重疊或無效';end if;
     last_end:=(w->>1)::int;
   end loop;
   if (s->'segments'->0->>0)::int>=1440 or last_end-(s->'segments'->0->>0)::int>1440 then raise exception '班別跨度超過 24 小時或非當日開始';end if;
 end loop;
 if (select count(distinct v->>'emp') from jsonb_array_elements(p->'employees') v)<>jsonb_array_length(p->'employees') then raise exception '員工代號重複';end if;
 for x in select value from jsonb_array_elements(p->'employees') loop
   if not exists(select 1 from employees where id=(x->>'emp')::uuid) or jsonb_typeof(x->'shiftIds') is distinct from 'array' or jsonb_typeof(x->'weekdays') is distinct from 'array' then raise exception '員工或可用時段無效';end if;
   if jsonb_array_length(x->'shiftIds')>8 or jsonb_array_length(x->'weekdays')>7 or
     (select count(distinct v) from jsonb_array_elements_text(x->'shiftIds') v)<>jsonb_array_length(x->'shiftIds') or
     (select count(distinct v) from jsonb_array_elements_text(x->'weekdays') v)<>jsonb_array_length(x->'weekdays') or
     exists(select 1 from jsonb_array_elements_text(x->'shiftIds') v where not exists(select 1 from jsonb_array_elements(p->'shifts') s where s->>'id'=v)) or
     exists(select 1 from jsonb_array_elements_text(x->'weekdays') v where v not in ('0','1','2','3','4','5','6')) then raise exception '可用班別／星期無效';end if;
 end loop;
 for x in select value from jsonb_array_elements(p->'positions') loop
   if jsonb_typeof(x->'employeeIds') is distinct from 'array' or
     (select count(distinct v) from jsonb_array_elements_text(x->'employeeIds') v)<>jsonb_array_length(x->'employeeIds') or
     exists(select 1 from jsonb_array_elements_text(x->'employeeIds') v where not exists(select 1 from jsonb_array_elements(p->'employees') e where e->>'emp'=v)) or
     not (x ? 'rate') or (x->'rate'<>'null'::jsonb and (jsonb_typeof(x->'rate')<>'number' or (x->>'rate')::numeric<=0 or (x->>'rate')::numeric>1000000)) then raise exception '崗位資格或產能無效';end if;
 end loop;
 cnt:=jsonb_array_length(p->'employees')*n;
 if jsonb_array_length(p->'cells')<>cnt or (select count(distinct (v->>'emp',v->>'date')) from jsonb_array_elements(p->'cells') v)<>cnt then raise exception '班格須涵蓋完整週期且不可重複';end if;
 for x in select value from jsonb_array_elements(p->'cells') loop
   if coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (x->>'date')::date not between st and st+n-1 or
     not exists(select 1 from jsonb_array_elements(p->'employees') e where e->>'emp'=x->>'emp') or
     coalesce(x->>'type','') not in ('work','regular','rest','holiday','leave') or jsonb_typeof(x->'pin') is distinct from 'boolean' or not (x ? 'shiftId' and x ? 'positionId') or
     (x->>'shiftId' is not null and not exists(select 1 from jsonb_array_elements(p->'shifts') s where s->>'id'=x->>'shiftId')) or
     (x->>'positionId' is not null and not exists(select 1 from jsonb_array_elements(p->'positions') s where s->>'id'=x->>'positionId')) or
     (x->>'type'<>'work' and (x->>'shiftId' is not null or x->>'positionId' is not null)) then raise exception '每日班格參照無效';end if;
 end loop;
 if (select count(distinct (v->>'date',v->>'shiftId',v->>'positionId')) from jsonb_array_elements(p->'demands') v)<>jsonb_array_length(p->'demands') then raise exception '需求重複';end if;
 for x in select value from jsonb_array_elements(p->'demands') loop
   if coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (x->>'date')::date not between st and st+n-1 or
     not exists(select 1 from jsonb_array_elements(p->'shifts') s where s->>'id'=x->>'shiftId') or not exists(select 1 from jsonb_array_elements(p->'positions') s where s->>'id'=x->>'positionId') or
     coalesce(x->>'people','') !~ '^\d+$' or coalesce(x->>'target','') !~ '^\d+$' or (x->>'people')::bigint not between 0 and 100 or (x->>'target')::bigint not between 0 and 1000000000 then raise exception '需求格式無效';end if;
 end loop;
end $$;
revoke all on function _assert_staff_roster(jsonb) from public,anon,authenticated;

create function save_staff_rosters(p_version bigint,p_rosters jsonb) returns bigint language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
declare ver bigint;x jsonb;cs uuid:=gen_random_uuid();
begin
 if not is_editor() then raise exception '只有老闆或組長可修改輪班草稿' using errcode='42501';end if;
 select version into ver from schedule_state for update;
 if ver is distinct from p_version then raise exception '輪班或排程版本已變' using errcode='40001';end if;
 if jsonb_typeof(p_rosters) is distinct from 'array' or jsonb_array_length(p_rosters)>24 or length(p_rosters::text)>3000000 or
   (select count(distinct v->>'id') from jsonb_array_elements(p_rosters) v)<>jsonb_array_length(p_rosters) then raise exception '班表清單格式或容量無效';end if;
 for x in select value from jsonb_array_elements(p_rosters) loop perform _assert_staff_roster(x);end loop;
 if exists(select 1 from jsonb_array_elements(p_rosters) a cross join jsonb_array_elements(p_rosters) b
   where a->>'id'<b->>'id' and (a->>'start')::date <= (b->>'start')::date+case b->>'regime' when 'fixed' then 6 when 'two' then 13 when 'four' then 27 else 55 end
   and (b->>'start')::date <= (a->>'start')::date+case a->>'regime' when 'fixed' then 6 when 'two' then 13 when 'four' then 27 else 55 end
   and exists(select 1 from jsonb_array_elements(a->'employees') e join jsonb_array_elements(b->'employees') f on e->>'emp'=f->>'emp')) then raise exception '同員工不可存在重疊週期班表';end if;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','更新輪班草稿（不更動產線）',ver,ver+1);perform set_config('app.change_set_id',cs::text,true);
 delete from staff_rosters where not exists(select 1 from jsonb_array_elements(p_rosters) x where x->>'id'=staff_rosters.id::text);
 for x in select value from jsonb_array_elements(p_rosters) loop insert into staff_rosters(id,body) values((x->>'id')::uuid,x) on conflict(id) do update set body=excluded.body;end loop;
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid() where id;return ver+1;
end $$;
revoke all on function save_staff_rosters(bigint,jsonb) from public,anon;
grant execute on function save_staff_rosters(bigint,jsonb) to authenticated;

create function _guard_roster_employee() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from staff_rosters r cross join lateral jsonb_array_elements(r.body->'employees') e where e->>'emp'=old.id::text) then raise exception '員工仍被輪班草稿引用';end if;
 return old;
end $$;
revoke all on function _guard_roster_employee() from public,anon,authenticated;
create trigger guard_roster_employee before delete on employees for each row execute function _guard_roster_employee();

alter function schedule_snapshot(date,date) rename to _snapshot_before_rosters;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb language sql stable security invoker set search_path=public as $$
 select _snapshot_before_rosters(p_from,p_to)||jsonb_build_object('staff_rosters',(select coalesce(jsonb_agg(body order by id),'[]') from staff_rosters));
$$;
revoke all on function _snapshot_before_rosters(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_rosters(date,date),schedule_snapshot(date,date) to authenticated;
alter publication supabase_realtime add table staff_rosters;

-- Cross-factory orders are additive and independent of production orders.
create table transfer_orders(id uuid primary key,code text not null unique,body jsonb not null check(jsonb_typeof(body)='object'));
alter table transfer_orders enable row level security;
create policy transfer_read on transfer_orders for select to authenticated using(is_member());
revoke all on transfer_orders from authenticated,anon;
grant select on transfer_orders to authenticated;
create trigger audit after insert or update or delete on transfer_orders for each row execute function audit_trigger('id');
alter table work_assignments add column transfer_batch_id uuid,add column transfer_stage text check(transfer_stage in ('process','return'));
alter table work_assignments add constraint transfer_link_pair check((transfer_batch_id is null)=(transfer_stage is null));
create index work_assignments_transfer on work_assignments(transfer_batch_id,work_id,transfer_stage) where transfer_batch_id is not null;

create function _assert_transfer_order(o jsonb,old_body jsonb) returns void language plpgsql security definer set search_path=public as $$
declare b jsonb;ev jsonb;previous jsonb;bid uuid;sent bigint;received bigint;good bigint;scrap bigint;returned bigint;accepted bigint;rejected bigint;planned bigint:=0;q bigint;bad bigint;t timestamp;
begin
 if length(trim(o->>'code')) not between 1 and 80 or length(trim(o->>'itemCode')) not between 1 and 80 or
   (o->>'fromFactory')::int not in (1,2) or (o->>'toFactory')::int not in (1,2) or (o->>'returnFactory')::int not in (1,2) or o->>'fromFactory'=o->>'toFactory' or
   o->>'status' not in ('active','paused','cancelled') or coalesce(length(o->>'note'),501)>500 or
   jsonb_typeof(o->'batches') is distinct from 'array' or jsonb_typeof(o->'events') is distinct from 'array' or jsonb_typeof(o->'workIds') is distinct from 'array' then raise exception '加工單格式不正確'; end if;
 if (o->>'id') is null or (o->>'code') is null or (o->>'itemCode') is null or (o->>'status') is null or
   (o->>'fromFactory') is null or (o->>'toFactory') is null or (o->>'returnFactory') is null then raise exception '加工單必填欄位不足'; end if;
 if o->>'totalQty' is not null and (o->>'totalQty')::bigint not between 1 and 1000000000 or
   (o->>'urgentQty') is null or (o->>'urgentQty')::bigint<0 or (o->>'urgentQty')::bigint>coalesce((o->>'totalQty')::bigint,0) then raise exception '加工單數量不正確'; end if;
 for ev in select value from jsonb_each(o) where key in ('notified','expectedSend','due','urgentDue') loop
   if ev<>'null'::jsonb and (ev#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '日期格式不正確'; end if;
   if ev<>'null'::jsonb then perform (ev#>>'{}')::date;end if;
 end loop;
 if jsonb_array_length(o->'batches')>200 or jsonb_array_length(o->'events')>2000 or
   exists(select 1 from jsonb_array_elements_text(o->'workIds') v where not exists(select 1 from work_contents where id=v::uuid and factory=(o->>'toFactory')::int)) or
   (select count(distinct v) from jsonb_array_elements_text(o->'workIds') v)<>jsonb_array_length(o->'workIds') or
   (select count(distinct v->>'id') from jsonb_array_elements(o->'batches') v)<>jsonb_array_length(o->'batches') or
   (select count(distinct v->>'code') from jsonb_array_elements(o->'batches') v)<>jsonb_array_length(o->'batches') or
   (select count(distinct v->>'id') from jsonb_array_elements(o->'events') v)<>jsonb_array_length(o->'events') then raise exception '工作內容或批次／流轉代號重複或無效'; end if;
 if old_body is not null then
   if exists(select 1 from jsonb_array_elements(old_body->'events') v where not (o->'events') @> jsonb_build_array(v)) then raise exception '已存流轉紀錄不可刪改'; end if;
   if jsonb_array_length(old_body->'events')>0 and exists(select 1 from unnest(array['itemCode','fromFactory','toFactory','returnFactory']) k where o->k is distinct from old_body->k) then raise exception '已有流轉不可改品號或廠別';end if;
 end if;
 for ev in select value from jsonb_array_elements(o->'events') loop
   if not exists(select 1 from jsonb_array_elements(o->'batches') v where v->>'id'=ev->>'batchId') then raise exception '流轉批次不存在';end if;
   perform (ev->>'id')::uuid;
   if old_body is null or not (old_body->'events') @> jsonb_build_array(ev) then
     if o->>'status'<>'active' then raise exception '暫停／取消不能新增流轉';end if;
     if (ev->>'at')::timestamp>timezone('Asia/Taipei',now()) then raise exception '實際流轉不能填未來時間';end if;
   end if;
 end loop;
 for b in select value from jsonb_array_elements(o->'batches') loop
   bid:=(b->>'id')::uuid;q:=(b->>'plannedQty')::bigint;
   if bid is null or q is null or q not between 1 and 1000000000 or coalesce(length(trim(b->>'code')),0) not between 1 and 80 then raise exception '批次格式不正確';end if;
   planned:=planned+q;sent:=0;received:=0;good:=0;scrap:=0;returned:=0;accepted:=0;rejected:=0;
   for ev in select value from jsonb_array_elements(o->'events') with ordinality where value->>'batchId'=bid::text order by value->>'at',ordinality loop
     q:=(ev->>'qty')::bigint;bad:=(ev->>'badQty')::bigint;
     if q is null or bad is null or q<0 or bad<0 or q+bad not between 1 and 1000000000 or
       ev->>'action' not in ('send','receive','complete','return','accept') or ev->>'action' is null or
       coalesce(ev->>'at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or coalesce(length(ev->>'note'),501)>500 or
       (ev->>'action' not in ('complete','accept') and bad<>0) then raise exception '流轉格式不正確';end if;
     t:=(ev->>'at')::timestamp;
     case ev->>'action' when 'send' then sent:=sent+q;when 'receive' then received:=received+q;when 'complete' then good:=good+q;scrap:=scrap+bad;when 'return' then returned:=returned+q;when 'accept' then accepted:=accepted+q;rejected:=rejected+bad;end case;
     if sent>(b->>'plannedQty')::bigint or received>sent or good+scrap>received or returned>good or accepted+rejected>returned then raise exception '流轉数量／時間超過前一步';end if;
   end loop;
 end loop;
 if planned>coalesce((o->>'totalQty')::bigint,0) then raise exception '批次量超過加工單總量';end if;
end $$;
revoke all on function _assert_transfer_order(jsonb,jsonb) from public,anon,authenticated;

create function _assert_transfer_assignment(a work_assignments,allow_inactive boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare o jsonb;b jsonb;w work_contents;planned bigint;
begin
 if a.transfer_batch_id is null then return;end if;
 select body,part into o,b from transfer_orders cross join lateral jsonb_array_elements(body->'batches') part where part->>'id'=a.transfer_batch_id::text;
 if o is null then raise exception '跨廠批次不存在';end if;
 select * into strict w from work_contents where id=a.work_id;
 if not allow_inactive and o->>'status'<>'active' then raise exception '跨廠加工單未啟用';end if;
 if a.transfer_stage='process' and (w.factory<>(o->>'toFactory')::int or not (o->'workIds') @> jsonb_build_array(w.id::text)) or
   a.transfer_stage='return' and w.factory<>(o->>'returnFactory')::int then raise exception '工作內容不符合加工單廠別或工序';end if;
 if a.qty is null or a.qty<=0 then raise exception '跨廠排班須填正整數計畫件數';end if;
 select coalesce(sum(qty),0)+a.qty into planned from work_assignments where id<>a.id and transfer_batch_id=a.transfer_batch_id and work_id=a.work_id and transfer_stage=a.transfer_stage;
 if planned>(b->>'plannedQty')::bigint then raise exception '同批次同工作排班件數超過批次計畫量';end if;
end $$;
revoke all on function _assert_transfer_assignment(work_assignments,boolean) from public,anon,authenticated;
create function _guard_transfer_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin perform _assert_transfer_assignment(new);return new;end $$;
revoke all on function _guard_transfer_assignment() from public,anon,authenticated;
create trigger guard_transfer before insert or update on work_assignments for each row execute function _guard_transfer_assignment();

create function save_transfer_orders(p_version bigint,p_orders jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare ver bigint;x jsonb;old_body jsonb;cs uuid:=gen_random_uuid();a work_assignments;
begin
 if not is_editor() then raise exception '只有老闆或組長可修改跨廠加工' using errcode='42501';end if;
 select version into ver from schedule_state for update;
 if ver is distinct from p_version then raise exception '跨廠或排程版本已變' using errcode='40001';end if;
 if jsonb_typeof(p_orders) is distinct from 'array' or jsonb_array_length(p_orders)>1000 or
   (select count(distinct value->>'id') from jsonb_array_elements(p_orders))<>jsonb_array_length(p_orders) then raise exception '加工單格式或代號重複';end if;
 if length(p_orders::text)>2000000 or (select count(*) from jsonb_array_elements(p_orders) v cross join lateral jsonb_array_elements(v->'events'))>5000 then raise exception '跨廠紀錄超過本版容量';end if;
 if exists(select 1 from transfer_orders t where not exists(select 1 from jsonb_array_elements(p_orders) v where v->>'id'=t.id::text)) then raise exception '加工單不刪除，請改為取消';end if;
 if (select count(*) from jsonb_array_elements(p_orders) v cross join lateral jsonb_array_elements(v->'batches') b) <>
   (select count(distinct b->>'id') from jsonb_array_elements(p_orders) v cross join lateral jsonb_array_elements(v->'batches') b) or
   (select count(*) from jsonb_array_elements(p_orders) v cross join lateral jsonb_array_elements(v->'events') e) <>
   (select count(distinct e->>'id') from jsonb_array_elements(p_orders) v cross join lateral jsonb_array_elements(v->'events') e) then raise exception '跨單批次或流轉代號重複';end if;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','更新跨廠加工',ver,ver+1);perform set_config('app.change_set_id',cs::text,true);
 -- Validate every order before writing, then recheck linked assignments atomically.
 for x in select value from jsonb_array_elements(p_orders) loop
   select body into old_body from transfer_orders where id=(x->>'id')::uuid;
   perform _assert_transfer_order(x,old_body);
 end loop;
 for x in select value from jsonb_array_elements(p_orders) loop
   insert into transfer_orders(id,code,body) values((x->>'id')::uuid,x->>'code',x) on conflict(id) do update set code=excluded.code,body=excluded.body;
 end loop;
 for a in select * from work_assignments where transfer_batch_id is not null loop perform _assert_transfer_assignment(a,true);end loop;
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid();return ver+1;
end $$;
revoke all on function save_transfer_orders(bigint,jsonb) from public,anon;
grant execute on function save_transfer_orders(bigint,jsonb) to authenticated;

create or replace function save_work_assignments(p_version bigint,p_assignments jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare ver bigint;cs uuid:=gen_random_uuid();
begin
 if not is_editor() then raise exception '只有老闆或組長可以安排工作' using errcode='42501';end if;
 select version into ver from schedule_state for update;if ver is distinct from p_version then raise exception '工作或排程版本已變' using errcode='40001';end if;
 if (select setup_pending from schedule_state) then raise exception '名冊與工時尚待確認，不能新增排班';end if;
 if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments)>10000 or
  (select count(distinct value->>'id') from jsonb_array_elements(p_assignments))<>jsonb_array_length(p_assignments) then raise exception '工作排班格式或代號重複';end if;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','安排工作內容',ver,ver+1);perform set_config('app.change_set_id',cs::text,true);
 delete from work_assignments a where not exists(select 1 from jsonb_to_recordset(p_assignments) as x(id uuid,work_id uuid,employee_id uuid,resource_id text,date date,start_min smallint,end_min smallint,qty integer,order_id uuid,note text,transfer_batch_id uuid,transfer_stage text)
 where a.id=x.id and row(a.work_id,a.employee_id,a.resource_id,a.date,a.start_min,a.end_min,a.qty,a.order_id,a.note,a.transfer_batch_id,a.transfer_stage)
 is not distinct from row(x.work_id,x.employee_id,x.resource_id,x.date,x.start_min,x.end_min,x.qty,x.order_id,coalesce(x.note,''),x.transfer_batch_id,x.transfer_stage));
 insert into work_assignments(id,work_id,employee_id,resource_id,date,start_min,end_min,qty,order_id,note,transfer_batch_id,transfer_stage)
 select id,work_id,employee_id,resource_id,date,start_min,end_min,qty,order_id,coalesce(note,''),transfer_batch_id,transfer_stage from jsonb_to_recordset(p_assignments)
 as x(id uuid,work_id uuid,employee_id uuid,resource_id text,date date,start_min smallint,end_min smallint,qty integer,order_id uuid,note text,transfer_batch_id uuid,transfer_stage text) where not exists(select 1 from work_assignments a where a.id=x.id);
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid();return ver+1;
end $$;

create function _guard_transfer_content() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' or new.factory<>old.factory then
   if exists(select 1 from transfer_orders where (body->'workIds') @> jsonb_build_array(old.id::text)) then raise exception '工作內容仍被跨廠加工單引用';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function _guard_transfer_content() from public,anon,authenticated;
create trigger guard_transfer_content before update or delete on work_contents for each row execute function _guard_transfer_content();

alter function schedule_snapshot(date,date) rename to _snapshot_before_transfers;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb language sql stable security invoker set search_path=public as $$
 select _snapshot_before_transfers(p_from,p_to)||jsonb_build_object(
 'transfer_orders',(select coalesce(jsonb_agg(body order by code),'[]') from transfer_orders),
 'work_assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'workId',work_id,'emp',employee_id,'resourceId',resource_id,'date',date,'s',start_min,'e',end_min,'qty',qty,'orderId',order_id,'note',note,'transferBatchId',transfer_batch_id,'transferStage',transfer_stage) order by id),'[]') from work_assignments));
$$;
revoke all on function _snapshot_before_transfers(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_transfers(date,date),schedule_snapshot(date,date) to authenticated;
alter publication supabase_realtime add table transfer_orders;

-- 0030：特別趕貨紀錄（一廠欠貨／二廠加工的現場追蹤表）＋ 工單備註進入快照
-- rush_orders 是自由格式的紀錄表（對照現場 Excel），不連動排程、不受 setup_pending 阻擋；
-- 讀取限會員，寫入只有老闆／組長經 save_rush_orders RPC（版本衝突 40001）。
create table rush_orders(id uuid primary key,body jsonb not null check(jsonb_typeof(body)='object'));
alter table rush_orders enable row level security;
create policy rush_read on rush_orders for select to authenticated using(is_member());
revoke all on rush_orders from authenticated,anon;
grant select on rush_orders to authenticated;
create trigger audit after insert or update or delete on rush_orders for each row execute function audit_trigger('id');

create function _assert_rush_order(o jsonb) returns void language plpgsql security definer set search_path=public as $$
declare f1 jsonb:=coalesce(o->'f1','{}'::jsonb);f2 jsonb:=coalesce(o->'f2','{}'::jsonb);d text;q text;
begin
 if (o->>'id') is null then raise exception '趕貨紀錄缺少 id'; end if;
 perform (o->>'id')::uuid;
 if length(o::text)>4000 then raise exception '單列趕貨紀錄過大'; end if;
 if (o->'f1' is not null and jsonb_typeof(o->'f1')<>'object') or (o->'f2' is not null and jsonb_typeof(o->'f2')<>'object') then raise exception '趕貨紀錄格式不正確'; end if;
 if greatest(coalesce(length(f1->>'vendor'),0),coalesce(length(f1->>'desc'),0),coalesce(length(f2->>'itemProcess'),0),coalesce(length(f2->>'desc'),0))>120
   or greatest(coalesce(length(f1->>'note'),0),coalesce(length(f2->>'note'),0))>200 then raise exception '趕貨紀錄文字過長'; end if;
 foreach d in array array[coalesce(f1->>'shipDate',''),coalesce(f2->>'startDate',''),coalesce(f2->>'dueDate','')] loop
   if d<>'' and (d !~ '^\d{4}-\d{2}-\d{2}$' or d::date::text<>d) then raise exception '趕貨日期格式不正確'; end if;
 end loop;
 foreach q in array array[coalesce(f1->>'shortQty',''),coalesce(f2->>'qty','')] loop
   if q<>'' and (q !~ '^\d+$' or q::bigint>1000000000) then raise exception '趕貨數量需為 0 以上的整數'; end if;
 end loop;
 if coalesce(f1->>'shipDate','')='' and coalesce(f1->>'vendor','')='' and coalesce(f1->>'desc','')='' and coalesce(f1->>'shortQty','')='' and coalesce(f1->>'note','')=''
   and coalesce(f2->>'startDate','')='' and coalesce(f2->>'dueDate','')='' and coalesce(f2->>'itemProcess','')='' and coalesce(f2->>'desc','')='' and coalesce(f2->>'qty','')='' and coalesce(f2->>'note','')=''
   then raise exception '每一列至少要填一廠欠貨或二廠加工的內容'; end if;
end $$;
revoke all on function _assert_rush_order(jsonb) from public,anon,authenticated;

create function save_rush_orders(p_version bigint,p_orders jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare ver bigint;x jsonb;cs uuid:=gen_random_uuid();
begin
 if not is_editor() then raise exception '只有老闆或組長可修改特別趕貨紀錄' using errcode='42501'; end if;
 select version into ver from schedule_state for update;
 if ver is distinct from p_version then raise exception '趕貨紀錄或排程版本已變' using errcode='40001'; end if;
 if jsonb_typeof(p_orders) is distinct from 'array' or jsonb_array_length(p_orders)>2000 or
   (select count(distinct value->>'id') from jsonb_array_elements(p_orders))<>jsonb_array_length(p_orders) then raise exception '趕貨紀錄格式或代號重複'; end if;
 if length(p_orders::text)>2000000 then raise exception '趕貨紀錄超過本版容量'; end if;
 insert into change_sets(id,kind,title,version_before,version_after) values(cs,'edit','更新特別趕貨紀錄',ver,ver+1);
 perform set_config('app.change_set_id',cs::text,true);
 for x in select value from jsonb_array_elements(p_orders) loop perform _assert_rush_order(x); end loop;
 delete from rush_orders where not exists(select 1 from jsonb_array_elements(p_orders) v where v->>'id'=rush_orders.id::text);
 insert into rush_orders(id,body) select (value->>'id')::uuid,value from jsonb_array_elements(p_orders)
   on conflict(id) do update set body=excluded.body;
 update schedule_state set version=ver+1,updated_at=now(),updated_by=auth.uid() where id;
 return ver+1;
end $$;
revoke all on function save_rush_orders(bigint,jsonb) from public,anon;
grant execute on function save_rush_orders(bigint,jsonb) to authenticated;

-- 快照：加上 rush_orders，並讓工單帶 note（orders 表本來就有 note 欄，先前未進快照）
alter function schedule_snapshot(date,date) rename to _snapshot_before_rush_orders;
create function schedule_snapshot(p_from date default current_date-7,p_to date default current_date+90) returns jsonb language sql stable security invoker set search_path=public as $$
 select _snapshot_before_rush_orders(p_from,p_to)||jsonb_build_object(
   'rush_orders',(select coalesce(jsonb_agg(body order by (body->'f1'->>'shipDate') desc nulls last),'[]') from rush_orders),
   'orders',(select coalesce(jsonb_agg(jsonb_build_object(
       'id',o.id,'code',o.code,'product',o.product_id,'qty',o.qty,'due',o.due_date::text,'priority',o.priority,'note',o.note)
       order by o.due_date,o.priority),'[]') from orders o where o.status='open'));
$$;
revoke all on function _snapshot_before_rush_orders(date,date),schedule_snapshot(date,date) from public,anon;
grant execute on function _snapshot_before_rush_orders(date,date),schedule_snapshot(date,date) to authenticated;
alter publication supabase_realtime add table rush_orders;

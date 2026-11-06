-- Keep order changes and their replacement schedule in one transaction. Caller
-- RLS still authorizes order writes; save_blocks retains schedule authorization.
create function save_orders_and_blocks(p_base_version bigint, p_orders jsonb, p_blocks jsonb,
  p_title text, p_detail jsonb default '{}', p_kind text default 'move')
returns uuid language plpgsql security invoker set search_path = public as $$
begin
  if has_permission('orders.manage') is not true or has_permission('schedule.manage') is not true then
    raise exception '沒有修改工單與排程的權限' using errcode='42501';
  end if;
  if p_base_version is null or jsonb_typeof(p_orders) is distinct from 'array'
     or jsonb_typeof(p_blocks) is distinct from 'array' then
    raise exception '工單與排程格式不正確';
  end if;
  if jsonb_array_length(p_orders)=0 then raise exception '沒有需要儲存的工單'; end if;
  if exists(select 1 from jsonb_array_elements(p_orders) o where jsonb_typeof(o) <> 'object') then
    raise exception '工單格式不正確';
  end if;
  if exists(select 1 from jsonb_array_elements(p_orders) o, jsonb_object_keys(o) k
    where k <> all(array['id','code','product_id','qty','due_date','priority','note']))
    or exists(select 1 from jsonb_array_elements(p_orders) o
      where not (o ?& array['id','code','product_id','qty','due_date','priority','note']) or o->>'id' is null) then
    raise exception '工單欄位不正確';
  end if;
  -- Order audit entries retain the existing separate audit correlation behavior:
  -- save_blocks creates its own change-set after this DML. Both roll back together.
  insert into orders(id,code,product_id,qty,due_date,priority,note)
    select x.id,x.code,x.product_id,x.qty,x.due_date,x.priority,x.note
    from jsonb_to_recordset(p_orders) x(id uuid,code text,product_id uuid,qty integer,due_date date,priority smallint,note text)
  on conflict(id) do update set code=excluded.code,product_id=excluded.product_id,
    qty=excluded.qty,due_date=excluded.due_date,priority=excluded.priority,note=excluded.note;

  -- save_blocks validates block differences. Also check every changed order:
  -- one order's quantity can change while only another order's blocks change.
  if exists(
    select 1 from jsonb_to_recordset(p_blocks) b(id uuid,order_id uuid,step_seq smallint,qty integer)
    join orders o on o.id=b.order_id
    left join work_execution w on w.block_id=b.id
    where o.id in (select (x->>'id')::uuid from jsonb_array_elements(p_orders) x)
    group by o.id,b.step_seq,o.qty
    having sum(case when w.status='done' then w.qty_done else b.qty end)>o.qty
  ) then raise exception '實際完成加待做件數超過工單件數'; end if;

  -- Any validation/version/permission failure here rolls back the order DML too.
  return save_blocks(p_base_version,p_blocks,p_title,p_detail,p_kind);
end $$;
revoke all on function save_orders_and_blocks(bigint,jsonb,jsonb,text,jsonb,text) from public,anon;
grant execute on function save_orders_and_blocks(bigint,jsonb,jsonb,text,jsonb,text) to authenticated;

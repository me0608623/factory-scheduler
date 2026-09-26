-- 稽核紀錄：每一筆資料的新增、修改、刪除都自動記下（誰、什麼時候、改前、改後、屬於哪一次變更）
-- 套用方案時，apply_plan 會設定 app.change_set_id，這次變更產生的每一筆稽核都會帶著它

create table audit_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor         uuid default auth.uid(),
  change_set_id uuid,
  table_name    text not null,
  row_id        text,
  op            text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row       jsonb,
  new_row       jsonb
);
create index audit_log_table_idx on audit_log (table_name, at desc);
create index audit_log_change_set_idx on audit_log (change_set_id);

-- 觸發器參數 = 主鍵欄位名稱（複合主鍵就給多個）
create function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cs   uuid := nullif(current_setting('app.change_set_id', true), '')::uuid;
  src  jsonb := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid  text := null;
  i    int;
begin
  if TG_OP = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;                                        -- 沒有真的改變就不記
  end if;
  for i in 0 .. TG_NARGS - 1 loop
    rid := concat_ws(':', rid, src ->> TG_ARGV[i]);
  end loop;
  insert into audit_log (change_set_id, table_name, row_id, op, old_row, new_row)
  values (cs, TG_TABLE_NAME, rid, TG_OP,
          case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) end);
  return case when TG_OP = 'DELETE' then old else new end;
end $$;

create trigger audit after insert or update or delete on employees        for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on profiles         for each row execute function audit_trigger('user_id');
create trigger audit after insert or update or delete on machines         for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on employee_skills  for each row execute function audit_trigger('employee_id', 'machine_id');
create trigger audit after insert or update or delete on products         for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on product_steps    for each row execute function audit_trigger('product_id', 'seq');
create trigger audit after insert or update or delete on machine_products for each row execute function audit_trigger('machine_id', 'product_id');
create trigger audit after insert or update or delete on calendar_weekly  for each row execute function audit_trigger('weekday');
create trigger audit after insert or update or delete on calendar_days    for each row execute function audit_trigger('date');
create trigger audit after insert or update or delete on holidays         for each row execute function audit_trigger('date');
create trigger audit after insert or update or delete on leaves           for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on machine_faults   for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on orders           for each row execute function audit_trigger('id');
create trigger audit after insert or update or delete on schedule_blocks  for each row execute function audit_trigger('id');

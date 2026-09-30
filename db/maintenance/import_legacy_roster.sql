-- Administrative, session-local importer. Take and verify a full backup first.
-- Call in a transaction, with the explicitly selected archive and observed version.
-- No public/authenticated RPC is installed. Never infer skills, rates or work times.
create function pg_temp.import_legacy_roster(p_archive uuid, p_version bigint)
returns jsonb language plpgsql as $$
declare
  src legacy_schedule_archives%rowtype;
  current_version bigint;
  cs uuid := gen_random_uuid();
  people_count int;
  machine_count int;
begin
  lock table employees, machines, products, orders, schedule_blocks in share row exclusive mode;
  select version into current_version from schedule_state for update;
  if current_version is distinct from p_version then raise exception '排程版本已變，停止匯入'; end if;
  if exists(select 1 from schedule_blocks) then raise exception '已有實際排班，停止替換名冊'; end if;
  if exists(select 1 from employees where source_ref is not null)
    or exists(select 1 from machines where source_ref is not null) then raise exception '已有來源名冊，不可重複匯入'; end if;
  select * into strict src from legacy_schedule_archives where id=p_archive;
  if jsonb_typeof(src.payload->'catalog') is distinct from 'object' then raise exception '來源缺少名冊'; end if;
  create temporary table import_stations on commit drop as
    select case f.key when '1廠' then 1 else 2 end as factory,
      s->>'cell' as cell, s->>'label' as label
    from jsonb_each(src.payload->'catalog') f,
      lateral jsonb_array_elements(f.value->'stations') s where f.key in ('1廠','2廠');
  create temporary table import_people on commit drop as
    select case f.key when '1廠' then 1 else 2 end as factory,
      p->>'cell' as cell, trim(part.name) as name, part.position
    from jsonb_each(src.payload->'catalog') f,
      lateral jsonb_array_elements(f.value->'people') p,
      lateral unnest(case when p->>'label' like '包裝-%+%'
        then string_to_array(substr(p->>'label',4),'+') else array[p->>'label'] end)
        with ordinality part(name,position) where f.key in ('1廠','2廠');
  if not exists(select 1 from import_stations) or not exists(select 1 from import_people)
    or exists(select 1 from import_stations where cell !~ '^[A-Z]+[1-9][0-9]*$' or nullif(trim(label),'') is null)
    or exists(select 1 from import_people where cell !~ '^[A-Z]+[1-9][0-9]*$' or nullif(name,'') is null)
    then raise exception '名冊欄位缺漏或格式錯誤'; end if;
  select count(*) into people_count from import_people;
  select count(*) into machine_count from import_stations;
  insert into change_sets(id,kind,title,summary,detail,version_before,version_after)
    values(cs,'import',src.source_name||' 名冊匯入（待確認）',
      '舊資料停用保留；未建立工單、技能或排班',
      jsonb_build_object('source_archive',src.id,'employees',people_count,'stations',machine_count),current_version,current_version+1);
  perform set_config('app.change_set_id',cs::text,true);
  update employees set active=false where active;
  update machines set active=false where active;
  update products set active=false where active;
  update orders set status='cancelled',note=concat_ws(E'\n',note,'原檔名冊替换：舊工單保留，不參與目前排程') where status='open';
  insert into processes(name) values('待確認') on conflict do nothing;
  insert into machines(id,label,process,factory,review_status,source_ref)
    select 'f'||factory||lower(regexp_replace(cell,'[0-9]','','g')),label,'待確認',factory,'pending',
      src.source_name||' · '||factory||'廠!'||cell from import_stations order by factory,cell;
  insert into employees(code,name,color,no_overtime,overtime_weekdays,factory,review_status,source_ref)
    select 'legacy-f'||factory||'-'||lower(cell)||'-'||position,name,
      ((row_number() over(order by factory,cell,position)-1)%8)::smallint,true,array[]::smallint[],factory,'pending',
      src.source_name||' · '||factory||'廠!'||cell from import_people order by factory,cell,position;
  update schedule_state set version=current_version+1,setup_pending=true,updated_at=now() where id;
  return jsonb_build_object('employees',people_count,'stations',machine_count,'version',current_version+1,'setup_pending',true);
end $$;
revoke all on function pg_temp.import_legacy_roster(uuid,bigint) from public;

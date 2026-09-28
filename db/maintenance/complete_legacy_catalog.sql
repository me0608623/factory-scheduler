-- Administrative session-local completion, never an authenticated/public RPC.
-- A verified full backup is required before calling in a single transaction.
create function pg_temp.complete_legacy_catalog(p_archive uuid,p_hash text,p_version bigint,p_people jsonb,p_resources jsonb)
returns jsonb language plpgsql as $$
declare
  src legacy_schedule_archives%rowtype;
  observed_version bigint;
  p jsonb;
  r jsonb;
  pos jsonb;
  target employees%rowtype;
  matches int;
  added int:=0;
  held int:=0;
  cs uuid:=gen_random_uuid();
  refs jsonb;
begin
  lock table employees,machines,products,orders,schedule_blocks in share row exclusive mode;
  select version into observed_version from schedule_state for update;
  if observed_version is distinct from p_version then raise exception '排程版本已變，停止補齊'; end if;
  if not (select setup_pending from schedule_state) then raise exception '名冊已開放排程，停止補齊'; end if;
  if exists(select 1 from schedule_blocks) or exists(select 1 from orders where status='open') then
    raise exception '已有工單或排班，停止補齊'; end if;
  select * into strict src from legacy_schedule_archives where id=p_archive and source_sha256=p_hash;
  if (select count(*) from employees where active)<>20
    or (select count(*) from employees where active and source_ref like src.source_name||' · %')<>20
    or (select count(*) from machines where active)<>45
    or (select count(*) from machines where active and source_ref like src.source_name||' · %')<>45
    or exists(select 1 from employees where active and (review_status<>'pending' or source_employee_code is not null or identity_candidates<>'[]')) then
    raise exception '名冊已變或已補齊，不可重複執行'; end if;
  if jsonb_typeof(p_people) is distinct from 'array' or jsonb_array_length(p_people)<>30
    or jsonb_typeof(p_resources) is distinct from 'array' or jsonb_array_length(p_resources)<>38 then
    raise exception '補齊資料數量錯誤'; end if;
  if (select count(*) from jsonb_array_elements(p_people) x where x->>'action'='propose_add_pending')<>10
    or (select count(*) from jsonb_array_elements(p_people) x where x->>'action'='hold_alias_mapping')<>4 then
    raise exception '新增與待對照分類錯誤'; end if;
  if exists(select 1 from jsonb_array_elements(p_people) x where nullif(trim(x->>'name'),'') is null
      or coalesce(x->>'factory','') not in ('1','2') or nullif(trim(x->>'source'),'') is null
      or coalesce(x->>'action','') not in ('propose_add_pending','retain','retain_and_propose_source_code','propose_name_note_split','hold_alias_mapping'))
    or (select count(distinct (x->>'factory',x->>'name')) from jsonb_array_elements(p_people) x)<>30 then
    raise exception '人員對照有缺漏或重複'; end if;
  create temporary table completion_targets(id uuid primary key) on commit drop;
  create temporary table completion_positions(id text primary key) on commit drop;
  insert into change_sets(id,kind,title,summary,detail,version_before,version_after)
    values(cs,'import',src.source_name||' 全檔名冊補齊（待確認）',
      '新增10個人員候選；保留原身份、4組別名待核對；未啟用排程',
      jsonb_build_object('source_archive',src.id,'added',10,'held_aliases',4,'positions',45),p_version,p_version+1);
  perform set_config('app.change_set_id',cs::text,true);
  for p in select value from jsonb_array_elements(p_people) loop
    refs:=jsonb_build_array(src.source_name||' · '||(p->>'source'));
    if p->>'action'='propose_add_pending' then
      if exists(select 1 from employees where factory=(p->>'factory')::int and name=p->>'name') then
        raise exception '同名人員已存在（含停用），停止新增'; end if;
      insert into employees(code,name,factory,color,no_overtime,overtime_weekdays,review_status,source_ref,
        source_employee_code,catalog_sources)
        values('catalog-'||gen_random_uuid(),p->>'name',(p->>'factory')::int,(added%8)::smallint,true,
          array[]::smallint[],'pending',src.source_name||' · '||(p->>'source'),p->>'source_code',refs)
        returning * into target;
      added:=added+1;
    else
      select count(*) into matches from employees where active and factory=(p->>'factory')::int
        and name=p->>'current_name' and source_ref like src.source_name||' · %';
      if matches<>1 then raise exception '既有人員對照不唯一或已改名，停止補齊'; end if;
      select * into strict target from employees where active and factory=(p->>'factory')::int
        and name=p->>'current_name' and source_ref like src.source_name||' · %';
      if p->>'action'='hold_alias_mapping' then
        update employees set identity_candidates=jsonb_build_array(jsonb_build_object(
          'name',p->>'name','source_employee_code',p->>'source_code','source_ref',src.source_name||' · '||(p->>'source'),'status','pending'))
          where id=target.id;
        held:=held+1;
      else
        update employees set source_employee_code=p->>'source_code',
          name=case when p->>'action'='propose_name_note_split' then p->>'name' else name end,
          source_notes=case when p->>'action'='propose_name_note_split' then concat_ws(E'\n',source_notes,p->>'preserved_note') else source_notes end,
          catalog_sources=catalog_sources||refs
          where id=target.id;
      end if;
    end if;
    insert into completion_targets values(target.id);
  end loop;
  for r in select value from jsonb_array_elements(p_resources) loop
    if nullif(trim(r->>'proposed_parent_key'),'') is null then raise exception '資源群組缺漏'; end if;
    for pos in select value from jsonb_array_elements(r->'positions') loop
      insert into completion_positions values(pos->>'current_id');
      update machines set catalog_group=r->>'proposed_parent_key',catalog_side=pos->>'side'
        where id=pos->>'current_id' and active and factory=(r->>'factory')::int
          and source_ref like src.source_name||' · %';
      if not found then raise exception '機台位置已變，停止補齊'; end if;
    end loop;
  end loop;
  if added<>10 or held<>4 or (select count(*) from completion_targets)<>30
    or (select count(*) from completion_positions)<>45
    or (select count(distinct catalog_group) from machines where active)<>38
    or (select count(*) from machines where active and catalog_side='左')<>7
    or (select count(*) from machines where active and catalog_side='右')<>7
    or exists(select 1 from machines where active group by catalog_group having
      not (count(*)=1 and count(catalog_side)=0) and
      not (count(*)=2 and count(*) filter(where catalog_side='左')=1 and count(*) filter(where catalog_side='右')=1))
    or (select count(*) from employees where active and factory=1)<>13
    or (select count(*) from employees where active and factory=2)<>17 then
    raise exception '补齊後數量不符，整筆交易撤回'; end if;
  update schedule_state set version=p_version+1,setup_pending=true,updated_at=now();
  return jsonb_build_object('added',added,'held_aliases',held,'employees',30,'positions',45,'setup_pending',true,'version',p_version+1);
end $$;
revoke all on function pg_temp.complete_legacy_catalog(uuid,text,bigint,jsonb,jsonb) from public;

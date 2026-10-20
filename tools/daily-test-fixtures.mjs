// Idempotent production-like schedules for the isolated Supabase project only.
// Uses existing test machines and employees; never targets production.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const TEST_URL='https://fkefarcwadvyqqjcjxvp.supabase.co';
export const LEGACY_EMPLOYEE_ID='05ca5556-1a60-4d11-8a40-6fd8c76f0001';
export const LEGACY_PRODUCT_ID='05ca5556-1a60-4d11-8a40-6fd8c76f0002';
export const LEGACY_MACHINE_ID='tstdaily';
export const FIXTURE_MACHINE_IDS=['tst01','tst02','tst03','tst04','tst05'];
const DAY_MS=86400000;

export function assertDailyTestTarget(url){
  if(String(url).replace(/\/$/,'')!==TEST_URL)throw new Error('模擬正式排班只允許獨立測試專案；禁止正式資料庫');
}

export function isoDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('日期格式必須是 YYYY-MM-DD');
  const date=new Date(`${value}T00:00:00Z`);
  if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==value)throw new Error('日期不存在');
  return value;
}

const addDays=(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*DAY_MS).toISOString().slice(0,10);
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
export function dailyFixtureSql({url,start,days=397}){
  assertDailyTestTarget(url);start=isoDay(start);days=Number(days);
  if(!Number.isInteger(days)||days<1||days>400)throw new Error('days 必須介於 1 到 400');
  const end=addDays(start,days-1);
  const machineList=FIXTURE_MACHINE_IDS.map(quote).join(',');
  return `-- ONLY ${TEST_URL}; production-like synthetic schedules on existing test resources.
-- Range ${start} through ${end} (${days} calendar days); 10 blocks per day.
begin;
lock table schedule_state in exclusive mode;
do $$
declare changed integer := 0; affected integer := 0; before_version bigint;
        work_date date; machine_row record; employee_row record;
        machine_index integer := 0; v_product_id uuid; v_order_id uuid;
        morning_start smallint; morning_end smallint; afternoon_start smallint; afternoon_end smallint;
begin
  if (select count(*) from machines where id in (${machineList}) and active)<>${FIXTURE_MACHINE_IDS.length} then
    raise exception '缺少一台或多台既有測試機台 tst01–tst05，停止建立模擬排班';
  end if;
  if (select count(*) from employees where active and name like '測試-%')<5 then
    raise exception '既有測試人員不足 5 人，停止建立模擬排班';
  end if;

  -- Remove only the earlier fixture owned by this tool. No user/imported rows match these IDs.
  delete from schedule_blocks where order_id in (select id from orders where product_id='${LEGACY_PRODUCT_ID}'::uuid);
  get diagnostics affected = row_count; changed := changed + affected;
  delete from orders where product_id='${LEGACY_PRODUCT_ID}'::uuid;
  get diagnostics affected = row_count; changed := changed + affected;
  delete from employee_skills where employee_id='${LEGACY_EMPLOYEE_ID}'::uuid or machine_id='${LEGACY_MACHINE_ID}';
  get diagnostics affected = row_count; changed := changed + affected;
  delete from machine_products where machine_id='${LEGACY_MACHINE_ID}' or product_id='${LEGACY_PRODUCT_ID}'::uuid;
  get diagnostics affected = row_count; changed := changed + affected;
  delete from product_steps where product_id='${LEGACY_PRODUCT_ID}'::uuid;
  get diagnostics affected = row_count; changed := changed + affected;
  delete from products where id='${LEGACY_PRODUCT_ID}'::uuid;
  get diagnostics affected = row_count; changed := changed + affected;
  delete from machines where id='${LEGACY_MACHINE_ID}';
  get diagnostics affected = row_count; changed := changed + affected;
  delete from employees where id='${LEGACY_EMPLOYEE_ID}'::uuid;
  get diagnostics affected = row_count; changed := changed + affected;

  for machine_row in
    select id,label,process,factory from machines where id in (${machineList}) and active order by id
  loop
    machine_index := machine_index + 1;
    select id,name into strict employee_row from employees
      where active and name like '測試-%' order by code nulls last,id offset machine_index-1 limit 1;
    v_product_id := md5('factory-scheduler-realistic-v1/product/'||machine_row.id)::uuid;
    insert into products(id,code,name,active)
      values(v_product_id,'SIM-'||upper(machine_row.id),'模擬量產件－'||machine_row.label,true)
      on conflict(id) do nothing;
    get diagnostics affected = row_count; changed := changed + affected;
    insert into product_steps(product_id,seq,process,rate,transfer_batch,factory)
      values(v_product_id,0,machine_row.process,1,0,machine_row.factory)
      on conflict(product_id,seq) do nothing;
    get diagnostics affected = row_count; changed := changed + affected;
    insert into employee_skills(employee_id,machine_id) values(employee_row.id,machine_row.id) on conflict do nothing;
    get diagnostics affected = row_count; changed := changed + affected;
    insert into machine_products(machine_id,product_id) values(machine_row.id,v_product_id) on conflict do nothing;
    get diagnostics affected = row_count; changed := changed + affected;

    morning_start := 480 + ((machine_index-1)%3)*10;
    morning_end := 720;
    afternoon_start := 780;
    afternoon_end := 1020 - ((machine_index-1)%3)*10;
    for work_date in select generate_series(${quote(start)}::date,${quote(end)}::date,interval '1 day')::date loop
      insert into calendar_days(date,is_open,overtime,note)
        values(work_date,true,false,'測試模式模擬正式排班')
        on conflict(date) do update set is_open=true,updated_at=now(),
          note=case when calendar_days.note is null
                         or calendar_days.note like '測試模式每日練習%'
                         or calendar_days.note like '測試模式模擬正式排班%'
                    then excluded.note else calendar_days.note end
        where calendar_days.is_open is distinct from true
           or calendar_days.note like '測試模式每日練習%';
      get diagnostics affected = row_count; changed := changed + affected;
      v_order_id := md5('factory-scheduler-realistic-v1/order/'||work_date::text||'/'||machine_row.id)::uuid;
      insert into orders(id,code,product_id,qty,due_date,priority,note)
        values(v_order_id,'SIM-'||to_char(work_date,'YYYYMMDD')||'-'||lpad(machine_index::text,2,'0'),
          v_product_id,360,work_date+2,case when machine_index=1 then 1 else 2 end,
          '隔離測試環境的模擬量產工單') on conflict(id) do nothing;
      get diagnostics affected = row_count; changed := changed + affected;
      insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty,pinned)
        values
          (md5('factory-scheduler-realistic-v1/block/am/'||work_date::text||'/'||machine_row.id)::uuid,
           v_order_id,0,machine_row.id,employee_row.id,work_date,morning_start,morning_end,180,false),
          (md5('factory-scheduler-realistic-v1/block/pm/'||work_date::text||'/'||machine_row.id)::uuid,
           v_order_id,0,machine_row.id,employee_row.id,work_date,afternoon_start,afternoon_end,180,false)
        on conflict(id) do nothing;
      get diagnostics affected = row_count; changed := changed + affected;
    end loop;
  end loop;

  if changed>0 then
    select version into before_version from schedule_state where id;
    insert into change_sets(kind,title,summary,detail,version_before,version_after)
      values('import','建立模擬正式排班',${quote(`${start} 至 ${end}，每日 5 台既有機台、10 段班表`)},
        jsonb_build_object('synthetic',true,'project','${TEST_URL}','start','${start}','end','${end}',
                           'days',${days},'blocks_per_day',10,'legacy_fixture_removed',true),
        before_version,before_version+1);
    update schedule_state set version=before_version+1,updated_at=now(),updated_by=null where id;
  end if;
end $$;
commit;
select count(*) as simulated_blocks,min(date) as first_date,max(date) as last_date,
       count(distinct machine_id) as machines
  from schedule_blocks
 where id in (select md5('factory-scheduler-realistic-v1/block/'||shift||'/'||d::date::text||'/'||m)::uuid
                from generate_series(${quote(start)}::date,${quote(end)}::date,interval '1 day') d
                cross join unnest(array['am','pm']) shift
                cross join unnest(array[${machineList}]) m);
`;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).reduce((out,value,index,all)=>{
    if(value.startsWith('--'))out.push([value.slice(2),all[index+1]]);return out;
  },[]));
  process.stdout.write(dailyFixtureSql({url:args.url,start:args.start,days:args.days??397}));
}

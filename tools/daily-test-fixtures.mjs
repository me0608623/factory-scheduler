// Additive, idempotent practice data for the isolated Supabase project only.
// Never reads credentials, deletes rows, or targets production.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const TEST_URL='https://fkefarcwadvyqqjcjxvp.supabase.co';
export const FIXTURE_EMPLOYEE_ID='05ca5556-1a60-4d11-8a40-6fd8c76f0001';
export const FIXTURE_PRODUCT_ID='05ca5556-1a60-4d11-8a40-6fd8c76f0002';
export const FIXTURE_MACHINE_ID='tstdaily';
const DAY_MS=86400000;

export function assertDailyTestTarget(url){
  if(String(url).replace(/\/$/,'')!==TEST_URL)throw new Error('每日練習資料只允許獨立測試專案；禁止正式資料庫');
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
  const dates=Array.from({length:days},(_,i)=>addDays(start,i));
  const end=dates.at(-1);
  return `-- ONLY ${TEST_URL}; additive synthetic daily practice data.
-- Range ${dates[0]} through ${dates.at(-1)} (${days} calendar days).
begin;
lock table schedule_state in exclusive mode;
do $$
declare changed integer := 0; affected integer := 0; before_version bigint; work_date date;
begin
  if exists(select 1 from employees where id='${FIXTURE_EMPLOYEE_ID}'::uuid and name<>'測試-每日拖曳') then
    raise exception '每日練習員工識別衝突，停止執行';
  end if;
  if exists(select 1 from products where id='${FIXTURE_PRODUCT_ID}'::uuid and name<>'每日拖曳練習品') then
    raise exception '每日練習產品識別衝突，停止執行';
  end if;
  if exists(select 1 from machines where id='${FIXTURE_MACHINE_ID}' and label<>'每日拖曳練習機') then
    raise exception '每日練習機台識別衝突，停止執行';
  end if;

  insert into processes(name) values('組裝') on conflict(name) do nothing;
  get diagnostics affected = row_count; changed := changed + affected;
  insert into employees(id,code,name,color,no_overtime,active,overtime_weekdays,max_concurrent_machines,factory,review_status)
    values('${FIXTURE_EMPLOYEE_ID}'::uuid,'TEST-DAY','測試-每日拖曳',4,false,true,array[0,1,2,3,4,5,6]::smallint[],1,1,'confirmed')
    on conflict(id) do nothing;
  get diagnostics affected = row_count; changed := changed + affected;
  insert into machines(id,label,process,active,factory,review_status)
    values('${FIXTURE_MACHINE_ID}','每日拖曳練習機','組裝',true,1,'confirmed') on conflict(id) do nothing;
  get diagnostics affected = row_count; changed := changed + affected;
  insert into products(id,code,name,active)
    values('${FIXTURE_PRODUCT_ID}'::uuid,'TEST-DAILY','每日拖曳練習品',true) on conflict(id) do nothing;
  get diagnostics affected = row_count; changed := changed + affected;
  insert into product_steps(product_id,seq,process,rate,transfer_batch,factory)
    values('${FIXTURE_PRODUCT_ID}'::uuid,0,'組裝',1,0,1) on conflict(product_id,seq) do nothing;
  get diagnostics affected = row_count; changed := changed + affected;
  insert into employee_skills(employee_id,machine_id)
    values('${FIXTURE_EMPLOYEE_ID}'::uuid,'${FIXTURE_MACHINE_ID}') on conflict do nothing;
  get diagnostics affected = row_count; changed := changed + affected;
  insert into machine_products(machine_id,product_id)
    values('${FIXTURE_MACHINE_ID}','${FIXTURE_PRODUCT_ID}'::uuid) on conflict do nothing;
  get diagnostics affected = row_count; changed := changed + affected;

  for work_date in select generate_series(${quote(start)}::date,${quote(end)}::date,interval '1 day')::date loop
    insert into calendar_days(date,is_open,overtime,note)
      values(work_date,true,false,'測試模式每日練習')
      on conflict(date) do update set is_open=true,updated_at=now(),
        note=case when calendar_days.note is null or calendar_days.note like '測試模式每日練習%'
                  then excluded.note else calendar_days.note end
      where calendar_days.is_open is distinct from true;
    get diagnostics affected = row_count; changed := changed + affected;
    insert into orders(id,code,product_id,qty,due_date,priority,note)
      values(md5('factory-scheduler-daily-practice-v1/order/'||work_date::text)::uuid,
        'TEST-DAY-'||to_char(work_date,'YYYYMMDD'),'${FIXTURE_PRODUCT_ID}'::uuid,30,work_date,2,
        '每日拖曳練習；僅限隔離測試環境') on conflict(id) do nothing;
    get diagnostics affected = row_count; changed := changed + affected;
    insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty,pinned)
      values(md5('factory-scheduler-daily-practice-v1/block/'||work_date::text)::uuid,
        md5('factory-scheduler-daily-practice-v1/order/'||work_date::text)::uuid,0,
        '${FIXTURE_MACHINE_ID}','${FIXTURE_EMPLOYEE_ID}'::uuid,work_date,540,570,30,false)
      on conflict(id) do nothing;
    get diagnostics affected = row_count; changed := changed + affected;
  end loop;

  if changed>0 then
    select version into before_version from schedule_state where id;
    insert into change_sets(kind,title,summary,detail,version_before,version_after)
      values('import','建立每日拖曳練習班表',
        ${quote(`${dates[0]} 至 ${dates.at(-1)}，共 ${days} 天`)},
        jsonb_build_object('synthetic',true,'project','${TEST_URL}','start','${dates[0]}','end','${dates.at(-1)}','days',${days}),
        before_version,before_version+1);
    update schedule_state set version=before_version+1,updated_at=now(),updated_by=null where id;
  end if;
end $$;
commit;
select count(*) as daily_practice_blocks,
       min(date) as first_date,max(date) as last_date
  from schedule_blocks where machine_id='${FIXTURE_MACHINE_ID}';
`;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).reduce((out,value,index,all)=>{
    if(value.startsWith('--'))out.push([value.slice(2),all[index+1]]);return out;
  },[]));
  process.stdout.write(dailyFixtureSql({url:args.url,start:args.start,days:args.days??397}));
}

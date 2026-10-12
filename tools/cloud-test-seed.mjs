// Offline preparation only. Never reads credentials or writes to a database.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTestSeed} from '../web/tests/test-seed.mjs';
import {rowsOf,UPSERT_ORDER} from '../web/src/store/diff.js';
import {toSnapshot,blockFromDb,blockToDb} from '../web/src/convert.js';
export const TEST_URL='https://fkefarcwadvyqqjcjxvp.supabase.co';
export function assertTestTarget(url){if(String(url).replace(/\/$/,'')!==TEST_URL)throw new Error('只允許已指定的獨立測試專案；禁止正式資料庫');}
const addDays=(ds,n)=>new Date(Date.parse(ds+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function testId(id){
  const h=createHash('sha256').update('factory-scheduler-cloud-test-v1/'+id).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function cloudSeed(today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||addDays(today,0)!==today)throw new Error('測試基準日不正確');
  const s=buildTestSeed(today,addDays);
  const mid=id=>'tst'+id.slice(-2);
  for(const e of s.employees){e.id=testId(e.id);e.skills=e.skills.map(mid);}
  for(const m of s.machines){m.id=mid(m.id);m.products=m.products.map(testId);m.faults=m.faults.map((f,i)=>({...f,id:testId(m.id+'/fault/'+i)}));}
  // The local fixture omitted mould compatibility for its cross-factory steps.
  s.machines.find(m=>m.id==='tst06').products.push(testId('t-p1'));
  s.machines.find(m=>m.id==='tst07').products.push(testId('t-p3'));
  for(const p of s.products)p.id=testId(p.id);
  for(const o of s.orders){o.id=testId(o.id);o.pid=testId(o.pid);}
  for(const g of s.groups)g.id=testId(g.id);
  s.groupMembers=s.employees.map(e=>({employeeId:e.id,groupId:s.groups[e.factory===2?1:0].id,reviewStatus:'confirmed'}));
  for(const r of s.rushOrders)r.id=testId(r.id);
  s.setupPending=false;return s;
}
const jsonColumns=new Set(['catalog_sources','identity_candidates','original_blocks']);
const literal=(v,column)=>v==null?'NULL':typeof v==='boolean'?(v?'true':'false'):typeof v==='number'?String(v):
  Array.isArray(v)&&!jsonColumns.has(column)?(v.length?'ARRAY['+v.map(x=>literal(x)).join(',')+']':"'{}'"):
  "'"+String(typeof v==='object'?JSON.stringify(v):v).replace(/'/g,"''")+"'";
function insert(table,rows,conflict=''){
  if(!rows.length)return '';
  const cols=Object.keys(rows[0]);
  return `insert into ${table} (${cols.join(',')}) values\n`+rows.map(r=>'('+cols.map(c=>literal(r[c],c)).join(',')+')').join(',\n')+conflict+';\n';
}
export function seedSql(s,url){
  assertTestTarget(url);if(!s.blocks.length)throw new Error('必須先計算有效班表，不能交付空表');
  const tables=rowsOf(s);
  let sql=`-- ONLY ${TEST_URL}; synthetic data. No credentials. No DELETE/TRUNCATE.\nbegin;\nlock table schedule_state in exclusive mode;\n`;
  sql+=`do $$ declare missing text; begin
    select string_agg(t, ', ' order by t) into missing
      from unnest(array['account_permissions','leave_requests','schedule_memos','rush_orders','work_log','machine_layout']) t
      where to_regclass('public.'||t) is null;
    if missing is not null then
      raise exception '測試 schema 尚未升級，缺少 %；請先完成 migration 0025–0036', missing; end if;
    if exists(select 1 from employees where source_ref is not null or catalog_sources<>'[]'::jsonb) then
      raise exception '此環境有原始名冊，停止匯入測試資料'; end if;
    if exists(select 1 from employees where id=${literal(s.employees[0].id)}::uuid) then
      raise exception '測試資料已存在，禁止重置使用者的測試改動'; end if;
  end $$;\n`;
  // Only staging's review gate changes. Production is never a permitted target.
  sql+='update schedule_state set setup_pending=false where id;\n';
  for(const table of UPSERT_ORDER){
    if(table==='calendar_weekly'||table==='calendar_days')continue;
    const rows=[...(tables[table]?.values()||[])];
    sql+=insert(table,rows,table==='processes'?' on conflict (name) do nothing':'');
  }
  sql+=insert('staff_groups',s.groups.map(g=>({id:g.id,name:g.name,department:g.department,home_factory:g.homeFactory})));
  sql+=insert('staff_group_members',s.groupMembers.map(m=>({group_id:m.groupId,employee_id:m.employeeId,review_status:m.reviewStatus})));
  sql+=insert('rush_orders',s.rushOrders.map(r=>({id:r.id,body:JSON.stringify(r)})));
  sql+=insert('schedule_blocks',s.blocks.map(blockToDb));
  sql+='update schedule_state set version=version+1,updated_at=now() where id;\ncommit;\n';
  sql+="select count(*) as test_employees from employees where name like '測試-%';\nselect count(*) as test_blocks from schedule_blocks where machine_id like 'tst%';\n";
  return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,x)=>{if(v.startsWith('--'))a.push([v.slice(2),x[i+1]]);return a;},[]));
  assertTestTarget(args.url);
  const s=cloudSeed(args.today),now={date:s.orders[0].due,min:480};
  // Calculate from the same Monday used by the seed, not from an order deadline.
  now.date=addDays(s.orders[0].due,-6);
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const call=request=>{
    const r=spawnSync(args.python||'python',['-m','scripts.plan_stdio'],{cwd:resolve(root,'solver'),env:process.env,input:JSON.stringify(request),encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
    if(r.status!==0)throw new Error(r.stderr||r.error?.message||'solver failed');return JSON.parse(r.stdout);
  };
  const plan=call({snapshot:toSnapshot(s),event:{type:'auto'},now,time_limit:3});
  const opt=plan.options.find(o=>o.applicable&&o.blocks.length&&o.solver_method!=='keep');
  if(!opt)throw new Error('沒有可用的OR-Tools方案，停止準備');
  s.blocks=opt.blocks.map(blockFromDb);s.blocks[0].pin=true;
  const issues=call({mode:'check',snapshot:toSnapshot(s),now}).issues;
  if(issues.length)throw new Error('預排班表未通過驗證，停止準備');
  const out=resolve(args.out||resolve(root,'outputs/cloud-test-seed'));mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,'seed.json'),JSON.stringify(s,null,2));
  writeFileSync(resolve(out,'seed.sql'),seedSql(s,args.url));
  console.log(JSON.stringify({project:TEST_URL,date:now.date,employees:s.employees.length,machines:s.machines.length,orders:s.orders.length,blocks:s.blocks.length,issues:issues.length,out}));
}

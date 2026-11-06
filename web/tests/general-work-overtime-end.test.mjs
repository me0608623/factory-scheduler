import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {assignments,validateGeneralWork,workWindows} from '../src/general-work.js';
import {overtimeAllowed,overtimeDefault} from '../src/overtime.js';
import {LocalStore} from '../src/store/local.js';
import {makeDb} from './fake-supabase.mjs';

const day='2099-01-05';
function state(){return {version:0,cal:{week:Array(7).fill(true),over:{}},dayOT:{[day]:1200},
  employees:[{id:'e',name:'Employee',factory:1,skills:[],leaves:[],maxMachines:1,noOT:false}],
  machines:[],products:[],orders:[],blocks:[],log:[],
  workContents:[{id:'w',name:'Inspection',factory:1,requiresResource:false,employeeIds:['e'],resourceIds:[],reviewStatus:'confirmed'}],
  workAssignments:[{id:'a',workId:'w',emp:'e',resourceId:null,date:day,s:1080,e:1140,qty:null,orderId:null,note:''}]};}
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const at=source.indexOf('function saveDailyOT('),code=source.slice(at,source.indexOf('\n}',at)+2);
function editor(S,{end=1080,open=true,available=null,today='2099-01-01'}={}){
  const calls={commit:[],toast:[],undo:0,close:0,repair:0};
  const ctx={S,canCalendar:()=>true,readOnly:false,REG_END:1020,DAY1:1200,assignments,validateGeneralWork,
    overtimeAllowed,overtimeDefault,todayStr:()=>today,emp:id=>S.employees.find(e=>e.id===id),
    futureOf:a=>a.date>=today,mdw:x=>x,$:()=>({value:String(end)}),
    pushUndo:()=>calls.undo++,closeModal:()=>calls.close++,toast:x=>calls.toast.push(x),
    commit:x=>calls.commit.push(x),repair:()=>{calls.repair++;return [];},showResult:()=>{},
    dayInfo:date=>({win:workWindows(S,date)})};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {calls,save:()=>ctx.saveDailyOT({date:day,open,otEnd:end,overrides:{e:available}})};
}

test('general-work windows honor shortened and extended numeric overtime ends',()=>{
  for(const end of [1020,1080,1140,1260,1320]){
    const S=state();S.dayOT[day]=end;
    assert.equal(workWindows(S,day).at(-1).e,end);
    S.workAssignments[0].s=1020;S.workAssignments[0].e=end;
    if(end>1020)assert.doesNotThrow(()=>validateGeneralWork(S));
    S.workAssignments[0].e=end+1;
    assert.throws(()=>validateGeneralWork(S),/未開放上班時段/);
  }
});

test('legacy true means 20:00 and disabled overtime provides no evening window',()=>{
  const S=state();S.dayOT[day]=true;assert.equal(workWindows(S,day).at(-1).e,1200);
  S.dayOT[day]=false;assert.equal(workWindows(S,day).at(-1).e,1020);
  assert.throws(()=>validateGeneralWork(S),/未開放上班時段/);
});

test('shortening overtime cannot persist an existing future general assignment beyond the end',async()=>{
  const beforeStorage=globalThis.localStorage,data=new Map();
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{
    const S=state(),store=new LocalStore();await store.sync(S);const saved=data.get('fsched-local-v1');
    const candidate=structuredClone(S);candidate.dayOT[day]=1080;
    await assert.rejects(store.sync(candidate),/未開放上班時段/);
    assert.equal(data.get('fsched-local-v1'),saved);
  }finally{globalThis.localStorage=beforeStorage;}
});

for(const options of [{end:1080},{end:1080,today:day},{open:false},{end:1200,available:false}]){
  test('overtime editor rejects conflicting general work before changing state: '+JSON.stringify(options),()=>{
    const S=state(),before=JSON.stringify(S),f=editor(S,options);f.save();
    assert.equal(JSON.stringify(S),before);assert.equal(f.calls.undo,0);
    assert.equal(f.calls.commit.length,0);assert.equal(f.calls.close,0);assert.equal(f.calls.repair,0);
    assert.match(f.calls.toast.join(),/一般工作/);
  });
}

test('removing an overtime override restores the weekly default before preflight',()=>{
  const S=state();S.employees[0].noOT=true;S.employees[0].otOverrides={[day]:true};
  const before=JSON.stringify(S),f=editor(S,{end:1200,available:null});f.save();
  assert.equal(JSON.stringify(S),before);assert.equal(f.calls.commit.length,0);
  assert.equal(f.calls.undo,0);assert.match(f.calls.toast.join(),/一般工作/);
});

test('an assignment ending at the selected cutoff remains valid and the editor saves once',()=>{
  const S=state();S.workAssignments[0].s=1020;S.workAssignments[0].e=1080;
  const before=JSON.stringify(S.workAssignments),f=editor(S);f.save();
  assert.equal(S.dayOT[day],1080);assert.equal(f.calls.commit.length,1);
  assert.equal(JSON.stringify(S.workAssignments),before);assert.equal(f.calls.repair,0);
});

test('a date with no general assignments and unchanged historical assignments can still change overtime',()=>{
  for(const historical of [false,true]){
    const S=state();if(!historical)S.workAssignments[0].date='2099-01-06';
    const f=editor(S,{today:historical?'2099-01-06':'2099-01-01'});f.save();
    assert.equal(S.dayOT[day],1080);assert.equal(f.calls.commit.length,1);
  }
});

test('SQL assignment guard honors shortened, extended and legacy overtime endpoints',async()=>{
  const db=await makeDb();
  try{
    const emp=(await db.query("select id from employees where active order by id limit 1")).rows[0].id;
    const work='00000000-0000-4000-8000-0000000000ff';
    await db.query("update schedule_state set setup_pending=false where id");
    await db.query("insert into work_contents(id,name,factory,requires_resource,employee_ids,resource_ids,review_status) select $1,'Test work',factory,false,array[id],'{}','confirmed' from employees where id=$2",[work,emp]);
    await db.query("insert into calendar_days(date,is_open,overtime,overtime_end) values($1,true,true,1080)",[day]);
    await db.query("insert into employee_overtime_days(employee_id,date,available) values($1,$2,true)",[emp,day]);
    const insert=(s,e)=>db.query("insert into work_assignments(id,work_id,employee_id,date,start_min,end_min) values($1,$2,$3,$4,$5,$6) returning id",[crypto.randomUUID(),work,emp,day,s,e]);
    await assert.rejects(insert(1080,1140),/未開放上班時段/);
    await assert.rejects(insert(1020,1081),/未開放上班時段/);
    const valid=await insert(1020,1080);
    await assert.rejects(db.query('update work_assignments set end_min=1081 where id=$1',[valid.rows[0].id]),/未開放上班時段/);
    assert.equal((await db.query('select end_min from work_assignments where id=$1',[valid.rows[0].id])).rows[0].end_min,1080);
    await db.query('delete from work_assignments where id=$1',[valid.rows[0].id]);
    await db.query('update calendar_days set overtime_end=1260 where date=$1',[day]);
    const extended=await insert(1200,1260);await db.query('delete from work_assignments where id=$1',[extended.rows[0].id]);
    await assert.rejects(insert(1200,1261),/未開放上班時段/);
    await db.query('update calendar_days set overtime_end=null where date=$1',[day]);
    const legacy=await insert(1140,1200);await db.query('delete from work_assignments where id=$1',[legacy.rows[0].id]);
    await assert.rejects(insert(1140,1201),/未開放上班時段/);
    await db.query('update calendar_days set overtime=false where date=$1',[day]);
    await assert.rejects(insert(1020,1080),/未開放上班時段/);
    const acl=(await db.query("select has_function_privilege('authenticated','_guard_work_assignment()','execute') authenticated,has_function_privilege('anon','_guard_work_assignment()','execute') anon,exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) a where p.oid='_guard_work_assignment()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') public")).rows[0];
    assert.deepEqual(acl,{authenticated:false,anon:false,public:false},'the guard does not gain callable privileges');
    const triggers=(await db.query("select tgname,tgenabled from pg_trigger where tgrelid='work_assignments'::regclass and tgfoid='_guard_work_assignment()'::regprocedure")).rows;
    assert.deepEqual(triggers,[{tgname:'guard_work',tgenabled:'O'}],'the existing guard trigger remains enabled without duplicates');
  }finally{await db.close();}
});

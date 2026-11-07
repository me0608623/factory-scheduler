import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';
import {workingDate} from './working-date.mjs';
import * as manual from '../src/manual.js';
import * as general from '../src/general-work.js';
import * as factory from '../src/factory.js';
import * as overtime from '../src/overtime.js';
import * as execution from '../src/execution.js';
import {capacityIntervals as occupiedCapacityIntervals} from '../src/capacity.js';
const src=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function harness(S,store){
let pending;const logs=[];const ctx={...manual,...general,...factory,...overtime,...execution,occupiedCapacityIntervals,S,structuredClone,DAY0:480,LUNCH_S:720,LUNCH_E:780,REG_END:1020,DAY1:1200,HORIZON:60,HOLI:{},I18N:{lang:'en'},WD_EN:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],WD_VI:[],WD_TH:[],pad:n=>String(n).padStart(2,'0'),sum:(a,f)=>a.reduce((x,y)=>x+f(y),0),uid:()=>crypto.randomUUID(),tx:x=>x,readOnly:false,canCalendar:()=>true,undoStack:[],UI:{modal:{draft:{week:[false,false,false,false,false,false,false],over:{}}}},MODAL_ACT:{},toast:x=>logs.push(x),showResult:()=>logs.push('showResult'),closeModal:()=>{},runAuto:()=>{},$:()=>({value:'1080'}),commit:e=>{logs.push(e);pending=store.sync(ctx.S,e);return pending;}};
vm.createContext(ctx);
function section(a,b){vm.runInContext(src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a))),ctx);}
section('function parseD(','/* ===== 2.');section('const emp=id=>','// 假日只是');section('function isOpen(','function dayLabel(');section('function pushUndo(){','function commit(');section('function capacityIntervals(','/* ----- 順移');section('function cascade(','// render 期');section('function orderStatus(','// 檢查單一方塊');section('function withState(','function otMinutes(');section('function setOpen(','function saveDailyOT(');section('function saveDailyOT(','/* ===== 9.');section('function payNote(','function workdaysFrom(');
vm.runInContext('function futureOf(b){return bEnd(b)>nowAbs();} const hm=m=>pad(Math.floor(m/60))+":"+pad(m%60);',ctx);
const start=src.indexOf('  "c-save":()=>{');const end=src.indexOf('\n});',start);vm.runInContext('Object.assign(MODAL_ACT,{'+src.slice(start,end)+'});',ctx);

  return {ctx,logs,save:()=>pending};
}

async function setup(fn,{today=false,past=false}={}){
  const db=await makeDb();
  try{
    // Disposable PGlite identities only, matching the existing Store test fixture.
    const id='11111111-1111-4111-8111-111111111111';
    await db.query("insert into auth.users(id,email) values($1,'audit@x')",[id]);
    await db.query("update profiles set role='boss' where user_id=$1",[id]);
    const store=new SupabaseStore(new FakeSupabase(db,{'audit@x':{id,password:'test'}}));
    await store.init();await store.login('audit@x','test');
    let S=await store.load();
    const date=today||past?(await db.query(`select (current_date-${past?1:0})::text date`)).rows[0].date:await workingDate(db);
    S.cal.over[date]='work';
    S.blocks=[{id:crypto.randomUUID(),oid:'00000000-0000-4000-8000-0000000000b1',step:0,m:'a',emp:'00000000-0000-4000-8000-0000000000e1',date,s:480,e:540,qty:120,pin:false}];
    await store.sync(S,{kind:'move',title:'Synthetic setup'});S=await store.load();
    await fn({db,store,S,date});
  }finally{await db.close();}
}

for(const mode of ['day','modal','daily overtime'])test('actual '+mode+' handler persists through one combined RPC',()=>setup(async({store,S,date})=>{
  if(mode==='daily overtime'){
    S.dayOT[date]=1200;S.blocks[0].s=1080;S.blocks[0].e=1140;
    S.employees.find(e=>e.id===S.blocks[0].emp).otOverrides[date]=true;
    await store.sync(S);S=await store.load();
  }
  const h=harness(S,store),rpc=store.sb.rpc.bind(store.sb),calls=[];
  store.sb.rpc=(name,args)=>{calls.push(name);return rpc(name,args);};
  if(mode==='day')h.ctx.toggleOpen(date);
  else if(mode==='modal'){h.ctx.UI.modal.draft=structuredClone(S.cal);h.ctx.UI.modal.draft.over[date]='off';h.ctx.MODAL_ACT['c-save']();}
  else h.ctx.saveDailyOT({date,open:true,otEnd:1080,overrides:Object.fromEntries(S.employees.map(e=>[e.id,e.id===S.blocks[0].emp?false:null]))});
  assert.ok(h.save());await h.save();assert.deepEqual(calls,['save_calendar_and_blocks']);
  const candidate=JSON.stringify(h.ctx.S.blocks);assert.equal(JSON.stringify((await store.load()).blocks),candidate);
  if(mode==='daily overtime')assert.equal(h.ctx.S.dayOT[date],1080);else assert.ok(h.ctx.S.blocks.every(b=>b.date!==date));
}));

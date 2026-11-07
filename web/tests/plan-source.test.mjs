import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {assertOrderReductions} from '../src/manual.js';
import {readFileSync} from 'node:fs';
import {tx,I18N} from '../src/i18n.js';
import {assertPlanSource} from '../src/plan-source.js';
import {fromSnapshot,toSnapshot,applyOption} from '../src/convert.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const raw=()=>({version:4,calendar:{week:[false,true,true,true,true,true,false],overrides:{},overtime:{'2026-11-10':true},holidays:{},windows:[{start:480,end:720,overtime:false}]},ot_ends:{'2026-11-10':1140},
  employees:[{id:'e',name:'Employee',skills:['m'],leaves:[]}],machines:[{id:'m',label:'Machine',process:'P',products:['p'],faults:[]}],
  products:[{id:'p',name:'Product',steps:[{process:'P',rate:2,batch:0}]}],orders:[{id:'o',code:'O',product:'p',qty:120,due:'2026-11-20',priority:2}],blocks:[],work_execution:[]});
const plan=s=>({source_snapshot:s,preview_id:'new-preview',date:'2026-11-10',options:[{id:'R1',name:'New',blocks:[],effects:{}}]});
function fixture(){
  let resolve;const promise=new Promise(r=>resolve=r),snap=raw(),B=fromSnapshot(snap),messages=[],previews=[];
  const P={B,base:JSON.stringify(B),previewId:'old-preview',rerun:{keepPeople:true},event:{type:'auto'},opts:[{id:'A',applicable:true,A:B}],cur:'A'};
  const store={kind:'supabase',version:4,authEpoch:1,session:{user:{id:'u'}},jwt:()=> 'synthetic'};
  const ctx={PV:P,STORE:store,S:structuredClone(B),$:()=>null,todayStr:()=> '2026-11-10',nowMin:()=>480,planTimeLimit:()=>3,render(){},toast:x=>messages.push(x),tx:x=>x,
    SOLVER:{up:true,capabilities:[],plansDb:()=>promise},assertPlanSource,applyOption,measure:()=>({}),assertOrderReductions,assertExecutionProtected(){},validateGeneralWork(){},assignments:()=>[],pendingReload:false,
    planCalculationReady:()=>true,enterPreview:x=>previews.push(x),pvOpt:()=>ctx.PV.opts.find(o=>o.id===ctx.PV.cur)};
  vm.createContext(ctx);
  for(const [a,b] of [['async function runRerun(','\ndocument.addEventListener("input"'],['async function openPlansSolver(','\nfunction openPlansLocal('],['async function pvApply(){','\nObject.assign(MODAL_ACT,{']]){
    const at=source.indexOf(a);vm.runInContext(source.slice(at,source.indexOf(b,at)),ctx);
  }
  const initial=()=>ctx.openPlansSolver('Auto','Auto','auto',()=>{},[],{event:{type:'auto'}},{base:JSON.stringify(B)});
  return {ctx,P,snap,B,messages,previews,resolve,initial};
}
test('snapshot windows are optional for old local data and retained when explicitly supplied',()=>{
  const s=raw(),B=fromSnapshot(s);assert.deepEqual(toSnapshot(B).calendar.windows,s.calendar.windows);
  delete s.calendar.windows;assert.equal(Object.hasOwn(toSnapshot(fromSnapshot(s)).calendar,'windows'),false);
});
test('same raw snapshot, overtime end, and reordered top-level catalogs match',()=>{
  const s=raw();s.orders.push({...s.orders[0],id:'o2',code:'O2'});const B=fromSnapshot(s);s.orders.reverse();assert.doesNotThrow(()=>assertPlanSource(plan(s),B));
});
test('same-version changes in visible metadata and solver inputs are rejected',()=>{
  for(const mutate of [s=>s.employees[0].source_notes='Changed',s=>s.orders[0].note='Changed',s=>s.employees[0].review_status='pending',s=>s.schedule_memos=[{id:'memo',text:'New'}],s=>s.orders[0].due='2026-11-09',s=>s.employees[0].skills=[],s=>s.calendar.week[1]=false,s=>s.calendar.windows[0].end=660,s=>s.ot_ends['2026-11-10']=1080,s=>s.work_execution.push({blockId:'b',status:'running',qtyDone:0})]){
    const s=raw(),B=fromSnapshot(structuredClone(s));mutate(s);assert.throws(()=>assertPlanSource(plan(s),B),e=>e.planSource&&e.stale);
  }
});
test('missing/malformed source is an incompatible-service error, never a default empty snapshot',()=>{
  const B=fromSnapshot(raw());for(const value of [undefined,null,{}, {...raw(),calendar:{...raw().calendar,windows:null}}, {...raw(),ot_ends:{'2026-11-10':'1140'}}]){
    assert.throws(()=>assertPlanSource({source_snapshot:value},B),e=>e.planSource&&!e.stale&&/相容版本/.test(e.message));
  }
});
test('both initial and rerun reject changed server metadata, missing and malformed envelopes',async()=>{
  for(const mode of ['initial','rerun'])for(const issue of ['changed','missing','malformed']){
    const h=fixture(),task=mode==='initial'?h.initial():h.ctx.runRerun(),reply=plan(structuredClone(h.snap));
    if(issue==='changed')reply.source_snapshot.orders[0].due='2026-11-09';
    if(issue==='missing')delete reply.source_snapshot;if(issue==='malformed')reply.source_snapshot={};
    h.resolve(reply);await task;assert.equal(h.previews.length,0);assert.equal(h.ctx.pendingReload,issue==='changed');assert.equal(h.messages.length>=1,true);
    if(mode==='rerun'){
      assert.deepEqual(Array.from(h.P.opts,o=>o.id),['A']);assert.equal(h.P.opts[0].applicable,false);assert.ok(h.P.sourceError);
      // Retained handlers cannot apply old options or clear invalidation by rerunning.
      const before=h.messages.length;await h.ctx.pvApply();await h.ctx.runRerun();assert.equal(h.messages.length,before+2);assert.equal(h.P.cur,'A');
    }
  }
});
test('unchanged sources still enter initial preview and add rerun options',async()=>{
  for(const mode of ['initial','rerun']){const h=fixture(),task=mode==='initial'?h.initial():h.ctx.runRerun();h.resolve(plan(h.snap));await task;assert.equal(mode==='initial'?h.previews.length:h.P.opts.length,mode==='initial'?1:2);assert.equal(h.ctx.pendingReload,false);if(mode==='rerun')assert.equal(h.P.opts[1].applicable,true);}
});
test('changed local state or version during rerun cannot accept its reply',async()=>{
  for(const change of ['metadata','version']){const h=fixture(),task=h.ctx.runRerun();if(change==='metadata')h.ctx.S.orders[0].due='2026-11-09';else h.ctx.S.version++;h.resolve(plan(h.snap));await task;assert.ok(h.P.sourceError);assert.equal(h.P.opts.length,1);}
});
test('rerun does not mutate a preview whose apply is in progress',async()=>{
  const h=fixture(),task=h.ctx.runRerun();h.P.applying=true;h.resolve(plan(h.snap));await task;assert.equal(h.P.cur,'A');assert.equal(h.P.opts.length,1);assert.equal(h.messages.length,0);
});
test('local snapshot solver has no new cloud response requirement',async()=>{
  const h=fixture();h.ctx.STORE.kind='local';h.ctx.toSnapshot=toSnapshot;h.ctx.HOLI={};h.ctx.SOLVER.plans=h.ctx.SOLVER.plansDb;
  const task=h.initial(),reply=plan(h.snap);delete reply.source_snapshot;h.resolve(reply);await task;assert.equal(h.previews.length,1);
});

test('both recovery messages have distinct EN/VI/TH translations',()=>{
  const s=raw(),B=fromSnapshot(structuredClone(s));s.orders[0].note='Changed';const messages=[];
  for(const p of [{},plan(s)])try{assertPlanSource(p,B);}catch(e){messages.push(e.message);}
  try{for(const lang of ['en','vi','th']){I18N.lang=lang;for(const m of messages)assert.notEqual(tx(m),m);assert.notEqual(tx(messages[0]),tx(messages[1]));}}
  finally{I18N.lang='zh-TW';}
});

test('source binding retains calendar windows and split overtime flags/endpoints together',()=>{
  const s=raw();s.calendar.overtime['2026-11-11']=false;s.ot_ends['2026-11-11']=1200;
  const B=fromSnapshot(s),roundtrip=toSnapshot(B);
  assert.equal(B.dayOT['2026-11-11'],false);
  assert.equal(roundtrip.calendar.overtime['2026-11-10'],true);
  assert.equal(roundtrip.ot_ends['2026-11-10'],1140);
  assert.equal(roundtrip.calendar.overtime['2026-11-11'],false);
  assert.deepEqual(roundtrip.calendar.windows,s.calendar.windows);
  assert.doesNotThrow(()=>assertPlanSource(plan(s),B));
  s.calendar.overtime['2026-11-11']=true;
  assert.throws(()=>assertPlanSource(plan(s),B),e=>e.planSource&&e.stale);
});

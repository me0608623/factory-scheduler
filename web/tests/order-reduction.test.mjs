import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as manual from '../src/manual.js';
import {assertExecutionProtected} from '../src/execution.js';
import {validateGeneralWork} from '../src/general-work.js';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function state(done=false){return {version:0,cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[],
  employees:[{id:'e',name:'E',skills:['m'],leaves:[],maxMachines:1}],machines:[{id:'m',label:'M',proc:'cut',products:['p'],faults:[]}],
  products:[{id:'p',name:'P',steps:[{proc:'cut',rate:1,batch:0}]}],orders:[{id:'o',code:'Synthetic',pid:'p',qty:100,due:'2030-01-02',pri:2}],
  blocks:[{id:'b',oid:'o',step:0,m:'m',emp:'e',date:'2025-01-02',s:480,e:580,qty:100,pin:true}],
  execution:done?[{blockId:'b',status:'done',qtyDone:80}]:[]};}
function reduce(before,qty){const after=structuredClone(before);after.orders[0].qty=qty;return after;}
const check=(before,after)=>manual.assertOrderReductions(before,after);

test('reduction cap uses actual done quantity and groups each order step independently',()=>{
  for(const done of [false,true]){const before=state(done);assert.throws(()=>check(before,reduce(before,50)),/超過工單件數/);}
  const before=state(true),after=reduce(before,80);assert.doesNotThrow(()=>check(before,after));
  after.blocks.push({...after.blocks[0],id:'second-step',step:1,qty:80});assert.doesNotThrow(()=>check(before,after),'different steps are not added together');
  after.blocks.push({...after.blocks[0],id:'extra',step:1,qty:1});assert.throws(()=>check(before,after),/超過工單件數/);
  const running=state(true);running.execution[0].status='running';assert.throws(()=>check(running,reduce(running,80)),/超過工單件數/);
});
test('valid completed shortfall reduction may remove pending work without changing history',()=>{
  const before=state(true);before.blocks.push({...before.blocks[0],id:'pending',qty:20,pin:false});
  const after=reduce(before,80);after.blocks=after.blocks.filter(b=>b.id!=='pending');
  assert.doesNotThrow(()=>check(before,after));assert.doesNotThrow(()=>assertExecutionProtected(before,after));
  assert.equal(after.blocks[0].qty,100);assert.deepEqual(after.execution,before.execution);
});
test('unrelated legacy overquantity, unchanged orders and increases are outside reduction guard',()=>{
  const before=state();before.orders[0].qty=50;
  assert.doesNotThrow(()=>check(before,structuredClone(before)));
  assert.doesNotThrow(()=>check(before,reduce(before,60)));
  const after=structuredClone(before);after.orders.push({id:'new',qty:1});after.blocks.push({id:'new-b',oid:'new',step:0,qty:2});assert.doesNotThrow(()=>check(before,after));
  before.orders.push({id:'other',qty:20});after.orders.push({id:'other',qty:10});after.blocks.push({id:'other-b',oid:'other',step:0,qty:10});assert.doesNotThrow(()=>check(before,after));
});
test('LocalStore rejects invalid reductions before writing and accepts valid actual quantity',async()=>{
  const old=globalThis.localStorage;try{
    for(const done of [false,true]){
      const before=state(done);let saved=JSON.stringify(before),writes=0;globalThis.localStorage={getItem:()=>saved,setItem:(k,v)=>{writes++;saved=v;}};
      const store=new LocalStore();await assert.rejects(store.sync(reduce(before,50)),e=>e.permission&&/超過工單件數/.test(e.message));
      assert.equal(writes,0);assert.deepEqual(await store.load(),before);
      if(done){
        before.blocks.push({...before.blocks[0],id:'pending',qty:20,pin:false});saved=JSON.stringify(before);
        const valid=reduce(before,80);valid.blocks=valid.blocks.filter(b=>b.id!=='pending');await store.sync(valid);
        assert.equal(writes,1);assert.equal((await store.load()).orders[0].qty,80);assert.equal((await store.load()).blocks[0].qty,100);
      }
    }
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
function previewHarness(before,after,cloud=false){
  const messages=[],calls=[],option={id:'A',A:after,state:JSON.stringify(after),name:'Synthetic',lines:[],mt:{shifts:[],lateCodes:[],moved:0,otherDays:0,otH:0}};
  const ctx={S:before,UI:{date:'2025-01-02'},PV:null,STORE:cloud?{applyPlan:async()=>calls.push('applyPlan')}:{},
    assertOrderReductions:manual.assertOrderReductions,assertExecutionProtected,validateGeneralWork,assignments:()=>[],todayStr:()=> '2025-01-02',
    capturePreviewContext:()=>({}),closeModal:()=>{},diffOf:()=>({dates:{}}),$:()=>null,render:()=>{},window:{scrollTo:()=>{}},
    toast:x=>messages.push(x),tx:x=>x,canPermissionRaw:()=>true,pushUndo:()=>calls.push('undo'),
    withState:(s,fn)=>fn(),pvSummary:()=>'',peopleOf:()=>[],commit:async()=>{calls.push('commit');return true;},showResult:()=>calls.push('success'),
    reloadFromStore:async()=> 'applied'};
  ctx.pvOpt=()=>option;vm.createContext(ctx);
  vm.runInContext(section('function enterPreview(','\nasync function askAI(')+section('async function pvApply(){','\nObject.assign(MODAL_ACT,{'),ctx);
  const preview={kind:'order',title:'Edit',logTitle:'Edit',base:JSON.stringify(before),B:before,opts:[option],ev:{},extra:cloud?{previewId:'synthetic'}:{}};
  return {ctx,option,preview,calls,messages};
}
test('actual preview marks an invalid reduction non-applicable with diagnostic',()=>{
  const before=state(),h=previewHarness(before,reduce(before,50));h.ctx.enterPreview(h.preview);
  assert.equal(h.option.applicable,false);assert.match(h.option.diagnostics.join(' '),/超過工單件數/);assert.equal(h.ctx.S,before);
});
test('actual apply rejects invalid reductions before cloud RPC or local mutation even when option is marked applicable',async()=>{
  for(const cloud of [false,true]){const before=state(true),h=previewHarness(before,reduce(before,50),cloud);h.ctx.PV=h.preview;
    await h.ctx.pvApply();assert.deepEqual(h.calls,[]);assert.equal(h.ctx.S,before);assert.equal(h.ctx.PV,h.preview);assert.match(h.messages.join(' '),/超過工單件數/);
  }
});
test('actual preview and local apply accept a valid shortfall reduction',async()=>{
  const before=state(true),h=previewHarness(before,reduce(before,80));h.ctx.enterPreview(h.preview);assert.notEqual(h.option.applicable,false);
  await h.ctx.pvApply();assert.deepEqual(h.calls,['undo','commit','success']);assert.equal(h.ctx.S.orders[0].qty,80);assert.equal(h.ctx.S.blocks[0].qty,100);
});
test('SupabaseStore rejects invalid unchanged-block reductions before any query and preserves DB rows',async()=>{
  const db=await makeDb();try{
    const boss=crypto.randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[boss,'synthetic@x']);await db.query("update profiles set role='boss' where user_id=$1",[boss]);
    const employee=(await db.query("select id from employees where name='張三'")).rows[0].id,oid=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query('update orders set qty=100 where id=$1',[oid]);const block=crypto.randomUUID();await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty,pinned) values($1,$2,0,'a',$3,'2025-01-02',480,580,100,true)",[block,oid,employee]);
    const sb=new FakeSupabase(db,{'synthetic@x':{id:boss,password:'pw'}}),store=new SupabaseStore(sb);await store.login('synthetic@x','pw');
    const run=sb._run.bind(sb);let queries=0;sb._run=(...args)=>{queries++;return run(...args)};
    for(const done of [false,true]){
      if(done){await store.reportExecution({id:crypto.randomUUID(),blockId:block,action:'start',qtyDone:0,expectedRevision:0});await store.reportExecution({id:crypto.randomUUID(),blockId:block,action:'finish',qtyDone:80,expectedRevision:1});}
      const before=await store.load(),after=structuredClone(before);after.orders.find(o=>o.id===oid).qty=50;queries=0;
      await assert.rejects(store.sync(after,{kind:'order',title:'Synthetic invalid reduction'}),e=>e.permission&&/超過工單件數/.test(e.message));assert.equal(queries,0);
      assert.equal((await db.query('select qty from orders where id=$1',[oid])).rows[0].qty,100);
      if(done){
        const pending=crypto.randomUUID();await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty,pinned) values($1,$2,0,'a',$3,'2030-01-02',480,500,20,false)",[pending,oid,employee]);
        const valid=await store.load();valid.orders.find(o=>o.id===oid).qty=80;valid.blocks=valid.blocks.filter(b=>b.id!==pending);await store.sync(valid,{kind:'order',title:'Valid shortfall reduction'});assert.equal((await store.load()).orders.find(o=>o.id===oid).qty,80);assert.equal((await db.query('select qty from schedule_blocks where id=$1',[block])).rows[0].qty,100);}
    }
  }finally{await db.close();}
});

test('actual order editor and all browser strategies cannot apply reductions below pinned work',async()=>{
  for(const done of [false,true])for(const strategy of ['A','B','C','D']){
    const before=state(done),ctx={S:structuredClone(before),UI:{modal:{draft:{...before.orders[0],qty:50}}},
      canOrders:()=>true,syncInputs:()=>{},readOnly:false,toast:()=>{},todayStr:()=> '2025-01-02',effectiveBlockQty:manual.effectiveBlockQty,
      sum:(xs,fn)=>xs.reduce((n,x)=>n+fn(x),0),bAbs:()=>0,placeJob:()=>{throw Error('overquantity must not allocate more')},nowAbs:()=>0,
      lateCheck:()=>{},cascade:()=>{},isOpen:()=>false,addDays:()=> '2031-01-01',reflow:()=>{},tx:x=>x,performance,absOf:()=>10000,DAY1:1200,orderStatus:()=>({fin:1000})};
    ctx.order=id=>ctx.S.orders.find(o=>o.id===id);ctx.prod=id=>ctx.S.products.find(p=>p.id===id);
    ctx.openPlans=(title,logTitle,kind,event,strategies)=>{event();strategies.find(s=>s.id===strategy).run({oid:'o'});};
    vm.createContext(ctx);
    vm.runInContext(section('function autoPlan(','\n/* ----- 局部調整')+section('function outranks(','\n/* ----- 最佳化')+section('const PRI_W=','\n/* ----- 方案比較')+section('const STRAT_ORDER=','\n/* ----- 機台恢復'),ctx);
    vm.runInContext('globalThis.save=({'+section('  "o-save":()=>{','  "o-del":a=>{')+'})["o-save"]',ctx);ctx.save();
    const h=previewHarness(before,ctx.S);h.ctx.enterPreview(h.preview);assert.equal(h.option.applicable,false,`${done}/${strategy}`);
    await h.ctx.pvApply();assert.deepEqual(h.calls,[]);assert.equal(h.ctx.S.orders[0].qty,100);
  }
});
test('actual rerun marks reduced-order overquantity options non-applicable',async()=>{
  const before=state(true),after=reduce(before,50),h=previewHarness(before,after);
  h.ctx.PV={B:before,opts:[],event:{type:'order'},rerun:{order:'Synthetic',text:'Keep people'}};
  Object.assign(h.ctx,{SOLVER:{up:true,plans:async()=>({options:[{id:'R1',name:'Rerun'}]})},nowMin:()=>480,
    planTimeLimit:()=>1,toSnapshot:x=>x,HOLI:{},applyOption:()=>after,measure:()=>({}),render:()=>{}});
  vm.runInContext(section('async function runRerun(){','\n}\n')+'\n}',h.ctx);
  await h.ctx.runRerun();assert.equal(h.ctx.PV.opts.length,1);assert.equal(h.ctx.PV.opts[0].applicable,false);assert.match(h.ctx.PV.opts[0].diagnostics.join(' '),/超過工單件數/);
});

test('numeric-string quantities and step identifiers use numeric reduction semantics',()=>{
  const before=state();before.orders[0].qty='100';const after=reduce(before,'50');after.blocks[0].qty=30;after.blocks.push({...after.blocks[0],id:'same-step',step:'0',qty:30});
  assert.throws(()=>check(before,after),/超過工單件數/);
});

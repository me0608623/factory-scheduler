import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {orderCounters} from '../src/overview.js';
import {executionOf} from '../src/execution.js';
import {effectiveBlockQty} from '../src/manual.js';
import {workQueue} from '../src/work-queue.js';
import {orderInFactory} from '../src/factory.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const today='2026-11-07';
const abs=(date,minute=0)=>Date.parse(`${date}T00:00:00Z`)/60000+minute;
const block=(overrides={})=>({id:'b1',oid:'o1',step:0,m:'m1',emp:'e1',date:today,s:480,e:540,qty:100,pin:false,...overrides});
function state(){
  return {
    setupPending:false,
    employees:[{id:'e1',name:'E1',factory:1,skills:['m1'],leaves:[],maxMachines:1}],
    machines:[{id:'m1',label:'M1',factory:1,proc:'cut',products:['p1'],faults:[]}],
    products:[{id:'p1',name:'P1',steps:[{factory:1,proc:'cut',rate:2,batch:0}]}],
    orders:[{id:'o1',code:'ORDER-ONE',pid:'p1',qty:100,due:'2026-11-30',pri:1}],
    blocks:[],execution:[],
  };
}

// Execute the real app projections, with only UI/date plumbing supplied here.
// No editor, persistence, reporting modal or network path is evaluated.
function harness(S){
  const c={S,UI:{factory:'all',focus:null},orderCounters,executionOf,effectiveBlockQty,
    prod:id=>S.products.find(p=>p.id===id),
    sum:(rows,fn)=>rows.reduce((n,row)=>n+fn(row),0),
    bEnd:b=>abs(b.date,b.e),dateOfAbs:value=>new Date(value*60000).toISOString().slice(0,10),
    nowAbs:()=>abs(today,500),todayStr:()=>today,
    esc:value=>String(value??''),tx:value=>value,md:value=>value,canOrders:()=>true,
  };
  c.shownOrders=()=>S.orders.filter(o=>orderInFactory(o,S.products,c.UI.factory));
  vm.createContext(c);
  for(const [start,end] of [
    ['function orderStatus(o){','function lateCheck('],
    ['function ordersDrawerHTML(){','function monthDates('],
    ['function statusTag(o){','const priTag='],
  ]){
    const from=source.indexOf(start),to=source.indexOf(end,from);
    assert.ok(from>=0&&to>from,`app projection boundaries: ${start}`);
    vm.runInContext(source.slice(from,to),c);
  }
  return c;
}

test('實際未排工單：工作佇列尚欠全部數量，總覽不得顯示綠燈',()=>{
  const S=state(),c=harness(S),order=S.orders[0];
  assert.equal(c.orderStatus(order).k,'none');
  const queue=workQueue(S,today,1);
  assert.equal(queue.length,1);
  assert.deepEqual([queue[0].planned,queue[0].remaining,queue[0].canArrange],[0,100,true]);
  assert.match(queue[0].reasons.join(),/不代表一定排得進去/);
  assert.match(c.statusTag(order),/tag warn.*未排/);
  const summary=orderCounters(S.orders,c.orderStatus,today);
  assert.deepEqual([summary.unfinished,summary.late,summary.dueToday],[1,0,0]);
  assert.equal(summary.rows[0].status.k,'none');
  assert.equal(summary.rows[0].signal,'yellow');
});

test('實際未排工單抽屜：說明未排量，不聲稱目前排程可完成',()=>{
  const c=harness(state()),html=c.ordersDrawerHTML();
  assert.doesNotMatch(html,/照目前排程可完成/);
  assert.match(html,/<small>有未排或完工短少<\/small>/);
  assert.match(html,/deadline yellow/);
  assert.match(html,/order-phase yellow">未做/);
  assert.match(html,/<b>1<\/b><span>未完成<\/span>/);
  assert.equal(c.ordersDrawerHTML(),html,'repeat render preserves the same status');
});

for(const [due,signal,late,dueToday] of [
  ['2026-11-06','red',1,0],[today,'yellow',0,1],['2026-11-08','yellow',0,0],
]){
  test(`實際未排工單保留期限緊迫度：${due}`,()=>{
    const S=state();S.orders[0].due=due;
    const c=harness(S),summary=orderCounters(S.orders,c.orderStatus,today);
    assert.equal(summary.rows[0].status.k,'none');
    assert.equal(summary.rows[0].signal,signal);
    assert.deepEqual([summary.unfinished,summary.late,summary.dueToday],[1,late,dueToday]);
    assert.equal(workQueue(S,today,1)[0].overdue,late===1);
    const html=c.ordersDrawerHTML();
    assert.match(html,new RegExp(`deadline ${signal}`));
    assert.match(html,/<small>有未排或完工短少<\/small>/);
    assert.doesNotMatch(html,/照目前排程可完成/);
  });
}

for(const spec of [
  {name:'部分排程',blocks:[block({qty:50})],k:'part',signal:'yellow',detail:'有未排或完工短少',phase:'未做',planned:50,remaining:50},
  {name:'完成短少',blocks:[block()],execution:[{blockId:'b1',status:'done',qtyDone:40}],k:'part',signal:'yellow',detail:'有未排或完工短少',phase:'已有回報',planned:40,remaining:60},
  {name:'排定時段已過',blocks:[block({e:490})],k:'elapsed',signal:'yellow',detail:'排定時間已過，待回報',phase:'未做'},
  {name:'排程超過期限',blocks:[block({date:'2026-12-01'})],k:'late',signal:'red',detail:'預計逾期',phase:'未做'},
  {name:'全量已排尚未開工',blocks:[block()],k:'ok',signal:'green',detail:'照目前排程可完成',phase:'未做'},
  {name:'全量回報仍進行中',blocks:[block()],execution:[{blockId:'b1',status:'running',qtyDone:100}],k:'ok',signal:'green',detail:'照目前排程可完成',phase:'進行中'},
  {name:'已完成且期限已過',blocks:[block()],execution:[{blockId:'b1',status:'done',qtyDone:100}],due:'2026-11-06',k:'done',signal:'green',detail:'實際件數已達工單量',phase:'已完成'},
]){
  test(`實際排程狀態與抽屜、佇列一致：${spec.name}`,()=>{
    const S=state();S.blocks=structuredClone(spec.blocks);S.execution=structuredClone(spec.execution||[]);
    if(spec.due)S.orders[0].due=spec.due;
    const c=harness(S),summary=orderCounters(S.orders,c.orderStatus,today);
    assert.equal(summary.rows[0].status.k,spec.k);
    assert.equal(summary.rows[0].signal,spec.signal);
    assert.deepEqual([summary.unfinished,summary.late,summary.dueToday],[spec.k==='done'?0:1,spec.signal==='red'?1:0,0]);
    const html=c.ordersDrawerHTML();
    assert.match(html,new RegExp(`deadline ${spec.signal}`));
    assert.ok(html.includes(`<small>${spec.detail}</small>`));
    assert.ok(html.includes(`order-phase ${spec.signal}">${spec.phase}`));
    if(spec.k==='ok')assert.match(c.statusTag(S.orders[0]),/tag ok.*預計準時/);
    const queue=workQueue(S,today,1);
    if(spec.remaining){
      assert.equal(queue.length,1);
      assert.deepEqual([queue[0].planned,queue[0].remaining],[spec.planned,spec.remaining]);
    }else assert.equal(queue.length,0,'fully accounted-for quantities add no unscheduled work');
  });
}

for(const missing of [{pid:null},{due:null},{pid:null,due:null}]){
  test(`實際缺資料工單保持灰燈：${Object.keys(missing).join('/')}`,()=>{
    const S=state();Object.assign(S.orders[0],missing);
    const c=harness(S),summary=orderCounters(S.orders,c.orderStatus,today);
    assert.equal(summary.rows[0].status.k,'none');
    assert.equal(summary.rows[0].signal,'gray');
    assert.deepEqual([summary.unfinished,summary.late,summary.dueToday],[1,0,0]);
    const html=c.ordersDrawerHTML();
    assert.match(html,/deadline gray/);
    assert.match(html,/<small>資料不足，暫不自動判斷<\/small>/);
    assert.doesNotMatch(html,/照目前排程可完成/);
  });
}

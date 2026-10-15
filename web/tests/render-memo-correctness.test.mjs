// R39：缺陷#41 render 期 memo 的語意鎖定——orderStatus/issuesOf 在單次 render／withState
// 區間內重用；render()/renderModal()/withState() 進出清空；帶 pushOK 的 issuesOf 不快取。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

function harness(){
  const mk=blocks=>({blocks,orders:[{id:'o1',pid:'p1',qty:100,due:'2026-12-31',code:'A01'}],products:[{id:'p1',name:'P',steps:[{proc:'裁切',factory:1},{proc:'包裝',factory:1}]}],
    employees:[{id:'e1',name:'甲',factory:1,skills:['m1'],leaves:[]}],machines:[{id:'m1',label:'M1',proc:'裁切',factory:1,products:['p1'],faults:[]}],
    execution:[],cal:{week:[1,1,1,1,1,1,1],over:{}},dayOT:{},generalWork:[]});
  const ctx={S:mk([{id:'b1',oid:'o1',step:1,m:'m1',emp:'e1',date:'2026-10-15',s:480,e:540,qty:100,pin:false}]),
    prod:id=>ctx.S.products.find(p=>p.id===id),order:id=>ctx.S.orders.find(o=>o.id===id),emp:id=>ctx.S.employees.find(e=>e.id===id),mach:id=>ctx.S.machines.find(m=>m.id===id),
    sum:(a,f)=>a.reduce((t,x)=>t+f(x),0),effectiveBlockQty:b=>b.qty,executionOf:()=>null,bEnd:b=>b.e,dateOfAbs:a=>'2026-10-15',
    nowAbs:()=>0,absOf:(d,s)=>s,bAbs:b=>b.s,mdw:x=>x,hm:x=>x,readyAbs:()=>0,materialFlowIssue:()=>false,capacityIntervals:()=>[],assignments:()=>[],
    dayInfo:()=>({win:[{s:480,e:1200}],open:true}),overtimeAllowed:()=>false,tx:x=>x,factoryOf:x=>x.factory??1,factoryName:x=>'一廠',
    stepName:()=>'裁切',label:()=>'L'};
  vm.createContext(ctx);
  const atOS=source.indexOf('function orderStatus(');
  vm.runInContext(source.slice(atOS,source.indexOf('\nfunction lateCheck',atOS)),ctx);
  const atIS=source.indexOf('function issuesOf(');
  vm.runInContext(source.slice(atIS,source.indexOf('\nfunction trySwap',atIS)===-1?source.indexOf('\nfunction',atIS+10):source.indexOf('\nfunction trySwap',atIS)),ctx);
  const atWS=source.indexOf('function withState(');
  vm.runInContext(source.slice(atWS,source.indexOf('\n',atWS)+1),ctx);
  return ctx;
}

test('orderStatus memo returns identical results within a render pass',()=>{
  const c=harness();
  const a=c.orderStatus(c.S.orders[0]);
  const b=c.orderStatus(c.S.orders[0]);
  assert.deepEqual(a,b);
  assert.equal(a.k,'ok','fully scheduled, no report yet: ok');
});

test('in-place mutation is stale until reset, fresh after reset (render entry semantics)',()=>{
  const c=harness();
  assert.equal(c.orderStatus(c.S.orders[0]).k,'ok');
  c.S.blocks=[];                       // 就地清空 → 未 reset 前沿用 render 期結果（同一次渲染內一致）
  assert.equal(c.orderStatus(c.S.orders[0]).k,'ok','memo holds within the pass');
  vm.runInContext('globalThis.__fsRenderMemo=null',c);   // 模擬 render() 進入
  assert.equal(c.orderStatus(c.S.orders[0]).k,'none','fresh after reset');
});

test('withState swaps reset the memo both ways',()=>{
  const c=harness();
  const other=c.S;                     // eslint-disable-line
  const st2={...c.S,blocks:[{id:'b2',oid:'o1',step:1,m:'m1',emp:'e1',date:'2026-10-15',s:480,e:500,qty:40,pin:false}]};
  const inOther=c.withState(st2,()=>c.orderStatus(c.S.orders[0]));
  assert.equal(inOther.k,'part','computed against swapped state');
  // 回到原狀態後不得吃到 st2 的快取
  assert.equal(c.orderStatus(c.S.orders[0]).k,'ok','back on original state: fresh');
});

test('issuesOf memoizes bare calls but never the pushOK variant',()=>{
  const c=harness();
  const r1=c.issuesOf(c.S.blocks[0]);
  const r2=c.issuesOf(c.S.blocks[0]);
  assert.deepEqual(r1,r2,'stable within pass');
  const o1={pushOK:true},o2={pushOK:true};
  c.issuesOf(c.S.blocks[0],o1);
  c.S.blocks.push({...c.S.blocks[0],id:'b9',pin:true,s:485,e:520});    // 固定重疊
  const fresh=c.issuesOf(c.S.blocks[0],o2);
  assert.ok(fresh.length>=1,'pushOK path sees the new overlap');
  assert.ok(fresh.some(t=>String(t).includes('撞同一台機器')||String(t).includes('重疊')),'overlap reported');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {orderSignal,orderCounters,productionSummary,leaveState,visibleMemos} from '../src/overview.js';

test('工單燈號不把缺資料或未排誤判為準時',()=>{
  const today='2026-09-30';
  assert.equal(orderSignal({pid:'p',due:'2026-09-29'},{k:'part'},today),'red');
  assert.equal(orderSignal({pid:'p',due:'2026-10-01'},{k:'part'},today),'yellow');
  assert.equal(orderSignal({pid:'p',due:'2026-10-05'},{k:'ok'},today),'green');
  assert.equal(orderSignal({pid:null,due:null},{k:'part'},today),'gray');
  const c=orderCounters([{id:1,pid:'p',due:today},{id:2,pid:'p',due:'2026-09-29'}],o=>o.id===1?{k:'done'}:{k:'late'},today);
  assert.deepEqual([c.unfinished,c.late,c.dueToday],[1,1,0]);
});

test('產量沒有回報時保留缺值狀態，不產生假實績',()=>{
  const s=productionSummary({machines:[{id:'a'},{id:'b'}],blocks:[{id:'x',m:'a',date:'2026-09-30',qty:20},{id:'y',m:'b',date:'2026-09-30',qty:30}],execution:[{blockId:'x',qtyDone:12}]},'2026-09-30',['a','b']);
  assert.equal(s.planned,50);
  assert.deepEqual(s.rows.map(x=>[x.machine.id,x.planned,x.actual,x.hasReport]),[['a',20,12,true],['b',30,0,false]]);
});

test('詢問中不會被當成正式請假',()=>{
  const S={employees:[{id:'e',leaves:[],reviewStatus:'confirmed'}],leaveRequests:[{employeeId:'e',date:'2026-10-01',status:'pending'}]};
  assert.equal(leaveState(S,'e','2026-10-01'),'asking');
  S.employees[0].leaves.push('2026-10-01');
  assert.equal(leaveState(S,'e','2026-10-01'),'leave');
});

test('備忘釘選優先並依廠別篩選',()=>{
  const S={machines:[{id:'a',factory:1},{id:'b',factory:2}],employees:[],memos:[{id:'1',machineId:'a',pinned:false,createdAt:'2026-09-30T01:00:00Z'},{id:'2',machineId:'a',pinned:true,createdAt:'2026-09-29T01:00:00Z'},{id:'3',machineId:'b',pinned:true}]};
  assert.deepEqual(visibleMemos(S,x=>x.factory,1).map(x=>x.id),['2','1']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceLoad, unionIntervals, subtractIntervals } from '../src/resource-load.js';
const date = '2026-09-29';
const windows = [{s:480,e:720,ot:false},{s:780,e:1020,ot:false}];
function fixture() {
  return { employees:[{id:'e1',name:'員工一',factory:1,maxMachines:2,leaves:[]},
    {id:'e2',name:'員工二',factory:2,maxMachines:1,leaves:[]}],
  machines:[{id:'a',label:'機一',factory:1,faults:[]},{id:'b',label:'機二',factory:1,faults:[]},
    {id:'c',label:'機三',factory:2,faults:[]}], blocks:[] };
}
const block = (m,s,e,emp='e1') => ({id:`${m}-${s}-${e}`,date,m,emp,s,e});

test('intervals merge without mutating inputs and subtract lunch/faults exactly', () => {
  const iv = [[600,660],[480,600],[650,720],[NaN,900]];
  const copy = structuredClone(iv);
  assert.deepEqual(unionIntervals(iv), [[480,720]]);
  assert.deepEqual(iv, copy);
  assert.deepEqual(subtractIntervals([[480,720],[780,1020]], [[500,600],[590,700],[990,1100]]), [[480,500],[700,720],[780,990]]);
});
test('one worker tending two machines counts elapsed time once, but retains task minutes', () => {
  const s=fixture(); s.blocks=[block('a',480,600),block('b',540,660)];
  const copy=structuredClone(s), r=resourceLoad(s,date,windows,1), e=r.employees[0];
  assert.equal(e.assignedMinutes,240); assert.equal(e.busyMinutes,180);
  assert.equal(e.utilization,180/480); assert.equal(e.peak,2); assert.equal(e.overloadMinutes,0);
  assert.equal(e.freeMinutes,300); assert.deepEqual(e.longest,[780,1020]);
  assert.deepEqual(s,copy);
});
test('overlap alerts are distinct from elapsed utilization, and boundaries do not overlap', () => {
  const s=fixture(); s.employees[0].maxMachines=1;
  s.blocks=[block('a',480,600),block('a',540,660),block('b',660,720)];
  const r=resourceLoad(s,date,windows);
  assert.equal(r.machines[0].overloadMinutes,60); assert.equal(r.machines[0].busyMinutes,180);
  assert.equal(r.employees[0].overloadMinutes,60); assert.equal(r.employees[0].peak,2);
});
test('faults union, historical repaired intervals, lunch, and off-hours reduce actual availability', () => {
  const s=fixture(); s.machines[0].faults=[{date,s:500,e:600,fixed:true},{date,s:540,e:630}];
  s.blocks=[block('a',480,660),block('a',720,780),block('a',1020,1080)];
  const a=resourceLoad(s,date,windows).machines.find(x=>x.id==='a');
  assert.equal(a.availableMinutes,350); assert.equal(a.faultMinutes,130);
  assert.equal(a.outsideMinutes,250); assert.equal(a.occupiedMinutes,50);
  assert.equal(a.utilization,50/350); assert.equal(a.freeMinutes,300);
});
test('leave and daily overtime overrides follow existing overtime policy', () => {
  const s=fixture(); const extended=[...windows,{s:1020,e:1200,ot:true}];
  s.employees[0].otWeekdays=[]; s.blocks=[block('a',1020,1080)];
  let e=resourceLoad(s,date,extended).employees.find(x=>x.id==='e1');
  assert.equal(e.availableMinutes,480); assert.equal(e.outsideMinutes,60);
  s.employees[0].otOverrides={[date]:true};
  e=resourceLoad(s,date,extended).employees.find(x=>x.id==='e1');
  assert.equal(e.availableMinutes,660); assert.equal(e.outsideMinutes,0);
  s.employees[0].leaves=[date];
  e=resourceLoad(s,date,extended).employees.find(x=>x.id==='e1');
  assert.equal(e.availableMinutes,0); assert.equal(e.utilization,null); assert.equal(e.outsideMinutes,60);
});
test('holidays marked overtime do not invent availability for unwilling workers', () => {
  const s=fixture(); s.employees[0].otWeekdays=[];
  const e=resourceLoad(s,date,windows.map(w=>({...w,ot:true}))).employees.find(x=>x.id==='e1');
  assert.equal(e.availableMinutes,0); assert.deepEqual(e.free,[]);
});
test('pending source rosters never expose guessed capacities, free windows, or overload rules', () => {
  const s=fixture(); s.setupPending=true; s.blocks=[block('a',480,600),block('b',540,660)];
  for (const r of [...resourceLoad(s,date,windows).employees,...resourceLoad(s,date,windows).machines]) {
    assert.equal(r.pending,true); assert.equal(r.availableMinutes,null); assert.equal(r.utilization,null);
    assert.equal(r.overloadMinutes,null); assert.equal(r.limit,null); assert.deepEqual(r.free,[]);
  }
  s.setupPending=false; s.machines[0].reviewStatus='pending';
  assert.equal(resourceLoad(s,date,windows).machines.find(x=>x.id==='a').pending,true);
});
test('factory filters use resource scope, not staff groups; missing resources and malformed times are visible', () => {
  const s=fixture(); s.groups=[{id:'g'}]; s.groupMembers=[{groupId:'g',employeeId:'e1'},{groupId:'g2',employeeId:'e1'}];
  s.blocks=[block('a',480,540),block('c',480,600,'e2'),block('unknown',480,500),block('b',NaN,600)];
  s.machines[0].faults=[{date,s:900,e:850}];
  const r=resourceLoad(s,date,[...windows,{s:720,e:700}],1);
  assert.equal(r.employees.length,1); assert.equal(r.machines.length,2);
  assert.equal(r.employees[0].blockCount,2); assert.equal(r.missingResources,1);
  assert.equal(r.invalidBlocks,1); assert.equal(r.invalidWindows,1); assert.equal(r.machines.find(x=>x.id==='a').invalidFaults,1);
  assert.equal(resourceLoad(s,'2026-09-30',windows).employees[0].busyMinutes,0);
});
test('closed days still expose saved work outside availability, without division by zero', () => {
  const s=fixture(); s.blocks=[block('a',480,600)];
  const r=resourceLoad(s,date,[]);
  assert.equal(r.employees[0].outsideMinutes,120); assert.equal(r.employees[0].utilization,null);
  assert.equal(r.machines[0].availableMinutes,0); assert.deepEqual(r.machines[0].free,[]);
});
test('bounded large snapshot: 50 machines, 40 employees, 10,000 blocks', t => {
  const s={machines:Array.from({length:50},(_,i)=>({id:`m${i}`,label:`機${i}`,factory:1,faults:[]})),
    employees:Array.from({length:40},(_,i)=>({id:`e${i}`,name:`員${i}`,factory:1,maxMachines:2,leaves:[]})),
    blocks:Array.from({length:10000},(_,i)=>block(`m${i%50}`,480+(i%8)*30,510+(i%8)*30,`e${i%40}`))};
  const start=performance.now(), r=resourceLoad(s,date,windows);
  t.diagnostic(`analysis ${Math.round(performance.now()-start)} ms (synthetic; not a production guarantee)`);
  assert.equal(r.machines.length,50); assert.equal(r.employees.length,40);
  assert.equal(r.machines.reduce((n,m)=>n+m.blockCount,0),10000);
  assert.equal(r.employees.reduce((n,e)=>n+e.assignedMinutes,0),300000);
  for(const row of [...r.machines,...r.employees]) {
    assert.ok(row.utilization>=0&&row.utilization<=1);
    assert.equal(row.occupiedMinutes+row.freeMinutes,row.availableMinutes);
  }
});

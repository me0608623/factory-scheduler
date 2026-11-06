import test from 'node:test';
import assert from 'node:assert/strict';
import {toSnapshot,fromSnapshot} from '../src/convert.js';
import {scenarioKey} from '../src/scenarios.js';

const day='2026-11-06';
const state=()=>({version:0,cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},
  employees:[{id:'TEST-E',name:'Test worker',skills:['TEST-M'],leaves:[],maxMachines:1,factory:1}],
  machines:[{id:'TEST-M',label:'Test machine',proc:'Test process',products:['TEST-P'],faults:[],factory:1}],
  products:[{id:'TEST-P',name:'Test product',steps:[{proc:'Test process',rate:1,batch:0,factory:1}]}],
  orders:[{id:'TEST-O',code:'TEST-O',pid:'TEST-P',qty:120,due:day,pri:1}],blocks:[],log:[]});

for(const end of [1020,1050,1080,1140,1200,1260,1320])test(`snapshot separates enabled overtime from its ${end}-minute endpoint`,()=>{
  const S=state();S.dayOT[day]=end;
  const before=structuredClone(S),snap=toSnapshot(S);
  assert.equal(snap.calendar.overtime[day],true,'solver Calendar requires boolean values');
  assert.equal(snap.ot_ends[day],end,'use the existing database snapshot contract');
  assert.equal(fromSnapshot(snap).dayOT[day],end);
  assert.deepEqual(S,before,'conversion must not mutate the board');
});

test('legacy true, explicit false, and absent days retain their existing meaning',()=>{
  const S=state();S.dayOT={[day]:true,'2026-11-07':false};
  const snap=toSnapshot(S);
  assert.deepEqual(snap.calendar.overtime,{[day]:true,'2026-11-07':false});
  assert.deepEqual(snap.ot_ends,{});
  assert.deepEqual(fromSnapshot(snap).dayOT,S.dayOT);
});

test('mixed per-day endpoints round-trip independently and distinguish scenario bases',()=>{
  const S=state();S.dayOT={[day]:1080,'2026-11-07':1140,'2026-11-08':true,'2026-11-09':false};
  const snapshot=toSnapshot(S);
  assert.deepEqual(snapshot.ot_ends,{[day]:1080,'2026-11-07':1140});
  assert.deepEqual(fromSnapshot(snapshot).dayOT,S.dayOT);
  const next=structuredClone(S);next.dayOT[day]=1140;
  assert.notEqual(scenarioKey(S),scenarioKey(next),'a cutoff change invalidates an old scenario');
});

test('an explicitly disabled day stays disabled even when a stale endpoint is present',()=>{
  const snap=toSnapshot(state());snap.calendar.overtime={[day]:false};snap.ot_ends={[day]:1080};
  assert.equal(fromSnapshot(snap).dayOT[day],false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoster,validateRosters,auditRoster,addDate} from '../src/roster.js';
import {rosterUI} from '../src/roster-ui.js';
import {scenarioKey} from '../src/scenarios.js';

function fixture({restType='regular',nextStart='2026-10-05',nextEmployee='e'}={}){
  const S={employees:[{id:'e',name:'Employee',factory:1,leaves:[],skills:[]},
    {id:'other',name:'Other employee',factory:2,leaves:[],skills:[]}],blocks:[],workAssignments:[],
    machines:[],products:[],orders:[],cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[]};
  function period(id,start,off,emp='e'){
    const p=newRoster(S,{id,start,factory:emp==='e'?1:2});
    p.rotationConsentRef='Recorded shift-rotation consent';
    p.positions=[{id:'pos',name:'Inspection',rate:10,employeeIds:[emp]}];
    p.shifts.push({id:'night',name:'Night',segments:[[1320,1560],[1590,1830]]});
    p.employees[0].weekdays=[0,1,2,3,4,5,6];p.employees[0].shiftIds.push('night');
    for(let i=0;i<p.cells.length;i++)Object.assign(p.cells[i],off.includes(i)
      ?{type:i===off[0]?'regular':'rest',shiftId:null,positionId:null}
      :{type:'work',shiftId:'day',positionId:'pos'});
    return p;
  }
  const previous=period('previous','2026-09-28',[3,4]);
  const next=period('next',nextStart,[0,1],nextEmployee);
  previous.cells.at(-1).shiftId='night';next.cells[0].type=restType;
  S.staffRosters=[previous,next];validateRosters(S);
  return {S,previous,next};
}
const restErrors=(p,S)=>auditRoster(p,S).errors.filter(e=>e.message.includes('完整休息日'));

for(const type of ['regular','rest','holiday','leave']){
  for(const side of ['previous','next']){
    test(`auditing the ${side} cycle detects overnight work on the adjacent ${type} day`,()=>{
      const f=fixture({restType:type}),before=JSON.stringify(f.S);
      const errors=restErrors(f[side],f.S);
      assert.equal(errors.length,1);
      assert.equal(errors[0].emp,'e');
      assert.equal(errors[0].date,side==='previous'?'2026-10-04':'2026-10-05',
        'the diagnostic points to a cell in the cycle being audited');
      assert.match(errors[0].message,/2026-10-05/);
      assert.equal(JSON.stringify(f.S),before,'auditing never changes either stored cycle');
    });
  }
}

test('a shift ending exactly at the cycle boundary does not invade the next rest day',()=>{
  const {S,previous,next}=fixture();
  previous.shifts.find(s=>s.id==='night').segments=[[1200,1440]];
  for(const p of [previous,next])assert.equal(restErrors(p,S).length,0);
});

test('an unassigned work day is not treated as a complete rest day',()=>{
  const {S,previous,next}=fixture({restType:'work'});
  for(const p of [previous,next])assert.equal(restErrors(p,S).length,0);
});

test('non-adjacent cycles and another employee do not create rest-day conflicts',()=>{
  for(const options of [{nextStart:'2026-10-12'},{nextEmployee:'other'}]){
    const {S,previous,next}=fixture(options);
    for(const p of [previous,next])assert.equal(restErrors(p,S).length,0);
  }
});

test('an unsaved edit to either cycle is audited instead of its stored version',()=>{
  const {S,previous,next}=fixture();
  const candidate=structuredClone(previous);
  previous.cells.at(-1).shiftId='day';
  assert.equal(restErrors(previous,S).length,0);
  assert.equal(restErrors(candidate,S).length,1);
  previous.cells.at(-1).shiftId='night';
  const nextCandidate=structuredClone(next);
  nextCandidate.cells[0].type='work';
  assert.equal(restErrors(nextCandidate,S).length,0);
  assert.equal(restErrors(next,S).length,1);
});

test('same-employee checks cross factories and use the actual adjacent cycle length',()=>{
  const {S,previous,next}=fixture();
  previous.factory=2;
  previous.regime='two';previous.start=addDate(previous.start,-7);previous.anchor=previous.start;
  previous.eligibilityRef='Recorded eligibility';previous.consentRef='Recorded consent';
  previous.cells=[...previous.cells.map(c=>({...c,date:addDate(c.date,-7)})),...previous.cells];
  validateRosters(S);
  for(const p of [previous,next])assert.equal(restErrors(p,S).length,1);
});

test('unknown adjacent cycles remain warnings, without invented rest-day conflicts',()=>{
  const {S,previous}=fixture();S.staffRosters=[previous];
  const result=auditRoster(previous,S);
  assert.equal(restErrors(previous,S).length,0);
  assert.match(result.warnings.join(),/前一週期未知/);
});

test('shuffled multi-employee periods report only the employee whose night shift crosses the boundary',()=>{
  const {S,previous,next}=fixture();
  for(const p of [previous,next]){
    p.employees.push({...structuredClone(p.employees[0]),emp:'other'});
    p.positions[0].employeeIds.push('other');
    p.cells.push(...p.cells.map(c=>({...c,emp:'other',shiftId:c.type==='work'?'day':null})));
    p.cells.reverse();
  }
  validateRosters(S);
  for(const p of [previous,next])assert.deepEqual(restErrors(p,S).map(e=>e.emp),['e']);
});

test('a middle cycle reports conflicts at both boundaries',()=>{
  const {S,previous,next:middle}=fixture();middle.cells.at(-1).shiftId='night';
  const next=structuredClone(middle);next.id='following';next.start=addDate(next.start,7);
  next.cells=next.cells.map(c=>({...c,date:addDate(c.date,7),shiftId:c.type==='work'?'day':null}));
  S.staffRosters=[previous,middle,next];validateRosters(S);
  assert.deepEqual(restErrors(middle,S).map(e=>e.date).sort(),['2026-10-05','2026-10-11']);
});

test('preview disables apply and a direct apply action refuses the boundary conflict',()=>{
  const {S,previous,next}=fixture();S.version=0;
  const candidate=structuredClone(previous);previous.cells.at(-1).shiftId='day';
  const modal={t:'roster-preview',candidate,result:{engine:'Test',status:'Preview'},
    base:scenarioKey(S),version:S.version};
  const calls={commit:[],toast:[],open:[]},ui={factory:1,modal};
  const api=rosterUI({state:()=>S,ui,esc:v=>String(v??''),uid:()=>'new',
    canEdit:()=>true,canMaster:()=>true,open:m=>calls.open.push(m),close:()=>{},
    syncInputs:()=>{},commit:v=>calls.commit.push(v),toast:v=>calls.toast.push(v),
    today:()=>'2026-09-28',clearUndo:()=>{},jwt:()=>null});
  const before=JSON.stringify(S),preview=api.modals['roster-preview'](modal);
  assert.match(preview.body,/2026-10-05.*完整休息日/);
  assert.match(preview.foot,/data-act="rs-apply"[^>]*disabled/);
  api.actions['rs-apply']();
  assert.equal(calls.commit.length,0);assert.equal(calls.open.length,0);
  assert.match(calls.toast.join(),/檢核仍有衝突/);
  assert.equal(JSON.stringify(S),before);
  assert.equal(next.cells[0].type,'regular');
});

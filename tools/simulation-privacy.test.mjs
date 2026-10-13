import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {safeSnapshotDebug,anonymizeSolverRequest} from './sim-debug.mjs';

const source=readFileSync(new URL('../db/tests/acceptance_sim.mjs',import.meta.url),'utf8');
const start=source.indexOf('function solve(request) {');
const implementation=source.slice(start,source.indexOf('// 選項診斷摘要',start));
function driver({failure=false,debug=false,malformed=false}={}){
  const writes=[],messages=[],calls=[];
  const context={safeSnapshotDebug,anonymizeSolverRequest,solverDir:'/fixture/solver',process:{env:debug?{SIM_DEBUG:'1'}:{}},
    fs:{writeFileSync:(path,data)=>writes.push({path,data})},console:{error:message=>messages.push(message)},
    clean:t=>String(t).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi,'[ID]'),
    spawnSync:(command,args,options)=>{calls.push({command,args,options});return failure?
      {status:1,stderr:'PRIVATE-PERSON PRIVATE-NOTE secret@example.test'}:
      {status:0,stdout:malformed?'PRIVATE-PERSON secret@example.test':JSON.stringify({options:[{id:'a',status:'FEASIBLE',applicable:true,blocks:[]}]})};}};
  vm.createContext(context);vm.runInContext(implementation,context);
  return {context,writes,messages,calls};
}
const request={snapshot:{employees:[{id:'e1',name:'PRIVATE-PERSON',source_ref:'PRIVATE-SOURCE',skills:['m1']}],
  machines:[{id:'m1',label:'PRIVATE-MACHINE',faults:[{date:'2026-10-12',note:'PRIVATE-FAULT'}]}],
  orders:[{id:'o1',note:'PRIVATE-NOTE',qty:120}],blocks:[],calendar:{}},time_limit:3};

test('actual simulation driver never writes a restored request snapshot, with or without debug',()=>{
  for(const debug of [false,true]){
    const h=driver({debug}),before=JSON.stringify(request),result=h.context.solve(request);
    assert.equal(result.options[0].status,'FEASIBLE');assert.equal(h.calls.length,1);
    assert.deepEqual(h.writes,[],'no raw or pseudonymized request file is permitted on a public runner');
    assert.doesNotMatch(JSON.stringify(h.messages),/PRIVATE-|secret@example/);
    const input=JSON.parse(h.calls[0].options.input);
    assert.equal(input.snapshot.employees[0].name,'TEST-E01');
    assert.equal(input.snapshot.employees[0].id,'e1');assert.equal(input.snapshot.orders[0].qty,120);
    assert.equal(JSON.stringify(request),before,'source data remains unchanged');
  }
});

test('failed solver does not echo private stderr into the public report or log',()=>{
  const h=driver({failure:true,debug:true});
  assert.throws(()=>h.context.solve(request),error=>{
    assert.match(error.message,/solver/);assert.doesNotMatch(error.message,/PRIVATE-|secret@example/);return true;
  });
  assert.deepEqual(h.writes,[]);assert.doesNotMatch(JSON.stringify(h.messages),/PRIVATE-|secret@example/);
});

test('malformed solver stdout fails explicitly without exposing the invalid payload',()=>{
  const h=driver({malformed:true,debug:true});
  assert.throws(()=>h.context.solve(request),error=>{
    assert.match(error.message,/solver/);assert.doesNotMatch(error.message,/PRIVATE-|secret@example/);return true;
  });
  assert.deepEqual(h.writes,[]);
});

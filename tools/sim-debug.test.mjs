import test from 'node:test';
import assert from 'node:assert/strict';
import {safeSnapshotDebug} from './sim-debug.mjs';
test('snapshot debug never emits names, source references, identifiers, notes or leave dates',()=>{
  const snapshot={calendar:{week:[false,true,true,true,true,true,false],
    windows:[{start:480,end:720,overtime:false,note:'PRIVATE-NOTE'}],holidays:{'2026-10-14':'PRIVATE-HOLIDAY'}},
    employees:[{id:'PRIVATE-ID',name:'PRIVATE-NAME',source_ref:'PRIVATE-SOURCE',source_employee_code:'PRIVATE-CODE',
      skills:['PRIVATE-MACHINE'],leaves:['2026-10-14'],no_overtime:true,source_notes:'PRIVATE-NOTE'}],
    orders:[{note:'PRIVATE-ORDER'}],machines:[{label:'PRIVATE-LABEL'}]};
  const result=safeSnapshotDebug(snapshot,['PRIVATE-ID']);
  const encoded=JSON.stringify(result);
  assert.doesNotMatch(encoded,/PRIVATE-|2026-10-14/);
  assert.equal(result.counts.employees,1);
  assert.equal(result.employees[0].code,'TEST-E01');
  assert.equal(result.overlappingHolidayLeaveEmployees,1);
  assert.deepEqual(result.calendar.windows,[{start:480,end:720,overtime:false}]);
});
test('explicit overtime permission excludes a holiday/leave duplicate-ban diagnosis',()=>{
  const snapshot={calendar:{holidays:{'2026-10-14':'holiday'}},employees:[
    {id:'1',leaves:['2026-10-14'],no_overtime:true,overtime_overrides:{'2026-10-14':true}}]};
  assert.equal(safeSnapshotDebug(snapshot).overlappingHolidayLeaveEmployees,0);
});
test('empty snapshot is safe and sensitive fields are never dereferenced',()=>{
  const e={id:'1',leaves:[]};
  for(const key of ['name','source_ref','source_notes'])Object.defineProperty(e,key,{get(){throw Error('private read');}});
  assert.doesNotThrow(()=>safeSnapshotDebug({employees:[e]},['1']));
  assert.equal(safeSnapshotDebug({}).counts.blocks,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fromSnapshot, toSnapshot } from '../src/convert.js';
import { rowsOf } from '../src/store/diff.js';

test('pending catalog and source survive cloud loading and subsequent saves', () => {
  const state=fromSnapshot({setup_pending:true,employees:[{id:'person',name:'Person',skills:[],leaves:[],review_status:'pending',source_ref:'test.xlsx · 1廠!B2'}],machines:[{id:'f1c',label:'Station',process:'待確認',products:[],review_status:'pending',source_ref:'test.xlsx · 1廠!C2'}]});
  assert.equal(toSnapshot(state).setup_pending,true);
  assert.equal(state.machines[0].reviewStatus,'pending');
  const rows=rowsOf(state);
  assert.equal(rows.employees.get('person').review_status,'pending');
  assert.equal(rows.machines.get('f1c').source_ref,'test.xlsx · 1廠!C2');
  assert.deepEqual(state.employees[0].skills,[]);
});

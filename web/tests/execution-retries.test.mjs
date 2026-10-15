import test from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionRetries} from '../src/execution-retries.js';
const actor=()=>({sb:{},session:{user:{id:'A'}},authEpoch:1});
test('ledger keeps independent blocks and a late cleanup cannot erase a newer request',()=>{
  const ledger=new ExecutionRetries(),store=actor(),a={id:'one',blockId:'B',qtyDone:25},b={id:'two',blockId:'C',qtyDone:40},newer={...a,id:'three'};
  ledger.remember(store,a);ledger.remember(store,b);ledger.remember(store,newer);ledger.clear(store,a);
  assert.equal(ledger.get(store,'B').pendingRequest,newer);assert.equal(ledger.get(store,'C').qtyDraft,40);
  ledger.clear(store,newer);assert.equal(ledger.get(store,'B'),undefined);assert.equal(ledger.has(store),true);ledger.clear(store,b);assert.equal(ledger.has(store),false);
});
test('logout, changed client and changed auth epoch discard reconciliation from that login',()=>{
  for(const change of [s=>s.session=null,s=>s.sb={},s=>s.authEpoch++]){const ledger=new ExecutionRetries(),store=actor();ledger.remember(store,{id:'one',blockId:'B',qtyDone:25});change(store);
    assert.equal(ledger.has(store),false);assert.equal(ledger.get(store,'B'),undefined);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {workQueue} from '../src/work-queue.js';
function state(){return {employees:[{id:'e',skills:['m']}],machines:[{id:'m',proc:'cut',products:['p']}],
  products:[{id:'p',steps:[{proc:'cut',rate:1},{proc:'cut',rate:1,batch:50}]}],
  orders:[{id:'o',pid:'p',qty:100,code:'O',due:'2026-10-20',pri:1}],
  blocks:[{id:'b',oid:'o',step:0,qty:100}],execution:[]};}
const warning=S=>workQueue(S,'2026-10-15').find(r=>r.step===1).reasons.includes('前站尚未排足交接批量');
test('downstream queue uses completed actual quantity for handoff diagnostics without mutating the schedule',()=>{
  const S=state();S.execution=[{blockId:'b',status:'done',qtyDone:20}];const before=structuredClone(S);
  assert.equal(warning(S),true);assert.deepEqual(S,before);
  S.execution[0].qtyDone=0;assert.equal(warning(S),true);
  S.execution[0].qtyDone=50;assert.equal(warning(S),false);
});
test('unfinished work retains planned capacity and supplemental blocks can satisfy handoff',()=>{
  const S=state();S.execution=[{blockId:'b',status:'running',qtyDone:20}];assert.equal(warning(S),false);
  S.execution[0].status='done';S.blocks.push({id:'replacement',oid:'o',step:0,qty:30});assert.equal(warning(S),false);
  S.products[0].steps[1].batch=0;assert.equal(warning(S),true);
  S.blocks[1].qty=80;assert.equal(warning(S),false);
});

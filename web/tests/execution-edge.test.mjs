import test from 'node:test';
import assert from 'node:assert/strict';
import { executionOf, canReport, assertExecutionProtected } from '../src/execution.js';

const S = (exec = []) => ({ execution: exec });

test('executionOf：空 execution 回 undefined', () => {
  assert.equal(executionOf(S(), 'b1'), undefined);
});

test('executionOf：找到對應 block 的回報', () => {
  const exec = [{ blockId: 'b1', status: 'running', qtyDone: 0 }];
  assert.equal(executionOf(S(exec), 'b1')?.status, 'running');
  assert.equal(executionOf(S(exec), 'b2'), undefined, '其他 block 回 undefined');
});

test('executionOf：多筆回報取正確的', () => {
  const exec = [
    { blockId: 'b1', status: 'done', qtyDone: 50, confirmed: true },
    { blockId: 'b2', status: 'running', qtyDone: 10 },
  ];
  const r = executionOf(S(exec), 'b1');
  assert.equal(r.status, 'done');
  assert.equal(r.qtyDone, 50);
  assert.equal(r.confirmed, true);
});

test('canReport：boss 可回報任何工作', () => {
  assert.equal(canReport('boss', null, { emp: 'e1', m: 'm1' }), true);
});

test('canReport：worker 只能回報自己的', () => {
  assert.equal(canReport('worker', 'e1', { emp: 'e1', m: 'm1' }), true);
  assert.equal(canReport('worker', 'e1', { emp: 'e2', m: 'm1' }), false);
});

test('canReport：viewer 不可回報', () => {
  assert.equal(canReport('viewer', 'e1', { emp: 'e1', m: 'm1' }), false);
  assert.equal(canReport('viewer', null, { emp: 'e1', m: 'm1' }), false);
});

test('canReport：null role 不可回報', () => {
  assert.equal(canReport(null, 'e1', { emp: 'e1', m: 'm1' }), false);
});

test('assertExecutionProtected：有回報的 block 不可修改', () => {
  const before = { execution: [{blockId:'b1',status:'done'}], blocks: [{id:'b1',qty:50,pin:false}] };
  const after = { execution: [{blockId:'b1',status:'done'}], blocks: [{id:'b1',qty:60,pin:false}] };
  assert.throws(() => assertExecutionProtected(before, after), /不能移動/);
});

test('assertExecutionProtected：無回報的 block 可修改', () => {
  assert.doesNotThrow(() => assertExecutionProtected({execution:[],blocks:[]}, {execution:[],blocks:[]}));
});

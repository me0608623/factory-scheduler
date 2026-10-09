import test from 'node:test';
import assert from 'node:assert/strict';
import { quantityForMinutes, effectiveBlockQty, remainingQty } from '../src/manual.js';

test('quantityForMinutes：分鐘 × 速率 → 件數', () => {
  assert.equal(quantityForMinutes(60, 2, 1000), 120);
  assert.equal(quantityForMinutes(30, 3.3, 1000), 99);
});

test('quantityForMinutes：被剩餘量約束', () => {
  assert.equal(quantityForMinutes(60, 2, 50), 50);
});

test('quantityForMinutes：零值安全', () => {
  assert.equal(quantityForMinutes(0, 2, 100), 0);
  assert.equal(quantityForMinutes(60, 0, 100), 0);
  assert.equal(quantityForMinutes(60, 2, 0), 0);
  assert.equal(quantityForMinutes(-60, 2, 100), 0);
});

test('effectiveBlockQty：無回報用排程件數', () => {
  assert.equal(effectiveBlockQty({ id: 'b1', qty: 50 }, []), 50);
});

test('effectiveBlockQty：有回報用回報件數', () => {
  const exec = [{ blockId: 'b1', status: 'done', qtyDone: 30 }];
  assert.equal(effectiveBlockQty({ id: 'b1', qty: 50 }, exec), 30);
});

test('effectiveBlockQty：回報非 done 不覆蓋', () => {
  const exec = [{ blockId: 'b1', status: 'running', qtyDone: 20 }];
  assert.equal(effectiveBlockQty({ id: 'b1', qty: 50 }, exec), 50);
});

test('remainingQty：扣除已排件數', () => {
  const blocks = [{ id: 'b1', oid: 'o1', step: 0, qty: 50 }];
  assert.equal(remainingQty(100, blocks, 'o1', 0), 50);
  assert.equal(remainingQty(100, [], 'o1', 0), 100);
});

test('remainingQty：排除特定 block', () => {
  const blocks = [{ id: 'b1', oid: 'o1', step: 0, qty: 50 }, { id: 'b2', oid: 'o1', step: 0, qty: 30 }];
  assert.equal(remainingQty(100, blocks, 'o1', 0, 'b2'), 50, '排除 b2 後剩 100-50');
});


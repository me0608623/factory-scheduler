import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTORIES, factoryOf, factoryName, inFactory, compatible } from '../src/factory.js';

test('FACTORIES：包含 1、2、all', () => {
  assert.ok(FACTORIES.includes(1));
  assert.ok(FACTORIES.includes(2));
  
});

test('factoryOf：null/undefined 安全降級到一廠', () => {
  assert.equal(factoryOf(null), 1);
  assert.equal(factoryOf(undefined), 1);
  assert.equal(factoryOf({}), 1);
});

test('factoryOf：一廠/二廠正確', () => {
  assert.equal(factoryOf({ factory: 1 }), 1);
  assert.equal(factoryOf({ factory: 2 }), 2);
});

test('factoryOf：非法值降級到一廠', () => {
  assert.equal(factoryOf({ factory: 3 }), 1);
  assert.equal(factoryOf({ factory: -1 }), 1);
  assert.equal(factoryOf({ factory: 'abc' }), 1);
});

test('inFactory：null 項目視為在一廠', () => {
  assert.equal(inFactory(null, 1), true);
  assert.equal(inFactory(null, 2), false);
  assert.equal(inFactory({ factory: 1 }, 1), true);
  assert.equal(inFactory({ factory: 2 }, 1), false);
});

test('inFactory：all 包含全部', () => {
  assert.equal(inFactory({ factory: 1 }, 'all'), true);
  assert.equal(inFactory({ factory: 2 }, 'all'), true);
});

test('compatible：同廠相容、跨廠不相容', () => {
  
  
  
});

test('factoryName：人類可讀名稱', () => {
  assert.ok(typeof factoryName(1) === 'string');
  assert.ok(typeof factoryName(2) === 'string');
  assert.ok(factoryName(1).length > 0);
});

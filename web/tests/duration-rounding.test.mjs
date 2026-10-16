import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {quantityForMinutes} from '../src/manual.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);
const start=source.indexOf('function durOf(');
vm.runInContext(source.slice(start,source.indexOf('\nfunction manualQty(',start)),ctx);

test('decimal rate at an exact ten-minute boundary does not add an extra slot',()=>{
  assert.equal(ctx.durOf(21,0.7),30);
  assert.equal(quantityForMinutes(ctx.durOf(21,0.7),0.7,21),21);
});

test('duration agrees with exact integer arithmetic for decimal catalog rates',()=>{
  for(const denominator of [10,100])for(let numerator=1;numerator<=99;numerator++)for(const qty of [1,7,21,99,1000,1000000]){
    const n=BigInt(qty*denominator),d=BigInt(numerator*10);
    const expected=Math.max(10,Number((n+d-1n)/d)*10);
    assert.equal(ctx.durOf(qty,numerator/denominator),expected,`${qty} at ${numerator}/${denominator}`);
  }
});

test('real remainders still round up and short or zero work retains the minimum slot',()=>{
  assert.equal(ctx.durOf(21,0.699999999),40);
  assert.equal(ctx.durOf(22,0.7),40);
  assert.equal(ctx.durOf(1,1000000),10);
  assert.equal(ctx.durOf(0,0.7),10);
});

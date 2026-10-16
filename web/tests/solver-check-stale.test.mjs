import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const keyStart=source.indexOf('"solver-check":async()=>{');
const start=source.indexOf('async()=>{',keyStart);
const end=source.indexOf('\n});',start);
const handler=source.slice(start,end).replace(/,\s*$/,'');

function fixture(){
  const calls=[];
  const ctx={UI:{modal:{t:'settings'}},
    SOLVER:{up:false,url:'https://solver.example',check:async()=>{calls.push('check');}},
    renderModal:()=>{calls.push('renderModal:'+ctx.UI.modal.t);},
    toast:x=>{calls.push('toast:'+x);}};
  vm.createContext(ctx);
  vm.runInContext('this.act='+handler,ctx);
  return {ctx,calls};
}

test('fresh solver-check result re-renders its own dialog and toasts',async()=>{
  const {ctx,calls}=fixture();
  await ctx.act();
  assert.ok(calls.includes('check'));
  assert.ok(calls.some(c=>c.startsWith('renderModal:settings')));
  assert.ok(calls.some(c=>c.startsWith('toast:')));
});

test('stale solver-check result must not re-render a dialog opened later (draft wipe) nor toast',async()=>{
  for(const change of ['replaced','closed']){
    const {ctx,calls}=fixture();
    const job=ctx.act();
    if(change==='replaced')ctx.UI.modal={t:'memo-edit',draft:'typing'};
    else ctx.UI.modal=null;
    await job;
    assert.ok(!calls.some(c=>c.startsWith('renderModal:')),'no re-render of a foreign/closed dialog');
    assert.ok(!calls.some(c=>c.startsWith('toast:')),'no stale toast');
  }
});

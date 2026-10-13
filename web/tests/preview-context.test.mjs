import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePreviewContext,restorePreviewContext} from '../src/preview-context.js';
test('cancel after impact-date navigation returns to starting day/factory/week and focus',()=>{
  const ui={date:'2026-10-12',factory:2,view:'week',focus:{type:'order',id:'test-order'}};
  const captured=capturePreviewContext(ui);
  ui.date='2026-10-14';ui.factory=1;ui.view='day';ui.focus=null;
  assert.equal(restorePreviewContext(ui,captured),true);
  assert.deepEqual(ui,{date:'2026-10-12',factory:2,view:'week',focus:{type:'order',id:'test-order'}});
});
test('preview capture and restoration do not share mutable focus objects',()=>{
  const ui={date:'2026-10-12',factory:'ALL',view:'day',focus:{type:'order',id:'original'}};
  const captured=capturePreviewContext(ui);ui.focus.id='changed';
  assert.equal(captured.focus.id,'original');
  restorePreviewContext(ui,captured);ui.focus.id='changed-again';
  assert.equal(captured.focus.id,'original');
});
test('only navigation is restored, not live schedule/store or unrelated drawer state',()=>{
  const blocks=Object.freeze([{id:'external-update'}]);
  const ui={date:'2026-10-14',factory:'F1',view:'day',focus:null,blocks,version:9,drawer:'orders'};
  restorePreviewContext(ui,{date:'2026-10-12',factory:'F2',view:'week',focus:null});
  assert.equal(ui.blocks,blocks);assert.equal(ui.version,9);assert.equal(ui.drawer,'orders');
});
test('legacy preview without captured context is left untouched rather than guessed',()=>{
  const ui={date:'2026-10-14',factory:'F1',view:'day'};
  assert.equal(restorePreviewContext(ui,null),false);
  assert.deepEqual(ui,{date:'2026-10-14',factory:'F1',view:'day'});
});
test('factory preference is restored via the existing UI setter, not schedule storage',()=>{
  const ui={date:'2026-10-14',factory:2,view:'day'},preferences=new Map([['factory','2']]);
  restorePreviewContext(ui,{date:'2026-10-12',factory:1,view:'day',focus:null},f=>preferences.set('factory',String(f)));
  assert.equal(ui.factory,1);assert.equal(preferences.get('factory'),'1');
  assert.equal(restorePreviewContext(ui,null,()=>assert.fail('legacy preview must not persist guessed defaults')),false);
});

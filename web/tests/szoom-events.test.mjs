import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {rafApply,SZOOM_STEP} from '../src/szoom.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const block=source.slice(source.indexOf('let pinchActive=false;'),source.indexOf('document.addEventListener("pointerdown",e=>{\n  if(pinchActive)return;'));
function harness(){
  const frames=[],events={},log=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const ctx={rafApply,SZOOM_STEP,UI:{view:'day',modal:null},SZ:{day:1,week:1,wheelZoom:true},drag:null,generalDrag:null,
    document:{addEventListener:(type,fn)=>events[type]=fn},endDrag:()=>log.push('cancel-drag')};
  vm.createContext(ctx);vm.runInContext(block,ctx);ctx.applyZoom=(v,z)=>{log.push([v,z]);ctx.SZ[v]=z;};
  const target={closest:s=>s==='.board.szoom'?{}:null};
  return {ctx,events,frames,log,target};
}
test('wheel gate: disabled including ctrl, zero/horizontal, modal and active drag',()=>{
  for(const condition of ['off','ctrl-off','zero','horizontal','modal','drag']){
    const h=harness();let prevented=false;
    if(condition.includes('off'))h.ctx.SZ.wheelZoom=false;
    if(condition==='modal')h.ctx.UI.modal={};if(condition==='drag')h.ctx.drag={};
    h.events.wheel({target:h.target,deltaY:condition==='zero'?0:100,deltaX:condition==='horizontal'?200:0,ctrlKey:condition==='ctrl-off',preventDefault:()=>prevented=true});
    assert.equal(prevented,false,condition);assert.equal(h.frames.length,0,condition);
  }
});
test('wheel zoom stays in day past threshold and ignores view change before rAF',()=>{
  const h=harness();h.ctx.SZ.day=.5;
  h.events.wheel({target:h.target,deltaY:100,deltaX:0,preventDefault(){}});h.frames.shift()();
  assert.equal(h.ctx.UI.view,'day');assert.equal(h.log[0][0],'day');
  h.events.wheel({target:h.target,deltaY:100,deltaX:0,preventDefault(){}});h.ctx.UI.view='week';h.frames.shift()();assert.equal(h.log.length,1);
});
test('pinch cancels an existing drag; touchcancel clears queued and active pinch',()=>{
  const h=harness();h.ctx.drag={};
  h.events.touchstart({target:h.target,touches:[{clientX:10,clientY:20},{clientX:110,clientY:20}]});
  assert.equal(h.ctx.drag,null);assert.deepEqual(h.log,['cancel-drag']);
  h.events.touchmove({touches:[{clientX:0,clientY:20},{clientX:200,clientY:20}],preventDefault(){}});
  h.events.touchcancel();h.frames.shift()();assert.equal(h.log.length,1);
  assert.equal(vm.runInContext('pinchActive',h.ctx),false);
});
test('general work time grid uses the same scaled hour as its blocks',()=>{
  const fn=source.slice(source.indexOf('function workGridHTML('),source.indexOf('\nfunction generalLanes('));
  const ctx={UI:{date:'2026-10-12'},dayInfo:()=>({ot:false}),hourPx:()=>90,hm:String,mdw:d=>d,tx:s=>s,readOnly:true,S:{}};
  vm.createContext(ctx);vm.runInContext(fn,ctx);
  assert.match(ctx.workGridHTML('test',[]),/style="--hour:90px"/);
});

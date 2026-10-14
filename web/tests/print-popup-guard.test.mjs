// R43：列印班表的 window.open 被瀏覽器封鎖（回 null）時不得崩潰——要 toast 提示「允許彈出視窗」。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

function harness({popupBlocked}){
  const events=[];
  const ctx={UI:{date:'2026-10-15',factory:1},tx:x=>x,esc:x=>String(x),factoryName:()=>'1 廠',
    S:{blocks:[],dayOT:{},employees:[],execution:[]},
    shownMachines:()=>[],shownEmployees:()=>[],order:()=>({code:'A01'}),emp:()=>({name:'甲'}),
    dayInfo:()=>({open:true,ot:false,win:[]}),WD:['日','一','二','三','四','五','六'],parseD:d=>new Date(d+'T00:00:00Z'),
    hm:n=>String(n),mdw:x=>x,issuesOf:()=>[],label:()=>'L',stepName:()=>'裁切',
    toast:t=>events.push(['toast',t]),
    window:{open:()=>popupBlocked?null:{document:{write:()=>events.push(['write']),close:()=>events.push(['close'])}}}};
  vm.createContext(ctx);
  const at=source.indexOf('function printDaySchedule(');
  const end=source.indexOf('\nfunction floorPageHTML',at);
  vm.runInContext(source.slice(at,end),ctx);
  return {ctx,events};
}

test('blocked popup yields a friendly toast instead of a crash',()=>{
  const h=harness({popupBlocked:true});
  assert.doesNotThrow(()=>h.ctx.printDaySchedule(),'null window must not crash');
  assert.ok(h.events.some(e=>e[0]==='toast'),'user is told popups are blocked');
  assert.equal(h.events.some(e=>e[0]==='write'),false,'nothing written');
});

test('allowed popup still writes and closes the print document',()=>{
  const h=harness({popupBlocked:false});
  h.ctx.printDaySchedule();
  assert.ok(h.events.some(e=>e[0]==='write'),'document written');
  assert.ok(h.events.some(e=>e[0]==='close'),'document closed');
});

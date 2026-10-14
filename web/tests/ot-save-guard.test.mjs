// R13：ot-save 在視窗已關（UI.modal=null，例如連點第二下）時必須安全 no-op，不得拋未捕捉 TypeError
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const ctx={canCalendar:()=>true,toast:()=>{},closeModal:()=>{},commit:async()=>{},showResult:()=>{},repair:()=>[],pushUndo:()=>{},
  dayInfo:()=>({win:[]}),futureOf:()=>true,overtimeAllowed:()=>false,overtimeDefault:()=>false,REG_END:1020,DAY1:1200,
  S:{dayOT:{},blocks:[],employees:[]},UI:{modal:null},$:{},emp:()=>null,mdw:x=>x,pad:n=>String(n).padStart(2,'0')};
vm.createContext(ctx);
const at=source.indexOf('function saveDailyOT(');
vm.runInContext(source.slice(at,source.indexOf('\n}',at)+2),ctx);
test('saveDailyOT with closed modal (double-click second event) is a clean no-op',()=>{
  assert.doesNotThrow(()=>ctx.saveDailyOT(null),'second click after closeModal must not throw');
  assert.doesNotThrow(()=>ctx.saveDailyOT(undefined),'missing modal must not throw');
});

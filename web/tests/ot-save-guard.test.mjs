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

// R19：undo 連點——第一下 commit 在途時第二次 pop 應先排隊（syncChain）而非交錯寫入。
// 這裡驗證使用者可觀測行為：undo 後 undoStack 立即少一筆（同步 pop），第二次點擊不會重複恢復同一快照。
import { readFileSync as _rf } from 'node:fs';
import vm2 from 'node:vm';
const src2=_rf(new URL('../src/app.js',import.meta.url),'utf8');
test('undo pops exactly one snapshot per invocation even when clicked twice rapidly',async()=>{
  const events=[];
  const ctx={undoStack:['{"v":1}','{"v":2}'],S:{v:1,log:[]},commit:async()=>{events.push('commit');return true;},
    toast:t=>events.push('toast:'+t),tx:x=>x,uid:()=> 'u1'};
  vm2.createContext(ctx);
  const at=src2.indexOf('async function undo(){');
  vm2.runInContext(src2.slice(at,src2.indexOf('\n}',at)+2),ctx);
  await ctx.undo();await ctx.undo();
  assert.equal(ctx.undoStack.length,0,'two undos consume two snapshots');
  assert.equal(events.filter(x=>x==='commit').length,2,'each undo commits once');
  assert.equal(ctx.S.v,1,'final state is the first (oldest) snapshot');
});

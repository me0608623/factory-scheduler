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

// R20：queueSync 重試鈕走 queueSync(null)——null entry 在 sync 失敗時，S.log 是否失去該筆紀錄？
// 用 LocalStore 真路徑驗證：失敗→重試成功後 log 與資料是否完整（undo 快照保存於 pushUndo 時，不受影響）。
import {LocalStore as LS} from '../src/store/local.js';
test('queueSync null retry after failure preserves data and logs one entry',async()=>{
  const prev=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{
    const store=new LS();
    let fail=true;
    const realSync=store.sync.bind(store);
    store.sync=async(s,e)=>{if(fail){fail=false;throw new Error('SYNTH_FAIL');}return realSync(s,e);};
    const ctx={STORE:store,S:{v:1,employees:[],machines:[],orders:[],products:[],blocks:[],log:[],dayOT:{},cal:{week:[1,1,1,1,1,1,1],over:{}}},
      syncPending:0,SYNC:{state:'ok',msg:''},syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,syncChain:Promise.resolve(),syncPending:0,
      updateSyncChip:()=>{},maybeReload:()=>{},toast:()=>{},tx:x=>x,structuredClone:(globalThis.structuredClone||JSON.parse.bind(JSON)),
      reloadFromStore:async()=>'failed',changedWriteSession:()=>{}};
    // 注入可失敗 sync
    const src=_rf(new URL('../src/app.js',import.meta.url),'utf8');
    const vm3=(await import('node:vm')).default;
    vm3.createContext(ctx);
    const at=src.indexOf('function queueSync(');
    vm3.runInContext(src.slice(at,src.indexOf('\nfunction changedWriteSession',at)),ctx);
    ctx.S.log.push({kind:'edit',title:'T1',lines:[],id:'e1',t:1});   // commit() 會在 queueSync 前把紀錄推入 S.log——模擬該步驟
    const ok1=await ctx.queueSync({kind:'edit',title:'T1',lines:[]});
    assert.equal(ok1,false,'first attempt fails');
    assert.equal(ctx.SYNC.state,'error','error surfaced');
    const ok2=await ctx.queueSync(null);            // 使用者按「重試」
    assert.equal(ok2,true,'retry succeeds');
    assert.equal(ctx.S.log.length,1,'log entry survived the failed-then-retried save');
    assert.equal(JSON.parse(data.get('fsched-local-v1')).log.length,1,'persisted log has the single entry');
  }finally{if(prev===undefined)delete globalThis.localStorage;else globalThis.localStorage=prev;}
});

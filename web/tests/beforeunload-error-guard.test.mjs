// R22：同步失敗（SYNC.state==='error'，例如離線）後，本機變更只存在記憶體——
// 關閉分頁前必須警告（與 reportWork/出回報擋門同語意：error＝尚未確認儲存）。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

// 切出 addEventListener("beforeunload",...) 整行語句
const lineAt=source.indexOf('addEventListener("beforeunload"');
assert.ok(lineAt>=0,'beforeunload registration found');
const lineStart=source.lastIndexOf('\n',lineAt)+1,lineEnd=source.indexOf('\n',lineAt);
const stmt=source.slice(lineStart,lineEnd);

function harness(){
  let handler=null;
  const ctx={addEventListener:(t,h)=>{if(t==='beforeunload')handler=h;},
    syncPending:0,SYNC:{state:'ok',msg:'',realtime:null},UI:{},
    executionRetries:new Map(),STORE:{hasPendingConfirmations:()=>false}};
  vm.createContext(ctx);
  vm.runInContext(stmt,ctx);
  return {ctx,warns:()=>{const e={preventDefault(){this._pd=true;}};handler(e);return !!e._pd||e.returnValue!==undefined;}};
}

test('beforeunload stays silent when everything is saved',()=>{
  const h=harness();
  assert.equal(h.warns(),false,'ok state with no pending work must not warn');
});

test('beforeunload warns for busy sync, pending writes and in-progress saves',()=>{
  const busy=harness();busy.ctx.SYNC.state='busy';assert.equal(busy.warns(),true);
  const pending=harness();pending.ctx.syncPending=1;assert.equal(pending.warns(),true);
  const brush=harness();brush.ctx.UI.leaveBrushSaving={};assert.equal(brush.warns(),true);
});

test('beforeunload warns when last sync failed (unsaved local changes)',()=>{
  const h=harness();h.ctx.SYNC.state='error';
  assert.equal(h.warns(),true,'error state means local changes are not persisted');
});

// 端到端：真 queueSync 失敗（網路錯誤）後 SYNC.state==='error'，beforeunload 必須警告。
import {LocalStore as LS} from '../src/store/local.js';
test('end-to-end: failed queueSync leaves beforeunload guard armed',async()=>{
  const prev=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{
    const store=new LS();
    store.sync=async()=>{throw new Error('NETWORK_DOWN');};
    let handler=null;
    const ctx={STORE:store,S:{v:1,employees:[],machines:[],orders:[],products:[],blocks:[],log:[],dayOT:{},cal:{week:[1,1,1,1,1,1,1],over:{}}},
      addEventListener:(t,h)=>{if(t==='beforeunload')handler=h;},
      syncPending:0,SYNC:{state:'ok',msg:'',realtime:null},syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,
      syncChain:Promise.resolve(),UI:{},executionRetries:new Map(),
      updateSyncChip:()=>{},maybeReload:()=>{},toast:()=>{},tx:x=>x,structuredClone:(globalThis.structuredClone||JSON.parse.bind(JSON)),
      reloadFromStore:async()=>'failed',changedWriteSession:()=>{}};
    vm.createContext(ctx);
    const at=source.indexOf('function queueSync(');
    vm.runInContext(source.slice(at,source.indexOf('\nfunction changedWriteSession',at)),ctx);
    vm.runInContext(stmt,ctx);
    const ok=await ctx.queueSync({kind:'edit',title:'T1',lines:[]});
    assert.equal(ok,false,'write failed');
    assert.equal(ctx.SYNC.state,'error','error surfaced');
    assert.equal(ctx.syncPending,0,'pending counter settled');
    const e={preventDefault(){this._pd=true;}};handler(e);
    assert.ok(!!e._pd||e.returnValue!==undefined,'closing the tab now must warn about unsaved changes');
  }finally{if(prev===undefined)delete globalThis.localStorage;else globalThis.localStorage=prev;}
});

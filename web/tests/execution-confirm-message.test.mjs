import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const at=source.indexOf("case 'exec-confirm':"),end=source.indexOf('case "group-edit":',at);
const cases=source.slice(at,end);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('actual confirmation and undo-confirmation handlers do not label an unconfirmed receipt as a definite unsaved write',async()=>{
  for(const action of ['exec-confirm','exec-unconfirm']){
    const events=[],error=Object.assign(new Error('完工確認結果待核對，請更新班表查看；不要重複送出。'),{unconfirmed:true});
    const ctx={S:{execution:[{blockId:'B',status:'done',confirmed:false}]},UI:{modal:null},PV:null,SYNC:{state:'ok'},syncChain:Promise.resolve(),maybeReload:()=>{},STORE:{confirmExecution:async()=>{throw error;}},
      canPermission:()=>true,toast:text=>events.push(text),tx:x=>x,DB_MIGRATION_PENDING:/missing migration/,reloadFromStore:()=>{throw new Error('must not reread on this rejection');}};
    vm.createContext(ctx);const owner=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(owner,source.indexOf('async function runDrawerWrite(',owner)),ctx);
    const helper=source.indexOf('async function changeExecutionConfirmation(');vm.runInContext(source.slice(helper,source.indexOf("MODALS['scenario-list']",helper)),ctx);
    vm.runInContext('function invoke(a){switch(a.dataset.act){'+cases+'}}',ctx);
    const button={disabled:false,dataset:{act:action,id:'B'}};ctx.invoke(button);await tick();
    assert.equal(events.length,1);assert.equal(events[0],error.message);assert.equal(button.disabled,false);assert.equal(ctx.S.execution[0].confirmed,false);
  }
});

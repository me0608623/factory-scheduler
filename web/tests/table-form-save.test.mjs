import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateRush} from '../src/rush.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const setter=source.slice(source.indexOf('function setPath('),source.indexOf('\n',source.indexOf('function setPath(')));
const save=source.slice(source.indexOf('async function saveTableForm('),source.indexOf('\nfunction catalogPageHTML('));
function harness({rows=[],id=null,fields=[],allowed=true,sync=async()=>true}={}){
  const messages=[];
  const ctx={structuredClone,validateRush,UI:{modal:{t:'tbl-form',table:'rush',id,draft:id?structuredClone(rows.find(r=>r.id===id)):null},flashNewRow:null},
    STORE:{kind:'local',session:{user:{id:'u1'}},authEpoch:1},
    S:{rushOrders:rows},
    document:{querySelectorAll:()=>fields.map(([key,value,type='text'])=>({dataset:{fk:key},value,type,tagName:'INPUT'}))},
    canPermission:()=>allowed,uid:()=> 'new-row',renderModal:()=>{},closeModal:()=>{ctx.UI.modal=null;},
    toast:m=>messages.push(m),TABLE_TITLES:{rush:'欠缺品項'},commit:sync};
  vm.createContext(ctx);vm.runInContext(setter+'\n'+save,ctx);
  return {ctx,messages,save:()=>ctx.saveTableForm()};
}
test('new shortage row initializes nested fields and saves once',async()=>{
  let commits=0;const h=harness({fields:[['f1.vendor',' QA '],['f1.shortQty','10','number'],['f2.desc','組裝']],sync:async()=>{commits++;return true;}});
  await h.save();await h.save();
  assert.equal(h.ctx.S.rushOrders.length,1);assert.equal(commits,1);
  assert.equal(h.ctx.S.rushOrders[0].f1.vendor,'QA');assert.equal(h.ctx.S.rushOrders[0].f2.desc,'組裝');
  assert.deepEqual(h.messages,['已儲存']);
});
test('invalid new row preserves draft without inserting a row',async()=>{
  const h=harness({fields:[['f1.vendor','QA'],['f1.shortQty','-1','number']]});
  await h.save();assert.equal(h.ctx.S.rushOrders.length,0);
  assert.equal(h.ctx.UI.modal.draft.f1.vendor,'QA');assert.equal(h.ctx.UI.modal.saving,false);
  assert.match(h.messages[0],/沒存到/);
});
test('invalid edit restores original row, not the mutated draft',async()=>{
  const rows=[{id:'r',f1:{vendor:'original',shortQty:10},f2:{}}];
  const h=harness({rows,id:'r',fields:[['f1.vendor','changed'],['f1.shortQty','1.5','number']]});
  await h.save();assert.equal(rows[0].f1.vendor,'original');assert.equal(rows[0].f1.shortQty,10);
  assert.equal(h.ctx.UI.modal.draft.f1.vendor,'changed');
});
test('empty row and permission denial do not save',async()=>{
  for(const options of [{fields:[['f1.vendor','   ']]},{allowed:false,fields:[['f1.vendor','QA']]}]){
    let commits=0;const h=harness({...options,sync:async()=>{commits++;return true;}});
    await h.save();assert.equal(commits,0);assert.equal(h.ctx.S.rushOrders.length,0);assert.match(h.messages[0],/沒存到/);
  }
});
test('cloud save failure never announces saved; success waits for acknowledgement',async()=>{
  let resolve;const h=harness({fields:[['f2.desc','QA']],sync:()=>new Promise(r=>{resolve=r;})});
  const pending=h.save();assert.deepEqual(h.messages,[]);resolve(false);await pending;assert.deepEqual(h.messages,[]);
  const ok=harness({fields:[['f2.desc','QA']],sync:()=>new Promise(r=>{resolve=r;})});
  const saving=ok.save();assert.deepEqual(ok.messages,[]);resolve(true);await saving;assert.deepEqual(ok.messages,['已儲存']);
});
test('account switch while saving suppresses saved toast and flash marker on the new session',async()=>{
  let resolve;const h=harness({fields:[['f2.desc','QA']],sync:()=>new Promise(r=>{resolve=r;})});
  const pending=h.save();
  h.ctx.STORE={kind:'local',session:{user:{id:'u2'}},authEpoch:1};   // 儲存在途中切換帳號
  resolve(true);await pending;
  assert.deepEqual(h.messages,[]);                 // 不對新帳號顯示「已儲存」
  assert.equal(h.ctx.UI.flashNewRow,null);         // 不把舊請求的閃爍標記寫進新狀態
});
test('account switch on save failure shows nothing on the new session',async()=>{
  let reject;const h=harness({fields:[['f2.desc','QA']],sync:()=>new Promise((_,rj)=>{reject=rj;})});
  const pending=h.save();
  h.ctx.STORE={...h.ctx.STORE,authEpoch:2};        // epoch 變更＝新登入
  reject(new Error('網路中斷'));
  await pending.catch(()=>{});
  assert.deepEqual(h.messages,[]);                 // 舊帳號的失敗訊息不污染新畫面
});
test('same account save failure still rolls back the row and reports the error',async()=>{
  const rows=[{id:'r',f1:{vendor:'original',shortQty:10},f2:{}}];
  let reject;const h=harness({rows,id:'r',fields:[['f1.vendor','changed']],sync:()=>new Promise((_,rj)=>{reject=rj;})});
  const pending=h.save();
  h.ctx.allowed=false;                             // 同帳號下權限被撤銷：仍屬同一 store，要回滾＋提示
  reject(new Error('寫入失敗'));
  await pending.catch(()=>{});
  assert.equal(rows[0].f1.vendor,'original');      // 草稿回滾
  assert.match(h.messages.at(-1),/沒存到/);
});

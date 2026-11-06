import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {productRate} from '../src/product-rate.js';
import {I18N,tx} from '../src/i18n.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';

const invalid=['',' ',0,-1,'0.0001','0.0014','99999.9994',100000,'1.0000000000000001','0.00100000000000000001',NaN,Infinity,'Infinity','0x10','1e'+'9'.repeat(10000),'1e-'+'9'.repeat(10000)];
test('product rate accepts exactly the positive numeric(8,3) contract without rounding',()=>{
  for(const value of invalid)assert.equal(productRate(value),null,String(value).slice(0,80));
  for(const [value,expected] of [[0.001,.001],['.001',.001],['1.001',1.001],[99999.999,99999.999],['00001.001000',1.001],['+1',1],['1e-3',.001],['1000e-6',.001],['99999999e-3',99999.999],['1.000000000000000000',1],['1e+'+'0'.repeat(10000),1]])assert.equal(productRate(value),expected);
  for(const value of [null,{},[],true])assert.equal(productRate(value),null);
});

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function segment(start,end){const i=app.indexOf(start);assert.notEqual(i,-1);const j=app.indexOf(end,i);assert.ok(j>i);return app.slice(i,j);}
const realFunctions=segment('function setPath(', 'function renderModal(')+segment('function pushUndo()', 'async function undo(')+segment('function queueSync(', 'function changedWriteSession(')+segment('function rerender()', 'const tg=');
const renderer=segment('products(m){','/* ---------- 單一方塊').trim().replace(/,$/,'');
const handlers=segment('  "p-addstep":','  "b-emp":').trim().replace(/,$/,'');
const esc=vm.runInNewContext(segment('const esc=', '\n')+'\nesc;');
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function state(){return {products:[{id:'p',name:'Product',steps:[{proc:'Cut',rate:1,batch:0,factory:1}]}],orders:[],blocks:[],log:[]};}
function harness(S=state(),store={kind:'local',sync:async()=>{}}){
  const calls={sync:0,toasts:[]};
  const c={S,STORE:store,UI:{modal:{t:'products'},factory:'all'},SOLVER:null,SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,undoStack:[],nodes:[],structuredClone,Date,Promise,uid:randomUUID,productRate,tx,esc,canMaster:()=>true,canPermission:()=>true,FACTORIES:[1,2],factoryOf:s=>+s.factory===2?2:1,factoryName:String,render(){},updateSyncChip(){},maybeReload(){},runAuto(){},reloadFromStore:async()=>{throw Error('unexpected recovery');}};
  c.prod=id=>c.S.products.find(p=>p.id===id);c.order=id=>c.S.orders.find(o=>o.id===id);
  c.toast=(...a)=>calls.toasts.push(a);c.closeModal=()=>{c.UI.modal=null;};
  c.document={querySelectorAll:()=>c.nodes};
  const original=store.sync.bind(store),activeStore=Object.create(store);
  activeStore.sync=async(...a)=>{calls.sync++;return original(...a);};c.STORE=activeStore;
  vm.createContext(c);vm.runInContext(realFunctions+'\nvar MODALS={'+renderer+'};var MODAL_ACT={'+handlers+'};',c);
  // DOM adapter uses attributes from the real products renderer, not a second form.
  c.renderModal=()=>{
    c.html=vm.runInContext('MODALS.products(UI.modal)',c).body;
    c.nodes=[...c.html.matchAll(/<input\b[^>]*>/g)].map(([tag])=>({type:tag.match(/type="([^"]*)"/)?.[1]||'text',value:decode(tag.match(/value="([^"]*)"/)?.[1]||''),dataset:{bind:tag.match(/data-bind="([^"]*)"/)?.[1]},hasAttribute:name=>new RegExp('\\s'+name+'(?:\\s|=|>)').test(tag)})).filter(n=>n.dataset.bind);
  };
  c.renderModal();
  return {c,calls,input:(path,value)=>{c.nodes.find(n=>n.dataset.bind===path).value=String(value);},act:(name,v)=>c.MODAL_ACT[name]({dataset:{v}}),render:()=>vm.runInContext('rerender()',c)};
}
function unchanged(h,before){assert.equal(JSON.stringify(h.c.S),before);assert.equal(h.c.undoStack.length,0);assert.equal(h.calls.sync,0);assert.ok(h.c.UI.modal);assert.equal(h.calls.toasts.length,1);assert.match(h.calls.toasts[0][0],/0.001–99999.999/);}

test('real manual save rejects invalid rates before undo, state changes, or any write',async()=>{
  for(const value of invalid){const h=harness(),before=JSON.stringify(h.c.S);h.input('0.steps.0.rate',value);h.act('p-save');await h.c.syncChain;unchanged(h,before);}
  // A later invalid product must not modify an earlier valid product in live state.
  const h=harness();h.act('p-add');h.input('0.name','Renamed');h.input('1.steps.0.proc','Cut');h.input('1.steps.0.rate','0.0014');const before=JSON.stringify(h.c.S);h.act('p-save');unchanged(h,before);
});

test('raw digits survive real add/delete/rerender paths; rate values are HTML escaped',()=>{
  for(const action of ['p-add','p-addstep','p-delstep','rerender']){
    const h=harness();h.c.UI.modal.draft[0].steps.push({proc:'Pack',rate:1,batch:0,factory:1});h.c.renderModal();
    const raw='1.0000000000000001';h.input('0.steps.0.rate',raw);
    if(action==='rerender')h.render();else h.act(action,action==='p-delstep'?'0.1':'0');
    assert.equal(h.c.UI.modal.draft[0].steps[0].rate,raw,action);assert.equal(h.c.nodes.find(n=>n.dataset.bind==='0.steps.0.rate').value,raw);
    const before=JSON.stringify(h.c.S);h.act('p-save');unchanged(h,before);
  }
  const h=harness(),raw='1" onfocus="bad<>&\'';h.input('0.steps.0.rate',raw);h.render();assert.ok(h.c.html.includes('value="'+esc(raw)+'"'));assert.ok(!h.c.html.includes('onfocus="bad'));assert.equal(h.c.UI.modal.draft[0].steps[0].rate,raw);
  assert.match(h.c.html,/step="0.001" min="0.001" max="99999.999" data-product-rate/);
  // Unrelated numeric controls, including other modals, retain numeric conversion.
  h.input('0.steps.0.batch','12');h.render();assert.equal(h.c.UI.modal.draft[0].steps[0].batch,12);
  h.c.UI.modal={t:'other',draft:{rate:0}};h.c.nodes=[{type:'number',value:'1.5',dataset:{bind:'rate'},hasAttribute:()=>true}];vm.runInContext('syncInputs()',h.c);assert.equal(h.c.UI.modal.draft.rate,1.5);
});

test('ordered products still forbid step edits but accept rename and equivalent rate text',async()=>{
  const S=state();S.orders=[{id:'o',pid:'p'}];
  const bad=harness(structuredClone(S)),before=JSON.stringify(bad.c.S);bad.input('0.steps.0.rate','1.001');bad.act('p-save');assert.equal(JSON.stringify(bad.c.S),before);assert.equal(bad.calls.sync,0);assert.equal(bad.c.undoStack.length,0);assert.match(bad.calls.toasts[0][0],/已有工單/);
  const good=harness(structuredClone(S));good.input('0.name','Renamed');good.input('0.steps.0.rate','1000e-3');good.act('p-save');await good.c.syncChain;assert.equal(good.calls.sync,1);assert.equal(good.c.S.products[0].name,'Renamed');assert.equal(good.c.S.products[0].steps[0].rate,1);
});

test('rate validation feedback is translated in all supported languages',()=>{
  const key='{product}：每分鐘件數須為 0.001–99999.999，最多 3 位小數';
  try{for(const lang of ['en','vi','th']){I18N.lang=lang;const h=harness();h.input('0.steps.0.rate','.0001');h.act('p-save');const message=h.calls.toasts[0][0];assert.notEqual(message,key.replace('{product}','Product'));assert.ok(message.includes('Product')&&message.includes('0.001')&&message.includes('99999.999'));}}finally{I18N.lang='zh-TW';}
});

test('real handler and SupabaseStore/PGlite persist exact valid new and unreferenced product rates, reject invalid before writes',async()=>{
  const db=await makeDb();
  try{
    const actor=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[actor,'rate-test@synthetic']);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const store=new SupabaseStore(fake);await store.init();
    for(const value of ['0.001','1.001','99999.999']){
      const h=harness(await store.load(),store);h.act('p-add');const pi=h.c.UI.modal.draft.length-1,id=h.c.UI.modal.draft[pi].id;h.input(`${pi}.name`,'Synthetic '+id);h.input(`${pi}.steps.0.proc`,'Cut');h.input(`${pi}.steps.0.rate`,value);h.act('p-save');await h.c.syncChain;assert.equal(h.c.SYNC.state,'ok');assert.equal(h.calls.sync,1);assert.equal((await db.query('select rate::text from product_steps where product_id=$1 and seq=0',[id])).rows[0].rate,Number(value).toFixed(3));
      const edit=harness(await store.load(),store),index=edit.c.UI.modal.draft.findIndex(p=>p.id===id);edit.input(`${index}.steps.0.rate`,'2.001');edit.act('p-save');await edit.c.syncChain;assert.equal(edit.c.SYNC.state,'ok');assert.equal((await db.query('select rate::text from product_steps where product_id=$1 and seq=0',[id])).rows[0].rate,'2.001');
    }
    const orderedState=await store.load(),orderedId=orderedState.orders[0].pid;
    const blocked=harness(orderedState,store),orderedIndex=blocked.c.UI.modal.draft.findIndex(p=>p.id===orderedId),originalRate=blocked.c.UI.modal.draft[orderedIndex].steps[0].rate;
    blocked.input(`${orderedIndex}.steps.0.rate`,'1.001');blocked.act('p-save');assert.equal(blocked.calls.sync,0);assert.equal(blocked.c.undoStack.length,0);assert.match(blocked.calls.toasts[0][0],/已有工單/);
    const rename=harness(await store.load(),store);rename.input(`${orderedIndex}.name`,'Renamed ordered product');rename.act('p-save');await rename.c.syncChain;assert.equal(rename.c.SYNC.state,'ok');assert.equal((await db.query('select name from products where id=$1',[orderedId])).rows[0].name,'Renamed ordered product');assert.equal(Number((await db.query('select rate from product_steps where product_id=$1 and seq=0',[orderedId])).rows[0].rate),originalRate);
    for(const value of ['0.0001','0.0014','1.0000000000000001','100000']){
      const h=harness(await store.load(),store);h.act('p-add');const pi=h.c.UI.modal.draft.length-1,id=h.c.UI.modal.draft[pi].id;h.input(`${pi}.steps.0.proc`,'Cut');h.input(`${pi}.steps.0.rate`,value);const before=JSON.stringify(h.c.S);h.act('p-save');await h.c.syncChain;unchanged(h,before);assert.equal((await db.query('select id from products where id=$1',[id])).rows.length,0);
    }
  }finally{await db.close();}
});

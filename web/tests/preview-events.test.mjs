import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {acceptManualPreview} from '../src/manual-apply.js';
import * as nav from '../src/preview-nav.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const manual=source.slice(source.indexOf('async function applyManualPreview('),source.indexOf('\nfunction diffOf('));
function harness(){
  const events={},log=[],timers=[];
  const before={blocks:[{id:'b1',oid:'o1',step:0,date:'2026-10-12',m:'a',s:480,e:540}],log:[]};
  const after=structuredClone(before);after.blocks[0].s=540;after.blocks[0].e=600;
  const P={base:JSON.stringify(before),B:before,after,move:{...after.blocks[0]},oldId:'b1',ops:[],problems:[],unpinned:[],lines:[],movedLabel:'A01',source:'old',target:'new'};
  const ctx={...nav,acceptManualPreview,S:before,UI:{date:'2026-10-12',view:'day',modal:null},PV:{kind:'manual',P,opts:[{id:'manual',applicable:true}],cur:'manual',nav:nav.newNav()},
    pvOpt:()=>ctx.PV?.opts[0],readOnly:false,undoStack:[],pushUndo:()=>ctx.undoStack.push(JSON.stringify(ctx.S)),
    assertExecutionProtected:()=>{},validateGeneralWork:()=>{},assignments:()=>[],todayStr:()=> '2026-10-11',
    commit:async()=>{log.push('commit');return true;},render:()=>log.push('render'),renderModal:()=>{},closeModal:()=>{},
    toast:msg=>log.push(msg),maybeReload:()=>{},document:{addEventListener:(t,f)=>events[t]=f,querySelector:()=>null,activeElement:null},
    window:{scrollY:0,scrollTo:()=>{}},history:{go:()=>{}},addEventListener:()=>{},setTimeout:fn=>timers.push(fn),
    CSS:{escape:x=>x},mdw:x=>x,hm:x=>x,MODAL_ACT:{},PV_BLOCK:new Set(),$:()=>null,
    tx:x=>x,esc:x=>x,fmtDelta:x=>x,recentManualMove:null};
  vm.createContext(ctx);vm.runInContext(manual,ctx);
  return {ctx,P,log,timers,events};
}
test('selected new view has no original ghosts; cmp keeps them',()=>{
  const h=harness(),b=h.ctx.S.blocks[0],a=h.P.after.blocks[0];
  h.P.ops=[{oid:'o1',si:0,code:'A01',step:'cut',prev:[b],next:[a]}];
  h.ctx.PV.nav.sel={key:'o1|0'};h.ctx.PV.mode='new';
  h.ctx.diffOf=()=>({gone:[b]});h.ctx.keyB=x=>JSON.stringify(x);
  const fn=source.slice(source.indexOf('function pvCtx('),source.indexOf('\nfunction ',source.indexOf('function pvCtx(')+1));
  vm.runInContext(fn,h.ctx);
  assert.equal(h.ctx.pvCtx({}).ghosts.length,0);
  h.ctx.PV.mode='cmp';assert.equal(h.ctx.pvCtx({}).ghosts.length,1);
});
test('keyboard Enter/Space on preview block opens detail, never editing modal',()=>{
  for(const key of ['Enter',' ']){
    const h=harness();h.ctx.openModal=()=>h.log.push('edit-modal');h.ctx.pvClickBlock=id=>h.log.push(id);
    const start=source.indexOf('document.addEventListener("keydown",e=>{\n  if(e.key==="Enter"');
    vm.runInContext(source.slice(start,source.indexOf('\n\n/* ===== 8.',start)),h.ctx);
    h.events.keydown({key,target:{closest:()=>({dataset:{bid:'b1'}})},preventDefault(){}});
    assert.deepEqual(h.log,['b1']);
  }
});
test('applicability diagnostics reject apply before any mutation or write',async()=>{
  const h=harness(),base=JSON.stringify(h.ctx.S);
  h.ctx.PV.opts[0].applicable=false;
  await h.ctx.pvApplyManual();
  assert.equal(JSON.stringify(h.ctx.S),base);assert.ok(!h.log.includes('commit'));
});
test('successful apply persists once and completes callback; failed save restores board',async()=>{
  for(const saved of [true,false]){
    const h=harness();h.ctx.commit=async()=>{h.log.push('commit');return saved;};
    await h.ctx.applyManualPreview(h.P,{accepting(){h.ctx.PV=null;},close:e=>h.log.push(e.message),fail:()=>h.log.push('failed'),done:()=>h.log.push('done')});
    assert.equal(h.log.filter(x=>x==='commit').length,1);
    assert.equal(h.log.includes('done'),saved);
    assert.equal(h.ctx.S.blocks[0].s,saved?540:480);
    assert.equal(h.ctx.undoStack.length,saved?1:0);
  }
});
test('stale proposal or unresolved issue never calls accepting or commit',async()=>{
  for(const condition of ['stale','problem']){
    const h=harness();if(condition==='stale')h.ctx.S.log.push('remote');else h.P.problems.push('conflict');
    const base=JSON.stringify(h.ctx.S);
    await h.ctx.applyManualPreview(h.P,{accepting:()=>h.log.push('accepting'),close:e=>h.log.push(e.message)});
    assert.equal(JSON.stringify(h.ctx.S),base);assert.ok(!h.log.includes('accepting'));assert.ok(!h.log.includes('commit'));
  }
});
test('each segment location control carries date, machine, block id and original/new mode',()=>{
  const h=harness();h.ctx.opDetail=()=>({prevSegs:[],nextSegs:[],prevEmps:[],nextEmps:[],split:true,prev:[{id:'old',date:'2026-10-12',m:'a',s:480,e:510}],next:[{id:'new1',date:'2026-10-12',m:'b',s:600,e:630},{id:'new2',date:'2026-10-12',m:'c',s:700,e:730}],rel:[]});
  const html=h.ctx.dpOpDetailHTML(h.P,'o1|0');
  assert.match(html,/data-id="new2"/);assert.match(html,/data-m="c"/);assert.match(html,/data-mode="orig"/);
});
test('execution/general-work validation is enforced at confirm, before accepting',async()=>{
  for(const fn of ['assertExecutionProtected','validateGeneralWork']){
    const h=harness(),base=JSON.stringify(h.ctx.S);
    h.ctx[fn]=()=>{throw new Error('protected');};
    await h.ctx.applyManualPreview(h.P,{accepting:()=>h.log.push('accepting'),close:e=>h.log.push(e.message)});
    assert.equal(JSON.stringify(h.ctx.S),base);assert.deepEqual(h.log,['protected']);
  }
});
test('double confirm while async save pending writes once',async()=>{
  const h=harness();let finish;
  h.ctx.commit=()=>{h.log.push('commit');return new Promise(resolve=>finish=resolve);};
  const task=h.ctx.pvApplyManual();await h.ctx.pvApplyManual();
  assert.equal(h.log.filter(x=>x==='commit').length,1);finish(true);await task;
});
test('segment locator selects correct mode/date/factory and concrete block; stale id does nothing',()=>{
  const h=harness();h.ctx.UI.factory='f1';h.P.after.machines=[{id:'a',factory:'f2'}];h.ctx.factoryOf=m=>m.factory;
  const start=source.indexOf('  "dp-locate":a=>{'),end=source.indexOf('  "pv-sheet":',start);
  vm.runInContext('Object.assign(MODAL_ACT,{'+source.slice(start,end)+'});',h.ctx);
  h.ctx.dpScrollTarget=b=>h.log.push(b.id);
  h.ctx.MODAL_ACT['dp-locate']({dataset:{d:'2026-10-12',id:'b1',m:'a',mode:'new'}});
  assert.equal(h.ctx.UI.factory,'f2');assert.equal(h.ctx.PV.mode,'new');assert.ok(h.log.includes('b1'));
  h.log.length=0;h.ctx.MODAL_ACT['dp-locate']({dataset:{d:'2026-10-12',id:'missing',m:'a',mode:'new'}});assert.equal(h.log.length,0);
});
test('delayed board scroll cannot run after cancel or a different preview',()=>{
  const h=harness();h.ctx.document.querySelector=()=>({scrollIntoView:()=>h.log.push('scroll')});
  h.ctx.dpScrollTarget();h.ctx.PV=null;h.timers.shift()();assert.ok(!h.log.includes('scroll'));
});
test('fallback modal confirm has a success callback and reports validation errors',async()=>{
  const h=harness(),start=source.indexOf('  "drag-confirm":async()=>{'),end=source.indexOf('  "c-week":',start);
  vm.runInContext('Object.assign(MODAL_ACT,{'+source.slice(start,end)+'});',h.ctx);
  h.ctx.UI.modal={t:'drag-preview',proposal:h.P};
  await h.ctx.MODAL_ACT['drag-confirm']();assert.ok(h.log.includes('commit'));
});
test('mobile target scroll places block between sticky actions and bottom drawer',()=>{
  const h=harness(),block={getBoundingClientRect:()=>({top:600,bottom:660}),scrollIntoView:()=>h.log.push('into')};
  h.ctx.window.matchMedia=()=>({matches:true});h.ctx.window.scrollBy=(x,y)=>h.log.push(y);
  h.ctx.document.querySelector=s=>s==='.pv-manual'?{getBoundingClientRect:()=>({bottom:180})}:s==='.pv-drawer'?{getBoundingClientRect:()=>({top:330})}:block;
  h.ctx.dpScrollTarget({id:'b1'});h.timers.shift()();assert.deepEqual(h.log,['into',375]);
});
test('Escape at root cancels without writes; modal Escape is not hijacked by navigation',()=>{
  const h=harness(),start=source.indexOf('document.addEventListener("keydown",e=>{\n  if(e.key==="Enter"');
  vm.runInContext(source.slice(start,source.indexOf('\n\n/* ===== 8.',start)),h.ctx);
  const before=JSON.stringify(h.ctx.S);
  h.events.keydown({key:'Escape',target:{},preventDefault(){}});
  assert.equal(h.ctx.PV,null);assert.equal(JSON.stringify(h.ctx.S),before);assert.ok(!h.log.includes('commit'));
});
test('missing finish dates are unknown, never displayed as unchanged',()=>{
  const h=harness();h.ctx.dpDueRow=()=>'';h.ctx.dueDetail=()=>({qty:10,code:'A01',due:'2026-10-12',finish:null,finishB:null,affectedOps:[],stepRows:[]});
  const html=h.ctx.dpDueDetailHTML(h.P,'o1');assert.match(html,/完成日期尚無法比較/);assert.doesNotMatch(html,/完成日期不變/);
});

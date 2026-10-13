import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(kind){
  let elements=[],html='',focused;const modal={},overlay={scrollTop:0,querySelector:()=>modal,addEventListener:()=>{}};
  const root={querySelector:s=>s==='.overlay'?(html?overlay:null):null,contains:()=>false,
    querySelectorAll:selector=>elements.filter(e=>selector.split(',').some(part=>part.trim().startsWith(e.tag)&&(!part.includes(':not')||e.act!=='close')))};
  Object.defineProperty(root,'innerHTML',{get:()=>html,set:value=>{html=value;elements=[...value.matchAll(/<(input|select|textarea|button)\b([^>]*)>/g)].map(([,tag,attrs])=>({tag,attrs,
    act:attrs.match(/data-act="([^"]+)"/)?.[1],disabled:/\sdisabled(?:[\s=]|$)/.test(attrs),focus(){focused=this;}}));}});
  const ctx={UI:{date:'2026-10-14',modal:{t:kind,id:'B',confirmBusy:kind==='execution',busy:true,saving:true,qtyDraft:25,pendingRequest:{},memoDraft:{text:'Synthetic memo',machineId:'M'},leaveDraft:{employeeId:'E',date:'2026-10-15',note:'Synthetic note'}}},MODALS:{},
    S:{blocks:[{id:'B',qty:100,date:'2026-10-14',m:'M',s:480,e:540}],setupPending:false},STORE:{employeeId:'E'},PV:null,inFactory:()=>true,mach:()=>({label:'Synthetic'}),emp:()=>({name:'Synthetic'}),canPermission:()=>true,executionOf:()=>({qtyDone:10,status:kind==='execution'?'done':'running'}),canReport:()=>true,reportingRole:()=> 'lead',order:()=>({code:'Synthetic'}),stepName:()=> 'Synthetic',mdw:x=>x,hm:x=>x,reportStatus:()=> 'running',
    shownMachines:()=>[{id:'M',label:'Synthetic'}],shownEmployees:()=>[{id:'E',name:'Synthetic'}],esc:x=>String(x),tx:x=>x,
    document:{activeElement:null},$:s=>s==='#modal-root'?root:s==='#ov'?overlay:null,closeModal:()=>{},modalFocusToken:()=>null,modalFocusFromToken:()=>null,
    modalFocusable:()=>elements.filter(e=>e.tag==='button'&&!e.disabled)};
  vm.createContext(ctx);
  const begin=source.indexOf(kind==='execution'?'MODALS.execution=':"MODALS['"+kind+"']=");
  const end=source.indexOf(kind==='scenario-save'?'async function saveScenarioFromModal(':kind==='memo-edit'?'function directWriteStatus(':kind==='execution-report'?'async function reportWork(':kind==='execution'?"MODALS['execution-report']":'/* ---------- 員工月曆',begin);
  vm.runInContext(source.slice(begin,end),ctx);
  const at=source.indexOf('function renderModal(){');vm.runInContext(source.slice(at,source.indexOf('function rerender()',at)),ctx);
  return {ctx,render:()=>ctx.renderModal(),elements:()=>elements,focused:()=>focused,html:()=>html};
}
for(const kind of ['memo-edit','leave-request','execution-report','execution','scenario-save'])test(`actual renderModal freezes ${kind} submitted fields while saving; only close remains available`,()=>{
  const f=fixture(kind);f.render();const fields=f.elements().filter(e=>e.tag!=='button');
  assert.ok(fields.length>=(kind==='execution'?0:['execution-report','scenario-save'].includes(kind)?1:3));assert.ok(fields.every(e=>e.disabled),'submitted fields must not invite edits that the in-flight save cannot include');
  assert.ok(f.elements().filter(e=>e.act==='close').every(e=>!e.disabled));assert.equal(f.focused().act,'close');assert.match(f.html(),/aria-busy="true"/);
  assert.ok(f.elements().find(e=>e.act===(kind==='scenario-save'?'scenario-confirm':kind==='memo-edit'?'memo-save':kind==='execution-report'?'report-work':kind==='execution'?'exec-confirm':'leave-request-save')).disabled);
  f.ctx.UI.modal.saving=false;f.ctx.UI.modal.busy=false;f.ctx.UI.modal.confirmBusy=false;f.render();assert.ok(f.elements().filter(e=>e.tag!=='button').every(e=>!e.disabled));assert.match(f.html(),/aria-busy="false"/);
  assert.ok(f.html().includes(kind==='scenario-save'?'scenario-name':kind==='memo-edit'?'Synthetic memo':kind==='execution-report'?'value="25"':kind==='execution'?'確認完工':'Synthetic note'));
});

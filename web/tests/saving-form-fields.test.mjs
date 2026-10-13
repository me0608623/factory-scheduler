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
  const ctx={UI:{date:'2026-10-14',modal:{t:kind,saving:true,memoDraft:{text:'Synthetic memo',machineId:'M'},leaveDraft:{employeeId:'E',date:'2026-10-15',note:'Synthetic note'}}},MODALS:{},
    shownMachines:()=>[{id:'M',label:'Synthetic'}],shownEmployees:()=>[{id:'E',name:'Synthetic'}],esc:x=>String(x),tx:x=>x,
    document:{activeElement:null},$:s=>s==='#modal-root'?root:s==='#ov'?overlay:null,closeModal:()=>{},modalFocusToken:()=>null,modalFocusFromToken:()=>null,
    modalFocusable:()=>elements.filter(e=>e.tag==='button'&&!e.disabled)};
  vm.createContext(ctx);
  const begin=source.indexOf(kind==='memo-edit'?"MODALS['memo-edit']=":"MODALS['leave-request']=");
  const end=source.indexOf(kind==='memo-edit'?'function directWriteStatus(':'/* ---------- 員工月曆',begin);
  vm.runInContext(source.slice(begin,end),ctx);
  const at=source.indexOf('function renderModal(){');vm.runInContext(source.slice(at,source.indexOf('function rerender()',at)),ctx);
  return {ctx,render:()=>ctx.renderModal(),elements:()=>elements,focused:()=>focused,html:()=>html};
}
for(const kind of ['memo-edit','leave-request'])test(`actual renderModal freezes ${kind} submitted fields while saving; only close remains available`,()=>{
  const f=fixture(kind);f.render();const fields=f.elements().filter(e=>e.tag!=='button');
  assert.ok(fields.length>=3);assert.ok(fields.every(e=>e.disabled),'submitted fields must not invite edits that the in-flight save cannot include');
  assert.ok(f.elements().filter(e=>e.act==='close').every(e=>!e.disabled));assert.equal(f.focused().act,'close');assert.match(f.html(),/aria-busy="true"/);
  assert.ok(f.elements().find(e=>e.act===(kind==='memo-edit'?'memo-save':'leave-request-save')).disabled);
  f.ctx.UI.modal.saving=false;f.render();assert.ok(f.elements().filter(e=>e.tag!=='button').every(e=>!e.disabled));assert.match(f.html(),/aria-busy="false"/);
  assert.ok(f.html().includes(kind==='memo-edit'?'Synthetic memo':'Synthetic note'));
});

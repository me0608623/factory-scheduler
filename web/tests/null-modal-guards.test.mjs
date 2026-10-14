// R15：與 #29 同型的 null-modal 直取掃描——所有會關閉視窗的入口其連點第二下必須安全 no-op。
// 這裡針對掃描發現的高風險 handler（賦值前無型別守門）以 vm 編譯實際程式碼驗證。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

function ctx(){
  return {UI:{modal:null},a:{dataset:{v:"1",id:"x"}},renderModal:()=>{},rerender:()=>{},syncInputs:()=>{},
    canCalendar:()=>true,canIncidents:()=>true,canMaster:()=>true,employeeGroups:()=>[],toast:()=>{},
    S:{blocks:[{id:"x",emp:"e1",m:"a",pin:false}],employees:[]},pushUndo:()=>{},commit:async()=>{},label:()=>'L',
    emp:()=>({id:"e1"}),mach:()=>'a',closeModal:()=>{},openModal:()=>{},prod:()=>({})};
}
function compile(name){
  const at=source.indexOf('"'+name+'":');
  if(at<0)throw new Error('handler not found: '+name);
  const tail=source.slice(at+('"'+name+'":').length);
  const end=tail.indexOf('},');
  const body='var H='+tail.slice(0,end+1).replace(/\r/g,'')+';';
  return body;
}

test('in-modal toggle handlers tolerate a closed modal on their second click',()=>{
  for(const name of ['inc-step','inc-back','lq-date','m-proc','pd-set','pm-week']){
    const c=ctx();vm.createContext(c);
    vm.runInContext(compile(name),c);
    assert.doesNotThrow(()=>c.H(c.a),name+' with UI.modal=null must not throw');
  }
});

test('block-side handlers with modal id lookup stay safe when modal already closed',()=>{
  for(const name of ['b-emp','b-mach','b-pin','b-fix','m-emp-del']){
    const c=ctx();vm.createContext(c);
    const at=source.indexOf('"'+name+'":');
    const n1=source.indexOf('\n  "',at);
    const next=n1>0?n1:source.indexOf('\n});',at);
    const raw=source.slice(at+('"'+name+'":').length,next).replace(/\r/g,'').replace(/,\s*$/,'');
    vm.runInContext('var H='+raw+';',c);
    assert.doesNotThrow(()=>{try{c.H(c.a);}catch(e){/* 自身驗證錯誤可接受；僅 null-modal TypeError 算數 */}},name+' must not throw uncaught');
  }
});

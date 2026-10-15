// R27：#30/#31 修了直接 `UI.modal.x` 模式，漏了別名模式（`const m=UI.modal` 後 `m.x`）——
// 視窗已關時（連點第二下／背景事件關窗與點擊交錯）這些 handler 會拋未捕捉 TypeError。
// 本測試為真斷言：不吞錯、且不得改動狀態或送出寫入。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

function harness(){
  const calls=[];
  const c={UI:{modal:null},a:{dataset:{v:'1',id:'x'},textContent:''},
    renderModal:()=>{},rerender:()=>{},syncInputs:()=>{},
    canCalendar:()=>true,canIncidents:()=>true,canMaster:()=>true,canOrders:()=>true,canGroups:()=>true,
    employeeGroups:()=>[],toast:()=>calls.push('toast'),
    S:{blocks:[{id:'x',emp:'e1',m:'a',pin:false,date:'2026-01-05',s:480,e:540}],employees:[{id:'e1',leaves:[],name:'E'}],groups:[],groupMembers:[],orders:[]},
    pushUndo:()=>calls.push('undo'),commit:async()=>{calls.push('commit');return true},
    label:()=>'L',emp:()=>({id:'e1',leaves:[],name:'E'}),mach:()=>'a',closeModal:()=>calls.push('close'),
    openModal:()=>calls.push('open'),prod:()=>({}),captureFault:()=>calls.push('capture'),
    toggleIn:(arr,v)=>calls.push('toggle:'+v),undoStack:[],tx:x=>x,factoryOf:()=>'a',uid:()=>'n1'};
  vm.createContext(c);
  return {c,calls};
}
// 物件字面成員切片：括號平衡掃描（跳過字串／模板／註解），到成員值的第一層深度歸零為止
function compileEntry(c,quote,name){
  const at=source.indexOf(quote+name+quote+':');
  if(at<0)throw new Error('handler not found: '+name);
  let i=at+(quote+name+quote+':').length;
  while(source[i]===' ')i++;
  const start=i;
  const arrow=source.indexOf('=>',i);
  const bodyOpen=source.indexOf('{',arrow);
  i=bodyOpen+1;
  let depth=1;
  for(;i<source.length&&depth>0;i++){
    const ch=source[i];
    if(ch==='/'&&source[i+1]==='/'){while(i<source.length&&source[i]!=='\n')i++;continue;}
    if(ch==='/'&&source[i+1]==='*'){i=source.indexOf('*/',i)+1;continue;}
    if(ch==="'"||ch==='"'){const q=ch;i++;while(i<source.length&&source[i]!==q){if(source[i]==='\\')i++;i++;}continue;}
    if(ch==='`'){i++;while(i<source.length&&source[i]!=='`'){if(source[i]==='\\')i++;else if(source[i]==='$'&&source[i+1]==='{'){let d=1;i+=2;while(i<source.length&&d>0){if(source[i]==='{')d++;else if(source[i]==='}')d--;else if(source[i]==='\\')i++;i++;}i--;}i++;}continue;}
    if('([{'.includes(ch))depth++;
    else if(')]}'.includes(ch)){depth--;if(depth===0)i++;}
  }
  if(depth!==0)throw new Error('unbalanced slice for '+name);
  const raw=source.slice(start,i).replace(/\r/g,'').replace(/,\s*$/,'');
  vm.runInContext('var H='+raw+';',c);
  return c.H;
}

test('alias-deref modal handlers are clean no-ops when the modal already closed',()=>{
  const names=['m-leave','m-emp-save','m-emp-del','m-fault','m-mach-save','o-save','b-emp','b-mach','b-pin','b-del','pd-save','pm-save'];
  for(const n of names){
    const h=harness();
    const H=compileEntry(h.c,'"',n);
    assert.doesNotThrow(()=>H(h.c.a),n+' with UI.modal=null must not throw');
    assert.deepEqual(h.calls,[],n+' must not mutate state or commit anything');
  }
});

test('MODAL_ACT group handlers are clean no-ops when the modal already closed',()=>{
  for(const n of ['group-member','group-save']){
    const h=harness();
    const H=compileEntry(h.c,"'",n);
    assert.doesNotThrow(()=>H(h.c.a),n+' with UI.modal=null must not throw');
    assert.deepEqual(h.calls,[],n+' must not mutate state or commit anything');
  }
});

test('confirmStep with a closed modal reports not-confirmed instead of throwing',()=>{
  const h=harness();
  const at=source.indexOf('function confirmStep(');
  vm.runInContext(source.slice(at,source.indexOf('\n',at)+1),h.c);
  let r;
  assert.doesNotThrow(()=>{r=h.c.confirmStep(h.c.a,'x');},'confirmStep with UI.modal=null must not throw');
  assert.equal(r,false,'treated as not confirmed');
});

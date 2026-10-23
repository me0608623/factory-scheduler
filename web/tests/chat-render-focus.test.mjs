import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture({modal=false,editing=false}={}){
  const body={classList:{toggle(){}}},document={body,querySelector:()=>null};
  const input={isConnected:true,value:'Unsent draft',selectionStart:3,selectionEnd:8,
    closest:selector=>selector==='#schedule-chat'?{}:null,getClientRects:()=>[{}],
    focus:()=>{document.activeElement=input;}};
  const modalInput={focus:()=>{document.activeElement=modalInput;},select(){}};
  document.activeElement=input;
  const app={set innerHTML(value){input.isConnected=false;document.activeElement=body;}};
  const env={document,window:{scrollY:0,scrollTo(){}},UI:{prefs:{language:'zh-TW'},view:'day',
    modal:modal?{}:null,editCell:editing?{}:null},PV:null,I18N:{},
    $:selector=>selector==='#app'?app:selector==='.cellinp'?modalInput:null,
    ensureVisualStyles(){},topHTML:()=>'',appNavHTML:()=>'',bannerHTML:()=>'',dayHTML:()=>'',generalBoardHTML:()=>'',drawerHTML:()=>'',
    initScheduleLocator(){},initFloatWins(){},watchHeader(){},renderModal:()=>modalInput.focus(),
    scheduleChat:{refresh:()=>{input.isConnected=true;}}};
  vm.createContext(env);
  vm.runInContext(source.slice(source.indexOf('function render(){'),source.indexOf('let _hdrRO=',source.indexOf('function render(){'))),env);
  return {run:()=>env.render(),document,input,modalInput};
}

test('background render retains chat typing focus, draft and selection after remounting',()=>{
  const f=fixture();f.run();
  assert.equal(f.document.activeElement,f.input,'chat textarea must retain focus');
  assert.equal(f.input.value,'Unsent draft');
  assert.deepEqual([f.input.selectionStart,f.input.selectionEnd],[3,8]);
});

test('modal and cell editing focus supersede previous chat focus',()=>{
  for(const options of [{modal:true},{editing:true}]){
    const f=fixture(options);f.run();assert.equal(f.document.activeElement,f.modalInput);
  }
});

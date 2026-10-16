import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(){
  const frames=[];
  class El{isConnected=true;disabled=false;focus(){ctx.document.activeElement=this;}matches(){return this.disabled;}}
  const launcher=new El(),dialog=new El(),root={innerHTML:''};
  const ctx={UI:{modal:null},document:{activeElement:launcher,body:new El()},HTMLElement:El,
    cancelPlanCalculation(){},renderModal:()=>dialog.focus(),maybeReload(){},$:()=>root,
    requestAnimationFrame:fn=>frames.push(fn)};
  vm.createContext(ctx);
  const start=source.indexOf('function openModal('),end=source.indexOf('function ownsLegacyRequest(',start);
  vm.runInContext('let modalReturnFocus=null;'+source.slice(start,end),ctx);
  return {ctx,launcher,dialog,frames,flush:()=>{while(frames.length)frames.shift()();}};
}
test('ordinary close returns focus once, skipping disconnected or disabled launchers',()=>{
  for(const state of ['normal','disconnected','disabled']){
    const f=fixture();f.ctx.openModal({t:'first'});f.ctx.closeModal();
    if(state==='disconnected')f.launcher.isConnected=false;
    if(state==='disabled')f.launcher.disabled=true;
    f.flush();assert.equal(f.ctx.document.activeElement,state==='normal'?f.launcher:f.dialog);
  }
});
test('closing then opening another dialog before the frame cannot steal its focus',()=>{
  const f=fixture();f.ctx.openModal({t:'first'});f.ctx.closeModal();f.ctx.openModal({t:'second'});
  f.flush();assert.equal(f.ctx.document.activeElement,f.dialog);
  assert.equal(f.ctx.UI.modal.t,'second');
});
test('repeated close and reopen cycles keep focus in the current dialog',()=>{
  const f=fixture();
  for(let i=0;i<20;i++){
    f.ctx.openModal({t:'first'});f.ctx.closeModal();f.ctx.closeModal();f.ctx.openModal({t:'next'});
    f.flush();assert.equal(f.ctx.document.activeElement,f.dialog);
  }
});

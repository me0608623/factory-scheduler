import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(){
  const frames=[];
  class El{
    isConnected=true;disabled=false;hidden=false;dataset={};
    focus(){if(this.isConnected&&!this.disabled&&!this.hidden)ctx.document.activeElement=this;}
    matches(selector){return selector===':disabled'?this.disabled:this.mobileFirstWork===true;}
    getClientRects(){return this.hidden?[]:[{}];}
  }
  const launcher=new El(),dialog=new El(),block=new El(),root={innerHTML:''};
  block.dataset.bid='sim-block';
  const ctx={UI:{modal:null},document:{activeElement:launcher,body:new El(),
    querySelector:selector=>selector===`.blk[data-bid="${block.dataset.bid}"]`?block:null},HTMLElement:El,CSS:{escape:value=>value},
    cancelPlanCalculation(){},renderModal:()=>dialog.focus(),maybeReload(){},$:()=>root,
    requestAnimationFrame:fn=>frames.push(fn)};
  vm.createContext(ctx);
  const start=source.indexOf('function openModal('),end=source.indexOf('function ownsLegacyRequest(',start);
  vm.runInContext('let modalReturnFocus=null;'+source.slice(start,end),ctx);
  return {ctx,launcher,dialog,block,frames,flush:()=>{while(frames.length)frames.shift()();}};
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

test('closing after the mobile shortcut disappears focuses its matching schedule block',()=>{
  const f=fixture();f.launcher.mobileFirstWork=true;f.launcher.dataset.v='sim-block';
  f.ctx.openModal({t:'block'});f.launcher.hidden=true;f.ctx.closeModal();f.flush();
  assert.equal(f.ctx.document.activeElement,f.block);
});

test('a visible mobile shortcut remains the return target',()=>{
  const f=fixture();f.launcher.mobileFirstWork=true;f.launcher.dataset.v='sim-block';
  f.ctx.openModal({t:'block'});f.ctx.closeModal();f.flush();
  assert.equal(f.ctx.document.activeElement,f.launcher);
});

test('an unavailable matching block does not receive focus',()=>{
  for(const state of ['missing','hidden','disabled','disconnected']){
    const f=fixture();f.launcher.mobileFirstWork=true;f.launcher.dataset.v='sim-block';
    if(state==='missing')f.block.dataset.bid='other-block';
    if(state==='hidden')f.block.hidden=true;
    if(state==='disabled')f.block.disabled=true;
    if(state==='disconnected')f.block.isConnected=false;
    f.ctx.openModal({t:'block'});f.launcher.hidden=true;f.ctx.closeModal();f.flush();
    assert.equal(f.ctx.document.activeElement,f.dialog,state);
  }
});

test('the hidden shortcut fallback cannot steal focus from a newly opened dialog',()=>{
  const f=fixture();f.launcher.mobileFirstWork=true;f.launcher.dataset.v='sim-block';
  f.ctx.openModal({t:'block'});f.launcher.hidden=true;f.ctx.closeModal();f.ctx.openModal({t:'next'});f.flush();
  assert.equal(f.ctx.document.activeElement,f.dialog);
  assert.equal(f.ctx.UI.modal.t,'next');
});

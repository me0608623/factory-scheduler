import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('    case "feedback-list":');
const end=source.indexOf('    case "undo":',start);
assert.ok(start>=0&&end>start);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const requests=[],messages=[];let renders=0;
  const client={rpc:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))};
  const ctx={UI:{modal:null},STORE:{kind:'supabase',role:'boss',sb:client,session:{user:{id:'a'}},authEpoch:0},
    toast:m=>messages.push(m),renderModal:()=>{renders++;}};
  ctx.openModal=m=>{ctx.UI.modal=m;};ctx.closeModal=()=>{ctx.UI.modal=null;};
  vm.createContext(ctx);vm.runInContext('function open(){switch("feedback-list"){'+source.slice(start,end)+'}}',ctx);
  return {ctx,requests,messages,open:()=>ctx.open(),renders:()=>renders};
}

test('old feedback success cannot overwrite a reopened list',async()=>{
  const f=fixture();f.open();const old=f.ctx.UI.modal;f.open();const current=f.ctx.UI.modal;
  f.requests[1].resolve({data:[{id:'new'}],error:null});await tick();
  f.requests[0].resolve({data:[{id:'old'}],error:null});await tick();
  assert.equal(f.ctx.UI.modal,current);
  assert.deepEqual(current.items,[{id:'new'}]);
  assert.equal(f.renders(),1);assert.equal(old.loading,true);
});

test('late feedback failure after cancellation cannot close a different dialog',async()=>{
  const f=fixture();f.open();const other={t:'memo-edit',draft:'Keep this'};f.ctx.UI.modal=other;
  f.requests[0].reject(new Error('Old error'));await tick();
  assert.equal(f.ctx.UI.modal,other);assert.deepEqual(f.messages,[]);assert.equal(f.renders(),0);
});

test('returned feedback errors are surfaced and a fresh retry can load results',async()=>{
  const f=fixture();f.open();f.requests[0].resolve({data:null,error:{message:'Synthetic read denied'}});await tick();
  assert.deepEqual(f.messages,['Synthetic read denied']);assert.equal(f.renders(),0);
  f.open();f.requests[1].resolve({data:[{id:'retry'}],error:null});await tick();
  assert.deepEqual(f.ctx.UI.modal.items,[{id:'retry'}]);assert.equal(f.requests.length,2);
});

test('late success and failure are ignored after account, client, role or login lifetime changes',async()=>{
  for(const change of ['user','client','store','epoch','role','logout'])for(const outcome of ['success','error']){
    const f=fixture();f.open();const modal=f.ctx.UI.modal;
    if(change==='user')f.ctx.STORE.session={user:{id:'b'}};
    if(change==='client')f.ctx.STORE.sb={};
    if(change==='store')f.ctx.STORE={...f.ctx.STORE};
    if(change==='epoch')f.ctx.STORE.authEpoch++;
    if(change==='role')f.ctx.STORE.role='viewer';
    if(change==='logout')f.ctx.STORE.session=null;
    if(outcome==='success')f.requests[0].resolve({data:[{id:'old-account'}],error:null});
    else f.requests[0].reject(new Error('Old account error'));
    await tick();
    assert.equal(f.ctx.UI.modal,modal,change+'/'+outcome);
    assert.equal(modal.loading,true);assert.equal(modal.items.length,0);
    assert.equal(f.renders(),0);assert.deepEqual(f.messages,[]);
  }
});

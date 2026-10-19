import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const profileFn=source.slice(source.indexOf('async function saveOwnProfile('),source.indexOf('\nfunction moreDrawerHTML('));
const accessEntries=source.slice(source.indexOf("  'access-reset':async a=>"),source.indexOf("\n});",source.indexOf("  'access-save':async a=>")));
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('#D3 saveOwnProfile: account switch mid-save must not rename the new store or toast',async()=>{
  const run=async(stale)=>{
    const pending=deferred(),toasts=[],renders=[];
    const btn={disabled:false};
    const ctx={STORE:{updateProfile:()=>pending.promise,session:{user:{id:'u1'}},authEpoch:1},
      $:()=>({value:'舊帳號新名字'}),toast:m=>toasts.push(m),render:()=>renders.push(1)};
    vm.createContext(ctx);vm.runInContext(profileFn,ctx);
    const task=ctx.saveOwnProfile(btn);
    if(stale)ctx.STORE={session:{user:{id:'u2'}},authEpoch:1};
    pending.resolve();await task;await tick();
    return {ctx,toasts,renders,btn};
  };
  const stale=await run(true);
  assert.equal(stale.ctx.STORE.userName,undefined,'不得把舊名字寫到新 store');
  assert.deepEqual(stale.toasts,[]);assert.deepEqual(stale.renders,[]);
  const ok=await run(false);
  assert.equal(ok.ctx.STORE.userName,'舊帳號新名字');
  assert.deepEqual(ok.toasts,['個人資料已儲存']);assert.equal(ok.renders.length,1);
});

test('#D3 access-save: account switch mid-save must not reopen the accounts modal or toast',async()=>{
  const run=async(stale)=>{
    const pending=deferred(),toasts=[];let reopened=0;
    const ctx={__reopen:0,toasts};
    ctx.STORE={kind:'supabase',role:'boss',setAccessPermissions:()=>pending.promise,session:{user:{id:'u1'}},authEpoch:1};
    ctx.UI={modal:{t:'access-account',account:{userId:'u9',displayName:'測試員'}}};
    ctx.document={querySelectorAll:sel=>sel==='[data-permission]'?[{dataset:{permission:'x'},checked:true}]:[]};
    ctx.toast=m=>toasts.push(m);
    vm.createContext(ctx);
    vm.runInContext("globalThis.MODAL_ACT={'access-accounts':()=>{globalThis.__reopen++;},\n"+accessEntries+"\n};",ctx);
    const btn={disabled:false};
    const task=ctx.MODAL_ACT['access-save'](btn);
    if(stale)ctx.STORE={kind:'supabase',role:'boss',session:{user:{id:'u2'}},authEpoch:1};
    pending.resolve();await task;await tick();
    reopened=ctx.__reopen;
    return {toasts,reopened,btn};
  };
  const stale=await run(true);
  assert.deepEqual(stale.toasts,[]);assert.equal(stale.reopened,0);
  const ok=await run(false);
  assert.deepEqual(ok.toasts,['已更新 測試員 的功能權限']);assert.equal(ok.reopened,1);
});

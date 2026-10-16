import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const keyStart=source.indexOf('"password-save":async a=>{');
const start=source.indexOf('async a=>{',keyStart);
const end=source.indexOf('\n  "reset-local"',start);
const handler=source.slice(start,end).replace(/,\s*$/,'');
for(const outcome of ['success','error']){
  test('password save '+outcome+' belongs only to the originating password dialog and session',async()=>{
    for(const change of ['modal','store','client','user','epoch']){
      let resolve,reject;const pending=new Promise((a,b)=>{resolve=a;reject=b;});
      const calls=[];
      const ctx={UI:{modal:{t:'password'}},
        $:id=>({value:'a-solid-password-123'}),
        STORE:{kind:'supabase',authEpoch:1,session:{user:{id:'A'}},sb:{auth:{}},
          setPassword:pw=>{calls.push(pw);return pending;}},
        toast:x=>{calls.push('toast:'+x);},closeModal:()=>{ctx.UI.modal=null;calls.push('closed');}};
      vm.createContext(ctx);
      vm.runInContext('this.act=('+handler+')',ctx);
      const button={disabled:false};
      const job=ctx.act(button);
      if(change==='modal')ctx.UI.modal={t:'memo-edit',draft:'keep'};
      if(change==='store')ctx.STORE={...ctx.STORE,setPassword:ctx.STORE.setPassword};
      if(change==='client')ctx.STORE.sb={auth:{}};
      if(change==='user')ctx.STORE.session={user:{id:'B'}};
      if(change==='epoch')ctx.STORE.authEpoch++;
      const before=ctx.UI.modal;
      if(outcome==='success')resolve();else reject(new Error('old network error'));
      await job.then(()=>{},()=>{});
      assert.equal(ctx.UI.modal,before,change+' must preserve current dialog');
      assert.deepEqual(calls,['a-solid-password-123'],change+' must suppress stale feedback');
      assert.equal(button.disabled,true,change+' stale path must not resurrect the old button');
    }
  });
}
test('password save closes its own dialog and toasts on fresh success',async()=>{
  let resolve;const pending=new Promise(a=>{resolve=a;});
  const calls=[];
  const ctx={UI:{modal:{t:'password'}},$:()=>({value:'a-solid-password-123'}),
    STORE:{kind:'supabase',authEpoch:1,session:{user:{id:'A'}},sb:{},setPassword:pw=>{calls.push(pw);return pending;}},
    toast:x=>{calls.push('toast:'+x);},closeModal:()=>{ctx.UI.modal=null;calls.push('closed');}};
  vm.createContext(ctx);
  vm.runInContext('this.act=('+handler+')',ctx);
  const job=ctx.act({disabled:false});
  resolve();
  await job;
  assert.deepEqual(calls,['a-solid-password-123','closed','toast:登入密碼已設定']);
});
test('password validation rejects short or mismatched input without touching the network',async()=>{
  for(const [pw,again,msg] of [['short','short','len'],['good-password-123','different-123','mismatch']]){
    const calls=[];
    const ctx={UI:{modal:{t:'password'}},$:id=>({value:id==='#new-password'?pw:again}),
      STORE:{kind:'supabase',authEpoch:1,session:{user:{id:'A'}},sb:{},setPassword:x=>{calls.push(x);return Promise.resolve();}},
      toast:x=>{calls.push('toast');},closeModal:()=>{calls.push('closed');}};
    vm.createContext(ctx);
    vm.runInContext('this.act=('+handler+')',ctx);
    await ctx.act({disabled:false});
    assert.deepEqual(calls,['toast'],msg+' → only a validation toast');
  }
});
test('password save ignores clicks when another dialog is open',async()=>{
  const calls=[];
  const ctx={UI:{modal:{t:'settings'}},$:()=>({value:'x'}),STORE:{},toast:()=>{calls.push('toast');},closeModal:()=>{calls.push('closed');}};
  vm.createContext(ctx);
  vm.runInContext('this.act=('+handler+')',ctx);
  await ctx.act({disabled:false});
  assert.deepEqual(calls,[],'no-op outside the password dialog');
});

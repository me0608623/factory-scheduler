import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';
import {SOLVER} from '../src/solver.js';

test('排程查詢使用自動更新後的登入憑證；登出後不再提供舊權限',async()=>{
  const initial={access_token:'synthetic-old-token',user:{id:'test-user'}};
  const callbacks=[];
  const client={
    auth:{
      getSession:async()=>({data:{session:initial}}),
      onAuthStateChange:callback=>{callbacks.push(callback);return {data:{subscription:{unsubscribe(){}}}};},
    },
    from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role:'lead',display_name:'合成測試'}};}}),
  };
  const store=new SupabaseStore(client);await store.init();await store.init();
  assert.equal(callbacks.length,1,'重複初始化不得重複監聽');
  assert.equal(store.jwt(),'synthetic-old-token');
  const refreshed={...initial,access_token:'synthetic-refreshed-token'};
  callbacks[0]('TOKEN_REFRESHED',refreshed);
  assert.equal(store.jwt(),'synthetic-refreshed-token');assert.equal(store.role,'lead');
  const priorFetch=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{
      assert.ok(url.endsWith('/chat/db'));
      assert.equal(options.headers.Authorization,'Bearer synthetic-refreshed-token');
      assert.equal(JSON.parse(options.body).generate,false);
      return {ok:true,json:async()=>({engine:'synthetic-readonly-test'})};
    };
    await SOLVER.chat({question:'完成進度',date:'2026-09-30',generate:false},store.jwt());
  }finally{globalThis.fetch=priorFetch;}
  callbacks[0]('TOKEN_REFRESHED',{access_token:'other-identity-token',user:{id:'other-user'}});
  assert.equal(store.jwt(),null);assert.equal(store.role,null,'不同身分不可沿用前一人的角色');
  await store.init();assert.equal(callbacks.length,1);
  callbacks[0]('SIGNED_OUT',null);
  assert.equal(store.jwt(),null);assert.equal(store.role,null);assert.equal(store.userName,'');
  // A later token event must not resurrect a signed-out identity/role.
  callbacks[0]('TOKEN_REFRESHED',refreshed);
  assert.equal(store.jwt(),null);assert.equal(store.role,null);
});

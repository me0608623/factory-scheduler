import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const input={sourceName:'Synthetic.xlsx',sourceSha256:'a'.repeat(64),legacy:{dates:['2026-10-14'],days:{}}};
const row={id:'11111111-1111-4111-8111-111111111111',source_sha256:input.sourceSha256};

test('actual SDK cannot dispatch an old archive insert using an account switched during token acquisition',async()=>{
  const waiting=deferred(),release=deferred(),requests=[];let insertPhase=false;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
    accessToken:async()=>{if(insertPhase){waiting.resolve();return release.promise;}return 'synthetic-token-A';},
    global:{fetch:async(url,options)=>{
      const method=options?.method||'GET';requests.push({method,authorization:new Headers(options?.headers).get('Authorization')});
      if(method==='GET'){insertPhase=true;return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});}
      return new Response(JSON.stringify(row),{status:201,headers:{'Content-Type':'application/json'}});
    }},
  });
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-token-A'};
  const job=store.saveLegacyArchive(input);job.catch(()=>{});await waiting.promise;
  store.session={user:{id:'B'},access_token:'synthetic-token-B'};store.authEpoch++;
  release.resolve('synthetic-token-B');await assert.rejects(job,/登入狀態已變更/);
  assert.equal(requests.filter(r=>r.method==='POST').length,1);
  assert.equal(requests.find(r=>r.method==='POST').authorization,'Bearer synthetic-token-A');
});

test('actual SDK list/payload reads stay bound to the original token and reject old-owner results',async()=>{
  for(const method of ['listLegacyArchives','getLegacyArchive']){
    const waiting=deferred(),release=deferred(),requests=[];let pause=false;
    const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
      accessToken:async()=>{if(pause){waiting.resolve();return release.promise;}return 'synthetic-token-A';},
      global:{fetch:async(url,options)=>{
        requests.push(new Headers(options?.headers).get('Authorization'));
        return new Response(JSON.stringify(method==='getLegacyArchive'?{payload:input.legacy}:[row]),{status:200,headers:{'Content-Type':'application/json'}});
      }},
    });
    const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-token-A'};
    pause=true;const job=store[method](row.id);job.catch(()=>{});await waiting.promise;
    store.session={user:{id:'B'},access_token:'synthetic-token-B'};store.authEpoch++;
    release.resolve('synthetic-token-B');await assert.rejects(job,/登入狀態已變更/);
    assert.deepEqual(requests,['Bearer synthetic-token-A']);
  }
});

test('actual SDK conflict recovery cannot switch tokens while its access-token lookup is in flight',async()=>{
  const waiting=deferred(),release=deferred(),requests=[];let recover=false;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
    accessToken:async()=>{if(recover){waiting.resolve();return release.promise;}return 'synthetic-token-A';},
    global:{fetch:async(url,options)=>{
      const method=options?.method||'GET';requests.push({method,authorization:new Headers(options?.headers).get('Authorization')});
      if(method==='POST'){recover=true;return new Response(JSON.stringify({code:'23505',message:'synthetic duplicate'}),{status:409,headers:{'Content-Type':'application/json'}});}
      return new Response(JSON.stringify(recover?row:[]),{status:200,headers:{'Content-Type':'application/json'}});
    }},
  });
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-token-A'};
  const job=store.saveLegacyArchive(input);job.catch(()=>{});await waiting.promise;
  store.session={user:{id:'B'},access_token:'synthetic-token-B'};store.authEpoch++;
  release.resolve('synthetic-token-B');await assert.rejects(job,/登入狀態已變更/);
  assert.deepEqual(requests.map(r=>r.method),['GET','POST','GET']);
  assert.ok(requests.every(r=>r.authorization==='Bearer synthetic-token-A'));
});

test('actual SDK same-owner refresh keeps the started operation pinned, then next operation uses the fresh token',async()=>{
  const requests=[];let current='synthetic-token-A',store;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
    accessToken:async()=>current,
    global:{fetch:async(url,options)=>{
      const method=options?.method||'GET';requests.push({method,authorization:new Headers(options?.headers).get('Authorization')});
      if(requests.length===1){current='synthetic-token-refreshed';store.session={user:{id:'A'},access_token:current};return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});}
      return new Response(JSON.stringify(method==='POST'?row:[row]),{status:method==='POST'?201:200,headers:{'Content-Type':'application/json'}});
    }},
  });
  store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:current};
  assert.equal((await store.saveLegacyArchive(input)).id,row.id);await store.listLegacyArchives();
  assert.deepEqual(requests.map(r=>r.authorization),['Bearer synthetic-token-A','Bearer synthetic-token-A','Bearer synthetic-token-refreshed']);
  // A direct next SDK request still uses its own refreshed session; pinning the
  // archive builders must not mutate the shared client default Authorization.
  await client.from('synthetic_probe').select('*');assert.equal(requests.at(-1).authorization,'Bearer synthetic-token-refreshed');
});

test('missing owner/token fails closed before SDK dispatch; an expired pinned token remains an error',async()=>{
  for(const method of ['listLegacyArchives','getLegacyArchive','saveLegacyArchive']){
    let sends=0;const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
      accessToken:async()=>null,global:{fetch:async()=>{sends++;throw new Error('must not dispatch');}},
    });
    const store=new SupabaseStore(client);store.session={user:{id:'A'}};
    await assert.rejects(store[method](method==='saveLegacyArchive'?input:row.id),/登入狀態已變更/);assert.equal(sends,0);
  }
  const requests=[];const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
    accessToken:async()=> 'synthetic-fresh-token',global:{fetch:async(url,options)=>{
      requests.push(new Headers(options?.headers).get('Authorization'));
      return new Response(JSON.stringify({code:'PGRST301',message:'synthetic expired token'}),{status:401,headers:{'Content-Type':'application/json'}});
    }},
  });
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-expired-token'};
  await assert.rejects(store.saveLegacyArchive(input),/檢查歷史排程失敗/);
  assert.deepEqual(requests,['Bearer synthetic-expired-token']);
});

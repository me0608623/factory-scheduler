import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';

const identity=id=>({user:{id,email:id+'@invalid'},access_token:'synthetic-'+id});
function profileClient({profile,permissions,rpc}={}){
  const queries=[];
  const client={queries,rpc:rpc||(async()=>({data:{displayName:'TEST-A-SAVED'},error:null})),from:table=>{
    const q={select(){return q;},eq(key,value){queries.push({table,key,value});return q;},
      maybeSingle:async()=>profile?profile():({data:{role:'lead',display_name:'TEST-A',employee_id:'TEST-A-E'},error:null}),
      then(resolve,reject){return Promise.resolve(permissions?permissions():({data:[],error:null})).then(resolve,reject);}};
    return q;
  }};
  return client;
}
function state(store){return {role:store.role,permissions:store.permissions,userName:store.userName,employeeId:store.employeeId};}
function fresh(store,mode){
  if(mode==='client')store.sb=profileClient();
  else{store._clearSession();store.session=identity(mode==='login'?'TEST-A':'TEST-B');}
  store.role='worker';store.permissions={'schedule.manage':false};store.userName='FRESH-NAME';store.employeeId='FRESH-E';
}

test('late profile or permission replies cannot mix accounts, clients or login lifetimes',async()=>{
  for(const stage of ['profile','permissions'])for(const mode of ['account','login','client']){
    let finish,entered;const started=new Promise(resolve=>entered=resolve);
    const slow=()=>new Promise(resolve=>{finish=resolve;entered();});
    const client=profileClient(stage==='profile'?{profile:slow}:{permissions:slow});
    const store=new SupabaseStore(client);store.session=identity('TEST-A');
    const request=store._profile();await started;fresh(store,mode);const before=state(store);
    finish({data:stage==='profile'?{role:'boss',display_name:'OLD-NAME',employee_id:'OLD-E'}:[{permission:'schedule.manage',allowed:true}],error:null});
    await assert.rejects(request,/登入狀態已變更/);assert.deepEqual(state(store),before,stage+'/'+mode);
    assert.ok(client.queries.every(q=>q.value==='TEST-A'),'both queries belong to the original identity');
  }
});

test('role and grants are accepted atomically; failed refresh revokes stale cached write permissions',async()=>{
  let finish,entered;const started=new Promise(resolve=>entered=resolve);
  const store=new SupabaseStore(profileClient({permissions:()=>new Promise(resolve=>{finish=resolve;entered();})}));
  store.session=identity('TEST-A');store.role='boss';store.permissions={'master.manage':true};store.userName='OLD-NAME';
  const task=store._profile();await started;
  assert.equal(store.role,'boss','a half-loaded profile is not accepted');
  finish({data:null,error:{message:'TEST-OFFLINE'}});await assert.rejects(task,/TEST-OFFLINE/);
  assert.equal(store.role,null);assert.deepEqual(store.permissions,{});assert.equal(store.can('schedule.manage'),false);assert.equal(store.can('master.manage'),false);
});

test('late profile save cannot rename a new account or login lifetime; token refresh stays valid',async()=>{
  for(const mode of ['account','login','client','token']){
    let finish;const store=new SupabaseStore(profileClient({rpc:()=>new Promise(resolve=>finish=resolve)}));
    store.session=identity('TEST-A');store.userName='ORIGINAL';
    const task=store.updateProfile({displayName:'TEST-A-SAVED'});
    if(mode==='token')store.session={...identity('TEST-A'),access_token:'synthetic-refreshed'};else fresh(store,mode);
    finish({data:{displayName:'TEST-A-SAVED'},error:null});
    if(mode==='token'){await task;assert.equal(store.userName,'TEST-A-SAVED');}
    else{await assert.rejects(task,/登入狀態已變更/);assert.equal(store.userName,'FRESH-NAME');}
  }
});

test('same-account profile refresh accepts role, employee and grants together after a token refresh',async()=>{
  let finish,entered;const started=new Promise(resolve=>entered=resolve);
  const client=profileClient({permissions:()=>new Promise(resolve=>{finish=resolve;entered();})});
  const store=new SupabaseStore(client);store.session=identity('TEST-A');
  const task=store._profile();await started;
  assert.equal(store.role,null);assert.equal(store.userName,'');
  store.session={...identity('TEST-A'),access_token:'synthetic-refreshed'};
  finish({data:[{permission:'master.manage',allowed:true}],error:null});await task;
  assert.equal(store.role,'lead');assert.equal(store.employeeId,'TEST-A-E');assert.equal(store.userName,'TEST-A');assert.equal(store.can('master.manage'),true);
  assert.deepEqual(client.queries.map(q=>q.value),['TEST-A','TEST-A']);
});

test('missing profile or malformed permission bodies cannot preserve or create cached write access',async()=>{
  for(const body of [null,undefined,{},[null],['invalid'],[{permission:'schedule.manage',allowed:'false'}]]){
    const store=new SupabaseStore(profileClient({permissions:async()=>({data:body,error:null})}));
    store.session=identity('TEST-A');store.role='boss';store.permissions={'master.manage':true};
    await assert.rejects(store._profile(),/讀取帳號權限失敗/);
    assert.equal(store.role,null);assert.deepEqual(store.permissions,{});assert.equal(store.can('schedule.manage'),false);
  }
  const store=new SupabaseStore(profileClient({profile:async()=>({data:null,error:null})}));
  store.session=identity('TEST-A');store.role='boss';
  await assert.rejects(store._profile(),/讀取帳號權限失敗/);assert.equal(store.role,null);
});

test('profile query failures fail closed without requesting grants',async()=>{
  const client=profileClient({profile:async()=>({data:null,error:{message:'TEST-PROFILE-OFFLINE'}})});
  const store=new SupabaseStore(client);store.session=identity('TEST-A');store.role='lead';store.permissions={'master.manage':true};
  await assert.rejects(store._profile(),/TEST-PROFILE-OFFLINE/);
  assert.equal(client.queries.length,1);assert.equal(store.role,null);assert.deepEqual(store.permissions,{});
});

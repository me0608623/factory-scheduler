import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';

const hash='a'.repeat(64),row={id:'saved',source_sha256:hash,source_name:'Synthetic.xlsx'};
const input={sourceName:'Synthetic.xlsx',sourceSha256:hash,legacy:{dates:['2026-10-14'],days:{}}};
const duplicate={code:'23505',message:'duplicate key violates unique constraint'};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function fixture({insertError=duplicate,recovered={data:row,error:null},insertPending=null,readPending=null}={}){
  const events=[];let reads=0;
  const client={from(){const q={setHeader(){return q;},select(){return q;},eq(key,value){events.push({type:'eq',key,value});return q;},
    maybeSingle(){reads++;events.push({type:'lookup',n:reads});return reads===1?Promise.resolve({data:null,error:null}):readPending?.promise??Promise.resolve(recovered);},
    insert(){events.push({type:'insert'});return q;},single(){return insertPending?.promise??Promise.resolve({data:null,error:insertError});}};return q;}};
  const store=new SupabaseStore(client);store.session={user:{id:'original'},access_token:'synthetic-token'};store.authEpoch=1;
  return {store,events};
}

test('two actual Store saves whose lookups both miss converge on one real SQL archive without changing schedule',async()=>{
  const db=await makeDb(),uid='22222222-2222-4222-8222-222222222222';
  try{
    await db.query("insert into auth.users(id,email) values($1,'synthetic@x')",[uid]);
    await db.query("update profiles set role='lead' where user_id=$1",[uid]);
    const gate=deferred(),errors=[];let initialReads=0,sqlQueue=Promise.resolve();
    class CollisionClient extends FakeSupabase{
      async _run(sql,params=[]){
        // A single PGlite connection must serialize role scopes. Only the first
        // two completed empty SELECT responses are held at the client boundary.
        const job=sqlQueue.then(()=>super._run(sql,params));sqlQueue=job.then(()=>{},()=>{});
        const result=await job;
        if(sql.startsWith('insert into legacy_schedule_archives')&&result.error)errors.push(result.error.code);
        if(sql.startsWith('select ')&&sql.includes('from legacy_schedule_archives where source_sha256')&&initialReads<2){
          assert.deepEqual(result.data,[]);if(++initialReads===2)gate.resolve();await gate.promise;
        }
        return result;
      }
    }
    const clients=[new CollisionClient(db,{}),new CollisionClient(db,{})];clients.forEach(c=>{c.uid=uid;});
    const stores=clients.map(c=>{const s=new SupabaseStore(c);s.session={user:{id:uid},access_token:'synthetic-token'};return s;});
    const before=await stores[0].load();
    const outcomes=await Promise.allSettled(stores.map(s=>s.saveLegacyArchive(input)));
    assert.equal(initialReads,2);assert.deepEqual(errors,['23505']);
    const rows=(await db.query('select id,payload,source_name from legacy_schedule_archives')).rows;
    assert.equal(rows.length,1);assert.deepEqual(rows[0].payload,input.legacy);
    const after=await stores[0].load();assert.deepEqual(after,before);
    assert.deepEqual(outcomes.map(o=>o.status),['fulfilled','fulfilled']);
    assert.equal(outcomes[0].value.id,rows[0].id);assert.equal(outcomes[1].value.id,rows[0].id);
  }finally{await db.close();}
});
test('23505 recovery reads the same hash once and returns the existing ACK without reinserting',async()=>{
  const f=fixture();assert.deepEqual(await f.store.saveLegacyArchive(input),row);
  assert.equal(f.events.filter(e=>e.type==='insert').length,1);assert.equal(f.events.filter(e=>e.type==='lookup').length,2);
  assert.ok(f.events.filter(e=>e.type==='eq').every(e=>e.key==='source_sha256'&&e.value===hash));
});
test('missing, failed, invalid or wrong-hash duplicate lookup never becomes a success',async()=>{
  for(const recovered of [{data:null,error:null},{data:null,error:{code:'42501',message:'denied'}},{data:{},error:null},{data:{...row,source_sha256:'b'.repeat(64)},error:null}]){
    const f=fixture({recovered});await assert.rejects(f.store.saveLegacyArchive(input),/儲存歷史排程失敗/);
    assert.equal(f.events.filter(e=>e.type==='lookup').length,2);assert.equal(f.events.filter(e=>e.type==='insert').length,1);
  }
});
test('non-unique failures are not retried or hidden by an existing archive',async()=>{
  for(const code of ['42501','23514','500','PGRST301']){
    const f=fixture({insertError:{code,message:'failed'}});await assert.rejects(f.store.saveLegacyArchive(input),/儲存歷史排程失敗/);
    assert.equal(f.events.filter(e=>e.type==='lookup').length,1);
  }
});
test('changed owner after insert conflict cannot issue the recovery read',async()=>{
  const pending=deferred(),f=fixture({insertPending:pending});const job=f.store.saveLegacyArchive(input);await new Promise(r=>setImmediate(r));
  f.store.authEpoch++;pending.resolve({data:null,error:duplicate});await assert.rejects(job,/登入狀態已變更/);
  assert.equal(f.events.filter(e=>e.type==='lookup').length,1);
});
test('changed owner during recovery cannot accept another account archive response',async()=>{
  for(const change of ['user','client','epoch']){
    const pending=deferred(),f=fixture({readPending:pending});const job=f.store.saveLegacyArchive(input);job.catch(()=>{});await new Promise(r=>setImmediate(r));
    if(change==='user')f.store.session={user:{id:'new'}};if(change==='client')f.store.sb={};if(change==='epoch')f.store.authEpoch++;
    pending.resolve({data:row,error:null});await assert.rejects(job,/登入狀態已變更/);
  }
});
test('same-owner token refresh while conflict recovery is pending still returns one existing archive',async()=>{
  const pending=deferred(),f=fixture({readPending:pending});const job=f.store.saveLegacyArchive(input);job.catch(()=>{});await new Promise(r=>setImmediate(r));
  f.store.session={user:{id:'original'},access_token:'synthetic-refreshed-token'};pending.resolve({data:row,error:null});
  assert.deepEqual(await job,row);assert.equal(f.events.filter(e=>e.type==='insert').length,1);
});

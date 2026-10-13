import test from 'node:test';
import assert from 'node:assert/strict';
import {probePostgrestVersion} from './postgrest-version-probe.mjs';
const token=claim=>Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claim)).toString('base64url')+'.synthetic';
const testKey=token({role:'anon',ref:'fkefarcwadvyqqjcjxvp'});
const prodKey=token({role:'anon',ref:'kjnnguekhshkhgycmryl'});
const adminKey=token({role:'service_role',ref:'fkefarcwadvyqqjcjxvp'});
function fixture({source=[prodKey,adminKey,testKey].join(' '),metadata={swagger:'2.0',info:{version:'14.10 (synthetic-hash)',description:'PRIVATE_SCHEMA_COMMENT'}},status=200}={}){
  const calls=[];const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1)return new Response('<script src="/assets/index-synthetic.js"></script>');
    if(calls.length===2)return new Response(source);
    return new Response(JSON.stringify(metadata),{status});
  };return {calls,fetchImpl};
}
test('anonymous version probe makes exactly three read-only requests to pinned test endpoints and only returns version metadata',async()=>{
  const f=fixture(),result=await probePostgrestVersion(f);
  assert.deepEqual(f.calls.map(c=>c.url),['https://factory-scheduler-web-staging.onrender.com/','https://factory-scheduler-web-staging.onrender.com/assets/index-synthetic.js','https://fkefarcwadvyqqjcjxvp.supabase.co/rest/v1/']);
  for(const {options} of f.calls){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal);}
  assert.equal(f.calls[2].options.headers.apikey,testKey);assert.equal(result.advertisedVersion,'14.10');assert.equal(result.retryLoopVerified,false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SCHEMA_COMMENT|eyJ|service_role|kjnnguekhshkhgycmryl/u);
});
test('missing, malformed, admin-only, production-only and ambiguous keys fail before touching any database endpoint',async()=>{
  for(const source of ['',prodKey,adminKey,'eyJbroken.broken.broken',testKey+' '+token({role:'anon',ref:'fkefarcwadvyqqjcjxvp',different:true})]){
    const f=fixture({source});await assert.rejects(probePostgrestVersion(f));assert.equal(f.calls.length,2);
  }
});
test('invalid metadata and HTTP errors cannot become a version or expose server diagnostics',async()=>{
  for(const metadata of [null,{},[],{swagger:'2.0',info:{version:'PRIVATE_IDENTITY'}},{swagger:'2.0',info:{version:16}}]){
    const f=fixture({metadata});await assert.rejects(probePostgrestVersion(f),e=>!e.message.includes('PRIVATE'));
  }
  const f=fixture({status:403,metadata:{message:'PRIVATE_DIAGNOSTIC'}});await assert.rejects(probePostgrestVersion(f),e=>e.message==='Metadata read failed'&&e.httpStatus===403&&e.probeStage==='metadata');
});
test('version-family evidence remains separate from a verified retry loop, including a newer major',async()=>{
  for(const version of ['14.10','16.0.1']){const f=fixture({metadata:{swagger:'2.0',info:{version}}});const result=await probePostgrestVersion(f);
    assert.equal(result.advertisedVersion,version);assert.equal(result.major,Number(version.split('.')[0]));assert.equal(result.retryLoopVerified,false);}
});
test('a sole publishable key is anonymous application authentication, never a fabricated bearer JWT',async()=>{
  const key='sb_publishable_synthetic_public_key_only';const f=fixture({source:'https://fkefarcwadvyqqjcjxvp.supabase.co '+key});
  await probePostgrestVersion(f);assert.equal(f.calls[2].options.headers.apikey,key);assert.equal(f.calls[2].options.headers.Authorization,undefined);
});
test('publishable keys cannot be guessed across missing, production or multiple project configurations',async()=>{
  const key='sb_publishable_synthetic_public_key_only';
  for(const source of [key,'https://kjnnguekhshkhgycmryl.supabase.co '+key,
    'https://fkefarcwadvyqqjcjxvp.supabase.co https://kjnnguekhshkhgycmryl.supabase.co '+key,
    'https://fkefarcwadvyqqjcjxvp.supabase.co '+key+' sb_publishable_synthetic_second_public_key']){
    const f=fixture({source});await assert.rejects(probePostgrestVersion(f));assert.equal(f.calls.length,2);
  }
});
test('HTTP failure classification is an exact allowlist, never server message or identity output',async()=>{
  for(const [message,errorKind] of [['Invalid API key','API_KEY_REJECTED'],['No API key found in request','API_KEY_MISSING'],['Invalid API key: PRIVATE_IDENTITY','UNCLASSIFIED']]){
    const f=fixture({status:401,metadata:{message}});await assert.rejects(probePostgrestVersion(f),e=>e.errorKind===errorKind&&!e.message.includes('PRIVATE'));
  }
});

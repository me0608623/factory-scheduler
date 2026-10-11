import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveRuntime,modeUrl,authReturnUrl,TEST_PROJECT_REF,TEST_SOLVER_ORIGIN} from '../src/runtime-config.js';
const env={VITE_SUPABASE_URL:'https://production.supabase.co',VITE_SUPABASE_ANON_KEY:'prod-public',VITE_SOLVER_URL:'https://prod.example',VITE_SOLVER_API_KEY:'prod-key',
  VITE_TEST_SUPABASE_URL:`https://${TEST_PROJECT_REF}.supabase.co`,VITE_TEST_SUPABASE_ANON_KEY:'test-public',VITE_TEST_SOLVER_URL:TEST_SOLVER_ORIGIN};
test('test mode selects only isolated project/solver and its own auth storage',()=>{
  const c=resolveRuntime(env,{search:'?mode=test'});assert.equal(c.mode,'test');assert.equal(c.anon,'test-public');assert.equal(c.solverUrl,TEST_SOLVER_ORIGIN);
  assert.equal(c.solverKey,'');assert.equal(c.authOptions.storageKey,`fsched-test-auth-${TEST_PROJECT_REF}`);
});
test('missing or wrong test settings never fall back to production/local mode',()=>{
  for(const key of ['VITE_TEST_SUPABASE_URL','VITE_TEST_SUPABASE_ANON_KEY','VITE_TEST_SOLVER_URL'])assert.throws(()=>resolveRuntime({...env,[key]:''},{search:'?mode=test&local=1',hostname:'localhost'}));
  assert.throws(()=>resolveRuntime({...env,VITE_TEST_SOLVER_URL:env.VITE_SOLVER_URL},{search:'?mode=test'}));
  assert.throws(()=>resolveRuntime({...env,VITE_TEST_SUPABASE_URL:env.VITE_SUPABASE_URL},{search:'?mode=test'}));
  assert.throws(()=>resolveRuntime({...env,VITE_SUPABASE_URL:env.VITE_TEST_SUPABASE_URL},{search:'?mode=test'}));
});
test('production preserves its endpoint/auth session; local override remains development-only',()=>{
  const c=resolveRuntime(env,{search:'?local=1',hostname:'factory.example'});assert.equal(c.mode,'production');assert.deepEqual(c.authOptions,{});
  assert.equal(resolveRuntime({...env,DEV:true},{search:'?local=1',hostname:'127.0.0.1'}).mode,'local');
});
test('mode links preserve view query but strip auth callback hash',()=>{
  const location={href:'https://factory.example/?view=shortage#access_token=private'};
  assert.equal(modeUrl(location,true),'/?view=shortage&mode=test');assert.equal(modeUrl({href:'https://factory.example/?mode=test&view=catalog#type=invite'},false),'/?view=catalog');
});
test('client and solver use the same validated runtime; no independent production test fallback',()=>{
  for(const name of ['main.js','solver.js'])assert.match(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),/import \{ RUNTIME \} from '.\/runtime-config.js'/);
});
test('auth redirects retain test mode but never callback tokens or unrelated view query',()=>{
  const loc={href:'https://factory.example/?mode=test&view=catalog#access_token=secret'};
  assert.equal(authReturnUrl(loc,true),'https://factory.example/?mode=test');assert.equal(authReturnUrl(loc,false),'https://factory.example/');
});
test('private service-role and secret keys cannot be included in test frontend config',()=>{
  for(const key of ['sb_secret_do-not-publish','eyJheader.'+btoa(JSON.stringify({role:'service_role'}))+'.sig'])
    assert.throws(()=>resolveRuntime({...env,VITE_TEST_SUPABASE_ANON_KEY:key},{search:'?mode=test'}),/私密金鑰/);
});
test('test solver key comes only from test config, never the production key',()=>{
  const c=resolveRuntime({...env,VITE_TEST_SOLVER_API_KEY:'test-solver-key'},{search:'?mode=test'});
  assert.equal(c.solverKey,'test-solver-key');
  const none=resolveRuntime(env,{search:'?mode=test'});
  assert.equal(none.solverKey,'','未設定時為空，不沿用 VITE_SOLVER_API_KEY');
  assert.notEqual(none.solverKey,env.VITE_SOLVER_API_KEY);
});

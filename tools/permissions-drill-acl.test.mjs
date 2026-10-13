import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDb} from '../web/tests/fake-supabase.mjs';

test('real migration snapshot chain survives the actual drill grant/revoke setup',async()=>{
  const db=await makeDb();
  try{
    const uid='55555555-5555-4555-8555-555555555555';
    await db.query("INSERT INTO auth.users(id,email) VALUES ($1,'synthetic-viewer@example.test')",[uid]);
    await db.query("UPDATE profiles SET role='viewer' WHERE user_id=$1",[uid]);
    const source=readFileSync('.github/workflows/permissions-drill.yml','utf8');
    const start=source.indexOf('drill_required "GRANT');
    assert.ok(start>=0,'execute the actual setup, not an independently retyped SQL surrogate');
    const sqlStart=start+'drill_required "'.length,end=source.indexOf('"',sqlStart);
    await db.exec(source.slice(sqlStart,end).replaceAll('\\$','$'));
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${uid}';`);
    const snapshot=await db.query("SELECT schedule_snapshot() ? 'work_log' AS valid");
    assert.equal(snapshot.rows[0].valid,true);
    await db.exec('RESET ROLE;');
    const helpers=await db.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '\\_snapshot\\_before\\_%' AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')");
    assert.equal(helpers.rows[0].n,0,'all required invoker-chain helpers retain explicit access');
    const guard=await db.query("SELECT has_function_privilege('authenticated','public._guard_work_execution()','EXECUTE') allowed");
    assert.equal(guard.rows[0].allowed,false,'private write guards remain inaccessible');
  }finally{await db.close();}
});

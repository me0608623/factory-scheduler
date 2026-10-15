import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {guardedMigration} from '../../tools/migration-guard.mjs';
process.on('uncaughtException',e=>{console.error('Migration guard test failed: '+e.message);process.exit(1);});
const db=new PGlite(),migrations=new URL('../migrations/',import.meta.url);
const before=await readFile(new URL('../../tools/migration-before.sql',import.meta.url),'utf8');
const after=await readFile(new URL('../../tools/migration-after.sql',import.meta.url),'utf8');
const sql37=await readFile(new URL('0037_permission_whitelist_complete.sql',migrations),'utf8');
try{
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
    CREATE PUBLICATION supabase_realtime;`);
  for(const f of (await readdir(migrations)).sort()){
    if(f>='0037'||f.includes('realtime'))continue;
    await db.exec(await readFile(new URL(f,migrations),'utf8'));
  }
  await db.exec(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-000000000001','synthetic@guard.test');");
  const originalFunction=(await db.query("SELECT pg_get_functiondef('public.role_has_permission(app_role,text)'::regprocedure) d")).rows[0].d;
  const originalState=(await db.query('SELECT to_jsonb(s) data FROM schedule_state s')).rows;
  async function rejectsAndRollsBack(middle,label){
    await db.exec('BEGIN');
    try{await assert.rejects(db.exec(before+'\n'+sql37+'\n'+middle+'\n'+after),/Release data changed|missing_release_function/);}
    finally{await db.exec('ROLLBACK');}
    assert.equal((await db.query("SELECT pg_get_functiondef('public.role_has_permission(app_role,text)'::regprocedure) d")).rows[0].d,originalFunction);
    assert.deepEqual((await db.query('SELECT to_jsonb(s) data FROM schedule_state s')).rows,originalState);
    console.log(label+' rejected and DDL/data rolled back');
  }
  await rejectsAndRollsBack("UPDATE employees SET name='guard-test-only' WHERE id=(SELECT id FROM employees LIMIT 1);",'Same-count roster mutation');
  await rejectsAndRollsBack('UPDATE schedule_state SET setup_pending=NOT setup_pending WHERE id;','setup_pending mutation');
  await rejectsAndRollsBack("UPDATE profiles SET role='boss' WHERE user_id='00000000-0000-0000-0000-000000000001';",'Unapproved account role change');
  await rejectsAndRollsBack("UPDATE auth.users SET email='changed@guard.test' WHERE id='00000000-0000-0000-0000-000000000001';",'Unapproved Auth change');
  await rejectsAndRollsBack('SELECT missing_release_function();','Late SQL failure after permission DDL');
  await db.exec('BEGIN;'+await guardedMigration(sql37)+'COMMIT;');
  assert.equal((await db.query("SELECT role_has_permission('lead','rush.manage') p")).rows[0].p,true);
  assert.equal((await db.query("SELECT role_has_permission('lead','worklog.manage') p")).rows[0].p,true);
  assert.deepEqual((await db.query('SELECT to_jsonb(s) data FROM schedule_state s')).rows,originalState);
  assert.equal((await db.query("SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='release_fingerprint'")).rows[0].n,0);
  console.log('Reviewed 0037 succeeded with data/state unchanged; no persistent helper');
}finally{await db.close();}

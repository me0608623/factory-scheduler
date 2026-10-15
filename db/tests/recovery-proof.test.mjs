import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
  await db.exec(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE employees(id int PRIMARY KEY);
    CREATE TABLE machines(id int PRIMARY KEY);
    CREATE TABLE profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
    INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001');
    INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001');
    INSERT INTO employees SELECT generate_series(1,10);
    INSERT INTO machines VALUES(1);
    ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
    CREATE POLICY test_read ON employees FOR SELECT USING(true);`);
  const sql=await readFile(new URL('../../tools/recovery-proof.sql',import.meta.url),'utf8');
  const {rows}=await db.query(sql);
  assert.deepEqual(rows[0].json_build_object,{auth_users:1,employees:10,machines:1,profiles_without_auth:0,public_rls:1});
  console.log('Recovery proof SQL: real schema user_id/Auth FK/aggregate checks passed');
}finally{await db.close();}

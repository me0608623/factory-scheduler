import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guardedMigration,productionConnectionAllowed} from './migration-guard.mjs';
const sql=await readFile(new URL('../db/migrations/0037_permission_whitelist_complete.sql',import.meta.url),'utf8');
test('only byte-reviewed 0037 is admitted (LF/CRLF normalized)',async()=>{
  assert.equal(await guardedMigration(sql),await guardedMigration(sql.replace(/\r?\n/g,'\r\n')));
  await assert.rejects(guardedMigration(sql,'0036.sql'),/authorized/);
  await assert.rejects(guardedMigration(sql+'\nUPDATE employees SET name=\'bad\';'),/reviewed/);
});
test('only production ref on session/direct PostgreSQL endpoints accepted; never log URL',()=>{
  assert.equal(productionConnectionAllowed('postgresql://postgres.kjnnguekhshkhgycmryl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'),true);
  assert.equal(productionConnectionAllowed('postgresql://postgres:synthetic@db.kjnnguekhshkhgycmryl.supabase.co:5432/postgres'),true);
  for(const url of ['postgresql://postgres.fkefarcwadvyqqjcjxvp:x@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.kjnnguekhshkhgycmryl:x@attacker.example:5432/postgres',
    'postgresql://postgres.kjnnguekhshkhgycmryl:x@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres','garbage'])
    assert.equal(productionConnectionAllowed(url),false);
});

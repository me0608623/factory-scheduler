import test from 'node:test';
import assert from 'node:assert/strict';
import {idempotentRoleCreation} from './restore-roles.mjs';
test('only CREATE ROLE duplicate errors are caught; ALTER/GRANT stay fail-fast',()=>{
  const sql='CREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER;\nGRANT postgres TO service_role;\n';
  const changed=idempotentRoleCreation(sql);
  assert.match(changed,/EXCEPTION WHEN duplicate_object THEN NULL/);
  assert.equal(changed.split('\n').slice(1).join('\n'),sql.split('\n').slice(1).join('\n'));
  assert.doesNotMatch(changed,/WHEN others/i);
});
test('quoted identifiers and apostrophes remain one quoted SQL statement',()=>{
  const changed=idempotentRoleCreation('CREATE ROLE "reader\'s ""quoted"" name";\r\n');
  assert.match(changed,/reader''s ""quoted"" name/);
  assert.equal((changed.match(/DO \$recovery_[a-f0-9]+\$/g)||[]).length,1);
});
test('role name containing a dollar delimiter cannot terminate the DO body',()=>{
  const changed=idempotentRoleCreation('CREATE ROLE "$recovery$";');
  const tag=changed.match(/^DO (\$[^$]+\$)/)[1];
  assert.notEqual(tag,'$recovery$');
  assert.equal(changed.split(tag).length,3);
});

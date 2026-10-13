import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// pg_dumpall emits CREATE ROLE for reserved roles already present in the
// isolated Supabase image. Catch ONLY duplicate_object for those statements;
// all subsequent ALTER/GRANT errors must still abort the restore transaction.
export function idempotentRoleCreation(sql){
  return sql.replace(/^CREATE ROLE ("(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9]*);\r?$/gm,
    (_,name)=>`DO $recovery$ BEGIN EXECUTE 'CREATE ROLE ${name.replaceAll("'","''")}'; EXCEPTION WHEN duplicate_object THEN NULL; END $recovery$;`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,target]=process.argv.slice(2);
  writeFile(target,idempotentRoleCreation(await readFile(source,'utf8')),{flag:'wx',mode:0o600});
}

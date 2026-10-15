import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const MIGRATION='0037_permission_whitelist_complete.sql';
const approved='ab98a089c564ffd19a8d05dad96023b57811f45fcf911371167128c49e717b4f';
export async function guardedMigration(sql,name=MIGRATION){
  if(name!==MIGRATION)throw new Error('Only the authorized 0037 migration is allowed');
  const normalized=sql.replace(/\r\n/g,'\n');
  if(createHash('sha256').update(normalized).digest('hex')!==approved)
    throw new Error('0037 content differs from the reviewed migration');
  const before=await readFile(new URL('./migration-before.sql',import.meta.url),'utf8');
  const after=await readFile(new URL('./migration-after.sql',import.meta.url),'utf8');
  return `${before}\n${normalized}\n${after}\n`;
}
export function productionConnectionAllowed(connection){
  try{
    const u=new URL(connection),ref='kjnnguekhshkhgycmryl';
    if(!['postgresql:','postgres:'].includes(u.protocol)||u.pathname!=='/postgres'||(u.port&&u.port!=='5432'))return false;
    return (u.hostname===`db.${ref}.supabase.co`&&u.username==='postgres')||
      (u.hostname.endsWith('.pooler.supabase.com')&&u.username===`postgres.${ref}`);
  }catch{return false;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const name=process.env.MIGRATION;
  if(name!==MIGRATION)throw new Error('Unauthorized migration');
  if(process.env.DATABASE_URL&&!productionConnectionAllowed(process.env.DATABASE_URL))throw new Error('Database project mismatch');
  const sql=await readFile(new URL(`../db/migrations/${MIGRATION}`,import.meta.url),'utf8');
  await writeFile(process.env.GUARDED_MIGRATION_FILE,await guardedMigration(sql,name),{flag:'wx',mode:0o600});
  console.log('Reviewed 0037 transaction guard prepared');
}

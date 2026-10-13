// Backups are artifacts, not source files. Only ciphertext leaves the runner.
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const payloads=['full.dump','public.dump','roles.sql','inventory.json'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function run(command,args){
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  // Never echo stderr: restore tools may include SQL/data/credentials there.
  if(result.error||result.status!==0)throw new Error('Backup tool failed; no artifact released');
  return result.stdout;
}
export async function packBackup({sourceDir,outDir,recipient,age=process.env.AGE_BIN||'age',projectRef,now=new Date()}){
  if(!/^age1[0-9a-z]{58}$/.test(recipient||''))throw new Error('Missing or invalid age recipient');
  if(projectRef!=='kjnnguekhshkhgycmryl')throw new Error('Backup project mismatch');
  if((await readdir(sourceDir)).sort().join(',')!==[...payloads].sort().join(','))
    throw new Error('Unexpected or incomplete backup payload');
  const files={};
  for(const name of payloads){
    const bytes=await readFile(join(sourceDir,name));
    if(!bytes.length)throw new Error('Empty backup payload');
    if(name.endsWith('.dump')&&bytes.subarray(0,5).toString()!=='PGDMP')throw new Error('Invalid PostgreSQL dump');
    files[name]={bytes:bytes.length,sha256:digest(bytes)};
  }
  const inventory=JSON.parse(await readFile(join(sourceDir,'inventory.json'),'utf8'));
  if(!inventory.schemas?.includes('auth')||!inventory.schemas?.includes('public')||!inventory.schemas?.includes('storage'))
    throw new Error('Database backup missing required schemas');
  // Objects are external to Postgres and require a separate encrypted export.
  // Do not label a DB-only dump as a complete project recovery point.
  const manifest={format:1,projectRef,createdAt:now.toISOString(),scope:'full-database-with-roles',
    storageObjectsIncluded:false,files};
  await writeFile(join(sourceDir,'manifest.json'),JSON.stringify(manifest),{flag:'wx',mode:0o600});
  const archive=join(sourceDir,'payload.tar');
  const encrypted=join(outDir,'database.tar.age');
  await mkdir(outDir,{recursive:true});
  if((await readdir(outDir)).length)throw new Error('Artifact output must be empty');
  run('tar',['-cf',archive,'-C',sourceDir,...payloads,'manifest.json']);
  try{run(age,['-r',recipient,'-o',encrypted,archive]);}
  catch(error){await rm(encrypted,{force:true});throw error;}
  const header=(await readFile(encrypted)).subarray(0,22).toString();
  if(header!=='age-encryption.org/v1\n'){await rm(encrypted,{force:true});throw new Error('Ciphertext validation failed');}
  return {file:encrypted,bytes:(await stat(encrypted)).size};
}
export async function unpackBackup({encrypted,identity,outDir,age=process.env.AGE_BIN||'age',now=Date.now(),maxAgeMs=24*3600*1000}){
  await mkdir(outDir,{recursive:true});
  if((await readdir(outDir)).length)throw new Error('Restore output must be empty');
  const archive=join(outDir,'payload.tar');
  try{
    run(age,['-d','-i',identity,'-o',archive,encrypted]);
    const names=run('tar',['-tf',archive]).trim().split(/\r?\n/).sort();
    if(names.join(',')!==[...payloads,'manifest.json'].sort().join(','))throw new Error('Unsafe archive entries');
    const entries=run('tar',['-tvf',archive]).trim().split(/\r?\n/);
    if(entries.length!==5||entries.some(line=>!line.startsWith('-')))throw new Error('Archive links or special files forbidden');
    run('tar',['-xf',archive,'-C',outDir]);
    const manifest=JSON.parse(await readFile(join(outDir,'manifest.json'),'utf8'));
    const created=Date.parse(manifest.createdAt);
    if(manifest.format!==1||manifest.projectRef!=='kjnnguekhshkhgycmryl'||manifest.scope!=='full-database-with-roles'||
      !Number.isFinite(created)||created>now+300000||now-created>maxAgeMs)throw new Error('Backup scope or freshness invalid');
    for(const name of payloads){
      const bytes=await readFile(join(outDir,name));
      if(bytes.length!==manifest.files?.[name]?.bytes||digest(bytes)!==manifest.files?.[name]?.sha256)
        throw new Error('Decrypted backup checksum mismatch');
    }
    return manifest;
  }catch(error){
    // Remove only fixed temporary files inside the previously empty output directory.
    for(const name of [...payloads,'manifest.json','payload.tar'])await rm(join(outDir,name),{force:true});
    throw error;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const cmd=process.argv[2];
  const action=cmd==='pack'?packBackup({sourceDir:process.env.BACKUP_SOURCE_DIR,outDir:process.env.BACKUP_OUT_DIR,
    recipient:process.env.BACKUP_AGE_RECIPIENT,projectRef:process.env.BACKUP_PROJECT_REF}):
    cmd==='unpack'?unpackBackup({encrypted:process.env.BACKUP_ENCRYPTED_FILE,identity:process.env.BACKUP_IDENTITY_FILE,
      outDir:process.env.BACKUP_RESTORE_DIR}):Promise.reject(new Error('Unknown backup command'));
  // JSON parser and filesystem errors can contain decrypted source excerpts.
  // Exported APIs retain errors for private callers; public CLI logs never do.
  action.then(()=>console.log('Encrypted backup validation passed')).catch(()=>{
    console.error('Encrypted backup validation failed; private diagnostics withheld');process.exitCode=1;
  });
}

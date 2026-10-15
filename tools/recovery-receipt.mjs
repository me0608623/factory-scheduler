import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const id=value=>/^\d+$/.test(value||'')&&Number.isSafeInteger(Number(value))&&Number(value)>0;
const env=process.env;
if(!id(env.ARTIFACT_ID)||!id(env.GITHUB_RUN_ID)||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw new Error('Invalid recovery receipt metadata');
const ciphertext=await readFile(env.BACKUP_ENCRYPTED_FILE);
const sql=await readFile(new URL('../db/migrations/0037_permission_whitelist_complete.sql',import.meta.url),'utf8');
await writeFile(env.RECOVERY_RECEIPT_FILE,JSON.stringify({format:1,projectRef:'kjnnguekhshkhgycmryl',
  backupArtifactId:Number(env.ARTIFACT_ID),restoreRunId:Number(env.GITHUB_RUN_ID),headSha:env.GITHUB_SHA,createdAt:new Date().toISOString(),
  fullDatabase:true,auth:true,roles:true,acl:true,noStub:true,storageObjects:0,guarded0037:true,
  migrationSha256:createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex'),
  ciphertextSha256:createHash('sha256').update(ciphertext).digest('hex')}),{flag:'wx',mode:0o600});
console.log('Privacy-safe recovery receipt prepared');

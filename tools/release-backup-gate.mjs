import {writeFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findBackup,downloadBackup} from './backup-artifact.mjs';
const ref='kjnnguekhshkhgycmryl',maxAge=24*3600*1000;
function sameId(a,b){return /^\d+$/.test(String(a))&&Number.isSafeInteger(Number(a))&&Number(a)>0&&String(a)===String(b);}
function fresh(date,now){const time=Date.parse(date);return Number.isFinite(time)&&time<=now+300000&&now-time<=maxAge;}
function completed(run){return run?.status==='completed'&&run.conclusion==='success';}
function backupWorkflow(run){return ['.github/workflows/nightly-backup.yml','.github/workflows/backup-drill.yml'].includes(run?.path?.split('@')[0]);}
export function verifyEvidence({artifact,backupRun,restoreRun,receipt,repo,now=Date.now()}){
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||''))throw new Error('Invalid repository');
  if(!sameId(artifact?.workflow_run?.id,backupRun?.id)||artifact?.name!==`db-backup-encrypted-${backupRun?.id}`||
    artifact.expired!==false||!fresh(artifact.created_at,now)||!Number.isFinite(Date.parse(artifact.expires_at))||Date.parse(artifact.expires_at)<=now)
    throw new Error('Encrypted backup missing, expired or stale');
  if(!completed(backupRun)||!backupWorkflow(backupRun)||!completed(restoreRun)||
    restoreRun.path?.split('@')[0]!=='.github/workflows/backup-drill.yml'||restoreRun.event!=='workflow_dispatch'||
    restoreRun.head_repository?.full_name!==repo||backupRun.head_repository?.full_name!==repo)
    throw new Error('Untrusted or failed backup/restore workflow');
  if(receipt?.format!==1||receipt.projectRef!==ref||!sameId(receipt.backupArtifactId,artifact.id)||
    !sameId(receipt.restoreRunId,restoreRun.id)||receipt.headSha!==restoreRun.head_sha||!/^[a-f0-9]{40}$/.test(restoreRun.head_sha||'')||
    !fresh(receipt.createdAt,now)||Date.parse(receipt.createdAt)<Date.parse(artifact.created_at)||
    receipt.fullDatabase!==true||receipt.auth!==true||receipt.roles!==true||receipt.acl!==true||receipt.noStub!==true||
    receipt.storageObjects!==0||!/^[a-f0-9]{64}$/.test(receipt.ciphertextSha256||''))
    throw new Error('Complete restore receipt does not match the backup');
  if(receipt.guarded0037!==true||receipt.migrationSha256!=='ab98a089c564ffd19a8d05dad96023b57811f45fcf911371167128c49e717b4f')
    throw new Error('Reviewed 0037 has not passed the guarded full-copy rehearsal');
  return true;
}
async function request(path,token){
  const response=await fetch(`https://api.github.com${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'}});
  if(!response.ok)throw new Error(`GitHub release evidence request failed (HTTP ${response.status})`);
  try{return await response.json();}catch{throw new Error('Invalid GitHub release evidence');}
}
function zipFile(zip,name,maxBuffer){
  const listing=spawnSync('unzip',['-Z1',zip],{encoding:'utf8',maxBuffer:4096});
  if(listing.status!==0||listing.stdout.trim()!==name)throw new Error('Unexpected release archive content');
  const result=spawnSync('unzip',['-p',zip,name],{maxBuffer});
  if(result.error||result.status!==0)throw new Error('Release archive extraction failed');
  return result.stdout;
}
async function main(){
  const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN,runId=process.env.RESTORE_RUN_ID;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!sameId(runId,runId)||!token||!process.env.BACKUP_ARTIFACT_ID)
    throw new Error('Missing or invalid release evidence IDs');
  const artifact=await findBackup({repo,token,artifactId:process.env.BACKUP_ARTIFACT_ID});
  const backupRun=await request(`/repos/${repo}/actions/runs/${artifact.workflow_run.id}`,token);
  const restoreRun=await request(`/repos/${repo}/actions/runs/${runId}`,token);
  const list=await request(`/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`,token);
  const candidates=list.artifacts?.filter(x=>x.name===`full-recovery-proof-${runId}`&&x.expired===false)||[];
  if(candidates.length!==1||list.total_count>100)throw new Error('Restore receipt artifact missing or ambiguous');
  const proofBytes=await downloadBackup({repo,token,artifact:candidates[0]});
  await writeFile('release-proof.zip',proofBytes,{flag:'wx',mode:0o600});
  const receipt=JSON.parse(zipFile('release-proof.zip','recovery-receipt.json',16384).toString());
  verifyEvidence({repo,artifact,backupRun,restoreRun,receipt});
  const testRuns=await request(`/repos/${repo}/actions/runs?head_sha=${process.env.GITHUB_SHA}&per_page=100`,token);
  const tests=testRuns.workflow_runs?.filter(r=>r.path?.split('@')[0]==='.github/workflows/tests.yml'&&r.head_sha===process.env.GITHUB_SHA)||[];
  if(!tests.length||tests.some(r=>!completed(r)))throw new Error('Current release SHA has not passed all required Tests workflows');
  const bytes=await downloadBackup({repo,token,artifact});
  await writeFile('release-backup.zip',bytes,{flag:'wx',mode:0o600});
  const ciphertext=zipFile('release-backup.zip','database.tar.age',32*1024*1024);
  if(createHash('sha256').update(ciphertext).digest('hex')!==receipt.ciphertextSha256)
    throw new Error('Restored ciphertext differs from the downloaded release backup');
  await appendFile(process.env.GITHUB_ENV,`VERIFIED_RESTORE_SHA=${restoreRun.head_sha}\n`);
  console.log('Fresh encrypted backup and matched complete restore evidence verified');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error(e.message);process.exitCode=1;});

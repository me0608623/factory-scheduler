// GitHub Actions backup discovery. Never connects to a database or logs credentials.
import {appendFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const API='https://api.github.com';
// Only actual producer names qualify. Drill/proof artifacts can share the
// prefix but are not a database recovery point; encrypted backups must remain
// eligible after the public repository switches its nightly producer.
const backupName=/^db-backup-(?:encrypted-)?[0-9]+$/;
const PER_PAGE=100;

function repositoryPath(repo){
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||''))throw new Error('Invalid repository');
  return `/repos/${repo}/actions/artifacts`;
}
function validId(id){
  return /^\d+$/.test(String(id))&&Number.isSafeInteger(Number(id))&&Number(id)>0;
}
function usable(artifact,now){
  return validId(artifact?.id)&&backupName.test(artifact?.name||'')&&artifact.expired===false&&
    Number.isFinite(Date.parse(artifact.created_at))&&
    (!artifact.expires_at||Date.parse(artifact.expires_at)>now);
}
async function requestJson(url,fetchImpl,token){
  const response=await fetchImpl(url,{headers:{Accept:'application/vnd.github+json',
    ...(token?{Authorization:`Bearer ${token}`}:{})}});
  if(!response.ok)throw new Error(`GitHub artifact API failed (HTTP ${response.status})`);
  try{return await response.json();}catch{throw new Error('GitHub artifact API returned invalid JSON');}
}
export async function findBackup({repo,artifactId='',token='',fetchImpl=fetch,now=Date.now(),maxPages=100}){
  const path=repositoryPath(repo);
  if(!Number.isInteger(maxPages)||maxPages<1)throw new Error('Invalid pagination limit');
  if(artifactId){
    if(!validId(artifactId))throw new Error('Invalid backup artifact ID');
    const item=await requestJson(`${API}${path}/${artifactId}`,fetchImpl,token);
    if(String(item?.id)!==String(artifactId)||!usable(item,now))
      throw new Error('Specified artifact is not an unexpired database backup');
    return item;
  }
  let newest;
  for(let page=1;page<=maxPages;page++){
    const data=await requestJson(`${API}${path}?per_page=${PER_PAGE}&page=${page}`,fetchImpl,token);
    if(!Array.isArray(data?.artifacts)||!Number.isInteger(data.total_count)||data.total_count<0)
      throw new Error('GitHub artifact API returned an invalid listing');
    for(const item of data.artifacts){
      if(usable(item,now)&&(!newest||Date.parse(item.created_at)>Date.parse(newest.created_at)||
        (item.created_at===newest.created_at&&Number(item.id)>Number(newest.id))))newest=item;
    }
    if(data.artifacts.length<PER_PAGE||page*PER_PAGE>=data.total_count){
      if(!newest)throw new Error('No unexpired database backup artifact found');
      return newest;
    }
  }
  throw new Error('Artifact pagination limit reached; specify a verified backup artifact ID');
}

export async function downloadBackup({repo,artifact,token='',fetchImpl=fetch}){
  const path=repositoryPath(repo);
  if(!validId(artifact?.id))throw new Error('Invalid backup artifact ID');
  // Fetch strips Authorization on cross-origin redirects to GitHub's blob storage.
  const response=await fetchImpl(`${API}${path}/${artifact.id}/zip`,{
    headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!response.ok)throw new Error(`Backup download failed (HTTP ${response.status})`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04)
    throw new Error('Backup download is not a ZIP archive');
  return bytes;
}

async function main(){
  const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN;
  if(!repo||!token||!process.env.GITHUB_ENV)throw new Error('Missing GitHub Actions environment');
  const artifact=await findBackup({repo,token,artifactId:process.env.BACKUP_ARTIFACT_ID||''});
  const bytes=await downloadBackup({repo,token,artifact});
  await writeFile('backup.zip',bytes,{flag:'wx'});
  await appendFile(process.env.GITHUB_ENV,`ARTIFACT_ID=${artifact.id}\n`);
  console.log(JSON.stringify({artifactId:artifact.id,name:artifact.name,createdAt:artifact.created_at,bytes:bytes.length}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error(error.message);process.exitCode=1;});

import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const site='https://factory-scheduler-web-staging.onrender.com';
const project='fkefarcwadvyqqjcjxvp';
const endpoint=`https://${project}.supabase.co/rest/v1/`;

// Read the deployed, public anonymous configuration, never a signed-in session
// or admin credential. All destinations are pinned to the existing test site.
export async function probePostgrestVersion({fetchImpl=globalThis.fetch}={}) {
  const read=async(url,headers={})=>{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      // Classify only exact public protocol labels, never echo an error body.
      const data=await response.json().catch(()=>null);
      const kind=data?.message==='Invalid API key'?'API_KEY_REJECTED':data?.message==='No API key found in request'?'API_KEY_MISSING':'UNCLASSIFIED';
      throw Object.assign(new Error('Metadata read failed'),{httpStatus:response.status,errorKind:kind,probeStage:url===endpoint?'metadata':url===site+'/'?'site':'bundle'});
    }
    return response;
  };
  const html=await (await read(site+'/')).text();
  const asset=html.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/u)?.[1];
  if(!asset)throw new Error('Deployed bundle unavailable');
  const source=await (await read(site+asset)).text();
  let keys=[...new Set(source.match(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu)||[])].filter(key=>{
    try{const claim=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));return claim.role==='anon'&&claim.ref===project;}
    catch{return false;}
  });
  if(keys.length===0){
    const projects=new Set([...source.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co\b/gu)].map(match=>match[1]));
    // A publishable key has no JWT ref. Only accept an unambiguous deployed
    // configuration with exactly this one project and exactly one public key.
    if(projects.size===1&&projects.has(project))keys=[...new Set(source.match(/(?<![A-Za-z0-9_-])sb_publishable_[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/gu)||[])];
  }
  // Never infer a pairing between multiple projects/keys or fall back to prod.
  if(keys.length!==1)throw new Error('Unique public test key unavailable');
  const response=await read(endpoint,{apikey:keys[0],...(keys[0].startsWith('eyJ')?{Authorization:'Bearer '+keys[0]}:{}),Accept:'application/openapi+json'});
  const metadata=await response.json();
  const version=typeof metadata?.info?.version==='string'?metadata.info.version.match(/^(\d+\.\d+(?:\.\d+)?)(?: \([A-Za-z0-9._-]{1,80}\))?$/u)?.[1]:null;
  if(metadata?.swagger!=='2.0'||!version)throw new Error('Version metadata unavailable');
  // A root-spec override can customize OpenAPI: report it as advertised evidence,
  // not proof of installed binaries, a running retry loop, or a platform fix.
  return {project,source:'anonymous-openapi',advertisedVersion:version,major:Number(version.split('.')[0]),retryLoopVerified:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await probePostgrestVersion()));}
  catch(error){console.error(JSON.stringify({status:'unverified',stage:['site','bundle','metadata'].includes(error.probeStage)?error.probeStage:'configuration',
    httpStatus:Number.isInteger(error.httpStatus)&&error.httpStatus>=100&&error.httpStatus<600?error.httpStatus:null,
    errorKind:['API_KEY_REJECTED','API_KEY_MISSING','UNCLASSIFIED'].includes(error.errorKind)?error.errorKind:null,diagnostics:'Credentials and private metadata withheld'}));process.exitCode=1;}
}

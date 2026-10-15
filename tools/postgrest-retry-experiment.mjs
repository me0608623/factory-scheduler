// Synthetic, disposable GitHub runner only. Never accepts a database URL or project key.
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve, relative, isAbsolute} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const exec = promisify(execFile);
const versions = ['14.18', '16.4'];
const database = {PGHOST:'127.0.0.1', PGPORT:'55439', PGDATABASE:'retry_probe', PGUSER:'probe_admin', PGPASSWORD:'synthetic_ci_only', PGCONNECT_TIMEOUT:'3'};
const env = () => ({PATH:process.env.PATH, HOME:process.env.RUNNER_TEMP, LANG:'C.UTF-8', ...database});

export function localRpcUrl(port, code) {
  if (![55440,55441].includes(port) || !['40001','PT409'].includes(code)) throw new Error('Invalid synthetic endpoint');
  return `http://127.0.0.1:${port}/rpc/probe_${code.toLowerCase()}`;
}
export function attemptCount(value) {
  if (!/^\d+$/.test(value.trim())) throw new Error('Invalid synthetic count');
  const count = Number(value.trim());
  if (!Number.isSafeInteger(count) || count < 1 || count > 50) throw new Error('Synthetic attempt bound exceeded');
  return count;
}
export function checkResult({version, code, status, timedOut, attempts}) {
  attemptCount(String(attempts));
  if (!versions.includes(version) || !['40001','PT409'].includes(code)) throw new Error('Invalid case');
  if (code === 'PT409') return status === 409 && !timedOut && attempts === 1;
  if (version === '16.4') return status === 500 && !timedOut && attempts === 1;
  return attempts > 1 && (timedOut || status === 503);
}
async function sql(source) {
  try { return (await exec('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-c',source],{env:env(),timeout:8000,maxBuffer:16384})).stdout.trim(); }
  catch { throw new Error('Synthetic SQL command failed'); }
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((done, reject) => {
    const killTimer=setTimeout(()=>child.kill('SIGKILL'),1000);
    const deadline=setTimeout(()=>{clearTimeout(killTimer);reject(new Error('Owned process did not stop'));},3000);
    child.once('close',()=>{clearTimeout(killTimer);clearTimeout(deadline);done();});
    child.kill('SIGTERM');
  });
}
export async function runExperiment(paths) {
  if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP) throw new Error('Disposable Linux GitHub runner required');
  if (paths.length !== 2) throw new Error('Two pinned binaries required');
  const root=await realpath(resolve(process.env.RUNNER_TEMP,'postgrest-retry-probe'));
  const binaries=await Promise.all(paths.map(async path=>{
    const binary=await realpath(resolve(path)), rel=relative(root,binary);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Binary outside owned experiment directory');
    return binary;
  }));
  await sql(`CREATE ROLE probe_anon NOLOGIN;
    CREATE SCHEMA api;
    CREATE SEQUENCE api.attempt_40001;
    CREATE SEQUENCE api.attempt_pt409;
    CREATE FUNCTION api.ping() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION api.probe_40001() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      IF nextval('api.attempt_40001') >= 50 THEN RAISE SQLSTATE 'PT503' USING MESSAGE='synthetic attempt limit'; END IF;
      PERFORM pg_sleep(0.025);
      RAISE SQLSTATE '40001' USING MESSAGE='synthetic stale revision';
    END $$;
    CREATE FUNCTION api.probe_pt409() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN PERFORM nextval('api.attempt_pt409'); RAISE SQLSTATE 'PT409' USING MESSAGE='synthetic stale revision'; END $$;
    GRANT USAGE ON SCHEMA api TO probe_anon;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA api TO probe_anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO probe_anon;`);
  const results=[];
  for (let i=0;i<versions.length;i++) {
    const version=versions[i], port=55440+i;
    const output=(await exec(binaries[i],['--version'],{env:env(),timeout:5000})).stdout.trim();
    if (!output.startsWith(`PostgREST ${version} `) && output !== `PostgREST ${version}`) throw new Error('Pinned binary version mismatch');
    for (const code of ['PT409','40001']) {
      await sql(`ALTER SEQUENCE api.attempt_${code.toLowerCase()} RESTART WITH 1;`);
      const child=spawn(binaries[i],[],{stdio:'ignore',env:{...env(),GHCRTS:'-N2',
        PGRST_DB_URI:'postgres://probe_admin:synthetic_ci_only@127.0.0.1:55439/retry_probe',
        PGRST_DB_SCHEMAS:'api',PGRST_DB_ANON_ROLE:'probe_anon',PGRST_DB_POOL:'1',
        PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(port),PGRST_LOG_LEVEL:'crit'}});
      let spawnError=false;child.on('error',()=>{spawnError=true;});
      let status=null,timedOut=false;
      try {
        let ready=false;
        for(let tries=0;tries<40;tries++) {
          if(spawnError || child.exitCode !== null) throw new Error('Synthetic server exited');
          try {const response=await fetch(`http://127.0.0.1:${port}/rpc/ping`,{redirect:'error',signal:AbortSignal.timeout(500)});
            if(response.ok && await response.json() === true){ready=true;break;}}
          catch { /* bounded readiness retry, never a domain RPC */ }
          await new Promise(done=>setTimeout(done,100));
        }
        if(!ready) throw new Error('Synthetic server readiness timeout');
        const signal=AbortSignal.timeout(1500);
        try {
          const response=await fetch(localRpcUrl(port,code),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'error',signal});
          status=response.status;
          const body=await response.json();
          if(body.code !== code && !(code === '40001' && body.code === 'PT503')) throw new Error('Unexpected synthetic response code');
        } catch(error) { if(signal.aborted) timedOut=true;else throw error; }
      } finally { await stop(child); }
      const attempts=attemptCount(await sql(`SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM api.attempt_${code.toLowerCase()};`));
      const result={version,code,status,timedOut,attempts};
      result.pass=checkResult(result);results.push(result);console.log(JSON.stringify(result));
    }
  }
  if(results.some(result=>!result.pass)) throw new Error('Synthetic version comparison failed');
  return results;
}
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runExperiment(process.argv.slice(2)).catch(()=>{console.error('Synthetic experiment failed; no cloud database contacted');process.exitCode=1;});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {findBackup,downloadBackup} from './backup-artifact.mjs';
const repo='me0608623/factory-scheduler',now=Date.parse('2026-10-13T00:00:00Z');
const backup=(id,created='2026-10-12T00:00:00Z',extra={})=>({id,name:`db-backup-${id}`,expired:false,
  created_at:created,expires_at:'2026-10-20T00:00:00Z',...extra});
const response=data=>({ok:true,json:async()=>data});

test('finds backups beyond the first page despite 100 newer test artifacts',async()=>{
  const calls=[];
  const result=await findBackup({repo,now,fetchImpl:async url=>{
    calls.push(url);
    return response(url.endsWith('page=1')?
      {total_count:102,artifacts:Array.from({length:100},(_,i)=>backup(i+1000,undefined,{name:'isolated-cloud-test-seed'}))}:
      {total_count:102,artifacts:[backup(8),backup(9,'2026-10-12T23:00:00Z')]});
  }});
  assert.equal(result.id,9);assert.equal(calls.length,2);assert.match(calls[1],/page=2$/);
});
test('ignores expired and malformed candidates and chooses newest creation time',async()=>{
  const result=await findBackup({repo,now,fetchImpl:async()=>response({total_count:6,artifacts:[
    backup(20,'2026-10-12T23:00:00Z',{expired:true}),backup(21,undefined,{expires_at:'2026-10-12T00:00:00Z'}),
    backup(22,'invalid'),backup(3),backup(2,'2026-10-12T22:00:00Z'),backup(1,'2026-10-12T21:00:00Z')]})});
  assert.equal(result.id,2);
});

test('encrypted database backup is eligible but similarly named drill artifacts are not',async()=>{
  const result=await findBackup({repo,now,fetchImpl:async()=>response({total_count:4,artifacts:[
    backup(50,'2026-10-12T23:30:00Z',{name:'db-backup-encrypted-drill-50'}),
    backup(49,'2026-10-12T23:00:00Z',{name:'db-backup-encrypted-49'}),
    backup(48,'2026-10-12T22:00:00Z',{name:'db-backup-48'}),
    backup(47,'2026-10-12T23:40:00Z',{name:'db-backup-encrypted-47-extra'})]})});
  assert.equal(result.id,49,'select the real encrypted backup, not a newer test payload');
});

test('explicit ID for a drill artifact is refused instead of attempting decryption',async()=>{
  await assert.rejects(findBackup({repo,now,artifactId:'50',fetchImpl:async()=>response(
    backup(50,undefined,{name:'db-backup-encrypted-drill-50'}))}),/not an unexpired/);
});
test('explicit ID is validated and uses metadata instead of listing',async()=>{
  let calls=0;
  assert.equal((await findBackup({repo,now,artifactId:'42',fetchImpl:async url=>{
    calls++;assert.equal(url,'https://api.github.com/repos/'+repo+'/actions/artifacts/42');return response(backup(42));
  }})).id,42);assert.equal(calls,1);
  for(const item of [backup(41),backup(42,undefined,{expired:true}),backup(42,undefined,{name:'acceptance-report'})])
    await assert.rejects(findBackup({repo,now,artifactId:'42',fetchImpl:async()=>response(item)}),/not an unexpired/);
});
test('invalid ID/repository is rejected before requests and cannot inject URLs',async()=>{
  const fetchImpl=async()=>{assert.fail('must not request');};
  for(const artifactId of ['0','-1','42/zip','42\nBAD=1','9999999999999999999'])
    await assert.rejects(findBackup({repo,artifactId,fetchImpl}),/Invalid backup artifact ID/);
  await assert.rejects(findBackup({repo:'owner/repo/../../elsewhere',fetchImpl}),/Invalid repository/);
});
test('HTTP/API errors are explicit without disclosing tokens or response bodies',async()=>{
  await assert.rejects(findBackup({repo,token:'secret',fetchImpl:async()=>({ok:false,status:403})}),
    error=>error.message==='GitHub artifact API failed (HTTP 403)');
  await assert.rejects(findBackup({repo,fetchImpl:async()=>response({message:'bad'})}),/invalid listing/);
  await assert.rejects(findBackup({repo,fetchImpl:async()=>response({artifacts:[],total_count:0})}),/No unexpired/);
});
test('bounded pagination fails rather than returning an incomplete result',async()=>{
  await assert.rejects(findBackup({repo,now,maxPages:1,fetchImpl:async()=>response({total_count:101,
    artifacts:Array.from({length:100},(_,i)=>backup(i+1))})}),/pagination limit/);
});
test('download checks HTTP failure and actual ZIP bytes',async()=>{
  const artifact=backup(42),zip=new Uint8Array([0x50,0x4b,0x03,0x04,1,2]);
  assert.deepEqual(await downloadBackup({repo,artifact,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>zip.buffer})}),zip);
  await assert.rejects(downloadBackup({repo,artifact,fetchImpl:async()=>({ok:false,status:410})}),/HTTP 410/);
  const json=Buffer.from('{"error":"expired"}');
  await assert.rejects(downloadBackup({repo,artifact,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>json})}),/not a ZIP/);
});

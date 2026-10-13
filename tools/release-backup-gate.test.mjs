import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEvidence} from './release-backup-gate.mjs';
const now=Date.parse('2026-10-13T06:00:00Z'),repo='me0608623/factory-scheduler';
function fixture(){
  const headSha='a'.repeat(40);
  return {repo,now,
    artifact:{id:3,name:'db-backup-encrypted-1',expired:false,created_at:'2026-10-13T05:00:00Z',expires_at:'2026-11-13T05:00:00Z',workflow_run:{id:1}},
    backupRun:{id:1,status:'completed',conclusion:'success',path:'.github/workflows/backup-drill.yml',head_repository:{full_name:repo}},
    restoreRun:{id:2,status:'completed',conclusion:'success',path:'.github/workflows/backup-drill.yml',event:'workflow_dispatch',head_repository:{full_name:repo},head_sha:headSha},
    receipt:{format:1,projectRef:'kjnnguekhshkhgycmryl',backupArtifactId:3,restoreRunId:2,headSha,createdAt:'2026-10-13T05:30:00Z',fullDatabase:true,auth:true,roles:true,acl:true,noStub:true,storageObjects:0,ciphertextSha256:'b'.repeat(64),guarded0037:true,migrationSha256:'ab98a089c564ffd19a8d05dad96023b57811f45fcf911371167128c49e717b4f'}};
}
test('valid fresh encrypted backup and matched complete restore pass',()=>assert.equal(verifyEvidence(fixture()),true));
test('expired/stale/future/malformed dates and legacy plaintext backups are refused',()=>{
  for(const changes of [{expired:true},{created_at:'2026-10-11T05:00:00Z'},{created_at:'2026-10-14T05:00:00Z'},
    {expires_at:'bad'},{expires_at:'2026-10-13T05:00:00Z'},{name:'db-backup-1'}]){
    const f=fixture();Object.assign(f.artifact,changes);assert.throws(()=>verifyEvidence(f));
  }
});
test('failed/foreign/skipped restore or wrong workflow cannot authorize migration',()=>{
  for(const changes of [{conclusion:'failure'},{status:'queued'},{path:'.github/workflows/tests.yml'},
    {head_repository:{full_name:'attacker/repository'}},{head_sha:'bad\nKEY=x'}]){
    const f=fixture();Object.assign(f.restoreRun,changes);assert.throws(()=>verifyEvidence(f));
  }
});
test('receipt must attest same backup, SHA, project and full recovery without stub',()=>{
  for(const changes of [{backupArtifactId:9},{restoreRunId:9},{headSha:'c'.repeat(40)},
    {projectRef:'fkefarcwadvyqqjcjxvp'},{noStub:false},{auth:false},{acl:false},{roles:false},{fullDatabase:false},
    {storageObjects:1},{ciphertextSha256:'not-a-hash'},{createdAt:'2026-10-13T04:00:00Z'},
    {guarded0037:false},{migrationSha256:'x'}]){
    const f=fixture();Object.assign(f.receipt,changes);assert.throws(()=>verifyEvidence(f));
  }
});

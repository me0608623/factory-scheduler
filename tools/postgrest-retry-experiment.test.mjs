import test from 'node:test';
import assert from 'node:assert/strict';
import {localRpcUrl,attemptCount,checkResult,runExperiment} from './postgrest-retry-experiment.mjs';
test('synthetic endpoint is fixed loopback with only two owned ports and two RPCs',()=>{
  assert.equal(localRpcUrl(55440,'40001'),'http://127.0.0.1:55440/rpc/probe_40001');
  for(const args of [[443,'40001'],['https://example.com','40001'],[55440,'ping'],[55441,'PT503']])assert.throws(()=>localRpcUrl(...args));
});
test('rollback-independent attempt evidence is numeric and bounded, never server output',()=>{
  assert.equal(attemptCount(' 50\n'),50);
  for(const value of ['0','51','NaN','1\nPRIVATE_IDENTITY','1.5','-1','9007199254740992'])assert.throws(()=>attemptCount(value));
});
test('version comparison requires actual attempts, status and timeout, not a badge or HTTP200',()=>{
  const base={version:'14.18',code:'40001',status:null,timedOut:true,attempts:4};
  assert.equal(checkResult(base),true);
  assert.equal(checkResult({...base,attempts:1}),false);
  assert.equal(checkResult({...base,status:200,timedOut:false}),false);
  assert.equal(checkResult({...base,version:'16.4',status:500,timedOut:false,attempts:1}),true);
  assert.equal(checkResult({...base,version:'16.4'}),false);
  assert.equal(checkResult({...base,code:'PT409',status:409,timedOut:false,attempts:1}),true);
  assert.equal(checkResult({...base,code:'PT409',status:409,timedOut:false}),false);
});
test('normal local invocation fails closed before SQL or child process startup',async()=>{
  if(process.env.GITHUB_ACTIONS === 'true')await assert.rejects(runExperiment([]),/Two pinned binaries/);
  else await assert.rejects(runExperiment([]),/Disposable Linux GitHub runner required/);
});

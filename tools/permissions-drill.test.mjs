import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const bash=process.env.BASH_BIN||(process.platform==='win32'?
  'C:/Users/me060/AppData/Local/hermes/git/bin/bash.exe':'bash');
const library=resolve('tools/permissions-drill.sh').replaceAll('\\','/');
const workflow=readFileSync('.github/workflows/permissions-drill.yml','utf8').replaceAll('\r','');
function dHelpers(){
  const stage=workflow.slice(workflow.indexOf('      - name: D.'),workflow.indexOf('      - name: E.'));
  return stage.slice(stage.indexOf('          PASS=0; FAIL=0'),stage.indexOf('          ORD='))
    .split('\n').map(line=>line.slice(10)).join('\n');
}
async function run(mode,body,{accounts=false}={}){
  const dir=await mkdtemp(join(tmpdir(),'permission-drill-fixture-'));
  try{
    if(accounts)await writeFile(join(dir,'accounts.sh'),"BOSS=55555555-5555-4555-8555-555555555555\nLEAD=66666666-6666-4666-8666-666666666666\nVIEWER=77777777-7777-4777-8777-777777777777\n",{mode:0o600});
    const stageC=workflow.slice(workflow.indexOf('      - name: C.'),workflow.indexOf('      - name: D.'));
    const oldC=stageC.slice(stageC.indexOf('          PASS=0; FAIL=0'),stageC.indexOf('          expect "lead'))
      .split('\n').map(line=>line.slice(10)).join('\n');
    const init=existsSync(library)?`source '${library}'\n`:oldC;
    return spawnSync(bash,['-c',`set -e -o pipefail\n${init}
      docker(){
        case "$MOCK_MODE" in
          fail) echo 'ERROR: PRIVATE-email@example.test wrong query' >&2; return 1;;
          denied) echo 'ERROR: expected denial PRIVATE-email@example.test' >&2; return 1;;
          offline) echo 'PRIVATE-CONNECTION-FAILED' >&2; return 1;;
          zero) return 0;;
          one) echo 'PRIVATE-ROW-UUID'; return 0;;
        esac
      }
      ${dHelpers()}
      ${body}`],{encoding:'utf8',windowsHide:true,
        env:{...process.env,DRILL_PRIVATE:dir.replaceAll('\\','/'),MOCK_MODE:mode}});
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('actual workflow row helper cannot turn a failed SQL command into zero-row success',async()=>{
  const result=await run('fail',"rows fixture-user 'SELECT synthetic;'");
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'QUERY_FAILED');
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE-|example\.test/);
});
test('actual workflow row helper distinguishes genuine successful zero and one-row results',async()=>{
  for(const [mode,count] of [['zero','0'],['one','1']]){
    const result=await run(mode,"rows fixture-user 'SELECT synthetic;'");
    assert.equal(result.status,0);assert.equal(result.stdout.trim(),count);
    assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE-/);
  }
});
test('failure assertions do not print private actual or expected values',async()=>{
  const result=await run('zero',"expect 'synthetic case' 'expected' 'PRIVATE-email@example.test'; echo \"FAIL_COUNT=$FAIL\"");
  assert.equal(result.status,0);assert.match(result.stdout,/FAIL_COUNT=1/);
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE-|example\.test/);
});
test('rejection helper separates matched denial, unexpected SQL failure and success without data leakage',async()=>{
  for(const [mode,status] of [['denied','MATCHED'],['fail','WRONG_ERROR'],['one','NO_ERROR'],['offline','QUERY_FAILED']]){
    const result=await run(mode,"err_as fixture-user 'SELECT synthetic;' 'expected denial'");
    assert.equal(result.status,0);assert.equal(result.stdout.trim(),status);
    assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE-|example\.test/);
  }
});

test('zero-row expectations fail for SQL and transport failure; successful zero rows still pass',async()=>{
  for(const [mode,fail] of [['zero',0],['fail',1],['offline',1]]){
    const result=await run(mode,"expect 'RLS synthetic zero' 0 \"$(rows fixture-user 'SELECT synthetic;')\"; echo \"FAIL_COUNT=$FAIL\"");
    assert.equal(result.status,0);assert.match(result.stdout,new RegExp('FAIL_COUNT='+fail));
    assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE-|example\.test/);
  }
});
test('required setup and version reads fail closed instead of silently continuing',async()=>{
  for(const call of ["drill_required 'SELECT synthetic;'",'ver']){
    const result=await run('offline',call+'; echo SHOULD_NOT_REACH');
    assert.equal(result.status,1);assert.doesNotMatch(result.stdout+result.stderr,/SHOULD_NOT_REACH|PRIVATE-/);
  }
});
test('private account fixtures are available to the shell but never exported to Actions child environments',async()=>{
  const result=await run('zero',"test \"$BOSS\" = 55555555-5555-4555-8555-555555555555; if env | grep -qE '^(BOSS|LEAD|VIEWER)='; then echo LEAK; else echo LOCAL_ONLY; fi",{accounts:true});
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'LOCAL_ONLY');
});

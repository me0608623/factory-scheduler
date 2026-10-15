// R71（20min 系列首輪）：staging solver 免費版冷啟動實測 >60s（curl 三連：000/60s→200/4.4s→200/0.33s），
// 舊版 health 檢查單次 45s 必失敗且該 session 不再重試。新行為：有界重試（預設測試模式 2 次、間隔 3s）、
// epoch 守門（較新 check 蓋掉舊輪）、正式/本機預設仍單次。
import test from 'node:test';
import assert from 'node:assert/strict';
import {SOLVER} from '../src/solver.js';

const okJson={ok:true,ortools:'9.15.6755',capabilities:['work_assignments_v1','schedule_chat_readonly_v1']};
const okResp=()=>Promise.resolve({ok:true,json:async()=>structuredClone(okJson)});
const failResp=()=>Promise.reject(new Error('cold start'));

function mockFetch(seq){let i=0;const calls=[];globalThis.fetch=()=>{calls.push(i);const f=seq[Math.min(i,seq.length-1)];i++;return typeof f==='function'?f():f;};return calls;}
function countCalls(){const c=globalThis.__n;globalThis.__n=(globalThis.__n||0);return globalThis.__n;}

test('cold start recovers within bounded retries (2 failures then success)',async()=>{
  let n=0;globalThis.fetch=()=>{n++;return n<3?failResp():okResp();};
  SOLVER.up=null;SOLVER.capabilities=[];SOLVER.version='';
  const t0=Date.now();
  const up=await SOLVER.check({timeoutMs:50,retries:2});
  const dt=Date.now()-t0;
  assert.equal(up,true,'third attempt succeeds');
  assert.equal(n,3,'exactly three fetch attempts');
  assert.equal(SOLVER.up,true);
  assert.equal(SOLVER.version,'9.15.6755');
  assert.deepEqual(SOLVER.capabilities,okJson.capabilities);
  assert.ok(dt>=2*3000-50,'gap between retries honored (~6s): '+dt+'ms');
});

test('retries exhausted reports down after exactly retries+1 attempts',async()=>{
  let n=0;globalThis.fetch=()=>{n++;return failResp();};
  SOLVER.up=true;SOLVER.capabilities=['stale'];SOLVER.version='stale';
  const up=await SOLVER.check({timeoutMs:50,retries:2});
  assert.equal(up,false);
  assert.equal(n,3,'bounded: 1+2 attempts only');
  assert.equal(SOLVER.up,false);
  assert.deepEqual(SOLVER.capabilities,[]);
  assert.equal(SOLVER.version,'');
});

test('non-test default stays single attempt (local/production behavior)',async()=>{
  // node import 下 RUNTIME.mode==='local'（無 env/location）→ 預設 retries=0
  let n=0;globalThis.fetch=()=>{n++;return failResp();};
  const up=await SOLVER.check({timeoutMs:50});
  assert.equal(up,false);
  assert.equal(n,1,'single attempt without explicit retries');
});

test('a newer check supersedes an older in-flight one (epoch guard)',async()=>{
  let releaseOld;let call=0;
  globalThis.fetch=()=>{
    call++;
    // 第 1 次呼叫＝舊輪：掛住直到放行；之後的呼叫＝新輪：立即成功
    if(call>1)return Promise.resolve({ok:true,json:async()=>({ok:true,ortools:'NEW',capabilities:['new_cap']})});
    return new Promise(res=>{releaseOld=()=>res({ok:true,json:async()=>({ok:true,ortools:'OLD',capabilities:['old_cap']})});});
  };
  SOLVER.up=null;SOLVER.capabilities=[];
  const p1=SOLVER.check({timeoutMs:5000,retries:0});
  await new Promise(r=>setTimeout(r,30));           // 讓舊輪進入 fetch
  const p2=SOLVER.check({timeoutMs:5000,retries:0});
  const up2=await p2;
  assert.equal(up2,true,'newer check succeeds');
  releaseOld&&await releaseOld();
  const up1=await p1;
  assert.equal(up1,false,'superseded older check returns false');
  assert.equal(SOLVER.version,'NEW','older result did not overwrite newer');
  assert.deepEqual(SOLVER.capabilities,['new_cap']);
});

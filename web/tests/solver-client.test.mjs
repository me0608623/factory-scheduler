// solver.js 客戶端行為：錯誤映射、能力閘門、端點選擇（fetch 以 stub 隔離，不打真服務）
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLVER } from '../src/solver.js';

const realFetch = globalThis.fetch;
let calls = [];
let responder = null; // () => Response | Promise<Response>，或拋錯
const stub = (...a) => { calls.push(a); return Promise.resolve(typeof responder === 'function' ? responder(...a) : responder); };

test.beforeEach(() => { calls = []; globalThis.fetch = stub; SOLVER.up = null; });
test.after(() => { globalThis.fetch = realFetch; SOLVER.up = null; });

test('網路失敗：統一成「排程服務沒有回應」並把 up 標為 false（畫面據此改用瀏覽器演算法）', async () => {
  responder = () => Promise.reject(new Error('ECONNREFUSED'));
  await assert.rejects(SOLVER.plans({ employees: [] }, {}, 480), /排程服務沒有回應/);
  assert.equal(SOLVER.up, false, '網路失敗必須把 up 設 false');
});

test('HTTP 錯誤：保留 status、優先用伺服器 detail 訊息', async () => {
  responder = () => new Response(JSON.stringify({ detail: '快照版本太舊' }), { status: 409 });
  const err = await SOLVER.plans({ employees: [] }, {}, 480).then(() => null, e => e);
  assert.ok(err, '應拋錯');
  assert.equal(err.status, 409, 'status 必須保留給呼叫端判斷（409 衝突處理）');
  assert.match(err.message, /快照版本太舊/);
});

test('HTTP 錯誤無 detail：顯示「排程服務錯誤 + 狀態碼」', async () => {
  responder = () => new Response('gateaway crash', { status: 502 });
  const err = await SOLVER.plans({ employees: [] }, {}, 480).then(() => null, e => e);
  assert.equal(err.status, 502);
  assert.match(err.message, /排程服務錯誤 502/);
});

test('plans 能力閘門：快照帶一般工作但服務不支援時，不打服務直接 409（訊息引導更新）', async () => {
  SOLVER.capabilities = ['other_v1'];
  const err = await SOLVER.plans({ employees: [], work_assignments: [{ id: 'w' }] }, {}, 480).then(() => null, e => e);
  assert.ok(err, '應在客戶端就擋下');
  assert.equal(err.status, 409);
  assert.match(err.message, /尚未支援一般工作占用/);
  assert.equal(calls.length, 0, '不得送出請求（閘門在 fetch 之前）');
  // 服務支援時放行
  SOLVER.capabilities = ['work_assignments_v1'];
  responder = () => new Response(JSON.stringify({ ok: true }));
  const r = await SOLVER.plans({ employees: [], work_assignments: [{ id: 'w' }] }, {}, 480);
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, 1);
});

test('chat/roster 端點選擇：有 jwt 走 /db 端點並帶 Authorization；沒有走匿名端點', async () => {
  responder = () => new Response(JSON.stringify({ engine: 'x', answer: 'y', citations: [] }));
  await SOLVER.chat({ question: '誰請假？' }, 'tok123');
  await SOLVER.chat({ question: '誰請假？' }, null);
  assert.equal(calls[0][0].endsWith('/chat/db'), true, 'jwt 版應呼叫 /chat/db');
  assert.match(calls[0][1].headers.Authorization, /^Bearer /);
  assert.equal(calls[1][0].endsWith('/chat'), true, '匿名版應呼叫 /chat');
  assert.ok(!calls[1][1].headers.Authorization, '匿名呼叫不帶 Authorization');
});

test('check()：health ok → up/version/capabilities 帶回；失敗 → up=false 且能力清空', async () => {
  responder = () => new Response(JSON.stringify({ ok: true, ortools: '9.8', capabilities: ['work_assignments_v1'] }));
  assert.equal(await SOLVER.check(), true);
  assert.equal(SOLVER.up, true);
  assert.equal(SOLVER.version, '9.8');
  assert.deepEqual(SOLVER.capabilities, ['work_assignments_v1']);
  responder = () => Promise.reject(new Error('down'));
  assert.equal(await SOLVER.check(), false);
  assert.equal(SOLVER.up, false);
  assert.deepEqual(SOLVER.capabilities, [], '失敗時能力清空，避免殘留舊能力誤判');
});

test('check()：health 回 ok:false（服務活著但自評不健康）→ up=false', async () => {
  responder = () => new Response(JSON.stringify({ ok: false }));
  assert.equal(await SOLVER.check(), false);
  assert.equal(SOLVER.up, false);
});

test('check accepts bounded user-initiated timeout and an external abort signal',async()=>{
  const ctl=new AbortController();
  responder=(_,opt)=>new Promise((resolve,reject)=>opt.signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));
  const p=SOLVER.check({timeoutMs:45000,signal:ctl.signal});ctl.abort();
  assert.equal(await Promise.race([p,new Promise(resolve=>setTimeout(()=>resolve('still pending'),80))]),false);assert.equal(calls[0][1].signal.aborted,true);
});
test('health timeout covers response body, not only arrival of response headers',async()=>{
  responder=(_,opt)=>({ok:true,json:()=>new Promise((resolve,reject)=>opt.signal.addEventListener('abort',()=>reject(new Error('body timeout')),{once:true}))});
  const p=SOLVER.check({timeoutMs:15});
  assert.equal(await Promise.race([p,new Promise(resolve=>setTimeout(()=>resolve('still pending'),80))]),false);
});
test('an older health failure cannot overwrite a newer successful health check',async()=>{
  let failOld;responder=()=>new Promise((resolve,reject)=>{failOld=reject;});const old=SOLVER.check();
  responder=()=>new Response(JSON.stringify({ok:true,ortools:'new',capabilities:['work_assignments_v1']}));
  assert.equal(await SOLVER.check(),true);failOld(new Error('old timeout'));await old;
  assert.equal(SOLVER.up,true);assert.equal(SOLVER.version,'new');assert.deepEqual(SOLVER.capabilities,['work_assignments_v1']);
});
test('HTTP failure is not healthy even if a body contains ok:true',async()=>{
  responder=()=>new Response(JSON.stringify({ok:true}),{status:503});assert.equal(await SOLVER.check(),false);
});
test('health timeout overrides are bounded and already-aborted checks send no request',async()=>{
  const realSetTimeout=globalThis.setTimeout,deadlines=[];
  globalThis.setTimeout=(fn,ms,...args)=>{deadlines.push(ms);return realSetTimeout(fn,ms,...args);};
  try{
    responder=()=>new Response(JSON.stringify({ok:true}));
    await SOLVER.check({timeoutMs:Infinity});await SOLVER.check({timeoutMs:999999});
    assert.deepEqual(deadlines,[3000,45000]);
    const ctl=new AbortController();ctl.abort();const before=calls.length;
    assert.equal(await SOLVER.check({signal:ctl.signal}),false);assert.equal(calls.length,before);
  }finally{globalThis.setTimeout=realSetTimeout;}
});

// 呼叫排程服務（OR-Tools）。連不上時由畫面改用瀏覽器內的演算法。

import { RUNTIME } from './runtime-config.js';
const BASE = RUNTIME.solverUrl.replace(/\/$/, "");
const KEY = RUNTIME.solverKey;

export const SOLVER = {
  url: BASE,
  up: null,          // null = 還沒檢查；true / false
  version: "",
  capabilities: [],
  healthEpoch: 0,

  async chat(request,jwt) {
    return post(jwt?'/chat/db':'/chat',request,jwt?{Authorization:'Bearer '+jwt}:{});
  },

  async roster(request,jwt) {
    return post(jwt?'/roster/plans/db':'/roster/plans',request,jwt?{Authorization:'Bearer '+jwt}:{});
  },

  async check({timeoutMs=RUNTIME.mode==='test'?45000:3000,signal,retries}={}) {
    const epoch=++this.healthEpoch;
    timeoutMs=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,45000):3000;
    // staging solver 免費版冷啟動實測 >60s（2026-10-15）：單次 45s 必失敗。測試模式做有界重試
    // （預設 2 次、間隔 3 秒，涵蓋 ~140s 喚醒窗）；正式/本機維持單次。 epoch 守門：較新的 check 一律蓋掉舊輪結果。
    const maxAttempts=1+(Number.isInteger(retries)&&retries>=0?retries:(RUNTIME.mode==='test'?2:0));
    if(RUNTIME.error){this.up=false;return false;}
    for(let attempt=0;;attempt++){
      try {
        const j = await fetchWithTimeout(BASE + "/health", {signal}, timeoutMs, r=>{
          if(!r.ok)throw new Error('Health check failed');
          return r.json();
        });
        if(epoch!==this.healthEpoch||signal?.aborted)return false;
        this.up = j?.ok===true;
        this.version = typeof j?.ortools==='string'?j.ortools:"";
        this.capabilities = Array.isArray(j?.capabilities)?j.capabilities:[];
        return this.up;
      } catch {
        if(epoch!==this.healthEpoch||signal?.aborted)return false;
        if(attempt+1>=maxAttempts){
          this.up = false;
          this.capabilities = [];
          this.version = "";
          return false;
        }
        await new Promise(r=>setTimeout(r,3000));
        if(epoch!==this.healthEpoch||signal?.aborted)return false;
      }
    }
  },

  // 本機模式：把整份快照送過去算；hints = 「再給條件重排」的限制（沒有就不傳）
  async plans(snapshot, event, now, timeLimit = 3, hints = null) {
    if(snapshot.work_assignments?.length&&!this.capabilities.includes('work_assignments_v1')){
      const err=new Error('排程服務尚未支援一般工作占用，請先更新服務');err.status=409;throw err;
    }
    return post("/plans", { snapshot, event, now, time_limit: timeLimit, ...(hints?{hints}:{}) });
  },

  // 資料庫模式：伺服器自己讀資料庫，算完存成預覽（回傳 preview_id）
  async plansDb(event, now, jwt, timeLimit = 3, hints = null) {
    return post("/plans/db", { event, now, time_limit: timeLimit, ...(hints?{hints}:{}) }, { Authorization: "Bearer " + jwt });
  },
};

async function post(path, body, headers = {}) {
  if(RUNTIME.error)throw RUNTIME.error;
  const h = { "Content-Type": "application/json", ...headers };
  if (KEY) h["X-API-Key"] = KEY;
  try {
    // 測試模式放寬到 120s：staging 免費版冷啟動（~30-50s）＋求解時間，60s 會在第一次呼叫就失敗
    return await fetchWithTimeout(BASE + path, { method: "POST", headers: h, body: JSON.stringify(body) }, RUNTIME.mode==='test'?120000:60000, async r => {
      if (!r.ok) {
        let msg = "排程服務錯誤 " + r.status;
        try { const j = await r.json(); if (j.detail) msg = typeof j.detail === "string" ? j.detail : msg; } catch {}
        const err = new Error(msg);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  } catch (e) {
    if (e.status) throw e;
    SOLVER.up = false;
    throw new Error("排程服務沒有回應");
  }
}

function fetchWithTimeout(url, opt, ms, consume) {
  const ctl = new AbortController();
  const abort=()=>ctl.abort(),external=opt.signal;
  external?.addEventListener('abort',abort,{once:true});
  if(external?.aborted)abort();
  const t = setTimeout(() => ctl.abort(), ms);
  let request;
  try{
    if(ctl.signal.aborted)throw new Error('Request cancelled');
    request=Promise.resolve(fetch(url,{...opt,signal:ctl.signal}));
  }catch(e){request=Promise.reject(e);}
  return request.then(r=>consume?consume(r):r).finally(()=>{
    clearTimeout(t);external?.removeEventListener('abort',abort);
  });
}

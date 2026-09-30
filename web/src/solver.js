// 呼叫排程服務（OR-Tools）。連不上時由畫面改用瀏覽器內的演算法。

const BASE = (import.meta.env?.VITE_SOLVER_URL || "http://localhost:8080").replace(/\/$/, "");
const KEY = import.meta.env?.VITE_SOLVER_API_KEY || "";

export const SOLVER = {
  url: BASE,
  up: null,          // null = 還沒檢查；true / false
  version: "",
  capabilities: [],

  async chat(request,jwt) {
    return post(jwt?'/chat/db':'/chat',request,jwt?{Authorization:'Bearer '+jwt}:{});
  },

  async roster(request,jwt) {
    return post(jwt?'/roster/plans/db':'/roster/plans',request,jwt?{Authorization:'Bearer '+jwt}:{});
  },

  async check() {
    try {
      const r = await fetchWithTimeout(BASE + "/health", {}, 3000);
      const j = await r.json();
      this.up = !!j.ok;
      this.version = j.ortools || "";
      this.capabilities = j.capabilities || [];
    } catch {
      this.up = false;
      this.capabilities = [];
    }
    return this.up;
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
  const h = { "Content-Type": "application/json", ...headers };
  if (KEY) h["X-API-Key"] = KEY;
  let r;
  try {
    r = await fetchWithTimeout(BASE + path, { method: "POST", headers: h, body: JSON.stringify(body) }, 60000);
  } catch (e) {
    SOLVER.up = false;
    throw new Error("排程服務沒有回應");
  }
  if (!r.ok) {
    let msg = "排程服務錯誤 " + r.status;
    try { const j = await r.json(); if (j.detail) msg = typeof j.detail === "string" ? j.detail : msg; } catch {}
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function fetchWithTimeout(url, opt, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opt, signal: ctl.signal }).finally(() => clearTimeout(t));
}

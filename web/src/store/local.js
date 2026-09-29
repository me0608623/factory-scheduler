// 本機模式：資料存在這台電腦的瀏覽器（沒有設定 Supabase 時使用）

import { assertExecutionProtected, transitionExecution } from '../execution.js';
import { validateScenario } from '../scenarios.js';
import { validateGeneralWork } from '../general-work.js';
import { validateTransfers } from '../transfers.js';
import { validateRosters } from '../roster.js';
const KEY = "fsched-local-v1";
const SCENARIOS = 'fsched-scenarios-v1';
const ARCHIVE_INDEX = "fsched-legacy-index-v1";
const archiveKey = id => `fsched-legacy-${id}`;

export class LocalStore {
  kind = "local";
  role = "boss";
  userName = "";

  async init() {
    return { needLogin: false };
  }

  async load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.employees) return s;
    } catch {}
    return null;                                   // 沒有資料 → 畫面產生示範資料
  }

  async sync(S) {
    const old=await this.load();
    try {
      validateTransfers(S,{before:old});
      validateRosters(S);
      validateGeneralWork(S,{today:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()),baseAssignments:old?.workAssignments||[]});
      if(old){assertExecutionProtected(old,S);
        if(JSON.stringify(old.execution||[])!==JSON.stringify(S.execution||[]))throw new Error('現場進度只能由回報流程更新');}
    }catch(e){e.permission=true;throw e;}
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch {
      throw new Error("瀏覽器儲存空間不足或被停用");
    }
  }

  subscribe() {}                                   // 本機模式沒有其他人
  jwt() { return null; }

  async listScenarios() {return JSON.parse(localStorage.getItem(SCENARIOS)||'[]').map(({payload,...meta})=>meta);}
  async getScenario(id) {return JSON.parse(localStorage.getItem(SCENARIOS)||'[]').find(s=>s.id===id);}
  async saveScenario(item) {
    validateScenario(item.payload);
    const items=JSON.parse(localStorage.getItem(SCENARIOS)||'[]'),old=items.find(x=>x.id===item.id);
    if(old){if(JSON.stringify(old)!==JSON.stringify(item))throw new Error('情境代號已使用');return old.id;}
    if(items.length>=20)throw new Error('最多保存 20 個情境');
    try{localStorage.setItem(SCENARIOS,JSON.stringify([item,...items]));}catch{throw new Error('儲存空間不足，情境未存入');}
    return item.id;
  }
  async reportExecution(request) {
    const S=await this.load();if(!S)throw new Error('請先儲存排程');
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
    let next;try{next=transitionExecution(S,request,{today});}catch(e){e.rejected=true;throw e;}
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw new Error('儲存空間不足，進度未存入');}
  }

  async listLegacyArchives() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_INDEX) || "[]"); }
    catch { return []; }
  }

  async getLegacyArchive(id) {
    try { return JSON.parse(localStorage.getItem(archiveKey(id)) || "null"); }
    catch { return null; }
  }

  async saveLegacyArchive({ sourceName, sourceSha256, legacy }) {
    const existing = (await this.listLegacyArchives()).find(a => a.id === sourceSha256);
    if (existing) return existing;
    const dates = legacy.dates;
    const item = { id: sourceSha256, source_name: sourceName, source_sha256: sourceSha256,
      date_from: dates[0], date_to: dates.at(-1), imported_at: new Date().toISOString() };
    try {
      localStorage.setItem(archiveKey(item.id), JSON.stringify(legacy));
      localStorage.setItem(ARCHIVE_INDEX, JSON.stringify([item, ...await this.listLegacyArchives()]));
    } catch { throw new Error("瀏覽器儲存空間不足，歷史排程未存入"); }
    return item;
  }

  async reset() {
    try {
      for (const item of await this.listLegacyArchives()) localStorage.removeItem(archiveKey(item.id));
      localStorage.removeItem(ARCHIVE_INDEX);
      localStorage.removeItem(KEY);
      localStorage.removeItem(SCENARIOS);
    } catch {}
  }
}

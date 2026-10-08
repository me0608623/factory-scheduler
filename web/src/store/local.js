// 本機模式：資料存在這台電腦的瀏覽器（沒有設定 Supabase 時使用）

import { assertExecutionProtected, transitionExecution } from '../execution.js';
import { validateScenario } from '../scenarios.js';
import { validateGeneralWork } from '../general-work.js';
import { validateTransfers } from '../transfers.js';
import { validateRush } from '../rush.js';
import { validateWorkLog } from '../worklog.js';
import { validateRosters } from '../roster.js';
const KEY = "fsched-local-v1";
const SCENARIOS = 'fsched-scenarios-v1';
const ARCHIVE_INDEX = "fsched-legacy-index-v1";
const PROFILE_KEY = "fsched-local-profile-v1";
const archiveKey = id => `fsched-legacy-${id}`;

export class LocalStore {
  kind = "local";
  role = "boss";
  userName = "";

  async init() {
    try{this.userName=localStorage.getItem(PROFILE_KEY)||'';}catch{}
    return { needLogin: false };
  }

  async updateProfile({displayName}) {
    const name=String(displayName||'').trim();if(name.length<1||name.length>60)throw new Error('顯示名稱需要 1–60 個字');
    try{localStorage.setItem(PROFILE_KEY,name);this.userName=name;}catch{throw new Error('這台裝置無法儲存個人資料');}
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
      validateRush(S.rushOrders||[]);
      validateWorkLog(S.workLog||[]);
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
  can() { return true; }

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
  async signup() { throw new Error("註冊需要雲端模式；本機示範不需要帳號"); }
  async listAccessAccounts() {
    throw new Error("權限管理需要雲端模式；本機示範資料沒有帳號權限");
  }
  async confirmExecution(blockId, confirmed) {
    const S=await this.load();if(!S)throw new Error('請先儲存排程');
    const r=(S.execution||[]).find(x=>x.blockId===blockId);
    if(!r)throw new Error('找不到這段工作的回報');
    if(confirmed&&r.status!=='done')throw new Error('這項工作還未報完工');
    r.confirmed=confirmed;
    try{localStorage.setItem(KEY,JSON.stringify(S));}catch{throw new Error('儲存空間不足，確認狀態未存入');}
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

  async createLeaveRequest(request) {
    const S=await this.load();if(!S)throw new Error('請先儲存排程');
    S.leaveRequests ||= [];
    if(S.leaveRequests.some(x=>x.employeeId===request.employeeId&&x.date===request.date&&x.status==='pending'))throw new Error('這一天已有等待決定的請假詢問');
    S.leaveRequests.push({...request,status:'pending',createdAt:new Date().toISOString()});
    await this.sync(S);
  }

  async resolveLeaveRequest(id,status) {
    if(!['approved','rejected'].includes(status))throw new Error('決定狀態不正確');
    const S=await this.load();if(!S)throw new Error('請先儲存排程');const request=(S.leaveRequests||[]).find(x=>x.id===id);
    if(!request||request.status!=='pending')throw new Error('這筆詢問已處理或不存在');
    request.status=status;request.resolvedAt=new Date().toISOString();
    if(status==='approved'){const employee=S.employees.find(x=>x.id===request.employeeId);if(!employee)throw new Error('找不到人員');if(!employee.leaves.includes(request.date))employee.leaves.push(request.date);}
    await this.sync(S);
  }

  async saveMemo(memo) {
    const S=await this.load();if(!S)throw new Error('請先儲存排程');S.memos ||= [];
    const next={...memo,text:String(memo.text||'').trim()};if(!next.text||next.text.length>140)throw new Error('備忘需為 1–140 字');
    const i=S.memos.findIndex(x=>x.id===next.id);if(i<0)S.memos.push(next);else S.memos[i]=next;
    await this.sync(S);
  }

  async reset() {
    try {
      for (const item of await this.listLegacyArchives()) localStorage.removeItem(archiveKey(item.id));
      localStorage.removeItem(ARCHIVE_INDEX);
      localStorage.removeItem(KEY);
      localStorage.removeItem(SCENARIOS);
      localStorage.removeItem(PROFILE_KEY);
    } catch {}
  }
}

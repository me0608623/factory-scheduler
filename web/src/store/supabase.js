// Supabase 模式：資料在雲端資料庫，登入後依角色決定能不能改；別人的變更會即時推過來

import { fromSnapshot, blockToDb } from "../convert.js";
import { rowsOf, diffRows, UPSERT_ORDER, DELETE_ORDER, TABLE_KEYS, blocksKey } from "./diff.js";
import { groupCatalog } from "../groups.js";
import { assertExecutionProtected } from '../execution.js';
import { generalKey,validateGeneralWork,assignmentToDb } from '../general-work.js';
import { transferKey,validateTransfers } from '../transfers.js';
import { validateRush } from '../rush.js';
import { validateWorkLog } from '../worklog.js';
import { rosterKey,validateRosters } from '../roster.js';
import { effectivePermission } from '../permissions.js';
import { authReturnUrl } from '../runtime-config.js';
import { assertCloudSnapshot } from './snapshot-contract.js';

// 畫面的紀錄種類 ↔ 資料庫 change_sets.kind
const KIND_TO_DB = { ot: "edit", save: "edit", move: "move", edit: "edit", auto: "auto", fault: "fault", leave: "leave", order: "order", recover: "recover" };
const KIND_FROM_DB = { recover: "fault", order: "edit", import: "edit" };

const jsAbs = (date, min) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5) * 1440 + min;
};

const rushKey = (S) => JSON.stringify(S.rushOrders || []);
const workLogKey = (S) => JSON.stringify(S.workLog || []);

const TABLE_NAME = { processes: "工序", employees: "員工", employee_skills: "員工技能", leaves: "請假",
  employee_overtime_days: "單日加班意願", machines: "機台",
  machine_products: "機台模具", machine_faults: "機台故障", products: "產品", product_steps: "產品工序", orders: "工單",
  calendar_weekly: "每週上班日", calendar_days: "單日上班設定" };

// 資料庫拒絕（權限不足）時，換成看得懂的訊息
function writeError(t, error, verb) {
  const e = new Error(/row-level security|permission denied/i.test(error.message)
    ? `你的帳號沒有權限${verb}「${TABLE_NAME[t] || t}」` : `${verb}「${TABLE_NAME[t] || t}」失敗：${error.message}`);
  e.permission = /row-level security|permission denied/i.test(error.message);
  return e;
}

export class ConflictError extends Error {
  constructor(msg = "別人剛更新過排程") { super(msg); this.conflict = true; }
}

export class UnconfirmedWriteError extends Error {
  constructor(message='雲端儲存結果待確認，請按重試核對；目前修改仍保留。'){super(message);this.unconfirmed=true;}
}
function confirmedVersion(value,previous,verifyWriter){
  verifyWriter();
  // These seven RPCs return the incremented bigint, not a nullable/void result.
  // An HTTP success alone must not reset the version or accept a new baseline.
  if(!Number.isSafeInteger(value)||value!==previous+1)throw new UnconfirmedWriteError();
  return value;
}
function confirmedReceipt(value,verifyWriter,message){
  verifyWriter();
  // save_blocks returns the change-set UUID. Unlike void RPCs, a missing body
  // cannot confirm persistence; leave the optimistic state/baseline untouched.
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new UnconfirmedWriteError(message);
}
const receiptUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const receiptBlock=(value,expected)=>receiptUuid(value)&&typeof expected==='string'&&value.toLowerCase()===expected.toLowerCase();
const receiptTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
function confirmedExecutionReceipt(value,request){
  // A replay returns its original version, which may precede today's snapshot.
  // Validate against the dispatched operation, not store.version + 1.
  if(!value||Array.isArray(value)||!['start','quantity','finish'].includes(request.action)||!receiptBlock(value.blockId,request.blockId)||!receiptUuid(value.employeeId)||
    value.status!==(request.action==='finish'?'done':'running')||!Number.isSafeInteger(value.qtyDone)||value.qtyDone<0||value.qtyDone!==request.qtyDone||
    !Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision!==request.expectedRevision+1||
    !Number.isSafeInteger(value.version)||value.version<1||!receiptTime(value.startedAt)||
    (request.action==='finish'?(!receiptTime(value.finishedAt)||Date.parse(value.finishedAt)<Date.parse(value.startedAt)):value.finishedAt!==null))throw new UnconfirmedWriteError();
  return value;
}

export class SupabaseStore {
  kind = "supabase";
  authEpoch = 0;

  constructor(client) {
    this.sb = client;
    this.base = null;
    this.baseBlocks = "";
    this.version = 0;
    this.role = null;
    this.permissions = {};
    this.userName = "";
    this.session = null;
    this.realtimeStatus = null;
  }

  // ---------- 帳號 ----------
  async init() {
    this._watchAuthSession();
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    if (!this.session) return { needLogin: true };
    await this._profile();
    return { needLogin: false };
  }

  async login(email, password) {
    this._watchAuthSession();
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? "帳號或密碼不對" : error.message);
    this.session = data.session;
    await this._profile();
  }

  async requestPasswordReset(email, redirectTo) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error("寄送密碼設定信失敗：" + error.message);
  }

  async setPassword(password) {
    if (!this.session) throw new Error("請先登入或開啟邀請信中的連結");
    if (password.length < 12) throw new Error("密碼至少需要 12 個字元");
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error("設定密碼失敗：" + error.message);
  }

  async signup(email, password, name) {
    const { data, error } = await this.sb.auth.signUp({ email, password,
      options: { data: { name: name || "" }, emailRedirectTo: authReturnUrl(location,this.environment==='test') } });
    if (error) throw new Error(error.message);
    return data; // 需要信箱驗證時 data.session為 null
  }
  async logout() {
    await this.sb.auth.signOut();
    this._clearSession();
  }

  _clearSession() {
    this.authEpoch++;
    this.session=null;this.role=null;this.permissions={};this.userName='';this.employeeId=null;
    // 登出要一併移除即時頻道：sb.channel(同名) 會回傳同一實例，
    // 下一個工作階段若對「已訂閱」的頻道再 .on() 會拋
    // 「cannot add postgres_changes callbacks after subscribe()」並中斷登入後的啟動。
    const old=this.channel;this.channel=null;this.realtimeStatus=null;
    if(old){try{this.sb.removeChannel(old);}catch(e){}}
  }

  _watchAuthSession() {
    if(this.authSubscription)return;
    // Keep the callback synchronous: do not make auth/DB calls under the SDK lock.
    const {data}=this.sb.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){this._clearSession();return;}
      if(event==='SIGNED_IN'){
        if(this.session&&session?.user?.id!==this.session.user.id)this._clearSession();
        return;
      }
      if(event!=='TOKEN_REFRESHED'||!this.session)return;
      if(session?.user?.id!==this.session.user.id){this._clearSession();return;}
      this.session=session;
    });
    this.authSubscription=data.subscription;
  }

  async _profile() {
    const client=this.sb,user=this.session?.user,epoch=this.authEpoch;
    const current=()=>this.sb===client&&this.session?.user?.id===user?.id&&this.authEpoch===epoch;
    const assertCurrent=()=>{if(!current())throw new Error('登入狀態已變更，請重新整理後確認帳號。');};
    try{
      const { data,error } = await client.from("profiles").select("display_name,role,employee_id").eq("user_id", user?.id).maybeSingle();
      assertCurrent();
      if(error)throw new Error('讀取帳號權限失敗：'+error.message);
      if(!data||!['boss','lead','worker','viewer'].includes(data.role))throw new Error('讀取帳號權限失敗：帳號資料不完整');
      const {data:permissionRows,error:permissionError}=await client.from('account_permissions').select('permission,allowed').eq('user_id',user?.id);
      assertCurrent();
      if(permissionError)throw new Error('讀取帳號權限失敗：'+permissionError.message);
      if(!Array.isArray(permissionRows)||permissionRows.some(r=>!r||typeof r.permission!=='string'||typeof r.allowed!=='boolean'))throw new Error('讀取帳號權限失敗：權限回應不完整');
      // A profile and its grants form one accepted authorization state. Do not
      // expose a new role with old grants, or retain stale writes after failure.
      this.role = data?.role || null;
      this.employeeId = data?.employee_id || null;
      this.userName = data?.display_name || user?.email || "";
      this.permissions=Object.fromEntries(permissionRows.map(x=>[x.permission,x.allowed]));
    }catch(error){
      if(current()){this.role=null;this.permissions={};this.employeeId=null;}
      throw error;
    }
  }

  can(permission) { return effectivePermission(this.role,this.permissions,permission); }

  async listAccessAccounts() {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {data,error}=await assertOwner.authorize(client.rpc('list_access_accounts'));assertOwner();
    if(error)throw new Error('讀取帳號權限失敗：'+error.message);
    return data||[];
  }

  async setAccessPermissions(userId,permissions) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {error}=await assertOwner.authorize(client.rpc('set_account_permissions',{p_user:userId,p_permissions:permissions}));assertOwner();
    if(error)throw new Error('儲存帳號權限失敗：'+error.message);
  }

  async updateProfile({displayName}) {
    const name=String(displayName||'').trim();if(name.length<1||name.length>60)throw new Error('顯示名稱需要 1–60 個字');
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {data,error}=await assertOwner.authorize(client.rpc('update_own_profile',{p_display_name:name}));
    assertOwner();
    if(error)throw new Error('儲存個人資料失敗：'+error.message);
    if(!data||Array.isArray(data)||typeof data.displayName!=='string'||data.displayName!==name)throw new UnconfirmedWriteError();
    this.userName=data.displayName;
  }

  jwt() { return this.session?.access_token || null; }

  async listScenarios() {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {data,error}=await assertOwner.authorize(client.from('planning_scenarios').select('id,name,created_at')).order('created_at',{ascending:false});assertOwner();
    if(error)throw new Error('讀取試排情境失敗：'+error.message);return data||[];
  }
  async getScenario(id) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {data,error}=await assertOwner.authorize(client.from('planning_scenarios').select('*')).eq('id',id).single();assertOwner();
    if(error)throw new Error('讀取試排情境失敗：'+error.message);if(!data)throw new Error('情境不存在或沒有權限');return data;
  }
  async saveScenario(item) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const id=item.id;
    const {data,error}=await assertOwner.authorize(client.rpc('save_planning_scenario',{p_id:id,p_name:item.name,p_payload:item.payload}));assertOwner();
    if(error)throw new Error('保存情境失敗：'+error.message);
    if(typeof data!=='string'||!receiptBlock(data,id))throw new UnconfirmedWriteError('情境保存結果待核對；請查看保存的情境，或用相同名稱重試同一筆。');
    return data;
  }
  async reportExecution(request) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const dispatched={blockId:request.blockId,action:request.action,qtyDone:request.qtyDone,expectedRevision:request.expectedRevision};
    const {data,error,status}=await assertOwner.authorize(client.rpc('report_work_execution',{p_request:request.id,p_block:dispatched.blockId,p_action:dispatched.action,p_qty:dispatched.qtyDone,p_revision:dispatched.expectedRevision}));assertOwner();
    if(error){
      // PostgREST maps transaction rollback (40*) to HTTP 500. Other 5xx
      // gateway responses cannot conclusively invalidate the original request.
      if(error.code==='40001'&&(status==null||status===500||status>=400&&status<500))throw new ConflictError('進度已被更新，請重新載入');
      // Only this RPC's known SQL rejections are conclusive. Unknown/proxy
      // failures may hide a committed request; keep its id for explicit replay.
      if(['42501','P0001'].includes(error.code)&&(status==null||status>=400&&status<500))throw Object.assign(new Error(error.message),{rejected:true});
      throw new UnconfirmedWriteError();
    }
    return confirmedExecutionReceipt(data,dispatched);
  }
  async confirmExecution(blockId, confirmed) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {data,error}=await assertOwner.authorize(client.rpc('confirm_work_execution',{p_block:blockId,p_confirmed:confirmed}));assertOwner();
    if(error)throw new Error(error.message);
    if(!data||Array.isArray(data)||!receiptBlock(data.blockId,blockId)||typeof data.confirmed!=='boolean'||data.confirmed!==confirmed||
      !Number.isSafeInteger(data.version)||data.version<1)throw new UnconfirmedWriteError('完工確認結果待核對，請更新班表查看；不要重複送出。');
    return data;
  }

  // 舊版 Excel 作為獨立歷史資料儲存，絕不更動目前排程快照。
  requestOwnerGuard(failure=()=>new Error('登入狀態已變更，請重新整理後確認帳號。')) {
    const client=this.sb,user=this.session?.user?.id,epoch=this.authEpoch,token=this.session?.access_token;
    const assertOwner=()=>{if(this.sb!==client||this.session?.user?.id!==user||this.authEpoch!==epoch)throw failure();};
    assertOwner.authorize=query=>{
      assertOwner();
      if(!user||!token)throw failure();
      // Supabase fetchWithAuth awaits its mutable session even after the builder
      // is created. Pin this query only; never mutate shared client headers.
      return query.setHeader('Authorization','Bearer '+token);
    };
    return assertOwner;
  }
  legacyOwnerGuard() { return this.requestOwnerGuard(); }

  async listLegacyArchives() {
    const client=this.sb,assertOwner=this.legacyOwnerGuard();
    const { data, error } = await assertOwner.authorize(client.from("legacy_schedule_archives")
      .select("id,source_name,source_sha256,date_from,date_to,imported_at"))
      .order("imported_at", { ascending: false });
    assertOwner();
    if (error) throw new Error("讀取歷史排程失敗：" + error.message);
    return data || [];
  }

  async getLegacyArchive(id) {
    const client=this.sb,assertOwner=this.legacyOwnerGuard();
    const { data, error } = await assertOwner.authorize(client.from("legacy_schedule_archives")
      .select("payload")).eq("id", id).single();
    assertOwner();
    if (error) throw new Error("讀取歷史排程內容失敗：" + error.message);
    return data?.payload??null;
  }

  async saveLegacyArchive({ sourceName, sourceSha256, legacy }) {
    const client=this.sb,assertOwner=this.legacyOwnerGuard();
    const table = client.from("legacy_schedule_archives");
    const { data: found, error: lookupError } = await assertOwner.authorize(table
      .select("id,source_name,source_sha256,date_from,date_to,imported_at"))
      .eq("source_sha256", sourceSha256).maybeSingle();
    assertOwner();
    if (lookupError) throw new Error("檢查歷史排程失敗：" + lookupError.message);
    if (found) return found;
    const { data, error } = await assertOwner.authorize(client.from("legacy_schedule_archives")
      .insert({ source_name: sourceName, source_sha256: sourceSha256,
        date_from: legacy.dates[0], date_to: legacy.dates.at(-1), payload: legacy }))
      .select("id,source_name,source_sha256,date_from,date_to,imported_at").single();
    assertOwner();
    // Another tab may have inserted the same SHA after our empty lookup.
    // Recover by reading, never upsert/overwrite its immutable source payload.
    if (error?.code === '23505') {
      const {data: existing, error: readError} = await assertOwner.authorize(client.from("legacy_schedule_archives")
        .select("id,source_name,source_sha256,date_from,date_to,imported_at"))
        .eq("source_sha256", sourceSha256).maybeSingle();
      assertOwner();
      if (!readError && existing?.id && existing.source_sha256 === sourceSha256) return existing;
    }
    if (error) throw new Error("儲存歷史排程失敗：" + error.message);
    return data;
  }

  async createLeaveRequest(request) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {error}=await assertOwner.authorize(client.from('leave_requests').insert({id:request.id,employee_id:request.employeeId,date:request.date,note:request.note||'',status:'pending'}));
    assertOwner();
    if(error)throw writeError('請假詢問',error,'新增');
  }

  async resolveLeaveRequest(id,status) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const {error}=await assertOwner.authorize(client.rpc('resolve_leave_request',{p_id:id,p_status:status}));
    assertOwner();
    if(error)throw writeError('請假詢問',error,'處理');
  }

  async saveMemo(memo) {
    const client=this.sb,assertOwner=this.requestOwnerGuard();
    const row={id:memo.id,text:memo.text,machine_id:memo.machineId||null,employee_id:memo.employeeId||null,pinned:!!memo.pinned,author:memo.author||this.userName||''};
    const {error}=await assertOwner.authorize(client.from('schedule_memos').upsert([row],{onConflict:'id'}));
    assertOwner();
    if(error)throw writeError('備忘',error,'儲存');
  }

  // ---------- 讀 ----------
  async load({remember=true}={}) {
    const client=this.sb,user=this.session?.user?.id,epoch=this.authEpoch;
    const assertReader=()=>{if(this.sb!==client||this.session?.user?.id!==user||this.authEpoch!==epoch)throw new Error('登入狀態已變更，請重新整理後確認帳號。');};
    const { data, error } = await client.rpc("schedule_snapshot");
    assertReader();
    if (error) throw new Error("讀取排程失敗：" + error.message);
    assertCloudSnapshot(data);
    const S = fromSnapshot(data);
    const { data: logs } = await client.from("change_sets").select("*").order("created_at", { ascending: false }).limit(200);
    assertReader();
    S.log = (logs || []).map(logFromDb);
    // Background reads are speculative. The UI accepts the state and baseline
    // together, synchronously, only after checking that no edit/save intervened.
    if(remember)this.acceptLoaded(S);
    return S;
  }

  acceptLoaded(S){this._remember(S);this.version=S.version;}

  _remember(S) {
    this.protectedBase=structuredClone({blocks:S.blocks,execution:S.execution||[],employees:S.employees.map(e=>({id:e.id})),machines:S.machines.map(m=>({id:m.id})),orders:S.orders.map(o=>({id:o.id}))});
    this.base = rowsOf(S);
    this.baseBlocks = blocksKey(S);
    this.baseGroups = JSON.stringify(groupCatalog(S));
    this.baseGeneral=generalKey(S);this.baseContents=JSON.stringify(S.workContents||[]);
    this.baseTransfers=transferKey(S);this.transferBase=structuredClone(S);
    this.baseRush=rushKey(S);
    this.baseWorkLog=workLogKey(S);
    this.baseRosters=rosterKey(S);
  }

  // ---------- 寫：只寫有變的列；排程方塊整批用 save_blocks（有版本號檢查） ----------
  async sync(S, entry) {
    const client=this.sb,assertWriter=this.requestOwnerGuard(()=>new UnconfirmedWriteError());
    try{validateRosters(S);}catch(e){e.permission=true;throw e;}
    try{validateTransfers(S,{before:this.transferBase});}catch(e){e.permission=true;throw e;}
    try{validateGeneralWork(S,{today:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()),baseAssignments:JSON.parse(this.baseGeneral||'{}').assignments||[]});if(this.protectedBase){assertExecutionProtected(this.protectedBase,S);
      if(JSON.stringify(this.protectedBase.execution)!==JSON.stringify(S.execution||[]))throw new Error('現場進度只能由回報流程更新');}}
    catch(e){e.permission=true;throw e;}
    const d = diffRows(this.base, rowsOf(S));
    if(rosterKey(S)!==this.baseRosters){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||transferKey(S)!==this.baseTransfers||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將輪班草稿與產線排程／基本資料分開儲存'),{permission:true});
      const {data,error}=await assertWriter.authorize(client.rpc('save_staff_rosters',{p_version:this.version,p_rosters:S.staffRosters||[]}));
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=confirmedVersion(data,this.version,assertWriter);this._remember(S);return;
    }
    if(transferKey(S)!==this.baseTransfers){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將跨廠加工紀錄與排程／基本資料分開儲存'),{permission:true});
      const {data,error}=await assertWriter.authorize(client.rpc('save_transfer_orders',{p_version:this.version,p_orders:S.transferOrders||[]}));
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=confirmedVersion(data,this.version,assertWriter);this._remember(S);return;
    }
    if(rushKey(S)!==this.baseRush){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||transferKey(S)!==this.baseTransfers||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將特別趕貨紀錄與排程／基本資料分開儲存'),{permission:true});
      try{validateRush(S.rushOrders||[]);}catch(e){throw Object.assign(e,{permission:true});}
      const {data,error}=await assertWriter.authorize(client.rpc('save_rush_orders',{p_version:this.version,p_orders:S.rushOrders||[]}));
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=confirmedVersion(data,this.version,assertWriter);this._remember(S);return;
    }
    if(workLogKey(S)!==this.baseWorkLog){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||generalKey(S)!==this.baseGeneral||transferKey(S)!==this.baseTransfers||rushKey(S)!==this.baseRush||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw Object.assign(new Error('請將工作紀錄與排程／基本資料分開儲存'),{permission:true});
      try{validateWorkLog(S.workLog||[]);}catch(e){throw Object.assign(e,{permission:true});}
      const {data,error}=await assertWriter.authorize(client.rpc('save_work_log',{p_version:this.version,p_rows:S.workLog||[]}));
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=confirmedVersion(data,this.version,assertWriter);this._remember(S);return;
    }
    if(generalKey(S)!==this.baseGeneral){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks||JSON.stringify(groupCatalog(S))!==this.baseGroups)
        throw new Error('請將工作內容／一般工作排班與產品排程、名冊分開儲存');
      const contentsChanged=JSON.stringify(S.workContents||[])!==this.baseContents;
      if(contentsChanged&&JSON.stringify(S.workAssignments||[])!==JSON.stringify(JSON.parse(this.baseGeneral).assignments))throw new Error('請先儲存工作內容，再安排工作');
      const args=contentsChanged?{p_version:this.version,p_contents:S.workContents||[]}:{p_version:this.version,p_assignments:(S.workAssignments||[]).map(assignmentToDb)};
      const {data,error}=await assertWriter.authorize(client.rpc(contentsChanged?'save_work_contents':'save_work_assignments',args));
      if(error){if(error.code==='40001')throw new ConflictError();throw Object.assign(new Error(error.message),{permission:true});}
      S.version=this.version=confirmedVersion(data,this.version,assertWriter);this._remember(S);return;
    }
    const catalog=groupCatalog(S),groupsChanged=JSON.stringify(catalog)!==this.baseGroups;
    if(groupsChanged){
      if(Object.values(d).some(c=>c.upsert.length||c.del.length)||blocksKey(S)!==this.baseBlocks)
        throw new Error('請將員工分組與排班／基本資料分開儲存');
      const {data,error}=await assertWriter.authorize(client.rpc('save_staff_groups',{p_base_version:this.version,p_groups:catalog.groups,p_members:catalog.members,p_title:entry?.title||'更新員工分組'}));
      if(error){if(error.code==='40001')throw new ConflictError();throw writeError('員工分組',error,'修改');}
      S.version=this.version=confirmedVersion(data,this.version,assertWriter);this._remember(S);return;
    }
    // 基本資料逐表寫入，若排程版本已過期，應在第一筆寫入前先拒絕；
    // 否則後續 save_blocks 才報衝突時，工單等列可能已部分留下。
    if (Object.values(d).some(change => change.upsert.length || change.del.length)) {
      const { data, error } = await assertWriter.authorize(client.from("schedule_state").select("version")).single();
      assertWriter();
      if (error) throw new Error("檢查排程版本失敗：" + error.message);
      if (Number(data.version) !== this.version) throw new ConflictError();
    }
    for (const t of UPSERT_ORDER) {
      if (!d[t]?.upsert.length) continue;
      const { error } = await assertWriter.authorize(client.from(t).upsert(d[t].upsert, { onConflict: TABLE_KEYS[t].join(",") }));
      assertWriter();
      if (error) throw writeError(t, error, "修改");
    }
    if (blocksKey(S) !== this.baseBlocks) {
      const { data, error } = await assertWriter.authorize(client.rpc("save_blocks", {
        p_base_version: this.version, p_blocks: S.blocks.map(blockToDb),
        p_title: entry?.title || "調整排程", p_detail: detailOf(entry), p_kind: KIND_TO_DB[entry?.kind] || "edit",
      }));
      if (error) {
        if (error.code === "40001") throw new ConflictError();
        throw new Error("儲存排程失敗：" + error.message);
      }
      confirmedReceipt(data,assertWriter);
      this.version += 1;
      S.version = this.version;
    } else if (entry) {
      const { error } = await assertWriter.authorize(client.rpc("log_change", { p_kind: KIND_TO_DB[entry.kind] || "edit", p_title: entry.title, p_detail: detailOf(entry) }));
      assertWriter();
      if (error) throw new Error("寫入紀錄失敗：" + error.message);
    }
    for (const t of DELETE_ORDER) {
      for (const row of d[t]?.del || []) {
        let q = assertWriter.authorize(client.from(t).delete());
        for (const k of TABLE_KEYS[t]) q = q.eq(k, row[k]);
        const { error } = await q;
        assertWriter();
        if (error) throw writeError(t, error, "刪除");
      }
    }
    this._remember(S);
  }

  // 套用排程服務存好的方案（整批在資料庫的一個交易裡完成）
  async applyPlan(previewId, optionId, note, ai) {
    const client=this.sb;
    const message='排程套用結果待確認，請更新班表核對；不要重複套用。';
    const assertWriter=this.requestOwnerGuard(()=>new UnconfirmedWriteError(message));
    const { data,error } = await assertWriter.authorize(client.rpc("apply_plan", { p_preview: previewId, p_option: optionId, p_note: note || null, p_ai: ai || null }));
    assertWriter();
    if (error) {
      if (error.code === "40001") throw new ConflictError("別人剛更新過排程，請重新計算方案");
      throw new Error(error.message);
    }
    // apply_plan returns the transaction's change-set UUID, just like save_blocks.
    // Only an accepted snapshot refresh can advance the baseline.
    confirmedReceipt(data,assertWriter,message);
  }

  // ---------- 即時推送 ----------
  subscribe(onChange, onStatus = () => {}) {
    // 冪等：重複呼叫（如 re-login 後 start() 再跑）先移除舊頻道，
    // 否則對已訂閱頻道再 .on() 會拋錯（見 _clearSession 註解）。
    const old=this.channel;this.channel=null;
    if(old){try{this.sb.removeChannel(old);}catch(e){}}
    const ch = this.sb.channel("schedule-changes");
    this.channel=ch;
    let streamFailed=false,joinStatus='CONNECTING';
    const report=status=>{if(this.channel!==ch)return;this.realtimeStatus=status;onStatus(status);};
    report('CONNECTING');
    for (const t of ["schedule_state", "change_sets", "machine_faults", "leaves", "employee_overtime_days", "orders", "calendar_days", "work_execution","work_contents","work_assignments","transfer_orders","rush_orders","work_log","staff_rosters","leave_requests","schedule_memos","machine_layout","employees","machines","products","calendar_weekly"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {if(this.channel===ch)onChange(t);});
    }
    if(this.session?.user?.id)ch.on("postgres_changes",{event:"*",schema:"public",table:"account_permissions",filter:"user_id=eq."+this.session.user.id},
      async()=>{if(this.channel!==ch)return;try{await this._profile();}catch{}if(this.channel===ch)onChange("account_permissions");});
    ch.on('system',{},payload=>{
      if(payload.extension!=='postgres_changes')return;
      if(['error','timeout'].includes(payload.status)){streamFailed=true;report('CHANNEL_ERROR');}
      else if(payload.status==='ok'){streamFailed=false;if(joinStatus==='SUBSCRIBED')report('SUBSCRIBED');}
    });
    // Raw errors can contain connection details: expose only the status.
    try{ch.subscribe(status=>{joinStatus=status;report(status==='SUBSCRIBED'&&streamFailed?'CHANNEL_ERROR':status);});}catch{report('CHANNEL_ERROR');}
  }
}

function detailOf(e) {
  if (!e) return {};
  return { summary: e.sum || null, lines: e.lines || [], people: e.people || [], shifts: e.shifts || [],
           ai: e.ai || null, note: e.note || null, alts: e.alts || [] };
}

export function logFromDb(r) {
  const d = r.detail || {};
  return {
    id: r.id,
    t: Date.parse(r.created_at),
    kind: KIND_FROM_DB[r.kind] || r.kind,
    title: r.title,
    sum: r.summary || d.summary || "",
    lines: d.lines || [],
    people: (d.people || []).map((p) => ({ name: p.name, items: (p.items || []).map((x) => typeof x === "string" ? x : (x.t === "in" ? "新增 " : "拿掉 ") + x.text) })),
    shifts: (d.shifts || []).map((s) => s.before ? { code: s.code, b: jsAbs(s.before.date, s.before.min), a: jsAbs(s.after.date, s.after.min) } : s),
    ai: r.ai || d.ai || null,
    note: r.note || d.note || "",
    alts: (d.alts || []).map((a) => typeof a === "string" ? a
      : `方案 ${a.id} ${a.name}：延誤 ${a.metrics?.late?.length ?? 0}、異動 ${a.metrics?.moved ?? 0}、影響他天 ${a.metrics?.other_days ?? 0}、加班 ${a.metrics?.ot_h ?? 0} 小時`),
  };
}

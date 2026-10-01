// 產線排程看板（正式版）：畫面沿用原型，資料層與排程服務可替換
import { SOLVER } from "./solver.js";
import { planTimeLimit, planEngineLabel } from "./plan-budget.js";
import { toSnapshot, applyOption, newId } from "./convert.js";
import { ALL_WEEKDAYS, overtimeAllowed, overtimeDefault, overtimeWeekdays } from "./overtime.js";
import { capacityIntervals as occupiedCapacityIntervals } from "./capacity.js";
import { FACTORIES, factoryOf, factoryPreference, factoryName, inFactory, orderRoute, orderInFactory, compatible } from "./factory.js";
import { batchReadyMinute, effectiveBlockQty, materialFlowIssue, remainingQty, quantityForMinutes } from "./manual.js";
import { acceptManualPreview, placementConflicts } from "./manual-apply.js";
import { employeeGroups, groupedEmployees, memberStatus } from "./groups.js";
import { resourceLoad } from "./resource-load.js";
import { workQueue } from './work-queue.js';
import { makeScenario, scenarioStale, validateScenario, scenarioKey } from './scenarios.js';
import { executionOf, canReport, assertExecutionProtected } from './execution.js';
import { workCatalog,assignments,occupiedWork,assignmentIssues,validateGeneralWork } from './general-work.js';
import { legacyFieldMap } from './legacy-field-map.js';
import {transferOrders,materialWarning,transferPlanWarnings,batchOf,validateTransfers,transferSummary} from './transfers.js';
import {transferUI} from './transfer-ui.js';
import {validateRush,shortageRowFlags} from './rush.js';
import {validateWorkLog} from './worklog.js';
import {rosterUI} from './roster-ui.js';
import {installScheduleChat} from './chat-ui.js';
import {PERMISSIONS,effectivePermission} from './permissions.js';
import {orderCounters,productionSummary,leaveState,visibleMemos,workerTimeline} from './overview.js';
import {DEFAULT_PREFERENCES,applyPreferences,loadPreferences,notificationEnabled,patchPreference,savePreferences} from './settings.js';
/* ===== 1. 常數與工具 ===== */
const COLORS=["#FFE14D","#4CDB6E","#F58CF0","#4FE3EE","#FFA64D","#AFC0FF","#FF9A9A","#BFEA6C"];
const PROCS=["裁切","沖壓","焊接","組裝","包裝"];
const processNames=()=>[...new Set([...S.machines.map(m=>m.proc),...S.products.flatMap(p=>p.steps.map(s=>s.proc)),...workCatalog(S).map(w=>w.name)])].filter(Boolean);
const DAY0=480, LUNCH_S=720, LUNCH_E=780, REG_END=1020, DAY1=1200, HORIZON=60;
// 台灣國定假日（依行政院人事行政總處公告，請每年核對）
const HOLI={"2026-01-01":"元旦","2026-02-16":"春節","2026-02-17":"春節","2026-02-18":"春節","2026-02-19":"春節","2026-02-20":"春節",
"2026-02-27":"和平紀念日補假","2026-02-28":"和平紀念日","2026-04-03":"兒童節補假","2026-04-04":"兒童節","2026-04-05":"清明節","2026-04-06":"清明節補假",
"2026-05-01":"勞動節","2026-06-19":"端午節","2026-09-25":"中秋節","2026-09-28":"教師節","2026-10-09":"國慶日補假","2026-10-10":"國慶日",
"2026-10-25":"光復節","2026-10-26":"光復節補假","2026-12-25":"行憲紀念日","2027-01-01":"元旦"};
const WD="日一二三四五六";
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const uid=newId;   // UUID：本機與資料庫共用
const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);
const hm=m=>pad(Math.floor(m/60))+":"+pad(m%60);
function parseD(ds){const [y,m,d]=ds.split("-").map(Number);return new Date(Date.UTC(y,m-1,d));}
function fmtD(dt){return dt.getUTCFullYear()+"-"+pad(dt.getUTCMonth()+1)+"-"+pad(dt.getUTCDate());}
function addDays(ds,n){const d=parseD(ds);d.setUTCDate(d.getUTCDate()+n);return fmtD(d);}
function dayNum(ds){return Math.round(parseD(ds).getTime()/864e5);}
function absOf(ds,m){return dayNum(ds)*1440+m;}
function dateOfAbs(a){return fmtD(new Date(Math.floor(a/1440)*864e5));}
function todayStr(){const n=new Date();return n.getFullYear()+"-"+pad(n.getMonth()+1)+"-"+pad(n.getDate());}
function nowMin(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function nowAbs(){return absOf(todayStr(),Math.ceil(nowMin()/10)*10);}
function md(ds){const d=parseD(ds);return (d.getUTCMonth()+1)+"/"+d.getUTCDate();}
function mdw(ds){return md(ds)+"（"+WD[parseD(ds).getUTCDay()]+"）";}
function weekStart(ds){const w=parseD(ds).getUTCDay();return addDays(ds,-((w+6)%7));}
function mergeIv(iv){iv.sort((a,b)=>a[0]-b[0]);const o=[];for(const x of iv){if(o.length&&x[0]<=o[o.length-1][1])o[o.length-1][1]=Math.max(o[o.length-1][1],x[1]);else o.push([x[0],x[1]]);}return o;}

/* ===== 2. 狀態 ===== */
let S=null;            // 目前排程（全部資料）
let readOnly=false, undoStack=[];
let recentManualMove=null;
const UI={date:null,view:"day",layout:'resource',factory:1,group:'all',modal:null,zoom:1,theme:"light",drawer:null,focus:null,prefs:structuredClone(DEFAULT_PREFERENCES),page:null,returnTo:null,leaveBrush:null,editCell:null,confirmRow:null,workLogDate:null};
function loadFactory(){try{UI.factory=factoryPreference(localStorage.getItem("fsched-factory"));}catch(e){}}
function setFactory(n){UI.factory=FACTORIES.includes(n)?n:"all";try{localStorage.setItem("fsched-factory",String(UI.factory));}catch(e){}}
const shownEmployees=()=>groupedEmployees(S,S.employees.filter(e=>inFactory(e,UI.factory)),UI.group);
const shownMachines=()=>S.machines.filter(m=>inFactory(m,UI.factory));
const shownOrders=()=>S.orders.filter(o=>orderInFactory(o,S.products,UI.factory));
// 畫面縮放：每台電腦各自記住
const ZOOMS=[0.6,0.7,0.75,0.8,0.85,0.9,1,1.1,1.25,1.4];
function persistPreferences(){try{UI.prefs=savePreferences(UI.prefs);}catch(e){toast('這台裝置無法保存設定');}applyPreferences(UI.prefs);UI.zoom=UI.prefs.scale;UI.theme=UI.prefs.theme;}
function setZoom(z){UI.prefs=patchPreference(UI.prefs,'scale',z);persistPreferences();try{localStorage.setItem("fsched-zoom",String(UI.zoom));}catch(e){}}
// 淺色／深色：每台電腦各自記住（auto = 跟著系統）
const THEMES=["auto","light","dark"];
const THEME_UI={
  auto:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg><span class="lbl">自動</span>',
  light:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg><span class="lbl">淺色</span>',
  dark:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg><span class="lbl">深色</span>'
};
function setTheme(t){
  UI.prefs=patchPreference(UI.prefs,'theme',THEMES.includes(t)?t:'auto');persistPreferences();
  try{localStorage.setItem("fsched-theme",UI.theme);}catch(e){}
}
function loadPreferencesForDevice(){UI.prefs=loadPreferences();applyPreferences(UI.prefs);UI.zoom=UI.prefs.scale;UI.theme=UI.prefs.theme;}

const SETTINGS_TEXT={
  'zh-TW':{settings:'設定',today:'今天',orders:'工單',people:'人',output:'產量',notes:'備忘',more:'更多'},
  en:{settings:'Settings',today:'Today',orders:'Orders',people:'People',output:'Output',notes:'Notes',more:'More'}
};
const tx=k=>SETTINGS_TEXT[UI.prefs.language]?.[k]||SETTINGS_TEXT['zh-TW'][k]||k;

const emp=id=>S.employees.find(e=>e.id===id);
const mach=id=>S.machines.find(m=>m.id===id);
const prod=id=>S.products.find(p=>p.id===id);
const order=id=>S.orders.find(o=>o.id===id);
const empColor=id=>{const e=emp(id);return e?COLORS[e.color%COLORS.length]:"#ccc";};
const stepName=b=>{const o=order(b.oid);const p=o&&prod(o.pid);return p&&p.steps[b.step]?p.steps[b.step].proc:"?";};
const bAbs=b=>absOf(b.date,b.s), bEnd=b=>absOf(b.date,b.e);
const byAbs=(a,b)=>bAbs(a)-bAbs(b);

// 假日只是「標示」：當天有沒有上班，看工廠自己的行事曆（每週固定＋單日調整）
const DEF_WEEK=[false,true,true,true,true,true,true];   // 日一二三四五六：預設週日停工
function isOpen(ds){const o=S.cal.over[ds];return o?o==="work":!!S.cal.week[parseD(ds).getUTCDay()];}
function dayInfo(ds){
  const w=parseD(ds).getUTCDay(), hol=HOLI[ds]||"";
  const type=hol?"hol":w===0?"sun":w===6?"sat":"work";
  const open=isOpen(ds), ot=open&&!!S.dayOT[ds];
  const special=type!=="work";          // 假日出勤：工資另計，不能加班的人不排
  let win=[];
  if(open){win=[{s:DAY0,e:LUNCH_S,ot:special},{s:LUNCH_E,e:REG_END,ot:special}];if(ot)win.push({s:REG_END,e:DAY1,ot:true});}
  return {type,hol,ot,win,w,open,special};
}
function dayLabel(ds){const i=dayInfo(ds);return (i.type==="hol"?i.hol:i.type==="sat"?"週六":i.type==="sun"?"週日":"平日")+(i.open?" · 上班":" · 停工");}
function payNote(i){return i.type==="hol"?"國定假日出勤，工資加倍":i.type==="sat"?"休息日出勤，依加班計薪":i.type==="sun"?"例假日出勤，請確認是否合法":"";}
function workdaysFrom(ds,n){const out=[];let d=ds;for(let i=0;out.length<n&&i<400;i++){if(isOpen(d)&&dayInfo(d).type==="work")out.push(d);d=addDays(d,1);}return out;}

/* ===== 3. 示範資料（第一次開啟時產生） ===== */
function makeDemo(){
  S={v:1,demo:true,savedAt:null,dayOT:{},cal:{week:[...DEF_WEEK],over:{}},log:[],blocks:[],leaveRequests:[],memos:[],
    employees:[
      {id:"e1",name:"張三",color:0,skills:["a","b","e"],maxMachines:1,leaves:[],noOT:false},
      {id:"e2",name:"李四",color:1,skills:["a","c","d"],maxMachines:1,leaves:[],noOT:false},
      {id:"e3",name:"王五",color:2,skills:["c","d","e"],maxMachines:1,leaves:[],noOT:false},
      {id:"e4",name:"陳六",color:3,skills:["b","c","e"],maxMachines:1,leaves:[],noOT:false},
      {id:"e5",name:"林七",color:4,skills:["a","d","e"],maxMachines:1,leaves:[],noOT:true}],
    machines:[
      {id:"a",label:"裁切機 1",proc:"裁切",products:["p1","p2"],faults:[]},
      {id:"b",label:"裁切機 2",proc:"裁切",products:["p1"],faults:[]},
      {id:"c",label:"沖壓機",proc:"沖壓",products:["p1","p3"],faults:[]},
      {id:"d",label:"焊接機",proc:"焊接",products:["p2","p3"],faults:[]},
      {id:"e",label:"包裝線",proc:"包裝",products:["p1","p2","p3"],faults:[]}],
    products:[
      {id:"p1",name:"外殼",steps:[{proc:"裁切",rate:2,batch:0},{proc:"沖壓",rate:3,batch:60},{proc:"包裝",rate:4,batch:0}]},
      {id:"p2",name:"支架",steps:[{proc:"裁切",rate:1.5,batch:0},{proc:"焊接",rate:1,batch:0},{proc:"包裝",rate:4,batch:0}]},
      {id:"p3",name:"底座",steps:[{proc:"沖壓",rate:2,batch:0},{proc:"焊接",rate:1.5,batch:0},{proc:"包裝",rate:3,batch:0}]}],
    orders:[]};
  const W=workdaysFrom(todayStr(),8);
  S.employees[4].leaves=[W[2]];
  S.orders=[
    {id:"o1",code:"A01",pid:"p1",qty:120,due:W[1],pri:1},
    {id:"o2",code:"B02",pid:"p2",qty:180,due:W[2],pri:1},
    {id:"o3",code:"C03",pid:"p3",qty:240,due:W[3],pri:2},
    {id:"o4",code:"A04",pid:"p1",qty:400,due:W[4],pri:2},
    {id:"o5",code:"B05",pid:"p2",qty:90,due:W[5],pri:3},
    {id:"o6",code:"C06",pid:"p3",qty:150,due:W[6],pri:3}];
  const fails=autoPlan(nowAbs());
  S.log.unshift({id:uid(),t:Date.now(),kind:"auto",title:"系統自動排好 "+S.orders.length+" 張工單",lines:fails.map(f=>({k:"fail",t:f}))});
}

/* ===== 4. 變更與復原（實際寫入由資料層 STORE 負責，見第 12 節） ===== */
function pushUndo(){undoStack.push(JSON.stringify(S));if(undoStack.length>40)undoStack.shift();}
function commit(entry,permission="schedule.manage"){
  if(entry){entry.id=uid();entry.t=Date.now();S.log.unshift(entry);if(S.log.length>200)S.log.length=200;}
  render();
  return canPermission(permission)?queueSync(entry):Promise.resolve(false);
}
function undo(){
  if(!undoStack.length){toast("沒有可以復原的動作");return;}
  S=JSON.parse(undoStack.pop());commit({kind:"edit",title:"復原上一步",lines:[]});toast("已復原上一步");
}
/* ===== 5. 排程引擎 ===== */
// 某人達到同時顧機台上限的時段；每段工作對應一台機台。
function capacityIntervals(ds,E,ex=new Set(),over=0){
  return occupiedCapacityIntervals([...S.blocks,...occupiedWork(S)],ds,E,ex,over);
}
// 某日某機台＋某人的忙碌時段（含機台故障）
function busyFor(ds,mid,eid,ex){
  const iv=[];
  for(const b of S.blocks){if(b.date!==ds||ex.has(b.id))continue;if(b.m===mid)iv.push([b.s,b.e]);}
  for(const a of assignments(S))if(a.date===ds&&a.resourceId===mid)iv.push([a.s,a.e]);
  iv.push(...capacityIntervals(ds,emp(eid),ex));
  const M=mach(mid);if(M)for(const f of M.faults)if(f.date===ds)iv.push([f.s,f.e]);
  return mergeIv(iv);
}
// 某日可用的空檔
function freeSegs(ds,mid,E,fromMin,ex){
  if(E.leaves.includes(ds))return [];
  const di=dayInfo(ds),busy=busyFor(ds,mid,E.id,ex),out=[];
  for(const w of di.win){
    if(w.ot&&!overtimeAllowed(E,ds))continue;
    const s0=Math.max(w.s,fromMin),e=w.e;if(s0>=e)continue;
    let cur=s0;
    for(const [bs,be] of busy){if(be<=cur||bs>=e)continue;if(bs>cur)out.push([cur,bs]);cur=Math.max(cur,be);if(cur>=e)break;}
    if(cur<e)out.push([cur,e]);
  }
  return out;
}
// 模擬：從 fromAbs 開始，這台機器＋這個人要花 dur 分鐘，會切成哪些段
function simulate(mid,E,fromAbs,dur,ex){
  let need=dur;const segs=[];
  const d0=dateOfAbs(fromAbs),m0=Math.ceil((fromAbs-dayNum(d0)*1440)/10)*10;
  for(let i=0;i<HORIZON&&need>0;i++){
    const ds=addDays(d0,i);
    for(const [s,e] of freeSegs(ds,mid,E,i===0?m0:0,ex)){
      const len=e-s;if(len<30&&len<need)continue;       // 太碎的空檔不排
      const take=Math.min(need,len);segs.push({date:ds,s,e:s+take});need-=take;if(need<=0)break;
    }
  }
  if(need>0)return null;
  const L=segs[segs.length-1];
  return {segs,start:absOf(segs[0].date,segs[0].s),end:absOf(L.date,L.e)};
}
function pairsFor(pid,k){
  const st=prod(pid).steps[k],out=[];
  for(const M of S.machines){if(M.proc!==st.proc||!M.products.includes(pid)||factoryOf(M)!==factoryOf(st))continue;
    for(const E of S.employees)if(compatible(E,M,prod(pid),st))out.push([M,E]);}
  return out;
}
function durOf(qty,rate){return Math.max(10,Math.ceil(qty/rate/10)*10);}
function manualQty(oid,step,minutes,exceptId=null){
  const o=order(oid),p=o&&prod(o.pid),st=p&&p.steps[step];
  return o&&st?quantityForMinutes(minutes,st.rate,remainingQty(o.qty,S.blocks,oid,step,exceptId,S.execution||[])):0;
}
// 前站做到可以開始本站的時間（標準工序：前站完成 batch 件才能開始）
function readyAbs(oid,k,ex=new Set()){
  if(k===0)return 0;
  const o=order(oid),st=prod(o.pid).steps[k];
  return batchReadyMinute(o.qty,st.batch,S.blocks,oid,k,absOf,ex,S.execution||[]);
}
function prevEndAbs(oid,k){
  if(k===0)return 0;
  const prev=S.blocks.filter(b=>b.oid===oid&&b.step===k-1);
  return prev.length?Math.max(...prev.map(bEnd)):0;
}
// 找最早完成的「機台＋人」組合，回傳新的時段方塊
function placeJob(oid,k,qty,fromAbs,opt={}){
  const o=order(oid),st=prod(o.pid).steps[k],dur=durOf(qty,st.rate),ex=opt.ex||new Set();
  const tail=durOf(Math.min(st.batch||qty,qty),st.rate);
  const pe=prevEndAbs(oid,k);
  let best=null;
  for(const [M,E] of pairsFor(o.pid,k)){
    if(opt.onlyM&&M.id!==opt.onlyM)continue;
    let from=fromAbs,r=null;
    for(let t=0;t<4;t++){                       // 下站不能比前站先做完
      r=simulate(M.id,E,from,dur,ex);if(!r)break;
      if(k===0||st.batch<=0||r.end>=pe+tail)break;
      from=r.start+(pe+tail-r.end);
    }
    if(!r)continue;
    const load=sum(S.blocks.filter(b=>b.emp===E.id&&b.date===r.segs[0].date),b=>b.e-b.s);
    const sc=[r.end,r.segs.length,opt.prefer&&opt.prefer.emp===E.id?0:1,opt.prefer&&opt.prefer.m===M.id?0:1,load];
    if(!best||cmp(sc,best.sc)<0)best={...r,m:M.id,emp:E.id,sc};
  }
  if(!best)return null;
  let left=qty;
  return best.segs.map((g,i)=>{
    const q=i===best.segs.length-1?left:Math.min(left,Math.round((g.e-g.s)*st.rate));left-=q;
    return {id:uid(),oid,step:k,m:best.m,emp:best.emp,date:g.date,s:g.s,e:g.e,qty:q,pin:false};
  }).filter(b=>b.qty>0);
}
function cmp(a,b){for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;}

// 全部重排：保留已過去與「釘選」的方塊，其餘依優先順序→交期重新安排
function autoPlan(fromAbs,seq){
  S.blocks=S.blocks.filter(b=>b.pin||bAbs(b)<fromAbs);
  const fails=[];
  const list=seq?seq.map(order).filter(Boolean):[...S.orders].sort((a,b)=>a.pri-b.pri||a.due.localeCompare(b.due));
  for(const o of list){
    const p=prod(o.pid);
    for(let k=0;k<p.steps.length;k++){
      const rem=o.qty-sum(S.blocks.filter(b=>b.oid===o.id&&b.step===k),b=>effectiveBlockQty(b,S.execution||[]));
      if(rem<=0)continue;
      const from=Math.max(fromAbs,readyAbs(o.id,k));
      if(!isFinite(from)){fails.push(o.code+" "+p.steps[k].proc+"：前站沒排好");break;}
      const nb=placeJob(o.id,k,rem,from);
      if(!nb){fails.push(o.code+" "+p.steps[k].proc+"：沒有可用的機台或人員");break;}
      S.blocks.push(...nb);
    }
  }
  return fails;
}
// 只重排一張工單
function planOrder(oid,fromAbs){
  S.blocks=S.blocks.filter(b=>b.oid!==oid||b.pin||bAbs(b)<fromAbs);
  const o=order(oid),p=prod(o.pid),fails=[];
  for(let k=0;k<p.steps.length;k++){
    const rem=o.qty-sum(S.blocks.filter(b=>b.oid===oid&&b.step===k),b=>effectiveBlockQty(b,S.execution||[]));if(rem<=0)continue;
    const from=Math.max(fromAbs,readyAbs(oid,k));
    const nb=isFinite(from)?placeJob(oid,k,rem,from):null;
    if(!nb){fails.push(o.code+" "+p.steps[k].proc+"：排不進去");break;}
    S.blocks.push(...nb);
  }
  return fails;
}

/* ----- 局部調整（請假、故障、取消加班時使用；盡量不動其他天） ----- */
function slotFree(ds,mid,E,s,e,exId){
  if(!E||E.leaves.includes(ds))return false;
  const di=dayInfo(ds);
  const w=di.win.find(w=>s>=w.s&&e<=w.e);if(!w)return false;
  if(w.ot&&!overtimeAllowed(E,ds))return false;
  const M=mach(mid);if(M.faults.some(f=>f.date===ds&&f.s<e&&f.e>s))return false;
  if(S.blocks.some(b=>b.id!==exId&&b.date===ds&&b.m===mid&&b.s<e&&b.e>s))return false;
  if(assignments(S).some(a=>a.date===ds&&a.resourceId===mid&&a.s<e&&a.e>s))return false;
  return !capacityIntervals(ds,E,exId?new Set([exId]):new Set()).some(([bs,be])=>bs<e&&be>s);
}
function canDo(E,M,pid,k){const p=prod(pid);return compatible(E,M,p,p.steps[k]);}
function trySwap(b,mode){
  const o=order(b.oid);
  const tries=[];
  const sameM=mach(b.m);
  const E0=emp(b.emp);
  if(mode!=="fault")for(const E of S.employees)if(E.id!==b.emp&&canDo(E,sameM,o.pid,b.step))tries.push([sameM,E,"swap"]);
  for(const M of S.machines){if(M.id===b.m)continue;
    if(E0&&canDo(E0,M,o.pid,b.step))tries.push([M,E0,"mach"]);
    for(const E of S.employees)if(E.id!==b.emp&&canDo(E,M,o.pid,b.step))tries.push([M,E,"mach"]);}
  for(const [M,E,k] of tries){
    if(mode==="leave"&&E.id===b.emp)continue;
    if(slotFree(b.date,M.id,E,b.s,b.e,b.id))return {M,E,k};
  }
  return null;
}
function label(b){const o=order(b.oid);return o.code+" "+stepName(b)+" "+b.qty+"件";}
function splitAt(b,t){
  if(t<=b.s||t>=b.e)return null;
  const q1=Math.round(b.qty*(t-b.s)/(b.e-b.s));
  const nb={...b,id:uid(),s:t,qty:b.qty-q1};
  b.e=t;b.qty=q1;S.blocks.push(nb);return nb;
}
// affected：受影響方塊；mode：leave / fault / ot
function repair(affected,mode,quiet){
  const lines=[];
  affected.sort(byAbs);
  for(const b of affected){
    if(!S.blocks.includes(b))continue;
    const before=mdw(b.date)+" "+hm(b.s)+" "+b.m;
    const oldEmp=emp(b.emp)?emp(b.emp).name:"?";
    const sw=mode==="fix"&&!issuesOf(b).length?null:trySwap(b,mode);
    if(sw){
      const nm=sw.E.name;
      if(sw.k==="swap")lines.push({k:"swap",t:label(b)+"：改由 "+nm+" 做（"+oldEmp+" → "+nm+"）"});
      else lines.push({k:"mach",t:label(b)+"：搬到 "+sw.M.id+" 機台，"+nm+" 做，時間不變"});
      b.m=sw.M.id;b.emp=sw.E.id;b.pin=false;continue;
    }
    S.blocks=S.blocks.filter(x=>x!==b);
    let from=Math.max(mode==="fix"?nowAbs():bAbs(b),readyAbs(b.oid,b.step));
    if(!isFinite(from))from=bAbs(b);
    const nb=placeJob(b.oid,b.step,b.qty,from,{prefer:b});
    if(!nb){S.blocks.push(b);lines.push({k:"fail",t:label(b)+"：找不到空檔，請手動處理"});continue;}
    S.blocks.push(...nb);
    const f=nb[0],L=nb[nb.length-1];
    const same=L.date===b.date;
    lines.push({k:same?"delay":"push",t:label(b)+"："+before+" → "+(same?"":mdw(f.date)+" ")+hm(f.s)+" "+f.m+"（"+emp(f.emp).name+"）"+(nb.length>1?"，分 "+nb.length+" 段":"")+(same?"":"，順延")});
  }
  if(!quiet){cascade(lines);lateCheck(lines);}
  return lines;
}

/* ----- 順移：同一台機器上，後面的工作依序往後推（不會往前拉） ----- */
function reflow(mid,fromAbs,lines,movable,minimumStarts){
  const now=nowAbs(),lo=Math.min(fromAbs,now);
  const q=S.blocks.filter(b=>b.m===mid&&!b.pin&&bEnd(b)>fromAbs&&bAbs(b)>=lo&&(!movable||movable.has(b.id))).sort(byAbs);
  if(!q.length)return;
  S.blocks=S.blocks.filter(b=>!q.includes(b));
  let prev=-Infinity;
  for(const x of q){
    let from=Math.max(bAbs(x),prev,now,readyAbs(x.oid,x.step),minimumStarts?.get(x.id)||0);
    if(!isFinite(from))from=Math.max(bAbs(x),prev,now);
    let nb=placeJob(x.oid,x.step,x.qty,from,{onlyM:mid,prefer:x});
    if(!nb)nb=placeJob(x.oid,x.step,x.qty,from,{prefer:x});
    if(!nb){S.blocks.push(x);lines.push({k:"fail",t:label(x)+"：推不進去，請手動處理"});continue;}
    S.blocks.push(...nb);
    if(nb[0].m===mid)prev=Math.max(prev,...nb.map(bEnd));
    const f=nb[0],L=nb[nb.length-1];
    const same=nb.length===1&&f.date===x.date&&f.s===x.s&&f.m===x.m&&f.emp===x.emp;
    if(same){f.id=x.id;continue;}
    lines.push({k:L.date===x.date?"delay":"push",t:label(x)+"：往後推 "+md(x.date)+" "+hm(x.s)+" → "+(f.date!==x.date?mdw(f.date)+" ":"")+hm(f.s)+(f.m!==mid?" 改到 "+f.m+" 機台":"")+(nb.length>1?"（分 "+nb.length+" 段）":"")});
  }
}
// 比較兩張工單誰比較「大」：急件、期限早的優先
function outranks(a,b){return a.pri<b.pri||(a.pri===b.pri&&a.due<b.due);}
/* ----- 插單：這張工單優先，擋到的工作往後推 ----- */
function insertOrder(oid){
  const o=order(oid),now=nowAbs(),lines=[],p=prod(o.pid);
  S.blocks=S.blocks.filter(b=>b.oid!==oid||b.pin||bAbs(b)<now);
  const movable=new Set(S.blocks.filter(b=>b.oid!==oid&&!b.pin&&bAbs(b)>=now&&outranks(o,order(b.oid))).map(b=>b.id));
  for(let k=0;k<p.steps.length;k++){
    const rem=o.qty-sum(S.blocks.filter(b=>b.oid===oid&&b.step===k),b=>effectiveBlockQty(b,S.execution||[]));if(rem<=0)continue;
    const from=Math.max(now,readyAbs(oid,k));
    const nb=isFinite(from)?placeJob(oid,k,rem,from,{ex:movable}):null;
    if(!nb){lines.push({k:"fail",t:o.code+" "+p.steps[k].proc+"：排不進去"});break;}
    S.blocks.push(...nb);
  }
  const mine=S.blocks.filter(b=>b.oid===oid&&bAbs(b)>=now);
  // 同一個人在別台機器上撞時間 → 先試著換人
  const empConf=S.blocks.filter(x=>x.oid!==oid&&movable.has(x.id)&&mine.some(n=>n.emp===x.emp&&n.m!==x.m&&n.date===x.date&&n.s<x.e&&n.e>x.s)&&
    capacityIntervals(x.date,emp(x.emp),new Set(),1).some(([s,e])=>s<x.e&&e>x.s));
  for(const m of new Set(mine.map(b=>b.m)))reflow(m,Math.min(...mine.filter(b=>b.m===m).map(bAbs)),lines,movable);
  const still=empConf.filter(b=>S.blocks.includes(b));
  if(still.length)lines.push(...repair(still,"leave",true));
  cascade(lines);lateCheck(lines);
  return lines;
}

/* ----- 最佳化（開源排程常用做法）：派工規則 ＋ 模擬退火 -----
   1. 先用四種經典派工規則排出起始順序：優先級、交期最早（EDD）、工時最短（SPT）、寬裕比最小（CR）
   2. 再用模擬退火（Simulated Annealing）隨機交換／插入工單順序，
      每個順序都用「串列排程法」（逐張工單、逐站找最早的機台＋人）解碼成排程後評分
   評分：延誤時數（依急件加權）> 完工時間 > 跟原排程的差異（越少越穩定） */
const PRI_W=[8,4,2,1];
const keyB=b=>[b.oid,b.step,b.date,b.s,b.e,b.m,b.emp].join("|");
function workMin(o){const p=prod(o.pid);return p?sum(p.steps,s=>durOf(o.qty,s.rate)):0;}
function planCost(baseKeys,nFail){
  let late=0,comp=0;const now=nowAbs();
  for(const o of S.orders){const st=orderStatus(o),w=PRI_W[o.pri]||1;
    if(!st.fin){late+=24*w;continue;}
    late+=Math.max(0,st.fin-absOf(o.due,DAY1))/60*w;
    comp+=Math.max(0,st.fin-now)/60;}
  let chg=0;if(baseKeys)for(const b of S.blocks)if(!baseKeys.has(keyB(b)))chg++;
  return nFail*1e6+late*1000+comp+chg*2;
}
function optimizePlan(fromAbs,budget=700){
  const keep=JSON.stringify(S.blocks),baseKeys=new Set(S.blocks.map(keyB)),now=nowAbs();
  const decode=seq=>{S.blocks=JSON.parse(keep);const f=autoPlan(fromAbs,seq);return {cost:planCost(baseKeys,f.length),fails:f,blocks:S.blocks,seq};};
  const os=S.orders;
  const cr=o=>Math.max(1,(absOf(o.due,DAY1)-now)/60)/Math.max(1,workMin(o)/60);
  const seeds=[
    ["優先級",[...os].sort((a,b)=>a.pri-b.pri||a.due.localeCompare(b.due))],
    ["交期最早 EDD",[...os].sort((a,b)=>a.due.localeCompare(b.due)||a.pri-b.pri)],
    ["工時最短 SPT",[...os].sort((a,b)=>workMin(a)-workMin(b))],
    ["寬裕比最小 CR",[...os].sort((a,b)=>cr(a)-cr(b))]];
  let best=null,seed="";
  for(const [n,list] of seeds){const r=decode(list.map(o=>o.id));if(!best||r.cost<best.cost){best=r;seed=n;}}
  const first=best.cost;let cur=best,it=0;
  if(os.length>1){
    const t0=performance.now();let T=Math.max(50,first*0.02);
    while(performance.now()-t0<budget){
      it++;
      const q=[...cur.seq],i=Math.floor(Math.random()*q.length);let j=Math.floor(Math.random()*q.length);if(i===j)j=(j+1)%q.length;
      if(Math.random()<0.5)[q[i],q[j]]=[q[j],q[i]];else q.splice(j,0,q.splice(i,1)[0]);
      const r=decode(q);
      if(r.cost<cur.cost||Math.random()<Math.exp((cur.cost-r.cost)/T)){cur=r;if(r.cost<best.cost)best=r;}
      T*=0.96;
    }
  }
  S.blocks=best.blocks;
  return {fails:best.fails,iters:it,seed,better:best.cost<first,seq:best.seq};
}
function optLines(r){
  const l=r.fails.map(t=>({k:"fail",t}));
  l.push({k:"info",t:"最佳化：起始用「"+r.seed+"」規則，再用模擬退火試了 "+r.iters+" 種工單順序"+(r.better?"，找到更好的排法":"，起始排法已經是最好")+"。順序："+r.seq.map(id=>order(id).code).join(" → ")});
  lateCheck(l);return l;
}

/* ----- 方案比較：同一個狀況算出幾種排法，進入預覽讓老闆（或 AI）挑 ----- */
function withState(st,fn){const keep=S;S=st;try{return fn();}finally{S=keep;}}
function otMinutes(st){return withState(st,()=>sum(S.blocks,b=>Math.max(0,Math.min(b.e,DAY1)-Math.max(b.s,REG_END))));}
function measure(B,A,ev){
  const bk=new Set(B.blocks.map(keyB));
  const changed=A.blocks.filter(b=>b.oid!==ev.oid&&!bk.has(keyB(b)));
  const fin=st=>withState(st,()=>Object.fromEntries(S.orders.map(o=>[o.id,orderStatus(o)])));
  const fb=fin(B),fa=fin(A);
  const late=A.orders.filter(o=>["late","part","none"].includes(fa[o.id].k));
  const lateDays=sum(late,o=>fa[o.id].fd?Math.max(0,dayNum(fa[o.id].fd)-dayNum(o.due)):5);
  const shifts=A.orders.filter(o=>fa[o.id].fin&&fb[o.id]&&fb[o.id].fin&&fa[o.id].fin!==fb[o.id].fin).map(o=>({code:o.code,b:fb[o.id].fin,a:fa[o.id].fin}));
  const gainH=Math.round(sum(shifts,s=>Math.max(0,s.b-s.a))/6)/10;
  return {moved:changed.length,otherDays:changed.filter(b=>b.date!==ev.date).length,
    lateCodes:late.map(o=>o.code),lateDays,slipped:shifts.filter(s=>s.a>s.b).map(s=>s.code),shifts,gainH,
    otH:Math.round((otMinutes(A)-otMinutes(B))/6)/10,fa,fb};
}
function scoreOf(mt,kind){
  const base=mt.lateCodes.length*1000+mt.lateDays*100+mt.otH*6;
  return kind==="recover"||kind==="auto"?base-mt.gainH*5+mt.otherDays+mt.moved*0.5:base+mt.otherDays*3+mt.moved;
}
// applyEvent()：在目前的 S 上套用突發狀況，回傳 {date, mid, fromAbs, aff, mode, ...}
function buildPlans(applyEvent,strategies,kind){
  const base=JSON.stringify(S),B=JSON.parse(base),opts=[];let ev0=null;
  for(const st of strategies){
    S=JSON.parse(base);
    try{
      const ev=applyEvent();ev0=ev0||ev;
      if(st.when&&!st.when(ev))continue;
      const lines=st.run(ev)||[];
      const mt=measure(B,S,ev);
      opts.push({id:st.id,name:st.name,desc:typeof st.desc==="function"?st.desc(ev):st.desc,lines,mt,score:scoreOf(mt,kind),state:JSON.stringify(S)});
    }catch(err){console.error(err);}
  }
  S=JSON.parse(base);
  let best=null;for(const o of opts)if(!best||o.score<best.score)best=o;
  if(best)best.best=true;
  return {base,opts,ev:ev0||{}};
}
const STRAT_EVENT=[
  {id:"A",name:"少動為主",desc:"先換人、換機台，不行才找最近的空檔",run:ev=>repair(ev.aff,ev.mode)},
  {id:"B",name:"原機台順延",desc:"等機台修好，後面的工作依序往後推",when:ev=>!!ev.mid,run:ev=>{const l=[];reflow(ev.mid,ev.fromAbs,l);cascade(l);lateCheck(l);return l;}},
  {id:"C",name:"開加班補回",desc:ev=>mdw(ev.date)+" 開加班到 20:00，再少動調整",when:ev=>isOpen(ev.date)&&!S.dayOT[ev.date],run:ev=>{S.dayOT[ev.date]=true;return repair(ev.aff,ev.mode);}},
  {id:"D",name:"最佳化重排",desc:"派工規則＋模擬退火重排全部（固定的不動）",run:()=>optLines(optimizePlan(nowAbs()))}
];
const STRAT_ORDER=[
  {id:"A",name:"排進空檔",desc:"不動別人，找最早的空檔",run:ev=>{const l=planOrder(ev.oid,nowAbs()).map(t=>({k:"fail",t}));lateCheck(l);return l;}},
  {id:"B",name:"插單優先",desc:"這張先做，擋到的較不急工作往後推",run:ev=>insertOrder(ev.oid)},
  {id:"C",name:"插單＋加班",desc:"插單，並在期限前的上班日開加班",run:ev=>{const o=order(ev.oid);for(let d=todayStr();d<=o.due;d=addDays(d,1))if(isOpen(d))S.dayOT[d]=true;return insertOrder(ev.oid);}},
  {id:"D",name:"最佳化重排",desc:"把新工單放進去，全部重新找最好的順序",run:()=>optLines(optimizePlan(nowAbs()))}
];
/* ----- 機台恢復：怎麼把它加回排程 ----- */
const STRAT_RECOVER=[
  {id:"A",name:"搬回原位",desc:"因故障被移走的工作，原本時段還空著就搬回去",when:ev=>ev.orig.length>0,run:ev=>restoreOrig(ev)},
  {id:"B",name:"受影響工單往前補",desc:"只重排被故障影響的工單，讓它們盡量提早，其他不動",when:ev=>ev.oids.length>0,run:ev=>pullForward(ev)},
  {id:"C",name:"最佳化重排",desc:"派工規則＋模擬退火重排全部（固定的不動）",run:()=>optLines(optimizePlan(nowAbs()))},
  {id:"D",name:"維持現狀",desc:"排程不動，機台空出的時段留給新工單",run:ev=>[{k:"info",t:ev.mid+" 機台已恢復，排程不動"}]}
];
function restoreOrig(ev){
  const now=nowAbs(),lines=[],groups={};
  for(const o of ev.orig)(groups[o.oid+"|"+o.step]=groups[o.oid+"|"+o.step]||[]).push(o);
  const G=Object.keys(groups).map(k=>{const [oid,st]=k.split("|");return {oid,step:+st,orig:groups[k].filter(o=>absOf(o.date,o.s)>=now).sort((a,b)=>absOf(a.date,a.s)-absOf(b.date,b.s))};})
    .filter(g=>order(g.oid));
  // 先把這些工作目前的位置全部拿掉，再依工序順序放回原位
  for(const g of G){g.cur=S.blocks.filter(b=>b.oid===g.oid&&b.step===g.step&&!b.pin&&bAbs(b)>=now);g.qty=sum(g.cur,b=>b.qty);g.was=g.cur.length?Math.max(...g.cur.map(bEnd)):0;}
  S.blocks=S.blocks.filter(b=>!G.some(g=>g.cur.includes(b)));
  G.sort((a,b)=>a.step-b.step||(a.orig[0]?absOf(a.orig[0].date,a.orig[0].s):0)-(b.orig[0]?absOf(b.orig[0].date,b.orig[0].s):0));
  for(const g of G){
    if(!g.qty)continue;
    let qty=g.qty;const placed=[];
    for(const o of g.orig){
      if(qty<=0)break;
      const E=emp(o.emp);
      if(E&&absOf(o.date,o.s)>=readyAbs(g.oid,g.step)&&slotFree(o.date,o.m,E,o.s,o.e,null)){
        const q=Math.min(qty,o.qty),nb={id:uid(),oid:g.oid,step:g.step,m:o.m,emp:o.emp,date:o.date,s:o.s,e:o.e,qty:q,pin:false};
        S.blocks.push(nb);placed.push(nb);qty-=q;}
    }
    if(qty>0){
      let from=Math.max(now,readyAbs(g.oid,g.step));if(!isFinite(from))from=now;
      const nb=placeJob(g.oid,g.step,qty,from,{onlyM:ev.mid})||placeJob(g.oid,g.step,qty,from,{});
      if(!nb){S.blocks.push(...g.cur);lines.push({k:"fail",t:order(g.oid).code+" 排不回去，維持原樣"});continue;}
      S.blocks.push(...nb);placed.push(...nb);
    }
    const O=order(g.oid),af=Math.max(...placed.map(bEnd));
    lines.push({k:af<g.was?"early":"info",t:O.code+" "+prod(O.pid).steps[g.step].proc+"：搬回 "+placed.sort(byAbs).map(b=>md(b.date)+" "+hm(b.s)+" "+b.m).join("、")});
  }
  cascade(lines);lateCheck(lines);return lines;
}
function pullForward(ev){
  const now=nowAbs(),lines=[];
  const os=ev.oids.map(order).filter(Boolean).sort((a,b)=>a.pri-b.pri||a.due.localeCompare(b.due));
  const before=Object.fromEntries(os.map(o=>[o.id,orderStatus(o)]));
  S.blocks=S.blocks.filter(b=>!(ev.oids.includes(b.oid)&&!b.pin&&bAbs(b)>=now));
  for(const o of os){
    planOrder(o.id,now).forEach(t=>lines.push({k:"fail",t}));
    const a=orderStatus(o),b=before[o.id];
    if(a.fin&&b.fin&&a.fin!==b.fin)lines.push({k:a.fin<b.fin?"early":"delay",t:o.code+" 完成時間 "+mdw(b.fd)+" "+hm(b.fin%1440)+" → "+mdw(a.fd)+" "+hm(a.fin%1440)});
  }
  lateCheck(lines);return lines;
}
// 下游工序連動：前站延後，後站跟著往後
function cascade(lines){
  for(let guard=0;guard<30;guard++){
    let changed=false;
    for(const o of S.orders){
      const p=prod(o.pid);
      for(let k=1;k<p.steps.length;k++){
        const r=readyAbs(o.id,k);
        const bad=S.blocks.filter(b=>b.oid===o.id&&b.step===k&&!b.pin&&bAbs(b)<r);
        if(!bad.length||!isFinite(r))continue;
        const q=sum(bad,b=>b.qty);
        S.blocks=S.blocks.filter(x=>!bad.includes(x));
        const nb=placeJob(o.id,k,q,r,{prefer:bad[0]});
        if(!nb){S.blocks.push(...bad);lines.push({k:"fail",t:o.code+" "+p.steps[k].proc+"：後站排不進去"});continue;}
        S.blocks.push(...nb);changed=true;
        lines.push({k:"chain",t:o.code+" "+p.steps[k].proc+" "+q+"件：跟著前站延後 → "+mdw(nb[0].date)+" "+hm(nb[0].s)+" "+nb[0].m});
      }
    }
    if(!changed)break;
  }
}
function orderStatus(o){
  const p=prod(o.pid);if(!p)return {k:"none"};
  const last=p.steps.length-1;
  const bl=S.blocks.filter(b=>b.oid===o.id);
  if(!bl.length)return {k:"none"};
  const lb=bl.filter(b=>b.step===last);
  if(sum(lb,b=>effectiveBlockQty(b,S.execution||[]))<o.qty)return {k:"part"};
  const fin=Math.max(...lb.map(bEnd)),fd=dateOfAbs(fin);
  const done=sum(lb,b=>{const r=executionOf(S,b.id);return r?.status==='done'?r.qtyDone:0;})>=o.qty;
  return {k:done?"done":fd>o.due?"late":fin<=nowAbs()?"elapsed":"ok",fin,fd};
}
function lateCheck(lines){
  for(const o of S.orders){const st=orderStatus(o);
    if(st.k==="late")lines.push({k:"late",t:o.code+" 會延誤：預計 "+mdw(st.fd)+" 完成，期限 "+mdw(o.due)+"（可考慮開加班）"});}
}
// 檢查單一方塊的問題（顯示紅框）
function issuesOf(b,opt={}){
  const out=[],E=emp(b.emp),M=mach(b.m),o=order(b.oid);
  opt.push=0;
  if(!o||!M)return ["資料不完整"];
  const p=prod(o.pid),st=p.steps[b.step];
  if(!E)out.push("沒有指定人員");
  else{
    if(!E.skills.includes(M.id))out.push(E.name+" 不會操作 "+M.id+" 機台");
    if(factoryOf(E)!==factoryOf(M))out.push(E.name+" 與 "+M.id+" 不在同一廠");
    if(E.leaves.includes(b.date))out.push(E.name+" 這天請假");
  }
  if(M.proc!==st.proc||!M.products.includes(o.pid)||factoryOf(M)!==factoryOf(st))out.push(M.id+" 機台不能做「"+factoryName(st.factory)+" "+p.name+" "+st.proc+"」");
  if(M.faults.some(f=>f.date===b.date&&f.s<b.e&&f.e>b.s))out.push(M.id+" 機台這段時間故障");
  if(assignments(S).some(a=>a.date===b.date&&a.resourceId===b.m&&a.s<b.e&&a.e>b.s))out.push('設備／工位被一般工作占用');
  const di=dayInfo(b.date);
  const inWin=di.win.some(w=>b.s>=w.s&&b.e<=w.e);
  if(!inWin)out.push(di.open?"超出上班時間（午休或未開加班）":"這天停工");
  else if(E&&!overtimeAllowed(E,b.date)&&di.win.some(w=>w.ot&&b.s<w.e&&b.e>w.s))out.push(E.name+" 當日不可加班（假日出勤也不排）");
  for(const x of S.blocks){if(x===b||x.date!==b.date||x.s>=b.e||x.e<=b.s)continue;
    if(x.m===b.m){if(opt.pushOK&&!x.pin){opt.push++;continue;}out.push(x.pin?"和固定的 "+label(x)+" 重疊":"和 "+label(x)+" 撞同一台機器");break;}}
  if(E&&capacityIntervals(b.date,E,new Set([b.id])).some(([s,e])=>s<b.e&&e>b.s))
    out.push(E.name+" 同時顧機台超過上限 "+(E.maxMachines||1)+" 台");
  if(b.step>0){const r=readyAbs(b.oid,b.step);if(bAbs(b)<r)out.push("前站還沒完成交接批量（"+(isFinite(r)?mdw(dateOfAbs(r))+" "+hm(r%1440)+" 後才能做":"前站未排")+"）");
    if(materialFlowIssue(S.blocks,b.oid,b.step,absOf,S.execution||[]))out.push("前站累積產量不足，後站不能先做完這些件數");}
  return out;
}
/* ===== 6. 畫面 ===== */
const IC={
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/></svg>',
  save:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 3h11l5 5v13H3V3z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/></svg>'
};
const NAV_IC={
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M7 2.5v4M17 2.5v4M3 9h18M7.5 13h3v3h-3z"/></svg>',
  orders:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  people:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 5.5a3 3 0 0 1 0 5.5M17 14a5 5 0 0 1 3.5 4.8V20"/></svg>',
  output:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20V11h4v9M10 20V5h4v15M16 20v-7h4v7M3 20h18"/></svg>',
  notes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3h14v14l-4 4H5z"/><path d="M15 21v-4h4M8 8h8M8 12h8"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 4v6M8 14v6M16 14v6M16 4v6"/></svg>'
,worklog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3h14v18l-4-2-3 2-3-2-4 2z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>'};
const LOGIC={leave:"假",fault:"修",move:"移",auto:"排",ot:"加",edit:"改",save:"存"};
function hourPx(){return parseFloat(getComputedStyle(document.body).getPropertyValue("--hour"))||72;}

function render(){
  const sc=$(".scroller"),sl=sc?sc.scrollLeft:0,sy=window.scrollY;
  document.body.classList.toggle("tv",!!UI.tv);
  document.body.classList.toggle("pvmode",!!PV);
  document.body.classList.toggle("pv-sheet-collapsed",!!(PV&&PV.sheetCollapsed));
  document.body.classList.toggle("pagemode",!!UI.page);
  document.body.classList.toggle("has-app-nav",!PV);
  document.body.classList.toggle("drawer-open",!!UI.drawer&&!PV);
  let html;
  if(PV){
    // 預覽：上方是方案面板，下方排程表顯示「原本／調整後／對照」
    const o=pvOpt(),st=PV.mode==="orig"?PV.B:o.A,ctx=pvCtx(o),ro=readOnly;
    readOnly=true;
    try{html=withState(o.A,()=>topHTML()+'<main class="wrap">'+pvPanelHTML(o))+withState(st,()=>bannerHTML()+(UI.view==="day"?dayHTML(ctx):weekHTML(ctx))+generalBoardHTML())+"</main>";}
    finally{readOnly=ro;}
  }else html=topHTML()+appNavHTML()+'<main class="wrap">'+
    (UI.page==='shortage'?shortagePageHTML():UI.page==='transferflow'?transferFlowPageHTML():UI.page==='worklog'?workLogPageHTML():UI.page==='review'?reviewPageHTML():
      bannerHTML()+(UI.view==="day"?(UI.layout==='work'?workViewHTML():dayHTML()+generalBoardHTML()):weekHTML()+generalBoardHTML()))+'</main>'+drawerHTML();
  $("#app").innerHTML=html;
  const sc2=$(".scroller");if(sc2)sc2.scrollLeft=sl;
  window.scrollTo(0,sy);
  if(UI.modal)renderModal();
  if(UI.editCell){const el=$(".cellinp");if(el){el.focus();if(el.select)el.select();}}
  scheduleChat?.refresh();
}
function topHTML(){
  const d=UI.date,di=dayInfo(d);
  const wk=UI.view==="week";
  const ws=weekStart(d);
  const title=wk?md(ws)+" – "+md(addDays(ws,6)):mdw(d);
  const sub=wk?"第 "+isoWeek(ws)+" 週":dayLabel(d);
  return '<header class="top"><div class="top-in"><div class="top-main">'+
  '<div class="brand"><span class="brand-mark"><span></span></span>產線排程</div>'+
  '<div class="workspace-heading"><span class="workspace-glyph">'+NAV_IC.today+'</span><span><b>'+(UI.prefs.language==='en'?'Schedule':esc(tx('today'))+'排程')+'</b><small>'+(UI.prefs.language==='en'?'Machines × time':'機台 × 時間')+'</small></span></div>'+
  '<div class="seg factory-switch" role="group" aria-label="排程廠別">'+
  [[1,'1 廠'],[2,'2 廠'],['all','跨廠']].map(([v,t])=>'<button data-act="factory" data-v="'+v+'" aria-pressed="'+(UI.factory===v)+'">'+t+'</button>').join('')+'</div>'+
  '<div class="page-links">'+
  '<button class="btn pagelink shortage" data-act="page" data-v="shortage">欠缺品項</button>'+
  '<button class="btn pagelink transfer" data-act="page" data-v="transfer">給二廠／回一廠</button></div>'+
  '<div class="datenav"><button class="iconbtn" data-act="prev" aria-label="往前">‹</button>'+
  '<button class="datebox'+(!wk&&di.type!=="work"?" hol":"")+'" data-act="pick"><b class="num">'+esc(title)+'</b><small>'+esc(sub)+'</small></button>'+
  '<input type="date" id="datepick" value="'+d+'" style="position:absolute;opacity:0;width:1px;height:1px;pointer-events:none" tabindex="-1" aria-hidden="true">'+
  '<button class="iconbtn" data-act="next" aria-label="往後">›</button></div>'+
  (S.demo?'<span class="demo-chip">示範資料</span>':'')+(readOnly&&!PV?'<span class="ro-chip">排程唯讀</span>':'')+
  (S.setupPending?'<button class="btn primary verify-entry" data-act="catalog">初次核對資料</button>':'')+
  (UI.returnTo?'<button class="btn pagelink return-chip" data-act="page-return">↩ 返回'+(UI.returnTo.page==='shortage'?'欠缺品項':UI.returnTo.page==='worklog'?'工作紀錄':'給二廠／回一廠')+'</button>':'')+
  '<div class="top-status">'+syncChipHTML()+
  '<button class="btn" data-act="settings" title="'+esc(tx('settings'))+'">'+IC.user+'<span class="lbl">'+esc(STORE&&STORE.kind==="supabase"?(STORE.userName||"帳號"):"本機")+'</span></button></div></div></div></header>';
}

function appNavHTML(){
  const item=(page,label)=>'<button class="app-nav-item nav-'+page+'" data-act="drawer" data-v="'+page+'" aria-pressed="'+(UI.drawer===page)+'"><b>'+NAV_IC[page]+'</b><span>'+label+'</span></button>';
  const account=STORE&&STORE.kind==='supabase'?(STORE.userName||STORE.session?.user?.email||'帳號'):'本機模式';
  const role=ROLE_NAME[STORE?.role]||'本機管理者';
  const sync=SYNC.state==='busy'?'同步中':SYNC.state==='error'?'同步失敗':STORE?.kind==='supabase'?'雲端已同步':'存在這台電腦';
  return '<nav class="app-nav" aria-label="主要功能">'+
    '<div class="side-chrome" aria-hidden="true"><i></i><i></i><i></i><span>'+NAV_IC.more+'</span></div>'+
    '<div class="side-brand"><span class="brand-mark"><span></span></span><span><b>產線排程</b><small>工廠工作台</small></span></div>'+
    '<button class="side-profile" data-act="settings" aria-pressed="'+(UI.drawer==='settings')+'"><span class="side-avatar">'+esc(account.slice(0,1).toUpperCase())+'</span><span><b>'+esc(account)+'</b><small>'+esc(role)+'</small></span><i>›</i></button>'+
    '<span class="side-section">排程</span>'+
    '<button class="app-nav-item nav-today" data-act="today" aria-pressed="'+(!UI.drawer)+'"><b>'+NAV_IC.today+'</b><span>'+tx('today')+'</span></button>'+item('orders',tx('orders'))+
    '<span class="side-section">現場</span>'+item('people',tx('people'))+item('output',tx('output'))+item('worklog','工作紀錄')+item('notes',tx('notes'))+
    '<span class="side-section">系統</span>'+item('more',tx('more'))+
    '<div class="side-footer"><button class="side-health '+SYNC.state+'" data-act="sync"><i></i><span><b>系統連線</b><small>'+esc(sync)+'</small></span></button></div></nav>';
}
function isoWeek(ds){const d=parseD(ds);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil(((d-y)/864e5+1)/7);}
function bannerHTML(){
  const pending=S.setupPending?'<div class="banner pending"><span class="grow"><b>目前先核對資料，暫不排班。</b> 排程1023的員工與設備已匯入；技能、工作時間與工序尚待確認。可按「核對員工與設備」或查看「歷史班表」。</span></div>':"";
  if(UI.view!=="day")return pending;
  const d=UI.date,di=dayInfo(d),out=[pending];
  const name=di.type==="hol"?"國定假日："+di.hol:di.type==="sat"?"週六休息日":di.type==="sun"?"週日例假日":"";
  const openBtn=!canCalendar()?"":'<button class="btn admin '+(di.open?"ghost":"primary")+'" data-act="open">'+(di.open?"改為停工":"改為上班")+'</button>';
  if(!di.open)out.push('<div class="banner wk"><span class="grow">'+(name?esc(name)+"　":"")+'本日停工，不排工作</span>'+openBtn+'</div>');
  else if(di.special)out.push('<div class="banner hol"><span class="grow">'+esc(name)+'　有上班 · '+payNote(di)+'</span>'+openBtn+'</div>');
  if(di.ot)out.push('<div class="banner ot"><span class="grow">今天加班到 20:00 · '+shownEmployees().filter(e=>overtimeAllowed(e,d)&&!e.leaves.includes(d)).length+' 人可加班</span>'+(!canCalendar()?"":'<button class="btn ghost admin" data-act="ot">調整加班人員</button>')+'</div>');
  return out.join("");
}
function staffGroupFilterHTML(){
  return '<div class="field"><label for="staff-group-filter">員工分組（只篩選名冊，不隱藏機台排程）</label><select class="inp" id="staff-group-filter">'+
    [['all','全部分組'],['ungrouped','尚未分組'],...(S.groups||[]).map(g=>[g.id,(g.homeFactory?factoryName(g.homeFactory)+' · ':'跨廠 · ')+(g.department?g.department+' / ':'')+g.name])]
      .map(([id,name])=>'<option value="'+esc(id)+'"'+(UI.group===id?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></div>';
}
function cardsHTML(){
  const d=UI.date;
  const employees=shownEmployees(),machines=shownMachines(),orders=shownOrders();
  const onLeave=employees.filter(e=>e.leaves.includes(d));
  const emps=employees.map(e=>{
    const lv=e.leaves.includes(d);
    return '<button class="emp'+(lv?" off":"")+'" data-act="emp" data-id="'+e.id+'"><span class="sw" style="background:'+COLORS[e.color%COLORS.length]+'">'+esc(e.name.slice(0,1))+'</span>'+esc(e.name)+
      (e.sourceCode?'<span class="tag">'+esc(e.sourceCode)+'</span>':'')+
      (e.identityCandidates?.length?'<span class="tag warn">別名待核對</span>':'')+
      employeeGroups(S,e.id).map(x=>'<span class="tag '+(x.membership.reviewStatus==='pending'?'warn':'mute')+'">'+esc(x.group.name)+(x.membership.reviewStatus==='pending'?' · 待核對':'')+'</span>').join('')+
      (lv?'<span class="tag bad">請假</span>':'')+(e.reviewStatus==='pending'?'<span class="tag warn">待確認</span>':!overtimeAllowed(e,d)?'<span class="tag mute">今天不加班</span>':'')+'</button>';}).join("");
  const machs=machines.map(m=>{const down=m.faults.some(f=>f.date===d&&!f.fixed);
    return '<button class="mach catalog-mach'+(down?" down":"")+'" data-act="mach" data-id="'+m.id+'" aria-label="'+esc(m.id+" "+m.label)+'"><b>'+esc(m.label)+'</b><small>'+esc(m.id)+' · '+(m.reviewStatus==='pending'?"待確認":down?"故障":"正常")+'</small></button>';}).join("");
  const ords=[...orders].sort((a,b)=>a.due.localeCompare(b.due)||a.pri-b.pri);
  const orows=ords.slice(0,4).map(orderRow).join("");
  const lrows=S.log.slice(0,3).map(logRow).join("")||'<div class="empty">還沒有紀錄</div>';
  return '<section class="cards" aria-label="總覽">'+
  '<div class="card"><div class="card-h"><h2>員工</h2><span class="count">'+employees.length+' 人'+(onLeave.length?" · 今天 "+onLeave.length+" 人請假":"")+'</span>'+(canMaster()&&UI.factory!=="all"?'<button class="add" data-act="emp-new">＋新增</button>':"")+'</div>'+staffGroupFilterHTML()+'<div class="chips">'+(emps||'<div class="hint">此廠在此分組沒有員工；可切換廠別或選擇全部分組。</div>')+'</div></div>'+
  '<div class="card"><div class="card-h"><h2>設備／工位</h2><span class="count">'+(machines.some(m=>m.catalogGroup)?new Set(machines.map(m=>m.catalogGroup||m.id)).size+' 組 · '+machines.length+' 個位置':machines.length+(S.setupPending?' 個待確認欄位':' 項'))+'</span>'+(canMaster()&&UI.factory!=="all"?'<button class="add" data-act="mach-new">＋新增</button>':"")+'</div><div class="hint">要設定做什麼工作，請按「更多功能」→「設定工作內容」；純人工不需要假機台。</div><div class="chips">'+machs+'</div></div>'+
  '<div class="card"><div class="card-h"><h2>工單</h2><span class="count">'+orders.length+' 張</span>'+(canOrders()?'<button class="add" data-act="ord-new">＋新增</button>':"")+'</div><div class="olist">'+orows+'</div>'+
    '<div style="display:flex;gap:16px"><button class="more" data-act="orders">全部工單</button><button class="more" data-act="products">產品工序</button></div></div>'+
  '<div class="card"><div class="card-h"><h2>全廠紀錄</h2><span class="count">系統怎麼調整</span></div><div class="llist">'+lrows+'</div><button class="more" data-act="log">全部紀錄</button></div>'+
  '</section>';
}

const drawerTitle=page=>page==='settings'?tx('settings'):tx(page)||page;
function drawerHTML(){
  if(!UI.drawer)return '';
  const body=UI.drawer==='orders'?ordersDrawerHTML():UI.drawer==='people'?peopleDrawerHTML():UI.drawer==='output'?outputDrawerHTML():UI.drawer==='notes'?notesDrawerHTML():UI.drawer==='settings'?settingsDrawerHTML():moreDrawerHTML();
  const title=drawerTitle(UI.drawer);
  return '<aside class="ops-drawer" aria-label="'+esc(title)+'" tabindex="-1"><div class="ops-drawer-h"><span class="drawer-grip"></span><h2>'+esc(title)+'</h2><button class="iconbtn" data-act="drawer-close" aria-label="關閉">×</button></div><div class="ops-drawer-b">'+body+'</div></aside>';
}

function ordersDrawerHTML(){
  const summary=orderCounters([...shownOrders()].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.pri-b.pri),orderStatus,todayStr());
  const rows=summary.rows.map(({order:o,status,signal})=>{
    const p=prod(o.pid),selected=UI.focus?.type==='order'&&UI.focus.id===o.id;
    const reports=(S.execution||[]).filter(r=>S.blocks.some(b=>b.oid===o.id&&b.id===r.blockId));
    const phase=status.k==='done'?'已完成':reports.some(r=>r.status==='running')?'進行中':reports.length?'已有回報':'未做';
    const detail=signal==='gray'?'資料不足，暫不自動判斷':status.k==='done'?'實際件數已達工單量':status.k==='part'?'有未排或完工短少':status.k==='late'?'預計逾期':status.k==='elapsed'?'排定時間已過，待回報':'照目前排程可完成';
    return '<button class="order-card'+(selected?' selected':'')+'" data-act="focus-order" data-id="'+esc(o.id)+'"><i class="deadline '+signal+'"></i><span><b>'+esc(o.code)+'　'+esc(p?.name||'未設定產品')+' '+o.qty+'件</b><mark class="order-phase '+signal+'">'+phase+'</mark><small>'+esc(detail)+'</small>'+(o.note?'<small class="order-note">備註：'+esc(String(o.note).slice(0,40))+'</small>':'')+'</span><strong>'+esc(o.due?md(o.due):'—')+'</strong></button>';
  }).join('');
  return '<div class="drawer-metrics"><div><b>'+summary.unfinished+'</b><span>未完成</span></div><div class="bad"><b>'+summary.late+'</b><span>會晚</span></div><div class="warn"><b>'+summary.dueToday+'</b><span>今日要交</span></div></div>'+
    '<div class="traffic-legend"><span><i class="green"></i>準時</span><span><i class="yellow"></i>注意</span><span><i class="red"></i>會晚</span><span><i class="gray"></i>資料不足</span></div>'+
    '<div class="drawer-list">'+(rows||'<div class="drawer-empty">目前沒有工單</div>')+'</div>'+(canOrders()?'<button class="drawer-primary" data-act="ord-new">＋新增工單</button>':'');
}

function monthDates(ds){
  const d=parseD(ds),y=d.getUTCFullYear(),m=d.getUTCMonth(),first=new Date(Date.UTC(y,m,1)),offset=(first.getUTCDay()+6)%7,last=new Date(Date.UTC(y,m+1,0)).getUTCDate(),out=[];
  for(let i=0;i<offset;i++)out.push(null);for(let n=1;n<=last;n++)out.push(`${y}-${pad(m+1)}-${pad(n)}`);while(out.length%7)out.push(null);return out;
}
function peopleDrawerHTML(){
  const people=shownEmployees(),absent=people.filter(e=>e.leaves.includes(UI.date));
  let selected=emp(UI.focus?.type==='employee'?UI.focus.id:null);if(!selected||!people.some(e=>e.id===selected.id))selected=absent[0]||people[0]||null;
  const pending=(S.leaveRequests||[]).filter(x=>x.status==='pending'&&people.some(e=>e.id===x.employeeId)).sort((a,b)=>a.date.localeCompare(b.date));
  const weekdays='一二三四五六日'.split('').map(x=>'<span>'+x+'</span>').join('');
  const days=selected?monthDates(UI.date).map(d=>d?'<button class="calendar-day '+leaveState(S,selected.id,d)+'" data-act="person-day" data-id="'+esc(selected.id)+'" data-d="'+d+'"><b>'+Number(d.slice(-2))+'</b><i></i></button>':'<span class="calendar-day blank"></span>').join(''):'';
  const requests=pending.map(r=>'<article class="leave-request"><b>'+esc(emp(r.employeeId)?.name||'未設定人員')+'詢問 '+mdw(r.date)+' 請假</b><p>'+esc(r.note||'未填說明')+'</p><small>核准前不列入正式請假，也不會觸發重排。</small>'+(canIncidents()?'<div><button class="approve" data-act="leave-resolve" data-id="'+r.id+'" data-v="approved">准假</button><button class="deny" data-act="leave-resolve" data-id="'+r.id+'" data-v="rejected">駁回</button></div>':'')+'</article>').join('');
  return '<section class="absence-box"><b>今日缺席　'+absent.length+' 人</b><span>'+esc(absent.map(x=>x.name).join('、')||'無')+'</span></section>'+
    '<div class="people-pills">'+people.map(e=>'<button data-act="focus-person" data-id="'+e.id+'" aria-pressed="'+(selected?.id===e.id)+'">'+esc(e.name)+'</button>').join('')+'</div>'+
    '<div class="traffic-legend"><span><i class="green"></i>在班</span><span><i class="red"></i>請假</span><span><i class="yellow"></i>詢問中</span><span><i class="gray"></i>待確認</span></div>'+
    (selected?'<section class="people-calendar"><header><b>'+esc(selected.name)+'</b><span>'+UI.date.slice(0,7).replace('-',' 年 ')+' 月</span>'+(canIncidents()?'<button class="btn" data-act="person-month" data-id="'+esc(selected.id)+'">整月設定</button>':'')+'</header><div class="calendar-week">'+weekdays+'</div><div class="calendar-grid">'+days+'</div>'+(canIncidents()?'<div class="toggles cal-brush">'+'<button class="tg brush-leave'+(UI.leaveBrush==="leave"?" on":"")+'" data-act="cal-brush" data-v="leave" aria-pressed="'+(UI.leaveBrush==="leave")+'">休假</button><button class="tg brush-work'+(UI.leaveBrush==="work"?" on":"")+'" data-act="cal-brush" data-v="work" aria-pressed="'+(UI.leaveBrush==="work")+'">上班</button>'+'</div><div class="drawer-hint">'+(UI.leaveBrush?('已選「'+(UI.leaveBrush==="leave"?"休假":"上班")+'」：點日期直接套用'):'先選「上班」或「休假」，再點日期套用（或不選，點日期開小視窗）')+'</div>':'')+'</section>':'<div class="drawer-empty">此廠尚未設定人員</div>')+
    '<div class="drawer-section-title"><b>等待決定</b>'+(canIncidents()?'<button data-act="leave-request-new">＋新增詢問</button>':'')+'</div>'+(requests||'<div class="drawer-empty">沒有等待決定的請假</div>');
}

function outputDrawerHTML(){
  const machines=shownMachines(),data=productionSummary(S,UI.date,machines.map(x=>x.id));
  const rows=data.rows.map(r=>{const selected=UI.focus?.type==='machine'&&UI.focus.id===r.machine.id,ratio=r.planned?Math.min(100,r.actual/r.planned*100):0;
    return '<button class="output-row'+(selected?' selected':'')+'" data-act="focus-machine" data-id="'+r.machine.id+'"><span><b>'+esc(r.machine.id+' '+r.machine.label)+'</b><strong>計畫 '+r.planned+(r.hasReport?'｜回報 '+r.actual:'')+'</strong></span>'+(r.hasReport?'<i class="output-track"><u style="width:100%"></u><em style="width:'+ratio+'%"></em></i>':'<small>尚未回報</small>')+'</button>';}).join('');
  return '<section class="output-total"><b>'+data.planned+'</b><span>'+mdw(UI.date)+' 計畫總件數</span></section><div class="drawer-list">'+(rows||'<div class="drawer-empty">此廠沒有機台資料</div>')+'</div><div class="drawer-hint">藍色為現場實際回報；沒有回報時不以 0 或估算值代替。</div>';
}

function memoLabel(m){const E=emp(m.employeeId),M=mach(m.machineId);return [m.author||STORE.userName||'未署名',M&&M.label,E&&E.name].filter(Boolean).join('・');}
function notesDrawerHTML(){
  const memos=visibleMemos(S,factoryOf,UI.factory);
  return '<div class="memo-grid">'+memos.map(m=>'<article class="memo-card'+(m.pinned?' pinned':'')+'" data-act="focus-memo" data-id="'+m.id+'"><button class="memo-pin" data-act="memo-pin" data-id="'+m.id+'" aria-label="'+(m.pinned?'取消釘選':'釘選')+'">'+(m.pinned?'●':'○')+'</button><b>'+esc(memoLabel(m))+'</b><p>'+esc(m.text)+'</p><small>'+esc((m.createdAt||'').slice(0,16).replace('T',' '))+'</small></article>').join('')+'</div>'+(!memos.length?'<div class="drawer-empty">目前沒有備忘</div>':'')+(canPermission('notes.manage')?'<button class="drawer-primary" data-act="memo-new">＋新增備忘</button>':'');
}

function settingChoices(key,items){
  const current=key.split('.').reduce((v,k)=>v?.[k],UI.prefs);
  return '<div class="setting-choices">'+items.map(([v,label,sub])=>'<button data-act="setting-set" data-key="'+key+'" data-v="'+esc(v)+'" aria-pressed="'+(String(current)===String(v))+'"><b>'+esc(label)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</button>').join('')+'</div>';
}
function settingToggle(key,label,desc){
  const value=key.split('.').reduce((v,k)=>v?.[k],UI.prefs);
  return '<button class="setting-toggle" data-act="setting-toggle" data-key="'+key+'" aria-pressed="'+!!value+'"><span><b>'+esc(label)+'</b><small>'+esc(desc)+'</small></span><i></i></button>';
}
function settingsDrawerHTML(){
  const en=UI.prefs.language==='en',permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
  const name=STORE?.userName||'',email=STORE?.session?.user?.email||'',role=ROLE_NAME[STORE?.role]||'本機管理者';
  if(en)return '<div class="settings-intro"><b>Device settings</b><span>Changes preview immediately and are stored only on this device.</span></div>'+settingsSectionsHTML({en,name,email,role,permission});
  return '<div class="settings-intro"><b>這台裝置的顯示方式</b><span>調整後立即預覽；不會改動其他電腦或手機的班表顯示。</span></div>'+settingsSectionsHTML({en,name,email,role,permission});
}
function settingsSectionsHTML({en,name,email,role,permission}){
  const appearance='<section class="settings-section"><h3>'+(en?'Appearance':'外觀')+'</h3><label>'+(en?'Theme':'明暗')+'</label>'+settingChoices('theme',en?[["auto","System","Follow device"],["light","Light",""] ,["dark","Dark",""]]:[["auto","自動","跟著裝置"],["light","淺色",""] ,["dark","深色",""]])+
    '<label>'+(en?'Text and controls':'字體與按鈕大小')+'</label>'+settingChoices('scale',en?[[.85,'Small','85%'],[1,'Standard','100%'],[1.15,'Large','115%'],[1.3,'Extra large','130%']]:[[.85,'小','85%'],[1,'標準','100%'],[1.15,'大','115%'],[1.3,'特大','130%']])+
    '<label>'+(en?'Typeface':'字型')+'</label>'+settingChoices('font',en?[["standard","Standard","Noto Sans"],["clear","High legibility","Microsoft JhengHei"]]:[["standard","標準","思源黑體"],["clear","高辨識","微軟正黑體"]])+
    '<label>'+(en?'Page color':'頁面主色')+'</label>'+settingChoices('accent',en?[["blue","Blue",""],["green","Green",""],["purple","Purple",""],["orange","Orange",""]]:[["blue","深藍",""],["green","墨綠",""],["purple","紫色",""],["orange","橘色",""]])+'</section>';
  const notifications='<section class="settings-section"><h3>'+(en?'Notifications':'通知')+'</h3>'+settingToggle('notifications.schedule',en?'Schedule updates':'排程變更',en?'Notify when another user changes the schedule':'別人調整排程時提醒')+settingToggle('notifications.leave',en?'Leave decisions':'請假進度',en?'Notify when leave requests change':'請假詢問被新增或決定時提醒')+settingToggle('notifications.memo',en?'New notes':'新備忘',en?'Notify when a note is added or pinned':'新增或釘選備忘時提醒')+settingToggle('notifications.sound',en?'Sound':'提示音',en?'Play a short sound with an enabled alert':'有提醒時播放短提示音')+
    settingToggle('notifications.desktop',en?'System notifications':'系統通知',en?'Show an alert when this page is in the background':'頁面在背景時仍顯示通知')+
    '<div class="notification-permission '+permission+'"><span>'+(en?'Browser permission: ':'瀏覽器權限：')+(permission==='granted'?(en?'Allowed':'已允許'):permission==='denied'?(en?'Blocked — change it in browser settings':'已封鎖，需到瀏覽器設定開啟'):permission==='unsupported'?(en?'Not supported':'此瀏覽器不支援'):(en?'Not requested':'尚未詢問'))+'</span>'+(permission==='default'?'<button data-act="notification-permission">'+(en?'Allow':'允許系統通知')+'</button>':'')+'</div></section>';
  const profile='<section class="settings-section"><h3>'+(en?'Profile':'個人資料')+'</h3><div class="profile-card"><span class="profile-avatar">'+esc((name||email||'本').slice(0,1).toUpperCase())+'</span><div><b>'+esc(name||'未設定名稱')+'</b><small>'+esc(email||'本機模式')+' · '+esc(role)+'</small></div></div><label for="profile-display-name">'+(en?'Display name':'顯示名稱')+'</label><div class="setting-save-row"><input class="inp" id="profile-display-name" maxlength="60" value="'+esc(name)+'"><button data-act="profile-save">'+(en?'Save':'儲存')+'</button></div><button class="settings-link" data-act="account">'+(en?'Account, password and connection':'帳號、密碼與連線')+'</button></section>';
  const language='<section class="settings-section"><h3>'+(en?'Language and operation':'語言與操作')+'</h3><label>'+(en?'Interface language':'介面語言')+'</label>'+settingChoices('language',[["zh-TW","繁體中文",""],["en","English","Beta"]])+
    '<label>'+(en?'Table spacing':'班表間距')+'</label>'+settingChoices('density',en?[["comfortable","Comfortable",""],["compact","Compact",""]]:[["comfortable","舒適",""],["compact","緊密",""]])+
    '<label>'+(en?'Motion':'動畫')+'</label>'+settingChoices('motion',en?[["system","System",""],["reduce","Reduced",""]]:[["system","跟著裝置",""],["reduce","減少動畫",""]])+'</section>';
  const privacy='<section class="settings-section"><h3>'+(en?'Data and privacy':'資料與隱私')+'</h3><dl class="settings-kv"><dt>'+(en?'Schedule data':'排程資料')+'</dt><dd>'+(STORE.kind==='supabase'?(en?'Supabase cloud':'Supabase 雲端'):(en?'This browser':'這台瀏覽器'))+'</dd><dt>'+(en?'Device preferences':'裝置偏好')+'</dt><dd>'+(en?'Stored in this browser only':'只存在這台裝置')+'</dd><dt>'+(en?'Time zone':'時區')+'</dt><dd>Asia/Taipei</dd></dl><button class="settings-link danger-link" data-act="settings-reset">'+(en?'Restore default device settings':'恢復這台裝置的預設值')+'</button></section>';
  return appearance+notifications+profile+language+privacy;
}
function updateDeviceSetting(path,value){
  if(path==='scale')value=Number(value);
  UI.prefs=patchPreference(UI.prefs,path,value);persistPreferences();render();
}
function playAlertSound(){
  if(!UI.prefs.notifications.sound)return;
  try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=660;g.gain.setValueAtTime(.055,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.17);o.onended=()=>c.close();}catch{}
}
function showDeviceNotification(title){
  playAlertSound();
  if(UI.prefs.notifications.desktop&&document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
    try{new Notification('產線排程',{body:title,tag:'factory-scheduler-update'});}catch{}
  }
}
async function requestNotificationPermission(){
  if(typeof Notification==='undefined'){toast('這個瀏覽器不支援系統通知');return;}
  try{const result=await Notification.requestPermission();UI.prefs=patchPreference(UI.prefs,'notifications.desktop',result==='granted');persistPreferences();render();toast(result==='granted'?'已允許系統通知':'未允許系統通知');}
  catch{toast('無法開啟系統通知，請檢查瀏覽器設定');}
}
async function toggleDeviceSetting(button){
  const path=button.dataset.key,current=path.split('.').reduce((v,k)=>v?.[k],UI.prefs);
  if(path==='notifications.desktop'&&!current){
    if(typeof Notification==='undefined'){toast('這個瀏覽器不支援系統通知');return;}
    if(Notification.permission!=='granted'){await requestNotificationPermission();return;}
  }
  updateDeviceSetting(path,!current);
}
async function saveOwnProfile(button){
  const name=$('#profile-display-name')?.value.trim()||'';
  if(name.length<1||name.length>60){toast('顯示名稱需要 1–60 個字');return;}
  button.disabled=true;
  try{await STORE.updateProfile({displayName:name});STORE.userName=name;render();toast('個人資料已儲存');}
  catch(e){button.disabled=false;toast(e.message);}
}

function moreDrawerHTML(){
  const btn=(act,label,extra='')=>'<button class="more-action" data-act="'+act+'" '+extra+'>'+label+'</button>';
  // 名冊與工作資料待確認時，整段排程入口不出現（不只是停用）
  const schedGate=S.setupPending?"":btn('manual-add','＋手動排班',readOnly?'disabled':'')+btn('auto','⚡ 自動排班',readOnly?'disabled':'')+btn('incident','故障／請假',!canIncidents()?'disabled':'');
  return '<section class="more-group"><h3>班表</h3><div class="more-grid"><div class="seg" role="group" aria-label="檢視"><button data-act="view" data-v="day" aria-pressed="'+(UI.view==='day')+'">日班表</button><button data-act="view" data-v="week" aria-pressed="'+(UI.view==='week')+'">週班表</button></div><div class="seg" role="group" aria-label="查看方式"><button data-act="layout" data-v="resource" aria-pressed="'+(UI.layout==='resource')+'">按設備</button><button data-act="layout" data-v="work" aria-pressed="'+(UI.layout==='work')+'">按工作</button></div>'+schedGate+btn('undo','復原上一步',readOnly||!undoStack.length?'disabled':'')+'</div></section>'+
    '<section class="more-group"><h3>工作與人員</h3><div class="more-grid">'+btn('work-queue','未排工作')+btn('execution','現場回報')+btn('resource-load','當日負荷')+btn('rosters','輪班表')+btn('work-contents','工作內容')+btn('transfers','跨廠加工')+btn('rush','欠缺品項')+btn('groups','員工分組')+(canScenarios()?btn('scenarios','試排情境'):'')+'</div></section>'+
    '<section class="more-group"><h3>資料與設定</h3><div class="more-grid">'+btn('settings','⚙ 設定')+btn('catalog','員工、設備與工單')+(canArchive()?btn('history','歷史班表'):'')+btn('export','匯出／匯入 Excel')+btn('log','全部紀錄')+btn('tv',UI.tv?'管理模式':'大螢幕')+btn('help','操作說明')+'</div></section>';
}
function statusTag(o){
  const st=orderStatus(o);
  return st.k==="late"?'<span class="tag bad">會延誤</span>':st.k==="ok"?'<span class="tag ok">預計準時</span>':st.k==="done"?'<span class="tag mute">已回報完成</span>':st.k==='elapsed'?'<span class="tag warn">預定時段已過 · 待回報</span>':'<span class="tag warn">未排</span>';
}
const priTag=o=>o.pri===0?'<span class="tag bad">特急</span> ':o.pri===1?'<span class="tag warn">急</span> ':"";
function orderRow(o){const p=prod(o.pid),route=orderRoute(o,S.products).map(factoryName).join(' → ');
  return '<button class="orow" data-act="ord" data-id="'+o.id+'"><span class="code">'+esc(o.code)+'</span><span class="meta">'+priTag(o)+esc(p?p.name:"?")+' '+o.qty+'件 · '+esc(route)+' · 期限 '+md(o.due)+(o.note?' · 備註：'+esc(String(o.note).slice(0,20)):'')+'</span>'+statusTag(o)+'</button>';}
function logRow(l){const dt=new Date(l.t);
  return '<button class="lrow" data-act="logone" data-id="'+l.id+'"><span class="ic '+l.kind+'">'+(LOGIC[l.kind]||"・")+'</span><span class="tx">'+esc(l.title)+'<small>'+(dt.getMonth()+1)+"/"+dt.getDate()+" "+pad(dt.getHours())+":"+pad(dt.getMinutes())+(l.lines&&l.lines.length?" · "+l.lines.length+" 項調整":"")+'</small></span></button>';}

/* ----- 日檢視：像 Excel 的時間 × 機台表 ----- */
function dayHTML(ctx={}){
  const d=UI.date,di=dayInfo(d),H=hourPx(),px=m=>(m-DAY0)/60*H;
  const mk=b=>{if(!ctx.mark||!ctx.mark.has(keyB(b)))return "";return typeof ctx.markCls==="function"?ctx.markCls(b):ctx.markCls;};
  const ms=shownMachines();
  const blocks=S.blocks.filter(b=>b.date===d&&ms.some(m=>m.id===b.m));
  let nBad=0;
  const cols=ms.map(M=>{
    let z="";
    if(!di.open)z+='<div class="zone off" style="top:0;height:'+px(DAY1)+'px">停工</div>';
    else{
      z+='<div class="zone lunch" style="top:'+px(LUNCH_S)+'px;height:'+(H)+'px">午休</div>';
      z+='<div class="zone ot'+(di.ot?"":" closed")+'" style="top:'+px(REG_END)+'px;height:'+(px(DAY1)-px(REG_END))+'px">'+(di.ot?"加班":"未開加班")+'</div>';
    }
    for(const f of M.faults.filter(f=>f.date===d))z+='<div class="zone fault" style="top:'+px(f.s)+'px;height:'+(px(f.e)-px(f.s))+'px">故障 '+hm(f.s)+'–'+hm(f.e)+(f.fixed?"（已修復）":"")+(f.note?" "+esc(f.note):"")+'</div>';
    for(const f of (ctx.extraFaults||[]).filter(f=>f.m===M.id&&f.date===d))z+='<div class="zone fault" style="top:'+px(f.s)+'px;height:'+(px(f.e)-px(f.s))+'px;opacity:.75">將故障 '+hm(f.s)+'–'+hm(f.e)+'</div>';
    if(d===todayStr()){const n=nowMin();if(n>=DAY0&&n<=DAY1)z+='<div class="nowline" style="top:'+px(n)+'px"></div>';}
    const gh=(ctx.ghosts||[]).filter(g=>g.m===M.id&&g.date===d).map(g=>{const E=emp(g.emp),O=order(g.oid);
      return '<div class="gblk" style="top:'+(px(g.s)+1)+'px;height:'+(px(g.e)-px(g.s)-2)+'px;border-color:'+empColor(g.emp)+'"><span>原：'+esc((E?E.name:"")+" "+(O?O.code:"")+" "+stepName(g))+'</span></div>';}).join("");
    const bl=blocks.filter(b=>b.m===M.id).map(b=>{const bad=!ctx.pv&&issuesOf(b).length>0;if(bad)nBad++;return blkHTML(b,px,bad,mk(b));}).join("");
    return '<div class="col" data-m="'+M.id+'" style="height:'+px(DAY1)+'px">'+z+gh+bl+'</div>';
  }).join("");
  const heads=ms.map(M=>{const down=M.faults.some(f=>f.date===d&&!f.fixed);
    return '<button class="colhead'+(down?" down":"")+'" data-act="mach" data-id="'+M.id+'"><span class="L">'+esc(M.id)+'</span><span class="N">'+esc(M.label)+'<small>'+esc(M.proc)+'</small></span><span class="st tag '+(M.reviewStatus==='pending'?"warn":down?"bad":"ok")+'">'+(M.reviewStatus==='pending'?"待確認":down?"故障":"正常")+'</span></button>';}).join("");
  let times="";for(let m=DAY0;m<DAY1;m+=30)times+='<div class="'+(m%60?"half":"")+'">'+hm(m)+'</div>';
  const leave=shownEmployees().filter(e=>e.leaves.includes(d));
  const otBtn=!canCalendar()?"":(di.open?'<button class="btn admin" data-act="ot">'+(di.ot?'調整加班人員':'開加班到 20:00')+'</button>':"")+'<button class="btn admin" data-act="cal">上班日設定</button>';
  return '<section class="board" aria-label="排程表"><div class="board-h"><h2>'+esc(UI.factory==="all"?"跨廠":factoryName(UI.factory))+' · '+mdw(d)+(ctx.pv?(PV.mode==="orig"?" 原本的排程":PV.mode==="new"?" 調整後":" 對照"):" 排程")+'</h2>'+
    (leave.length?'<span class="tag bad" style="font-size:15px;padding:4px 10px">請假：'+esc(leave.map(e=>e.name).join("、"))+'</span>':"")+
    (nBad?'<button class="btn danger" data-act="issues">'+nBad+' 個問題</button>':(blocks.length?'<span class="tag ok" style="font-size:15px;padding:4px 10px">沒有衝突</span>':""))+
    '<div class="spacer"></div><div class="legend"><span><i style="background:var(--lunch)"></i>午休</span><span><i style="background:var(--ot)"></i>加班</span><span><i style="background:var(--bad-bg);border-color:var(--bad)"></i>故障</span><span>顏色 = 員工</span><span>上班日／加班開關目前兩廠共用</span>'+(readOnly||S.setupPending?"":"<span>拖動方塊可改時段，拉底邊可改工作長度</span>")+'</div>'+(readOnly||ctx.pv||S.setupPending?"":'<button class="btn primary" data-act="manual-add">＋手動排班</button>')+otBtn+'</div>'+
    (ms.length?'<div class="scroller"><div class="grid" style="grid-template-columns:64px repeat('+ms.length+',minmax(170px,1fr))">'+
    '<div class="corner"></div>'+heads+'<div class="times">'+times+'</div>'+cols+'</div></div>':
    '<div class="empty factory-empty">此廠尚未設定機台與員工；「歷史排程」是獨立的唯讀原表，不會自動變成正式排程。</div>')+
    (ms.length&&!blocks.length&&di.win.length?'<div class="empty">'+(S.setupPending?'名冊已匯入，工作仍待確認；原始安排可在「歷史排程」按日期查看。':'這天還沒有排程。可按「＋手動排班」安排未排入的工作，或使用「自動排程」。')+'</div>':"")+
    '</section>';
}
function blkHTML(b,px,bad,cls=""){
  const o=order(b.oid),E=emp(b.emp),h=px(b.e)-px(b.s);
  const short=h<52;
  const matched=!UI.focus||UI.focus.type==='order'&&b.oid===UI.focus.id||UI.focus.type==='employee'&&b.emp===UI.focus.id||UI.focus.type==='machine'&&b.m===UI.focus.id;
  return '<div class="blk'+(short?" short":"")+(bad?" bad":"")+(readOnly?" ro":"")+(cls?" "+cls:"")+(UI.focus?(matched?' ops-focus':' ops-dim'):'')+(recentManualMove===b.id?' just-applied':'')+'" data-bid="'+b.id+'" tabindex="0" role="button" aria-label="'+esc((E?E.name:"")+" "+label(b)+" "+hm(b.s)+"–"+hm(b.e))+'" title="'+esc(hm(b.s)+"–"+hm(b.e))+'" style="top:'+(px(b.s)+1)+'px;height:'+(h-2)+'px;background:'+empColor(b.emp)+'">'+
    '<div class="n">'+esc(E?E.name:"未指定")+'</div><div class="d">'+esc(o.code+" "+stepName(b)+" "+b.qty+"件")+'</div>'+(h>=58?'<div class="d num">'+hm(b.s)+"–"+hm(b.e)+'</div>':"")+
    '<div class="flag">'+(cls==="chg"?'<span class="chgf">變</span>':cls==="willchg"?'<span class="chgf">會動</span>':"")+(o.pri===0?'<span class="warn" title="特急">急</span>':"")+(executionOf(S,b.id)?'<span class="pin" title="已有現場回報，排程已鎖定">'+(executionOf(S,b.id).status==='done'?'完':'做')+'</span>':b.pin?'<span class="pin" title="手動固定">釘</span>':"")+(bad?'<span class="warn" title="有問題">!</span>':"")+'</div>'+((readOnly||executionOf(S,b.id))?'':'<div class="resize-handle" data-resize="end" title="拖曳調整結束時間" aria-hidden="true"></div>')+'</div>';
}

/* ----- 週檢視 ----- */
function weekHTML(ctx={}){
  const ws=weekStart(UI.date),days=[...Array(7)].map((_,i)=>addDays(ws,i)),T=todayStr();
  const dchg=ctx.pv?diffOf(pvOpt()).dates:{};
  const heads=days.map(d=>{const di=dayInfo(d);
    return '<button class="wh'+(di.type==="hol"?" hol":"")+(!di.open?" wk":"")+(d===T?" today":"")+'" data-act="goto" data-d="'+d+'"><b class="num">'+mdw(d)+'</b><small>'+esc(dayLabel(d))+(di.ot?" · 加班":"")+'</small>'+(dchg[d]?'<span class="tag warn">變動 '+dchg[d]+'</span>':"")+'</button>';}).join("");
  const barsOf=(list,top,h,markSet,faded)=>list.map(b=>{const E=emp(b.emp);const bad=!ctx.pv&&issuesOf(b).length>0;const mk=markSet&&markSet.has(keyB(b));
    return '<span class="wbar'+(bad?" bad":"")+(mk?" wmk":"")+(faded?" wfade":"")+'" style="top:'+top+'px;height:'+h+'px;left:'+((b.s-DAY0)/720*100)+'%;width:'+((b.e-b.s)/720*100)+'%;background:'+empColor(b.emp)+'">'+esc(E?E.name.slice(0,1):"?")+'</span>';}).join("");
  const rows=shownMachines().map(M=>{
    const cells=days.map(d=>{
      const di=dayInfo(d),bl=S.blocks.filter(b=>b.m===M.id&&b.date===d);
      let bars;
      if(ctx.lanes){
        const ob=PV.B.blocks.filter(b=>b.m===M.id&&b.date===d);
        bars='<span class="wlane" style="top:4px">原</span><span class="wlane" style="top:38px">新</span>'+barsOf(ob,4,26,diffOf(pvOpt()).goneKeys,true)+barsOf(bl,38,26,ctx.mark,false);
      }else bars=barsOf(bl,10,42,ctx.mark,false);
      const f=M.faults.filter(f=>f.date===d).map(f=>'<span class="wfault" style="left:'+((f.s-DAY0)/720*100)+'%;width:'+((f.e-f.s)/720*100)+'%"></span>').join("");
      const mins=sum(bl,b=>b.e-b.s);
      const changed=ctx.pv&&(bl.some(b=>ctx.mark&&ctx.mark.has(keyB(b)))||(ctx.lanes&&PV.B.blocks.some(b=>b.m===M.id&&b.date===d&&diffOf(pvOpt()).goneKeys.has(keyB(b)))));
      return '<button class="wcell'+(di.win.length?"":" off")+(changed?" wchg":"")+'" data-act="goto" data-d="'+d+'" aria-label="'+esc(M.id+" "+mdw(d))+'">'+bars+f+(mins&&!ctx.lanes?'<span class="wload">'+(mins/60).toFixed(1)+'h</span>':"")+'</button>';}).join("");
    return '<div class="wrow"><span class="L">'+esc(M.id)+'</span><small>'+esc(M.label)+'</small></div>'+cells;}).join("");
  const foot=days.map(d=>{const lv=shownEmployees().filter(e=>e.leaves.includes(d));
    return '<div class="wfoot">'+lv.map(e=>'<span class="tag bad">'+esc(e.name)+' 假</span>').join("")+'</div>';}).join("");
  return '<section class="board" aria-label="週排程"><div class="board-h"><h2>'+(ctx.lanes?"本週對照（上排原本、下排調整後）":"本週總覽")+'</h2><div class="spacer"></div><div class="legend"><span>點日期或格子看當天細節</span><span><i style="background:var(--bad)"></i>故障</span></div></div>'+
    '<div class="scroller"><div class="wgrid" style="grid-template-columns:150px repeat(7,minmax(130px,1fr))"><div class="corner" style="height:auto"></div>'+heads+rows+
    '<div class="wrow"><small>請假</small></div>'+foot+'</div></div></section>';
}
/* ===== 7. 拖曳（滑鼠與觸控都可以） ===== */
let drag=null;
document.addEventListener("pointerdown",e=>{
  const el=e.target.closest(".blk");if(!el||e.button>0||PV||el.closest('.gcol'))return;
  const b=S.blocks.find(x=>x.id===el.dataset.bid);if(!b)return;
  const r=el.getBoundingClientRect();
  drag={b,el,mode:e.target.closest("[data-resize]")?"resize":"move",x0:e.clientX,y0:e.clientY,offX:e.clientX-r.left,offY:e.clientY-r.top,w:r.width,h:r.height,started:false,target:null};
});
document.addEventListener("pointermove",e=>{
  if(!drag)return;
  if(!drag.started){
    if(readOnly||executionOf(S,drag.b.id)||Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<8)return;
    drag.started=true;drag.el.classList.add("dragging");
    if(drag.mode==="move"){
      const g=document.createElement("div");g.className="dragghost";g.innerHTML=drag.el.innerHTML;
      const Z=UI.zoom;
      g.style.cssText+="zoom:"+Z+";width:"+(drag.w/Z)+"px;height:"+(drag.h/Z)+"px;background:"+drag.el.style.background;
      document.body.appendChild(g);drag.ghost=g;
    }
  }
  e.preventDefault();
  if(drag.ghost){drag.ghost.style.left=((e.clientX-drag.offX)/UI.zoom)+"px";drag.ghost.style.top=((e.clientY-drag.offY)/UI.zoom)+"px";}
  if(e.clientY>innerHeight-70)window.scrollBy(0,18);else if(e.clientY<130)window.scrollBy(0,-18);
  const sc=$(".scroller");if(sc){const r=sc.getBoundingClientRect();if(e.clientX>r.right-50)sc.scrollLeft+=16;else if(e.clientX<r.left+80)sc.scrollLeft-=16;}
  const hit=document.elementFromPoint(e.clientX,e.clientY);
  const col=drag.mode==="resize"?drag.el.closest(".col"):hit&&hit.closest(".col");
  document.querySelectorAll(".drop").forEach(x=>x.remove());
  if(!col||!col.dataset.m){drag.target=null;return;}
  const H=hourPx(),b=drag.b,dur=b.e-b.s,cr=col.getBoundingClientRect();
  const Hv=cr.height/((DAY1-DAY0)/60);   // 螢幕上實際一小時的高度（含縮放）
  if(drag.mode==="resize"){
    const e2=Math.max(b.s+10,Math.min(DAY1,b.e+Math.round((e.clientY-drag.y0)/Hv*60/10)*10));
    const qty=manualQty(b.oid,b.step,e2-b.s,b.id);
    drag.target={m:b.m,s:b.s,e:e2,qty};
    const dz=document.createElement("div");dz.className="drop"+(qty?"":" no");
    dz.style.top=((b.s-DAY0)/60*H)+"px";dz.style.height=((e2-b.s)/60*H)+"px";
    dz.textContent=hm(b.s)+"–"+hm(e2)+" · 預計 "+qty+" 件";col.appendChild(dz);
    return;
  }
  let s=DAY0+Math.round((e.clientY-drag.offY-cr.top)/Hv*60/10)*10;
  s=Math.max(DAY0,Math.min(DAY1-dur,s));
  const t=tryIssues(b,col.dataset.m,s),probs=t.probs;
  drag.target={m:col.dataset.m,s,probs,push:t.push};
  const dz=document.createElement("div");dz.className="drop"+(probs.length?" no":t.push?" push":"");
  dz.style.top=((s-DAY0)/60*H)+"px";dz.style.height=(dur/60*H)+"px";dz.textContent=hm(s)+(probs.length?" 預覽問題":t.push?" 預覽順延":" 預覽");
  col.appendChild(dz);
},{passive:false});
function tryIssues(b,m,s){const o={m:b.m,s:b.s,e:b.e};b.m=m;b.e=s+(b.e-b.s);b.s=s;const opt={pushOK:true};const r=issuesOf(b,opt);Object.assign(b,o);return {probs:r,push:opt.push};}
function endDrag(){if(drag&&drag.ghost)drag.ghost.remove();document.querySelectorAll(".drop").forEach(x=>x.remove());if(drag&&drag.el)drag.el.classList.remove("dragging");}
function dragPreview(b,m,s,options={}){
  const base=JSON.stringify(S),before=JSON.parse(base),after=JSON.parse(base),lines=[],unpinned=[];
  const old=before.blocks.find(x=>x.id===b.id),isNew=!old;
  withState(after,()=>{
    let moved=S.blocks.find(x=>x.id===b.id);
    if(!moved){moved={...b};S.blocks.push(moved);}
    const dur=moved.e-moved.s;
    moved.m=m;moved.s=s;moved.e=options.end??s+dur;
    if(options.qty!==undefined)moved.qty=options.qty;
    moved.pin=true;
    const unpin=x=>{if(x.pin){unpinned.push({id:x.id,label:label(x)});x.pin=false;}};
    for(const x of S.blocks){
      if(x.id!==moved.id&&x.pin&&x.m===m&&x.date===moved.date&&x.s<moved.e&&x.e>moved.s){
        unpin(x);
      }
    }
    const minimumStarts=new Map(S.blocks.filter(x=>x.id!==moved.id&&x.m===m&&x.date===moved.date&&x.s<moved.e&&x.e>moved.s)
      .map(x=>[x.id,bEnd(moved)]));
    const directStarts=S.blocks.filter(x=>x.id!==moved.id&&x.m===m&&x.date===moved.date&&x.s<moved.e&&x.e>moved.s).map(bAbs);
    reflow(m,Math.min(bAbs(moved),...directStarts),lines,undefined,minimumStarts);
    // 手動固定的下站也可能因前站順延而失效。只處理這次受影響的工單，
    // 在預覽中揭露解除固定，並讓 cascade 找可用時段；不動無關的固定工作。
    const originalKeys=new Set(before.blocks.map(keyB));
    for(let guard=0;guard<20;guard++){
      const affected=new Set([moved.oid,...S.blocks.filter(x=>!originalKeys.has(keyB(x))).map(x=>x.oid)]);
      let released=false;
      for(const x of S.blocks){
        if(x.pin&&x.step>0&&affected.has(x.oid)&&bAbs(x)<readyAbs(x.oid,x.step)){
          unpin(x);released=true;
        }
      }
      const prior=S.blocks.map(keyB).join(";");
      cascade(lines);
      if(!released&&S.blocks.map(keyB).join(";")===prior)break;
    }
    lateCheck(lines);
  });
  const beforeIssues=withState(before,()=>new Map(before.blocks.map(x=>[x.id,issuesOf(x)])));
  const problems=withState(after,()=>after.blocks.flatMap(x=>{
    const original=before.blocks.find(y=>y.id===x.id),same=original&&JSON.stringify(original)===JSON.stringify(x);
    const oldSet=new Set(same?beforeIssues.get(x.id):[]);
    return issuesOf(x).filter(t=>!oldSet.has(t)).map(t=>label(x)+"："+t);
  }));
  const target=after.blocks.find(x=>x.id===b.id),o=order(b.oid);
  const requestedEnd=options.end??s+(b.e-b.s);
  const earliest=withState(before,()=>readyAbs(b.oid,b.step));
  const placement=placementConflicts({date:b.date,m,s,e:requestedEnd},target,earliest,absOf(b.date,s));
  if(placement.upstream){
    problems.push('前一道工序尚未備妥；'+o.code+' '+withState(before,()=>stepName(b))+
      (isFinite(earliest)?' 最早可於 '+mdw(dateOfAbs(earliest))+' '+hm(earliest%1440)+' 開始':' 的前站尚未排完')+
      '，不能移到 '+mdw(b.date)+' '+hm(s));
  }
  if(placement.shifted){
    problems.push('試排後無法保留指定的 '+m+' 機台 '+mdw(b.date)+' '+hm(s)+'–'+hm(requestedEnd)+'；原排程不會改動，請選其他時段');
  }
  if(target&&target.qty<1)problems.push("這段工作不足 1 件；請拉長時間或調整工序速率");
  if(o){const planned=sum(after.blocks.filter(x=>x.oid===b.oid&&x.step===b.step),x=>x.qty);
    if(planned>o.qty)problems.push(o.code+" 這道工序排了 "+planned+" 件，超過工單 "+o.qty+" 件");}
  if(target&&bAbs(target)<nowAbs())problems.push("不能把新工作排在已經過去的時間");
  problems.push(...lines.filter(x=>x.k==="fail").map(x=>x.t));
  const ops=[];
  for(const o of after.orders){
    const p=after.products.find(x=>x.id===o.pid);if(!p)continue;
    for(let step=0;step<p.steps.length;step++){
      const prev=before.blocks.filter(x=>x.oid===o.id&&x.step===step).sort(byAbs);
      const next=after.blocks.filter(x=>x.oid===o.id&&x.step===step).sort(byAbs);
      if(prev.map(keyB).join(";")!==next.map(keyB).join(";"))ops.push({oid:o.id,code:o.code,step:p.steps[step].proc,prev,next});
    }
  }
  const statuses=withState(after,()=>[...new Set(ops.map(x=>x.oid))].map(id=>{
    const o=order(id),st=orderStatus(o);
    return {code:o.code,due:o.due,status:st.k,finish:st.fd||null};
  }));
  const end=options.end??s+(b.e-b.s);
  const direct=before.blocks.filter(x=>x.id!==b.id&&x.m===m&&x.date===b.date&&x.s<end&&x.e>s);
  const remaining=o?remainingQty(o.qty,after.blocks,b.oid,b.step,null,after.execution||[]):0;
  return {base,after,lines,unpinned,problems:[...new Set(problems)],ops,statuses,direct,oldId:b.id,isNew,remaining,
    move:target&&{id:target.id,date:target.date,m:target.m,s:target.s,e:target.e},
    source:old?old.m+" "+mdw(old.date)+" "+hm(old.s)+"–"+hm(old.e):"未排入",
    target:m+" "+mdw(b.date)+" "+hm(s)+"–"+hm(end),
    movedLabel:withState(before,()=>label(b)),newQty:options.qty};
}
document.addEventListener("pointerup",()=>{
  if(!drag)return;const d=drag;
  if(!d.started){drag=null;openModal({t:"blk",id:d.b.id});return;}
  endDrag();drag=null;
  if(d.mode==="resize"){
    if(d.target&&d.target.e!==d.b.e)openModal({t:"drag-preview",proposal:dragPreview(d.b,d.b.m,d.b.s,{end:d.target.e,qty:d.target.qty})});
    return;
  }
  if(!d.target||(d.target.m===d.b.m&&d.target.s===d.b.s))return;
  openModal({t:"drag-preview",proposal:dragPreview(d.b,d.target.m,d.target.s)});
});
document.addEventListener("pointercancel",()=>{endDrag();drag=null;});
document.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&e.target.dataset?.cell){e.preventDefault();e.target.blur();return;}
  if(e.key==="Escape"&&UI.editCell){UI.editCell=null;render();return;}
  if(e.key==="Escape"&&UI.modal){closeModal();return;}
  if(e.key==="Escape"&&UI.drawer){UI.drawer=null;UI.focus=null;render();return;}
  if(e.key==="Tab"&&UI.modal){
    const modal=$("#modal-root .modal"),items=modalFocusable(modal);
    if(!modal||!items.length){e.preventDefault();modal?.focus();return;}
    const at=items.indexOf(document.activeElement);
    if(e.shiftKey&&at<=0){e.preventDefault();items.at(-1).focus();}
    else if(!e.shiftKey&&(at<0||at===items.length-1)){e.preventDefault();items[0].focus();}
  }
  const el=e.target.closest&&e.target.closest(".blk");
  if(el&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openModal({t:"blk",id:el.dataset.bid});}
});

/* ===== 8. 按鈕動作 ===== */
const PV_BLOCK=new Set(["transfers","tf-new","tf-detail","tf-edit","tf-save","tf-work","tf-batch","tf-batch-save","tf-flow","tf-flow-preview","tf-flow-apply","tf-plan","mach-products","work-contents","work-content-new","work-content-edit","general-add","general-edit","layout","work-queue","scenarios","execution","report-open","report-work","groups","group-edit","group-new","emp","emp-new","mach","mach-new","ord","ord-new","orders","products","cal","open","ot","issues","incident","auto","manual-add","undo","save"]);
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-act]");if(!a)return;
  const act=a.dataset.act,id=a.dataset.id;
  if(PV&&PV_BLOCK.has(act)){toast("預覽中：先按「套用」或「取消」");return;}
  if(act.startsWith('b-')&&executionOf(S,UI.modal?.id)){toast('已有現場回報，不能修改這段排程');return;}
  const step=UI.view==="week"?7:1;
  switch(act){
    case "prev":UI.date=addDays(UI.date,-step);render();break;
    case "next":UI.date=addDays(UI.date,step);render();break;
    case "today":UI.date=todayStr();UI.view='day';UI.drawer=null;UI.page=null;UI.focus=null;render();break;
    case "drawer":if(a.dataset.v==="worklog"){UI.page="worklog";UI.drawer=null;try{history.replaceState(null,"","?view=worklog");}catch{}render();window.scrollTo(0,0);flashReturnRow();break;}UI.drawer=UI.drawer===a.dataset.v?null:a.dataset.v;UI.page=null;UI.focus=null;render();requestAnimationFrame(()=>$('.ops-drawer')?.focus());break;
    case "settings":UI.drawer='settings';UI.page=null;UI.focus=null;render();requestAnimationFrame(()=>$('.ops-drawer')?.focus());break;
    case "drawer-close":UI.drawer=null;UI.focus=null;render();break;
    case "setting-set":updateDeviceSetting(a.dataset.key,a.dataset.v);break;
    case "setting-toggle":toggleDeviceSetting(a);break;
    case "notification-permission":requestNotificationPermission();break;
    case "profile-save":saveOwnProfile(a);break;
    case "settings-reset":UI.prefs=structuredClone(DEFAULT_PREFERENCES);persistPreferences();render();toast('已恢復這台裝置的預設設定');break;
    case "focus-order":UI.focus={type:'order',id};UI.drawer=null;render();requestAnimationFrame(()=>$('.board')?.scrollIntoView({behavior:'smooth',block:'start'}));break;
    case "focus-person":UI.focus={type:'employee',id};render();break;
    case "person-day":{
      if(!canIncidents()){toast('設定休假需要「故障與請假」權限；員工可從下方「＋新增詢問」提出');break;}
      if(UI.leaveBrush){applyPersonDay(a.dataset.id,a.dataset.d,UI.leaveBrush==="leave");break;}
      openModal({t:'person-day',id,d:a.dataset.d});break;}
    case "cal-brush":{if(!canIncidents())break;const v=a.dataset.v;UI.leaveBrush=UI.leaveBrush===v?null:v;render();if(UI.leaveBrush)toast("已選「"+(UI.leaveBrush==="leave"?"休假":"上班")+"」：可以直接連續點日曆上這個月要"+(UI.leaveBrush==="leave"?"休假":"上班")+"的日期，點完即存。再按一次按鈕結束。");break;}
case "person-month":{if(canIncidents())openModal({t:'person-month',id});break;}
    case "focus-machine":UI.focus={type:'machine',id};render();break;
    case "focus-memo":{const memo=(S.memos||[]).find(x=>x.id===id);UI.focus=memo?.machineId?{type:'machine',id:memo.machineId}:memo?.employeeId?{type:'employee',id:memo.employeeId}:null;render();break;}
    case "leave-request-new":if(canIncidents())openModal({t:'leave-request'});break;
    case "leave-resolve":resolveLeaveRequest(a);break;
    case "memo-new":if(canPermission('notes.manage'))openModal({t:'memo-edit'});break;
    case "memo-pin":toggleMemoPin(a);break;
    case "catalog":UI.page='review';UI.reviewStep ??= 1;UI.drawer=null;try{history.replaceState(null,"","?view=review");}catch{}render();window.scrollTo(0,0);break;
    case "pick":{const p=$("#datepick");try{p.showPicker();}catch(_){p.style.pointerEvents="auto";p.focus();p.click();}break;}
    case "view":UI.view=a.dataset.v;render();break;
    case "factory":{const v=a.dataset.v==="all"?"all":Number(a.dataset.v);setFactory(v);render();if(v==="all")openModal({t:'transfer-board'});break;}
    case "groups":openModal({t:'groups'});break;
    case 'layout':UI.layout=a.dataset.v;render();break;
    case 'work-contents':openModal({t:'work-contents'});break;
    case 'work-content-new':if(canWorkContents())openModal({t:'work-content-edit'});break;
    case 'work-content-edit':openModal({t:'work-content-edit',id});break;
    case 'general-add':if(!readOnly&&!S.setupPending)openModal({t:'general-edit'});break;
    case 'general-edit':openModal({t:'general-edit',id});break;
    case "resource-load":if(!PV)openModal({t:'resource-load'});break;
    case 'work-queue':openModal({t:'work-queue'});break;
    case 'rush':UI.page='shortage';UI.drawer=null;render();window.scrollTo(0,0);break;
    case "page":{if(PV){toast("預覽中：先按「用這套」或「取消」");break;}const map={board:null,shortage:"shortage",transfer:"transferflow",worklog:"worklog",review:"review"};UI.page=map[a.dataset.v]??null;UI.drawer=null;UI.focus=null;UI.editCell=null;UI.confirmRow=null;try{history.replaceState(null,"",UI.page?"?view="+(UI.page==="transferflow"?"transfer":UI.page):location.pathname);}catch{}if(UI.page==="transferflow"&&canPermission("transfers.manage")){const n=tfAutoArchive();if(n)UI.tfArchivedNote="本月已歸檔 "+n+" 筆";}
      render();window.scrollTo(0,0);if(UI.page)flashReturnRow();break;}
    case "page-return":{const p=UI.returnTo?.page||null;UI.returnTo=null;UI.page=p;try{history.replaceState(null,"",p?"?view="+(p==="transferflow"?"transfer":p):location.pathname);}catch{}render();window.scrollTo(0,0);if(p)flashReturnRow();break;}
    case "worklog":UI.page="worklog";UI.drawer=null;try{history.replaceState(null,"","?view=worklog");}catch{}render();window.scrollTo(0,0);flashReturnRow();break;
    case "cell-edit":{UI.editCell={table:a.dataset.cell,id:a.dataset.id,key:a.dataset.key};render();break;}
    case "col-add":customColAdd(a.dataset.v);break;
    case "rush-addrow":{
      if(!canPermission("rush.manage"))break;
      const row={id:uid(),f1:{shipDate:todayStr(),vendor:"",desc:"",shortQty:null,note:""},f2:{startDate:"",dueDate:"",itemProcess:"",desc:"",qty:null,note:""}};
      S.rushOrders.push(row);
      try{validateRush(S.rushOrders);}catch(e){S.rushOrders.pop();toast(e.message);break;}
      commit({kind:"edit",title:"欠缺品項加一列",lines:[]},"rush.manage");
      UI.editCell={table:"rush",id:row.id,key:"f1.vendor"};render();
      setTimeout(()=>{const el=$(".cellinp");el?.focus();},60);
      break;}
    case "rush-del":{
      if(!canPermission("rush.manage"))break;
      if(UI.confirmRow!=="del:"+a.dataset.id){UI.confirmRow="del:"+a.dataset.id;render();break;}
      UI.confirmRow=null;
      S.rushOrders=S.rushOrders.filter(r=>r.id!==a.dataset.id);
      commit({kind:"edit",title:"刪除欠缺品項一列",lines:[]},"rush.manage");
      toast("已刪除");break;}
    case "rush-goto":{
      const row=(S.rushOrders||[]).find(r=>r.id===a.dataset.id);
      const code=String(row?.f1?.desc||"").trim();
      const o=S.orders.find(x=>x.code===code);
      if(o){UI.returnTo={page:"shortage",rowId:row.id};UI.page=null;UI.focus={type:"order",id:o.id};try{history.replaceState(null,"",location.pathname);}catch{}render();window.scrollTo(0,0);toast("已高亮工單 "+code+"；要回去按上方「返回」");}
      else toast("找不到工單號 "+code+"；先在「工單」用這個品號建單，就能互跳");
      break;}
    case "tf-addrow":{
      if(!canPermission("transfers.manage"))break;
      let n=transferOrders(S).length+1,code="XF-"+String(n).padStart(3,"0");
      while(transferOrders(S).some(x=>x.code===code)){n++;code="XF-"+String(n).padStart(3,"0");}
      const row={id:uid(),code,itemCode:"（待填品號）",fromFactory:1,toFactory:2,returnFactory:1,totalQty:null,urgentQty:0,notified:todayStr(),expectedSend:null,due:null,urgentDue:null,seq:null,floor1:null,floor3:null,returned:false,workIds:[],status:"active",note:"",batches:[],events:[]};
      S.transferOrders.push(row);
      try{validateTransfers(S,{before:S});}catch(e){S.transferOrders.pop();toast(e.message);break;}
      commit({kind:"edit",title:"加工表加一列 "+code,lines:[]},"transfers.manage");
      UI.editCell={table:"tf",id:row.id,key:"itemCode"};render();
      setTimeout(()=>{const el=$(".cellinp");el?.focus();},60);
      break;}
    case "tf-del":{
      if(!canPermission("transfers.manage"))break;
      const o=transferOrders(S).find(x=>x.id===a.dataset.id);if(!o)break;
      if(o.batches.length||o.events.length){toast("這筆已有批次或流轉紀錄，不能刪；改為「取消」保留歷史");break;}
      if(UI.confirmRow!=="tfdel:"+o.id){UI.confirmRow="tfdel:"+o.id;render();break;}
      UI.confirmRow=null;o.status="cancelled";
      commit({kind:"edit",title:"取消加工單 "+o.code+"（保留紀錄）",lines:[]},"transfers.manage");
      toast("已取消（台帳不可刪，可勾「顯示已取消」再還原）");break;}
    case "tf-restore":{
      if(!canPermission("transfers.manage"))break;
      const o=transferOrders(S).find(x=>x.id===a.dataset.id);if(!o)break;
      o.status="active";
      commit({kind:"edit",title:"還原加工單 "+o.code,lines:[]},"transfers.manage");
      toast("已還原");break;}
    case "tf-showcancelled":{UI.tfShowCancelled=!UI.tfShowCancelled;render();break;}
    case "tf-archive":{
      if(!canPermission("transfers.manage"))break;
      const rows=transferOrders(S).filter(o=>o.returned&&!o.archived);
      if(!rows.length){toast("沒有可歸檔的列：完成只認「已回一廠」已勾");break;}
      for(const o of rows)o.archived=true;
      commit({kind:"edit",title:"歸檔已完成加工單 "+rows.length+" 筆",lines:[]},"transfers.manage");
      toast("已歸檔 "+rows.length+" 筆；可在「顯示已歸檔」查看或還原");break;}
    case "tf-unarchive":{
      if(!canPermission("transfers.manage"))break;
      const o=transferOrders(S).find(x=>x.id===a.dataset.id);if(!o)break;
      o.archived=false;
      commit({kind:"edit",title:"還原加工單 "+o.code,lines:[]},"transfers.manage");break;}
    case "rush-archive":{
      if(!canPermission("rush.manage"))break;
      const today=todayStr();
      const rows=(S.rushOrders||[]).filter(r=>!r.archived&&!shortageRowFlags(r).f2Empty&&r.f1?.shipDate&&r.f1.shipDate<today);
      if(!rows.length){toast("沒有可歸檔的列：右欄要已補且出貨日已過");break;}
      for(const r of rows)r.archived=true;
      commit({kind:"edit",title:"歸檔已補上的欠缺品項 "+rows.length+" 筆",lines:[]},"rush.manage");
      toast("已歸檔 "+rows.length+" 筆；可在「顯示已歸檔」查看或還原");break;}
    case "rush-unarchive":{
      if(!canPermission("rush.manage"))break;
      const r=(S.rushOrders||[]).find(x=>x.id===a.dataset.id);if(!r)break;
      r.archived=false;
      commit({kind:"edit",title:"還原欠缺品項一列",lines:[]},"rush.manage");break;}
    case "review-group":{UI.reviewGroup=a.dataset.v;render();break;}
    case "review-step":{UI.reviewStep=Math.max(1,Math.min(3,+a.dataset.v||1));render();window.scrollTo(0,0);break;}
    case "review-mark":{
      if(!canMaster())break;
      const kind=a.dataset.kind,id=a.dataset.id,ok=a.dataset.v==="ok";
      if(kind==="emp"){const E=emp(id);if(E){E.reviewStatus=ok?"confirmed":"pending";commit({kind:"edit",title:E.name+(ok?" 核對正確":"標記待確認"),lines:[]},"master.manage");}}
      else if(kind==="mach"){const M=mach(id);if(M){M.reviewStatus=ok?"confirmed":"pending";commit({kind:"edit",title:M.id+" "+M.label+(ok?" 核對正確":"標記待確認"),lines:[]},"master.manage");}}
      break;}
    case "review-done":{
      if(!canMaster())break;
      const pendE=S.employees.filter(e=>e.reviewStatus==="pending").length;
      const pendM=S.machines.filter(m=>m.reviewStatus==="pending").length;
      if(pendE||pendM){toast("還有 "+(pendE+pendM)+" 項未標「對」，不能完成核對");break;}
      closeModal();toast("核對結果已記錄；自動排班鎖定的解除需另行確認，此頁不會自動打開");
      UI.page=null;render();break;}
    case "wl-addrow":{
      if(!canPermission("worklog.manage"))break;
      const row={id:uid(),date:todayStr(),code:"",goodQty:null,badQty:null,startH:null,startM:null,endH:null,endM:null,reworkMin:null,worker:"",note:""};
      S.workLog.push(row);
      try{validateWorkLog(S.workLog);}catch(e){S.workLog.pop();toast(e.message);break;}
      commit({kind:"edit",title:"工作紀錄加一列",lines:[]},"worklog.manage");
      UI.editCell={table:"wl",id:row.id,key:"code"};render();
      setTimeout(()=>{const el=$(".cellinp");el?.focus();},60);
      break;}
    case "wl-del":{
      if(!canPermission("worklog.manage"))break;
      if(UI.confirmRow!=="wldel:"+a.dataset.id){UI.confirmRow="wldel:"+a.dataset.id;render();break;}
      UI.confirmRow=null;
      S.workLog=S.workLog.filter(r=>r.id!==a.dataset.id);
      commit({kind:"edit",title:"刪除工作紀錄一列",lines:[]},"worklog.manage");
      toast("已刪除");break;}
    case "wl-clearfilter":{UI.workLogDate="";render();break;}
    case "tf-goto":{
      const o=transferOrders(S).find(x=>x.id===a.dataset.id);if(!o)break;
      UI.returnTo={page:"transferflow",rowId:o.id};UI.page=null;try{history.replaceState(null,"",location.pathname);}catch{}
      const linked=(S.workAssignments||[]).filter(x=>x.transferBatchId&&o.batches.some(b=>b.id===x.transferBatchId));
      if(linked.length){
        const A=linked[0];
        UI.date=A.date;UI.view="day";
        UI.focus=A.resourceId?{type:"machine",id:A.resourceId}:{type:"employee",id:A.emp};
        render();window.scrollTo(0,0);
        toast("已跳到 "+mdw(A.date)+" 這筆的排程位置；要回去按上方「返回給二廠／回一廠」");
      }else{render();toast("這筆還沒排：沒有連結到任何排程工作，先到跨廠加工的批次「＋連結排班」");window.scrollTo(0,0);}
      break;}
    case 'queue-arrange':if(!readOnly&&!S.setupPending)openModal({t:'manual-add',choice:id+':'+a.dataset.step});break;
    case 'scenarios':openScenarioList();break;
    case 'scenario-view':viewScenario(id);break;
    case 'scenario-save':if(canScenarios())openModal({t:'scenario-save',base:structuredClone(PV?.B||S),candidate:structuredClone(PV?pvOpt().A:S),description:PV?.title||'目前排程',date:UI.date});break;
    case 'scenario-confirm':saveScenarioFromModal(a);break;
    case 'execution':openModal({t:'execution'});break;
    case 'report-open':openModal({t:'execution-report',id});break;
    case 'report-work':reportWork(a);break;
    case "group-edit":openModal({t:'staff-group',id});break;
    case "group-new":if(canGroups())openModal({t:'staff-group'});break;
    case "goto":UI.date=a.dataset.d;UI.view="day";render();window.scrollTo(0,0);break;
    case "tv":UI.tv=!UI.tv;render();break;
    case "theme":{setTheme(THEMES[(THEMES.indexOf(UI.theme)+1)%THEMES.length]);render();
      toast(UI.theme==="auto"?"跟著電腦的系統設定":UI.theme==="light"?"已切換為淺色":"已切換為深色");break;}
    case "zoom-":case "zoom+":case "zoom0":{
      let i=ZOOMS.indexOf(UI.zoom);if(i<0)i=ZOOMS.indexOf(1);
      i=act==="zoom0"?ZOOMS.indexOf(1):Math.max(0,Math.min(ZOOMS.length-1,i+(act==="zoom+"?1:-1)));
      setZoom(ZOOMS[i]);render();break;}
    case "auto":if(!readOnly)openModal({t:"auto"});break;
    case "manual-add":if(!readOnly&&!S.setupPending)openModal({t:"manual-add"});break;
    case "incident":if(canIncidents())openModal({t:"incident"});break;
    case "help":openModal({t:"help",sec:0});break;
    case "undo":undo();break;
    case "sync":if(SYNC.state==="error")queueSync(null);else toast(STORE.kind==="local"?"資料存在這台電腦的瀏覽器":"已和雲端資料庫同步");break;
    case "account":openModal({t:"account"});break;
    case "export":openModal({t:"export"});break;
    case "history":openLegacyHistory();break;
    case "ot":openModal({t:"ot",date:UI.date});break;
    case "open":if(canCalendar())toggleOpen(UI.date);break;
    case "cal":if(canCalendar())openModal({t:"cal"});break;
    case "emp":openModal({t:"emp",id});break;
    case "emp-new":openModal({t:"emp",id:null});break;
    case "mach":openModal({t:"mach",id});break;
    case "mach-new":openModal({t:"mach",id:null});break;
    case "ord":openModal({t:"ord",id});break;
    case "ord-new":if(canOrders())openModal({t:"ord",id:null});break;
    case "orders":openModal({t:"orders"});break;
    case "products":openModal({t:"products"});break;
    case "log":openModal({t:"log"});break;
    case "logone":openModal({t:"logone",id});break;
    case "issues":openModal({t:"issues"});break;
    case "close":closeModal();break;
    default:if(MODAL_ACT[act])MODAL_ACT[act](a,e);
  }
});
document.addEventListener("change",e=>{
  if(e.target.dataset?.cell){saveCellEdit(e.target);return;}
  if(e.target.dataset?.actChange==="tf-showcancelled"){UI.tfShowCancelled=e.target.checked;render();return;}
  if(e.target.dataset?.actChange==="tf-returned"){
    if(!canPermission("transfers.manage")){render();return;}
    const o=transferOrders(S).find(x=>x.id===e.target.dataset.id);
    if(o){o.returned=!!e.target.checked;
      try{validateTransfers(S,{before:S});}catch(err){o.returned=!o.returned;render();return;}
      commit({kind:"edit",title:(o.returned?"勾選":"取消")+"已回一廠 "+o.code,lines:[]},"transfers.manage");}
    return;}
  if(e.target.dataset?.actChange==="wl-filter"){UI.workLogDate=e.target.value;render();return;}
  if(e.target.dataset?.actChange==="tf-showarchived"){UI.tfShowArchived=e.target.checked;render();return;}
  if(e.target.dataset?.actChange==="rush-showarchived"){UI.shortageShowArchived=e.target.checked;render();return;}
  if(e.target.id==='tf-toFactory'&&UI.modal?.t==='transfer-edit'){syncInputs();UI.modal.draft.workIds=UI.modal.draft.workIds.filter(id=>workCatalog(S).some(w=>w.id===id&&w.factory===Number(e.target.value)));renderModal();return;}
  if(e.target.id?.startsWith('gw-')){generalChange(e.target);return;}
  if(e.target.id==='staff-group-filter'){UI.group=e.target.value;render();return;}
  if(e.target.id==="datepick"&&e.target.value){UI.date=e.target.value;render();}
  const D=UI.modal?.t==="manual-add"&&UI.modal.draft;
  if(D&&e.target.id?.startsWith("manual-")){
    const id=e.target.id;
    if(id==="manual-choice"){D.choice=e.target.value;D.machine="";D.employee="";}
    if(id==="manual-machine"){D.machine=e.target.value;D.employee="";}
    if(id==="manual-employee")D.employee=e.target.value;
    if(id==="manual-start"){D.s=+e.target.value;if(D.e<=D.s)D.e=Math.min(DAY1,D.s+10);}
    if(id==="manual-end"){D.e=+e.target.value;if(D.s>=D.e)D.s=Math.max(DAY0,D.e-10);}
    renderModal();
  }
});

// 單日改為上班／停工（國定假日、週末也可以上班）
function setOpen(d,open){
  const def=!!S.cal.week[parseD(d).getUTCDay()];
  if(open===def)delete S.cal.over[d];else S.cal.over[d]=open?"work":"off";
  if(!open)delete S.dayOT[d];
}
function closeDays(){  // 停工日上的工作移走
  const aff=S.blocks.filter(b=>futureOf(b)&&!isOpen(b.date));
  return {aff,lines:aff.length?repair(aff,"ot"):[]};
}
function toggleOpen(d){
  if(!canCalendar())return;
  const willOpen=!isOpen(d);
  if(!willOpen&&readOnly&&S.blocks.some(b=>b.date===d&&futureOf(b))){toast("這天已有排程；停工並順延工作還需要「調整與自動排程」權限");return;}
  pushUndo();
  const open=willOpen;setOpen(d,open);
  if(open){
    commit({kind:"ot",title:mdw(d)+" 改為上班",lines:[{k:"info",t:payNote(dayInfo(d))||"一般上班日"}].filter(l=>l.t)},"calendar.manage");
    toast(mdw(d)+" 改為上班。要把工作排進來嗎？","重新排程",runAuto);
  }else{
    const r=closeDays();
    commit({kind:"ot",title:mdw(d)+" 改為停工"+(r.aff.length?"，移走 "+r.aff.length+" 段工作":""),lines:r.lines},"calendar.manage");
    if(r.lines.length)showResult();else toast(mdw(d)+" 已改為停工");
  }
}
function saveDailyOT(m){
  if(!canCalendar())return;
  const d=m.date;
  const changed=!!S.dayOT[d]!==m.open||S.employees.some(e=>{
    const old=Object.prototype.hasOwnProperty.call(e.otOverrides||{},d)?!!e.otOverrides[d]:null;
    return old!==m.overrides[e.id];
  });
  if(!changed){closeModal();return;}
  const blocksInOvertime=S.blocks.filter(b=>b.date===d&&futureOf(b)&&b.e>REG_END);
  if(readOnly&&blocksInOvertime.some(b=>!m.open||!(m.overrides[b.emp]??overtimeDefault(emp(b.emp),d)))){
    toast("這天已有加班排程；縮短加班並順延工作還需要「調整與自動排程」權限");return;
  }
  pushUndo();
  if(m.open)S.dayOT[d]=true;else delete S.dayOT[d];
  for(const e of S.employees){
    e.otOverrides ||= {};
    if(m.overrides[e.id]===null)delete e.otOverrides[d];else e.otOverrides[d]=m.overrides[e.id];
  }
  const aff=S.blocks.filter(b=>{
    if(b.date!==d||!futureOf(b))return false;
    const w=dayInfo(d).win.find(w=>b.s>=w.s&&b.e<=w.e);
    const E=emp(b.emp);
    return !w||(w.ot&&(!E||!overtimeAllowed(E,d)));
  });
  const lines=aff.length?repair(aff,"ot"):[];
  commit({kind:"ot",title:mdw(d)+" 更新加班設定"+(aff.length?"，調整 "+aff.length+" 段工作":""),lines},"calendar.manage");
  if(lines.length)showResult();else{
    closeModal();toast("已儲存今天的加班設定"+(m.open?"，可加班 "+S.employees.filter(e=>overtimeAllowed(e,d)&&!e.leaves.includes(d)).length+" 人":""));
  }
}
/* ===== 9. 視窗（員工、機台、工單、方塊、紀錄…） ===== */
const MODAL_ACT={};
let modalReturnFocus=null;
function modalFocusable(root){
  if(!root)return [];
  return [...root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(el=>!el.hidden&&el.getClientRects().length);
}
function modalFocusToken(el){
  if(!el)return null;
  if(el.id)return {kind:"id",value:el.id};
  for(const key of ["bind","act"]){if(el.dataset?.[key])return {kind:key,value:el.dataset[key]};}
  return null;
}
function modalFocusFromToken(root,token){
  if(!root||!token)return null;
  if(token.kind==="id")return root.querySelector("#"+CSS.escape(token.value));
  return [...root.querySelectorAll("[data-"+token.kind+"]")].find(el=>el.dataset[token.kind]===token.value)||null;
}
function openModal(m){
  if(!UI.modal){
    const active=document.activeElement;
    modalReturnFocus=active instanceof HTMLElement&&active!==document.body?active:null;
  }
  UI.modal=m;renderModal();
}
function closeModal(){
  UI.modal=null;const r=$("#modal-root");if(r)r.innerHTML="";maybeReload();
  const target=modalReturnFocus;modalReturnFocus=null;
  requestAnimationFrame(()=>{if(target?.isConnected&&!target.matches?.(":disabled"))target.focus();});
}
async function openLegacyHistory(preferredId){
  openModal({t:"legacy-history",loading:true});
  try{
    const archives=await STORE.listLegacyArchives();
    const archive=archives.find(a=>a.id===preferredId)||archives[0]||null;
    const legacy=archive?await STORE.getLegacyArchive(archive.id):null;
    if(UI.modal?.t!=="legacy-history")return;
    UI.modal={t:"legacy-history",archives,archive,legacy,date:legacy?.selectedDate||legacy?.dates.at(-1)||"",factory:"全部",section:"day"};
    renderModal();
  }catch(e){if(UI.modal?.t==="legacy-history"){UI.modal={t:"legacy-history",error:e.message};renderModal();}}
}
async function changeLegacyHistorySource(id){
  const m=UI.modal;if(m?.t!=="legacy-history")return;
  m.loading=true;renderModal();
  try{
    const archive=m.archives.find(a=>a.id===id);
    const legacy=archive?await STORE.getLegacyArchive(archive.id):null;
    if(UI.modal!==m)return;
    Object.assign(m,{loading:false,archive,legacy,date:legacy?.selectedDate||legacy?.dates.at(-1)||"",factory:"全部",section:"day"});
  }catch(e){m.loading=false;m.error=e.message;}
  if(UI.modal===m)renderModal();
}
function setPath(o,path,v){const k=path.split(".");let t=o;for(let i=0;i<k.length-1;i++)t=t[isNaN(k[i])?k[i]:+k[i]];t[k[k.length-1]]=v;}
function syncInputs(){
  const m=UI.modal;if(!m||!m.draft)return;
  document.querySelectorAll("#modal-root [data-bind]").forEach(el=>{
    const v=el.type==="number"?(el.value===""?0:+el.value):el.value;setPath(m.draft,el.dataset.bind,v);});
}
function renderModal(){
  let root=$("#modal-root");
  if(!root){root=document.createElement("div");root.id="modal-root";document.body.appendChild(root);}
  const m=UI.modal;if(!m){root.innerHTML="";return;}
  const f=MODALS[m.t];if(!f){closeModal();return;}
  const c=f(m);if(!c){closeModal();return;}
  const keep=root.querySelector(".overlay"),focusToken=keep&&root.contains(document.activeElement)?modalFocusToken(document.activeElement):null;
  const st=keep?keep.scrollTop:0;
  root.innerHTML='<div class="overlay" id="ov"><div class="modal'+(m.t==='catalog-review'?' catalog-review':'')+'" role="dialog" aria-modal="true" aria-label="'+esc(c.title)+'" tabindex="-1"><div class="modal-h"><h3>'+c.title+'</h3><button class="iconbtn" data-act="close" aria-label="關閉">×</button></div><div class="modal-b">'+c.body+'</div>'+(c.foot?'<div class="modal-f">'+c.foot+'</div>':"")+'</div></div>';
  const ov=$("#ov");ov.scrollTop=st;
  const cb=$("#cbx"),modal=ov.querySelector(".modal");
  const restore=modalFocusFromToken(modal,focusToken);
  if(cb){cb.focus();cb.select();}
  else if(restore&&modalFocusable(modal).includes(restore))restore.focus();
  else (modalFocusable(modal)[0]||modal).focus();
  ov.addEventListener("click",e=>{if(e.target===ov)closeModal();});
}
function rerender(){syncInputs();renderModal();}
const tg=(act,v,on,txt,extra="",disabled=false)=>'<button class="tg '+extra+'" data-act="'+act+'" data-v="'+esc(v)+'" aria-pressed="'+!!on+'"'+(disabled?' disabled':'')+'>'+txt+'</button>';
const RK={early:"提早",swap:"換人",mach:"換機台",delay:"延後",push:"順延",chain:"連動",fail:"要處理",late:"延誤",info:"說明"};
function resultHTML(lines){
  if(!lines||!lines.length)return '<div class="okbox">不用調整，其他排程都沒變</div>';
  return '<div class="result">'+lines.map(l=>'<div class="rline"><span class="k '+l.k+'">'+(RK[l.k]||"")+'</span><span>'+esc(l.t)+'</span></div>').join("")+'</div>';
}
function futureOf(b){return bEnd(b)>nowAbs();}
function legacyFactoryHTML(day,factory){
  const entries=day?.[factory]||[],notes=day?.notes?.[factory]||[];
  return '<div class="field"><span class="lab">'+factory+' · '+entries.length+' 格'+(day?.overtime?.[factory]?' · 原表標示加班':'')+'</span>'+
    (notes.length?'<div class="hint">日期欄：'+notes.map(x=>esc(x.value)).join('、')+'</div>':'')+
    (entries.length?'<div class="result">'+entries.map(item=>'<div class="rline"><span class="k info">'+esc(item.cell)+'</span><span style="white-space:pre-wrap">'+esc(item.machine)+(item.operator?' · '+esc(item.operator):'')+'：'+esc(item.value)+'</span></div>').join('')+'</div>':'<div class="hint">這天原表沒有內容</div>')+'</div>';
}
function legacyCatalogHTML(catalog,factory){
  const c=catalog?.[factory];
  if(!c)return '<div class="hint">這份歷史檔尚無製作項目名冊，需重新匯入原檔。</div>';
  const map=legacyFieldMap({[factory]:c});
  return '<h4>'+esc(factory)+' · 欄位對照（'+map.length+' 項）</h4><div class="hint">欄位對照只是分類建議；不直接認定技能、產能或純人工。重複規格與左右位置保持各自來源。</div>'+map.map(x=>'<div class="rline"><span class="k info">'+esc(x.cell)+'</span><span><b>'+esc(x.label)+'</b> · '+esc(x.kind)+'<br><small>'+esc(x.suggestion)+(x.positionCell?'；設備欄名 '+esc(x.headerCell)+'，左右位置 '+esc(x.positionCell):'')+'</small></span></div>').join('');
}

function resourceLoadHTML(){
  const report=resourceLoad(S,UI.date,dayInfo(UI.date).win,UI.factory);
  const duration=n=>n===null?'待確認':n+' 分';
  const rows=(items,employee)=>items.map(r=>{
    const warnings=[r.overloadMinutes>0?(employee?'超出顧機上限 ':'機台工作重疊 ')+duration(r.overloadMinutes):'',
      r.outsideMinutes>0?'不在可用時段 '+duration(r.outsideMinutes):'',r.invalidFaults?'故障時間格式異常':''].filter(Boolean);
    const availability=r.pending?'資料待確認':r.availableMinutes===0?(employee&&r.leave?'當日請假':'當日無可用時段'):'可用 '+duration(r.availableMinutes);
    const rate=r.utilization===null?'—':Math.round(r.utilization*100)+'%';
    const free=r.pending?'尚不能計算空檔':r.longest?'最長空檔 '+hm(r.longest[0])+'–'+hm(r.longest[1])+'（'+duration(r.longest[1]-r.longest[0])+'）':'沒有可用空檔';
    return '<article class="load-row"><div class="load-row-head"><b>'+esc(r.name)+'</b><span class="tag mute">'+factoryName(r.factory)+'</span><span class="spacer"></span><span>'+rate+'</span></div>'+
      '<div class="load-bar" aria-label="'+esc(r.name+' 可用時段占用率 '+rate)+'"><span style="width:'+(r.utilization===null?0:Math.min(100,Math.max(0,r.utilization*100)))+'%"></span></div>'+
      '<div class="hint">'+esc(availability)+' · 已排 '+r.blockCount+' 段 · 占用 '+duration(r.busyMinutes)+
      (employee?' · 工作時段合計 '+duration(r.assignedMinutes)+' · 最高占用容量 '+r.peak+(r.limit===null?'（上限待確認）':' / 顧機上限 '+r.limit):r.faultMinutes>0?' · 故障占用 '+duration(r.faultMinutes):'')+'</div>'+
      '<div class="hint">'+esc(free)+(r.pending?'':' · 總空檔 '+duration(r.freeMinutes))+'</div>'+
      warnings.map(t=>'<div class="issue">'+esc(t)+'</div>').join('')+'</article>';
  }).join('')||'<div class="empty">此範圍沒有資源</div>';
  const anomalies=report.invalidBlocks+report.missingResources+report.invalidWindows;
  return {title:'當日負荷 · '+mdw(UI.date),body:
    '<div class="hint">'+esc(UI.factory==='all'?'兩廠全體資源':factoryName(UI.factory))+' · 分析目前畫面的排程，不套用名冊分組篩選，也不改排程。同步狀態請看右上角；週檢視仍分析上方選定的單日。</div>'+
    '<div class="hint">占用率 = 可用時段內的占用時間 ÷ 可用時間。午休、停工、故障、請假及個人加班設定均扣除。一人同時顧多台時，占用時間不重複加總，機台工作合計另列；重疊或超限另外警示。</div>'+
    '<div class="hint">空檔只代表時間未被占用，不保證技能、物料、工序或交期允許排入；負荷高也不等於已確認的生產瓶頸。待確認名冊不推測可用產能。</div>'+
    (anomalies?'<div class="issue">有 '+report.invalidBlocks+' 段工作時間異常、'+report.missingResources+' 段缺少人員／機台對照、'+report.invalidWindows+' 個上班時段異常；統計可能不完整，請先檢查資料。</div>':'')+
    '<h4>機台／操作位置</h4><div class="load-list">'+rows(report.machines,false)+'</div>'+
    '<h4>員工</h4><div class="load-list">'+rows(report.employees,true)+'</div>',
    foot:'<button class="btn" data-act="close">關閉</button>'};
}
const MODALS={
"resource-load"(){return resourceLoadHTML();},
"manual-add"(m){
  const choices=S.orders.flatMap(o=>{
    const p=prod(o.pid);if(!p)return [];
    return p.steps.map((st,step)=>({o,p,st,step,remaining:remainingQty(o.qty,S.blocks,o.id,step,null,S.execution||[])}))
      .filter(x=>x.remaining>0&&(UI.factory==="all"||factoryOf(x.st)===UI.factory));
  });
  if(!choices.length)return {title:"手動排班",body:'<div class="hint">目前沒有可新增的工作：此廠工序已排滿，或尚未建立工單。可先新增工單，再回來安排人員與時段。</div>',
    foot:'<button class="btn" data-act="close">關閉</button><button class="btn primary" data-act="ord-new">＋新增工單</button>'};
  if(!m.draft){const start=UI.date===todayStr()?Math.max(DAY0,Math.ceil(nowMin()/10)*10):DAY0;
    m.draft={choice:m.choice||choices[0].o.id+":"+choices[0].step,machine:"",employee:"",s:Math.min(start,DAY1-10),e:Math.min(DAY1,Math.min(start,DAY1-10)+60)};}
  const D=m.draft,chosen=choices.find(x=>x.o.id+":"+x.step===D.choice)||choices[0];
  D.choice=chosen.o.id+":"+chosen.step;
  const machines=S.machines.filter(M=>M.proc===chosen.st.proc&&M.products.includes(chosen.o.pid)&&factoryOf(M)===factoryOf(chosen.st));
  if(!machines.some(M=>M.id===D.machine))D.machine=machines[0]?.id||"";
  const M=mach(D.machine),employees=M?S.employees.filter(E=>compatible(E,M,chosen.p,chosen.st)):[];
  if(!employees.some(E=>E.id===D.employee))D.employee=employees[0]?.id||"";
  const times=(selected,min,max)=>{let out="";for(let t=min;t<=max;t+=10)out+='<option value="'+t+'"'+(t===selected?' selected':'')+'>'+hm(t)+'</option>';return out;};
  const qty=manualQty(chosen.o.id,chosen.step,D.e-D.s),ready=readyAbs(chosen.o.id,chosen.step);
  return {title:mdw(UI.date)+" · 手動排班",body:
    '<div class="hint">先選工單工序、機台與員工，再指定時段。新增後會先顯示預覽；若撞到其他工作，會建議順延，確認前不改排程。</div>'+
    '<div class="field"><label for="manual-choice">要做的工作</label><select class="inp" id="manual-choice">'+choices.map(x=>'<option value="'+esc(x.o.id+":"+x.step)+'"'+(x===chosen?' selected':'')+'>'+esc(x.o.code+' · '+factoryName(x.st.factory)+' '+x.st.proc+' · 剩餘 '+x.remaining+' 件')+'</option>').join('')+'</select></div>'+
    '<div class="row2"><div class="field"><label for="manual-machine">機台</label><select class="inp" id="manual-machine">'+machines.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===D.machine?' selected':'')+'>'+esc(x.id+' '+x.label)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="manual-employee">員工</label><select class="inp" id="manual-employee">'+employees.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===D.employee?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div></div>'+
    '<div class="row2"><div class="field"><label for="manual-start">開始</label><select class="inp num" id="manual-start">'+times(D.s,DAY0,DAY1-10)+'</select></div>'+
    '<div class="field"><label for="manual-end">結束</label><select class="inp num" id="manual-end">'+times(D.e,DAY0+10,DAY1)+'</select></div></div>'+
    '<div class="pv-sum">'+hm(D.s)+'–'+hm(D.e)+'（'+(D.e-D.s)+' 分） · 依工序速率預計 '+qty+' 件；此站尚待排 '+chosen.remaining+' 件。'+(!isFinite(ready)?'前站尚未排完，暫時不能開始本站。':'')+'</div>'+
    (!machines.length?'<div class="issues"><div class="issue">沒有符合這道工序的機台</div></div>':!employees.length?'<div class="issues"><div class="issue">沒有具操作資格的同廠員工</div></div>':''),
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="manual-preview">預覽新增工作</button>'};
},
"drag-preview"(m){
  const P=m.proposal;
  const place=bl=>bl.length?mdw(bl[0].date)+" "+hm(bl[0].s)+" → "+(bl[bl.length-1].date!==bl[0].date?mdw(bl[bl.length-1].date)+" ":"")+hm(bl[bl.length-1].e)+" "+bl[0].m+" 機台"+(bl.length>1?"（"+bl.length+" 段）":""):"未排入";
  const others=P.ops.filter(x=>![...x.prev,...x.next].some(b=>b.id===P.oldId));
  const displaced=P.direct.map(x=>{
    const op=P.ops.find(y=>y.oid===x.oid&&y.prev.some(b=>b.id===x.id));
    return op?op.code+" "+op.step+" 往後推到 "+place(op.next):null;
  }).filter(Boolean);
  const main='<div class="pv-sum"><b>'+esc(P.movedLabel)+'</b>：'+esc(P.source)+' → '+esc(P.target)+(P.newQty!==undefined?'；預計 '+P.newQty+' 件':'')+(P.remaining?'；此站還有 '+P.remaining+' 件未排':'')+'</div>';
  const suggest=displaced.length?'<div class="field"><span class="lab">建議順延到最早可用時間</span><div class="result">'+displaced.map(t=>'<div class="rline"><span class="k push">順延</span><span>'+esc(t)+'</span></div>').join("")+'</div></div>':'';
  const pins=!P.problems.length&&P.unpinned.length?'<div class="issues">'+P.unpinned.map(x=>'<div class="issue">'+esc(x.label)+' 已固定（釘）。確認後會解除固定並移動它；取消則保持原樣。</div>').join("")+'</div>':'';
  const impact='<div class="field"><span class="lab">連帶影響的工作（'+others.length+' 道工序）</span>'+(others.length?'<div class="result">'+others.map(x=>'<div class="rline"><span class="k '+(x.next[0]&&x.prev[0]&&bAbs(x.next[0])>bAbs(x.prev[0])?"delay":"info")+'">'+esc(x.code)+'</span><span>'+esc(x.step+"："+place(x.prev)+" → "+place(x.next))+'</span></div>').join("")+'</div>':'<div class="okbox">其他工作不變</div>')+'</div>';
  const due='<div class="field"><span class="lab">受影響工單的交期</span><div class="result">'+P.statuses.map(x=>{
    const bad=["late","part","none"].includes(x.status);
    const msg=x.status==="late"?"逾期，預計 "+mdw(x.finish):x.status==="part"||x.status==="none"?"尚未排完":"未逾期"+(x.finish?"，預計 "+mdw(x.finish):"");
    return '<div class="rline"><span class="k '+(bad?"late":"early")+'">'+(bad?"需處理":"準時")+'</span><span>'+esc(x.code+"："+msg+"；期限 "+mdw(x.due))+'</span></div>';
  }).join("")+'</div></div>';
  const problems=P.problems.length?'<div class="field"><span class="lab">無法安全順延，排程不會改動</span><div class="issues">'+P.problems.map(t=>'<div class="issue">'+esc(t)+'</div>').join("")+'</div></div>':'';
  return {title:P.problems.length?"手動排班預覽 · 需要處理":"手動排班預覽 · 確認",body:main+suggest+pins+impact+due+problems,
    foot:m.applying?'<button class="btn primary" disabled>正在儲存，請稍候…</button>':'<button class="btn" data-act="close">取消</button>'+(P.problems.length?'':'<button class="btn primary" data-act="drag-confirm">確認套用</button>')};
},
/* ---------- 員工 ---------- */
ot(m){
  const d=m.date;
  if(m.open===undefined){
    m.open=!!S.dayOT[d];
    m.overrides=Object.fromEntries(S.employees.map(e=>[e.id,Object.prototype.hasOwnProperty.call(e.otOverrides||{},d)?!!e.otOverrides[d]:null]));
  }
  const available=shownEmployees().filter(e=>!e.leaves.includes(d)&&(m.overrides[e.id]===null?overtimeDefault(e,d):m.overrides[e.id])).length;
  const people=shownEmployees().map(e=>{
    const base=overtimeDefault(e,d),value=m.overrides[e.id],yes=value===null?base:value;
    return '<div class="ot-person"><div class="ot-person-title"><b>'+esc(e.name)+'</b><small>固定星期：'+(base?'可加班':'不加班')+(value===null?'':' · 今天臨時調整')+(e.leaves.includes(d)?' · 請假':'')+'</small></div>'+
      '<div class="toggles"><button class="tg" data-act="ot-person" data-id="'+esc(e.id)+'" data-v="1" aria-label="'+esc(e.name)+' 今天可加班" aria-pressed="'+!!yes+'">今天可加班</button>'+
      '<button class="tg" data-act="ot-person" data-id="'+esc(e.id)+'" data-v="0" aria-label="'+esc(e.name)+' 今天不加班" aria-pressed="'+!yes+'">今天不加班</button>'+
      (value===null?'':'<button class="btn" data-act="ot-reset" data-id="'+esc(e.id)+'" aria-label="'+esc(e.name)+' 恢復固定設定">恢復固定設定</button>')+'</div></div>';
  }).join("");
  return {title:mdw(d)+" 加班設定",body:
    '<div class="field"><span class="lab">今天是否開放 17:00–20:00 加班</span><div class="toggles">'+tg("ot-day","1",m.open,"開放加班")+tg("ot-day","0",!m.open,"不開放")+'</div></div>'+
    '<div class="hint">依員工的固定星期預先顯示。下面只調整今天，不會改到其他同星期的日期；請假者仍不排工作。</div>'+
    '<div class="field"><span class="lab">今天可加班 '+available+' 人</span><div class="ot-people">'+people+'</div></div>',
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="ot-save">確認並套用到排程</button>'};
},
emp(m){
  if(!m.draft){const E=m.id?emp(m.id):null;
    m.draft=E?JSON.parse(JSON.stringify(E)):{id:uid(),name:"",factory:UI.factory==="all"?1:UI.factory,color:S.employees.length%COLORS.length,skills:[],maxMachines:1,leaves:[],noOT:false,otWeekdays:[...ALL_WEEKDAYS],otOverrides:{}};
    m.draft.otWeekdays=overtimeWeekdays(m.draft);m.draft.otOverrides ||= {};}
  const D=m.draft,ro=!canMaster();
  const start=weekStart(UI.date<todayStr()?todayStr():UI.date);
  let days="";for(let i=0;i<21;i++){const d=addDays(start,i),di=dayInfo(d);
    days+=tg("m-leave",d,D.leaves.includes(d),'<span class="num">'+md(d)+'</span><small>'+WD[di.w]+(di.type==="hol"?" "+esc(di.hol.slice(0,3)):"")+'</small>',"leave"+(di.type!=="work"?" hol":""),ro);}
  const body=(D.sourceRef?'<div class="hint">原檔來源：'+esc(D.sourceRef)+'。'+(D.reviewStatus==='pending'?'姓名與技能待確認；未推測會操作哪些機台。':'')+'</div>':'')+
   '<div class="hint">原始員工代號：'+esc(D.sourceCode||'原檔未提供或尚未核定')+'</div>'+
   (D.sourceNotes?'<div class="hint">原文備註：'+esc(D.sourceNotes)+'</div>':'')+
   (D.catalogSources?.length?'<div class="hint">補充來源：'+D.catalogSources.map(esc).join('；')+'</div>':'')+
   (D.identityCandidates?.length?'<div class="field"><span class="lab">別名待核對（尚未合併）</span>'+D.identityCandidates.map(c=>'<div class="hint">'+esc(c.name)+' · '+esc(c.source_employee_code||'無代號')+' · '+esc(c.source_ref||'')+'</div>').join('')+'</div>':'')+
   '<div class="field"><label for="f-name">姓名</label><input class="inp" id="f-name" data-bind="name" value="'+esc(D.name)+'" '+(ro?"disabled":"")+' autocomplete="off"></div>'+
   '<div class="field"><span class="lab">所屬廠別</span><div class="toggles">'+FACTORIES.map(f=>tg("m-emp-factory",f,factoryOf(D)===f,factoryName(f),"",ro)).join("")+'</div></div>'+
   '<div class="field"><span class="lab">所屬分組／部門</span><div class="hint">'+(employeeGroups(S,D.id).map(x=>esc(x.group.name)+(x.group.department?'（'+esc(x.group.department)+'）':'')+' · '+memberStatus(x.membership.reviewStatus)).join('；')||'尚未分組')+'。分組可在「分組／部門」調整，不等於機台技能。</div></div>'+
   '<div class="field"><span class="lab">代表顏色</span><div class="swatches">'+COLORS.map((c,i)=>'<button class="swatch" style="background:'+c+'" data-act="m-color" data-v="'+i+'" aria-pressed="'+(D.color===i)+'" aria-label="顏色 '+(i+1)+'"'+(ro?' disabled':'')+'></button>').join("")+'</div></div>'+
   '<div class="field"><span class="lab">會操作的機台</span><div class="toggles">'+S.machines.filter(M=>factoryOf(M)===factoryOf(D)).map(M=>tg("m-skill",M.id,D.skills.includes(M.id),'<span class="num">'+esc(M.id)+'</span><small>'+esc(M.label)+'</small>',"",ro)).join("")+'</div></div>'+
   '<div class="field"><label for="f-max-machines">同時最多顧幾台機台</label><input class="inp num" type="number" min="1" max="100" step="1" id="f-max-machines" data-bind="maxMachines" value="'+(D.maxMachines||1)+'" '+(ro?"disabled":"")+'><div class="hint">預設 1 台；只計算同時運轉的不同機台，不影響會操作的機台清單。</div></div>'+
   '<div class="field"><span class="lab">固定每週可加班日</span><div class="toggles">'+[1,2,3,4,5,6,0].map(w=>tg("m-ot-week",w,D.otWeekdays.includes(w),"週"+WD[w],"",ro)).join("")+'</div><div class="hint">當天是否加班另由排程表開放；臨時意願可在當天的「加班設定」調整。</div></div>'+
   '<div class="field"><span class="lab">請假（點日期切換，紅色 = 請假）</span><div class="toggles">'+days+'</div></div>';
  const foot=ro?'<button class="btn" data-act="close">關閉</button>':
   (m.id?'<button class="btn danger" data-act="m-emp-del">刪除員工</button>':'')+'<div class="spacer"></div><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="m-emp-save">儲存並自動調整</button>';
  return {title:m.id?esc(D.name||"員工"):"新增員工",body,foot};
},
/* ---------- 機台 ---------- */
mach(m){
  if(!m.draft){const M=m.id?mach(m.id):null;
    m.draft=M?JSON.parse(JSON.stringify(M)):{id:"",label:"",factory:UI.factory==="all"?1:UI.factory,proc:'',products:[],faults:[]};
    const n=UI.date===todayStr()?Math.max(DAY0,Math.floor(nowMin()/10)*10):DAY0;m.fs=Math.min(n,DAY1-30);m.fd=60;m.note="";}
  const D=m.draft,ro=!canIncidents(),rm=!canMaster(),d=UI.date;
  const faults=m.id?mach(m.id).faults.map((f,i)=>({f,i})).filter(x=>x.f.date===d):[];
  let opts="";for(let t=DAY0;t<DAY1;t+=10)opts+='<option value="'+t+'"'+(t===m.fs?" selected":"")+'>'+hm(t)+'</option>';
  const durs=[[30,"30 分"],[60,"1 小時"],[120,"2 小時"],[240,"半天"],[-1,"到 17:00"],[-2,"整天"]];
  const faultBox=m.id&&!ro&&!S.setupPending?
   '<div class="field"><span class="lab">'+mdw(d)+' 機台狀況</span>'+
   (faults.length?faults.map(x=>'<div class="rline"><span class="k fail">故障</span><span style="flex:1">'+hm(x.f.s)+'–'+hm(x.f.e)+(x.f.note?"　"+esc(x.f.note):"")+'</span>'+(x.f.fixed?'<span class="tag ok">已修復</span>':absOf(x.f.date,x.f.e)<=nowAbs()?'<span class="tag mute">已結束</span>':'<button class="btn good" data-act="m-fix" data-v="'+x.i+'">修好了</button>')+'</div>').join(""):'<div class="okbox">正常運作</div>')+'</div>'+
   '<div class="field"><span class="lab">報故障：從幾點開始、壞多久</span><div class="row2"><select class="inp num" id="f-fs">'+opts+'</select><input class="inp" id="f-note" placeholder="原因（可不填）" value="'+esc(m.note)+'"></div>'+
   '<div class="toggles">'+durs.map(([v,t])=>tg("m-fd",v,m.fd===v,t)).join("")+'</div>'+
   '<button class="btn danger" data-act="m-fault" style="height:56px;font-size:19px;justify-content:center">確認故障，讓系統自動調整</button></div>':"";
  const body=(D.sourceRef?'<div class="hint">原檔來源：'+esc(D.sourceRef)+'。'+(D.reviewStatus==='pending'?'此欄可能代表機台或工作站，用途與工序待確認。':'')+'</div>':'')+(m.fromInc?faultBox:"")+
   (D.catalogGroup?'<div class="hint">來源資源群組：'+esc(D.catalogGroup)+(D.catalogSide?' · '+esc(D.catalogSide)+'側操作位置':'')+'。僅作來源對照，尚未確認共用產能。</div>':'')+
   (m.id?'':'<div class="field"><label for="f-id">代號（例：f）</label><input class="inp num" id="f-id" data-bind="id" value="'+esc(D.id)+'" maxlength="4" autocomplete="off"></div>')+
   '<div class="field"><label for="f-label">名稱</label><input class="inp" id="f-label" data-bind="label" value="'+esc(D.label)+'" '+(rm?"disabled":"")+' autocomplete="off"></div>'+
   '<div class="field"><span class="lab">所屬廠別</span><div class="toggles">'+FACTORIES.map(f=>tg("m-mach-factory",f,factoryOf(D)===f,factoryName(f),"",rm)).join("")+'</div></div>'+
   '<div class="field"><label for="f-proc">設備工序／工作內容（可自行輸入）</label><input class="inp" id="f-proc" data-bind="proc" list="process-names" value="'+esc(D.proc)+'" '+(rm?'disabled':'')+'><datalist id="process-names">'+processNames().map(p=>'<option value="'+esc(p)+'"></option>').join('')+'</datalist><div class="hint">名稱由使用者設定，不限於示範工序；純人工請使用「工作內容」。</div></div>'+
   '<div class="field"><span class="lab">允許加工的產品／品號</span><div class="toggles">'+S.products.map(p=>tg("m-prod",p.id,D.products.includes(p.id),esc(p.name)+'<small>'+esc(p.steps.map(s=>s.proc).join("→"))+'</small>',"",rm)).join("")+'</div><div class="hint">這是使用者建立的產品清單，不代表 1023 已核定模具。模具尚未獨立建模。</div>'+(rm?'':'<button class="btn" data-act="mach-products">新增／編輯產品與工序</button><div class="hint">請先儲存本視窗修改，再切換產品設定。</div>')+'</div>'+
   '<div class="field"><span class="lab">誰會操作</span><div class="chips">'+(S.employees.filter(E=>E.skills.includes(D.id)).map(E=>'<span class="emp"><span class="sw" style="background:'+COLORS[E.color%COLORS.length]+'">'+esc(E.name[0])+'</span>'+esc(E.name)+'</span>').join("")||'<span class="hint">還沒有人會操作（到員工設定勾選）</span>')+'</div></div>'+
   (m.fromInc?"":faultBox);
  const foot=rm?'<button class="btn" data-act="close">關閉</button>':
   (m.id?'<button class="btn danger" data-act="m-mach-del">刪除機台</button>':'')+'<div class="spacer"></div><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="m-mach-save">儲存</button>';
  return {title:m.id?'<span class="num">'+esc(D.id)+'</span>　'+esc(D.label):"新增機台",body,foot};
},
/* ---------- 工單 ---------- */
ord(m){
  if(!m.draft){const O=m.id?order(m.id):null;
    const first=S.products.find(p=>UI.factory==="all"||p.steps.some(s=>factoryOf(s)===UI.factory))||S.products[0];
    m.draft=O?{...O,note:O.note||""}:{id:uid(),code:nextCode(),pid:first?first.id:"",qty:100,due:workdaysFrom(addDays(todayStr(),1),3)[2],pri:m.pri??2,note:""};}
  const D=m.draft,ro=!canOrders(),p=prod(D.pid);
  const flow=p?p.steps.map((s,i)=>'<span class="pill">'+(i+1)+". "+factoryName(s.factory)+" "+esc(s.proc)+" "+durOf(D.qty||0,s.rate)+"分"+(s.batch>0?"（前站 "+s.batch+" 件就開始）":"")+'</span>').join('<span class="arr">→</span>'):"";
  let plan="";
  if(m.id){const O=order(m.id),st=orderStatus(O);
    const bl=S.blocks.filter(b=>b.oid===m.id).sort((a,b)=>a.step-b.step||byAbs(a,b));
    plan='<div class="field"><span class="lab">目前排程　'+statusTag(O)+(st.fd?'　預計 '+mdw(st.fd)+" "+hm(st.fin%1440)+" 完成":"")+'</span><div class="result">'+
      (bl.map(b=>'<button class="rline" data-act="goto" data-d="'+b.date+'" style="border:0;text-align:left;width:100%"><span class="k info">'+esc(stepName(b))+'</span><span class="num">'+mdw(b.date)+" "+hm(b.s)+"–"+hm(b.e)+"　"+esc(b.m)+"　"+esc(emp(b.emp)?emp(b.emp).name:"")+"　"+b.qty+'件</span></button>').join("")||'<div class="empty">尚未排入</div>')+'</div></div>';}
  const body=
   '<div class="row2"><div class="field"><label for="f-code">工單號</label><input class="inp num" id="f-code" data-bind="code" value="'+esc(D.code)+'" '+(ro?"disabled":"")+'></div>'+
   '<div class="field"><label for="f-qty">數量（件）</label><input class="inp num" type="number" min="1" id="f-qty" data-bind="qty" value="'+D.qty+'" '+(ro?"disabled":"")+'></div></div>'+
   '<div class="field"><span class="lab">產品</span><div class="toggles">'+S.products.filter(x=>x.id===D.pid||UI.factory==="all"||x.steps.some(s=>factoryOf(s)===UI.factory)).map(x=>tg("o-prod",x.id,D.pid===x.id,esc(x.name),"",ro)).join("")+'</div></div>'+
   '<div class="row2"><div class="field"><label for="f-due">最晚完成日（硬性期限）</label><input class="inp num" type="date" id="f-due" data-bind="due" value="'+D.due+'" '+(ro?"disabled":"")+'></div>'+
   '<div class="field"><span class="lab">優先順序</span><div class="toggles">'+[[0,"特急"],[1,"急"],[2,"一般"],[3,"不急"]].map(([v,t])=>tg("o-pri",v,D.pri===v,t,"",ro)).join("")+'</div></div></div>'+
   '<div class="field"><span class="lab">標準工序（依產品設定自動算時間）</span><div class="flow">'+flow+'</div></div>'+
   '<div class="field"><label for="f-onote">備註（內部說明，不影響排程計算）</label><input class="inp" id="f-onote" data-bind="note" maxlength="200" value="'+esc(D.note||'')+'" '+(ro?"disabled":"")+' autocomplete="off"></div>'+plan;
  const foot=ro?'<button class="btn" data-act="close">關閉</button>':
   (m.id?'<button class="btn danger" data-act="o-del">刪除工單</button>':'')+'<div class="spacer"></div><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="o-save">下一步：選排法</button>';
  return {title:m.id?"工單 "+esc(D.code):"新增工單",body,foot};
},
orders(){
  const rows=[...shownOrders()].sort((a,b)=>a.due.localeCompare(b.due)||a.pri-b.pri).map(orderRow).join("")||'<div class="empty">此廠沒有工單</div>';
  return {title:"全部工單",body:'<div class="olist">'+rows+'</div>',
    foot:(S.demo&&canMaster()&&!readOnly?'<button class="btn danger" data-act="clear-demo">清除示範工單</button><div class="spacer"></div>':'')+(canOrders()?'<button class="btn primary" data-act="ord-new">＋新增工單</button>':"")};
},
/* ---------- 產品工序（標準公式） ---------- */
products(m){
  if(!m.draft)m.draft=JSON.parse(JSON.stringify(S.products));
  const ro=!canMaster();
  const body=(S.demo?'<div class="issue">目前包含示範產品，不是 1023 已核定的品號／模具。請自行新增現場產品與工序；速率必須由使用者確認。</div>':'')+'<div class="hint">工序名稱可自行輸入。已有工單的產品可改名稱；變更工序／產能請新增產品版本，以保留原排程。此為原生產品工序模型，跨廠加工單與點收紀錄另行管理，尚未自動串接；原生模型的跨廠運送／交接時間仍未設定，不能將它的預測當成實際到料。</div>'+
   m.draft.map((p,pi)=>'<div class="field" style="border:1px solid var(--line2);border-radius:12px;padding:12px">'+
    '<input class="inp" data-bind="'+pi+'.name" value="'+esc(p.name)+'" aria-label="產品名稱" '+(ro?"disabled":"")+'>'+
    '<div class="steps">'+p.steps.map((s,si)=>'<div class="step"><span class="no">'+(si+1)+'</span>'+
      '<input class="inp" data-bind="'+pi+'.steps.'+si+'.proc" aria-label="工序" value="'+esc(s.proc)+'" '+(ro?'disabled':'')+' placeholder="自行輸入工序名稱">'+
      '<select class="inp" data-bind="'+pi+'.steps.'+si+'.factory" aria-label="第 '+(si+1)+' 站廠別" '+(ro?"disabled":"")+'>'+FACTORIES.map(f=>'<option value="'+f+'"'+(factoryOf(s)===f?' selected':'')+'>'+factoryName(f)+'</option>').join('')+'</select>'+
      '<label class="field" style="gap:2px"><span class="hint">件/分</span><input class="inp num" type="number" step="0.1" min="0.1" data-bind="'+pi+'.steps.'+si+'.rate" value="'+s.rate+'" '+(ro?"disabled":"")+'></label>'+
      '<label class="field" style="gap:2px"><span class="hint">幾件可傳下站</span><input class="inp num" type="number" min="0" data-bind="'+pi+'.steps.'+si+'.batch" value="'+s.batch+'" '+(ro?"disabled":"")+'></label>'+
      (ro?"":'<button class="iconbtn x" data-act="p-delstep" data-v="'+pi+'.'+si+'" aria-label="刪除這站">×</button>')+'</div>').join("")+'</div>'+
    (ro?"":'<button class="more" data-act="p-addstep" data-v="'+pi+'">＋加一站</button>')+'</div>').join("")+
   (ro?"":'<button class="btn" data-act="p-add">＋新增產品</button>');
  return {title:"產品工序（標準公式）",body,foot:ro?'<button class="btn" data-act="close">關閉</button>':'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="p-save">儲存</button>'};
},
/* ---------- 單一方塊 ---------- */
blk(m){
  const b=S.blocks.find(x=>x.id===m.id);if(!b)return null;
  const o=order(b.oid),p=prod(o.pid),E=emp(b.emp),M=mach(b.m),iss=issuesOf(b),ro=readOnly||!!executionOf(S,b.id);
  const others=S.blocks.filter(x=>x.oid===b.oid&&x!==b).sort((a,c)=>a.step-c.step||byAbs(a,c));
  let opts="",endOpts="";
  for(let t=DAY0;t<DAY1;t+=10)opts+='<option value="'+t+'"'+(t===b.s?" selected":"")+'>'+hm(t)+'</option>';
  for(let t=DAY0+10;t<=DAY1;t+=10)endOpts+='<option value="'+t+'"'+(t===b.e?" selected":"")+'>'+hm(t)+'</option>';
  const empT=S.employees.filter(X=>factoryOf(X)===factoryOf(M)).map(X=>{const can=X.skills.includes(b.m);const free=slotFree(b.date,b.m,X,b.s,b.e,b.id);
    return tg("b-emp",X.id,X.id===b.emp,esc(X.name)+'<small>'+(X.id===b.emp?"目前":!can?"不會此機":free?"有空":"沒空")+'</small>',"");}).join("");
  const machT=S.machines.filter(X=>X.proc===p.steps[b.step].proc&&X.products.includes(o.pid)&&factoryOf(X)===factoryOf(p.steps[b.step])).map(X=>tg("b-mach",X.id,X.id===b.m,'<span class="num">'+esc(X.id)+'</span><small>'+esc(X.label)+'</small>')).join("");
  const body='<dl class="kv"><dt>產品</dt><dd>'+esc(p.name)+"　第 "+(b.step+1)+" 站／共 "+p.steps.length+" 站："+esc(p.steps[b.step].proc)+'</dd><dt>數量</dt><dd class="num">'+b.qty+' 件</dd><dt>時間</dt><dd class="num">'+mdw(b.date)+" "+hm(b.s)+"–"+hm(b.e)+"（"+(b.e-b.s)+' 分）</dd><dt>機台</dt><dd>'+esc(M.id+" "+M.label)+'</dd><dt>人員</dt><dd>'+esc(E?E.name:"未指定")+'</dd><dt>期限</dt><dd>'+mdw(o.due)+"　"+statusTag(o)+'</dd></dl>'+
   (iss.length?'<div class="issues">'+iss.map(t=>'<div class="issue">'+esc(t)+'</div>').join("")+'</div>':'<div class="okbox">沒有問題</div>')+
   (executionOf(S,b.id)?'<div class="hint">已有現場回報，這段排程已鎖定，不可拖曳、改量、解除固定或刪除。</div><button class="btn" data-act="report-open" data-id="'+esc(b.id)+'">查看現場回報</button>':'')+
   (ro?"":'<div class="field"><span class="lab">換人</span><div class="toggles">'+empT+'</div></div>'+
   '<div class="field"><span class="lab">換機台</span><div class="toggles">'+machT+'</div></div>'+
   '<div class="row2"><div class="field"><label for="f-bs">開始時間</label><select class="inp num" id="f-bs">'+opts+'</select></div>'+
   '<div class="field"><label for="f-be">結束時間</label><select class="inp num" id="f-be">'+endOpts+'</select></div></div>'+
   '<div class="hint">調整時段後請按「預覽調整」。工作長度改變會依工序速率重估這段的件數，未排入的剩餘件數仍留在工單中。</div>'+
   '<div class="field"><span class="lab">固定</span><div class="toggles">'+tg("b-pin","1",b.pin,b.pin?"已固定（系統不會動）":"未固定（系統可調整）")+'</div></div>')+
   (others.length?'<div class="field"><span class="lab">同一張工單的其他段</span><div class="result">'+others.map(x=>'<button class="rline" data-act="goto" data-d="'+x.date+'" style="border:0;text-align:left;width:100%"><span class="k info">'+esc(stepName(x))+'</span><span class="num">'+mdw(x.date)+" "+hm(x.s)+"–"+hm(x.e)+"　"+esc(x.m)+"　"+esc(emp(x.emp)?emp(x.emp).name:"")+'</span></button>').join("")+'</div></div>':"");
  const foot=ro?'<button class="btn" data-act="close">關閉</button>':'<button class="btn danger" data-act="b-del">'+(m.confirmDel?"再按一次確認刪除":"刪除這段")+'</button><div class="spacer"></div><button class="btn" data-act="b-fix">交給系統重排</button><button class="btn" data-act="close">關閉</button><button class="btn primary" data-act="b-preview">預覽調整</button>';
  return {title:esc(o.code+" "+p.name+" · "+p.steps[b.step].proc),body,foot};
},
/* ---------- 紀錄 ---------- */
log(){return {title:"全部紀錄",body:'<div class="llist">'+(S.log.map(logRow).join("")||'<div class="empty">還沒有紀錄</div>')+'</div>'};},
logone(m){
  const l=S.log.find(x=>x.id===m.id);if(!l)return null;const dt=new Date(l.t);
  const isLast=S.log[0]===l&&undoStack.length&&!readOnly;
  const sec=(t,h)=>'<div class="field"><span class="lab">'+t+'</span>'+h+'</div>';
  const abs2=a=>mdw(dateOfAbs(a))+" "+hm(((a%1440)+1440)%1440);
  const body='<div class="hint num">'+(dt.getMonth()+1)+"/"+dt.getDate()+" "+pad(dt.getHours())+":"+pad(dt.getMinutes())+'</div>'+
    (l.sum?'<div class="pv-sum">'+esc(l.sum)+'</div>':"")+
    (l.shifts&&l.shifts.length?sec("工單完成時間：原本 → 調整後",'<div class="result">'+l.shifts.map(s=>'<div class="rline"><span class="k '+(s.a>s.b?"delay":"early")+'">'+(s.a>s.b?"變晚":"提早")+'</span><span class="num">'+esc(s.code)+"　"+abs2(s.b)+" → "+abs2(s.a)+"（"+(s.a>s.b?"晚 ":"早 ")+fmtDelta(s.a-s.b)+'）</span></div>').join("")+'</div>'):"")+
    (l.people&&l.people.length?sec("每個人的班表變動",'<div class="people">'+l.people.map(p=>'<div class="person"><div class="person-h"><b>'+esc(p.name)+'</b></div>'+p.items.map(t=>'<div class="pitem"><span class="num">'+esc(t)+'</span></div>').join("")+'</div>').join("")+'</div>'):"")+
    (l.ai?sec("AI 建議",'<div class="aibox"><b>方案 '+esc(l.ai.pick)+'</b><div>'+esc(l.ai.reason)+'</div></div>'):"")+
    (l.note?sec("備註",'<div class="rline">'+esc(l.note)+'</div>'):"")+
    sec("系統怎麼調",resultHTML(l.lines))+
    (l.alts&&l.alts.length?sec("當時比較的方案",'<div class="result">'+l.alts.map(t=>'<div class="rline"><span>'+esc(t)+'</span></div>').join("")+'</div>'):"");
  return {title:esc(l.title),body,
    foot:(isLast?'<button class="btn" data-act="m-undo">'+IC.undo+'復原這次調整</button>':'')+'<div class="spacer"></div><button class="btn primary" data-act="close">知道了</button>'};
},
issues(){
  const bad=S.blocks.filter(b=>b.date===UI.date).map(b=>({b,iss:issuesOf(b)})).filter(x=>x.iss.length);
  if(!bad.length)return {title:"沒有問題",body:'<div class="okbox">今天的排程都沒有衝突</div>'};
  return {title:mdw(UI.date)+" 有 "+bad.length+" 個問題",
    body:'<div class="result">'+bad.map(x=>'<div class="rline" style="flex-wrap:wrap"><span style="flex:1;min-width:200px">'+esc(label(x.b)+"（"+x.b.m+" "+hm(x.b.s)+"）")+'<br><span style="color:var(--bad)">'+esc(x.iss.join("、"))+'</span></span><button class="btn" data-act="blk-open" data-v="'+x.b.id+'">處理</button></div>').join("")+'</div>',
    foot:readOnly?"":'<button class="btn primary" data-act="fix-all">讓系統自動修正全部</button>'};
},
/* ---------- 自動排程 ---------- */
auto(){
  const pins=S.blocks.filter(b=>b.pin&&futureOf(b)).length;
  return {title:"自動排程",body:
    '<div class="flow"><span class="pill">1. 急件優先</span><span class="arr">→</span><span class="pill">2. 期限早的先做</span><span class="arr">→</span><span class="pill">3. 前站達交接件數才排下站</span><span class="arr">→</span><span class="pill">4. 找最早能完成的機台＋人</span><span class="arr">→</span><span class="pill">5. 計算多種方案供預覽比較</span></div>'+
    '<div class="hint">會一起計算 1 廠與 2 廠的全部工序，切換廠別只影響畫面顯示。會避開請假、故障、午休與未開放的加班時段。'+(pins?"已固定（釘）的 "+pins+" 段原則上不動；若與故障或請假衝突，預覽會明示未完成部分的調整。":"")+'已完成的歷史工作不會因事後事件改寫。</div>',
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="auto-run">'+IC.bolt+'計算並預覽</button>'};
},
/* ---------- 匯出 ---------- */
export(){
  return {title:"Excel 匯出／匯入",body:
   '<button class="btn primary" data-act="x-xlsx" style="height:60px;justify-content:flex-start">'+IC.down+'下載 '+mdw(UI.date)+' 彩色排程 Excel（.xlsx）</button>'+
   '<button class="btn" data-act="x-print-day" style="height:60px;justify-content:flex-start">列印 '+mdw(UI.date)+' 現場班表</button>'+
   '<button class="btn" data-act="x-template" style="height:60px;justify-content:flex-start">'+IC.down+'下載批次匯入範本（.xlsx）</button>'+
   (canArchive()?'<button class="btn" data-act="x-import" style="height:60px;justify-content:flex-start">選擇 Excel 檔案，檢查並預覽</button><input id="xlsx-import" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>':'')+
   '<div class="hint">舊版排程可獨立存為歷史資料，按日期查看 1 廠、2 廠，不改目前排程。批次匯入範本會取代基本資料，只有老闆能確認。</div>'+
   '<button class="btn" data-act="x-copy-day" style="height:60px;justify-content:flex-start">複製 '+mdw(UI.date)+' 排程表（和原本 Excel 一樣的格式）</button>'+
   '<button class="btn" data-act="x-copy-all" style="height:60px;justify-content:flex-start">複製全部明細（每段一列）</button>'+
   ('<button class="btn primary" data-act="x-dl" style="height:60px;justify-content:flex-start">'+IC.down+'下載全部明細 CSV 檔</button>')+
   '<div class="hint">複製後，直接貼到 Google 試算表或 Excel 的 A1 格。</div>'};
},
"import-preview"(m){
  const hasSecondFactory=S.employees.some(e=>factoryOf(e)===2)||S.machines.some(x=>factoryOf(x)===2)||S.products.some(p=>p.steps.some(s=>factoryOf(s)===2));
  const hasGroups=(S.groups||[]).length>0;
  const hasGeneral=workCatalog(S).length>0||assignments(S).length>0||transferOrders(S).length>0;
  const counts=m.data&&[m.data.employees.length,m.data.machines.length,m.data.products.length,m.data.orders.length];
  const summary=counts?'<div class="pv-sum">員工 '+counts[0]+' 人、機台 '+counts[1]+' 台、產品 '+counts[2]+' 種、工單 '+counts[3]+' 張</div>':'';
  const problems=m.errors.length?'<div class="issues">'+m.errors.map(t=>'<div class="issue">'+esc(t)+'</div>').join('')+'</div>':'';
  const warning=hasGeneral?'<div class="issues"><div class="issue">匯入範本尚未包含獨立工作內容與一般工作排班，不能覆蓋已建立的資料。歷史排程仍可獨立匯入。</div></div>':hasGroups?'<div class="issues"><div class="issue">目前匯入範本未包含分組與組員對照，不能覆蓋已建立分組的正式名冊。歷史排程仍可獨立匯入。</div></div>':hasSecondFactory?'<div class="issues"><div class="issue">目前匯入範本沒有廠別欄，系統已有 2 廠資料。為避免整批覆蓋，這次不能確認匯入。</div></div>':
    !m.errors.length?'<div class="issues"><div class="issue">確認後將以 Excel 內容取代現有員工、機台、產品工序與工單，並清空現有 '+S.blocks.length+' 段排程；上班日設定保留。匯入後再按「自動排程」建立新班表。</div></div>':'';
  return {title:m.errors.length?'Excel 匯入 · 請修正檔案':'Excel 匯入 · 確認取代資料',
    body:'<div class="hint">檔案：'+esc(m.filename)+'</div>'+summary+problems+warning,
    foot:'<button class="btn" data-act="close">取消</button>'+(m.errors.length||hasSecondFactory||hasGroups||hasGeneral?'':'<button class="btn primary" data-act="x-import-confirm">確認匯入並清空舊排程</button>')};
},
"legacy-preview"(m){
  const legacy=m.legacy,day=legacy.days[m.date]||{"1廠":[],"2廠":[],overtime:{}};
  const datePicker='<div class="field"><span class="lab">原表日期</span><select id="legacy-date" aria-label="原表日期">'+legacy.dates.map(d=>'<option value="'+esc(d)+'"'+(d===m.date?' selected':'')+'>'+esc(d)+'</option>').join('')+'</select></div>';
  return {title:'舊版排程 · 唯讀預覽',body:
    '<div class="hint">檔案：'+esc(m.filename)+'。這是舊表的原始格位與文字，不會變成目前的時間方塊。</div>'+datePicker+
    legacyFactoryHTML(day,'1廠')+legacyFactoryHTML(day,'2廠')+
    '<div class="hint">存為歷史資料後，可從上方「歷史排程」按日期查看；現有示範排程不變。</div>'+
    (m.error?'<div class="issues"><div class="issue">'+esc(m.error)+'</div></div>':''),
    foot:'<button class="btn" data-act="close">取消</button>'+(canArchive()&&legacy.dates.length?'<button class="btn primary" data-act="legacy-save"'+(m.saving?' disabled':'')+'>'+(m.saving?'儲存中…':'存為歷史排程')+'</button>':'')};
},
"legacy-history"(m){
  if(m.loading)return {title:"歷史排程",body:'<div class="hint">正在讀取…</div>'};
  if(m.error)return {title:"歷史排程",body:'<div class="issues"><div class="issue">'+esc(m.error)+'</div></div>'};
  if(!m.archive)return {title:"歷史排程",body:'<div class="hint">尚未存入舊版排程。請到 Excel 選擇含「1廠」「2廠」的檔案。</div>',foot:'<button class="btn" data-act="export">選擇 Excel</button>'};
  const legacy=m.legacy,day=legacy?.days[m.date],names=m.archives;
  const source=names.length>1?'<div class="field"><span class="lab">來源檔案</span><select id="history-source" aria-label="來源檔案">'+names.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===m.archive.id?' selected':'')+'>'+esc(x.source_name)+'</option>').join('')+'</select></div>':'';
  const dates='<div class="field"><span class="lab">日期</span><select id="history-date" aria-label="歷史日期">'+(legacy?.dates||[]).map(d=>'<option value="'+esc(d)+'"'+(d===m.date?' selected':'')+'>'+esc(d)+'</option>').join('')+'</select></div>';
  const factories='<div class="seg" role="group" aria-label="廠別">'+['全部','1廠','2廠'].map(x=>'<button data-act="history-factory" data-v="'+x+'" aria-pressed="'+(m.factory===x)+'">'+x+'</button>').join('')+'</div>';
  const sections='<div class="seg" role="group" aria-label="歷史資料類型">'+[['day','每日安排'],['catalog','製作項目與人員']].map(([v,t])=>'<button data-act="history-section" data-v="'+v+'" aria-pressed="'+(m.section===v)+'">'+t+'</button>').join('')+'</div>';
  return {title:'歷史排程 · '+esc(m.archive.source_name),body:
    '<div class="hint">原檔日期 '+esc(m.archive.date_from)+'～'+esc(m.archive.date_to)+'。原檔名冊尚待確認，不影響目前排程。</div>'+source+sections+(m.section==='catalog'?'':dates)+factories+
    (m.factory==='全部'||m.factory==='1廠'?(m.section==='catalog'?legacyCatalogHTML(legacy?.catalog,'1廠'):legacyFactoryHTML(day,'1廠')):'')+
    (m.factory==='全部'||m.factory==='2廠'?(m.section==='catalog'?legacyCatalogHTML(legacy?.catalog,'2廠'):legacyFactoryHTML(day,'2廠')):''),
    foot:'<button class="btn" data-act="close">關閉</button>'};
}
};
/* ---------- 上班日設定 ---------- */
MODALS.cal=m=>{
  if(!m.draft)m.draft={week:[...S.cal.week],over:{...S.cal.over}};
  const D=m.draft,ro=!canCalendar(),T=todayStr();
  const openD=d=>{const o=D.over[d];return o?o==="work":!!D.week[parseD(d).getUTCDay()];};
  const hol=Object.keys(HOLI).filter(d=>d>=T&&d<=addDays(T,120)).sort();
  const body='<div class="field"><span class="lab">每週固定上班的日子</span><div class="toggles">'+[1,2,3,4,5,6,0].map(w=>tg("c-week",w,D.week[w],"週"+WD[w],"",ro)).join("")+'</div></div>'+
   '<div class="field"><span class="lab">接下來的國定假日（預設照常上班，只標示工資加倍）</span><div class="result">'+
   (hol.map(d=>'<div class="rline" style="align-items:center"><span style="flex:1">'+mdw(d)+"　"+esc(HOLI[d])+'</span>'+tg("c-day",d,openD(d),openD(d)?"上班":"停工","",ro)+'</div>').join("")||'<div class="empty">近期沒有國定假日</div>')+'</div></div>'+
   '<div class="hint">其他單日要停工或加開，直接到那一天按「改為停工／改為上班」。</div>';
  return {title:"上班日設定",body,foot:ro?'<button class="btn" data-act="close">關閉</button>':'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="c-save">儲存</button>'};
};
Object.assign(MODAL_ACT,{
  "manual-preview":()=>{
    const D=UI.modal?.t==="manual-add"&&UI.modal.draft;if(!D||readOnly)return;
    const cut=D.choice.lastIndexOf(":"),oid=D.choice.slice(0,cut),step=Number(D.choice.slice(cut+1));
    const o=order(oid),M=mach(D.machine),E=emp(D.employee),st=o&&prod(o.pid)?.steps[step];
    if(!o||!M||!E||!st){toast("請先選擇可做這道工序的機台與員工");return;}
    if(!(D.e>D.s)||D.s<DAY0||D.e>DAY1){toast("結束時間必須晚於開始時間，且在排程表範圍內");return;}
    if(absOf(UI.date,D.s)<nowAbs()){toast("不能排在已經過去的時段");return;}
    if(!isFinite(readyAbs(oid,step))){toast("前站尚未排完，請先安排前站工作");return;}
    const qty=manualQty(oid,step,D.e-D.s);
    if(!qty){toast("這段時間不足以完成 1 件，請拉長時間或檢查工序速率");return;}
    const b={id:uid(),oid,step,date:UI.date,s:D.s,e:D.e,m:M.id,emp:E.id,qty,pin:true};
    openModal({t:"drag-preview",proposal:dragPreview(b,b.m,b.s,{end:b.e,qty:b.qty})});
  },
  "drag-confirm":async()=>{
    const m=UI.modal,P=m?.t==="drag-preview"&&m.proposal;
    if(m?.applying)return;
    if(readOnly){toast('目前沒有修改排程的權限');return;}
    let next,moved;
    try{({state:next,block:moved}=acceptManualPreview(S,P));}
    catch(e){closeModal();toast(e.message);return;}
    m.applying=true;renderModal();
    pushUndo();S=next;
    const lines=[{k:"info",t:P.movedLabel+"："+P.source+" → "+P.target},
      ...P.unpinned.map(x=>({k:"info",t:x.label+"：解除固定後順延"})),...P.lines];
    const shifted=P.ops.filter(x=>![...x.prev,...x.next].some(b=>b.id===P.oldId)).length;
    const saved=await commit({kind:"move",title:(P.isNew?"手動排入 ":"手動調整 ")+P.movedLabel+(shifted?"，連帶調整 "+shifted+" 道工序":""),lines});
    if(!saved){
      undoStack.pop();
      if(S===next){S=JSON.parse(P.base);render();}
      closeModal();toast('未確認儲存，畫面已回復；請查看右上角同步狀態');return;
    }
    recentManualMove=moved.id;closeModal();render();
    const el=document.querySelector('.blk[data-bid="'+CSS.escape(moved.id)+'"]');el?.scrollIntoView({block:'center',inline:'nearest'});
    toast(P.movedLabel+' 已移到 '+mdw(moved.date)+' '+hm(moved.s)+'–'+hm(moved.e)+(P.unpinned.length?'；已解除 '+P.unpinned.length+' 段固定':''));
    setTimeout(()=>{if(recentManualMove===moved.id){recentManualMove=null;document.querySelector('.blk[data-bid="'+CSS.escape(moved.id)+'"]')?.classList.remove('just-applied');}},7000);
  },
  "c-week":a=>{if(!canCalendar())return;const w=+a.dataset.v,D=UI.modal.draft;D.week[w]=!D.week[w];rerender();},
  "c-day":a=>{if(!canCalendar())return;const d=a.dataset.v,D=UI.modal.draft;const def=!!D.week[parseD(d).getUTCDay()];const cur=D.over[d]?D.over[d]==="work":def;const nv=!cur;if(nv===def)delete D.over[d];else D.over[d]=nv?"work":"off";rerender();},
  "c-save":()=>{
    if(!canCalendar())return;
    const D=UI.modal.draft,openD=d=>{const o=D.over[d];return o?o==="work":!!D.week[parseD(d).getUTCDay()];};
    if(readOnly&&S.blocks.some(b=>futureOf(b)&&!openD(b.date))){toast("新設定會移動既有工作；還需要「調整與自動排程」權限");return;}
    pushUndo();S.cal={week:[...UI.modal.draft.week],over:{...UI.modal.draft.over}};
    for(const d of Object.keys(S.dayOT))if(!isOpen(d))delete S.dayOT[d];
    const r=closeDays();
    commit({kind:"ot",title:"更新上班日設定"+(r.aff.length?"，移走 "+r.aff.length+" 段工作":""),lines:r.lines},"calendar.manage");
    if(r.lines.length)showResult();else{closeModal();toast("已儲存。新開的上班日要排工作嗎？","重新排程",runAuto);}
  }
});
/* ---------- 預覽模式：套用前先看「原本 vs 調整後」 ---------- */
let PV=null;
const pvOpt=()=>PV&&(PV.opts.find(o=>o.id===PV.cur)||PV.opts[0]);
function diffOf(o){
  if(o.diff)return o.diff;
  const bk=new Set(PV.B.blocks.map(keyB)),ak=new Set(o.A.blocks.map(keyB));
  const gone=PV.B.blocks.filter(b=>!ak.has(keyB(b))),added=o.A.blocks.filter(b=>!bk.has(keyB(b)));
  const dates={};for(const b of [...gone,...added])dates[b.date]=(dates[b.date]||0)+1;
  return o.diff={gone,added,goneKeys:new Set(gone.map(keyB)),addedKeys:new Set(added.map(keyB)),dates};
}
function fmtDelta(m){
  const a=Math.abs(m);if(a<60)return a+" 分";
  if(a<1440)return Math.round(a/6)/10+" 小時";
  const d=Math.floor(a/1440),h=Math.round((a%1440)/60);return d+" 天"+(h?" "+h+" 小時":"");
}
// 一句話總結（寫給老闆與員工看，也寫進紀錄）
function pvSummary(o){
  const mt=o.mt,d=diffOf(o),parts=[];
  const later=mt.shifts.filter(s=>s.a>s.b),earlier=mt.shifts.filter(s=>s.a<s.b);
  if(later.length){const mx=later.reduce((p,s)=>s.a-s.b>p.a-p.b?s:p);parts.push(later.length+" 張工單完成時間變晚（最多 "+mx.code+" 晚 "+fmtDelta(mx.a-mx.b)+"）");}
  if(earlier.length)parts.push(earlier.length+" 張工單提早完成");
  parts.push(mt.lateCodes.length?mt.lateCodes.join("、")+" 會超過期限":"所有工單都趕得上期限");
  const dates=Object.keys(d.dates).sort();
  if(dates.length)parts.push("影響 "+dates.length+" 天（"+dates.map(md).join("、")+"）");
  const names=[...new Set([...d.gone,...d.added].map(b=>b.emp))].map(id=>emp(id)&&emp(id).name).filter(Boolean);
  if(names.length)parts.push(names.join("、")+" 的班表有變");
  if(mt.otH>0)parts.push("加班 +"+mt.otH+" 小時");
  return parts.join("；")+"。";
}
function peopleOf(o){
  const d=diffOf(o),by={};
  const add=(b,t)=>{(by[b.emp]=by[b.emp]||[]).push({b,t});};
  d.gone.forEach(b=>add(b,"out"));d.added.forEach(b=>add(b,"in"));
  return Object.entries(by).map(([id,l])=>({id,name:emp(id)?emp(id).name:"?",color:empColor(id),
    items:l.sort((x,y)=>bAbs(x.b)-bAbs(y.b)||(x.t==="out"?-1:1)),n:{in:l.filter(x=>x.t==="in").length,out:l.filter(x=>x.t==="out").length}}));
}
const itemTxt=b=>{const o=order(b.oid);return mdw(b.date)+" "+hm(b.s)+"–"+hm(b.e)+"　"+b.m+" 機台　"+(o?o.code:"")+" "+stepName(b)+" "+b.qty+"件";};
function peopleHTML(o){
  const P=peopleOf(o);
  if(!P.length)return '<div class="okbox">沒有人的班表改變</div>';
  return '<div class="people">'+P.map(p=>'<div class="person"><div class="person-h"><span class="sw" style="background:'+p.color+'">'+esc(p.name[0])+'</span><b>'+esc(p.name)+'</b>'+
    (p.n.out?'<span class="tag bad">拿掉 '+p.n.out+'</span>':"")+(p.n.in?'<span class="tag ok">新增 '+p.n.in+'</span>':"")+'</div>'+
    p.items.map(x=>'<div class="pitem '+x.t+'"><span class="k '+(x.t==="in"?"swap":"fail")+'">'+(x.t==="in"?"新增":"拿掉")+'</span><span class="num">'+esc(itemTxt(x.b))+'</span></div>').join("")+'</div>').join("")+'</div>';
}
// 跨日影響圖：每張工單一列，上面灰色是原本、下面彩色是調整後，紅線是期限
function ganttHTML(o){
  const d=diffOf(o);
  const showBefore=PV.mode!=="new",showAfter=PV.mode!=="orig";
  const oids=[...new Set([...d.gone,...d.added].map(b=>b.oid))].filter(id=>order(id));
  if(!oids.length)return '<div class="okbox">沒有工單的時間改變</div>';
  const bef=id=>PV.B.blocks.filter(b=>b.oid===id),aft=id=>o.A.blocks.filter(b=>b.oid===id);
  let lo=null,hi=null;
  for(const id of oids){for(const b of [...bef(id),...aft(id)]){if(!lo||b.date<lo)lo=b.date;if(!hi||b.date>hi)hi=b.date;}const du=order(id).due;if(!hi||du>hi)hi=du;}
  const days=[];for(let x=lo;x<=hi&&days.length<21;x=addDays(x,1))days.push(x);
  const N=days.length,x=(ds,m)=>{const i=dayNum(ds)-dayNum(lo);return Math.max(0,Math.min(100,(i+(Math.max(DAY0,Math.min(DAY1,m))-DAY0)/720)/N*100));};
  const bars=(list,cls)=>list.map(b=>'<span class="g-seg '+cls+'" style="left:'+x(b.date,b.s)+'%;width:'+Math.max(0.6,x(b.date,b.e)-x(b.date,b.s))+'%;'+(cls==="aft"?"background:"+empColor(b.emp):"")+'"></span>').join("");
  const head='<div class="g-row g-headrow"><div class="g-lab"></div><div class="g-track g-days">'+days.map(ds=>{const di=dayInfo(ds);
    return '<span class="g-day'+(di.open?"":" off")+(ds===todayStr()?" today":"")+'" style="width:'+(100/N)+'%"><b class="num">'+md(ds)+'</b><small>'+WD[di.w]+(di.type==="hol"?" 假":"")+'</small></span>';}).join("")+'</div><div class="g-delta"></div></div>';
  const rows=oids.map(id=>{
    const O=order(id),fb=o.mt.fb[id],fa=o.mt.fa[id];
    let delta="",cls="";
    if(fb&&fb.fin&&fa&&fa.fin){const m=fa.fin-fb.fin;delta=m>0?"晚 "+fmtDelta(m):m<0?"提早 "+fmtDelta(m):"完成時間不變";cls=m>0?"later":m<0?"earlier":"";}
    else if(fa&&fa.fin)delta="新排入";
    const late=fa&&fa.k==="late";
    return '<div class="g-row"><div class="g-lab"><b class="num">'+esc(O.code)+'</b><small>'+priTag(O)+'期限 '+md(O.due)+'</small></div>'+
      '<div class="g-track'+(showBefore&&showAfter?"":" single")+'">'+days.map((ds,i)=>dayInfo(ds).open?"":'<span class="g-offbg" style="left:'+(i/N*100)+'%;width:'+(100/N)+'%"></span>').join("")+
      (showBefore?'<div class="g-lane bef">'+bars(bef(id),"bef")+'</div>':"")+(showAfter?'<div class="g-lane aft">'+bars(aft(id),"aft")+'</div>':"")+
      '<span class="g-due" style="left:'+x(O.due,DAY1)+'%" title="期限"></span></div>'+
      '<div class="g-delta '+cls+'"><b>'+delta+'</b>'+(late?'<span class="tag bad">超過期限</span>':'<span class="tag ok">準時</span>')+'</div></div>';}).join("");
  return '<div class="gantt">'+head+rows+'</div><div class="legend" style="margin-top:8px">'+
    (showBefore?'<span><i style="background:var(--line)"></i>原本</span>':"")+
    (showAfter?'<span><i style="background:#FFE14D"></i>調整後（顏色＝員工）</span>':"")+
    '<span><i style="background:var(--bad)"></i>期限</span><span>斜線＝停工日</span></div>';
}
function pvCtx(o){
  const d=diffOf(o);
  const movedSteps=new Set(d.gone.map(b=>b.oid+"|"+b.step));
  const cls=b=>movedSteps.has(b.oid+"|"+b.step)?"pv-mv":"pv-add";   // 搬動＝黃，新增＝綠
  if(PV.mode==="orig")return {pv:true,mark:d.goneKeys,markCls:"willchg",ghosts:[],extraFaults:PV.faultsNew};
  if(PV.mode==="new")return {pv:true,mark:d.addedKeys,markCls:cls,ghosts:[]};
  return {pv:true,mark:d.addedKeys,markCls:cls,ghosts:d.gone,lanes:true};
}
// 每套方案卡片上的四個關鍵數字（寫給老闆看）
function planCardMetrics(o){
  const d=diffOf(o);
  let maxLate=0;
  for(const [id,fa] of Object.entries(o.mt.fa||{})){
    const O=order(id);
    if(!O||fa.k!=="late")continue;
    const days=fa.date?Math.max(0,Math.round((parseD(fa.date)-parseD(O.due))/864e5)):0;
    if(days>maxLate)maxLate=days;
  }
  return {late:o.mt.lateCodes.length,maxLate,people:new Set([...d.gone,...d.added].map(b=>b.emp).filter(Boolean)).size,ot:o.mt.otH>0};
}
// 「再給條件重排」面板：四個預設條件＋一句白話，只多一輪預覽、不套用
function rerunHTML(){
  const R=PV.rerun;
  const chip=(k,t)=>'<button class="tg" data-act="pv-rchip" data-v="'+k+'" aria-pressed="'+!!R[k]+'">'+t+'</button>';
  const orders=withState(pvOpt().A,()=>[...S.orders]);
  const machines=withState(pvOpt().A,()=>[...S.machines]);
  return '<div class="drawer-section-title"><b>再給條件重排</b></div>'+
    '<div class="toggles pv-rchips">'+chip('noLate','這張單不能晚')+chip('keepPeople','少換人')+chip('ot','可加班')+chip('pinMach','這台機別動')+'</div>'+
    (R.noLate?'<div class="field"><label for="pv-r-order">哪張單不能晚</label><select class="inp" id="pv-r-order">'+orders.map(o=>'<option value="'+esc(o.code)+'"'+(R.order===o.code?' selected':'')+'>'+esc(o.code)+' '+esc(prod(o.pid)?.name||'')+' · 期限 '+md(o.due)+'</option>').join('')+'</select></div>':'')+
    (R.pinMach?'<div class="field"><label for="pv-r-machine">哪台機器不要動</label><select class="inp" id="pv-r-machine">'+machines.map(m=>'<option value="'+esc(m.id)+'"'+(R.machine===m.id?' selected':'')+'>'+esc(m.id+' '+m.label)+'</option>').join('')+'</select></div>':'')+
    '<div class="field"><label for="pv-r-text">一句白話（可選）</label><input class="inp" id="pv-r-text" maxlength="80" value="'+esc(R.text)+'" placeholder="例：星期五前一定要出 AVK-5" autocomplete="off"></div>'+
    '<button class="btn primary pv-rerun-btn" data-act="pv-rerun"'+(R.busy?' disabled':'')+'>'+(R.busy?'OR-Tools 計算中…':'按這些條件再排一輪')+'</button>'+
    '<div class="hint">只會多一輪「照你的條件」的預覽方案；沒按「用這套」之前，正式班表不會變。</div>';
}
function pvPanelHTML(o){
  const d=diffOf(o),dates=Object.keys(d.dates).sort();
  const cards=PV.opts.map(x=>{const ai=PV.ai&&PV.ai.pick===x.id,m=planCardMetrics(x);
    return '<button class="pv-opt'+(x.id===o.id?' sel':'')+'" data-act="pv-pick" data-v="'+x.id+'" aria-pressed="'+(x.id===o.id)+'"><b>'+esc(x.name)+'</b>'+
    '<small>會晚 '+m.late+' 張'+(m.maxLate?' · 最晚延遲 '+m.maxLate+' 天':'')+' · 換 '+m.people+' 人 · '+(m.ot?'要加班':'不加班')+'</small>'+
    '<span>'+(x.hint?'<span class="tag">照你的條件</span>':'')+(x.applicable===false?'<span class="tag bad">不可套用</span>':"")+(x.best?'<span class="tag ok">系統推薦</span>':"")+(ai?'<span class="tag ai">AI 推薦</span>':"")+'</span></button>';}).join("");
  const sub=[["gantt","跨日影響圖"],["people","每個人的變動"],["lines","系統怎麼調"]];
  const body=PV.tab==="people"?peopleHTML(o):PV.tab==="lines"?'<div class="hint">'+esc(o.desc)+'</div>'+resultHTML(o.lines):ganttHTML(o);
  let ai="";
  if(SAMPLE){
    if(!PV.ai)ai='<button class="btn ai-btn" data-act="pv-ai">問 AI：該選哪一個？</button>';
    else if(PV.ai.loading)ai='<div class="aibox">AI 正在比較這 '+PV.opts.length+' 個方案…</div>';
    else if(PV.ai.err)ai='<div class="aibox">'+esc(PV.ai.err)+'</div>'+(PV.ai.retry?'<button class="btn ai-btn" data-act="pv-ai">再問一次</button>':"");
    else ai='<div class="aibox"><b>AI 建議：'+esc((PV.opts.find(x=>x.id===PV.ai.pick)||{name:PV.ai.pick}).name)+'</b><div>'+esc(PV.ai.reason)+'</div>'+(PV.ai.watch?'<div class="hint">注意：'+esc(PV.ai.watch)+'</div>':"")+
      (PV.ai.pick!==o.id?'<button class="btn" data-act="pv-pick" data-v="'+esc(PV.ai.pick)+'">看那套方案</button>':"")+'</div>';
  }else ai='<div class="hint">AI 助理下一階段由伺服器提供。</div>';
  const strip='<section class="pv" aria-label="預覽">'+
   '<div class="pv-h"><span class="pv-badge">'+(PV.savedScenario?'保存情境':'預覽中')+'</span><div class="pv-t"><b>'+esc(PV.title)+'</b><small>'+(PV.savedScenario?'只讀比較；正式班表與現場進度不會變更。':'還沒套用，排程不會變。左邊甘特表＝選中的那套；差異色塊＝綠新增／黃搬動／虛線會移走。　計算：'+planEngineLabel(o.solverMethod,PV.engine))+'</small></div><div class="spacer"></div>'+
   (canScenarios()&&!PV.savedScenario?'<button class="btn" data-act="scenario-save">保存試排情境</button>':'')+
   '<button class="btn" data-act="pv-cancel">'+(PV.savedScenario?'結束查看':'取消')+'</button><button class="btn primary" data-act="pv-apply"'+(o.applicable===false?' disabled':'')+'>用這套</button></div>'+
   '<div class="pv-row"><div class="seg" role="group" aria-label="預覽圖與下方排程表顯示"><button data-act="pv-mode" data-v="cmp" aria-pressed="'+(PV.mode==="cmp")+'">對照</button><button data-act="pv-mode" data-v="new" aria-pressed="'+(PV.mode==="new")+'">調整後</button><button data-act="pv-mode" data-v="orig" aria-pressed="'+(PV.mode==="orig")+'">原本</button></div>'+
   '<span class="hint">'+(PV.mode==="cmp"?"灰虛線＝原本位置，彩色＝調整後（綠新增、黃搬動）":PV.mode==="new"?"只看調整後：綠框＝新增的工作，黃框＝搬動的工作":"只看原本；紅虛線＝會被移走的工作")+'</span><div class="spacer"></div>'+
   '<div class="pv-dates"><span class="hint">影響的日期</span>'+(dates.map(ds=>'<button class="pv-date" data-act="pv-date" data-v="'+ds+'" aria-pressed="'+(ds===UI.date)+'"><b class="num">'+md(ds)+'</b><small>'+WD[parseD(ds).getUTCDay()]+' · '+d.dates[ds]+' 處</small></button>').join("")||'<span class="hint">無</span>')+'</div></div>'+
   '</section>';
  const drawer='<aside class="pv-drawer'+(PV.sheetCollapsed?' collapsed':'')+'" aria-label="方案比較">'+
   '<div class="pv-drawer-h"><span class="drawer-grip" data-act="pv-sheet" aria-hidden="true"></span><h3>方案比較　'+PV.opts.length+' 套</h3><button class="iconbtn" data-act="pv-sheet" aria-label="'+(PV.sheetCollapsed?'展開':'收合')+'">'+(PV.sheetCollapsed?'▴':'▾')+'</button></div>'+
   '<div class="pv-drawer-b">'+
   '<div class="pv-opts">'+cards+'</div>'+
   (o.applicable===false?'<div class="pv-sum"><b>目前不能套用：</b>'+o.diagnostics.map(esc).join('；')+'</div>':'')+
   '<div class="pv-sum"><b>'+esc(o.name)+'：</b>'+esc(pvSummary(o))+'</div>'+
   '<div class="pv-tabs">'+sub.map(([k,t])=>'<button class="tg" data-act="pv-tab" data-v="'+k+'" aria-pressed="'+(PV.tab===k)+'">'+t+'</button>').join("")+'</div>'+body+
   (PV.savedScenario?'<div class="hint">保存時的說明：'+esc(o.desc||'—')+'</div>':ai+'<div class="field"><label for="pv-note">備註（會寫進紀錄）</label><input class="inp" id="pv-note" value="'+esc(PV.note)+'" placeholder="例：馬達燒掉，廠商下午來修" autocomplete="off"></div>')+
   (PV.savedScenario?'':rerunHTML())+
   '</div></aside>';
  return strip+drawer;
}
function openPlans(title,logTitle,kind,applyEvent,strategies,extra={}){
  if(S.setupPending){toast("原檔名冊與工作資料尚待確認，暫不開放排程");return;}
  if(extra.event&&STORE.kind==="supabase"&&!STORE.can("schedule.manage")&&SOLVER.up===false){toast("這項授權需要 OR-Tools 服務在線才能安全調整既有排程");return;}
  if(extra.event&&SOLVER.up!==false)return openPlansSolver(title,logTitle,kind,applyEvent,strategies,extra);
  return openPlansLocal(title,logTitle,kind,applyEvent,strategies,extra);
}
async function openPlansSolver(title,logTitle,kind,applyEvent,strategies,extra){
  if(assignments(S).length&&!SOLVER.capabilities.includes('work_assignments_v1')){
    toast('OR-Tools 服務尚未支援一般工作占用，改用瀏覽器備援');
    return openPlansLocal(title,logTitle,kind,applyEvent,strategies,extra);
  }
  const timeLimit=planTimeLimit(S);
  toast(timeLimit>3?"資料量較大，OR-Tools 計算可能需要數十秒…":"OR-Tools 計算中，請稍候…");
  const now={date:todayStr(),min:nowMin()};
  let plan;
  try{
    plan=STORE.kind==="supabase"?await SOLVER.plansDb(extra.event,now,STORE.jwt(),timeLimit):await SOLVER.plans(toSnapshot(S,HOLI),extra.event,now,timeLimit);
  }catch(e){
    if(e.status&&e.status<500){toast(e.message);return;}
    if(STORE.kind==="supabase"&&!STORE.can("schedule.manage")){toast("OR-Tools 服務暫時無法使用；你的權限不包含瀏覽器內的完整重排");return;}
    toast("排程服務沒有回應，改用瀏覽器內的演算法");
    return openPlansLocal(title,logTitle,kind,applyEvent,strategies,extra);
  }
  if(!plan.options||!plan.options.length){toast("算不出可行的排法，請手動處理");return;}
  const B=JSON.parse(JSON.stringify(S)),ev={date:plan.date,oid:extra.event.order?extra.event.order.id:undefined};
  const opts=plan.options.map(o=>{const A=applyOption(B,o);return {id:o.id,name:o.name,desc:o.desc,lines:o.lines||[],mt:measure(B,A,ev),score:o.score,best:!!o.recommended,applicable:o.applicable!==false,diagnostics:o.diagnostics||[],state:JSON.stringify(A),A,sec:o.solve_seconds,solverMethod:o.solver_method,previewId:plan.preview_id||null};});
  const fi=plan.options[0].effects&&plan.options[0].effects.faults_insert;
  enterPreview({title,logTitle,kind,base:JSON.stringify(B),B,opts,ev,extra:{...extra,fid:fi&&fi[0]?fi[0].id:extra.fid,previewId:plan.preview_id||null,engine:"OR-Tools"}});
}
function openPlansLocal(title,logTitle,kind,applyEvent,strategies,extra={}){
  toast("正在計算幾種排法…");
  setTimeout(()=>{
    const r=buildPlans(applyEvent,strategies,kind);
    if(!r.opts.length){toast("算不出可行的排法，請手動處理");return;}
    for(const o of r.opts)o.A=JSON.parse(o.state);
    const {aff,...ev}=r.ev;
    enterPreview({title,logTitle,kind,base:r.base,B:JSON.parse(r.base),opts:r.opts,ev,extra:{...extra,engine:"瀏覽器"}});
  },30);
}
function enterPreview({title,logTitle,kind,base,B,opts,ev,extra}){
  for(const o of opts){try{assertExecutionProtected(B,o.A);validateGeneralWork(o.A,{today:todayStr(),baseAssignments:assignments(B)});}catch(e){o.applicable=false;o.diagnostics=[...(o.diagnostics||[]),e.message];}}
  {
    const best=opts.find(o=>o.best)||opts[0];
    const fk=f=>[f.date,f.s,f.e].join("|"),faultsNew=[];
    for(const M of best.A.machines){const bm=B.machines.find(x=>x.id===M.id);const have=new Set((bm?bm.faults:[]).map(fk));for(const f of M.faults)if(!have.has(fk(f)))faultsNew.push({m:M.id,...f});}
    PV={title,logTitle,kind,base,B,opts,cur:best.id,mode:"cmp",tab:"gantt",ai:null,note:"",ev,faultsNew,sheetCollapsed:false,rerun:{noLate:false,keepPeople:false,ot:false,pinMach:false,order:"",machine:"",text:"",busy:false},...extra};
    closeModal();
    const dates=Object.keys(diffOf(best).dates).sort();
    UI.date=dates.find(x=>x>=todayStr())||dates[0]||ev.date||UI.date;UI.view="day";
    const t=$("#toast");if(t)t.hidden=true;
    render();window.scrollTo(0,0);
  }
}
async function askAI(){
  if(!PV||!SAMPLE)return;const P=PV;
  P.ai={loading:true};render();
  const crit=P.kind==="recover"
    ?"1. 工單的最晚完成日不能延誤，急件更優先；2. 讓因故障變晚的工單盡量回到原本或更早；3. 盡量不要動到其他天已經排好的行程；4. 少加班。"
    :"1. 工單的最晚完成日（硬性期限）不能延誤，急件更優先；2. 盡量不要動到其他天已經排好的行程；3. 少加班；4. 異動越少越好，現場比較不會亂。";
  const data={狀況:P.title,
    工單:withState(P.opts[0].A,()=>S.orders.map(o=>({單號:o.code,優先:["特急","急","一般","不急"][o.pri],期限:o.due}))),
    方案:P.opts.map(o=>({代號:o.id,名稱:o.name,做法:o.desc,摘要:withState(o.A,()=>pvSummary(o)),延誤工單:o.mt.lateCodes,異動段數:o.mt.moved,影響其他天段數:o.mt.otherDays,增加加班小時:o.mt.otH,提早小時:o.mt.gainH,主要變動:o.lines.slice(0,8).map(l=>l.t)}))};
  const prompt="你是工廠的排程助理。現場發生狀況，系統已經算好幾個重新排程方案，請幫主管選一個。\n判斷順序："+crit+
    "\n用繁體中文、口語、短句，寫給工廠主管看。只回傳 JSON：{\"pick\":\"方案代號\",\"reason\":\"為什麼選它，最多兩句\",\"watch\":\"執行時要注意的一件事，沒有就空字串\"}\n\n資料：\n"+JSON.stringify(data);
  try{
    const r=await SAMPLE.json(prompt,{modelTier:"quick"});
    if(PV!==P)return;
    const pick=String(r&&r.pick||"").replace(/[^A-Z0-9]/gi,"").toUpperCase().slice(0,2);
    P.ai=P.opts.some(o=>o.id===pick)?{pick,reason:String(r.reason||""),watch:String(r.watch||"")}:{err:"AI 的回答看不懂，請再問一次",retry:true};
  }catch(e){
    const c=e&&e.code;
    if(["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(c)){SAMPLE=null;P.ai={err:"這個畫面沒有開啟 AI，請看系統推薦"};}
    else P.ai={err:c==="rate_limited"?"AI 使用太頻繁，請稍後再問":"AI 暫時沒有回應（"+(c||"未知")+"）",retry:c!=="rate_limited"};
  }
  if(PV===P)render();
}
async function pvApply(){
  const o=pvOpt();if(!o)return;
  if(o.applicable===false){toast('這個方案尚無法套用，請查看原因與建議');return;}
  try{assertExecutionProtected(S,o.A);}catch(e){toast(e.message);return;}
  const P=PV,noteEl=$("#pv-note");if(noteEl)P.note=noteEl.value.trim();
  if(P.previewId&&STORE.applyPlan){
    toast("套用中…");
    try{await STORE.applyPlan(o.previewId||P.previewId,o.id,P.note,P.ai&&P.ai.pick?{pick:P.ai.pick,reason:P.ai.reason}:null);}
    catch(e){toast(e.message);if(e.conflict){PV=null;await reloadFromStore();}return;}
    pushUndo();PV=null;lastLocalWrite=Date.now();await reloadFromStore();showResult();return;
  }
  const sumTxt=withState(o.A,()=>pvSummary(o));
  const people=withState(o.A,()=>peopleOf(o).map(p=>({name:p.name,items:p.items.map(x=>(x.t==="in"?"新增 ":"拿掉 ")+itemTxt(x.b))})));
  const shifts=o.mt.shifts.map(s=>({code:s.code,b:s.b,a:s.a}));
  pushUndo();S=JSON.parse(o.state);
  if(P.kind==="fault"&&P.fid){
    const now=nowAbs();
    for(const M of S.machines)for(const f of M.faults)if(f.id===P.fid)
      f.orig=diffOf(o).gone.filter(b=>bEnd(b)>now).map(({oid,step,date,s,e,m,emp,qty})=>({oid,step,date,s,e,m,emp,qty}));
  }
  PV=null;
  commit({kind:P.kind==="recover"?"fault":P.kind,title:P.logTitle+"：採用「"+o.name+"」",lines:o.lines,sum:sumTxt,shifts,people,
    ai:P.ai&&P.ai.pick?{pick:P.ai.pick,reason:P.ai.reason}:null,note:P.note,
    alts:P.opts.map(x=>"「"+x.name+"」：延誤 "+x.mt.lateCodes.length+"、異動 "+x.mt.moved+"、影響他天 "+x.mt.otherDays+"、加班 "+x.mt.otH+" 小時"+(x===o?"（採用）":""))},
    ["fault","leave","recover"].includes(P.kind)?"incidents.manage":P.kind==="order"?"orders.manage":"schedule.manage");
  showResult();
}
Object.assign(MODAL_ACT,{
  "pv-pick":a=>{PV.cur=a.dataset.v;const d=diffOf(pvOpt());if(!d.dates[UI.date]){const ds=Object.keys(d.dates).sort();if(ds.length)UI.date=ds.find(x=>x>=todayStr())||ds[0];}render();},
  "pv-mode":a=>{PV.mode=a.dataset.v;render();},
  "pv-tab":a=>{PV.tab=a.dataset.v;render();},
  "pv-date":a=>{UI.date=a.dataset.v;UI.view="day";render();},
  "pv-ai":()=>askAI(),
  "pv-apply":()=>pvApply(),
  "pv-cancel":()=>{PV=null;render();toast("已取消，排程沒有改變");maybeReload();},
  "pv-sheet":()=>{PV.sheetCollapsed=!PV.sheetCollapsed;render();},
  "pv-rchip":a=>{
    const R=PV.rerun,k=a.dataset.v;R[k]=!R[k];
    if(k==="noLate"&&R.noLate&&!R.order){
      const cur=pvOpt();
      const code=cur.mt.lateCodes[0]||(PV.ev&&PV.ev.oid?order(PV.ev.oid)?.code:"")||S.orders[0]?.code||"";
      if(code)R.order=code;
    }
    if(k==="pinMach"&&R.pinMach&&!R.machine){const m=shownMachines()[0];if(m)R.machine=m.id;}
    render();
  },
  "pv-rerun":()=>runRerun()
});
// 把口語條件送給現有求解器，多算一輪預覽（R1/R2…）；不套用、不覆蓋原有方案
async function runRerun(){
  const P=PV,R=P&&P.rerun;
  if(!P||!R||R.busy||P.savedScenario)return;
  const orderCode=($("#pv-r-order")?.value||R.order||"").trim();
  const machine=($("#pv-r-machine")?.value||R.machine||"").trim();
  const text=($("#pv-r-text")?.value||R.text||"").trim();
  R.order=orderCode;R.machine=machine;R.text=text;
  if(!R.noLate&&!R.keepPeople&&!R.ot&&!R.pinMach&&!text){toast("先勾一個條件，或寫一句白話");return;}
  if(SOLVER.up===false){toast("條件重排需要 OR-Tools 服務在線；目前連不上");return;}
  const hints={};
  if(R.noLate&&orderCode)hints.no_late_orders=[orderCode];
  if(R.keepPeople)hints.keep_people=true;
  if(R.ot)hints.allow_overtime=true;
  if(R.pinMach&&machine)hints.pin_machines=[machine];
  if(text)hints.note=text;
  R.busy=true;render();
  try{
    const now={date:todayStr(),min:nowMin()};
    const timeLimit=planTimeLimit(S);
    const plan=STORE.kind==="supabase"?await SOLVER.plansDb(P.event,now,STORE.jwt(),timeLimit,hints):await SOLVER.plans(toSnapshot(S,HOLI),P.event,now,timeLimit,hints);
    const fresh=(plan.options||[]).filter(x=>String(x.id).startsWith("R"));
    if(!fresh.length){R.busy=false;render();toast("照這些條件算不出新的排法；可以放寬一個條件再試");return;}
    const B=P.B,ev={date:plan.date,oid:P.event&&P.event.order?P.event.order.id:undefined};
    const newOpts=fresh.map(x=>{const A=applyOption(B,x);return {id:x.id,name:x.name,desc:x.desc,lines:x.lines||[],mt:measure(B,A,ev),score:x.score,best:false,applicable:x.applicable!==false,diagnostics:x.diagnostics||[],state:JSON.stringify(A),A,sec:x.solve_seconds,solverMethod:x.solver_method,previewId:plan.preview_id||null,hint:true};});
    for(const x of newOpts){try{assertExecutionProtected(B,x.A);validateGeneralWork(x.A,{today:todayStr(),baseAssignments:assignments(B)});}catch(e){x.applicable=false;x.diagnostics=[...(x.diagnostics||[]),e.message];}}
    P.opts=P.opts.filter(x=>!x.hint).concat(newOpts);   // 換掉上一輪的條件方案，原本 A～D 保留
    P.cur=newOpts[0].id;
    P.ai=null;
    R.busy=false;
    render();
    toast("已新增 "+newOpts.length+" 套「照你的條件」的方案；比較後按「用這套」才會生效");
  }catch(e){
    R.busy=false;render();
    if(e.status&&e.status<500)toast(e.message);
    else toast("重排沒有成功（"+(e.message||"服務沒有回應")+"）；正式班表沒有改變");
  }
}
document.addEventListener("input",e=>{if(e.target.id==="pv-note"&&PV)PV.note=e.target.value;});

/* ---------- 最新變更（讓員工一眼知道班表變了） ---------- */
function latestHTML(){
  const l=S.log.find(x=>x.sum);if(!l||Date.now()-l.t>3*864e5)return "";
  let seen="";try{seen=localStorage.getItem("fsched-seen")||"";}catch(e){}
  if(seen===l.id)return "";
  const dt=new Date(l.t);
  return '<section class="latest"><span class="pv-badge">最新變更</span><div class="latest-t"><b>'+esc(l.title)+'</b><div>'+esc(l.sum)+'</div>'+
    (l.people&&l.people.length?'<div class="chips" style="margin-top:6px">'+l.people.map(p=>'<span class="tag warn" style="font-size:14px;padding:3px 10px">'+esc(p.name)+' 班表有變</span>').join("")+'</div>':"")+
    '<small class="hint num">'+(dt.getMonth()+1)+"/"+dt.getDate()+" "+pad(dt.getHours())+":"+pad(dt.getMinutes())+'</small></div>'+
    '<div class="latest-b"><button class="btn" data-act="logone" data-id="'+l.id+'">看細節</button><button class="btn ghost" data-act="seen" data-id="'+l.id+'">知道了</button></div></section>';
}
MODAL_ACT.seen=a=>{try{localStorage.setItem("fsched-seen",a.dataset.id);}catch(e){}render();};
/* ---------- 突發狀況（一個入口） ---------- */
MODALS.incident=m=>{
  let body;
  if(m.step==="mach")body='<div class="hint">哪一台壞了？</div><div class="chips">'+shownMachines().map(M=>'<button class="mach big" data-act="inc-mach" data-v="'+M.id+'"><b>'+esc(M.id)+'</b><small>'+esc(M.label)+'</small></button>').join("")+'</div>';
  else if(m.step==="emp")body='<div class="hint">誰要請假？</div><div class="chips">'+shownEmployees().map(E=>'<button class="emp" data-act="inc-emp" data-v="'+E.id+'"><span class="sw" style="background:'+COLORS[E.color%COLORS.length]+'">'+esc(E.name[0])+'</span>'+esc(E.name)+'</button>').join("")+'</div>';
  else body='<div class="incs">'+
    '<button class="inc" data-act="inc-step" data-v="mach"><b>機台故障</b><small>系統算幾種排法讓你挑，AI 可以幫忙建議</small></button>'+
    '<button class="inc" data-act="inc-step" data-v="emp"><b>有人請假</b><small>先找人代班，不行再往後排</small></button>'+
    '<button class="inc" data-act="inc-rush"><b>急單／插單</b><small>新工單優先做，看會影響誰</small></button></div>';
  return {title:"突發狀況",body,foot:m.step?'<button class="btn" data-act="inc-back">上一步</button>':""};
};
MODALS.leaveq=m=>{
  const E=emp(m.id);if(!E)return null;
  if(!m.date)m.date=UI.date;
  let days="";for(let i=0;i<14;i++){const d=addDays(UI.date<todayStr()?todayStr():UI.date,i),di=dayInfo(d);
    days+=tg("lq-date",d,m.date===d,'<span class="num">'+md(d)+'</span><small>'+WD[di.w]+(di.open?"":" 停工")+'</small>',"leave");}
  const n=S.blocks.filter(b=>b.emp===E.id&&b.date===m.date).length;
  return {title:esc(E.name)+" 請假",body:'<div class="field"><span class="lab">哪一天？</span><div class="toggles">'+days+'</div></div>'+
    (E.leaves.includes(m.date)?'<div class="okbox">這天已經登記請假</div>':'<div class="hint">'+mdw(m.date)+" "+esc(E.name)+" 有 "+n+" 段工作要調整</div>"),
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="lq-go" '+(E.leaves.includes(m.date)?"disabled":"")+'>看調整方案</button>'};
};
Object.assign(MODAL_ACT,{
  "inc-step":a=>{UI.modal.step=a.dataset.v;renderModal();},
  "inc-back":()=>{UI.modal.step=null;renderModal();},
  "inc-mach":a=>openModal({t:"mach",id:a.dataset.v,fromInc:true}),
  "inc-emp":a=>openModal({t:"leaveq",id:a.dataset.v}),
  "inc-rush":()=>{if(canOrders())openModal({t:"ord",id:null,pri:0});else toast("目前沒有新增急單的權限");},
  "lq-date":a=>{UI.modal.date=a.dataset.v;renderModal();},
  "lq-go":()=>{
    if(!canIncidents())return;
    const eid=UI.modal.id,d=UI.modal.date,E=emp(eid);
    const n=S.blocks.filter(b=>b.emp===eid&&b.date===d&&futureOf(b)).length;
    if(!n){pushUndo();E.leaves.push(d);commit({kind:"leave",title:E.name+" "+md(d)+" 請假（當天沒有排工作）",lines:[]},"incidents.manage");closeModal();toast("已登記，當天沒有他的工作");return;}
    const ev=()=>{const X=emp(eid);X.leaves.push(d);return {date:d,mode:"leave",aff:S.blocks.filter(b=>b.emp===eid&&b.date===d&&futureOf(b))};};
    openPlans(E.name+" "+mdw(d)+" 請假，"+n+" 段工作要調整",E.name+" "+md(d)+" 請假","leave",ev,STRAT_EVENT,{event:{type:"leave",employee:eid,date:d}});
  }
});
/* ---------- 操作手冊 ---------- */
const HELP=[
 ["快速上手",[
  "先選 <b>1 廠、2 廠或跨廠</b>，再選日期。",
  "排班表像 Excel：<b>左邊是時間、上面是設備／工位，彩色方塊代表員工工作</b>。上方可切換「按設備看／按工作看」。",
  "按 <b>查看基本資料與最近變更</b>，再看員工、設備、工單或新增資料。",
  "其他設定在 <b>更多功能</b>；每個動作會自動儲存，右上角會顯示同步狀態。"],
  "名冊顯示「待確認」時，先核對資料；系統不會拿猜測的技能與工時自動排班。"],
 ["看排程",[
  "按 <b>‹ ›</b> 換日期，按 <b>今天</b> 回到今天；按日期可以直接選。",
  "按 <b>日班表／週班表</b> 切換。週檢視點任一格會跳到那一天。",
  "<b>紅框＋驚嘆號</b> = 有問題（人不會操作、請假、機台故障、時間撞到）。點方塊看原因。",
  "方塊上有 <b>釘</b> = 手動固定，系統自動排程不會動它；<b>急</b> = 特急工單。",
  "灰色斜線是午休，黃色是加班時段，紅色是機台故障時段。"],
  "工廠大螢幕請按 <b>更多功能 → 大螢幕</b>，字會變大、隱藏管理按鈕。"],
 ["拖曳調整",[
  "排程表按 <b>＋手動排班</b>，選工單工序、機台、員工與時段；先看預覽，確認後才會新增彩色方塊。",
  "按住方塊拖到別的時間或別台機台；拉方塊底邊可改結束時間和預計件數。放開會先看預覽，按「確認套用」才會儲存。手機、平板也可用手指操作。",
  "拖的時候：<b>綠框</b> = 可預覽；<b>黃框</b> = 後面的工作可能順延；<b>紅框</b> = 預覽會顯示問題。若撞到已固定的工作，預覽會明確提醒確認後將解除固定並移動它。",
  "被推的工作如果超過下班，會自動順延到下一個上班日，後面的工序也會跟著延。",
  "拖過的方塊會自動 <b>釘</b> 住。想讓系統重新安排它：點方塊 →「交給系統重排」。",
  "點一下方塊（不要拖）可以換人、換機台、選開始／結束時間或刪除。"],
  "一般自動排程不會推固定（釘）的方塊；手動拖曳撞到固定方塊時，須在預覽明確確認才會解除固定並順延。"],
 ["工單、插單、急單",[
  "按 <b>查看基本資料與最近變更</b>，在工單區按 <b>＋新增</b>：填工單號、數量、產品、最晚完成日和優先順序。",
  "按「下一步：選排法」，系統會列出三種排法：<b>排進空檔</b>（不動別人）、<b>插單優先</b>（擋到的較不急工作往後推）、<b>插單＋加班</b>。",
  "每個排法都會顯示：<b>本單幾號完成、會不會延誤、影響幾段工作、要加班幾小時</b>。選一個按「採用這個」。",
  "急單最快的路：<b>故障／請假 → 急單／插單</b>，優先順序會預設為特急。"],
  "工序時間是依「產品工序」的標準公式自動算的：數量 ÷ 每分鐘件數。"],
 ["突發狀況與預覽",[
  "按 <b>故障／請假 → 機台故障</b> → 點壞掉的機台 → 選從幾點開始、壞多久 → 按「確認故障」。",
  "畫面會進入 <b>預覽中</b>（藍框）：系統算好幾種排法，上方可以切換方案 A、B、C、D，<b>還沒按「套用」前排程都不會變</b>。",
  "<b>一句話總結</b>：幾張工單變晚、會不會超過期限、影響哪幾天、誰的班表有變。",
  "<b>對照／調整後／原本</b>：下方排程表切換。對照模式裡，<b>虛線框是原本位置、粗框是調整後</b>；週檢視會分上下兩排（原本、調整後）。",
  "<b>跨日影響圖</b>：每張工單一列，上排虛線是原本、下排彩色是調整後，紅線是期限，右邊寫「晚幾天幾小時」。跨好幾天的影響一眼就看得到。",
  "<b>每個人的變動</b>：每位員工哪一天被拿掉、新增了哪段工作，方便通知本人。",
  "<b>問 AI</b>：AI 依「期限不能延誤 → 少動其他天 → 少加班」幫你挑一個，並說明原因。可以在備註寫下故障原因，會一起寫進紀錄。"],
  "套用後可展開 <b>查看基本資料與最近變更</b>，核對誰的班表變了。"],
 ["機台修好了",[
  "點機台 → 在故障那一行按 <b>修好了</b>。故障時間會算到現在為止。",
  "系統一樣進入預覽，比較四種「把機台加回排程」的方法：",
  "<b>搬回原位</b>：因為故障被移走的工作，原本的時段還空著就搬回去（系統有記住故障前的位置）。",
  "<b>受影響工單往前補</b>：只重排被故障影響的工單，讓它們盡量提早，別的工單不動。",
  "<b>最佳化重排</b>：全部重新找最好的順序（固定的不動）；<b>維持現狀</b>：排程不動，空出來的時段留給新工單。",
  "看跨日影響圖和「提早幾小時」，選好按「套用」。"],
  "如果故障本來就排到某個時間，時間到了系統會自動把機台當成可用，不需要按。"],
 ["排程怎麼算",[
  "<b>硬規則</b>（一定遵守）：人要會操作那台機台、機台要能做那個產品、前站做完（或做到可傳下站的件數）才開始下站、避開請假、故障、午休與未開放的加班。",
  "按 <b>自動排班</b> 會先由 OR-Tools 排程服務計算；服務暫時連不上時會標示改用瀏覽器備援。",
  "預覽會比較期限、加班與受影響工作；在按「套用」前，正式班表不會改變。",
  "局部調整（請假、故障）會先試 <b>換人 → 換機台 → 延後 → 順延</b>，盡量不動其他天。"],
  "如有工作資料、技能或工時待確認，先核對再排；不要把待確認資料當成可行排程。"],
 ["員工、機台、工序設定",[
  "<b>員工</b>：展開「查看基本資料與最近變更」，點名字設定會操作的設備、同時最多顧幾台、加班與請假。",
  "<b>設備／工位</b>：同一區可點設備，核對廠別、工序與可生產產品。純人工工作不需要假機台。",
  "<b>產品工序</b>：在工單區按「產品工序」，設定每個產品的站別、速度與前後站交接。另在「更多功能 → 設定工作內容」管理獨立工作。",
  "順序不能跳：前一站沒做完（或還沒做到設定的件數），下一站不會開始。"],
  "新增機台後，記得到員工設定勾選誰會操作。"],
 ["上班日與加班",[
  "國定假日、週六、週日只是<b>標示</b>，有沒有上班看「上班日設定」。預設週一到週六上班、週日停工。",
  "某一天要停工或加開：切到那天，按上方的 <b>改為停工／改為上班</b>。",
  "要加班：按排程表上方的 <b>開加班到 20:00</b>，先看每位員工今天的預設意願，也可臨時改成可加班或不加班。",
  "固定星期與今天的臨時意願會一起影響排程；當天不可加班的人也不會排國定假日或週末出勤。"],
  "國定假日出勤工資加倍，畫面會用紅色提示。"],
 ["儲存、分享、Excel",[
  "每一個動作都會<b>自動儲存</b>。接上雲端資料庫後，所有打開的畫面（電視、手機、平板）會即時更新。",
  "右上角顯示儲存狀態；出現「同步失敗」時按一下重試。兩個人同時改時，後改的人會收到提醒並載入最新版本。",
  "現場電視、員工手機：由老闆建立帳號，角色設成「電視」或「員工」，就只能看不能改。",
  "<b>匯出 Excel</b>：下載當天彩色排班表或複製到試算表；也可從此處匯入範本。",
  "畫面太大太小：到 <b>更多功能 → 畫面設定</b> 調整比例或淺色／深色。"],
  "每台電腦的畫面大小、顏色各自記住，不影響別人。"]
];
MODALS.help=m=>{
  const [title,steps,tip]=HELP[m.sec];
  return {title:"操作說明",body:'<div class="help-nav">'+HELP.map((h,i)=>tg("help-sec",i,i===m.sec,esc(h[0]))).join("")+'</div>'+
    '<div class="help-sec"><h4 style="margin:0;font-size:21px;font-weight:900">'+esc(title)+'</h4><ol>'+steps.map(s=>'<li>'+s+'</li>').join("")+'</ol>'+(tip?'<div class="tip">'+tip+'</div>':"")+'</div>',
    foot:(m.sec>0?'<button class="btn" data-act="help-sec" data-v="'+(m.sec-1)+'">‹ 上一頁</button>':"")+'<div class="spacer"></div>'+(m.sec<HELP.length-1?'<button class="btn primary" data-act="help-sec" data-v="'+(m.sec+1)+'">下一頁 ›</button>':'<button class="btn primary" data-act="close">看完了</button>')};
};
MODAL_ACT["help-sec"]=a=>{UI.modal.sec=+a.dataset.v;const ov=$("#ov");renderModal();if(ov)$("#ov").scrollTop=0;};
function nextCode(){let n=S.orders.length+1;const used=new Set(S.orders.map(o=>o.code));while(used.has("W"+pad(n)))n++;return "W"+pad(n);}
/* ===== 10. 視窗內的動作 ===== */
function confirmStep(a,act){const m=UI.modal;if(m.confirm===act)return true;m.confirm=act;a.textContent="再按一次確認";return false;}
function toggleIn(arr,v){const i=arr.indexOf(v);if(i>=0)arr.splice(i,1);else arr.push(v);}
function showResult(){openModal({t:"logone",id:S.log[0].id});}
function captureFault(m){const fs=$("#f-fs"),nt=$("#f-note");if(fs)m.fs=+fs.value;if(nt)m.note=nt.value;}
Object.assign(MODAL_ACT,{
  "ot-day":a=>{if(!canCalendar())return;UI.modal.open=a.dataset.v==="1";rerender();},
  "ot-person":a=>{if(!canCalendar())return;const selected=a.dataset.v==="1";UI.modal.overrides[a.dataset.id]=selected===overtimeDefault(emp(a.dataset.id),UI.modal.date)?null:selected;rerender();},
  "ot-reset":a=>{if(!canCalendar())return;UI.modal.overrides[a.dataset.id]=null;rerender();},
  "ot-save":()=>saveDailyOT(UI.modal),
  "m-color":a=>{if(!canMaster())return;UI.modal.draft.color=+a.dataset.v;rerender();},
  "m-emp-factory":a=>{if(!canMaster())return;const d=UI.modal.draft;d.factory=+a.dataset.v;d.skills=d.skills.filter(id=>factoryOf(mach(id))===d.factory);rerender();},
  "m-skill":a=>{if(!canMaster())return;toggleIn(UI.modal.draft.skills,a.dataset.v);rerender();},
  "m-ot-week":a=>{if(!canMaster())return;toggleIn(UI.modal.draft.otWeekdays,+a.dataset.v);UI.modal.draft.otWeekdays.sort();rerender();},
  "m-leave":a=>{if(!canMaster())return;toggleIn(UI.modal.draft.leaves,a.dataset.v);rerender();},
  "m-emp-save":()=>{
    syncInputs();const m=UI.modal,D=m.draft;D.name=D.name.trim();
    D.factory=factoryOf(D);D.skills=D.skills.filter(id=>factoryOf(mach(id))===D.factory);
    if(!D.name){toast("請輸入姓名");return;}
    if(!Number.isInteger(D.maxMachines)||D.maxMachines<1||D.maxMachines>100){toast("同時顧機台上限請填 1–100 台");return;}
    const old=emp(D.id);
    if(old&&readOnly&&S.blocks.some(b=>b.emp===D.id&&futureOf(b))){toast("這位員工已有未來排程；修改後若需搬動工作，還需要「調整與自動排程」權限");return;}
    if(old&&D.maxMachines<old.maxMachines){
      const future=S.blocks.filter(b=>b.emp===D.id&&bEnd(b)>nowAbs());
      const overloaded=[...new Set(future.map(b=>b.date))].find(ds=>
        occupiedCapacityIntervals(S.blocks,ds,D,new Set(),1).some(([s,e])=>absOf(ds,e)>nowAbs()));
      if(overloaded){toast("降低上限後，"+mdw(overloaded)+"已有工作超過新上限；請先調整排程");return;}
    }
    D.otWeekdays=overtimeWeekdays(D);D.noOT=D.otWeekdays.length===0;
    pushUndo();
    const addLv=D.leaves.filter(d=>!old||!old.leaves.includes(d));
    const delLv=old?old.leaves.filter(d=>!D.leaves.includes(d)):[];
    if(old)Object.assign(old,JSON.parse(JSON.stringify(D)));else S.employees.push(JSON.parse(JSON.stringify(D)));
    const E=emp(D.id);
    const aff=S.blocks.filter(b=>b.emp===E.id&&futureOf(b)&&(E.leaves.includes(b.date)||!E.skills.includes(b.m)||factoryOf(E)!==factoryOf(mach(b.m))||(!overtimeAllowed(E,b.date)&&dayInfo(b.date).win.some(w=>w.ot&&b.s<w.e&&b.e>w.s))));
    const lines=aff.length?repair(aff,"leave"):[];
    let title=(old?"":"新增員工 ")+E.name;
    if(addLv.length)title+=" "+addLv.map(md).join("、")+" 請假";
    if(delLv.length)title+=" 取消 "+delLv.map(md).join("、")+" 請假";
    if(!addLv.length&&!delLv.length)title+=" 資料更新";
    if(aff.length)title+="，系統調整 "+aff.length+" 段工作";
    commit({kind:addLv.length||delLv.length?"leave":"edit",title,lines},"master.manage");
    if(lines.length)showResult();
    else{closeModal();delLv.length?toast("已取消請假。要把工作排回來嗎？","重新排程",runAuto):toast("已儲存");}
  },
  "m-emp-del":a=>{
    if(employeeGroups(S,UI.modal.id).length){toast('請先在「分組／部門」移除此員工的分組，再刪除員工');return;}
    if(!confirmStep(a,"m-emp-del"))return;
    const m=UI.modal,E=emp(m.id);pushUndo();
    if(readOnly&&S.blocks.some(b=>b.emp===E.id&&futureOf(b))){undoStack.pop();toast("這位員工仍有未來排程；刪除前還需要「調整與自動排程」權限");return;}
    E.skills=[];
    const aff=S.blocks.filter(b=>b.emp===E.id&&futureOf(b));
    const lines=aff.length?repair(aff,"leave"):[];
    S.blocks=S.blocks.filter(b=>b.emp!==E.id||!futureOf(b));
    S.employees=S.employees.filter(x=>x!==E);
    commit({kind:"edit",title:"刪除員工 "+E.name,lines},"master.manage");
    lines.length?showResult():closeModal();
  },
  "m-proc":a=>{UI.modal.draft.proc=a.dataset.v;rerender();},
  "m-mach-factory":a=>{if(!canMaster())return;UI.modal.draft.factory=+a.dataset.v;rerender();},
  "m-prod":a=>{if(!canMaster())return;toggleIn(UI.modal.draft.products,a.dataset.v);rerender();},
  "m-fd":a=>{captureFault(UI.modal);UI.modal.fd=+a.dataset.v;rerender();},
  "m-fault":()=>{
    if(!canIncidents())return;
    const m=UI.modal;captureFault(m);syncInputs();
    const M=mach(m.id),d=UI.date,s=m.fs;
    const e=m.fd>0?Math.min(DAY1,s+m.fd):m.fd===-1?(s<REG_END?REG_END:DAY1):DAY1;
    const note=(m.note||"").trim(),mid=M.id,fid=uid();
    const ev=()=>{
      const X=mach(mid);X.faults.push({id:fid,date:d,s,e,note});
      const aff=[];
      for(const b of [...S.blocks]){
        if(b.m!==mid||b.date!==d||b.e<=s||b.s>=e)continue;
        if(b.s<s){const nb=splitAt(b,s);if(nb)aff.push(nb);}else aff.push(b);
      }
      return {date:d,mid,fromAbs:absOf(d,s),aff,mode:"fault"};
    };
    const title=mid+" 機台故障 "+mdw(d)+" "+hm(s)+"–"+hm(e);
    const n=S.blocks.filter(b=>b.m===mid&&b.date===d&&b.e>s&&b.s<e).length;
    if(!n){pushUndo();ev();commit({kind:"fault",title:title+"（這段時間沒有排工作）",lines:[]},"incidents.manage");closeModal();toast("已記錄故障，這段時間沒有工作受影響");return;}
    openPlans(title+"，"+n+" 段工作受影響",title,"fault",ev,STRAT_EVENT,{fid,event:{type:"fault",machine:mid,date:d,start:s,end:e,note}});
  },
  // 機台修好了 → 進入預覽，比較幾種「把機台加回排程」的方法
  "m-fix":a=>{
    if(!canIncidents())return;
    const mid=UI.modal.id,idx=+a.dataset.v,F0=mach(mid).faults[idx],today=todayStr(),nm=Math.ceil(nowMin()/10)*10;
    const ev=()=>{
      const X=mach(mid),F=X.faults[idx];
      if(F.date===today&&nm>F.s&&nm<F.e)F.e=nm;            // 提早修好：故障只算到現在
      else if(F.date>today||(F.date===today&&nm<=F.s))X.faults.splice(idx,1);   // 還沒開始的故障直接取消
      F.fixed=true;F.fixedAt=new Date().toISOString();
      const orig=(F.orig||[]).filter(o=>order(o.oid));
      let oids=[...new Set(orig.map(o=>o.oid))];
      if(!oids.length)oids=[...new Set(S.blocks.filter(b=>{const o=order(b.oid),st=prod(o.pid).steps[b.step];return X.proc===st.proc&&X.products.includes(o.pid)&&bAbs(b)>=nowAbs();}).map(b=>b.oid))];
      return {date:F.date<today?today:F.date,mid,orig,oids};
    };
    openPlans(mid+" 機台修好了：怎麼把它加回排程？",mid+" 機台恢復（"+mdw(F0.date)+" 故障 "+hm(F0.s)+"–"+hm(F0.e)+"）","recover",ev,STRAT_RECOVER,{event:{type:"recover",fault_id:F0.id}});
  },
  "m-mach-save":()=>{
    syncInputs();const m=UI.modal,D=m.draft;
    D.factory=factoryOf(D);
    D.id=String(D.id).trim().toLowerCase();D.label=D.label.trim()||D.id;
    D.proc=String(D.proc).trim();if(!D.proc||D.proc.length>80){toast('請輸入 1–80 字的設備工序名稱');return;}
    if(!m.id){if(!/^[a-z0-9]{1,4}$/.test(D.id)){toast("代號請用英文或數字");return;}if(mach(D.id)){toast("代號 "+D.id+" 已經有了");return;}}
    pushUndo();
    const old=mach(D.id);
    if(old&&readOnly&&S.blocks.some(b=>b.m===D.id&&futureOf(b))){undoStack.pop();toast("這台設備已有未來排程；修改後若需搬動工作，還需要「調整與自動排程」權限");return;}
    if(old){D.faults=old.faults;Object.assign(old,JSON.parse(JSON.stringify(D)));}else S.machines.push(JSON.parse(JSON.stringify(D)));
    const M=mach(D.id);
    S.employees.filter(E=>factoryOf(E)!==factoryOf(M)).forEach(E=>{E.skills=E.skills.filter(id=>id!==M.id);});
    const aff=S.blocks.filter(b=>b.m===M.id&&futureOf(b)&&(()=>{const o=order(b.oid),st=prod(o.pid).steps[b.step];return M.proc!==st.proc||!M.products.includes(o.pid)||factoryOf(M)!==factoryOf(st)||factoryOf(emp(b.emp))!==factoryOf(M);})());
    const lines=aff.length?repair(aff,"fault"):[];
    commit({kind:"edit",title:(old?"更新":"新增")+"機台 "+M.id+" "+M.label+(aff.length?"，移走 "+aff.length+" 段工作":""),lines},"master.manage");
    if(lines.length)showResult();else{closeModal();toast(old?"已儲存":"已新增機台，記得到員工設定勾選誰會操作");}
  },
  "m-mach-del":a=>{
    if(!confirmStep(a,"m-mach-del"))return;
    const M=mach(UI.modal.id);pushUndo();
    if(readOnly&&S.blocks.some(b=>b.m===M.id&&futureOf(b))){undoStack.pop();toast("這台設備仍有未來排程；刪除前還需要「調整與自動排程」權限");return;}
    M.products=[];
    const aff=S.blocks.filter(b=>b.m===M.id&&futureOf(b));
    const lines=aff.length?repair(aff,"fault"):[];
    S.blocks=S.blocks.filter(b=>b.m!==M.id);
    S.machines=S.machines.filter(x=>x!==M);
    S.employees.forEach(E=>{E.skills=E.skills.filter(x=>x!==M.id);});
    commit({kind:"edit",title:"刪除機台 "+M.id,lines},"master.manage");
    lines.length?showResult():closeModal();
  },
  "o-prod":a=>{if(!canOrders())return;UI.modal.draft.pid=a.dataset.v;rerender();},
  "o-pri":a=>{if(!canOrders())return;UI.modal.draft.pri=+a.dataset.v;rerender();},
  "o-save":()=>{
    if(!canOrders())return;
    syncInputs();const m=UI.modal,D=m.draft;
    D.code=String(D.code).trim();D.qty=Math.round(+D.qty);
    if(!D.code||!(D.qty>0)||!D.due||!prod(D.pid)){toast("請填好工單號、數量、期限與產品");return;}
    const isNew=!order(D.id),snap={...D};
    const ev=()=>{
      const old=order(snap.id);
      if(old&&old.pid!==snap.pid)S.blocks=S.blocks.filter(b=>b.oid!==snap.id);
      if(old)Object.assign(old,snap);else S.orders.push({...snap});
      return {oid:snap.id,date:todayStr()};
    };
    const tag=["特急","急","一般","不急"][D.pri];
    const title=(isNew?"新增":"修改")+"工單 "+D.code+"（"+tag+"）"+prod(D.pid).name+" "+D.qty+"件";
    if(readOnly){
      const old=order(snap.id),P=old&&prod(old.pid);
      const planned=old&&P?Math.max(0,...P.steps.map((_,i)=>sum(S.blocks.filter(b=>b.oid===old.id&&b.step===i),b=>b.qty))):0;
      if(old&&old.pid!==snap.pid&&S.blocks.some(b=>b.oid===old.id)){toast("這張工單已有排程；更換產品需要「調整與自動排程」權限");return;}
      if(snap.qty<planned){toast("新數量小於已排件數；請由有排程權限的人員先調整班表");return;}
      pushUndo();if(old)Object.assign(old,snap);else S.orders.push({...snap});
      closeModal();commit({kind:"order",title:title+"（待排程）",lines:[]},"orders.manage");return;
    }
    openPlans(title+"：怎麼排？",title,"order",ev,STRAT_ORDER,{oid:D.id,event:{type:"order",order:{id:snap.id,code:snap.code,product:snap.pid,qty:snap.qty,due:snap.due,priority:snap.pri,note:snap.note||null}}});
  },
  "o-del":a=>{
    if(!canOrders())return;
    if(!confirmStep(a,"o-del"))return;
    const O=order(UI.modal.id);pushUndo();
    if(readOnly&&S.blocks.some(b=>b.oid===O.id)){undoStack.pop();toast("這張工單已有排程；刪除前還需要「調整與自動排程」權限");return;}
    S.blocks=S.blocks.filter(b=>b.oid!==O.id);S.orders=S.orders.filter(x=>x!==O);
    commit({kind:"order",title:"刪除工單 "+O.code,lines:[]},"orders.manage");closeModal();
  },
  "clear-demo":a=>{
    if(!canMaster()||readOnly)return;
    if(!confirmStep(a,"clear-demo"))return;
    pushUndo();S.orders=[];S.blocks=[];S.log=[];S.demo=false;
    S.employees.forEach(E=>E.leaves=[]);S.machines.forEach(M=>M.faults=[]);
    commit({kind:"edit",title:"清除示範工單，開始使用",lines:[]});closeModal();
  },
  "p-addstep":a=>{syncInputs();UI.modal.draft[+a.dataset.v].steps.push({proc:'',factory:UI.factory==="all"?1:UI.factory,rate:0,batch:0});rerender();},
  "p-delstep":a=>{syncInputs();const [pi,si]=a.dataset.v.split(".").map(Number);const st=UI.modal.draft[pi].steps;if(st.length>1)st.splice(si,1);rerender();},
  "p-add":()=>{syncInputs();UI.modal.draft.push({id:uid(),name:"新產品",steps:[{proc:'',factory:UI.factory==="all"?1:UI.factory,rate:0,batch:0}]});rerender();},
  "p-save":()=>{
    syncInputs();const D=UI.modal.draft;
    for(const p of D){p.name=String(p.name).trim();if(!p.name||p.name.length>80){toast('產品名稱須為 1–80 字');return;}for(const s of p.steps){s.proc=String(s.proc).trim();if(!s.proc||s.proc.length>80){toast('工序名稱須為 1–80 字');return;}s.factory=factoryOf(s);s.rate=+s.rate;s.batch=Math.max(0,Math.round(+s.batch||0));if(!(s.rate>0)){toast(p.name+"：每分鐘件數要大於 0");return;}}}
    if(new Set(D.map(p=>p.name)).size!==D.length){toast('產品名稱重複，請用明確品號區分');return;}
    for(const p of D){const old=prod(p.id);if(old&&S.orders.some(o=>o.pid===p.id)&&JSON.stringify(old.steps)!==JSON.stringify(p.steps)){toast('已有工單的產品只能改名稱；工序／產能變更請新增產品版本，以保留原排程');return;}}
    pushUndo();S.products=D;
    S.blocks=S.blocks.filter(b=>{const o=order(b.oid);return o&&prod(o.pid)&&b.step<prod(o.pid).steps.length;});
    commit({kind:"edit",title:"修改產品工序",lines:[]},"master.manage");closeModal();
    toast("工序已更新。要依新公式重新排程嗎？","重新排程",runAuto);
  },
  "b-emp":a=>{const b=S.blocks.find(x=>x.id===UI.modal.id);if(b.emp===a.dataset.v)return;pushUndo();const from=emp(b.emp);b.emp=a.dataset.v;b.pin=true;
    commit({kind:"move",title:label(b)+"：改由 "+emp(b.emp).name+" 做"+(from?"（原 "+from.name+"）":""),lines:[]});},
  "b-mach":a=>{const b=S.blocks.find(x=>x.id===UI.modal.id);if(b.m===a.dataset.v)return;pushUndo();const from=b.m;b.m=a.dataset.v;b.pin=true;
    commit({kind:"move",title:label(b)+"：從 "+from+" 搬到 "+b.m+" 機台",lines:[]});},
  "b-preview":()=>{
    const b=S.blocks.find(x=>x.id===UI.modal?.id);if(!b||readOnly)return;
    const s=+$("#f-bs")?.value,e=+$("#f-be")?.value;
    if(!(e>s)){toast("結束時間必須晚於開始時間");return;}
    if(s===b.s&&e===b.e){toast("時間沒有變動");return;}
    const qty=manualQty(b.oid,b.step,e-s,b.id);
    openModal({t:"drag-preview",proposal:dragPreview(b,b.m,s,{end:e,qty})});
  },
  "b-pin":()=>{const b=S.blocks.find(x=>x.id===UI.modal.id);pushUndo();b.pin=!b.pin;commit(null);},
  "b-del":a=>{
    const m=UI.modal;if(!m.confirmDel){m.confirmDel=true;a.textContent="再按一次確認刪除";return;}
    const b=S.blocks.find(x=>x.id===m.id);pushUndo();S.blocks=S.blocks.filter(x=>x!==b);
    commit({kind:"edit",title:"刪除 "+label(b)+"（"+mdw(b.date)+" "+hm(b.s)+"）",lines:[]});closeModal();
  },
  "b-fix":()=>{const b=S.blocks.find(x=>x.id===UI.modal.id);pushUndo();b.pin=false;const t=label(b);const lines=repair([b],"fix");
    commit({kind:"auto",title:"系統重排 "+t,lines});showResult();},
  "blk-open":a=>openModal({t:"blk",id:a.dataset.v}),
  "fix-all":()=>{pushUndo();const bad=S.blocks.filter(b=>b.date===UI.date&&issuesOf(b).length);bad.forEach(b=>b.pin=false);
    const lines=repair(bad,"fix");commit({kind:"auto",title:"自動修正 "+mdw(UI.date)+" 的 "+bad.length+" 個問題",lines});showResult();},
  "auto-run":()=>runAuto(),
  "m-undo":()=>{undo();closeModal();},
  "x-copy-day":()=>copyText(dayTSV()),
  "x-print-day":()=>{closeModal();requestAnimationFrame(()=>window.print());},
  "x-copy-all":()=>copyText(allRows().map(r=>r.join("\t")).join("\n")),
  "x-dl":()=>downloadCSV(),
  "x-xlsx":async()=>{
    try{const {scheduleXlsx}=await import("./excel.js");const machines=shownMachines(),ids=new Set(machines.map(m=>m.id));
      const bytes=await scheduleXlsx({...S,machines,blocks:S.blocks.filter(b=>ids.has(b.m)),workAssignments:assignments(S).filter(a=>inFactory(workCatalog(S).find(w=>w.id===a.workId)||{},UI.factory))},UI.date);
      saveFile("產線排程_"+(UI.factory==="all"?"跨廠":factoryName(UI.factory))+"_"+UI.date+".xlsx",new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));}
    catch(e){toast("Excel 匯出失敗："+e.message);}
  },
  "x-template":()=>{
    const a=document.createElement("a");a.href="/匯入範本.xlsx";a.download="產線排程_匯入範本.xlsx";
    document.body.appendChild(a);a.click();a.remove();
  },
  "x-import":()=>$("#xlsx-import")?.click(),
  "x-import-confirm":()=>{
    const m=UI.modal;if(!m||m.t!=="import-preview"||m.errors.length||!canMaster())return;
    if(workCatalog(S).length||assignments(S).length||transferOrders(S).length){toast('匯入範本不含一般工作／跨廠加工資料，不能覆蓋目前名冊');return;}
    if((S.groups||[]).length){toast('目前匯入範本不含分組，不能覆蓋已有分組的正式名冊');return;}
    if(S.employees.some(e=>factoryOf(e)===2)||S.machines.some(x=>factoryOf(x)===2)||S.products.some(p=>p.steps.some(s=>factoryOf(s)===2))){
      toast("目前範本沒有廠別欄，不能覆蓋已設定的 2 廠資料");return;}
    if(JSON.stringify(S)!==m.base){closeModal();toast("排程已更新，請重新選擇 Excel 檔案預覽");return;}
    if(readOnly&&S.blocks.length){toast("匯入會清空既有排程；還需要「調整與自動排程」權限");return;}
    pushUndo();S={...S,...m.data,blocks:[],demo:false};
    commit({kind:"edit",title:"Excel 批次匯入："+S.employees.length+" 位員工、"+S.machines.length+" 台機台、"+S.products.length+" 種產品、"+S.orders.length+" 張工單",lines:[{k:"info",t:"已清空原排程，請重新執行自動排程"}]},"master.manage");
    closeModal();toast("Excel 匯入完成。請建立新排程","自動排程",runAuto);
  },
  "legacy-save":async()=>{
    const m=UI.modal;if(m?.t!=="legacy-preview"||m.saving||!canArchive())return;
    m.saving=true;m.error="";renderModal();
    try{
      const saved=await STORE.saveLegacyArchive({sourceName:m.filename,sourceSha256:m.sourceSha256,legacy:m.legacy});
      toast("歷史排程已存入；目前排程沒有變動");
      await openLegacyHistory(saved.id);
    }catch(e){if(UI.modal===m){m.saving=false;m.error=e.message;renderModal();}}
  },
  "history-factory":a=>{if(UI.modal?.t==="legacy-history"){UI.modal.factory=a.dataset.v;renderModal();}},
  "history-section":a=>{if(UI.modal?.t==="legacy-history"){UI.modal.section=a.dataset.v;renderModal();}}
});
document.addEventListener("change",async e=>{
  if(e.target.id==="legacy-date"&&UI.modal?.t==="legacy-preview"){
    UI.modal.date=e.target.value;renderModal();return;
  }
  if(e.target.id==="history-date"&&UI.modal?.t==="legacy-history"){
    UI.modal.date=e.target.value;renderModal();return;
  }
  if(e.target.id==="history-source"&&UI.modal?.t==="legacy-history"){
    await changeLegacyHistorySource(e.target.value);return;
  }
  if(e.target.id!=="xlsx-import"||!e.target.files?.[0]||!canArchive())return;
  const file=e.target.files[0],base=JSON.stringify(S);
  if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024){
    openModal({t:"import-preview",filename:file.name,base,errors:["請選擇小於 5 MB 的 .xlsx 檔案"],data:null});return;
  }
  try{
    const {readImportXlsx}=await import("./excel.js");
    const bytes=await file.arrayBuffer(),result=await readImportXlsx(bytes,file.name);
    if(result.legacy){
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const sourceSha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
      openModal({t:"legacy-preview",filename:file.name,sourceSha256,legacy:result.legacy,date:result.legacy.selectedDate});
    }else if(canMaster())openModal({t:"import-preview",filename:file.name,base,...result});
    else openModal({t:"import-preview",filename:file.name,base,errors:["只有老闆可以匯入員工、機台、產品工序和工單。舊版排程可由組長存成歷史資料。"],data:null});
  }catch(err){openModal({t:"import-preview",filename:file.name,base,errors:["無法讀取 Excel："+err.message],data:null});}
});
// 自動排程也先預覽：比較「最佳化」與「原本規則」，看清楚前後差異再套用
const STRAT_AUTO=[
  {id:"A",name:"最佳化重排",desc:"派工規則＋模擬退火，找延誤最少、完成最早的順序",run:()=>optLines(optimizePlan(nowAbs(),900))},
  {id:"B",name:"依優先級排",desc:"急件先、期限早的先（簡單規則）",run:()=>{const l=autoPlan(nowAbs()).map(t=>({k:"fail",t}));lateCheck(l);return l;}},
  {id:"C",name:"維持現狀",desc:"不重排",run:()=>[{k:"info",t:"排程不動"}]}
];
function runAuto(){
  if(readOnly)return;
  openPlans("重新排程：比較排法","重新排程","auto",()=>({date:todayStr()}),STRAT_AUTO,{event:{type:"auto"}});
}

/* ===== 11. Excel／試算表 ===== */
function dayTSV(){
  const d=UI.date,machines=shownMachines(),rows=[["時間",...machines.map(M=>M.id+" "+M.label)]];
  for(let t=DAY0;t<DAY1;t+=30){
    rows.push([hm(t),...machines.map(M=>{
      if(t>=LUNCH_S&&t<LUNCH_E)return "午休";
      const b=[...S.blocks,...occupiedWork(S)].find(b=>b.date===d&&b.m===M.id&&b.s<t+30&&b.e>t);
      return b?(emp(b.emp)?emp(b.emp).name:"")+" "+(b.workId?workName(b):order(b.oid).code+" "+stepName(b)):"";})]);
  }
  return mdw(d)+" 設備排程（純人工見全部明細）\n"+rows.map(r=>r.join("\t")).join("\n");
}
function allRows(){
  const head=["日期","星期","開始","結束","機台","員工","工單","產品","工序","數量","固定","問題"];
  const machineIds=new Set(shownMachines().map(m=>m.id));
  return [head,...S.blocks.filter(b=>machineIds.has(b.m)).sort(byAbs).map(b=>{const o=order(b.oid);
    return [b.date,WD[parseD(b.date).getUTCDay()],hm(b.s),hm(b.e),b.m,emp(b.emp)?emp(b.emp).name:"",o.code,prod(o.pid).name,stepName(b),b.qty,b.pin?"是":"",issuesOf(b).join("；")];}),
    ...assignments(S).filter(a=>inFactory(workCatalog(S).find(w=>w.id===a.workId)||{},UI.factory)).map(a=>[a.date,WD[parseD(a.date).getUTCDay()],hm(a.s),hm(a.e),a.resourceId||'不需機台',emp(a.emp)?.name||'',referenceOrder(a.orderId)?.code||'','',workName(a),a.qty??'','是','一般工作，件數僅供參考；'+assignmentIssues(S,a,dayInfo(a.date).win).join('；')])];
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);toast("已複製，到試算表 A1 貼上即可");}
  catch(e){openModal({t:"copybox",text:t});}
}
MODALS.copybox=m=>({title:"請手動複製",body:'<textarea id="cbx" class="inp" style="height:240px;font-size:14px;font-family:var(--mono)" readonly>'+esc(m.text)+'</textarea><div class="hint">已全選，按 Ctrl+C（手機長按）複製。</div>'});
async function downloadCSV(){
  const csv="﻿"+allRows().map(r=>r.map(v=>{v=String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(",")).join("\r\n");
  saveFile("排程明細_"+todayStr()+".csv",new Blob([csv],{type:"text/csv;charset=utf-8"}));
}

/* ===== 12. 資料層（本機／Supabase）、同步、登入、啟動 ===== */
let SAMPLE=null,toastT=null;          // AI 助理下一階段改由伺服器提供
let STORE=null;                        // LocalStore 或 SupabaseStore（main.js 決定）
let scheduleChat=null;
const SYNC={state:"ok",msg:""};
let lastLocalWrite=0,pendingReload=false,reloadTimer=null;
// 職位只提供預設值；正式可寫範圍由老闆逐項授權，畫面與資料庫使用同一組權限鍵。
function canPermission(key){return !PV&&(!STORE||STORE.kind==='local'||(STORE.can?STORE.can(key):effectivePermission(STORE.role,STORE.permissions,key)));}
function canMaster(){return canPermission('master.manage');}
function canArchive(){return canPermission('archives.manage');}
function canOrders(){return canPermission('orders.manage');}
function canIncidents(){return canPermission('incidents.manage');}
function canCalendar(){return canPermission('calendar.manage');}
function canGroups(){return canPermission('groups.manage');}
function canWorkContents(){return canPermission('work_contents.manage');}
function canScenarios(){return canPermission('scenarios.manage');}
const ROLE_NAME={boss:"老闆",lead:"組長",worker:"員工",viewer:"電視／檢視"};

function toast(msg,actLabel,fn){
  let el=$("#toast");
  if(!el){el=document.createElement("div");el.id="toast";el.className="toast";el.setAttribute("role","status");document.body.appendChild(el);}
  el.innerHTML="<span>"+esc(msg)+"</span>"+(actLabel?"<button>"+esc(actLabel)+"</button>":"");
  el.hidden=false;
  if(actLabel)el.querySelector("button").onclick=()=>{el.hidden=true;fn();};
  clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true;},actLabel?8000:3500);
}

function saveFile(name,blob){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  toast("已下載："+name);
}

// ---------- 同步狀態 ----------
function syncChipHTML(){
  if(!STORE)return "";
  const txt=SYNC.state==="busy"?"同步中…":SYNC.state==="error"?"同步失敗，按這裡重試":STORE.kind==="local"?"已存在這台電腦":"已同步";
  return '<button class="btn sync-chip '+SYNC.state+'" id="syncchip" data-act="sync" title="'+esc(SYNC.msg||"")+'">'+IC.save+'<span class="lbl">'+txt+'</span></button>';
}
function updateSyncChip(){const el=$("#syncchip");if(el)el.outerHTML=syncChipHTML();}
let syncChain=Promise.resolve(),syncPending=0;
function queueSync(entry){
  const snapshot=structuredClone(S);
  syncPending++;SYNC.state="busy";updateSyncChip();
  const task=syncChain.then(async()=>{
    try{await STORE.sync(snapshot,entry);SYNC.state="ok";SYNC.msg="";lastLocalWrite=Date.now();return true;}
    catch(e){
      SYNC.state="error";SYNC.msg=e.message;
      if(e.conflict){toast("別人剛更新過排程，已載入最新版本，請再做一次你的調整");await reloadFromStore();SYNC.state="ok";}
      else if(e.permission){toast(e.message+"，已還原");await reloadFromStore();SYNC.state="ok";}
      else toast("沒存到："+e.message,"重試",()=>queueSync(null));
      return false;
    }
    finally{syncPending--;if(syncPending>0)SYNC.state="busy";updateSyncChip();}
  });
  syncChain=task.then(()=>undefined);
  return task;
}

// ---------- 別人改了 → 重新讀取 ----------
function normalizeState(){
  S.transferOrders ||= [];
  S.rushOrders ||= [];
  S.workLog ||= [];
  S.workContents ||= [];S.workAssignments ||= [];
  S.execution ||= [];
  S.leaveRequests ||= [];S.memos ||= [];
  S.groups ||= [];S.groupMembers ||= [];
  if(UI.group!=='all'&&UI.group!=='ungrouped'&&!S.groups.some(g=>g.id===UI.group))UI.group='all';
  if(!S.cal)S.cal={week:[...DEF_WEEK],over:{}};
  if(!S.dayOT)S.dayOT={};
  if(!S.log)S.log=[];
  for(const e of S.employees){e.factory=factoryOf(e);e.otWeekdays=overtimeWeekdays(e);e.otOverrides ||= {};e.noOT=e.otWeekdays.length===0;e.maxMachines ||= 1;}
  for(const M of S.machines){M.factory=factoryOf(M);for(const f of M.faults)if(!f.id)f.id=uid();}
  for(const p of S.products)for(const st of p.steps)st.factory=factoryOf(st);
  if(S.holidays)Object.assign(HOLI,S.holidays);
}
async function reloadFromStore(){
  try{const s=await STORE.load();if(s){S=s;normalizeState();}render();}
  catch(e){toast(e.message);}
}
function onRemoteChange(source){
  if(source==="account_permissions"){
    readOnly=STORE.kind==="supabase"&&!STORE.can("schedule.manage");
    closeModal();render();toast("老闆已更新你的功能權限");return;
  }
  if(PV||drag||generalDrag||UI.modal||SYNC.state==="busy"){pendingReload=true;return;}
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(async()=>{
    const mine=Date.now()-lastLocalWrite<4000;
    await reloadFromStore();
    const l=S.log[0];
    if(!mine&&notificationEnabled(UI.prefs,source)){
      const recent=l&&Date.now()-l.t<120000,title=recent?'有新的變更：'+l.title:source==='leave_requests'||source==='leaves'?'請假資料有更新':source==='schedule_memos'?'現場備忘有更新':'排程資料有更新';
      if(recent)toast(title,"看細節",()=>openModal({t:"logone",id:l.id}));else toast(title);
      showDeviceNotification(title);
    }
  },600);
}
function maybeReload(){if(pendingReload&&!PV&&!UI.modal&&!drag&&!generalDrag){pendingReload=false;onRemoteChange();}}

// ---------- 帳號與連線 ----------
MODALS.account=()=>({title:"帳號與連線",
  body:'<dl class="kv"><dt>資料</dt><dd>'+(STORE.kind==="local"?"本機（這台電腦的瀏覽器）":"雲端資料庫（Supabase）")+'</dd>'+
    (STORE.kind==="supabase"?'<dt>帳號</dt><dd>'+esc(STORE.userName)+'</dd><dt>角色</dt><dd>'+esc(ROLE_NAME[STORE.role]||"未設定")+'</dd>':"")+
    '<dt>排程計算</dt><dd>'+(SOLVER.up?"OR-Tools "+esc(SOLVER.version):"瀏覽器內的演算法（排程服務未連線）")+'</dd></dl>'+
    (STORE.kind==="local"?'<div class="hint">要多人使用、手機和電視即時同步，請設定雲端資料庫（見 README）。</div>':""),
  foot:(STORE.kind==="supabase"?'<button class="btn" data-act="password-open">設定登入密碼</button>'+(STORE.role==='boss'?'<button class="btn" data-act="access-accounts">管理帳號權限</button>':'')+'<button class="btn" data-act="logout">登出</button>':'<button class="btn danger" data-act="reset-local">清除這台電腦的資料</button>')+
    '<div class="spacer"></div><button class="btn" data-act="solver-check">重新連線排程服務</button><button class="btn primary" data-act="close">關閉</button>'});
MODALS.password=()=>({title:"設定登入密碼",
  body:'<div class="hint">收到邀請信或重設密碼信後，開啟信中連結登入，再在這裡設定新密碼。</div>'+
    '<div class="field"><label for="new-password">新密碼（至少 12 個字元）</label><input class="inp" id="new-password" type="password" autocomplete="new-password" minlength="12"></div>'+
    '<div class="field"><label for="confirm-password">再次輸入新密碼</label><input class="inp" id="confirm-password" type="password" autocomplete="new-password" minlength="12"></div>',
  foot:'<button class="btn" data-act="account">返回</button><div class="spacer"></div><button class="btn primary" data-act="password-save">儲存新密碼</button>'});
Object.assign(MODAL_ACT,{
  "logout":async()=>{await STORE.logout();location.reload();},
  "password-open":()=>openModal({t:"password"}),
  "password-save":async a=>{
    const pw=$("#new-password").value,again=$("#confirm-password").value;
    if(pw.length<12){toast("密碼至少需要 12 個字元");return;}
    if(pw!==again){toast("兩次密碼不一致");return;}
    a.disabled=true;
    try{await STORE.setPassword(pw);closeModal();toast("登入密碼已設定");}
    catch(e){a.disabled=false;toast(e.message);}
  },
  "reset-local":a=>{if(!confirmStep(a,"reset-local"))return;STORE.reset().then(()=>location.reload());},
  "solver-check":async()=>{await SOLVER.check();renderModal();toast(SOLVER.up?"已連上 OR-Tools 排程服務":"排程服務沒有回應："+SOLVER.url);}
});

MODALS['access-accounts']=m=>({title:'帳號權限',body:m.loading?'<div class="hint">讀取帳號中…</div>':
  '<div class="hint">職位只決定預設值；老闆可逐一調整實際功能。這不會授予 Supabase Organization 或資料庫管理權。</div>'+m.accounts.map(x=>
    '<button class="btn" data-act="access-account" data-id="'+esc(x.userId)+'" style="width:100%;height:auto;min-height:54px;justify-content:space-between;margin:8px 0"><span>'+esc(x.displayName||'未命名帳號')+'</span><span>'+esc(ROLE_NAME[x.role]||x.role)+'</span></button>').join(''),
  foot:'<button class="btn" data-act="account">返回</button><button class="btn primary" data-act="close">關閉</button>'});
MODALS['access-account']=m=>{const x=m.account,isBoss=x.role==='boss';return {title:'設定 '+esc(x.displayName||'帳號')+' 的權限',body:
  '<div class="hint">職位：'+esc(ROLE_NAME[x.role]||x.role)+'。'+(isBoss?'老闆永遠擁有全部功能，避免失去管理入口。':'以下開關會決定實際可用功能；日後可再次調整。'+(x.customized?'目前使用自訂權限。':'目前使用職位預設。'))+'</div>'+PERMISSIONS.map(([key,name,desc])=>
    '<label class="permission-row"><input type="checkbox" data-permission="'+key+'" '+(x.permissions?.[key]?'checked ':'')+(isBoss?'disabled ':'')+'><span><b>'+esc(name)+'</b><small>'+esc(desc)+'</small></span></label>').join(''),
  foot:'<button class="btn" data-act="access-accounts">返回</button><div class="spacer"></div>'+(isBoss?'':(x.customized?'<button class="btn" data-act="access-reset">恢復職位預設</button>':'')+'<button class="btn primary" data-act="access-save">儲存權限</button>')};};
Object.assign(MODAL_ACT,{
  'access-accounts':async()=>{if(STORE.kind!=='supabase'||STORE.role!=='boss')return;openModal({t:'access-accounts',loading:true,accounts:[]});try{const accounts=await STORE.listAccessAccounts();if(UI.modal?.t==='access-accounts'){UI.modal.loading=false;UI.modal.accounts=accounts;renderModal();}}catch(e){toast(e.message);closeModal();}},
  'access-account':a=>{if(STORE.role!=='boss')return;const x=UI.modal?.accounts?.find(v=>v.userId===a.dataset.id);if(x)openModal({t:'access-account',account:structuredClone(x)});},
  'access-reset':async a=>{if(STORE.role!=='boss'||UI.modal?.t!=='access-account')return;a.disabled=true;try{await STORE.setAccessPermissions(UI.modal.account.userId,{});toast('已恢復職位預設權限');MODAL_ACT['access-accounts']();}catch(e){a.disabled=false;toast(e.message);}},
  'access-save':async a=>{if(STORE.role!=='boss'||UI.modal?.t!=='access-account')return;const x=UI.modal.account,permissions={};document.querySelectorAll('[data-permission]').forEach(el=>permissions[el.dataset.permission]=el.checked);a.disabled=true;try{await STORE.setAccessPermissions(x.userId,permissions);toast('已更新 '+(x.displayName||'帳號')+' 的功能權限');MODAL_ACT['access-accounts']();}catch(e){a.disabled=false;toast(e.message);}}
});

MODALS['catalog-review']=()=>({title:S.setupPending?'初次核對資料':'員工、設備與工單',body:
  (S.setupPending?'<div class="catalog-step"><b>核對完成前</b><span>今天仍可查看空班表；自動排班與故障重排維持關閉。</span></div>':'')+cardsHTML()+latestHTML(),
  foot:'<button class="btn primary" data-act="close">返回班表</button>'});
MODALS['leave-request']=m=>({title:'新增請假詢問',body:
  '<div class="hint">詢問送出後不會立刻成為正式請假，也不會觸發自動重排；必須由有「故障與請假」權限的人准假。</div>'+
  '<div class="field"><label for="leave-request-employee">人員</label><select class="inp" id="leave-request-employee">'+shownEmployees().map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join('')+'</select></div>'+
  '<div class="field"><label for="leave-request-date">日期</label><input class="inp" id="leave-request-date" type="date" value="'+esc(m.date||UI.date)+'"></div>'+
  '<div class="field"><label for="leave-request-note">一句說明</label><input class="inp" id="leave-request-note" maxlength="140" value="'+esc(m.note||'')+'"></div>',
  foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="leave-request-save">送出詢問</button>'});
/* ---------- 員工月曆：單日休假／上班、整月每週固定班 ---------- */
MODALS['person-day']=m=>{
  const E=emp(m.id);if(!E)return null;
  m.leave ??= E.leaves.includes(m.d);
  const n=S.blocks.filter(b=>b.emp===E.id&&b.date===m.d&&futureOf(b)).length;
  return {title:esc(E.name)+' · '+mdw(m.d),body:
    '<div class="toggles">'+tg("pd-set","leave",!!m.leave,"休假（整天）")+tg("pd-set","work",!m.leave,"上班")+'</div>'+
    '<div class="hint">'+(m.leave&&n?'這天他有 '+n+' 段工作；儲存後系統會先給你調整方案預覽，確認前不會動正式班表。':'臨時休假只記這一天；其他日期不受影響。')+'</div>',
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="pd-save">儲存</button>'};
};
MODALS['person-month']=m=>{
  const E=emp(m.id);if(!E)return null;
  if(!m.off){
    m.off=new Set();
    const month=UI.date.slice(0,7);
    const lvDays=new Set((E.leaves||[]).filter(d=>d.startsWith(month)));
    for(const d of lvDays)m.off.add(parseD(d).getUTCDay());
    for(let w=0;w<7;w++)if(!S.cal.week[w])m.off.add(w);   // 工廠休息日預設為休假
  }
  const days=monthDates(UI.date).filter(Boolean).filter(d=>d>=todayStr());
  return {title:esc(E.name)+' 整月班表設定',body:
    '<div class="hint">對象月份：'+UI.date.slice(0,7).replace('-',' 年 ')+' 月。勾「休假」的星期，整月都會設為休假；沒勾的代表上班（會取消那幾天已有的休假）。</div>'+
    '<div class="field"><span class="lab">這個月哪些星期休假</span><div class="toggles">'+[1,2,3,4,5,6,0].map(w=>tg("pm-week",w,m.off.has(w),"週"+WD[w])).join("")+'</div></div>'+
    (days.length?'<div class="hint">只會改 '+(days.length?md(days[0])+' ～ '+md(days[days.length-1]):'')+'（今天起，過去的紀錄不動）。當天已排工作的日期會先跳過，請到月曆點該日期逐一處理。</div>':'<div class="issue">這個月今天之後沒有日期可設定。</div>'),
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="pm-save">套用到這個月</button>'};
};
Object.assign(MODAL_ACT,{
  "pd-set":a=>{UI.modal.leave=a.dataset.v==="leave";rerender();},
  "pd-save":()=>{
    if(!canIncidents())return;
    const m=UI.modal;
    closeModal();
    applyPersonDay(m.id,m.d,!!m.leave);
  },
  "pm-week":a=>{const w=+a.dataset.v,set=UI.modal.off;set.has(w)?set.delete(w):set.add(w);rerender();},
  "pm-save":()=>{
    if(!canIncidents())return;
    const m=UI.modal,E=emp(m.id);
    const days=monthDates(UI.date).filter(Boolean).filter(d=>d>=todayStr());
    if(!days.length){toast('這個月今天之後沒有日期');return;}
    const blocked=[];
    let added=0,removed=0;
    pushUndo();
    for(const d of days){
      const wantOff=m.off.has(parseD(d).getUTCDay()),has=E.leaves.includes(d);
      if(wantOff===has)continue;
      if(wantOff&&S.blocks.some(b=>b.emp===E.id&&b.date===d&&futureOf(b))){blocked.push(d);continue;}
      if(wantOff){if(!E.leaves.includes(d))E.leaves.push(d);added++;}
      else{E.leaves=E.leaves.filter(x=>x!==d);removed++;}
    }
    closeModal();
    if(!added&&!removed&&!blocked.length){undoStack.pop();toast('沒有變更');return;}
    commit({kind:"leave",title:E.name+" 整月班表設定"+(added?"：新增 "+added+" 天休假":"")+(removed?"：取消 "+removed+" 天休假":""),lines:[]},"incidents.manage");
    toast(blocked.length?blocked.map(md).join('、')+" 當天有排工作，已先跳過；請到月曆點單日處理":"已套用整月設定");
  }
});

/* ---------- 員工單日休假：筆刷與小視窗共用的套用邏輯 ---------- */
function applyPersonDay(eid,d,want){
  const E=emp(eid);if(!E)return;
  const already=E.leaves.includes(d);
  if(want===already){toast("沒有變更");return;}
  if(!want){
    pushUndo();E.leaves=E.leaves.filter(x=>x!==d);
    commit({kind:"leave",title:E.name+" 取消 "+md(d)+" 休假",lines:[]},"incidents.manage");
    toast("已改為上班");return;
  }
  const n=S.blocks.filter(b=>b.emp===E.id&&b.date===d&&futureOf(b)).length;
  if(!n){
    pushUndo();if(!E.leaves.includes(d))E.leaves.push(d);
    commit({kind:"leave",title:E.name+" "+md(d)+" 臨時休假（當天沒有排工作）",lines:[]},"incidents.manage");
    toast("已設為休假");return;
  }
  const ev=()=>{const X=emp(eid);if(!X.leaves.includes(d))X.leaves.push(d);return {date:d,mode:"leave",aff:S.blocks.filter(b=>b.emp===eid&&b.date===d&&futureOf(b))};};
  openPlans(E.name+" "+mdw(d)+" 臨時休假，"+n+" 段工作要調整",E.name+" "+md(d)+" 休假","leave",ev,STRAT_EVENT,{event:{type:"leave",employee:eid,date:d}});
}

/* ---------- 整頁三張表：欠缺品項 ／ 給二廠－回一廠 ／ 工作紀錄（Excel 式、欄位固定、雲端儲存） ---------- */
const PAGE_KEYS={shortage:"shortage",transfer:"transferflow",worklog:"worklog"};
function pageSaveState(){return SYNC.state==="busy"?"儲存中…":SYNC.state==="error"?"沒存到，再試一次":"已儲存";}
function getPath(obj,path){return path.split(".").reduce((v,k)=>v?.[k],obj);}
function numSelOptions(cur,max,step){let out='<option value=""></option>';for(let i=0;i<=max;i+=step||1){const v=String(i);out+='<option value="'+v+'"'+(String(cur??"")===v?" selected":"")+'>'+String(i).padStart(2,"0")+'</option>';}return out;}
function editCellHTML(table,id,key,type,value,ro){
  const mute='<span class="mute">—</span>';
  const isISO=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);
  const shown=(value===null||value===undefined||value==="")?mute:esc(type==="date"?(isISO(value)?md(value):String(value)):String(value));
  if(ro)return shown;
  const editing=UI.editCell&&UI.editCell.table===table&&UI.editCell.id===id&&UI.editCell.key===key;
  if(editing){
    if(type==="hour"||type==="minute"){
      const max=type==="hour"?23:59;
      return '<select class="inp cellinp" data-cell="'+table+'" data-id="'+esc(id)+'" data-key="'+key+'" data-type="number">'+numSelOptions(value,max,type==="minute"?1:1)+'</select>';
    }
    const attr=type==="date"?'type="date"':type==="number"?'type="number" min="0" step="1"':'maxlength="200" autocomplete="off"';
    const iv=(type==="date"&&!isISO(value))?"":(value??"");
    return '<input class="inp cellinp" data-cell="'+table+'" data-id="'+esc(id)+'" data-key="'+esc(key)+'" data-type="'+type+'" '+attr+' value="'+esc(iv)+'">';
  }
  return '<button class="cellbtn" data-act="cell-edit" data-cell="'+table+'" data-id="'+esc(id)+'" data-key="'+esc(key)+'" data-type="'+type+'">'+shown+'</button>';
}
function saveCellEdit(input){
  const table=input.dataset.cell,id=input.dataset.id,key=input.dataset.key,type=input.dataset.type;
  let v=input.value;
  if(type==="number"){
    if(v==="")v=null;else{v=Math.round(+v);if(!Number.isFinite(v)||v<0){toast("數量請填 0 以上的整數");UI.editCell=null;render();return;}}
  }else{
    v=String(v??"").trim();
    if(type==="date"&&v!==""&&!/^\d{4}-\d{2}-\d{2}$/.test(v)){toast("日期請用選擇器選");UI.editCell=null;render();return;}
    v=v===""?null:v;
  }
  UI.editCell=null;
  let list,find,validate,permission,title;
  if(table==="rush"){list=S.rushOrders;validate=()=>validateRush(S.rushOrders);permission="rush.manage";title="更新欠缺品項的一個欄位";}
  else if(table==="tf"){list=S.transferOrders;validate=()=>validateTransfers(S,{before:S});permission="transfers.manage";title="更新跨廠加工的一個欄位";}
  else if(table==="wl"){list=S.workLog;validate=()=>validateWorkLog(S.workLog);permission="worklog.manage";title="更新工作紀錄的一個欄位";}
  else return;
  const row=list.find(r=>r.id===id);if(!row)return;
  const before=getPath(row,key);
  if(before===v){render();return;}
  if(key.startsWith("f1."))row.f1??={};
  if(key.startsWith("f2."))row.f2??={};
  setPath(row,key,v);
  if(table==="tf"&&key==="expectedSend"&&v)delete row.expectedSendRaw;
  if(table==="tf"&&key==="urgentDue"&&v)delete row.urgentRaw;
  if(table==="tf"&&key==="code"&&v&&list.some(x=>x.id!==id&&x.code===v)){setPath(row,key,before);toast("加工編號重複；這格沒有儲存");render();return;}
  try{validate();}catch(e){setPath(row,key,before);toast(e.message+"；這格沒有儲存");render();return;}
  commit({kind:"edit",title,lines:[]},permission);
}
function flashReturnRow(){
  if(!UI.returnTo?.rowId)return;
  const el=document.querySelector('[data-rowid="'+CSS.escape(UI.returnTo.rowId)+'"]');
  if(el){el.scrollIntoView({block:"center"});el.classList.add("flash-row");setTimeout(()=>el.classList.remove("flash-row"),2600);}
  UI.returnTo={page:UI.returnTo.page};
}
function pageShell(title,subtitle,bodyHtml,ro,addAct,extraHead){
  return '<div class="fullpage">'+
    '<div class="page-top">'+
    '<div class="page-top-row"><button class="btn pageback" data-act="page" data-v="board">← 回今天班表</button>'+
    '<div class="page-title"><h1>'+esc(title)+'</h1><span class="savestate '+SYNC.state+'">'+pageSaveState()+'</span>'+(extraHead||"")+'</div>'+
    (ro?"":(addAct?'<button class="btn addrow-head" data-act="'+addAct+'">＋加一列</button>':""))+'</div>'+
    (subtitle?'<p class="page-sub">'+esc(subtitle)+'</p>':"")+
    '<span class="perm">'+(ro?"只可查看":"老闆／組長：點格子即可修改")+'</span></div>'+
    bodyHtml+
    '</div>';
}
function tfArchiveMonth(){const n=new Date();return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0");}
function tfAutoArchive(){
  // 每月一日自動歸檔：只歸「已回一廠已勾且要求回一廠時間早於本月」；沒勾的不動
  let ran=null;try{ran=localStorage.getItem("fsched-tf-archive-month");}catch{}
  const month=tfArchiveMonth();
  if(ran===month)return 0;
  const first=month+"-01";
  let n=0;
  for(const o of transferOrders(S)){
    if(o.returned&&!o.archived&&o.due&&o.due<first){o.archived=true;n++;}
  }
  try{localStorage.setItem("fsched-tf-archive-month",month);}catch{}
  if(n)commit({kind:"edit",title:"每月自動歸檔 "+n+" 筆已完成加工單",lines:[]},"transfers.manage");
  return n;
}
function shortagePageHTML(){
  const ro=!canPermission("rush.manage");
  const showArch=!!UI.shortageShowArchived;
  const rows=[...(S.rushOrders||[])]
    .filter(r=>showArch===!!r.archived)
    .sort((a,b)=>String(a.f1?.shipDate||"9999").localeCompare(String(b.f1?.shipDate||"9999")));
  const flags=(showArch?rows:[...(S.rushOrders||[])]).filter(r=>!r.archived).map(r=>shortageRowFlags(r));
  const allRush=(S.rushOrders||[]).filter(r=>!r.archived);
  const backedN=allRush.filter(r=>!shortageRowFlags(r).f2Empty).length;
  const lateN=allRush.filter(r=>shortageRowFlags(r).late).length;
  const head='<div class="statstrip">'+
    '<div class="stat"><b>'+allRush.length+'</b><span>還缺幾筆</span></div>'+
    '<div class="stat ok"><b>'+backedN+'</b><span>二廠已回幾筆</span></div>'+
    '<div class="stat bad"><b>'+lateN+'</b><span>會晚幾筆</span></div></div>';
  const today=todayStr();
  const eligible=(S.rushOrders||[]).filter(r=>!r.archived&&!shortageRowFlags(r).f2Empty&&r.f1?.shipDate&&r.f1.shipDate<today).length;
  const bar='<div class="archive-bar">'+
    (ro?"":'<button class="btn" data-act="rush-archive"'+(eligible?'':' disabled')+'>歸檔已補上'+(eligible?'（'+eligible+' 筆）':'')+'</button>')+
    '<label class="tf-toggle"><input type="checkbox" data-act-change="rush-showarchived"'+(showArch?" checked":"")+'"> 顯示已歸檔</label>'+
    ((S.rushOrders||[]).some(r=>r.archived)?'<span class="archived-n">已歸檔 '+(S.rushOrders||[]).filter(r=>r.archived).length+' 筆</span>':"")+
    '<span class="hint">右欄已補且出貨日已過才可歸檔；歸檔不刪除。</span></div>';
  const table='<div class="sheettable"><table><thead>'+
    '<tr><th class="rowact"></th><th class="h-f1" colspan="5">一廠</th><th class="h-f2" colspan="6">二廠</th></tr>'+
    '<tr><th class="rowact"></th><th class="h-f1">出貨日期</th><th class="h-f1">廠商</th><th class="h-f1">品號</th><th class="h-f1">欠貨數量</th><th class="h-f1">備註</th>'+
    '<th class="h-f2">開工</th><th class="h-f2">預計完成</th><th class="h-f2">品號／製程</th><th class="h-f2">描述</th><th class="h-f2">數量</th><th class="h-f2">備註</th></tr></thead><tbody>'+
    (rows.map(r=>{
      const f=shortageRowFlags(r);
      const cell=(k,t)=>'<td class="'+(k.startsWith("f1.")?"c-f1":(f.f2Empty?"c-f2-empty":"c-f2"))+'">'+editCellHTML("rush",r.id,k,t,getPath(r,k),ro)+'</td>';
      const item=String(r.f1?.desc||"").trim();
      const dateTxt=v=>v&&!/^\d{4}-\d{2}-\d{2}$/.test(String(v))?'<span class="raw-txt">'+esc(String(v))+'</span>':"";
      return '<tr data-rowid="'+esc(r.id)+'" class="'+(r.archived?"archived":"")+'">'+
        '<td class="rowact">'+(r.archived
          ?(ro?"":'<button class="rowdel restore" data-act="rush-unarchive" data-id="'+esc(r.id)+'">還原</button>')
          :(ro?"":(UI.confirmRow==="del:"+r.id?'<button class="btn danger" data-act="rush-del" data-id="'+esc(r.id)+'">再按一次刪除</button>':'<button class="rowdel" data-act="rush-del" data-id="'+esc(r.id)+'">刪除</button>')))+'</td>'+
        '<td class="c-f1">'+dateTxt(r.f1?.shipDate)+editCellHTML("rush",r.id,"f1.shipDate","date",r.f1?.shipDate,ro)+'</td>'+
        cell("f1.vendor","text")+
        '<td class="c-f1">'+(item?'<button class="codelink" data-act="rush-goto" data-id="'+esc(r.id)+'">'+esc(item)+'</button>':'<span class="mute">—</span>')+'</td>'+
        cell("f1.shortQty","number")+cell("f1.note","text")+
        '<td class="'+(f.f2Empty?"c-f2-empty":"c-f2")+'">'+dateTxt(r.f2?.startDate)+editCellHTML("rush",r.id,"f2.startDate","date",r.f2?.startDate,ro)+(f.f2Empty?'<span class="pending-tag">未排</span>':'')+'</td>'+
        '<td class="'+(f.f2Empty?"c-f2-empty":"c-f2")+'">'+dateTxt(r.f2?.dueDate)+editCellHTML("rush",r.id,"f2.dueDate","date",r.f2?.dueDate,ro)+(f.late?'<span class="late-txt">晚</span>':'')+'</td>'+
        cell("f2.itemProcess","text")+cell("f2.desc","text")+cell("f2.qty","number")+cell("f2.note","text")+
        '</tr>';
    }).join("")||'<tr><td colspan="12"><div class="empty">還沒有資料，按「＋加一列」開始記</div></td></tr>')+
    '</tbody></table></div>';
  return pageShell("欠缺品項","左邊一廠欠貨，右邊二廠何時補。同一列同一張單。",head+bar+table,ro,"rush-addrow");
}
const pendingDate=v=>v&&!/^\d{4}-\d{2}-\d{2}$/.test(String(v));
// 有原始文字（08\16 這類）的日期格：只顯示該文字、不再多一個「—」；點它仍可改選真日期
function rawCell(table,id,key,dateVal,rawVal,ro,blank){
  if(rawVal&&(dateVal===null||dateVal===undefined)){
    if(ro)return '<span class="raw-txt">'+esc(rawVal)+'</span>';
    return '<button class="cellbtn raw" data-act="cell-edit" data-cell="'+table+'" data-id="'+esc(id)+'" data-key="'+esc(key)+'" data-type="date">'+esc(rawVal)+'</button>';
  }
  if(blank&&(dateVal===null||dateVal===undefined))return "";   // 沒日期也沒文字：整格空白，連「—」都不顯示
  return editCellHTML(table,id,key,"date",dateVal,ro);
}
function transferFlowPageHTML(){
  const ro=!canPermission("transfers.manage");
  const showArch=!!UI.tfShowArchived;
  const list=transferOrders(S).slice()
    .filter(o=>showArch===!!o.archived)
    .sort((a,b)=>String(a.notified||a.due||"9999").localeCompare(String(b.notified||b.due||"9999")));
  const archN=transferOrders(S).filter(o=>o.archived).length;
  const doneN=transferOrders(S).filter(o=>o.returned&&!o.archived).length;
  const bar='<div class="archive-bar">'+
    (ro?"":'<button class="btn" data-act="tf-archive"'+(doneN?'':' disabled')+'>歸檔已完成'+(doneN?'（'+doneN+' 筆）':'')+'</button>')+
    '<label class="tf-toggle"><input type="checkbox" data-act-change="tf-showarchived"'+(showArch?" checked":"")+'"> 顯示已歸檔</label>'+
    (archN?'<span class="archived-n">已歸檔 '+archN+' 筆</span>':"")+
    (UI.tfArchivedNote?'<span class="archived-n">'+esc(UI.tfArchivedNote)+'</span>':"")+
    '<span class="hint">完成只認「已回一廠」已勾；每月一日自動歸檔逾期已完成。</span></div>';
  const table='<div class="sheettable"><table><thead><tr>'+
    '<th class="rowact"></th><th>通知日期</th><th>加工編號</th><th>加工序</th><th>全部可給數</th><th>可給二廠時間</th><th>急用</th><th>要求回一廠時間</th><th>現在貨在1樓</th><th>現在貨在3樓</th><th>已回一廠</th><th>備註</th></tr></thead><tbody>'+
    (list.map(o=>{
      const urgent=(o.urgentQty||0)>0||!!o.urgentDue;
      const cell=(k,ty,cls="")=>'<td class="'+cls+'">'+editCellHTML("tf",o.id,k,ty,getPath(o,k),ro)+'</td>';
      const pend=k=>pendingDate(getPath(o,k))?'<span class="pending-tag">待確認格式</span>':"";
      return '<tr data-rowid="'+esc(o.id)+'" class="'+(o.returned?"returned":"")+(o.archived?" archived":"")+(o.status==="cancelled"?" cancelled":"")+'">'+
        '<td class="rowact">'+(o.archived
          ?(ro?"":'<button class="rowdel restore" data-act="tf-unarchive" data-id="'+esc(o.id)+'">還原</button>')
          :(o.status==="cancelled"
            ?(ro?"":'<button class="rowdel restore" data-act="tf-restore" data-id="'+esc(o.id)+'">還原</button>')
            :(ro?"":(UI.confirmRow==="tfdel:"+o.id?'<button class="btn danger" data-act="tf-del" data-id="'+esc(o.id)+'">再按一次刪除</button>':'<button class="rowdel" data-act="tf-del" data-id="'+esc(o.id)+'">刪除</button>'))))+'</td>'+
        '<td>'+editCellHTML("tf",o.id,"notified","date",o.notified,ro)+pend("notified")+(o.status==="cancelled"?'<span class="pending-tag">已取消</span>':"")+'</td>'+
        '<td><button class="codelink" data-act="tf-goto" data-id="'+esc(o.id)+'">'+esc(o.code)+'</button></td>'+
        cell("seq","number")+cell("totalQty","number")+
        '<td>'+rawCell("tf",o.id,"expectedSend",o.expectedSend,o.expectedSendRaw,ro)+pend("expectedSend")+'</td>'+
        '<td class="tf-urgent blank">'+(((o.urgentQty||0)>0)?editCellHTML("tf",o.id,"urgentQty","number",o.urgentQty,ro):"")+'</td>'+
        '<td>'+editCellHTML("tf",o.id,"due","date",o.due,ro)+pend("due")+'</td>'+
        cell("floor1","number")+cell("floor3","number")+
        '<td class="chk"><input type="checkbox" data-act-change="tf-returned" data-id="'+esc(o.id)+'"'+(o.returned?" checked":"")+(ro?" disabled":"")+' aria-label="已回一廠"></td>'+
        cell("note","text")+
        '</tr>';
    }).join("")||'<tr><td colspan="12"><div class="empty">還沒有資料，按「＋加一列」開始記</div></td></tr>')+
    '</tbody></table></div>';
  return pageShell("給二廠／回一廠","料送二廠加工，何時要回一廠。與欠缺品項分開。",bar+table,ro,"tf-addrow");
}
function reviewPageHTML(){
  const step=UI.reviewStep||1;
  const ro=!canMaster();
  const pendE=S.employees.filter(e=>e.reviewStatus==='pending').length;
  const pendM=S.machines.filter(m=>m.reviewStatus==='pending').length;
  const head='<div class="page-top"><div class="page-top-row"><button class="btn pageback" data-act="page" data-v="board">← 回今天班表</button><div class="page-title"><h1>初次核對資料</h1><span class="savestate '+SYNC.state+'">'+pageSaveState()+'</span></div></div>'+
    '<p class="page-sub">核對完成前，自動排班與故障重排保持關閉。三個步驟逐一確認。</p></div>';
  const steps='<div class="wiz-steps">'+
    [1,2,3].map(n=>'<button class="wiz-step'+(n===step?' on':'')+(n<step?' done':'')+'" data-act="review-step" data-v="'+n+'"'+(ro?' disabled':'')+'>步驟 '+n+'：'+['員工','設備／工位','技能與工時'][n-1]+(n===1&&pendE?'（待確認 '+pendE+'）':'')+(n===2&&pendM?'（待確認 '+pendM+'）':'')+'</button>').join('')+'</div>';
  let body='';
  if(step===1){
    const groups=['all','ungrouped',...(S.groups||[]).map(g=>g.id)];
    const filter=UI.reviewGroup||'all';
    const list=S.employees.filter(e=>filter==='all'||(filter==='ungrouped'&&!employeeGroups(S,e.id).length)||employeeGroups(S,e.id).some(x=>x.group.id===filter));
    body='<div class="wiz-filter">'+groups.map(gid=>{const g=(S.groups||[]).find(x=>x.id===gid);const label=gid==='all'?'全部':gid==='ungrouped'?'尚未分組':esc(g.name);return '<button class="btn" data-act="review-group" data-v="'+esc(gid)+'" aria-pressed="'+(filter===gid)+'">'+label+'</button>';}).join('')+'</div>'+
      '<div class="wiz-cards">'+(list.map(E=>{
        const gs=employeeGroups(S,E.id).map(x=>x.group.name).join('、');
        return '<div class="wiz-card"><div class="wiz-main"><b class="wiz-name">'+esc(E.name)+'</b>'+
          '<div class="wiz-meta"><span>代號 '+esc(E.sourceCode||'—')+'</span>'+(gs?'<span>分組 '+esc(gs)+'</span>':'<span>未分組</span>')+'</div>'+
          (E.reviewStatus==='pending'?'<div class="wiz-pending">待確認</div>':'<div class="wiz-ok">已核對</div>')+'</div>'+
          '<div class="wiz-acts">'+(ro?'':'<button class="btn primary wiz-big" data-act="review-mark" data-kind="emp" data-id="'+esc(E.id)+'" data-v="ok">對</button><button class="btn danger wiz-big" data-act="review-mark" data-kind="emp" data-id="'+esc(E.id)+'" data-v="no">不對</button>')+'</div></div>';
      }).join('')||'<div class="empty">此篩選沒有員工</div>')+'</div>';
  }else if(step===2){
    body='<div class="wiz-cards">'+(S.machines.map(M=>{
      return '<div class="wiz-card"><div class="wiz-main"><b class="wiz-name">'+esc(M.label||M.id)+'</b>'+
        '<div class="wiz-meta"><span>'+esc(M.id)+'</span>'+(M.catalogSide?'<span>'+esc(M.catalogSide)+'側</span>':'')+'</div>'+
        (M.reviewStatus==='pending'?'<div class="wiz-pending">待確認</div>':'<div class="wiz-ok">已核對</div>')+'</div>'+
        '<div class="wiz-acts">'+(ro?'':'<button class="btn primary wiz-big" data-act="review-mark" data-kind="mach" data-id="'+esc(M.id)+'" data-v="ok">對</button><button class="btn danger wiz-big" data-act="review-mark" data-kind="mach" data-id="'+esc(M.id)+'" data-v="no">不對</button>')+'</div></div>';
    }).join(''))+'</div>';
  }else{
    body='<div class="wiz-cards">'+(S.employees.map(E=>{
      const sk=E.skills.map(id=>mach(id)?mach(id).id+' '+(mach(id).label||''):'?').join('、');
      const wd=E.otWeekdays&&E.otWeekdays.length?E.otWeekdays.map(w=>'週'+WD[w]).join('、'):'不可加班';
      return '<div class="wiz-card skills"><div class="wiz-main"><b class="wiz-name">'+esc(E.name)+'</b>'+
        '<div class="wiz-meta"><span>會操作：'+(sk?esc(sk):'未設定')+'</span><span>可加班：'+esc(wd)+'</span><span>同時顧機上限 '+E.maxMachines+' 台</span></div></div></div>';
    }).join(''))+'</div>';
  }
  const allDone=!pendE&&!pendM;
  const foot='<div class="wiz-foot">'+(step>1&&!ro?'<button class="btn wiz-big" data-act="review-step" data-v="'+(step-1)+'">上一步</button>':'')+
    (step<3&&!ro?'<button class="btn primary wiz-big" data-act="review-step" data-v="'+(step+1)+'">下一步</button>':'')+
    (step===3&&!ro?'<button class="btn primary wiz-big" data-act="review-done"'+(allDone?'':' disabled')+'>核對完成</button>':'')+'</div>';
  return '<div class="fullpage wiz">'+head+steps+body+foot+'</div>';
}
function workLogPageHTML(){
  const ro=!canPermission("worklog.manage");
  const filter=UI.workLogDate||"";
  const all=[...(S.workLog||[])].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  const rows=filter?all.filter(r=>r.date===filter):all;
  const table='<div class="sheettable"><table><thead><tr>'+
    '<th class="rowact"></th><th>日期</th><th>加工編號</th><th>合格數</th><th>不良</th><th>開工（時：分）</th><th>完工（時：分）</th><th>修模時間</th><th>加工者</th><th>備註</th></tr></thead><tbody>'+
    (rows.map(r=>{
      const cell=(k,ty)=>'<td>'+editCellHTML("wl",r.id,k,ty,getPath(r,k),ro)+'</td>';
      const hm=(h,m,base)=>{
        if(ro)return (r[base+"H"]??"" )===""?"<span class='mute'>—</span>":esc(pad(r[base+"H"])+":"+pad(r[base+"M"]??"0"));
        const editing=UI.editCell&&UI.editCell.table==="wl"&&UI.editCell.id===r.id&&(UI.editCell.key===base+"H"||UI.editCell.key===base+"M");
        if(editing)return editCellHTML("wl",r.id,base+"H","hour",r[base+"H"],false)+editCellHTML("wl",r.id,base+"M","minute",r[base+"M"],false);
        const txt=(r[base+"H"]??"" )===""?"—":pad(r[base+"H"])+":"+(r[base+"M"]??"0");
        return '<button class="cellbtn" data-act="cell-edit" data-cell="wl" data-id="'+esc(r.id)+'" data-key="'+base+'H" data-type="hour">'+esc(txt)+'</button>';
      };
      return '<tr data-rowid="'+esc(r.id)+'">'+
        '<td class="rowact">'+(ro?"":(UI.confirmRow==="wldel:"+r.id?'<button class="btn danger" data-act="wl-del" data-id="'+esc(r.id)+'">再按一次刪除</button>':'<button class="rowdel" data-act="wl-del" data-id="'+esc(r.id)+'">刪除</button>'))+'</td>'+
        cell("date","date")+cell("code","text")+cell("goodQty","number")+cell("badQty","number")+
        '<td class="hmcell">'+hm(r.startH,r.startM,"start")+'</td>'+
        '<td class="hmcell">'+hm(r.endH,r.endM,"end")+'</td>'+
        cell("reworkMin","number")+cell("worker","text")+cell("note","text")+
        '</tr>';
    }).join("")||'<tr><td colspan="10"><div class="empty">還沒有資料，按下方加一列</div></td></tr>')+
    '</tbody></table></div>';
  const filterBar='<div class="wl-filter"><label for="wl-date">依日期篩</label><input type="date" id="wl-date" value="'+esc(filter)+'" data-act-change="wl-filter"><button class="btn" data-act="wl-clearfilter">清除</button></div>';
  return pageShell("工作紀錄","",filterBar+table,ro,"wl-addrow");
}

MODALS['memo-edit']=m=>({title:'新增備忘',body:
  '<div class="hint">備忘只提醒現場，不會直接修改排程。</div>'+
  '<div class="row2"><div class="field"><label for="memo-machine">機台（可不選）</label><select class="inp" id="memo-machine"><option value="">不指定</option>'+shownMachines().map(x=>'<option value="'+x.id+'">'+esc(x.id+' '+x.label)+'</option>').join('')+'</select></div>'+
  '<div class="field"><label for="memo-employee">人員（可不選）</label><select class="inp" id="memo-employee"><option value="">不指定</option>'+shownEmployees().map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')+'</select></div></div>'+
  '<div class="field"><label for="memo-text">一句話</label><input class="inp" id="memo-text" maxlength="140" value="'+esc(m.text||'')+'"></div>'+
  '<label class="permission-row"><input id="memo-pinned" type="checkbox"><span><b>釘選</b><small>固定顯示在其他備忘前面</small></span></label>',
  foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="memo-save">儲存備忘</button>'});

async function resolveLeaveRequest(button){
  if(!canIncidents())return;button.disabled=true;
  try{await STORE.resolveLeaveRequest(button.dataset.id,button.dataset.v);UI.drawer='people';await reloadFromStore();toast(button.dataset.v==='approved'?'已准假並寫入正式請假':'已駁回，班表不變');}
  catch(e){button.disabled=false;toast(e.message);}
}
async function toggleMemoPin(button){
  if(!canPermission('notes.manage'))return;const memo=(S.memos||[]).find(x=>x.id===button.dataset.id);if(!memo)return;button.disabled=true;
  try{await STORE.saveMemo({...memo,pinned:!memo.pinned});UI.drawer='notes';await reloadFromStore();toast(memo.pinned?'已取消釘選':'已釘選備忘');}
  catch(e){button.disabled=false;toast(e.message);}
}
Object.assign(MODAL_ACT,{
  'leave-request-save':async button=>{if(!canIncidents())return;const employeeId=$('#leave-request-employee')?.value,date=$('#leave-request-date')?.value,note=$('#leave-request-note')?.value.trim();if(!employeeId||!date){toast('請選擇人員與日期');return;}button.disabled=true;try{await STORE.createLeaveRequest({id:uid(),employeeId,date,note,status:'pending'});closeModal();await reloadFromStore();UI.drawer='people';render();toast('已送出請假詢問，尚未成為正式請假');}catch(e){button.disabled=false;toast(e.message);}},
  'memo-save':async button=>{if(!canPermission('notes.manage'))return;const text=$('#memo-text')?.value.trim(),machineId=$('#memo-machine')?.value||null,employeeId=$('#memo-employee')?.value||null;if(!text){toast('請填寫一句備忘');return;}if(!machineId&&!employeeId){toast('請至少指定一台機台或一位人員');return;}button.disabled=true;try{await STORE.saveMemo({id:uid(),text,machineId,employeeId,pinned:!!$('#memo-pinned')?.checked,author:STORE.userName||'本機',createdAt:new Date().toISOString()});closeModal();await reloadFromStore();UI.drawer='notes';render();toast('備忘已保存');}catch(e){button.disabled=false;toast(e.message);}}
});

// ---------- 分組：一人可多組，部門與廠別不是技能限制 ----------
MODALS.groups=()=>({title:'員工分組／部門',body:
  '<div class="hint">分組與廠別、機台技能分開。一人可加入多組，分組可跨部門或跨廠；這不會自動修改所屬廠別或授予機台技能。原檔分組是來源紀錄，不代表已核定現在的人力配置。</div>'+
  (S.groups||[]).map(g=>{const ms=S.groupMembers.filter(m=>m.groupId===g.id),pending=ms.filter(m=>m.reviewStatus==='pending').length;
    return '<button class="btn" style="display:flex;width:100%;margin:10px 0;justify-content:space-between;height:auto;min-height:46px" data-act="group-edit" data-id="'+esc(g.id)+'"><span>'+esc(g.name)+(g.department?' · '+esc(g.department):'')+'</span><span>'+esc(g.homeFactory?factoryName(g.homeFactory):'跨廠')+' · '+ms.length+' 人'+(pending?' · '+pending+' 待核對':'')+'</span></button>';
  }).join('')+((S.groups||[]).length?'':'<div class="hint">還沒有分組，可建立第一個分組。</div>'),
  foot:(canGroups()?'<button class="btn primary" data-act="group-new">＋新增分組</button>':'')+'<button class="btn" data-act="close">關閉</button>'});
MODALS['staff-group']=m=>{
  if(!m.draft){const old=S.groups.find(g=>g.id===m.id);m.draft=old?JSON.parse(JSON.stringify(old)):{id:uid(),name:'',department:'',homeFactory:UI.factory==='all'?null:UI.factory,sourceRef:null};
    m.members=JSON.parse(JSON.stringify(S.groupMembers.filter(x=>x.groupId===m.draft.id)));}
  const D=m.draft,ro=!canGroups(),off=ro?' disabled':'';
  const body='<div class="field"><label for="group-name">分組名稱</label><input class="inp" id="group-name" data-bind="name" maxlength="80" value="'+esc(D.name)+'"'+off+'></div>'+
    '<div class="field"><label for="group-department">部門（可不填）</label><input class="inp" id="group-department" data-bind="department" maxlength="80" value="'+esc(D.department||'')+'"'+off+'><div class="hint">部門可自行命名；同一員工可以加入不同部門的分組，不另外建立重複員工。</div></div>'+
    '<div class="field"><label for="group-factory">分組所屬範圍</label><select class="inp" id="group-factory" data-bind="homeFactory"'+off+'>'+[['all','跨廠'],[1,'1 廠'],[2,'2 廠']].map(([id,t])=>'<option value="'+id+'"'+((D.homeFactory??'all')==id?' selected':'')+'>'+t+'</option>').join('')+'</select><div class="hint">分組範圍是管理標籤，不會限制加入人員；跨廠實際排班仍須符合現行技能與廠別規則。</div></div>'+
    (D.sourceRef?'<div class="hint">分組來源：'+esc(D.sourceRef)+'</div>':'')+
    FACTORIES.map(f=>'<div class="field"><span class="lab">'+factoryName(f)+' · 組員</span><div class="toggles">'+S.employees.filter(e=>factoryOf(e)===f).map(e=>{const mem=m.members.find(x=>x.employeeId===e.id);
      return '<button class="tg" data-act="group-member" data-v="'+esc(e.id)+'" aria-pressed="'+!!mem+'"'+off+'>'+esc(e.name)+(e.sourceCode?' '+esc(e.sourceCode):'')+(mem?'<small>'+memberStatus(mem.reviewStatus)+'</small>':'')+'</button>';
    }).join('')+'</div></div>').join('')+
    m.members.filter(x=>x.reviewStatus==='pending').map(x=>'<div class="hint">'+esc(emp(x.employeeId)?.name)+'：原檔別名的分組尚待核對；不會自動合併身份。'+(ro?'':'<button class="btn" data-act="group-confirm" data-v="'+esc(x.employeeId)+'">僅確認分組</button>')+'</div>').join('');
  return {title:m.id?'分組設定':'新增分組',body,foot:ro?'<button class="btn" data-act="close">關閉</button>':
    (m.id?'<button class="btn danger" data-act="group-retire">停用分組</button>':'')+'<div class="spacer"></div><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="group-save">儲存分組</button>'};
};
Object.assign(MODAL_ACT,{
  'group-member':a=>{if(!canGroups())return;syncInputs();const m=UI.modal,id=a.dataset.v,i=m.members.findIndex(x=>x.employeeId===id);
    if(i<0)m.members.push({groupId:m.draft.id,employeeId:id,reviewStatus:'confirmed',sourceRef:null});else m.members.splice(i,1);renderModal();},
  'group-confirm':a=>{if(!canGroups())return;syncInputs();const member=UI.modal.members.find(x=>x.employeeId===a.dataset.v);if(member)member.reviewStatus='confirmed';renderModal();},
  'group-save':()=>{if(!canGroups())return;syncInputs();const m=UI.modal,D=m.draft;D.name=D.name.trim();D.department=(D.department||'').trim()||null;D.homeFactory=D.homeFactory==='all'||D.homeFactory==null?null:Number(D.homeFactory);
    if(!D.name||D.name.length>80){toast('請填寫 1–80 字的分組名稱');return;}
    if(S.groups.some(g=>g.id!==D.id&&g.name===D.name&&(g.department||null)===D.department&&(g.homeFactory??null)===D.homeFactory)){toast('相同範圍、部門已有這個分組');return;}
    pushUndo();const index=S.groups.findIndex(g=>g.id===D.id);if(index<0)S.groups.push(JSON.parse(JSON.stringify(D)));else S.groups[index]=JSON.parse(JSON.stringify(D));
    S.groupMembers=S.groupMembers.filter(x=>x.groupId!==D.id).concat(JSON.parse(JSON.stringify(m.members)));
    closeModal();commit({kind:'edit',title:'更新員工分組 '+D.name,lines:[]},'groups.manage');},
  'group-retire':a=>{if(!canGroups()||!confirmStep(a,'group-retire'))return;const id=UI.modal.id,name=S.groups.find(g=>g.id===id)?.name;
    pushUndo();S.groups=S.groups.filter(g=>g.id!==id);S.groupMembers=S.groupMembers.filter(m=>m.groupId!==id);if(UI.group===id)UI.group='all';closeModal();commit({kind:'edit',title:'停用員工分組 '+name,lines:[]},'groups.manage');}
});

// ---------- 登入畫面 ----------
function showLogin(err="",email=""){
  $("#app").innerHTML='<main class="login"><form class="login-card" id="loginf">'+
    '<div class="brand"><span class="brand-mark"><span></span></span>產線排程</div>'+
    '<div class="field"><label for="lg-email">帳號（Email）</label><input class="inp" id="lg-email" type="email" autocomplete="username" value="'+esc(email)+'" required></div>'+
    '<div class="field"><label for="lg-pw">密碼</label><input class="inp" id="lg-pw" type="password" autocomplete="current-password" required></div>'+
    (err?'<div class="issue">'+esc(err)+'</div>':"")+
    '<button class="btn primary" type="submit" style="justify-content:center;height:56px;font-size:19px">登入</button>'+
    '<button class="btn" type="button" id="lg-reset">忘記密碼／設定邀請帳號密碼</button>'+
    '<div class="hint">帳號由管理者邀請。收到邀請信，先開啟信中的連結，再到「帳號與連線」設定密碼。</div></form></main>';
  $("#loginf").addEventListener("submit",async e=>{
    e.preventDefault();const btn=e.target.querySelector("button"),email=$("#lg-email").value.trim();btn.disabled=true;btn.textContent="登入中…";
    try{await STORE.login(email,$("#lg-pw").value);await start();}
    catch(err){showLogin(err.message,email);}
  });
  $("#lg-reset").addEventListener("click",async e=>{
    const input=$("#lg-email"),email=input.value.trim();
    if(!input.checkValidity()||!email){showLogin("請先填寫有效的電子郵件",email);return;}
    const btn=e.currentTarget;btn.disabled=true;
    try{await STORE.requestPasswordReset(email,location.origin+location.pathname);
      showLogin("若此帳號存在，密碼設定信已寄出。請開啟信中的連結。",email);}
    catch(err){showLogin(err.message,email);}
  });
}

// ---------- 未排工作、保存試排與現場回報 ----------
MODALS['work-queue']=()=>{
  const rows=workQueue(S,todayStr(),UI.factory);
  return {title:'未排工作與待處理差異',body:'<div class="hint">依工單工序列出尚未排入的件數及已回報短少；不是求解器不可行性證明。交接、空檔及物料仍須在安排預覽中檢查。</div>'+
    rows.map(r=>'<article class="load-row"><b>'+esc(r.code+' · '+r.proc)+'</b> '+(r.overdue?'<span class="tag bad">已過交期</span>':'')+
      '<div class="hint">期限 '+esc(r.due)+' · 已排 '+r.planned+' 件 · 尚待排 '+r.remaining+' 件'+(r.shortfall?' · 回報短少 '+r.shortfall+' 件':'')+'</div>'+
      r.reasons.map(t=>'<div class="hint">'+esc(t)+'</div>').join('')+
      (r.canArrange&&!readOnly?'<button class="btn" data-act="queue-arrange" data-id="'+esc(r.oid)+'" data-step="'+r.step+'">安排此工序</button>':'')+'</article>').join('')+
      (!rows.length?'<div class="okbox">此範圍目前没有未排量或已回報短少。這不等於工作已實際完成。</div>':''),foot:'<button class="btn" data-act="close">關閉</button>'};
};
async function openScenarioList(){
  if(!canScenarios())return;openModal({t:'scenario-list',loading:true});const m=UI.modal;
  try{m.items=await STORE.listScenarios();}catch(e){m.error=e.message;}m.loading=false;if(UI.modal===m)renderModal();
}
MODALS['scenario-list']=m=>({title:'保存的試排情境',body:
  '<div class="hint">情境與正式班表分開保存，只供原本／調整後對照，不提供直接套用。雲端只列出此帳號保存的情境，最多 20 份。</div>'+
  (m.loading?'<div class="hint">讀取中…</div>':m.error?'<div class="issue">'+esc(m.error)+'</div>':
    (m.items||[]).map(s=>'<button class="btn" style="width:100%;height:auto;min-height:48px;margin:8px 0" data-act="scenario-view" data-id="'+esc(s.id)+'">'+esc(s.name)+' · '+esc(s.created_at.slice(0,10))+'</button>').join('')||'<div class="hint">還沒有保存的情境。</div>'),
  foot:'<button class="btn" data-act="scenario-save">保存目前排程</button><button class="btn" data-act="close">關閉</button>'});
MODALS['scenario-save']=m=>({title:'保存試排情境',body:'<div class="hint">只保存比較資料，不套用、不寫入正式班表。之後排程、名冊、技能或現場進度改變，會提示這份情境與現況不同。</div>'+
  '<div class="field"><label for="scenario-name">情境名稱</label><input class="inp" id="scenario-name" maxlength="80" value="'+esc(m.name||'')+'"></div>',
  foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="scenario-confirm">確認保存情境</button>'});
async function saveScenarioFromModal(button){
  if(!canScenarios())return;const m=UI.modal;if(m.t!=='scenario-save')return;
  try{m.name=$('#scenario-name').value;const item=m.item||makeScenario(m.name,m.base,m.candidate,{description:m.description,date:m.date});m.item=item;
    button.disabled=true;await STORE.saveScenario(item);closeModal();toast('情境已保存，正式班表沒有改變');}
  catch(e){button.disabled=false;toast(e.message);}
}
async function viewScenario(id){
  if(!canScenarios())return;
  try{
    const item=await STORE.getScenario(id);if(!item)throw new Error('找不到情境');validateScenario(item.payload);
    const stale=scenarioStale(item,S),B=item.payload.base,A=item.payload.candidate,ev={date:item.payload.date||UI.date};
    const opts=[{id:'S',name:item.name,desc:item.payload.description||'保存的情境',A,state:JSON.stringify(A),
      lines:[],mt:measure(B,A,ev),applicable:false,diagnostics:[stale?'此情境的基準與現況不同；僅供查看，不可覆蓋目前班表':'保存的情境僅供比較，不可直接套用'],best:false}];
    enterPreview({title:'保存情境：'+item.name,logTitle:item.name,kind:'edit',base:JSON.stringify(B),B,opts,ev,
      extra:{savedScenario:true,engine:'歷史試排資料'}});
  }catch(e){toast(e.message);}
}
const reportingRole=()=>STORE.kind==='local'||canPermission('execution.manage')?'boss':STORE.role;
const reportStatus=r=>!r?'尚未開始':r.status==='done'?'已回報完成':'進行中';
MODALS.execution=()=>{
  const worker=reportingRole()==='worker';
  const blocks=S.blocks.filter(b=>b.date===UI.date&&inFactory(mach(b.m),UI.factory)&&(!worker||b.emp===STORE.employeeId)).sort((a,b)=>a.s-b.s);
  const ticket=(b,caption)=>{if(!b)return '<article class="worker-ticket empty"><span>'+caption+'</span><b>沒有排定工作</b></article>';
    const r=executionOf(S,b.id);return '<article class="worker-ticket '+(r?.status==='running'?'running':'')+'"><span>'+caption+'</span><b>'+esc(order(b.oid)?.code||'?')+' · '+esc(stepName(b))+'</b><strong>'+esc(mach(b.m)?.label||b.m)+'</strong><time>'+hm(b.s)+'–'+hm(b.e)+'</time><small>'+reportStatus(r)+' · 計畫 '+b.qty+' 件</small>'+
      (canReport(reportingRole(),STORE.employeeId,b)&&!S.setupPending?'<button class="btn primary" data-act="report-open" data-id="'+esc(b.id)+'">'+(r?.status==='running'?'繼續回報':'查看工作')+'</button>':'')+'</article>';};
  const line=worker?workerTimeline(S,STORE.employeeId,UI.date,UI.date===todayStr()?nowMin():DAY0):null;
  const workerBody=worker?'<section class="worker-console"><div class="worker-machine">我的設備　<b>'+esc(line?.machineId?(mach(line.machineId)?.label||line.machineId):'尚未指定')+'</b></div>'+ticket(line?.current,'現在')+ticket(line?.next,'下一件')+'</section>':'';
  const managerBody=!worker?blocks.map(b=>{const r=executionOf(S,b.id);return '<article class="load-row"><b>'+esc((order(b.oid)?.code||'?')+' · '+stepName(b))+'</b>'+
      '<div class="hint">'+esc(emp(b.emp)?.name||'未指定')+' · '+esc(mach(b.m)?.label||b.m)+' · 原定 '+hm(b.s)+'–'+hm(b.e)+' · '+b.qty+' 件</div>'+
      '<div class="hint">'+reportStatus(r)+(r?' · 累計 '+r.qtyDone+' 件 · 差異 '+(r.qtyDone-b.qty)+' 件':'')+'</div>'+
      (canReport(reportingRole(),STORE.employeeId,b)&&!S.setupPending?'<button class="btn" data-act="report-open" data-id="'+esc(b.id)+'">查看／回報進度</button>':'')+'</article>';}).join(''):'';
  return {title:'現場回報 · '+mdw(UI.date),body:
    '<div class="hint">開始、做了幾件、完工都另外保存實際事實。完工少做的件數會回到未排工作，下一次重排會補足；不會悄悄改掉原定產能。</div>'+
    (worker&&!STORE.employeeId?'<div class="issue">帳號尚未綁定員工，請由管理員綁定後使用。</div>':'')+
    (S.setupPending?'<div class="issue">來源名冊與工時待確認，不能回報。</div>':'')+
    workerBody+managerBody+
    (!blocks.length?'<div class="hint">這個日期與範圍沒有可回報的排班；待確認的原表文字不是正式工作方塊。</div>':''),
    foot:'<button class="btn" data-act="close">關閉</button>'};
};
MODALS['execution-report']=m=>{
  const b=S.blocks.find(b=>b.id===m.id);if(!b)return {title:'現場回報',body:'<div class="issue">工作已變動，請重新載入。</div>'};
  const r=executionOf(S,b.id),allowed=canReport(reportingRole(),STORE.employeeId,b)&&!S.setupPending&&!PV;
  const actual=t=>t?new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'—';
  return {title:'回報 '+(order(b.oid)?.code||'?')+' · '+stepName(b),body:
    '<dl class="kv"><dt>原定</dt><dd>'+mdw(b.date)+' '+hm(b.s)+'–'+hm(b.e)+' · '+b.qty+' 件</dd><dt>狀態</dt><dd>'+reportStatus(r)+'</dd><dt>實際開始</dt><dd>'+esc(actual(r?.startedAt))+'</dd><dt>實際完成</dt><dd>'+esc(actual(r?.finishedAt))+'</dd></dl>'+
    '<div class="hint">'+(r?'已鎖定排程，不可拖曳、改量、解除固定或刪除。':'按開始後會鎖定此段工作。')+' 件數填累計，不是這次增加量；完成會記錄實際時間，不用原定結束時間代替。</div>'+
    (r&&r.status!=='done'?'<div class="field"><label for="execution-qty">累計已做件數</label><input class="inp" id="execution-qty" type="number" min="'+r.qtyDone+'" max="'+b.qty+'" step="1" value="'+r.qtyDone+'"></div>':'')+
    (r?.status==='done'?'<div class="hint">已完成 '+r.qtyDone+' 件；相對原定差異 '+(r.qtyDone-b.qty)+' 件。此版不提供修改已完成回報。</div>':''),
    foot:'<div class="work-report-actions">'+(allowed&&r?.status!=='done'?
      (m.pendingRequest?'<button class="btn danger" data-act="report-work" data-v="retry">重試上一筆回報</button>':
        '<button class="btn primary" data-act="report-work" data-v="start" '+(r?'disabled':'')+'>開工</button>'+
        '<button class="btn" data-act="report-work" data-v="quantity" '+(!r?'disabled':'')+'>做了幾件</button>'+
        '<button class="btn success" data-act="report-work" data-v="finish" '+(!r?'disabled':'')+'>完工</button>'):'')+'<button class="btn" data-act="close">關閉</button></div>'};
};
async function reportWork(button){
  const m=UI.modal;if(m?.t!=='execution-report'||m.busy||PV)return;
  const b=S.blocks.find(b=>b.id===m.id);if(!b||!canReport(reportingRole(),STORE.employeeId,b))return;
  const action=button.dataset.v,r=executionOf(S,b.id),qty=action==='start'?0:Number($('#execution-qty')?.value);
  if(!m.pendingRequest&&action!=='start'&&!$('#execution-qty')?.value.trim()){toast('請填入累計已做件數；沒有產出請明確填 0');return;}
  if(!m.pendingRequest&&(!Number.isInteger(qty)||qty<(r?.qtyDone||0)||qty>b.qty)){toast('累計件數不可倒退或超過原定件數');return;}
  m.pendingRequest ||= {id:uid(),blockId:b.id,action,qtyDone:qty,expectedRevision:r?.revision||0};
  m.busy=true;button.disabled=true;
  try{await syncChain;await STORE.reportExecution(m.pendingRequest);await reloadFromStore();m.pendingRequest=null;undoStack=[];toast('進度已保存');}
  catch(e){
    const confirmed=e.rejected||e.conflict;
    toast(confirmed?e.message:'沒存到：網路或伺服器沒有確認這筆回報，請按「重試上一筆回報」');
    if(e.rejected)m.pendingRequest=null;
    if(e.conflict){m.pendingRequest=null;await reloadFromStore();}
  }
  finally{m.busy=false;if(UI.modal===m)renderModal();}
}

// ---------- 工作內容、設備／工位、一般工作排班 ----------
const workName=a=>workCatalog(S).find(w=>w.id===a.workId)?.name||'工作內容已移除';
const referenceOrder=id=>order(id)||S.workReferenceOrders?.find(o=>o.id===id);
const timeValue=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const textInput=(id,label,value,type='text',off='')=>'<div class="field"><label for="'+id+'">'+label+'</label><input class="inp" id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+off+'></div>';
MODALS['work-contents']=()=>({title:'工作內容 · 與設備分開管理',body:
  '<div class="hint">三部分：工作內容（做什麼）、設備／工位（需要時才指定）、排班方塊（人員、時間及參考件數）。既有產品工序仍依原公式排程；下面的獨立工作不會自動算進工單完成量。</div>'+
  '<h4>產品工序工作內容</h4><div class="hint">'+[...new Set(S.products.flatMap(p=>p.steps.map(s=>s.proc)))].map(esc).join('、')+'</div><button class="btn" data-act="products">查看產品工序</button>'+
  '<h4>可獨立安排的工作內容</h4>'+workCatalog(S).filter(w=>inFactory(w,UI.factory)).map(w=>'<button class="rline" data-act="work-content-edit" data-id="'+esc(w.id)+'"><b>'+esc(w.name)+'</b><span>'+factoryName(w.factory)+' · '+(w.requiresResource?'需要設備／工位':'純人工，不需機台')+' · 核定 '+w.employeeIds.length+' 人</span></button>').join('')+
  (!workCatalog(S).length?'<div class="empty">尚未建立獨立工作內容；不會從 1023 欄名推測技能或產能。</div>':'')+
  '<div class="hint">1023 的工作／設備／規格對照在「歷史排程 → 製作項目名冊」查看；未確認欄位保持待確認。</div>',
  foot:(canWorkContents()?'<button class="btn primary" data-act="work-content-new">新增工作內容</button>':'')+'<button class="btn" data-act="close">關閉</button>'});
MODALS['work-content-edit']=m=>{
  m.draft ||= structuredClone(workCatalog(S).find(w=>w.id===m.id)||{id:uid(),name:'',factory:UI.factory==='all'?1:UI.factory,requiresResource:false,employeeIds:[],resourceIds:[],reviewStatus:'confirmed'});
  const D=m.draft,off=canWorkContents()?'':'disabled';
  const picks=(items,key,label)=>'<div class="field"><span class="lab">'+label+'</span>'+items.filter(x=>factoryOf(x)===D.factory).map(x=>'<label><input type="checkbox" id="gw-'+key+'-'+esc(x.id)+'" data-key="'+key+'" data-id="'+esc(x.id)+'" '+(D[key].includes(x.id)?'checked':'')+' '+off+'> '+esc(x.name||x.label)+(x.reviewStatus==='pending'?' · 待確認':'')+'</label>').join('')+'</div>';
  return {title:m.id?'工作內容設定':'新增工作內容',body:textInput('gw-name','工作內容名稱',D.name,'text',off)+
    '<div class="field"><label for="gw-factory">所屬廠別</label><select class="inp" id="gw-factory" '+off+'>'+FACTORIES.map(f=>'<option value="'+f+'" '+(D.factory===f?'selected':'')+'>'+factoryName(f)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="gw-kind">工作方式</label><select class="inp" id="gw-kind" '+off+'><option value="manual" '+(!D.requiresResource?'selected':'')+'>純人工，不需要機台</option><option value="resource" '+(D.requiresResource?'selected':'')+'>需要設備／工位</option></select></div>'+
    '<div class="hint">核定人員與設備由你明確勾選，不依原表顏色、名字位置或分組自動認定。設備工作另須具操作技能。</div>'+
    picks(S.employees,'employeeIds','核定可做此工作的人員')+(D.requiresResource?picks(S.machines,'resourceIds','允許使用的設備／工位'):'<div class="hint">純人工工作占用整段員工時間，不能一邊顧機台一邊做。</div>'),
    foot:'<button class="btn" data-act="close">取消</button>'+(canWorkContents()?'<button class="btn primary" data-act="gw-content-save">儲存工作內容</button>':'')};
};
function readGeneralFields(){
  const m=UI.modal,D=m?.draft;if(!D)return;
  if(m.t==='work-content-edit'){D.name=$('#gw-name')?.value||'';}
  if(m.t==='general-edit'){
    D.date=$('#gw-date')?.value||D.date;D.s=timeValue($('#gw-start')?.value||hm(D.s));D.e=timeValue($('#gw-end')?.value||hm(D.e));
    const q=$('#gw-qty')?.value;D.qty=q===''?null:Number(q);D.note=$('#gw-note')?.value||'';D.orderId=$('#gw-order')?.value||null;
    D.transferBatchId=$('#gw-transfer')?.value||null;D.transferStage=D.transferBatchId?($('#gw-stage')?.value||'process'):null;
  }
}
function generalChange(el){
  const m=UI.modal,D=m?.draft;if(!D)return;readGeneralFields();
  if(m.t==='work-content-edit'&&canWorkContents()){
    if(el.dataset.key){const key=el.dataset.key;D[key]=D[key].filter(x=>x!==el.dataset.id);if(el.checked)D[key].push(el.dataset.id);}
    if(el.id==='gw-factory'){D.factory=Number(el.value);D.employeeIds=[];D.resourceIds=[];}
    if(el.id==='gw-kind'){D.requiresResource=el.value==='resource';if(!D.requiresResource)D.resourceIds=[];}
  }
  if(m.t==='general-edit'){
    if(el.id==='gw-work'){D.workId=el.value;D.emp='';D.resourceId=null;}
    if(el.id==='gw-employee')D.emp=el.value;
    if(el.id==='gw-resource')D.resourceId=el.value||null;
  }
  renderModal();
}
MODALS['general-edit']=m=>{
  const existing=assignments(S).find(a=>a.id===m.id),ro=readOnly||S.setupPending||!!existing&&absOf(existing.date,existing.s)<nowAbs();
  m.draft ||= structuredClone(existing||{id:uid(),workId:workCatalog(S).find(w=>inFactory(w,UI.factory))?.id||'',emp:'',resourceId:null,date:UI.date,s:UI.date===todayStr()?Math.min(1140,Math.max(480,Math.ceil(nowMin()/10)*10)):480,e:UI.date===todayStr()?Math.min(1200,Math.max(540,Math.ceil(nowMin()/10)*10+60)):540,qty:null,orderId:null,note:''});
  const D=m.draft,w=workCatalog(S).find(w=>w.id===D.workId),off=ro?'disabled':'';
  const select=(id,label,items,value)=>'<div class="field"><label for="'+id+'">'+label+'</label><select class="inp" id="'+id+'" '+off+'><option value="">請選擇</option>'+items.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===value?'selected':'')+'>'+esc(x.name||x.label||x.code)+'</option>').join('')+'</select></div>';
  return {title:existing?'一般工作排班':'新增一般工作排班',body:
    '<div class="hint">先選工作內容、人員與時間。純人工不需要設備；參考件數與工單不會充當工序產能或工單完成量。'+(ro?'目前只供查看。':'確認前不更動排程。')+'</div>'+
    select('gw-work','工作內容',workCatalog(S).filter(w=>inFactory(w,UI.factory)),D.workId)+
    select('gw-employee','執行員工',S.employees.filter(e=>w?.employeeIds.includes(e.id)),D.emp)+
    (w?.requiresResource?select('gw-resource','設備／工位',S.machines.filter(m=>w.resourceIds.includes(m.id)),D.resourceId):'<div class="hint">工作位置：不需機台（純人工）</div>')+
    textInput('gw-date','工作日期',D.date,'date',off)+'<div class="row2">'+textInput('gw-start','工作開始',hm(D.s),'time',off)+textInput('gw-end','工作結束',hm(D.e),'time',off)+'</div>'+
    textInput('gw-qty',D.transferBatchId?'跨廠計畫件數（必填）':'參考件數（可留空）',D.qty??'','number',off)+
    select('gw-transfer','跨廠加工批次（可不選）',transferOrders(S).flatMap(o=>o.batches.map(b=>({id:b.id,name:o.code+'／'+b.code+' · '+o.itemCode}))),D.transferBatchId)+
    (D.transferBatchId?'<div class="field"><label for="gw-stage">跨廠工作階段</label><select class="inp" id="gw-stage" '+off+'><option value="process" '+(D.transferStage!=='return'?'selected':'')+'>加工廠加工</option><option value="return" '+(D.transferStage==='return'?'selected':'')+'>回廠點收後工作</option></select></div>':'')+
    select('gw-order','參考工單（可不選）',S.orders.concat((S.workReferenceOrders||[]).filter(o=>!S.orders.some(x=>x.id===o.id))),D.orderId)+textInput('gw-note','工作備註',D.note,'text',off),
    foot:(existing&&!ro?'<button class="btn danger" data-act="gw-remove-preview">移除此段工作</button>':'')+'<button class="btn" data-act="close">取消</button>'+(!ro?'<button class="btn primary" data-act="gw-preview">預覽工作排班</button>':'')};
};
function previewGeneral(D){
  const issues=assignmentIssues(S,D,dayInfo(D.date).win,{today:todayStr(),nowMin:nowMin()});
  openModal({t:'general-preview',draft:structuredClone(D),issues});
}
MODALS['general-preview']=m=>({title:'一般工作排班預覽',body:
  '<dl class="kv"><dt>工作內容</dt><dd>'+esc(workName(m.draft))+'</dd><dt>執行員工</dt><dd>'+esc(emp(m.draft.emp)?.name||'未指定')+'</dd><dt>設備／工位</dt><dd>'+esc(mach(m.draft.resourceId)?.label||'不需機台')+'</dd><dt>時段</dt><dd>'+esc(m.draft.date)+' '+hm(m.draft.s)+'–'+hm(m.draft.e)+'（'+(m.draft.e-m.draft.s)+' 分）</dd></dl>'+
  '<div class="hint">不改產品工序與其他工作。件數只作參考，不推定實際完成或產能。</div>'+
  transferPlanWarnings(S,m.draft).map(t=>'<div class="issue">'+esc(t)+'。可保存為預排；實際加工完成仍須先點收。</div>').join('')+
  (m.issues.length?m.issues.map(t=>'<div class="issue">'+esc(t)+'</div>').join(''):'<div class="okbox">檢查通過；確認後才會存入排程。</div>'),
  foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="gw-apply" '+(m.issues.length?'disabled':'')+'>確認工作排班</button>'});
MODAL_ACT['gw-content-save']=()=>{
  if(PV||!canWorkContents())return;readGeneralFields();const D=UI.modal.draft;D.name=D.name.trim();
  const candidate=structuredClone(S);candidate.workContents=workCatalog(S).filter(w=>w.id!==D.id).concat(D);
  try{validateGeneralWork(candidate,{today:todayStr(),baseAssignments:assignments(S)});validateTransfers(candidate,{before:S});}catch(e){toast(e.message);return;}
  pushUndo();S.workContents=candidate.workContents;closeModal();commit({kind:'edit',title:'更新工作內容 '+D.name,lines:[]},'work_contents.manage');
};
MODAL_ACT['gw-preview']=()=>{if(PV||readOnly||S.setupPending)return;readGeneralFields();previewGeneral(UI.modal.draft);};
MODAL_ACT['gw-remove-preview']=()=>{if(PV||readOnly||S.setupPending||!UI.modal?.id)return;openModal({t:'general-remove',id:UI.modal.id});};
MODALS['general-remove']=m=>({title:'移除工作預覽',body:'<div class="hint">確認後只移除這段一般工作，不動產品排程。可以使用「復原」。</div>',foot:'<button class="btn" data-act="close">取消</button><button class="btn danger" data-act="gw-remove">確認移除</button>'});
MODAL_ACT['gw-remove']=()=>{if(PV||readOnly||S.setupPending||UI.modal?.t!=='general-remove')return;const a=assignments(S).find(a=>a.id===UI.modal.id);if(!a||absOf(a.date,a.s)<nowAbs())return;pushUndo();S.workAssignments=assignments(S).filter(x=>x.id!==a.id);closeModal();commit({kind:'edit',title:'移除一般工作 '+workName(a),lines:[]});};
MODAL_ACT['gw-apply']=()=>{
  if(PV||readOnly||S.setupPending||UI.modal?.t!=='general-preview')return;const D=UI.modal.draft;
  const issues=assignmentIssues(S,D,dayInfo(D.date).win,{today:todayStr(),nowMin:nowMin()});if(issues.length){toast(issues.join('；'));return;}
  pushUndo();S.workAssignments=assignments(S).filter(a=>a.id!==D.id).concat(D);closeModal();commit({kind:'edit',title:'安排 '+workName(D)+' · '+emp(D.emp).name,lines:[]});
};
function workBlockHTML(a,px){
  const h=px(a.e)-px(a.s),bad=assignmentIssues(S,a,dayInfo(a.date).win).length;
  const warning=materialWarning(S,a),linked=a.transferBatchId&&batchOf(S,a.transferBatchId);
  const matched=!UI.focus||UI.focus.type==='order'&&a.orderId===UI.focus.id||UI.focus.type==='employee'&&a.emp===UI.focus.id||UI.focus.type==='machine'&&a.resourceId===UI.focus.id;
  return '<div class="workblk '+(bad||warning?'bad ':'')+(UI.focus?(matched?'ops-focus':'ops-dim'):'')+'" data-gid="'+esc(a.id)+'" tabindex="0" role="button" aria-label="'+esc(emp(a.emp)?.name+' '+workName(a)+(warning?' 待料':''))+'" title="'+esc(warning||linked&&linked.order.code+'／'+linked.batch.code||'')+'" style="position:absolute;left:4px;right:4px;top:'+px(a.s)+'px;height:'+Math.max(20,h-2)+'px;background:'+empColor(a.emp)+';color:#17212b;border-radius:6px;padding:5px;overflow:hidden"><b>'+esc(emp(a.emp)?.name||'?')+'</b><div>'+esc(workName(a))+(warning?' · 待料':'')+'</div><small>'+hm(a.s)+'–'+hm(a.e)+(linked?' · '+esc(linked.order.code):'')+'</small>'+(!readOnly&&absOf(a.date,a.s)>=nowAbs()?'<div class="resize-handle" data-gresize="1" title="拉長或縮短工作時間"></div>':'')+'</div>';
}
function workGridHTML(title,lanes){
  const d=UI.date,di=dayInfo(d),px=m=>(m-480)/60*hourPx();
  let times='';for(let m=480;m<1200;m+=30)times+='<div class="'+(m%60?'half':'')+'">'+hm(m)+'</div>';
  const cols=lanes.map(l=>'<div class="col gcol" data-gwork="'+esc(l.workId||'')+'" data-gemp="'+esc(l.emp||'')+'" data-gresource="'+esc(l.resourceId||'')+'" style="height:'+px(1200)+'px">'+
    '<div class="zone lunch" style="top:'+px(720)+'px;height:'+(px(780)-px(720))+'px">午休</div>'+
    (!di.ot?'<div class="zone ot-off" style="top:'+px(1020)+'px;height:'+(px(1200)-px(1020))+'px">未開加班</div>':'')+
    (l.production||[]).map(b=>blkHTML(b,px,issuesOf(b).length)).join('')+(l.general||[]).map(a=>workBlockHTML(a,px)).join('')+'</div>').join('');
  return '<section class="board" aria-label="'+title+'"><div class="board-h"><h2>'+title+' · '+mdw(d)+'</h2><div class="spacer"></div>'+(!readOnly&&!S.setupPending?'<button class="btn primary" data-act="general-add">＋一般工作排班</button>':'')+'</div><div class="hint" style="padding:10px">一般工作方塊可拖曳及拉底邊；放開先預覽，確認前不改班表。純人工占用完整人員時間；參考件數不算作工單已完成。產品工序方塊請在「設備／工位」檢視調整。</div>'+
    (lanes.length?'<div class="scroller"><div class="grid" style="grid-template-columns:64px repeat('+lanes.length+',minmax(180px,1fr))"><div class="corner"></div>'+lanes.map(l=>'<div class="colhead"><span class="N">'+esc(l.name)+'</span></div>').join('')+'<div class="times">'+times+'</div>'+cols+'</div></div>':'<div class="empty">尚未有可安排的工作內容。請按「更多功能」→「設定工作內容」，先核定工作、人員與所需設備。</div>')+'</section>';
}
function generalLanes(){
  return workCatalog(S).filter(w=>inFactory(w,UI.factory)).flatMap(w=>{
    const list=assignments(S).filter(a=>a.workId===w.id&&a.date===UI.date);
    const pairs=w.requiresResource?w.resourceIds.map(id=>({resourceId:id,emp:null,name:mach(id)?.label||id})):w.employeeIds.map(id=>({emp:id,resourceId:null,name:emp(id)?.name||id}));
    return pairs.map(p=>({...p,workId:w.id,name:w.name+' · '+p.name,general:list.filter(a=>w.requiresResource?a.resourceId===p.resourceId:a.emp===p.emp)}));
  });
}
function generalBoardHTML(){return workGridHTML('一般工作／純人工排班',generalLanes());}
function workViewHTML(){
  const production=shownMachines().map(m=>({name:m.proc+' · '+m.label,production:S.blocks.filter(b=>b.date===UI.date&&b.m===m.id)}));
  return workGridHTML('依工作內容查看',production.sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')).concat(generalLanes()));
}
let generalDrag=null;
document.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.workblk');if(!el||e.button>0||PV)return;const a=assignments(S).find(a=>a.id===el.dataset.gid);if(!a)return;
  generalDrag={a,el,x:e.clientX,y:e.clientY,originalHeight:parseFloat(el.style.height),resize:!!e.target.closest('[data-gresize]'),moved:false};
});
document.addEventListener('pointermove',e=>{
  const d=generalDrag;if(!d||readOnly||S.setupPending||absOf(d.a.date,d.a.s)<nowAbs())return;
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<8&&!d.moved)return;d.moved=true;e.preventDefault();d.el.style.opacity='.6';
  if(d.resize)d.el.style.height=Math.max(20,d.originalHeight+(e.clientY-d.y)/UI.zoom)+'px';
  else d.el.style.transform='translateY('+((e.clientY-d.y)/UI.zoom)+'px)';
});
document.addEventListener('pointerup',e=>{
  const d=generalDrag;if(!d)return;generalDrag=null;d.el.style.opacity='';d.el.style.transform='';d.el.style.height=d.originalHeight+'px';
  if(!d.moved){openModal({t:'general-edit',id:d.a.id});return;}
  const delta=Math.round((e.clientY-d.y)/(hourPx()*UI.zoom)*6)*10,A={...d.a};
  if(d.resize)A.e+=delta;
  else{A.s+=delta;A.e+=delta;const col=document.elementFromPoint(e.clientX,e.clientY)?.closest('.gcol');
    if(col?.dataset.gwork===A.workId){if(col.dataset.gemp)A.emp=col.dataset.gemp;if(A.resourceId&&col.dataset.gresource)A.resourceId=col.dataset.gresource;}}
  previewGeneral(A);
});
document.addEventListener('pointercancel',()=>{if(generalDrag){generalDrag.el.style.opacity='';generalDrag.el.style.transform='';generalDrag.el.style.height=generalDrag.originalHeight+'px';}generalDrag=null;maybeReload();});
document.addEventListener('keydown',e=>{if(PV)return;const el=e.target.closest?.('.workblk');if(el&&['Enter',' '].includes(e.key)){e.preventDefault();openModal({t:'general-edit',id:el.dataset.gid});}});

// ---------- 啟動 ----------
async function start(){
  const r=await STORE.init();
  if(r.needLogin){showLogin();return;}
  readOnly=STORE.kind==="supabase"&&!STORE.can("schedule.manage");
  let s=null;
  try{s=await STORE.load();}catch(e){toast(e.message);}
  const madeDemo=!(s&&(STORE.kind==="supabase"||s.employees.length));
  if(madeDemo)makeDemo();else S=s;
  normalizeState();
  if(madeDemo&&STORE.kind==="local")queueSync(null);
  loadPreferencesForDevice();loadFactory();
  if(!UI.date)UI.date=todayStr();
  // ?view=shortage|transfer|worklog：重新整理仍停在該頁
  try{const v=new URLSearchParams(location.search).get("view");UI.page={shortage:"shortage",transfer:"transferflow",worklog:"worklog",review:"review"}[v]||null;if(UI.page==="review")UI.reviewStep ??= 1;}catch{}
  render();
  if(UI.page)flashReturnRow();
  STORE.subscribe(onRemoteChange);
  scheduleChat?.destroy();scheduleChat=installScheduleChat({snapshot:()=>({...toSnapshot(S,HOLI),work_execution:structuredClone(S.execution||[])}),view:()=>({date:UI.date,factory:UI.factory}),store:()=>STORE,enabled:()=>!UI.tv&&canPermission('schedule.manage'),stamp:()=>scenarioKey(S)+'|'+UI.date+'|'+UI.factory});
  SOLVER.check().then(up=>{updateSyncChip();scheduleChat?.refresh();if(up)toast("已連上 OR-Tools 排程服務");});
  setInterval(()=>{if(!drag&&!generalDrag&&!UI.modal&&!PV&&UI.view==="day"&&UI.date===todayStr())render();},60000);
}
const crossFactoryUI=transferUI({state:()=>S,ui:UI,esc,uid,canEdit:()=>canPermission('transfers.manage'),open:openModal,close:closeModal,syncInputs,commit:entry=>commit(entry,'transfers.manage'),toast,today:todayStr,clearUndo:()=>{undoStack=[];}});
Object.assign(MODALS,crossFactoryUI.modals);Object.assign(MODAL_ACT,crossFactoryUI.actions);
const staffRosterUI=rosterUI({state:()=>S,ui:UI,esc,uid,canEdit:()=>canPermission('rosters.manage'),canMaster,open:openModal,close:closeModal,syncInputs,commit:entry=>commit(entry,'rosters.manage'),toast,today:todayStr,clearUndo:()=>{undoStack=[];},jwt:()=>STORE.jwt()});
Object.assign(MODALS,staffRosterUI.modals);Object.assign(MODAL_ACT,staffRosterUI.actions);
MODAL_ACT['mach-products']=()=>{if(!canMaster())return;syncInputs();const m=UI.modal;if(!m.id||JSON.stringify(m.draft)!==JSON.stringify(mach(m.id))){toast('請先儲存或取消設備設定，再開啟產品設定');return;}openModal({t:'products'});};
export async function boot(store,authLinkType=""){
  STORE=store;
  await start();
  if(STORE.kind==="supabase"&&STORE.session&&["invite","recovery"].includes(authLinkType))
    openModal({t:"password"});
}

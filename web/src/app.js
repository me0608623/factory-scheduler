// 產線排程看板（正式版）：畫面沿用原型，資料層與排程服務可替換
import { SOLVER } from "./solver.js";
import { toSnapshot, applyOption, newId } from "./convert.js";
import { ALL_WEEKDAYS, overtimeAllowed, overtimeDefault, overtimeWeekdays } from "./overtime.js";
import { capacityIntervals as occupiedCapacityIntervals } from "./capacity.js";
import { FACTORIES, factoryOf, factoryName, inFactory, orderRoute, orderInFactory, compatible } from "./factory.js";
import { remainingQty, quantityForMinutes } from "./manual.js";
/* ===== 1. 常數與工具 ===== */
const COLORS=["#FFE14D","#4CDB6E","#F58CF0","#4FE3EE","#FFA64D","#AFC0FF","#FF9A9A","#BFEA6C"];
const PROCS=["裁切","沖壓","焊接","組裝","包裝"];
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
const UI={date:null,view:"day",factory:1,modal:null,zoom:0.85,theme:"auto"};
function loadFactory(){try{const n=Number(localStorage.getItem("fsched-factory"));if(FACTORIES.includes(n))UI.factory=n;}catch(e){}}
function setFactory(n){UI.factory=FACTORIES.includes(n)?n:"all";try{localStorage.setItem("fsched-factory",String(UI.factory));}catch(e){}}
const shownEmployees=()=>S.employees.filter(e=>inFactory(e,UI.factory));
const shownMachines=()=>S.machines.filter(m=>inFactory(m,UI.factory));
const shownOrders=()=>S.orders.filter(o=>orderInFactory(o,S.products,UI.factory));
// 畫面縮放：每台電腦各自記住
const ZOOMS=[0.6,0.7,0.75,0.8,0.85,0.9,1,1.1,1.25,1.4];
function setZoom(z){UI.zoom=z;document.documentElement.style.setProperty("--z",z);try{localStorage.setItem("fsched-zoom",String(z));}catch(e){}}
// 淺色／深色：每台電腦各自記住（auto = 跟著系統）
const THEMES=["auto","light","dark"];
const THEME_UI={
  auto:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg><span class="lbl">自動</span>',
  light:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg><span class="lbl">淺色</span>',
  dark:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg><span class="lbl">深色</span>'
};
function setTheme(t){
  UI.theme=THEMES.includes(t)?t:"auto";
  const r=document.documentElement;
  if(UI.theme==="auto")r.removeAttribute("data-app-theme");else r.setAttribute("data-app-theme",UI.theme);
  try{localStorage.setItem("fsched-theme",UI.theme);}catch(e){}
}
function loadTheme(){let t="auto";try{t=localStorage.getItem("fsched-theme")||"auto";}catch(e){}setTheme(t);}
function loadZoom(){let z=0.85;try{const v=parseFloat(localStorage.getItem("fsched-zoom"));if(ZOOMS.includes(v))z=v;}catch(e){}setZoom(z);}

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
  S={v:1,demo:true,savedAt:null,dayOT:{},cal:{week:[...DEF_WEEK],over:{}},log:[],blocks:[],
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
function commit(entry){
  if(entry){entry.id=uid();entry.t=Date.now();S.log.unshift(entry);if(S.log.length>200)S.log.length=200;}
  render();
  if(!readOnly)queueSync(entry);
}
function undo(){
  if(!undoStack.length){toast("沒有可以復原的動作");return;}
  S=JSON.parse(undoStack.pop());commit({kind:"edit",title:"復原上一步",lines:[]});toast("已復原上一步");
}
/* ===== 5. 排程引擎 ===== */
// 某人達到同時顧機台上限的時段；每段工作對應一台機台。
function capacityIntervals(ds,E,ex=new Set(),over=0){
  return occupiedCapacityIntervals(S.blocks,ds,E,ex,over);
}
// 某日某機台＋某人的忙碌時段（含機台故障）
function busyFor(ds,mid,eid,ex){
  const iv=[];
  for(const b of S.blocks){if(b.date!==ds||ex.has(b.id))continue;if(b.m===mid)iv.push([b.s,b.e]);}
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
  return o&&st?quantityForMinutes(minutes,st.rate,remainingQty(o.qty,S.blocks,oid,step,exceptId)):0;
}
// 前站做到可以開始本站的時間（標準工序：前站完成 batch 件才能開始）
function readyAbs(oid,k,ex=new Set()){
  if(k===0)return 0;
  const o=order(oid),st=prod(o.pid).steps[k];
  const prev=S.blocks.filter(b=>b.oid===oid&&b.step===k-1&&!ex.has(b.id)).sort(byAbs);
  if(!prev.length||sum(prev,b=>b.qty)<o.qty)return Infinity;
  const batch=st.batch>0&&st.batch<o.qty?st.batch:o.qty;
  let cum=0;
  for(const b of prev){
    if(cum+b.qty>=batch){const t=b.s+Math.ceil((batch-cum)/b.qty*(b.e-b.s)/10)*10;return absOf(b.date,Math.min(t,b.e));}
    cum+=b.qty;
  }
  const L=prev[prev.length-1];return bEnd(L);
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
      const rem=o.qty-sum(S.blocks.filter(b=>b.oid===o.id&&b.step===k),b=>b.qty);
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
    const rem=o.qty-sum(S.blocks.filter(b=>b.oid===oid&&b.step===k),b=>b.qty);if(rem<=0)continue;
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
    const rem=o.qty-sum(S.blocks.filter(b=>b.oid===oid&&b.step===k),b=>b.qty);if(rem<=0)continue;
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
  if(sum(lb,b=>b.qty)<o.qty)return {k:"part"};
  const fin=Math.max(...lb.map(bEnd)),fd=dateOfAbs(fin);
  const done=fin<=nowAbs();
  return {k:done?"done":fd>o.due?"late":"ok",fin,fd};
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
  const di=dayInfo(b.date);
  const inWin=di.win.some(w=>b.s>=w.s&&b.e<=w.e);
  if(!inWin)out.push(di.open?"超出上班時間（午休或未開加班）":"這天停工");
  else if(E&&!overtimeAllowed(E,b.date)&&di.win.some(w=>w.ot&&b.s<w.e&&b.e>w.s))out.push(E.name+" 當日不可加班（假日出勤也不排）");
  for(const x of S.blocks){if(x===b||x.date!==b.date||x.s>=b.e||x.e<=b.s)continue;
    if(x.m===b.m){if(opt.pushOK&&!x.pin){opt.push++;continue;}out.push(x.pin?"和固定的 "+label(x)+" 重疊":"和 "+label(x)+" 撞同一台機器");break;}}
  if(E&&capacityIntervals(b.date,E,new Set([b.id])).some(([s,e])=>s<b.e&&e>b.s))
    out.push(E.name+" 同時顧機台超過上限 "+(E.maxMachines||1)+" 台");
  if(b.step>0){const r=readyAbs(b.oid,b.step);if(bAbs(b)<r)out.push("前站還沒做完（"+(isFinite(r)?mdw(dateOfAbs(r))+" "+hm(r%1440)+" 後才能做":"前站未排")+"）");}
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
const LOGIC={leave:"假",fault:"修",move:"移",auto:"排",ot:"加",edit:"改",save:"存"};
function hourPx(){return parseFloat(getComputedStyle(document.body).getPropertyValue("--hour"))||72;}

function render(){
  const sc=$(".scroller"),sl=sc?sc.scrollLeft:0,sy=window.scrollY;
  document.body.classList.toggle("tv",!!UI.tv);
  document.body.classList.toggle("pvmode",!!PV);
  let html;
  if(PV){
    // 預覽：上方是方案面板，下方排程表顯示「原本／調整後／對照」
    const o=pvOpt(),st=PV.mode==="orig"?PV.B:o.A,ctx=pvCtx(o),ro=readOnly;
    readOnly=true;
    try{html=withState(o.A,()=>topHTML()+'<main class="wrap">'+pvPanelHTML(o))+withState(st,()=>bannerHTML()+(UI.view==="day"?dayHTML(ctx):weekHTML(ctx)))+"</main>";}
    finally{readOnly=ro;}
  }else html=topHTML()+'<main class="wrap">'+latestHTML()+bannerHTML()+cardsHTML()+(UI.view==="day"?dayHTML():weekHTML())+"</main>";
  $("#app").innerHTML=html;
  const sc2=$(".scroller");if(sc2)sc2.scrollLeft=sl;
  window.scrollTo(0,sy);
  if(UI.modal)renderModal();
}
function topHTML(){
  const d=UI.date,di=dayInfo(d);
  const wk=UI.view==="week";
  const ws=weekStart(d);
  const title=wk?md(ws)+" – "+md(addDays(ws,6)):mdw(d);
  const sub=wk?"第 "+isoWeek(ws)+" 週":dayLabel(d);
  return '<header class="top"><div class="top-in">'+
  '<div class="brand"><span class="brand-mark"><span></span></span>產線排程</div>'+
  '<div class="seg factory-switch" role="group" aria-label="排程廠別">'+
  [[1,'1 廠'],[2,'2 廠'],['all','跨廠']].map(([v,t])=>'<button data-act="factory" data-v="'+v+'" aria-pressed="'+(UI.factory===v)+'">'+t+'</button>').join('')+'</div>'+
  '<div class="datenav"><button class="iconbtn" data-act="prev" aria-label="往前">‹</button>'+
  '<button class="datebox'+(!wk&&di.type!=="work"?" hol":"")+'" data-act="pick"><b class="num">'+esc(title)+'</b><small>'+esc(sub)+'</small></button>'+
  '<input type="date" id="datepick" value="'+d+'" style="position:absolute;opacity:0;width:1px;height:1px;pointer-events:none" tabindex="-1" aria-hidden="true">'+
  '<button class="iconbtn" data-act="next" aria-label="往後">›</button>'+
  '<button class="btn" data-act="today">今天</button></div>'+
  '<div class="seg" role="group" aria-label="檢視"><button data-act="view" data-v="day" aria-pressed="'+!wk+'">日</button><button data-act="view" data-v="week" aria-pressed="'+wk+'">週</button></div>'+
  (S.demo?'<span class="demo-chip">示範資料</span>':'')+(readOnly&&!PV?'<span class="ro-chip">檢視模式</span>':'')+
  '<div class="spacer"></div>'+
  '<button class="btn danger admin" data-act="incident" '+(readOnly?"disabled":"")+'>突發狀況</button>'+
  '<button class="btn admin" data-act="auto" title="自動排程會連同另一廠的工序一起計算" '+(readOnly?"disabled":"")+'>'+IC.bolt+'<span class="lbl">自動排程</span></button>'+
  '<button class="btn admin" data-act="undo" '+(readOnly||!undoStack.length?"disabled":"")+'>'+IC.undo+'<span class="lbl">復原</span></button>'+
  '<button class="btn" data-act="export">'+IC.down+'<span class="lbl">Excel</span></button>'+
  (canArchive()?'<button class="btn" data-act="history"><span class="lbl">歷史排程</span></button>':'')+
  '<div class="zoombox" role="group" aria-label="畫面大小"><button data-act="zoom-" aria-label="縮小">−</button><button class="zv" data-act="zoom0" title="回到 100%">'+Math.round(UI.zoom*100)+'%</button><button data-act="zoom+" aria-label="放大">＋</button></div>'+
  '<button class="btn" data-act="help" aria-label="操作說明"><b style="font-size:19px">?</b><span class="lbl">說明</span></button>'+
  '<button class="btn" data-act="theme" title="切換淺色／深色">'+THEME_UI[UI.theme]+'</button>'+
  '<button class="btn" data-act="tv" aria-pressed="'+!!UI.tv+'">'+IC.tv+'<span class="lbl">'+(UI.tv?"管理模式":"大螢幕")+'</span></button>'+
  syncChipHTML()+
  '<button class="btn" data-act="account" title="帳號與連線">'+IC.user+'<span class="lbl">'+esc(STORE&&STORE.kind==="supabase"?(STORE.userName||"帳號"):"本機")+'</span></button>'+
  '</div></header>';
}
function isoWeek(ds){const d=parseD(ds);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil(((d-y)/864e5+1)/7);}
function bannerHTML(){
  if(UI.view!=="day")return "";
  const d=UI.date,di=dayInfo(d),out=[];
  const name=di.type==="hol"?"國定假日："+di.hol:di.type==="sat"?"週六休息日":di.type==="sun"?"週日例假日":"";
  const openBtn=readOnly?"":'<button class="btn admin '+(di.open?"ghost":"primary")+'" data-act="open">'+(di.open?"改為停工":"改為上班")+'</button>';
  if(!di.open)out.push('<div class="banner wk"><span class="grow">'+(name?esc(name)+"　":"")+'本日停工，不排工作</span>'+openBtn+'</div>');
  else if(di.special)out.push('<div class="banner hol"><span class="grow">'+esc(name)+'　有上班 · '+payNote(di)+'</span>'+openBtn+'</div>');
  if(di.ot)out.push('<div class="banner ot"><span class="grow">今天加班到 20:00 · '+shownEmployees().filter(e=>overtimeAllowed(e,d)&&!e.leaves.includes(d)).length+' 人可加班</span>'+(readOnly?"":'<button class="btn ghost admin" data-act="ot">調整加班人員</button>')+'</div>');
  return out.join("");
}
function cardsHTML(){
  const d=UI.date;
  const employees=shownEmployees(),machines=shownMachines(),orders=shownOrders();
  const onLeave=employees.filter(e=>e.leaves.includes(d));
  const emps=employees.map(e=>{
    const lv=e.leaves.includes(d);
    return '<button class="emp'+(lv?" off":"")+'" data-act="emp" data-id="'+e.id+'"><span class="sw" style="background:'+COLORS[e.color%COLORS.length]+'">'+esc(e.name.slice(0,1))+'</span>'+esc(e.name)+
      (lv?'<span class="tag bad">請假</span>':'')+(!overtimeAllowed(e,d)?'<span class="tag mute">今天不加班</span>':'')+'</button>';}).join("");
  const machs=machines.map(m=>{const down=m.faults.some(f=>f.date===d&&!f.fixed);
    return '<button class="mach'+(down?" down":"")+'" data-act="mach" data-id="'+m.id+'" aria-label="'+esc(m.id+" "+m.label)+'"><b>'+esc(m.id)+'</b><small>'+(down?"故障":"正常")+'</small></button>';}).join("");
  const ords=[...orders].sort((a,b)=>a.due.localeCompare(b.due)||a.pri-b.pri);
  const orows=ords.slice(0,4).map(orderRow).join("");
  const lrows=S.log.slice(0,3).map(logRow).join("")||'<div class="empty">還沒有紀錄</div>';
  return '<section class="cards" aria-label="總覽">'+
  '<div class="card"><div class="card-h"><h2>員工</h2><span class="count">'+employees.length+' 人'+(onLeave.length?" · 今天 "+onLeave.length+" 人請假":"")+'</span>'+(canMaster()&&UI.factory!=="all"?'<button class="add" data-act="emp-new">＋新增</button>':"")+'</div><div class="chips">'+emps+'</div></div>'+
  '<div class="card"><div class="card-h"><h2>機台</h2><span class="count">'+machines.length+' 台</span>'+(canMaster()&&UI.factory!=="all"?'<button class="add" data-act="mach-new">＋新增</button>':"")+'</div><div class="chips">'+machs+'</div></div>'+
  '<div class="card"><div class="card-h"><h2>工單</h2><span class="count">'+orders.length+' 張</span>'+(readOnly?"":'<button class="add" data-act="ord-new">＋新增</button>')+'</div><div class="olist">'+orows+'</div>'+
    '<div style="display:flex;gap:16px"><button class="more" data-act="orders">全部工單</button><button class="more" data-act="products">產品工序</button></div></div>'+
  '<div class="card"><div class="card-h"><h2>全廠紀錄</h2><span class="count">系統怎麼調整</span></div><div class="llist">'+lrows+'</div><button class="more" data-act="log">全部紀錄</button></div>'+
  '</section>';
}
function statusTag(o){
  const st=orderStatus(o);
  return st.k==="late"?'<span class="tag bad">會延誤</span>':st.k==="ok"?'<span class="tag ok">準時</span>':st.k==="done"?'<span class="tag mute">完成</span>':'<span class="tag warn">未排</span>';
}
const priTag=o=>o.pri===0?'<span class="tag bad">特急</span> ':o.pri===1?'<span class="tag warn">急</span> ':"";
function orderRow(o){const p=prod(o.pid),route=orderRoute(o,S.products).map(factoryName).join(' → ');
  return '<button class="orow" data-act="ord" data-id="'+o.id+'"><span class="code">'+esc(o.code)+'</span><span class="meta">'+priTag(o)+esc(p?p.name:"?")+' '+o.qty+'件 · '+esc(route)+' · 期限 '+md(o.due)+'</span>'+statusTag(o)+'</button>';}
function logRow(l){const dt=new Date(l.t);
  return '<button class="lrow" data-act="logone" data-id="'+l.id+'"><span class="ic '+l.kind+'">'+(LOGIC[l.kind]||"・")+'</span><span class="tx">'+esc(l.title)+'<small>'+(dt.getMonth()+1)+"/"+dt.getDate()+" "+pad(dt.getHours())+":"+pad(dt.getMinutes())+(l.lines&&l.lines.length?" · "+l.lines.length+" 項調整":"")+'</small></span></button>';}

/* ----- 日檢視：像 Excel 的時間 × 機台表 ----- */
function dayHTML(ctx={}){
  const d=UI.date,di=dayInfo(d),H=hourPx(),px=m=>(m-DAY0)/60*H;
  const mk=b=>ctx.mark&&ctx.mark.has(keyB(b))?ctx.markCls:"";
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
    return '<button class="colhead'+(down?" down":"")+'" data-act="mach" data-id="'+M.id+'"><span class="L">'+esc(M.id)+'</span><span class="N">'+esc(M.label)+'<small>'+esc(M.proc)+'</small></span><span class="st tag '+(down?"bad":"ok")+'">'+(down?"故障":"正常")+'</span></button>';}).join("");
  let times="";for(let m=DAY0;m<DAY1;m+=30)times+='<div class="'+(m%60?"half":"")+'">'+hm(m)+'</div>';
  const leave=shownEmployees().filter(e=>e.leaves.includes(d));
  const otBtn=readOnly?"":(di.open?'<button class="btn admin" data-act="ot">'+(di.ot?'調整加班人員':'開加班到 20:00')+'</button>':"")+'<button class="btn admin" data-act="cal">上班日設定</button>';
  return '<section class="board" aria-label="排程表"><div class="board-h"><h2>'+esc(UI.factory==="all"?"跨廠":factoryName(UI.factory))+' · '+mdw(d)+(ctx.pv?(PV.mode==="orig"?" 原本的排程":PV.mode==="new"?" 調整後":" 對照"):" 排程")+'</h2>'+
    (leave.length?'<span class="tag bad" style="font-size:15px;padding:4px 10px">請假：'+esc(leave.map(e=>e.name).join("、"))+'</span>':"")+
    (nBad?'<button class="btn danger" data-act="issues">'+nBad+' 個問題</button>':(blocks.length?'<span class="tag ok" style="font-size:15px;padding:4px 10px">沒有衝突</span>':""))+
    '<div class="spacer"></div><div class="legend"><span><i style="background:var(--lunch)"></i>午休</span><span><i style="background:var(--ot)"></i>加班</span><span><i style="background:var(--bad-bg);border-color:var(--bad)"></i>故障</span><span>顏色 = 員工</span><span>上班日／加班開關目前兩廠共用</span>'+(readOnly?"":"<span>拖動方塊可改時段，拉底邊可改工作長度</span>")+'</div>'+(readOnly||ctx.pv?"":'<button class="btn primary" data-act="manual-add">＋手動排班</button>')+otBtn+'</div>'+
    (ms.length?'<div class="scroller"><div class="grid" style="grid-template-columns:64px repeat('+ms.length+',minmax(170px,1fr))">'+
    '<div class="corner"></div>'+heads+'<div class="times">'+times+'</div>'+cols+'</div></div>':
    '<div class="empty factory-empty">此廠尚未設定機台與員工；「歷史排程」是獨立的唯讀原表，不會自動變成正式排程。</div>')+
    (ms.length&&!blocks.length&&di.win.length?'<div class="empty">這天還沒有排程。可按「＋手動排班」安排未排入的工作，或使用「自動排程」。</div>':"")+
    '</section>';
}
function blkHTML(b,px,bad,cls=""){
  const o=order(b.oid),E=emp(b.emp),h=px(b.e)-px(b.s);
  const short=h<52;
  return '<div class="blk'+(short?" short":"")+(bad?" bad":"")+(readOnly?" ro":"")+(cls?" "+cls:"")+'" data-bid="'+b.id+'" tabindex="0" role="button" aria-label="'+esc((E?E.name:"")+" "+label(b))+'" style="top:'+(px(b.s)+1)+'px;height:'+(h-2)+'px;background:'+empColor(b.emp)+'">'+
    '<div class="n">'+esc(E?E.name:"未指定")+'</div><div class="d">'+esc(o.code+" "+stepName(b)+" "+b.qty+"件")+'</div>'+(h>=92?'<div class="d num">'+hm(b.s)+"–"+hm(b.e)+'</div>':"")+
    '<div class="flag">'+(cls==="chg"?'<span class="chgf">變</span>':cls==="willchg"?'<span class="chgf">會動</span>':"")+(o.pri===0?'<span class="warn" title="特急">急</span>':"")+(b.pin?'<span class="pin" title="手動固定">釘</span>':"")+(bad?'<span class="warn" title="有問題">!</span>':"")+'</div>'+(readOnly?'':'<div class="resize-handle" data-resize="end" title="拖曳調整結束時間" aria-hidden="true"></div>')+'</div>';
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
  const el=e.target.closest(".blk");if(!el||e.button>0||PV)return;
  const b=S.blocks.find(x=>x.id===el.dataset.bid);if(!b)return;
  const r=el.getBoundingClientRect();
  drag={b,el,mode:e.target.closest("[data-resize]")?"resize":"move",x0:e.clientX,y0:e.clientY,offX:e.clientX-r.left,offY:e.clientY-r.top,w:r.width,h:r.height,started:false,target:null};
});
document.addEventListener("pointermove",e=>{
  if(!drag)return;
  if(!drag.started){
    if(readOnly||Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<8)return;
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
  if(!col){drag.target=null;return;}
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
  const remaining=o?remainingQty(o.qty,after.blocks,b.oid,b.step):0;
  return {base,after,lines,unpinned,problems:[...new Set(problems)],ops,statuses,direct,oldId:b.id,isNew,remaining,
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
  if(e.key==="Escape"&&UI.modal){closeModal();return;}
  const el=e.target.closest&&e.target.closest(".blk");
  if(el&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openModal({t:"blk",id:el.dataset.bid});}
});

/* ===== 8. 按鈕動作 ===== */
const PV_BLOCK=new Set(["emp","emp-new","mach","mach-new","ord","ord-new","orders","products","cal","open","ot","issues","incident","auto","manual-add","undo","save"]);
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-act]");if(!a)return;
  const act=a.dataset.act,id=a.dataset.id;
  if(PV&&PV_BLOCK.has(act)){toast("預覽中：先按「套用」或「取消」");return;}
  const step=UI.view==="week"?7:1;
  switch(act){
    case "prev":UI.date=addDays(UI.date,-step);render();break;
    case "next":UI.date=addDays(UI.date,step);render();break;
    case "today":UI.date=todayStr();render();break;
    case "pick":{const p=$("#datepick");try{p.showPicker();}catch(_){p.style.pointerEvents="auto";p.focus();p.click();}break;}
    case "view":UI.view=a.dataset.v;render();break;
    case "factory":setFactory(a.dataset.v==="all"?"all":Number(a.dataset.v));render();break;
    case "goto":UI.date=a.dataset.d;UI.view="day";render();window.scrollTo(0,0);break;
    case "tv":UI.tv=!UI.tv;render();break;
    case "theme":{setTheme(THEMES[(THEMES.indexOf(UI.theme)+1)%THEMES.length]);render();
      toast(UI.theme==="auto"?"跟著電腦的系統設定":UI.theme==="light"?"已切換為淺色":"已切換為深色");break;}
    case "zoom-":case "zoom+":case "zoom0":{
      let i=ZOOMS.indexOf(UI.zoom);if(i<0)i=ZOOMS.indexOf(1);
      i=act==="zoom0"?ZOOMS.indexOf(1):Math.max(0,Math.min(ZOOMS.length-1,i+(act==="zoom+"?1:-1)));
      setZoom(ZOOMS[i]);render();break;}
    case "auto":openModal({t:"auto"});break;
    case "manual-add":if(!readOnly)openModal({t:"manual-add"});break;
    case "incident":openModal({t:"incident"});break;
    case "help":openModal({t:"help",sec:0});break;
    case "undo":undo();break;
    case "sync":if(SYNC.state==="error")queueSync(null);else toast(STORE.kind==="local"?"資料存在這台電腦的瀏覽器":"已和雲端資料庫同步");break;
    case "account":openModal({t:"account"});break;
    case "export":openModal({t:"export"});break;
    case "history":openLegacyHistory();break;
    case "ot":openModal({t:"ot",date:UI.date});break;
    case "open":toggleOpen(UI.date);break;
    case "cal":openModal({t:"cal"});break;
    case "emp":openModal({t:"emp",id});break;
    case "emp-new":openModal({t:"emp",id:null});break;
    case "mach":openModal({t:"mach",id});break;
    case "mach-new":openModal({t:"mach",id:null});break;
    case "ord":openModal({t:"ord",id});break;
    case "ord-new":openModal({t:"ord",id:null});break;
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
  if(readOnly)return;
  pushUndo();
  const open=!isOpen(d);setOpen(d,open);
  if(open){
    commit({kind:"ot",title:mdw(d)+" 改為上班",lines:[{k:"info",t:payNote(dayInfo(d))||"一般上班日"}].filter(l=>l.t)});
    toast(mdw(d)+" 改為上班。要把工作排進來嗎？","重新排程",runAuto);
  }else{
    const r=closeDays();
    commit({kind:"ot",title:mdw(d)+" 改為停工"+(r.aff.length?"，移走 "+r.aff.length+" 段工作":""),lines:r.lines});
    if(r.lines.length)showResult();else toast(mdw(d)+" 已改為停工");
  }
}
function saveDailyOT(m){
  if(readOnly)return;
  const d=m.date;
  const changed=!!S.dayOT[d]!==m.open||S.employees.some(e=>{
    const old=Object.prototype.hasOwnProperty.call(e.otOverrides||{},d)?!!e.otOverrides[d]:null;
    return old!==m.overrides[e.id];
  });
  if(!changed){closeModal();return;}
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
  commit({kind:"ot",title:mdw(d)+" 更新加班設定"+(aff.length?"，調整 "+aff.length+" 段工作":""),lines});
  if(lines.length)showResult();else{
    closeModal();toast("已儲存今天的加班設定"+(m.open?"，可加班 "+S.employees.filter(e=>overtimeAllowed(e,d)&&!e.leaves.includes(d)).length+" 人":""));
  }
}
/* ===== 9. 視窗（員工、機台、工單、方塊、紀錄…） ===== */
const MODAL_ACT={};
function openModal(m){UI.modal=m;renderModal();}
function closeModal(){UI.modal=null;const r=$("#modal-root");if(r)r.innerHTML="";maybeReload();}
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
  const keep=root.querySelector(".overlay");const st=keep?keep.scrollTop:0;
  root.innerHTML='<div class="overlay" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-label="'+esc(c.title)+'"><div class="modal-h"><h3>'+c.title+'</h3><button class="iconbtn" data-act="close" aria-label="關閉">×</button></div><div class="modal-b">'+c.body+'</div>'+(c.foot?'<div class="modal-f">'+c.foot+'</div>':"")+'</div></div>';
  const ov=$("#ov");ov.scrollTop=st;
  const cb=$("#cbx");if(cb){cb.focus();cb.select();}
  ov.addEventListener("click",e=>{if(e.target===ov)closeModal();});
}
function rerender(){syncInputs();renderModal();}
const tg=(act,v,on,txt,extra="")=>'<button class="tg '+extra+'" data-act="'+act+'" data-v="'+esc(v)+'" aria-pressed="'+!!on+'">'+txt+'</button>';
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
  const group=(title,items)=>'<div class="field"><span class="lab">'+factory+' · '+title+'（'+(items||[]).length+'）</span>'+
    ((items||[]).length?'<div class="result">'+items.map(x=>'<div class="rline"><span class="k info">'+esc(x.cell)+'</span><span>'+esc(x.label)+(x.note?'<small class="hint"> · '+esc(x.note)+'</small>':'')+'</span></div>').join('')+'</div>':'<div class="hint">原表沒有明確欄名</div>')+'</div>';
  return group('製作站別／機台欄名',c.stations)+group('員工／人名候選',c.people)+group('原表人力備註',c.notes);
}

const MODALS={
"manual-add"(m){
  const choices=S.orders.flatMap(o=>{
    const p=prod(o.pid);if(!p)return [];
    return p.steps.map((st,step)=>({o,p,st,step,remaining:remainingQty(o.qty,S.blocks,o.id,step)}))
      .filter(x=>x.remaining>0&&(UI.factory==="all"||factoryOf(x.st)===UI.factory));
  });
  if(!choices.length)return {title:"手動排班",body:'<div class="hint">目前沒有可新增的工作：此廠工序已排滿，或尚未建立工單。可先新增工單，再回來安排人員與時段。</div>',
    foot:'<button class="btn" data-act="close">關閉</button><button class="btn primary" data-act="ord-new">＋新增工單</button>'};
  if(!m.draft){const start=UI.date===todayStr()?Math.max(DAY0,Math.ceil(nowMin()/10)*10):DAY0;
    m.draft={choice:choices[0].o.id+":"+choices[0].step,machine:"",employee:"",s:Math.min(start,DAY1-10),e:Math.min(DAY1,Math.min(start,DAY1-10)+60)};}
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
  const pins=P.unpinned.length?'<div class="issues">'+P.unpinned.map(x=>'<div class="issue">'+esc(x.label)+' 已固定（釘）。確認後會解除固定並移動它；取消則保持原樣。</div>').join("")+'</div>':'';
  const impact='<div class="field"><span class="lab">連帶影響的工作（'+others.length+' 道工序）</span>'+(others.length?'<div class="result">'+others.map(x=>'<div class="rline"><span class="k '+(x.next[0]&&x.prev[0]&&bAbs(x.next[0])>bAbs(x.prev[0])?"delay":"info")+'">'+esc(x.code)+'</span><span>'+esc(x.step+"："+place(x.prev)+" → "+place(x.next))+'</span></div>').join("")+'</div>':'<div class="okbox">其他工作不變</div>')+'</div>';
  const due='<div class="field"><span class="lab">受影響工單的交期</span><div class="result">'+P.statuses.map(x=>{
    const bad=["late","part","none"].includes(x.status);
    const msg=x.status==="late"?"逾期，預計 "+mdw(x.finish):x.status==="part"||x.status==="none"?"尚未排完":"未逾期"+(x.finish?"，預計 "+mdw(x.finish):"");
    return '<div class="rline"><span class="k '+(bad?"late":"early")+'">'+(bad?"需處理":"準時")+'</span><span>'+esc(x.code+"："+msg+"；期限 "+mdw(x.due))+'</span></div>';
  }).join("")+'</div></div>';
  const problems=P.problems.length?'<div class="field"><span class="lab">無法安全順延，排程不會改動</span><div class="issues">'+P.problems.map(t=>'<div class="issue">'+esc(t)+'</div>').join("")+'</div></div>':'';
  return {title:P.problems.length?"手動排班預覽 · 需要處理":"手動排班預覽 · 確認",body:main+suggest+pins+impact+due+problems,
    foot:'<button class="btn" data-act="close">取消</button>'+(P.problems.length?'':'<button class="btn primary" data-act="drag-confirm">確認套用</button>')};
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
  const D=m.draft,ro=readOnly||!canMaster();
  const start=weekStart(UI.date<todayStr()?todayStr():UI.date);
  let days="";for(let i=0;i<21;i++){const d=addDays(start,i),di=dayInfo(d);
    days+=tg("m-leave",d,D.leaves.includes(d),'<span class="num">'+md(d)+'</span><small>'+WD[di.w]+(di.type==="hol"?" "+esc(di.hol.slice(0,3)):"")+'</small>',"leave"+(di.type!=="work"?" hol":""));}
  const body=
   '<div class="field"><label for="f-name">姓名</label><input class="inp" id="f-name" data-bind="name" value="'+esc(D.name)+'" '+(ro?"disabled":"")+' autocomplete="off"></div>'+
   '<div class="field"><span class="lab">所屬廠別</span><div class="toggles">'+FACTORIES.map(f=>tg("m-emp-factory",f,factoryOf(D)===f,factoryName(f))).join("")+'</div></div>'+
   '<div class="field"><span class="lab">代表顏色</span><div class="swatches">'+COLORS.map((c,i)=>'<button class="swatch" style="background:'+c+'" data-act="m-color" data-v="'+i+'" aria-pressed="'+(D.color===i)+'" aria-label="顏色 '+(i+1)+'"></button>').join("")+'</div></div>'+
   '<div class="field"><span class="lab">會操作的機台</span><div class="toggles">'+S.machines.filter(M=>factoryOf(M)===factoryOf(D)).map(M=>tg("m-skill",M.id,D.skills.includes(M.id),'<span class="num">'+esc(M.id)+'</span><small>'+esc(M.label)+'</small>')).join("")+'</div></div>'+
   '<div class="field"><label for="f-max-machines">同時最多顧幾台機台</label><input class="inp num" type="number" min="1" max="100" step="1" id="f-max-machines" data-bind="maxMachines" value="'+(D.maxMachines||1)+'" '+(ro?"disabled":"")+'><div class="hint">預設 1 台；只計算同時運轉的不同機台，不影響會操作的機台清單。</div></div>'+
   '<div class="field"><span class="lab">固定每週可加班日</span><div class="toggles">'+[1,2,3,4,5,6,0].map(w=>tg("m-ot-week",w,D.otWeekdays.includes(w),"週"+WD[w])).join("")+'</div><div class="hint">當天是否加班另由排程表開放；臨時意願可在當天的「加班設定」調整。</div></div>'+
   '<div class="field"><span class="lab">請假（點日期切換，紅色 = 請假）</span><div class="toggles">'+days+'</div></div>';
  const foot=ro?'<button class="btn" data-act="close">關閉</button>':
   (m.id?'<button class="btn danger" data-act="m-emp-del">刪除員工</button>':'')+'<div class="spacer"></div><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="m-emp-save">儲存並自動調整</button>';
  return {title:m.id?esc(D.name||"員工"):"新增員工",body,foot};
},
/* ---------- 機台 ---------- */
mach(m){
  if(!m.draft){const M=m.id?mach(m.id):null;
    m.draft=M?JSON.parse(JSON.stringify(M)):{id:"",label:"",factory:UI.factory==="all"?1:UI.factory,proc:PROCS[0],products:[],faults:[]};
    const n=UI.date===todayStr()?Math.max(DAY0,Math.floor(nowMin()/10)*10):DAY0;m.fs=Math.min(n,DAY1-30);m.fd=60;m.note="";}
  const D=m.draft,ro=readOnly,rm=readOnly||!canMaster(),d=UI.date;
  const faults=m.id?mach(m.id).faults.map((f,i)=>({f,i})).filter(x=>x.f.date===d):[];
  let opts="";for(let t=DAY0;t<DAY1;t+=10)opts+='<option value="'+t+'"'+(t===m.fs?" selected":"")+'>'+hm(t)+'</option>';
  const durs=[[30,"30 分"],[60,"1 小時"],[120,"2 小時"],[240,"半天"],[-1,"到 17:00"],[-2,"整天"]];
  const faultBox=m.id&&!ro?
   '<div class="field"><span class="lab">'+mdw(d)+' 機台狀況</span>'+
   (faults.length?faults.map(x=>'<div class="rline"><span class="k fail">故障</span><span style="flex:1">'+hm(x.f.s)+'–'+hm(x.f.e)+(x.f.note?"　"+esc(x.f.note):"")+'</span>'+(x.f.fixed?'<span class="tag ok">已修復</span>':absOf(x.f.date,x.f.e)<=nowAbs()?'<span class="tag mute">已結束</span>':'<button class="btn good" data-act="m-fix" data-v="'+x.i+'">修好了</button>')+'</div>').join(""):'<div class="okbox">正常運作</div>')+'</div>'+
   '<div class="field"><span class="lab">報故障：從幾點開始、壞多久</span><div class="row2"><select class="inp num" id="f-fs">'+opts+'</select><input class="inp" id="f-note" placeholder="原因（可不填）" value="'+esc(m.note)+'"></div>'+
   '<div class="toggles">'+durs.map(([v,t])=>tg("m-fd",v,m.fd===v,t)).join("")+'</div>'+
   '<button class="btn danger" data-act="m-fault" style="height:56px;font-size:19px;justify-content:center">確認故障，讓系統自動調整</button></div>':"";
  const body=(m.fromInc?faultBox:"")+
   (m.id?'':'<div class="field"><label for="f-id">代號（例：f）</label><input class="inp num" id="f-id" data-bind="id" value="'+esc(D.id)+'" maxlength="4" autocomplete="off"></div>')+
   '<div class="field"><label for="f-label">名稱</label><input class="inp" id="f-label" data-bind="label" value="'+esc(D.label)+'" '+(rm?"disabled":"")+' autocomplete="off"></div>'+
   '<div class="field"><span class="lab">所屬廠別</span><div class="toggles">'+FACTORIES.map(f=>tg("m-mach-factory",f,factoryOf(D)===f,factoryName(f))).join("")+'</div></div>'+
   '<div class="field"><span class="lab">做哪一道工序</span><div class="toggles">'+PROCS.map(p=>tg("m-proc",p,D.proc===p,esc(p))).join("")+'</div></div>'+
   '<div class="field"><span class="lab">可以生產的產品／模具</span><div class="toggles">'+S.products.map(p=>tg("m-prod",p.id,D.products.includes(p.id),esc(p.name)+'<small>'+esc(p.steps.map(s=>s.proc).join("→"))+'</small>')).join("")+'</div></div>'+
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
    m.draft=O?{...O}:{id:uid(),code:nextCode(),pid:first?first.id:"",qty:100,due:workdaysFrom(addDays(todayStr(),1),3)[2],pri:m.pri??2};}
  const D=m.draft,ro=readOnly,p=prod(D.pid);
  const flow=p?p.steps.map((s,i)=>'<span class="pill">'+(i+1)+". "+factoryName(s.factory)+" "+esc(s.proc)+" "+durOf(D.qty||0,s.rate)+"分"+(s.batch>0?"（前站 "+s.batch+" 件就開始）":"")+'</span>').join('<span class="arr">→</span>'):"";
  let plan="";
  if(m.id){const O=order(m.id),st=orderStatus(O);
    const bl=S.blocks.filter(b=>b.oid===m.id).sort((a,b)=>a.step-b.step||byAbs(a,b));
    plan='<div class="field"><span class="lab">目前排程　'+statusTag(O)+(st.fd?'　預計 '+mdw(st.fd)+" "+hm(st.fin%1440)+" 完成":"")+'</span><div class="result">'+
      (bl.map(b=>'<button class="rline" data-act="goto" data-d="'+b.date+'" style="border:0;text-align:left;width:100%"><span class="k info">'+esc(stepName(b))+'</span><span class="num">'+mdw(b.date)+" "+hm(b.s)+"–"+hm(b.e)+"　"+esc(b.m)+"　"+esc(emp(b.emp)?emp(b.emp).name:"")+"　"+b.qty+'件</span></button>').join("")||'<div class="empty">尚未排入</div>')+'</div></div>';}
  const body=
   '<div class="row2"><div class="field"><label for="f-code">工單號</label><input class="inp num" id="f-code" data-bind="code" value="'+esc(D.code)+'" '+(ro?"disabled":"")+'></div>'+
   '<div class="field"><label for="f-qty">數量（件）</label><input class="inp num" type="number" min="1" id="f-qty" data-bind="qty" value="'+D.qty+'" '+(ro?"disabled":"")+'></div></div>'+
   '<div class="field"><span class="lab">產品</span><div class="toggles">'+S.products.filter(x=>x.id===D.pid||UI.factory==="all"||x.steps.some(s=>factoryOf(s)===UI.factory)).map(x=>tg("o-prod",x.id,D.pid===x.id,esc(x.name))).join("")+'</div></div>'+
   '<div class="row2"><div class="field"><label for="f-due">最晚完成日（硬性期限）</label><input class="inp num" type="date" id="f-due" data-bind="due" value="'+D.due+'" '+(ro?"disabled":"")+'></div>'+
   '<div class="field"><span class="lab">優先順序</span><div class="toggles">'+[[0,"特急"],[1,"急"],[2,"一般"],[3,"不急"]].map(([v,t])=>tg("o-pri",v,D.pri===v,t)).join("")+'</div></div></div>'+
   '<div class="field"><span class="lab">標準工序（依產品設定自動算時間）</span><div class="flow">'+flow+'</div></div>'+plan;
  const foot=ro?'<button class="btn" data-act="close">關閉</button>':
   (m.id?'<button class="btn danger" data-act="o-del">刪除工單</button>':'')+'<div class="spacer"></div><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="o-save">下一步：選排法</button>';
  return {title:m.id?"工單 "+esc(D.code):"新增工單",body,foot};
},
orders(){
  const rows=[...shownOrders()].sort((a,b)=>a.due.localeCompare(b.due)||a.pri-b.pri).map(orderRow).join("")||'<div class="empty">此廠沒有工單</div>';
  return {title:"全部工單",body:'<div class="olist">'+rows+'</div>',
    foot:(S.demo&&!readOnly?'<button class="btn danger" data-act="clear-demo">清除示範工單</button><div class="spacer"></div>':'')+(readOnly?"":'<button class="btn primary" data-act="ord-new">＋新增工單</button>')};
},
/* ---------- 產品工序（標準公式） ---------- */
products(m){
  if(!m.draft)m.draft=JSON.parse(JSON.stringify(S.products));
  const ro=readOnly||!canMaster();
  const body='<div class="hint">每一站指定廠別與工序；同一工單可依序從 1 廠轉到 2 廠。前站做完幾件就能開始下一站（0 = 全部做完）。跨廠運送／交接時間尚未設定，暫以可立即交接計算。</div>'+
   m.draft.map((p,pi)=>'<div class="field" style="border:1px solid var(--line2);border-radius:12px;padding:12px">'+
    '<input class="inp" data-bind="'+pi+'.name" value="'+esc(p.name)+'" aria-label="產品名稱" '+(ro?"disabled":"")+'>'+
    '<div class="steps">'+p.steps.map((s,si)=>'<div class="step"><span class="no">'+(si+1)+'</span>'+
      '<select class="inp" data-bind="'+pi+'.steps.'+si+'.proc" aria-label="工序" '+(ro?"disabled":"")+'>'+PROCS.map(x=>'<option'+(x===s.proc?" selected":"")+'>'+x+'</option>').join("")+'</select>'+
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
  const o=order(b.oid),p=prod(o.pid),E=emp(b.emp),M=mach(b.m),iss=issuesOf(b),ro=readOnly;
  const others=S.blocks.filter(x=>x.oid===b.oid&&x!==b).sort((a,c)=>a.step-c.step||byAbs(a,c));
  let opts="",endOpts="";
  for(let t=DAY0;t<DAY1;t+=10)opts+='<option value="'+t+'"'+(t===b.s?" selected":"")+'>'+hm(t)+'</option>';
  for(let t=DAY0+10;t<=DAY1;t+=10)endOpts+='<option value="'+t+'"'+(t===b.e?" selected":"")+'>'+hm(t)+'</option>';
  const empT=S.employees.filter(X=>factoryOf(X)===factoryOf(M)).map(X=>{const can=X.skills.includes(b.m);const free=slotFree(b.date,b.m,X,b.s,b.e,b.id);
    return tg("b-emp",X.id,X.id===b.emp,esc(X.name)+'<small>'+(X.id===b.emp?"目前":!can?"不會此機":free?"有空":"沒空")+'</small>',"");}).join("");
  const machT=S.machines.filter(X=>X.proc===p.steps[b.step].proc&&X.products.includes(o.pid)&&factoryOf(X)===factoryOf(p.steps[b.step])).map(X=>tg("b-mach",X.id,X.id===b.m,'<span class="num">'+esc(X.id)+'</span><small>'+esc(X.label)+'</small>')).join("");
  const body='<dl class="kv"><dt>產品</dt><dd>'+esc(p.name)+"　第 "+(b.step+1)+" 站／共 "+p.steps.length+" 站："+esc(p.steps[b.step].proc)+'</dd><dt>數量</dt><dd class="num">'+b.qty+' 件</dd><dt>時間</dt><dd class="num">'+mdw(b.date)+" "+hm(b.s)+"–"+hm(b.e)+"（"+(b.e-b.s)+' 分）</dd><dt>機台</dt><dd>'+esc(M.id+" "+M.label)+'</dd><dt>人員</dt><dd>'+esc(E?E.name:"未指定")+'</dd><dt>期限</dt><dd>'+mdw(o.due)+"　"+statusTag(o)+'</dd></dl>'+
   (iss.length?'<div class="issues">'+iss.map(t=>'<div class="issue">'+esc(t)+'</div>').join("")+'</div>':'<div class="okbox">沒有問題</div>')+
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
    '<div class="flow"><span class="pill">1. 急件優先</span><span class="arr">→</span><span class="pill">2. 期限早的先做</span><span class="arr">→</span><span class="pill">3. 前站做完才排下站</span><span class="arr">→</span><span class="pill">4. 找最早能完成的機台＋人</span><span class="arr">→</span><span class="pill">5. 模擬退火試上百種順序，挑最好的</span></div>'+
    '<div class="hint">會一起計算 1 廠與 2 廠的全部工序，切換廠別只影響畫面顯示。會避開請假、故障、午休與未開放的加班時段。'+(pins?"已固定（釘）的 "+pins+" 段不會動。":"")+'已經過去的時段不會動。</div>',
    foot:'<button class="btn" data-act="close">取消</button><button class="btn primary" data-act="auto-run">'+IC.bolt+'計算並預覽</button>'};
},
/* ---------- 匯出 ---------- */
export(){
  return {title:"Excel 匯出／匯入",body:
   '<button class="btn primary" data-act="x-xlsx" style="height:60px;justify-content:flex-start">'+IC.down+'下載 '+mdw(UI.date)+' 彩色排程 Excel（.xlsx）</button>'+
   '<button class="btn" data-act="x-template" style="height:60px;justify-content:flex-start">'+IC.down+'下載批次匯入範本（.xlsx）</button>'+
   (canArchive()?'<label class="btn" style="height:60px;justify-content:flex-start;cursor:pointer">選擇 Excel 檔案，檢查並預覽<input id="xlsx-import" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none"></label>':'')+
   '<div class="hint">舊版排程可獨立存為歷史資料，按日期查看 1 廠、2 廠，不改目前排程。批次匯入範本會取代基本資料，只有老闆能確認。</div>'+
   '<button class="btn" data-act="x-copy-day" style="height:60px;justify-content:flex-start">複製 '+mdw(UI.date)+' 排程表（和原本 Excel 一樣的格式）</button>'+
   '<button class="btn" data-act="x-copy-all" style="height:60px;justify-content:flex-start">複製全部明細（每段一列）</button>'+
   ('<button class="btn primary" data-act="x-dl" style="height:60px;justify-content:flex-start">'+IC.down+'下載全部明細 CSV 檔</button>')+
   '<div class="hint">複製後，直接貼到 Google 試算表或 Excel 的 A1 格。</div>'};
},
"import-preview"(m){
  const hasSecondFactory=S.employees.some(e=>factoryOf(e)===2)||S.machines.some(x=>factoryOf(x)===2)||S.products.some(p=>p.steps.some(s=>factoryOf(s)===2));
  const counts=m.data&&[m.data.employees.length,m.data.machines.length,m.data.products.length,m.data.orders.length];
  const summary=counts?'<div class="pv-sum">員工 '+counts[0]+' 人、機台 '+counts[1]+' 台、產品 '+counts[2]+' 種、工單 '+counts[3]+' 張</div>':'';
  const problems=m.errors.length?'<div class="issues">'+m.errors.map(t=>'<div class="issue">'+esc(t)+'</div>').join('')+'</div>':'';
  const warning=hasSecondFactory?'<div class="issues"><div class="issue">目前匯入範本沒有廠別欄，系統已有 2 廠資料。為避免整批覆蓋，這次不能確認匯入。</div></div>':
    !m.errors.length?'<div class="issues"><div class="issue">確認後將以 Excel 內容取代現有員工、機台、產品工序與工單，並清空現有 '+S.blocks.length+' 段排程；上班日設定保留。匯入後再按「自動排程」建立新班表。</div></div>':'';
  return {title:m.errors.length?'Excel 匯入 · 請修正檔案':'Excel 匯入 · 確認取代資料',
    body:'<div class="hint">檔案：'+esc(m.filename)+'</div>'+summary+problems+warning,
    foot:'<button class="btn" data-act="close">取消</button>'+(m.errors.length||hasSecondFactory?'':'<button class="btn primary" data-act="x-import-confirm">確認匯入並清空舊排程</button>')};
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
  const D=m.draft,ro=readOnly||!canMaster(),T=todayStr();
  const openD=d=>{const o=D.over[d];return o?o==="work":!!D.week[parseD(d).getUTCDay()];};
  const hol=Object.keys(HOLI).filter(d=>d>=T&&d<=addDays(T,120)).sort();
  const body='<div class="field"><span class="lab">每週固定上班的日子</span><div class="toggles">'+[1,2,3,4,5,6,0].map(w=>tg("c-week",w,D.week[w],"週"+WD[w])).join("")+'</div></div>'+
   '<div class="field"><span class="lab">接下來的國定假日（預設照常上班，只標示工資加倍）</span><div class="result">'+
   (hol.map(d=>'<div class="rline" style="align-items:center"><span style="flex:1">'+mdw(d)+"　"+esc(HOLI[d])+'</span>'+tg("c-day",d,openD(d),openD(d)?"上班":"停工")+'</div>').join("")||'<div class="empty">近期沒有國定假日</div>')+'</div></div>'+
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
  "drag-confirm":()=>{
    const P=UI.modal&&UI.modal.t==="drag-preview"&&UI.modal.proposal;
    if(!P||P.problems.length||readOnly)return;
    if(JSON.stringify(S)!==P.base){closeModal();toast("排程已更新，請重新拖曳預覽");return;}
    pushUndo();S=P.after;
    const lines=[{k:"info",t:P.movedLabel+"："+P.source+" → "+P.target},
      ...P.unpinned.map(x=>({k:"info",t:x.label+"：解除固定後順延"})),...P.lines];
    const shifted=P.ops.filter(x=>![...x.prev,...x.next].some(b=>b.id===P.oldId)).length;
    commit({kind:"move",title:(P.isNew?"手動排入 ":"手動調整 ")+P.movedLabel+(shifted?"，連帶調整 "+shifted+" 道工序":""),lines});
    closeModal();toast("已確認並儲存"+(P.unpinned.length?"；已解除 "+P.unpinned.length+" 段固定":""));
  },
  "c-week":a=>{const w=+a.dataset.v,D=UI.modal.draft;D.week[w]=!D.week[w];rerender();},
  "c-day":a=>{const d=a.dataset.v,D=UI.modal.draft;const def=!!D.week[parseD(d).getUTCDay()];const cur=D.over[d]?D.over[d]==="work":def;const nv=!cur;if(nv===def)delete D.over[d];else D.over[d]=nv?"work":"off";rerender();},
  "c-save":()=>{
    pushUndo();S.cal={week:[...UI.modal.draft.week],over:{...UI.modal.draft.over}};
    for(const d of Object.keys(S.dayOT))if(!isOpen(d))delete S.dayOT[d];
    const r=closeDays();
    commit({kind:"ot",title:"更新上班日設定"+(r.aff.length?"，移走 "+r.aff.length+" 段工作":""),lines:r.lines});
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
  if(PV.mode==="orig")return {pv:true,mark:d.goneKeys,markCls:"willchg",ghosts:[],extraFaults:PV.faultsNew};
  if(PV.mode==="new")return {pv:true,mark:d.addedKeys,markCls:"chg",ghosts:[]};
  return {pv:true,mark:d.addedKeys,markCls:"chg",ghosts:d.gone,lanes:true};
}
function pvPanelHTML(o){
  const d=diffOf(o),dates=Object.keys(d.dates).sort();
  const tabs=PV.opts.map(x=>{const ai=PV.ai&&PV.ai.pick===x.id;
    return '<button class="pv-opt" data-act="pv-pick" data-v="'+x.id+'" aria-pressed="'+(x.id===o.id)+'"><span class="pid num">'+x.id+'</span><span class="pv-opt-t"><b>'+esc(x.name)+'</b>'+
      '<small>延誤 '+x.mt.lateCodes.length+' · 異動 '+x.mt.moved+' · 他天 '+x.mt.otherDays+(x.mt.otH>0?' · 加班 '+x.mt.otH+'h':"")+(PV.kind==="recover"&&x.mt.gainH>0?' · 提早 '+x.mt.gainH+'h':"")+'</small>'+
      '<span>'+(x.applicable===false?'<span class="tag bad">不可套用</span>':"")+(x.best?'<span class="tag ok">系統推薦</span>':"")+(ai?'<span class="tag ai">AI 推薦</span>':"")+'</span></span></button>';}).join("");
  const sub=[["gantt","跨日影響圖"],["people","每個人的變動"],["lines","系統怎麼調"]];
  const body=PV.tab==="people"?peopleHTML(o):PV.tab==="lines"?'<div class="hint">'+esc(o.desc)+'</div>'+resultHTML(o.lines):ganttHTML(o);
  let ai="";
  if(SAMPLE){
    if(!PV.ai)ai='<button class="btn ai-btn" data-act="pv-ai">問 AI：該選哪一個？</button>';
    else if(PV.ai.loading)ai='<div class="aibox">AI 正在比較這 '+PV.opts.length+' 個方案…</div>';
    else if(PV.ai.err)ai='<div class="aibox">'+esc(PV.ai.err)+'</div>'+(PV.ai.retry?'<button class="btn ai-btn" data-act="pv-ai">再問一次</button>':"");
    else ai='<div class="aibox"><b>AI 建議：方案 '+esc(PV.ai.pick)+'</b><div>'+esc(PV.ai.reason)+'</div>'+(PV.ai.watch?'<div class="hint">注意：'+esc(PV.ai.watch)+'</div>':"")+
      (PV.ai.pick!==o.id?'<button class="btn" data-act="pv-pick" data-v="'+esc(PV.ai.pick)+'">看方案 '+esc(PV.ai.pick)+'</button>':"")+'</div>';
  }else ai='<div class="hint">AI 助理下一階段由伺服器提供。</div>';
  return '<section class="pv" aria-label="預覽">'+
   '<div class="pv-h"><span class="pv-badge">預覽中</span><div class="pv-t"><b>'+esc(PV.title)+'</b><small>還沒套用，排程不會變。看清楚再按「套用」。　計算：'+(o.solverMethod==="restricted_pairs"?"OR-Tools 快速初稿（可行但不保證最佳）":PV.engine==="OR-Tools"?"OR-Tools":"瀏覽器備援")+'</small></div><div class="spacer"></div>'+
   '<button class="btn" data-act="pv-cancel">取消</button><button class="btn primary" data-act="pv-apply"'+(o.applicable===false?' disabled':'')+'>'+(o.applicable===false?'不可套用':'套用方案 '+o.id)+'</button></div>'+
   '<div class="pv-opts">'+tabs+'</div>'+
   (o.applicable===false?'<div class="pv-sum"><b>目前不能套用：</b>'+o.diagnostics.map(esc).join('；')+'</div>':'')+
   '<div class="pv-sum"><b>方案 '+o.id+'：</b>'+esc(pvSummary(o))+'</div>'+
   '<div class="pv-row"><div class="seg" role="group" aria-label="預覽圖與下方排程表顯示"><button data-act="pv-mode" data-v="cmp" aria-pressed="'+(PV.mode==="cmp")+'">對照</button><button data-act="pv-mode" data-v="new" aria-pressed="'+(PV.mode==="new")+'">調整後</button><button data-act="pv-mode" data-v="orig" aria-pressed="'+(PV.mode==="orig")+'">原本</button></div>'+
   '<span class="hint">'+(PV.mode==="cmp"?"虛線／上排＝原本，彩色／下排＝調整後":PV.mode==="new"?"只看調整後，粗框＝有變動的工作":"只看原本，虛線框＝會被移動的工作")+'</span><div class="spacer"></div>'+
   '<div class="pv-dates"><span class="hint">影響的日期</span>'+(dates.map(ds=>'<button class="pv-date" data-act="pv-date" data-v="'+ds+'" aria-pressed="'+(ds===UI.date)+'"><b class="num">'+md(ds)+'</b><small>'+WD[parseD(ds).getUTCDay()]+' · '+d.dates[ds]+' 處</small></button>').join("")||'<span class="hint">無</span>')+'</div></div>'+
   '<div class="pv-grid"><div class="pv-main"><div class="pv-tabs">'+sub.map(([k,t])=>'<button class="tg" data-act="pv-tab" data-v="'+k+'" aria-pressed="'+(PV.tab===k)+'">'+t+'</button>').join("")+'</div>'+body+'</div>'+
   '<div class="pv-side">'+ai+'<div class="field"><label for="pv-note">備註（會寫進紀錄）</label><input class="inp" id="pv-note" value="'+esc(PV.note)+'" placeholder="例：馬達燒掉，廠商下午來修" autocomplete="off"></div></div></div>'+
   '</section>';
}
function openPlans(title,logTitle,kind,applyEvent,strategies,extra={}){
  if(extra.event&&SOLVER.up!==false)return openPlansSolver(title,logTitle,kind,applyEvent,strategies,extra);
  return openPlansLocal(title,logTitle,kind,applyEvent,strategies,extra);
}
async function openPlansSolver(title,logTitle,kind,applyEvent,strategies,extra){
  toast("OR-Tools 計算中，約 3–5 秒…");
  const now={date:todayStr(),min:nowMin()};
  let plan;
  try{
    plan=STORE.kind==="supabase"?await SOLVER.plansDb(extra.event,now,STORE.jwt()):await SOLVER.plans(toSnapshot(S,HOLI),extra.event,now);
  }catch(e){
    if(e.status&&e.status<500){toast(e.message);return;}
    toast("排程服務沒有回應，改用瀏覽器內的演算法");
    return openPlansLocal(title,logTitle,kind,applyEvent,strategies,extra);
  }
  if(!plan.options||!plan.options.length){toast("算不出可行的排法，請手動處理");return;}
  const B=JSON.parse(JSON.stringify(S)),ev={date:plan.date,oid:extra.event.order?extra.event.order.id:undefined};
  const opts=plan.options.map(o=>{const A=applyOption(B,o);return {id:o.id,name:o.name,desc:o.desc,lines:o.lines||[],mt:measure(B,A,ev),score:o.score,best:!!o.recommended,applicable:o.applicable!==false,diagnostics:o.diagnostics||[],state:JSON.stringify(A),A,sec:o.solve_seconds,solverMethod:o.solver_method};});
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
  {
    const best=opts.find(o=>o.best)||opts[0];
    const fk=f=>[f.date,f.s,f.e].join("|"),faultsNew=[];
    for(const M of best.A.machines){const bm=B.machines.find(x=>x.id===M.id);const have=new Set((bm?bm.faults:[]).map(fk));for(const f of M.faults)if(!have.has(fk(f)))faultsNew.push({m:M.id,...f});}
    PV={title,logTitle,kind,base,B,opts,cur:best.id,mode:"cmp",tab:"gantt",ai:null,note:"",ev,faultsNew,...extra};
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
    const pick=String(r&&r.pick||"").replace(/[^A-Z]/gi,"").toUpperCase().slice(0,1);
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
  const P=PV,noteEl=$("#pv-note");if(noteEl)P.note=noteEl.value.trim();
  if(P.previewId&&STORE.applyPlan){
    toast("套用中…");
    try{await STORE.applyPlan(P.previewId,o.id,P.note,P.ai&&P.ai.pick?{pick:P.ai.pick,reason:P.ai.reason}:null);}
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
    alts:P.opts.map(x=>"方案 "+x.id+" "+x.name+"：延誤 "+x.mt.lateCodes.length+"、異動 "+x.mt.moved+"、影響他天 "+x.mt.otherDays+"、加班 "+x.mt.otH+" 小時"+(x===o?"（採用）":""))});
  showResult();
}
Object.assign(MODAL_ACT,{
  "pv-pick":a=>{PV.cur=a.dataset.v;const d=diffOf(pvOpt());if(!d.dates[UI.date]){const ds=Object.keys(d.dates).sort();if(ds.length)UI.date=ds.find(x=>x>=todayStr())||ds[0];}render();},
  "pv-mode":a=>{PV.mode=a.dataset.v;render();},
  "pv-tab":a=>{PV.tab=a.dataset.v;render();},
  "pv-date":a=>{UI.date=a.dataset.v;UI.view="day";render();},
  "pv-ai":()=>askAI(),
  "pv-apply":()=>pvApply(),
  "pv-cancel":()=>{PV=null;render();toast("已取消，排程沒有改變");maybeReload();}
});
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
  "inc-rush":()=>openModal({t:"ord",id:null,pri:0}),
  "lq-date":a=>{UI.modal.date=a.dataset.v;renderModal();},
  "lq-go":()=>{
    const eid=UI.modal.id,d=UI.modal.date,E=emp(eid);
    const n=S.blocks.filter(b=>b.emp===eid&&b.date===d&&futureOf(b)).length;
    if(!n){pushUndo();E.leaves.push(d);commit({kind:"leave",title:E.name+" "+md(d)+" 請假（當天沒有排工作）",lines:[]});closeModal();toast("已登記，當天沒有他的工作");return;}
    const ev=()=>{const X=emp(eid);X.leaves.push(d);return {date:d,mode:"leave",aff:S.blocks.filter(b=>b.emp===eid&&b.date===d&&futureOf(b))};};
    openPlans(E.name+" "+mdw(d)+" 請假，"+n+" 段工作要調整",E.name+" "+md(d)+" 請假","leave",ev,STRAT_EVENT,{event:{type:"leave",employee:eid,date:d}});
  }
});
/* ---------- 操作手冊 ---------- */
const HELP=[
 ["快速上手",[
  "上方四格：<b>員工、機台、工單、紀錄</b>。點任何一格都能看細節或修改。",
  "下方大表跟 Excel 一樣：<b>左邊是時間、上面是機台，顏色代表員工</b>。",
  "有狀況時按紅色的 <b>突發狀況</b>，選「機台故障、有人請假、急單」。",
  "每個動作都會<b>自動儲存</b>，右上角會顯示「已同步」或「已存在這台電腦」。"],
  "不小心改錯？按 <b>復原</b>，一次退一步。"],
 ["看排程",[
  "按 <b>‹ ›</b> 換日期，按 <b>今天</b> 回到今天；按日期可以直接選。",
  "按 <b>日／週</b> 切換。週檢視點任一格會跳到那一天。",
  "<b>紅框＋驚嘆號</b> = 有問題（人不會操作、請假、機台故障、時間撞到）。點方塊看原因。",
  "方塊上有 <b>釘</b> = 手動固定，系統自動排程不會動它；<b>急</b> = 特急工單。",
  "灰色斜線是午休，黃色是加班時段，紅色是機台故障時段。"],
  "工廠大螢幕請按 <b>大螢幕</b>，字會變大、隱藏管理按鈕。"],
 ["拖曳調整",[
  "排程表按 <b>＋手動排班</b>，選工單工序、機台、員工與時段；先看預覽，確認後才會新增彩色方塊。",
  "按住方塊拖到別的時間或別台機台；拉方塊底邊可改結束時間和預計件數。放開會先看預覽，按「確認套用」才會儲存。手機、平板也可用手指操作。",
  "拖的時候：<b>綠框</b> = 可預覽；<b>黃框</b> = 後面的工作可能順延；<b>紅框</b> = 預覽會顯示問題。若撞到已固定的工作，預覽會明確提醒確認後將解除固定並移動它。",
  "被推的工作如果超過下班，會自動順延到下一個上班日，後面的工序也會跟著延。",
  "拖過的方塊會自動 <b>釘</b> 住。想讓系統重新安排它：點方塊 →「交給系統重排」。",
  "點一下方塊（不要拖）可以換人、換機台、選開始／結束時間或刪除。"],
  "一般自動排程不會推固定（釘）的方塊；手動拖曳撞到固定方塊時，須在預覽明確確認才會解除固定並順延。"],
 ["工單、插單、急單",[
  "工單格按 <b>＋新增</b>：填工單號、數量、產品、<b>最晚完成日</b>和優先順序（特急／急／一般／不急）。",
  "按「下一步：選排法」，系統會列出三種排法：<b>排進空檔</b>（不動別人）、<b>插單優先</b>（擋到的較不急工作往後推）、<b>插單＋加班</b>。",
  "每個排法都會顯示：<b>本單幾號完成、會不會延誤、影響幾段工作、要加班幾小時</b>。選一個按「採用這個」。",
  "急單最快的路：<b>突發狀況 → 急單／插單</b>，優先順序會預設為特急。"],
  "工序時間是依「產品工序」的標準公式自動算的：數量 ÷ 每分鐘件數。"],
 ["突發狀況與預覽",[
  "按 <b>突發狀況 → 機台故障</b> → 點壞掉的機台 → 選從幾點開始、壞多久 → 按「確認故障」。",
  "畫面會進入 <b>預覽中</b>（藍框）：系統算好幾種排法，上方可以切換方案 A、B、C、D，<b>還沒按「套用」前排程都不會變</b>。",
  "<b>一句話總結</b>：幾張工單變晚、會不會超過期限、影響哪幾天、誰的班表有變。",
  "<b>對照／調整後／原本</b>：下方排程表切換。對照模式裡，<b>虛線框是原本位置、粗框是調整後</b>；週檢視會分上下兩排（原本、調整後）。",
  "<b>跨日影響圖</b>：每張工單一列，上排虛線是原本、下排彩色是調整後，紅線是期限，右邊寫「晚幾天幾小時」。跨好幾天的影響一眼就看得到。",
  "<b>每個人的變動</b>：每位員工哪一天被拿掉、新增了哪段工作，方便通知本人。",
  "<b>問 AI</b>：AI 依「期限不能延誤 → 少動其他天 → 少加班」幫你挑一個，並說明原因。可以在備註寫下故障原因，會一起寫進紀錄。"],
  "套用後，上方會出現黃色的 <b>最新變更</b>，員工打開網頁就知道誰的班表變了。"],
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
  "<b>串列排程法</b>：依工單順序，一站一站找「最早能完成」的機台＋人，工作太長會自動跨午休或跨日分段。",
  "<b>派工規則</b>（業界常用）：優先級、交期最早 EDD、工時最短 SPT、寬裕比最小 CR，先各排一次挑最好的當起點。",
  "<b>模擬退火</b>（開源最佳化常用方法）：隨機調換工單順序，試上百種排法，保留「延誤最少 → 完成最早 → 變動最少」的那一個。",
  "局部調整（請假、故障）會先試 <b>換人 → 換機台 → 延後 → 順延</b>，盡量不動其他天。"],
  "以後工單變多時，可以把計算換成 Google OR-Tools（開源的工廠排程求解器），畫面和操作都不用改。"],
 ["員工、機台、工序設定",[
  "<b>員工</b>：點名字 → 設定會操作的機台、同時最多顧幾台、固定每週哪幾天可加班，以及請假日期。",
  "<b>機台</b>：點機台 → 設定做哪一道工序、可以生產哪些產品（有哪些模具）。",
  "<b>產品工序</b>（工單格下方）：每個產品要經過哪幾站、一個人每分鐘做幾件、前站做完幾件就能傳到下一站。",
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
  "<b>Excel</b> 按鈕：複製當天排程表（和原本 Excel 一樣的格式），貼到 Google 試算表或 Excel；或下載全部明細。",
  "畫面太大太小：用 <b>− 85% ＋</b> 調整；<b>淺色／深色</b> 按鈕切換顏色。"],
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
  "ot-day":a=>{UI.modal.open=a.dataset.v==="1";rerender();},
  "ot-person":a=>{const selected=a.dataset.v==="1";UI.modal.overrides[a.dataset.id]=selected===overtimeDefault(emp(a.dataset.id),UI.modal.date)?null:selected;rerender();},
  "ot-reset":a=>{UI.modal.overrides[a.dataset.id]=null;rerender();},
  "ot-save":()=>saveDailyOT(UI.modal),
  "m-color":a=>{UI.modal.draft.color=+a.dataset.v;rerender();},
  "m-emp-factory":a=>{const d=UI.modal.draft;d.factory=+a.dataset.v;d.skills=d.skills.filter(id=>factoryOf(mach(id))===d.factory);rerender();},
  "m-skill":a=>{toggleIn(UI.modal.draft.skills,a.dataset.v);rerender();},
  "m-ot-week":a=>{toggleIn(UI.modal.draft.otWeekdays,+a.dataset.v);UI.modal.draft.otWeekdays.sort();rerender();},
  "m-leave":a=>{toggleIn(UI.modal.draft.leaves,a.dataset.v);rerender();},
  "m-emp-save":()=>{
    syncInputs();const m=UI.modal,D=m.draft;D.name=D.name.trim();
    D.factory=factoryOf(D);D.skills=D.skills.filter(id=>factoryOf(mach(id))===D.factory);
    if(!D.name){toast("請輸入姓名");return;}
    if(!Number.isInteger(D.maxMachines)||D.maxMachines<1||D.maxMachines>100){toast("同時顧機台上限請填 1–100 台");return;}
    const old=emp(D.id);
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
    commit({kind:addLv.length||delLv.length?"leave":"edit",title,lines});
    if(lines.length)showResult();
    else{closeModal();delLv.length?toast("已取消請假。要把工作排回來嗎？","重新排程",runAuto):toast("已儲存");}
  },
  "m-emp-del":a=>{
    if(!confirmStep(a,"m-emp-del"))return;
    const m=UI.modal,E=emp(m.id);pushUndo();
    E.skills=[];
    const aff=S.blocks.filter(b=>b.emp===E.id&&futureOf(b));
    const lines=aff.length?repair(aff,"leave"):[];
    S.blocks=S.blocks.filter(b=>b.emp!==E.id||!futureOf(b));
    S.employees=S.employees.filter(x=>x!==E);
    commit({kind:"edit",title:"刪除員工 "+E.name,lines});
    lines.length?showResult():closeModal();
  },
  "m-proc":a=>{UI.modal.draft.proc=a.dataset.v;rerender();},
  "m-mach-factory":a=>{UI.modal.draft.factory=+a.dataset.v;rerender();},
  "m-prod":a=>{toggleIn(UI.modal.draft.products,a.dataset.v);rerender();},
  "m-fd":a=>{captureFault(UI.modal);UI.modal.fd=+a.dataset.v;rerender();},
  "m-fault":()=>{
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
    if(!n){pushUndo();ev();commit({kind:"fault",title:title+"（這段時間沒有排工作）",lines:[]});closeModal();toast("已記錄故障，這段時間沒有工作受影響");return;}
    openPlans(title+"，"+n+" 段工作受影響",title,"fault",ev,STRAT_EVENT,{fid,event:{type:"fault",machine:mid,date:d,start:s,end:e,note}});
  },
  // 機台修好了 → 進入預覽，比較幾種「把機台加回排程」的方法
  "m-fix":a=>{
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
    if(!m.id){if(!/^[a-z0-9]{1,4}$/.test(D.id)){toast("代號請用英文或數字");return;}if(mach(D.id)){toast("代號 "+D.id+" 已經有了");return;}}
    pushUndo();
    const old=mach(D.id);
    if(old){D.faults=old.faults;Object.assign(old,JSON.parse(JSON.stringify(D)));}else S.machines.push(JSON.parse(JSON.stringify(D)));
    const M=mach(D.id);
    S.employees.filter(E=>factoryOf(E)!==factoryOf(M)).forEach(E=>{E.skills=E.skills.filter(id=>id!==M.id);});
    const aff=S.blocks.filter(b=>b.m===M.id&&futureOf(b)&&(()=>{const o=order(b.oid),st=prod(o.pid).steps[b.step];return M.proc!==st.proc||!M.products.includes(o.pid)||factoryOf(M)!==factoryOf(st)||factoryOf(emp(b.emp))!==factoryOf(M);})());
    const lines=aff.length?repair(aff,"fault"):[];
    commit({kind:"edit",title:(old?"更新":"新增")+"機台 "+M.id+" "+M.label+(aff.length?"，移走 "+aff.length+" 段工作":""),lines});
    if(lines.length)showResult();else{closeModal();toast(old?"已儲存":"已新增機台，記得到員工設定勾選誰會操作");}
  },
  "m-mach-del":a=>{
    if(!confirmStep(a,"m-mach-del"))return;
    const M=mach(UI.modal.id);pushUndo();
    M.products=[];
    const aff=S.blocks.filter(b=>b.m===M.id&&futureOf(b));
    const lines=aff.length?repair(aff,"fault"):[];
    S.blocks=S.blocks.filter(b=>b.m!==M.id);
    S.machines=S.machines.filter(x=>x!==M);
    S.employees.forEach(E=>{E.skills=E.skills.filter(x=>x!==M.id);});
    commit({kind:"edit",title:"刪除機台 "+M.id,lines});
    lines.length?showResult():closeModal();
  },
  "o-prod":a=>{UI.modal.draft.pid=a.dataset.v;rerender();},
  "o-pri":a=>{UI.modal.draft.pri=+a.dataset.v;rerender();},
  "o-save":()=>{
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
    openPlans(title+"：怎麼排？",title,"edit",ev,STRAT_ORDER,{oid:D.id,event:{type:"order",order:{id:snap.id,code:snap.code,product:snap.pid,qty:snap.qty,due:snap.due,priority:snap.pri}}});
  },
  "o-del":a=>{
    if(!confirmStep(a,"o-del"))return;
    const O=order(UI.modal.id);pushUndo();
    S.blocks=S.blocks.filter(b=>b.oid!==O.id);S.orders=S.orders.filter(x=>x!==O);
    commit({kind:"edit",title:"刪除工單 "+O.code,lines:[]});closeModal();
  },
  "clear-demo":a=>{
    if(!confirmStep(a,"clear-demo"))return;
    pushUndo();S.orders=[];S.blocks=[];S.log=[];S.demo=false;
    S.employees.forEach(E=>E.leaves=[]);S.machines.forEach(M=>M.faults=[]);
    commit({kind:"edit",title:"清除示範工單，開始使用",lines:[]});closeModal();
  },
  "p-addstep":a=>{syncInputs();UI.modal.draft[+a.dataset.v].steps.push({proc:PROCS[0],factory:UI.factory==="all"?1:UI.factory,rate:1,batch:0});rerender();},
  "p-delstep":a=>{syncInputs();const [pi,si]=a.dataset.v.split(".").map(Number);const st=UI.modal.draft[pi].steps;if(st.length>1)st.splice(si,1);rerender();},
  "p-add":()=>{syncInputs();UI.modal.draft.push({id:uid(),name:"新產品",steps:[{proc:PROCS[0],factory:UI.factory==="all"?1:UI.factory,rate:1,batch:0}]});rerender();},
  "p-save":()=>{
    syncInputs();const D=UI.modal.draft;
    for(const p of D){p.name=String(p.name).trim()||"未命名";for(const s of p.steps){s.factory=factoryOf(s);s.rate=+s.rate;s.batch=Math.max(0,Math.round(+s.batch||0));if(!(s.rate>0)){toast(p.name+"：每分鐘件數要大於 0");return;}}}
    pushUndo();S.products=D;
    S.blocks=S.blocks.filter(b=>{const o=order(b.oid);return o&&prod(o.pid)&&b.step<prod(o.pid).steps.length;});
    commit({kind:"edit",title:"修改產品工序",lines:[]});closeModal();
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
  "x-copy-all":()=>copyText(allRows().map(r=>r.join("\t")).join("\n")),
  "x-dl":()=>downloadCSV(),
  "x-xlsx":async()=>{
    try{const {scheduleXlsx}=await import("./excel.js");const machines=shownMachines(),ids=new Set(machines.map(m=>m.id));
      const bytes=await scheduleXlsx({...S,machines,blocks:S.blocks.filter(b=>ids.has(b.m))},UI.date);
      saveFile("產線排程_"+(UI.factory==="all"?"跨廠":factoryName(UI.factory))+"_"+UI.date+".xlsx",new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));}
    catch(e){toast("Excel 匯出失敗："+e.message);}
  },
  "x-template":()=>{
    const a=document.createElement("a");a.href="/匯入範本.xlsx";a.download="產線排程_匯入範本.xlsx";
    document.body.appendChild(a);a.click();a.remove();
  },
  "x-import-confirm":()=>{
    const m=UI.modal;if(!m||m.t!=="import-preview"||m.errors.length||!canMaster())return;
    if(S.employees.some(e=>factoryOf(e)===2)||S.machines.some(x=>factoryOf(x)===2)||S.products.some(p=>p.steps.some(s=>factoryOf(s)===2))){
      toast("目前範本沒有廠別欄，不能覆蓋已設定的 2 廠資料");return;}
    if(JSON.stringify(S)!==m.base){closeModal();toast("排程已更新，請重新選擇 Excel 檔案預覽");return;}
    pushUndo();S={...S,...m.data,blocks:[],demo:false};
    commit({kind:"edit",title:"Excel 批次匯入："+S.employees.length+" 位員工、"+S.machines.length+" 台機台、"+S.products.length+" 種產品、"+S.orders.length+" 張工單",lines:[{k:"info",t:"已清空原排程，請重新執行自動排程"}]});
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
      const b=S.blocks.find(b=>b.date===d&&b.m===M.id&&b.s<t+30&&b.e>t);
      return b?(emp(b.emp)?emp(b.emp).name:"")+" "+order(b.oid).code+" "+stepName(b):"";})]);
  }
  return mdw(d)+" 排程\n"+rows.map(r=>r.join("\t")).join("\n");
}
function allRows(){
  const head=["日期","星期","開始","結束","機台","員工","工單","產品","工序","數量","固定","問題"];
  const machineIds=new Set(shownMachines().map(m=>m.id));
  return [head,...S.blocks.filter(b=>machineIds.has(b.m)).sort(byAbs).map(b=>{const o=order(b.oid);
    return [b.date,WD[parseD(b.date).getUTCDay()],hm(b.s),hm(b.e),b.m,emp(b.emp)?emp(b.emp).name:"",o.code,prod(o.pid).name,stepName(b),b.qty,b.pin?"是":"",issuesOf(b).join("；")];})];
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
const SYNC={state:"ok",msg:""};
let lastLocalWrite=0,pendingReload=false,reloadTimer=null;
// 基本資料（員工、機台、產品工序、上班日）只有老闆能改；組長可以報故障、請假、工單、調排程
function canMaster(){return !readOnly&&(!STORE||STORE.kind==="local"||STORE.role==="boss");}
function canArchive(){return !readOnly&&(!STORE||STORE.kind==="local"||["boss","lead"].includes(STORE.role));}
const ROLE_NAME={boss:"老闆",lead:"組長",worker:"員工",viewer:"電視（只能看）"};

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
let syncChain=Promise.resolve();
function queueSync(entry){
  syncChain=syncChain.then(async()=>{
    SYNC.state="busy";updateSyncChip();
    try{await STORE.sync(S,entry);SYNC.state="ok";SYNC.msg="";lastLocalWrite=Date.now();}
    catch(e){
      SYNC.state="error";SYNC.msg=e.message;
      if(e.conflict){toast("別人剛更新過排程，已載入最新版本，請再做一次你的調整");await reloadFromStore();SYNC.state="ok";}
      else if(e.permission){toast(e.message+"，已還原");await reloadFromStore();SYNC.state="ok";}
      else toast("同步失敗："+e.message,"重試",()=>queueSync(null));
    }
    updateSyncChip();
  });
  return syncChain;
}

// ---------- 別人改了 → 重新讀取 ----------
function normalizeState(){
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
function onRemoteChange(){
  if(PV||drag||UI.modal||SYNC.state==="busy"){pendingReload=true;return;}
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(async()=>{
    const mine=Date.now()-lastLocalWrite<4000;
    await reloadFromStore();
    const l=S.log[0];
    if(!mine&&l&&Date.now()-l.t<120000)toast("有新的變更："+l.title,"看細節",()=>openModal({t:"logone",id:l.id}));
  },600);
}
function maybeReload(){if(pendingReload&&!PV&&!UI.modal&&!drag){pendingReload=false;onRemoteChange();}}

// ---------- 帳號與連線 ----------
MODALS.account=()=>({title:"帳號與連線",
  body:'<dl class="kv"><dt>資料</dt><dd>'+(STORE.kind==="local"?"本機（這台電腦的瀏覽器）":"雲端資料庫（Supabase）")+'</dd>'+
    (STORE.kind==="supabase"?'<dt>帳號</dt><dd>'+esc(STORE.userName)+'</dd><dt>角色</dt><dd>'+esc(ROLE_NAME[STORE.role]||"未設定")+'</dd>':"")+
    '<dt>排程計算</dt><dd>'+(SOLVER.up?"OR-Tools "+esc(SOLVER.version):"瀏覽器內的演算法（排程服務未連線）")+'</dd></dl>'+
    (STORE.kind==="local"?'<div class="hint">要多人使用、手機和電視即時同步，請設定雲端資料庫（見 README）。</div>':""),
  foot:(STORE.kind==="supabase"?'<button class="btn" data-act="password-open">設定登入密碼</button><button class="btn" data-act="logout">登出</button>':'<button class="btn danger" data-act="reset-local">清除這台電腦的資料</button>')+
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

// ---------- 啟動 ----------
async function start(){
  const r=await STORE.init();
  if(r.needLogin){showLogin();return;}
  readOnly=STORE.kind==="supabase"&&!["boss","lead"].includes(STORE.role);
  let s=null;
  try{s=await STORE.load();}catch(e){toast(e.message);}
  if(s&&(STORE.kind==="supabase"||s.employees.length))S=s;
  else{makeDemo();if(STORE.kind==="local")queueSync(null);}
  normalizeState();
  loadZoom();loadTheme();loadFactory();
  if(!UI.date)UI.date=todayStr();
  render();
  STORE.subscribe(onRemoteChange);
  SOLVER.check().then(up=>{updateSyncChip();if(up)toast("已連上 OR-Tools 排程服務");});
  setInterval(()=>{if(!drag&&!UI.modal&&!PV&&UI.view==="day"&&UI.date===todayStr())render();},60000);
}
export async function boot(store,authLinkType=""){
  STORE=store;
  await start();
  if(STORE.kind==="supabase"&&STORE.session&&["invite","recovery"].includes(authLinkType))
    openModal({t:"password"});
}

// Read-only snapshot projection. No instructions, credentials, or free-text notes.
import {transferPlanWarnings} from './transfers.js';
import {ledgerFacts} from './chat-ledgers.js';
import {validDate} from './transfers.js';
const hm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function dailyContext(raw,{date,factory='all'}){
  const machines=new Map((raw.machines||[]).map(m=>[m.id,m]));
  const employees=new Map((raw.employees||[]).map(e=>[e.id,e]));
  const orders=new Map((raw.orders||[]).map(o=>[o.id,o]));
  const works=new Map((raw.work_contents||[]).map(w=>[w.id,w]));
  const inFactory=f=>factory==='all'||Number(factory)===Number(f||1);
  const activities=[...(raw.blocks||[]).filter(b=>b.date===date&&inFactory(machines.get(b.machine)?.factory)).map(b=>({id:b.id,emp:b.employee,m:b.machine,s:b.start,e:b.end,text:(orders.get(b.order)?.code||'未找到工單')+' · '+(machines.get(b.machine)?.label||b.machine)+' · '+(employees.get(b.employee)?.name||'未指定人員')+' · '+hm(b.start)+'–'+hm(b.end)+' · 預排 '+b.qty+' 件'})),
    ...(raw.work_assignments||[]).filter(a=>a.date===date&&inFactory(works.get(a.workId)?.factory||employees.get(a.emp)?.factory)).map(a=>({id:a.id,emp:a.emp,m:a.resourceId,s:a.s,e:a.e,text:(works.get(a.workId)?.name||'一般工作')+' · '+(employees.get(a.emp)?.name||a.emp)+' · '+hm(a.s)+'–'+hm(a.e)+' · 人工／一般工作（不等於完成量）'}))];
  const facts=[];const push=(kind,text,entityId=null)=>facts.push({id:'F'+(facts.length+1),kind,text,entityId,date});
  const activityIds=new Set(activities.map(a=>a.id));
  push('summary',date+' · '+(factory==='all'?'跨廠':factory+' 廠')+' · '+activities.length+' 段預排工作；僅查看當日，不代表全部工單進度。');
  if(raw.setup_pending)push('alert','名冊、技能或工時待確認，不能據此宣稱能自動排程。');
  for(const m of machines.values())if(inFactory(m.factory))for(const f of m.faults||[])if(f.date===date)push('fault',m.label+'：'+hm(f.start)+'–'+hm(f.end)+' '+(f.fixed?'有歷史故障（已修復）':'故障'),m.id);
  for(const e of employees.values())if((inFactory(e.factory)||activities.some(a=>a.emp===e.id))&&(e.leaves||[]).includes(date))push('leave',e.name+'：'+date+' 已登記請假',e.id);
  // Latest reports describe this block only, never total order completion or
  // historical status at the selected date. Do not project free-text fields.
  const reports=new Map((raw.work_execution||[]).map(r=>[r.blockId,r]));
  for(const b of raw.blocks||[])if(activityIds.has(b.id)){
    const label=(orders.get(b.order)?.code||'工單')+' · '+(employees.get(b.employee)?.name||'未指定人員'),r=reports.get(b.id);
    if(!r){push('execution',label+'：這段沒有現場回報；不能判定未開始或已完成',b.id);continue;}
    if(!['running','done'].includes(r.status)||!Number.isInteger(r.qtyDone)||r.qtyDone<0||r.qtyDone>b.qty){push('execution_alert',label+'：現場回報格式異常，不能確認實際進度',b.id);continue;}
    push('execution',label+'：最新回報 '+(r.status==='done'?'此段已完成':'進行中')+'；累計 '+r.qtyDone+'／預排 '+b.qty+' 件'+(r.status==='done'&&r.qtyDone<b.qty?'（完成回報少於預排量）':'')+'；不代表整張工單完工，也不是選定日期當時的歷史狀態',b.id);
  }
  const transferState={workAssignments:raw.work_assignments||[],transferOrders:raw.transfer_orders||[]};
  for(const a of transferState.workAssignments)if(a.date===date&&activityIds.has(a.id)){
    for(const warning of transferPlanWarnings(transferState,a))push('material',warning,a.id);
  }
  for(const e of employees.values()){
    const rows=activities.filter(a=>a.emp===e.id);if(!rows.length)continue;
    if((e.leaves||[]).includes(date))push('alert',e.name+' 請假但有預排工作，需檢查',e.id);
    const limit=e.max_concurrent_machines||1;
    const points=rows.flatMap(a=>{const weight=a.m?1:limit;return [[a.s,weight],[a.e,-weight]];}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let count=0,peak=0;
    for(const [,delta]of points){count+=delta;peak=Math.max(peak,count);}
    if(peak>limit)push('alert',e.name+' 有同時工作占用，峰值 '+peak+' 容量單位（純人工占滿顧機容量）；請核對顧機上限與純人工占用',e.id);
  }
  for(const m of machines.values()){
    const rows=activities.filter(a=>a.m===m.id).sort((a,b)=>a.s-b.s);
    let end=-1,overlap=false;for(const a of rows){if(a.s<end)overlap=true;end=Math.max(end,a.e);}
    if(overlap)push('alert',m.label+' 有重疊工作，需檢查',m.id);
  }
  for(const o of orders.values())if(o.due<date&&activities.some(a=>a.text.startsWith(o.code+' · ')))push('deadline',o.code+' 交期 '+o.due+' 已過；仍有当日預排，實際是否完工需現場回報',o.id);
  ledgerFacts(raw,date,factory,push);
  for(const a of activities)push('work',a.text,a.id);
  return facts;
}
export function queryKinds(q){
  if(/故障|修復|修好/.test(q))return ['fault'];if(/請假/.test(q))return ['leave','alert'];if(/輪班|班別|崗位|人力/.test(q))return ['roster','alert'];if(/跨廠|流轉|送回|交料/.test(q))return ['transfer','material','deadline'];if(/缺料|待料|物料|點收/.test(q))return ['material','transfer'];if(/衝突|重疊|問題/.test(q))return ['alert','execution_alert','fault','deadline','material'];if(/交期|逾期/.test(q))return ['deadline','material'];if(/進度|完成|開始|累計|回報/.test(q))return ['execution','execution_alert'];return null;
}
export function chatContext(raw,{date,end_date=date,factory='all',question=''}){
  if(!validDate(date)||!validDate(end_date)||end_date<date||(Date.parse(end_date)-Date.parse(date))/864e5>30)throw new Error('查詢日期範圍必須為 1–31 日');
  if(JSON.stringify(raw).length>3000000)throw new Error('排程資料超過查詢容量');
  for(const [key,cap] of [['employees',500],['machines',1000],['orders',5000],['blocks',10000],['work_assignments',10000],['work_execution',10000],['staff_rosters',24],['transfer_orders',1000]])if((raw[key]||[]).length>cap)throw new Error('排程資料超過查詢容量');
  const all=[];for(let at=Date.parse(date+'T00:00:00Z');at<=Date.parse(end_date+'T00:00:00Z');at+=864e5)all.push(...dailyContext(raw,{date:new Date(at).toISOString().slice(0,10),factory}));
  const kinds=queryKinds(question),names=(raw.employees||[]).filter(e=>e.name?.length>=2&&question.includes(e.name)).map(e=>e.name);
  const relevant=all.filter(f=>f.kind==='summary'||(!kinds||kinds.includes(f.kind))&&(!names.length||names.some(n=>f.text.includes(n))));
  // Prioritize warnings and reports over repetitive work rows; keep dated citations.
  const ranked=[...relevant.filter(f=>f.kind!=='work'),...relevant.filter(f=>f.kind==='work')],facts=ranked.slice(0,100).map((f,i)=>({...f,id:'F'+(i+1)}));
  return {date,endDate:end_date,factory,version:raw.version||0,totalFacts:relevant.length,totalAvailableFacts:all.length,truncated:relevant.length>100,facts,limitations:['只依選定日期範圍及廠別的已保存資料；不含未套用方案。','預排件數不是實際完成量；不保證工單準時或合法。','輪班為草稿；現場回報為最新狀態，非歷史時點。','跨廠流水按所選日截止；不推估運送或點收耗時。']};
}
export function answerFromFacts(question,context){
  const q=question.trim(),kinds=queryKinds(q);
  if(/刪除|修改|套用|幫我排|移動/.test(q))return {engine:'資料查詢（非生成式 AI）',answer:'聊天室目前唯讀，沒有修改任何排程。請使用排程表的預覽與確認功能。',citations:[]};
  const tokens=q.split(/[\s，、？?]+/).filter(t=>t.length>=2);
  const matches=context.facts.filter(f=>tokens.some(t=>f.text.includes(t)));
  const selected=(kinds?context.facts.filter(f=>kinds.includes(f.kind)):matches.length?matches:context.facts).slice(0,12);
  return {engine:'資料查詢（非生成式 AI）',answer:selected.length?selected.map(f=>'['+f.id+'] '+f.date+' · '+f.text).join('\n'):'在這個日期／廠別的已讀資料中沒有找到此類紀錄。這不代表其他日期也沒有；請切換日期後再問。',citations:selected.map(f=>f.id),answerTruncated:(kinds?context.facts.filter(f=>kinds.includes(f.kind)):matches.length?matches:context.facts).length>12};
}

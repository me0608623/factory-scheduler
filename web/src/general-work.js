// Work content, optional physical resource, and assignment are distinct records.
import { factoryOf } from './factory.js';
import { overtimeAllowed } from './overtime.js';
import { assertTransferLink } from './transfers.js';
export const workCatalog=S=>S.workContents||[];
export const assignments=S=>S.workAssignments||[];
export const generalKey=S=>JSON.stringify({contents:workCatalog(S),assignments:assignments(S)});
export const assignmentToDb=a=>({id:a.id,work_id:a.workId,employee_id:a.emp,resource_id:a.resourceId??null,date:a.date,start_min:a.s,end_min:a.e,qty:a.qty??null,order_id:a.orderId??null,note:a.note||'',transfer_batch_id:a.transferBatchId??null,transfer_stage:a.transferStage??null});
export function workWindows(S,date){
  const dow=new Date(date+'T00:00:00Z').getUTCDay(),open=S.cal.over[date]?S.cal.over[date]==='work':S.cal.week[dow];
  if(!open)return [];
  const ot=dow===0||dow===6||!!S.holidays?.[date];
  return [{s:480,e:720,ot},{s:780,e:1020,ot},...(S.dayOT[date]?[{s:1020,e:1200,ot:true}]:[])];
}
export function validateGeneralWork(S,{today=null,baseAssignments=[]}={}){
  assertWorkCatalog(S);const ids=new Set(),byDay=new Map(),base=new Map(baseAssignments.map(a=>[a.id,JSON.stringify(assignmentToDb(a))]));
  for(const b of [...S.blocks,...occupiedWork(S)]){if(!byDay.has(b.date))byDay.set(b.date,[]);byDay.get(b.date).push(b);}
  for(const a of assignments(S)){
    if(!a.id||ids.has(a.id))throw new Error('工作排班代號重複或缺少');ids.add(a.id);
    const historical=!!today&&a.date<today&&base.get(a.id)===JSON.stringify(assignmentToDb(a));
    const issues=assignmentIssues(S,a,workWindows(S,a.date),{peers:byDay.get(a.date)||[],historical,allowInactive:base.get(a.id)===JSON.stringify(assignmentToDb(a))});if(issues.length)throw new Error(issues.join('；'));
  }
}
export function occupiedWork(S) {
  return assignments(S).map(a=>({...a,id:'general:'+a.id,sourceId:a.id,m:a.resourceId,weight:a.resourceId?1:(S.employees.find(e=>e.id===a.emp)?.maxMachines||1)}));
}
export function assignmentIssues(S,a,windows,{today=null,nowMin=0,peers:givenPeers=null,historical=false,allowInactive=false}={}) {
  const issues=[],w=workCatalog(S).find(w=>w.id===a.workId),e=S.employees.find(e=>e.id===a.emp),m=S.machines.find(m=>m.id===a.resourceId);
  if(S.setupPending)issues.push('名冊與工時尚待確認，不能新增排班');
  if(!w||!e)return [...issues,'工作內容或員工不存在'];
  if(w.reviewStatus==='pending'||e.reviewStatus==='pending')issues.push('工作或人員資格待確認');
  if(!w.employeeIds.includes(e.id))issues.push('尚未明確核定此員工可做這項工作');
  if(factoryOf(e)!==factoryOf(w))issues.push('員工與工作內容不在同一廠');
  if(w.requiresResource){
    if(!m||!w.resourceIds.includes(m.id))issues.push('需要指定已核定的設備／工位');
    else if(m.reviewStatus==='pending'||factoryOf(m)!==factoryOf(w)||!e.skills.includes(m.id))issues.push('設備／技能或廠別不符合');
  }else if(a.resourceId!=null)issues.push('純人工工作不應指定設備');
  const date=new Date((a.date||'')+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a.date||'')||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==a.date)issues.push('日期格式不正確');
  if(!Number.isInteger(a.s)||!Number.isInteger(a.e)||a.s<0||a.e>1440||a.s>=a.e)issues.push('工作起訖時間不正確');
  if(a.qty!=null&&(!Number.isInteger(a.qty)||a.qty<0))issues.push('參考件數須為非負整數或留空');
  if(a.orderId&&!S.orders.some(o=>o.id===a.orderId)&&!S.workReferenceOrders?.some(o=>o.id===a.orderId))issues.push('參考工單不存在');
  try{assertTransferLink(S,a,{allowInactive:historical||allowInactive});}catch(e){issues.push(e.message);}
  if(typeof a.note!=='string'||a.note.length>500)issues.push('工作備註須為文字且不超過 500 字');
  if(today&&(a.date<today||a.date===today&&a.s<nowMin))issues.push('不能新增或移到已過去的時段');
  const win=windows.find(w=>a.s>=w.s&&a.e<=w.e);
  if(!historical){
    if(!win)issues.push('跨午休、停工或未開放上班時段');
    if(e.leaves.includes(a.date))issues.push('員工當天請假');
    if(win?.ot&&!overtimeAllowed(e,a.date))issues.push('員工當天不可加班');
    if(m?.faults.some(f=>f.date===a.date&&f.s<a.e&&f.e>a.s))issues.push('設備在此時段故障');
  }
  const peers=(givenPeers||[...S.blocks,...occupiedWork(S)]).filter(b=>!(b.workId&&b.sourceId===a.id)&&b.date===a.date&&b.s<a.e&&b.e>a.s);
  if(a.resourceId&&peers.some(b=>b.m===a.resourceId))issues.push('設備／工位已被其他工作占用');
  const own=peers.filter(b=>b.emp===a.emp),limit=e.maxMachines||1;
  if(!a.resourceId&&own.length||own.some(b=>b.workId&&!b.resourceId))issues.push('純人工工作需要專心執行，不能同時做其他工作');
  else if(a.resourceId){
    const points=[a.s,a.e,...own.flatMap(b=>[Math.max(a.s,b.s),Math.min(a.e,b.e)])].sort((x,y)=>x-y);
    if(points.some((t,i)=>i&&t>points[i-1]&&own.filter(b=>b.s<t&&b.e>points[i-1]).length+1>limit))issues.push('同時設備工作超過員工顧機上限');
  }
  return [...new Set(issues)];
}
export function assertWorkCatalog(S) {
  const ids=new Set();
  for(const w of workCatalog(S)){
    if(!w.id||ids.has(w.id)||!w.name?.trim()||w.name.length>80||![1,2].includes(w.factory)||typeof w.requiresResource!=='boolean'||
      !Array.isArray(w.employeeIds)||!Array.isArray(w.resourceIds)||!['confirmed','pending'].includes(w.reviewStatus)||
      new Set(w.employeeIds).size!==w.employeeIds.length||new Set(w.resourceIds).size!==w.resourceIds.length)throw new Error('工作內容格式不正確或代號重複');
    ids.add(w.id);
    if(w.employeeIds.some(id=>!S.employees.some(e=>e.id===id&&factoryOf(e)===w.factory))||
      w.resourceIds.some(id=>!S.machines.some(m=>m.id===id&&factoryOf(m)===w.factory))||
      !w.requiresResource&&w.resourceIds.length)throw new Error('工作內容含有無效或跨廠人員／設備');
  }
  if(assignments(S).some(a=>!ids.has(a.workId)))throw new Error('已有排班的工作內容不能移除');
}

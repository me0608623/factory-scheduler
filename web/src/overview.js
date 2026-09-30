const dayNumber=date=>Math.round(Date.parse(`${date}T00:00:00Z`)/864e5);

export function orderSignal(order,status,today){
  if(!order?.due||!order?.pid)return 'gray';
  if(status?.k==='done')return 'green';
  if(status?.k==='late'||dayNumber(order.due)<dayNumber(today))return 'red';
  if(status?.k==='part'||status?.k==='elapsed'||dayNumber(order.due)-dayNumber(today)<=1)return 'yellow';
  return 'green';
}

export function orderCounters(orders,statusOf,today){
  const rows=orders.map(order=>{const status=statusOf(order);return {order,status,signal:orderSignal(order,status,today)};});
  return {
    rows,
    unfinished:rows.filter(x=>x.status?.k!=='done').length,
    late:rows.filter(x=>x.signal==='red').length,
    dueToday:rows.filter(x=>x.order.due===today&&x.status?.k!=='done').length,
  };
}

export function productionSummary({blocks=[],execution=[],machines=[]},date,machineIds){
  const allowed=new Set(machineIds||machines.map(x=>x.id));
  const reports=new Map(execution.map(x=>[x.blockId,x]));
  const rows=machines.filter(x=>allowed.has(x.id)).map(machine=>{
    const jobs=blocks.filter(x=>x.date===date&&x.m===machine.id);
    const reported=jobs.filter(x=>reports.has(x.id));
    return {
      machine,
      planned:jobs.reduce((n,x)=>n+(Number(x.qty)||0),0),
      actual:reported.reduce((n,x)=>n+(Number(reports.get(x.id)?.qtyDone)||0),0),
      hasReport:reported.length>0,
      blockIds:jobs.map(x=>x.id),
    };
  });
  return {planned:rows.reduce((n,x)=>n+x.planned,0),rows};
}

export function leaveState(state,employeeId,date){
  const employee=(state.employees||[]).find(x=>x.id===employeeId);
  if(employee?.leaves?.includes(date))return 'leave';
  const request=(state.leaveRequests||[]).find(x=>x.employeeId===employeeId&&x.date===date&&x.status==='pending');
  if(request)return 'asking';
  if(employee?.reviewStatus==='pending')return 'unconfirmed';
  return 'working';
}

export function visibleMemos(state,factoryOf,selectedFactory){
  return [...(state.memos||[])].filter(m=>{
    if(selectedFactory==='all')return true;
    if(m.machineId){const x=(state.machines||[]).find(v=>v.id===m.machineId);return x&&factoryOf(x)===selectedFactory;}
    if(m.employeeId){const x=(state.employees||[]).find(v=>v.id===m.employeeId);return x&&factoryOf(x)===selectedFactory;}
    return true;
  }).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

// 員工手機只呈現同一台設備的「現在」與「下一件」，避免被整張班表淹沒。
export function workerTimeline({blocks=[],execution=[]},employeeId,date,minute){
  const reports=new Map(execution.map(x=>[x.blockId,x]));
  const jobs=blocks.filter(x=>x.emp===employeeId&&x.date===date&&reports.get(x.id)?.status!=='done')
    .sort((a,b)=>a.s-b.s||a.e-b.e||String(a.id).localeCompare(String(b.id)));
  const current=jobs.find(x=>reports.get(x.id)?.status==='running')||jobs.find(x=>x.s<=minute&&minute<x.e)||null;
  const anchor=current||jobs.find(x=>x.s>=minute)||null;
  const machineId=anchor?.m||null;
  const next=anchor?(current?jobs.find(x=>x.m===machineId&&x.s>=current.e&&x.id!==current.id):anchor)||null:null;
  return {current,next,machineId};
}

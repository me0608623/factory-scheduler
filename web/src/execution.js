export const executionOf=(S,id)=>(S.execution||[]).find(r=>r.blockId===id);
export function canReport(role,employeeId,block) {return ['boss','lead'].includes(role)||role==='worker'&&!!employeeId&&employeeId===block.emp;}
export function assertExecutionProtected(before,after) {
  const equal=(a,b)=>['id','oid','step','m','emp','date','s','e','qty','pin'].every(k=>a[k]===b[k]);
  for(const r of before.execution||[]) {
    const old=before.blocks.find(b=>b.id===r.blockId),next=after.blocks.find(b=>b.id===r.blockId);
    if(old&&(!next||!equal(old,next)||!after.employees.some(e=>e.id===old.emp)||
      !after.machines.some(m=>m.id===old.m)||!after.orders.some(o=>o.id===old.oid)))throw new Error('已有現場回報的工作不能移動、改量、解除固定或刪除');
  }
}
export function transitionExecution(S,request,{role='boss',employeeId=null,now=new Date().toISOString(),today=now.slice(0,10)}={}) {
  const {id,blockId,action,qtyDone,expectedRevision}=request;
  if(!id||!['start','quantity','finish'].includes(action)||!Number.isInteger(qtyDone)||qtyDone<0)throw new Error('回報格式不正確');
  const saved=(S.executionEvents||[]).find(e=>e.id===id);
  if(saved) {if(JSON.stringify(saved.request)!==JSON.stringify(request))throw new Error('重送代號不能用於不同回報');return structuredClone(S);}
  const b=S.blocks.find(b=>b.id===blockId),e=b&&S.employees.find(e=>e.id===b.emp),m=b&&S.machines.find(m=>m.id===b.m);
  if(!b||!e||!m||!canReport(role,employeeId,b))throw new Error('沒有權限回報這項工作');
  if(S.setupPending||e.reviewStatus==='pending'||m.reviewStatus==='pending')throw new Error('名冊與工作資料尚待確認，不能回報');
  if(b.date>today)throw new Error('不能提前回報未來日期的工作');
  const old=executionOf(S,blockId),revision=old?.revision||0;
  if(expectedRevision!==revision)throw new Error('進度已被更新，請重新載入');
  if(old?.status==='done')throw new Error('已完成的回報不可再修改');
  if(qtyDone>b.qty||qtyDone<(old?.qtyDone||0))throw new Error('累計件數不可倒退或超過這段原定件數');
  if(action==='start'&&(old||qtyDone!==0)||action!=='start'&&!old)throw new Error('請依開始、累計件數、完成的順序回報');
  if(action==='start') {
    const active=(S.execution||[]).filter(r=>r.status==='running').map(r=>S.blocks.find(b=>b.id===r.blockId)).filter(Boolean);
    if(active.some(x=>x.m===b.m))throw new Error('這台機台已有進行中的工作');
    if(active.filter(x=>x.emp===b.emp).length>=(e.maxMachines||1))throw new Error('進行中的工作已達員工顧機上限');
  }
  const next=structuredClone(S);next.execution ||= [];next.executionEvents ||= [];
  const result={blockId,employeeId:b.emp,status:action==='finish'?'done':'running',qtyDone,
    startedAt:old?.startedAt||now,finishedAt:action==='finish'?now:null,revision:revision+1};
  next.execution=next.execution.filter(r=>r.blockId!==blockId);next.execution.push(result);
  next.blocks.find(x=>x.id===blockId).pin=true;
  next.executionEvents.push({id,request:structuredClone(request),result});
  next.version=(S.version||0)+1;return next;
}

// Cross-factory material ledger. Planned assignments never manufacture receipts.
export const FLOW_ACTIONS={send:'來源廠交出',receive:'加工廠點收',complete:'加工完成',return:'加工廠送回',accept:'回收廠點收'};
export const transferOrders=S=>S.transferOrders||[];
export const transferKey=S=>JSON.stringify(transferOrders(S));
export const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const validTime=t=>typeof t==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)&&validDate(t.slice(0,10))&&+t.slice(11,13)<24&&+t.slice(14,16)<60;
const qty=n=>Number.isSafeInteger(n)&&n>0&&n<=1000000000;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function batchOf(S,id){for(const order of transferOrders(S)){const batch=order.batches.find(b=>b.id===id);if(batch)return {order,batch};}return null;}
export function batchTotals(order,batch,at=null){
  const n={send:0,receive:0,complete:0,return:0,accept:0,scrap:0,rejected:0};
  for(const e of order.events.filter(e=>e.batchId===batch.id&&(!at||e.at<=at))){n[e.action]+=e.qty;if(e.action==='complete')n.scrap+=e.badQty||0;if(e.action==='accept')n.rejected+=e.badQty||0;}
  return n;
}
export function transferSummary(order,today){
  const n=order.batches.reduce((n,b)=>{const t=batchTotals(order,b);for(const k of Object.keys(n))n[k]+=t[k];return n;},{send:0,receive:0,complete:0,return:0,accept:0,scrap:0,rejected:0});
  const warnings=[];if(order.totalQty==null)warnings.push('總數量待確認');if(!order.workIds.length)warnings.push('加工內容待確認');if(!order.due)warnings.push('回廠期限待確認');
  if(order.totalQty!=null&&n.receive<order.totalQty)warnings.push('尚有 '+(order.totalQty-n.receive)+' 件未點收到加工廠');
  if(order.due&&order.due<today&&(order.totalQty==null||n.accept<order.totalQty))warnings.push('回廠逾期');
  const urgentMissing=Math.max(0,(order.urgentQty||0)-n.accept);if(urgentMissing)warnings.push('急用尚缺 '+urgentMissing+' 件'+(order.urgentDue&&order.urgentDue<today?'，已逾期':''));
  let received=0,doneAt=null,urgentAt=null;for(const e of [...order.events].filter(e=>e.action==='accept').sort((a,b)=>a.at.localeCompare(b.at))){received+=e.qty;if(!doneAt&&order.totalQty!=null&&received>=order.totalQty)doneAt=e.at.slice(0,10);if(!urgentAt&&order.urgentQty>0&&received>=order.urgentQty)urgentAt=e.at.slice(0,10);}
  if(doneAt&&order.due&&doneAt>order.due)warnings.push('已結案，但實際回廠逾期');if(urgentAt&&order.urgentDue&&urgentAt>order.urgentDue)warnings.push('急用已回廠，但超過急用期限');
  if(n.scrap||n.rejected)warnings.push('不良／點收差異需處理');
  const status=order.status==='cancelled'?'已取消':order.status==='paused'?'暫停':order.totalQty!=null&&n.accept>=order.totalQty?'已結案':n.accept?'部分回廠':n.return?'回廠途中':n.complete?'待送回':n.receive?'待加工／加工中':n.send?'交料途中':order.totalQty==null||!order.workIds.length?'待確認':'待交料';
  return {...n,status,warnings,urgentMissing};
}
export function transferPlanWarnings(S,a){
  if(!a.transferBatchId)return [];const linked=batchOf(S,a.transferBatchId);if(!linked)return ['跨廠批次不存在'];const {order}=linked,out=[];
  const material=materialWarning(S,a);if(material)out.push(material);
  if(order.status!=='active')out.push('加工單已暫停／取消，請檢查仍保留的預排');
  if(order.due&&a.date>order.due)out.push('此段預排已晚於要求回廠期限；尚未計算運送及點收時間');
  return out;
}
export function materialWarning(S,a){
  if(!a.transferBatchId)return null;const linked=batchOf(S,a.transferBatchId);if(!linked)return '跨廠批次不存在';
  const {order,batch}=linked,stage=a.transferStage||'process',at=a.date+'T'+String(Math.floor(a.s/60)).padStart(2,'0')+':'+String(a.s%60).padStart(2,'0'),tot=batchTotals(order,batch,at);
  // Conservative readiness, not a stock ledger: do not reuse scrapped/returned material.
  const ready=stage==='return'?tot.accept:Math.max(0,tot.receive-tot.scrap-tot.return);
  const earlier=(S.workAssignments||[]).filter(x=>x.id!==a.id&&x.transferBatchId===a.transferBatchId&&(x.transferStage||'process')===stage&&x.workId===a.workId&&
    (x.date<a.date||x.date===a.date&&(x.s<a.s||x.s===a.s&&x.id<a.id))).reduce((n,x)=>n+(x.qty||0),0);
  if(ready<earlier+(a.qty||0))return (stage==='return'?'待回廠點收':tot.return||tot.scrap?'待料：已送回／不良扣除後加工廠可用量不足':'待料：加工廠未點收足量或已被較早預排使用')+'，此段尚缺 '+Math.max(0,earlier+(a.qty||0)-ready)+' 件；不能視為可開工';
  return null;
}
export function assertTransferLink(S,a,{allowInactive=false}={}){
  if(!a.transferBatchId){if(a.transferStage!=null)throw new Error('未連結批次不應指定跨廠階段');return;}
  const linked=batchOf(S,a.transferBatchId),w=(S.workContents||[]).find(w=>w.id===a.workId);if(!linked||!w)throw new Error('跨廠批次或工作內容不存在');
  const {order,batch}=linked,stage=a.transferStage||'process';if(!['process','return'].includes(stage)||!allowInactive&&order.status!=='active')throw new Error('跨廠加工單暫停、取消或階段不正確');
  if(w.factory!==(stage==='return'?order.returnFactory:order.toFactory)||stage==='process'&&!order.workIds.includes(w.id))throw new Error('工作內容不符合此加工單的廠別／加工內容');
  if(!qty(a.qty))throw new Error('連結跨廠批次須填正整數計畫件數');
  const planned=(S.workAssignments||[]).filter(x=>x.id!==a.id&&x.transferBatchId===batch.id&&(x.transferStage||'process')===stage&&x.workId===a.workId).reduce((n,x)=>n+x.qty,0)+a.qty;
  if(planned>batch.plannedQty)throw new Error('同批次、同工作累計排班件數超過批次計畫量');
}
export function validateTransfers(S,{before=null,now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(' ','T')}={}){
  const orders=transferOrders(S),ids=new Set(),batchIds=new Set(),eventIds=new Set(),numbers=new Set();if(orders.length>1000)throw new Error('加工單最多 1000 張');
  if(JSON.stringify(orders).length>2000000||orders.reduce((n,o)=>n+(o.events?.length||0),0)>5000)throw new Error('跨廠紀錄超過本版容量，請先安排封存擴充');
  for(const o of orders){
    if(!text(o.id,100)||ids.has(o.id)||!text(o.code,80)||numbers.has(o.code)||!text(o.itemCode,80)||![1,2].includes(o.fromFactory)||![1,2].includes(o.toFactory)||o.fromFactory===o.toFactory||![1,2].includes(o.returnFactory)||!['active','paused','cancelled'].includes(o.status)||
      o.totalQty!=null&&!qty(o.totalQty)||!Number.isInteger(o.urgentQty)||o.urgentQty<0||o.totalQty==null&&o.urgentQty>0||o.totalQty!=null&&o.urgentQty>o.totalQty||
      !Array.isArray(o.workIds)||new Set(o.workIds).size!==o.workIds.length||!Array.isArray(o.batches)||o.batches.length>200||!Array.isArray(o.events)||o.events.length>2000||typeof o.note!=='string'||o.note.length>500)throw new Error('加工單格式、數量或代號不正確');
    ids.add(o.id);numbers.add(o.code);for(const d of [o.notified,o.expectedSend,o.due,o.urgentDue])if(d!=null&&!validDate(d))throw new Error('加工單日期不正確');
    if(o.workIds.some(id=>!(S.workContents||[]).some(w=>w.id===id&&w.factory===o.toFactory)))throw new Error('加工內容須選加工廠的工作內容');
    let planned=0;const codes=new Set();for(const b of o.batches){if(!text(b.id,100)||batchIds.has(b.id)||!text(b.code,80)||codes.has(b.code)||!qty(b.plannedQty))throw new Error('批次格式或代號重複');batchIds.add(b.id);codes.add(b.code);planned+=b.plannedQty;}
    if(o.totalQty==null&&o.batches.length||o.totalQty!=null&&planned>o.totalQty)throw new Error('批次計畫量不得超過加工單總數量；缺數量時不能開批次');
    const sorted=[...o.events].sort((a,b)=>a.at.localeCompare(b.at));
    const ledger=new Map(o.batches.map(b=>[b.id,{send:0,receive:0,complete:0,return:0,accept:0,scrap:0,rejected:0}]));
    for(const e of sorted){
      if(!text(e.id,100)||eventIds.has(e.id)||!ledger.has(e.batchId)||!Object.hasOwn(FLOW_ACTIONS,e.action)||!validTime(e.at)||!Number.isInteger(e.qty)||e.qty<0||!Number.isInteger(e.badQty)||e.badQty<0||!qty(e.qty+e.badQty)||!['complete','accept'].includes(e.action)&&e.badQty!==0||typeof e.note!=='string'||e.note.length>500)throw new Error('流轉紀錄格式不正確');
      eventIds.add(e.id);const n=ledger.get(e.batchId);n[e.action]+=e.qty;if(e.action==='complete')n.scrap+=e.badQty;if(e.action==='accept')n.rejected+=e.badQty;
      if(e.at>now&&(!before||!transferOrders(before).some(o=>o.events.some(x=>x.id===e.id))))throw new Error('實際流轉不能填未來時間');
      if(n.send>o.batches.find(b=>b.id===e.batchId).plannedQty||n.receive>n.send||n.complete+n.scrap>n.receive||n.return>n.complete||n.accept+n.rejected>n.return)throw new Error('流轉數量／時間超過前一步：先交料、點收、加工完成，再送回與點收');
    }
    const old=before&&transferOrders(before).find(x=>x.id===o.id);
    if(old){for(const e of old.events)if(!o.events.some(x=>x.id===e.id&&JSON.stringify(x)===JSON.stringify(e)))throw new Error('已存流轉紀錄不可刪改；請保留歷史並處理差異');
      if(o.status!=='active'&&o.events.some(e=>!old.events.some(x=>x.id===e.id)))throw new Error('暫停或取消的加工單不能新增流轉');
      if(old.events.length&&['itemCode','fromFactory','toFactory','returnFactory'].some(k=>o[k]!==old[k]))throw new Error('已有流轉不可改品號或廠別');}
  }
  if(before&&transferOrders(before).some(o=>!ids.has(o.id)))throw new Error('加工單不刪除，請改為取消以保留紀錄');
  for(const a of S.workAssignments||[])assertTransferLink(S,a,{allowInactive:!!before&&(before.workAssignments||[]).some(x=>JSON.stringify(x)===JSON.stringify(a))});
}
export function appendFlow(S,orderId,event){
  const next=structuredClone(S),o=transferOrders(next).find(o=>o.id===orderId);if(!o||o.status!=='active')throw new Error('加工單不存在、暫停或取消');
  const old=o.events.find(e=>e.id===event.id);if(old){if(JSON.stringify(old)!==JSON.stringify(event))throw new Error('重送代號不可用於不同流轉');return next;}
  o.events.push(structuredClone(event));validateTransfers(next,{before:S});return next;
}

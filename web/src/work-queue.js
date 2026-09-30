import { factoryOf, inFactory, compatible } from './factory.js';

// Diagnostics are necessary conditions, not a proof that a complete schedule is feasible.
export function workQueue(S, today, factory='all') {
  const rows=[];
  for(const o of S.orders) {
    const p=S.products.find(p=>p.id===o.pid);
    if(!p?.steps?.length) {
      rows.push({oid:o.id,code:o.code,step:null,proc:'待建立工序',remaining:o.qty,planned:0,
        due:o.due,priority:o.pri,reasons:['缺少產品或工序，請由老闆建立'],canArrange:false,overdue:o.due<today});
      continue;
    }
    p.steps.forEach((st,step)=>{
      if(!inFactory(st,factory))return;
      const blocks=S.blocks.filter(b=>b.oid===o.id&&b.step===step);
      const planned=blocks.reduce((n,b)=>n+b.qty,0), remaining=Math.max(0,o.qty-planned);
      const shortfall=blocks.reduce((n,b)=>{
        const r=(S.execution||[]).find(r=>r.blockId===b.id&&r.status==='done');
        return n+(r?Math.max(0,b.qty-r.qtyDone):0);
      },0);
      if(!remaining&&!shortfall&&planned===o.qty)return;
      const reasons=[];
      const machines=S.machines.filter(m=>factoryOf(m)===factoryOf(st)&&m.proc===st.proc&&m.products.includes(p.id));
      const pairs=machines.flatMap(m=>S.employees.filter(e=>compatible(e,m,p,st)).map(e=>({m,e})));
      const confirmed=pairs.filter(({m,e})=>m.reviewStatus!=='pending'&&e.reviewStatus!=='pending');
      if(S.setupPending)reasons.push('名冊、技能及工時待確認，目前不開放排班');
      if(!machines.length)reasons.push('沒有同廠且符合工序／產品的機台');
      else if(!pairs.length)reasons.push('沒有具操作技能的同廠員工');
      else if(!confirmed.length)reasons.push('人員或機台資格待確認');
      if(!Number.isFinite(st.rate)||st.rate<=0)reasons.push('工序速率未設定或不正確');
      if(step>0) {
        const previous=S.blocks.filter(b=>b.oid===o.id&&b.step===step-1).reduce((n,b)=>n+b.qty,0);
        if(previous<Math.min(o.qty,st.batch>0?st.batch:o.qty))reasons.push('前站尚未排足交接批量');
      }
      if(planned>o.qty)reasons.push('已排數量超過工單，需要核對');
      if(shortfall)reasons.push(`已完成回報較原定少 ${shortfall} 件，待主管處理；不自動補排或更改產能`);
      const canArrange=remaining>0&&!S.setupPending&&confirmed.length>0&&Number.isFinite(st.rate)&&st.rate>0;
      if(!reasons.length)reasons.push('已有合格人機；仍須檢查空檔、物料與交期，不代表一定排得進去');
      rows.push({oid:o.id,code:o.code,step,proc:st.proc,factory:factoryOf(st),due:o.due,priority:o.pri,
        planned,remaining,shortfall,reasons,canArrange,overdue:o.due<today});
    });
  }
  return rows.sort((a,b)=>Number(b.overdue)-Number(a.overdue)||a.priority-b.priority||a.due.localeCompare(b.due)||a.code.localeCompare(b.code)||a.step-b.step);
}

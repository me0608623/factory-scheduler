// Read-only projections. Never infer transport times or approved staff presence.
import {transferSummary} from './transfers.js';
const hm=n=>`${n>=1440?'次日 ':''}${String(Math.floor(n%1440/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function ledgerFacts(raw,date,factory,push){
  const scoped=f=>factory==='all'||Number(f)===Number(factory),employees=new Map((raw.employees||[]).map(e=>[e.id,e]));
  const previous=new Date(Date.parse(date+'T00:00:00Z')-864e5).toISOString().slice(0,10);
  const dayTypes={regular:'例假',rest:'休息日',holiday:'假日',leave:'請假',work:'工作日'};
  for(const p of raw.staff_rosters||[])if(scoped(p.factory)&&p.status==='draft'){
    const shifts=new Map((p.shifts||[]).map(s=>[s.id,s])),positions=new Map((p.positions||[]).map(x=>[x.id,x]));
    for(const c of p.cells||[]){
      const s=shifts.get(c.shiftId),e=employees.get(c.emp);
      if(!e||c.date!==date&&!(c.date===previous&&s?.segments?.some(([,b])=>b>1440)))continue;
      push('roster','輪班草稿 '+p.name+' · '+e.name+' · '+c.date+' '+(dayTypes[c.type]||'待確認')+' · '+(s?s.name+' '+s.segments.map(([a,b])=>hm(a)+'–'+hm(b)).join('、'):'未指定班別')+' · '+(positions.get(c.positionId)?.name||'未指定崗位')+'；不是正式產線排班或出勤紀錄',p.id);
    }
    for(const d of p.demands||[])if(d.date===date){
      const s=shifts.get(d.shiftId),pos=positions.get(d.positionId);if(!s||!pos)continue;
      const rows=(p.cells||[]).filter(c=>c.date===date&&c.type==='work'&&c.shiftId===s.id&&c.positionId===pos.id);
      const missing=Math.max(0,d.people-rows.length),minutes=s.segments.reduce((n,[a,b])=>n+b-a,0),capacity=pos.rate==null?null:rows.length*minutes/60*pos.rate;
      const text='輪班草稿 '+p.name+' · '+s.name+'／'+pos.name+'：需求 '+d.people+' 人，草稿填入 '+rows.length+' 人，尚缺 '+missing+' 人；目標 '+d.target+' 件，'+(capacity==null?'產能未設定，不能判斷產量缺口':'名義產能 '+Math.round(capacity*100)/100+' 件（未扣除資格／請假等衝突），不是實際產出');
      push('roster',text,p.id);if(missing||capacity!=null&&capacity<d.target)push('alert',text,p.id);
    }
  }
  for(const o of raw.transfer_orders||[])if([o.fromFactory,o.toFactory,o.returnFactory].some(scoped)&&(!o.notified||o.notified<=date)){
    const copy={...o,events:(o.events||[]).filter(e=>e.at<=date+'T23:59'),batches:o.batches||[],workIds:o.workIds||[]},n=transferSummary(copy,date);
    push('transfer','加工單 '+o.code+' · '+o.itemCode+' · '+o.fromFactory+' 廠→'+o.toFactory+' 廠→'+o.returnFactory+' 廠；截至 '+date+' 已存流水：交出 '+n.send+'、加工廠點收 '+n.receive+'、加工良品 '+n.complete+'、送回 '+n.return+'、回廠合格點收 '+n.accept+' 件；加工不良 '+n.scrap+'、回廠不良 '+n.rejected+' 件；目前單據設定 '+o.status+'；回廠期限 '+(o.due||'待確認')+'。不推估運送／點收耗時',o.id);
    for(const warning of n.warnings)push(/逾期/.test(warning)?'deadline':'material',o.code+'：'+warning+'（按截至所選日的已存流水）',o.id);
  }
}

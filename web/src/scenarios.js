import { toSnapshot, newId } from './convert.js';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function scenarioKey(S) {
  const snap=toSnapshot(S,S.holidays||{});
  // Array ordering is irrelevant for catalogs, but operation order is significant.
  for(const k of ['employees','machines','products','orders','blocks','work_execution','staff_groups','staff_group_members','work_contents','work_assignments','work_reference_orders','transfer_orders','staff_rosters'])
    snap[k].sort((a,b)=>JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
  const execution=[...(S.execution||[])].sort((a,b)=>a.blockId.localeCompare(b.blockId));
  return JSON.stringify(canonical({...snap,execution}));
}
export function makeScenario(name,base,candidate,{description='',date=null}={}) {
  name=name.trim();if(!name||name.length>80)throw new Error('情境名稱須為 1–80 字');
  const clean=s=>{const copy=structuredClone(s);copy.log=[];return copy;};
  const payload={base:clean(base),candidate:clean(candidate),description:String(description).slice(0,500),date};
  validateScenario(payload);
  return {id:newId(),name,payload,created_at:new Date().toISOString()};
}
export function validateScenario(payload) {
  if(JSON.stringify(payload).length>1500000)throw new Error('情境資料太大，請縮小範圍');
  for(const S of [payload?.base,payload?.candidate]) {
    if(!S||!S.cal||!Array.isArray(S.cal.week)||!S.cal.over||!S.dayOT||
      !['employees','machines','products','orders','blocks'].every(k=>Array.isArray(S[k])))throw new Error('情境內容格式不完整');
    const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d));
    const hasId=x=>x&&typeof x.id==='string'&&x.id.length>0;
    if(!S.employees.every(e=>hasId(e)&&typeof e.name==='string'&&Array.isArray(e.skills)&&Array.isArray(e.leaves))||
       !S.machines.every(m=>hasId(m)&&typeof m.label==='string'&&Array.isArray(m.products)&&Array.isArray(m.faults))||
       !S.products.every(p=>hasId(p)&&typeof p.name==='string'&&Array.isArray(p.steps)&&p.steps.every(st=>st&&typeof st.proc==='string'))||
       !S.orders.every(o=>hasId(o)&&typeof o.code==='string'&&S.products.some(p=>p.id===o.pid)&&validDate(o.due)&&Number.isFinite(o.qty)&&o.qty>0)||
       !S.blocks.every(b=>hasId(b)&&validDate(b.date)&&Number.isFinite(b.s)&&Number.isFinite(b.e)&&b.s<b.e&&Number.isFinite(b.qty)&&b.qty>0&&
         S.orders.some(o=>o.id===b.oid&&Number.isInteger(b.step)&&S.products.find(p=>p.id===o.pid)?.steps[b.step])&&
         S.machines.some(m=>m.id===b.m)&&(!b.emp||S.employees.some(e=>e.id===b.emp))))throw new Error('情境資料含有無效資源、工序或工作時段');
  }
}
export function scenarioStale(item,S) {validateScenario(item.payload);return scenarioKey(item.payload.base)!==scenarioKey(S);}

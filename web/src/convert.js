// 畫面用的資料格式（沿用原型的 S） ↔ 排程服務／資料庫的格式
//
// 畫面：employees[{id,name,color,skills,maxMachines,leaves,noOT,otWeekdays,otOverrides}]、machines[{id,label,proc,products,faults[{id,date,s,e,note,fixed,orig}]}]
//       products[{id,name,steps[{proc,rate,batch}]}]、orders[{id,code,pid,qty,due,pri}]
//       blocks[{id,oid,step,m,emp,date,s,e,qty,pin}]、cal{week,over{date:"work"|"off"}}、dayOT{date:true}、log[]

import { overtimeWeekdays } from "./overtime.js";
import { groupCatalog } from "./groups.js";

export const newId = () =>
  globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

export const blockToDb = (b) => {
  const d = { order_id: b.oid, step_seq: b.step, machine_id: b.m, employee_id: b.emp ?? null, date: b.date,
              start_min: b.s, end_min: b.e, qty: b.qty, pinned: !!b.pin };
  if (b.id) d.id = b.id;
  return d;
};
export const blockFromDb = (d) => ({ id: d.id || newId(), oid: d.order_id, step: d.step_seq, m: d.machine_id,
  emp: d.employee_id ?? null, date: d.date, s: d.start_min, e: d.end_min, qty: d.qty, pin: !!d.pinned });

// ---------- 畫面 → 排程服務的快照 ----------
export function toSnapshot(S, holidays = {}) {
  return {
    version: S.version || 0,
    setup_pending: !!S.setupPending,
    work_contents: structuredClone(S.workContents||[]),
    work_assignments: structuredClone(S.workAssignments||[]),
    work_reference_orders: structuredClone(S.workReferenceOrders||[]),
    transfer_orders: structuredClone(S.transferOrders||[]),
    staff_groups: groupCatalog(S).groups,
    staff_group_members: groupCatalog(S).members,
    calendar: {
      week: [...S.cal.week],
      overrides: Object.fromEntries(Object.entries(S.cal.over || {}).map(([d, v]) => [d, v === "work"])),
      overtime: { ...(S.dayOT || {}) },
      holidays: { ...holidays },
    },
    employees: S.employees.map((e) => ({ id: e.id, name: e.name, factory: e.factory || 1, color: e.color || 0, skills: [...e.skills],
      max_concurrent_machines: e.maxMachines || 1, review_status: e.reviewStatus || 'confirmed', source_ref: e.sourceRef || null,
      source_employee_code: e.sourceCode || null, source_notes: e.sourceNotes || null,
      catalog_sources: e.catalogSources || [], identity_candidates: e.identityCandidates || [],
      leaves: [...e.leaves], no_overtime: !!e.noOT, overtime_weekdays: overtimeWeekdays(e),
      overtime_overrides: { ...(e.otOverrides || {}) } })),
    machines: S.machines.map((m) => ({ id: m.id, label: m.label, factory: m.factory || 1, process: m.proc, products: [...m.products], review_status: m.reviewStatus || 'confirmed', source_ref: m.sourceRef || null,
      catalog_group: m.catalogGroup || null, catalog_side: m.catalogSide || null,
      faults: m.faults.map((f) => ({ id: f.id || null, date: f.date, start: f.s, end: f.e, note: f.note || null,
        fixed: !!f.fixed, original_blocks: (f.orig || []).map(blockToDb) })) })),
    products: S.products.map((p) => ({ id: p.id, name: p.name,
      steps: p.steps.map((s) => ({ process: s.proc, factory: s.factory || 1, rate: +s.rate, batch: +s.batch || 0 })) })),
    orders: S.orders.map((o) => ({ id: o.id, code: o.code, product: o.pid, qty: o.qty, due: o.due, priority: o.pri })),
    blocks: S.blocks.map((b) => ({ id: b.id, order: b.oid, step: b.step, machine: b.m, employee: b.emp ?? null,
      date: b.date, start: b.s, end: b.e, qty: b.qty, pinned: !!b.pin })),
  };
}

// ---------- 資料庫快照（schedule_snapshot()）→ 畫面 ----------
export function fromSnapshot(snap) {
  const c = snap.calendar || {};
  const over = {};
  for (const [d, open] of Object.entries(c.overrides || {})) over[d] = open ? "work" : "off";
  return {
    v: 1, demo: false, version: snap.version || 0, setupPending: !!snap.setup_pending,
    execution: snap.work_execution || [],
    workContents: snap.work_contents||[],workAssignments:snap.work_assignments||[],workReferenceOrders:snap.work_reference_orders||[],
    transferOrders:snap.transfer_orders||[],
    groups: (snap.staff_groups || []).map(g=>({id:g.id,name:g.name,department:g.department||null,homeFactory:g.home_factory??null,sourceRef:g.source_ref||null})),
    groupMembers: (snap.staff_group_members || []).map(m=>({groupId:m.group_id,employeeId:m.employee_id,reviewStatus:m.review_status,sourceRef:m.source_ref||null})),
    cal: { week: c.week || [false, true, true, true, true, true, true], over },
    dayOT: { ...(c.overtime || {}) },
    holidays: { ...(c.holidays || {}) },
    employees: (snap.employees || []).map((e) => ({ id: e.id, name: e.name, factory: e.factory || 1, color: e.color || 0, skills: [...e.skills],
      maxMachines: e.max_concurrent_machines || 1, reviewStatus: e.review_status || 'confirmed', sourceRef: e.source_ref || null,
      sourceCode: e.source_employee_code || null, sourceNotes: e.source_notes || null,
      catalogSources: e.catalog_sources || [], identityCandidates: e.identity_candidates || [],
      leaves: [...(e.leaves || [])], noOT: !!e.no_overtime,
      otWeekdays: Array.isArray(e.overtime_weekdays) ? e.overtime_weekdays : e.no_overtime ? [] : [0,1,2,3,4,5,6],
      otOverrides: { ...(e.overtime_overrides || {}) } })),
    machines: (snap.machines || []).map((m) => ({ id: m.id, label: m.label, factory: m.factory || 1, proc: m.process, products: [...m.products], reviewStatus: m.review_status || 'confirmed', sourceRef: m.source_ref || null,
      catalogGroup: m.catalog_group || null, catalogSide: m.catalog_side || null,
      faults: (m.faults || []).map((f) => ({ id: f.id, date: f.date, s: f.start, e: f.end, note: f.note || "",
        fixed: !!f.fixed, fixedAt: f.fixed_at || null, orig: (f.original_blocks || []).map(blockFromDb) })) })),
    products: (snap.products || []).map((p) => ({ id: p.id, name: p.name,
      steps: p.steps.map((s) => ({ proc: s.process, factory: s.factory || 1, rate: +s.rate, batch: +s.batch || 0 })) })),
    orders: (snap.orders || []).map((o) => ({ id: o.id, code: o.code, pid: o.product, qty: o.qty, due: o.due, pri: o.priority })),
    blocks: (snap.blocks || []).map((b) => ({ id: b.id, oid: b.order, step: b.step, m: b.machine, emp: b.employee ?? null,
      date: b.date, s: b.start, e: b.end, qty: b.qty, pin: !!b.pinned })),
    log: [],
  };
}

// ---------- 排程服務的方案 → 套用後的畫面資料（預覽用） ----------
export function applyOption(base, opt) {
  const S = JSON.parse(JSON.stringify(base));
  const eff = opt.effects || {};
  for (const o of eff.orders_upsert || []) {
    const row = { id: o.id, code: o.code, pid: o.product_id, qty: o.qty, due: o.due_date, pri: o.priority ?? 2 };
    const i = S.orders.findIndex((x) => x.id === o.id);
    if (i >= 0) S.orders[i] = row; else S.orders.push(row);
  }
  for (const f of eff.faults_insert || []) {
    const m = S.machines.find((x) => x.id === f.machine_id);
    if (m) m.faults.push({ id: f.id, date: f.date, s: f.start_min, e: f.end_min, note: f.note || "", fixed: false,
      orig: (f.original_blocks || []).map(blockFromDb) });
  }
  for (const u of eff.faults_update || []) {
    for (const m of S.machines) for (const f of m.faults) if (f.id === u.id) {
      if (u.end_min != null) f.e = u.end_min;
      if (u.fixed_at) { f.fixed = true; f.fixedAt = u.fixed_at; }
    }
  }
  for (const id of eff.faults_delete || []) for (const m of S.machines) m.faults = m.faults.filter((f) => f.id !== id);
  for (const l of eff.leaves_insert || []) {
    const e = S.employees.find((x) => x.id === l.employee_id);
    if (e && !e.leaves.includes(l.date)) e.leaves.push(l.date);
  }
  for (const d of eff.overtime_on || []) S.dayOT[d] = true;
  S.blocks = (opt.blocks || []).map(blockFromDb);
  return S;
}

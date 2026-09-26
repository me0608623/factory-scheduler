// 把畫面資料拆成資料表的列，再比較前後差異 → 只寫入真的有變的列

import { blockToDb } from "../convert.js";
import { overtimeWeekdays } from "../overtime.js";

export const PROCS_ALL = ["裁切", "沖壓", "焊接", "組裝", "包裝"];

// 每個資料表的主鍵（upsert 衝突判斷、刪除條件都用它）
export const TABLE_KEYS = {
  processes: ["name"], employees: ["id"], employee_skills: ["employee_id", "machine_id"], leaves: ["employee_id", "date"],
  employee_overtime_days: ["employee_id", "date"],
  machines: ["id"], machine_products: ["machine_id", "product_id"], machine_faults: ["id"], products: ["id"],
  product_steps: ["product_id", "seq"], orders: ["id"], calendar_weekly: ["weekday"], calendar_days: ["date"],
};
// 先寫上層再寫下層；刪除時反過來
export const UPSERT_ORDER = ["processes", "employees", "machines", "products", "product_steps", "employee_skills",
  "machine_products", "orders", "calendar_weekly", "calendar_days", "leaves", "employee_overtime_days", "machine_faults"];
export const DELETE_ORDER = ["machine_faults", "employee_overtime_days", "leaves", "machine_products", "employee_skills", "product_steps",
  "orders", "products", "machines", "employees", "calendar_days"];

export function rowsOf(S) {
  const t = {};
  const put = (table, key, row) => { (t[table] ||= new Map()).set(key, row); };
  const procs = new Set([...PROCS_ALL, ...S.machines.map((m) => m.proc), ...S.products.flatMap((p) => p.steps.map((s) => s.proc))]);
  for (const p of procs) put("processes", p, { name: p });
  for (const e of S.employees) {
    const weekdays=overtimeWeekdays(e);
    put("employees", e.id, { id: e.id, name: e.name, color: e.color || 0, no_overtime: weekdays.length===0,
      overtime_weekdays: weekdays });
    for (const m of e.skills) put("employee_skills", e.id + "|" + m, { employee_id: e.id, machine_id: m });
    for (const d of e.leaves) put("leaves", e.id + "|" + d, { employee_id: e.id, date: d });
    for (const [d, available] of Object.entries(e.otOverrides || {}))
      put("employee_overtime_days", e.id + "|" + d, { employee_id: e.id, date: d, available: !!available });
  }
  for (const m of S.machines) {
    put("machines", m.id, { id: m.id, label: m.label, process: m.proc });
    for (const p of m.products) put("machine_products", m.id + "|" + p, { machine_id: m.id, product_id: p });
    for (const f of m.faults) {
      put("machine_faults", f.id, { id: f.id, machine_id: m.id, date: f.date, start_min: f.s, end_min: f.e, note: f.note || null,
        fixed_at: f.fixed ? f.fixedAt || null : null, original_blocks: (f.orig || []).map(blockToDb) });
    }
  }
  for (const p of S.products) {
    put("products", p.id, { id: p.id, name: p.name });
    p.steps.forEach((s, i) => put("product_steps", p.id + "|" + i,
      { product_id: p.id, seq: i, process: s.proc, rate: +s.rate, transfer_batch: +s.batch || 0 }));
  }
  for (const o of S.orders) {
    put("orders", o.id, { id: o.id, code: o.code, product_id: o.pid, qty: o.qty, due_date: o.due, priority: o.pri });
  }
  S.cal.week.forEach((v, i) => put("calendar_weekly", String(i), { weekday: i, is_open: !!v }));
  const over = S.cal.over || {}, ot = S.dayOT || {};
  for (const d of new Set([...Object.keys(over), ...Object.keys(ot).filter((x) => ot[x])])) {
    put("calendar_days", d, { date: d, is_open: over[d] ? over[d] === "work" : null, overtime: !!ot[d] });
  }
  return t;
}

export function diffRows(a, b) {
  const out = {};
  for (const table of new Set([...Object.keys(a || {}), ...Object.keys(b)])) {
    const A = (a && a[table]) || new Map(), B = b[table] || new Map();
    const upsert = [], del = [];
    for (const [k, row] of B) {
      const old = A.get(k);
      if (!old || JSON.stringify(old) !== JSON.stringify(row)) upsert.push(row);
    }
    for (const [k, row] of A) if (!B.has(k)) del.push(row);
    if (upsert.length || del.length) out[table] = { upsert, del };
  }
  return out;
}

export const blocksKey = (S) =>
  JSON.stringify(S.blocks.map(blockToDb).sort((x, y) => String(x.id).localeCompare(String(y.id))));

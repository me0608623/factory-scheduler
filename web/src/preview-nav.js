// 互動式手動排班預覽：階層導航狀態機與顯示模型。
// 純邏輯、無 DOM／無全域——所有檢視操作只讀 proposal，不碰正式排程。
// app.js 負責渲染與 data-act 佈線；本模組產生「要顯示什麼」。
import { effectiveBlockQty } from './manual.js';

/* ----- 日期／時間小工具（與 app.js 同規則的純實作） ----- */
const DAYMS = 86400000;
export const pvDayNum = ds => Math.round(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) / DAYMS);
export const pvAbsOf = (ds, m) => pvDayNum(ds) * 1440 + m;
export const pvDateOfAbs = a => {
  const d = new Date(Math.floor(a / 1440) * DAYMS);
  const p = n => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
};
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const pad2 = n => String(n).padStart(2, "0");
export const pvHm = m => pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
export const pvMd = ds => +ds.slice(5, 7) + "/" + +ds.slice(8, 10);
export const pvMdw = ds => pvMd(ds) + "（" + WD[new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10))).getUTCDay()] + "）";

/* ===== 導航狀態機 =====
   view：overview｜suggestion-detail｜impact-list｜impact-detail｜due-list｜due-detail｜schedule-compare
   sel：{key:"oid|si"} 或 {oid:"…"}；stack 保存返回時要還原的快照 */
export const DP_VIEWS = ["overview", "suggestion-detail", "impact-list", "impact-detail", "due-list", "due-detail", "schedule-compare"];

export function newNav() { return { view: "overview", sel: null, stack: [] }; }

export function navPush(nav, view, sel, snap = {}) {
  if (!DP_VIEWS.includes(view)) throw new Error("未知的預覽檢視：" + view);
  nav.stack.push({ view: nav.view, sel: nav.sel, date: snap.date ?? null, scrollY: snap.scrollY ?? null,
    scrollLeft: snap.scrollLeft ?? null, factory: snap.factory ?? null, boardView: snap.boardView ?? null, mode: snap.mode ?? null });
  nav.view = view; nav.sel = sel ?? null;
  return nav;
}

// 返回上一層；回傳要還原的快照（頂層時回到 overview）
export function navBack(nav) {
  const prev = nav.stack.length ? nav.stack.pop() : { view: "overview", sel: null, date: null, scrollY: null };
  nav.view = prev.view; nav.sel = prev.sel;
  return { ...prev };
}

/* ===== 顯示模型 ===== */

export const opKey = op => op.oid + "|" + op.si;

// 一段工作方塊的摘要文字（日期＋時段＋機台）
function segTxt(b) { return pvMdw(b.date) + " " + pvHm(b.s) + "–" + pvHm(b.e) + " · " + b.m + " 機台"; }
export function pvRangeTxt(blocks) {
  if (!blocks || !blocks.length) return "未排入";
  const a = blocks[0], z = blocks[blocks.length - 1];
  return pvMdw(a.date) + " " + pvHm(a.s) + " → " + (z.date !== a.date ? pvMdw(z.date) + " " : "") + pvHm(z.e) + " · " + a.m + " 機台" + (blocks.length > 1 ? "（" + blocks.length + " 段）" : "");
}

const uniq = xs => [...new Set(xs)];
const empsOf = blocks => uniq(blocks.map(b => b.emp).filter(Boolean));
const machsOf = blocks => uniq(blocks.map(b => b.m).filter(Boolean));
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// 工序變動模型：順延建議與連帶影響共用
export function opModel(P, op) {
  const prev = op.prev || [], next = op.next || [];
  const pb = prev.length ? pvAbsOf(prev[0].date, prev[0].s) : null;
  const nb = next.length ? pvAbsOf(next[0].date, next[0].s) : null;
  const pe = empsOf(prev), ne = empsOf(next);
  const pm = machsOf(prev), nm = machsOf(next);
  const dates = uniq([...prev, ...next].map(b => b.date)).sort();
  return {
    key: opKey(op), oid: op.oid, code: op.code, si: op.si, step: op.step,
    prev, next,
    prevTxt: pvRangeTxt(prev), nextTxt: pvRangeTxt(next),
    prevSegs: prev.map(segTxt), nextSegs: next.map(segTxt),
    startDelta: pb != null && nb != null ? nb - pb : null,
    split: next.length > 1 || prev.length > 1,
    crossDay: dates.length > 1,
    empChanged: !sameSet(pe, ne),
    prevEmps: pe, nextEmps: ne,
    machChanged: !sameSet(pm, nm),
    gone: !next.length, added: !prev.length,
    dates,
  };
}

const findOp = (P, key) => (P.ops || []).find(o => opKey(o) === key);

// 「建議順延」＝被目標時段直接擠走的工作（P.direct → 對應 op）
export function suggestList(P) {
  const out = [];
  const seen = new Set();
  for (const b of P.direct || []) {
    const op = (P.ops || []).find(o => o.oid === b.oid && o.si === b.step && (o.prev || []).some(x => x.id === b.id));
    if (op && !seen.has(opKey(op))) { seen.add(opKey(op)); out.push(opModel(P, op)); }
  }
  return out;
}

// 「連帶影響」＝非直接擠走、也非目標本體的其他變動工序
export function impactList(P) {
  const sug = new Set(suggestList(P).map(x => x.key));
  return (P.ops || [])
    .filter(o => ![...(o.prev || []), ...(o.next || [])].some(b => b.id === P.oldId))
    .filter(o => !sug.has(opKey(o)))
    .map(o => opModel(P, o))
    .sort((a, b) => (a.startDelta ?? Infinity) - (b.startDelta ?? Infinity) || a.code.localeCompare(b.code));
}

// 受影響工單的交期（before / after 對照）
export function dueList(P) {
  return (P.statuses || []).map(s => {
    const d = s.finish && s.finishB ? pvDayNum(s.finish) - pvDayNum(s.finishB) : null;
    return {
      ...s,
      deltaDays: d,
      late: s.status === "late",
      unfinished: s.status === "part" || s.status === "none",
      bad: ["late", "part", "none"].includes(s.status),
    };
  }).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}

// 單道工序詳情（suggestion-detail 與 impact-detail 共用）
export function opDetail(P, key) {
  const op = findOp(P, key);
  if (!op) return null;
  const m = opModel(P, op);
  const st = (P.after || { orders: [] }).orders || [];
  const o = st.find(x => x.id === op.oid);
  const due = (P.statuses || []).find(s => s.oid === op.oid) || null;
  // 相依：同張工單其他受影響工序（依工序順序）
  const rel = (P.ops || [])
    .filter(x => x.oid === op.oid && opKey(x) !== key)
    .map(x => opModel(P, x))
    .sort((a, b) => a.si - b.si);
  // 原因：系統調整紀錄中提到這張工單＋這道工序的行
  const codeM = op.code;
  const reasons = (P.lines || []).filter(l => l && typeof l.t === "string" && l.t.includes(codeM + " " + op.step))
    .map(l => l.t);
  return {
    ...m,
    order: o ? { code: o.code, qty: o.qty, due: o.due, pri: o.pri } : null,
    due,
    rel,
    reasons: reasons.length ? reasons : null,
    reasonFallback: [...m.prev, ...m.next].some(b => b.id === P.oldId)
      ? "使用者手動調整這道工序的位置或工作長度。"
      : m.gone
      ? "調整後這道工序沒有可用的時段，暫時未排入。"
      : m.added
        ? "這是調整後新排入的工序。"
        : m.startDelta == null
          ? "此工序位置有變動；尚未能確定更詳細的原因，可對照前後位置判斷。"
          : null,
  };
}

// 每道工序的排程數量（純計算，供「未排完」判斷）
function stepQty(blocks, oid, si, execution) {
  return blocks.filter(b => b.oid === oid && b.step === si).reduce((a, b) => a + effectiveBlockQty(b,execution), 0);
}

// 工單交期詳情
export function dueDetail(P, oid) {
  const s = (P.statuses || []).find(x => x.oid === oid);
  const o = ((P.after || {}).orders || []).find(x => x.id === oid);
  if (!s || !o) return null;
  const p = ((P.after || {}).products || []).find(x => x.id === o.pid);
  const steps = (p && p.steps) || [];
  const baseBlocks = ((P.B || {}).blocks) || [];
  const afterBlocks = ((P.after || {}).blocks) || [];
  const execution = P.after?.execution || [];
  const stepRows = steps.map((st2, si) => {
    const prev = baseBlocks.filter(b => b.oid === oid && b.step === si).sort((a, b) => pvAbsOf(a.date, a.s) - pvAbsOf(b.date, b.s));
    const next = afterBlocks.filter(b => b.oid === oid && b.step === si).sort((a, b) => pvAbsOf(a.date, a.s) - pvAbsOf(b.date, b.s));
    const changed = JSON.stringify(prev.map(b => [b.date, b.s, b.e, b.m])) !== JSON.stringify(next.map(b => [b.date, b.s, b.e, b.m]));
    return {
      si, proc: st2.proc, prevTxt: pvRangeTxt(prev), nextTxt: pvRangeTxt(next),
      qty: stepQty(afterBlocks, oid, si, execution), changed, gone: !next.length,
      unfinished: stepQty(afterBlocks, oid, si, execution) < o.qty,
    };
  });
  const affectedOps = (P.ops || []).filter(x => x.oid === oid).map(x => opModel(P, x));
  const reasons = (P.lines || []).filter(l => l && typeof l.t === "string" && l.t.includes(o.code)).map(l => l.t);
  return {
    oid, code: o.code, qty: o.qty, due: o.due, pri: o.pri,
    productName: p ? p.name : null,
    status: s.status, finish: s.finish || null, finishB: s.finishB || null,
    deltaDays: s.finish && s.finishB ? pvDayNum(s.finish) - pvDayNum(s.finishB) : null,
    late: s.status === "late",
    unfinished: s.status === "part" || s.status === "none",
    done: s.status === "done",
    stepRows, affectedOps, reasons: reasons.length ? reasons : null,
  };
}

// 排程表定位目標：選中工序的日期／機台／方塊 id（含全部段落，跨日跨機都能定）
export function boardTarget(P, key) {
  const det = opDetail(P, key);
  if (!det) return null;
  return {
    date: det.next.length ? det.next[0].date : det.prev[0]?.date || null,
    nextIds: det.next.map(b => b.id),
    prevSegs: det.prev.map(b => ({ id: b.id, date: b.date, m: b.m })),
    machines: uniq([...det.prev, ...det.next].map(b => b.m)),
    dates: det.dates,
  };
}

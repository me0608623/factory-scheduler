import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newNav, navPush, navBack, DP_VIEWS, opKey,
  suggestList, impactList, dueList, opDetail, dueDetail, boardTarget,
  pvAbsOf, pvDateOfAbs, pvHm,
} from '../src/preview-nav.js';

/* ----- 測試資料：模擬一次「B05 裁切拖曳 → B05 順延、B02 連帶、交期變化」 ----- */
const mk = (id, oid, step, date, s, e, m, emp, qty) => ({ id, oid, step, date, s, e, m, emp, qty });

const B = { // 原本
  orders: [
    { id: 'oB02', code: 'B02', pid: 'p1', qty: 100, due: '2026-10-14', pri: 2 },
    { id: 'oB05', code: 'B05', pid: 'p2', qty: 50, due: '2026-10-18', pri: 1 },
  ],
  products: [
    { id: 'p1', name: '支架', steps: [{ proc: '焊接' }, { proc: '包裝' }] },
    { id: 'p2', name: '底座', steps: [{ proc: '裁切' }, { proc: '電鍍' }] },
  ],
  blocks: [
    mk('k1', 'oB02', 0, '2026-10-12', 480, 600, 'a', 'e1', 40), // B02 焊接 原本 10/12 08:00-10:00 a 機
    mk('k2', 'oB02', 1, '2026-10-13', 480, 540, 'e', 'e2', 100), // B02 包裝（不變）
    mk('k3', 'oB05', 0, '2026-10-12', 600, 660, 'a', 'e1', 30), // B05 裁切 原本 10/12 10:00-11:00（被擠走 → 順延）
    mk('k4', 'oB05', 1, '2026-10-14', 480, 540, 'f', 'e3', 20), // B05 電鍍 原本
  ],
};
const A = { // 調整後：B02 焊接拖到 10/12 13:00（k1 移動）；B05 裁切被推到隔天並拆兩段；B05 電鍍跟著順延
  ...B,
  blocks: [
    mk('k1', 'oB02', 0, '2026-10-12', 780, 900, 'a', 'e4', 40), // 移到 13:00-15:00、換人 e1→e4
    mk('k2', 'oB02', 1, '2026-10-13', 480, 540, 'e', 'e2', 100),
    mk('k5', 'oB05', 0, '2026-10-13', 480, 510, 'a', 'e1', 15), // 順延段 1（隔天）
    mk('k6', 'oB05', 0, '2026-10-13', 540, 570, 'b', 'e5', 15), // 順延段 2（同日另一台機 → 跨機）
    mk('k7', 'oB05', 1, '2026-10-15', 480, 540, 'f', 'e3', 20), // 電鍍跟著順延一天
  ],
};
const prevB02 = B.blocks.filter(b => b.oid === 'oB02' && b.step === 0);
const nextB02 = A.blocks.filter(b => b.oid === 'oB02' && b.step === 0);
const prevB05cut = B.blocks.filter(b => b.oid === 'oB05' && b.step === 0);
const nextB05cut = A.blocks.filter(b => b.oid === 'oB05' && b.step === 0);
const prevB05plat = B.blocks.filter(b => b.oid === 'oB05' && b.step === 1);
const nextB05plat = A.blocks.filter(b => b.oid === 'oB05' && b.step === 1);
const P = {
  base: JSON.stringify(B), B, after: A,
  oldId: 'k1', isNew: false,
  direct: [B.blocks[2]], // k3：被目標時段直接擠走的 B05 裁切
  ops: [
    { oid: 'oB02', code: 'B02', si: 0, step: '焊接', prev: prevB02, next: nextB02 },
    { oid: 'oB05', code: 'B05', si: 0, step: '裁切', prev: prevB05cut, next: nextB05cut },
    { oid: 'oB05', code: 'B05', si: 1, step: '電鍍', prev: prevB05plat, next: nextB05plat },
  ],
  statuses: [
    { oid: 'oB02', code: 'B02', due: '2026-10-14', status: 'ok', finish: '2026-10-13', statusB: 'ok', finishB: '2026-10-13' },
    { oid: 'oB05', code: 'B05', due: '2026-10-18', status: 'late', finish: '2026-10-19', statusB: 'ok', finishB: '2026-10-17' },
  ],
  lines: [
    { k: 'chain', t: 'B05 裁切 30件：跟著前站延後 → 10/13（二）08:00 a 機台' },
    { k: 'late', t: 'B05 會延誤：預計 10/19（一）完成，期限 10/18（日）' },
  ],
  problems: [], unpinned: [],
  move: { id: 'k1', date: '2026-10-12', m: 'a', s: 780, e: 900 },
  source: 'a 10/12（一）08:00–10:00', target: 'a 10/12（一）13:00–15:00',
  movedLabel: 'B02 焊接 40件', remaining: 0,
};

test('導航狀態機：push 保存快照、back 逐層還原', () => {
  const nav = newNav();
  assert.equal(nav.view, 'overview');
  // snap＝「離開當下」的畫面狀態（與 dp-nav 先存快照再切換一致）
  navPush(nav, 'impact-list', null, { date: '2026-10-12', scrollY: 300 });        // 離開 overview
  navPush(nav, 'impact-detail', { key: 'oB05|0' }, { date: '2026-10-12', scrollY: 300 }); // 離開 impact-list（仍在 10/12）
  navPush(nav, 'schedule-compare', { key: 'oB05|0' }, { date: '2026-10-13', scrollY: 120 }); // 詳情頁已定位到 10/13
  assert.equal(nav.view, 'schedule-compare');
  let r = navBack(nav); // compare → impact-detail
  assert.deepEqual([r.view, r.sel.key, r.date, r.scrollY], ['impact-detail', 'oB05|0', '2026-10-13', 120]);
  r = navBack(nav); // impact-detail → impact-list
  assert.deepEqual([r.view, r.date, r.scrollY], ['impact-list', '2026-10-12', 300]);
  assert.equal(nav.sel, null, '返回列表層時清空選取');
  r = navBack(nav); // impact-list → overview
  assert.equal(r.view, 'overview');
  assert.equal(nav.stack.length, 0);
  r = navBack(nav); // 頂層再按返回：停留在 overview
  assert.equal(r.view, 'overview');
});

test('導航狀態機：未知 view 拒絕', () => {
  const nav = newNav();
  assert.throws(() => navPush(nav, 'no-such-view', null), /未知的預覽檢視/);
  assert.ok(DP_VIEWS.includes('suggestion-detail') && DP_VIEWS.includes('due-detail'));
});
test('返回還原廠別、日週模式、對照模式與水平捲動',()=>{
  const n=newNav();navPush(n,'due-detail',{oid:'oB02'},{date:'2026-10-12',factory:'f2',boardView:'week',mode:'orig',scrollLeft:360,scrollY:500});
  const r=navBack(n);assert.deepEqual([r.factory,r.boardView,r.mode,r.scrollLeft,r.scrollY],['f2','week','orig',360,500]);
});
test('工序原因不誤用同張工單其他工序的順延紀錄',()=>{
  const q={...P,lines:[{t:'B02 包裝：跟著前站延後'}]};
  const detail=opDetail(q,'oB02|0');assert.equal(detail.reasons,null);assert.match(detail.reasonFallback,/使用者手動/);
});

test('建議順延＝被直接擠走的工作；連帶影響排除建議與目標本體', () => {
  const sug = suggestList(P);
  assert.deepEqual(sug.map(x => x.key), ['oB05|0'], 'k3（B05 裁切）的 op 進建議順延');
  const imp = impactList(P);
  assert.deepEqual(imp.map(x => x.key), ['oB05|1'], 'B05 電鍍＝連帶；B02 焊接（目標本體）不出現');
});

test('工序模型：跨日、多段、換人、跨機、時間差都算得出來', () => {
  const sug = suggestList(P)[0]; // B05 裁切：10/12 10:00 單段 → 10/13 兩段（a/b 兩台機）
  assert.equal(sug.split, true, '調整後兩段');
  assert.equal(sug.crossDay, true, '10/12 → 10/13 跨日');
  assert.equal(sug.startDelta, pvAbsOf('2026-10-13', 480) - pvAbsOf('2026-10-12', 600), '順延 22 小時');
  assert.equal(sug.empChanged, true, '段 2 換了 e5');
  assert.equal(sug.machChanged, true, '跨 a/b 兩台機');
  assert.ok(sug.nextTxt.includes('2 段'), '多段文字標註段數：' + sug.nextTxt);
  assert.deepEqual(sug.dates, ['2026-10-12', '2026-10-13'], '含全部段落日期');
  const target = opDetail(P, 'oB02|0');
  assert.equal(target.empChanged, true, '目標工序 e1 → e4');
  assert.equal(target.startDelta, 300, '08:00 → 13:00 同日順延 300 分');
});

test('工序詳情：原因取自 lines、相依與交期關聯正確', () => {
  const det = opDetail(P, 'oB05|0');
  assert.ok(det.reasons.some(t => t.includes('B05 裁切')), 'reasons 含系統調整說明');
  assert.deepEqual(det.rel.map(x => x.key), ['oB05|1'], '同單相依＝後站電鍍');
  assert.equal(det.due.code, 'B05', '交期關聯到 B05');
  assert.equal(det.order.due, '2026-10-18');
  assert.equal(opDetail(P, 'nope|9'), null, '未知 key 回 null');
});

test('交期列表：逾期/未排完/天數差', () => {
  const list = dueList(P);
  assert.equal(list.length, 2);
  const b05 = list.find(x => x.code === 'B05');
  assert.equal(b05.late, true);
  assert.equal(b05.deltaDays, 2, '10/17 → 10/19 晚兩天');
  const b02 = list.find(x => x.code === 'B02');
  assert.equal(b02.bad, false);
  assert.equal(b02.deltaDays, 0, '完成日不變');
});

test('交期詳情：各工序前後位置與未排完判定', () => {
  const det = dueDetail(P, 'oB05');
  assert.equal(det.productName, '底座');
  assert.equal(det.finish, '2026-10-19');
  assert.equal(det.finishB, '2026-10-17');
  const cut = det.stepRows.find(r => r.proc === '裁切');
  assert.equal(cut.changed, true);
  assert.equal(cut.qty, 30, '15+15 兩段合計');
  assert.equal(cut.unfinished, true, '30 < 工單 50 → 尚未排完');
  const plat = det.stepRows.find(r => r.proc === '電鍍');
  assert.equal(plat.changed, true, '跟著前站順延也算變動');
  assert.deepEqual(det.affectedOps.map(x => x.key), ['oB05|0', 'oB05|1']);
  assert.equal(dueDetail(P, 'nope'), null);
});
test('交期詳情採完工回報件數，短少不可被原定數量蓋掉',()=>{
  const q={...P,after:{...A,execution:[{blockId:'k5',status:'done',qtyDone:5},{blockId:'k6',status:'running',qtyDone:3}]}};
  const cut=dueDetail(q,'oB05').stepRows[0];assert.equal(cut.qty,20);assert.equal(cut.unfinished,true);
});

test('boardTarget：多段跨日跨機都能定位（不只第一段）', () => {
  const t = boardTarget(P, 'oB05|0');
  assert.equal(t.date, '2026-10-13', '定位到新位置首段');
  assert.deepEqual(t.dates, ['2026-10-12', '2026-10-13']);
  assert.deepEqual(t.machines.sort(), ['a', 'b']);
  assert.deepEqual(t.nextIds, ['k5', 'k6']);
  assert.equal(t.prevSegs.length, 1, '原本 k3 一段');
});

test('純工具：絕對分鐘與日期換算', () => {
  assert.equal(pvAbsOf('2026-10-13', 480) - pvAbsOf('2026-10-12', 480), 1440);
  assert.equal(pvDateOfAbs(pvAbsOf('2026-10-12', 900)), '2026-10-12');
  assert.equal(pvHm(1380), '23:00');
  assert.equal(opKey({ oid: 'oB05', si: 0 }), 'oB05|0');
});

test('資料安全：模組面對淺拷貝的 ops 不會回頭改 proposal', () => {
  const before = JSON.stringify(P.ops.map(o => [o.oid, o.si]));
  suggestList(P); impactList(P); dueList(P);
  opDetail(P, 'oB05|0'); dueDetail(P, 'oB05'); boardTarget(P, 'oB05|0');
  assert.equal(JSON.stringify(P.ops.map(o => [o.oid, o.si])), before, '檢視操作不改 ops');
});

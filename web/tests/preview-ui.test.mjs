import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(root, '../src/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, '../src/styles.css'), 'utf8');
const i18n = fs.readFileSync(path.join(root, '../src/i18n.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, '../src/preview-nav.js'), 'utf8');

test('任務一/五：四個預覽入口都改走 enterManualPreview（PV 全螢幕互動模式）', () => {
  assert.ok(app.includes('function enterManualPreview('));
  assert.equal((app.match(/enterManualPreview\(dragPreview\(/g) || []).length, 4, '拖曳/拉底邊/手動新增/改時長四個入口');
  assert.equal((app.match(/openModal\(\{t:"drag-preview"/g) || []).length, 0, '不再以靜態 modal 開啟預覽');
});

test('任務五：dp-nav/dp-back/dp-locate 動作註冊＋Escape 返回', () => {
  for (const act of ['"dp-nav"', '"dp-back"', '"dp-locate"']) assert.ok(app.includes(act + ':'), act + ' 未註冊');
  assert.ok(app.includes('e.key==="Escape"&&!UI.modal&&PV&&PV.kind==="manual"'), 'Escape 未接手動預覽返回');
  assert.ok(app.includes('addEventListener("popstate"'), '瀏覽器 Back 未處理');
});

test('任務五：面板標題與返回按鈕（dpTitle＋dp-back 按鈕）', () => {
  assert.ok(app.includes('function dpTitle('));
  assert.ok(app.includes('data-act="dp-back"'));
  for (const v of ['suggestion-detail', 'impact-list', 'impact-detail', 'due-list', 'due-detail', 'schedule-compare'])
    assert.ok(app.includes('"' + v + '"'), '視圖 ' + v + ' 未出現');
  assert.ok(nav.includes('"overview"'), 'overview 預設視圖定義於模組');
});

test('任務四：原本／調整後／對照三模式在手動預覽也可切換且選取保留', () => {
  assert.ok(app.includes('if(PV.kind==="manual")return manualStripHTML(o)+manualDrawerHTML(o);'));
  assert.ok(app.includes('function manualStripHTML('));
  // pvCtx 手動分支：選中工序在 orig/new/cmp 都有對應標記
  const m = app.match(/if\(PV\.kind==="manual"\)\{[\s\S]*?\n  \}/);
  assert.ok(m, 'pvCtx 缺手動分支');
  assert.ok(m[0].includes('dp-hl') && m[0].includes('willchg') && m[0].includes('ghosts:det.prev'));
});

test('任務七（資料安全）：確認套用仍走 acceptManualPreview 完整驗證', () => {
  assert.ok(app.includes('async function applyManualPreview('));
  assert.ok(app.includes('acceptManualPreview(S,P)'), '套用前必經既有驗證（problems/版本衝突/目標一致）');
  assert.ok(app.includes('if(P.problems.length){toast('), '有問題時拒絕套用');
  // problems 時按鈕 disabled
  assert.ok(app.includes(`(bad?' disabled':'')+'>'+tx('確認套用')`), '確認套用未依問題停用');
  // 檢視動作不觸發儲存：dp-nav/dp-back 處理器內不呼叫 commit/pushUndo
  const dpnav = app.match(/"dp-nav":a=>\{[\s\S]*?\n  \},/)[0];
  const dpback = app.match(/"dp-back":\(\)=>dpBack\(\),/)[0];
  assert.ok(!dpnav.includes('commit(') && !dpnav.includes('pushUndo'), 'dp-nav 不得寫入');
  assert.ok(!dpback.includes('commit('), 'dp-back 不得寫入');
});

test('任務七：衝突偵測沿用 acceptManualPreview 的 base 比對（版本衝突拒絕過期方案）', () => {
  assert.ok(fs.readFileSync(path.join(root, '../src/manual-apply.js'), 'utf8').includes('JSON.stringify(current) !== proposal.base'));
});

test('任務八：穩定識別——ops 帶 si、statuses 帶 oid 與前後狀態', () => {
  assert.ok(app.includes('ops.push({oid:o.id,code:o.code,si:step,step:p.steps[step].proc,prev,next})'));
  assert.ok(app.includes('oid:id,code:o.code,due:o.due,status:st.k,finish:st.fd||null,statusB:stB.k,finishB:stB.fd||null'));
  assert.ok(app.includes('base,B:before,after,'), 'P 帶 B（原狀態物件）');
  // 點擊行為用 data-act＋data-id，不解析顯示文字
  assert.ok(app.includes("data-act=\"dp-nav\" data-v=\"'+v+'\" data-id=\"'+esc(m.key)"));
});

test('任務八：預覽中點排程表方塊 → 切換詳情（pvClickBlock）', () => {
  assert.ok(app.includes('function pvClickBlock('));
  assert.ok(app.includes('pvClickBlock(blk.dataset.bid)'));
});

test('任務六：樣式齊備（列表/對照卡/高亮/返回鈕＋手機媒體查詢）', () => {
  for (const cls of ['.dp-row', '.dp-sides', '.dp-side', '.dp-arrow', '.blk.dp-hl', '.dp-back', '.dp-due-head', '.dp-step'])
    assert.ok(css.includes(cls), cls + ' 缺樣式');
  assert.ok(css.includes('.dp-sides{grid-template-columns:1fr}'), '手機直排未定義');
});

test('i18n：新互動預覽鍵已入字典（三語）', () => {
  for (const k of ['"手動排班預覽"', '"返回上一步"', '"在排程表查看"', '"原本預計完成"', '"調整後預計完成"', '"為什麼需要調整"'])
    assert.ok(i18n.includes(k + ':'), k + ' 缺字典');
});

test('preview-nav.js：純模組——不 import、不碰 DOM／正式資料', () => {
  assert.equal(nav.includes('import '), false, '不得有 import（保持純函式）');
  assert.equal(nav.includes('document.'), false, '不得碰 DOM');
  assert.equal(nav.includes('localStorage'), false, '不得碰儲存');
});

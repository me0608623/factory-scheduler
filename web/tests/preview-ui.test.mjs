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

test('preview-nav.js：純模組——只重用純數量函式，不碰 DOM／正式資料', () => {
  assert.deepEqual(nav.match(/^import .*;$/gm), ["import { effectiveBlockQty } from './manual.js';"], '只允許重用純數量函式');
  assert.equal(nav.includes('document.'), false, '不得碰 DOM');
  assert.equal(nav.includes('localStorage'), false, '不得碰儲存');
});
test('同步中關閉分頁有 beforeunload 提示（防靜默丟失在途寫入）', () => {
  assert.match(app, /addEventListener\("beforeunload"[\s\S]*?syncPending>0\|\|SYNC\.state==="busy"/, '守門需涵蓋在途同步');
});
test('加班日渲染不崩潰：dayHTML 必須用 di.otEnd（裸 otEnd 會 ReferenceError）', () => {
  assert.match(app, /return \{type,hol,ot,win,w,open,special,otEnd\};/, 'dayInfo 需回傳 otEnd');
  assert.match(app, /hm\(di\.otEnd\)/, 'dayHTML 的加班到標籤需用 di.otEnd');
  const dayHTMLBody = app.slice(app.indexOf('function dayHTML'), app.indexOf('function blkHTML'));
  assert.doesNotMatch(dayHTMLBody, /hm\(otEnd\)/, 'dayHTML 內不得有裸 otEnd（其他模組有局部 otEnd 屬合法）');
});
test('加班設定無變更時有明確回饋（不再靜默關閉）', () => {
  assert.match(app, /if\(!changed\)\{closeModal\(\);toast\("設定沒有變更，未儲存"\);return;\}/, 'no-op 分支需 toast');
});

test('只改「加班到幾點」也被視為變更——changed 判斷需先讀選單並比對 otEnd', () => {
  const head = app.slice(app.indexOf('function saveDailyOT'), app.indexOf('function saveDailyOT') + 700);
  const readSelAt = head.indexOf('m.otEnd=sel');
  const changedAt = head.indexOf('const changed=');
  assert.ok(readSelAt > -1 && changedAt > -1 && readSelAt < changedAt, '選單值必須在 changed 計算前讀取');
  assert.match(head, /\(\!\!m\.open&&S\.dayOT\[d\]!==m\.otEnd\)/, 'changed 需比對 otEnd');
});
test('停工/日曆儲存前有產量矛盾閘門（repair 可產出違反後站≤前站的排程，伺服器會拒）', () => {
  assert.match(app, /function closeDaysPlanBad\(calOverride\)/, '需有純探測函式');
  assert.match(app, /materialFlowIssue\(S\.blocks,b\.oid,b\.step,absOf,S\.execution\|\|\[\]\)\)bad\.push/, '探測需用 materialFlowIssue');
  // toggleOpen 與 c-save 兩個入口都要先閘後改
  const t1 = app.indexOf('const bad=closeDaysPlanBad();');
  const closeDaysAt = app.indexOf('const r=closeDays();', t1);
  assert.ok(t1 > -1 && closeDaysAt > t1, 'toggleOpen：閘門在 closeDays 之前');
  const t2 = app.indexOf('closeDaysPlanBad({week:');
  const pushUndoAt = app.indexOf('pushUndo();S.cal=', t2);
  assert.ok(t2 > -1 && pushUndoAt > t2, 'c-save：草稿探測在 pushUndo 之前');
});
test('leaveq 工作數提示與 lq-go 同口徑（futureOf 過濾）', () => {
  assert.match(app, /const n=S\.blocks\.filter\(b=>b\.emp===E\.id&&b\.date===m\.date&&futureOf\(b\)\)\.length/, 'hint 計數需含 futureOf');
});
test('月曆筆刷的 undo 快照在變更前（復原必須能還原筆刷套用）', () => {
  const i = app.indexOf('let cnt=0');
  const seg = app.slice(i - 200, i + 900);
  const pushAt = seg.indexOf('pushUndo()');
  const loopAt = seg.indexOf('applyBrush(eid,x)');
  assert.ok(pushAt > -1 && loopAt > -1 && pushAt < loopAt, 'pushUndo 必須在 applyBrush 迴圈之前');
});

test('缺陷#13 回歸：case "analytics" 必須自帶 break 與頁面切換主體（曾掉 break 落入 line-notify——點產能分析開成 LINE 通知視窗）', () => {
  const i = app.indexOf('case "analytics"');
  assert.ok(i >= 0, '找不到 analytics case');
  const seg = app.slice(i, app.indexOf('case "line-notify"'));
  assert.match(seg, /UI\.page="analytics";[\s\S]*?render\(\);[\s\S]*?break;/, 'analytics case 需完整主體＋break，不得落入下一個 case');
  assert.ok(!/case "analytics":UI\.page="analytics";\s*case/.test(app), 'analytics case 不得直接落到下一個 case（缺 break）');
});

test('缺陷#14 回歸：feedback-send 需在本機模式提前擋下（查看反饋有擋、送出沒擋＝不一致；本機 STORE.sb 不存在會靜默失敗）', () => {
  const i = app.indexOf('case "feedback-send"');
  assert.ok(i >= 0, '找不到 feedback-send case');
  const seg = app.slice(i, i + 200);
  assert.match(seg, /STORE\.kind==="local"\)\{toast\(/, '本機模式要先提示改用 Email，不得走到 STORE.sb');
});

test('缺陷#15 回歸：保存試排情境按鈕不得用被 !PV 閘門的 canScenarios（該鈕只在預覽中渲染，canPermission 在 PV 期間恒 false＝按鈕永遠不出現的死代碼）', () => {
  assert.match(app, /function canPermission\(key\)\{return !PV&&canPermissionRaw\(key\);\}/, 'canPermission 需委派 raw 檢查');
  assert.match(app, /canPermissionRaw\('scenarios\.manage'\)&&!PV\.savedScenario\?'<button[^>]+scenario-save/, '保存情境鈕需用 raw 權限（不受 !PV 影響）');
});

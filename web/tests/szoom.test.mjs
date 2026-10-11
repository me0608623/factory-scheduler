// szoom：排程表縮放控制器（純邏輯，localStorage 模擬）
import test from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
globalThis.window = { scrollY: 0, scrollTo() {} };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);

const S = await import('../src/szoom.js');

test('clampZ：上下限 0.3–2.5、四捨五入到百分位', () => {
  assert.equal(S.clampZ(3), 2.5);
  assert.equal(S.clampZ(0.1), 0.3);
  assert.equal(S.clampZ(1.234), 1.23);
  assert.equal(S.clampZ(1), 1);
});

test('setZoom：跨層級切換建議（日→週 0.62／週→日 1.0）', () => {
  S.resetZoom('day');
  let r = S.setZoom('day', 0.6);
  assert.equal(r.cross, 'week');
  r = S.setZoom('day', 0.62);
  assert.equal(r.cross, 'week');
  r = S.setZoom('day', 0.7);
  assert.equal(r.cross, null);
  S.setZoom('week', 0.8);
  r = S.setZoom('week', 1.0);
  assert.equal(r.cross, 'day');
});

test('持久化與載入：壞資料回預設', () => {
  S.setZoom('day', 1.5);
  S.setZoom('week', 0.8);
  const st = S.loadSchedZoom();
  assert.equal(st.day, 1.5);
  assert.equal(st.week, 0.8);
  store['fsched-schedzoom-v1'] = '{"day":99,"week":"x"}';  // 壞值（超界/非法）不覆寫記憶體
  const st2 = S.loadSchedZoom();
  assert.equal(st2.day, 1.5);
  assert.equal(st2.week, 0.8);
});

test('滾輪開關持久化', () => {
  assert.equal(S.setWheelZoom(false), false);
  assert.equal(S.schedZoomState().wheelZoom, false);
  S.setWheelZoom(true);
  assert.equal(S.schedZoomState().wheelZoom, true);
});

test('rafApply：同一框多次呼叫只執行一次', async () => {
  let n = 0;
  const f = S.rafApply(() => n++);
  f(); f(); f();
  assert.equal(n, 0);          // rAF 未觸發前 0
  await new Promise(r => setTimeout(r, 30));
  assert.equal(n, 1);          // 三次合併為一次
  f();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(n, 2);
});

test('anchorScroll：以錨點為中心的比例補償', () => {
  const el = { getBoundingClientRect: () => ({ left: 100, top: 0 }), scrollLeft: 50 };
  S.anchorScroll(el, 300, 400, 1, 2);   // 2x 放大，錨點在 x=300
  // dx = 300-100+50 = 250 → 新 scrollLeft = 250*2 - 200 = 300
  assert.equal(el.scrollLeft, 300);
});

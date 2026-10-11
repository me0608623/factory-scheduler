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

test('anchorScroll uses newly rendered cell geometry, not whole-page scaling', () => {
  const oldCell={getBoundingClientRect:()=>({left:100,top:200,right:300,bottom:800,width:200,height:600})};
  const before={querySelectorAll:()=>[oldCell],getBoundingClientRect:oldCell.getBoundingClientRect};
  const anchor=S.captureZoomAnchor(before,200,400);
  let scrolled;window.scrollY=300;window.scrollTo=(x,y)=>{scrolled=y;};
  const cell={getBoundingClientRect:()=>({left:100,top:200,width:300,height:1200})};
  const after={querySelectorAll:()=>[cell],scrollLeft:50};
  S.anchorScroll(after,200,400,anchor);
  assert.equal(after.scrollLeft,100);assert.equal(scrolled,500);
});

test('cancelled frame cannot consume a newer gesture',()=>{
  const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const calls=[];const f=S.rafApply(n=>calls.push(n));
  f(1);f.cancel();f(2);frames.shift()();assert.deepEqual(calls,[]);frames.shift()();assert.deepEqual(calls,[2]);
});

test('clampZ rejects non-finite zoom without poisoning rendering',()=>{
  for(const z of [NaN,Infinity,-Infinity,undefined])assert.equal(S.clampZ(z),1);
});

test('rAF uses latest pinch coordinates and supports cancelling stale work',()=>{
  const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const calls=[];const f=S.rafApply((...args)=>calls.push(args));
  f(1,10);f(2,20);frames.shift()();assert.deepEqual(calls,[[2,20]]);
  f(3,30);f.cancel();frames.shift()();assert.equal(calls.length,1);
});

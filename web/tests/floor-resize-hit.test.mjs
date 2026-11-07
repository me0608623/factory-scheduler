import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Execute the real initializer and real drawing/layout/hit code together. Only
// the DOM and Canvas API are modeled; this is not a browser/E2E test.
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const floor = readFileSync(new URL('../src/floor.js', import.meta.url), 'utf8');
function harness({ width = 900, dpr = 1 } = {}) {
  let bounds = { left: 37, top: 83, width, height: 0 };
  const draws = [], toasts = [], tip = { style: {} };
  let sx = 1, sy = 1, bitmapWidth = 0, bitmapHeight = 0;
  const g = {
    scale(x, y) { sx *= x; sy *= y; },
    getTransform: () => ({ a: sx, d: sy }),
    beginPath() {}, roundRect(x, y, w, h) { draws.push({ x, y, w, h }); },
    fill() {}, stroke() {}, fillText() {},
  };
  const canvas = {
    clientWidth: width, style: {}, getContext: () => g,
    getBoundingClientRect: () => bounds,
    set width(v) { bitmapWidth = Math.trunc(v); sx = sy = 1; },
    get width() { return bitmapWidth; },
    set height(v) { bitmapHeight = Math.trunc(v); sx = sy = 1; },
    get height() { return bitmapHeight; },
  };
  const ctx = vm.createContext({
    $: s => s === '#floor-canvas' ? canvas : tip,
    UI: { factory: 1, date: '2026-10-05' },
    S: { machines: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      blocks: [], machineLayout: [{ machineId: 'a', x: 20, y: 20 }, { machineId: 'b', x: 50, y: 20 }] },
    window: { devicePixelRatio: dpr }, document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    innerWidth: 1200, tx: x => x, esc: x => x, toast: s => toasts.push(s),
  });
  vm.runInContext(floor.replace(/^import .*;$/m, '').replace(/export function /g, 'function '), ctx);
  vm.runInContext(app.slice(app.indexOf('function initFloor(){'), app.indexOf('\nfunction analyticsPageHTML')), ctx);
  ctx.initFloor();
  bounds.height = parseFloat(canvas.style.height);
  const point = (x, y) => ({ clientX: bounds.left + x * bounds.width / (canvas.width / sx),
    clientY: bounds.top + y * bounds.height / (canvas.height / sy) });
  const select = (x, y, label) => {
    const e = point(x, y), count = toasts.length;
    canvas.onmousemove(e);
    canvas.onclick(e);
    if (label) {
      assert.match(tip.innerHTML, new RegExp(`<b>${label}</b>`));
      assert.equal(tip.style.display, 'block');
      assert.equal(toasts.at(-1), `${label}：當日無排程`);
      assert.equal(toasts.length, count + 1);
    } else {
      assert.equal(tip.style.display, 'none');
      assert.equal(toasts.length, count);
    }
  };
  return { canvas, ctx, draws, tip, select, resize: (w, h) => {
    bounds = { ...bounds, width: w, height: h }; canvas.clientWidth = w;
  }, height: bounds.height };
}

for (const dpr of [1, 1.25, 2, 3]) {
  test(`actual initFloor keeps hover/click aligned after CSS resize, DPR ${dpr}`, () => {
    const h = harness({ dpr });
    const a = h.draws[0], b = h.draws[1];
    const center = r => [r.x + r.w / 2, r.y + r.h / 2];
    h.select(...center(a), 'A'); h.select(...center(b), 'B');
    // Real route: width:100% shrinks but the explicit canvas height stays put.
    h.resize(450, h.height);
    h.select(...center(b), 'B'); h.select(...center(a), 'A');
    for (const [w, height] of [[1200, h.height], [450, h.height / 2], [900, h.height * 2]]) {
      h.resize(w, height);
      h.select(...center(b), 'B');
      h.select(b.x, b.y, 'B');
      h.select(b.x + b.w, b.y + b.h, 'B');
      h.select(b.x - 1, b.y, null);
      h.select(b.x + b.w + 1, b.y + b.h, null);
      h.select(-1, -1, null);
      h.select(901, h.height + 1, null);
    }
    h.canvas.onmouseleave();
    assert.equal(h.tip.style.display, 'none');
  });
}

test('initial narrow canvas uses rendered minimum width and fractional DPR geometry', () => {
  const h = harness({ width: 280, dpr: 1.25 });
  const b = h.draws[1];
  h.select(b.x + b.w / 2, b.y + b.h / 2, 'B');
});

test('zero-size canvas does not hit; repeated initialization replaces handlers', () => {
  const h = harness();
  h.resize(450, h.height);
  h.ctx.initFloor();
  const b = h.draws.at(-1);
  h.select(b.x + b.w / 2, b.y + b.h / 2, 'B');
  h.resize(0, 0);
  h.select(0, 0, null);
});

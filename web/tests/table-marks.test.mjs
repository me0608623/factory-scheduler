// table-marks：以「表:列ID」為鍵的個人標記（localStorage 模擬）
import test from 'node:test';
import assert from 'node:assert/strict';

// 以注入的假 localStorage 載入模組（模組層讀 localStorage，需在 import 前就緒）
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const { markOf, setMark, markRowAttrs, markBtns, MARK_COLORS, changeMarkColor } = await import('../src/table-marks.js');

test('輸入標註後多次換色、套用保存，文字不遺失', () => {
  let draft={c:'',n:''};
  draft=changeMarkColor(draft,'r','保留這句 QA');
  draft=changeMarkColor(draft,'b',draft.n);
  setMark('wl','color-note',draft);
  assert.deepEqual(markOf('wl','color-note'),{c:'b',n:'保留這句 QA'});
  setMark('wl','color-note',null);
});

test('標記与歸檔、已回廠、取消各自為獨立 class token', () => {
  setMark('tf','status-mark',{c:'y',n:'QA'});
  const cls=markRowAttrs('tf','status-mark','returned archived cancelled').cls;
  assert.deepEqual(new Set(cls.split(/\s+/)),new Set(['mk-y','mk-noted','returned','archived','cancelled']));
  setMark('tf','status-mark',null);
});

test('標記 CRUD：以 table:id 為鍵，排序/重繪後仍對應', () => {
  setMark('tf', 'o1', { c: 'r', n: '急件' });
  assert.deepEqual(markOf('tf', 'o1'), { c: 'r', n: '急件' });
  assert.equal(markOf('tf', 'o2'), null);
  setMark('tf', 'o1', { c: 'g', n: '' });          // 改色
  assert.equal(markOf('tf', 'o1').c, 'g');
  setMark('tf', 'o1', null);                        // 清除
  assert.equal(markOf('tf', 'o1'), null);
});

test('markRowAttrs：class 只含人工標記，不覆蓋業務狀態', () => {
  setMark('rush', 'r9', { c: 'y', n: '備註文字' });
  const a = markRowAttrs('rush', 'r9', 'archived');
  assert.match(a.cls, /mk-y/);
  assert.match(a.cls, /mk-noted/);
  assert.match(a.cls, /archived/);
  assert.equal(a.noted, true);
  const b = markRowAttrs('rush', 'nope');
  assert.equal(b.cls, '');
  setMark('rush', 'r9', null);
});

test('markBtns：按鈕帶 table/id，標註存在時顯示 ✎，長標註截斷且無未跳脫內容', () => {
  setMark('wl', 'w1', { c: 'b', n: 'x<script>alert(1)</script>' });
  const html = markBtns('wl', 'w1');
  assert.ok(html.includes('data-t="wl"') && html.includes('data-id="w1"'));
  assert.ok(!html.includes('<script>'), '標註不可未跳脫輸出');
  assert.ok(html.includes('✎'));
  setMark('wl', 'w1', null);
  assert.ok(!markBtns('wl', 'w1').includes('✎'));
});

test('顏色定義四色', () => {
  assert.deepEqual(MARK_COLORS.map(c => c.k), ['y', 'r', 'g', 'b']);
});

test('儲存失敗（額滿）回報 false，記憶體狀態仍可用', () => {
  const orig = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('full'); };
  assert.equal(setMark('tf', 'zz', { c: 'y', n: '' }), false);
  assert.equal(markOf('tf', 'zz').c, 'y');           // 記憶體已套用
  globalThis.localStorage.setItem = orig;
  assert.equal(setMark('tf', 'zz', null), true);
});

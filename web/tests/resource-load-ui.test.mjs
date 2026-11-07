import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { LocalStore } from '../src/store/local.js';
import { resourceLoad } from '../src/resource-load.js';
import { workWindows } from '../src/general-work.js';
import { tx, I18N } from '../src/i18n.js';
import { factoryName } from '../src/factory.js';

const date = '2030-01-07';
const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function resourceLoadHTML(){');
const end = source.indexOf('\nconst MODALS=', start);
assert.ok(start >= 0 && end > start, 'extract the actual resource-load modal, not a substitute renderer');
const modal = source.slice(start, end);
const labels = {
  'zh-TW': (p, l) => `最高占用容量 ${p} / 顧機上限 ${l}`,
  en: (p, l) => `peak load ${p} / machine limit ${l}`,
  vi: (p, l) => `đỉnh ${p} / giới hạn máy ${l}`,
  th: (p, l) => `พีค ${p} / ขีดเครื่อง ${l}`,
};
function fixture(kind, limit) {
  const assignment = (id, workId, resourceId, s, e) =>
    ({ id, workId, emp: 'e', resourceId, date, s, e, qty: null, orderId: null, note: '' });
  return {
    version: 0, cal: { week: [false, true, true, true, true, true, false], over: {} }, dayOT: {}, log: [],
    employees: [{ id: 'e', name: 'Worker', factory: 1, maxMachines: limit, skills: ['m', 'n'], leaves: [], noOT: false }],
    machines: ['m', 'n'].map(id => ({ id, label: id, factory: 1, faults: [] })),
    products: [], orders: [], blocks: [],
    workContents: [
      { id: 'manual', name: 'Inspection', factory: 1, requiresResource: false, employeeIds: ['e'], resourceIds: [], reviewStatus: 'confirmed' },
      { id: 'equipment', name: 'Equipment', factory: 1, requiresResource: true, employeeIds: ['e'], resourceIds: ['m', 'n'], reviewStatus: 'confirmed' },
    ],
    workAssignments: kind === 'empty' ? [] : kind === 'manual'
      ? [assignment('a', 'manual', null, 480, 540)]
      : [assignment('a', 'manual', null, 480, 540), assignment('b', 'equipment', 'm', 540, 600), assignment('c', 'equipment', 'n', 540, 600)],
  };
}
async function savedFixture(kind, limit) {
  const previous = globalThis.localStorage, data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  try {
    const store = new LocalStore();
    await store.sync(fixture(kind, limit));
    const saved = await store.load();
    assert.ok(saved, 'fixture must survive real local validation, save and reload');
    return saved;
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}
function render(S) {
  const context = vm.createContext({ S, UI: { date, factory: 1 }, resourceLoad,
    dayInfo: () => ({ win: workWindows(S, date) }), tx, factoryName,
    esc: String, hm: n => `${Math.floor(n / 60)}:${n % 60}`, mdw: d => d });
  vm.runInContext(modal, context);
  return vm.runInContext('resourceLoadHTML().body', context);
}
for (const [kind, limit, peak] of [['empty', 2, 0], ['manual', 1, 1], ['equipment', 2, 2], ['manual', 12, 12]]) {
  test(`saved ${kind} work: peak ${peak} appears once beside confirmed limit ${limit} in all four languages`, async () => {
    const S = await savedFixture(kind, limit);
    const row = resourceLoad(S, date, workWindows(S, date)).employees[0];
    assert.equal(row.peak, peak);
    assert.equal(row.overloadMinutes, 0);
    const previous = I18N.lang;
    try {
      for (const [lang, label] of Object.entries(labels)) {
        I18N.lang = lang;
        const html = render(S);
        assert.ok(html.includes(label(peak, limit)), `${lang}: expected ${label(peak, limit)} in actual modal; got ${html}`);
        assert.ok(!html.includes(label(`${peak}${peak}`, limit)), `${lang}: peak must not be concatenated twice`);
      }
    } finally { I18N.lang = previous; }
  });
}
test('saved work with a pending employee keeps one observed peak and an unknown limit in every language', async () => {
  const S = await savedFixture('manual', 12);
  S.employees[0].reviewStatus = 'pending';
  const row = resourceLoad(S, date, workWindows(S, date)).employees[0];
  assert.equal(row.peak, 12);
  assert.equal(row.limit, null);
  const previous = I18N.lang;
  try {
    for (const lang of Object.keys(labels)) {
      I18N.lang = lang;
      const html = render(S);
      assert.ok(html.includes(tx('最高占用容量 {p}', { p: 12 }) + tx('（上限待確認）')));
      assert.ok(!html.includes(labels[lang](12, 12)), 'pending resource must not expose a confirmed limit');
    }
  } finally { I18N.lang = previous; }
});

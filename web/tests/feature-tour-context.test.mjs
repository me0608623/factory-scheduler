import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const tourSource = fs.readFileSync(new URL('../src/tour.js', import.meta.url), 'utf8');
const routes = { shortage: 'shortage', transfer: 'transferflow', worklog: 'worklog' };
function between(start, end) {
  const a = appSource.indexOf(start), b = appSource.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `extract ${start}`);
  return appSource.slice(a, b);
}

// Actual tour source, app navigation cases and page/drawer renderers. Only the
// DOM, timers, navigation chrome and unrelated formatting/data helpers are fake.
// These tests establish ownership/navigation, not browser layout or hit testing.
function harness(t, { editable = true } = {}) {
  let now = 0, sequence = 0, timers = [], env;
  const errors = [], actions = [], reads = [], listeners = new Map();
  const setTimeout = (fn, delay = 0) => {
    const id = ++sequence;
    timers.push({ id, at: now + delay, fn });
    return id;
  };
  const clearTimeout = id => { timers = timers.filter(timer => timer.id !== id); };
  function tick(ms = 400) {
    const end = now + ms;
    let count = 0;
    while (true) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      if (!timers[0] || timers[0].at > end) break;
      const timer = timers.shift();
      now = timer.at;
      timer.fn();
      assert.ok(++count < 500, 'bounded timers');
    }
    now = end;
  }
  function matchesOne(el, selector) {
    let rest = selector;
    const tag = rest.match(/^[a-z][\w-]*/i);
    if (tag) {
      if (el.tagName !== tag[0].toLowerCase()) return false;
      rest = rest.slice(tag[0].length);
    }
    for (const [, key, value] of rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      if (!Object.hasOwn(el.attrs, key) || (value !== undefined && el.attrs[key] !== value)) return false;
    }
    rest = rest.replace(/\[[^\]]+\]/g, '');
    for (const [, kind, value] of rest.matchAll(/([.#])([\w-]+)/g)) {
      if (kind === '.' ? !el.className.split(/\s+/).includes(value) : el.attrs.id !== value) return false;
    }
    return true;
  }
  function matches(el, selector) {
    return selector.split(',').some(part => {
      const parts = part.trim().split(/\s+/);
      let at = el;
      if (!matchesOne(at, parts.pop())) return false;
      while (parts.length) {
        const ancestor = parts.pop();
        at = at.parent;
        while (at && !matchesOne(at, ancestor)) at = at.parent;
        if (!at) return false;
      }
      return true;
    });
  }
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.attrs = {};
      this.style = {};
      this.dataset = {};
      this.children = [];
      this.parent = null;
      this.listeners = new Map();
      this._html = '';
    }
    get className() { return this.attrs.class || ''; }
    set className(value) { this.attrs.class = value; }
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    get offsetParent() { return this.isConnected && !this.hidden ? document.body : null; }
    get offsetHeight() { return 180; }
    append(...elements) {
      for (const element of elements) {
        element.remove();
        element.parent = this;
        this.children.push(element);
      }
    }
    appendChild(element) { this.append(element); return element; }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(el => el !== this);
      this.parent = null;
    }
    addEventListener(key, fn) {
      const callbacks = this.listeners.get(key) || [];
      callbacks.push(fn);
      this.listeners.set(key, callbacks);
    }
    removeEventListener(key, fn) {
      this.listeners.set(key, (this.listeners.get(key) || []).filter(callback => callback !== fn));
    }
    querySelectorAll(selector) {
      const found = [];
      function visit(el) {
        for (const child of el.children) {
          if (matches(child, selector)) found.push(child);
          visit(child);
        }
      }
      visit(this);
      return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) {
      for (let el = this; el; el = el.parent) if (matches(el, selector)) return el;
      return null;
    }
    scrollIntoView() {}
    focus() {}
    getBoundingClientRect() {
      reads.push(this);
      return { left: 100, top: 100, width: 200, height: 40, bottom: 140, right: 300 };
    }
    click() {
      for (let el = this; el; el = el.parent) {
        for (const fn of el.listeners.get('click') || []) fn({ target: this });
      }
      if (this.dataset.act) dispatch(this.dataset.act, this.dataset.v, this);
    }
    get innerHTML() { return this._html; }
    set innerHTML(html) {
      this._html = html;
      for (const child of this.children) child.parent = null;
      this.children = [];
      const stack = [this];
      for (const match of html.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)) {
        if (match[0][1] === '/') { if (stack.length > 1) stack.pop(); continue; }
        const el = new Element(match[1]);
        for (const [, key, value] of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(key, value);
        stack.at(-1).append(el);
        if (!['input', 'img', 'br', 'hr', 'meta', 'link'].includes(match[1]) && !match[0].endsWith('/>')) stack.push(el);
      }
    }
  }
  const document = {
    body: new Element('body'), createElement: tag => new Element(tag),
    querySelector: selector => document.body.querySelector(selector),
    querySelectorAll: selector => document.body.querySelectorAll(selector),
  };
  const appRoot = new Element();
  document.body.append(appRoot);
  const chrome = ['worklog', 'notes', 'more'].map(value => `<button data-act="drawer" data-v="${value}"></button>`).join('') +
    ['shortage', 'transfer'].map(value => `<button class="pagelink ${value}" data-act="page" data-v="${value}"></button>`).join('');
  let renders = 0, archives = 0;
  function render() {
    renders++;
    const renderer = { shortage: 'shortagePageHTML', transferflow: 'transferFlowPageHTML', worklog: 'workLogPageHTML' }[env.UI.page];
    const body = renderer ? env[renderer]() : '<div class="workspace-heading"></div>';
    appRoot.innerHTML = chrome + body + (env.UI.drawer === 'notes' ? env.notesDrawerHTML() : '');
  }
  env = {
    document, setTimeout, clearTimeout, requestAnimationFrame: fn => setTimeout(fn, 16),
    console: { error: (...args) => errors.push(args) }, innerWidth: 1200, innerHeight: 800,
    addEventListener: (key, fn) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(fn);
    },
    removeEventListener: (key, fn) => listeners.get(key)?.delete(fn),
    localStorage: { getItem: () => null, setItem: () => {} },
    UI: { page: null, drawer: null, date: '2026-11-07', view: 'day', tableSort: {}, prefs: {} },
    S: { rushOrders: [], transferOrders: [], workLog: [], memos: [] }, PV: null,
    tx: value => value, esc: String, render, $: selector => document.querySelector(selector),
    closeModal: () => { env.UI.modal = null; }, openModal: modal => { env.UI.modal = modal; },
    window: { scrollTo: () => {} }, setUrlView: () => {}, flashReturnRow: () => {},
    todayStr: () => '2026-11-07', toast: () => {}, canPermission: () => editable,
    tfAutoArchive: () => { archives++; return 0; }, // No persistence or real archive branch.
    transferOrders: state => state.transferOrders, tableSorted: rows => rows,
    RUSH_SORT: Array(6).fill({}), TF_SORT: Array(7).fill({}), WL_SORT: Array(8).fill({}),
    sortBar: () => '', sortTh: () => '<th>Column</th>',
    SYNC: { state: 'ok' }, pageSaveState: () => '', directWriteStatus: () => '',
    visibleMemos: () => [], factoryOf: () => 1,
  };
  vm.createContext(env);
  vm.runInContext(tourSource.replace(/^export /gm, '') + '\nglobalThis.TOURS = FEATURE_TOURS;', env);
  vm.runInContext(
    between('function pageShell(', 'function tfArchiveMonth(') +
    between('function shortagePageHTML(){', 'const pendingDate=') +
    between('function transferFlowPageHTML(){', '/* ---------- 日班表列印') +
    between('function workLogPageHTML(){', "MODALS['memo-edit']") +
    between('function notesDrawerHTML(){', 'function settingChoices('), env);
  const cases = ['today', 'drawer', 'page', 'feature-tour', 'feature-topic'].map(name => {
    const start = appSource.indexOf(`case "${name}":`);
    const end = appSource.indexOf('\n    case ', start + 5);
    assert.ok(start >= 0 && end > start);
    return appSource.slice(start, end);
  }).join('\n');
  function dispatch(act, value, element) {
    actions.push([act, value]);
    env.a = element || { dataset: { act, v: value } };
    env.act = act;
    vm.runInContext(`switch (act) { ${cases} }`, env);
  }
  const card = () => document.querySelector('.tour-card');
  function clickTour(action) {
    const button = card()?.querySelector(`[data-tour="${action}"]`);
    assert.ok(button, `visible ${action} control`);
    button.click();
    tick();
  }
  function begin(topic) {
    dispatch('feature-tour');
    assert.equal(env.UI.modal.t, 'feature-topics');
    dispatch('feature-topic', topic);
    tick();
  }
  const emit = key => { for (const fn of [...listeners.get(key) || []]) fn({ type: key }); tick(); };
  render();
  t.after(() => { assert.deepEqual(errors, []); });
  return { env, document, actions, reads, render, dispatch, tick, card, clickTour, begin, emit,
    get renders() { return renders; }, get archives() { return archives; } };
}

for (const [topic, route] of Object.entries(routes)) {
  for (const origin of ['board', ...Object.keys(routes)].filter(value => value !== topic)) {
    test(`${topic} tour enters its own page from ${origin} before showing shared targets`, t => {
      const h = harness(t);
      h.dispatch('page', origin);
      h.begin(topic);
      assert.match(h.card().innerHTML, new RegExp(h.env.TOURS[topic][0].title));
      for (const step of h.env.TOURS[topic].slice(1)) {
        h.clickTour('next');
        assert.equal(h.env.UI.page, route);
        assert.match(h.card().innerHTML, new RegExp(step.title));
        const target = h.document.querySelector(step.sel);
        assert.ok(target?.closest('.fullpage'), 'target belongs to the actual page renderer');
        assert.equal(h.reads.at(-1), target);
      }
      h.clickTour('next');
      assert.equal(h.card(), null);
    });
  }
  test(`${topic} keeps the current page and editor state during repeat steps, Back and reposition`, t => {
    const h = harness(t);
    h.dispatch('page', topic);
    const editor = { table: topic, id: 'draft-row', key: 'note' }, focus = { id: 'selection' };
    Object.assign(h.env.UI, { editCell: editor, focus, confirmRow: 'draft-row', workLogDate: '2026-10-20', shortageShowArchived: true, tfShowArchived: true });
    h.render();
    h.begin(topic);
    const actionCount = h.actions.length, renderCount = h.renders, archiveCount = h.archives;
    h.clickTour('next');
    h.emit('resize');
    h.emit('scroll');
    h.clickTour('next');
    h.clickTour('prev');
    h.clickTour('prev');
    h.clickTour('next');
    for (const step of h.env.TOURS[topic].slice(1)) { step.pre(); step.pre(); }
    assert.equal(h.env.UI.page, route);
    assert.equal(h.env.UI.editCell, editor);
    assert.equal(h.env.UI.focus, focus);
    assert.equal(h.env.UI.confirmRow, 'draft-row');
    assert.equal(h.env.UI.workLogDate, '2026-10-20');
    assert.equal(h.env.UI.shortageShowArchived, true);
    assert.equal(h.env.UI.tfShowArchived, true);
    assert.equal(h.actions.length, actionCount, 'no repeated navigation actions');
    assert.equal(h.renders, renderCount, 'no needless page render');
    assert.equal(h.archives, archiveCount, 'no repeated archive prerequisite');
    h.clickTour('skip');
  });
}

for (const topic of ['transfer', 'shortage']) {
  test(`${topic} read-only missing add-row skips without rerendering or borrowing another page's button`, t => {
    const h = harness(t, { editable: false });
    h.dispatch('page', topic);
    const other = h.document.createElement('div');
    other.innerHTML = '<div class="fullpage"><button class="addrow-head">Unrelated add row</button></div>';
    h.document.body.append(other);
    h.env.UI.editCell = { id: 'untouched' };
    h.begin(topic);
    const actionCount = h.actions.length, renderCount = h.renders;
    const titles = [h.env.TOURS[topic][0].title];
    while (h.card()) {
      h.clickTour('next');
      if (h.card()) titles.push(h.card().innerHTML.match(/<b>(.*?)<\/b>/)[1]);
    }
    assert.deepEqual(titles, Array.from(h.env.TOURS[topic]).filter(step => !step.sel.endsWith('.addrow-head')).map(step => step.title));
    assert.equal(h.actions.length, actionCount);
    assert.equal(h.renders, renderCount);
    assert.equal(h.env.UI.editCell.id, 'untouched');
    assert.ok(!h.reads.some(element => element.closest('.fullpage') === other.querySelector('.fullpage')));
  });
}

test('unavailable navigation skips Transfer descriptions instead of highlighting Shortage targets', t => {
  const h = harness(t);
  h.dispatch('page', 'shortage');
  h.document.querySelector('[data-act="page"][data-v="transfer"]').remove();
  h.begin('transfer');
  h.tick(2000);
  assert.equal(h.card(), null);
  assert.equal(h.env.UI.page, 'shortage');
  assert.equal(h.reads.length, 0, 'no wrong-page targets were painted');
});

test('blocked page navigation does not fall back to the existing page targets', t => {
  const h = harness(t);
  h.dispatch('page', 'shortage');
  h.env.PV = { kind: 'preview' };
  h.begin('transfer');
  const entryReads = h.reads.length;
  h.clickTour('next');
  h.tick(2000);
  assert.equal(h.card(), null);
  assert.equal(h.env.UI.page, 'shortage');
  assert.equal(h.reads.length, entryReads);
});

test('missing Worklog table skips it without borrowing another table or repeating navigation', t => {
  const h = harness(t);
  h.dispatch('page', 'worklog');
  h.document.querySelector('.sheettable').remove();
  const decoy = h.document.createElement('div');
  decoy.className = 'sheettable';
  h.document.body.append(decoy);
  h.begin('worklog');
  const actionCount = h.actions.length, renderCount = h.renders;
  h.clickTour('next');
  assert.match(h.card().innerHTML, /返回看板/);
  assert.equal(h.actions.length, actionCount);
  assert.equal(h.renders, renderCount);
  assert.ok(!h.reads.includes(decoy));
  h.clickTour('next');
  assert.equal(h.card(), null);
});

test('Notes still opens once and remains open on repeat step, Back and reposition', t => {
  const h = harness(t);
  h.begin('notes');
  h.clickTour('next');
  assert.equal(h.env.UI.drawer, 'notes');
  const count = h.actions.length;
  h.emit('resize');
  h.emit('scroll');
  h.clickTour('prev');
  h.clickTour('next');
  assert.equal(h.env.UI.drawer, 'notes');
  assert.equal(h.actions.length, count, 'existing drawer pre is not invoked indiscriminately');
  h.clickTour('skip');
});

test('page tour starting with Notes open closes it only as part of the requested page navigation', t => {
  const h = harness(t);
  h.dispatch('drawer', 'notes');
  h.begin('transfer');
  h.clickTour('next');
  assert.equal(h.env.UI.page, 'transferflow');
  assert.equal(h.env.UI.drawer, null);
  const count = h.actions.length;
  h.emit('resize');
  h.clickTour('next');
  h.clickTour('prev');
  assert.equal(h.actions.length, count);
  assert.equal(h.env.UI.drawer, null);
  h.clickTour('skip');
});

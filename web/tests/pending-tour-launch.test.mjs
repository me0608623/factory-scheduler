import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(process.env.TOUR_APP_SOURCE || new URL('../src/app.js', import.meta.url), 'utf8');
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
    focus() { document.activeElement=this; }
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
  appRoot.setAttribute('id','app');
  document.getElementById=id=>document.querySelector('#'+id);
  document.body.append(appRoot);
  const chrome = ['worklog', 'notes', 'more'].map(value => `<button data-act="drawer" data-v="${value}"></button>`).join('') +
    ['shortage', 'transfer'].map(value => `<button class="pagelink ${value}" data-act="page" data-v="${value}"></button>`).join('');
  const stored=new Map();
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
    localStorage: { getItem: key => stored.get(key), setItem: (key,value) => stored.set(key,value) },
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
  env.STORE={kind:"local"};
  vm.createContext(env);
  vm.runInContext(tourSource.replace(/^export /gm, '') + '\nglobalThis.TOURS = FEATURE_TOURS;globalThis.ONBOARDING = TOUR_STEPS;', env);
  vm.runInContext(
    between('function pageShell(', 'function tfArchiveMonth(') +
    between('function shortagePageHTML(){', 'const pendingDate=') +
    between('function transferFlowPageHTML(){', '/* ---------- 日班表列印') +
    between('function workLogPageHTML(){', "MODALS['memo-edit']") +
    between('function notesDrawerHTML(){', 'function settingChoices('), env);
  const docListeners=new Map();
  document.addEventListener=(key,fn,capture=false)=>{
    const list=docListeners.get(key)||[];
    docListeners.set(key,capture?[fn,...list]:[...list,fn]);
  };
  Object.assign(env,{HTMLElement:Element,modalReturnFocus:null,cancelPlanCalculation:()=>{},renderModal:()=>{},maybeReload:()=>{},executionRetries:new Map(),markOwner:()=>null,executionOf:()=>null});
  vm.runInContext(between('function openModal(m){','function ownsLegacyRequest('),env);
  vm.runInContext(between('const PV_BLOCK=', 'document.addEventListener("change"'),env);
  vm.runInContext(between('addEventListener("popstate",()=>{','// 依目前選取對齊看板'),env);
  function dispatch(act,value,element){
    actions.push([act,value]);
    const a=element||new Element('button');
    if(!element){a.setAttribute('data-act',act);if(value)a.setAttribute('data-v',value);}
    for(const fn of docListeners.get('click')||[])fn({target:a});
  }
  Object.assign(env,{ensureVisualStyles:()=>{},environmentHTML:()=>'',liquidLogoSVG:()=>'',RUNTIME:{mode:'test'},mountBackdrop:()=>null,mountViz3D:()=>{},vizBg:null});
  vm.runInContext(between('function showLogin(', '// ---------- 未排工作'),env);
  if(appSource.includes('// Typing, keyboard navigation'))vm.runInContext(between('// Typing, keyboard navigation','const PV_BLOCK='),env);
  vm.runInContext(between('document.addEventListener("keydown",e=>{','/* ===== 8.').replace(/\s+$/, ''),env);
  vm.runInContext(between('document.addEventListener("change",e=>{','// 單日改為上班'),env);
  vm.runInContext(between('function setFactory(n){','\n',),env);
  env.FACTORIES=[1,2];
  if(appSource.includes("function beginCellEdit(btn){"))vm.runInContext(between("function beginCellEdit(btn){", "// 切格競態修復"),env);
  vm.runInContext(between('document.addEventListener("mousedown",e=>{','document.addEventListener("keydown",e=>{'),env);
  const fire=(type,event)=>{for(const fn of docListeners.get(type)||[])fn(event);};
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
    dequeue: delay=>{const at=timers.findIndex(x=>x.at===now+delay);assert.ok(at>=0);return timers.splice(at,1)[0].fn;},
    fire,
    get renders() { return renders; }, get archives() { return archives; } };
}

function frozen(value){return JSON.parse(JSON.stringify(value));}
function snapshot(h){return frozen({UI:h.env.UI,S:h.env.S});}
function request(h,kind='feature'){
  if(kind==='feature'){h.dispatch('feature-tour');h.dispatch('feature-topic','transfer');}
  else h.dispatch('tour');
}
function unchanged(h,before,focus){
  assert.equal(h.card(),null,'stale launch must not create an overlay');
  assert.deepEqual(snapshot(h),before,'stale callback preserves page, draft, focus state and data');
  assert.equal(h.document.activeElement,focus,'stale callback preserves DOM focus');
  assert.equal(h.env.localStorage.getItem('fsched-tour-done'),undefined,'cancellation is silent');
}
for(const kind of ['feature','onboarding']){
  for(const close of [false,true])test(`${kind}: newer actual modal${close?' opened and closed':''} defeats dequeued launch`,t=>{
    const h=harness(t);h.dispatch('page','shortage');request(h,kind);
    const stale=h.dequeue(kind==='feature'?300:350);
    h.env.openModal({t:'memo-edit',memoDraft:{text:'newer draft'}});
    if(close)h.env.closeModal();
    h.tick(20);const before=snapshot(h),focus=h.document.activeElement;
    stale();h.tick(1500);unchanged(h,before,focus);
  });
  test(`${kind}: newer page round trip defeats dequeued callback`,t=>{
    const h=harness(t);h.dispatch('page','shortage');request(h,kind);
    const stale=h.dequeue(kind==='feature'?300:350);
    h.dispatch('page','worklog');h.dispatch('page','shortage');
    const before=snapshot(h),focus=h.document.activeElement;stale();h.tick(1500);unchanged(h,before,focus);
  });
  test(`${kind}: busy import cannot be closed to launch a tour`,t=>{
    const h=harness(t);h.env.openModal({t:'import-preview',saving:true,draft:{text:'writing'}});
    const before=snapshot(h),focus=h.document.activeElement;
    h.dispatch(kind==='feature'?'feature-topic':'tour','transfer');h.tick(1500);unchanged(h,before,focus);
  });
}
for(const change of ['store','user','epoch','login','history'])test(`pending launch yields to ${change}`,t=>{
  const h=harness(t);h.env.STORE={kind:'supabase',session:{user:{id:'a'}},authEpoch:1};request(h);
  const stale=h.dequeue(300);
  if(change==='store')h.env.STORE={...h.env.STORE};
  if(change==='user')h.env.STORE.session={user:{id:'b'}};
  if(change==='epoch'){h.env.STORE.session={user:{id:'b'}};h.env.STORE.authEpoch++;h.env.STORE.session={user:{id:'a'}};h.env.STORE.authEpoch++;}
  if(change==='login'){h.env.showLogin();h.render();}
  if(change==='history')h.emit('popstate');
  const before=snapshot(h),focus=h.document.activeElement;stale();h.tick(1500);unchanged(h,before,focus);
});
test('new pending request replaces even a dequeued older request without completion',t=>{
  const h=harness(t);request(h);const stale=h.dequeue(300);
  h.dispatch('feature-tour');h.dispatch('feature-topic','worklog');stale();h.tick(400);
  assert.match(h.card().innerHTML,/工作紀錄入口/);assert.equal(h.env.localStorage.getItem('fsched-tour-done'),undefined);
  h.clickTour('next');assert.equal(h.env.UI.page,'worklog');
  h.clickTour('skip');assert.equal(h.card(),null);assert.equal(h.env.localStorage.getItem('fsched-tour-done'),undefined);
});
test('ordinary feature launch preserves prerequisite navigation and completion',t=>{
  const h=harness(t);h.dispatch('page','shortage');h.begin('transfer');
  h.clickTour('next');assert.equal(h.env.UI.page,'transferflow');
  while(h.card())h.clickTour('next');
  assert.equal(h.env.localStorage.getItem('fsched-tour-done'),undefined);
});
test('ordinary onboarding still marks completion on skip',t=>{
  const h=harness(t);request(h,'onboarding');h.tick(400);assert.ok(h.card());
  h.clickTour('skip');assert.ok(h.env.localStorage.getItem('fsched-tour-done'));
});
async function startup(h){
  Object.assign(h.env,{stopLoginViz:()=>{},readOnly:false,normalizeState:()=>{},loadPreferencesForDevice:()=>{},loadFactory:()=>{},location:{search:''},URLSearchParams,scheduleChat:null,installScheduleChat:()=>({refresh:()=>{}}),setInterval:()=>0,SOLVER:{check:()=>Promise.resolve(false)},updateSyncChip:()=>{},onRemoteChange:()=>{},onRealtimeStatus:()=>{}});
  Object.assign(h.env.STORE,{init:async()=>({}),load:async()=>h.env.S,subscribe:()=>{}});h.env.S.employees=[{id:'one'}];
  vm.runInContext(between('async function start(){','const crossFactoryUI='),h.env);
  await h.env.start();
}
for(const change of ['modal','page','done','tv','none'])test(`automatic startup rechecks ${change}`,async t=>{
  const h=harness(t);await startup(h);
  const stale=h.dequeue(600);
  if(change==='modal'){h.env.openModal({t:'memo-edit',memoDraft:{text:'keep'}});h.env.closeModal();h.tick(20);}
  if(change==='page')h.env.UI.page='shortage';
  if(change==='done')h.env.localStorage.setItem('fsched-tour-done','1');
  if(change==='tv')h.env.UI.tv=true;
  const before=snapshot(h),focus=h.document.activeElement;stale();h.tick(1000);
  if(change==='none'){assert.ok(h.card());h.clickTour('skip');}
  else {assert.equal(h.card(),null);assert.deepEqual(snapshot(h),before);assert.equal(h.document.activeElement,focus);}
});

for(const interaction of ['date','factory','Escape','cell-edit','input','pointerdown'])test(`real ${interaction} interaction supersedes pending launch`,t=>{
  const h=harness(t);h.dispatch('drawer','notes');request(h);const stale=h.dequeue(300);
  const target=h.document.createElement('input');
  if(interaction==='date'){
    target.id='datepick';target.value='2026-11-08';h.fire('change',{target});
    target.value='2026-11-07';h.fire('change',{target});assert.equal(h.env.UI.date,target.value);
  }
  if(interaction==='factory'){h.dispatch('factory','2');h.dispatch('factory','1');assert.equal(h.env.UI.factory,1);}
  if(interaction==='Escape'){h.fire('keydown',{target,key:'Escape'});assert.equal(h.env.UI.drawer,null);}
  if(interaction==='cell-edit'){
    target.setAttribute('data-act','cell-edit');target.setAttribute('data-cell','rush');target.setAttribute('data-id','new');target.setAttribute('data-key','note');
    let prevented=false;h.fire('mousedown',{target,preventDefault:()=>{prevented=true;}});
    assert.equal(prevented,true);assert.deepEqual(frozen(h.env.UI.editCell),{table:'rush',id:'new',key:'note'});
  }
  if(interaction==='input')h.fire('input',{target});
  if(interaction==='pointerdown')h.fire('pointerdown',{target});
  const before=snapshot(h),focus=h.document.activeElement;stale();h.tick(1500);unchanged(h,before,focus);
});
test('actual boot invalidates a dequeued launch across store A to B to A',async t=>{
  const h=harness(t);request(h);const stale=h.dequeue(300),a=h.env.STORE;
  // The boot function is real; startup is an unrelated asynchronous boundary here.
  Object.assign(h.env,{start:async()=>{},configureTableMarks:()=>{}});
  vm.runInContext(appSource.slice(appSource.indexOf('export async function boot(')).replace('export ',''),h.env);
  await h.env.boot({kind:'local'});await h.env.boot(a);
  const before=snapshot(h),focus=h.document.activeElement;stale();h.tick(1500);unchanged(h,before,focus);
});

test('capture invalidation precedes a same-event keyboard launch request',t=>{
  const h=harness(t);request(h);const stale=h.dequeue(300);
  const target=h.document.createElement('button');
  h.document.addEventListener('keydown',()=>h.dispatch('feature-topic','worklog'));
  h.fire('keydown',{target,key:'Enter'});stale();h.tick(400);
  assert.match(h.card().innerHTML,/工作紀錄入口/);h.clickTour('skip');
});

for(const kind of ['feature','onboarding'])test(`${kind}: click capture permits the launch requested by that same click`,t=>{
  const h=harness(t);request(h);const stale=h.dequeue(300);
  h.dispatch(kind==='feature'?'feature-topic':'tour','worklog');stale();h.tick(400);
  assert.ok(h.card());
  if(kind==='feature')assert.match(h.card().innerHTML,/工作紀錄入口/);
  else {
    const expected=h.env.ONBOARDING.find(step=>h.document.querySelector(step.sel)?.offsetParent);
    assert.ok(expected);assert.ok(h.card().innerHTML.includes('<b>'+expected.title+'</b>'));
  }
  h.clickTour('skip');
});
test('click without data-act silently supersedes a pending launch',t=>{
  const h=harness(t);request(h);const stale=h.dequeue(300);
  h.fire('click',{target:h.document.createElement('div')});
  const before=snapshot(h),focus=h.document.activeElement;stale();h.tick(1500);unchanged(h,before,focus);
});

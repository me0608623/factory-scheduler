import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Execute the complete tour module plus real app navigation actions and Notes/Orders
// renderers. Timers, DOM, geometry and surrounding app shell are synthetic: these
// tests validate lifecycle effects and target identity, not browser layout/focus.
function harness(){
  const app=readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const tour=readFileSync(new URL('../src/tour.js', import.meta.url), 'utf8');
  const between=(a,b)=>{const p=app.indexOf(a),q=app.indexOf(b,p+a.length);assert.ok(p>=0&&q>p,`extract ${a}`);return app.slice(p,q);};
  let now=0,seq=0,queue=[],errors=[];
  const setTimeout=(fn,delay=0)=>{const id=++seq;queue.push({id,at:now+delay,fn});return id;};
  const clearTimeout=id=>{queue=queue.filter(t=>t.id!==id);};
  const tick=(ms=0)=>{const end=now+ms;let n=0;while(true){queue.sort((a,b)=>a.at-b.at||a.id-b.id);if(!queue[0]||queue[0].at>end)break;const t=queue.shift();now=t.at;t.fn();assert.ok(++n<500,'timer loop');}now=end;};
  const listeners=new Map(), storage=[], scrolls=[], reads=[];
  let document,env;
  function matchesOne(el,sel){
    let rest=sel;
    const tag=rest.match(/^[a-z][\w-]*/i);if(tag){if(el.tagName!==tag[0].toLowerCase())return false;rest=rest.slice(tag[0].length);}
    const attrs=[...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
    for(const a of attrs){if(!Object.hasOwn(el.attrs,a[1])||(a[2]!==undefined&&el.attrs[a[1]]!==a[2]))return false;}
    rest=rest.replace(/\[[^\]]+\]/g,'');
    for(const m of rest.matchAll(/([.#])([\w-]+)/g)){if(m[1]==='.'?!el.className.split(/\s+/).includes(m[2]):el.id!==m[2])return false;}
    return true;
  }
  function matches(el,selector){return selector.split(',').some(s=>{const parts=s.trim().split(/\s+/);let at=el;if(!matchesOne(at,parts.pop()))return false;while(parts.length){const sel=parts.pop();at=at.parent;while(at&&!matchesOne(at,sel))at=at.parent;if(!at)return false;}return true;});}
  class Element{
    constructor(tag='div'){this.tagName=tag;this.attrs={};this.style={};this.children=[];this.parent=null;this.listeners=new Map();this.dataset={};this._html='';this.rect={left:100,top:100,width:200,height:40,bottom:140,right:300};}
    get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
    get id(){return this.attrs.id||'';}
    setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,s)=>s.toUpperCase())]=String(v);}
    get isConnected(){return this===document.body||!!this.parent?.isConnected;}
    get offsetParent(){return this.isConnected&&!this.hidden?document.body:null;}
    get offsetHeight(){return this.isConnected?180:0;}
    append(...els){for(const e of els){e.remove();e.parent=this;this.children.push(e);}}
    appendChild(el){this.append(el);return el;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
    addEventListener(k,fn){const a=this.listeners.get(k)||[];a.push(fn);this.listeners.set(k,a);}
    removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)||[]).filter(f=>f!==fn));}
    querySelectorAll(s){const out=[];const visit=e=>{for(const child of e.children){if(matches(child,s))out.push(child);visit(child);}};visit(this);return out;}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    closest(s){for(let p=this;p;p=p.parent)if(matches(p,s))return p;return null;}
    scrollIntoView(){scrolls.push({at:now,class:this.className,act:this.dataset.act,value:this.dataset.v,connected:this.isConnected});}
    getBoundingClientRect(){reads.push({at:now,connected:this.isConnected,class:this.className});return this.isConnected?this.rect:{left:0,top:0,width:0,height:0,bottom:0,right:0};}
    focus(){}
    click(){const target=this;for(let p=this;p;p=p.parent){for(const fn of p.listeners.get('click')||[])fn({target});}if(this.dataset.act)dispatch(this.dataset.act,this.dataset.v,this);}
    get innerHTML(){return this._html;}
    set innerHTML(html){this._html=html;for(const e of this.children)e.parent=null;this.children=[];let stack=[this];for(const m of html.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)){if(m[0][1]==='/'){if(stack.length>1)stack.pop();continue;}const el=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))el.setAttribute(a[1],a[2]);stack.at(-1).append(el);if(!['input','img','br','hr','meta','link'].includes(m[1])&&!m[0].endsWith('/>'))stack.push(el);}}
  }
  document={body:new Element('body'),createElement:t=>new Element(t),querySelector:s=>document.body.querySelector(s),querySelectorAll:s=>document.body.querySelectorAll(s)};
  const appRoot=new Element();appRoot.setAttribute('id','app');document.body.append(appRoot);
  const navMarkup=['people','orders','output','worklog','notes','more'].map(v=>`<button class="nav-${v}" data-act="drawer" data-v="${v}"></button>`).join('')+'<button data-act="feature-tour"></button><button data-act="today"></button>';
  const topMarkup='<div class="workspace-heading"></div><div class="datenav"></div><div class="factory-switch"></div>'+['shortage','transfer','floor'].map(v=>`<button class="pagelink ${v}" data-act="page" data-v="${v}"></button>`).join('');
  // Synthetic layout only. Drawer markup and navigation actions below are extracted, unmodified app functions.
  // Table body selectors are source-checked contracts; pageShell is the actual shared app renderer.
  assert.ok(app.includes('class="sheettable"')&&app.includes('class="tf-toggle"')&&app.includes('class="statstrip"'));
  function render(){
    let content='';
    if(env.UI.page){content=env.pageShell(env.UI.page,'','<div class="statstrip"></div><div class="sheettable"></div><label class="tf-toggle"></label>',false,'synthetic-add','');}
    else content='<div class="day-board"><div class="board-h"></div></div>';
    if(env.UI.drawer==='notes')content+=env.notesDrawerHTML();
    if(env.UI.drawer==='orders')content+=env.ordersDrawerHTML();
    if(env.UI.drawer==='output')content+='<div class="drawer-empty">No machines in this factory</div>';
    appRoot.innerHTML=topMarkup+navMarkup+content;
  }
  env={document,console:{error:(...x)=>errors.push(x)},innerWidth:1200,innerHeight:800,
    setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,16),
    addEventListener:(k,fn)=>{let s=listeners.get(k);if(!s){s=new Set();listeners.set(k,s);}s.add(fn);},
    removeEventListener:(k,fn)=>listeners.get(k)?.delete(fn),localStorage:{setItem:(k,v)=>storage.push([k,v]),getItem:()=>null},
    UI:{drawer:null,page:null,modal:null,date:'2026-11-07',view:'day',prefs:{language:'zh-TW'}},S:{memos:[],orders:[],execution:[],blocks:[]},STORE:{kind:'local'},PV:null,
    tx:x=>x,esc:String,render,$:s=>document.querySelector(s),window:{scrollTo:()=>{}},
    closeModal:()=>{env.UI.modal=null;},openModal:m=>{env.UI.modal=m;},setUrlView:()=>{},flashReturnRow:()=>{},todayStr:()=> '2026-11-07',
    toast:()=>{},canPermission:()=>false,canOrders:()=>true,tfAutoArchive:()=>0,
    directWriteStatus:()=>'',visibleMemos:()=>[],factoryOf:()=>1,
    shownOrders:()=>[],orderStatus:()=>{},orderCounters:()=>({rows:[],unfinished:0,late:0,dueToday:0}),
    SYNC:{state:'ok'},pageSaveState:()=>'',
  };
  vm.createContext(env);
  if(app.includes("let pendingTourLaunch="))vm.runInContext(between("let pendingTourLaunch=", "// End pending tour launch ownership."),env);
  vm.runInContext('"use strict";\n'+tour.replace(/^export /gm,'')+'\nglobalThis.TOURS=FEATURE_TOURS;globalThis.STEPS=TOUR_STEPS;',env);
  vm.runInContext(between('function notesDrawerHTML(){','function settingChoices(')+between('function ordersDrawerHTML(){','function monthDates(')+between('function pageShell(','function tfArchiveMonth('),env);
  const realStart=env.startTour;
  const instances=[];
  env.startTour=(steps,opts={})=>{const finish=[];const api=realStart(steps,{...opts,onFinish:v=>{finish.push(v);opts.onFinish?.(v);}});instances.push({api,finish});return api;};
  const actionNames=['today','drawer','drawer-close','page','feature-tour','feature-topic','tour'];
  const cases=actionNames.map(name=>{const p=app.indexOf(`case "${name}":`);assert.ok(p>=0);const end=app.indexOf('\n    case ',p+5);assert.ok(end>p);return app.slice(p,end);}).join('\n');
  function dispatch(act,v,element){env.a=element||{dataset:{act,v}};env.act=act;vm.runInContext('switch(act){'+cases+'}',env);}
  render();
  const emit=k=>{for(const fn of [...listeners.get(k)||[]])fn({type:k});};
  const card=()=>document.querySelector('.tour-card');
  const clickTour=k=>{const b=card()?.querySelector(`[data-tour="${k}"]`);assert.ok(b,`visible tour ${k}`);b.click();};
  const begin=key=>{dispatch('feature-tour');assert.equal(env.UI.modal.t,'feature-topics');dispatch('feature-topic',key);tick(350);};
  return {env,tick,emit,card,clickTour,begin,dispatch,listeners,storage,scrolls,reads,errors,instances,document,get queued(){return queue.map(t=>t.fn);},get pending(){return queue.length;},get now(){return now;}};
}

function assertStopped(h) {
  assert.equal(h.card(), null);
  assert.equal(h.document.querySelector('.tour-spot'), null);
  assert.equal(h.listeners.get('resize')?.size || 0, 0);
  assert.equal(h.listeners.get('scroll')?.size || 0, 0);
  assert.equal(h.pending, 0, 'no tour callbacks remain queued');
  assert.deepEqual(h.errors, []);
}

test('replacing Notes via the topic picker disposes its listeners and never reopens it', () => {
  const h = harness();
  h.begin('notes');
  h.clickTour('next');
  h.tick(370);
  assert.equal(h.env.UI.drawer, 'notes');
  assert.match(h.card().innerHTML, /便條牆/);
  const oldCard = h.card();
  h.begin('board');
  assert.equal(h.listeners.get('resize').size, 1);
  assert.equal(h.listeners.get('scroll').size, 1);
  h.instances[0].api.stop(true); // A retained, obsolete handle cannot stop the new tour.
  assert.match(h.card().innerHTML, /排程看板/);
  assert.deepEqual(h.instances[0].finish, [], 'replacement is disposal, not completion');
  assert.equal(oldCard.listeners.get('click').length, 0);
  h.clickTour('skip');
  h.dispatch('today');
  h.emit('resize');
  h.emit('scroll');
  h.tick(1000);
  assert.equal(h.env.UI.drawer, null);
  assert.deepEqual(h.instances[1].finish, [false]);
  assertStopped(h);
});

test('Skip during the missing Order card delay cannot reopen Orders', () => {
  const h = harness();
  h.begin('orders');
  h.clickTour('next');
  h.tick(370);
  assert.match(h.card().innerHTML, /工單總覽/);
  h.clickTour('next');
  const drawerAtSkip = h.env.UI.drawer;
  const pending = h.queued;
  h.clickTour('skip');
  h.tick(16); // Settle the app drawer action's independent focus frame.
  assertStopped(h);
  // A callback already dequeued by the host must be harmless even after cancellation.
  pending.forEach(fn => fn());
  h.tick(1000);
  assert.equal(h.env.UI.drawer, drawerAtSkip, 'no navigation after dismissal');
  assert.deepEqual(h.instances[0].finish, [false]);
  assertStopped(h);
});

test('replacement invalidates a pending prerequisite before it can navigate to later steps', () => {
  const h = harness();
  let calls = 0;
  const old = h.env.startTour([
    { sel: '.missing-one', title: 'one', text: '', pre: () => { calls++; } },
    { sel: '.missing-two', title: 'two', text: '', pre: () => { calls++; } },
  ]);
  const pending = h.queued;
  const current = h.env.startTour(h.env.TOURS.board, { markDone: false });
  pending.forEach(fn => fn());
  old.stop(true);
  h.tick(1000);
  assert.equal(calls, 1);
  assert.match(h.card().innerHTML, /排程看板/);
  assert.deepEqual(h.instances[0].finish, []);
  assert.deepEqual(h.storage, []);
  current.stop(false);
  assertStopped(h);
});

test('Skip at a missing final Output step finishes only once', () => {
  const h = harness();
  h.begin('output');
  h.clickTour('next');
  assert.equal(h.env.UI.drawer, 'output');
  h.clickTour('skip');
  h.tick(1000);
  assert.deepEqual(h.instances[0].finish, [false]);
  assertStopped(h);
});

test('Finish after resize resolves a Notes prerequisite only once', () => {
  const h = harness();
  h.begin('notes');
  h.clickTour('next');
  h.emit('resize');
  h.tick(50);
  assert.match(h.card().innerHTML, /便條牆/);
  h.clickTour('next');
  h.tick(1000);
  assert.deepEqual(h.instances[0].finish, [true]);
  assertStopped(h);
});

test('a paint callback reselects a replaced target instead of reading a detached node', () => {
  const h = harness();
  h.begin('board');
  h.clickTour('next');
  h.dispatch('today'); // The actual app action replaces the shell, including .datenav.
  const replacement = h.document.querySelector('.datenav');
  replacement.rect = { left: 200, top: 200, width: 240, height: 50, bottom: 250, right: 440 };
  h.tick(100);
  assert.ok(h.reads.every(r => r.connected), 'never measure a detached target');
  assert.equal(h.document.querySelector('.tour-spot').style.width, '252px');
  assert.match(h.card().innerHTML, /切換日期/);
  h.clickTour('skip');
  assertStopped(h);
});

test('a missing target at paint time is skipped without stale geometry', () => {
  const h = harness();
  h.begin('board');
  h.clickTour('next');
  h.document.querySelector('.datenav').remove();
  h.tick(100);
  assert.ok(h.reads.every(r => r.connected));
  assert.match(h.card().innerHTML, /切換廠別/);
  h.clickTour('next');
  assertStopped(h);
});

test('rapid Next/Previous and obsolete callbacks cannot overwrite the current step', () => {
  const h = harness();
  h.begin('board');
  h.clickTour('next');
  const stale = h.queued;
  h.clickTour('next');
  h.tick(50);
  assert.match(h.card().innerHTML, /切換廠別/);
  stale.forEach(fn => fn());
  assert.match(h.card().innerHTML, /切換廠別/);
  h.clickTour('prev');
  h.tick(50);
  assert.match(h.card().innerHTML, /切換日期/);
  h.clickTour('skip');
  assertStopped(h);
});

test('stop is idempotent, preserves markDone and leaves no detached button handlers', () => {
  const h = harness();
  const api = h.env.startTour(h.env.TOURS.board);
  h.tick(50);
  const card = h.card(), next = card.querySelector('[data-tour="next"]');
  h.emit('resize');
  const pending = h.queued;
  api.stop(false);
  api.stop(true);
  next.click();
  pending.forEach(fn => fn());
  h.tick(1000);
  assert.deepEqual(h.instances[0].finish, [false]);
  assert.deepEqual(h.storage, [['fsched-tour-done', '1']]);
  assert.equal(card.listeners.get('click').length, 0);
  assertStopped(h);
});

test('feature tours never mark onboarding done, including replacement and Skip', () => {
  const h = harness();
  h.begin('notes');
  h.begin('board');
  h.clickTour('skip');
  assert.deepEqual(h.storage, []);
  assert.deepEqual(h.instances[0].finish, []);
  assert.deepEqual(h.instances[1].finish, [false]);
  assertStopped(h);
});

test('missing-step retry state stays local to the tour rather than mutating reusable data', () => {
  const h = harness();
  let calls = 0;
  const step = Object.freeze({ sel: '.unavailable', title: 'missing', text: '', pre: () => { calls++; } });
  const steps = Object.freeze([step]);
  const first = h.env.startTour(steps, { markDone: false });
  assert.equal(calls, 1);
  first.stop(false);
  h.env.startTour(steps, { markDone: false });
  assert.equal(calls, 2, 'replaying a cancelled step tries its own prerequisite');
  h.emit('resize');
  h.emit('scroll');
  h.tick(319);
  assert.deepEqual(h.instances[1].finish, [], 'resize does not skip a still-pending prerequisite');
  h.tick(1);
  assert.deepEqual(h.instances[0].finish, [false]);
  assert.deepEqual(h.instances[1].finish, [true]);
  assert.equal(Object.hasOwn(step, '_preTried'), false);
  assertStopped(h);
});

test('empty tour completion and onFinish starting a new tour preserve ownership', () => {
  const h = harness();
  let replacement;
  const old = h.env.startTour([], {
    onFinish: finished => {
      assert.equal(finished, true);
      replacement = h.env.startTour(h.env.TOURS.board, { markDone: false });
    },
  });
  old.stop(false);
  h.tick(50);
  assert.match(h.card().innerHTML, /排程看板/);
  assert.equal(h.listeners.get('resize').size, 1);
  assert.deepEqual(h.storage, [['fsched-tour-done', '1']]);
  replacement.stop(false);
  assertStopped(h);
});

test('a prerequisite that starts a replacement cannot schedule more old-tour work', () => {
  const h = harness();
  h.env.startTour([{ sel: '.missing', title: 'missing', text: '', pre: () => {
    h.env.startTour(h.env.TOURS.board, { markDone: false });
  } }]);
  h.tick(1000);
  assert.match(h.card().innerHTML, /排程看板/);
  assert.equal(h.listeners.get('resize').size, 1);
  assert.equal(h.listeners.get('scroll').size, 1);
  assert.deepEqual(h.storage, []);
  assert.ok(h.instances.every(instance => instance.finish.length === 0));
  h.clickTour('skip');
  assertStopped(h);
});

test('ordinary Next, Previous, resize, scroll and Finish remain usable', () => {
  const h = harness();
  h.begin('board');
  h.clickTour('next');
  h.tick(50);
  assert.match(h.card().innerHTML, /切換日期/);
  h.clickTour('prev');
  h.tick(50);
  assert.match(h.card().innerHTML, /排程看板/);
  h.env.innerWidth = 320;
  h.emit('resize');
  h.emit('scroll');
  h.tick(50);
  assert.equal(h.card().style.maxWidth, '296px');
  h.clickTour('next'); h.tick(50);
  h.clickTour('next'); h.tick(50);
  h.clickTour('next');
  assert.deepEqual(h.instances[0].finish, [true]);
  assertStopped(h);
});

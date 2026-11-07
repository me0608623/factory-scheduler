import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_PREFERENCES, patchPreference, savePreferences, loadPreferences, applyPreferences } from '../src/settings.js';

// Execute the real visual module. Only the lazy Three dependency is substituted:
// these are modeled DOM/WebGL behavior tests, not browser or GPU rendering tests.
const source = readFileSync(new URL('../src/visual.js', import.meta.url), 'utf8');
let moduleId = 0;
function environment(t, osReduced, search) {
  const frames = new Map(), listeners = new Map();
  let sequence = 0, draws = 0, renders = 0, rendererCount = 0;
  class Element {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.attrs = new Map();
      this.style = { setProperty() {} }; this.classList = { add() {} };
      this.clientWidth = 800; this.clientHeight = 600;
    }
    setAttribute(k, v) { this.attrs.set(k, v); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    removeAttribute(k) { this.attrs.delete(k); }
    get firstChild() { return this.children[0] ?? null; }
    appendChild(child) { this.insertBefore(child, null); }
    insertBefore(child, before) {
      child.remove();
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
      child.parent = this;
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
      this.parent = null;
    }
    getContext() {
      return new Proxy({ canvas: this, getShaderParameter: () => true,
        getAttribLocation: () => 0, createShader: () => ({}), createProgram: () => ({}),
        createBuffer: () => ({}), getUniformLocation: () => ({}), drawArrays: () => draws++
      }, { get: (o, k) => o[k] ?? (() => {}) });
    }
  }
  class Object3D {
    constructor(geometry, material) {
      this.geometry = geometry; this.material = material; this.rotation = {};
      this.position = { set() {} };
    }
    add() {} lookAt() {} updateProjectionMatrix() {} setAttribute() {} dispose() {}
  }
  const three = {
    WebGLRenderer: class {
      constructor() { rendererCount++; this.domElement = new Element('canvas'); }
      setPixelRatio() {} setSize() {} dispose() {} render() { renders++; }
    },
    ...Object.fromEntries(['Scene', 'PerspectiveCamera', 'Group', 'Mesh', 'IcosahedronGeometry',
      'MeshBasicMaterial', 'BufferGeometry', 'BufferAttribute', 'Points', 'PointsMaterial'].map(k => [k, Object3D]))
  };
  const globals = {
    document: { documentElement: new Element('html'), head: new Element('head'), createElement: tag => new Element(tag) },
    location: { search }, matchMedia: query => {
      assert.equal(query, '(prefers-reduced-motion: reduce)'); return { matches: osReduced };
    }, devicePixelRatio: 1,
    window: { addEventListener: (k, f) => listeners.set(f, k), removeEventListener: (k, f) => listeners.delete(f) },
    requestAnimationFrame: f => { frames.set(++sequence, f); return sequence; },
    cancelAnimationFrame: id => frames.delete(id), __motionTestThree: three
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  return { Element, frames, listeners, counts: () => ({ draws, renders, rendererCount }) };
}
async function visualModule() {
  const id = ++moduleId;
  const stub = 'data:text/javascript,' + encodeURIComponent(
    'export const { WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, IcosahedronGeometry, MeshBasicMaterial, BufferGeometry, BufferAttribute, Points, PointsMaterial } = globalThis.__motionTestThree;'
  ) + `#${id}`;
  return import('data:text/javascript;base64,' + Buffer.from(source.replace('import("three")', `import(${JSON.stringify(stub)})`)).toString('base64') + `#${id}`);
}
function applyStoredMotion(motion) {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  savePreferences(patchPreference(DEFAULT_PREFERENCES, 'motion', motion), storage);
  applyPreferences(loadPreferences(storage));
  assert.equal(document.documentElement.getAttribute('data-motion'), motion);
}

for (const motion of ['reduce', 'system']) {
  for (const osReduced of [false, true]) {
    for (const override of [false, true]) {
      test(`visuals: app ${motion}, OS reduce=${osReduced}, QA override=${override}`, async t => {
        const env = environment(t, osReduced, override ? '?motion=full' : '');
        applyStoredMotion(motion);
        const { mountBackdrop, mount3D } = await visualModule();
        const reduced = !override && (motion === 'reduce' || osReduced);
        const backdrop = mountBackdrop(new env.Element());
        const three = await mount3D(new env.Element());
        assert.equal(backdrop.mode, reduced ? 'reduced-motion' : 'webgl');
        assert.equal(three.mode, reduced ? 'reduced-motion' : 'three');
        assert.deepEqual(env.counts(), reduced ? { draws: 0, renders: 0, rendererCount: 0 } : { draws: 1, renders: 1, rendererCount: 1 });
        assert.equal(env.frames.size, reduced ? 0 : 2);
        assert.equal(env.listeners.size, reduced ? 0 : 3);
        if (!reduced) {
          const pending = [...env.frames.values()]; env.frames.clear(); pending.forEach(frame => frame());
          assert.equal(env.frames.size, 2);
          assert.equal(env.counts().draws, 2); assert.equal(env.counts().renders, 2);
        }
        backdrop.stop(); three.stop();
        assert.equal(env.frames.size, 0); assert.equal(env.listeners.size, 0);
      });
    }
  }
}

test('switching Reduced back to System restores the OS decision on remount', async t => {
  const env = environment(t, false, '');
  const { mountBackdrop, mount3D } = await visualModule();
  for (const motion of ['reduce', 'system', 'reduce']) {
    applyStoredMotion(motion);
    const backdrop = mountBackdrop(new env.Element()), three = await mount3D(new env.Element());
    assert.equal(env.frames.size, motion === 'reduce' ? 0 : 2);
    backdrop.stop(); three.stop();
    assert.equal(env.frames.size, 0);
  }
});

// Exercise the actual fresh-login startup, preference loader, login markup and
// visual lifecycle functions. Auth and DOM nodes are modeled; no account or real
// browser preferences are read or changed.
const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const startupCode = appSource.slice(appSource.indexOf('async function start(){'), appSource.indexOf('const crossFactoryUI='));
const preferenceCode = appSource.slice(appSource.indexOf('function loadPreferencesForDevice(){'), appSource.indexOf('\n', appSource.indexOf('function loadPreferencesForDevice(){')));
const loginCode = appSource.slice(appSource.indexOf('function initVisualDemo(){'), appSource.indexOf('// ---------- 未排工作、保存試排與現場回報 ----------'));
for (const motion of ['reduce', 'system']) {
  for (const osReduced of [false, true]) {
    for (const override of [false, true]) {
      test(`fresh login: saved ${motion}, OS reduce=${osReduced}, QA override=${override}`, async t => {
        const env = environment(t, osReduced, override ? '?motion=full' : '');
        const values = new Map();
        const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
        savePreferences(patchPreference(DEFAULT_PREFERENCES, 'motion', motion), storage);
        // Saved preference exists, but a fresh document has not applied it yet.
        assert.equal(document.documentElement.getAttribute('data-motion'), null);
        const visual = await visualModule(), modes = {}, mounts = [], calls = [];
        const nodes = new Map(['app', 'login-bg', 'loginf', 'lg-signup', 'lg-reset'].map(id => {
          const element = new env.Element(); element.addEventListener = () => {}; return [id, element];
        }));
        document.getElementById = id => nodes.get(id);
        const ctx = vm.createContext({
          document, UI: {}, STORE: { init: async () => { calls.push('init'); return { needLogin: true }; },
            load: () => assert.fail('unauthenticated startup must not load account data') },
          loadPreferences: () => { calls.push('preferences'); return loadPreferences(storage); }, applyPreferences,
          $: selector => nodes.get(selector.slice(1)), ensureVisualStyles: visual.ensureVisualStyles,
          liquidLogoSVG: visual.liquidLogoSVG, environmentHTML: () => '', tx: s => s, esc: s => s, RUNTIME: { mode: 'test' },
          mountBackdrop: (...args) => {
            calls.push('backdrop'); const handle = visual.mountBackdrop(...args); modes.backdrop = handle.mode; return handle;
          },
          mount3D: (...args) => {
            const mount = visual.mount3D(...args).then(handle => { modes.three = handle.mode; return handle; });
            mounts.push(mount); return mount;
          }
        });
        vm.runInContext(preferenceCode + '\n' + loginCode + '\n' + startupCode, ctx);
        await ctx.start(); await Promise.all(mounts); await new Promise(setImmediate);
        const reduced = !override && (motion === 'reduce' || osReduced);
        assert.equal(document.documentElement.getAttribute('data-motion'), motion);
        assert.equal(ctx.UI.prefs.motion, motion);
        assert.deepEqual(calls, ['init', 'preferences', 'backdrop']);
        assert.deepEqual(modes, { backdrop: reduced ? 'reduced-motion' : 'webgl', three: reduced ? 'reduced-motion' : 'three' });
        assert.deepEqual(env.counts(), reduced ? { draws: 0, renders: 0, rendererCount: 0 } : { draws: 1, renders: 1, rendererCount: 1 });
        ctx.stopLoginViz();
        assert.equal(env.frames.size, 0); assert.equal(env.listeners.size, 0);
      });
    }
  }
}

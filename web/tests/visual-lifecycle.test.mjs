// Behavioral ownership tests: actual visual module and app functions, modeled DOM/WebGL.
// These are not browser E2E tests; Three's asynchronous completion is deliberately deferred.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const visual = fs.readFileSync(new URL('../src/visual.js', import.meta.url), 'utf8');
function harness({reduced=false, webgl=true, shader=true, deferred=false}={}) {
  const frames=new Map(), listeners=new Map(), deleted=[], pending=[], instances=[];
  let seq=0;
  class Element {
    constructor(tag='div') { this.tag=tag; this.style={}; this.children=[]; this.classList={add(){},toggle(){}}; this.clientWidth=800; this.clientHeight=600; }
    get firstChild(){return this.children[0];}
    appendChild(c){this.insertBefore(c,null);}
    insertBefore(c,b){c.remove();this.children.splice(b?this.children.indexOf(b):this.children.length,0,c);c.parent=this;}
    remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
    addEventListener(){}
    getContext(){return webgl ? new Proxy({canvas:this,getShaderParameter:()=>shader,getAttribLocation:()=>0,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getUniformLocation:()=>({}),deleteShader:s=>deleted.push(s),deleteProgram:s=>deleted.push(s),deleteBuffer:s=>deleted.push(s)}, {get:(o,k)=>o[k]??(()=>{})}) : null;}
  }
  const root=new Element(), els={app:root};
  Object.defineProperty(root,'innerHTML',{set(html){for(const c of [...this.children])c.remove();for(const k of Object.keys(els))if(k!=='app')delete els[k];for(const [,id] of html.matchAll(/id="([^"]+)"/g)){els[id]=new Element();this.appendChild(els[id]);}}});
  const context=vm.createContext({document:{head:new Element(),body:new Element(),createElement:t=>new Element(t),getElementById:id=>els[id],querySelector:()=>null},location:{search:''},URLSearchParams,matchMedia:()=>({matches:reduced}),devicePixelRatio:1,performance:{now:()=>0},window:{scrollY:0,scrollTo(){},addEventListener:(k,f)=>listeners.set(f,k),removeEventListener:(k,f)=>listeners.delete(f)},requestAnimationFrame:f=>{frames.set(++seq,f);return seq;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(visual.replaceAll('export ',''),context);
  context.mount3D=()=>{
    const instance={stops:0,stop(){this.stops++;}};instances.push(instance);
    return deferred?new Promise((resolve,reject)=>pending.push({resolve:()=>resolve(instance),reject})):Promise.resolve(instance);
  };
  Object.assign(context,{$:s=>els[s.slice(1)]||null,environmentHTML:()=>'',tx:s=>s,esc:s=>s,RUNTIME:{mode:'test'},I18N:{},UI:{prefs:{},view:'day'},PV:null,scheduleChat:null});
  for(const name of ['bannerHTML','dayHTML','generalBoardHTML','topHTML','appNavHTML','drawerHTML'])context[name]=()=>'';
  context.visualDemoPageHTML=()=>'<div id="vd-stage"></div>';
  for(const name of ['initScheduleLocator','initFloatWins','watchHeader'])context[name]=()=>{};
  vm.runInContext(app.slice(app.indexOf('function initVisualDemo(){'),app.indexOf('// ---------- 未排工作、保存試排與現場回報 ----------')),context);
  vm.runInContext(app.slice(app.indexOf('function render(){'),app.indexOf('function render(){')+app.slice(app.indexOf('function render(){')).indexOf('\n}\n')+3),context);
  return {context,root,els,frames,listeners,deleted,pending,instances,Element,run:code=>vm.runInContext(code,context)};
}
const flush=()=>new Promise(setImmediate);
for(const [mode,options] of [['webgl',{}],['css',{webgl:false}],['reduced-motion',{reduced:true}]]) {
  test(`ordinary and repeated login retain ${mode} backdrop, teardown preserves caller container`,async()=>{
    const h=harness(options);h.run('showLogin()');await flush();
    const first=h.els['login-bg'];assert.equal(first.parent,h.root);assert.equal(first.children.length,1);
    assert.equal(h.frames.size,mode==='webgl'?1:0);
    h.run('showLogin("retry")');await flush();
    assert.equal(first.children.length,0);assert.equal(h.instances[0].stops,1);
    const current=h.els['login-bg'];assert.equal(current.parent,h.root);assert.equal(current.children.length,1);
    h.run('stopLoginViz(); stopLoginViz()');
    assert.equal(current.parent,h.root);assert.equal(current.children.length,0);assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);assert.equal(h.instances[1].stops,1);
  });
}
test('login → demo → demo redraw → board stops effects before DOM replacement',async()=>{
  const h=harness();h.run('showLogin()');await flush();
  for(let i=0;i<3;i++) {h.run('UI.page="visual-demo"; render()');await flush();assert.equal(h.frames.size,1);assert.equal(h.listeners.size,1);assert.equal(h.els['vd-stage'].children.length,1);}
  h.run('UI.page=null; render()');await flush();assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);assert.ok(h.instances.every(i=>i.stops===1));
});
test('late 3D completion cannot replace newer owner or survive teardown',async()=>{
  const h=harness({deferred:true});h.run('showLogin(); showLogin()');
  h.pending[1].resolve();await flush();h.pending[0].resolve();await flush();
  assert.equal(h.instances[0].stops,1);assert.equal(h.instances[1].stops,0);
  h.run('stopLoginViz()');assert.equal(h.instances[1].stops,1);
  h.run('showLogin(); stopLoginViz()');h.pending[2].resolve();await flush();assert.equal(h.instances[2].stops,1);assert.equal(h.frames.size,0);
});
test('failed async 3D mount leaves backdrop owned and cleanable',async()=>{
  const h=harness({deferred:true});h.run('showLogin()');h.pending[0].reject(new Error('renderer unavailable'));await flush();
  assert.equal(h.frames.size,1);h.run('stopLoginViz()');assert.equal(h.frames.size,0);
});
for(const options of [{},{webgl:false},{reduced:true},{shader:false}]) {
  test(`backdrop cleanup is owned and idempotent ${JSON.stringify(options)}`,()=>{
    const h=harness(options),stage=new h.Element(),content=new h.Element();h.root.appendChild(stage);stage.appendChild(content);h.context.stage=stage;
    h.run('globalThis.bg=mountBackdrop(stage)');const callbacks=[...h.frames.values()];h.run('bg.stop(); bg.stop()');
    assert.equal(stage.parent,h.root);assert.deepEqual(stage.children,[content]);assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
    for(const cb of callbacks)cb();assert.equal(h.frames.size,0,'already queued callback cannot restart stopped loop');
    if(options.webgl!==false && !options.reduced && options.shader!==false)assert.equal(h.deleted.length,4);
  });
}
test('actual 3D cleanup disposes each owned resource once and cannot restart a stopped frame',async()=>{
  const h=harness(),resources=[];
  class Resource {constructor(){this.stops=0;resources.push(this);}dispose(){this.stops++;}}
  class Object3D {constructor(){this.rotation={};this.position={set(){}};}add(){}lookAt(){}updateProjectionMatrix(){}}
  class Renderer extends Resource {constructor(){super();this.domElement=new h.Element('canvas');}setPixelRatio(){}setSize(){}render(){}}
  class Geometry extends Resource {setAttribute(){}}
  class Mesh extends Object3D {constructor(geometry,material){super();this.geometry=geometry;this.material=material;}}
  h.context.THREEStub={WebGLRenderer:Renderer,Scene:Object3D,PerspectiveCamera:Object3D,Group:Object3D,Mesh,IcosahedronGeometry:Geometry,MeshBasicMaterial:Resource,BufferGeometry:Geometry,BufferAttribute:class {},Points:Mesh,PointsMaterial:Resource};
  // Only the third-party import is modeled; execute the production mount and stop bodies.
  vm.runInContext(visual.slice(visual.indexOf('export async function mount3D')).replace('export ','').replace('await import("three")','await Promise.resolve(THREEStub)'),h.context);
  const stage=new h.Element(),content=new h.Element();h.root.appendChild(stage);stage.appendChild(content);h.context.stage=stage;
  const instance=await h.run('mount3D(stage)');assert.equal(h.frames.size,1);assert.equal(h.listeners.size,2);
  const callbacks=[...h.frames.values()];instance.stop();instance.stop();
  assert.equal(stage.parent,h.root);assert.deepEqual(stage.children,[content]);assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
  assert.equal(resources.length,7);assert.ok(resources.every(r=>r.stops===1));
  for(const cb of callbacks)cb();assert.equal(h.frames.size,0);
});

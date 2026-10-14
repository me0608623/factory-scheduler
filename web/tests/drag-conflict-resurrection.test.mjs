// R23：拖曳中版本衝突恢復補讀會替換 S；若遠端已刪除被拖的那段工作，
// pointerup 用拖曳舊引用叫 dragPreview 會把它「復活」（{...b} 塞回＋pin），
// 套用後覆蓋另一裝置的刪除。守門：pointerup 時 block 已不在 S → 中止拖曳並提示。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

// ---- 測試 1：dragPreview 的復活機制（危害重現）----
const ctx={};
ctx.S={blocks:[{id:'OTHER',oid:'o2',step:0,date:'2026-01-05',s:480,e:600,m:'M1',emp:'e2',qty:4,pin:true}],
  orders:[],products:[],employees:[],machines:[],execution:[]};
ctx.withState=(st,fn)=>{const o=ctx.S;ctx.S=st;try{return fn()}finally{ctx.S=o}};
ctx.reflow=()=>{};ctx.cascade=()=>{};ctx.lateCheck=()=>{};ctx.issuesOf=()=>[];ctx.label=b=>b.id;
ctx.order=()=>({code:'X1',due:'2026-01-20',qty:10,pid:'p1'});
ctx.keyB=x=>x.id;ctx.bEnd=x=>x.e;ctx.bAbs=x=>x.s;ctx.readyAbs=()=>Infinity;ctx.nowAbs=()=>0;
ctx.placementConflicts=()=>({});ctx.remainingQty=()=>0;ctx.sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);
ctx.dateOfAbs=x=>x;ctx.absOf=(d,s)=>s;ctx.mdw=x=>x;ctx.hm=x=>x;ctx.stepName=()=>'';
vm.createContext(ctx);
const atDP=source.indexOf('function dragPreview(');
assert.ok(atDP>=0,'dragPreview found');
vm.runInContext(source.slice(atDP,source.indexOf('\ndocument.addEventListener("pointerup"',atDP)),ctx);
const stale={id:'STALE',oid:'o1',step:0,date:'2026-01-05',s:480,e:600,m:'M1',emp:'e1',qty:5,pin:false};
test('dragPreview resurrects a remotely-deleted block when fed a stale drag reference (hazard)',()=>{
  const prop=ctx.dragPreview(stale,'M2',600);
  const zomb=prop.after.blocks.find(x=>x.id==='STALE');
  assert.ok(zomb&&zomb.pin===true&&zomb.m==='M2','stale block is pushed back, pinned and moved — apply would override the remote delete');
});

// ---- 測試 2：pointerup 守門行為 ----
let handler=null;const events=[];
const h={document:{addEventListener:(t,h2)=>{if(t==='pointerup')handler=h2}},
  drag:null,S:{blocks:[{id:'KEEP',oid:'o2',step:0,date:'2026-01-05',s:480,e:600,m:'M1',emp:'e2',qty:4}]},
  endDrag:()=>{},openModal:o=>events.push(['open',o.id]),enterManualPreview:p=>events.push(['preview',p&&p.b]),
  dragPreview:(b,m)=>({b:m}),toast:t=>events.push(['toast',t]),tx:x=>x};
vm.createContext(h);
const atPU=source.indexOf('document.addEventListener("pointerup"',atDP);
vm.runInContext(source.slice(atPU,source.indexOf('\n});',atPU)+4),h);
const kinds=()=>({preview:events.some(e=>e[0]==='preview'),toast:events.some(e=>e[0]==='toast'),open:events.some(e=>e[0]==='open')});

test('pointerup aborts a move whose block was deleted by mid-drag conflict recovery',()=>{
  events.length=0;h.drag={b:{...stale},started:true,mode:'move',target:{m:'M2',s:600}};handler();
  const k=kinds();
  assert.equal(k.toast,true,'user is told the block is gone');
  assert.equal(k.preview,false,'no preview is built from the stale reference');
});

test('pointerup still previews a normal move when the block exists',()=>{
  events.length=0;h.drag={b:{...stale,id:'KEEP'},started:true,mode:'move',target:{m:'M2',s:600}};handler();
  assert.equal(events.some(e=>e[0]==='preview'&&e[1]==='M2'),true,'drag still works');
  assert.equal(events.some(e=>e[0]==='toast'),false);
});

test('pointerup aborts a resize whose block was deleted mid-drag',()=>{
  events.length=0;h.drag={b:{...stale},started:true,mode:'resize',target:{e:660,qty:3}};handler();
  const k=kinds();
  assert.equal(k.toast,true,'user is told the block is gone');
  assert.equal(k.preview,false,'no preview is built from the stale reference');
});

test('plain click on a vanished block still opens the (null-guarded) blk modal',()=>{
  events.length=0;h.drag={b:{id:'STALE'},started:false};handler();
  assert.equal(events.some(e=>e[0]==='open'&&e[1]==='STALE'),true,'click path unchanged');
});

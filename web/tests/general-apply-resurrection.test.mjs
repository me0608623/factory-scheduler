// R24：一般工作預覽開著時，較早的佇列寫入衝突恢復會前景替換 S（不受 modal 守門）。
// 若遠端已刪除該段一般工作，gw-apply 的 filter().concat(D) 會把它「復活」——
// 套用後覆蓋另一裝置的刪除。守門：預覽時存在、套用時已消失 → 中止＋提示。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

const events=[];
const ctx={};
ctx.S={workAssignments:[{id:'A1',workId:'w1',emp:'e1',resourceId:null,date:'2026-01-05',s:480,e:600}],setupPending:false};
ctx.UI={modal:null};ctx.PV=null;ctx.readOnly=false;
ctx.assignmentIssues=()=>[];ctx.dayInfo=()=>({win:[]});ctx.todayStr=()=>'2026-01-05';ctx.nowMin=()=>0;
ctx.toast=t=>events.push(['toast',t]);ctx.pushUndo=()=>events.push(['undo']);
ctx.assignments=s=>s.workAssignments;ctx.closeModal=()=>{ctx.UI.modal=null};
ctx.commit=async(entry,perm)=>{events.push(['commit',perm]);return true};
ctx.tx=x=>x;ctx.workName=()=>'W';ctx.emp=()=>({name:'E'});
ctx.openModal=m=>{ctx.UI.modal=m};
ctx.structuredClone=globalThis.structuredClone||JSON.parse.bind(JSON);
vm.createContext(ctx);
const atPG=source.indexOf('function previewGeneral(');
assert.ok(atPG>=0,'previewGeneral found');
vm.runInContext(source.slice(atPG,source.indexOf('\nMODALS[',atPG)),ctx);
const atGA=source.indexOf("MODAL_ACT['gw-apply']=()=>{");
assert.ok(atGA>=0,'gw-apply found');
ctx.MODAL_ACT={};
vm.runInContext(source.slice(atGA,source.indexOf('\n};',atGA)+3),ctx);

test('gw-apply must not resurrect a general assignment deleted by mid-preview conflict recovery',()=>{
  events.length=0;
  const moved={id:'A1',workId:'w1',emp:'e1',resourceId:null,date:'2026-01-05',s:600,e:720};
  ctx.previewGeneral(moved);                       // 預覽時 A1 存在
  assert.equal(ctx.UI.modal.t,'general-preview');
  ctx.S={workAssignments:[],setupPending:false};   // 衝突恢復前景補讀替換 S：A1 已被遠端刪除
  ctx.MODAL_ACT['gw-apply']();
  assert.equal(ctx.S.workAssignments.some(a=>a.id==='A1'),false,'deleted assignment must stay deleted');
  assert.equal(events.some(e=>e[0]==='commit'),false,'no write may be committed');
  assert.equal(events.some(e=>e[0]==='toast'),true,'user is told why nothing was applied');
});

test('gw-apply still inserts a brand-new general assignment',()=>{
  events.length=0;
  const fresh={id:'NEW1',workId:'w1',emp:'e1',resourceId:null,date:'2026-01-05',s:600,e:720};
  ctx.previewGeneral(fresh);
  ctx.MODAL_ACT['gw-apply']();
  assert.equal(ctx.S.workAssignments.some(a=>a.id==='NEW1'),true,'new assignment is inserted');
  assert.equal(events.some(e=>e[0]==='commit'),true);
});

test('gw-apply still applies a normal move of an existing assignment',()=>{
  events.length=0;
  const moved={id:'A1',workId:'w1',emp:'e1',resourceId:null,date:'2026-01-05',s:600,e:720};
  ctx.previewGeneral(moved);
  ctx.MODAL_ACT['gw-apply']();
  const a=ctx.S.workAssignments.find(x=>x.id==='A1');
  assert.ok(a&&a.s===600,'existing assignment is moved');
  assert.equal(events.some(e=>e[0]==='commit'),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { floorCells, hitFloor, renderFloor } from '../src/floor.js';

const day = '2026-10-05';
const S = {
  machines: [
    { id: 'a', label: 'A機', proc: '裁切', factory: 1, faults: [{ date: day, fixed: false, s: 480, e: 720 }] },
    { id: 'b', label: 'B機', proc: '裁切', factory: 1, faults: [{ date: '2026-10-04', fixed: false }] },
    { id: 'c', label: 'C機', proc: '包裝', factory: 2, faults: [] },
  ],
  blocks: [
    { m: 'b', date: day, oid: 'o1', emp: 'e1', s: 480, e: 600 },
    { m: 'b', date: '2026-10-04', oid: 'o2', emp: 'e1', s: 480, e: 600 },
  ],
  orders: [{ id: 'o1', code: 'W01' }, { id: 'o2', code: 'W02' }],
  employees: [{ id: 'e1', name: '小明' }],
  machineLayout: [],
};

test('廠別過濾與狀態判定：故障＞當日排程＞閒置', () => {
  const cells = floorCells(S, 1, day);
  assert.equal(cells.length, 2);
  const by = Object.fromEntries(cells.map((c) => [c.id, c]));
  assert.equal(by.a.status, 'fault');            // 當日未修復故障
  assert.equal(by.b.status, 'busy');             // 其他日的故障不算；當日有排程
  const f2 = floorCells(S, 2, day);
  assert.equal(f2.length, 1);
  assert.equal(f2[0].status, 'idle');
});

test('修復的故障不再標紅', () => {
  const fixed = structuredClone(S);
  fixed.machines[0].faults[0].fixed = true;
  const cells = floorCells(fixed, 1, day);
  assert.equal(cells.find((c) => c.id === 'a').status, 'idle');
});

test('摘要包含工單與人員；閒置為空', () => {
  const b = floorCells(S, 1, day).find((c) => c.id === 'b');
  assert.match(b.detail, /W01/);
  assert.match(b.detail, /小明/);
  assert.equal(b.loadMin, 120);
  assert.equal(floorCells(S, 2, day)[0].detail, '');
});

test('沒有佈局時全部自動排列、不重疊', () => {
  const cells = floorCells(S, 1, day);
  assert.ok(cells.every((c) => c.x != null && c.y != null));
  const keys = new Set(cells.map((c) => c.x + ',' + c.y));
  assert.equal(keys.size, cells.length);
  assert.ok(cells.every((c) => c.x >= 0 && c.x <= 98 && c.y >= 0));
});

test('欄數自適應：窄欄時格子變寬、不重疊', () => {
  const cells = floorCells(S, 1, day, 3);
  assert.equal(cells.length, 2);
  const [a, b] = cells;
  assert.ok(a.w > 28, '3 欄時格寬 > 28 正規化單位');
  assert.ok(Math.abs(a.x - b.x) >= Math.min(a.w, b.w) || Math.abs(a.y - b.y) >= 8, '不重疊');
  assert.ok(cells.every((c) => c.x >= 0 && c.x + c.w <= 100.01));
});

test('machine_layout 座標優先，其餘自動補位不與之重疊', () => {
  const withLayout = { ...S, machineLayout: [{ machineId: 'a', x: 50, y: 50 }] };
  const cells = floorCells(withLayout, 1, day);
  const a = cells.find((c) => c.id === 'a');
  assert.equal(a.x, 50); assert.equal(a.y, 50);
  const auto = cells.find((c) => c.id === 'b');
  const overlap = auto.x < 60 && auto.x + 10 > 50 && auto.y < 58 && auto.y + 8 > 50;
  assert.equal(overlap, false);
});

test('hitFloor：邊界端點命中、重疊取第一個、外部與空陣列回 null',()=>{
  const rects=[{x:10,y:10,w:20,h:20},{x:25,y:10,w:20,h:20}];
  assert.equal(hitFloor(rects,10,10),rects[0]);
  assert.equal(hitFloor(rects,30,30),rects[0],'右下端點也算命中');
  assert.equal(hitFloor(rects,26,15),rects[0],'重疊區取第一個');
  assert.equal(hitFloor(rects,50,10),null);
  assert.equal(hitFloor([],1,1),null);
});

test('renderFloor：DPR 尺寸換算、狀態用色與故障文字、截斷、回傳矩形可命中',()=>{
  const prevGCS=globalThis.getComputedStyle,prevDoc=globalThis.document;
  globalThis.getComputedStyle=()=>({getPropertyValue:()=>''});
  globalThis.document={documentElement:{}};
  const ops=[],fills=[],alphas=[],texts=[];
  const ctx={scale:(...a)=>ops.push(['scale',...a]),
    set fillStyle(v){fills.push(v);},get fillStyle(){return fills.at(-1);},
    set globalAlpha(v){alphas.push(v);},get globalAlpha(){return alphas.at(-1);},
    set font(v){ops.push(['font',v]);},get font(){return '';},
    strokeStyle:'',textAlign:'',
    beginPath:()=>{},roundRect:(...a)=>ops.push(['roundRect',...a]),fill:()=>ops.push(['fill']),
    stroke:()=>ops.push(['stroke']),fillText:(t,x,y)=>texts.push([t,x,y])};
  const canvas={clientWidth:900,style:{},getContext:()=>ctx,width:0,height:0};
  try{
    const cells=[
      {id:'a',label:'超長機台名稱測試',process:'切',status:'fault',detail:'',loadMin:180,x:0,y:0,w:10,h:8},
      {id:'b',label:'B',process:'磨',status:'idle',detail:'',loadMin:0,x:50,y:0,w:10,h:8},
      {id:'c',label:'C',process:'切',status:'busy',detail:'',loadMin:180,x:0,y:9,w:10,h:8}];
    const rects=renderFloor(canvas,cells,{pixelRatio:2});
    assert.equal(canvas.width,1800,'W×DPR');
    assert.equal(canvas.height,404,'H=(40+2列×9×9)×DPR');
    assert.equal(canvas.style.height,'202px');
    assert.ok(ops.some(o=>o[0]==='scale'&&o[1]===2&&o[2]===2),'ctx 以 DPR 縮放');
    assert.ok(fills.includes('#DC2626'),'故障格用紅');
    assert.ok(fills.includes('#315FA7'),'忙碌格用藍');
    assert.ok(fills.includes('#9AA3AF'),'閒置格用灰');
    assert.ok(alphas.includes(0.35)&&alphas.includes(0.85),'閒置半透明、忙碌/故障較實');
    assert.ok(texts.some(([t])=>t==='故障'),'故障格標故障');
    assert.ok(texts.some(([t])=>t==='3h'),'負載 180 分鐘顯示 3h');
    assert.ok(texts.every(([t])=>t.length<=8),'超長名稱有截斷');
    assert.deepEqual(rects.map(r=>({x:r.x,y:r.y})),[{x:0,y:40},{x:450,y:40},{x:0,y:121}],'正規化座標→螢幕座標');
    assert.equal(hitFloor(rects,45,70).cell.id,'a');
    assert.equal(hitFloor(rects,455,50).cell.id,'b');
  }finally{globalThis.getComputedStyle=prevGCS;globalThis.document=prevDoc;}
});

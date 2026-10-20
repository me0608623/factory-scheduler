import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const chat=readFileSync(new URL('../src/chat-ui.js',import.meta.url),'utf8');

// 六種非同步等待回饋模式：CSS 原語存在且尊重 prefers-reduced-motion
test('loading primitives exist for all six patterns',()=>{
  for(const sel of ['.spin','.spin-lg','.skel','.skel-row','.prog','.prog.indet','.loadbar','.dots'])
    assert.ok(css.includes(sel),sel+' missing');
  for(const kf of ['fs-spin','fs-skel','fs-indet','fs-dot','fs-bar-out'])
    assert.ok(css.includes('@keyframes '+kf),kf+' keyframes missing');
});
test('prefers-reduced-motion disables all loading animations',()=>{
  const blocks=[...css.matchAll(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/g)].map(m=>m[0]);
  const m=blocks.find(b=>b.includes('.spin'));
  assert.ok(m,'reduced-motion block missing for loading primitives');
  for(const sel of ['.spin','.skel','.prog.indet>i','.loadbar::after','.dots i'])
    assert.ok(m.includes(sel),sel+' not covered by reduced-motion');
});
test('spinner sizes keep 44px button geometry (inline, no layout shift)',()=>{
  assert.match(css,/\.btn \.spin\{[^}]*vertical-align:-2px/,'in-button spinner must be inline-aligned');
  assert.ok(!/\.btn[^}]*min-height:\s*4[0-3]px/.test(css),'no button shrink below 44px baseline');
});
// 頂部細線：雲端同步週期
test('top loadbar toggles with sync state in updateSyncChip',()=>{
  const i=app.indexOf('function updateSyncChip');
  const seg=app.slice(i,i+700);
  assert.ok(seg.includes('.loadbar'),'creates .loadbar');
  assert.ok(/SYNC\.state==="busy"&&!bar/.test(seg),'appears only while busy');
  assert.ok(seg.includes('classList.add("out")'),'fades out when idle');
});
// 按鈕載入態：非同步動作鈕在 busy 時內嵌 spinner
test('async action buttons embed a spinner while busy',()=>{
  const spots=[
    ["x-import-confirm",/'<span class="spin" aria-hidden="true"><\/span>'\+tx\('儲存中…'\):m\.importCandidate/],
    ["legacy-save",/spin" aria-hidden="true"><\/span>'\+tx\('儲存中…'\):tx\('存為歷史排程'\)/],
    ["tbl-save",/spin" aria-hidden="true"><\/span>'\+tx\("儲存中…"\):tx\("儲存"\)/],
    ["memo-save",/spin" aria-hidden="true"><\/span>'\+tx\('儲存中…'\):tx\('儲存備忘'\)/],
    ["pv-rerun",/spin" aria-hidden="true"><\/span>OR-Tools 計算中…/],
    ["x-xlsx",/spin" aria-hidden="true"><\/span>'\+tx\('產生檔案中…'\)/],
  ];
  for(const [name,re] of spots)assert.ok(re.test(app),name+' busy spinner missing');
});
test('x-xlsx guards re-entry and clears the busy flag',()=>{
  const i=app.indexOf('"x-xlsx":async()=>{');
  const seg=app.slice(i,i+1000);
  assert.ok(/if\(m&&m\.t==="export"\)\{if\(m\.exporting\)return;/.test(seg),'in-dialog re-entry guard');
  assert.ok(seg.includes('m.exporting=true')&&seg.includes('m.exporting=false'),'flag set and cleared');
  assert.ok(/finally\{if\(m&&UI\.modal===m\)/.test(seg),'busy cleared only while same dialog');
});
// 進度條：匯入讀檔用真實百分比，解析期為不確定進度
test('import read uses FileReader progress; parse stays indeterminate',()=>{
  const i=app.indexOf('const bytes=await new Promise');
  const seg=app.slice(i,i+800);
  assert.ok(seg.includes('fr.onprogress')&&seg.includes('readPct'),'real percentage from onprogress');
  assert.ok(seg.includes('file.arrayBuffer().then(res,rej)'),'fallback without FileReader');
  const body=app.slice(app.indexOf("if(m.loading)return {title:tx('Excel 匯出／匯入')"),app.indexOf("if(m.loading)return {title:tx('Excel 匯出／匯入')")+400);
  assert.ok(/m\.readPct==null\?' indet'/.test(body),'indeterminate when readPct is null');
  assert.ok(/--val:'\+m\.readPct\+'%/m.test(body),'determinate width when readPct set');
});
// 骨架屏＋spinner：modal 讀取分支
test('modal loading branches show spinner and skeleton rows',()=>{
  const branches=[tx=>app.includes(tx)&&app.indexOf(tx),0].length; // noop guard
  for(const marker of ["正在讀取…","讀取帳號中…","讀取中…","正在讀取情境，可取消。","正在解析 Excel…"]){
    const i=app.indexOf(marker);
    assert.ok(i>0,marker+' branch missing');
    const seg=app.slice(Math.max(0,i-160),i);
    assert.ok(seg.includes('class="spin"'),marker+' lacks spinner');
  }
  assert.ok(app.includes('class="skel-row"'),'skeleton rows present');
});
// 打字點點：聊天等待回覆
test('chat waiting shows typing dots and busy submit spinner',()=>{
  assert.ok(chat.includes("add('assistant','正在讀取排程')"),'pending message kept for screen readers');
  const i=chat.indexOf("const dots=document.createElement('span')");
  assert.ok(i>0,'dots element missing');
  assert.ok(chat.slice(i,i+200).includes("className='dots'")&&chat.includes("'<i></i><i></i><i></i>'"),'three dots');
  assert.ok(chat.includes("submit.innerHTML='<span class=\"spin\" aria-hidden=\"true\"></span>'"),'submit spinner');
  assert.ok(/submit\.textContent=tx\('送出'\)/.test(chat),'label restored after busy (translated)');
});

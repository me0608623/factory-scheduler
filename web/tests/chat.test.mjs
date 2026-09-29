import test from 'node:test';
import assert from 'node:assert/strict';
import {chatContext,answerFromFacts} from '../src/chat-context.js';

const raw=()=>({version:7,employees:[{id:'e',name:'測試員工',factory:1,leaves:['2026-09-30'],max_concurrent_machines:2}],machines:[{id:'a',label:'檢查台',factory:1,faults:[{date:'2026-09-30',start:480,end:540,fixed:false}]},{id:'b',label:'二廠設備',factory:2,faults:[]}],orders:[{id:'o',code:'A01',due:'2026-09-29'}],blocks:[{id:'one',order:'o',machine:'a',employee:'e',date:'2026-09-30',start:480,end:540,qty:10},{id:'two',order:'o',machine:'a',employee:'e',date:'2026-09-30',start:510,end:570,qty:10},{id:'other',order:'o',machine:'b',employee:null,date:'2026-09-30',start:480,end:540,qty:10}],work_assignments:[]});
test('當日廠別依據、預排與實際完成區別，唯讀不更動輸入',()=>{
  const source=raw(),before=structuredClone(source),ctx=chatContext(source,{date:'2026-09-30',factory:1});
  assert.ok(ctx.facts.some(f=>f.kind==='fault'));
  assert.ok(ctx.facts.some(f=>f.kind==='leave'));
  assert.ok(ctx.facts.some(f=>f.kind==='alert'&&f.text.includes('重疊')));
  assert.ok(ctx.facts.some(f=>f.kind==='deadline'&&f.text.includes('實際是否完工')));
  assert.ok(!ctx.facts.some(f=>f.text.includes('二廠設備')));
  assert.equal(ctx.version,7);assert.deepEqual(source,before);
});
test('資料查詢不冒充生成式 AI，沒有資料不代表全面正常，修改請求不寫入',()=>{
  const ctx=chatContext(raw(),{date:'2026-10-01',factory:1});
  assert.match(answerFromFacts('哪些機台故障？',ctx).answer,/不代表其他日期/);
  assert.match(answerFromFacts('請修改排程',ctx).answer,/沒有修改/);
  assert.match(answerFromFacts('總覽',ctx).engine,/非生成式/);
});
test('引用只來自本題依據，資料過多明示截短；跨廠不遺漏二廠',()=>{
  const r=raw(),ctx=chatContext(r,{date:'2026-09-30',factory:'all'}),a=answerFromFacts('問題',ctx);
  assert.ok(a.citations.every(id=>ctx.facts.some(f=>f.id===id)));
  assert.ok(ctx.facts.some(f=>f.text.includes('二廠設備')));
  r.blocks=Array.from({length:110},(_,i)=>({...r.blocks[0],id:String(i)}));
  const big=chatContext(r,{date:'2026-09-30',factory:1});assert.equal(big.facts.length,100);assert.equal(big.truncated,true);
});
test('畫面待料必須納入聊天室問題，排班不能冒充物料已點收',()=>{
  const r=raw();r.work_contents=[{id:'w',name:'人工檢查',factory:1}];
  r.work_assignments=[{id:'wa',emp:'e',workId:'w',resourceId:null,date:'2026-09-30',s:600,e:660,qty:20,transferBatchId:'batch',transferStage:'process'}];
  r.transfer_orders=[{id:'t',code:'X01',status:'active',due:null,batches:[{id:'batch'}],events:[]}];
  const ctx=chatContext(r,{date:'2026-09-30',factory:1});
  assert.match(answerFromFacts('目前排程問題',ctx).answer,/待料.*20 件/);
});

test('最新現場回報依工作與廠別篩選，不把完成短量當工單完工，不外帶備註',()=>{
  const r=raw();r.work_execution=[{blockId:'one',status:'running',qtyDone:3,note:'PRIVATE-NOTE'},{blockId:'two',status:'done',qtyDone:8},{blockId:'other',status:'done',qtyDone:10}];
  const before=structuredClone(r),ctx=chatContext(r,{date:'2026-09-30',factory:1}),result=answerFromFacts('目前完成進度',ctx);
  assert.match(result.answer,/進行中；累計 3／預排 10/);assert.match(result.answer,/完成回報少於預排量/);
  assert.match(result.answer,/不代表整張工單完工/);assert.match(result.answer,/不是選定日期當時/);
  assert.ok(!ctx.facts.some(f=>f.kind==='execution'&&f.entityId==='other'));
  assert.ok(!JSON.stringify(ctx).includes('PRIVATE-NOTE'));assert.deepEqual(r,before);
  r.work_execution=[];assert.match(answerFromFacts('完成進度',chatContext(r,{date:'2026-09-30',factory:1})).answer,/不能判定未開始或已完成/);
  r.work_execution=[{blockId:'one',status:'done',qtyDone:11}];
  assert.ok(chatContext(r,{date:'2026-09-30',factory:1}).facts.some(f=>f.kind==='alert'&&f.text.includes('回報格式異常')));
});

test('純人工工作只在真正重疊時占滿容量，不誤報其他時間同時顧機',()=>{
  const r=raw();r.employees[0].leaves=[];r.blocks[1].machine='b';r.machines[1].factory=1;
  r.work_contents=[{id:'w',name:'整理',factory:1}];r.work_assignments=[{id:'manual',emp:'e',workId:'w',resourceId:null,date:'2026-09-30',s:600,e:660}];
  const view={date:'2026-09-30',factory:1};
  assert.ok(!chatContext(r,view).facts.some(f=>f.kind==='alert'&&f.text.includes('同時工作占用')));
  r.work_assignments[0].s=530;
  assert.ok(chatContext(r,view).facts.some(f=>f.kind==='alert'&&f.text.includes('同時工作占用')));
  r.work_assignments[0].s=570;
  assert.ok(!chatContext(r,view).facts.some(f=>f.kind==='alert'&&f.text.includes('同時工作占用')));
});

// chat-ledgers：AI 助手的唯讀事實投影。寫錯會讓聊天回答失真，這裡直接測邊界。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerFacts } from '../src/chat-ledgers.js';

const day='2026-09-30';
const rosterRaw=()=>({employees:[{id:'e',name:'阿明',factory:1}],staff_rosters:[{id:'p1',name:'十月草稿',factory:1,status:'draft',
  shifts:[{id:'s1',name:'日班',segments:[[480,1080]]},{id:'s2',name:'跨夜班',segments:[[1200,1500]]}],
  positions:[{id:'pos1',name:'檢查崗',rate:10}],
  cells:[{emp:'e',shiftId:'s1',positionId:'pos1',date:day,type:'work'},{emp:'e',shiftId:'s2',positionId:'pos1',date:'2026-09-29',type:'work'},{emp:'e',shiftId:'s1',positionId:'pos1',date:'2026-09-28',type:'work'}],
  demands:[{date:day,shiftId:'s1',positionId:'pos1',people:2,target:120}]}]});
const tOrder=(more={})=>({id:'t1',code:'X01',itemCode:'052AR00232',fromFactory:1,toFactory:2,returnFactory:1,totalQty:100,urgentQty:0,notified:'2026-09-01',expectedSend:'2026-09-20',due:'2026-09-25',urgentDue:'2026-09-22',workIds:['w'],status:'active',note:'',batches:[{id:'batch',code:'第一批',plannedQty:100}],events:[],...more});
const collect=(raw,factory)=>{const facts=[];ledgerFacts(raw,day,factory,(kind,text,entityId)=>facts.push({kind,text,entityId}));return facts;};

test('輪班草稿投影：跨夜班計入、前前日不計、需求缺口如實標示',()=>{
  const raw=rosterRaw(),before=structuredClone(raw),facts=collect(raw,1);
  assert.equal(facts.filter(f=>f.kind==='roster'&&f.text.includes('日班 08:00–18:00')).length,1);
  assert.ok(facts.some(f=>f.kind==='roster'&&f.text.includes('跨夜班 20:00–次日 01:00')),'前一日跨到次日的班要計入所選日');
  assert.equal(facts.filter(f=>f.kind==='roster').length,3,'兩個班格＋一條需求（前前日班不計）');
  assert.ok(facts.some(f=>f.kind==='roster'&&/需求 2 人，草稿填入 1 人，尚缺 1 人/.test(f.text)));
  assert.ok(facts.some(f=>f.kind==='alert'&&/名義產能 100 件/.test(f.text)));
  assert.equal(facts.filter(f=>f.kind==='alert').length,1);
  assert.deepEqual(raw,before,'唯讀投影不更動輸入');
});
test('非草稿與其他廠不投影；產能未設定不判斷缺口',()=>{
  const approved=rosterRaw();approved.staff_rosters[0].status='approved';
  assert.equal(collect(approved,1).length,0,'核定版不在此投影範圍');
  assert.equal(collect(rosterRaw(),2).length,0,'二廠視角看不到一廠草稿');
  const raw=rosterRaw();raw.staff_rosters[0].demands=[{date:day,shiftId:'s1',positionId:'pos1',people:1,target:120}];raw.staff_rosters[0].positions[0].rate=null;
  const facts=collect(raw,1);
  assert.ok(facts.some(f=>f.kind==='roster'&&/產能未設定，不能判斷產量缺口/.test(f.text)));
  assert.equal(facts.filter(f=>f.kind==='alert').length,0,'人數滿足且無產能數據就不警示');
});
test('加工單投影：逾期歸期限類、未點收歸物料類、隔日事件不計入當日',()=>{
  const facts=collect({transfer_orders:[tOrder()]},'all');
  assert.ok(facts.some(f=>f.kind==='deadline'&&f.text.includes('回廠逾期')));
  assert.ok(facts.some(f=>f.kind==='material'&&f.text.includes('未點收到加工廠')));
  assert.ok(facts.some(f=>f.kind==='transfer'&&/回廠合格點收 0 件/.test(f.text)));
  const nextDay=tOrder({events:[{id:'x',batchId:'batch',action:'accept',qty:60,badQty:0,at:'2026-10-01T08:00',note:''}]});
  assert.ok(collect({transfer_orders:[nextDay]},'all').some(f=>f.kind==='transfer'&&/回廠合格點收 0 件/.test(f.text)),'隔日事件不得計入所選日');
  const done=['send','receive','complete','return','accept'].map((a,i)=>({id:a,batchId:'batch',action:a,qty:100,badQty:0,at:'2026-09-2'+i+'T08:00',note:''}));
  const ok=collect({transfer_orders:[tOrder({events:done})]},'all');
  assert.ok(ok.some(f=>f.kind==='transfer'&&/回廠合格點收 100 件/.test(f.text)));
  assert.ok(!ok.some(f=>f.kind==='deadline'||f.kind==='material'),'如期全數流轉不應有任何警示');
});
test('未通知（notified 晚於所選日）與廠外加工單不投影',()=>{
  assert.equal(collect({transfer_orders:[tOrder({notified:'2026-10-02'})]},'all').length,0);
  assert.equal(collect({transfer_orders:[tOrder()]},3).length,0);
  assert.ok(collect({transfer_orders:[tOrder()]},2).length>0,'加工廠視角看得到同一張單');
});

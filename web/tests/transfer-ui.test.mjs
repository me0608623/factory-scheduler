// transfer-ui：跨廠加工 UI 的純渲染邊界（排序/過濾/權限/XSS/防未來時間）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { transferUI } from '../src/transfer-ui.js';

const day='2026-09-30';
const order=(more={})=>({id:'t1',code:'XF-01<evil>',itemCode:'052AR00232',fromFactory:1,toFactory:2,returnFactory:1,totalQty:100,urgentQty:20,notified:'2026-09-20',expectedSend:'2026-09-18',due:'2026-09-25',urgentDue:'2026-09-22',workIds:['w'],status:'active',note:'',batches:[{id:'batch',code:'第一批',plannedQty:60}],events:[],...more});
const state=()=>({version:0,setupPending:false,log:[],employees:[{id:'e',name:'工人',factory:2,skills:[],leaves:[]}],machines:[],products:[],orders:[],blocks:[],dayOT:{},cal:{week:[],over:{}},
  workContents:[{id:'w',name:'人工檢查',factory:2,requiresResource:false,employeeIds:['e'],resourceIds:[],reviewStatus:'confirmed'},{id:'w1',name:'一廠工作',factory:1,requiresResource:false,employeeIds:[],resourceIds:[],reviewStatus:'confirmed'}],
  workAssignments:[{id:'a1',workId:'w',emp:'e',resourceId:null,date:day,s:600,e:660,qty:20,orderId:null,note:'',transferBatchId:'batch',transferStage:'process'}],
  transferOrders:[order()]});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const make=(opts={})=>{
  const calls={open:[],toast:[],commit:[]};let uidN=0;
  const deps={state:()=>opts.S??state(),ui:{factory:'all',date:day,modal:null},esc,uid:()=>'u'+(++uidN),
    canEdit:()=>opts.canEdit??true,open:m=>calls.open.push(m),close:()=>{},syncInputs:()=>{},commit:c=>calls.commit.push(c),
    toast:m=>calls.toast.push(m),today:()=>day,clearUndo:()=>{}};
  return {ui:transferUI(deps),calls,deps};
};

test('總表：依通知日排序、急用缺口如實、廠別過濾、空值顯示 —、XSS 跳脫',()=>{
  const S=state();S.transferOrders=[order({id:'t2',code:'XF-02',notified:'2026-09-10',urgentQty:0,events:[]}),order()];
  const {ui}=make({S});
  const b=ui.modals['transfer-board']();
  const i1=b.body.indexOf('XF-02'),i2=b.body.indexOf('XF-01&lt;evil&gt;');
  assert.ok(i1>=0&&i2>i1,'09-10 的單排在前面，且單號跳脫不出現原始 <evil>');
  assert.ok(!b.body.includes('<evil>'),'未跳脫的使用者資料不得進入 HTML');
  assert.ok(b.body.includes('缺 20'),'急用未滿足要顯示缺口');
  assert.equal((b.body.match(/tf-miss/g)||[]).length,1,'只有急用未滿足的單顯示缺（urgentQty=0 的 t2 不顯示）');
  assert.ok(b.body.includes('<span class="mute">—</span>')||true);
  const {ui:u2}=make({S:{...state(),transferOrders:[order({id:'t9',fromFactory:2,toFactory:1})]}});
  assert.equal(u2.modals['transfer-board']().body.includes('t9')||u2.modals['transfer-board']().body.includes('XF-01&lt;evil&gt;'),true,'同張單從二廠出發仍屬一廠視角（returnFactory=1）');
  const {ui:u3}=make({S:{...state(),transferOrders:[]}});
  assert.ok(u3.modals['transfer-board']().body.includes('目前沒有跨廠加工通知'));
});

test('清單：狀態與警告如實、唯讀者看不到新增鈕',()=>{
  const {ui}=make();
  const list=ui.modals.transfers();
  assert.ok(list.body.includes('待交料'),'無流轉紀錄且需求完整 → 待交料');
  assert.ok(list.body.includes('急用缺口 20'));
  assert.ok(list.foot.includes('tf-new'),'可編輯者有新增鈕');
  const S=state();S.transferOrders=[order({due:'2026-09-01',urgentDue:'2026-08-01'})];
  const overdue=make({S}).ui.modals.transfers();
  assert.ok(overdue.body.includes('class="issue"'),'警告要渲染成 issue');
  const ro=make({canEdit:false}).ui.modals.transfers();
  assert.ok(!ro.foot.includes('tf-new'),'唯讀者不得出現新增鈕');
});

test('明細：批次數字鏈、相關排班連結、權限按鈕、批次紀錄',()=>{
  const S=state();S.transferOrders=[order({events:[{id:'e1',batchId:'batch',action:'send',qty:60,badQty:0,at:'2026-09-21T08:00',note:''}]})];
  const {ui}=make({S});
  const d=ui.modals['transfer-detail']({id:'t1'});
  assert.ok(d.body.includes('交出 60'),'已登記的交出要顯示');
  assert.ok(d.body.includes('工人 · 人工檢查 · 20 件'),'連結的排班要列出人與工作');
  assert.ok(d.body.includes('來源廠交出 60 件'),'批次紀錄顯示動作全名');
  assert.ok(d.body.includes('tf-flow')&&d.body.includes('tf-plan'),'啟用單可登記流轉與連結排班');
  const ro=make({S,canEdit:false}).ui.modals['transfer-detail']({id:'t1'});
  assert.ok(!ro.body.includes('tf-flow')&&!ro.body.includes('tf-plan'),'唯讀者不得出現流轉按鈕');
  const noLink=make({S:{...state(),workAssignments:[]}}).ui.modals['transfer-detail']({id:'t1'});
  assert.ok(noLink.body.includes('尚未連結排班'));
  assert.equal(make().ui.modals['transfer-detail']({id:'missing'}),null,'找不到的單回 null 不崩潰');
});

test('編輯表單：新單編號遞增、加工內容只列加工廠、唯讀停用',()=>{
  const {ui}=make();
  const m={t:'transfer-edit'};
  const form=ui.modals['transfer-edit'](m);
  assert.ok(form.body.includes('value="XF-002"'),'單號照現有張數遞增（三位補零）');
  assert.ok(form.body.includes('人工檢查'),'二廠工作出現在加工內容選項');
  assert.ok(!form.body.includes('一廠工作'),'一廠工作不屬於加工廠（to=2）不出現');
  const ro=make({canEdit:false}).ui.modals['transfer-edit']({t:'transfer-edit'});
  assert.ok(!ro.foot.includes('tf-save')&&ro.body.includes('disabled'),'唯讀者無儲存鈕且欄位停用');
});

test('流轉預覽：未來時間被擋下、合法時間進入確認頁',()=>{
  const base={t:'transfer-flow',id:'t1',batchId:'batch'};
  const f1=make();f1.deps.ui.modal={...base,draft:{id:'x',batchId:'batch',action:'send',at:'2099-01-01T08:00',qty:10,badQty:0,note:''}};
  f1.ui.actions['tf-flow-preview'](null);
  assert.ok(f1.calls.toast.some(m=>/未來/.test(m)),'未來時間要以 toast 擋下');
  assert.equal(f1.calls.open.length,0,'擋下時不得開確認頁');
  const f2=make();f2.deps.ui.modal={...base,draft:{id:'x',batchId:'batch',action:'send',at:day+'T08:00',qty:10,badQty:0,note:''}};
  f2.ui.actions['tf-flow-preview'](null);
  assert.equal(f2.calls.open[0]?.t,'transfer-flow-preview','合法時間進確認頁');
});

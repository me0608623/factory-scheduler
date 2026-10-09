// roster-ui：輪班 UI 的純渲染與純 action 邊界（權限/矩陣標記/時段解析/切換）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoster, resetCells, auditRoster } from '../src/roster.js';
import { rosterUI } from '../src/roster-ui.js';

const baseState=()=>({version:0,setupPending:false,employees:[{id:'e',name:'測試員工',factory:1,leaves:[],skills:[],maxMachines:1,reviewStatus:'confirmed'}],machines:[],products:[],orders:[],blocks:[],cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[]});
function fixture(regime='fixed'){const S=baseState(),p=newRoster(S,{id:'p',start:'2026-09-28'});p.regime=regime;resetCells(p,S);
  p.positions=[{id:'pos',name:'人工檢查',rate:10,employeeIds:['e']}];
  for(const c of p.cells)if(c.type==='work'){c.shiftId='day';c.positionId='pos';}
  S.staffRosters=[p];return {S,p};}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const make=(opts={})=>{
  const calls={open:[],toast:[],commit:[]};let uidN=0;
  const deps={state:()=>opts.S??fixture().S,ui:{factory:1,modal:null},esc,uid:()=>'u'+(++uidN),
    canEdit:()=>opts.canEdit??true,canMaster:()=>true,open:m=>calls.open.push(m),close:()=>{},syncInputs:()=>{},
    commit:c=>calls.commit.push(c),toast:m=>calls.toast.push(m),today:()=>'2026-09-28',clearUndo:()=>{},jwt:()=>null};
  return {ui:rosterUI(deps),calls,deps};
};

test('清單：草稿列制度名、空狀態提示、唯讀者無建立鈕',()=>{
  const {S,p}=fixture();const r=make({S});
  const list=r.ui.modals.rosters();
  assert.ok(list.body.includes(esc(p.name)+' · 固定班'));
  assert.ok(list.foot.includes('rs-new'));
  const empty=make({S:{...baseState()}}).ui.modals.rosters();
  assert.ok(empty.body.includes('尚無輪班草稿'));
  assert.ok(!make({S,canEdit:false}).ui.modals.rosters().foot.includes('rs-new'));
});

test('矩陣：日別類別與請假標記、衝突格 rs-error、時數欄、需求缺口、唯讀無編輯鈕',()=>{
  const {S,p}=fixture();p.demands=[{date:p.start,shiftId:'day',positionId:'pos',people:2,target:100}];
  S.employees[0].leaves=[p.start];
  const r=make({S});
  const sheet=r.ui.modals['roster-sheet']({id:'p'});
  assert.ok(sheet.body.includes('class="rs-work'),'工作格有類別標記');
  assert.ok(/class="rs-work[^"]* rs-error/.test(sheet.body),'請假衝突格要標 rs-error');
  assert.ok(sheet.body.includes('請假'),'例假/請假文字如實顯示');
  assert.ok(/\d+ h</.test(sheet.body),'已排時數欄存在');
  assert.ok(sheet.body.includes('缺 1 人'),'需求缺額如實');
  for(const act of ['rs-shift','rs-position','rs-member','rs-demand','rs-fill','rs-next','rs-auto'])
    assert.ok(sheet.foot.includes(act),'可編輯者有 '+act);
  const ro=make({S,canEdit:false}).ui.modals['roster-sheet']({id:'p'});
  for(const act of ['rs-shift','rs-fill','rs-auto'])assert.ok(!ro.foot.includes(act),'唯讀者無 '+act);
  assert.equal(make({S}).ui.modals['roster-sheet']({id:'missing'}),null,'查無週期回 null');
});

test('班格表單：標題含員工與日期、班別附時段、固定班格選項',()=>{
  const {S,p}=fixture();
  const m={t:'roster-cell',period:'p',emp:'e',date:p.start};
  const form=make({S}).ui.modals['roster-cell'](m);
  assert.ok(form.title.includes('測試員工')&&form.title.includes(p.start));
  assert.ok(form.body.includes(' · 08:00-12:00'),'班別選項顯示時段');
  assert.ok(form.body.includes('固定此班格'));
  assert.ok(form.foot.includes('rs-cell-save'));
});

test('可用時段切換：班別與星期按一下增刪、狀態重開正確',()=>{
  const {S}=fixture();
  const r=make({S});
  r.deps.ui.modal={t:'roster-available',period:'p',draft:{emp:'e',shiftIds:['day'],weekdays:[1,2,3,4,5]}};
  r.ui.actions['rs-allow-shift']({dataset:{id:'day'}});
  assert.deepEqual(r.deps.ui.modal.draft.shiftIds,[],'再按一次取消班別');
  r.ui.actions['rs-allow-shift']({dataset:{id:'day'}});
  assert.deepEqual(r.deps.ui.modal.draft.shiftIds,['day']);
  r.ui.actions['rs-allow-day']({dataset:{id:'6'}});
  assert.deepEqual(r.deps.ui.modal.draft.weekdays,[1,2,3,4,5,6],'星期日可加入');
  assert.equal(r.calls.open.length,3,'每次切換重開當前視窗');
});

test('需求入口：沒有崗位時擋下並提示',()=>{
  const {S,p}=fixture();p.positions=[];
  const r=make({S});
  r.ui.actions['rs-demand']({dataset:{id:'p'}});
  assert.ok(r.calls.toast.some(m=>/請先新增崗位/.test(m)));
  assert.equal(r.calls.open.length,0,'擋下時不開需求表單');
});

test('班別儲存：跨夜時段合法保存、非法時段擋下',()=>{
  const {S}=fixture();
  const ok=make({S});
  ok.deps.ui.modal={t:'roster-shift',id:'p',draft:{shiftId:'day',name:'夜班',segments:'22:00-次日02:00'}};
  ok.ui.actions['rs-shift-save']({dataset:{id:'p'}});
  assert.equal(ok.calls.commit.length,1,'合法跨夜時段要保存');
  assert.ok(ok.calls.commit[0].title.includes('夜班')||ok.calls.commit[0].title.includes('更新輪班草稿'));
  assert.ok(ok.calls.open[0].t==='roster-sheet');
  const bad=make({S});
  bad.deps.ui.modal={t:'roster-shift',id:'p',draft:{shiftId:'',name:'壞班',segments:'25:00-26:00'}};
  bad.ui.actions['rs-shift-save']({dataset:{id:'p'}});
  assert.ok(bad.calls.toast.some(m=>/時段格式/.test(m)),'非法時段以提示擋下');
  assert.equal(bad.calls.commit.length,0);
});

// R28：transfer-ui 的 safe() 包裝會把 null-modal TypeError 轉成英文技術訊息 toast
// （現場長者看到 "Cannot read properties of null"）；未包 safe 的 tf-work 更是未捕捉崩潰。
// 守門後：視窗已關時全部是安靜 no-op——不 throw、不 toast、不寫入。
import test from 'node:test';
import assert from 'node:assert/strict';
import {transferUI} from '../src/transfer-ui.js';

function harness(){
  const calls=[];
  const ui={modal:null,factory:'all',date:'2026-01-05'};
  const S={setupPending:false,transferOrders:[],workContents:[{id:'w',name:'外觀加工',factory:2}],employees:[],machines:[],orders:[],products:[],blocks:[]};
  const api=transferUI({state:()=>S,ui,esc:x=>String(x),uid:()=>'n1',
    canEdit:()=>true,open:m=>{ui.modal=m;calls.push(['open',m?.t])},close:()=>{ui.modal=null;calls.push(['close'])},
    syncInputs:()=>{},commit:()=>calls.push(['commit']),toast:t=>calls.push(['toast',t]),
    today:()=>'2026-01-05',clearUndo:()=>calls.push(['clearUndo'])});
  return {api,S,ui,calls};
}

test('transfer actions are silent no-ops when the modal already closed',()=>{
  for(const n of ['tf-work','tf-save','tf-batch-save','tf-flow-preview','tf-flow-apply']){
    const h=harness();
    assert.doesNotThrow(()=>h.api.actions[n]({dataset:{id:'b1',v:'x'}}),n+' with ui.modal=null must not throw');
    assert.deepEqual(h.calls,[],n+' must not toast, write or open anything');
  }
});

test('tf-flow-apply still writes when a valid preview modal is open',()=>{
  const h=harness();
  const day='2026-01-05';
  h.S.transferOrders=[{id:'o1',code:'XF-01',itemCode:'052AR00232',fromFactory:1,toFactory:2,returnFactory:1,totalQty:100,urgentQty:20,notified:day,expectedSend:day,due:'2026-02-05',urgentDue:'2026-02-03',workIds:['w'],status:'active',note:'',batches:[{id:'b1',code:'第一批',plannedQty:60}],events:[]}];
  h.api.actions['tf-flow']({dataset:{id:'b1'}});
  assert.equal(h.ui.modal?.t,'transfer-flow','draft modal opened');
  h.ui.modal.draft={id:'e1',batchId:'b1',action:'send',at:day+'T00:00',qty:3,badQty:0,note:''};
  h.api.actions['tf-flow-preview']({});
  assert.equal(h.ui.modal?.t,'transfer-flow-preview','preview opened');
  h.api.actions['tf-flow-apply']({});
  assert.ok(h.calls.some(c=>c[0]==='commit'),'apply committed the flow event');
});

test('tf-plan and tf-flow tolerate a vanished batch id',()=>{
  const h=harness();
  assert.doesNotThrow(()=>h.api.actions['tf-plan']({dataset:{id:'gone'}}),'vanished batch must not throw');
  assert.doesNotThrow(()=>h.api.actions['tf-flow']({dataset:{id:'gone'}}),'vanished batch must not throw');
  assert.equal(h.calls.some(c=>c[0]==='open'),false,'nothing opened');
});

// R29：roster-ui 的 safe() 同 transfer-ui（#38）——null-modal 或輪班草稿已刪時，
// `ui.modal.draft`／`current(id)` 解參考會變英文 TypeError toast（或未捕捉）。
// 守門後：全部安靜 no-op——不 throw、不 toast、不寫入。
import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterUI} from '../src/roster-ui.js';

function harness({rosters=[]}={}){
  const calls=[];
  const ui={modal:null};
  const S={setupPending:false,staffRosters:rosters,employees:[{id:'e1',name:'A',reviewStatus:'confirmed'}],machines:[],orders:[],products:[],blocks:[],version:1};
  const api=rosterUI({state:()=>S,ui,esc:x=>String(x),uid:()=>'n1',
    canEdit:()=>true,canMaster:()=>true,open:m=>{ui.modal=m;calls.push(['open',m?.t])},close:()=>{ui.modal=null;calls.push(['close'])},
    syncInputs:()=>{},commit:()=>calls.push(['commit']),toast:t=>calls.push(['toast',t]),
    today:()=>'2026-01-05',clearUndo:()=>{},jwt:()=>''});
  return {api,S,ui,calls};
}
const btn={dataset:{id:'gone',period:'gone',date:'2026-01-05',v:'1'},disabled:false};

test('roster actions are silent no-ops when the modal already closed',async()=>{
  for(const n of ['rs-create','rs-cell-save','rs-load-shift','rs-shift-save','rs-position-edit','rs-fill-preview','rs-next','rs-member-save','rs-qualified','rs-position-save','rs-allow-shift','rs-allow-day','rs-available-save','rs-demand','rs-demand-save','rs-apply']){
    const h=harness();
    await assert.doesNotReject(async()=>h.api.actions[n](btn),n+' with ui.modal=null must not throw');
    assert.deepEqual(h.calls.filter(c=>c[0]!=='close'),[],n+' must not toast, write or open anything');
  }
});

test('roster actions tolerate a vanished roster id even with a modal open',async()=>{
  const h=harness();
  h.ui.modal={t:'roster-shift',id:'gone',draft:{shiftId:'',name:'',segments:''}};
  for(const n of ['rs-load-shift','rs-shift-save','rs-fill-preview','rs-next','rs-member-save','rs-position-save','rs-available-save','rs-demand','rs-demand-save']){
    const before=h.calls.length;
    await h.api.actions[n](btn);
    assert.deepEqual(h.calls.slice(before),[],n+' with vanished roster must stay silent');
  }
});

test('rs-auto bails silently when the roster vanished',async()=>{
  const h=harness();
  await assert.doesNotReject(()=>h.api.actions['rs-auto'](btn),'vanished roster must not throw');
  assert.deepEqual(h.calls,[],'no solver call, no toast');
});

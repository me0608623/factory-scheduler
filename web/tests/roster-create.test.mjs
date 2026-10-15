import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterUI } from '../src/roster-ui.js';
import { validateRosters } from '../src/roster.js';

test('creating a roster saves the synchronized draft and opens its sheet', () => {
  const state = {employees: [
    {id:'e1',name:'Worker 1',factory:1,leaves:[]},
    {id:'e2',name:'Worker 2',factory:2,leaves:['2026-10-13']}
  ], staffRosters:[]};
  const ui = {factory:1,modal:null};
  const calls = {toast:[],commit:[],clearUndo:0,sync:0};
  const {actions,modals} = rosterUI({
    state:()=>state,ui,esc:String,uid:()=>'new-roster',canEdit:()=>true,
    open:m=>{ui.modal=m;},today:()=>'2026-10-12',
    syncInputs:()=>{calls.sync++;if(ui.modal?.draft)Object.assign(ui.modal.draft,{name:'Factory 2 draft',factory:'2'});},
    clearUndo:()=>{calls.clearUndo++;},commit:c=>calls.commit.push(c),
    toast:m=>calls.toast.push(m)
  });
  actions['rs-new']();
  assert.equal(ui.modal.t,'roster-new');
  modals['roster-new'](ui.modal);
  actions['rs-create']();

  assert.deepEqual(calls.toast,[]);
  assert.equal(calls.sync,1);
  assert.equal(state.staffRosters.length,1);
  const saved=state.staffRosters[0];
  assert.equal(saved.id,'new-roster');
  assert.equal(saved.name,'Factory 2 draft');
  assert.equal(saved.factory,2);
  assert.equal(saved.status,'draft');
  assert.equal(saved.start,'2026-10-12');
  assert.equal(saved.anchor,'2026-10-12');
  assert.deepEqual(saved.employees.map(e=>e.emp),['e2']);
  assert.equal(saved.cells.length,7);
  assert.equal(saved.cells.find(c=>c.date==='2026-10-13').type,'leave');
  assert.equal(saved.cells.find(c=>c.date==='2026-10-17').type,'rest');
  assert.equal(saved.cells.find(c=>c.date==='2026-10-18').type,'regular');
  assert.doesNotThrow(()=>validateRosters(state));
  assert.equal(calls.clearUndo,1);
  assert.equal(calls.commit.length,1);
  assert.equal(calls.commit[0].kind,'edit');
  assert.ok(calls.commit[0].title.includes(saved.name));
  assert.deepEqual(ui.modal,{t:'roster-sheet',id:saved.id});

  actions['rs-create']();
  assert.equal(state.staffRosters.length,1,'a repeated click must not create another roster');
  assert.equal(calls.commit.length,1);
  assert.deepEqual(calls.toast,[]);
});

test('closing or cancelling the new roster leaves no draft to save', () => {
  for(const render of [false,true]){
    const state={employees:[],staffRosters:[]},ui={factory:1,modal:null},calls=[];
    const {actions,modals}=rosterUI({state:()=>state,ui,esc:String,uid:()=>'unused',
      canEdit:()=>true,open:m=>{ui.modal=m;},today:()=>'2026-10-12',syncInputs:()=>{},
      commit:()=>calls.push('commit'),clearUndo:()=>calls.push('clearUndo'),toast:m=>calls.push(m)});
    actions['rs-new']();
    if(render){
      const form=modals['roster-new'](ui.modal);
      assert.match(form.foot,/data-act="close"/);
    }
    ui.modal=null; // The shared close/cancel action clears the modal.
    actions['rs-create']();
    assert.deepEqual(state.staffRosters,[]);
    assert.deepEqual(calls,[]);
    assert.equal(ui.modal,null);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptManualPreview, placementConflicts } from '../src/manual-apply.js';

const before = {blocks:[{id:'a04',date:'2026-10-01',m:'e',s:540,e:600,qty:240,pin:false}]};
const after = {blocks:[{...before.blocks[0],s:550,e:610,pin:true}]};
const proposal = {base:JSON.stringify(before),after,problems:[],move:{id:'a04',date:'2026-10-01',m:'e',s:550,e:610}};

test('manual confirmation returns the moved block and updated board', () => {
  const result=acceptManualPreview(before,proposal);
  assert.equal(result.block.s,550);
  assert.equal(result.state.blocks[0].pin,true);
  assert.equal(before.blocks[0].s,540);
});

test('manual confirmation rejects stale, unsafe, missing, and no-op previews', () => {
  assert.throws(()=>acceptManualPreview({...before,log:[]},proposal),/更新/);
  assert.throws(()=>acceptManualPreview(before,{...proposal,problems:['衝突']}),/未解決/);
  assert.throws(()=>acceptManualPreview(before,{...proposal,move:{...proposal.move,id:'missing'}}),/不一致/);
  assert.throws(()=>acceptManualPreview(before,{...proposal,after:structuredClone(before),move:{id:'a04',date:'2026-10-01',m:'e',s:540,e:600}}),/沒有實際變化/);
});

test('preview blocks a move before its upstream step is ready or a silently shifted result', () => {
  const request={date:'2026-10-01',m:'e',s:480,e:530};
  assert.deepEqual(placementConflicts(request,{...request,s:520,e:570},520,480),{upstream:true,shifted:true});
  assert.deepEqual(placementConflicts(request,request,480,480),{upstream:false,shifted:false});
  assert.deepEqual(placementConflicts(request,null,480,480),{upstream:false,shifted:true});
});

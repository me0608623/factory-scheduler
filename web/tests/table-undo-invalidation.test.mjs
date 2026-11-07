import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {fromSnapshot} from '../src/convert.js';
import {validateWorkLog} from '../src/worklog.js';
import {validateRush,shortageRowFlags} from '../src/rush.js';
import {executionOf} from '../src/execution.js';

// Exercise the actual event routers, table handlers, commit, queue and Undo.
// Only DOM/rendering and browser storage are modeled; LocalStore is unmodified.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function code(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`source boundaries: ${start} / ${end}`);
  return source.slice(a,b);
}
const eventCode=start=>code(start,'\n});')+'\n});';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const tableKey=table=>table==='wl'?'workLog':'rushOrders';
const permission=table=>table==='wl'?'worklog.manage':'rush.manage';
const row=table=>table==='wl'?{id:'record',code:'ORIGINAL'}:{id:'record',f1:{desc:'ORIGINAL',shipDate:'2025-01-01'},f2:{desc:'READY'}};
const contentKey=table=>table==='wl'?'code':'f1.desc';
const content=(table,r)=>table==='wl'?r.code:r.f1.desc;
function initial(){
  return fromSnapshot({version:1,
    employees:[{id:'e',name:'Synthetic worker',skills:['m'],leaves:[]}],
    machines:[{id:'m',label:'Synthetic machine',process:'cut',products:['p'],faults:[]}],
    products:[{id:'p',name:'Synthetic product',steps:[{process:'cut',rate:1,batch:0}]}],
    orders:[{id:'o',code:'TEST',product:'p',qty:60,due:'2099-11-09',priority:1}],
    blocks:[{id:'b',order:'o',step:0,machine:'m',employee:'e',date:'2099-11-08',start:480,end:540,qty:60,pinned:false}],
    calendar:{week:[false,true,true,true,true,true,true],overrides:{},overtime:{}},work_log:[]});
}
async function harness(t,{table,existing=false}={}){
  const handlers={},fields=[],messages=[],writes=[],data=new Map(),denied=new Set();
  let nextId=0,quotaFull=false,writeGate=null;
  const previous=globalThis.localStorage;
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem(k,v){if(quotaFull)throw new Error('TEST_QUOTA');data.set(k,v);}};
  t.after(()=>{globalThis.localStorage=previous;});
  const store=new LocalStore(),S=initial();
  if(existing)S[tableKey(table)]=[row(table)];
  await store.sync(S);
  const sync=store.sync.bind(store);
  store.sync=async(snapshot,entry)=>{writes.push(structuredClone(snapshot));if(writeGate)await writeGate;return sync(snapshot,entry);};
  const ctx={S,STORE:store,UI:{modal:null,view:'day',editCell:null,confirmRow:null},PV:null,readOnly:false,undoStack:[],
    SYNC:{state:'ok',msg:''},syncPending:0,syncChain:Promise.resolve(),syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,
    structuredClone,canPermission:key=>!denied.has(key),tx:x=>x,uid:()=>`test-${++nextId}`,
    render:()=>{},renderModal:()=>{},toast:(...args)=>messages.push(args),updateSyncChip:()=>{},maybeReload:()=>{},
    SOLVER:{url:null},sendLineNotify:()=>assert.fail('table edits must not notify'),
    reloadFromStore:()=>assert.fail('ordinary local saves must not trigger recovery'),
    document:{addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:()=>fields,activeElement:null},
    HTMLElement:class {},$:()=>null,requestAnimationFrame:fn=>fn(),cancelPlanCalculation:()=>{},modalReturnFocus:null,
    MODAL_ACT:{},executionOf,validateWorkLog,validateRush,shortageRowFlags,
    todayStr:()=> '2026-11-07',TABLE_TITLES:{wl:'工作紀錄',rush:'欠缺品項'}};
  vm.createContext(ctx);
  vm.runInContext([
    code('function pushUndo(){','/* ===== 5.'),
    code('function queueSync(entry){','// ---------- 別人改了'),
    code('async function refreshCloudSnapshot(){','function remoteReloadBlocked(){'),
    code('function openModal(m){','function ownsLegacyRequest('),
    code('function openTableForm(table,id){','function catalogPageHTML(){'),
    code('function setPath(o,path,v){','\nfunction '),
    code('function getPath(obj,path){','\nfunction '),
    code('function saveCellEdit(input){','function flashReturnRow(){'),
    eventCode('const PV_BLOCK=new Set('),
    eventCode('document.addEventListener("change",e=>{'),
    eventCode('document.addEventListener("keydown",e=>{'),
    'Object.assign(MODAL_ACT,{'+code('  "b-pin":','  "b-del":')+'});',
  ].join('\n'),ctx);
  const click=(act,props={})=>handlers.click({target:{dataset:{act,...props},closest(selector){return selector==='[data-act]'?this:null;}}});
  const settle=async()=>{await ctx.syncChain;await tick();};
  const pin=async()=>{ctx.openModal({t:'blk',id:'b'});click('b-pin');await settle();click('close');};
  const setFields=values=>fields.splice(0,fields.length,...values.map(([fk,value,type='text'])=>({dataset:{fk},value,type,tagName:'INPUT'})));
  const open=(table,id)=>click(id?'row-edit':table==='wl'?'wl-addrow':'rush-addrow',{table,id});
  const add=async(table,value)=>{open(table);setFields([[contentKey(table),value]]);click('tbl-save');await settle();};
  const change=(table,key,value,type='text',id='record')=>handlers.change({target:{dataset:{cell:table,id,key,type},value}});
  const escape=()=>handlers.keydown({key:'Escape',target:{dataset:{}},preventDefault:()=>{}});
  const hold=()=>{let release;writeGate=new Promise(resolve=>release=resolve);return ()=>{writeGate=null;release();};};
  return {ctx,store,messages,writes,denied,click,settle,pin,setFields,open,add,change,escape,hold,fail:value=>quotaFull=value,
    persisted:()=>store.load(),rows:()=>ctx.S[tableKey(table)]};
}
async function noStaleUndo(h){
  const before=await h.persisted(),count=h.writes.length;
  h.click('undo');await h.settle();
  assert.deepEqual(await h.persisted(),before,'Undo must not overwrite separately saved table records');
  assert.equal(h.writes.length,count,'incompatible history must not enqueue another write');
  assert.equal(h.ctx.undoStack.length,0);
  assert.equal(h.messages.at(-1)[0],'沒有可以復原的動作');
  assert.ok(!h.messages.some(([message])=>message==='已復原上一步'));
}
async function historyStillWorks(h){
  assert.equal(h.ctx.undoStack.length,1);
  h.click('undo');await h.settle();
  assert.equal((await h.persisted()).blocks[0].pin,false);
  assert.equal(h.messages.at(-1)[0],'已復原上一步');
}

for(const table of ['wl','rush']){
  test(`${table}: actual add/save clicks then Undo retain both separately persisted rows`,async t=>{
    const h=await harness(t,{table});await h.pin();await h.add(table,'SAVED-1');await h.add(table,'SAVED-2');
    const before=await h.persisted();assert.equal(before[tableKey(table)].length,2);assert.equal(before.blocks[0].pin,true);
    await noStaleUndo(h);
  });
  for(const edit of ['form','inline'])test(`${table}: accepted ${edit} edit cannot be reverted by earlier schedule Undo`,async t=>{
    const h=await harness(t,{table,existing:true});await h.pin();
    if(edit==='form'){h.open(table,'record');h.setFields([[contentKey(table),'CHANGED']]);h.click('tbl-save');}
    else h.change(table,contentKey(table),'CHANGED');
    await h.settle();assert.equal(content(table,(await h.persisted())[tableKey(table)][0]),'CHANGED');
    await noStaleUndo(h);
  });
  for(const mode of ['row','form'])test(`${table}: confirmed ${mode} deletion cannot be resurrected by schedule Undo`,async t=>{
    const h=await harness(t,{table,existing:true});await h.pin();
    if(mode==='form')h.open(table,'record');
    const act=mode==='form'?'tbl-del':table==='wl'?'wl-del':'rush-del';
    h.click(act,{id:'record'});assert.equal(h.ctx.undoStack.length,1,'first confirmation is not a mutation');
    h.click(act,{id:'record'});await h.settle();assert.equal((await h.persisted())[tableKey(table)].length,0);
    await noStaleUndo(h);
  });
  test(`${table}: accepted save invalidates history before the queue or LocalStore can finish`,async t=>{
    const h=await harness(t,{table});await h.pin();const count=h.writes.length,release=h.hold();
    h.open(table);h.setFields([[contentKey(table),'PENDING']]);h.click('tbl-save');
    assert.equal(h.ctx.undoStack.length,0,'clear synchronously, not in a success callback');
    h.click('undo');h.click('undo');await tick();
    assert.equal(h.ctx.syncPending,1,'rapid Undo must not enqueue old whole-state snapshots');
    assert.equal(h.writes.length,count+1);assert.equal((await h.persisted())[tableKey(table)].length,0);
    assert.ok(!h.messages.some(([message])=>message==='已儲存'||message==='已復原上一步'));
    release();await h.settle();assert.equal((await h.persisted())[tableKey(table)].length,1);
    assert.equal((await h.persisted()).blocks[0].pin,true);assert.equal(h.ctx.SYNC.state,'ok');
  });
  test(`${table}: failed accepted save keeps dirty records and retry without restoring unsafe history`,async t=>{
    const h=await harness(t,{table});await h.pin();h.fail(true);await h.add(table,'RETRY-ME');
    assert.equal(h.ctx.SYNC.state,'error');assert.equal(h.ctx.undoStack.length,0);assert.equal(h.rows().length,1);
    assert.equal((await h.persisted())[tableKey(table)].length,0);assert.match(h.messages.at(-1)[0],/沒存到/);
    assert.ok(!h.messages.some(([message])=>message==='已儲存'));
    const count=h.writes.length;h.click('undo');await h.settle();
    assert.equal(h.writes.length,count);assert.equal(h.rows().length,1);assert.equal(h.ctx.SYNC.state,'error');
    h.fail(false);h.click('sync');await h.settle();
    assert.equal(h.ctx.SYNC.state,'ok');assert.equal(content(table,(await h.persisted())[tableKey(table)][0]),'RETRY-ME');
    assert.equal((await h.persisted()).blocks[0].pin,true);await noStaleUndo(h);
  });
  for(const existing of [false,true])test(`${table}: invalid ${existing?'edit':'new row'} does not consume history`,async t=>{
    const h=await harness(t,{table,existing});await h.pin();const count=h.writes.length;
    h.open(table,existing?'record':undefined);
    h.setFields([[contentKey(table),'INVALID'],[table==='wl'?'goodQty':'f1.shortQty','-1','number']]);h.click('tbl-save');await h.settle();
    assert.equal(h.writes.length,count);assert.equal(h.ctx.UI.modal.saving,false);assert.match(h.messages.at(-1)[0],/沒存到/);
    assert.equal(h.rows().length,existing?1:0);if(existing)assert.equal(content(table,h.rows()[0]),'ORIGINAL');
    await historyStillWorks(h);
  });
  test(`${table}: invalid and unchanged inline edits do not consume history`,async t=>{
    const h=await harness(t,{table,existing:true});await h.pin();const count=h.writes.length;
    h.change(table,contentKey(table),'ORIGINAL');h.change(table,contentKey(table),'MISSING','text','missing');
    h.change(table,table==='wl'?'goodQty':'f1.shortQty','-1','number');
    h.change(table,contentKey(table),'x'.repeat(121));await h.settle();
    assert.equal(h.writes.length,count);assert.equal(content(table,h.rows()[0]),'ORIGINAL');await historyStillWorks(h);
  });
  for(const method of ['close','Escape'])test(`${table}: ${method} cancels a table draft without consuming history`,async t=>{
    const h=await harness(t,{table,existing:true});await h.pin();const count=h.writes.length;
    h.open(table,'record');h.setFields([[contentKey(table),'CANCELLED']]);
    if(method==='close')h.click('close');else h.escape();
    h.ctx.UI.editCell={table,id:'record',key:contentKey(table)};h.escape();
    assert.equal(h.ctx.UI.modal,null);assert.equal(h.ctx.UI.editCell,null);assert.equal(h.writes.length,count);
    assert.equal(content(table,h.rows()[0]),'ORIGINAL');await historyStillWorks(h);
  });
  test(`${table}: permission denial before commit preserves prior history and sends no table write`,async t=>{
    const h=await harness(t,{table,existing:true});await h.pin();const count=h.writes.length;
    h.denied.add(permission(table));h.open(table,'record');h.setFields([[contentKey(table),'DENIED']]);h.click('tbl-save');
    h.click(table==='wl'?'wl-del':'rush-del',{id:'record'});h.click(table==='wl'?'wl-del':'rush-del',{id:'record'});
    assert.equal(await h.ctx.commit(null,permission(table)),false);await h.settle();
    assert.equal(h.writes.length,count);assert.equal(content(table,h.rows()[0]),'ORIGINAL');await historyStillWorks(h);
  });
  test(`${table}: newer schedule changes remain undoable without crossing the table boundary`,async t=>{
    const h=await harness(t,{table});await h.pin();await h.add(table,'KEEP');await h.pin();await h.pin();
    assert.equal(h.ctx.undoStack.length,2,'ordinary schedule commits must not clear their own history');
    h.click('tbl-save');assert.equal(h.ctx.undoStack.length,2,'stale duplicate Save after close is a no-op');
    for(const pin of [false,true]){h.click('undo');await h.settle();const saved=await h.persisted();assert.equal(saved.blocks[0].pin,pin);assert.equal(content(table,saved[tableKey(table)][0]),'KEEP');}
    const count=h.writes.length;h.click('undo');await h.settle();assert.equal(h.writes.length,count);
  });
}
for(const archived of [false,true])test(`rush: ${archived?'unarchive':'archive'} cannot be reversed by earlier schedule Undo`,async t=>{
  const h=await harness(t,{table:'rush',existing:true});h.rows()[0].archived=archived;await h.store.sync(h.ctx.S);await h.pin();
  h.click(archived?'rush-unarchive':'rush-archive',{id:'record'});await h.settle();
  assert.equal((await h.persisted()).rushOrders[0].archived,!archived);await noStaleUndo(h);
});
test('rush: no eligible archive or missing restore target preserves schedule history',async t=>{
  const h=await harness(t,{table:'rush'});await h.pin();const count=h.writes.length;
  h.click('rush-archive');h.click('rush-unarchive',{id:'missing'});await h.settle();
  assert.equal(h.writes.length,count);await historyStillWorks(h);
});
test('a table mutation queued behind an earlier schedule write blocks stale Undo immediately',async t=>{
  const h=await harness(t,{table:'wl'}),release=h.hold();
  h.ctx.openModal({t:'blk',id:'b'});h.click('b-pin');h.click('close');
  h.open('wl');h.setFields([['code','QUEUED-WORK']]);h.click('tbl-save');
  h.open('rush');h.setFields([['f1.desc','QUEUED-RUSH']]);h.click('tbl-save');
  assert.equal(h.ctx.undoStack.length,0);h.click('undo');await tick();assert.equal(h.ctx.syncPending,3);
  release();await h.settle();const saved=await h.persisted();
  assert.equal(h.writes.length,3);assert.equal(saved.blocks[0].pin,true);assert.equal(saved.workLog.length,1);assert.equal(saved.rushOrders.length,1);
});

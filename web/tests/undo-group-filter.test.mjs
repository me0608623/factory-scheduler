import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Execute the production modal, selection, Undo, commit and queueSync with LocalStore.
async function harness(t){
 const base=new URL('../',import.meta.url),src=fs.readFileSync(new URL('src/app.js',base),'utf8');
 const groups=await import(new URL('src/groups.js',base));
 const {LocalStore}=await import(new URL('src/store/local.js',base));
 const memory=new Map();const previous=globalThis.localStorage;globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};t.after(()=>{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;});
 const slice=(a,b)=>{assert(src.includes(a)&&src.includes(b));return src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)))};
 const state={employees:[{id:'e1',name:'A',factory:1,skills:['m1'],leaves:[],otWeekdays:[1],otOverrides:{},noOT:false,maxMachines:1},{id:'e2',name:'B',factory:1,skills:[],leaves:[],otWeekdays:[1],otOverrides:{},noOT:false,maxMachines:1},{id:'e3',name:'C',factory:2,skills:[],leaves:[],otWeekdays:[1],otOverrides:{},noOT:false,maxMachines:1}],groups:[],groupMembers:[],machines:[],products:[],orders:[],blocks:[],log:[],cal:{week:[],over:{}},dayOT:{}};
 let nextId=0;
 const c=vm.createContext({S:structuredClone(state),UI:{group:'all',factory:1,modal:null},MODALS:{},MODAL_ACT:{},STORE:new LocalStore(),SOLVER:null,SYNC:{state:'ok'},undoStack:[],syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,...groups, $:()=>null,canGroups:()=>true,canPermission:()=>true,tx:x=>x,esc:x=>String(x??''),factoryName:x=>'F'+x,uid:()=>`test-${++nextId}`,inFactory:(e,f)=>f==='all'||e.factory===f,factoryOf:e=>e.factory,overtimeWeekdays:e=>e.otWeekdays,DEF_WEEK:[],HOLI:{},FACTORIES:[1,2],emp:id=>c.S.employees.find(e=>e.id===id),syncInputs:()=>{},renderModal:()=>{},confirmStep:()=>true,toast:()=>{},updateSyncChip:()=>{},maybeReload:()=>{},changedWriteSession:()=>{},closeModal:()=>{c.UI.modal=null},render:()=>{c.lastRender={people:c.shownEmployees().map(e=>e.id),html:c.staffGroupFilterHTML()}}});
 vm.runInContext(slice('function pushUndo(){','/* ===== 5.')+'\n'+slice('function queueSync(entry){','function changedWriteSession(){')+'\n'+slice('function normalizeState(){','async function reloadFromStore(')+'\n'+slice('function staffGroupFilterHTML(){','function empChipsHTML(')+'\n'+slice("MODALS['staff-group']=",'// 視覺效果展示頁')+'\n'+src.match(/const shownEmployees=\(\)=>[^\n]+/)[0]+'\nglobalThis.shownEmployees=shownEmployees;globalThis.staffGroupFilterHTML=staffGroupFilterHTML;',c);
 const ids=()=>Array.from(c.shownEmployees(),e=>e.id);
 const select=id=>vm.runInContext(src.match(/if\(e.target.id==='staff-group-filter'\)\{[^\n]+/)[0].replace('return;',''),vm.createContext({...c,e:{target:{id:'staff-group-filter',value:id}}}));
 const save=async()=>{c.MODAL_ACT['group-save']();await c.syncChain;assert.equal(c.SYNC.state,'ok')};
 const open=id=>{c.UI.modal={t:'staff-group',...(id?{id}:{})};c.MODALS['staff-group'](c.UI.modal);return c.UI.modal};
 return {c,ids,select,save,open,state};
}

test('Undo group creation resets a missing roster filter before render and persists all employees',async t=>{
 const {c,ids,select,save,open,state}=await harness(t);
 assert.deepEqual(ids(),['e1','e2']);
 const m=open();m.draft.name='Support';c.MODAL_ACT['group-member']({dataset:{v:'e1'}});c.MODAL_ACT['group-member']({dataset:{v:'e3'}});const gid=m.draft.id;await save();
 select(gid);assert.deepEqual(ids(),['e1']);c.UI.factory='all';assert.deepEqual(ids(),['e1','e3']);c.UI.factory=1;
 assert.equal((await c.STORE.load()).groups[0].id,gid);
 await c.undo();assert.equal(c.S.groups.length,0);assert.equal((await c.STORE.load()).groups.length,0);assert.equal(c.UI.group,'all');assert.deepEqual(ids(),['e1','e2']);assert.deepEqual(Array.from(c.lastRender.people),['e1','e2']);assert(c.lastRender.html.includes('value="all" selected'));assert.deepEqual((await c.STORE.load()).employees,state.employees);
});

test('valid empty groups, membership, rename, factory, ungrouped and retirement keep their behavior across Undo',async t=>{
 const {c,ids,select,save,open,state}=await harness(t);
 const m=open();m.draft.name='Empty';const gid=m.draft.id;await save();select(gid);assert.deepEqual(ids(),[]);
 open(gid);c.UI.modal.draft.name='Renamed';await save();assert(c.staffGroupFilterHTML().includes('Renamed'));await c.undo();assert.equal(c.UI.group,gid);assert.deepEqual(ids(),[]);assert(c.staffGroupFilterHTML().includes('Empty'));
 open(gid);c.MODAL_ACT['group-member']({dataset:{v:'e1'}});c.MODAL_ACT['group-member']({dataset:{v:'e3'}});await save();assert.deepEqual(ids(),['e1']);c.UI.factory=2;assert.deepEqual(ids(),['e3']);c.UI.factory='all';assert.deepEqual(ids(),['e1','e3']);await c.undo();assert.equal(c.UI.group,gid);assert.deepEqual(ids(),[]);
 open(gid);c.MODAL_ACT['group-member']({dataset:{v:'e2'}});c.UI.modal.members[0].reviewStatus='pending';await save();assert.deepEqual(ids(),['e2']);
 select('ungrouped');assert.deepEqual(ids(),['e1','e3']);await c.undo();assert.equal(c.UI.group,'ungrouped');assert.deepEqual(ids(),['e1','e2','e3']);
 select('all');open(gid);c.UI.modal.draft.name='Another name';await save();await c.undo();assert.equal(c.UI.group,'all');assert.deepEqual(ids(),['e1','e2','e3']);
 select(gid);open(gid);c.MODAL_ACT['group-retire']({dataset:{}});await c.syncChain;assert.equal(c.UI.group,'all');await c.undo();assert.equal(c.UI.group,'all');assert.equal(c.S.groups[0].id,gid);
 c.UI.group='missing';c.normalizeState();assert.equal(c.UI.group,'all');select(gid);c.normalizeState();assert.equal(c.UI.group,gid);assert.deepEqual(ids(),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(c.S.employees)),state.employees);assert.deepEqual((await c.STORE.load()).employees,state.employees);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {assignmentToDb,assignmentIssues,assignments,workWindows,workCatalog} from '../src/general-work.js';
import {transferPlanWarnings} from '../src/transfers.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {createClient} from '@supabase/supabase-js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
const src=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const date='2030-01-07';
const row=(more={})=>({id:'a',workId:'w',emp:'e',resourceId:null,date,s:480,e:540,qty:60,orderId:null,note:'original',...more});
function fixture(state={cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},workAssignments:[row()],workContents:[{id:'w',name:'Work',employeeIds:['e'],resourceIds:[],factory:1}],employees:[{id:'e',name:'Worker'}],machines:[],orders:[],setupPending:false},store=null){
  const events=[],handlers={},root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],contains:()=>false},modal={focus:()=>{}},overlay={scrollTop:0,querySelector:()=>modal,addEventListener:()=>{}};
  const ctx={S:state,STORE:store,UI:{modal:null,date,factory:1,zoom:1},PV:null,readOnly:false,MODALS:{},MODAL_ACT:{},assignmentToDb,assignments,workCatalog,assignmentIssues:()=>[],dayInfo:d=>({win:workWindows(ctx.S,d)}),todayStr:()=>date,nowMin:()=>0,
    tx:x=>x,esc:x=>String(x??''),workName:()=> 'Work',emp:()=>({name:'Worker'}),mach:()=>null,hm:x=>String(x),textInput:()=>'',inFactory:()=>true,transferPlanWarnings:()=>[],transferOrders:s=>s.transferOrders||[],uid:()=>crypto.randomUUID(),
    absOf:(d,t)=>Date.parse(d+'T00:00Z')/60000+t,nowAbs:()=>Date.parse(date+'T00:00Z')/60000,toast:t=>events.push(t),pushUndo:()=>{},commit:()=>events.push('commit'),structuredClone,
    document:{querySelector:()=>null,activeElement:null,body:{},addEventListener:(type,fn)=>handlers[type]=fn,elementFromPoint:()=>null},HTMLElement:class{},modalReturnFocus:null,cancelPlanCalculation:()=>{},executionRetries:{get:()=>null},requestAnimationFrame:fn=>fn(),maybeReload:()=>{},modalFocusFromToken:()=>null,modalFocusable:()=>[],hourPx:()=>60,
    $:selector=>selector==='#modal-root'?root:selector==='#ov'?overlay:null};
  vm.createContext(ctx);
  let at=src.indexOf('function captureGeneralSource(');vm.runInContext(src.slice(at,src.indexOf('function workBlockHTML(',at)),ctx);
  at=src.indexOf('function openModal(');vm.runInContext(src.slice(at,src.indexOf('function ownsLegacyRequest(',at)),ctx);
  at=src.indexOf('function sizeBlockDetailModal(');vm.runInContext(src.slice(at,src.indexOf('function rerender(',at)),ctx);
  at=src.indexOf('let generalDrag=null');vm.runInContext(src.slice(at,src.indexOf('// ---------- 啟動',at)),ctx);
  ctx.render=()=>ctx.renderModal();ctx.readGeneralFields=()=>{};
  return {ctx,events,handlers,root};
}
function edit(f,id='a'){f.ctx.openModal({t:'general-edit',id});return f.ctx.UI.modal;}
function preview(f,draft,source=f.ctx.captureGeneralSource(draft.id)){f.ctx.previewGeneral(draft,source);return f.ctx.UI.modal;}
test('real edit and modal render preserve original source across target change before preview',()=>{
  const f=fixture(),m=edit(f),source=m.source;m.draft.s=600;f.ctx.S.workAssignments[0].qty=75;f.ctx.renderModal();
  assert.equal(m.source,source);assert.equal(m.draft.qty,60);f.ctx.MODAL_ACT['gw-preview']();
  assert.equal(f.ctx.UI.modal,m);assert.equal(f.events.includes('commit'),false);assert.match(f.events.at(-1),/已變更/);
});
test('real preview renderer retains draft but apply rejects changed or deleted target',()=>{
  for(const change of ['edit','delete']){const f=fixture(),m=preview(f,{...row(),s:600,e:660});
    if(change==='edit')f.ctx.S.workAssignments[0].note='remote';else f.ctx.S.workAssignments=[];
    f.ctx.renderModal();assert.equal(f.ctx.UI.modal,m);assert.equal(m.draft.note,'original');assert.match(f.root.innerHTML,/gw-apply/);
    f.ctx.MODAL_ACT['gw-apply']();assert.equal(f.events.includes('commit'),false,change);
  }
});
test('owner/store/client/user/auth epoch changes reject both preview and apply',()=>{
  for(const phase of ['edit','preview'])for(const kind of ['store','client','user','epoch']){
    const store={sb:{},session:{user:{id:'owner'}},authEpoch:0},f=fixture(undefined,store),m=phase==='edit'?edit(f):preview(f,row({s:600,e:660}));
    if(kind==='store')f.ctx.STORE={...store};if(kind==='client')store.sb={};if(kind==='user')store.session.user.id='other';if(kind==='epoch')store.authEpoch++;
    if(phase==='edit')f.ctx.MODAL_ACT['gw-preview']();else f.ctx.MODAL_ACT['gw-apply']();assert.equal(f.events.includes('commit'),false,phase+kind);
  }
});
test('new assignment collision rejects while normal new/edit and unrelated change succeed',()=>{
  const f=fixture(),newRow=row({id:'new'});preview(f,newRow);f.ctx.S.workAssignments.push({...newRow,note:'another writer'});f.ctx.MODAL_ACT['gw-apply']();assert.equal(f.events.includes('commit'),false);
  for(const id of ['a','fresh']){const f=fixture();preview(f,row({id,s:600,e:660}));f.ctx.S.workAssignments.push(row({id:'unrelated',s:780,e:840}));f.ctx.MODAL_ACT['gw-apply']();assert.equal(f.events.includes('commit'),true);}
});
test('pointerdown clones source and pointerup rejects target changes, owner changes and deletion',()=>{
  for(const change of ['edit','delete','owner']){const f=fixture(),el={dataset:{gid:'a'},style:{height:'60px'}};
    f.handlers.pointerdown({button:0,target:{closest:q=>q==='.workblk'?el:null},clientX:0,clientY:0});
    f.handlers.pointermove({clientX:0,clientY:60,preventDefault:()=>{}});
    if(change==='edit')f.ctx.S.workAssignments[0].qty=75;if(change==='delete')f.ctx.S.workAssignments=[];if(change==='owner')f.ctx.STORE={};
    f.handlers.pointerup({clientX:0,clientY:60});assert.equal(f.ctx.UI.modal,null);assert.equal(f.events.includes('commit'),false);
  }
  const f=fixture(),el={dataset:{gid:'a'},style:{height:'60px'}};f.handlers.pointerdown({button:0,target:{closest:q=>q==='.workblk'?el:null},clientX:0,clientY:0});
  f.handlers.pointermove({clientX:0,clientY:60,preventDefault:()=>{}});f.handlers.pointerup({clientX:0,clientY:60});assert.equal(f.ctx.UI.modal.draft.s,540);f.ctx.MODAL_ACT['gw-apply']();assert.equal(f.events.includes('commit'),true);
});

function installQueue(f){const {ctx}=f;Object.assign(ctx,{SOLVER:null,canPermission:key=>ctx.STORE.can(key),normalizeState:()=>{},updateSyncChip:()=>{},SYNC:{state:'ok'},lastLocalWrite:0,pendingReload:false,remoteLoading:false,undoStack:[],drag:null,setTimeout,clearTimeout,addEventListener:()=>{},reloadTimer:null,notificationEnabled:()=>false,showDeviceNotification:()=>{}});
  let at=src.indexOf('let syncChain=Promise.resolve()');vm.runInContext(src.slice(at,src.indexOf('// ---------- 別人改了',at)),ctx);
  at=src.indexOf('async function reloadFromStore(');vm.runInContext(src.slice(at,src.indexOf('async function refreshCloudSnapshot',at)),ctx);
  at=src.indexOf('function remoteReloadBlocked()');vm.runInContext(src.slice(at,src.indexOf('\n',at)),ctx);
  at=src.indexOf('function onRemoteChange(');vm.runInContext(src.slice(at,src.indexOf('// ---------- 帳號與連線',at)),ctx);
  at=src.indexOf('function commit(');vm.runInContext(src.slice(at,src.indexOf('\nasync function undo',at)),ctx);
}
test('real UI queue + SDK HTTP409 + SQL recovery retains preview but cannot overwrite remote edit; unchanged SQL reload remains editable',async()=>{
  const db=await makeDb();try{
    const actor=crypto.randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[actor,'general-source@invalid']);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const users={'general-source@invalid':{id:actor,password:'pw'}},store=new SupabaseStore(new FakeSupabase(db,users));await store.login('general-source@invalid','pw');let S=await store.load();
    const employee=S.employees.find(e=>e.name==='張三').id,work=crypto.randomUUID();S.workContents=[{id:work,name:'Manual',factory:1,requiresResource:false,employeeIds:[employee],resourceIds:[],reviewStatus:'confirmed'}];await store.sync(S);
    const a=row({id:crypto.randomUUID(),workId:work,emp:employee}),other=row({id:crypto.randomUUID(),workId:work,emp:employee,s:660,e:720});S.workAssignments=[a,other];await store.sync(S);S=await store.load();
    S.workAssignments=S.workAssignments.map(a=>Object.fromEntries(Object.entries(a).reverse().filter(([k,v])=>!(['resourceId','orderId','transferBatchId','transferStage'].includes(k)&&v==null))));
    const f=fixture(S,store),{ctx}=f;ctx.assignmentIssues=assignmentIssues;ctx.transferPlanWarnings=transferPlanWarnings;installQueue(f);
    // Canonical source survives real DB ordering and null optional fields.
    const m=edit(f,a.id);m.draft.s=600;m.draft.e=660;assert.equal(await ctx.reloadFromStore(),'applied');assert.equal(ctx.UI.modal,m);ctx.MODAL_ACT['gw-preview']();ctx.MODAL_ACT['gw-apply']();await vm.runInContext('syncChain',ctx);assert.equal((await store.load()).workAssignments.find(x=>x.id===a.id).s,600);
    // Return to a consistent current UI snapshot for the two-device flow.
    await ctx.reloadFromStore();const local=ctx.S.workAssignments.find(x=>x.id===a.id);
    const remote=new SupabaseStore(new FakeSupabase(db,users));await remote.login('general-source@invalid','pw');const R=await remote.load();
    let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r),responses=[];let calls=0;const transport=store.sb;
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/save_work_assignments');if(++calls===1){entered();await gate;}
      const result=await FakeSupabase.prototype.rpc.call(transport,'save_work_assignments',JSON.parse(options.body)),status=result.error?(result.error.code==='40001'?409:400):200;responses.push({status,code:result.error?.code});
      return new Response(JSON.stringify(result.error||result.data),{status,headers:{'content-type':'application/json'}});
    }}});transport.rpc=(name,args)=>name==='save_work_assignments'?sdk.rpc(name,args):FakeSupabase.prototype.rpc.call(transport,name,args);
    preview(f,{...other,note:'local other'});ctx.MODAL_ACT['gw-apply']();await ready;
    const oldPreview=preview(f,{...local,s:480,e:540,note:'stale preview'});assert.equal(await ctx.reloadFromStore({background:true}),'deferred');
    Object.assign(R.workAssignments.find(x=>x.id===a.id),{s:780,e:840,qty:75,note:'REMOTE IMPORTANT'});await remote.sync(R);release();await vm.runInContext('syncChain',ctx);
    assert.deepEqual(responses,[{status:409,code:'40001'}]);assert.equal(ctx.UI.modal,oldPreview);assert.equal(oldPreview.draft.qty,60);assert.match(f.root.innerHTML,/gw-apply/);assert.equal(ctx.S.workAssignments.find(x=>x.id===a.id).qty,75);
    ctx.MODAL_ACT['gw-apply']();await vm.runInContext('syncChain',ctx);assert.equal(responses.length,1,'stale confirmation never dispatches another write');
    const persisted=(await remote.load()).workAssignments.find(x=>x.id===a.id);assert.equal(persisted.qty,75);assert.equal(persisted.s,780);assert.equal(persisted.note,'REMOTE IMPORTANT');assert.match(f.events.at(-1),/已變更/);
  }finally{await db.close();}
});

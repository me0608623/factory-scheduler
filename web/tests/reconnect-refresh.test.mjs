import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const reloadStart=source.indexOf('async function reloadFromStore(');
const reloadCode=source.slice(reloadStart,source.indexOf('// ---------- 帳號與連線',reloadStart));
const bootStart=source.indexOf('async function start(){');
const bootCode=source.slice(bootStart,source.indexOf('const crossFactoryUI=',bootStart));

async function started({offline=false,localEmpty=false,cloudEmpty=false}={}){
  let status,read=0,rendered=0,saved=0,demo=0;
  const timers=[];
  const snapshot=version=>({version,employees:[{id:'TEST-E01'}],blocks:[{id:'v'+version}],log:[]});
  const ctx={STORE:{kind:localEmpty?'local':'supabase',version:0,session:{user:{id:'TEST-USER'}},init:async()=>({needLogin:false}),can:()=>true,
    load:async({remember=true}={})=>{if(offline)throw new Error('cloud offline');const s=snapshot(++read);if(localEmpty)return null;if(cloudEmpty)s.employees=[];if(remember)ctx.STORE.version=s.version;return s;},
    acceptLoaded:s=>{ctx.STORE.version=s.version;},subscribe:(change,cb)=>{status=cb;if(!localEmpty)cb('CONNECTING');}},
    S:null,UI:{date:'2026-10-12',view:'day',factory:1,prefs:{},modal:null},SYNC:{state:'ok',realtime:null},
    PV:null,drag:null,generalDrag:null,syncPending:0,lastLocalWrite:0,pendingReload:false,undoStack:[],reloadTimer:null,remoteLoading:false,
    scheduleChat:null,SOLVER:{check:async()=>false},location:{search:''},URLSearchParams,
    stopLoginViz:()=>{},showLogin:()=>assert.fail('must retain current login'),normalizeState:()=>{},
    makeDemo:()=>{if(!localEmpty)assert.fail('must never substitute demo data for this cloud state');demo++;ctx.S=snapshot(1);},
    queueSync:()=>{saved++;return Promise.resolve(true);},
    loadPreferencesForDevice:()=>{},loadFactory:()=>{},todayStr:()=> '2026-10-12',render:()=>rendered++,
    flashReturnRow:()=>{},tourDone:()=>true,installScheduleChat:()=>({refresh:()=>{}}),
    updateSyncChip:()=>{},toast:()=>{},notificationEnabled:()=>true,
    showDeviceNotification:()=>assert.fail('reconciliation alone must not notify about a new edit'),
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},setInterval:()=>1};
  vm.createContext(ctx);vm.runInContext(reloadCode+bootCode,ctx);await ctx.start();
  return {ctx,timers,status:s=>status(s),reads:()=>read,renders:()=>rendered,saved:()=>saved,demos:()=>demo};
}

test('real startup subscription reconciles the initial snapshot/join gap once',async()=>{
  const h=await started();h.status('SUBSCRIBED');assert.equal(h.timers.length,1);
  await h.timers.shift()();assert.equal(h.reads(),2);assert.equal(h.ctx.S.version,2);assert.equal(h.renders(),2);
});

test('recovered connection fetches missed changes, even without a postgres event',async()=>{
  const h=await started();h.status('SUBSCRIBED');await h.timers.shift()();
  h.status('CHANNEL_ERROR');assert.equal(h.timers.length,0);
  h.status('SUBSCRIBED');await h.timers.shift()();
  assert.equal(h.ctx.S.blocks[0].id,'v3');assert.equal(h.ctx.STORE.version,3);assert.equal(h.reads(),3);
});

test('duplicate subscribed callbacks do not enqueue duplicate refreshes',async()=>{
  const h=await started();h.status('SUBSCRIBED');h.status('SUBSCRIBED');h.status('SUBSCRIBED');
  assert.equal(h.timers.length,1);await h.timers.shift()();assert.equal(h.reads(),2);
});

test('reconnect during a draft waits for cancellation before reading and rendering',async()=>{
  const h=await started();h.ctx.UI.modal={draft:{name:'still typing'}};
  h.status('SUBSCRIBED');assert.equal(h.timers.length,0);assert.equal(h.reads(),1);assert.equal(h.ctx.pendingReload,true);
  h.ctx.UI.modal=null;h.ctx.maybeReload();await h.timers.shift()();assert.equal(h.reads(),2);
});

test('healthy reconnect must not read over an unsuccessful write or active preview',async()=>{
  for(const mode of ['unsaved','preview','inflight']){
    const h=await started();
    if(mode==='unsaved')h.ctx.SYNC.state='error';
    if(mode==='preview')h.ctx.PV={kind:'manual'};
    if(mode==='inflight')h.ctx.syncPending=1;
    h.status('SUBSCRIBED');h.ctx.maybeReload();
    assert.equal(h.timers.length,0,mode);assert.equal(h.reads(),1,mode);assert.equal(h.ctx.S.version,1,mode);
  }
});

test('cloud startup read failure is surfaced, never converted to editable demo data',async()=>{
  await assert.rejects(started({offline:true}),/cloud offline/);
});

test('first-use local demo and genuine empty cloud data keep their distinct semantics',async()=>{
  const local=await started({localEmpty:true});assert.equal(local.demos(),1);assert.equal(local.saved(),1);assert.equal(local.renders(),1);
  const cloud=await started({cloudEmpty:true});assert.equal(cloud.demos(),0);assert.equal(cloud.saved(),0);assert.equal(cloud.ctx.S.employees.length,0);
});

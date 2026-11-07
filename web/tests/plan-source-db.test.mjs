// Actual Store + isolated PostgreSQL schema: another device changes metadata,
// background refresh is deferred by PV, but /plans/db reads the newer snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';
import {assertPlanSource} from '../src/plan-source.js';
import {applyOption} from '../src/convert.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const uid='11111111-1111-4111-8111-111111111111';

test('metadata-only edit on another device blocks initial and rerun despite unchanged version',async()=>{
  const db=await makeDb();try{
    await db.query("insert into auth.users(id,email) values($1,'boss@x')",[uid]);await db.query("update profiles set role='boss' where user_id=$1",[uid]);
    // Fixed dates make this metadata-only reproduction independent of wall time.
    await db.query("update orders set due_date='2026-11-20'");
    const login=async()=>{const s=new SupabaseStore(new FakeSupabase(db,{'boss@x':{id:uid,password:'pw'}}));await s.init();await s.login('boss@x','pw');return s;};
    const store=await login(),other=await login(),B=await store.load(),messages=[],previews=[];
    const P={B,base:JSON.stringify(B),event:{type:'auto'},previewId:'old-preview',rerun:{keepPeople:true},opts:[{id:'A',A:B,applicable:true}],cur:'A'};
    const ctx={S:B,PV:P,STORE:store,$:()=>null,todayStr:()=> '2026-11-10',nowMin:()=>480,planTimeLimit:()=>.1,render(){},toast:x=>messages.push(x),tx:x=>x,
      assertPlanSource,applyOption,measure:()=>({}),assertExecutionProtected(){},validateGeneralWork(){},assignments:()=>[],drag:null,generalDrag:null,UI:{},syncPending:0,SYNC:{state:'ok'},pendingReload:false,lastLocalWrite:0,
      planCalculationReady:()=>true,enterPreview:x=>previews.push(x),pvOpt:()=>P.opts[0]};
    vm.createContext(ctx);
    for(const [a,b] of [['async function runRerun(','\ndocument.addEventListener("input"'],['async function openPlansSolver(','\nfunction openPlansLocal('],['async function reloadFromStore(','\nasync function refreshCloudSnapshot('],['function remoteReloadBlocked()','\nlet realtimePoll'],['async function pvApply(){','\nObject.assign(MODAL_ACT,{']]){
      const i=source.indexOf(a);vm.runInContext(source.slice(i,source.indexOf(b,i)),ctx);
    }
    const remote=await other.load(),oid=remote.orders[0].id;remote.orders[0].due='2026-11-09';await other.sync(remote,{kind:'order',title:'Synthetic due-date edit'});
    assert.equal(await ctx.reloadFromStore({background:true}),'deferred');assert.equal(ctx.S.orders.find(o=>o.id===oid).due,'2026-11-20');
    const {data:raw,error}=await store.sb.rpc('schedule_snapshot',{});assert.equal(error,null);assert.equal(raw.version,B.version);
    const plan={source_snapshot:raw,base_version:raw.version,preview_id:'new-preview',date:'2026-11-10',options:[{id:'R1',name:'Latest DB plan',blocks:[],effects:{}}]};
    ctx.SOLVER={up:true,capabilities:[],plansDb:async()=>plan};
    await ctx.openPlansSolver('Auto','Auto','auto',()=>{},[],{event:{type:'auto'}},{base:P.base});assert.equal(previews.length,0);
    await ctx.runRerun();assert.equal(P.cur,'A');assert.equal(P.opts.length,1);assert.equal(P.opts[0].applicable,false);assert.ok(P.sourceError);
    await ctx.pvApply(); // Even the retained handler cannot dispatch applyPlan.
    assert.equal((await db.query('select count(*)::int n from plan_previews')).rows[0].n,0);
    assert.equal((await other.load()).orders.find(o=>o.id===oid).due,'2026-11-09');assert.equal(ctx.S,B);
    // Once canceled/reloaded, the same authoritative response can be displayed.
    const fresh=await other.load();assert.doesNotThrow(()=>assertPlanSource(plan,fresh));
    assert.ok(messages.some(m=>/更新班表後重新計算/.test(m)));
  }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(){
  let resolve,reject,calls=0,renders=0;const promise=new Promise((a,b)=>{resolve=a;reject=b;}),messages=[];
  const P={rerun:{noLate:true,order:'O'},opts:[{id:'A'}],event:{},B:{blocks:[]}},store={kind:'supabase',authEpoch:1,session:{user:{id:'u'}},jwt:()=> 'synthetic'};
  const ctx={PV:P,STORE:store,S:{blocks:[]},$:()=>null,todayStr:()=> '2026-10-16',nowMin:()=>480,planTimeLimit:()=>3,
    render:()=>renders++,toast:m=>messages.push(m),SOLVER:{up:true,plansDb:()=>{calls++;return promise;}},
    applyOption:(base,opt)=>({...base,option:opt.id}),measure:()=>({}),assertExecutionProtected(){},validateGeneralWork(){},assignments:()=>[]};
  vm.createContext(ctx);const start=source.indexOf('async function runRerun(');
  vm.runInContext(source.slice(start,source.indexOf('\ndocument.addEventListener("input"',start)),ctx);
  return {ctx,P,store,resolve,reject,messages,calls:()=>calls,renders:()=>renders};
}
const reply={date:'2026-10-16',options:[{id:'R1',name:'New option'}]};
test('current rerun accepts once, rejects repeat clicks and retains original options',async()=>{
  const f=fixture(),task=f.ctx.runRerun();await f.ctx.runRerun();assert.equal(f.calls(),1);
  f.resolve(reply);await task;
  assert.deepEqual(Array.from(f.P.opts,x=>x.id),['A','R1']);assert.equal(f.P.cur,'R1');assert.equal(f.P.rerun.busy,false);assert.equal(f.messages.length,1);
});
test('cancelled/replaced preview or changed owner ignores late success, empty result and failure',async()=>{
  for(const change of ['cancel','preview','rerun','store','user','epoch'])for(const result of ['success','empty','error']){
    const f=fixture(),task=f.ctx.runRerun();
    if(change==='cancel')f.ctx.PV=null;
    if(change==='preview')f.ctx.PV={opts:[{id:'other'}]};
    if(change==='rerun')f.P.rerun={busy:false};
    if(change==='store')f.ctx.STORE={...f.store};
    if(change==='user')f.store.session.user.id='new-user';
    if(change==='epoch')f.store.authEpoch++;
    const renders=f.renders(),before=JSON.stringify(f.ctx.PV);
    if(result==='error')f.reject(new Error('synthetic old failure'));else f.resolve(result==='empty'?{options:[]}:reply);
    await task;
    assert.equal(f.messages.length,0,change+'/'+result);assert.equal(f.renders(),renders,change+'/'+result);
    assert.deepEqual(Array.from(f.P.opts,x=>x.id),['A']);
    // Old request cleanup may clear its own busy bit, but cannot select a new option.
    assert.equal(f.P.cur,undefined);if(change==='preview')assert.equal(JSON.stringify(f.ctx.PV),before);
  }
});
test('current failed rerun clears busy and reports failure without replacing options',async()=>{
  const f=fixture(),task=f.ctx.runRerun();f.reject(new Error('synthetic failure'));await task;
  assert.equal(f.P.rerun.busy,false);assert.equal(f.messages.length,1);assert.deepEqual(Array.from(f.P.opts,x=>x.id),['A']);
});

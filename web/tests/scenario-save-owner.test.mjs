import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeScenario} from '../src/scenarios.js';
import {LocalStore} from '../src/store/local.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  const write=deferred(),events=[],writes=[],input={value:'Synthetic comparison'};
  const state={cal:{week:[],over:{}},dayOT:{},employees:[],machines:[],orders:[],products:[],blocks:[],log:[]};
  const ctx={S:state,PV:null,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null,modal:{t:'scenario-save',base:state,candidate:state}},
    STORE:{sb:{},session:{user:{id:'A'}},authEpoch:1,saveScenario:item=>{writes.push(item);return write.promise;}},
    $:()=>input,makeScenario,canPermissionRaw:()=>true,tx:x=>x,esc:x=>String(x),toast:text=>events.push(text),renderModal:()=>{},maybeReload:()=>{},
    closeModal:()=>{events.push('close');ctx.UI.modal=null;}};
  vm.createContext(ctx);const at=source.indexOf('async function saveScenarioFromModal(');vm.runInContext(source.slice(at,source.indexOf('async function viewScenario(',at)),ctx);
  return {ctx,write,events,writes,input,m:ctx.UI.modal,start:()=>ctx.saveScenarioFromModal({disabled:false})};
}
test('actual scenario save ignores old success or failure after modal, actor, client, view or state changes',async()=>{
  for(const outcome of ['resolve','reject'])for(const mode of ['modal','user','client','epoch','store','date','factory','state','permission','preview']){
    const f=fixture(),task=f.start();
    if(mode==='modal')f.ctx.UI.modal={t:'new-draft'};if(mode==='user')f.ctx.STORE.session={user:{id:'B'}};if(mode==='client')f.ctx.STORE.sb={};
    if(mode==='epoch')f.ctx.STORE.authEpoch++;if(mode==='store')f.ctx.STORE={...f.ctx.STORE};if(mode==='date')f.ctx.UI.date='2000-01-02';
    if(mode==='factory')f.ctx.UI.factory=2;if(mode==='state')f.ctx.S={...f.ctx.S};if(mode==='permission')f.ctx.canPermissionRaw=()=>false;if(mode==='preview')f.ctx.PV={};
    const modal=f.ctx.UI.modal;outcome==='resolve'?f.write.resolve(f.writes[0].id):f.write.reject(new Error('OLD_ERROR'));await task;
    assert.equal(f.ctx.UI.modal,modal,mode+'/'+outcome);assert.deepEqual(f.events,[],mode+'/'+outcome);
  }
});
test('actual scenario save rejects fresh-button double tap, including a second dialog while pending',async()=>{
  const f=fixture(),first=f.start(),second=f.start();assert.equal(f.writes.length,1);assert.ok(f.ctx.UI.scenarioSaving);
  f.ctx.UI.modal={...f.m};await f.start();assert.equal(f.writes.length,1);f.write.resolve(f.writes[0].id);await Promise.all([first,second]);assert.equal(f.ctx.UI.scenarioSaving,null);
});
test('scenario saves remain available in stable preview without changing schedule or preview',async()=>{
  const f=fixture();f.ctx.PV={title:'Synthetic preview'};const before=JSON.stringify(f.ctx.S),preview=f.ctx.PV;
  const task=f.start();f.write.resolve(f.writes[0].id);await task;assert.equal(f.ctx.UI.modal,null);assert.equal(JSON.stringify(f.ctx.S),before);assert.equal(f.ctx.PV,preview);assert.equal(f.writes.length,1);
});
test('same-name retry reuses payload and id; explicitly edited name is not silently saved under old name',async()=>{
  const f=fixture();f.ctx.STORE.saveScenario=async item=>{f.writes.push(item);throw new Error('SYNTHETIC_REJECTION');};
  await f.start();const first=f.writes[0];await f.start();assert.equal(JSON.stringify(f.writes[1]),JSON.stringify(first));
  f.input.value='Renamed synthetic comparison';await f.start();assert.equal(f.writes[2].name,f.input.value);assert.notEqual(f.writes[2].id,first.id);assert.equal(f.ctx.UI.modal,f.m);
});
test('own save error is inline, preserves name, and releases controls without automatically retrying',async()=>{
  const f=fixture(),task=f.start();assert.equal(f.m.saving,true);f.write.reject(new Error('SYNTHETIC_REJECTION'));await task;
  assert.equal(f.m.error,'SYNTHETIC_REJECTION');assert.equal(f.m.name,f.input.value);assert.equal(f.m.saving,false);assert.equal(f.ctx.UI.scenarioSaving,null);assert.equal(f.writes.length,1);
});
test('actual LocalStore saves comparison only and provides device-local success without changing schedule',async()=>{
  const previous=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  try{const f=fixture();f.ctx.STORE=new LocalStore();const before=JSON.stringify(f.ctx.S);await f.start();const items=await f.ctx.STORE.listScenarios();assert.equal(items.length,1);assert.equal((await f.ctx.STORE.getScenario(items[0].id)).name,f.input.value);assert.equal(JSON.stringify(f.ctx.S),before);assert.match(f.events.at(-1),/這台裝置/);}
  finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

test('real SQL unknown scenario outcome then close-reopen same name saves one row, not a duplicate',async()=>{
  const {makeDb,FakeSupabase}=await import('./fake-supabase.mjs');const {SupabaseStore}=await import('../src/store/supabase.js');const {createClient}=await import('@supabase/supabase-js');
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444';
    await db.query("insert into auth.users(id,email) values($1,'synthetic-scen@invalid')",[actor]);
    await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;
    const reader=new SupabaseStore(fake);await reader.init();
    let failFirst=true;
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      const result=await fake.rpc('save_planning_scenario',JSON.parse(options.body));
      assert.equal(result.error,null);
      if(failFirst){failFirst=false;throw new TypeError('Failed to fetch');}
      return new Response(JSON.stringify(result.data),{status:200,headers:{'content-type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};
    const f=fixture();f.ctx.STORE=store;
    await f.start();                                        // #1 RPC commits, response lost
    assert.ok(f.m.error,'first save surfaced its error');
    f.ctx.closeModal();
    f.ctx.UI.modal={t:'scenario-save',base:f.ctx.S,candidate:f.ctx.S};   // user reopens a fresh save dialog, same name
    const m2=f.ctx.UI.modal;const save2=()=>f.ctx.saveScenarioFromModal({disabled:false});
    await save2();                                          // #2 succeeds
    assert.equal(m2.error,null);
    const rows=(await db.query("select count(*)::int n from planning_scenarios where created_by=$1 and name='Synthetic comparison'",[actor])).rows[0].n;
    assert.equal(rows,1,'same-name reopen must reuse the unknown row, not create a duplicate');
  }finally{await db.close();}
});

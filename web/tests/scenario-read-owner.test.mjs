import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeScenario,validateScenario,scenarioStale} from '../src/scenarios.js';
import * as scenarios from '../src/scenarios.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  const request=defer(),events=[],calls=[],state={cal:{week:[],over:{}},dayOT:{},employees:[],machines:[],orders:[],products:[],blocks:[],log:[]};
  const item=makeScenario('Synthetic comparison',state,state);
  const ctx={S:state,PV:null,UI:{modal:{t:'scenario-list',items:[item]},date:'2000-01-01',factory:1,page:'schedule',drawer:null},STORE:{sb:{},session:{user:{id:'A'}},authEpoch:1,
    getScenario:id=>{calls.push(id);return request.promise;},listScenarios:()=>request.promise},canPermissionRaw:()=>true,validateScenario,scenarioStale,
    measure:()=>({}),renderModal:()=>{},tx:x=>x,toast:text=>events.push({type:'toast',text}),openModal:m=>{ctx.UI.modal=m;},
    enterPreview:p=>{events.push({type:'preview',p});ctx.UI.modal=null;ctx.PV=p;}};
  vm.createContext(ctx);let at=source.indexOf('function scenarioReadOwner(');if(at>=0)vm.runInContext(source.slice(at,source.indexOf('async function openScenarioList(',at)),ctx);
  at=source.indexOf('async function openScenarioList(');vm.runInContext(source.slice(at,source.indexOf('async function changeExecutionConfirmation(',at)),ctx);
  at=source.indexOf('async function viewScenario(');vm.runInContext(source.slice(at,source.indexOf('const reportingRole=',at)),ctx);
  return {ctx,request,events,calls,item,m:ctx.UI.modal,start:()=>ctx.viewScenario(item.id)};
}
function change(f,kind){
  if(kind==='modal')f.ctx.UI.modal={t:'new-draft'};if(kind==='date')f.ctx.UI.date='2000-01-02';if(kind==='factory')f.ctx.UI.factory=2;if(kind==='page')f.ctx.UI.page='orders';if(kind==='drawer')f.ctx.UI.drawer='settings';if(kind==='focus')f.ctx.UI.focus={id:'new'};
  if(kind==='user')f.ctx.STORE.session={user:{id:'B'}};if(kind==='client')f.ctx.STORE.sb={};if(kind==='epoch')f.ctx.STORE.authEpoch++;if(kind==='store')f.ctx.STORE={...f.ctx.STORE};
  if(kind==='state')f.ctx.S={...f.ctx.S};if(kind==='mutation')f.ctx.S.log.push('Changed');if(kind==='permission')f.ctx.canPermissionRaw=()=>false;if(kind==='preview')f.ctx.PV={title:'New preview'};
}
const modes=['modal','date','factory','page','drawer','focus','user','client','epoch','store','state','mutation','permission','preview'];
test('actual scenario view discards late payloads and errors after owner, view, preview or draft changes',async()=>{
  for(const result of ['success','error'])for(const kind of modes){const f=fixture(),task=f.start();change(f,kind);const modal=f.ctx.UI.modal,preview=f.ctx.PV;
    result==='success'?f.request.resolve(f.item):f.request.reject(new Error('OLD_ERROR'));await task;
    assert.deepEqual(f.events,[],result+'/'+kind);assert.equal(f.ctx.UI.modal,modal);assert.equal(f.ctx.PV,preview);}
});
test('actual scenario view ignores repeated taps and refuses calls outside the owning list',async()=>{
  const f=fixture(),first=f.start(),second=f.start(),count=f.calls.length,busy=f.m.viewLoading;
  f.ctx.UI.modal={t:'new-draft'};const third=f.start();f.request.resolve(f.item);await Promise.all([first,second,third]);
  assert.equal(count,1);assert.equal(busy,true);assert.equal(f.calls.length,1);
});
test('own successful scenario view opens a comparison only, without changing schedule',async()=>{
  const f=fixture(),before=JSON.stringify(f.ctx.S),task=f.start();f.request.resolve(f.item);await task;
  assert.equal(f.events.length,1);assert.equal(f.events[0].p.extra.savedScenario,true);assert.equal(f.events[0].p.opts[0].applicable,false);assert.equal(JSON.stringify(f.ctx.S),before);
});
test('own failed view retains the list and releases loading, allowing an explicit retry',async()=>{
  const f=fixture(),task=f.start();f.request.reject(new Error('SYNTHETIC_ERROR'));await task;
  assert.equal(f.ctx.UI.modal,f.m);assert.equal(f.m.viewError,'SYNTHETIC_ERROR');assert.equal(f.m.viewLoading,false);assert.equal(f.m.items.length,1);assert.equal(f.calls.length,1);
});
test('actual scenario list never installs another owner or changed context results',async()=>{
  for(const kind of modes){const f=fixture(),task=f.ctx.openScenarioList(),m=f.ctx.UI.modal;change(f,kind);f.request.resolve([f.item]);await task;assert.equal(m.items,undefined,kind);assert.equal(m.error,undefined);}
});
test('actual scenario list uses the factory date after UTC midnight boundary, and safely handles missing timestamps',()=>{
  const f=fixture();Object.assign(f.ctx,{MODALS:{},esc:x=>String(x),scenarioCreatedDate:scenarios.scenarioCreatedDate});
  const at=source.indexOf("MODALS['scenario-list']=");vm.runInContext(source.slice(at,source.indexOf("MODALS['scenario-save']",at)),f.ctx);
  f.item.created_at='2026-10-13T21:00:00Z';assert.match(f.ctx.MODALS['scenario-list'](f.m).body,/2026-10-14/);
  f.item.created_at=null;assert.doesNotThrow(()=>f.ctx.MODALS['scenario-list'](f.m));
});
test('factory scenario dates handle timezone offsets, year boundaries and invalid scalar values',()=>{
  assert.equal(scenarios.scenarioCreatedDate('2026-12-31T16:00:00Z'),'2027-01-01');
  assert.equal(scenarios.scenarioCreatedDate('2026-10-14T00:00:00+08:00'),'2026-10-14');
  assert.equal(scenarios.scenarioCreatedDate('2026-10-13T15:59:59Z'),'2026-10-13');
  for(const value of [null,undefined,0,{},'','invalid'])assert.equal(scenarios.scenarioCreatedDate(value),'');
});
test('wrong scenario identity or invalid payload cannot open comparison, and owned errors retain the list',async()=>{
  for(const mutate of [item=>({...item,id:'different'}),item=>({...item,payload:{}})]){const f=fixture(),task=f.start();f.request.resolve(mutate(f.item));await task;
    assert.equal(f.ctx.UI.modal,f.m);assert.equal(f.events.filter(e=>e.type==='preview').length,0);assert.ok(f.m.viewError);assert.equal(f.m.viewLoading,false);}
});

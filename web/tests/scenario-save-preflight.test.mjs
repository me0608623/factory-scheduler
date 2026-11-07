import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeScenario} from '../src/scenarios.js';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
const previousStorage=globalThis.localStorage;
test.afterEach(()=>{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;});
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(kind){
 const data=new Map(); globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const state={cal:{week:[],over:{}},dayOT:{},employees:[],machines:[],orders:[],products:[],blocks:[],log:[]};
 const input={value:''},events=[],calls=[];
 const store=kind==='local'?new LocalStore():new SupabaseStore({rpc(){calls.push('unexpected cloud dispatch');throw Error('unexpected cloud dispatch');}});
 if(kind==='cloud'){store.session={user:{id:'synthetic-A'}};store.authEpoch=1;}
 // This fixture forbids cloud dispatch: all cloud cases must fail during actual preflight.
 const ctx={S:state,PV:null,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null},STORE:store,MODALS:{},
 makeScenario,structuredClone,$:s=>s==='#scenario-name'?input:null,canPermissionRaw:()=>true,tx:x=>x,esc:x=>String(x),toast:x=>events.push(x),renderModal:()=>{},maybeReload:()=>{},cancelPlanCalculation:()=>{},requestAnimationFrame:f=>f(),modalReturnFocus:null,document:{activeElement:null,body:{}},HTMLElement:class {}};
 vm.createContext(ctx);
 for(const [start,end] of [["MODALS['scenario-save']=",'async function viewScenario('],['function openModal(m){','function ownsLegacyRequest(']]){let at=source.indexOf(start);vm.runInContext(source.slice(at,source.indexOf(end,at)),ctx);}
 const reopen=()=>{ctx.closeModal();ctx.openModal({t:'scenario-save',base:structuredClone(state),candidate:structuredClone(state),date:ctx.UI.date,description:'目前排程'});};reopen();
 return {ctx,input,data,calls,events,reopen,start:()=>ctx.saveScenarioFromModal({disabled:false})};
}
for(const kind of ['local','cloud'])for(const value of ['', '   ','\t'])test(`${kind}: blank name stays an inline validation error without dispatch or retry identity`,async()=>{
 const f=fixture(kind);f.input.value=value;const m=f.ctx.UI.modal,html=f.ctx.MODALS['scenario-save'](m);
 assert.match(html.body,/maxlength="80"/);assert.doesNotMatch(html.body,/required/);assert.match(html.foot,/scenario-confirm/);assert.doesNotMatch(html.foot,/disabled/);
 await assert.doesNotReject(f.start());
 await assert.doesNotReject(f.start()); // Repeated confirmation remains safe.
 assert.equal(m.error,'情境名稱須為 1–80 字');assert.equal(m.saving,false);assert.ok(!f.ctx.UI.scenarioSaving);assert.equal(f.data.size,0);assert.equal(f.calls.length,0);assert.equal(f.ctx.UI.scenarioUnknown?.size||0,0);
 f.reopen();assert.equal(f.ctx.UI.modal.item,undefined);assert.equal(f.ctx.UI.modal.error,undefined);
});
test('local: correcting blank input saves once, leaves schedule unchanged, and reopens cleanly',async()=>{
 const f=fixture('local'),before=JSON.stringify(f.ctx.S);await assert.doesNotReject(f.start());f.input.value='Corrected';await f.start();assert.equal(f.ctx.UI.modal,null);assert.equal((await f.ctx.STORE.listScenarios()).length,1);assert.equal(JSON.stringify(f.ctx.S),before);f.reopen();f.input.value='New modal';await f.start();assert.equal((await f.ctx.STORE.listScenarios()).length,2);
});
test('local: 1 and 80 character valid names are accepted, independent fresh modals',async()=>{
 const f=fixture('local');for(const name of ['x','x'.repeat(80)]){f.input.value=name;await f.start();assert.equal(f.ctx.UI.modal,null);f.reopen();}assert.equal((await f.ctx.STORE.listScenarios()).length,2);
});
test('local: synthetic quota failure then blank edit preserves only submitted retry identity; original retry recovers',async()=>{
 const f=fixture('local');let fail=true;globalThis.localStorage.setItem=(k,v)=>{if(fail)throw Error('Synthetic quota');f.data.set(k,v);};f.input.value='Original';await f.start();const id=f.ctx.UI.modal.item.id;f.input.value=' ';await f.start();assert.equal(f.ctx.UI.scenarioUnknown.has('scenario-unknown:'),false);assert.equal(f.ctx.UI.scenarioUnknown.get('scenario-unknown:Original').id,id);assert.equal(f.ctx.UI.modal.error,'情境名稱須為 1–80 字');fail=false;f.input.value='Original';await f.start();assert.equal((await f.ctx.STORE.listScenarios()).length,1);assert.equal(f.ctx.UI.scenarioUnknown.has('scenario-unknown:Original'),false);
});

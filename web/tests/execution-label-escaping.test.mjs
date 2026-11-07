import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {SaxesParser} from 'saxes';
import {I18N, tx} from '../src/i18n.js';
import {LocalStore} from '../src/store/local.js';
import {floorCells} from '../src/floor.js';

const src=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
// Integration snapshots add async product validation; load their real helper when present.
const rateModule=new URL('../src/product-rate.js',import.meta.url);
const productRate=fs.existsSync(rateModule)?(await import(rateModule.href)).productRate:undefined;
const marker=k=>`<em data-audit="${k}">${k}</em> "' & &lt;literal&gt;`;
// Parse balanced title/hint fragments, not the app's HTML void elements.
function parsed(fragment){
  const result={elements:[],text:''},parser=new SaxesParser({fragment:true});
  parser.on('opentag',node=>result.elements.push(node.name));
  parser.on('text',text=>result.text+=text);
  // HTML accepts bare ampersands as text; normalize only those for this XML parser.
  parser.write(fragment.replace(/&(?!#\d+;|#x[\da-f]+;|amp;|lt;|gt;|quot;|apos;)/gi,'&amp;')).close();return result;
}
// Evaluate actual app functions; UI effects and planning application are boundaries.
// Local persistence is real, using in-memory localStorage. This is not browser E2E.
async function fixture(){
let S={employees:[{id:'e',name:'Employee',factory:1,maxMachines:1,skills:['m'],leaves:[],otWeekdays:[]}],machines:[{id:'m',label:'Machine',proc:'Cut',factory:1,products:['p'],faults:[]}],products:[{id:'p',name:'Product',steps:[{proc:'Cut',factory:1,rate:1}]}],orders:[{id:'o',code:'ORDER',qty:10,pid:'p',due:'2026-11-08',pri:2,note:'Note'}],blocks:[{id:'b',oid:'o',emp:'e',m:'m',step:0,date:'2026-11-08',s:480,e:540,qty:10}],execution:[]};
let input=[];const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};const modal={focus(){}};const ov={querySelector:()=>modal,addEventListener(){}};const STORE=new LocalStore();
const env={S,STORE,UI:{date:'2026-11-08',factory:1},PV:null,MODAL_ACT:{},MODALS:{products:()=>({title:'Products',body:''})},structuredClone,productRate,canMaster:()=>true,syncPending:0,sizeBlockDetailModal(){},document:{querySelectorAll:()=>input,querySelector:()=>null},$:s=>s==='#modal-root'?root:s==='#ov'?ov:null,tx,canOrders:()=>true,readOnly:false,prod:id=>S.products.find(x=>x.id===id),order:id=>S.orders.find(x=>x.id===id),emp:id=>S.employees.find(x=>x.id===id),mach:id=>S.machines.find(x=>x.id===id),factoryOf:x=>x.factory||1,overtimeWeekdays:x=>x.otWeekdays,futureOf:()=>false,pushUndo(){},closeModal(){},commit(){return true;},toast(){},todayStr:()=> '2026-11-07',openPlans:(a,b,c,ev)=>ev(),STRAT_ORDER:{},executionOf:()=>null,canReport:()=>true,canPermission:()=>true,inFactory:()=>true,mdw:x=>x,hm:String,runAuto(){},modalFocusFromToken:()=>null,modalFocusable:()=>[],empColor:()=> '#fff',recentManualMove:null,label:b=>S.orders[0].code,innerWidth:900,renderFloor:()=>[],hitFloor:()=>({cell:floorCells(S,1,'2026-11-08')[0]}),floorCells,reportingRole:()=> 'boss'};
vm.createContext(env);const run=(a,b)=>vm.runInContext(src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a))),env);
vm.runInContext(src.split('\n').find(l=>l.startsWith('const esc='))+';globalThis.esc=esc;',env);
run('function setPath(', 'function renderModal(');run('function renderModal(', 'function rerender(');
for(const [key,next] of [['m-emp-save','m-emp-del'],['m-mach-save','m-mach-del'],['o-save','o-del'],['p-save','b-emp']]){let start=src.indexOf('  "'+key+'":'),end=src.indexOf('  "'+next+'":',start);vm.runInContext('Object.assign(MODAL_ACT,{'+src.slice(start,end)+'});',env);}
const orders=S.orders, blocks=S.blocks;S.orders=[];S.blocks=[];
env.UI.modal={t:'products',draft:JSON.parse(JSON.stringify(S.products)),productOwner:{store:STORE,writer:STORE.session?.user?.id,epoch:STORE.authEpoch},productBase:JSON.stringify(S)};
input=[{type:'text',hasAttribute:()=>false,value:marker('process'),dataset:{bind:'0.steps.0.proc'}}];
await env.MODAL_ACT['p-save']();S=env.S;assert.equal(S.products[0].steps[0].proc,marker('process'));
S.orders=orders;S.blocks=blocks;
for(const [key,obj,field,value] of [['m-emp-save',S.employees[0],'name',marker('employee')],['m-mach-save',S.machines[0],'label',marker('machine')],['o-save',S.orders[0],'code',marker('order')]]){env.UI.modal={id:obj.id,draft:JSON.parse(JSON.stringify(obj))};input=[{type:'text',hasAttribute:()=>false,value,dataset:{bind:field}}];env.MODAL_ACT[key]();assert.equal(obj[field],value);}
const memory=new Map();const previousStorage=globalThis.localStorage;globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};try{await STORE.sync(S);S=await STORE.load();}finally{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;}env.S=S;assert.equal(S.orders[0].code,marker('order'));assert.equal(S.employees[0].name,marker('employee'));assert.equal(S.machines[0].label,marker('machine'));

vm.runInContext(src.split('\n').find(l=>l.startsWith('const stepName='))+';globalThis.stepName=stepName;',env);
run('const reportingRole=', 'async function reportWork(');
return {env,S,root,render(t){env.UI.modal={t,id:'b'};env.renderModal();return root.innerHTML;}};
}
for(const lang of ['zh-TW','en','vi','th']){
  test(`execution labels remain literal after saves and persistence (${lang})`,async()=>{
    const previous=I18N.lang;I18N.lang=lang;
    try{
      const f=await fixture();
      const html=f.render('execution');
      const hint=html.match(/<article class="load-row">[\s\S]*?<div class="hint">([\s\S]*?)<\/div>/)[1];
      const result=parsed(hint);
      assert.deepEqual(result.elements,[]);
      assert.equal(result.text,tx('{who} · {what} · 原定 {s}–{e} · {q} 件',{who:marker('employee'),what:marker('machine'),s:'480',e:'540',q:10}));
      const report=f.render('execution-report');
      const aria=parsed('<label>'+report.match(/aria-label="([^"]*)"/)[1]+'</label>');
      assert.equal(aria.text,tx('回報')+' '+marker('order')+' · '+marker('process'));
      const title=parsed(report.match(/<h3>([\s\S]*?)<\/h3>/)[1]);
      assert.deepEqual(title.elements,[]);
      assert.equal(title.text,tx('回報')+' '+marker('order')+' · '+marker('process'));
      assert.equal(f.S.products[0].steps[0].proc,marker('process'));
      // Existing fallback labels and headings must remain readable.
      f.S.employees=[];f.S.machines=[];f.S.orders=[];
      const fallback=parsed(f.render('execution-report').match(/<h3>([\s\S]*?)<\/h3>/)[1]);
      assert.equal(fallback.text,tx('回報')+' ? · ?');
    }finally{I18N.lang=previous;}
  });
}
test('renderModal retains intentional title markup and parser controls',async()=>{
  const f=await fixture();
  // The machine title contract intentionally includes a span; do not globally escape titles.
  f.env.MODALS['title-control']=()=>({title:'<span class="num">m</span> Machine',body:''});
  const title=parsed(f.render('title-control').match(/<h3>([\s\S]*?)<\/h3>/)[1]);
  assert.deepEqual(title.elements,['span']);assert.equal(title.text,'m Machine');
  assert.deepEqual(parsed('<em>control</em>').elements,['em']);
  const literal=parsed('&lt;em&gt;control&lt;/em&gt;');
  assert.deepEqual(literal.elements,[]);assert.equal(literal.text,'<em>control</em>');
});

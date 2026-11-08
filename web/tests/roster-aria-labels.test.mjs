import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {SaxesParser} from 'saxes';
import {I18N,tx} from '../src/i18n.js';
import {LocalStore} from '../src/store/local.js';
import {floorCells} from '../src/floor.js';

const src=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const marker=k=>`<em data-audit="${k}">${k}</em> &amp; "' &`;
// Parse balanced fragments and the actual serialized dialog opening tag. This is
// decoded string coverage, not browser accessibility or screen-reader testing.
function parsed(fragment){
  const result={elements:[],text:'',attributes:[]},parser=new SaxesParser({fragment:true});
  parser.on('opentag',node=>{result.elements.push(node.name);result.attributes.push(node.attributes);});
  parser.on('text',text=>result.text+=text);
  parser.write(fragment.replace(/&(?!#\d+;|#x[\da-f]+;|amp;|lt;|gt;|quot;|apos;)/gi,'&amp;')).close();return result;
}
// Real ordinary save handlers, LocalStore roundtrip, MODALS and renderModal.
// Unrelated UI effects and scheduling callbacks are isolated test boundaries.
async function fixture(name,label){
let S={groups:[],groupMembers:[],employees:[{id:'e',name:'Employee',factory:1,maxMachines:1,skills:['m'],leaves:[],otWeekdays:[]}],machines:[{id:'m',label:'Machine',proc:'Cut',factory:1,products:['p'],faults:[]}],products:[{id:'p',name:marker('product'),steps:[{proc:'Cut',factory:1,rate:1}]}],orders:[{id:'o',code:'ORDER',qty:10,pid:'p',due:'2026-11-08',pri:2,note:marker('note')}],blocks:[{id:'b',oid:'o',emp:'e',m:'m',step:0,date:'2026-11-08',s:480,e:540,qty:10}],execution:[]};
let input=[];const root={innerHTML:'',querySelector:()=>null};const modal={focus(){}};const ov={querySelector:()=>modal,addEventListener(){}};const STORE=new LocalStore();
const env={S,STORE,UI:{date:'2026-11-08',factory:1},PV:null,MODAL_ACT:{},MODALS:{},document:{querySelectorAll:()=>input,querySelector:()=>null},$:s=>s==='#modal-root'?root:s==='#ov'?ov:null,tx,canOrders:()=>true,readOnly:false,prod:id=>S.products.find(x=>x.id===id),order:id=>S.orders.find(x=>x.id===id),emp:id=>S.employees.find(x=>x.id===id),mach:id=>S.machines.find(x=>x.id===id),factoryOf:x=>x.factory||1,overtimeWeekdays:x=>x.otWeekdays,futureOf:()=>false,pushUndo(){},closeModal(){},commit(){},toast(){},todayStr:()=> '2026-11-07',openPlans:(a,b,c,ev)=>ev(),STRAT_ORDER:{},executionOf:()=>null,canReport:()=>true,canPermission:()=>true,inFactory:()=>true,mdw:x=>x,hm:String,stepName:()=> 'Cut',modalFocusFromToken:()=>null,modalFocusable:()=>[],empColor:()=> '#fff',recentManualMove:null,label:b=>S.orders[0].code,innerWidth:900,renderFloor:()=>[],hitFloor:()=>({cell:floorCells(S,1,'2026-11-08')[0]}),floorCells,reportingRole:()=> 'boss'};
vm.createContext(env);const run=(a,b)=>vm.runInContext(src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a))),env);
vm.runInContext(src.split('\n').find(l=>l.startsWith('const esc='))+';globalThis.esc=esc;',env);
run('function setPath(', 'function renderModal(');run('function renderModal(', 'function rerender(');
for(const [key,next] of [['m-emp-save','m-emp-del'],['m-mach-save','m-mach-del']]){let start=src.indexOf('  "'+key+'":'),end=src.indexOf('  "'+next+'":',start);vm.runInContext('Object.assign(MODAL_ACT,{'+src.slice(start,end)+'});',env);}
for(const [key,obj,field,value] of [['m-emp-save',S.employees[0],'name',name],['m-mach-save',S.machines[0],'label',label]]){env.UI.modal={id:obj.id,draft:JSON.parse(JSON.stringify(obj))};input=[{type:'text',value,dataset:{bind:field}}];env.MODAL_ACT[key]();assert.equal(obj[field],value);}
const memory=new Map(),previousStorage=globalThis.localStorage;globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};try{await STORE.sync(S);S=await STORE.load();}finally{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;}env.S=S;assert.equal(S.employees[0].name,name);assert.equal(S.machines[0].label,label);

Object.assign(env,{canMaster:()=>true,canIncidents:()=>true,canGroups:()=>true,weekStart:x=>x,addDays:x=>x,dayInfo:()=>({w:0,type:'work',open:true}),tg:()=>'<button>choice</button>',WD:['Sun'],WEEK_LABELS:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],ALL_WEEKDAYS:[0,1,2,3,4,5,6],COLORS:['#fff'],FACTORIES:[1],DAY0:480,DAY1:1020,employeeGroups:()=>[],factoryName:()=> 'Factory',processNames:()=>[],md:x=>x,monthDates:()=>[],uid:()=> 'group',memberStatus:x=>x});
for(const [key,a,b] of [['emp','emp(m){','/* ---------- 機台 ---------- */'],['mach','mach(m){','/* ---------- 產品']]){
 const start=src.indexOf(a);let end=src.indexOf(b,start);if(end<0)throw Error(b);
 let chunk=src.slice(start,end).trim();if(chunk.endsWith(','))chunk=chunk.slice(0,-1);
 vm.runInContext('Object.assign(MODALS,{'+chunk+'});',env);
}
if(src.includes('function personDayGeneralWork('))run('function personDayGeneralWork(', 'function applyPersonDay(');
run('MODALS.leaveq=', 'Object.assign(MODAL_ACT,');
run("MODALS['person-day']=", 'Object.assign(MODAL_ACT,');
return {env,S,render(t,id=t==='mach'?'m':'e'){
  env.UI.modal={t,id,d:'2026-11-08',off:new Set()};env.renderModal();return root.innerHTML;
}};
}
function check(html,expected,machine=false){
  const heading=parsed(html.match(/<h3>([\s\S]*?)<\/h3>/)[1]);
  const opening=html.match(/<div[^>]*role="dialog"[^>]*>/)[0];
  const aria=parsed(opening.slice(0,-1)+'/>').attributes[0]['aria-label'];
  assert.equal(heading.text,expected);
  assert.equal(aria,expected);
  assert.deepEqual(heading.elements,machine?['span']:[]);
}
for(const lang of ['zh-TW','en','vi','th']){
  for(const marked of [false,true])test(`ordinary dialog names after save and persistence (${lang}, markers=${marked})`,async()=>{
    const previous=I18N.lang;I18N.lang=lang;
    try{
      const name=marked?marker('employee'):'Employee',label=marked?marker('machine'):'Machine';
      const f=await fixture(name,label);
      check(f.render('emp'),name);
      check(f.render('mach'),'m　'+label,true);
      check(f.render('leaveq'),tx('{name} 請假',{name}));
      check(f.render('person-day'),name+' · 2026-11-08');
      check(f.render('person-month'),tx('{name} 整月班表設定',{name}));
      check(f.render('emp',null),tx('新增員工'));
      check(f.render('mach',null),tx('新增機台'));
      f.S.employees[0].name='';check(f.render('emp'),tx('員工'));
      assert.equal(f.S.machines[0].label,label);
    }finally{I18N.lang=previous;}
  });
}
for(const lang of ['zh-TW','en','vi','th'])test(`nullish renderer labels preserve existing empty text (${lang})`,async()=>{
  const previous=I18N.lang;I18N.lang=lang;
  try{
    const f=await fixture('Employee','Machine');
    f.S.employees[0].skills=[]; // Keep the machine's unrelated operator list out of these label controls.
    // Renderer-only legacy boundary controls, not new save or normalization policy.
    for(const value of [null,undefined]){
      f.S.employees[0].name=value;f.S.machines[0].label=value;
      check(f.render('emp'),tx('員工'));
      check(f.render('mach'),'m　',true);
      check(f.render('leaveq'),tx('{name} 請假',{name:''}));
      check(f.render('person-day'),' · 2026-11-08');
      check(f.render('person-month'),tx('{name} 整月班表設定',{name:''}));
      f.env.UI.modal={t:'mach',id:'m',draft:{...f.S.machines[0],id:value}};
      f.env.renderModal();check(f.env.$('#modal-root').innerHTML,'　',true);
      assert.equal(f.S.employees[0].name,value);assert.equal(f.S.machines[0].label,value);
    }
  }finally{I18N.lang=previous;}
});
test('parser distinguishes intentional markup from literal input',()=>{
  assert.deepEqual(parsed('<em>control</em>').elements,['em']);
  const literal=parsed('&lt;em&gt;control&lt;/em&gt; &amp;amp; &quot;Q&quot;');
  assert.deepEqual(literal.elements,[]);
  assert.equal(literal.text,'<em>control</em> &amp; "Q"');
});

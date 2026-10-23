import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SaxesParser} from 'saxes';
import {I18N, tx} from '../src/i18n.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const between=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
function buttons(html){
  const found=[];
  for(const match of html.matchAll(/<button\b[^>]*>/g)){
    const parser=new SaxesParser({xmlns:false});
    parser.on('opentag',tag=>found.push(tag.attributes));
    parser.write(match[0].replace(/\sdisabled(?=[ >])/g,' disabled="disabled"').slice(0,-1)+'/>').close();
  }
  return found;
}

test('all factories is a filter and does not open transfer management',()=>{
  const action=app.match(/case "factory":\{([\s\S]*?)break;\}/)?.[1];
  assert.ok(action);
  const calls=[];
  const env={a:{dataset:{v:'all'}},setFactory:v=>calls.push(['factory',v]),render:()=>calls.push(['render']),openModal:m=>calls.push(['modal',m])};
  vm.createContext(env);
  vm.runInContext(action,env);
  assert.deepEqual(calls,[['factory','all'],['render']]);
  assert.match(between('function topHTML(', 'function appNavHTML('),/tx\('全部廠別'\)/);
});

test('mobile navigation has four destinations and More links to each displaced destination',()=>{
  const env={UI:{drawer:'people',page:null,navCollapsed:false},S:{setupPending:false},STORE:{kind:'local',role:'boss'},NAV_IC:{today:'',orders:'',people:'',output:'',worklog:'',notes:'',more:'',help:''},
    roleName:()=>'',sideHealthHTML:()=>'',testModeLabelHTML:()=>'',tx:x=>x,esc:String,
    readOnly:false,undoStack:[],canIncidents:()=>true,canScenarios:()=>true,canArchive:()=>true};
  vm.createContext(env);
  vm.runInContext(between('function appNavHTML(', 'function isoWeek(')+between('function moreDrawerHTML(', 'function statusTag('),env);
  const nav=buttons(env.appNavHTML());
  const desktop=nav.filter(b=>b.class?.includes('app-nav-item')&&!/nav-more-mobile/.test(b.class));
  assert.equal(desktop.length,8,'desktop keeps every destination');
  assert.deepEqual(desktop.map(b=>b['data-v']||b['data-act']),['today','orders','people','output','worklog','notes','more','feature-tour']);
  assert.deepEqual(desktop.filter(b=>b['aria-pressed']==='true').map(b=>b['data-v']),['people']);
  const mobile=nav.filter(b=>b.class?.includes('app-nav-item')&&!/mobile-hidden/.test(b.class));
  assert.deepEqual(mobile.map(b=>b['data-v']||b['data-act']),['today','orders','output','more']);
  assert.equal(mobile.at(-1)['aria-pressed'],'true');
  env.UI.drawer=null;env.UI.page='worklog';
  const worklogNav=buttons(env.appNavHTML());
  assert.equal(worklogNav.find(b=>b.class?.includes('nav-more')&&b.class.includes('nav-more-mobile'))['aria-pressed'],'true');
  assert.equal(worklogNav.find(b=>b.class?.includes('nav-today'))['aria-pressed'],'false');
  assert.deepEqual(worklogNav.filter(b=>b.class?.includes('app-nav-item')&&!b.class.includes('nav-more-mobile')&&b['aria-pressed']==='true').map(b=>b['data-v']),['worklog']);
  const more=buttons(env.moreDrawerHTML());
  for(const [label,act,value] of [['請假日曆','drawer','people'],['工作紀錄','drawer','worklog'],['備忘','drawer','notes'],['功能解說','feature-tour',undefined]]){
    const button=more.find(b=>b['data-act']===act&&b['data-v']===value);
    assert.ok(button,`${label} has a More route`);
  }
  assert.match(css,/@media\s*\(max-width:680px\)[\s\S]*?\.app-nav-item\.mobile-hidden\s*\{display:none/);
  I18N.lang='en';assert.equal(tx('people'),'Leave calendar');I18N.lang='zh-TW';
});

test('empty schedule offers a real date or factory, and explains missing resources accurately',()=>{
  const env={UI:{date:'2026-10-26',factory:2,group:'all'},S:{setupPending:false,blocks:[],machines:[],employees:[],orders:[]},readOnly:false,RUNTIME:{mode:'production'},FACTORIES:[1,2],
    tx:x=>x,esc:String,mdw:String,factoryName:f=>`${f} 廠`,canMaster:()=>true,canOrders:()=>true,
    factoryOf:x=>x.factory,inFactory:(x,f)=>f==='all'||x.factory===f,shownEmployees:()=>env.S.employees.filter(e=>e.factory===env.UI.factory),
    nearestScheduleDate:(blocks,ids)=>blocks.find(b=>ids.includes(b.m))?.date||null};
  vm.createContext(env);
  vm.runInContext(between('function scheduleEmptyHTML(', 'function dayHTML('),env);
  let html=env.scheduleEmptyHTML([],[],{open:true,win:[{}]},null);
  assert.match(html,/沒有機台/);
  assert.match(html,/機台與員工/);
  assert.equal(buttons(html).some(b=>b['data-act']==='empty-resources'),true);
  env.S.machines=[{id:'A',factory:1}];env.S.employees=[{id:'E',factory:1}];env.S.blocks=[{m:'A',date:'2026-10-27'}];
  html=env.scheduleEmptyHTML([],[],{open:true,win:[{}]},null);
  assert.deepEqual(buttons(html).filter(b=>b['data-act']==='factory').map(b=>b['data-v']),['1']);
  env.UI.factory=1;
  html=env.scheduleEmptyHTML(env.S.machines,[],{open:true,win:[{}]},null);
  assert.deepEqual(buttons(html).filter(b=>b['data-act']==='goto').map(b=>b['data-d']),['2026-10-27']);
  env.S.machines=[];
  html=env.scheduleEmptyHTML([],[],{open:true,win:[{}]},null);
  assert.match(html,/沒有機台/);
  assert.doesNotMatch(html,/沒有機台與員工/);
  env.readOnly=true;
  assert.deepEqual(buttons(env.scheduleEmptyHTML([],[],{open:true,win:[{}]},null)).map(b=>b['data-act']),['drawer']);
  env.readOnly=false;
  env.S.machines=[{id:'A',factory:1}];env.S.employees=[];
  html=env.scheduleEmptyHTML(env.S.machines,[],{open:true,win:[{}]},null);
  assert.match(html,/沒有員工/);
  assert.doesNotMatch(html,/沒有機台/);
  env.S.employees=[{id:'E',factory:1}];env.S.blocks=[];env.readOnly=true;
  html=env.scheduleEmptyHTML(env.S.machines,[],{open:false,win:[]},null);
  assert.match(html,/停工/);
  assert.deepEqual(buttons(html).map(b=>b['data-act']),['drawer']);
  env.S.setupPending=true;
  html=env.scheduleEmptyHTML(env.S.machines,[],{open:true,win:[{}]},null);
  assert.deepEqual(buttons(html).map(b=>b['data-act']),['catalog']);
  env.S.setupPending=false;
  html=env.scheduleEmptyHTML(env.S.machines,[],{open:true,win:[{}]},'2026-10-28');
  assert.deepEqual(buttons(html).filter(b=>b['data-act']==='goto').map(b=>b['data-d']),['2026-10-28']);
  env.UI.group='night';env.readOnly=false;
  env.shownEmployees=()=>[];
  html=env.scheduleEmptyHTML(env.S.machines,[],{open:true,win:[{}]},null);
  assert.deepEqual(buttons(html).map(b=>b['data-act']),['empty-clear-group']);
});

test('block details keep only Close and Preview in a bounded footer',()=>{
  const modal=between('blk(m){', '/* ---------- 紀錄 ---------- */');
  const block={id:'B1',oid:'O1',date:'2026-10-26',m:'M1',emp:'E1',step:0,s:480,e:540,qty:10,pin:false};
  const other={...block,id:'B2',date:'2026-10-27',step:1};
  const env={S:{blocks:[block,other],employees:[{id:'E1',name:'Lin',skills:['M1']}],machines:[{id:'M1',label:'Press',proc:'Cut',products:['P1'],factory:1}]},
    order:()=>({pid:'P1',code:'ORDER1',due:'2026-10-30'}),prod:()=>({name:'Widget',steps:[{proc:'Cut',factory:1},{proc:'Cut',factory:1}]}),
    emp:()=>({name:'Lin'}),mach:()=>({id:'M1',label:'Press'}),issuesOf:()=>[],executionOf:()=>null,
    readOnly:false,DAY0:480,DAY1:1200,tx:x=>x,esc:String,hm:String,mdw:String,
    statusTag:()=>'',factoryOf:()=>1,slotFree:()=>true,tg:()=>'',stepName:()=> 'Cut',byAbs:()=>0};
  vm.createContext(env);
  vm.runInContext('globalThis.blockModal=({'+modal+'}).blk',env);
  let output=env.blockModal({id:'B1'});
  assert.deepEqual(buttons(output.foot).map(b=>b['data-act']),['close','b-preview']);
  assert.deepEqual(buttons(output.body).filter(b=>['b-del','b-fix'].includes(b['data-act'])).map(b=>b['data-act']),['b-fix','b-del']);
  assert.match(output.body,/<details class="block-secondary"/);
  assert.match(output.body,/<details class="block-related"/);
  env.readOnly=true;
  output=env.blockModal({id:'B1'});
  assert.deepEqual(buttons(output.foot).map(b=>b['data-act']),['close']);
  assert.equal(buttons(output.body).some(b=>['b-del','b-fix','b-preview'].includes(b['data-act'])),false);
  assert.match(between('function renderModal(', 'function rerender('),/block-detail/);
  assert.match(css,/\.modal\.block-detail\s*\{[^}]*max-height/);
  assert.match(css,/\.modal\.block-detail \.modal-b\s*\{[^}]*overflow-y:auto/);
});

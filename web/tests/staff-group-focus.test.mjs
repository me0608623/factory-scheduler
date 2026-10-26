import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {employeeGroups,groupedEmployees} from '../src/groups.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(){
  let select=null,html='',onChange;
  class Element{
    isConnected=true;
    dataset={};
    classList={toggle(){}};
    closest(){return null;}
    focus(){if(this.isConnected)document.activeElement=this;}
  }
  const body=new Element(),document={body,activeElement:body,addEventListener:(type,handler)=>{if(type==='change')onChange=handler;}};
  const app={get innerHTML(){return html;},set innerHTML(value){
    if(select)select.isConnected=false;
    if(!document.activeElement.isConnected)document.activeElement=body;
    html=value;
    const options=html.match(/<select[^>]*id="staff-group-filter"[^>]*>([\s\S]*?)<\/select>/)?.[1];
    select=options?Object.assign(new Element(),{id:'staff-group-filter',value:options.match(/<option value="([^"]*)" selected>/)?.[1]||'all'}):null;
  }};
  document.querySelector=selector=>selector==='#app'?app:selector==='#staff-group-filter'?select:null;
  const state={employees:[{id:'first',name:'First person',leaves:[],color:0},{id:'second',name:'Second person',leaves:[],color:1}],
    groups:[{id:'staff',name:'Staff'},{id:'empty',name:'Empty'}],groupMembers:[{groupId:'staff',employeeId:'first',reviewStatus:'confirmed'}],
    blocks:[{id:'kept',date:'2026-10-25'}],log:[]};
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  freeze(state);
  const rejectWrite=()=>{throw new Error('Filtering staff must not write schedule or membership data');};
  const env={document,$:document.querySelector,S:state,PV:null,I18N:{},
    UI:{date:'2026-10-25',view:'day',layout:'machine',factory:1,page:'catalog',drawer:null,group:'all',empQuery:'person',focus:{type:'order',id:'kept-order'},prefs:{language:'zh-TW'}},
    window:{scrollY:0,scrollTo(){}},ensureVisualStyles(){},topHTML:()=>'',appNavHTML:()=>'',bannerHTML:()=>'',
    dayHTML:()=>'',generalBoardHTML:()=>'',drawerHTML:()=>'',catalogPageHTML:()=>env.cardsHTML(true),
    initScheduleLocator(){},initFloatWins(){},initCatalogPage(){},watchHeader(){},scheduleChat:null,
    shownEmployees:()=>groupedEmployees(state,state.employees,env.UI.group),shownMachines:()=>[],shownOrders:()=>[],orderRow:()=>'',logRow:()=>'',
    employeeGroups,overtimeAllowed:()=>true,COLORS:['blue','green'],canMaster:()=>false,canOrders:()=>false,
    esc:String,tx:x=>x,save:rejectWrite,commit:rejectWrite,fetch:rejectWrite};
  vm.createContext(env);
  vm.runInContext(between('function render(){','let _hdrRO=')+
    between('function staffGroupFilterHTML(){','const drawerTitle=')+
    between('document.addEventListener("change",e=>{','// 單日改為上班'),env);
  env.render();
  return {env,document,app,state,get select(){return select;},change(value){select.focus();select.value=value;onChange({target:select});}};
}

for(const choices of [['staff'],['ungrouped'],['empty','all']]){
  test('staff group selection keeps focus through '+choices.join(' then '),()=>{
    const f=fixture(),before=JSON.stringify(f.state);
    for(const value of choices){
      const previous=f.select;
      f.change(value);
      assert.equal(previous.isConnected,false,'redraw replaces the old select');
      assert.equal(f.document.activeElement,f.select,'keyboard focus follows the replacement select');
      assert.equal(f.select.isConnected,true);
      assert.equal(f.select.value,value);
      assert.equal(f.env.UI.group,value);
      const people=[...f.app.innerHTML.matchAll(/data-act="emp" data-id="([^"]+)"/g)].map(([,id])=>id);
      assert.deepEqual(people,value==='staff'?['first']:value==='ungrouped'?['second']:value==='empty'?[]:['first','second']);
      assert.equal(f.app.innerHTML.includes('此廠在此分組沒有員工'),value==='empty');
      assert.equal(f.env.UI.page,'catalog');
      assert.equal(f.env.UI.drawer,null);
      assert.equal(f.env.UI.date,'2026-10-25');
      assert.equal(f.env.UI.factory,1);
      assert.equal(f.env.UI.empQuery,'person');
      assert.deepEqual(f.env.UI.focus,{type:'order',id:'kept-order'});
      assert.equal(f.env.S,f.state);
      assert.equal(JSON.stringify(f.state),before);
    }
  });
}

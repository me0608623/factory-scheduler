import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(){
  let buttons=[],html='';
  class Element{
    isConnected=true;
    classList={toggle(){}};
    constructor(dataset={},pressed=false){this.dataset=dataset;this.pressed=pressed;}
    closest(){return null;}
    focus(){if(this.isConnected)document.activeElement=this;}
  }
  const body=new Element(),document={body,activeElement:body};
  const app={get innerHTML(){return html;},set innerHTML(value){
    for(const button of buttons)button.isConnected=false;
    if(!document.activeElement.isConnected)document.activeElement=body;
    html=value;
    const pills=html.match(/<div class="people-pills">([\s\S]*?)<\/div>/)?.[1]||'';
    buttons=[...pills.matchAll(/<button\b([^>]*)>/g)].map(([,attrs])=>{
      const attr=name=>attrs.match(new RegExp(name+'="([^"]*)"'))?.[1];
      return new Element({act:attr('data-act'),id:attr('data-id')},attr('aria-pressed')==='true');
    });
  }};
  document.querySelector=selector=>selector==='#app'?app:
    selector.startsWith('.people-pills ')?buttons.find(button=>
      [...selector.matchAll(/\[data-(act|id)="([^"]+)"\]/g)].every(([,key,value])=>button.dataset[key]===value)&&
      (!selector.includes('[aria-pressed="true"]')||button.pressed))??null:null;
  const state=Object.freeze({employees:Object.freeze([
    Object.freeze({id:'first',name:'First person',leaves:Object.freeze([])}),
    Object.freeze({id:'second',name:'Second person',leaves:Object.freeze(['2026-10-25'])})
  ]),leaveRequests:Object.freeze([]),blocks:Object.freeze([Object.freeze({id:'kept',date:'2026-10-25'})])});
  const rejectWrite=()=>{throw new Error('Selecting a person must not write schedule or leave data');};
  const env={document,$:document.querySelector,S:state,PV:null,I18N:{},
    UI:{date:'2026-10-25',view:'day',layout:'machine',factory:1,drawer:'people',focus:null,prefs:{language:'zh-TW'}},
    window:{scrollY:0,scrollTo(){}},ensureVisualStyles(){},topHTML:()=>'',appNavHTML:()=>'',bannerHTML:()=>'',
    dayHTML:()=>'',generalBoardHTML:()=>'',paneWClamped:()=>420,drawerHTML:()=>env.peopleDrawerHTML(),
    initScheduleLocator(){},initFloatWins(){},watchHeader(){},scheduleChat:null,
    shownEmployees:()=>state.employees,emp:id=>state.employees.find(person=>person.id===id),
    parseD:date=>new Date(date+'T00:00:00Z'),pad:n=>String(n).padStart(2,'0'),
    leaveState:(s,id,date)=>s.employees.find(person=>person.id===id).leaves.includes(date)?'leave':'work',
    canIncidents:()=>false,directWriteStatus:()=>'',esc:String,tx:x=>x,
    save:rejectWrite,commit:rejectWrite,fetch:rejectWrite};
  vm.createContext(env);
  vm.runInContext(between('function render(){','let _hdrRO=')+
    between('function monthDates(','function outputDrawerHTML(')+
    'function select(id){switch("focus-person"){'+between('    case "focus-person":','    case "person-day":')+'}}',env);
  env.render();
  return {env,document,app,state,get buttons(){return buttons;},select:id=>env.select(id)};
}

for(const selection of [['first'],['second'],['first','second'],['first','first']]){
  test('person selection keeps keyboard focus on the current calendar choice '+selection.join(' then '),()=>{
    const f=fixture();
    for(const id of selection){
      const previous=f.buttons.find(button=>button.dataset.id===id);previous.focus();
      f.select(id);
      const selected=f.buttons.filter(button=>button.pressed);
      assert.equal(selected.length,1);
      assert.equal(selected[0].dataset.id,id);
      assert.equal(previous.isConnected,false,'the old person button is replaced');
      assert.equal(f.document.activeElement,selected[0],'focus follows the selected person after redraw');
      assert.equal(f.document.activeElement.isConnected,true);
      assert.match(f.app.innerHTML,new RegExp('<header><b>'+(id==='first'?'First person':'Second person')+'</b>'));
      assert.equal(f.env.UI.drawer,'people');
      assert.equal(f.env.UI.date,'2026-10-25');
      assert.equal(f.env.UI.factory,1);
      assert.equal(f.env.S,f.state);
      assert.deepEqual(f.state.employees.map(person=>person.leaves),[[],['2026-10-25']]);
      assert.deepEqual(f.state.blocks,[{id:'kept',date:'2026-10-25'}]);
    }
  });
}

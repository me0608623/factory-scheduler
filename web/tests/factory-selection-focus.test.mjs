import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function part(start,end){
  const first=source.indexOf(start);
  assert.notEqual(first,-1,'missing source section '+start);
  const last=source.indexOf(end,first+start.length);
  assert.notEqual(last,-1,'missing source boundary '+end);
  return source.slice(first,last);
}
const code=part('function setFactory(n){','const shownEmployees=')+
  part('function render(){','let _hdrRO=')+
  part('function topHTML(){','function appNavHTML(){')+
  part('function floorPageHTML(){','function initFloor(){')+
  part('const PV_BLOCK=new Set(','document.addEventListener("click",e=>{if(e.target.dataset?.actChange');

function frozen(value){
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))frozen(child);
    Object.freeze(value);
  }
  return value;
}

function fixture({factory=2,page=null,owner=null}={}){
  let html='',groups=[],editInput=null,click;
  const storage=new Map([['fsched-factory',String(factory)]]);
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
  const state=frozen({employees:[],machines:[],orders:[],machineLayout:[],
    blocks:[{id:'kept',factory:1,date:'2026-10-17'}]});
  const originalState=JSON.stringify(state);
  const document={activeElement:null,addEventListener(type,handler){if(type==='click')click=handler;}};
  class Control{
    constructor(kind){this.kind=kind;this.isConnected=true;this.dataset={};this.classList={toggle(){}};}
    focus(){if(this.isConnected)document.activeElement=this;}
    getClientRects(){return this.isConnected?[{}]:[];}
    getAttribute(name){return name==='aria-pressed'?String(this.pressed):name==='data-v'?this.dataset.v:name==='data-act'?this.dataset.act:null;}
    closest(selector){
      if(this.kind==='factory'){
        if(selector==='[data-act]'||selector.includes('[data-act="factory"]'))return this;
        if(selector==='.factory-switch'||selector==='.seg.factory-switch'||selector==='[role="group"]')return this.group;
        if((selector==='.top'||selector==='header')&&this.group.kind==='header')return this.group.root;
        if((selector==='.fullpage'||selector==='.page-top')&&this.group.kind==='floor')return this.group.root;
      }
      return selector==='#schedule-chat'&&this.kind==='chat'?chatRoot:null;
    }
  }
  const body=new Control('body');
  document.body=body;
  document.activeElement=body;
  const chatRoot={id:'schedule-chat'};
  const chat=new Control('chat');
  chat.value='Unsent draft';chat.selectionStart=3;chat.selectionEnd=8;
  const modalInput=new Control('modal');
  function find(selector,within=groups){
    let candidates=within;
    if(selector.includes('.top'))candidates=candidates.filter(group=>group.kind==='header');
    if(selector.includes('.fullpage')||selector.includes('.page-top'))candidates=candidates.filter(group=>group.kind==='floor');
    if(selector.includes('排程廠別'))candidates=candidates.filter(group=>group.kind==='header');
    if(selector.includes('平面圖廠別'))candidates=candidates.filter(group=>group.kind==='floor');
    if(selector==='.top'||selector==='.fullpage')return candidates.map(group=>group.root);
    if(selector.endsWith('.factory-switch'))return candidates;
    if(!selector.includes('factory-switch')&&!selector.includes('data-act="factory"')&&
      !selector.includes('data-v')&&!selector.includes('aria-pressed'))return [];
    const value=selector.match(/\[data-v=["']?([^"'\]]+)/)?.[1];
    const pressed=selector.match(/\[aria-pressed=["']?(true|false)/)?.[1];
    return candidates.flatMap(group=>group.buttons).filter(button=>
      (!value||button.dataset.v===value)&&(!pressed||String(button.pressed)===pressed));
  }
  const app={get innerHTML(){return html;},set innerHTML(value){
    for(const group of groups){group.isConnected=false;for(const button of group.buttons)button.isConnected=false;}
    if(editInput)editInput.isConnected=false;
    chat.isConnected=false;
    if(!document.activeElement.isConnected)document.activeElement=body;
    html=value;
    groups=[...html.matchAll(/<div class="seg factory-switch"[^>]*>([\s\S]*?)<\/div>/g)].map(([,inside],index)=>{
      const kind=index===0?'header':'floor';
      const root={kind,querySelector:selector=>find(selector,groups.filter(group=>group.kind===kind))[0]??null};
      const group={kind,root,isConnected:true,buttons:[],
        getAttribute:name=>name==='aria-label'?(kind==='header'?'排程廠別':'平面圖廠別'):name==='role'?'group':null,
        classList:{contains:name=>name==='seg'||name==='factory-switch'},
        querySelector:selector=>find(selector,[group])[0]??null,
        querySelectorAll:selector=>find(selector,[group]),
        closest:selector=>(selector==='.top'||selector==='header')&&kind==='header'||
          (selector==='.fullpage'||selector==='.page-top')&&kind==='floor'?root:null};
      group.buttons=[...inside.matchAll(/<button\b([^>]*)>/g)].map(([,attrs])=>{
        const attr=name=>attrs.match(new RegExp(name+'="([^"]*)"'))?.[1];
        const button=new Control('factory');
        button.dataset={act:attr('data-act'),v:attr('data-v')};
        button.pressed=attr('aria-pressed')==='true';
        button.group=button.parentElement=group;
        return button;
      });
      return group;
    });
    editInput=env.UI.editCell?new Control('edit'):null;
  }};
  document.querySelector=selector=>selector==='#app'?app:selector==='.cellinp'?editInput:find(selector)[0]??null;
  document.querySelectorAll=selector=>find(selector);
  const rejectWrite=()=>{throw new Error('Factory selection must not write or fetch schedule data');};
  const env={document,$:document.querySelector,localStorage,S:state,PV:null,I18N:{},FACTORIES:[1,2],
    UI:{date:'2026-10-17',view:'day',layout:'resource',factory,page,drawer:null,modal:owner==='modal'?{t:'test'}:null,
      editCell:owner==='cell'?{id:'kept'}:null,prefs:{language:'zh-TW'}},
    window:{scrollY:0,scrollTo(){}},ensureVisualStyles(){},
    dayInfo:()=>({type:'work'}),weekStart:d=>d,md:d=>d,mdw:d=>d,dayLabel:()=>'',isoWeek:()=>1,
    NAV_IC:{today:''},IC:{user:''},STORE:{kind:'local'},
    environmentHTML:()=>'',testModeLabelHTML:()=>'',syncChipHTML:()=>'',
    tx:x=>x,esc:String,readOnly:false,WD:'日一二三四五六',
    parseD:d=>new Date(d+'T00:00:00Z'),floorCells:()=>[],
    appNavHTML:()=>'',bannerHTML:()=>'',dayHTML:()=>'',generalBoardHTML:()=>'',drawerHTML:()=>'',
    initScheduleLocator(){},initFloor(){},initFloatWins(){},watchHeader(){},
    renderModal(){modalInput.focus();},
    scheduleChat:{refresh(){chat.isConnected=true;}},
    save:rejectWrite,commit:rejectWrite,fetch:rejectWrite};
  vm.createContext(env);
  vm.runInContext(code,env);
  env.render();
  if(owner==='chat')chat.focus();
  if(owner==='modal')modalInput.focus();
  if(owner==='cell')editInput.focus();
  assert.equal(typeof click,'function','factory action listener is registered');
  return {env,document,app,storage,state,originalState,chat,modalInput,
    get editInput(){return editInput;},
    button(kind,value){
      const button=groups.find(group=>group.kind===kind)?.buttons.find(button=>button.dataset.v===String(value));
      assert.ok(button,kind+' factory '+value+' is rendered');
      return button;
    },
    pressed(kind){return groups.find(group=>group.kind===kind)?.buttons.filter(button=>button.pressed).map(button=>button.dataset.v);},
    activate(button){click({target:button});},
    unchanged(){assert.equal(env.S,state);assert.equal(JSON.stringify(state),originalState);}
  };
}

function assertChoice(f,kind,value){
  const current=f.button(kind,value);
  assert.equal(f.env.UI.factory,value);
  assert.deepEqual(f.pressed('header'),[String(value)]);
  if(kind==='floor')assert.deepEqual(f.pressed('floor'),[String(value)]);
  assert.equal(current.isConnected,true);
  assert.equal(f.storage.get('fsched-factory'),String(value));
  f.unchanged();
  return current;
}

test('keyboard switching in the header keeps focus on the selected factory',()=>{
  const f=fixture(),before=f.button('header',1);
  before.focus();f.activate(before);
  const current=assertChoice(f,'header',1);
  assert.equal(f.document.activeElement,current);
  if(!before.isConnected)assert.notEqual(f.document.activeElement,before);
});

test('activating the selected factory again retains keyboard focus',()=>{
  const f=fixture({factory:1}),before=f.button('header',1);
  before.focus();f.activate(before);
  assert.equal(f.document.activeElement,assertChoice(f,'header',1));
});

test('the all-factories header choice remains selected and focused',()=>{
  const f=fixture(),before=f.button('header','all');
  before.focus();f.activate(before);
  assert.equal(f.document.activeElement,assertChoice(f,'header','all'));
});

test('the floor-page factory choice retains focus within its own group',()=>{
  const f=fixture({factory:1,page:'floor'}),before=f.button('floor',2);
  before.focus();f.activate(before);
  const current=assertChoice(f,'floor',2);
  assert.equal(f.document.activeElement,current);
  assert.notEqual(f.document.activeElement,f.button('header',2));
});

for(const owner of ['body','chat','modal','cell']){
  test('a factory action without focus ownership does not steal '+owner+' focus',()=>{
    const f=fixture({owner}),button=f.button('header',1);
    const previous=owner==='body'?f.document.body:owner==='chat'?f.chat:owner==='modal'?f.modalInput:f.editInput;
    assert.equal(f.document.activeElement,previous);
    f.activate(button);
    assertChoice(f,'header',1);
    const current=owner==='cell'?f.editInput:previous;
    assert.equal(f.document.activeElement,current);
    if(owner==='chat'){
      assert.equal(f.chat.value,'Unsent draft');
      assert.deepEqual([f.chat.selectionStart,f.chat.selectionEnd],[3,8]);
    }
  });
}

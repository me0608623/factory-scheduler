import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture({mobile=false,drawer='more'}={}){
  const frames=[],listeners={};
  let controls=[],pane=null;
  class Element{
    isConnected=true;
    constructor(dataset={},visible=true){this.dataset=dataset;this.visible=visible;}
    getClientRects(){return this.isConnected&&this.visible?[{}]:[];}
    focus(){if(this.getClientRects().length)document.activeElement=this;}
    closest(){return null;}
  }
  const body=new Element();
  const document={body,activeElement:body,addEventListener:(type,handler)=>listeners[type]=handler,
    querySelectorAll:selector=>controls.filter(el=>selector.split(',').some(part=>{
      if(part.includes('.app-nav')&&!el.nav)return false;
      return [...part.matchAll(/\[data-(act|v)="([^"]+)"\]/g)].every(([,key,value])=>el.dataset[key]===value);
    })),
    querySelector:selector=>selector==='.ops-drawer'?pane:document.querySelectorAll(selector)[0]??null};
  const env={document,UI:{drawer,page:null,focus:{type:'order',id:'existing'},drawerZoom:false,modal:null,editCell:null},PV:null,
    STORE:{kind:'local'},NAV_IC:{},tx:x=>x,esc:String,roleName:()=>'',sideHealthHTML:()=>'',testModeLabelHTML:()=>'',
    requestAnimationFrame:fn=>frames.push(fn),$:document.querySelector,
    window:{scrollTo(){}},setUrlView(){},flashReturnRow(){},closeModal(){env.UI.modal=null;},
    render(){
      for(const el of [...controls,pane].filter(Boolean))el.isConnected=false;
      if(!document.activeElement.isConnected)document.activeElement=body;
      controls=[new Element({act:'settings'})];
      for(const [tag] of env.appNavHTML().matchAll(/<button\b[^>]*>/g)){
        const attr=name=>tag.match(new RegExp(name+'="([^"]*)"'))?.[1];
        const className=attr('class')||'';
        const visible=mobile?!/mobile-hidden|side-profile/.test(className):!className.includes('nav-more-mobile');
        const el=new Element({act:attr('data-act'),v:attr('data-v')},visible);el.nav=true;controls.push(el);
      }
      pane=env.UI.drawer?new Element():null;
    }};
  vm.createContext(env);
  vm.runInContext(between('function appNavHTML(){','function isoWeek(')+
    between('document.addEventListener("keydown",e=>{','/* ===== 8.')+
    'function action(act,value){const a={dataset:{v:value}};switch(act){'+
    between('    case "drawer":','    case "sort-col":')+'}}',env);
  env.render();pane?.focus();
  return {env,document,body,
    action:(act,value)=>env.action(act,value),
    key:key=>listeners.keydown({key,target:document.activeElement,preventDefault(){}}),
    flush:()=>{while(frames.length)frames.shift()();},
    get pane(){return pane;},
    get controls(){return controls;}};
}

for(const mobile of [false,true]){
  for(const close of ['Escape','drawer-close','toggle']){
    test(`${mobile?'mobile':'desktop'} More ${close} returns focus to the visible navigation button`,()=>{
      const f=fixture({mobile});const oldPane=f.pane;
      if(close==='Escape')f.key('Escape');
      else f.action(close==='toggle'?'drawer':'drawer-close','more');
      f.flush();
      assert.equal(f.env.UI.drawer,null);
      assert.equal(f.env.UI.focus,null);
      assert.equal(oldPane.isConnected,false);
      assert.equal(f.document.activeElement.dataset.act,'drawer');
      assert.equal(f.document.activeElement.dataset.v,'more');
      assert.equal(f.document.activeElement.nav,true);
      assert.equal(f.document.activeElement.getClientRects().length,1);
    });
  }
  for(const drawer of ['orders','output','people','notes','settings']){
    test(`${mobile?'mobile':'desktop'} ${drawer} dismissal returns to an available destination`,()=>{
      for(const close of ['Escape','drawer-close']){
        const f=fixture({mobile,drawer});
        if(close==='Escape')f.key('Escape');else f.action(close);
        f.flush();
        const active=f.document.activeElement;
        assert.notEqual(active,f.body);
        assert.equal(active.getClientRects().length,1);
        assert.equal(active.dataset.act,drawer==='settings'?'settings':'drawer');
        if(drawer!=='settings')assert.equal(active.dataset.v,mobile&&['people','notes'].includes(drawer)?'more':drawer);
      }
    });
  }
}

test('opening and switching drawers keeps focus in the new drawer',()=>{
  const f=fixture({drawer:null,mobile:true});
  f.action('drawer','more');f.flush();assert.equal(f.document.activeElement,f.pane);
  f.action('drawer','orders');f.flush();assert.equal(f.document.activeElement,f.pane);
  assert.equal(f.env.UI.drawer,'orders');
  f.action('settings');f.flush();assert.equal(f.document.activeElement,f.pane);
  assert.equal(f.env.UI.drawer,'settings');
});

test('non-dismissal keys and a modal Escape do not close the underlying drawer',()=>{
  const f=fixture();const pane=f.pane;
  f.key('ArrowRight');f.flush();assert.equal(f.document.activeElement,pane);
  assert.equal(f.env.UI.drawer,'more');
  f.env.UI.modal={t:'example'};f.key('Escape');f.flush();
  assert.equal(f.env.UI.drawer,'more');assert.equal(f.document.activeElement,pane);
});

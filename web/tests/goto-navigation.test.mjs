import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture({page=null}={}){
  const frames=[],scrolls=[];
  class Element{
    isConnected=true;
    classList={toggle(){}};
    closest(){return null;}
    matches(){return false;}
    focus(){if(this.isConnected)document.activeElement=this;}
  }
  const body=new Element(),launcher=new Element();
  const document={body,activeElement:launcher};
  let dialog=null,overlay=null,modalHTML='',appHTML='';
  const modalRoot={
    get innerHTML(){return modalHTML;},
    set innerHTML(html){
      if(dialog){
        dialog.isConnected=false;
        if(document.activeElement===dialog)document.activeElement=body;
      }
      modalHTML=html;
      dialog=html?new Element():null;
      const modalBody={scrollTop:0};
      overlay=html?{scrollTop:0,addEventListener(){},
        querySelector:selector=>selector==='.modal'?dialog:selector==='.modal-b'?modalBody:null}:null;
    },
    querySelector:selector=>selector==='.overlay'?overlay:null,
    contains:()=>false
  };
  const app={
    get innerHTML(){return appHTML;},
    set innerHTML(html){
      appHTML=html;
      launcher.isConnected=false;
      if(document.activeElement===launcher)document.activeElement=body;
    }
  };
  document.querySelector=selector=>selector==='#app'?app:selector==='#modal-root'?modalRoot:selector==='#ov'?overlay:null;
  const schedule=Object.freeze({blocks:Object.freeze([Object.freeze({id:'existing',date:'2026-10-25'})])});
  const rejectWrite=()=>{throw new Error('Navigation must not write schedule data');};
  const location={href:'http://localhost:5173/?mode=test'+(page?'&view='+page:'')+'#schedule'};
  const env={document,HTMLElement:Element,$:document.querySelector,URL,location,
    history:{replaceState(state,title,path){location.href=new URL(path,location.href).href;}},
    UI:{date:'2026-10-25',view:'week',wkFit:true,layout:'machine',factory:2,zoom:1.25,prefs:{language:'zh-TW'},modal:null,page},
    S:schedule,PV:null,I18N:{},window:{scrollY:180,scrollTo:(x,y)=>scrolls.push([x,y])},
    requestAnimationFrame:fn=>frames.push(fn),zoomWheel:{cancel(){}},applyPinch:{cancel(){}},pinch0:{},pinchActive:true,
    cancelPlanCalculation(){},maybeReload(){},ensureVisualStyles(){},topHTML:()=>'',appNavHTML:()=>'',bannerHTML:()=>'',
    dayHTML:()=>'<section data-date="'+env.UI.date+'">Day schedule</section>',weekHTML:()=>'<section>Week schedule</section>',
    catalogPageHTML:()=>'<section>Catalog</section>',initCatalogPage(){},
    generalBoardHTML:()=>'',drawerHTML:()=>'',initScheduleLocator(){},initFloatWins(){},watchHeader(){},scheduleChat:null,
    MODALS:{blk:()=>({title:'Block details',body:'Other segments'})},esc:value=>value,tx:value=>value,
    sizeBlockDetailModal(){},modalFocusFromToken:()=>null,modalFocusable:()=>[],
    save:rejectWrite,commit:rejectWrite,fetch:rejectWrite};
  vm.createContext(env);
  const renderStart=source.indexOf('function render(){');
  const lifecycleStart=source.indexOf('function openModal(');
  const modalStart=source.indexOf('function renderModal(){');
  const gotoStart=source.indexOf('    case "goto":');
  const urlView=source.split('\n').find(line=>line.startsWith('function setUrlView('));
  vm.runInContext('let modalReturnFocus=null;'+urlView+
    source.slice(renderStart,source.indexOf('let _hdrRO=',renderStart))+
    source.slice(lifecycleStart,source.indexOf('function ownsLegacyRequest(',lifecycleStart))+
    source.slice(modalStart,source.indexOf('function rerender(){',modalStart))+
    'function navigate(date){const a={dataset:{d:date}};switch("goto"){'+
    source.slice(gotoStart,source.indexOf('    case "tv":',gotoStart))+'}}',env);
  return {env,app,modalRoot,document,launcher,scrolls,schedule,
    open:()=>env.openModal({t:'blk',id:'existing'}),
    navigate:date=>env.navigate(date),
    flush:()=>{while(frames.length)frames.shift()();}};
}

for(const date of ['2026-10-25','2026-10-26']){
  test('block segment navigation reveals the day schedule for '+date,()=>{
    const f=fixture();f.open();
    assert.match(f.modalRoot.innerHTML,/role="dialog"/,'block details starts visible');
    f.navigate(date);f.flush();
    assert.equal(f.modalRoot.innerHTML,'','the destination must not remain covered by block details');
    assert.equal(f.env.UI.modal,null);
    assert.equal(f.env.UI.date,date);
    assert.equal(f.env.UI.view,'day');
    assert.equal(f.env.UI.wkFit,false);
    assert.match(f.app.innerHTML,new RegExp('data-date="'+date+'"'));
    assert.deepEqual(f.scrolls.at(-1),[0,0]);
    assert.equal(f.env.UI.factory,2);
    assert.equal(f.env.UI.layout,'machine');
    assert.equal(f.env.UI.zoom,1.25);
    assert.equal(f.env.S,f.schedule);
    assert.deepEqual(f.schedule.blocks,[{id:'existing',date:'2026-10-25'}]);
  });
}

test('navigation without an open modal still reveals the requested day',()=>{
  const f=fixture();f.navigate('2026-10-27');f.flush();
  assert.equal(f.modalRoot.innerHTML,'');
  assert.equal(f.env.UI.modal,null);
  assert.equal(f.env.UI.date,'2026-10-27');
  assert.equal(f.env.UI.view,'day');
  assert.match(f.app.innerHTML,/data-date="2026-10-27"/);
  assert.equal(f.env.UI.factory,2);
  assert.equal(f.env.UI.layout,'machine');
  assert.equal(f.env.UI.zoom,1.25);
});

test('closing details during navigation cannot restore focus to a removed launcher',()=>{
  const f=fixture();f.open();f.navigate('2026-10-26');
  assert.equal(f.launcher.isConnected,false,'the navigation redraws the old board');
  f.flush();
  assert.equal(f.modalRoot.innerHTML,'');
  assert.equal(f.document.activeElement.isConnected,true);
  assert.notEqual(f.document.activeElement,f.launcher);
});

test('order navigation leaves catalog and keeps test mode in the board URL',()=>{
  const f=fixture({page:'catalog'});f.env.render();
  assert.match(f.app.innerHTML,/Catalog/);
  f.open();f.navigate('2026-10-26');f.flush();
  assert.equal(f.modalRoot.innerHTML,'');
  assert.equal(f.env.UI.page,null);
  assert.match(f.app.innerHTML,/data-date="2026-10-26"/);
  assert.doesNotMatch(f.app.innerHTML,/Catalog/);
  const url=new URL(f.env.location.href);
  assert.equal(url.searchParams.get('view'),null);
  assert.equal(url.searchParams.get('mode'),'test');
  assert.equal(url.hash,'#schedule');
  assert.equal(f.env.UI.factory,2);
  assert.equal(f.env.UI.layout,'machine');
  assert.equal(f.env.UI.zoom,1.25);
});

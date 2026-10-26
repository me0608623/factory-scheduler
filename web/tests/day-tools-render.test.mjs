import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(){
  const body={classList:{toggle(){}}};
  const document={body,activeElement:body};
  let details=null,buttons=new Map(),zoom={day:1,week:1,wheelZoom:false};
  const app={set innerHTML(html){
    if(details)details.isConnected=false;
    document.activeElement=body;
    details=html.includes('day-board-tools')?{open:false,isConnected:true}:null;
    buttons=new Map();
    if(details){
      const owner=details;
      for(const act of ['sz-in','sz-out','sz-reset','sz-wheeltoggle']){
        const button={dataset:{act},
          closest:selector=>selector==='.szbar button'?button:null,
          getClientRects:()=>owner.isConnected&&owner.open?[{}]:[],
          focus(){if(button.getClientRects().length)document.activeElement=button;}};
        buttons.set(act,button);
      }
    }
  }};
  document.querySelector=selector=>{
    if(selector==='#app')return app;
    if(selector==='.day-board-tools')return details;
    const act=selector.match(/\[data-act="([^"]+)"\]/)?.[1];
    return buttons.get(act)||null;
  };
  const env={document,$:document.querySelector,window:{scrollY:0,scrollTo(){}},
    UI:{prefs:{language:'zh-TW'},view:'day'},PV:null,I18N:{},SZ:zoom,
    ensureVisualStyles(){},topHTML:()=>'',appNavHTML:()=>'',bannerHTML:()=>'',
    dayHTML:()=>'<details class="day-board-tools"></details>',weekHTML:()=>'',workViewHTML:()=>'',
    generalBoardHTML:()=>'',drawerHTML:()=>'',initScheduleLocator(){},initFloatWins(){},watchHeader(){},scheduleChat:null,
    setZoom(view,next){zoom={...zoom,[view]:next};},schedZoomState:()=>zoom,
    setWheelZoom(value){zoom={...zoom,wheelZoom:value};},zoomWheel:{cancel(){}},toast(){}};
  vm.createContext(env);
  const renderStart=source.indexOf('function render(){');
  const zoomStart=source.indexOf('function applyZoom(');
  const actionsStart=source.indexOf('    case "sz-in":');
  vm.runInContext(source.slice(renderStart,source.indexOf('let _hdrRO=',renderStart))+
    source.slice(zoomStart,source.indexOf('const zoomWheel=',zoomStart))+
    'function click(act){switch(act){'+source.slice(actionsStart,source.indexOf('    case "nav-toggle":',actionsStart))+'}}',env);
  return {document,ui:env.UI,render:()=>env.render(),
    click(act){buttons.get(act)?.focus();env.click(act);},
    get tools(){return details;},get zoom(){return zoom;},button:act=>buttons.get(act)};
}

test('More stays open and zoom controls retain visible focus through repeated adjustments',()=>{
  const f=fixture();f.render();f.tools.open=true;
  for(const [act,expected] of [['sz-in',1.25],['sz-in',1.5625],['sz-out',1.25],['sz-reset',1],['sz-out',.8]]){
    f.click(act);
    assert.equal(f.zoom.day,expected);
    assert.equal(f.tools.open,true,'More must stay open after changing the scale');
    assert.equal(f.document.activeElement,f.button(act),'focus must return to the control');
    assert.equal(f.document.activeElement.getClientRects().length,1,'focused control must remain visible');
  }
});

test('wheel zoom can be toggled repeatedly without hiding its focused control',()=>{
  const f=fixture();f.render();f.tools.open=true;
  for(const expected of [true,false,true]){
    f.click('sz-wheeltoggle');
    assert.equal(f.zoom.wheelZoom,expected);
    assert.equal(f.tools.open,true);
    assert.equal(f.document.activeElement,f.button('sz-wheeltoggle'));
    assert.equal(f.document.activeElement.getClientRects().length,1);
  }
});

test('More starts closed and preserves the user closing it on later renders',()=>{
  const f=fixture();f.render();assert.equal(f.tools.open,false);
  f.render();assert.equal(f.tools.open,false);
  f.tools.open=true;f.render();assert.equal(f.tools.open,true);
  f.tools.open=false;f.render();assert.equal(f.tools.open,false);
});

test('switching through views without More does not carry a stale disclosure state',()=>{
  for(const next of [{view:'week'},{view:'day',layout:'work'}]){
    const f=fixture();f.render();f.tools.open=true;
    Object.assign(f.ui,next);f.render();assert.equal(f.tools,null);
    f.render();assert.equal(f.tools,null);
    Object.assign(f.ui,{view:'day',layout:null});f.render();
    assert.equal(f.tools.open,false);
  }
});

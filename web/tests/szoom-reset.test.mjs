import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const zoom=readFileSync(new URL('../src/szoom.js',import.meta.url),'utf8').replace(/^export /gm,'');
const locate=readFileSync(new URL('../src/board-locate.js',import.meta.url),'utf8').replace(/^export /gm,'');
function between(start,end){
  const i=source.indexOf(start),j=source.indexOf(end,i);
  assert.ok(i>=0&&j>i,`${start} through ${end}`);
  return source.slice(i,j);
}
const appFunctions=[
  between('function render(){','\nlet _hdrRO='),
  between('let pinchActive=false;','document.addEventListener("pointerdown",e=>{\n  if(pinchActive)return;'),
  between('const PV_BLOCK=new Set(','document.addEventListener("click",e=>{if(e.target.dataset?.actChange)'),
].join('\n');

// Actual registered gesture/click handlers, applyZoom, render and zoom persistence
// run in an isolated VM. DOM, frames and geometry are synthetic; this does not
// assert browser touch dispatch, CSS layout, focus or physical-device behavior.
function harness(view='day',{wheelZoom=true}={}){
  const events={},frames=[],writes=[],renders=[],storage=new Map();
  let scroller,board;
  const app={set innerHTML(html){
    renders.push(html);
    const rect={left:0,right:600,top:100,bottom:900,width:600,height:800};
    scroller={scrollLeft:0,clientWidth:600,querySelectorAll:()=>[],
      getBoundingClientRect:()=>rect,addEventListener(){},removeEventListener(){}};
    const hint={hidden:true};
    board={querySelector:s=>s==='.scroller'?scroller:s==='.board-locate'?hint:null};
  }};
  const document={
    body:{classList:{toggle(){}}},activeElement:null,
    addEventListener:(type,fn)=>(events[type]??=[]).push(fn),
    querySelector:s=>s==='#app'?app:s==='.scroller'||s==='.board.szoom .scroller'?scroller:s==='.board.szoom'?board:null,
    querySelectorAll:()=>[],
  };
  const env={
    document,$:document.querySelector,
    window:{scrollX:0,scrollY:0,scrollTo(x,y){this.scrollX=x;this.scrollY=y;}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem(k,value){storage.set(k,value);writes.push([k,JSON.parse(value)]);}},
    requestAnimationFrame:fn=>frames.push(fn),
    UI:{date:'2026-11-09',view,layout:'resource',page:null,prefs:{language:'zh-TW'},modal:null,wkFit:false},
    SZ:null,PV:null,drag:null,generalDrag:null,I18N:{},readOnly:true,S:{blocks:[]},
    ensureVisualStyles(){},topHTML:()=>'',appNavHTML:()=>'',bannerHTML:()=>'',
    dayHTML:()=>'<day>',weekHTML:()=>'<week>',generalBoardHTML:()=>'',drawerHTML:()=>'',
    initFloatWins(){},watchHeader(){},scheduleChat:{refresh(){}},endDrag(){},toast(){},setUrlView(){},
  };
  vm.createContext(env);
  vm.runInContext(zoom+'\n'+locate+'\n'+appFunctions,env);
  const run=code=>vm.runInContext(code,env);
  // Give the other view a distinct preference so reset must preserve it.
  run(`setZoom('day',${view==='day'?1.5:.7});setZoom('week',${view==='week'?1.5:.7});setWheelZoom(${wheelZoom});SZ=schedZoomState();render();`);
  writes.length=0;renders.length=0;
  const emit=(type,e)=>(events[type]||[]).forEach(fn=>fn(e));
  const target={closest:s=>s==='.board.szoom'?board:null};
  const touches=distance=>[
    {clientX:150-distance/2,clientY:300},
    {clientX:150+distance/2,clientY:300},
  ];
  return {
    env,frames,writes,renders,run,emit,
    persisted:()=>JSON.parse(storage.get('fsched-schedzoom-v1')),
    wheel(deltaY=100){
      let prevented=false;
      emit('wheel',{target,deltaX:0,deltaY,clientX:180,clientY:400,preventDefault(){prevented=true;}});
      return prevented;
    },
    click(act,data={}){
      const button={dataset:{act,...data},closest:()=>board};
      emit('click',{target:{closest:s=>s==='[data-act]'?button:null}});
    },
    touchStart(){emit('touchstart',{target,touches:touches(100)});},
    touchMove(distance=200){emit('touchmove',{touches:touches(distance),preventDefault(){}});},
    flush(){while(frames.length)frames.shift()();},
  };
}

function expectedZoom(view,value,wheelZoom=true){
  return {day:view==='day'?value:.7,week:view==='week'?value:.7,wheelZoom};
}
function assertOnlyReset(h,view,wheelZoom=true){
  const expected=expectedZoom(view,1,wheelZoom);
  assert.equal(h.env.SZ[view],1);
  assert.deepEqual(h.persisted(),expected);
  assert.deepEqual(h.writes,[['fsched-schedzoom-v1',expected]]);
  assert.equal(h.renders.length,1);
  assert.equal(h.env.UI.view,view);
  assert.equal(h.env.UI.wkFit,false);
}

for(const view of ['day','week']){
  for(const wheelZoom of [true,false]){
    test(`${view}: plain 100% reset preserves the other zoom and wheel preference (${wheelZoom})`,()=>{
      const h=harness(view,{wheelZoom});h.env.UI.wkFit=view==='week';
      h.click('sz-reset');h.flush();assertOnlyReset(h,view,wheelZoom);
    });
  }
  for(const delta of [-100,100]){
    test(`${view}: 100% reset supersedes a queued wheel ${delta<0?'in':'out'} frame`,()=>{
      const h=harness(view);h.env.UI.wkFit=view==='week';
      assert.equal(h.wheel(delta),true);assert.equal(h.frames.length,1);
      h.click('sz-reset');assertOnlyReset(h,view);
      h.flush();assertOnlyReset(h,view);
    });
  }
  test(`${view}: 100% reset supersedes a queued pinch frame and later moves of that gesture`,()=>{
    const h=harness(view);h.touchStart();h.touchMove();assert.equal(h.frames.length,1);
    h.click('sz-reset');assertOnlyReset(h,view);
    h.flush();assertOnlyReset(h,view);
    h.touchMove(150);h.flush();assertOnlyReset(h,view);
    assert.equal(h.run('pinch0'),null);assert.equal(h.run('pinchActive'),false);
  });
  test(`${view}: reset ends an already-applied pinch so its old baseline cannot overwrite 100%`,()=>{
    const h=harness(view);h.touchStart();h.touchMove(150);h.flush();
    assert.equal(h.env.SZ[view],2.25);
    h.writes.length=0;h.renders.length=0;
    h.click('sz-reset');assertOnlyReset(h,view);
    h.touchMove(120);h.flush();assertOnlyReset(h,view);
    assert.equal(h.run('pinch0'),null);assert.equal(h.run('pinchActive'),false);
  });
  test(`${view}: reset allows a new wheel before the invalidated wheel callback runs`,()=>{
    const h=harness(view);h.wheel(100);h.click('sz-reset');
    assert.equal(h.wheel(-100),true);assert.equal(h.frames.length,2);
    h.flush();assert.equal(h.env.SZ[view],1.12);
    assert.deepEqual(h.writes,[
      ['fsched-schedzoom-v1',expectedZoom(view,1)],
      ['fsched-schedzoom-v1',expectedZoom(view,1.12)],
    ]);
    assert.equal(h.renders.length,2);
  });
  test(`${view}: reset allows a new pinch before the invalidated pinch callback runs`,()=>{
    const h=harness(view);h.touchStart();h.touchMove();h.click('sz-reset');
    h.touchStart();h.touchMove(120);assert.equal(h.frames.length,2);
    h.flush();assert.equal(h.env.SZ[view],1.2);
    // Ordinary pinch must retain its new baseline across multiple applyZoom calls.
    h.touchMove(140);h.flush();assert.equal(h.env.SZ[view],1.4);
    assert.deepEqual(h.writes,[1,1.2,1.4].map(z=>['fsched-schedzoom-v1',expectedZoom(view,z)]));
    assert.equal(h.run('pinchActive'),true);
  });
  for(const ending of ['touchend','touchcancel']){
    test(`${view}: ${ending} after reset is safe and fresh wheel/pinch gestures still work`,()=>{
      const h=harness(view);h.touchStart();h.touchMove();h.click('sz-reset');
      h.emit(ending,{touches:[]});h.flush();assertOnlyReset(h,view);
      assert.equal(h.wheel(-100),true);h.flush();assert.equal(h.env.SZ[view],1.12);
      h.touchStart();h.touchMove();h.flush();assert.equal(h.env.SZ[view],2.24);
      assert.deepEqual(h.writes,[1,1.12,2.24].map(z=>['fsched-schedzoom-v1',expectedZoom(view,z)]));
    });
  }
  for(const act of ['sz-in','sz-out'])for(const delta of [-100,100]){
    test(`${view}: relative ${act} still composes with queued wheel ${delta}`,()=>{
      const h=harness(view);h.wheel(delta);h.click(act);
      const afterButton=act==='sz-in'?1.88:1.2;
      assert.equal(h.env.SZ[view],afterButton);
      h.flush();
      const expected=Math.round(afterButton*(delta<0?1.12:1/1.12)*100)/100;
      assert.equal(h.env.SZ[view],expected);
      assert.deepEqual(h.writes,[afterButton,expected].map(z=>['fsched-schedzoom-v1',expectedZoom(view,z)]));
    });
  }
  for(const [act,data] of [['view',{v:view}],['goto',{d:'2026-11-10'}]]){
    for(const gesture of ['wheel','pinch']){
      test(`${view}: ${act} still cancels older ${gesture} work`,()=>{
        const h=harness(view);
        if(gesture==='wheel')h.wheel();else{h.touchStart();h.touchMove();}
        h.click(act,data);h.flush();h.touchMove();h.flush();
        assert.equal(h.env.SZ[view],1.5);assert.deepEqual(h.writes,[]);
        assert.equal(h.renders.length,1);
        assert.equal(h.run('pinch0'),null);assert.equal(h.run('pinchActive'),false);
        assert.equal(h.env.UI.view,act==='view'?view:'day');
        if(act==='goto')assert.equal(h.env.UI.date,data.d);
      });
    }
  }
}

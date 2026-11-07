import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const listenersSource=source.slice(source.indexOf('document.addEventListener("mousedown",'),source.indexOf('document.addEventListener("keydown",'));
function fixture({left=80,right=180,cornerRight=160,viewportLeft=8,width=350,border=2,total=1060,scroll=300,week=true}={}){
  const listeners={},frames=[],writes=[];
  const document={activeElement:null,addEventListener:(type,fn)=>listeners[type]=fn};
  const scroller={clientWidth:width,clientLeft:border,scrollWidth:total,
    getBoundingClientRect:()=>({left:viewportLeft}),
    querySelector:selector=>selector==='.corner'?{getBoundingClientRect:()=>({right:cornerRight})}:null,
    get scrollLeft(){return scroll;},set scrollLeft(value){writes.push(value);scroll=value;}};
  const target={isConnected:true,
    matches:selector=>week&&selector==='.wgrid > .wh,.wgrid > .wcell',
    closest:selector=>selector==='.scroller'?scroller:null,
    getBoundingClientRect:()=>({left,right})};
  document.activeElement=target;
  vm.runInNewContext(listenersSource,{document,requestAnimationFrame:fn=>frames.push(fn)});
  return {document,target,scroller,writes,
    focus(){listeners.focusin?.({target});},flush(){while(frames.length)frames.shift()();}};
}

test('focus behind the sticky label scrolls into the unobscured area after native focus',()=>{
  const f=fixture();f.focus();assert.deepEqual(f.writes,[]);f.flush();
  assert.equal(f.scroller.scrollLeft,220);assert.equal(f.document.activeElement,f.target);
});

test('focus beyond the right edge scrolls only its owning scroller',()=>{
  const first=fixture({left:340,right:470}),other=fixture();
  first.focus();first.flush();assert.equal(first.scroller.scrollLeft,410);assert.deepEqual(other.writes,[]);
});

test('visible focus leaves horizontal scrolling untouched',()=>{
  const f=fixture({left:170,right:350});f.focus();f.flush();assert.deepEqual(f.writes,[]);
});

test('oversized cells expose their leading edge without overscrolling it',()=>{
  const f=fixture({left:200,right:600});f.focus();f.flush();assert.equal(f.scroller.scrollLeft,340);
  const aligned=fixture({left:160,right:600});aligned.focus();aligned.flush();assert.deepEqual(aligned.writes,[]);
});

test('measured sticky widths and scroller borders define clearance',()=>{
  for(const cornerRight of [64,160,220]){
    const f=fixture({left:30,right:60,cornerRight});f.focus();f.flush();assert.equal(f.scroller.scrollLeft,330-cornerRight);
  }
});

test('fit grids and scrollers with no usable area do not move',()=>{
  for(const options of [{total:350},{cornerRight:360},{cornerRight:380}]){
    const f=fixture(options);f.focus();f.flush();assert.deepEqual(f.writes,[]);
  }
});

test('unrelated focus and stale queued targets do not move the board',()=>{
  const unrelated=fixture({week:false});unrelated.focus();unrelated.flush();assert.deepEqual(unrelated.writes,[]);
  for(const stale of ['disconnected','superseded']){
    const f=fixture();f.focus();if(stale==='disconnected')f.target.isConnected=false;else f.document.activeElement={};
    f.flush();assert.deepEqual(f.writes,[]);
  }
});

test('scroll corrections stay within both horizontal bounds',()=>{
  const start=fixture({scroll:20,left:0,right:100});start.focus();start.flush();assert.equal(start.scroller.scrollLeft,0);
  const end=fixture({scroll:700,left:500,right:600});end.focus();end.flush();assert.equal(end.scroller.scrollLeft,710);
});

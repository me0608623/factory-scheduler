import test from 'node:test';
import assert from 'node:assert/strict';
import {floatWindow,reflowAllWindows} from '../src/win.js';

function fixture(raw,run){
  const names=['window','localStorage','Element','innerWidth','innerHeight','document'];
  const previous=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const oldState=floatWindow._s,listeners=new Map(),writes=[];
  class El{
    style={};dataset={};offsetWidth=160;offsetHeight=56;isConnected=true;
    classList={add(){},remove(){},toggle(){}};
    handlers=new Map();
    addEventListener(k,fn){this.handlers.set(k,fn);}
    removeEventListener(k){this.handlers.delete(k);}
    querySelector(){return null;} querySelectorAll(){return [];}
    appendChild(){} setAttribute(){}
  }
  Object.assign(globalThis,{Element:El,innerWidth:1200,innerHeight:800,
    window:{matchMedia:()=>({matches:false}),addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)},
    localStorage:{getItem:()=>raw,setItem:(k,v)=>writes.push(JSON.parse(v))},document:{createElement:()=>new El()}});
  floatWindow._s=new Map();
  const el=new El(),handle=new El(),defaults={x:900,y:700,w:160,h:56};
  try{return run({el,handle,defaults,listeners,writes});}
  finally{floatWindow._s=oldState;for(const [k,d] of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
}

test('incomplete or malformed stored window geometry falls back before painting',()=>{
  const valid={x:20,y:30,w:400,h:300};
  const invalid=[{x:20,w:400},...['x','y','w','h'].flatMap(k=>
    [null,'bad'].map(v=>({...valid,[k]:v}))),{...valid,w:0},{...valid,h:0},{...valid,h:-1}];
  for(const saved of invalid)for(const moveOnly of [true,false])fixture(JSON.stringify(saved),f=>{
    const result=floatWindow(f.el,{key:'test',defaults:f.defaults,handle:f.handle,moveOnly});
    assert.deepEqual(result.state.geom,f.defaults,JSON.stringify({saved,moveOnly}));
    assert.equal(f.el.style.top,'700px');
    for(const value of Object.values(f.el.style))assert.ok(!String(value).includes('NaN'));
    assert.equal(f.writes.length,0,'opening must not overwrite storage');
  });
});

test('valid stored geometry survives reopening and viewport reflow',()=>{
  const saved={x:100,y:200,w:400,h:300};
  fixture(JSON.stringify(saved),f=>{
    for(let i=0;i<3;i++){
      floatWindow(f.el,{key:'test',defaults:f.defaults,handle:f.handle});
      assert.equal(f.el.style.left,'100px');assert.equal(f.el.style.top,'200px');
      reflowAllWindows();
    }
    assert.equal(f.el.style.width,'400px');assert.equal(f.el.style.height,'300px');
  });
});

test('recovered launcher can drag, cancel and reopen with finite geometry',()=>{
  fixture('{"x":20,"w":160}',f=>{
    const opts={key:'test',defaults:f.defaults,handle:f.handle,moveOnly:true};
    floatWindow(f.el,opts);
    f.handle.handlers.get('pointerdown')({clientX:0,clientY:0,target:{closest:()=>null}});
    f.listeners.get('pointermove')({clientX:10,clientY:10});
    f.listeners.get('pointercancel')();
    assert.equal(f.listeners.size,0);
    assert.equal(f.writes.length,1);
    assert.deepEqual(f.writes[0],{x:910,y:710,w:160,h:56});
    floatWindow(f.el,opts);reflowAllWindows();
    assert.equal(f.el.style.left,'910px');assert.equal(f.el.style.top,'710px');
  });
});

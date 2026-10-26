import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(tags){
  const listeners={};
  const document={activeElement:null,addEventListener:(type,fn)=>listeners[type]=fn};
  const controls=tags.map(tag=>({tag:tag.replace('[tabindex="-1"]',''),tabIndex:tag.includes('tabindex')?-1:null,
    dataset:{},hidden:false,getClientRects:()=>[{}],closest:()=>null,
    focus(){document.activeElement=this;}}));
  const modal={querySelectorAll:selector=>controls.filter(el=>selector.split(',').some(part=>{
    if(part.startsWith('[tabindex]'))return el.tabIndex!==null&&el.tabIndex!==-1;
    return part.startsWith(el.tag)&&!(part.includes(':not([tabindex="-1"])')&&el.tabIndex===-1);
  }))};
  const env={document,UI:{modal:{t:'blk'}},PV:null,$:()=>modal};
  vm.createContext(env);
  vm.runInContext(between('function modalFocusable(', 'function modalFocusToken(')+
    between('document.addEventListener("keydown",e=>{','/* ===== 8.'),env);
  return {controls,document,tab(index,shiftKey=false){
    controls[index].focus();
    const event={key:'Tab',shiftKey,target:controls[index],defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;}};
    listeners.keydown(event);
    return event;
  }};
}

test('Tab and Shift+Tab on an interior summary leave native focus navigation intact',()=>{
  for(const shiftKey of [false,true]){
    const f=fixture(['button','summary','button']);
    assert.equal(f.tab(1,shiftKey).defaultPrevented,false);
    assert.equal(f.document.activeElement,f.controls[1]);
  }
});

test('a summary at either dialog boundary participates in focus wrapping',()=>{
  const first=fixture(['summary','button']);
  assert.equal(first.tab(0,true).defaultPrevented,true);
  assert.equal(first.document.activeElement,first.controls[1]);
  const last=fixture(['button','summary']);
  assert.equal(last.tab(1).defaultPrevented,true);
  assert.equal(last.document.activeElement,last.controls[0]);
});

test('button boundaries still wrap and interior buttons keep native navigation',()=>{
  const f=fixture(['button','summary','button','button']);
  assert.equal(f.tab(0,true).defaultPrevented,true);
  assert.equal(f.document.activeElement,f.controls[3]);
  assert.equal(f.tab(3).defaultPrevented,true);
  assert.equal(f.document.activeElement,f.controls[0]);
  assert.equal(f.tab(2).defaultPrevented,false);
  assert.equal(f.document.activeElement,f.controls[2]);
});

test('a summary explicitly removed from tab order is not a wrap destination',()=>{
  const f=fixture(['summary[tabindex="-1"]','button','button']);
  assert.equal(f.tab(2).defaultPrevented,true);
  assert.equal(f.document.activeElement,f.controls[1]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(){
  let elapsed=0,element=null,scrolls=0,queries=0;
  const pending=[];
  const ctx={PV:{kind:'manual'},Date:{now:()=>1700000000000+elapsed},performance:{now:()=>5000+elapsed},
    setTimeout:fn=>pending.push(fn),requestAnimationFrame:fn=>pending.push(fn),CSS:{escape:x=>x},
    document:{querySelector:()=>{queries++;return element;}},window:{matchMedia:()=>({matches:false})}};
  vm.createContext(ctx);
  const start=source.indexOf('function dpScrollTarget(');
  vm.runInContext(source.slice(start,source.indexOf('\nfunction focusDpBack(',start)),ctx);
  return {ctx,pending,step(ms){elapsed=ms;assert.ok(pending.length,'a callback is scheduled');pending.shift()();},
    appear(){element={scrollIntoView:()=>scrolls++};},scrolls:()=>scrolls,queries:()=>queries};
}

test('missing preview target stops scheduling frames at the 800 ms deadline',()=>{
  const f=fixture();f.ctx.dpScrollTarget({id:'hidden'});
  for(const ms of [40,200,799]){f.step(ms);assert.equal(f.pending.length,1);}
  f.step(800);assert.equal(f.pending.length,0);assert.equal(f.scrolls(),0);
});

test('target rendered during the retry window scrolls once and ends retries',()=>{
  const f=fixture();f.ctx.dpScrollTarget({id:'delayed'});f.step(40);f.appear();f.step(300);
  assert.equal(f.scrolls(),1);assert.equal(f.pending.length,0);
});

test('cancelled or replaced preview ends a pending retry without querying or scrolling',()=>{
  for(const replacement of [null,{kind:'manual'}]){
    const f=fixture();f.ctx.dpScrollTarget({id:'old'});f.step(40);
    f.ctx.PV=replacement;f.appear();const queries=f.queries();f.step(100);
    assert.equal(f.queries(),queries);assert.equal(f.scrolls(),0);assert.equal(f.pending.length,0);
  }
});

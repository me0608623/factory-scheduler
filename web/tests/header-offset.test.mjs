import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const start=app.indexOf('function updateHeaderVar(){');
const end=app.indexOf('\nif(typeof ResizeObserver',start);
assert.ok(start>=0&&end>start);
const update=app.slice(start,end);

function measure(position,bottom){
  const values=[];
  const top={getBoundingClientRect:()=>({bottom})};
  const context={document:{querySelector:()=>top,documentElement:{style:{setProperty:(k,v)=>values.push([k,v])}}},
    getComputedStyle:()=>({position})};
  vm.runInNewContext(update+'\nupdateHeaderVar();',context);
  return values;
}

test('801-900px static header does not offset the sticky drawer after scrolling or redraw',()=>{
  assert.match(css,/@media \(min-width:801px\)/);
  assert.match(css,/@media \(max-width:900px\)\{\.top\{position:static\}\}/);
  for(const bottom of [-120,65,180]){
    assert.deepEqual(measure('static',bottom),[['--hdr-h','0px']]);
  }
});

test('sticky and fixed headers retain their visible bottom offset without negative positions',()=>{
  for(const position of ['sticky','fixed']){
    assert.deepEqual(measure(position,142.6),[['--hdr-h','143px']]);
    assert.deepEqual(measure(position,-30),[['--hdr-h','0px']]);
  }
});

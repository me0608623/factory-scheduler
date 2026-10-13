import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SaxesParser} from 'saxes';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('function pvDrawerActionsHTML(');
const implementation=source.slice(start,source.indexOf('function manualDrawerHTML(',start));
function controls(preview,option){
  const ctx={PV:preview,tx:x=>x};vm.createContext(ctx);vm.runInContext(implementation,ctx);
  const html=ctx.pvDrawerActionsHTML(option),buttons=[];
  const parser=new SaxesParser({xmlns:false});
  parser.on('opentag',tag=>{if(tag.name==='button')buttons.push(tag.attributes);});
  parser.write(html.replaceAll(' disabled',' disabled="disabled"')).close();
  return buttons;
}
test('automatic mobile footer reuses cancel/apply handlers with valid option enabled',()=>{
  const buttons=controls({kind:'auto'},{applicable:true});
  assert.deepEqual(buttons.map(b=>b['data-act']),['pv-cancel','pv-apply']);
  assert.equal(buttons[1].disabled,undefined);
});
test('invalid automatic/manual options cannot be applied from the new footer',()=>{
  for(const kind of ['auto','manual']){
    const buttons=controls({kind},{applicable:false});
    assert.equal(buttons[0].disabled,undefined);
    assert.equal(buttons[1].disabled,'disabled');
  }
  assert.equal(controls({kind:'manual'},{} )[1].disabled,'disabled');
});
test('saving state has no actionable cancel or apply, blocking double submit',()=>{
  for(const kind of ['manual','auto']){
    const buttons=controls({kind,applying:true},{applicable:true});
    assert.equal(buttons.length,1);assert.equal(buttons[0].disabled,'disabled');
    assert.equal(buttons[0]['data-act'],undefined);
  }
});
test('saved read-only scenarios offer cancel only, never a mobile apply action',()=>{
  assert.deepEqual(controls({kind:'auto',savedScenario:true},{applicable:true}).map(b=>b['data-act']),['pv-cancel']);
});

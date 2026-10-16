import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fixture(name,proc){
  const documents=[],notices=[];
  let blocked=false;
  const product={id:'p',name,steps:[{proc}]},machine={id:'m',label:'Machine',factory:1};
  const ctx={UI:{date:'2026-10-15',factory:1},S:{blocks:[{id:'b',date:'2026-10-15',m:'m',oid:'o',emp:null,step:0,s:480,e:540,qty:10}],dayOT:{}},
    tx:x=>x,factoryName:()=> 'Plant 1',shownMachines:()=>[machine],shownEmployees:()=>[],
    order:()=>({id:'o',pid:'p',code:'O1'}),prod:()=>product,emp:()=>null,
    hm:n=>String(n),WD:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],parseD:d=>new Date(d+'T00:00:00Z'),dayInfo:()=>({open:true,ot:false}),
    toast:t=>notices.push(t),window:{open:()=>{
      if(blocked)return null;
      const doc={html:'',closed:false};documents.push(doc);
      return {document:{write:html=>{doc.html=html;},close:()=>{doc.closed=true;}}};
    }}};
  vm.createContext(ctx);
  for(const prefix of ['const esc=','const stepName=']){
    const start=source.indexOf(prefix);assert.ok(start>=0);
    vm.runInContext(source.slice(start,source.indexOf('\n',start)),ctx);
  }
  const start=source.indexOf('function printDaySchedule(');
  vm.runInContext(source.slice(start,source.indexOf('\nfunction floorPageHTML',start)),ctx);
  return {ctx,documents,notices,block:value=>{blocked=value;}};
}

test('print renders product and process labels as literal text, not HTML',()=>{
  const f=fixture('Part <b>large</b> & "small"','Cut <i>edge</i> & finish');
  const before=JSON.stringify(f.ctx.S);
  f.ctx.printDaySchedule();
  const html=f.documents[0].html;
  assert.ok(html.includes('Part &lt;b&gt;large&lt;/b&gt; &amp; &quot;small&quot;'));
  assert.ok(html.includes('Cut &lt;i&gt;edge&lt;/i&gt; &amp; finish'));
  assert.ok(!html.includes('<b>large</b>'));assert.ok(!html.includes('<i>edge</i>'));
  assert.equal(f.documents[0].closed,true);assert.equal(JSON.stringify(f.ctx.S),before);
});

test('blocked print followed by repeated retry preserves source and emits complete documents',()=>{
  const f=fixture('Standard part','Cut'),before=JSON.stringify(f.ctx.S);
  f.block(true);f.ctx.printDaySchedule();assert.equal(f.documents.length,0);assert.equal(f.notices.length,1);
  f.block(false);f.ctx.printDaySchedule();f.ctx.printDaySchedule();
  assert.equal(f.documents.length,2);
  for(const doc of f.documents){assert.ok(doc.html.includes('O1 Standard part Cut'));assert.ok(doc.html.endsWith('</body></html>'));assert.equal(doc.closed,true);}
  assert.equal(JSON.stringify(f.ctx.S),before);
});

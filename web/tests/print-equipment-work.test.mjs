import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {inFactory} from '../src/factory.js';
import {validateGeneralWork} from '../src/general-work.js';
import {UI_TEXT} from '../src/i18n.js';

// Execute the real print function and escaping/production-label helpers. Popup,
// document writes and print() are modeled; this is not browser/pagination QA.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const date='2026-11-09',later='2026-11-10';
function state(){
  return {cal:{week:[true,true,true,true,true,true,true],over:{}},dayOT:{},execution:[],
    employees:[{id:'e1',name:'Alice',factory:1,skills:['m1','m3'],maxMachines:1,leaves:[],noOT:false},
      {id:'e2',name:'Bob',factory:2,skills:['m2'],maxMachines:1,leaves:[],noOT:false}],
    machines:[{id:'m1',label:'Mixed machine',factory:1,proc:'Cut',products:['p1'],faults:[]},
      {id:'m3',label:'Equipment only',factory:1,proc:'Cut',products:['p1'],faults:[]},
      {id:'m4',label:'Empty machine',factory:1,proc:'Cut',products:['p1'],faults:[]},
      {id:'m2',label:'Other factory machine',factory:2,proc:'Cut',products:[],faults:[]}],
    products:[{id:'p1',name:'Production part',steps:[{proc:'Cut',factory:1,rate:1,batch:0}]}],
    orders:[{id:'o1',code:'FIRST-PRODUCTION',pid:'p1',qty:10,due:later,pri:1},
      {id:'o2',code:'LAST-PRODUCTION',pid:'p1',qty:10,due:later,pri:1}],
    blocks:[{id:'b2',oid:'o2',step:0,m:'m1',emp:'e1',date,s:510,e:520,qty:10,pin:true},
      {id:'b1',oid:'o1',step:0,m:'m1',emp:'e1',date,s:480,e:490,qty:10,pin:false}],
    workContents:[{id:'w1',name:'Equipment work',factory:1,requiresResource:true,employeeIds:['e1'],resourceIds:['m1','m3'],reviewStatus:'confirmed'},
      {id:'w2',name:'Manual work',factory:1,requiresResource:false,employeeIds:['e1'],resourceIds:[],reviewStatus:'confirmed'},
      {id:'w3',name:'Other factory work',factory:2,requiresResource:true,employeeIds:['e2'],resourceIds:['m2'],reviewStatus:'confirmed'}],
    workAssignments:[{id:'a3',workId:'w1',emp:'e1',resourceId:'m3',date,s:520,e:530,qty:7,orderId:'o1',note:'Equipment note'},
      {id:'a2',workId:'w1',emp:'e1',resourceId:'m1',date,s:500,e:510,qty:null,orderId:null,note:''},
      {id:'other',workId:'w3',emp:'e2',resourceId:'m2',date,s:480,e:490,qty:null,orderId:null,note:''},
      {id:'a1',workId:'w1',emp:'e1',resourceId:'m1',date,s:490,e:500,qty:0,orderId:null,note:''},
      {id:'next',workId:'w1',emp:'e1',resourceId:'m3',date:later,s:520,e:530,qty:9,orderId:null,note:'Next date only'},
      {id:'manual',workId:'w2',emp:'e1',resourceId:null,date,s:530,e:540,qty:null,orderId:null,note:''}]};
}
function harness(){
  const documents=[],notices=[];let blocked=false;
  const ctx={S:state(),UI:{date,factory:1},tx:s=>s,factoryName:f=>'Plant '+f,
    shownMachines:()=>ctx.S.machines.filter(m=>inFactory(m,ctx.UI.factory)),
    shownEmployees:()=>ctx.S.employees.filter(e=>inFactory(e,ctx.UI.factory)),
    order:id=>ctx.S.orders.find(o=>o.id===id),prod:id=>ctx.S.products.find(p=>p.id===id),emp:id=>ctx.S.employees.find(e=>e.id===id),
    hm:n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),
    WD:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],parseD:d=>new Date(d+'T00:00:00Z'),dayInfo:()=>({open:true,ot:false}),
    toast:s=>notices.push(s),window:{open:()=>{
      if(blocked)return null;
      const doc={html:'',closed:false};documents.push(doc);
      return {document:{write:html=>doc.html=html,close:()=>doc.closed=true}};
    }}};
  validateGeneralWork(ctx.S);
  vm.createContext(ctx);
  for(const prefix of ['const esc=','const stepName=']){
    const start=source.indexOf(prefix);assert.ok(start>=0,prefix);
    vm.runInContext(source.slice(start,source.indexOf('\n',start)),ctx);
  }
  const start=source.indexOf('function printDaySchedule('),end=source.indexOf('\nfunction floorPageHTML',start);
  assert.ok(start>=0&&end>start,'actual print function found');
  vm.runInContext(source.slice(start,end),ctx);
  return {ctx,documents,notices,block:value=>blocked=value,print:()=>{ctx.printDaySchedule();return documents.at(-1)?.html;}};
}
const rows=html=>[.../<tbody>([\s\S]*?)<\/tbody>/.exec(html)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>m[1]);
const cells=row=>[...row.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)].map(m=>m[1]);

test('equipment-only machine prints its real employee/work and reference quantity, not an idle dash or production label',()=>{
  const h=harness(),before=JSON.stringify(h.ctx.S),html=h.print();
  const row=rows(html).find(row=>row.includes('<b>Equipment only</b>'));
  assert.deepEqual(cells(row),['<b>Equipment only</b><br><small>m3</small>','<b>Alice</b>','08:40–08:50','Equipment work','參考 7','Equipment note']);
  assert.doesNotMatch(row,/FIRST-PRODUCTION|Production part|Cut/,'reference order must not become a production job');
  assert.match(rows(html).find(row=>row.includes('<b>Empty machine</b>')),/colspan="5"[^>]*>—<\/td>/,'truly empty machine stays empty');
  assert.equal(JSON.stringify(h.ctx.S),before);
});

test('mixed production and equipment work share the machine rowspan in precise time order; zero is not blank',()=>{
  const h=harness(),before=JSON.stringify(h.ctx.S),printed=rows(h.print());
  assert.match(printed[0],/rowspan="4"/);
  assert.deepEqual(printed.slice(0,4).map(row=>cells(row).find(cell=>/^\d\d:\d\d–/.test(cell))),['08:00–08:10','08:10–08:20','08:20–08:30','08:30–08:40 ◆']);
  assert.deepEqual(cells(printed[0]).slice(1),['<b>Alice</b>','08:00–08:10','FIRST-PRODUCTION Production part Cut','10','']);
  assert.deepEqual(cells(printed[1]),['<b>Alice</b>','08:10–08:20','Equipment work','參考 0','']);
  assert.deepEqual(cells(printed[2]),['<b>Alice</b>','08:20–08:30','Equipment work','—','']);
  assert.deepEqual(cells(printed[3]),['<b>Alice</b>','08:30–08:40 ◆','LAST-PRODUCTION Production part Cut','10','']);
  assert.equal(JSON.stringify(h.ctx.S),before,'sort must not reorder stored blocks or assignments');
});

test('reference quantity label is available in every supported non-Chinese print language',()=>{
  const h=harness();
  for(const lang of ['en','vi','th']){
    assert.ok(UI_TEXT['參考']?.[lang],lang);
    h.ctx.tx=key=>UI_TEXT[key]?.[lang]||key;
    assert.ok(h.print().includes('<td>'+UI_TEXT['參考'][lang]+' 0</td>'),lang);
  }
});

test('equipment print follows selected date and machines for each factory and all-factory mode; no manual section is invented',()=>{
  const h=harness();let html=h.print();
  assert.match(html,/Equipment work/);
  assert.doesNotMatch(html,/Other factory machine|Other factory work|Next date only|Manual work/);
  h.ctx.UI.factory=2;html=h.print();
  assert.match(html,/Other factory machine[\s\S]*Bob[\s\S]*Other factory work/);
  assert.doesNotMatch(html,/Equipment only|Equipment work|FIRST-PRODUCTION|Next date only|Manual work/);
  h.ctx.UI.factory='all';html=h.print();
  assert.match(html,/Equipment work/);assert.match(html,/Other factory work/);
  assert.doesNotMatch(html,/Next date only|Manual work/);
  h.ctx.UI.date=later;html=h.print();
  assert.match(html,/Equipment work<\/td><td>參考 9<\/td><td>Next date only/);
  assert.doesNotMatch(html,/FIRST-PRODUCTION|LAST-PRODUCTION|Other factory work|Manual work|Equipment note/);
});

test('equipment labels, employee, machine and note remain escaped in the actual print document',()=>{
  const h=harness();
  h.ctx.S.workContents[0].name='Work <img src=x> & "label"';
  h.ctx.S.employees[0].name='Employee <i>A</i> & "B"';
  h.ctx.S.machines[1].label='Machine <b>C</b> & "D"';
  h.ctx.S.workAssignments[0].note='Note </td><script>bad()</script> & "end"';
  const before=JSON.stringify(h.ctx.S),html=h.print();
  for(const text of ['Work &lt;img src=x&gt; &amp; &quot;label&quot;','Employee &lt;i&gt;A&lt;/i&gt; &amp; &quot;B&quot;',
    'Machine &lt;b&gt;C&lt;/b&gt; &amp; &quot;D&quot;','Note &lt;/td&gt;&lt;script&gt;bad()&lt;/script&gt; &amp; &quot;end&quot;'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/<img|<i>A<\/i>|<b>C<\/b>|<script>bad\(\)/);
  assert.equal(JSON.stringify(h.ctx.S),before);
});

test('unknown equipment references do not create a phantom machine or leak into selected rows',()=>{
  const h=harness();
  h.ctx.S.workAssignments.push({...h.ctx.S.workAssignments[0],id:'orphan',resourceId:'missing-machine',note:'Unknown resource work'});
  const before=JSON.stringify(h.ctx.S);
  for(const factory of [1,2,'all']){
    h.ctx.UI.factory=factory;
    assert.doesNotMatch(h.print(),/missing-machine|Unknown resource work/);
  }
  assert.equal(JSON.stringify(h.ctx.S),before);
});

test('blocked equipment print can be retried repeatedly with complete documents and unchanged source state',()=>{
  const h=harness(),before=JSON.stringify(h.ctx.S);
  h.block(true);h.print();
  assert.equal(h.documents.length,0);assert.equal(h.notices.length,1);
  assert.match(h.notices[0],/封鎖.*列印視窗/);
  h.block(false);h.print();h.print();
  assert.equal(h.documents.length,2);
  for(const doc of h.documents){
    assert.match(doc.html,/Equipment work/);assert.match(doc.html,/FIRST-PRODUCTION/);
    assert.equal(doc.closed,true);assert.ok(doc.html.endsWith('</body></html>'));
    const inline=/<script>(.*?)<\/script>/.exec(doc.html)[1];let printed=0;
    vm.runInNewContext(inline,{window:{print:()=>printed++}});assert.equal(printed,1);
  }
  assert.equal(JSON.stringify(h.ctx.S),before);
});

test('production-only legacy state without general-work arrays still prints normally',()=>{
  const h=harness();delete h.ctx.S.workContents;delete h.ctx.S.workAssignments;
  const html=h.print();
  assert.match(html,/FIRST-PRODUCTION Production part Cut/);assert.match(html,/LAST-PRODUCTION Production part Cut/);
  assert.match(rows(html)[0],/rowspan="2"/);
});

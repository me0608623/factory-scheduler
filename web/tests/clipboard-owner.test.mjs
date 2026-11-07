import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.env.CLIPBOARD_SOURCE || new URL('../src/app.js',import.meta.url),'utf8');
const slice=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j);};
const fn=n=>{const i=source.indexOf('function '+n+'('),j=source.indexOf('\n}',i);assert.ok(i>=0&&j>i,n);return (source.slice(i-6,i)==='async '?'async ':'')+source.slice(i,j+2);};
const exportCode=slice(source.includes('function rowsTSV(')?'function rowsTSV(rows){':'function dayTSV(){','/* ===== 12.');
const code=exportCode+'\n'+['openModal','closeModal','cancelPlanCalculation','endPlanCalculation',...(source.includes('function planCalculationCurrent(')?['planCalculationCurrent']:[]),'planCalculationReady','openPlans'].map(fn).join('\n')+'\nconst actions={'+slice('"x-copy-day":','"x-print-day":')+slice('"x-copy-all":','"x-xlsx":')+'};this.actions=actions;';
function setup(mode='deferred'){
 const messages=[],writes=[],files=[],rendered=[],pending=[];
 const S={machines:[{id:'M1',label:'Machine',factory:1},{id:'M2',label:'Other factory',factory:2}],employees:[{id:'E1',name:'Alice'}],orders:[{id:'O1',code:'ORDER',pid:'P1'}],products:[{id:'P1',name:'Product'}],blocks:[{id:'B1',date:'2026-11-09',m:'M1',emp:'E1',oid:'O1',s:480,e:510,qty:5}]};
 const UI={date:'2026-11-09',factory:1,modal:{t:'export'}};
 const c={S,UI,STORE:{kind:'supabase',session:{user:{id:'A'}},authEpoch:1,version:1,can:()=>true},PV:null,AbortController,openPlansSolver:async()=>{},openPlansLocal:async()=>{},SOLVER:{up:false,check:()=>new Promise(()=>{})},MODALS:{},DAY0:480,DAY1:540,LUNCH_S:720,LUNCH_E:780,WD:'日一二三四五六',Blob,Date,modalReturnFocus:null,planCalculationJob:null,
 navigator:{clipboard:{writeText(text){writes.push(text);if(mode==='throw')throw new Error('NotAllowedError');if(mode==='resolved')return Promise.resolve();if(mode==='rejected')return Promise.reject(new Error('NotAllowedError'));return new Promise((resolve,reject)=>pending.push({resolve,reject}));}}},
 shownMachines:()=>S.machines.filter(m=>m.factory===UI.factory),occupiedWork:()=>[],assignments:()=>[],workCatalog:()=>[],
 emp:id=>S.employees.find(e=>e.id===id),order:id=>S.orders.find(o=>o.id===id),prod:id=>S.products.find(p=>p.id===id),stepName:()=> 'Cut',issuesOf:()=>[],byAbs:(a,b)=>a.s-b.s,
 hm:n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),mdw:d=>d,parseD:d=>new Date(d+'T00:00:00Z'),todayStr:()=>UI.date,
 tx:s=>s,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
 toast:s=>messages.push(s),renderModal:()=>rendered.push(UI.modal),saveFile:(name,blob)=>files.push({name,blob}),
 HTMLElement:class{},document:{activeElement:null,body:{}},$:()=>({innerHTML:''}),maybeReload:()=>{},requestAnimationFrame:cb=>cb()};
 if(mode==='unavailable')delete c.navigator.clipboard;
 if(mode==='missing-write')c.navigator.clipboard={};
 vm.createContext(c);vm.runInContext(code,c);
 return {c,S,UI,messages,writes,files,rendered,pending};
}
for(const action of ['x-copy-day','x-copy-all']){
 for(const mode of ['resolved','rejected','throw','unavailable','missing-write'])test(action+' '+mode+' feedback preserves source and exact captured payload',async()=>{
  const f=setup(mode),before=JSON.stringify(f.S),expected=action==='x-copy-day'?f.c.dayTSV():(f.c.rowsTSV?f.c.rowsTSV(f.c.allRows()):f.c.allRows().map(r=>r.join('\t')).join('\n'));
  const p=f.c.actions[action]();assert.equal(f.messages.length,0,'no success before settlement');await p;
  assert.equal(JSON.stringify(f.S),before);
  if(!['unavailable','missing-write'].includes(mode))assert.deepEqual(f.writes,[expected]);
  if(mode==='resolved'){assert.equal(f.messages.length,1);assert.equal(f.UI.modal.t,'export');}
  else{assert.equal(f.messages.length,0);assert.equal(f.UI.modal.t,'copybox');assert.equal(f.UI.modal.text,expected);}
 });
 for(const outcome of ['resolve','reject'])test(action+' deferred '+outcome+' retains click-time data and scope',async()=>{
  const f=setup(),p=f.c.actions[action](),expected=f.writes[0];assert.equal(f.messages.length,0);assert.equal(f.UI.modal.t,'export');
  f.UI.date='2026-11-10';f.UI.factory=2;f.S.employees[0].name='Changed';const before=JSON.stringify(f.S);
  f.pending[0][outcome](outcome==='reject'?new Error('NotAllowedError'):undefined);await p;
  assert.equal(f.writes[0],expected);assert.ok(expected.includes('Alice'));assert.equal(JSON.stringify(f.S),before);
  if(outcome==='reject')assert.equal(f.UI.modal.text,expected);else assert.equal(f.messages.length,1);
 });
 test(action+' late success does not replace newer modal',async()=>{
  const f=setup(),p=f.c.actions[action]();f.c.closeModal();const newer={t:'help'};f.c.openModal(newer);f.pending[0].resolve();await p;assert.equal(f.UI.modal,newer);assert.equal(f.messages.length,0);
 });
 for(const outcome of ['reject','resolve'])test(action+' stale '+outcome+' preserves a newer actual plan calculation',async()=>{
  const f=setup(),p=f.c.actions[action]();f.c.closeModal();const newer={t:'auto'};f.c.openModal(newer);
  let finishHealth,signal,solverCalls=0;
  f.c.SOLVER.check=options=>{signal=options.signal;return new Promise(resolve=>finishHealth=resolve);};
  f.c.openPlansSolver=async()=>{solverCalls++;};
  const plan=f.c.openPlans('Auto','Auto','auto',()=>{},[],{event:{type:'auto'}}),job=f.c.planCalculationJob;
  assert.equal(job.modal,newer);assert.equal(newer.planBusy,true);assert.equal(signal.aborted,false);
  const before=JSON.stringify(f.S),messageCount=f.messages.length;
  f.pending[0][outcome](outcome==='reject'?new Error('NotAllowedError'):undefined);await p;
  assert.equal(f.UI.modal,newer);assert.equal(signal.aborted,false);assert.equal(newer.planBusy,true);
  assert.equal(f.c.planCalculationJob,job);assert.equal(JSON.stringify(f.S),before);assert.equal(f.messages.length,messageCount);
  f.c.SOLVER.up=true;finishHealth();await plan;assert.equal(solverCalls,1);assert.equal(f.c.planCalculationJob,null);
 });
 for(const outcome of ['reject','resolve'])test(action+' stale '+outcome+' cannot reopen or acknowledge a closed flow',async()=>{
  const f=setup(),p=f.c.actions[action]();f.c.closeModal();f.pending[0][outcome](new Error('NotAllowedError'));await p;
  assert.equal(f.UI.modal,null);assert.equal(f.messages.length,0);
 });
}
test('earlier copy rejection cannot replace fallback for newer copied content',async()=>{
 const f=setup(),first=f.c.actions['x-copy-day']();f.S.employees[0].name='New name';const second=f.c.actions['x-copy-all']();
 f.pending[1].reject(new Error('NotAllowedError'));await second;assert.equal(f.UI.modal.text,f.writes[1]);
 f.pending[0].reject(new Error('NotAllowedError'));await first;assert.equal(f.UI.modal.text,f.writes[1]);assert.notEqual(f.writes[0],f.writes[1]);
});
test('manual fallback escapes payload rather than executing markup',async()=>{
 const f=setup('rejected');const text='</textarea><img src=x onerror=alert(1)>\t"literal"\nsecond';await f.c.copyText(text);const html=f.c.MODALS.copybox(f.UI.modal).body;
 assert.ok(html.includes('&lt;/textarea&gt;&lt;img'));assert.ok(!html.includes('<img'));assert.equal(f.UI.modal.text,text);
});
test('CSV download control captures bytes synchronously and never uses clipboard or success toast',async()=>{
 const f=setup(),p=f.c.actions['x-dl']();assert.equal(f.files.length,1);f.S.employees[0].name='Changed';await p;
 assert.ok((await f.files[0].blob.text()).includes('Alice'));assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);assert.equal(f.UI.modal.t,'export');
});

for(const transition of ['store','user','epoch','same-user-reauth'])for(const outcome of ['resolve','reject'])test(transition+' transition silences stale '+outcome,async()=>{
 const f=setup(),p=f.c.actions['x-copy-day'](),modal=f.UI.modal;
 if(transition==='store')f.c.STORE={...f.c.STORE};
 if(transition==='user')f.c.STORE.session.user.id='B';
 if(transition==='epoch')f.c.STORE.authEpoch++;
 if(transition==='same-user-reauth'){f.c.STORE.session=null;f.c.STORE.authEpoch++;f.c.STORE.session={user:{id:'A'}};}
 f.pending[0][outcome](new Error('NotAllowedError'));await p;assert.equal(f.UI.modal,modal);assert.equal(f.messages.length,0);
});
for(const outcome of ['resolve','reject'])test('same modal object reopened has a new lifetime: '+outcome,async()=>{
 const f=setup(),modal=f.UI.modal,p=f.c.actions['x-copy-day']();f.c.closeModal();f.c.openModal(modal);
 f.pending[0][outcome](new Error('NotAllowedError'));await p;assert.equal(f.UI.modal,modal);assert.equal(f.messages.length,0);
});
for(const firstAction of ['x-copy-day','x-copy-all'])for(const firstOutcome of ['resolve','reject'])test(firstAction+' older '+firstOutcome+' is silent while newer request is pending',async()=>{
 const f=setup(),first=f.c.actions[firstAction](),second=f.c.actions[firstAction==='x-copy-day'?'x-copy-all':'x-copy-day']();
 f.pending[0][firstOutcome](new Error('NotAllowedError'));await first;assert.equal(f.UI.modal.t,'export');assert.equal(f.messages.length,0);
 f.pending[1].reject(new Error('NotAllowedError'));await second;assert.equal(f.UI.modal.text,f.writes[1]);
});
test('unrelated data refresh and same-modal render retain active ownership',async()=>{
 const f=setup(),p=f.c.actions['x-copy-all'](),text=f.writes[0];f.c.S=structuredClone(f.S);f.c.STORE.version++;f.c.renderModal();
 f.pending[0].reject(new Error('NotAllowedError'));await p;assert.equal(f.UI.modal.text,text);
});

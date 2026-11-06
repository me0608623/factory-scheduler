import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {capturePreviewContext,restorePreviewContext} from '../src/preview-context.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const helpers=between('function samePreviewState(','function manualDrawerHTML(');
const rendering=between('function diffOf(','function fmtDelta(')+between('function pvSummary(','function peopleOf(')+between('function pvPanelHTML(','let planCalculationJob=');
const applying=between('async function pvApply(){','\nObject.assign(MODAL_ACT,{');
const base=()=>({blocks:[{id:'b1',oid:'o1',step:0,date:'2026-10-23',s:480,e:540,m:'m1',emp:'e1',qty:10,pin:true}],employees:[{id:'e1',name:'A',active:true}],cal:{week:[1,2,3,4,5]},machines:[],orders:[],log:[]});
function harness({kind='auto',cloud=false,changes=[()=>{}]}={}){
  const B=base(),events=[];
  const opts=changes.map((change,i)=>{const A=structuredClone(B);change(A);return {id:String(i),name:'方案 '+i,A,state:JSON.stringify(A),applicable:true,diagnostics:[],best:i===0,desc:'',lines:[],mt:{shifts:[],lateCodes:[],otH:0,moved:0,otherDays:0}};});
  const ctx={S:structuredClone(B),PV:{kind,B,base:JSON.stringify(B),opts,cur:'0',mode:'cmp',tab:'gantt',title:'自動排程',note:'',engine:'瀏覽器',previewId:cloud?'preview':null},
    UI:{date:'2026-10-23'},SAMPLE:null,STORE:{kind:cloud?'supabase':'local',applyPlan:async()=>{events.push('rpc');}},
    keyB:b=>[b.oid,b.step,b.date,b.s,b.e,b.m,b.emp].join('|'),esc:String,tx:(s,p)=>s.replace(/\{(\w+)\}/g,(m,k)=>p?.[k]??m),md:x=>x,WD:['日','一','二','三','四','五','六'],parseD:x=>new Date(x),
    planCardMetrics:()=>({late:0,people:0,ot:false}),planEngineLabel:()=> '瀏覽器',ganttHTML:()=>'<div>時間比較</div>',peopleHTML:()=>'<div>人員比較</div>',resultHTML:()=>'',rerunHTML:()=>'',emp:()=>({name:'A'}),
    canPermissionRaw:()=>true,assertExecutionProtected:()=>{},$:()=>null,toast:s=>events.push(s),render:()=>events.push('render'),
    peopleOf:()=>[],pushUndo:()=>events.push('undo'),commit:async()=>{ctx.S.log.push({kind});events.push('commit');return true;},reloadFromStore:async()=>{events.push('reload');return 'applied';},showResult:()=>events.push('result')};
  ctx.pvOpt=()=>ctx.PV?.opts.find(o=>o.id===ctx.PV.cur);
  ctx.withState=(state,fn)=>fn();
  vm.createContext(ctx);vm.runInContext(helpers+rendering+applying,ctx);
  return {ctx,events,html:()=>ctx.pvPanelHTML(ctx.pvOpt())};
}

test('all unchanged automatic options render one result and Return without comparison or apply',()=>{
  const h=harness({changes:[()=>{},()=>{},()=>{}]}),html=h.html();
  assert.equal((html.match(/目前班表無需調整/g)||[]).length,1);
  assert.match(html,/返回班表/);
  assert.match(html,/data-act="pv-cancel"/);
  assert.doesNotMatch(html,/data-act="pv-(pick|apply|mode|ai)"|系統推薦|方案比較/);
});

test('a selected unchanged mixed option is marked and offers Return in both action areas',()=>{
  const h=harness({changes:[()=>{},A=>{A.blocks[0].s+=30;}]});
  assert.match(h.html(),/方案比較/);assert.match(h.html(),/無需調整/);
  assert.doesNotMatch(h.html(),/data-act="pv-apply"/);
  h.ctx.PV.cur='1';assert.match(h.html(),/data-act="pv-apply"/);
});

test('invalid equal options keep diagnostics and cannot become a successful no-change result',async()=>{
  const h=harness();h.ctx.PV.opts[0].applicable=false;h.ctx.PV.opts[0].diagnostics=['受保護工作無法調整'];
  const html=h.html();assert.match(html,/受保護工作無法調整/);assert.match(html,/不可套用/);
  assert.doesNotMatch(html,/目前班表無需調整/);
  assert.doesNotMatch(html,/另有資料調整/);
  await h.ctx.pvApply();assert.match(h.events.join(' '),/尚無法套用/);assert.ok(!h.events.includes('commit'));
});

for(const cloud of [false,true]){
  test(`${cloud?'cloud':'local'} unchanged direct apply has no write, log, undo, refresh or success`,async()=>{
    const h=harness({cloud}),state=JSON.stringify(h.ctx.S);
    await h.ctx.pvApply();
    assert.deepEqual(h.events.filter(x=>['rpc','commit','undo','reload','result'].includes(x)),[]);
    assert.equal(JSON.stringify(h.ctx.S),state);
  });
  for(const [name,change] of Object.entries({quantity:A=>{A.blocks[0].qty++;},pin:A=>{A.blocks[0].pin=false;},calendar:A=>{A.cal.week.pop();},employee:A=>{A.employees[0].active=false;},id:A=>{A.blocks[0].id='b2';},arrayOrder:A=>{A.cal.week.reverse();},newField:A=>{A.newField=true;}})){
    test(`${cloud?'cloud':'local'} ${name}-only change remains actionable and explains unchanged placement`,async()=>{
      const h=harness({cloud,changes:[change]});
      assert.match(h.html(),/data-act="pv-apply"/);
      assert.match(h.html(),/時間與人機安排不變，另有資料調整/);
      await h.ctx.pvApply();assert.ok(h.events.includes(cloud?'rpc':'commit'));
    });
  }
}

test('object key insertion order does not create a change',async()=>{
  const h=harness();const o=h.ctx.PV.opts[0];
  o.A=Object.fromEntries(Object.entries(o.A).reverse());o.A.blocks[0]=Object.fromEntries(Object.entries(o.A.blocks[0]).reverse());o.state=JSON.stringify(o.A);
  assert.match(h.html(),/目前班表無需調整/);await h.ctx.pvApply();assert.ok(!h.events.includes('commit'));
});

test('changed preview counts identify moved blocks only with preserved unique identities',()=>{
  const h=harness({changes:[A=>{A.blocks[0].date='2026-10-24';A.blocks.push({...A.blocks[0],id:'new',oid:'o2'});} ]});
  assert.match(h.html(),/新增 1 段.*搬動 1 段.*移除 0 段.*影響 2 天/);
  h.ctx.PV.opts[0].A.blocks[0].id='replacement';delete h.ctx.PV.opts[0].diff;
  assert.match(h.html(),/新增 2 段.*搬動 0 段.*移除 1 段/);
  h.ctx.PV.opts[0].A.blocks.forEach(b=>{b.id='b1';});delete h.ctx.PV.opts[0].diff;
  assert.match(h.html(),/新增 2 段.*搬動 0 段.*移除 1 段/);
});

test('unchanged incident, order, recovery and edit previews retain their existing apply behavior',async()=>{
  for(const kind of ['fault','leave','recover','order','edit']){
    const h=harness({kind});assert.match(h.html(),/data-act="pv-apply"/);assert.doesNotMatch(h.html(),/目前班表無需調整/);
    await h.ctx.pvApply();assert.ok(h.events.includes('commit'),kind);
  }
});

test('saved scenarios remain read-only comparisons even when their state is unchanged',async()=>{
  const h=harness();h.ctx.PV.savedScenario=true;
  assert.match(h.html(),/方案比較/);assert.doesNotMatch(h.html(),/目前班表無需調整|data-act="pv-apply"/);
  await h.ctx.pvApply();assert.deepEqual(h.events,[]);
});

test('pending, protected and invalid direct apply guards remain effective',async()=>{
  for(const guard of ['pending','protected','invalid']){
    const h=harness();
    if(guard==='pending')h.ctx.PV.applying=true;
    if(guard==='protected')h.ctx.assertExecutionProtected=()=>{throw new Error('Protected');};
    if(guard==='invalid')h.ctx.PV.opts[0].applicable=false;
    await h.ctx.pvApply();assert.ok(!h.events.includes('commit'));
    if(guard==='protected')assert.ok(h.events.includes('Protected'));
  }
});

test('unchanged local apply still rejects revoked permission and a stale base',async()=>{
  for(const guard of ['permission','stale']){
    const h=harness();
    if(guard==='permission')h.ctx.canPermissionRaw=()=>false;
    if(guard==='stale')h.ctx.S.blocks[0].qty++;
    const state=JSON.stringify(h.ctx.S);
    await h.ctx.pvApply();assert.equal(JSON.stringify(h.ctx.S),state);
    assert.match(h.events.join(' '),guard==='permission'?/沒有修改排程的權限/:/排程已更新/);
    assert.ok(!h.events.includes('commit')&&!h.events.includes('undo'));
  }
});

test('Return from unchanged preview restores navigation without changing schedule or writing',()=>{
  const h=harness(),initial={date:'2026-10-01',factory:2,view:'week',focus:{type:'order',id:'o1'}};
  h.ctx.PV.returnContext=capturePreviewContext(initial);
  Object.assign(h.ctx,{MODAL_ACT:{},restorePreviewContext,setFactory:()=>{},maybeReload:()=>{}});
  const cancel=between('  "pv-cancel":','\n  // -----');
  vm.runInContext('Object.assign(MODAL_ACT,{'+cancel+'});',h.ctx);
  const state=JSON.stringify(h.ctx.S);
  h.ctx.MODAL_ACT['pv-cancel']();
  assert.equal(h.ctx.PV,null);assert.deepEqual(h.ctx.UI,initial);
  assert.equal(JSON.stringify(h.ctx.S),state);
  assert.ok(!h.events.includes('commit')&&!h.events.includes('undo'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {chatContext,answerFromFacts} from '../src/chat-context.js';
import {I18N,tx} from '../src/i18n.js';

const source=readFileSync(new URL('../src/chat-ui.js',import.meta.url),'utf8');
const solverSource=readFileSync(new URL('../src/solver.js',import.meta.url),'utf8');
const day='2026-11-07',languages=['zh-TW','en','vi','th'];
const shortcuts=[
  ['目前排程有哪些問題？',['alert','execution_alert','fault','deadline','material']],
  ['誰請假？',['leave','alert']],
  ['哪些機台故障？',['fault']],
  ['輪班人力缺口',['roster','alert']],
  ['跨廠流轉進度',['transfer','material','deadline']],
  ['特別趕貨欠什麼？',['rush','material']],
];
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function snapshot(faultCount=1){
  return {version:7,employees:[{id:'e',name:'測試甲員',factory:1,leaves:[day]}],
    machines:Array.from({length:faultCount},(_,i)=>({id:'m'+i,label:'故障機台'+i,factory:1,faults:[{date:day,start:480,end:540}]})),
    blocks:[],orders:[],work_assignments:[],setup_pending:true,
    staff_rosters:[{id:'r',name:'輪班草稿',factory:1,status:'draft',
      shifts:[{id:'s',name:'日班',segments:[[480,720]]}],positions:[{id:'p',name:'檢查',rate:null}],cells:[],
      demands:[{date:day,shiftId:'s',positionId:'p',people:2,target:20}]}],
    transfer_orders:[{id:'t',code:'X01',itemCode:'料件',fromFactory:1,toFactory:2,returnFactory:1,
      totalQty:20,urgentQty:0,status:'active',due:'2026-11-06',workIds:[],batches:[],events:[]}],
    rush_orders:[{id:'rush',f1:{shipDate:day,vendor:'趕貨廠商',desc:'趕貨零件',shortQty:5},f2:{}}]};
}

// Minimal DOM/transport model. The complete installed module, actual button
// bindings, translations, query projection, answer selection and SOLVER run.
// No browser, microphone, speech synthesis or external service is invoked.
function element(tag='div'){
  let content='';
  return {tag,style:{},dataset:{},children:[],attributes:{},value:'',disabled:false,hidden:false,
    classList:{toggle(){},remove(){},add(){}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},focus(){},
    append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}},
    remove(){if(this.parentElement){const a=this.parentElement.children;a.splice(a.indexOf(this),1);}this.parentElement=null;},
    replaceChildren(){this.children=[];content='';},querySelectorAll(){return [];},
    get firstElementChild(){return this.children[0];},get scrollHeight(){return this.children.length;},
    getClientRects:()=>[{}],offsetWidth:150,offsetHeight:52,
    get textContent(){return content+this.children.map(c=>c.textContent).join('');},
    set textContent(v){content=String(v);this.children=[];},
    get innerHTML(){return content;},set innerHTML(v){this.textContent=v;},
  };
}
function fixture({lang='zh-TW',local=true,raw=snapshot()}={}){
  I18N.lang=lang;
  const nodes=new Map(['.chat-launch','.chat-panel','.chat-log','textarea','[type="submit"]','.chat-tts',
    '.chat-clear','.chat-close','form','.chat-panel header strong'].map(s=>[s,element()]));
  const quick=[],root=element('aside');
  // Read the initial button labels from the module's real rendered markup,
  // rather than seeding them with a parallel copy of the shortcut list.
  Object.defineProperty(root,'innerHTML',{set(html){
    const quickHTML=html.match(/<div class="chat-quick">([\s\S]*?)<\/div>/)[1];
    for(const [,label] of quickHTML.matchAll(/<button[^>]*>([^<]*)<\/button>/g)){
      const button=element('button');button.textContent=label;quick.push(button);
    }
  }});
  root.querySelector=s=>nodes.get(s);root.querySelectorAll=s=>s==='.chat-quick button'?quick:[];
  nodes.get('.chat-panel').querySelector=()=>element('header');
  const queries=[],answers=[],requests=[],timers=[];
  const env={I18N,tx,document:{body:element('body'),createElement:t=>t==='aside'?root:element(t),querySelector:()=>null},
    window:{matchMedia:()=>({matches:true})},innerWidth:1024,innerHeight:800,
    localStorage:{getItem:()=>null},addEventListener(){},floatWindow:()=>({state:{geom:{}}}),
    chatContext:(raw,view)=>{const context=chatContext(raw,view);queries.push({question:view.question,context});return context;},
    answerFromFacts:(question,context)=>{const result=answerFromFacts(question,context);answers.push({question,result});return result;},
    AbortController,setTimeout:fn=>{timers.push(fn);return fn;},clearTimeout(){},
    RUNTIME:{mode:'synthetic',solverUrl:'https://synthetic.invalid',solverKey:''},
    fetch:async(url,options)=>{
      const body=JSON.parse(options.body);requests.push({url,options,body});
      const context=chatContext(raw,body);
      return {ok:true,json:async()=>({...answerFromFacts(body.question,context),context})};
    }};
  vm.createContext(env);
  vm.runInContext(solverSource.replace(/^import .*;\r?\n/gm,'').replace('export const SOLVER','var SOLVER'),env);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function','function'),env);
  const store={kind:local?'local':'supabase',jwt:()=> 'SYNTHETIC-TOKEN'};
  const chat=env.installScheduleChat({snapshot:()=>raw,view:()=>({date:day,factory:1}),store:()=>store,enabled:()=>true,stamp:()=> 'unchanged'});
  return {chat,quick,nodes,queries,answers,requests,raw,
    messages:who=>nodes.get('.chat-log').children.filter(e=>e.className==='chat-message '+who),
    submit(question){nodes.get('textarea').value=question;nodes.get('form').onsubmit({preventDefault(){}});},
    clear(){nodes.get('.chat-clear').onclick();},
    switchLanguage(lang){I18N.lang=lang;chat.refresh();}};
}

for(const lang of languages)for(const [index,[canonical,kinds]] of shortcuts.entries()){
  test(`local shortcut ${index+1} in ${lang} retains topic and translated display`,()=>{
    const f=fixture({lang}),before=structuredClone(f.raw),label=tx(canonical);
    assert.equal(f.quick.length,6);assert.equal(f.quick[index].textContent,label);
    f.quick[index].onclick();
    assert.equal(f.messages('user')[0].textContent,label);
    assert.equal(f.queries[0].question,canonical);
    assert.equal(f.answers[0].question,canonical);
    const {context}=f.queries[0],{result}=f.answers[0];
    assert.ok(context.facts.every(f=>f.kind==='summary'||kinds.includes(f.kind)));
    assert.ok(result.citations.length>0);
    assert.ok(result.citations.every(id=>kinds.includes(context.facts.find(f=>f.id===id).kind)));
    assert.deepEqual(f.raw,before);assert.equal(f.requests.length,0);
  });
  test(`cloud shortcut ${index+1} in ${lang} sends existing canonical query contract`,async()=>{
    const f=fixture({lang,local:false}),label=tx(canonical);
    assert.equal(f.quick[index].textContent,label);f.quick[index].onclick();await flush();
    assert.equal(f.messages('user')[0].textContent,label);
    assert.equal(f.requests.length,1);const {url,options,body}=f.requests[0];
    assert.equal(url,'https://synthetic.invalid/chat/db');
    assert.equal(options.headers.Authorization,'Bearer SYNTHETIC-TOKEN');
    assert.deepEqual(body,{question:canonical,date:day,end_date:day,factory:1,generate:false,history:[]});
    assert.equal(f.nodes.get('[type="submit"]').disabled,false);
  });
}

for(const lang of languages)test(`leave shortcut in ${lang} keeps known leave beyond unrelated context and answer limits`,()=>{
  const raw=snapshot(120),generic=chatContext(raw,{date:day,factory:1,question:'overview'});
  assert.equal(generic.truncated,true);assert.equal(generic.facts.length,100);
  assert.ok(!generic.facts.some(f=>f.kind==='leave'));
  const f=fixture({lang,raw});f.quick[1].onclick();
  const {context}=f.queries[0];assert.equal(context.truncated,false);
  assert.ok(context.totalAvailableFacts>100);assert.ok(context.facts.some(f=>f.kind==='leave'));
  assert.match(f.answers[0].result.answer,/測試甲員.*已登記請假/);
  assert.doesNotMatch(f.answers[0].result.answer,/故障機台/);
  assert.match(f.messages('assistant')[0].textContent,/測試甲員.*已登記請假/);
});

test('shortcut answer truncation stays explicit for more than twelve matching leave facts',()=>{
  const raw=snapshot(120);raw.employees=Array.from({length:20},(_,i)=>({id:'e'+i,name:'請假員工'+i,factory:1,leaves:[day]}));
  const f=fixture({lang:'en',raw});f.quick[1].onclick();
  assert.equal(f.answers[0].result.answerTruncated,true);assert.equal(f.answers[0].result.citations.length,12);
  assert.match(f.nodes.get('.chat-log').textContent,/畫面先列出 12 筆/);
  assert.doesNotMatch(f.answers[0].result.answer,/故障機台/);
});

for(const local of [true,false])test(`${local?'local':'cloud'} shortcuts keep intent after repeated language switches`,async()=>{
  const f=fixture({local});
  for(const lang of [...languages,'en','zh-TW']){
    f.switchLanguage(lang);
    for(const [index,[canonical]] of shortcuts.entries()){
      const label=tx(canonical);assert.equal(f.quick[index].textContent,label);
      f.quick[index].onclick();await flush();
      assert.equal(f.messages('user').at(-1).textContent,label);
      assert.equal(local?f.queries.at(-1).question:f.requests.at(-1).body.question,canonical);
      f.clear();
    }
  }
});

for(const lang of languages)for(const local of [true,false])test(`${local?'local':'cloud'} free text in ${lang} is not rewritten, even when it matches a shortcut label`,async()=>{
  const f=fixture({lang,local});
  const questions=['ordinary free text Alice 123',...shortcuts.map(([canonical])=>tx(canonical))];
  for(const question of questions){
    f.submit('  '+question+'  ');await flush();
    assert.equal(f.messages('user').at(-1).textContent,question);
    if(local){assert.equal(f.queries.at(-1).question,question);assert.equal(f.answers.at(-1).question,question);}
    else assert.equal(f.requests.at(-1).body.question,question);
    f.clear();
  }
});

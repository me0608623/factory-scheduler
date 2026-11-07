// Actual installed chat, transport, float helpers and app lifecycle with synthetic DOM/auth/audio.
// No network, microphone permission, speech output, or real account operation is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const tree=process.env.CHAT_OWNER_TREE?resolve(process.env.CHAT_OWNER_TREE):fileURLToPath(new URL('../..',import.meta.url));
const source=n=>readFileSync(tree+'/web/src/'+n,'utf8');
const mod=n=>import(pathToFileURL(tree+'/web/src/'+n).href);
const {chatContext,answerFromFacts}=await mod('chat-context.js');
const {scenarioKey}=await mod('scenarios.js');
const {toSnapshot}=await mod('convert.js');
const {tx,I18N}=await mod('i18n.js');
const chatSource=source('chat-ui.js'),appSource=source('app.js');
const day='2026-11-07';
const state=()=>({version:1,employees:[{id:'e',name:'測試甲員',skills:[],leaves:[day],factory:1}],machines:[],products:[],orders:[],blocks:[],cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{},execution:[],holidays:{}});
const account=id=>({kind:'supabase',sb:{},session:{user:{id}},authEpoch:1,jwt:()=> 'SYNTHETIC-'+id});
const answer=(label='SYNTHETIC ANSWER')=>({engine:'資料查詢（非生成式 AI）',answer:label,citations:[],context:{date:day,endDate:day,version:1,facts:[]}});
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
const recognized=txt=>({results:[{0:{transcript:txt},isFinal:true}]});
function events(x){
  x.events=new Map();
  x.addEventListener=(k,fn,opts={})=>{if(opts.signal?.aborted)return;const set=x.events.get(k)||new Set();x.events.set(k,set);set.add(fn);opts.signal?.addEventListener('abort',()=>set.delete(fn),{once:true});};
  x.removeEventListener=(k,fn)=>x.events.get(k)?.delete(fn);
  x.dispatchEvent=e=>{for(const fn of [...x.events.get(e.type)||[]])fn(e);};
  return x;
}
class El{
  constructor(tag='div'){
    Object.assign(this,{tag,style:{cssText:''},dataset:{},attributes:{},children:[],hidden:false,value:'',disabled:false,content:'',parentElement:null,offsetWidth:150,offsetHeight:52});
    this.classList={toggle(){},remove(){},add(){}};events(this);
  }
  setAttribute(k,v){this.attributes[k]=v;}
  getClientRects(){return this.parentElement?[{}]:[];}
  getBoundingClientRect(){return {x:900,y:600,width:150,height:52};}
  get isConnected(){return !!this.parentElement;}
  append(...nodes){for(const n of nodes){n.remove?.();n.parentElement=this;this.children.push(n);}}
  appendChild(n){this.append(n);}
  prepend(n){n.remove?.();n.parentElement=this;this.children.unshift(n);}
  remove(){if(this.parentElement){const a=this.parentElement.children;a.splice(a.indexOf(this),1);}this.parentElement=null;}
  replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this.content='';this.append(...nodes);}
  focus(){this.focused=true;}
  click(){this.onclick?.();this.dispatchEvent({type:'click'});}
  before(n){this.insertedBefore=n;}
  querySelector(){return null;}
  querySelectorAll(s){return this.children.filter(c=>s==='.chat-speak'&&c.className==='btn chat-speak');}
  get firstElementChild(){return this.children[0];}
  get scrollHeight(){return this.children.length;}
  set textContent(v){this.replaceChildren();this.content=String(v);}
  get textContent(){return this.content+this.children.map(c=>c.textContent).join('');}
  set innerHTML(v){this.textContent=v;}
  get innerHTML(){return this.content;}
}
function fixture({local=false,speech=false,tts=false,mobile=true}={}){
  I18N.lang='zh-TW';let S=state(),STORE=account('A'),allowed=true,mount=new El(),failSpeechStart=false;
  if(local)STORE.kind='local';
  const UI={date:day,factory:1,tv:false},installs=[],requests=[],timers=[],recognizers=[],speaks=[],cancellations=[],loginNodes=new Map();
  function createAside(){
    const nodes=new Map(['.chat-launch','.chat-panel','.chat-log','textarea','[type="submit"]','.chat-tts','.chat-clear','.chat-close','form','.chat-panel header strong'].map(s=>[s,new El()]));
    const root=new El('aside'),panel=nodes.get('.chat-panel'),head=new El('header');panel.hidden=true;
    const quick=['目前排程有哪些問題？','誰請假？','哪些機台故障？','輪班人力缺口','跨廠流轉進度','特別趕貨欠什麼？'].map(q=>{const b=new El('button');b.textContent=q;return b;});
    root.querySelector=s=>nodes.get(s)||null;root.querySelectorAll=s=>s==='.chat-quick button'?quick:[];
    panel.querySelector=s=>s==='header'?head:null;
    const i={root,nodes,panel,head,quick,answers:()=>nodes.get('.chat-log').children.filter(c=>c.className==='chat-message assistant').map(c=>c.textContent),send(q){nodes.get('textarea').value=q;nodes.get('form').onsubmit({preventDefault(){}});},mic:()=>nodes.get('[type="submit"]').insertedBefore};
    installs.push(i);return root;
  }
  const document={body:new El('body'),createElement:t=>t==='aside'?createAside():new El(t),querySelector:s=>s==='.schedule-chat-slot'?mount:null,getElementById:s=>new El(s)};
  const window=events({matchMedia:()=>({matches:mobile})});
  if(tts)window.speechSynthesis={getVoices:()=>[],cancel:()=>cancellations.push('cancel'),speak:u=>speaks.push(u)};
  if(speech)window.SpeechRecognition=class {constructor(){recognizers.push(this);}start(){if(failSpeechStart)throw new Error('synthetic permission refusal');this.onstart?.();}stop(){this.stopped=true;this.onend?.();}abort(){this.aborted=true;this.onend?.();}};
  const env={document,window,Element:El,innerWidth:1024,innerHeight:800,localStorage:{getItem:k=>k==='fsched-chat-tts'&&tts?'1':null,setItem(){}},
    I18N,tx,chatContext,answerFromFacts,scenarioKey,toSnapshot,structuredClone,AbortController,
    setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cleared=true;},addEventListener:window.addEventListener,removeEventListener:window.removeEventListener,
    SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},PointerEvent:class {constructor(type,p){Object.assign(this,{type},p);}},
    RUNTIME:{mode:'synthetic',solverUrl:'https://synthetic.invalid',solverKey:''},
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,body:JSON.parse(options.body),resolve:j=>resolve({ok:true,json:async()=>j}),reject}))};
  vm.createContext(env);
  for(const file of ['solver.js','win.js','chat-ui.js'])vm.runInContext(source(file).replace(/^import .*;\r?\n/gm,'').replaceAll('export const ','var ').replaceAll('export function ','function '),env);
  Object.defineProperties(env,{S:{get:()=>S,set:v=>S=v},STORE:{get:()=>STORE,set:v=>STORE=v}});env.UI=UI;env.HOLI={};env.canPermission=()=>allowed;
  const call=appSource.match(/scheduleChat=installScheduleChat\(\{snapshot:[^\n]+?\}\);/)[0];
  vm.runInContext('var scheduleChat;'+call,env);
  const f={env,document,window,installs,requests,timers,recognizers,speaks,cancellations,UI,initial:installs[0],
    get chat(){return env.scheduleChat;},get S(){return S;},set S(v){S=v;},get store(){return STORE;},set store(v){STORE=v;},
    setAllowed(v){allowed=v;},setSpeechFailure(v){failSpeechStart=v;},replaceMount(){mount=new El();env.scheduleChat?.refresh();return mount;},
    runTimers(ms){for(const t of timers.filter(t=>!t.cleared&&t.ms===ms)){t.cleared=true;t.fn();}}
  };
  Object.assign(env,{stopLoginViz(){},normalizeState(){},loadPreferencesForDevice(){},loadFactory(){},render(){env.scheduleChat?.refresh();},flashReturnRow(){},tourDone:()=>true,readOnly:false,
    onRemoteChange(){},onRealtimeStatus(){},updateSyncChip(){},toast(){},setInterval(){},syncPending:0,SYNC:{state:'ok'},executionRetries:{has:()=>false},closeModal(){},
    ensureVisualStyles(){},environmentHTML:()=>'',liquidLogoSVG:()=>'',esc:v=>v,mountBackdrop(){},mountViz3D(){},
    $:s=>{if(!loginNodes.has(s))loginNodes.set(s,new El());return loginNodes.get(s);}});
  env.SOLVER.check=async()=>false;
  env.vizBg=null;
  for(const [begin,end] of [['async function start(){','const crossFactoryUI='],['function showLogin(err=','// ---------- 未排工作']]){
    const at=appSource.indexOf(begin);vm.runInContext(appSource.slice(at,appSource.indexOf(end,at)),env);
  }
  const at=appSource.indexOf('case "logout":(async a=>');vm.runInContext('function logoutTest(){switch("logout"){'+appSource.slice(at,appSource.indexOf('case "access":',at))+'}}',env);
  f.readyStore=()=>Object.assign(STORE,{init:async()=>({needLogin:false}),can:()=>true,load:async()=>S,subscribe(){}});
  return f;
}

test('destroy cancels queued voice, recognition callbacks, owned listeners, timers and float registration',()=>{
  const f=fixture({speech:true,mobile:false}),i=f.initial;i.mic().click();const rec=f.recognizers[0],late=rec.onresult;
  rec.onresult(recognized('誰請假？'));const queued=f.timers.find(t=>t.ms===200);assert.ok(queued);
  i.nodes.get('.chat-launch').click();f.window.dispatchEvent({type:'pointerup'});i.nodes.get('.chat-tts').click();
  f.chat.destroy();f.chat.destroy();f.store=account('B');late(recognized('old callback'));queued.fn();f.runTimers(200);f.chat.refresh();i.send('stale form');i.quick[0].click();i.mic().click();
  assert.equal(f.requests.length,0);assert.equal(i.root.parentElement,null);assert.equal(rec.aborted,true);assert.equal(rec.onresult,null);
  assert.ok(f.timers.every(t=>t.cleared));assert.equal([...f.window.events.values()].reduce((n,s)=>n+s.size,0),0);
  if(chatSource.includes('chatFloat=floatWindow('))assert.equal(vm.runInContext('floatWindow._s.has("fsched-float-chat:el")',f.env),false);
});

test('actual floating drag stops without writing or retaining global handlers when chat is destroyed',{skip:!chatSource.includes('chatFloat=floatWindow(')},()=>{
  const f=fixture({mobile:false}),i=f.initial;
  i.nodes.get('.chat-launch').dispatchEvent({type:'pointerdown',clientX:0,clientY:0,target:{closest:()=>null}});
  f.window.dispatchEvent({type:'pointermove',clientX:20,clientY:20});const top=i.root.style.top;
  f.chat.destroy();f.window.dispatchEvent({type:'pointermove',clientX:50,clientY:50});f.window.dispatchEvent({type:'pointerup'});
  assert.equal(i.root.style.top,top);assert.equal([...f.window.events.values()].reduce((n,s)=>n+s.size,0),0);
});

test('pending result and failures require unchanged store, client, user, epoch and enabled state',async()=>{
  for(const change of [f=>f.store=account('B'),f=>f.store.sb={},f=>f.store.session={user:{id:'B'}},f=>f.store.authEpoch++,f=>f.store.session=null,f=>f.setAllowed(false)])for(const reject of [false,true]){
    const f=fixture({tts:true}),i=f.initial;i.send('old owner');change(f);
    if(reject)f.requests[0].reject(new Error('STALE FAILURE'));else f.requests[0].resolve(answer('STALE ANSWER'));
    await flush();assert.doesNotMatch(i.answers().join(''),/STALE/);assert.equal(f.speaks.length,0);
    i.send('old form');assert.equal(f.requests.length,1);
  }
});

test('late recognition and queued voice cannot acquire a new owner or changed viewing scope',()=>{
  for(const queued of [false,true])for(const change of [f=>f.store=account('B'),f=>f.store.authEpoch++,f=>f.store.session=null,f=>f.setAllowed(false),f=>f.UI.factory=2,f=>f.UI.date='2026-11-08']){
    const f=fixture({speech:true}),i=f.initial;i.mic().click();const late=f.recognizers[0].onresult;
    if(queued)late(recognized('誰請假？'));change(f);if(!queued)late(recognized('誰請假？'));f.runTimers(200);
    assert.equal(f.requests.length,0);
  }
});

test('actual app start disposes before async initialization; old refresh never remounts; new owner can send',async()=>{
  const f=fixture({speech:true,tts:true}),old=f.initial,oldChat=f.chat;old.mic().click();const late=f.recognizers[0].onresult;
  f.store=account('B');f.readyStore();let resolveInit;f.store.init=()=>new Promise(resolve=>resolveInit=resolve);
  const starting=f.env.start();assert.equal(old.root.parentElement,null);late(recognized('old voice'));f.runTimers(200);oldChat.refresh();assert.equal(old.root.parentElement,null);
  assert.equal(f.requests.length,0);resolveInit({needLogin:false});await starting;await flush();
  const current=f.installs[1];assert.ok(current);oldChat.refresh();assert.equal(old.root.parentElement,null);
  current.send('new owner');assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.headers.Authorization,'Bearer SYNTHETIC-B');
  f.requests[0].resolve(answer('CURRENT'));await flush();assert.match(current.answers()[0],/CURRENT/);assert.deepEqual(f.speaks.map(s=>s.text),['CURRENT']);
  const cancels=f.cancellations.length;oldChat.destroy();assert.equal(f.cancellations.length,cancels,'old destroy must not cancel the new owner’s speech');
});

test('actual logout cancels chat before awaiting logout; pending answer never displays or speaks',async()=>{
  const f=fixture({speech:true,tts:true}),i=f.initial,old=f.chat;i.send('pending');let finish;
  f.store.logout=()=>new Promise(resolve=>finish=()=>{f.store.session=null;f.store.authEpoch++;f.setAllowed(false);resolve();});
  f.env.logoutTest();assert.equal(i.root.parentElement,null);assert.equal(f.chat,null);
  f.requests[0].resolve(answer('AFTER LOGOUT'));await flush();assert.doesNotMatch(i.answers()[0],/AFTER LOGOUT/);assert.equal(f.speaks.length,0);
  finish();await flush();old.refresh();assert.equal(i.root.parentElement,null);
});

test('login screen, need-login and failed start all dispose the previous chat',async()=>{
  for(const route of ['showLogin','needLogin','failure']){
    const f=fixture({speech:true}),old=f.initial;old.mic().click();f.readyStore();
    if(route==='showLogin')f.env.showLogin();else{f.store.init=async()=>{if(route==='failure')throw new Error('synthetic startup failure');return {needLogin:true};};if(route==='failure')await assert.rejects(f.env.start());else await f.env.start();}
    assert.equal(old.root.parentElement,null);assert.equal(f.chat,null);assert.equal(f.recognizers[0].aborted,true);
  }
});

test('blocked logout preserves chat; owned speech stops once when destroyed',async()=>{
  const f=fixture({tts:true}),i=f.initial;i.send('speak');f.requests[0].resolve(answer());await flush();assert.equal(f.speaks.length,1);
  f.env.syncPending=1;f.store.logout=()=>assert.fail('pending changes must block logout');f.env.logoutTest();assert.equal(f.chat!==null,true);assert.ok(i.root.parentElement);
  const cancels=f.cancellations.length;f.chat.destroy();f.chat.destroy();assert.equal(f.cancellations.length,cancels+1);assert.equal(f.speaks[0].onend,null);
});

test('clear invalidates recording and old completions without unlocking a newer request',async()=>{
  const f=fixture({speech:true}),i=f.initial;i.mic().click();const late=f.recognizers[0].onresult;late(recognized('old voice'));
  i.nodes.get('.chat-clear').click();i.nodes.get('textarea').value='new typing';f.runTimers(200);late(recognized('late voice'));assert.equal(f.requests.length,0);assert.equal(i.nodes.get('textarea').value,'new typing');
  i.send('first');i.nodes.get('.chat-clear').click();i.send('second');f.requests[0].resolve(answer('OLD'));await flush();assert.equal(i.nodes.get('[type="submit"]').disabled,true);assert.doesNotMatch(i.answers().join(''),/OLD/);
  f.requests[1].resolve(answer('NEW'));await flush();assert.match(i.answers()[0],/NEW/);assert.equal(i.nodes.get('[type="submit"]').disabled,false);
});

test('hide/reopen, rerender and token refresh retain current request; failures permit retry and translated idle text',async()=>{
  const f=fixture({tts:true}),i=f.initial;i.nodes.get('.chat-launch').click();i.send('same owner');i.send('duplicate');i.quick[2].click();assert.equal(f.requests.length,1);
  i.nodes.get('.chat-close').click();assert.equal(i.panel.hidden,true);f.replaceMount();i.nodes.get('.chat-launch').click();assert.equal(i.panel.hidden,false);
  f.store.session={...f.store.session,access_token:'REFRESHED'};f.store.jwt=()=> 'REFRESHED';I18N.lang='en';f.chat.refresh();
  f.requests[0].reject(new Error('synthetic timeout'));await flush();assert.match(i.answers()[0],/無法回答/);assert.equal(i.nodes.get('[type="submit"]').textContent,tx('送出'));
  i.send('retry');assert.equal(f.requests[1].options.headers.Authorization,'Bearer REFRESHED');f.requests[1].resolve(answer('RETRY'));await flush();assert.match(i.answers()[1],/RETRY/);
  assert.equal(f.requests[1].body.generate,false);assert.deepEqual(f.requests[1].body.history,[]);assert.ok(!('snapshot'in f.requests[1].body));
});

test('disabled refresh cancels voice and pending answer while allowing a fresh enabled query',async()=>{
  const f=fixture({speech:true,tts:true}),i=f.initial;i.send('pending');f.setAllowed(false);f.chat.refresh();assert.equal(i.root.hidden,true);
  f.setAllowed(true);f.chat.refresh();i.send('fresh');f.requests[0].resolve(answer('OLD'));await flush();assert.equal(i.nodes.get('[type="submit"]').disabled,true);assert.doesNotMatch(i.answers().join(''),/OLD/);
  f.requests[1].resolve(answer('FRESH'));await flush();assert.equal(i.root.hidden,false);assert.match(i.answers().join(''),/FRESH/);
});

test('voice errors, start failures and superseded recognition permit a fresh attempt',async()=>{
  const f=fixture({speech:true}),i=f.initial;f.setSpeechFailure(true);assert.doesNotThrow(()=>i.mic().click());f.setSpeechFailure(false);
  i.mic().click();const old=f.recognizers.at(-1),late=old.onresult;old.onerror();i.mic().click();late(recognized('STALE'));assert.equal(i.nodes.get('textarea').value,'');
  const rec=f.recognizers.at(-1);rec.onresult(recognized('CURRENT VOICE'));i.nodes.get('textarea').value='later typing';f.runTimers(200);
  assert.equal(f.requests.length,0);assert.equal(i.nodes.get('textarea').value,'later typing');
  i.mic().click();f.recognizers.at(-1).onresult(recognized('FRESH VOICE'));f.runTimers(200);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.question,'FRESH VOICE');f.requests[0].resolve(answer());await flush();
});

test('date/factory/schedule changes discard pending answer, unlike ordinary hide or remount',async()=>{
  for(const change of [f=>f.UI.date='2026-11-08',f=>f.UI.factory=2,f=>f.S.employees[0].name='Changed']){
    const f=fixture(),i=f.initial;i.send('question');change(f);f.chat.refresh();f.requests[0].resolve(answer('WRONG SCOPE'));await flush();assert.match(i.answers()[0],/結果已捨棄/);assert.doesNotMatch(i.answers()[0],/WRONG SCOPE/);
  }
});

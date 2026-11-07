import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/chat-ui.js',import.meta.url),'utf8');
function element(){
  return {style:{},children:[],attributes:{},classList:{toggle(){},remove(){}},
    setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},focus(){this.focused=true;},
    getClientRects(){return [{}];},append(child){child.parentElement=this;this.children.push(child);},
    prepend(child){child.parentElement=this;this.children.unshift(child);},remove(){this.parentElement=null;}};
}
function fixture(legacyPosition=null){
  let mount=element(),allowed=true;
  const nodes=new Map(['.chat-launch','.chat-panel','.chat-log','textarea','[type="submit"]','.chat-tts',
    '.chat-clear','.chat-close','form','.chat-panel header strong'].map(s=>[s,element()]));
  nodes.get('.chat-panel').hidden=true;
  const root=element();root.querySelector=s=>nodes.get(s);root.querySelectorAll=()=>[];
  const document={body:element(),createElement:()=>root,querySelector:s=>s==='.schedule-chat-slot'?mount:null};
  const env={document,window:{},localStorage:{getItem:key=>key==='fsched-float-chat'?legacyPosition:null},I18N:{lang:'zh-TW'},tx:x=>x};
  vm.createContext(env);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function','function'),env);
  const chat=env.installScheduleChat({snapshot:()=>({}),view:()=>({date:'2026-10-26'}),
    store:()=>({kind:'local'}),enabled:()=>allowed,stamp:()=> 'same'});
  return {root,nodes,chat,env,get mount(){return mount;},replaceMount(){mount=element();},setAllowed(v){allowed=v;}};
}

test('refresh docks the same chat root in replacement app slots and retains open conversation and draft',()=>{
  const f=fixture(),input=f.nodes.get('textarea'),panel=f.nodes.get('.chat-panel'),log=f.nodes.get('.chat-log');
  assert.equal(f.root.parentElement,f.mount);
  f.nodes.get('.chat-launch').onclick();
  input.value='Keep my draft';log.children.push({textContent:'Prior answer'});
  f.replaceMount();f.chat.refresh();
  assert.equal(f.root.parentElement,f.mount);
  assert.equal(panel.hidden,false);
  assert.equal(input.value,'Keep my draft');
  assert.equal(log.children[0].textContent,'Prior answer');
  f.nodes.get('.chat-close').onclick();
  assert.equal(panel.hidden,true);
  assert.equal(f.nodes.get('.chat-launch').focused,true);
});

test('refresh preserves permissions and translated launch labels after a dock replacement',()=>{
  const f=fixture();f.setAllowed(false);f.replaceMount();f.chat.refresh();
  assert.equal(f.root.hidden,true);
  f.setAllowed(true);f.env.I18N.lang='en';f.env.tx=x=>'translated '+x;f.chat.refresh();
  assert.equal(f.root.hidden,false);
  assert.equal(f.nodes.get('.chat-launch').textContent,'translated ✦ 排程助理');
  f.chat.destroy();assert.equal(f.root.parentElement,null);
});

test('legacy desktop floating coordinates cannot position the docked launcher offscreen',()=>{
  const f=fixture(JSON.stringify({x:9999,y:9999,w:400,h:550}));
  assert.equal(f.root.parentElement,f.mount);
  assert.equal(f.root.style.left,undefined);
  assert.equal(f.root.style.top,undefined);
  f.replaceMount();f.chat.refresh();
  assert.equal(f.root.parentElement,f.mount);
  assert.equal(f.root.style.left,undefined);
  assert.equal(f.root.style.top,undefined);
});

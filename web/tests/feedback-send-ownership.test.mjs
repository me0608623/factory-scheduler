import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Source-only loading: no application boot, Supabase construction, network, or real writes.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const slice=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,`${a} ... ${b}`);return source.slice(i,j);};
const loaded=[
  slice('const PV_BLOCK=', 'document.addEventListener("click",e=>{if(e.target.dataset?.actChange)'),
  slice('const MODAL_ACT={};','function ownsLegacyRequest('),
  ...(source.includes('function sizeBlockDetailModal(){')?[slice('function sizeBlockDetailModal(){','function renderModal(){')]:[]),
  slice('function renderModal(){','const RK='),
  'const MODALS={};',
  slice('const HELP=[','// 功能解說：'),
  slice('const FEEDBACK_CATS=','MODALS[\'leave-request\']'),
].join('\n');
const tick=()=>new Promise(r=>setImmediate(r));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Small modeled DOM. It parses the application's actual rendered markup and models
// connectedness, disabled native button clicks, bubbling, focus and innerHTML replacement.
// This is intentionally NOT a claim of browser E2E or layout coverage.
function fixture(){
  const requests=[],messages=[],frames=[],documentListeners={};let ctx;
  class Element {
    constructor(tag='div',attrs={}){this.tagName=tag.toLowerCase();this.attrs=attrs;this.children=[];this.parent=null;this.listeners={};this.scrollTop=0;this.value=attrs.value||'';this.disabled='disabled' in attrs;this.hidden='hidden' in attrs;this.dataset={};for(const [k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,s)=>s.toUpperCase())]=v;}
    get id(){return this.attrs.id||'';}set id(s){this.attrs.id=s;}
    get isConnected(){return this===doc.body||!!this.parent?.isConnected;}
    appendChild(el){el.parent=this;this.children.push(el);return el;}
    contains(el){return el===this||this.children.some(x=>x.contains(el));}
    matches(sel){
      if(sel===':disabled')return this.disabled;
      const not=[...sel.matchAll(/:not\(([^)]+)\)/g)].map(m=>m[1]);
      if(not.some(s=>this.matches(s)))return false;sel=sel.replace(/:not\([^)]+\)/g,'');
      const tag=sel.match(/^[a-zA-Z][\w-]*/)?.[0];if(tag&&this.tagName!==tag.toLowerCase())return false;
      const id=sel.match(/#([\w-]+)/)?.[1];if(id&&this.id!==id)return false;
      for(const m of sel.matchAll(/\.([\w-]+)/g))if(!(this.attrs.class||'').split(/\s+/).includes(m[1]))return false;
      for(const m of sel.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)){
        if(m[1]==='disabled'){if(!this.disabled)return false;continue;}
        if(!(m[1] in this.attrs)||(m[2]!==undefined&&this.attrs[m[1]]!==m[2]))return false;
      }return true;
    }
    closest(sel){return this.matches(sel)?this:this.parent?.closest(sel)||null;}
    querySelectorAll(sel){const selectors=sel.split(',');const out=[];const walk=el=>{for(const x of el.children){if(selectors.some(s=>x.matches(s.trim())))out.push(x);walk(x);}};walk(this);return out;}
    querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
    getClientRects(){return this.isConnected&&!this.hidden?[{}]:[];}
    focus(){doc.activeElement=this;} select(){}
    addEventListener(type,cb){(this.listeners[type]??=[]).push(cb);}
    click(){if(!this.isConnected||this.disabled)return false;const e={target:this};for(let el=this;el;el=el.parent)for(const cb of el.listeners.click||[])cb(e);for(const cb of documentListeners.click||[])cb(e);return true;}
    set innerHTML(html){
      for(const x of this.children)x.parent=null;this.children=[];this._html=html;
      const stack=[this],tokens=String(html).match(/<[^>]+>|[^<]+/g)||[];
      for(const token of tokens){
        if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
        if(token.startsWith('<')){
          const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const attrs={};
          const raw=token.slice(tag.length+1,-1);for(const m of raw.matchAll(/([^\s=/>]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g))attrs[m[1]]=m[2]??m[3]??m[4]??'';
          const el=new Element(tag,attrs);stack.at(-1).appendChild(el);if(!['input','br','img','hr','meta','link'].includes(tag)&&!token.endsWith('/>'))stack.push(el);
        }else if(stack.at(-1).tagName==='textarea')stack.at(-1).value+=token;
      }
      for(const select of this.querySelectorAll('select')){const option=select.querySelector('option[selected]')||select.querySelector('option');select.value=option?.attrs.value||'';}
    }
    get innerHTML(){return this._html||'';}
  }
  const doc={body:null,activeElement:null,createElement:tag=>new Element(tag),querySelector:sel=>doc.body.querySelector(sel),querySelectorAll:sel=>doc.body.querySelectorAll(sel),addEventListener:(type,cb)=>(documentListeners[type]??=[]).push(cb)};
  doc.body=new Element('body');doc.activeElement=doc.body;
  const root=doc.body.appendChild(new Element('div',{id:'modal-root'}));
  for(const act of ['feedback','feedback-list','help'])doc.body.appendChild(new Element('button',{'data-act':act}));
  const deferred=(kind,payload)=>new Promise((resolve,reject)=>requests.push({kind,payload,resolve,reject}));
  const client={from(table){assert.equal(table,'feedback');return {insert:row=>deferred('insert',structuredClone(row))};},rpc(name,args){assert.equal(name,'list_feedback');return deferred('list',{name,args});}};
  ctx={UI:{modal:null,view:'day'},STORE:{kind:'supabase',role:'boss',userName:'Synthetic owner',authEpoch:1,session:{user:{id:'synthetic-owner'}},sb:client},
    document:doc,HTMLElement:Element,CSS:{escape:x=>x},PV:null,location:{href:'https://synthetic.invalid/schedule',origin:'https://synthetic.invalid'},
    $:sel=>doc.querySelector(sel),tx:x=>x,esc,toast:m=>messages.push(m),cancelPlanCalculation(){},maybeReload(){},requestAnimationFrame:cb=>frames.push(cb),
    fetch(){throw new Error('NETWORK FORBIDDEN');},WebSocket:class{constructor(){throw new Error('NETWORK FORBIDDEN');}}};
  vm.createContext(ctx);vm.runInContext(loaded,ctx,{filename:'app.js'});
  const launcher=act=>doc.body.children.find(e=>e.dataset.act===act);
  const button=act=>root.querySelector(`[data-act="${act}"]`);
  const click=act=>{const el=button(act)||launcher(act);assert.ok(el,'rendered/launcher action '+act);return el.click();};
  const fill=(msg='First synthetic feedback',category='bug')=>{doc.querySelector('#fb-msg').value=msg;doc.querySelector('#fb-cat').value=category;};
  const open=()=>{click('feedback');assert.equal(ctx.UI.modal.t,'feedback');assert.ok(doc.querySelector('#fb-msg'));};
  const settle=async(index,outcome='success')=>{const r=requests[index];assert.ok(r);if(outcome==='thrown-error')r.reject(new Error('Synthetic old transport failure'));else r.resolve({error:outcome==='returned-error'?{message:'Synthetic old write failure'}:null,data:[]});await tick();};
  return {ctx,doc,root,requests,messages,client,click,button,fill,open,settle,frames};
}

test('current successful send snapshots payload, disables button and closes its own rendered modal',async()=>{
  const f=fixture();f.open();f.fill('  Current message  ','feature');const old=f.button('feedback-send');f.click('feedback-send');
  assert.equal(old.disabled,true);assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].payload,{author_name:'Synthetic owner',category:'feature',message:'Current message',page_url:'https://synthetic.invalid/schedule',user_id:'synthetic-owner'});
  f.fill('Edited after send','ux');
  assert.equal(f.requests[0].payload.message,'Current message');assert.equal(f.requests[0].payload.category,'feature');
  await f.settle(0);assert.equal(f.ctx.UI.modal,null);assert.equal(f.root.innerHTML,'');assert.equal(f.messages.length,1);assert.equal(f.messages[0],'感謝！意見已送出，我們會盡快處理。 到「更多功能→查看反饋」看全部。');assert.equal(old.disabled,false);
});
for(const outcome of ['returned-error','thrown-error'])test(`current ${outcome} retains text and permits retry`,async()=>{
  const f=fixture();f.open();f.fill();const m=f.ctx.UI.modal;f.click('feedback-send');await f.settle(0,outcome);
  assert.equal(f.ctx.UI.modal,m);assert.equal(f.doc.querySelector('#fb-msg').value,'First synthetic feedback');assert.equal(f.button('feedback-send').disabled,false);assert.deepEqual(f.messages,[outcome==='returned-error'?'Synthetic old write failure':'Synthetic old transport failure']);
  f.click('feedback-send');assert.equal(f.requests.length,2);await f.settle(1);assert.equal(f.ctx.UI.modal,null);
});
test('ordinary repeated click on disabled native send starts only one insert',async()=>{
  const f=fixture();f.open();f.fill();assert.equal(f.click('feedback-send'),true);assert.equal(f.click('feedback-send'),false);assert.equal(f.requests.length,1);await f.settle(0);
});
test('empty content and local demonstration mode do not attempt inserts',()=>{
  const f=fixture();f.open();f.fill('   ');f.click('feedback-send');assert.equal(f.requests.length,0);assert.deepEqual(f.messages,['請寫一些內容']);f.fill();f.ctx.STORE.kind='local';f.click('feedback-send');assert.equal(f.requests.length,0);assert.equal(f.button('feedback-send').disabled,false);assert.deepEqual(f.messages,['請寫一些內容','本機示範模式無法送出反饋；請改用下面的 Email 連結']);
});
for(const next of ['feedback','help'])for(const outcome of ['success','returned-error','thrown-error'])test(`closed send ${outcome} cannot affect newer ${next} modal`,async()=>{
  const f=fixture();f.open();f.fill();const old=f.button('feedback-send');f.click('feedback-send');assert.equal(f.requests.length,1);
  assert.equal(f.button('close').disabled,false);f.click('close');assert.equal(f.ctx.UI.modal,null);assert.equal(f.root.innerHTML,'');
  f.click(next);const newer=f.ctx.UI.modal;assert.equal(newer.t,next);if(next==='feedback')f.fill('Second unsent draft','ux');
  const before=f.root.innerHTML;
  await f.settle(0,outcome);
  assert.equal(old.disabled,false,'detached old button completes cleanup');assert.equal(f.ctx.UI.modal,newer,'older completion must not close current modal');assert.equal(f.root.innerHTML,before);assert.deepEqual(f.messages,[],'older errors/success must not leak into the replacement modal');
  if(next==='feedback')assert.equal(f.doc.querySelector('#fb-msg').value,'Second unsent draft');
});
for(const outcome of ['success','returned-error','thrown-error'])test(`A ${outcome} cannot affect B while B has its own pending send`,async()=>{
  const f=fixture();f.open();f.fill('Request A');f.click('feedback-send');f.click('close');f.open();f.fill('Request B');const b=f.ctx.UI.modal,newButton=f.button('feedback-send');f.click('feedback-send');
  assert.equal(f.requests.length,2);assert.equal(newButton.disabled,true);await f.settle(0,outcome);assert.equal(f.ctx.UI.modal,b);assert.equal(newButton.disabled,true);assert.deepEqual(f.messages,[]);await f.settle(1);assert.equal(f.ctx.UI.modal,null);assert.equal(f.messages.length,1);
});
for(const change of ['store','user','epoch','logout'])test(`pre-existing ${change} fence suppresses late success and errors`,async()=>{
  for(const outcome of ['success','returned-error','thrown-error']){const f=fixture();f.open();f.fill();f.click('feedback-send');const m=f.ctx.UI.modal;
    if(change==='store')f.ctx.STORE={...f.ctx.STORE};if(change==='user')f.ctx.STORE.session={user:{id:'new-synthetic-owner'}};if(change==='epoch')f.ctx.STORE.authEpoch++;if(change==='logout')f.ctx.STORE.session=null;
    await f.settle(0,outcome);assert.equal(f.ctx.UI.modal,m);assert.equal(f.button('feedback-send').disabled,false);assert.equal(f.doc.querySelector('#fb-msg').value,'First synthetic feedback');assert.deepEqual(f.messages,[]);}
});
for(const outcome of ['success','returned-error','thrown-error'])test(`synthetic client replacement suppresses late ${outcome}`,async()=>{
  const f=fixture();f.open();f.fill();f.click('feedback-send');const m=f.ctx.UI.modal;f.ctx.STORE.sb={syntheticReplacement:true};await f.settle(0,outcome);assert.equal(f.ctx.UI.modal,m);assert.deepEqual(f.messages,[]);
});
for(const next of ['feedback','help'])test(`existing feedback-list ownership guard preserves newer ${next} on success and errors`,async()=>{
  for(const outcome of ['success','returned-error','thrown-error']){const f=fixture();f.click('feedback-list');assert.equal(f.ctx.UI.modal.t,'feedback-list');f.click('close');f.click(next);if(next==='feedback')f.fill('New unsent draft');const m=f.ctx.UI.modal;await f.settle(0,outcome);assert.equal(f.ctx.UI.modal,m);assert.deepEqual(f.messages,[]);if(next==='feedback')assert.equal(f.doc.querySelector('#fb-msg').value,'New unsent draft');}
});

for(const outcome of ['success','returned-error','thrown-error'])test(`closed send ${outcome} stays retired when no replacement is open`,async()=>{
  const f=fixture();f.open();f.fill();const old=f.button('feedback-send');f.click('feedback-send');f.click('close');
  await f.settle(0,outcome);assert.equal(f.ctx.UI.modal,null);assert.equal(f.root.innerHTML,'');assert.equal(old.disabled,false);assert.deepEqual(f.messages,[]);
});

test('unnamed non-boss sender keeps the existing fallback payload and completion message',async()=>{
  const f=fixture();f.ctx.STORE.userName='';f.ctx.STORE.role='worker';f.open();f.fill('Fallback content','');f.click('feedback-send');
  assert.deepEqual(f.requests[0].payload,{author_name:'未命名',category:'other',message:'Fallback content',page_url:'https://synthetic.invalid/schedule',user_id:'synthetic-owner'});
  await f.settle(0);assert.deepEqual(f.messages,['感謝！意見已送出，我們會盡快處理。']);
});

test('send uses the captured client even when the store client changes before the insert',async()=>{
  const f=fixture();f.open();f.fill();let reads=0;
  const replacement={from(){throw new Error('The replacement client must not receive the old insert');}};
  // Supplemental synchronous ownership probe. Ordinary UI replacement is covered
  // above; this getter isolates a second read of store.sb after its capture.
  Object.defineProperty(f.ctx.STORE,'sb',{get(){return ++reads===1?f.client:replacement;}});
  f.click('feedback-send');assert.equal(f.requests.length,1);assert.equal(reads,1,'transport must use the captured client');
  const m=f.ctx.UI.modal;await f.settle(0);assert.equal(reads,2,'completion compares the current client');assert.equal(f.ctx.UI.modal,m);assert.deepEqual(f.messages,[]);
});

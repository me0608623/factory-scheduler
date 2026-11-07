import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the production listeners, work-log renderer and cell save function.
// This is a DOM/event model, not browser E2E: Enter's native button click follows
// uncancelled keydown; Space's follows uncancelled keyup. Neither emits mousedown.
// Rendering/focus, validation and commit are boundary doubles. No native select
// popup, browser focus timing, IME, network or persistence claim is made here.
const source=fs.readFileSync(process.env.KEYBOARD_TIME_SOURCE || new URL('../src/app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function section(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`production section: ${start}`);
  return source.slice(a,b);
}
function harness({allowed=true}={}){
  const listeners={},log=[];
  let current=null;
  const ctx={UI:{view:'day',editCell:null,modal:null,tableSort:{},workLogDate:''},PV:null,MODAL_ACT:{},
    document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn);},querySelector:()=>current,activeElement:null},
    render(){log.push('render');},commit(change,permission){log.push({commit:permission});},
    validateWorkLog(){},setPath:(r,k,v)=>{r[k]=v;},toast:m=>log.push({toast:m}),
    closeModal(){log.push('close');ctx.UI.modal=null;},openModal:m=>log.push({open:m}),
    pvClickBlock:id=>log.push({preview:id}),exitManualPreview:()=>log.push('exitPreview'),dpBack:()=>log.push('backPreview'),
    openTableForm:()=>log.push('tableform'),modalFocusable:()=>[], $:()=>null,markOwner:()=>null,executionOf:()=>null,
    S:{workLog:[{id:'w1',date:'2026-11-07',code:'T1',startH:8,startM:30,endH:9,endM:30}]},
    canPermission:p=>{assert.equal(p,'worklog.manage');return allowed;},tableSorted:x=>x,sortBar:()=>'',sortTh:()=>'',WL_SORT:Array(8).fill({}),
    markRowAttrs:()=>({cls:''}),markBtns:()=>'',tx:x=>x,md:x=>x,esc:x=>String(x),pad:x=>String(x).padStart(2,'0'),pageShell:(a,b,c)=>c,getPath:(r,k)=>r[k]};
  vm.createContext(ctx);
  for(const [start,end] of [
    ['document.addEventListener("pointercancel",','/* ===== 8.'],
    ['const PV_BLOCK=new Set(','document.addEventListener("click",e=>{if(e.target.dataset?.actChange)'],
    ['function numSelOptions(','function flashReturnRow('],
    ['function workLogPageHTML(){',"MODALS['memo-edit']="]
  ])vm.runInContext(section(start,end),ctx);
  function dispatch(type,target,key,extra={}){
    const e={target,key,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
    for(const fn of listeners[type]||[])fn(e);
    return e;
  }
  function element(tagName,dataset={}){
    return {tagName,dataset,blur:()=>log.push('blur'),closest(selector){
      if(selector==='[data-act]'&&this.dataset.act)return this;
      if(selector==='[data-act="cell-edit"]'&&this.dataset.act==='cell-edit')return this;
      if(selector==='.blk'&&this.dataset.bid)return this;
      return null;
    }};
  }
  function button(key){
    const html=ctx.workLogPageHTML();
    const match=html.match(new RegExp(`<button class="cellbtn"[^>]*data-key="${key}"[^>]*>.*?</button>`));
    assert.ok(match,`actual ${key} launcher rendered`);
    return element('BUTTON',Object.fromEntries([...match[0].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]])));
  }
  function keyboard(target,key){
    const down=dispatch('keydown',target,key);
    if(key==='Enter'&&!down.defaultPrevented&&target.tagName==='BUTTON')dispatch('click',target);
    const up=dispatch('keyup',target,key);
    if(key===' '&&!down.defaultPrevented&&!up.defaultPrevented&&target.tagName==='BUTTON')dispatch('click',target);
    return down;
  }
  return {ctx,log,dispatch,element,button,keyboard,setCurrent:el=>{current=el;}};
}
for(const key of ['Enter',' '])for(const cell of ['startH','endH'])test(`${cell} opens once with ${JSON.stringify(key)}, without native duplicate click`,()=>{
  const h=harness(),button=h.button(cell),e=h.keyboard(button,key);
  assert.equal(h.ctx.UI.editCell?.key,cell);
  assert.equal(h.ctx.UI.editCell.table,'wl');
  assert.equal(e.defaultPrevented,true);
  assert.deepEqual(h.log,['render']);
  assert.match(h.ctx.workLogPageHTML(),new RegExp(`<select class="inp cellinp"[^>]*data-key="${cell}"`));
  // Even a stale repeated keydown must not reset the just-opened editor.
  h.dispatch('keydown',button,key,{repeat:true});
  assert.deepEqual(h.log,['render']);
});
for(const mode of ['mouse','Enter',' '])test(`${mode} switches cells after saving the old input once`,()=>{
  const h=harness(),next=h.button('endH');
  h.ctx.UI.editCell={table:'wl',id:'w1',key:'startH'};
  const old=h.element('SELECT',{cell:'wl',id:'w1',key:'startH',type:'number'});
  old.value='10';h.setCurrent(old);
  const e=mode==='mouse'?h.dispatch('mousedown',next):h.keyboard(next,mode);
  assert.equal(e.defaultPrevented,true,'cancel native focus change/click before old editor is removed');
  assert.equal(h.ctx.S.workLog[0].startH,10,'real saveCellEdit updates old row');
  assert.deepEqual(h.log,[{commit:'worklog.manage'},'render']);
  assert.equal(h.ctx.UI.editCell.key,'endH');
  // The trailing mouse click must not reopen, reset, or save the editor again.
  if(mode==='mouse'){h.dispatch('click',next);assert.deepEqual(h.log,[{commit:'worklog.manage'},'render']);}
});
test('read-only renderer exposes neither launcher nor inline time editor',()=>{
  const h=harness({allowed:false});
  h.ctx.UI.editCell={table:'wl',id:'w1',key:'startH'};
  assert.doesNotMatch(h.ctx.workLogPageHTML(),/data-act="cell-edit"|class="inp cellinp"/);
});
for(const tag of ['SELECT','INPUT'])test(`${tag} inline Enter still blurs, and Escape cancels editing`,()=>{
  const h=harness(),el=h.element(tag,{cell:'wl'});
  h.ctx.UI.editCell={table:'wl',id:'w1',key:'startH'};
  assert.equal(h.keyboard(el,'Enter').defaultPrevented,true);
  assert.deepEqual(h.log,['blur']);
  h.dispatch('keydown',el,'Escape');
  assert.equal(h.ctx.UI.editCell,null);assert.deepEqual(h.log,['blur','render']);
});
for(const key of ['Enter',' '])test(`ordinary detail button ${JSON.stringify(key)} retains exactly one native click`,()=>{
  const h=harness(),el=h.element('BUTTON',{act:'logone',id:'l1'});
  assert.equal(h.keyboard(el,key).defaultPrevented,false);
  assert.equal(h.log.length,1);assert.equal(h.log[0].open.t,'logone');
});
test('ordinary modal fields, Close and Escape retain existing routes',()=>{
  const h=harness();h.ctx.UI.modal={t:'tbl-form'};
  for(const tag of ['INPUT','TEXTAREA','SELECT']){
    assert.equal(h.keyboard(h.element(tag,{fk:'note'}),'Enter').defaultPrevented,false);
    assert.deepEqual(h.log,[]);
  }
  h.keyboard(h.element('BUTTON',{act:'close'}),'Enter');assert.deepEqual(h.log,['close']);
  h.ctx.UI.modal={t:'memo-edit'};h.dispatch('keydown',h.element('TEXTAREA'),'Escape');
  assert.deepEqual(h.log,['close','close']);
});
for(const preview of [false,true])test(`schedule block activation retains ${preview?'manual preview':'normal'} routing`,()=>{
  const h=harness();if(preview)h.ctx.PV={kind:'manual',nav:{stack:[]}};
  for(const key of ['Enter',' ']){
    h.log.length=0;assert.equal(h.keyboard(h.element('DIV',{bid:'b1'}),key).defaultPrevented,true);
    assert.equal(h.log.length,1);
    if(preview)assert.equal(h.log[0].preview,'b1');else assert.equal(h.log[0].open.t,'blk');
  }
  if(preview){h.log.length=0;h.dispatch('keydown',h.element('DIV'),'Escape');assert.deepEqual(h.log,['exitPreview']);}
});
test('text editing keys stay untouched',()=>{
  const h=harness();
  for(const tag of ['INPUT','TEXTAREA','SELECT','DIV'])for(const key of ['Backspace','Delete','z']){
    const el=h.element(tag);el.isContentEditable=tag==='DIV';
    assert.equal(h.dispatch('keydown',el,key,{ctrlKey:key==='z'}).defaultPrevented,false);
  }
  assert.deepEqual(h.log,[]);
});

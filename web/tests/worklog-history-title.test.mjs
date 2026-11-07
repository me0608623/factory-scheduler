import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {I18N, tx} from '../src/i18n.js';
import {LocalStore} from '../src/store/local.js';
import {validateWorkLog} from '../src/worklog.js';
import {applySort, WL_SORT, sortBar, sortTh} from '../src/table-sort.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function section(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert(a>=0&&b>a,`Missing source section: ${start}`);
  return source.slice(a,b);
}
const setter=source.split('\n').find(line=>line.startsWith('function setPath('));
const sorted=source.split('\n').find(line=>line.startsWith('function tableSorted('));
// Parse the real rendered button/select attributes instead of inventing the input's type.
function control(html,tag,key){
  const opening=[...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))]
    .map(match=>match[0]).find(text=>text.includes(`data-key="${key}"`));
  assert(opening,`${tag} for ${key} must be rendered`);
  const dataset=Object.fromEntries([...opening.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  return {dataset};
}
async function harness(){
  const pending=[],listeners={},messages=[];
  const store=new LocalStore();
  const S={employees:[],machines:[],products:[],orders:[],blocks:[],cal:{week:[],over:{}},
    workLog:[{id:'wl-1',date:'2026-11-02',code:'A',goodQty:120,badQty:3,reworkMin:15,startH:8,startM:30,endH:17,endM:45,worker:'QA',note:'Keep quantities'}],log:[]};
  await store.sync(S);
  const ctx={S,STORE:store,UI:{editCell:null,tableSort:{wl:null}},SYNC:{state:'idle'},
    validateWorkLog,tx,applySort,WL_SORT,sortBar,sortTh,structuredClone,
    esc:s=>String(s??''),pad:s=>String(s).padStart(2,'0'),md:s=>s,
    LOGIC:{edit:'edit'},canPermission:()=>true,uid:()=>`log-${S.log.length}`,
    markRowAttrs:()=>({cls:''}),markBtns:()=>'',toast:s=>messages.push(s),
    document:{addEventListener:(name,fn)=>{listeners[name]=fn;},querySelector:()=>null},
    queueSync:()=>{const p=store.sync(S).then(()=>true);pending.push(p);return p;}};
  ctx.render=()=>{ctx.html=ctx.workLogPageHTML();};
  vm.createContext(ctx);
  vm.runInContext([
    setter,sorted,
    section('function pageSaveState(', 'function flashReturnRow('),
    section('function pageShell(', 'function tfArchiveMonth('),
    section('function workLogPageHTML(', "\nMODALS['memo-edit']"),
    section('function commit(', 'async function undo('),
    section('function logRow(', '\n/* ----- 日檢視'),
    section('document.addEventListener("mousedown",e=>{\n  const btn=', 'document.addEventListener("keydown",e=>{'),
    // Only the cell branch of the actual delegated change listener is relevant here.
    section('document.addEventListener("change",e=>{\n  if(e.target.dataset?.cell)', '  if(e.target.dataset?.actChange==="sort-sel")')+'});',
  ].join('\n'),ctx);
  ctx.render();
  return {ctx,messages,store,pending,async changeHour(value){
    const button=control(ctx.html,'button','startH');
    listeners.mousedown({target:{closest:()=>button},preventDefault(){}});
    const select=control(ctx.html,'select','startH');
    assert.equal(select.dataset.type,'number');
    assert.match(ctx.html,/<option value="10"/);
    select.value=String(value);
    listeners.change({target:select});
    await Promise.all(pending);
    return store.load();
  }};
}
for(const [lang,title] of [['zh-TW','更新工作紀錄的一個欄位'],['en','Update a work-log field']]){
  test(`work-log hour edit persists translated history and preserves quantities (${lang})`,async t=>{
    const oldLang=I18N.lang,oldStorage=globalThis.localStorage,data=new Map();
    t.after(()=>{I18N.lang=oldLang;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;});
    I18N.lang=lang;
    globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
    const h=await harness(),before=structuredClone(h.ctx.S.workLog[0]);
    const loaded=await h.changeHour(10);
    assert.deepEqual(loaded.workLog[0],{...before,startH:10});
    assert.equal(loaded.log.length,1);
    assert.equal(loaded.log[0].kind,'edit');
    assert.equal(loaded.log[0].title,title);
    assert.match(h.ctx.logRow(loaded.log[0]),new RegExp(`<span class="tx">${title}<small>`));
    assert(!h.ctx.logRow(loaded.log[0]).includes("'+tx("));
    assert.equal(h.ctx.UI.editCell,null);
    assert.deepEqual(h.messages,[]);
    // A repeated selection must not add history; midnight must remain numeric zero.
    assert.equal((await h.changeHour(10)).log.length,1);
    const midnight=await h.changeHour(0);
    assert.deepEqual(midnight.workLog[0],{...before,startH:0});
    assert.equal(midnight.log.length,2);
    assert(midnight.log.every(entry=>entry.title===title));
  });
}

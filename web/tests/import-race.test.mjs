import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('document.addEventListener("change",async e=>{');
// Only the lazy module boundary is replaced; execute the actual event handler.
const handlerCode=source.slice(start,source.indexOf('// 自動排程也先預覽',start)).replace('await import("./excel.js")','await loadExcel()');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(){
  let handler,parses=0;const requests=new Map(),digest=deferred(),opened=[];
  const ctx={S:{blocks:[{id:'preserved'}]},UI:{modal:null},STORE:{kind:'local',session:{user:{id:'test-user'}},authEpoch:0},
    canArchive:()=>true,canMaster:()=>true,crypto:{subtle:{digest:()=>digest.promise}},Uint8Array,
    loadExcel:async()=>({readImportXlsx:async(bytes,name)=>{parses++;return requests.get(name).promise;}}),
    openModal:m=>{ctx.UI.modal=m;opened.push(m);},document:{addEventListener:(type,fn)=>{assert.equal(type,'change');handler=fn;}}};
  vm.createContext(ctx);vm.runInContext(handlerCode,ctx);
  const choose=name=>{const pending=deferred();requests.set(name,pending);
    const target={id:'xlsx-import',files:[{name,size:100,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}],value:name};
    return {task:handler({target}),pending,target};};
  return {ctx,choose,opened,digest,parses:()=>parses};
}
const valid=tag=>({errors:[],data:{tag}});
test('import exposes loading immediately, then previews exactly that file without writing data',async()=>{
  const f=fixture(),before=JSON.stringify(f.ctx.S),one=f.choose('one.xlsx');
  assert.equal(f.ctx.UI.modal.loading,true);assert.equal(f.ctx.UI.modal.filename,'one.xlsx');
  await tick();one.pending.resolve(valid('one'));await one.task;
  assert.equal(f.ctx.UI.modal.data.tag,'one');assert.equal(JSON.stringify(f.ctx.S),before);assert.equal(f.parses(),1);
});
test('older successful parser result cannot replace the newer loading request',async()=>{
  const f=fixture(),first=f.choose('first.xlsx');await tick();
  const second=f.choose('second.xlsx'),latest=f.ctx.UI.modal;
  await tick();first.pending.resolve(valid('first'));await first.task;
  assert.equal(f.ctx.UI.modal,latest);assert.equal(latest.loading,true);
  second.pending.resolve(valid('second'));await second.task;assert.equal(f.ctx.UI.modal.filename,'second.xlsx');assert.equal(f.ctx.UI.modal.data.tag,'second');
});
test('older parser error cannot replace the newer loading request',async()=>{
  const f=fixture(),first=f.choose('first.xlsx');await tick();
  const second=f.choose('second.xlsx'),latest=f.ctx.UI.modal;
  await tick();first.pending.reject(new Error('OLD_FILE_ERROR'));await first.task;assert.equal(f.ctx.UI.modal,latest);
  second.pending.resolve(valid('second'));await second.task;assert.equal(f.ctx.UI.modal.data.tag,'second');
});
test('closing while legacy SHA256 is in flight does not reopen the import modal',async()=>{
  const f=fixture(),first=f.choose('legacy.xlsx');await tick();
  first.pending.resolve({legacy:{selectedDate:'2026-10-15'}});await tick();f.ctx.UI.modal=null;
  f.digest.resolve(new Uint8Array([0,1,2]).buffer);await first.task;assert.equal(f.ctx.UI.modal,null);
});
test('legacy digest completion cannot replace another file preview',async()=>{
  const f=fixture(),first=f.choose('legacy.xlsx');await tick();first.pending.resolve({legacy:{selectedDate:'2026-10-15'}});await tick();
  const second=f.choose('second.xlsx'),latest=f.ctx.UI.modal;await tick();
  f.digest.resolve(new Uint8Array([0,1,2]).buffer);await first.task;assert.equal(f.ctx.UI.modal,latest);
  second.pending.resolve(valid('second'));await second.task;assert.equal(f.ctx.UI.modal.filename,'second.xlsx');
});
test('changed store, user, auth epoch or revoked archive permission cannot accept a late parse',async()=>{
  for(const kind of ['store','user','epoch','permission']){
    const f=fixture(),first=f.choose('first.xlsx'),loading=f.ctx.UI.modal;await tick();
    if(kind==='store')f.ctx.STORE={...f.ctx.STORE};
    if(kind==='user')f.ctx.STORE.session.user.id='other-user';
    if(kind==='epoch')f.ctx.STORE.authEpoch++;
    if(kind==='permission')f.ctx.canArchive=()=>false;
    first.pending.resolve(valid('old'));await first.task;
    assert.equal(f.ctx.UI.modal,loading,kind);assert.equal(f.opened.length,1,kind);
  }
});
test('cancelled normal parse or parse error leaves the current screen unchanged',async()=>{
  for(const error of [false,true]){
    const f=fixture(),first=f.choose('first.xlsx');await tick();const next={t:'settings'};f.ctx.UI.modal=next;
    if(error)first.pending.reject(new Error('CANCELLED_ERROR'));else first.pending.resolve(valid('old'));
    await first.task;assert.equal(f.ctx.UI.modal,next);assert.equal(f.opened.length,1);
  }
});
test('closing before the lazy module resolves avoids reading or parsing the file',async()=>{
  const f=fixture(),module=deferred();f.ctx.loadExcel=()=>module.promise;
  const first=f.choose('first.xlsx');f.ctx.UI.modal=null;
  module.resolve({readImportXlsx:()=>assert.fail('cancelled file must not be parsed')});await first.task;
  assert.equal(f.ctx.UI.modal,null);assert.equal(f.parses(),0);
});
test('current parser error gives recoverable feedback for that file without writing',async()=>{
  const f=fixture(),first=f.choose('bad.xlsx'),before=JSON.stringify(f.ctx.S);await tick();
  first.pending.reject(new Error('SYNTHETIC_PARSE_ERROR'));await first.task;
  assert.equal(f.ctx.UI.modal.filename,'bad.xlsx');assert.match(f.ctx.UI.modal.errors[0],/SYNTHETIC_PARSE_ERROR/);
  assert.equal(f.ctx.UI.modal.data,null);assert.equal(JSON.stringify(f.ctx.S),before);
});
test('current legacy parser preserves date and SHA256 preview without writing the schedule',async()=>{
  const f=fixture(),first=f.choose('legacy.xlsx'),before=JSON.stringify(f.ctx.S);await tick();
  first.pending.resolve({legacy:{selectedDate:'2026-10-15'}});await tick();f.digest.resolve(new Uint8Array([0,1,2]).buffer);await first.task;
  assert.equal(f.ctx.UI.modal.t,'legacy-preview');assert.equal(f.ctx.UI.modal.sourceSha256,'000102');
  assert.equal(f.ctx.UI.modal.date,'2026-10-15');assert.equal(JSON.stringify(f.ctx.S),before);
});

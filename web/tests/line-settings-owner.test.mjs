import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('case "ln-save":{const h=')+'case "ln-save":{const h='.length;
const end=source.indexOf(';h(a);break;',start);
for(const outcome of ['success','returned-error','thrown-error'])test('LINE save '+outcome+' belongs only to originating dialog and session',async()=>{
  for(const change of ['modal','store','client','user','epoch']){
    let resolve,reject;const messages=[],writes=[];
    const ctx={UI:{modal:{t:'line-notify'}},$:()=>({value:'synthetic',checked:true}),document:{querySelectorAll:()=>[]},
      STORE:{kind:'supabase',authEpoch:1,session:{user:{id:'A'}},sb:{from:()=>({upsert:row=>{writes.push(row);return new Promise((a,b)=>{resolve=a;reject=b;});}})}},toast:x=>messages.push(x),tx:x=>x};
    ctx.closeModal=()=>ctx.UI.modal=null;vm.createContext(ctx);vm.runInContext('this.save='+source.slice(start,end),ctx);
    const button={disabled:false},job=ctx.save(button);
    if(change==='modal')ctx.UI.modal={t:'memo-edit',draft:'keep'};
    if(change==='store')ctx.STORE={...ctx.STORE};if(change==='client')ctx.STORE.sb={};if(change==='user')ctx.STORE.session={user:{id:'B'}};if(change==='epoch')ctx.STORE.authEpoch++;
    const current=ctx.UI.modal;
    if(outcome==='thrown-error')reject(new Error('old transport error'));else resolve({error:outcome==='returned-error'?{message:'old write error'}:null});
    await job;assert.equal(ctx.UI.modal,current,change+' must preserve current dialog');assert.deepEqual(messages,[],change+' must suppress old feedback');assert.equal(button.disabled,false);assert.equal(writes.length,1);assert.equal(writes[0].user_id,'A');
  }
});

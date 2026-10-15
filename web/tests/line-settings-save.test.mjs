import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('case "ln-save":{const h=')+'case "ln-save":{const h='.length;
const end=source.indexOf(';h(a);break;',start);
assert.ok(start>0&&end>start);
function fixture(){
  const messages=[],writes=[],modal={t:'line-notify'};
  let response={error:{message:'Synthetic write rejected'}};
  const fields={'#ln-enabled':{checked:true},'#ln-user':{value:' synthetic-user '},'#ln-group':{value:''}};
  const ctx={UI:{modal},$:selector=>fields[selector],document:{querySelectorAll:()=>[{dataset:{lnEvent:'fault'},checked:true}]},
    STORE:{kind:'supabase',session:{user:{id:'actor'}},sb:{from:table=>({upsert:async(payload,options)=>{
      writes.push({table,payload,options});if(response instanceof Error)throw response;return response;
    }})}},toast:m=>messages.push(m),tx:s=>s};
  ctx.closeModal=()=>{ctx.UI.modal=null;};
  vm.createContext(ctx);vm.runInContext('var save='+source.slice(start,end),ctx);
  const button={disabled:false};
  return {ctx,messages,writes,modal,button,setResponse:r=>{response=r;},save:()=>ctx.save(button)};
}

test('returned write errors preserve the settings form and allow an explicit retry',async()=>{
  const f=fixture();await f.save();
  assert.equal(f.ctx.UI.modal,f.modal,'a rejected write must not dismiss the form');
  assert.deepEqual(f.messages,['Synthetic write rejected']);
  assert.equal(f.button.disabled,false);
  assert.equal(f.writes.length,1,'no automatic retry');
  f.setResponse({error:null});await f.save();
  assert.equal(f.ctx.UI.modal,null);
  assert.equal(f.writes.length,2);
  assert.equal(f.messages.length,2);
  assert.match(f.messages[1],/已儲存/);
  assert.equal(f.writes[1].table,'line_notify_settings');
  assert.equal(f.writes[1].payload.user_id,'actor');
  assert.equal(f.writes[1].payload.line_user_id,'synthetic-user');
});

test('thrown transport errors also keep settings editable without claiming success',async()=>{
  const f=fixture();f.setResponse(new Error('Synthetic offline'));await f.save();
  assert.equal(f.ctx.UI.modal,f.modal);
  assert.deepEqual(f.messages,['Synthetic offline']);
  assert.equal(f.button.disabled,false);
});

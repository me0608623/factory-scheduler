import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {LocalStore} from '../src/store/local.js';

function storage(){
  const data=new Map([['fsched-local-v1','schedule'],['fsched-scenarios-v1','scenarios'],
    ['fsched-local-profile-v1','profile'],['fsched-legacy-index-v1','[{"id":"a"}]'],
    ['fsched-legacy-a','archive'],['unrelated','keep']]);
  globalThis.localStorage={getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k)};
  return data;
}

test('a failed removal rejects reset and a later explicit retry can finish',async()=>{
  const data=storage(),store=new LocalStore(),remove=localStorage.removeItem;
  localStorage.removeItem=()=>{throw new Error('Storage blocked');};
  await assert.rejects(store.reset());
  assert.equal(data.get('fsched-local-v1'),'schedule');
  localStorage.removeItem=remove;await store.reset();
  assert.deepEqual([...data],[['unrelated','keep']]);
});

test('an unreadable or invalid archive index stops reset before deleting anything',async()=>{
  for(const mode of ['read','json','shape','entry']){
    const data=storage();
    if(mode==='json')data.set('fsched-legacy-index-v1','{broken');
    if(mode==='shape')data.set('fsched-legacy-index-v1','{}');
    if(mode==='entry')data.set('fsched-legacy-index-v1','[{"id":"a"},null]');
    const before=new Map(data),read=localStorage.getItem;
    if(mode==='read')localStorage.getItem=k=>{if(k==='fsched-legacy-index-v1')throw new Error('Read failed');return read(k);};
    await assert.rejects(new LocalStore().reset());
    assert.deepEqual(data,before);
  }
});

test('partial removal failure is reported and retry finishes without touching unrelated keys',async()=>{
  const data=storage(),store=new LocalStore(),remove=localStorage.removeItem;
  localStorage.removeItem=k=>{if(k==='fsched-legacy-index-v1')throw new Error('Blocked');remove(k);};
  await assert.rejects(store.reset(),/未完整清除/);
  assert.equal(data.has('fsched-legacy-a'),false);
  assert.equal(data.get('fsched-local-v1'),'schedule');
  localStorage.removeItem=remove;await store.reset();
  assert.deepEqual([...data],[['unrelated','keep']]);
});

test('the real reset action reports failure without reloading and permits retry after confirmation',async()=>{
  const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const confirmation=source.split('\n').find(x=>x.startsWith('function confirmStep('));
  const line=source.split('\n').find(x=>x.startsWith('  "reset-local":'));
  const action=line.slice(line.indexOf(':')+1).trim().replace(/,$/,'');
  let fail=true,calls=0,reloads=0;const messages=[];
  const ctx={UI:{modal:{}},STORE:{reset:async()=>{calls++;if(fail)throw new Error('Synthetic reset failed');}},
    toast:m=>messages.push(m),location:{reload:()=>{reloads++;}}};
  vm.createContext(ctx);vm.runInContext(confirmation+'\nvar reset='+action,ctx);
  const button={disabled:false};await ctx.reset(button);assert.equal(calls,0,'first click only confirms');
  await ctx.reset(button);
  assert.equal(reloads,0);assert.deepEqual(messages,['Synthetic reset failed']);assert.equal(button.disabled,false);
  fail=false;await ctx.reset(button);assert.equal(calls,2);assert.equal(reloads,1);
});

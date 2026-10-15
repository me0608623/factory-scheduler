import test from 'node:test';
import assert from 'node:assert/strict';
import {SOLVER} from '../src/solver.js';
test('POST timeout remains armed until the response body finishes, and a retry succeeds',async()=>{
 const original={fetch:globalThis.fetch,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const timers=new Map();let id=0,reading;
 const started=new Promise(resolve=>reading=resolve);
 globalThis.setTimeout=fn=>{timers.set(++id,fn);return id;};globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.fetch=async(_url,{signal})=>({ok:true,json:()=>{reading();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('body aborted')),{once:true}));}});
 try{
  const request=SOLVER.plans({},null,0);const outcome=request.then(value=>({value}),error=>({error}));await started;
  assert.equal(timers.size,1,'headers must not clear the body deadline');
  [...timers.values()][0]();const result=await outcome;assert.match(result.error.message,/排程服務沒有回應/);assert.equal(timers.size,0);
  globalThis.fetch=async()=>new Response(JSON.stringify({plans:[]}));assert.deepEqual(await SOLVER.plans({},null,0),{plans:[]});assert.equal(timers.size,0);
 }finally{Object.assign(globalThis,original);}
});

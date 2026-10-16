import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('"x-xlsx":async()=>{'),end=source.indexOf('"x-template":',start);
const code='const actions={'+source.slice(start,end).replace('await import("./excel.js")','await loadExcel()')+'};this.exportXlsx=actions["x-xlsx"];';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('switching date and factory during workbook generation cannot relabel the result',async()=>{
  const pending=deferred(),started=deferred(),files=[],calls=[];
  const ctx={UI:{date:'2026-10-16',factory:1},S:{machines:[{id:'m1',factory:1},{id:'m2',factory:2}],blocks:[],workAssignments:[]},
    shownMachines:()=>ctx.S.machines.filter(m=>m.factory===ctx.UI.factory),assignments:s=>s.workAssignments,workCatalog:()=>[],inFactory:()=>true,
    factoryName:n=>'Plant '+n,Blob,saveFile:(name,blob)=>files.push({name,blob}),toast:m=>assert.fail(m),
    loadExcel:async()=>({scheduleXlsx:(state,date)=>{calls.push({state,date});started.resolve();return pending.promise;}})};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const task=ctx.exportXlsx();await started.promise;
  ctx.UI.date='2026-10-17';ctx.UI.factory=2;
  pending.resolve(new Uint8Array([1,2]));await task;
  assert.equal(calls[0].date,'2026-10-16');assert.equal(calls[0].state.machines[0].id,'m1');
  assert.ok(files[0].name.includes('Plant 1_2026-10-16.xlsx'));
});

test('overlapping exports retain their own names when completed in reverse order',async()=>{
  const jobs=[],files=[];
  const ctx={UI:{date:'2026-10-16',factory:1},S:{blocks:[],workAssignments:[]},
    shownMachines:()=>[],assignments:()=>[],workCatalog:()=>[],inFactory:()=>true,
    factoryName:n=>'Plant '+n,Blob,saveFile:(name,blob)=>files.push({name,blob}),toast:m=>assert.fail(m),
    loadExcel:async()=>({scheduleXlsx:()=>{const d=deferred();jobs.push(d);return d.promise;}})};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const first=ctx.exportXlsx();await new Promise(setImmediate);
  ctx.UI.date='2026-10-17';ctx.UI.factory=2;
  const second=ctx.exportXlsx();await new Promise(setImmediate);
  ctx.UI.date='2026-10-18';ctx.UI.factory='all';
  jobs[1].resolve(new Uint8Array([2]));await second;
  jobs[0].resolve(new Uint8Array([1]));await first;
  assert.ok(files[0].name.includes('Plant 2_2026-10-17.xlsx'));
  assert.ok(files[1].name.includes('Plant 1_2026-10-16.xlsx'));
  assert.equal(new Uint8Array(await files[0].blob.arrayBuffer())[0],2);
  assert.equal(new Uint8Array(await files[1].blob.arrayBuffer())[0],1);
  assert.equal(ctx.UI.date,'2026-10-18');assert.equal(ctx.UI.factory,'all');
});

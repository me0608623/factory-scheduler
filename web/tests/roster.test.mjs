import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoster,resetCells,validateRosters,auditRoster,datesOf,shiftMinutes,addDate,fillRoster,copyNextRoster} from '../src/roster.js';
import {fromSnapshot,toSnapshot} from '../src/convert.js';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
const state=()=>({version:0,employees:[{id:'e',name:'測試員工',factory:1,leaves:[],skills:[],maxMachines:1}],machines:[],products:[],orders:[],blocks:[],cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[]});
function fixture(regime='fixed'){const S=state(),p=newRoster(S,{id:'p',start:'2026-09-28'});p.regime=regime;p.eligibilityRef='需由企業核定';p.consentRef='測試同意紀錄';resetCells(p,S);p.positions=[{id:'pos',name:'人工檢查',rate:10,employeeIds:['e']}];for(const c of p.cells)if(c.type==='work'){c.shiftId='day';c.positionId='pos';}S.staffRosters=[p];return {S,p};}
test('四種制度完整週期與正常工時計算；未當成合法證明',()=>{
 for(const regime of ['fixed','two','four','eight']){const {S,p}=fixture(regime);validateRosters(S);assert.equal(auditRoster(p,S).errors.length,0);assert.match(auditRoster(p,S).warnings.join(),/不是完整合法認證/);assert.equal(datesOf(p).length,{fixed:7,two:14,four:28,eight:56}[regime]);}
});
test('休假不抵充例假；七休一與四週二週例假分開',()=>{
 const {S,p}=fixture('two');p.cells.find(c=>c.type==='regular').type='leave';assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/例假/);
 const f=fixture('four');for(const c of f.p.cells.slice(0,7)){c.type='work';c.shiftId='day';c.positionId='pos';}f.p.cells[7].type='regular';f.p.cells[7].shiftId=null;f.p.cells[7].positionId=null;
 f.p.cells[7].type='work';f.p.cells[7].shiftId='day';f.p.cells[7].positionId='pos';assert.ok(!auditRoster(f.p,f.S).errors.some(x=>x.message.includes('超過 6 日')));assert.match(auditRoster(f.p,f.S).errors.map(x=>x.message).join(),/二週/);
});
test('二週十小時、固定／八週八小時；每日休息段與跨夜例假',()=>{
 const {S,p}=fixture();p.shifts[0].segments=[[480,720],[750,1110]];assert.equal(shiftMinutes(p.shifts[0]),600);assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/8 小時|4 小時/);
 const n=fixture();n.p.shifts[0].segments=[[1320,1560],[1590,1830]];validateRosters(n.S);assert.match(auditRoster(n.p,n.S).errors.map(x=>x.message).join(),/完整休息日/);
});
test('工作與請假、資格、11 小時間隔、同週換班相衝突',()=>{
 const {S,p}=fixture();S.employees[0].leaves=[p.start];p.positions[0].employeeIds=[];p.shifts.push({id:'late',name:'晚班',segments:[[840,1080],[1110,1350]]});p.employees[0].shiftIds.push('late');p.cells[0].shiftId='late';
 assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/請假/);assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/資格/);assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/11 小時/);assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/同意/);
});
test('需求人數和產量缺口分開，未知產能不猜測',()=>{
 const {S,p}=fixture();p.demands=[{date:p.start,shiftId:'day',positionId:'pos',people:2,target:100}];const d=auditRoster(p,S).shortages[0];assert.equal(d.missingPeople,1);assert.equal(d.missingQty,20);p.positions[0].rate=null;assert.equal(auditRoster(p,S).shortages[0].capacity,null);assert.match(auditRoster(p,S).warnings.join(),/產能待確認/);
});
test('保存草稿不改產線；既有工作不在輪班時段會提示',()=>{
 const {S,p}=fixture();S.blocks=[{id:'b',emp:'e',date:p.start,s:1080,e:1140}];assert.match(auditRoster(p,S).warnings.join(),/既有產線工作/);assert.equal(S.blocks[0].s,1080);
});
test('週期錨點、重複員工／班格／需求、跨廠同員工重疊均拒絕',()=>{
 for(const change of [p=>p.anchor=addDate(p.start,1),p=>p.cells.push({...p.cells[0]}),p=>p.employees.push({...p.employees[0]}),p=>p.shifts[0].segments=[[480,780],[750,1020]]]){const {S,p}=fixture();change(p);assert.throws(()=>validateRosters(S));}
 const {S,p}=fixture();S.staffRosters.push({...structuredClone(p),id:'p2',factory:2});assert.throws(()=>validateRosters(S),/重疊/);
});
test('跨週期七休一、休息間隔、缺歷史時不顯示完整通過',()=>{
 const {S,p}=fixture();assert.match(auditRoster(p,S).warnings.join(),/前一週期未知/);const q=structuredClone(p);q.id='previous';q.start=addDate(p.start,-7);q.anchor=q.start;q.cells=q.cells.map((c,i)=>({...c,date:addDate(q.start,i),type:'work',shiftId:'day',positionId:'pos'}));S.staffRosters.push(q);assert.match(auditRoster(p,S).errors.map(x=>x.message).join(),/跨週期連續/);
});
test('輪班快照往返與本機存入保留獨立草稿',async()=>{
 const {S}=fixture();const converted=fromSnapshot(toSnapshot(S));assert.deepEqual(converted.staffRosters,S.staffRosters);
 const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};const store=new LocalStore();await store.sync(S);assert.deepEqual((await store.load()).staffRosters,S.staffRosters);
});
test('批次填充保留固定格、請假與休息日，預覽不更動原班表',()=>{
 const {S,p}=fixture();p.cells[0].pin=true;S.employees[0].leaves=[p.cells[1].date];const old=JSON.stringify(p);
 const out=fillRoster(p,S,{emp:'all',from:p.start,to:datesOf(p).at(-1),type:'work',shiftId:'day',positionId:'pos'});
 assert.equal(out.changed,3);assert.equal(out.skipped,4);assert.equal(JSON.stringify(p),old);assert.equal(out.candidate.cells.at(-1).type,'regular');
 assert.throws(()=>fillRoster(p,S,{emp:'all',from:addDate(p.start,-1),to:p.start,type:'work'}));
});
test('複製下一週期保留基準日，重新帶入請假，固定格不盲目延用',()=>{
 const {S,p}=fixture('two');p.cells[0].pin=true;S.employees[0].leaves=[addDate(p.start,14)];p.demands=[{date:p.start,shiftId:'day',positionId:'pos',people:1,target:80}];
 const q=copyNextRoster(p,S,'next');assert.equal(q.start,addDate(p.start,14));assert.equal(q.anchor,p.anchor);assert.equal(q.cells[0].type,'leave');assert.equal(q.cells[0].pin,false);assert.equal(q.demands[0].date,q.start);validateRosters({...S,staffRosters:[p,q]});
});
test('真 SQL：輪班 RPC 原子性、版本、權限、格式和不改產線',async()=>{
 const db=await makeDb();try{
  const boss='10000000-0000-4000-8000-000000000001',viewer='10000000-0000-4000-8000-000000000002';
  await db.exec(`insert into auth.users(id,email) values('${boss}','boss@test'),('${viewer}','view@test');update profiles set role='boss' where user_id='${boss}';update profiles set role='viewer' where user_id='${viewer}';`);
  const client=new FakeSupabase(db,{});client.uid=boss;const store=new SupabaseStore(client);await store.init();const S=await store.load(),p=newRoster(S,{id:'10000000-0000-4000-8000-000000000003',start:'2026-09-28'});S.staffRosters=[p];const blocks=JSON.stringify(S.blocks);await store.sync(S);assert.equal(S.version,1);assert.deepEqual((await store.load()).staffRosters,[p]);assert.equal(JSON.stringify(S.blocks),blocks);
  let r=await client.rpc('save_staff_rosters',{p_version:0,p_rosters:[p]});assert.equal(r.error.code,'40001');
  const bad=structuredClone(p);bad.status='compliant';r=await client.rpc('save_staff_rosters',{p_version:1,p_rosters:[bad]});assert.ok(r.error);assert.equal((await store.load()).version,1);
  bad.status='draft';bad.cells.pop();r=await client.rpc('save_staff_rosters',{p_version:1,p_rosters:[bad]});assert.ok(r.error);
  const view=new FakeSupabase(db,{});view.uid=viewer;r=await view.rpc('save_staff_rosters',{p_version:1,p_rosters:[]});assert.equal(r.error.code,'42501');
  r=await view.from('staff_rosters').delete().eq('id',p.id);assert.ok(r.error);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from staff_rosters')).rows[0].n,1);
 }finally{await db.close();}
});

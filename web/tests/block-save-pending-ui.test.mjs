import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SupabaseStore} from '../src/store/supabase.js';
import {LocalStore} from '../src/store/local.js';
import {fromSnapshot} from '../src/convert.js';
import {factoryOf} from '../src/factory.js';
import {overtimeWeekdays} from '../src/overtime.js';
import {UI_TEXT} from '../src/i18n.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {requestQuery} from './request-query.mjs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const boss='11111111-1111-4111-8111-111111111111',id='00000000-0000-4000-8000-000000000010';
const block={id,oid:'00000000-0000-4000-8000-0000000000b1',step:0,m:'a',emp:'00000000-0000-4000-8000-0000000000e1',date:'2026-10-05',s:480,e:540,qty:120,pin:false};
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function harness(store,S){
  const messages=[],toasts=[],ctx={STORE:store,S,UI:{modal:{id},group:'all'},undoStack:[],SYNC:{state:'ok',msg:''},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,structuredClone,
    tx:x=>x,uid:()=>crypto.randomUUID(),toast:(x,label,action)=>{messages.push(x);toasts.push({message:x,label,action});},updateSyncChip:()=>{},render:()=>{},maybeReload:()=>{},canPermission:()=>true,SOLVER:null,
    pendingReload:false,remoteLoading:false,PV:null,drag:null,generalDrag:null,factoryOf,overtimeWeekdays,HOLI:{},DEF_WEEK:[false,true,true,true,true,true,true]};
  vm.createContext(ctx);
  const at=source.indexOf('function pushUndo()'),end=source.indexOf('/* ===== 5.',at),qs=source.indexOf('function queueSync(entry){'),qe=source.indexOf('// ---------- 別人改了',qs);
  const pin=source.indexOf('  "b-pin":'),pend=source.indexOf('\n  "b-del":',pin),ns=source.indexOf('function normalizeState(){'),ne=source.indexOf('async function refreshCloudSnapshot()',ns);
  const rs=source.indexOf('function remoteReloadBlocked(){'),re=source.indexOf('\nlet realtimePoll',rs);
  vm.runInContext(source.slice(at,end)+source.slice(qs,qe)+source.slice(ns,ne)+source.slice(rs,re)+'\nthis.pin=({'+source.slice(pin,pend)+'})["b-pin"];',ctx);
  return {ctx,messages,toasts};
}
test('actual handlers, queue, Store and migrated SQL keep uncertain saves pending through undo and reload',async t=>{
  const db=await makeDb();
  try{
    await db.query("insert into auth.users(id,email) values($1,'pending-block-test@invalid')",[boss]);await db.query("update profiles set role='boss' where user_id=$1",[boss]);
    async function setup(){
      const sb=new FakeSupabase(db,{test:{id:boss,password:'synthetic-only'}});await sb.auth.signInWithPassword({email:'test',password:'synthetic-only'});
      const store=new SupabaseStore(sb);await store.init();let S=await store.load();if(!S.blocks.length)S.blocks.push(structuredClone(block));else S.blocks[0].pin=false;await store.sync(S);S=await store.load();
      return {sb,store,...harness(store,S)};
    }
    const stored=async()=> (await db.query('select pinned from schedule_blocks where id=$1',[id])).rows[0].pinned;
    const changes=async()=> (await db.query('select count(*)::int n from change_sets')).rows[0].n;
    for(const loss of ['null','malformed','throw'])for(const action of ['undo-after','undo-queued','pin-after','pin-queued','no-op'])await t.test(loss+' / '+action,async()=>{
      const h=await setup(),rpc=h.sb.rpc.bind(h.sb),ready=deferred(),release=deferred(),calls=[],remembered=h.store.base,version=h.store.version,before=await changes();let first=true;
      h.sb.rpc=(name,args)=>requestQuery(async()=>{calls.push(name);const response=await rpc(name,args);if(name==='save_blocks'&&first){first=false;assert.equal(response.error,null);ready.resolve();await release.promise;if(loss==='throw')throw new Error('Synthetic lost response');return {data:loss==='null'?null:{},error:null};}return response;});
      h.ctx.pin();await ready.promise;let undo;
      if(action.endsWith('queued')){if(action.startsWith('undo'))undo=h.ctx.undo();else h.ctx.pin();}
      release.resolve();await h.ctx.syncChain;if(undo)await undo;
      if(action==='undo-after')await h.ctx.undo();if(action==='pin-after'){h.ctx.pin();await h.ctx.syncChain;}if(action==='no-op'){h.ctx.S.blocks[0].pin=false;assert.equal(await h.ctx.queueSync(null),false);}
      assert.equal(h.ctx.S.blocks[0].pin,false);assert.equal(await stored(),true);assert.equal(h.ctx.SYNC.state,'error');assert.equal(h.store.hasPendingConfirmations(),true);
      assert.equal(h.store.base,remembered);assert.equal(h.store.version,version);assert.deepEqual(calls,['save_blocks']);assert.equal(await changes(),before+1);
      assert.equal(h.messages.includes('已復原上一步'),false);assert.ok(h.messages.every(s=>s.includes('完整重新整理網頁')));assert.ok(h.toasts.every(t=>!t.label&&!t.action),'uncertain schedule must not offer ineffective Retry');
      assert.equal(await h.ctx.reloadFromStore(),'applied');assert.equal(h.ctx.S.blocks[0].pin,true);
      assert.equal(await h.ctx.queueSync(null),false);assert.equal(h.store.hasPendingConfirmations(),true);assert.equal(h.ctx.SYNC.state,'error');assert.deepEqual(calls,['save_blocks','schedule_snapshot']);
      const fresh=new SupabaseStore(new FakeSupabase(db,{test:{id:boss,password:'synthetic-only'}}));await fresh.login('test','synthetic-only');const recovered=await fresh.load();
      assert.equal(fresh.hasPendingConfirmations(),false);assert.equal(recovered.blocks[0].pin,true);recovered.blocks[0].pin=false;await fresh.sync(recovered);assert.equal(await stored(),false);
    });
    await t.test('actual old reload cannot clear an original request that will commit later',async()=>{
      const h=await setup(),rpc=h.sb.rpc.bind(h.sb);let pending;
      h.sb.rpc=(name,args)=>requestQuery(()=>{if(name==='save_blocks'){pending=structuredClone(args);return {data:null,error:null};}return rpc(name,args);});
      h.ctx.pin();await h.ctx.syncChain;assert.equal(await stored(),false);assert.equal(await h.ctx.reloadFromStore(),'applied');assert.equal(h.ctx.undoStack.length,0);
      assert.equal(await h.ctx.queueSync(null),false);const late=await rpc('save_blocks',pending);assert.equal(late.error,null);assert.equal(await stored(),true);
      assert.equal(h.ctx.S.blocks[0].pin,false);assert.equal(h.ctx.SYNC.state,'error');assert.equal(h.store.hasPendingConfirmations(),true);
    });
    await t.test('actual SQL rollback clears pending and undo remains available',async()=>{
      const h=await setup();await db.exec("create function qa_pending_reject() returns trigger language plpgsql as $$begin raise exception 'Synthetic rejected';end$$;create trigger qa_pending_reject before update on schedule_blocks for each row execute function qa_pending_reject()");
      h.ctx.pin();await h.ctx.syncChain;assert.equal(await stored(),false);assert.equal(h.store.hasPendingConfirmations(),false);
      await db.exec('drop trigger qa_pending_reject on schedule_blocks;drop function qa_pending_reject()');await h.ctx.undo();
      assert.equal(h.ctx.S.blocks[0].pin,false);assert.equal(await stored(),false);assert.equal(h.ctx.SYNC.state,'ok');assert.equal(h.messages.at(-1),'已復原上一步');
    });
    await t.test('actual beforeunload/logout guards see pending even when UI status is ok; translations explain full reload',async()=>{
      const h=await setup();h.sb.rpc=()=>requestQuery(()=>({data:null,error:null}));h.ctx.pin();await h.ctx.syncChain;
      const message=h.messages.at(-1);assert.match(message,/未存的本機調整可能需要重做/);assert.match(message,/只更新班表或按重試不會解除/);
      for(const lang of ['en','vi','th'])assert.ok(UI_TEXT[message]?.[lang]);
      Object.assign(h.ctx,{SYNC:{state:'ok'},executionRetries:{has:()=>false},addEventListener:(_,fn)=>h.ctx.beforeunload=fn});
      const at=source.indexOf('addEventListener("beforeunload"'),end=source.indexOf('\n',at);vm.runInContext(source.slice(at,end),h.ctx);
      let prevented=false;const event={preventDefault:()=>prevented=true};h.ctx.beforeunload(event);assert.equal(prevented,true);assert.equal(event.returnValue,'');
      Object.assign(h.ctx,{closeModal:()=>{},showLogin:()=>assert.fail('pending logout must not run')});h.store.logout=()=>assert.fail('pending logout must not run');
      const la=source.indexOf('case "logout":'),le=source.indexOf('break;',la);vm.runInContext('switch("logout"){'+source.slice(la,le+6)+'}',h.ctx);assert.equal(h.messages.length,2);assert.equal(h.messages.at(-1),message,'logout retains the specific recovery instruction');
    });
  }finally{await db.close();}
});
test('actual LocalStore quota failure and undo keep their existing behavior',async()=>{
  const old=globalThis.localStorage,values=new Map();let fail=false;
  globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw new Error('quota');values.set(k,v);}};
  try{
    const store=new LocalStore(),S=fromSnapshot({version:4,employees:[],machines:[],products:[],orders:[],blocks:[],calendar:{}});S.blocks.push(structuredClone(block));await store.sync(S);
    const h=harness(store,structuredClone(S));fail=true;h.ctx.pin();await h.ctx.syncChain;
    assert.equal(h.ctx.SYNC.state,'error');assert.equal(h.toasts[0].label,'重試');assert.equal(typeof h.toasts[0].action,'function');assert.equal((await store.load()).blocks[0].pin,false);fail=false;await h.ctx.undo();
    assert.equal(h.ctx.S.blocks[0].pin,false);assert.equal((await store.load()).blocks[0].pin,false);assert.equal(h.ctx.SYNC.state,'ok');assert.equal(h.messages.at(-1),'已復原上一步');
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

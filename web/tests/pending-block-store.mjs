// Shared transport fixture: establish the real Store ledger through sync(),
// never replace the pending-message getter used by UI recovery tests.
import assert from 'node:assert/strict';
import {SupabaseStore} from '../src/store/supabase.js';
import {fromSnapshot} from '../src/convert.js';
import {requestQuery} from './request-query.mjs';
export async function pendingBlockStore({pending=true,confirmationOnly=false}={}){
  const id='11111111-1111-4111-8111-111111111111',calls=[];
  const store=new SupabaseStore({rpc:(name,args)=>requestQuery(()=>{calls.push({name,args});return {data:null,error:null};})});
  store.session={user:{id:'Synthetic'},access_token:'synthetic-only'};
  const initial=fromSnapshot({version:1,employees:[],machines:[],products:[],orders:[],calendar:{},blocks:[{id,order:id,step:0,machine:'a',employee:id,date:'2030-01-01',start:480,end:540,qty:60,pinned:false}]});
  store.acceptLoaded(initial);const candidate=structuredClone(initial);candidate.blocks[0].pin=true;
  if(confirmationOnly)await assert.rejects(store.confirmExecution(id,true),e=>e.unconfirmed);
  else if(pending)await assert.rejects(store.sync(candidate),e=>e.unconfirmed);
  return {store,initial,candidate,calls};
}

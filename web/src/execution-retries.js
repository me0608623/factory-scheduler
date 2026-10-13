// Session-only reconciliation records, independent of a report dialog's lifetime.
// Never persist credentials or replay automatically; another login/client must not
// inherit the original actor's request. A page reload still discards this ledger.
export class ExecutionRetries {
  #stores = new WeakMap();
  #state(store, create=false) {
    let state=this.#stores.get(store);
    if(state&&(state.client!==store.sb||state.user!==store.session?.user?.id||state.epoch!==(store.authEpoch||0))){this.#stores.delete(store);state=null;}
    if(!state&&create){state={client:store.sb,user:store.session?.user?.id,epoch:store.authEpoch||0,requests:new Map()};this.#stores.set(store,state);}
    return state;
  }
  remember(store, request) {
    const state=this.#state(store,true);
    state.requests.set(request.blockId,{pendingRequest:request,reportOwner:{store,client:state.client,user:state.user,epoch:state.epoch},qtyDraft:request.qtyDone});
  }
  get(store, blockId) {return this.#state(store)?.requests.get(blockId);}
  has(store) {return !!this.#state(store)?.requests.size;}
  clear(store, request) {
    const state=this.#stores.get(store);
    if(state?.requests.get(request.blockId)?.pendingRequest===request)state.requests.delete(request.blockId);
  }
}

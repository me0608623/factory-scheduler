// Minimal lazy PostgREST contract for synthetic/SQL transports. Header values
// are verified separately through the actual Supabase SDK, not this adapter.
export function requestQuery(run){
  const query={setHeader(){return query;},then(resolve,reject){return Promise.resolve().then(run).then(resolve,reject);}};
  return query;
}

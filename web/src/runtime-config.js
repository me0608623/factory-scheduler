// Fail closed: test mode is always a separate cloud project, never a production fallback.
export const TEST_PROJECT_REF = 'fkefarcwadvyqqjcjxvp';
export const TEST_SOLVER_ORIGIN = 'https://factory-scheduler-solver-staging.onrender.com';

export function resolveRuntime(env = {}, location = {}) {
  const query = new URLSearchParams(location.search || '');
  const testing = query.get('mode') === 'test';
  if (testing) {
    const expected = `https://${TEST_PROJECT_REF}.supabase.co`;
    const url = String(env.VITE_TEST_SUPABASE_URL || '').replace(/\/$/, '');
    const solverUrl = String(env.VITE_TEST_SOLVER_URL || '').replace(/\/$/, '');
    if (url !== expected || !env.VITE_TEST_SUPABASE_ANON_KEY || solverUrl !== TEST_SOLVER_ORIGIN)
      throw new Error('測試環境尚未設定完成，已停止連線；不會使用正式資料。');
    if (url === String(env.VITE_SUPABASE_URL || '').replace(/\/$/, ''))
      throw new Error('測試資料庫不可與正式資料庫相同，已停止連線。');
    const key=String(env.VITE_TEST_SUPABASE_ANON_KEY);
    let secret=key.startsWith('sb_secret_');
    if(key.startsWith('eyJ'))try{secret ||= JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role';}catch{}
    if(secret)throw new Error('前端不可使用資料庫私密金鑰，已停止連線。');
    return {mode:'test',url,anon:env.VITE_TEST_SUPABASE_ANON_KEY,solverUrl,
      solverKey:String(env.VITE_TEST_SOLVER_API_KEY||''),   // staging solver 若有金鑰保護用這裡；絕不沿用正式金鑰
      authOptions:{storageKey:`fsched-test-auth-${TEST_PROJECT_REF}`}};
  }
  const localQa = env.DEV && ['localhost','127.0.0.1'].includes(location.hostname) && query.get('local') === '1';
  return {mode:localQa || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY?'local':'production',
    url:localQa?null:env.VITE_SUPABASE_URL,anon:localQa?null:env.VITE_SUPABASE_ANON_KEY,
    solverUrl:env.VITE_SOLVER_URL || 'http://localhost:8080',solverKey:env.VITE_SOLVER_API_KEY || '',authOptions:{}};
}

export function modeUrl(location, testing) {
  const u = new URL(location.href);
  if(testing)u.searchParams.set('mode','test');else u.searchParams.delete('mode');
  u.hash=''; // Never carry invitation/recovery credentials into another environment.
  return u.pathname+u.search;
}
export function authReturnUrl(location, testing){
  const u=new URL(location.href);u.hash='';u.search=testing?'?mode=test':'';
  return u.href;
}

export const RUNTIME = (()=>{
  try{return resolveRuntime(import.meta.env || {},globalThis.location || {});}
  catch(error){return {mode:'test',error,solverUrl:'',solverKey:'',authOptions:{}};}
})();
export const TEST_AVAILABLE = !!(import.meta.env?.VITE_TEST_SUPABASE_URL && import.meta.env?.VITE_TEST_SUPABASE_ANON_KEY && import.meta.env?.VITE_TEST_SOLVER_URL);

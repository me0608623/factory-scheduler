// 進入點：有設定 Supabase 就用雲端資料庫（要登入），沒有就用本機模式
import "./styles.css";
import { createClient } from "@supabase/supabase-js";
import { boot } from "./app.js";
import { LocalStore } from "./store/local.js";
import { SupabaseStore } from "./store/supabase.js";
import { tx, I18N } from "./i18n.js";
import { loadPreferences, applyPreferences } from './settings.js';
import { RUNTIME } from './runtime-config.js';
import { modeUrl } from './runtime-config.js';

// Supabase 會在建立 client 時處理並清除邀請／重設連結的 hash；先記住用途。
const authLinkType = new URLSearchParams(location.hash.slice(1)).get("type");
async function start(){
  if(RUNTIME.error)throw RUNTIME.error;
  // Constructor failures must use the same recovery UI as asynchronous reads.
  const store=RUNTIME.mode !== 'local'
    ? new SupabaseStore(createClient(RUNTIME.url,RUNTIME.anon,{auth:RUNTIME.authOptions})) : new LocalStore();
  store.environment=RUNTIME.mode;
  await boot(store,authLinkType);
}

start().catch((e) => {
  console.error(e);
  // Failure can occur before boot loads device preferences. Keep recovery legible;
  // blocked storage must not turn the recovery screen into another failure.
  try{const prefs=applyPreferences(loadPreferences());I18N.lang=prefs.language;}catch{}
  const testing=RUNTIME.mode==='test';
  document.getElementById("app").innerHTML =
    '<main class="login"><div class="login-card"><b>'+tx('啟動失敗')+'</b>'+
    (testing?'<div class="environment-banner" role="status">'+tx('測試模式 · 不影響正式資料')+'</div>':'')+
    '<div class="issue" id="startup-error" role="alert"></div>'+
    '<button class="btn primary" type="button" id="startup-retry">'+tx('重新整理後再試')+'</button>'+
    (testing?'<a class="btn test-entry" id="startup-production">'+tx('回正式資料')+'</a>':'')+'</div></main>';
  document.getElementById('startup-error').textContent=tx(String(e?.message || e || tx('啟動失敗')));
  if(testing)document.getElementById('startup-production').href=modeUrl(location,false);
  const retry=document.getElementById('startup-retry');
  retry.onclick=()=>{if(retry.disabled)return;retry.disabled=true;location.reload();};
  retry.focus();
});

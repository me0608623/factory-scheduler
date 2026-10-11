// 進入點：有設定 Supabase 就用雲端資料庫（要登入），沒有就用本機模式
import "./styles.css";
import { createClient } from "@supabase/supabase-js";
import { boot } from "./app.js";
import { LocalStore } from "./store/local.js";
import { SupabaseStore } from "./store/supabase.js";
import { tx } from "./i18n.js";
import { RUNTIME } from './runtime-config.js';

// Supabase 會在建立 client 時處理並清除邀請／重設連結的 hash；先記住用途。
const authLinkType = new URLSearchParams(location.hash.slice(1)).get("type");
const store = RUNTIME.error ? null : RUNTIME.mode !== 'local'
  ? new SupabaseStore(createClient(RUNTIME.url,RUNTIME.anon,{auth:RUNTIME.authOptions})) : new LocalStore();
if(store)store.environment=RUNTIME.mode;

const start = RUNTIME.error ? Promise.reject(RUNTIME.error) : boot(store, authLinkType);
start.catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML =
    '<main class="login"><div class="login-card"><b>'+tx('啟動失敗')+'</b><div class="issue" id="startup-error"></div><a href="/">'+tx('回正式資料')+'</a></div></main>';
  document.getElementById('startup-error').textContent=String(e.message || e);
});

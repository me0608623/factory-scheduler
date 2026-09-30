// 進入點：有設定 Supabase 就用雲端資料庫（要登入），沒有就用本機模式
import "./styles.css";
import { createClient } from "@supabase/supabase-js";
import { boot } from "./app.js";
import { LocalStore } from "./store/local.js";
import { SupabaseStore } from "./store/supabase.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
// 本機開發可用 ?local=1 做不碰雲端資料的操作驗收；正式 build 不開放此切換。
const localQa = import.meta.env.DEV && ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('local') === '1';
// Supabase 會在建立 client 時處理並清除邀請／重設連結的 hash；先記住用途。
const authLinkType = new URLSearchParams(location.hash.slice(1)).get("type");
const store = !localQa && url && anon ? new SupabaseStore(createClient(url, anon)) : new LocalStore();

boot(store, authLinkType).catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML =
    '<main class="login"><div class="login-card"><b>啟動失敗</b><div class="issue">' + String(e.message || e) + "</div></div></main>";
});

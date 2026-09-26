// 進入點：有設定 Supabase 就用雲端資料庫（要登入），沒有就用本機模式
import "./styles.css";
import { createClient } from "@supabase/supabase-js";
import { boot } from "./app.js";
import { LocalStore } from "./store/local.js";
import { SupabaseStore } from "./store/supabase.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const store = url && anon ? new SupabaseStore(createClient(url, anon)) : new LocalStore();

boot(store).catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML =
    '<main class="login"><div class="login-card"><b>啟動失敗</b><div class="issue">' + String(e.message || e) + "</div></div></main>";
});

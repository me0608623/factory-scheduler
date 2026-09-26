// 本機模式：資料存在這台電腦的瀏覽器（沒有設定 Supabase 時使用）

const KEY = "fsched-local-v1";

export class LocalStore {
  kind = "local";
  role = "boss";
  userName = "";

  async init() {
    return { needLogin: false };
  }

  async load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.employees) return s;
    } catch {}
    return null;                                   // 沒有資料 → 畫面產生示範資料
  }

  async sync(S) {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch {
      throw new Error("瀏覽器儲存空間不足或被停用");
    }
  }

  subscribe() {}                                   // 本機模式沒有其他人
  jwt() { return null; }
  async reset() { try { localStorage.removeItem(KEY); } catch {} }
}

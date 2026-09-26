// 本機模式：資料存在這台電腦的瀏覽器（沒有設定 Supabase 時使用）

const KEY = "fsched-local-v1";
const ARCHIVE_INDEX = "fsched-legacy-index-v1";
const archiveKey = id => `fsched-legacy-${id}`;

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

  async listLegacyArchives() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_INDEX) || "[]"); }
    catch { return []; }
  }

  async getLegacyArchive(id) {
    try { return JSON.parse(localStorage.getItem(archiveKey(id)) || "null"); }
    catch { return null; }
  }

  async saveLegacyArchive({ sourceName, sourceSha256, legacy }) {
    const existing = (await this.listLegacyArchives()).find(a => a.id === sourceSha256);
    if (existing) return existing;
    const dates = legacy.dates;
    const item = { id: sourceSha256, source_name: sourceName, source_sha256: sourceSha256,
      date_from: dates[0], date_to: dates.at(-1), imported_at: new Date().toISOString() };
    try {
      localStorage.setItem(archiveKey(item.id), JSON.stringify(legacy));
      localStorage.setItem(ARCHIVE_INDEX, JSON.stringify([item, ...await this.listLegacyArchives()]));
    } catch { throw new Error("瀏覽器儲存空間不足，歷史排程未存入"); }
    return item;
  }

  async reset() {
    try {
      for (const item of await this.listLegacyArchives()) localStorage.removeItem(archiveKey(item.id));
      localStorage.removeItem(ARCHIVE_INDEX);
      localStorage.removeItem(KEY);
    } catch {}
  }
}

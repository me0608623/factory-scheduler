// 整列標記（人工填色＋文字標註）：以「表:列ID」為鍵，屬個人裝置偏好
// （localStorage；雲端依專案與帳戶隔離，舊標記保留於本機模式）。與業務狀態（歸檔/已回廠/
// 待確認）分開管理，不覆蓋正式業務欄位。

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "fsched-table-marks-v1";
export const MARK_COLORS = [
  { k: "y", label: "黃" }, { k: "r", label: "紅" }, { k: "g", label: "綠" }, { k: "b", label: "藍" },
];

let getStore = () => ({kind:'local'});
let cache = null, cacheOwner = null;
export function configureTableMarks(provider) {
  getStore = provider;
  cache = null; cacheOwner = null;
}
function context() {
  const store = getStore();
  if(store?.kind === 'local') return {key:KEY,owner:KEY};
  const user=store?.session?.user?.id,project=store?.sb?.supabaseUrl;
  if(store?.kind !== 'supabase' || !user || !project) return {key:null,owner:null};
  const key=KEY+':account:'+JSON.stringify([project,user]);
  return {key,owner:JSON.stringify([key,store.authEpoch||0])};
}
export function markOwner() { return context().owner; }
function load() {
  const {key,owner}=context();
  if(owner!==cacheOwner){cache=null;cacheOwner=owner;}
  if(!key){cache=null;return {};}
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(key) || "{}") || {}; }
  catch (e) { cache = {}; }
  if (typeof cache !== "object" || Array.isArray(cache)) cache = {};
  return cache;
}
function save() {
  const {key}=context();
  if(!key)return false;
  try { localStorage.setItem(key, JSON.stringify(cache)); return true; }
  catch (e) { return false; }   // 私密模式／額滿：保留記憶體狀態，回報失敗由 UI 提示
}

export function markOf(table, id) { return load()[table + ":" + id] || null; }
export function setMark(table, id, mark, owner=markOwner()) {
  if(!owner || owner!==markOwner())return false;
  const k = table + ":" + id;
  const c = load();
  if (mark) c[k] = mark; else delete c[k];
  return save();
}
export function marksAll() { return { ...load() }; }

export function changeMarkColor(draft, color, currentNote) {
  return { ...draft, c: color, n: String(currentNote ?? draft.n ?? '').slice(0, 200) };
}

// 列屬性：class（mk-c 色帶）＋標註圖示按鈕（注入 rowact 欄）
export function markRowAttrs(table, id, extraCls = "") {
  const m = markOf(table, id);
  const cls = (m?.c ? " mk-" + m.c : "") + (m?.n ? " mk-noted" : "") + (extraCls ? " " + extraCls : "");
  return { cls: cls.trim(), noted: !!m?.n };
}
export function markBtns(table, id, txFn) {
  const T = txFn || (k => k);
  const m = markOf(table, id);
  const title = m?.n ? T("標註") + "：" + String(m.n).slice(0, 60) : T("標記／填色");
  return '<button class="mkbtn" data-act="row-mark" data-t="' + esc(table) + '" data-id="' + esc(id) + '" aria-label="' + esc(T("標記／填色")) + '" title="' + esc(title) + '">▮' + (m?.n ? '<i class="mknote">✎</i>' : "") + "</button>";
}

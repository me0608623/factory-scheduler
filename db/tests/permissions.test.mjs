// 0037 權限白名單防回歸（node:test 獨立執行，由 npm test 統一跑）
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");

test('0037：set_account_permissions 白名單涵蓋前端全部 15 個權限鍵（否則權限管理無法儲存）', () => {
  const front = ['schedule','incidents','orders','calendar','master','groups','work_contents','transfers','rush','worklog','rosters','scenarios','execution','archives','notes'].map(k=>k+'.manage');
  const sql37 = read('db/migrations/0037_permission_whitelist_complete.sql');
  const m = sql37.match(/array\s*\[([\s\S]*?)\]/);
  assert.ok(m, '0037 內找不到白名單 array');
  const allowed = m[1].match(/'[a-z_.]+'/g).map(s=>s.slice(1,-1));
  const missing = front.filter(k=>!allowed.includes(k));
  assert.deepEqual(missing, [], '0037 白名單缺少前端鍵：'+missing);
  assert.equal(allowed.length, 15, '白名單應為 15 鍵');
});

test('RPC 名稱防回歸：store 呼叫的函式名必須與 0037 建立的函式名一致（避免修到孤兒函式）', () => {
  const store = read('web/src/store/supabase.js');
  const rpcNames = [...store.matchAll(/rpc\('([a-z_]+)'/g)].map(x=>x[1]);
  const permRpc = rpcNames.find(n=>/permission/.test(n));
  assert.ok(permRpc, 'store 內找不到權限 RPC（set_account_permissions）');
  const sql37 = read('db/migrations/0037_permission_whitelist_complete.sql');
  assert.match(sql37, new RegExp('create or replace function '+permRpc+'\\b'),
    '0037 必須 replace 前端實際呼叫的 '+permRpc+'（本輪教訓：曾誤建 set_access_permissions 孤兒函式）');
  // 白名單鍵也需與 web/src/permissions.js 的 PERMISSIONS 完全對齊（只取 PERMISSIONS 陣列本身，不含職位預設）
  const permSrc = read('web/src/permissions.js');
  const permBlock = permSrc.match(/export const PERMISSIONS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(permBlock, 'permissions.js 內找不到 PERMISSIONS 陣列');
  const frontKeys = [...permBlock[1].matchAll(/'([a-z_]+\.manage)'/g)].map(x=>x[1]);
  const m = sql37.match(/array\s*\[([\s\S]*?)\]/);
  assert.ok(m, '0037 內找不到白名單 array');
  const allowed = m[1].match(/'[a-z_.]+'/g).map(s=>s.slice(1,-1));
  assert.deepEqual(frontKeys.sort(), [...new Set(allowed)].sort(), 'PERMISSIONS 與白名單鍵不一致');
});

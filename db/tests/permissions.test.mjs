
test('0037：set_access_permissions 白名單涵蓋前端全部 15 個權限鍵（否則權限管理無法儲存）', async () => {
  const { createDb } = await import('./helpers.mjs').catch(() => ({}));
  const front = ['schedule','incidents','orders','calendar','master','groups','work_contents','transfers','rush','worklog','rosters','scenarios','execution','archives','notes'].map(k=>k+'.manage');
  // 從 0026/0027/0037 的 SQL 抽出最後定義的白名單
  const sql37 = fs.readFileSync('db/migrations/0037_permission_whitelist_complete.sql','utf8');
  const m = sql37.match(/array[(.*?)]/s);
  const allowed = m[1].match(/'[a-z_.]+'/g).map(s=>s.slice(1,-1));
  const missing = front.filter(k=>!allowed.includes(k));
  assert.deepEqual(missing, [], '0037 白名單缺少前端鍵：'+missing);
  assert.equal(allowed.length, 15, '白名單應為 15 鍵');
});

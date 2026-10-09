# 過夜開發待辦清單

依優先級排序（P0 最高）。每項完成後打勾並記錄 commit。

## P2（重要改善）

- [x] 登入頁 backdrop/3D rAF 記憶體洩漏（→ `fc7a87f`）
- [ ] ~~檢查即時同步連線中斷恢復~~（Supabase client 自帶重連，非緊迫）

## P3（i18n / 品質）

- [x] 23 個 modal 標題翻譯（→ `0721cd8`）
- [x] 2 個三頁表格 action 標題翻譯（→ `6cd8afb`）
- [x] 剩餘寫死中文 modal 標題（→ `645ac29`）：15 處全數 tx() 化（含複合變數式），tx() 新增 `{x}` 佔位參數支援，UI_TEXT +22 鍵（現 317 唯一鍵，原紀錄 302 與實際不符）；另補 `給二廠／回一廠`、`工作紀錄` 兩個 TABLE_TITLES 字典鍵。**剩餘範圍**：操作紀錄 `commit({title:"中文"+變數})` 的 log 標題屬歷史資料層（寫入當下語言），非 modal 標題，如需翻譯須另設計顯示層映射
- [x] help modal 章節標籤翻譯（→ b3b2d59，含 59 條內文全翻譯）
- [x] CSS 死碼清理（→ `c467286`）：23 個零引用類別全數驗證後移除（53 規則＋14 群組選擇器，-4.5KB/-5.6%）；動態組合類（rs-*/nav-*/tour-up/down 共 11 個）經逐一比對 JS 組合點後保留；新增 `css-structure.test.mjs` 3 測試（括號平衡＋動態類存在＋死碼不回流）
- [x] 平面圖 canvas 文字（→ `6dd3739`）：canvas「故障」標籤與 tooltip/toast「當日無排程」tx() 化（+鍵 en/vi/th、1 防回歸測試）；機台名稱/工單摘要屬使用者資料依設計不翻

## Phase 3（Solver 驗證）— 本機受限

- [x] Solver pytest 已在 CI（tests.yml solver job，ubuntu + uv run --frozen pytest）— 原清單過時
- [x] CP-SAT 邊界案例（→ `6dd3739`）：test_edges.py 4 條（空工單/單工單完成最後一站/全部逾期仍產可行解/全空工廠），CI solver job 綠
- [ ] 效能基準（不同工單數量的解算時間）
- [ ] 9-26 快照疑點①：插單＋加班的候選方案評分——W07 情境方案 C 顯示「延誤 1」仍列為可套用選項，應過濾或降級不可行方案（見 docs/TEST_STATUS.md，未經重測不假定仍存在）
- [ ] 9-26 快照疑點②：故障後排程出現 10 分鐘零碎工作段——需最短工作段規則或換模／切換成本（同上需 solver 環境重現）
- 註：本機 uv 環境損壞（trampoline spawn 失敗），上述各項只能在 CI 跑，暫緩

## Phase 4（效能）

- [x] Bundle 分析（main 210K gz、three/excel lazy ✓）
- [x] render() 500+ 方塊實測（→ 見 OVERNIGHT_PROGRESS 輪次 50）：空日 ~25ms、100 方塊 ~45ms、525 方塊 ~260ms，線性成長，可接受不需修
- [x] localStorage 大量資料限制檢查（→ `3c44581`，main `5976fe0`）：寫入路徑全有 quota 防護＋友善錯誤；本次補讀取側（情境清單/單筆）對「儲存被停用、JSON 損毀」退回空值、歷史檔索引寫入失敗回滾不留孤兒；瀏覽器單 origin 約 5MB 上限、情境 20 筆上限、主資料單鍵整體覆寫（失敗不損舊值）

## 已確認安全（不需修復）

- 版本衝突（40001）處理鏈完整
- 權限矩陣（boss/lead/worker/viewer）邏輯正確
- 空資料狀態不崩潰
- null safety 全覆蓋（find() 均有 fallback）
- Solver 26 條驗證規則覆蓋完整
- 正式站健康（web 200/solver 200）

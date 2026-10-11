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
- [x] 效能基準（→ 48e7467）：test_perf_smoke.py——10/30/60 工單合成工廠解算有界（<30s 煙霧上限），CI solver job 綠；正式基準手動跑 scripts/benchmark.py
- [x] 9-26 快照疑點①（→ 0ea3809）：plans.py order 事件——新工單 _finish 判定 late/part 即加診斷降級為不可套用（完成日＋建議文案）；回歸測試進 test_edges.py；CI solver job 綠（83 既有測試不破）
- [x] 9-26 快照疑點②（→ PR #7 feat/soft-switching-cost，待人工審核合併）：Soft Switching Cost 軟性成本＋量測模組＋19 測試，分支 CI 綠（solver 165 passed）；生產權重為溫和導引、交期零退化；完整報告 docs/agent/OVERNIGHT_REPORT_SWITCHING.md
- 註：本機 uv 環境損壞（trampoline spawn 失敗），上述各項只能在 CI 跑，暫緩

## Phase 4（效能）

- [x] Bundle 分析（main 210K gz、three/excel lazy ✓）
- [x] render() 500+ 方塊實測（→ 見 OVERNIGHT_PROGRESS 輪次 50）：空日 ~25ms、100 方塊 ~45ms、525 方塊 ~260ms，線性成長，可接受不需修
- [x] localStorage 大量資料限制檢查（→ `3c44581`，main `5976fe0`）：寫入路徑全有 quota 防護＋友善錯誤；本次補讀取側（情境清單/單筆）對「儲存被停用、JSON 損毀」退回空值、歷史檔索引寫入失敗回滾不留孤兒；瀏覽器單 origin 約 5MB 上限、情境 20 筆上限、主資料單鍵整體覆寫（失敗不損舊值）

## P3（長尾 i18n）

- [x] 可見中文字串全面 i18n（→ 本輪結案）：432 為掃描片段假象——HELP 區 55 條「缺鍵」全是完整步驟字串在 <b>／「」邊界被切碎的片段，完整字串鍵 59 條已全（抽驗 5/5；既有 help 內文測試把關）；EN 實測說明頁全英文、導覷 People ✓；殘留＝品牌「產線排程」（刻意不翻）＋1 程式碼假象；新增棘輪測試凍結真實未翻譯數＝0

## 已確認安全（不需修復）

- 版本衝突（40001）處理鏈完整
- 權限矩陣（boss/lead/worker/viewer）邏輯正確
- 空資料狀態不崩潰
- null safety 全覆蓋（find() 均有 fallback）
- Solver 26 條驗證規則覆蓋完整
- 正式站健康（web 200/solver 200）


## 2026-10-11 全併確認

- PR #7-#14 全部 MERGED；#14（排程縮放）含手勢強化 67047f8 已部署正式站
- 日／週切換：保留工具列手動，不自動跳週（使用者確認 2026-10-11）

## 待使用者設定（機器無法代勞）

- [ ] **RENDER_STAGING_WEB_DEPLOY_HOOK**：Render → factory-scheduler-web-staging → Settings → Create Deploy Hook → 貼到 GitHub Secrets。設好後 staging web 可用「部署 Render staging 網站」workflow 手動更新（目前 staging 跑的是 10/11 前的舊版）
- [ ] **正式站測試模式啟用**：Render web 服務加 VITE_TEST_* 三變數（見 docs/TEST_MODE.md）

## 依賴升級待辦（破壞性跨度，需獨立輪驗證）

- [ ] pglite 0.3.16 → 0.5.8：影響 web/tests/fake-supabase.mjs 的 PGlite 沙箱（db 層測試基礎）；升級需全跑 web+db 測試並確認 SQL 相容
- [ ] saxes 5 → 6：Excel XML 解析（exceljs 相依）；major 版需匯入匯出回歸測試

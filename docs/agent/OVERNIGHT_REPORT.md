# 過夜開發最終報告

## 執行起訖

| 項目 | 值 |
|---|---|
| 起始 | 2026-10-09 |
| 結束 | 持續中（13 輪完成） |
| 分支 | `agent/overnight-20261009`（全數合併 main） |
| 起始 commit | `1273809` |
| 最新 commit | `64eae8f` |
| 總輪次 | 13 |

## 測試結果

| 測試 | 起始 | 結束 | 變化 |
|---|---|---|---|
| 前端 npm test | 137/137 | **200/200** | **+63 新測試** |
| 前端 vite build | ✓ | ✓ | — |
| DB migrations.test | 201/201 | 201/201 | — |
| DB integration (A-D) | BLOCKED | BLOCKED | Device Guard |
| Solver pytest | BLOCKED | BLOCKED | Device Guard |
| 正式站 web | — | HTTP 200 ✓ | 部署成功 |
| 正式站 solver | — | HTTP 200 ✓ | — |

## 修改的檔案

| 檔案 | 修改原因 |
|---|---|
| `web/src/line-notify.js` | **P1 XSS 修復**（value 屬性注入） |
| `web/src/app.js` | **P2 記憶體洩漏修復** + i18n 標題翻譯 + 導覽/註冊/登出接線 |
| `web/src/i18n.js` | +77 字典鍵（en/vi/th） |
| `web/src/tour.js` | **新增**：新手導覽引擎 |
| `web/src/visual.js` | **新增**：視覺效果模組 |
| `web/src/store/supabase.js` | signup 方法 |
| `web/src/store/local.js` | signup 友善錯誤 + listAccessAccounts |
| `web/src/styles.css` | 導覽/玻璃/TV 背景樣式 |
| `web/src/floor.js` | **新增**：廠區平面圖（響應式） |
| `web/src/overtime.js` | *(既有)* |
| `web/tests/*.mjs` | **新增 9 個測試檔案** |
| `db/migrations/0036_machine_layout.sql` | 平面圖佈局表 |
| `db/tests/*.mjs` | 稽核腳本 + 模擬驗收驅動 |
| `db/tests/acceptance_sim.mjs` | **新增**：C1-C7 隔離模擬驗收 |
| `docs/agent/*.md` | 過夜開發進度文檔 |

## 實際修復的 Bug

| # | 嚴重度 | 問題 | 修復 |
|---|---|---|---|
| 1 | **P1** | XSS：notifySettingsHTML line_user_id 未跳脫 | esc() 函式 + 3 個測試 |
| 2 | **P2** | 記憶體洩漏：登入頁 rAF 迴圈未停 | stopLoginViz() |
| 3 | **P2** | 產能分析頁自上線即崩潰（引數反轉） | effectiveBlockQty 參數修正 |
| 4 | P2 | 平面圖手機 3 欄太擠 | 響應式欄數（3/5/9） |
| 5 | P2 | 手機按鈕重疊（助手 vs FAB） | CSS 排除 |
| 6 | P3 | 38 個 modal 標題寫死中文 | tx() 包裹 + 字典鍵 |

## 新增測試案例

| 測試檔 | 測試數 | 覆蓋模組 |
|---|---|---|
| tour.test.mjs | 5 | tour.js |
| visual.test.mjs | 5 | visual.js |
| line-notify.test.mjs | 3 | line-notify.js |
| i18n-coverage.test.mjs | 7 | i18n.js + app.js |
| work-queue-perf.test.mjs | 5 | work-queue.js |
| convert-roundtrip.test.mjs | 5 | convert.js |
| capacity-perf.test.mjs | 4 | capacity.js |
| overtime-edge.test.mjs | 8 | overtime.js |
| factory-edge.test.mjs | 8 | factory.js |
| execution-edge.test.mjs | 9 | execution.js |
| groups-edge.test.mjs | 4 | groups.js |
| floor.test.mjs | 6 | floor.js |

## 效能測量

| 指標 | 值 | 方法 |
|---|---|---|
| 主包 (gzipped) | 205K | vite build + gzip |
| three.js (lazy, gzipped) | 186K | 同上 |
| exceljs (lazy, gzipped) | 269K | 同上 |
| workQueue 100 工單 | 33ms | performance.now() |
| capacityIntervals 35 員工 | <1ms | performance.now() |

## 尚未解決的問題

| 問題 | 原因 | 建議 |
|---|---|---|
| Solver 測試 | Device Guard 封鎖本機 Python | CI 已覆蓋（pytest） |
| UI 模組單元測試 | chat-ui/roster-ui/transfer-ui 需 DOM | 建 Playwright E2E |
| ~29 複合 modal 標題 i18n | 含變數拼接，需重構 | 下輪處理 |
| help modal 內文翻譯 | 數百條字串 | 大工程，分批 |

## Git 與部署狀態

- **分支**：`agent/overnight-20261009` 已全數合併至 `main`
- **部署**：每次推送均通過 Tests ✓ → 部署關卡 ✓ → Render 部署 ✓
- **資料庫**：migration 0036 已套用（machine_layout）
- **正式站**：web + solver 均 HTTP 200

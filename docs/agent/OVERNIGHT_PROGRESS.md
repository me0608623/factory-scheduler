# 過夜開發進度（2026-10-09 起）

## 執行狀態

| 項目 | 值 |
|---|---|
| 分支 | `agent/overnight-20261009`（全數合併至 main） |
| 最新 main commit | `e04189b` |
| 總輪次 | 9 |
| 時間 | 2026-10-09 |

## 最終測試結果

| 測試 | 基準 | 最終 | 變化 |
|---|---|---|---|
| 前端 npm test | 137/137 | **171/171** | **+34 新測試** |
| 前端 vite build | ✓ | ✓ | — |
| DB migrations.test | 201/201 | 201/201 | — |
| Solver pytest | BLOCKED | BLOCKED | Device Guard |
| 正式站 web | — | HTTP 200 | ✓ |
| 正式站 solver | — | HTTP 200 | ✓ |

## 檔案修改統計
21 files changed, 1017 insertions(+), 103 deletions(-)

## 已修復的問題

| # | 嚴重度 | 問題 | Commit |
|---|---|---|---|
| 1 | **P1** | **XSS**：notifySettingsHTML 的 line_user_id/line_group_id 未跳脫，攻擊者可注入 HTML/JS | `acffa5f` |
| 2 | **P2** | **記憶體洩漏**：登入頁 backdrop/3D 場景的 rAF 迴圈在登入成功後未停止 | `fc7a87f` |
| 3 | P3 | 38 個 modal/help 標題寫死中文（含 EDD/SPT/CR 排程術語） | `0721cd8` `6cd8afb` `e54a204` |
| 4 | P3 | i18n 覆蓋率測試邏輯不正確（只計未翻譯的分母） | `e54a204` |

## 新增測試覆蓋

| 模組 | 測試數 | 重點 |
|---|---|---|
| tour.js | 5 | placement 邊界（上/下/左/右夾持）、步驟完整性、安全降級 |
| visual.js | 5 | SVG 結構、reduced-motion、Node 環境降級、mount3D |
| line-notify.js | 3 | 表單結構、**XSS 防護** |
| i18n-coverage | 5 | 字典完整性（四語）、覆蓋率門檻 ≥60%、防回歸 |
| work-queue | 5 | 100 工單 <100ms 效能、逾期標記、setupPending、缺產品 |
| convert.js | 5 | round-trip 資料完整性、備註保留、confirmed 旗標、machine_layout |
| capacity.js | 4 | 35 員工 <50ms、整天請假、排除邏輯 |

## 安全掃描結論

| 項目 | 結果 |
|---|---|
| XSS | **唯一漏洞已修復**（line-notify.js value 屬性注入） |
| 版本衝突 | 序列化 promise chain + 衝突自動重載 ✓ |
| 權限矩陣 | 前端 effectivePermission + DB RLS 一致 ✓ |
| 同步機制 | structuredClone snapshot 隔離 ✓ |
| 記憶體 | 登入頁洩漏已修復；無其他洩漏 ✓ |
| 空狀態 | 全模組不崩潰 ✓ |
| Null safety | find() 均有 fallback ✓ |

## 效能分析

| 指標 | 值 | 評估 |
|---|---|---|
| 主包 (gzipped) | 205K | 合理（30+ 模組） |
| three.js (lazy, gzipped) | 186K | 僅登入頁載入 ✓ |
| exceljs (lazy, gzipped) | 269K | 僅匯入匯出時載入 ✓ |
| workQueue 100 工單 | 33ms | ✓ |
| capacityIntervals 35 員工 | 0ms | ✓ |

## 環境限制
- Solver 測試：Windows Device Guard 封鎖 .venv python（CI 已覆蓋）
- 本機整合測試：同上

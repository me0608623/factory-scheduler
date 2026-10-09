# 過夜開發進度（持續）

## 執行狀態
- **分支**: `agent/overnight-20261009`（全數合併 main）
- **最新 main**: `57bde77`（輪次 53 推送；期間使用者平行推送 3d2bc58→0e5fb87 fix-account 除錯，自動 merge 無衝突）
- **main 總 commits**: 325（輪次 53 文件推送後）
- **總輪次**: 53
- **正式站**: web 200 ✓ solver 200 ✓

## 測試
- 前端: **228/228** PASS
- DB: **206/206** PASS
- 合計: **434**

## Bug 修復（10 項）
1. **P1** XSS（line-notify）
2. **P2** 記憶體洩漏（登入 rAF）
3. **P2** 產能分析崩潰（引數反轉）
4. **P2** 平面圖手機排版
5. **P2** 按鈕重疊
6. **P2** 設定 vi/th 顯示中文
7. **P2** machine_layout 缺即時同步
8. **P2** i18n 字典 CRLF 行尾導致補丁靜默失敗（149 鍵遺失）
9. **P3** 54 modal 標題中文
10. **P3** 看板 tooltip 中文

## i18n 覆蓋
- **UI_TEXT**: 317 鍵（en/vi/th，唯一鍵實算；舊紀錄 302 為概數）
- **SETTINGS_TEXT**: 24 鍵 × 4 語言
- **覆蓋**: modal/form/dt/heading/button/tooltip/aria/placeholder/option/hint/empty/status/flag
- **tx() 呼叫**: 227 個（225 有字典鍵）

## 功能
- 新手導覽（8 步 spotlight）
- 註冊/登出
- 廠區平面圖（響應式 Canvas）
- 視覺效果（WebGL/液態Logo/玻璃）
- 即時同步 21 表

## 輪次 48-49（2026-09-30 續）
- **fromSnapshot(null/undefined) 防護**（→ `cdb6b6e`）：空輸入回傳可用狀態，補 1 測試
- **help modal 內文全翻譯**（→ `b3b2d59`）：59 條步驟+提示補齊 en/vi/th，渲染包 tx()，2 條防回歸測試
- 前端測試：**218/218** PASS（216→218）
- **UI_TEXT**: 243 → **302 鍵**（en/vi/th）
- 生產健康：web 200 / solver 200（兩次推送後均驗證）

## 輪次 50（2026-09-30 續）— 效能實測

- **render() 大量方塊實測**（真實瀏覽器、本機 dev server、注入壓力資料集）：
  - 空日：~25ms；100 方塊：37–72ms（中位 ~45ms）；525 方塊（含 480 衝突）：~255–270ms
  - 成長線性（約 0.45ms/方塊 + 25ms 基底），非 O(N²) 瓶頸
  - 結論：可接受，不需修。真實工廠單日鮮少超過 100 方塊；手機 525 方塊估 2–3 倍（~0.5–0.8s）屬罕見極端
  - 測後已還原示範資料（localStorage 清除重建，demo:true）
- NEXT_TASKS 修正：Solver pytest 其實已在 CI（tests.yml solver job）

## 輪次 51（2026-10-09）— localStorage 限制檢查（Phase 4）

- **檢查結論**：寫入路徑（sync/reportExecution/confirmExecution/saveScenario/saveLegacyArchive/updateProfile）原本就有 quota 防護與友善錯誤；主資料 `fsched-local-v1` 單鍵整體覆寫，寫入失敗時 localStorage 保留舊值不損資料。瀏覽器單 origin 約 5MB、情境上限 20 筆，本機示範規模下不易觸頂
- **修補破口**（→ `3c44581`，main `5976fe0`）：
  - `listScenarios`/`getScenario`/`saveScenario` 讀取側無防護 → 儲存被停用（SecurityError）或 JSON 損毀時退回空值不崩潰，損毀的情境鍵可在下次保存時恢復
  - `saveLegacyArchive` 先寫資料再寫索引 → 索引寫入失敗時回滾刪除資料鍵，不留孤兒佔空間
- 新增 `web/tests/local-storage.test.mjs` 5 測試（停用/損毀/quota/回滾/成功路徑）
- 前端測試：**218 → 223** PASS
- 附帶：上輪滯留 agent 分支的 2 個 docs commit（e60172a、c60bf16）已隨本輪 merge 進 main
- Solver 邊界驗證維持暫緩：本機 uv 環境損壞（trampoline spawn 失敗），僅 CI 可跑

## 輪次 52（2026-10-09）— 複合變數 modal 標題 i18n 結案（P3）

- **tx() 新增佔位參數**：`tx('鍵',{x:值})` 以 `{x}` 替換（值由呼叫端自行跳脫；zh-TW fallback 即原文鍵代入後輸出，與原字串組裝完全一致）
- **15 處寫死中文標題全數 tx() 化**（→ `645ac29`，main `b079185`）：手動排班日期標題、手動排班預覽×2、加班設定、員工/機台/工單新增與編輯標題、`{date} 有 {n} 個問題`、Excel 匯入×2、`{name} 請假`、`{name} 整月班表設定`、三頁表格新增/編輯、工作內容設定×2、一般工作排班×2、方案比較 drawer
- **UI_TEXT +22 鍵 → 317 唯一鍵**（en/vi/th 三語齊）；補 TABLE_TITLES 缺的 `給二廠／回一廠`、`工作紀錄`；發現字典既有 `刪除` 重複鍵（合法、後者生效，未動）
- 新增 2 條防回歸測試（佔位替換含 zh fallback／22 鍵三語齊全）；`title:tx(` 覆蓋數 59→66
- 前端測試：**223 → 225** PASS
- 剩餘：操作紀錄 log 標題（歷史資料層，NEXT_TASKS 已註明非 modal 範圍）、CSS 死碼清理（P3）
- 環境注意：使用者平行在 agent/main 上活動（faf88bb、1f624dd fix-account 500 除錯），本輪 merge 一併帶上 main；後續輪次同步需先 fetch 看 main 是否前進

## 帳號建立 runbook（2026-10-09）
- 建立 `create-account.yml`（workflow_dispatch + 臨時 secret `BOSS_TEST_PW`，DB 端 bcrypt，密碼不進 git/日誌）
- 直接 insert auth.users 有兩個坑：`instance_id` 需補 `00000000-...`、token 欄位要空字串（非 NULL）且 identity_data 需含 `phone_verified`——`fix-account.yml` 已含完整修補步驟
- 已建立：a2a.richard@gmail.com（Richard，boss，登入驗證 200）
- 臨時 secret 已刪；兩工作流在無 secret 時自動失效，保留作為未來建帳號工具

## 輪次 53（2026-10-09）— CSS 死碼清理結案（P3）

- **方法**：萃取 styles.css 全部 446 個 class，對全 repo JS/HTML 做子字串交叉比對得 34 個零引用候選；再逐一排查動態組合風險（`'rs-'+type`、`'nav-'+page`、`"tour-"+arrow` 等），救回 11 個活碼
- **移除**（→ `c467286`，main `57bde77`）：23 個真死碼類別＝53 條規則＋14 個群組選擇器（`.tf-board,.rush-table` 只刪後者），80598→76069 bytes（-5.6%）。涵蓋舊版工具列（more-tools/toolset/top-actions/mobile-only/reference-panel）、舊 rush 表樣式（rush-table/row/sec/f1/f2）、side-chrome、drawer-grip/zoom、codelink、urgent-tag 等
- **除錯教訓**：CSS 剖析器判斷 @media 時未先剝除前置註解（`/* 註解 */\n@media(...)` 的 trim() 開頭是 `/*`），導致誤判為普通規則、括號級連錯位——用「body 含 1 個以上括號即報警」的儀器化定位後修正
- **防回歸**：新增 `web/tests/css-structure.test.mjs` 3 測試（括號平衡、動態組合類存在、死碼不回流）
- 前端測試：**225 → 228** PASS
- 剩餘待辦：平面圖 canvas 中文機器名（資料層）、solver 兩項（uv 壞，CI 限定）；操作紀錄 log 標題屬歷史資料層已註明非範圍

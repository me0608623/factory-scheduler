# 上線前驗收報告（2026-09-30）

**上線建議：可以上線（受控啟用）。** 候選版已在獨立 Supabase／Render staging 完成核心雲端路徑驗收，修復後的同一提交 `454b855e66f0ebb58241f4e3c3c946676f5b7cac` 已部署到正式前端與正式 OR-Tools 服務。正式資料仍維持 `setup_pending = true`，所以名冊、技能、工時尚未核定前，「故障／請假」及「自動排班」會保持停用；這是刻意的安全閘門，不是功能故障。

## 環境與範圍

- 技術棧：Vite／原生 JavaScript、Supabase Auth/Postgres/Realtime、FastAPI／OR-Tools、PGlite 整合測試。
- 隔離測試環境：`https://factory-scheduler-web-staging.onrender.com`、獨立 Supabase `factory-scheduler-staging`、獨立測試帳號與合成資料；未碰正式資料。
- 正式環境：`https://factory-scheduler-web.onrender.com` 與 `https://factory-scheduler-solver.onrender.com`，兩者皆由 Render 顯示提交 `454b855` 為 Live。
- 正式資料庫更新前已建立完整自訂格式備份：`C:\Users\me060\Downloads\factory-scheduler-backups\supabase-pre-release-20260930-qa.dump`，649,923 bytes，`pg_restore --list` 成功，SHA-256 `E756D12A22E18FB39071110AB45E13B95F7F6251CAB66DD9F8E890A2053E90D7`。
- 完整控制、啟用條件、預期行為、JS／API 依賴與關鍵路徑見 [元件盤點](QA_COMPONENT_INVENTORY_2026-09-30.md)。

## 1. 元件／路徑盤點摘要

正式前端是單頁 `/`，登入、邀請及密碼復原使用同頁狀態與 hash。已盤點首頁導覽、廠別／日週／設備工作檢視、班表方塊與拖曳預覽、員工／機台／工單／產品／分組／一般工作、故障請假急單、自動方案、跨廠加工與批次、輪班草稿、現場回報、未排工作、情境、Excel 匯出匯入、歷史班表、聊天與帳號。根目錄舊原型 `index.html` 另列，非正式路由。

本輪操作驗證集中於會阻斷上線的核心路徑；盤點表中的每個重複資料列並不代表逐列人工點過。

## 2. 問題清單（依嚴重度）

### Blocker

目前沒有未解 Blocker。實際在 staging 發現的 Supabase singleton `UPDATE` 無 `WHERE` 問題已修復並以 migration `0025_safe_singleton_updates.sql` 驗證；8 個狀態寫入函式均已帶安全條件，正式資料筆數在 migration 前後一致。

### Major

目前沒有未解 Major。先前的彈窗焦點、Excel 匯入鍵盤入口、跨層測試提前中止，以及組長看到可操作但實際不可儲存的主檔 toggle，均已修復並回歸通過。

### Minor

1. **Safari／iOS Safari 尚未實機驗證。** 位置：全站彈窗、拖曳、Excel 檔案選擇與下載。重現：目前測試主機為 Windows，只能使用 Chromium 與 390×844 模擬視窗。預期：iPhone Safari 的點擊、檔案選擇、下載與焦點行為一致。實際：未驗證。影響：不阻斷桌面 Chrome 上線，但行動 Safari 仍有相容性風險。建議：正式現場啟用前以一台 iPhone 走一次人工清單。
2. **部分次要行動控制低於建議觸控高度。** 位置：基本資料中的文字連結及部分「新增」控制。重現：390×844 檢查控制邊界，部分約 26–38 px 高。預期：常用觸控目標約 44 px。實際：核心按鈕可用，但次要入口較小。影響：長者或手指操作較不易精準點選。建議：後續統一設定最小高度與間距。
3. **完全停用 JavaScript 時缺少明確提示。** 位置：`web/index.html`。重現：停用 JavaScript 或阻擋入口 module。預期：顯示「此系統需要 JavaScript」。實際：靜態入口只有 `#app`，可能留下空白頁。影響：腳本被阻擋時使用者不容易判斷原因。建議：加入 `noscript` 與啟動失敗提示。
4. **ExcelJS 依賴有兩項 moderate advisory。** 位置：`web/package-lock.json`，ExcelJS 間接依賴 `uuid`。重現：`npm audit --omit=dev`。預期：無已知高／重大弱點。實際：0 high、0 critical、2 moderate；自動修法會要求破壞性降版 ExcelJS，未套用。影響：目前用法未證實可被利用，但需追蹤上游更新。建議：升級前先用匯出／匯入回歸檔驗證，不直接執行 `audit fix --force`。

### Nit

5. **正式建置仍有大 chunk 警告。** 位置：Vite build，main 約 514 KB、Excel 約 951 KB。重現：`npm run build`。預期：較舊裝置也能快速進入主畫面。實際：建置成功，Render 亦已上線，但 Vite 提示超過 500 KB。影響：可能增加首次使用 Excel 功能的等待。建議：量測現場網路後再決定拆分 Excel 模組。

## 3. 已驗證通過的關鍵路徑

- 自動測試：前端 104/104、資料庫 172/172、排程服務 124/124；跨層 `test:integration:all` 的 A–D 全部完成；正式建置成功。
- 彈窗鍵盤：開 Excel 視窗後焦點進入彈窗，連續 Tab 不會跑到背景，Esc 關閉後回到「匯出 Excel」。匯入按鈕可用 Enter 開啟檔案選擇器。
- staging 老闆：登入後由 OR-Tools 產生 A／B／C 方案，套用 A 成功，產生 18 項調整並顯示於班表。
- staging 即時同步：第二個已開分頁收到「有新的變更」並載入最新版本。
- staging 組長：可使用排程、故障與自動排班；基本資料欄位及 toggle 均為原生 disabled，不能產生假編輯狀態。
- staging 員工／唯讀：只能查看；員工可進現場回報，兩者都沒有手動排班、故障及自動排班權限。
- staging 未登入：只顯示登入頁；測試使用者由 staging 專案建立，不寄真實郵件。
- staging 行動版：390×844 下核心功能收進「更多功能」，故障、自動排班與現場回報仍可到達。
- 正式 Supabase：先備份再套用 migration；8/8 singleton 寫入函式安全，版本、`setup_pending`、35 位員工、50 台設備、7 張工單、0 個排程方塊在更新前後一致。
- 正式 Render：前端與 solver 皆為 `454b855` 且 Live。公開前端 GET 200；solver `/health` 回傳 OR-Tools `9.15.6755`、database `true`；正式快照端點 `/solve`、`/plans` 皆回 403，未暴露測試入口。
- 正式瀏覽器唯讀 smoke：登入狀態載入 1／2 廠真實名冊，顯示已同步；`setup_pending` 文案與停用控制正確，未執行任何正式排程寫入。

## 4. 無法驗證的項目與原因

- Safari／iOS Safari：Windows 測試機無 Safari，只完成 Chromium 與模擬行動寬度。
- 邀請信／忘記密碼郵件的實際送達：為避免寄信及更動正式帳號，本輪未觸發。
- 正式環境的排程套用與現場回報寫入：正式資料仍待核定，安全閘門刻意阻止；這些寫入已在隔離 staging 驗證。
- 兩廠運送點收、兩人同機產能與夜班工時的真實規則：目前沒有經現場確認的基準，系統保持待確認，不把推測寫入正式排程。
- 每個低頻彈窗的所有非法值、連點、離線、5xx 及競態組合：已有單元／整合覆蓋，但未逐一人工點完；未驗證的項目不宣稱通過。

## 5. 上線前仍建議人工再點一次

1. 用正式帳號確認 1 廠、2 廠、跨廠、日班表與週班表能讀取；不要在名冊核定前解除 `setup_pending`。
2. 在 iPhone Safari 與現場 Android／Chrome 各開一次 Excel 彈窗、檔案選擇器、「更多功能」及班表橫向捲動。
3. 現場核定人員別名、設備／左右工位、技能、上班日、加班與夜班規則；核定後才啟用故障、手動及 OR-Tools 排程。
4. 啟用當天先用一張非急單走「預覽 → 取消」，再走「預覽 → 套用 → 第二分頁同步」，核對紀錄與 Excel 匯出。
5. 更換先前曾在聊天中出現過的資料庫密碼；備份檔留在本機安全位置，勿上傳 Git。

本報告記錄的是提交 `454b855` 的 release gate。程式可公開上線；工廠正式排程啟用仍由 `setup_pending` 與現場資料核定分開把關。

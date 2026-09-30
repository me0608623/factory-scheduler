# 上線候選版互動盤點（先於操作測試）

基準：`454b855e66f0ebb58241f4e3c3c946676f5b7cac`（2026-09-30 staging 驗收與正式部署版）。本表列出程式碼中可辨識的**控制種類**；同一控制在多筆員工、機台、工單或日期上重複出現時，以資料列作測試參數，不把每筆資料誤認成新元件。盤點不等於驗證通過；實際通過與未驗證範圍見 [Release Gate 報告](QA_RELEASE_GATE_2026-09-30.md)。

## 頁面、入口與依賴

| 頁面／入口 | 條件 | 狀態與依賴 |
| --- | --- | --- |
| 正式版 `/` | `web/index.html`、`web/src/main.js`；無客戶端 pathname router | Vite + 原生 JS；設定 `VITE_SUPABASE_URL`／anon key 時進入 Supabase 登入與雲端資料模式，否則使用 LocalStore。主要 UI 由 `app.js` 重繪。 |
| 正式版 `/#type=invite`、`/#type=recovery` 等驗證連結 | Supabase 邀請／重設密碼後 | `main.js` 在 SDK 清理 hash 前記錄用途，再交由 `boot`／`SupabaseStore` 處理；不是獨立頁。 |
| 正式版登入／啟動錯誤狀態 | 尚未登入、憑證過期、啟動失敗 | `showLogin`、`boot`，Supabase Auth；啟動例外顯示錯誤卡。 |
| 舊原型 `index.html` | 獨立靜態檔；不經正式版入口 | 自含 JS 與 localStorage 草稿；舊式「儲存」流程，不具正式版雲端權限與跨廠功能。 |
| 排程 API | 非瀏覽器頁面 | `GET /health`；`POST /plans/db`、`/roster/plans/db`、`/chat/db`；快照版 `/solve`、`/plans`、`/roster/plans`、`/chat` 僅供受控本機／測試，正式配置應禁用。 |

正式版共用條件：`readOnly`／`canMaster`／`canArchive` 控制老闆、組長、員工、唯讀角色；`setupPending` 阻止未核定名冊進入排程；方案預覽 `PV` 阻止改動基準資料；`commit` 經 LocalStore 或 SupabaseStore 寫入。按鈕上 `disabled` 及未渲染兩種限制都須實測，不能只依畫面判斷權限。

## 正式版首頁與班表

| 控制（`data-act` 或 DOM） | 可用條件／預期行為 | 處理函式、後端或儲存 |
| --- | --- | --- |
| `factory` 三選一、`staff-group-filter` | 切換 1 廠、2 廠、跨廠；群組只篩員工名冊，不能改掉其他機台排程；保留廠別偏好 | `setFactory`、`render`、localStorage；不寫正式排程 |
| `prev`、`next`、`today`、`pick`／`datepick`、`goto` | 按日／週移動、選日期、跳到方塊或週格；日期與排程圖一致 | `app.js` click/change、`render`；不寫資料 |
| `view` 日／週、`layout` 設備／工作 | 改檢視；預覽方案時禁用工作檢視切換 | `render`、`dayHTML`、`weekHTML`、`workGridHTML`；不寫資料 |
| `theme`、`zoom-`、`zoom+`、`zoom0`、`tv` | 主題、縮放、大螢幕模式；切換後保持可操作 | `setTheme`、`setZoom`、localStorage；不寫排程 |
| `sync`、`account`、`solver-check` | 顯示本機／雲端同步、帳號與排程服務連線；同步失敗可重試 | `queueSync`、`SOLVER.check` → `GET /health` |
| `help`、`help-sec`、`close`、Esc、彈窗遮罩 | 開啟／翻頁／關閉說明或視窗；焦點與未儲存草稿須檢查 | `openModal`、`renderModal`、全域鍵盤事件 |
| `manual-add`、`manual-choice`／`manual-machine`／`manual-employee`／`manual-start`／`manual-end`、`manual-preview` | 有工單與未排工序、名冊已核定且可編輯時建立排班；先預覽容量、交接、衝突，不先改正式資料 | `MODALS['manual-add']`、`manualQty`、`readyAbs`、`dragPreview` |
| `.blk` 拖曳與底邊拉伸、`drag-confirm`、`b-preview` | 移動、延長或縮短設備工作；預覽連帶順延、固定解除與交期；確認後僅寫一次且畫面定位新方塊 | pointer handlers、`dragPreview`、`acceptManualPreview`、`commit` → LocalStore／Supabase `save_blocks` |
| `blk-open`、`b-emp`、`b-mach`、`b-pin`、`b-del`、`b-fix` | 編輯已排工作的人、機、固定狀態；已有現場回報時不得修改；刪除需再次確認 | `MODALS.blk`、`MODAL_ACT`、`repair`、`commit` |
| `open`、`cal`、`c-week`、`c-day`、`c-save` | 開／停工、每週與特定日開工；停工需調整受影響方塊；基本日曆限老闆 | `toggleOpen`、`MODALS.cal`、`closeDays`、`commit` |
| `ot`、`ot-day`、`ot-person`、`ot-reset`、`ot-save` | 當日加班開關及個人覆寫；請假者不應排入；儲存後重算受影響工作 | `saveDailyOT`、`overtimeAllowed`、`repair`、`commit` |
| `issues`、`blk-open`、`fix-all` | 衝突清單與自動修正；問題需可追溯到方塊 | `issuesOf`、`repair`、`commit` |
| `incident`、`inc-step`、`inc-back`、`inc-mach`、`inc-emp`、`inc-rush`、`lq-date`、`lq-go`、`m-fault`、`m-fix` | 故障、請假、急單、修復的輸入與預覽；名冊未核定或唯讀時不得提交 | `MODALS.incident/leaveq/mach/ord`、`openPlans` → `SOLVER.plansDb` 或本機 `plans`／備援 |
| `auto`、`auto-run` | 以完整跨廠資料求多個排程方案；不得直接覆蓋正式班表 | `runAuto`、`SOLVER.plansDb`／`plans`、預覽 |
| `pv-pick`、`pv-mode`、`pv-tab`、`pv-date`、`pv-note`、`pv-ai`、`pv-cancel`、`pv-apply` | 切方案、原本／調整後／對照、圖／變更／員工、影響日期、備註、AI 建議；取消不寫，確認套用一次 | `PV`、`pvApply` → Supabase `apply_plan` 或 `commit`；`SOLVER.chat` |
| `undo`、`m-undo`、`seen`、`log`、`logone` | 復原當次本機狀態、查看／確認最近變更與紀錄；重載後的復原能力另測 | `undoStack`、`commit`、LocalStore／Supabase `change_sets` |

## 正式版名冊、工作與檔案彈窗

| 控制／表單 | 可用條件／預期行為 | 處理函式、後端或儲存 |
| --- | --- | --- |
| `emp`、`emp-new`、員工姓名／廠別／顏色／技能／顧機上限／固定加班星期／請假日期、`m-color`、`m-emp-factory`、`m-skill`、`m-ot-week`、`m-leave`、`m-emp-save`、`m-emp-del` | 員工資料僅老闆修改；無效值、重複、被排程引用與跨廠資格需拒絕或明示重排 | `MODALS.emp`、`MODAL_ACT`、`commit` → Supabase 名冊表 |
| `mach`、`mach-new`、機台代號／名稱／廠別／工序／允許產品、`m-proc`、`m-mach-factory`、`m-prod`、`mach-products`、`m-mach-save`、`m-mach-del` | 機台名冊僅老闆修改；產品能力、員工技能及既有排班關聯一致 | `MODALS.mach`、`MODAL_ACT`、`commit` |
| `ord`、`ord-new`、`orders`、工單號／件數／產品／交期／優先級、`o-prod`、`o-pri`、`o-save`、`o-del`、`clear-demo` | 建立／修改工單並預覽如何排；刪除與清示範資料需確認，不可遺留孤兒排班 | `MODALS.ord/orders`、`insertOrder`、`commit` |
| `products`、產品名稱／工序／廠別／速率／交接批量、`p-add`、`p-addstep`、`p-delstep`、`p-save` | 老闆維護使用者可編輯產品公式；跨廠順序和數值校驗 | `MODALS.products`、`commit` |
| `groups`、`group-edit`、`group-new`、名稱／部門／廠別／組員、`group-member`、`group-confirm`、`group-save`、`group-retire` | 一人多組可跨廠；分組不授予技能；編輯限老闆，停用需再次確認 | `MODALS.groups/staff-group`、`commit` → `save_staff_groups` |
| `work-contents`、`work-content-new`／`work-content-edit`、工作名稱／廠別／純人工或設備／合格人機 checkbox、`gw-content-save` | 工作、設備、員工資格分離；純人工不可虛構機台；老闆才能改定義 | `MODALS['work-content-edit']`、`validateGeneralWork` → `save_work_contents` |
| `general-add`／`general-edit`、工作／員工／設備／日期／起迄／件數／跨廠批次／階段／參考工單／備註、`gw-preview`、`gw-apply`、`gw-remove-preview`、`gw-remove`、`.workblk` 拖曳與拉伸 | 預覽人機容量、午休、請假、物料；確認後只改一般工作；純人工占滿員工時間 | `generalChange`、`assignmentIssues`、`previewGeneral`、`commit` → `save_work_assignments` |
| `work-queue`、`queue-arrange` | 列未排量／短少／逾期原因；點工序進入手動排班；零結果明示不等於已完工 | `workQueue`、`MODALS['work-queue']` |
| `resource-load` | 顯示設備、人員負荷及重疊；預覽中不可開啟 | `resourceLoadHTML`、`resource-load.js` |
| `scenarios`、`scenario-view`、`scenario-save`、情境名稱、`scenario-confirm` | 保存／查看試排不改正式班表；資料已變時標示過期；雲端只可見自己的情境 | `makeScenario`、LocalStore／Supabase `planning_scenarios` RPC |
| `execution`、`report-open`、`report-work`、累計件數 | 開始、更新件數、完成；重送不得重複計數；員工限自己的方塊；開始後鎖定排程 | `reportWork`、`execution.js` → Supabase `report_work_execution` RPC |
| `export`、`x-xlsx`、`x-template`、`x-copy-day`、`x-copy-all`、`x-dl` | 下載彩色 Excel／匯入範本／CSV、複製 TSV；格式、編碼、檔名及內容需核對 | `excel.js`、`navigator.clipboard` 或複製備援、瀏覽器下載 |
| `xlsx-import` file input、`x-import-confirm` | 驗證 Excel 後預覽；覆蓋名冊及清排程僅老闆，已有二廠／分組／一般工作時禁止不完整覆蓋 | `parseWorkbook`、`MODALS['import-preview']`、`commit` |
| `history`、`legacy-date`／`history-date`／`history-source`、`history-factory`、`history-section`、`legacy-save` | 舊排程唯讀預覽與存檔；原始 1／2 廠資料不能改當前班表 | `legacy-excel.js`、`MODALS['legacy-history']` → `legacy_schedule_archives` |
| `account`、`logout`、`password-open`、新密碼／確認、`password-save`、`reset-local` | 顯示連線與角色、登出、密碼校驗、兩次確認清除本機資料；敏感資料不得出現在網址或紀錄 | `SupabaseStore` Auth／`LocalStore.reset` |
| 登入 Email／密碼／提交、忘記密碼 | 未登入時；重複提交需防止，錯誤明示；密碼信只到測試帳號 | `showLogin`、Supabase Auth `signInWithPassword`／`resetPasswordForEmail` |
| 聊天開關、關閉、清除、雲端 AI checkbox、日期範圍、快問、輸入／送出 | 只讀排程查詢；一般查詢不改資料，雲端生成另受設定與權限限制；清除應中止舊回覆顯示 | `chat-ui.js`、`SOLVER.chat` → `/chat/db` 或本機 `/chat` |

## 跨廠與輪班彈窗

| 控制／表單 | 可用條件／預期行為 | 處理函式、後端或儲存 |
| --- | --- | --- |
| `transfers`、`tf-new`、`tf-detail`、`tf-edit`、需求編號／品號／來源加工回收廠／總量急用量／通知與交回日期／狀態／備註、`tf-work`、`tf-save` | 建立與維護跨廠加工需求；工作內容只能選加工廠；權限拒絕及欄位校驗 | `transfer-ui.js`、`validateTransfers` → `save_transfer_orders` |
| `tf-batch`、批次名稱／計畫量、`tf-batch-save` | 啟用的加工單可分批；批次合計不能超過總量 | `transfer-ui.js`、`validateTransfers` → `save_transfer_orders` |
| `tf-flow`、流轉動作／實際時間／良品與不良數／備註、`tf-flow-preview`、`tf-flow-apply` | 實際交出、點收、完成、送回、回廠點收按順序與數量進行；預覽不寫，確認後只記一次 | `appendFlow`、`validateTransfers` → `save_transfer_orders` |
| `tf-plan` | 由批次連結已核定人工／設備工作；未核定名冊不可排；物料只在實際點收後可用 | `transfer-ui.js` → `general-edit`／`transferPlanWarnings` |
| `rosters`、`rs-new`、週期名稱／開始／錨點／廠別／制度及同意依據、`rs-create`、`rs-open` | 建立固定、二週、四週、八週輪班草稿；草稿不移動產品排程，不宣稱法律認證 | `roster-ui.js`、`roster.js` → `save_staff_rosters` |
| Excel 式班格 `rs-cell`、日別／班別／崗位／固定、`rs-cell-save`、`rs-available`、可用班別／星期、`rs-allow-shift`、`rs-allow-day`、`rs-available-save` | 編輯員工班格與可用性；只改草稿，資格／休息／跨廠衝突顯示 | `roster-ui.js`、`auditRoster` → `save_staff_rosters` |
| `rs-shift`、`rs-load-shift`、班別名稱與分段、`rs-shift-save` | 支援跨夜與休息段；格式錯誤不存入 | `parseSegments`、`validateRosters` |
| `rs-position`、`rs-position-edit`、崗位與產能／合格員工、`rs-qualified`、`rs-position-save` | 不猜員工資格及產能；草稿資料與員工技能不混淆 | `roster-ui.js`、`validateRosters` |
| `rs-member`、選既有員工、`rs-member-save`、`rs-demand`、日期／班別／崗位／人數／產量／重複範圍、`rs-demand-save` | 跨廠借調與需求配置；同一員工不能在重疊週期重複排 | `roster-ui.js`、`validateRosters` |
| `rs-fill`、範圍／日別／班別／崗位、`rs-fill-preview`、`rs-next`、`rs-auto`、`rs-apply`、`rs-back` | 批次填班／複製週期／OR-Tools 試排先預覽；固定格保留，資料版本變更時拒絕套用 | `fillRoster`、`copyNextRoster`、`SOLVER.roster` → `/roster/plans/db` 或 `/roster/plans`；確認後 `save_staff_rosters` |

## 舊原型的獨立控制

舊原型沿用日／週導覽、日期選擇、主題／縮放／大螢幕、員工／機台／工單／產品／上班日、故障／請假／急單／自動排程、衝突／歷史紀錄、方案選擇與套用、Excel 複製／CSV、拖曳、說明。對應 `index.html` 內的 `data-act`：`prev`、`next`、`today`、`pick`、`view`、`goto`、`theme`、`zoom-`、`zoom+`、`zoom0`、`tv`、`emp`、`emp-new`、`mach`、`mach-new`、`ord`、`ord-new`、`orders`、`products`、`cal`、`open`、`ot`、`incident`、`inc-step`、`inc-back`、`inc-mach`、`inc-emp`、`inc-rush`、`lq-go`、`auto`、`auto-run`、`issues`、`fix-all`、`blk-open`、`b-fix`、`b-del`、`pv-pick`、`pv-mode`、`pv-tab`、`pv-date`、`pv-ai`、`pv-apply`、`pv-cancel`、`export`、`x-copy-day`、`x-copy-all`、`x-dl`、`log`、`logone`、`seen`、`help`、`help-sec`、`undo`、`m-undo`、`close`、`save`、`clear-demo`、以及各編輯彈窗的 `m-*`／`o-*`／`p-*`／`c-save`。其所有寫入都限本機草稿與明確按「儲存」後的狀態；不應對正式雲端資料產生副作用。

## 關鍵使用者路徑（驗證狀態）

1. **通過核心段落：**登入／讀取 → 切廠／日期 → 重新整理／多分頁即時同步；老闆、組長、員工、唯讀與未登入角色均在 staging 實測。
2. **通過核心段落：**手動調整 → 預覽 → 取消無副作用／確認後移動 → 重載一致；其餘每種衝突組合仍依自動測試與後續現場回歸。
3. **通過核心段落：**OR-Tools 自動方案 → A／B／C → 套用 A → 18 項調整與第二分頁同步；故障／請假／急單／修復的所有 UI 分支未逐一人工重跑。
4. 建跨廠加工單 → 批次 → 交出／點收／完成／回廠 → 連結排班 → 待料／逾期提示，實際數量不可重複計算。
5. 建輪班草稿 → 設班別、員工與崗位需求 → 手動填班或自動試排 → 檢核 → 只存草稿、不改產線工作。
6. **部分通過：**匯出彩色 Excel 已開檔核對；匯入入口已用鍵盤開啟檔案選擇器。合法／錯檔、複製及覆蓋保護仍需以現場檔案人工再點。
7. 現場回報開始／累計／完成 → 重送與錯誤恢復 → 排程鎖定、短少清單、重載後真實進度一致。
8. 舊原型獨立操作 → 儲存／重載；確認其 URL、資料與正式版完全隔離。

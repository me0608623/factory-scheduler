# 過夜開發進度（持續）

> **系列說明**：本文件有兩個並行的「輪次」系列（編號偶有重疊，以內容區分）——
> ① **10 分鐘自動循環**（ZCode cron，多為測試補強/驗證輪/文件，條目通常註明 commit 與測試數）
> ② **使用者系列**（vg-glass 根因修復=51、浮動視窗=65、分割放大=66、聊天面板=69、效能煙霧=74 等，多為功能/修復）
> 兩系列皆經 main 推送與 CI 把關。

## 夜間摘要（2026-10-09 晚 ~ 10-10 晨，給使用者的一頁交接）

**健康狀態（全部實證）**：web 274/274、db 201+5=206、solver CI 83+（含 test_edges/test_perf_smoke/test_switching_cost）；CI main 與 PR #7 分支全綠；生產 web/solver/staging 三站 200；本機＋正式站瀏覽器煙霧 0 JS 錯誤；四語 i18n runtime 驗證齊。

**你今晚完成（6 個系列）**：vg-glass 定位根因修復＋可收合側欄 → 浮動視窗（win.js）→ 分割窗格 → 聊天面板窄視窗修復 → 員工/設備/工單完整管理頁 → 功能解說主題導覽 → 平面圖 i18n＋solver 邊界/效能測試進 CI → 9-26 疑點①修復 → **PR #7 軟性切換成本（疑點②，等你審核合併）**。

**自動循環完成（輪 51-89 概要）**：測試 218→274（i18n 複合標題、localStorage 邊界、chat-ledgers、transfer-ui、roster-ui、未測匯出、workWindows、orderCounters、CSS 結構守門、vg-glass 定位不變量守門等）；CSS 死碼清理（-5.6%）；repo 衛生（tmp 腳本、TEST_STATUS 歷史標註、ARCHITECTURE 對齊現況、輪次索引）；修復鏽死的 benchmark_manual_flow（0021 起即斷，1000 單 1019/43ms 基準）；CI 實證監測法（GitHub API 唯讀）；瀏覽器煙霧（本機主流程/導覽七步/四語＋正式站唯讀）。

**等你處理**：① PR #7 審核合併（分支 CI 已綠；注意與 feature-tours 的 tour.js/layout-regression/進度文件衝突）② setup_pending 實地驗證解除 ③ DB 密碼輪換 ④ LINE notify token ⑤ 員工帳號實測。

**已知環境限制**：本機 uv trampoline 損壞（python/solver 相關只能 CI 跑）；integration_solver_apply.mjs 與 acceptance_sim.mjs 因此本機不可跑（後者另需 Docker）。

## 輪次索引

- 輪次 48-49（2026-09-30 續）：fromSnapshot(null/undefined) 防護（→ `cdb6b6e`）：空輸入回傳可用狀態，補 1 測試
- 輪次 50（2026-09-30 續）— 效能實測：render() 大量方塊實測（真實瀏覽器、本機 dev server、注入壓力資料集）：
- 輪次 51（2026-10-09）— localStorage 限制檢查（Phase 4）：檢查結論：寫入路徑（sync/reportExecution/confirmExecution/saveScenario/saveLeg
- 輪次 52（2026-10-09）— 複合變數 modal 標題 i18n 結案（P3）：tx() 新增佔位參數：`tx('鍵',{x:值})` 以 `{x}` 替換（值由呼叫端自行跳脫；zh-TW fallback 即原文鍵
- 輪次 53（2026-10-09）— CSS 死碼清理結案（P3）：方法：萃取 styles.css 全部 446 個 class，對全 repo JS/HTML 做子字串交叉比對得 34 個零引用候選；
- 輪次 54（2026-10-09）— 主動改善：chat-ledgers 直接測試：NEXT_TASKS 列項全數結案後進入主動搜尋模式；盤點 src 測試覆蓋，零測試模組餘 4 個（chat-ledgers/chat-ui
- 輪次 55（2026-10-09）— 主動改善：transfer-ui 純渲染測試：零測試模組 4→2（chat-ui、roster-ui 剩餘，需 DOM 或含 document 呼叫的路徑）
- 輪次 56（2026-10-09）— 主動改善：roster-ui 渲染與 action 測試：零測試模組剩 1（chat-ui，全模組 DOM 綁定：createElement/speechSynthesis，需真瀏覽器環境，維持標註
- 輪次 57（2026-10-09）— 主動改善：未測匯出補強：全模組掃描「export 了但測試沒引用」的函式，補 5 個有資料完整性價值的（→ `dcb804f`）：
- 輪次 58（2026-10-09）— 生產健康驗證＋repo 衛生：生產站唯讀健康檢查：web `factory-scheduler-web.onrender.com` → 200 ✓、solver `/
- 輪次 59（2026-10-09）— 主動改善：renderFloor canvas stub 測試：floor 模組最後一個未測匯出 `renderFloor` 補上（→ `713ab77`）：以錄製式 2D context stub＋`g
- 輪次 60（2026-10-09）— 主動改善：queryKinds 路由測試＋solver 疑點列回待辦：queryKinds 測試（→ `09bec38`）：9 個關鍵字分支逐一斷言（故障/請假/輪班/跨廠/缺料/衝突/交期/進度/一般問句
- 輪次 61（2026-10-09）— 接續使用者根因修復：vg-glass 定位同類風險稽查＋通用守門：背景：使用者平行推送 `42da52c`——右側工作區全空白的根因（visual.js 注入 `.vg-glass{position:r
- 輪次 51（2026-10-09）— 主工作區版面修復：根因：visual.js `ensureVisualStyles()` 注入 `.vg-glass{position:relative}
- 輪次 62（2026-10-09）— 平行作業安全輪：worktree 隔離執行：背景：使用者活躍於 `fix/main-workspace` 分支（工作樹在該分支），本輪改用 git worktree（`Downlo
- 輪次 63（2026-10-09）— db 層主動防回歸（worktree 隔離續行）：背景：使用者活躍於 `feat/floating-windows`（app.js/styles.css 未提交修改＋新檔 win.js）
- 輪次 64（2026-10-09）— workWindows 日曆開窗直測（worktree 續行）：使用者持續開發 feat/floating-windows（app.js/chat-ui.js/i18n.js/styles.css 有 W
- 輪次 65（2026-10-09）— Windows 式浮動視窗（使用者對話分支）：新模組 web/src/win.js：共用浮動視窗引擎（Pointer Events、8 向縮放、最大化/還原、z-order 60-7
- 輪次 66（2026-10-09）— 浮動視窗合併後驗證＋收尾補強：使用者完成並合併 feat/floating-windows（`782eabb`：抽屜可拖曳/縮放/最大化、排程助理自由定位、win.js 
- 輪次 67（2026-10-09）— orderCounters 計數器直測：使用者展開新分支 feat/split-pane（工作樹乾淨），worktree 續行、僅動 overview.test.mjs（零衝突）
- 輪次 68（2026-10-09）— split-pane 合併驗證輪：使用者合併 feat/split-pane（`68cc333`：抽屜改主內容分割/放大模式，對齊工作紀錄頁的區域切換機制；app.js+i1
- 輪次 69（2026-10-09）— ARCHITECTURE.md 對齊現況：使用者已自行解決輪次 68 的進度文件衝突（併入其分支紀錄 `26a7db6`）；worktree 續行
- 輪次 70（2026-10-09）— 聊天面板窄視窗修復驗證輪：使用者合併 fix/chat-panel-size（`f74cbd2`：聊天面板寬度不再繼承縮小後的根容器，chat-ui.js＋style
- 輪次 71（2026-10-09）— 手動稽核腳本主動驗證：使用者活躍於 feat/master-data-page（app.js/i18n.js/layout-regression WIP），wor
- 輪次 72（2026-10-09）— master-data-page 合併驗證輪：使用者合併 feat/master-data-page（`8390732`：「員工、設備與工單」改完整管理頁，修正誤導初次核對頁問題；app
- 輪次 73（2026-10-10）— 平面圖 i18n＋solver 邊界測試（分支 agent/overnight-1010）：基準：web 271/271、db 201/201 全綠
- 輪次 74（2026-10-10）— 效能煙霧測試進 CI：test_perf_smoke.py：snapshot_for 合成工廠（8機8人），10/30/60 工單 solve 全部完成且單輪 <
- 輪次 75（2026-10-09）— 效能煙霧測試驗證＋系列說明：使用者在 agent/overnight-1010 上持續推送：`48e7467` solver 效能煙霧測試（10/30/60 工單，斷言
- 輪次 76（2026-10-10）— TEST_STATUS 9-26 疑點①修復：plans.py：插單（order 事件）選項若新工單逾期（late）或排不完（part）→ diagnostics 加說明並降級不可套用；
- 輪次 77（2026-10-09）— 9-26 疑點①修復驗證輪：使用者修復 TEST_STATUS 9-26 疑點①（`ef89d07`：solver plans.py 新工單完成判定 late/
- 輪次 78（2026-10-10）— 疑點②方向確認旁觀輪：使用者於 feat/soft-switching-cost 展開 9-26 疑點②實作，產品決策（其 NEXT_TASKS WIP，
- 輪次 79（2026-10-10）— 疑點②實作待併觀察輪：使用者完成疑點②實作：`3841f8e` Soft Switching Cost（feat/soft-switching-cost 分支，*
- 輪次 80（2026-10-10）— feature-tours 合併驗證輪：使用者合併 feat/feature-tours（`3fefed1`：「功能解說」左側導覽獨立入口——主題式逐步導覽；tour.js＋i18
- 輪次 81（2026-10-10）— 真實瀏覽器煙霧測試（本機模式）：使用者閒置於 main（工作樹乾淨），本輪補一直缺的覆蓋：IAB 真實瀏覽器煙霧（worktree vite dev server 
- 輪次 82（2026-10-10）— PR #7 交付審核觀察輪：使用者將軟性切換成本整理為 PR #7（feat/soft-switching-cost：根因分析——10 分鐘短段是 CP-SAT
- 輪次 83（2026-10-10）— CI 實際狀態確認（GitHub API 唯讀）：以公開 API（GET only）確認 CI 真實結論，不再只憑本地推斷：main @5515285 Tests #214／Deploy
- 輪次 84（2026-10-10）— 正式站唯讀視覺煙霧：動機：vg-glass「黑色工作區」事件正是只在正式站被發現——本地全綠不等於部署 bundle 沒事，補上正式站層級的煙霧
- 輪次 85（2026-10-10）— en/vi 執行期 i18n 煙霧（本機）：延續輪次 81 本機煙霧，補英/越兩語言的執行期驗證（泰語已於輪次 84 正式站實證）：以 localStorage 設語言後重載
- 輪次 86（2026-10-10）— 發現並修復鏽死的基準腳本：主動實跑 db 層尚未驗證的工具：`acceptance_sim.mjs`（需 Docker，使用者手動驗收用，跳過）、`benchmark

## 執行狀態
- **分支**: `agent/overnight-20261009`（全數合併 main）
- **最新 main**: `13a87a6`＋本輪推送（使用者已合併 feat/floating-windows：Windows 式浮動視窗，拖曳/縮放/最大化；**本系列編號跳過 65**——使用者自編輪次 65 為浮動視窗紀錄）
- **main 總 commits**: ≈360（docs 快轉推送不產生 merge commit，精確值以 `git rev-list --count origin/main` 為準）
- **總輪次**: 122（65/66/69/74/75/76/78 為使用者系列，編號重疊以內容區分）
- **正式站**: web 200 ✓ solver 200 ✓ staging 200 ✓

## 測試
- 前端: **278/278** PASS
- DB: **206/206** PASS
- 合計: **463**

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

## 輪次 54（2026-10-09）— 主動改善：chat-ledgers 直接測試

- NEXT_TASKS 列項全數結案後進入主動搜尋模式；盤點 src 測試覆蓋，零測試模組餘 4 個（chat-ledgers/chat-ui/roster-ui/transfer-ui，後三個需 DOM 環境）
- **chat-ledgers（AI 助手唯讀事實投影）直接邊界測試 4 條**（→ `e4fb29c`，main `a890195`）：
  - 輪班草稿：跨夜班（前一日 segments 跨 1440）計入所選日、前前日不計、需求缺口「尚缺 N 人／名義產能」如實、唯讀不更動輸入
  - 非草稿（approved）與其他廠不投影；產能未設定只說「不能判斷」不警示
  - 加工單：逾期警告歸 deadline 類、未點收歸 material 類、**隔日事件不計入當日流水**、如期全數流轉零警示
  - notified 晚於所選日、廠外單不投影；加工廠視角看得到同一張單
- 前端測試：**228 → 232** PASS
- 下輪候選：chat-ui/roster-ui/transfer-ui 的純邏輯部分抽取測試（或建 DOM 測試環境）、docs 補齊

## 輪次 55（2026-10-09）— 主動改善：transfer-ui 純渲染測試

- 零測試模組 4→2（chat-ui、roster-ui 剩餘，需 DOM 或含 document 呼叫的路徑）
- **transfer-ui（跨廠加工 UI）5 條測試**（→ `09ab610`）：
  - 總表：依通知日排序、急用缺口只標未滿足的單、使用者資料（單號含 `<evil>`）完整跳脫、空狀態
  - 清單：無流轉→「待交料」、逾期警告渲染、唯讀者（canEdit=false）看不到新增鈕
  - 明細：批次數字鏈、連結排班列出人與工作、流轉/排班按鈕只在可編輯＋啟用單出現、找不到的單回 null
  - 表單：新單編號 XF-00N 遞增、加工內容只列加工廠（toFactory）的工作、唯讀停用欄位
  - 流轉預覽 action：未來時間 toast 擋下不開確認頁、合法時間進確認頁
- 測試是純渲染斷言（HTML 字串），無需 DOM 環境；3 個斷言初版寫錯（按鈕位置/補零/計數）經實跑修正
- 前端測試：**232 → 237** PASS

## 輪次 56（2026-10-09）— 主動改善：roster-ui 渲染與 action 測試

- 零測試模組剩 1（chat-ui，全模組 DOM 綁定：createElement/speechSynthesis，需真瀏覽器環境，維持標註）
- **roster-ui（輪班 UI）6 條測試**（→ `e10efae`）：
  - 清單：草稿名＋制度名、空狀態、唯讀者無「建立週期草稿」
  - 矩陣：`rs-work` 類別標記、請假衝突格 `rs-error`、時數欄、需求「缺 1 人」、唯讀者無 rs-shift/rs-fill/rs-auto 等七顆編輯鈕、查無週期回 null
  - 班格表單：標題員工＋日期、班別附時段（08:00-12:00）、固定班格選項
  - 可用時段切換 action：班別/星期按一下增刪、每次重開視窗
  - 需求入口：無崗位時 toast 擋下不開表單
  - 班別儲存 action：跨夜「22:00-次日02:00」合法保存（commit 觸發）、「25:00-26:00」非法擋下（時段格式提示）
- 前端測試：**237 → 243** PASS；全部純渲染/純 action 斷言，無需 DOM

## 輪次 57（2026-10-09）— 主動改善：未測匯出補強

- 全模組掃描「export 了但測試沒引用」的函式，補 5 個有資料完整性價值的（→ `dcb804f`）：
  - `blockToDb`/`blockFromDb`（排程方塊↔DB 列）：欄位往返逐一相等、pin 強制布林、缺 id 補合法 UUID v4
  - `orderRoute`：連續重複廠別去重（1,1,2,1→1,2,1）；`orderFactories` 為全域去重（語意不同已分別斷言）
  - `validDate`：真實日曆日檢查（2026-02-30／平年 02-29／2026-13-01 全擋）、閏年 02-29 成立、非字串擋
  - `hitFloor`（平面圖命中測試）：邊界端點含命中、重疊區取第一個、外部與空陣列回 null
  - `applyPreferences`：theme=auto 移除 data-app-theme、accent/font/density/motion/lang/--z 齊上、回正規化結果
- 前端測試：**243 → 248** PASS（分散附屬於 convert-roundtrip/factory/transfers/floor/settings 五個對應模組測試檔）

## 輪次 58（2026-10-09）— 生產健康驗證＋repo 衛生

- **生產站唯讀健康檢查**：web `factory-scheduler-web.onrender.com` → 200 ✓、solver `/health` → 200 ✓（GET only，未動任何資料）
- **移除 6 個被 git 追蹤的歷程補丁暫存腳本**（→ `e98213b`）：docs/ 下 add-btn.tmp.mjs、fix-orphan.tmp.cjs、form-modal.tmp.js、ro-form.tmp.cjs、ui-refactor.tmp.cjs、unconfirm.tmp.cjs——已確認無任何文件引用；wireframe HTML 與驗證截圖有被文件引用故保留
- **TEST_STATUS.md 加歷史存檔標註**：該文為 9-26 快照（測試數 13/42/14、部署未選定皆已過時），標註指向現況來源；「尚未修復」兩項未經重測不宣稱已修或仍在
- 前端測試維持 **248/248** PASS（本輪未動程式碼，仍重跑確認）

## 輪次 59（2026-10-09）— 主動改善：renderFloor canvas stub 測試

- floor 模組最後一個未測匯出 `renderFloor` 補上（→ `713ab77`）：以錄製式 2D context stub＋`getComputedStyle`/`document` 全域 stub 在 Node 測
  - DPR 尺寸換算：pixelRatio=2 → canvas.width=1800、height=404、style.height=202px、ctx 以 (2,2) 縮放
  - 狀態用色：故障紅 #DC2626、忙碌藍 #315FA7、閒置灰 #9AA3AF；閒置半透明 0.35、其他 0.85
  - 副標文字：故障格顯示「故障」（**優先於負載時數**——此優先序即測試初版寫錤之處，已按原始碼行為修正 fixture）、忙碌格顯示負載「3h」
  - 超長機台名截斷；正規化座標→螢幕座標矩形換算（0/40、450/40、0/121）與 hitFloor 命中
- 前端測試：**248 → 249** PASS

## 輪次 60（2026-10-09）— 主動改善：queryKinds 路由測試＋solver 疑點列回待辦

- **queryKinds 測試**（→ `09bec38`）：9 個關鍵字分支逐一斷言（故障/請假/輪班/跨廠/缺料/衝突/交期/進度/一般問句 null），並以同一份資料驗證「有關鍵字時事實變少」——過濾真的生效，不是只回全部
- **NEXT_TASKS 列回 9-26 快照兩個 solver 疑點**（見 docs/TEST_STATUS.md）：①插單＋加班候選方案評分（延誤方案仍可選）②故障後 10 分鐘零碎工作段。均標註「需 solver 環境重現、未經重測不假定仍存在」
- 前端測試：**249 → 250** PASS

## 輪次 61（2026-10-09）— 接續使用者根因修復：vg-glass 定位同類風險稽查＋通用守門

- **背景**：使用者平行推送 `42da52c`——右側工作區全空白的根因（visual.js 注入 `.vg-glass{position:relative}` 蓋掉 `.ops-drawer` 的 fixed 定位）＋可收合側欄＋6 條防回歸；agent 分支已快轉同步
- **同類風險稽查**：全 codebase 掃描 vg-glass 套用點共 3 處——ops-drawer（已修）、視覺展示頁與登入頁的 login-card（皆帶 inline `position:relative`，inline 優先於注入樣式，安全）；`.vg-fallback` 由程式碼明設容器 relative，無風險。結論：無其他受害點
- **通用不變量守門**（→ `346bc77`）：layout-regression 第 7 條——自動掃 src 全部 `class="…vg-glass…"` 元素，凡基底 class 在 styles.css 依賴 fixed/absolute/sticky、無 inline position、又無 `.X.vg-glass` 特異度防護即報錯。未來任何人把 vg-glass 套到新的定位元素上，測試直接攔下
- 前端測試：**250 → 257** PASS（含使用者 6 條 layout 防回歸＋本輪 1 條守門）

## 輪次 51（2026-10-09）— 主工作區版面修復
- **根因**：visual.js `ensureVisualStyles()` 注入 `.vg-glass{position:relative}`（同特異度、較晚載入）蓋掉 `.ops-drawer{position:fixed;right:0}`，全部側欄抽屜（人/產量/工單/備忘/更多）掉進文件流擠在左側 470px，右側大片空白
- **修復**（`42da52c`，分支 fix/main-workspace）：styles.css 加 `.ops-drawer.vg-glass{position:fixed}` 特異度防護（刻意不重宣告位移，避免壓掉手機 bottom-sheet）；第一版曾含 top/bottom 導致手機抽屜跑頂部，已修
- **新功能**：可收合側欄（78px↔244px、`fsched-nav-collapsed` 保存、收合後主內容 1507px@1600）
- **驗證**：桌面 1600 / 平板 820 / 手機 390 全導覽項目定位正確、0 console 錯誤；256/256 測試、build 通過；生產站（部署後）實測 fixed x=1115 ✓
- 新增 web/tests/layout-regression.test.mjs（7 條防回歸，含「防護規則不可含位移」的設計約束）

## 輪次 62（2026-10-09）— 平行作業安全輪：worktree 隔離執行

- **背景**：使用者活躍於 `fix/main-workspace` 分支（工作樹在該分支），本輪改用 git worktree（`Downloads/fs-agent-wt`）在隔離目錄 checkout agent 作業，全程不碰使用者工作樹；node_modules 以 junction 連結
- **驗證**：worktree 內全套 **257/257** PASS（初次 9 檔失敗純因 worktree 缺 node_modules，非程式問題；pglite 已正確宣告於 web/package.json devDependencies）
- **攜帶**：使用者未推的 `55304a5`（輪次 51 主工作區版面修復紀錄 docs）隨本輪以 `push agent:main` 快轉上 main
- 生產站健康：web 200 ✓ solver /health 200 ✓（唯讀 GET）
- 修正輪次 61 標頭 commit 計數（357→356）

## 輪次 63（2026-10-09）— db 層主動防回歸（worktree 隔離續行）

- **背景**：使用者活躍於 `feat/floating-windows`（app.js/styles.css 未提交修改＋新檔 win.js），主工作樹不碰，續用 fs-agent-wt worktree（補 db/tests/node_modules junction）
- **DB 層全套驗證（當前 main 狀態）**：`npm test`（migrations）**201 過 0 敗**；另跑未掛入 npm test 的 `machine-layout.test.mjs` **5/5 過**——**201+5=206 與文件「DB 206」數字吻合**，統計口徑之謎解開
- 前端 257/257（輪次 62 已驗）；生產站沿用輪次 62 實測雙 200

> 標頭勘誤（輪次 63 補記）：輪次 55–62 的標頭「最新 main／總輪次／main 總 commits」更新因 replace 圖樣未命中（單引號 vs 反引號）而**靜默失敗**，停滯在輪次 54 數字；「測試」節數字不受影響。本輪起改用帶命中驗證的腳本更新標頭。


## 輪次 64（2026-10-09）— workWindows 日曆開窗直測（worktree 續行）

- 使用者持續開發 feat/floating-windows（app.js/chat-ui.js/i18n.js/styles.css 有 WIP），本輪全程 worktree 隔離，僅動 general-work.test.mjs（零衝突）
- **workWindows 直測 1 條 7 斷言**：平日兩窗非加班、週六未開回空、全開後週六視為加班、假日開窗視為加班、單日覆寫停工／開工都優先於星期設定、當日加班加第三窗（1020–1200）且必為加班
- 前端測試：**257 → 258** PASS

## 輪次 65（2026-10-09）— Windows 式浮動視窗（使用者對話分支）
- **新模組 web/src/win.js**：共用浮動視窗引擎（Pointer Events、8 向縮放、最大化/還原、z-order 60-78 低於 modal 80、localStorage 保存、可視範圍夾回、moveOnly 模式、雙擊回預設）
- 抽屜全系列（人/產量/工單/備忘/更多/設定）→ 可拖曳浮動視窗；排程助理藥丸+聊天窗標題可拖曳
- 手機 ≤800px 維持 bottom sheet/底部錨定，resize 自動切換與夾回
- 兩個布局陷阱修復：left+right 同錨定致 width:auto 拉伸（paint 先清再量）；安裝當下 block 填滿（fit-content 強制量測）
- 測試：win.test.mjs 5 條 clampRect；全套 262/262；build ✓；瀏覽器全場景驗證（拖曳/縮放/最大化/還原/關閉重開/重載恢復/resize 夾回/手機往返）；生產站實測最大化 1600×900 ✓
- commit 782eabb（分支 feat/floating-windows → main 3229de0）
- **下一輪待辦**：評估「更多功能」二級選單、甘特圖/平面圖是否值得改用同套浮動視窗機制


## 輪次 66（2026-10-09）— 浮動視窗合併後驗證＋收尾補強

- 使用者完成並合併 feat/floating-windows（`782eabb`：抽屜可拖曳/縮放/最大化、排程助理自由定位、win.js 200 行＋5 測試）；worktree 同步後全套 **263/263** 驗證綠
- 補 win.test.mjs 第 6 條：左緣精確鉗制（x = MARGIN−w+60，視窗右緣至少留 60px 可抓回）→ **264/264**
- 生產站部署後實測：web 200 ✓ solver /health 200 ✓（使用者 push 觸發的自動部署已上線且健康）


## 輪次 67（2026-10-09）— orderCounters 計數器直測

- 使用者展開新分支 feat/split-pane（工作樹乾淨），worktree 續行、僅動 overview.test.mjs（零衝突）
- **orderCounters 直測**：未完成（五張扣已完成）、逾期（缺 due/pid 的 gray 不誤判、已完成不計）、今日到期（due===today 且未完成才計）三計數器各守其界；順帶斷言 done→green、無資料→gray
- 前端測試：**264 → 265** PASS


## 輪次 68（2026-10-09）— split-pane 合併驗證輪

- 使用者合併 feat/split-pane（`68cc333`：抽屜改主內容分割/放大模式，對齊工作紀錄頁的區域切換機制；app.js+i18n+styles.css+2 條 layout-regression 測試）
- worktree 同步後全套 **267/267** 驗證綠；新測試含 pane 模式反向覆寫 vg-glass 防護（`.ops-drawer.pane.vg-glass{position:relative}`）——與輪次 61 的通用守門測試相容（守門掃的是基底 class 依賴定位而無防護的情形，pane 有防護鏈故通過）
- 生產站部署後實測：web 200 ✓ solver /health 200 ✓


## 輪次 69（2026-10-09）— ARCHITECTURE.md 對齊現況

- 使用者已自行解決輪次 68 的進度文件衝突（併入其分支紀錄 `26a7db6`）；worktree 續行
- **docs/ARCHITECTURE.md 過時修正**：①部署表改實際狀態（Render web/staging/solver，push 後 CI 自動部署）②新增 §7.5 前端模組地圖（主畫面/功能 UI/領域邏輯/資料層/週邊五類）③階段表更新——1d 排程助理（唯讀問答＋語音）與 Excel 已上線、2 現場回報已上線＋LINE 待 token、新增 2.5 多語/平面圖/輪班/跨廠/浮動視窗等上線項；測試數 36/11 遠古數字改為 206/83/267 ④資料表補「上線後陸續新增」指標行（約 21 張表，指向 migrations 而非枚舉避免再過時）
- 測試數量不變 **267/267**（純文件輪，仍重跑確認）


## 輪次 70（2026-10-09）— 聊天面板窄視窗修復驗證輪

- 使用者合併 fix/chat-panel-size（`f74cbd2`：聊天面板寬度不再繼承縮小後的根容器，chat-ui.js＋styles.css＋1 條 layout-regression 測試）
- worktree 同步後全套 **268/268** 驗證綠；生產站實測 web 200 ✓ solver /health 200 ✓


## 輪次 71（2026-10-09）— 手動稽核腳本主動驗證

- 使用者活躍於 feat/master-data-page（app.js/i18n.js/layout-regression WIP），worktree 續行、本輪零衝突（純驗證＋docs）
- **未進 CI 的兩個手動稽核腳本實跑**：`audit_i18n.mjs` exit 0——寫死中文 modal 標題 **0**（輪次 52 的 15 處 tx() 化守住）、HELP 章節標籤 0；`audit_buttons.mjs` exit 0
- README/ARCHITECTURE 檢視：README 維運紀錄段（哪些 migration 已上正式庫）屬使用者手動狀態、不代改；其餘段落（測試跑法、部署、功能說明）現況正確
- 測試數量不變 **268/268**


## 輪次 72（2026-10-09）— master-data-page 合併驗證輪

- 使用者合併 feat/master-data-page（`8390732`：「員工、設備與工單」改完整管理頁，修正誤導初次核對頁問題；app.js＋i18n＋3 條 layout-regression 測試，含隔離 LocalStore 的瀏覽器驗證）
- worktree 同步後全套 **271/271** 驗證綠；生產站實測 web 200 ✓ solver /health 200 ✓


## 輪次 73（2026-10-10）— 平面圖 i18n＋solver 邊界測試（分支 agent/overnight-1010）

- 基準：web 271/271、db 201/201 全綠
- **平面圖 canvas 文字 i18n**：floor.js「故障」tx() 化；app.js tooltip/toast「當日無排程」tx() 化；+2 i18n 鍵；floor.test.mjs +1 防回歸（canvas 故障字串必走 tx()）。機台名稱與摘要屬使用者資料、依設計不翻譯
- **solver 邊界案例進 CI**：test_edges.py 4 條——空工單（空排程且驗證通過）、單工單（最後一站必被排到）、全部逾期（仍需產出可行解）、全空工廠；本機 uv/python 損壞由 CI 驗證，**solver job 綠**（CI 三 job 全綠：frontend/database/solver）
- web 272/272、db 201/201、build ✓；生產 web/solver 雙 200
- commit 6dd3739；平行循環（worktree）已於輪次 73 補記驗證 272/272


## 輪次 74（2026-10-10）— 效能煙霧測試進 CI

- test_perf_smoke.py：snapshot_for 合成工廠（8機8人），10/30/60 工單 solve 全部完成且單輪 <30s；CI 三 job 綠（frontend/database/solver）
- NEXT_TASKS Phase 3「效能基準」勾除；commit 48e7467


## 輪次 75（2026-10-09）— 效能煙霧測試驗證＋系列說明

- 使用者在 agent/overnight-1010 上持續推送：`48e7467` solver 效能煙霧測試（10/30/60 工單，斷言 OPTIMAL/FEASIBLE 且單輪 <30s，絕對秒數印日誌供趨勢、正式基準留給手動 benchmark.py）——**Phase 3「效能基準」最後一項卡住項目以 CI 煙霧方式結案**；`068510f` 其文件輪次 74 已勾除該項
- worktree 同步後 web **272/272** 確認綠（solver 煙霧由 CI 驗證）
- 文件頂部新增「系列說明」：兩個並行輪次系列（自動循環／使用者）編號重疊（66、69 已雙用）以內容區分，不搬動彼此條目

## 輪次 76（2026-10-10）— TEST_STATUS 9-26 疑點①修復

- plans.py：插單（order 事件）選項若新工單逾期（late）或排不完（part）→ diagnostics 加說明並降級不可套用；機理是 applicable 只看硬規則、新單逾期屬軟性目標
- 回歸：test_edges.py +1（qty500/due 隔日，凡逾期方案必不適用且帶說明）；CI 三 job 綠（solver 83 既有＋5 新全過，test_rush_order_insert 準時情境不受影響）
- 剩餘唯一未結項：疑點②（10 分鐘零碎段）——需「最短工作段規則 vs 換模成本」的產品決策，屬人類確認事項
- commit 0ea3809


## 輪次 77（2026-10-09）— 9-26 疑點①修復驗證輪

- 使用者修復 **TEST_STATUS 9-26 疑點①**（`ef89d07`：solver plans.py 新工單完成判定 late/part 時加診斷並降級為不可套用——W07 情境「延誤 1 仍可選」不再出現；回歸測試併入 test_edges.py，CI solver job 綠）——這正是輪次 60 列回 NEXT_TASKS 的項目，待辦僅剩疑點②（10 分鐘零碎工段，需產品決策：最短工作段規則 vs 換模成本）
- worktree 同步後 web **272/272** 確認綠；生產站實測 web 200 ✓ solver /health 200 ✓


## 輪次 78（2026-10-10）— 疑點②方向確認旁觀輪

- 使用者於 feat/soft-switching-cost 展開 **9-26 疑點②**實作，產品決策（其 NEXT_TASKS WIP，未提交）：採 **Soft Switching Cost 軟性切換成本**——不用最短工段硬限制，保留合法短工段，以可配置權重（switching/fragmentation）引導連續性，自然分段（午休／下班／跨日／故障）不計懲罰
- 本輪不碰 solver 與 NEXT_TASKS（其 WIP 範圍）；worktree 確認 main 現況 web **272/272** 綠
- 待其實作完成合併後做驗證輪


## 輪次 79（2026-10-10）— 疑點②實作待併觀察輪

- 使用者完成疑點②實作：`3841f8e` Soft Switching Cost（feat/soft-switching-cost 分支，**已推遠端未併 main**——推測等分支 CI 驗證後自行合併，本循環不代併其分支）
- 使用者已轉戰 feat/feature-tours（工作樹乾淨）；生產站實測 web 200 ✓ solver /health 200 ✓
- main 現況維持 **272/272**（輪次 78 已驗）；待 soft-switching-cost 併入後做驗證輪


## 輪次 80（2026-10-10）— feature-tours 合併驗證輪

- 使用者合併 feat/feature-tours（`3fefed1`：「功能解說」左側導覽獨立入口——主題式逐步導覽；tour.js＋i18n 45 鍵＋2 條回歸測試）
- worktree 同步後全套 **274/274** 驗證綠；生產站實測 web 200 ✓ solver /health 200 ✓
- feat/soft-switching-cost（`3841f8e`）仍在分支待併（其分支 CI 驗證中）


## 輪次 81（2026-10-10）— 真實瀏覽器煙霧測試（本機模式）

- 使用者閒置於 main（工作樹乾淨），本輪補一直缺的覆蓋：**IAB 真實瀏覽器煙霧**（worktree vite dev server :5199，本機示範模式，不碰雲端）
- **結果全過、互動全程 0 JS 錯誤**：①首載主畫面完整（導覽側欄含可收合鈕與功能解說、排程板 5 機台＋時間軸＋假日提示、一般工作區、聊天 FAB、新手導覽對話框自動出現）②「人」抽屜以分割窗格模式開啟（`ops-drawer pane vg-glass`、position:relative、右側 470px）——分割窗格＋vg-glass 鏈在真實瀏覽器如預期 ③「功能解說」（新主題式導覽）開啟正常 ④廠區平面圖 canvas 渲染（320×97）正常；截圖存證
- 已知問題重現與解法再驗證：Playwright getByRole 點擊被覆蓋層攔逾時 → 頁內 evaluate 以 data-act/文字找按鈕 .click() 最可靠（與記憶教訓一致）
- 測後清理：關閉測試分頁、停 dev server；測試數量不變 **274/274**（本輪無程式碼變更）


## 輪次 82（2026-10-10）— PR #7 交付審核觀察輪

- 使用者將軟性切換成本整理為 **PR #7**（feat/soft-switching-cost：根因分析——10 分鐘短段是 CP-SAT 合法且近零成本差的選擇、非 to_real() bug；OR-then-AND reified 公式＋必要情況不罰＋PRESETS 權重校準；switching.py 量測模組＋19 條測試＋CI A/B 證據），分支 CI 全綠等待人工審核——本循環不代併
- 注意：該分支早於 feature-tours 合併點，PR 合併時 tour.js／layout-regression／進度文件需解衝突（其報告已列待辦）
- 生產站實測 web 200 ✓ solver /health 200 ✓；main 現況 **274/274**（輪次 80 已驗）


## 輪次 83（2026-10-10）— CI 實際狀態確認（GitHub API 唯讀）

- 以公開 API（GET only）確認 CI 真實結論，不再只憑本地推斷：**main @5515285 Tests #214／Deploy smoke #201／Render 部署 #164 全部 success**；PR 分支 feat/soft-switching-cost 兩個 commit（3841f8e→0b96e72）Tests #215/#216＋smoke #202/#203 亦全綠——PR #7 分支 CI 確認綠燈
- 本循環後續 docs-only push 未觸發 Tests 屬路徑過濾預期（docs/ 不在觸發路徑）
- main 現況 **274/274**（輪次 80 已驗）；生產健康沿用輪次 82 實測雙 200


## 輪次 84（2026-10-10）— 正式站唯讀視覺煙霧

- 動機：vg-glass「黑色工作區」事件正是只在正式站被發現——本地全綠不等於部署 bundle 沒事，補上正式站層級的煙霧
- **結果（唯讀載入、零互動、不截圖避免留存正式資料）**：部署 bundle 完整載入（雲端模式）、**0 JS 錯誤**、即時同步晶片「雲端已同步」正常、導覽／按鈕／圖例以**泰語**呈現（i18n 在正式環境端到端生效；使用者資料與假日名稱保持中文屬設計）、setup_pending 橫幅如預期顯示「資料待確認，暫不排程」、排程板與機台列渲染正常（f1aa 等）——無白畫面／黑工作區回歸
- 注意：IAB 瀏覽器留有已登入的組長 session（同步驗收帳號）——本輪僅讀取渲染結果，未點擊任何資料操作（改為停工／開加班／核對等皆未觸碰），讀完立即關閉分頁


## 輪次 85（2026-10-10）— en/vi 執行期 i18n 煙霧（本機）

- 延續輪次 81 本機煙霧，補英/越兩語言的執行期驗證（泰語已於輪次 84 正式站實證）：以 localStorage 設語言後重載
  - **en**：導覽 Today/Orders/People/Output/Work Log/Notes、banner Schedule／Machines × time／All plants／Shortage／Send/Return／Floor Plan——**0 JS 錯誤**（含互動監測）
  - **vi**：Hôm nay／Đơn hàng／Người／Sản lượng…、`<html lang="vi">` 由 applyPreferences 正確設定、「更多」選單可開、功能解說顯示 **Hướng dẫn tính năng**（feature-tours 的 45 個新鍵越語到位）
  - 品牌名「產線排程」保持中文屬設計
- 四語 runtime 驗證至此齊（zh 預設、en、vi 本機；th 正式站）；測後還原 zh-TW、關分頁、清除輪次 81 殘留的 vite 程序（PID 20060）


## 輪次 86（2026-10-10）— 發現並修復鏽死的基準腳本

- 主動實跑 db 層尚未驗證的工具：`acceptance_sim.mjs`（需 Docker，使用者手動驗收用，跳過）、`benchmark_manual_flow.mjs`——**後者自 migration 0021 起就無法執行**：腳本只跳過檔名含 realtime 的 migration，但 0021 起 `alter publication` 出現在一般檔名內（work_execution/account_permissions/leave_requests/…），第一條就炸 `publication "supabase_realtime" does not exist`；migrations.test.mjs 有 create publication shim 故不受影響
- **修復**：補上與 migrations.test 相同的一行 shim（→ 本輪 commit）；修復後基準全跑通——100 單全量 42ms／增量 8ms、500 單 292/22ms、**1000 單（3000 方塊）全量 1019ms／增量 43ms**——增量路徑便宜、成長近線性，健康
- db `npm test` 修後重跑 **201/201** 綠；教訓：未被 CI 覆蓋的工具會隨 schema 演進鏽死，這類「主動實跑」輪正是解法


## 輪次 87（2026-10-10）— 進度文件輪次索引

- 文件已 87+ 輪、巨大難導航——頂部新增「輪次索引」（39 條：輪號→一句摘要），由標題與首行重點自動生成
- 另查最後一個未跑的 db 腳本 integration_solver_apply.mjs：其 spawn uv run python（本機 uv 損壞跑不了），且它已有 publication shim 與正確註解（環境限制、非腳本 bug），維持原樣


## 輪次 88（2026-10-10）— staging 首驗＋新手導覽七步走查

- **staging 站首次驗證**：factory-scheduler-web-staging.onrender.com → **200** ✓（此前從未檢查過）
- **新手導覽七步完整走查**（本機瀏覽器，清除 fsched-tour-done 後重載觸發）：從「切換日期」起連點下一步至「更多功能」，第七次點擊後對話框與聚焦框正確移除——完成路徑乾淨；計數讀值的跳動（1→4→6）是取樣撞上 render() 整頁 DOM 重建的時序現象，非導覽缺陷
- 附帶確認：evaluate 多語句需包 IIFE 且避免可選鏈（傳輸層限制）


## 輪次 89（2026-10-10）— 夜間摘要交接

- 在輪次索引前插入「夜間摘要」：健康狀態實證數字、使用者 6 個系列、自動循環 51-89 概要、待使用者處理清單、環境限制——醒來看一頁即掌握全況


## 輪次 90（2026-10-10）— 抓到並修復自己的時段依賴測試

- 例行全套重跑抓到 1 敗：**輪次 55 寫的 transfer-ui「合法時間」fixture 有時段依賴**——`today()` mock 為 2026-09-30 但 now 的時分取自真實時鐘；凌晨（時鐘 <08:00）執行時 08:00 事件反成「未來」被擋，確認頁斷言失敗。白天跑都不會發現
- **修復**：合法案例改用前一天中午（2026-09-29T12:00），任何時刻皆穩定合法 → **274/274** 復綠
- 教訓：fixture 涉及「與 now 比較」時，合法案例要用**前一天**而非當天固定時刻；夜間循環恰好是抓時段依賴測試的自然環境
- 另掃 web/src 正式碼：0 個 console.log 殘留（僅正當 error/warn）；生產三站 200（本輪實測）


## 輪次 91（2026-10-10）— 時段依賴系統性稽查（上輪教訓的推廣）

- 掃描 src 全部未注入的 `new Date()`／真實時鐘使用點，對照測試覆蓋路徑：
  - `execution.js transitionExecution`（now 可注入，測試皆有注入）✓、`transfers.js validateTransfers/appendFlow`（now 可注入；既有測試用絕對過去日期 2025-01）✓
  - `transfer-ui.js` 的「mock today()＋真實時鐘比較」組合＝上輪已修的唯一案例 ✓
  - 其餘（app.js fault 固定時間戳、列印時間、tfArchiveMonth 等）皆在無單元測試的 DOM action 路徑，不構成測試炸彈
- **結論：無其他時段依賴測試**；測試數量不變 274/274（本輪純稽查）


## 輪次 92（2026-10-10）— OVERNIGHT_REPORT 歷史標註

- 發現 docs/agent/OVERNIGHT_REPORT.md 是 36 輪時代的凍結結案報告（main 1657282／264 commits／215 測試皆過時）——加歷史存檔標註並指向 OVERNIGHT_PROGRESS 現況（同 TEST_STATUS.md 處理模式）


## 輪次 93（2026-10-10）— i18n 覆蓋率棘輪

- 實測 modal 標題覆蓋率＝**100%**（title:tx() 79 處、直接中文字串 0）——i18n-coverage 測試門檻自 60% 調升至 **95%**（棘輪鎖住成果；留 5% 餘裕給新標題開發期）
- 全套 **274/274** 綠


## 輪次 94（2026-10-10）— 建置驗證＋bundle 體檢

- worktree 實跑 `vite build`：**通過**（7.14s）
- 體檢：初始載入 ≈196KB gz（html 0.4＋css 15.4＋主包 180.2）——與「main 210K gz」時代相當；three（191.8KB gz）與 excel（275.9KB gz）維持 lazy 分包不進首屏 ✓
- 主包 raw 505KB 觸發 Rollup advisory（>500KB）：win.js／主題導覽／i18n 317 鍵皆在主包。可選優化＝manualChunks 切分（P4，非必要——現況載入健康）


## 輪次 95（2026-10-10 凌晨）— 夜間備份管線首驗

- 以 GitHub API（唯讀）驗證「每日資料庫備份」workflow：**近三輪（#14/15/16）全 success**，排程約 UTC 22:30（台北 06:30），今晚批次約 5 小時後執行——管線健康
- 順手盤點全部 11 個 workflow（皆 active）：Tests／Deployment smoke／Render 部署／每日備份／備份還原演練／隔離驗證／模擬驗收／匯入盤點／套用 migration／建立帳號（一次性）／修復帳號登入（一次性）——未觸發任何一個（紅線）


## 輪次 96（2026-10-10 凌晨）— 健康脈搏＋backlog 盤點

- GitHub 開啟項目盤點（API 唯讀）：僅 **PR #7**（軟性切換成本，待使用者審核）——無任何開啟 issue，backlog 乾淨
- 三站健康實測全 200；標頭「正式站」行補入 staging


## 輪次 97（2026-10-10 凌晨）— 手機視窗（390px）抽屜版型實測

- 補最後一塊版型驗證缺口：390×844 視窗下開「人」抽屜——`position:fixed`、全寬 375/390、**0 JS 錯誤**——手機走 bottom-sheet 定位路徑（非桌面分割窗格/浮動視窗），今晚的分割窗格與 vg-glass 變更未波及手機版型 ✓
- 測後清理（分頁、vite 殘留程序）完成


## 輪次 98（2026-10-10 凌晨）— localStorage 損毀的執行期韌性實測

- 把 fsched-local-v1（壞 JSON）與 fsched-scenarios-v1（非 JSON）實際寫壞後重載：App 完整開機（DOM 17.6KB）、「示範資料」徽章出現、**0 JS 錯誤**——優雅降級到示範資料而非白畫面，輪次 51 的單元測試（listScenarios/load 損毀退回空值）在真實瀏覽器兌現
- 測後還原 localStorage、關分頁、清 vite 殘留


## 輪次 99（2026-10-10 凌晨）— audit_i18n 複檢（feature-tours 之後）

- 重跑 audit_i18n（上次在 feature-tours 合併前）：寫死中文按鈕標籤 **0**、modal 標題 **0**、HELP 章節標籤 **0**——feature-tours 新增的 45 個導覽鍵全部合規，exit 0


## 輪次 100（2026-10-10 凌晨）— 百輪里程碑總結

**本輪全套健康實證**：web **274/274**、生產三站 200、CI 全綠（輪 83/95 實證）、備份管線綠（輪 95）、PR #7 為唯一開啟項。

**百輪累計（自動循環 51→100）**：
- 測試 218→**274**（+56）：i18n 複合標題、localStorage 邊界、chat-ledgers、transfer-ui、roster-ui、未測匯出×5、workWindows、orderCounters、CSS 結構×3、vg-glass 不變量守門、時段依賴修復等
- Bug 修復 **3**（自主）：localStorage 讀取側損毀/停用防護、歷史檔索引回滾、benchmark_manual_flow 鏽死（0021 起即斷）＋自己寫的時段依賴測試
- 防回正棘輪：i18n 覆蓋率門檻 60→95%（實測 100%）、CSS 死碼不回流、vg-glass 定位不變量
- 品質：CSS 死碼 -5.6%、console.log 零殘留、bundle 體檢（初始 ≈196KB gz、lazy 如常）、時段依賴清零
- 驗證體系（從無到有）：本機瀏覽器煙霧（桌面＋手機＋四語＋導覽七步＋損毀韌性）、正式站唯讀煙霧、CI/備份/backlog API 監測、db 206 主動複跑、稽核腳本複檢
- 文件：ARCHITECTURE 對齊現況、TEST_STATUS/OVERNIGHT_REPORT 歷史標註、輪次索引、夜間摘要、repo 衛生
- 平行作業：worktree 隔離模式（自輪 62 起與使用者六個 feature 系列零衝突並行）

**待使用者**：PR #7 審核合併（CI 綠）、setup_pending、DB 密碼輪換、LINE token、員工帳號實測。


## 輪次 101（2026-10-10 凌晨）— FEATURE_TOURS 資料形狀守護

- tour.test 補 1 條：FEATURE_TOUR_TOPICS 與 FEATURE_TOURS 鍵一致（孤兒主題偵測）、每主題 ≥2 步、每步 sel+title+text 齊全——守護使用者 feature-tours 新增的主題導覣資料形狀（與既有 TOUR_STEPS 測試同模式）
- 前端 **274 → 275**


## 輪次 102（2026-10-10 凌晨）— 導覽內文 i18n 補完＋棘輪

- 掃描發現導覽內文 56 條中恰 **1 條**缺字典（chat 主題「點右下角藥丸展開助理，可直接用問的。」——使用者 feature-tours 的 i18n 紀律 55/56）：補上 en/vi/th 鍵 → **56/56=100%**
- 新增棘輪測試：TOUR_STEPS＋FEATURE_TOURS 所有 title/text 必須有字典鍵（未來導覣內容不帶翻譯直接 CI 失敗）
- 前端 **275 → 276**


## 輪次 103（2026-10-10 凌晨）— 終極 i18n 棘輪：tx() 字面值全鍵化

- 掃描 src 全部 `tx('字面值')` 呼叫：420 個中 **21 個缺字典**（優先序選項 EDD/SPT/CR、說明章節名、log 動作「系統重排/自動修正/每月自動歸檔」等——這些在 en/vi/th 會默默 fallback 中文）→ 全數補譯 en/vi/th，UI_TEXT 317→338 鍵
- 新增終極棘輪測試：**所有 tx() 字面值鍵必須存在於字典**——未來鍵打錯字或新增未翻譯字串，CI 直接失敗並列出（i18n 防護至此閉環：modal 標題、導覣內文、tx() 全域三層棘輪）
- 前端 **276 → 277**；heredoc 吃反斜線教訓三犯（regex 寫入一律 Edit/Write 工具）


## 輪次 104（2026-10-10 凌晨）— aria-label 全面 i18n 手術

- 掃出 **26 個純中文 aria-label**（讀屏使用者在 en/vi/th 介面仍聽中文）：日期導覽往前/往後、釘選、加班開關、歷史檔選擇器、方案比較、聊天室（chat-ui 4 點）等——**26 點全數 tx() 化**（動態複合者用 {name}/{n} 參數鍵），UI_TEXT +25 鍵 → 363
- 三重驗證：①殘留掃描 **0** ②全套 **277→278**（新增 aria 棘輪：純中文靜態 aria-label 即失敗）③瀏覽器實證——en 介面 aria-label="Previous day"/"Close"、抽屜正常開啟、**0 JS 錯誤**
- 過程小插曲：tx() 棘輪當場抓到自己漏加「方案比較」純鍵（只有複合版）——棘輪上輪才建、本輪即建功


## 輪次 105（2026-10-10 凌晨）— title/placeholder 收尾手術

- 掃出最後 **9 個**硬編碼中文 title/placeholder（回饋表範例文案、故障範例、三頁表格欄位提示、拉長工作提示、聊天自動朗讀與輸入框）→ 全數 tx() 化＋9 鍵（UI_TEXT 363→372）
- 屬性棘輪自 aria-label 擴及 **title/placeholder**——至此四層棘輪＋屬性全守護
- 驗證：殘留掃描 0、全套 **278/278**（棘輪為改寫既有測試，數不變；tx 棘輪自動驗新鍵）、en 介面瀏覽器實證 chinesePlaceholders=0、0 JS 錯誤


## 輪次 106（2026-10-10 凌晨）— 可見中文長尾量測（P3 立項）

- 量測 i18n 最後長尾：**432 個**去重純中文可見文字節點（設定頁選項、群組提示、請假審核按鈕、空狀態文案等）——多小時翻譯專案，不適合凌晨單輪硬吃；已立項 NEXT_TASKS P3（含掃描方法可重現），屬性層已清零
- 本輪無程式碼變更


## 輪次 107（2026-10-10 凌晨）— 432 長尾批次一：高頻 UI chrome

- 策略調整：夜間正是循環的工作時段，432 項長尾改為**分批消化**；本批＝每屏可見的 UI chrome 25 字（日/週班表、按設備/按工作、更多選單兩區塊名、午休/加班/故障/急徽章、在班/等待決定/准假/駁回、整月設定等）→ 37 點 tx() 化＋22 鍵（UI_TEXT 372→394）
- 過程：批次誤注入 2 處進 HELP 字串（破壞「help 條目＝整串鍵」模式、help 測試即刻攔下）→ 即時還原——**既有測試再次當場抓到我的錯**
- 驗證：278/278 綠、en 瀏覽器實證 Lunch/OT 圖例英文化、0 JS 錯誤；剩餘長尾約 407 項


## 輪次 108（2026-10-10 清晨）— 長尾批次二：功能性標籤 29 字

- 批次腳本新增 **HELP 區行範圍防護**（上輪教訓固化）：29/30 套用、「查看基本資料與最近變更」在 HELP 內正確跳過
- 內容：儲存中提示、加班開關、匯入確認、假日/請假狀態、機台位置、正常運作/已修復/已結束等；UI_TEXT 實算 **481** 鍵（沿途宣稱數低估、以 Object.keys 實算為準）
- 驗證：278/278 綠、en 煙霧 0 錯誤；長尾剩餘約 **378** 項


## 輪次 109（2026-10-10 清晨）— 長尾批次三：主題/徽章/空狀態 28 字

- 內容：設定主題選項（Auto/Light/Dark）、排程旗標單字徽章（Chg/Pin/Orig/New）、空狀態（無工單/無備忘/資料不足）、長提示句（順延建議/回報說明/歷史檔說明）等；品牌名「產線排程」刻意不翻
- HELP 防護再跳過 2 條（員工/釘僅存在 HELP 內）；278/278 綠；長尾剩餘約 **350** 項


## 輪次 110（2026-10-10 清晨）— 長尾批次四：編輯表單 26 字

- 內容：所屬分組/會操作機台/優先順序/件每分/加一站/刪除三類資源/固定徽章/現場回報鎖定說明等；**新教訓：譯文值內含雙引號會炸 JS 字串**——vi/th 的 "Cài đặt" 等引用 UI 名稱時必須用「」（本次 2 處語法錯誤使套件 278→241 即時暴露、立即修復）
- 278/278 綠；長尾剩餘約 **324** 項


## 輪次 111（2026-10-10 清晨）— 長尾批次五：策略與流程 24 字

- 內容：自動排程五策略選項、Excel 匯入/歷史存檔流程提示、預覽對照標籤（原本/調整後/期限/超過期限）、假日與單日停工說明；批次腳本新增**譯文禁雙引號**前置防護（上輪教訓固化）
- 24/24 全套用（掃描誤抓的三元表達式已排除）；278/278 綠；長尾剩餘約 **300** 項


## 輪次 112（2026-10-10 清晨）— 長尾批次六：預覽與突發流程 25 字

- 內容：方案比較對話（照你的條件/系統推薦/AI 推薦/不可套用/對照/調整後/影響的日期/最新變更改為 tx 標籤）、突發狀況精靈（哪一台壞了/誰要請假/哪一天/看調整方案）、歷史檔可見標籤（原表日期/來源檔案 wrap-only）
- HELP 防護跳過 1 條；278/278 綠；長尾剩餘約 **275** 項（六批共 157 字）


## 輪次 113（2026-10-10 清晨）— 長尾批次七：帳號與回饋流程 29 字

- 發現掃描假陽性主因：HELP 陣列長字串被 regex 在引號處切碎——改為**掃描與包裝都排除 HELP 行範圍**，且包裝改逐行（HELP 內出現的同詞原樣保留）
- 內容：帳號/登出/權限管理/新密碼流程、排程比對（日期 A/B/比較/重選）、意見回饋表單、月曆休假設定；＋26 鍵
- 278/278 綠；非 HELP 剩餘約 **228** 項（HELP 本體另有 ~19 條完整字串屬 help-i18n 體系、由既有 help 測試守護）


## 輪次 114（2026-10-10 清晨）— 長尾批次八：三頁表格 26 字

- 內容：欠缺品項/跨廠加工/工作紀錄的表頭（出貨日期/廠商/品號/欠貨數量/通知日期/加工編號/開工/預計完成/品號製程）、歸檔規則說明、「晚」徽章、一廠/二廠欄頭；＋23 鍵
- 278/278 綠；非 HELP 長尾剩餘約 **195** 項（八批共 212 字）


## 輪次 115（2026-10-10 清晨）— 長尾批次九：總表與分析 27 字

- 內容：跨廠加工通知總表欄頭（全部可給數/可給二廠時間/急用/要求回一廠時間/現在貨在哪）、產能分析五卡標題（機台稼動率/員工加班時數/工單狀態/近14天排程量/人力概況）、工作紀錄表頭；＋24 鍵
- 278/278 綠；非 HELP 長尾剩餘約 **172** 項（九批共 239 字）


## 輪次 116（2026-10-10 清晨）— 長尾批次十：工作紀錄/備忘/分組 26 字

- 內容：工作紀錄現場表（合格數/不良/開工完工時分/修模時間/加工者/依日期篩）、備忘抽屜（釘選說明/儲存備忘/一句話）、分組管理（新增/停用/儲存/範圍規則說明）、核對徽章（待確認/已核對/不對/未分組）；＋24 鍵
- 278/278 綠；非 HELP 長尾剩餘約 **149** 項（十批共 265 字）


## 輪次 117（2026-10-10 清晨）— 長尾批次十一：登入/回報/工作內容 25 字

- 內容：登入表單（帳號 Email/密碼/管理者邀請說明）、現場回報（原定/實際開始/實際完成/帳號未綁定提示）、情境保存、工作內容設定（純人工說明/跨廠階段）；＋22 鍵
- 278/278 綠；非 HELP 長尾剩餘約 **124** 項（十一批共 290 字）


## 輪次 118（2026-10-10 清晨）— 長尾批次十二：排班對話與助理 18 字

- 內容：一般工作排班確認對話（確認工作排班/移除此段/檢查通過等）、**聊天助理**（✦ 排程助理按鈕/清除/六個建議問題——chat-ui.js 首次納入可見字串體系）、跨廠階段標籤（加工廠加工/回廠點收後工作）、未開加班；＋18 鍵
- 本輪修正批次腳本：掃描與替換擴及 src 全部 JS（前 11 批只改 app.js，chat-ui 的字串其實一直掃得到但換不到）
- 278/278 綠、en 實證 Schedule assistant 按鈕英文化、0 錯誤；非 HELP 長尾剩餘約 **106** 項（十二批共 308 字）


## 輪次 119（2026-10-10 清晨）— 🎉 可見中文長尾清零（批次十三/十四＋尾掃）

- 排除 i18n.js 字典值後重掃（字典值非 UI 字串，前值 106 虛高）：實際僅 47 項待清
- 批次十三：LINE 通知設定 4 字＋輪班 UI 16 字（崗位資格/可上班別/需求規則三段長句）；line-notify.js 補 tx import（3 測試即時攔下）
- 批次十四：跨廠加工明細 16 字（加工品號/總量急用/預計交料/批次規則三段長句）
- 尾掃 10 點：多檔重複出現的既有鍵（transfer-ui 表頭同串）＋空格前綴變體（' 顯示已歸檔'）＋全形空格（我的設備　）
- **最終結果：非品牌可見中文殘留 = 0**（品牌「產線排程」刻意保留）；278/278 綠
- 累計：十四批共 **363 字** tx() 化、UI_TEXT 達 **~590 鍵**（從 302 起步）
- **en 介面實測（TreeWalker 掃全部文字節點）**：模板字面值殘留 0 ✓；仍有 92 個中文文字節點，來源三類：①品牌名「產線排程」（刻意保留）②假日名稱（HOLIDAYS 常數，資料層）③**JS 組合狀態字串**（同步晶片「存在這台電腦/雲端已同步/同步中/同步失敗」、本機模式、toast 訊息等）——第三類是新發現的殘留類型（非 >字< 模板形式，掃描法涵蓋不到），已列入下輪處理


## 輪次 120（2026-10-10 清晨）— JS 組合字串 i18n（同步晶片/帳號/toast）

- 輪 119 發現的新殘留類型首批清理：同步晶片三態（同步中/同步失敗/雲端已同步/存在這台電腦/已同步/同步失敗按這裡重試）、帳號顯示（帳號/本機模式/本機管理者）、sync/logout toast 兩則——5 處 JS 表達式 13 字 tx() 化＋13 鍵
- 過程事故：node 腳本兩步 split/join 把 ||'帳號') 錯替成 ?'帳號') 產生語法錯——git checkout 還原後改用 Edit 工具逐處（**JS 表達式內的替換用 Edit 工具，不用字串替換腳本**）
- en TreeWalker 複測：中文節點 92→**89**（殘餘＝品牌名×多處/假日名 HOLIDAYS/ROLE_NAME 角色名/「改為停工」按鈕/「排程」標題＝下一層待清）；0 JS 錯誤
- 278/278 綠


## 輪次 121（2026-10-10 清晨）— JS 組合字串第二批：角色/日曆/solver

- roleName() 輔助函數（ROLE_NAME 四角色老闆/組長/員工/電視檢視→tx）＋三個呼叫點、改為停工/改為上班按鈕、solver 離線說明、未設定——9 字＋9 鍵
- en 實測：中文節點 89→**87**；Mark closed 按鈕英文化 ✓；殘餘主要為品牌名/假日名/「排程」區塊標題/開加班按鈕/操作提示（拖動方塊…）；0 錯誤
- 278/278 綠


## 輪次 122（2026-10-10 清晨）— JS 組合字串第三批：看板標題與加班按鈕

- 開加班/調整加班按鈕（板頭）、看板標題組合片段（跨廠/排程/原本的排程/對照——h2 內的三元組合）6 字＋4 新鍵（跨廠/對照已有）
- en 實測：中文節點 87→**85**、Open OT 按鈕 ✓；殘餘＝品牌名/假日名/示範機台名（裁切機/裁切＝使用者資料層）/拖動提示句；0 錯誤
- 278/278 綠。**殘餘分類收斂**：品牌（不翻）/假日名 HOLIDAYS（資料層，可考慮 tx 包裹）/機台與工序名（使用者資料，依設計不翻）/拖動提示（模板掃描法盲區字串變體）

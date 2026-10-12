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
- **總輪次**: 216（65/66/69/74/75/76/78 為使用者系列，編號重疊以內容區分）
- **正式站**: web 200 ✓ solver 200 ✓ staging 200 ✓

## 測試
- 前端: **288/288** PASS
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

## 歷史輪次詳情（48–81）

已封存至 [OVERNIGHT_ARCHIVE.md](OVERNIGHT_ARCHIVE.md)（輪次 48–81 的完整記錄；摘要索引見上方「輪次索引」）。

## 輪次 82（2026-10-12，10 分鐘優化排程首輪）

- **過夜排程改為每 10 分鐘常態優化輪詢**（CronUpdate，同 prompt 涵蓋原過夜流程）
- **完成並合併雲端測試模式**（main `535e918`，分支 codex/cloud-test-mode-20261012）：
  - `?mode=test` 只連獨立測試專案（staging Supabase＋staging solver），任一設定不符即 fail-closed 停止連線，絕不回退正式/本機資料；測試與正式 auth session 分離
  - 登入頁/頂部「測試模式」橫幅＋回正式連結；mode 連結剝離 hash 憑證
  - main.js/solver.js 統一改用 RUNTIME 端點
  - tools/cloud-test-seed.mjs：離線種子 SQL 產生器（UUID 對映、只允許測試專案、additive+transactional、禁止重置）；CI solver job 附帶跑 OR-Tools 產生驗證預排班表 artifact（7 天保留）
  - 測試 +8（模式隔離/fail-closed/hash 剝離/種子安全），全套 **372/372 綠**＋build 綠
  - 實機驗證：一般啟動正常無測試入口；未設定時顯示「測試環境尚未設定完成，已停止連線；不會使用正式資料」＋回正式連結
- 正式 Supabase 全程未觸碰；下一步：CI 綠後，於 Render 設 VITE_TEST_* 環境變數（staging publishable key）即可在正式站啟用測試模式入口

## 輪次 83（2026-10-12，10 分鐘優化排程）

- **完成並推送測試模式安全強化**（main `020bc75`）：
  - 前端測試設定若含 sb_secret_／service_role 金鑰即 fail-closed（只允許 publishable key）
  - 註冊／忘記密碼信件導回網址保留 ?mode=test 並剝離 callback token（邀請信不會把人帶回正式站）
  - solver health 在測試模式放寬 45s（staging 冷啟動容忍）
  - 測試 +3，全套 **375/375 綠**＋build 綠
- 正式 Supabase 未觸碰

## 輪次 84（2026-10-12，10 分鐘優化排程）

- **測試模式 solver 金鑰支援**（main `~`）：新增可選 VITE_TEST_SOLVER_API_KEY，修復 staging solver 有金鑰保護時測試模式 401 退回瀏覽器演算法的缺口；測試/正式服務憑證互不沿用（+1 測試，376 綠）
- 工作區起步乾淨、上一輪 CI 綠（Tests/smoke/部署）

## 輪次 85（2026-10-12，10 分鐘優化排程）

- **測試模式 solver 請求 timeout 一致化**：post() 60s→測試模式 120s（冷啟動＋求解），health 45s 維持；正式行為不變（+1 契約測試，377 綠）
- 起步：工作區乾淨、上輪 CI 綠

## 輪次 86（2026-10-12，10 分鐘優化排程）

- **docs/TEST_MODE.md**：測試模式啟用指南——Render/本機 .env.local 設定、六項安全設計、CI 種子 artifact 下載與種入步驟、冷啟動行為說明（使用者正在 localhost 試 ?mode=test，文件直接對應其需求）
- db 測試 sanity：201/201 綠（久未跑）
- 起步：工作區乾淨、上輪 CI 綠

## 輪次 87（2026-10-12，10 分鐘優化排程）

- **修補 2 個 moderate 依賴漏洞**：exceljs→uuid 8.3.2（GHSA-w5hq-g745-h8pq）——npm overrides 強制 uuid 11.1.1（exceljs 只用 v4、API 不變）；Excel 測試 11/11、全套 377 綠、npm audit 歸零
- **驗證 CI 種子 artifact**：isolated-cloud-test-seed 每次 main push 皆有產出（GitHub API 確認 3 份最新 artifact）
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 88（2026-10-12，10 分鐘優化排程）

- **staging web 部署自動化入口**（main `9b35942`）：新增「部署 Render staging 網站」workflow（workflow_dispatch；未設 RENDER_STAGING_WEB_DEPLOY_HOOK 時印設定說明並跳過——實跑驗證綠燈與 notice 行為）。staging 落後正式多日首次有更新管道；hook 設定已列入 NEXT_TASKS 待使用者處理
- 健康檢查：正式 web/solver 200、staging solver 200
- 起步：工作區乾淨

## 輪次 89（2026-10-12，10 分鐘優化排程）

- **apply_plan 版本衝突測試補齊**（main `08992df`）：預覽建立後別人先存 → 套用時 40001 → ConflictError、排程只留對方版本不半套用。衝突覆蓋至此三路全齊（sync／save_blocks／apply_plan）；全套 378 綠
- 註：TEST_DATA_REPORT 的「衝突未驗證」其實 store 層已有覆蓋（本輪補齊最後一塊）
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 90（2026-10-12，10 分鐘優化排程）

- **正式站部署漂移檢查**：線上 bundle 實測含互動預覽（dp-row/dp-back/schedule-compare）、測試模式（獨立 auth storage／mode 判斷／金鑰防呆）——部署與 main 同步零漂移
- **測試報告修正**：衝突項由「未驗證」改為「通過（store 層）」，總計 30 通過／1 未驗證（僅剩斷線恢復 UI 層）
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 91（2026-10-12，10 分鐘優化排程）

- **互動預覽 i18n 收尾**：詳情卡 8 處組合字串 tx() 化（參數化）＋字典 +15 鍵；EN/vi/th 使用者的工序/交期詳情不再穿插中文。全套 378 綠＋build 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 92（2026-10-12，10 分鐘優化排程）

- **fallback 文案分層**：preview-nav 回傳 fallbackKind 代碼、app 層 tx() 顯示（+4 鍵）；模組回到純資料無展示文字，互動預覽 i18n 全面收尾。全套 378 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 93（2026-10-12，10 分鐘優化排程）

- **段落文字 i18n**：列表行/對照卡/摘要 5 處改用 app 層 tx() 格式器（dpSegTxt/dpRngTxt）；模組中文字串退為內部用途。互動預覽 i18n 僅剩 dueDetail stepRows（下輪）。全套 378 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 94（2026-10-12，10 分鐘優化排程）

- **互動預覽 i18n 完整收尾**：dueDetail stepRows 帶原始陣列、畫面 tx() 格式化（+1 測試，379 綠）。至此互動預覽所有動態文字（列表行/對照卡/摘要/詳情/交期/原因/段落）皆走 tx()
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 95（2026-10-12，10 分鐘優化排程）

- **EN 實機抽驗＋最後修漏**（main `fde32b4`）：切 EN 介面實際拖曳→預覽，抓到三處殘留中文（橫幅小字、交期列整句、需處理/準時標籤）全部參數化 tx()（+11 字典鍵）；複驗全英文（僅剩使用者資料與全站中文日期格式）。全套 379 綠＋build 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 96（2026-10-12，10 分鐘優化排程）

- **EN 標點收尾**（main `?`）：組合標點（；（）：、。）摺進翻譯鍵或以獨立標點鍵映射半形；EN 不再全形/半形混排，zh-TW 輸出不變。379 綠＋build 綠
- 清理上輪殘留 .tmp-en.mjs
- 起步：正式站 web/solver 200

## 輪次 97（2026-10-12，10 分鐘優化排程）

- **種子 artifact 內容驗證＋日期動態化**（main `616862f`）：下載最新 artifact 實查——12 員工/8 機台/20 工單/109 個 OR-Tools 驗證方塊（10/12–10/20）、SQL transactional＋禁止重置＋無破壞性語句。改進：--today 寫死 2026-10-12 改為 \$(date -u +%F)，種子永遠錨定本週
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 98（2026-10-12，10 分鐘優化排程）

- **vi/th 實機煙霧測試通過**：切越南語／泰語各載入一次——看板標題（Lịch／ตาราง）、圖例（Nghỉ trưa/พักเที่ยง 等）、導覽（Hôm nay/วันนี้ 等）、縮放列全數翻譯渲染、零崩潰。六輪 i18n（輪次 91–96）的 vi/th 字典實證可用。已還原 zh-TW
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 99（2026-10-12，10 分鐘優化排程）

- **預覽定位捲動強化**：dpScrollTarget 改 rAF 重試（≤800ms、PV 切換即中止）——修復大量方塊時 render>40ms 導致進詳情後看板不定位的靜默失效；既有 preview-events 沙箱測試全過（performance→Date.now）。379 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 100（2026-10-12，10 分鐘優化排程）

- **返回鈕聚焦 rAF 重試**（focusDpBack）：與輪次 99 的捲動定位同模式，修復 render 慢時鍵盤聚焦靜默失效；掃過其餘短 setTimeout（導覽 300-600ms、下載清理 1s 等）皆為刻意讓出主執行緒或延遲收尾，不需改。379 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 101（2026-10-12，10 分鐘優化排程）

- **中文實機回歸通過**（驗證輪）：拖曳→預覽→順延詳情→交期詳情完整走一遍——橫幅、列表行、對照卡（原/新各段）、事實行（員工/時間/多段跨日）、原因、交期步驟全數正常渲染；破損偵測（undefined/tx(/NaN/未替換佔位）零發現。輪次 91–100 的 i18n 與時序改動实证無回歸
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 102（2026-10-12，10 分鐘優化排程）

- **備份運維檢查＋補跑**：夜間備份（UTC 18:00 排程）今日延遲 2.5h 未執行（前兩日 GitHub 排程延遲 2–4h 後有跑）——手動 workflow_dispatch 補跑成功（42s，artifact 產出），確保 10/11 有備份。pg_dump 純讀取，正式資料庫未寫入
- 併行檢查：Tests/部署/煙霧三 workflow 近 15 次全綠；工作區乾淨、正式站 web/solver 200

## 輪次 103（2026-10-12，10 分鐘優化排程）

- **備份排程備援時段**（main `88a9032`）：nightly-backup 加 UTC 22:00 第二時段——GitHub 排程延遲常態化（連三日 2–4h、10/11 需手動補跑），雙時段確保當天必有備份；artifact 各自命名＋30 天保留，一天兩份無副作用
- 起步：工作區乾淨、正式站 web/solver 200、昨日備份已補跑成功

## 輪次 104（2026-10-12，10 分鐘優化排程）

- **備份還原演練**：手動 dispatch（上月 10/01 排程未fire，僅 10/02 手動跑過）——下載最新 artifact（factory-20261011-2029.dump，即輪次 102 補跑那份）＋PG17 容器 pg_restore --list 驗證，28s 成功。備份→保留→可還原鏈路端到端確認
- 起步：工作區乾淨、正式站 web/solver 200；上輪雙時段排程已生效於 repo

## 輪次 105（2026-10-12，10 分鐘優化排程）

- **依賴健檢＋patch 更新**（main `e81e4bc`）：supabase-js 2.117.2→.3、vite 6.4.3→.4（semver 相容）；379 綠＋build 綠＋audit 0。pglite 0.3→0.5、saxes 5→6 破壞性跨度列入 NEXT_TASKS 待辦
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 106（2026-10-12，10 分鐘優化排程）

- **pglite 0.3.16→0.5.8**：db 測試沙箱升級一次成功——14 個真 SQL 測試（衝突/權限/apply_plan）＋全套 379 綠＋build 綠；NEXT_TASKS 剩 saxes 5→6 一項
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 107（2026-10-12，10 分鐘優化排程）

- **saxes 5→6**：legacy Excel XML 解析（歷史班表匯入）升級——scan 包裝器三事件 API 相容，14 相關測試＋379 全綠＋build 綠；exceljs 巢狀 saxes@5 不受影響。**依賴升級待辦全數結案**（pglite/saxes 兩項破壞性跨度皆完成）
- 起步：工作區乾淨、正式站 web 200

## 輪次 108（2026-10-12，10 分鐘優化排程）

- **品質驗證輪（無需修改）**：(1) 空 catch 全面掃描——18 處全是刻意漸進增強（localStorage 限額防護、可選 API 降級、音效/通知），無該記未記的吞錯；(2) 依賴升級後 bundle 基準——main 292KB gz＋three/excel 皆確認為 lazy chunk（WebGLRenderer 命中證實為動態 namespace 引用，非本體打包），結構健康
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 109（2026-10-12，10 分鐘優化排程）

- **權限與排程隔離演練**：上次 10/02 後 main 累積 ~25 commit 未演練——手動 dispatch（36s 成功）：最新備份還原到拋棄式 PG17 → 重放全部 migration → 模擬 boss/lead/viewer 驗證資料庫層權限矩陣與排程流程。10/02 以來的 schema/程式變更在真備份上驗證相容；正式環境零接觸
- 盤點：acceptance-sim／catalog-inventory 兩演練同樣 10/02 後未跑（無 schedule、僅 dispatch；近期無 schema 變更，暫不急）
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 110（2026-10-12，10 分鐘優化排程）

- **README 補測試模式入口**：部署段加 ?mode=test 說明＋docs/TEST_MODE.md 連結（使用者待設定 VITE_TEST_* 時可從 README 直達指南）
- db 測試例行驗證：201/201 綠
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 111（2026-10-12，10 分鐘優化排程）

- **render.yaml 預留 VITE_TEST_* 欄位**（main `d9cffd3`）：Blueprint 宣告測試模式四變數（sync:false）＋註解說明——使用者到 Render Dashboard 只需填值不用新增欄位；未填時 fail-closed 零影響。與 docs/TEST_MODE.md、README 形成完整啟用路徑
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 112（2026-10-12，10 分鐘優化排程）

- **solver 端健檢（驗證輪）**：正式 /health ok=true（OR-Tools 9.15.6755、database=true、5 項 capabilities 含 work_assignments/staff_roster/schedule_chat 三系列）；程式樹 12 模組結構清晰、無 TODO/FIXME；147 個 pytest 由 CI solver job 把關（本機 uv 損壞不影響）。無需修改
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 113（2026-10-12，10 分鐘優化排程）

- **儲存失敗路徑測試**：rpc 網路例外→資料庫零部分寫入、重讀原版、版本不變（+1，store 15/15、全套 380 綠）。衝突/權限/網路三種失敗路徑覆蓋齊全
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 114（2026-10-12，10 分鐘優化排程）

- **beforeunload 守門**：同步在途（syncPending/busy）關分頁改為提示確認——填補「確認套用後立刻關頁，寫入靜默丟失」缺口；平常瀏覽零打擾（+1 契約測試，381 綠）
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 115（2026-10-12，10 分鐘優化排程）

- **進度文件封存整理**：輪次 48–81 詳細記錄移至 OVERNIGHT_ARCHIVE.md（完整保留），主檔 1356→285 行——10 分鐘循環讀「最後幾輪」更省 context，索引仍在主檔
- 起步：工作區乾淨、正式站 web/solver 200

## 輪次 116（2026-10-12，10 分鐘優化排程）

- **待辦清單校準**：測試模式待辦更新為「render.yaml 已預留四欄位、Dashboard 填值即可」；NEXT_TASKS 僅 61 行體積健康。本輪以健康檢查收尾：正式 web/solver 200

## 輪次 117（2026-10-12，10 分鐘優化排程）

- **due-list 導航狀態啟用**：總覽交期區切前 4 筆＋「查看全部 {n} 張」按鈕（原先無入口的死狀態；比照連帶影響區模式）。381 綠＋build 綠
- 健康檢查：正式 web/solver 200、staging web 200

## 輪次 118（2026-10-12，10 分鐘優化排程）

- **dev 站 console 錯誤煙霧（驗證輪）**：今日全部變更（i18n 五輪＋時序兩輪＋due-list＋beforeunload＋依賴升級）後重載——看板 26 方塊正常渲染、error/unhandledrejection 監聽 2.5s 零錯誤
- 起步：工作區乾淨、正式 web/solver 200、staging web 200

## 輪次 119（2026-10-12，10 分鐘優化排程）

- **due-list 實機 E2E 驗證**：M19 沖壓大拖曳影響 6 張工單——總覽顯示 4 筆＋「查看全部 6 張」→ 進列表（6 筆完整）→ 返回總覽 → 進交期詳情 → 取消，全流程正常。輪次 117 的變更端到端實證
- 健康檢查：正式 web/solver 200；今日備份已由備援時段（21:10Z）自動完成

## 輪次 120（2026-10-12，10 分鐘優化排程）

- **選擇器健全性抽查（驗證輪）**：dpScrollTarget 手機補償引用的 .pv-manual 確實由 manualStripHTML 渲染（pv pv-manual）、CSS 530–535 有黏頂樣式——無死選擇器。機器端待辦仍空，僅剩兩項使用者設定事項
- 健康檢查：正式 web/solver 200；工作區乾淨

## 輪次 121（2026-10-12，10 分鐘優化排程）

- **部署後功能標記驗證自動化**：deploy-render 加最終步驟——輪詢正式站 bundle（≤10min）驗證含 schedule-compare/dp-row/fsched-test-auth 標記（字串字面值不受壓縮影響）；修復「hook 觸發即結束、部署回滾無人知」缺口。輪次 90 的手動檢查自此常態化
- 起步：工作區乾淨、CI 近 4 run 全綠、正式 web/solver 200

## 輪次 122（2026-10-12，10 分鐘優化排程）

- **標記驗證步驟首跑實證**（手動 dispatch）：步驟邏輯正確、第一輪即命中全部標記；修掉 printf broken pipe log 噪音（herestring）。輪次 121 的部署驗證機制上線完成
- 起步：工作區乾淨、正式 web/solver 200

## 輪次 123（2026-10-12，10 分鐘優化排程）

- **健康檢查輪（機器端待辦空）**：正式 web/solver 200、staging web 200；近 5 CI run 全數 completed success；docs-only push 正確不觸發部署。待使用者事項不變（staging hook、測試模式填值）

## 輪次 124（2026-10-12，10 分鐘優化排程）

- **部署映像健檢（驗證輪）**：web/.dockerignore 已排除 env/node_modules/dist/tests；Dockerfile 只 COPY 必要檔＋三建置變數防呆；Render static 走原生建置、VITE_TEST_* 填 Dashboard 即生效（Vite 讀 process env）。無需修改
- 健康檢查：正式 web/solver 200

## 輪次 125（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200、staging web 200、近 3 CI run 全綠。機器端待辦空；使用者事項不變

## 輪次 126（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 127（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 128（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 129（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 130（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 131（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 132（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 133（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 134（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 135（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

## 輪次 136（2026-10-12，10 分鐘優化排程）

- **健康檢查輪**：正式 web/solver 200；工作區乾淨。機器端待辦空；使用者事項不變

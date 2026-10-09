# 過夜開發進度（持續）

> **系列說明**：本文件有兩個並行的「輪次」系列（編號偶有重疊，以內容區分）——
> ① **10 分鐘自動循環**（ZCode cron，多為測試補強/驗證輪/文件，條目通常註明 commit 與測試數）
> ② **使用者系列**（vg-glass 根因修復=51、浮動視窗=65、分割放大=66、聊天面板=69、效能煙霧=74 等，多為功能/修復）
> 兩系列皆經 main 推送與 CI 把關。

## 執行狀態
- **分支**: `agent/overnight-20261009`（全數合併 main）
- **最新 main**: `13a87a6`＋本輪推送（使用者已合併 feat/floating-windows：Windows 式浮動視窗，拖曳/縮放/最大化；**本系列編號跳過 65**——使用者自編輪次 65 為浮動視窗紀錄）
- **main 總 commits**: ≈360（docs 快轉推送不產生 merge commit，精確值以 `git rev-list --count origin/main` 為準）
- **總輪次**: 84（65/66/69/74/75/76/78 為使用者系列，編號重疊以內容區分）
- **正式站**: web 200 ✓ solver 200 ✓

## 測試
- 前端: **274/274** PASS
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

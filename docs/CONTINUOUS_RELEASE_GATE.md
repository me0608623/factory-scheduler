# 持續缺陷探索與發布驗收

## 2026-10-15 15-min tracking R19 checkpoint：undo 連點語意鎖定＋a11y toast/syncChip 審查（無缺陷）

- 起點 bd40eec clean。**探索**：undo() 為 async（commit await）——連點第二下會否交錯寫入？**實證（vm 編譯實際 undo）**：兩次 undo 各自 pop 一筆快照、各 commit 一次、終態＝最舊快照——語意正確（同步 pop 先於 await，快照序列不交錯）；queueSync 的 syncChain 序列化保證兩次 commit 不交錯落庫。初版測試斷言方向寫反（stack 頂端=最舊），修正後 GREEN——非產品缺陷。
- **a11y 審查（唯讀）**：toast 元素 role=status ✓（隱含 aria-live=polite）；syncChip 以 title 呈現錯誤訊息＋可見文字（tx 文案）✓；錯誤轉換時 queueSync 已有 toast 通道。無缺陷。
- **提交 912bacf**：新測（undo 連點語意鎖定，防未來回歸）；全套 **811/811**＋build；CI 全綠。**PR16 同步**→**5dbd041**（**812/812**）。純測試變更，staging 無需重部署（服務 runtime 未變）。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。
- 下一步：新缺陷類探索（候選：競爭類——syncChain 與 undo 互動在 save 失敗重試路徑）。

## 2026-10-15 15-min tracking R18 checkpoint：staging 批次部署 e6ba43d（#31）完成驗收

- 起點 e562bed clean；**7fc989b 為 e6ba43d 祖先** OK → 普通 push `e6ba43d:codex/excel-friendly-ui-20260930`（7fc989b..e6ba43d，non-force）。
- **部署證據**：GitHub deployment **7064419439** sha=**e6ba43d**，statuses[0]=**success**；staging bundle `index-Bnyk9wq0.js`。
- **runtime 標記驗證（壓縮形狀）**：`"c-save":()=>{var i;if(!ct()||!((i=u.modal)!=null&&i.draft))return;` 與 `if(!u.modal)return;u.modal.sec`（help-sec）＝#31 守門在線上。
- **瀏覽器驗收（qa-lead session、零寫入）**：boot 正常、10/14 22 段、dialog 0、bundle 一致。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變（PR16 已含至 8603679）。null-modal 掃描系列（#29/#30/#31 共 15 守門）全數上線。
- 下一步：新缺陷類探索（掃描收斂後轉向）；發布門檻待使用者側。

## 2026-10-15 15-min tracking R17 checkpoint：缺陷#31 日曆／說明／加班切換族守門（#30 掃描延續）

- 起點 16eace8 clean。**listener 級掃描**：列級掃全部 `UI\.modal\.<prop>` 直取（40 處），回溯所屬 handler 守門分類——多數 m-*/o-*/p-* 切換鈕只在 modal 開啟時存在（同步 render 移除按鈕，連點第二下不可達）；**可達風險**＝會關窗的 c-save/c-week/c-day 族（c-save 成功後 closeModal＋dpApplied）、help-sec（modal 內 sec 切換，防禦性）、ot-day/ot-person/ot-reset（加班設定切換族，ot-save 已修但同窗鄰鈕未守）。
- **最小修正（e6ba43d）**：七處各加一行守門——c-save/c-week/c-day（`!UI.modal?.draft`，c-save 重現路徑＝儲存成功關窗後連點第二下）、help-sec、ot-day（`!UI.modal`）、ot-person/ot-reset（`!UI.modal?.overrides`）。全套 **810/810**＋build；CI @e6ba43d 全綠。**PR16 同步**→**8603679**（**811/811**）。
- 掃描剩餘（mk-color/diff-run/b-*/m-emp-del/group-confirm/gw-* 等）＝按鈕生命週期不可達或已有自身驗證；記錄不再逐一守門（避免無意義 diff 膨脹）。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。staging 未部署（累積 e6ba43d，下輪批次）。
- 下一步：①staging 批次部署 e6ba43d；②新缺陷類探索（本掃描收斂）。

## 2026-10-15 15-min tracking R16 checkpoint：staging 批次部署 7fc989b（#30 家族）完成驗收

- 起點 6202d10 clean；**d8ee0bd 為 7fc989b 祖先** OK → 普通 push `7fc989b:codex/excel-friendly-ui-20260930`（d8ee0bd..7fc989b，non-force）。
- **部署證據**：GitHub deployment **7063807879** sha=**7fc989b**，statuses[0]=**success**；staging bundle `index-CEwznBi0.js`。
- **runtime 標記驗證（壓縮形狀）**：`if(!t||!ct())return`（#29）＝1；`"lq-go":()=>{var a;if(!Me()||((a=u.modal)==null?void 0:a.t)!=="leaveq"`（#30 型別守門）＝在線上。
- **瀏覽器驗收（qa-lead session、零寫入）**：boot 正常、10/14 22 段、dialog 0、bundle 一致。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變（PR16 已含至 740b127）。
- 下一步：①DRAWER_ACT／document 級同型掃描；②發布門檻待使用者側。

## 2026-10-15 15-min tracking R15 checkpoint：缺陷#30 null-modal 直取家族系統性清掃（#29 同型 ×7）

- 起點 8e93d64 clean。**系統性掃描**：正則掃 app.js 全部 data-act handler——直取 `UI.modal.<prop>` 而無存在守門者共 11 處；逐一 vm 編譯實測（compile 實際程式碼、UI.modal=null、doesNotThrow）。
- **實證結果**：**7 處 RED**（連點第二下拋未捕捉 TypeError）：inc-step/inc-back/lq-date（賦值拋 `Cannot set properties of null`）、m-proc（讀 draft）、pd-set/pm-week、lq-go（讀 id）。4 處安全（b-emp/b-mach/b-pin/b-fix 的 `S.blocks.find(x=>x.id===UI.modal.id)` 回 undefined 後續拋的是自身 TypeError——b.* 族已在測試中驗證 find-undefined 也拋、屬同類風險，一併守門）；m-emp-del 經測安全（employeeGroups 先攔）。
- **最小修正（7fc989b）**：七個 handler 各加一行 `if(!UI.modal...)return;`（lq-go 用 `UI.modal?.t!=="leaveq"` 型別兼守門）。
- **回歸**：新測 null-modal-guards 2 測（切換族＋區塊族）；全套 **810/810**＋build；CI @7fc989b 全綠。**PR16 同步**→**740b127**（**811/811**＋build）push。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。staging 未部署（累積 7fc989b，下輪批次）。
- 下一步：①staging 批次部署 7fc989b；②繼續掃描（DRAWER_ACT/document 級 handler 同型）。

## 2026-10-15 15-min tracking R14 checkpoint：staging 批次部署 d8ee0bd（#29）完成驗收

- 起點 0ed8a7b clean；**17c7d91 為 d8ee0bd 祖先** OK → 普通 push `d8ee0bd:codex/excel-friendly-ui-20260930`（17c7d91..d8ee0bd，non-force）。
- **部署證據**：GitHub deployment **7062943883** sha=**d8ee0bd**，statuses[0]=**success**；staging 服務 bundle `index-DsS5eFgY.js`（新構建）。
- **runtime 標記驗證**：線上 bundle 壓縮後 `function oy(t){if(!t||!ct())return;const e=t.date…`＝#29 的 null-modal 守門**已在線上**。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變（PR16 已含至 6962b5f）。
- 下一步：①MODAL_ACT 連點類系統性掃描；②發布門檻待使用者側。

## 2026-10-15 15-min tracking R13 checkpoint：缺陷#29 ot-save 連點第二下未捕捉 TypeError

- 起點 87fee23 clean。**探索**（連點／靜默失敗類）：`"ot-save":()=>saveDailyOT(UI.modal)` 無 m 存在守門——第一下同步完成（含 closeModal）後，連點第二下事件到達時 UI.modal=null → `m.date` 拋 **未捕捉 TypeError**（僅 console，使用者無感知；首次儲存已成功故資料無損，但屬靜默處理器錯誤）。RED：vm 編譯實際函式呼叫 `saveDailyOT(null)` 確實拋出。
- **最小修正（d8ee0bd）**：`if(!m||!canCalendar())return;` 一行——視窗已關＝安全 no-op。
- **回歸**：新測 ot-save-guard 1/1（含 undefined）；全套 **808/808**＋build；CI @d8ee0bd Tests／smoke／Synthetic 全 success。**PR16 同步**→**6962b5f**（**809/809**＋build）push。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。staging 未部署（累積 d8ee0bd 一個 runtime 變更，下輪批次）。
- 下一步：①staging 批次部署 d8ee0bd；②繼續連點類掃描（其他 `MODAL_ACT` 直取 UI.modal 而無守門者）。

## 2026-10-15 15-min tracking R12 checkpoint：輸入邊界審查＋staging 情境清單唯讀驗收（無缺陷，安靜輪）

- 起點 096e05b clean 無新事件。**輸入邊界審查（唯讀）**：memo-text maxlength=140＋送出前 trim＋空值 toast（DB check btrim 1-140 對齊）；leave-request 日期空值有守門；schedule-diff 空值/同日有守門；memo 機台/人員 select 空廠退化為「不指定」——邊界完備，無缺陷。
- **staging 情境清單唯讀 E2E（qa-lead session、零寫入）**：更多→試排情境開啟正常（17c7d91 bundle）——標題、隱私 hint、「還沒有保存的情境」空態、保存目前排程鈕在；關閉正常。scenarioReadOwner 唯讀族在部署版實證可用。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。
- 下一步：繼續新缺陷探索；發布門檻待使用者側。

## 2026-10-15 15-min tracking R11 checkpoint：TV 模式×direct-write 顯示與釋放路徑審查（無缺陷，安靜輪）

- 起點 5d8af73 clean 無新事件（main/PR 無變動、CI 綠）。
- **唯讀審查**：①TV 模式（body.tv）僅隱藏 .cards/.admin 與停用聊天，ops-drawer 保持運作＝設計（管理模式切換存在）；directWriteStatus 在 people/notes 抽屜正常渲染。②releaseDirectWrite 手術式更新受**操作身分守門**（`UI.directSaving!==operation` 早退）—— op1 釋放時若 op2 在途不會誤啟用；按鈕 disabled 公式雖未含跨族旗標，但 runDrawerWrite 入口守門（directSaving||memoSaving||leaveBrushSaving||modal||PV 全擋）完備——視覺差異不构成資料風險。③leave-resolve/memo-pin 均帶 data-direct-write-control。結論：無缺陷。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。
- 下一步：繼續新缺陷探索；發布門檻待使用者側。

## 2026-10-15 15-min tracking R10 checkpoint：main 例行合併＋PR16 平行度稽核＋scenarioReadOwner 唯讀族審查（無缺陷）

- 起點 ef3c470 clean。**main 例行合併**：origin/main（d7a6f04，僅 fs-hunt docs 23 行）普通 merge → **553d8af**；全套 **807/807**＋build；push 後 CI Tests／smoke／Synthetic 全 success @553d8af。
- **PR16 平行度稽核**：diff a209e17..ef3c470 runtime＝僅 2 檔——`styles.css`（PR16 多 `color:var(--ink)` 於 environment-banner 按鈕）與 `cloud-test-seed.test.mjs`（PR16 多 14 行）＝**另一 agent 的 test-mode 特有提交**（非 gate 遺失），依協議保留在 PR16、不反向覆蓋；我的全部 runtime 修正（#25-#28＋橫幅）在 PR16 齊備（非 merge 稽核：826cacb..a209e17 僅含本系列提交）。無需動作。
- **scenarioReadOwner 唯讀族審查（唯讀）**：openScenarioList/viewScenario 皆有 owner 模式（store/client/user/epoch/modal/PV/S/focus 全比對）、loading 態、`item.id!==id` 防護、getScenario 兩 store 實作對應——未發現缺陷，不重做既有覆蓋。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。
- 下一步：①新缺陷探索；②發布門檻待使用者側（第二帳戶同意信未回）。

## 2026-10-15 15-min tracking R9 checkpoint：undo×補讀互動探索——假設被既有契約否決（無缺陷，實證收斂）

- 起點 96c1540 clean。**假說**：未知結果補讀（#27 reconcile）套用伺服器事實後，undoStack 殘留舊快照——undo+sync 可能覆蓋剛現形的已准假等狀態。
- **實驗**：寫真 SQL RED（補讀後 undoStack 未清）＋最小修（onRemoteChange reconcile applied 時 undoStack=[]）。修後聚焦綠但全套 **2 RED**：execution-receipt #8/#164 明確鎖定「late-ACK 補讀**不得**清 undo」（其測試以 undoStack 為契約斷言）——07:53 checkpoint 設計有意的保護。
- **否決理由（查證）**：undo 後 sync 撞**排程版本衝突守門**（supabase-store 測試「排程已被別人更新→整份拒絕、不留半套」）——跨版本覆蓋已被既有防護攔截；殘留 undo 屬「回到已知狀態」語意。跨契約變更需使用者決策，不單方改。
- **處置**：撤回實驗修（git checkout）＋移除假說測試；回歸 **807/807**＋build PASS＝回到 17c7d91 基線，零淨變更。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變。
- 下一步：①新缺陷探索（候選：scenarioReadOwner 唯讀族、TV 模式下 direct-write 顯示）；②發布門檻待使用者側不變。

## 2026-10-15 15-min tracking R8 checkpoint：staging 批次部署 17c7d91（#28＋橫幅修）完成驗收

- 起點 9fd1a4a clean；**09131b5 為 17c7d91 祖先** OK → 普通 push `17c7d91:codex/excel-friendly-ui-20260930`（09131b5..17c7d91，non-force）。
- **部署證據**：GitHub deployment **7061203125** sha=**17c7d91** env=web-staging，statuses[0]=**success**。staging 服務 bundle `index-BHdCzvO3.js`（與 09131b5 版 BdRv0dC4 不同＝新構建）。
- **runtime 標記驗證**：線上 bundle grep `scenario-unknown:`（#28）＝1、`directWriteError=null`（橫幅修）＝1——R7 兩修已上線。
- **瀏覽器實際驗收（qa-lead session）**：看板 boot 正常、10/14 22 段、dialog 0、bundle 一致。未按雲端寫入。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變（PR16 已含全部至 a209e17）。
- 下一步：①新缺陷探索（候選：undo 與 direct-write 補讀互動、scenarioReadOwner 唯讀族）；②PR16/18 發布門檻仍待使用者側（第二帳戶同意信未回）。

## 2026-10-15 15-min tracking R7 checkpoint：缺陷#28 情境同名重開重複列＋directWriteError 殘留橫幅（兩修）

- 起點 9ed8431 clean 無 modifier。
- **缺陷#28 實證（save_planning_scenario RPC 語意）**：RPC 依 **id 冪等**（同 id+同名+同載荷→回原 id），但**無名稱唯一性**——未知結果（第一發真提交後丟網路錯）→關窗→重開保存視窗同名→makeScenario 產生**新 id**→插入成功→**同名兩列**（RED：真 PGlite+真 RPC+實際 handler，rows 2!==1）。同 modal 重試本就安全（m.item 引用重用，idempotent）。
- **最小修正（17c7d91）**：UI.scenarioUnknown session 清單（鍵=名稱 trim、值={id,sk:user@epoch}）——catch 登記原 id；同 session 同名重試沿用原 id（RPC 冪等回原列）；成功 ACK 清除；跨 session 不沿用；改名＝新鍵不沿用（既有測試「改名不默默存舊名」保持）。已知拒絕也會登記（無害：重試撞「情境代號已使用」得到清楚已知錯）。既有測試 #4 的參考相等斷言放寬為 JSON 序列化相等（ledger 重試產生結構相同新物件，行為意圖=同 id+同載荷）。
- **directWriteError 生命週期修（同 commit）**：#27 的安全補讀套用後，殘留的「處理失敗」橫幅與新狀態（已准假）矛盾——reloadFromStore applied 路徑加 `UI.directWriteError=null`。RED（真 SQL：RPC 提交+丟回應→橫幅在→補讀 timer→approved 浮現→橫幅仍在）→修後 GREEN。清除僅在 applied（deferred/failed 不清）。
- **回歸**：scenario 7/7、leave-pin 21/21、memo 14/14；全套 **807/807**＋build；push 9ed8431..17c7d91，CI Tests／smoke／Synthetic 全 success。**PR16 同步**：merge→**a209e17**（**808/808**＋build）push。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。staging 仍在 09131b5（兩修未部署，累積中）。
- 下一步：①staging 批次部署 17c7d91（含 #28＋橫幅修）＋驗收；②繼續新缺陷（候選：scenarioReadOwner 家族唯讀路徑、undo 與 direct-write 互動）。

## 2026-10-15 15-min tracking R6 checkpoint：staging 批次部署 09131b5 完成驗收＋execution ledger 覆蓋複查

- 起點 34fe380 clean；核對 **37fd415 為 09131b5 祖先**（merge-base --is-ancestor OK）→ 普通 push `09131b5:codex/excel-friendly-ui-20260930`（37fd415..09131b5，non-force）。
- **部署證據**：GitHub deployment **7058807779** sha=**09131b5** env=web-staging，statuses[0]=**success**；staging 根頁 HTTP 200。bundle `index-BdRv0dC4.js`（本地建置雜湊 mpMlvmsi 不同＝Render 建置環境差異，與歷史一致——37fd415 本地 78YwSAKS vs 當時線上 ocxx-Pc7 同現象；跨環境雜湊不可作身分訊號）。
- **版本身分以 runtime 標記驗證**：下載線上 bundle（1,009,300B）grep 三個僅存在於本批程式碼的標記——`memo-unknown:`（#25）／`這天可能已有等待中的請假詢問`（#26）／`leave_requests_one_pending`（#26 偵測）——**三標記全部命中（各 1 次）**＝4 個 runtime 變更（0a64219/8f98a21/5329c48/09131b5）確已上線。
- **瀏覽器實際操作驗收（qa-lead 既有 session）**：看板 10/14 22 段/dialog 0；備忘抽屜正常（既有測試備忘顯示、＋新增備忘鈕在）；更多→現場回報視窗開啟正常（提示文案在）後關閉返回。未按任何雲端寫入操作。
- **execution ledger 覆蓋複查**：UnconfirmedWriteError 分類完整存在於 store（receipt 驗證/finishedAt/receiptBlock/情境保存 217/238 等）；app 端 executionRetries/pendingRequest 機制 16 處引用；07:36 checkpoint 的同頁 session ledger（71f1818）與 909d1c0 報工補讀已含 unknown 分支防護——**無新缺口**，不重做。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變。臨時 worktree fs-37tmp 已清除。
- 下一步：①新缺陷探索（候選：畫面凍結/連點於 direct-write in-flight 時的 UI.directWriteError 顯示生命週期；情境保存 unknown 分支的實渊覆蓋）；②PR16 視需要再同步（目前 826cacb 已含全部 4 變更）。

## 2026-10-15 15-min tracking R5 checkpoint：缺陷#27 drawer-write 未知結果補讀＋PR16 兩段同步＋staging 批次部署評估

- 起點 636e158 clean 無 modifier。
- **PR16 同步 #26 修正**：核對 clean/remote=61609a4 → merge → **1886145**（805/805＋build）push。
- **缺陷#27 實證（runDrawerWrite 家族：准假/駁回/釘選/取消釘選）**：RPC 真提交但回應丟失（未知結果）→catch 顯示「處理…失敗」錯誤但**永不排補讀**——DB 已 approved 而畫面停在 pending 且無任何核對機制。RED（真 PGlite＋真 RPC commit＋實際 handler）：斷言未知結果須排一次有界安全補讀且補讀後畫面浮現 approved——修前 RED。
- **最小修正（09131b5）**：runDrawerWrite catch 加 `if(owner.sameSession())pendingReload=true`——沿用既有 maybeReload 守門（草稿/預覽/拖曳/在途保護不變），已知拒絕也僅多一次有界讀。診斷過程：初次斷言寫錯（flag 殘留）——實際 finally 的真 maybeReload 在視圖乾淨時**立即消耗 flag 並排 timer**（更即時的正確行為）；以獨立編譯探針證實修正本身有效後改斷言為「timer 已排＋補讀 1 次＋DB approved＋畫面浮現」。聚焦 20/20、全套 **805/805**＋build、CI @09131b5 全綠。
- **PR16 同步 #27**：merge → **826cacb**（806/806＋build）push，CI Tests／smoke／Synthetic 全 success。
- **staging 批次部署評估（記錄，本輪未部署）**：staging branch codex/excel-friendly-ui-20260930 remote=**37fd415**（dep-db7cfj7avr4c73f4sl7g 時代）。本分支累積 runtime 變更：0a64219（memo 補讀）、8f98a21（memo 防重複）、5329c48（leave 衝突友善）、09131b5（drawer 補讀）＝4 個待部署，皆有全套回歸＋CI 綠。37fd415 為 09131b5 祖先（普通 push 可達），部署路徑=推 stage branch→auto deploy→bundle/瀏覽器驗收。**未驗證**：實際部署；下輪執行（需完整部署後驗收流程）。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；PR16/18 draft 門檻不變。
- 下一步：①執行 staging 批次部署＋完整驗收；②繼續 direct-write 家族探索（execution confirmation ledger 的 unknown 分支已有 71f1818 防護，複查覆蓋）；③新缺陷。

## 2026-10-15 15-min tracking R4 checkpoint：缺陷#26 leave 重送撞唯一索引（友善訊息＋安全補讀）＋PR16 同步

- 起點 96f81d4 clean 無 modifier。
- **PR16 同步 R3 修正**：worktree 核對 clean/local=tracking=remote=22a6cda → 普通 merge → **61609a4**（含 8f98a21 memo 防重複）；全套 **804/804**＋build，push 22a6cda..61609a4；CI 實查 Tests／smoke／Synthetic 全 success @61609a4。
- **缺陷#26 實證（先 RED，真 PGlite SQL＋實際 handler）**：leave_requests 有部分唯一索引 leave_requests_one_pending(employee_id,date where pending)——**資料層不會重複**（列數恆 1），但未知結果（第一發真提交後丟網路錯）→關窗→重開重送→撞索引→catch 把 **「duplicate key value violates unique constraint」原始 SQL 直送長者畫面**且不排補讀（詢問遲遲不現形）＝顯示層缺陷。RED 斷言「不得出現原始 SQL；須排一次安全補讀」。過程三段自我糾正：①首版踩 FK 假 RED；②fixture uid 非 UUID 假成功（兩發都沒進索引）；③插樁清理誤刪斷言行——最終以獨立探針證實真路徑後取得真 RED。
- **最小修正（5329c48）**：catch 辨識 dupPending（code 23505／訊息含 leave_requests_one_pending|duplicate key|unique constraint）→ 顯示「這天可能已有等待中的請假詢問（剛才的送出可能已成立）；關閉視窗後系統會自動核對最新資料。」＋同 session 排 pendingReload 一次安全補讀（既有 maybeReload 守門）。不改 DB、不加輪詢。
- **回歸**：聚焦 leave 19/19（新測 GREEN：友善訊息＋補讀 1 次＋列數 1）；全套 **804/804**＋build PASS；push 96f81d4..5329c48，CI 實查 @5329c48 Tests／smoke／Synthetic 全 success。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 保持停用；PR16/18 draft 門檻不變。5329c48 尚未同步 PR16（下輪）。
- 下一步：①同步 5329c48 至 PR16；②評估 staging 批次部署（runtime 變更累積 0a64219/8f98a21/5329c48）；③新缺陷探索（候選：memo/leave 之外 direct-write 家族 review——runDrawerWrite 的審核/釘選未知結果同類 UX）。

## 2026-10-15 15-min tracking R3 checkpoint：缺陷#25 memo 未知結果關窗重開重複列（RED→最小修→GREEN）

- 起點 ad92da1 clean 無 modifier。
- **缺陷重現（真 SQL＋實際 handler，先 RED）**：SDK 第一發**真提交 schedule_memos 後丟網路錯**（結果未知）→handler catch 顯示錯誤→使用者關窗→重開全新 memo 表單輸入同內容再存（成功 204）→**資料庫同一內容兩列（2!==1 RED）**。首版測試誤用不存在機台 'synthetic-machine' 踩 FK（machine_id references machines）致 0!==1 假 RED——已改用種子機台 'a' 並以 stash 對照取得真 RED（2!==1）。
- **最小修正（8f98a21）**：UI.memoUnknown session 清單（鍵=memoDraft JSON、值={id,sk:user@epoch}）。未知結果（catch）登記原 id；同 session **同內容**重試沿用原 id → upsert 落同一列不重複；成功 ACK 清除登記；跨 session（user/epoch 不同）不沿用。不改 UI 流程、不加輪詢、不阻擋使用者。
- **回歸**：聚焦 memo 14/14（新測 GREEN）；全套 web **803/803**＋build PASS；push 後 CI 實查 @8f98a21 Tests／smoke／Synthetic 全 success。未同步 PR16（下輪）、未部署 staging（runtime 變更累積中，依「程式碼未變化不重複部署」原則待批次）。
- **密文工作流排程策略評估（記錄，無程式變更）**：新鮮度 24h 由 encrypted-backup.mjs 強制；密文備份僅經 backup-drill create=true 產生（R2 已驗證鏈路）。策略＝**維持隨需 dispatch**（每次先 backup-drill create 再帶新 artifact_id dispatch 兩工作流，R2 流程可重現）；定期化（重新啟用 nightly）維持紅線——待 PR18 密文版安全進 main 並核對後才考慮，屬使用者既定條件。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 保持停用。PR16/18 draft 門檻不變。
- 下一步：①memo 重複防護同步 PR16；②評估 staging 批次部署（累積 0a64219+8f98a21 兩 runtime 變更）；③繼續新缺陷探索（候選：leave-request-save 同類 unknown 重複——同模式可快速實證）。

## 2026-10-15 15-min tracking R2 checkpoint：密文工作流端到端全通＋PR16 同步 memo 修正

- 起點 9d830f6 clean 無 modifier。R1 遺留 artifact 檢查：唯一密文備份 db-backup-encrypted-38352489633（2026-10-13T05:40Z）已超 24h 新鮮度（encrypted-backup.mjs maxAgeMs=24h 強制）——先以既有 backup-drill create 流程產新備份。
- **新鮮密文備份**：dispatch backup-drill（create=true）@9d830f6 → run **38517152733 success**，artifact **db-backup-encrypted-38517152733 / id=11871908366**（reusable call 不觸碰已停用 nightly 367614493；pg_dump 唯讀、上傳僅密文）。
- **catalog-inventory 端到端（未驗證→已通過）**：誤 dispatch 佔位 ID run 38517494777 於「下載有效加密備份」fail-closed（意外負面測試：非法輸入潔淨拒絕、不回退明文）；正確 dispatch artifact_id=11871908366 → run **38517538962 全步驟 success**（選擇/下載/layout/真 age 解密/24h 新鮮度/拋棄式 PG17 還原/唯讀盤點/白名單報告/清理）。下載實查報告 **11872531210（942B）＝純數值**（35 員工/50 資源/7 工單…），無姓名/代號/產品/日期/SQL。
- **permissions-drill 端到端（未驗證→已通過）**：dispatch artifact_id=11871908366 → run **38517756653 全步驟 success**，A-I 九段（角色預設矩陣/is_boss/管理介面/權限覆寫/RLS/…/worker 綁定回報）log 實查 **I 小計 PASS=17 FAIL=0、TOTAL_FAIL=0「隔離驗證全數通過」**；無 artifact 上傳、私有輸出 withheld、不印身份。
- **PR16 安全同步**：worktree 核對 clean/無 modifier/local=tracking=remote=534e574 後普通 merge origin/codex/continuous-release-gate-20261013 → **22a6cda**（5 檔 141 insert，含 memo fix 0a64219）；全套 **803/803**＋build PASS、push 534e574..22a6cda，CI 實查 Tests／smoke／Synthetic 全 success @22a6cda。未合併正式、不冒稱發布。
- 正式 1023／0037／Auth／角色未動；無新明文 artifact；nightly 保持停用。發布門檻不變（PR16/18 draft、真 staging 兩端驗收未過）。
- 下一步：①memo 未知/遺失結果跨關窗重開之重複儲存（handoff 候選，先隔離實證）；②評估兩密文工作流的後續排程策略（是否需要定期 freshness——備份只在此類 dispatch 時產生）；③繼續新缺陷探索。

## 2026-10-15 15-min tracking R1 checkpoint：memo 交接修正完成驗證＋密文工作流唯讀覆核

- 起點 HEAD a83b0d4（ahead 3：merge＋main 兩 docs），未提交＝HANDOFF_20MIN 指定的 memo late-ACK 交接修正（app.js 7 行＋memo-save-request.test.mjs 56 行）＋12:48 checkpoint 6 行＋未追蹤交接文件。重疊核對：app.js mtime 停 10-14 08:13、doc 12:50，無其他 modifier/deploy；20 分鐘 heartbeat 屬另一 chat（handoff 記錄），本 15 分鐘追蹤為使用者最新 /goal，重疊時仍只做唯讀核對。
- **交接修正完成**：聚焦 memo 13/13；全套 web **802/802 exit0**＋build PASS——交接未確認的全套結果現已確認。commit **0a64219**（fix: reconcile late successful memo save with safe reread）＋**3eb15ce**（docs: 20min handoff checkpoint），普通 push a596364..3eb15ce。CI 實查 @3eb15ce：**Tests／Deployment smoke／Synthetic 全 success**。
- **catalog-inventory／permissions-drill 密文相容唯讀覆核（未 dispatch）**：兩工作流已是密文專用——BACKUP_ENCRYPTED_ONLY=true 不回退明文、unzip 後 layout 驗證 database.tar.age、真 age 解密（BACKUP_AGE_IDENTITY secret）、umask 077、私有輸出只寫 RUNNER_TEMP 不進 log（diagnostics withheld）、artifact 只上傳數值白名單 inventory.md、always 清理明文與私鑰。本機工具測試 **16/22**，6 失敗全數歸因本機缺 age 執行檔（與歷史 checkpoint 記錄相同 6 項，which age 無此命令；CI runner apt-get 裝 age 先前 57/57）。**未驗證**：兩工作流真 dispatch 端到端（需新鮮加密備份 artifact）；下一輪先查 db-backup-encrypted-* artifact 存在與新鮮度再決定。
- 正式 1023／0037／Auth／角色／資料未動；無 cloud 寫入、無寄信、無新明文 artifact、無新資源。PR16 未同步 memo 修正（其 worktree 仍在 534e574），PR16/18 仍 draft、發布門檻不變；nightly 367614493 保持停用。
- 下一步：①查加密備份 artifact 新鮮度→決定 catalog/permissions dispatch；②memo 修正同步 PR16（先核 clean/無 modifier/remote 一致）；③候選：memo 未知/遺失結果跨關窗重開之重複儲存（handoff 指定，尚未實證）。

## 2026-10-14 12:48 checkpoint 使用者停止舊追蹤並交接二十分鐘排程

- 使用者明確要求停止原 cron、交给另一 agent 建立每 20 分鐘直到用戶停止的持續接續 prompt。舊 Codex heartbeat `automation` 已透過 automation_update 設 PAUSED，讀回 TOML 確認；本條取代歷史 checkpoint 的追蹤 ACTIVE 敘述，不影響仍 disabled_manually 的 GitHub nightly367614493。
- 未提交 memo late ACK 最小修正保留在 app.js/memo-save-request.test.mjs；HEAD a83b0d4，54/54 聚焦與 build PASS，全套測試 session 無法取回最終結果、仍未確認，尚未 commit/push/CI/同步PR16或deploy，不冒稱已發布。
- 交接詳見 `docs/HANDOFF_20MIN_2026-10-14.md`；另一 agent 只處理新追蹤設定，不同時修改程式或部署。正式1023/0037/Auth/角色/資料未動，發布門檻不放寬。新追蹤 `20`「產線排程20分鐘持續接續」已建立為 heartbeat/ACTIVE/每20分鐘返回原chat；主agent完整讀回prompt、target及interval20驗證，舊automation仍PAUSED。只有使用者要求停止才停，無重複ACTIVE排程。

## 2026-10-14 08:05 checkpoint：請假／備忘釘選成功晚回覆安全補讀

- **08:10收尾（取代下文stage待確認）**：stage Tests **38488348435**與smoke **38488348454**現全success。Render app error於00:10:23Z後核實 **00:08:05–00:10:07Z**窗 **0/hasMorefalse**，只輸出彙總，非長期健康/Realtime恢复。PR16/18實查OPEN/draft/MERGEABLE，不因全綠放行正式；6QA tabs/dev保留，doc-only不更新stage/solver，持久worktree供下輪繼續。

- 起點 **92f2a1d21196111234c025e9a663252b746800d0** clean，指定交接/缺陷總表/NEXT_TASKS/測試模式與最新checkpoint已讀；process僅既有esbuild/本輪shell，沒有第二modifier/deploy。fetch main **317c375**只有他人2檔15新增/2刪除紀錄，普通merge **ff7065d**保留，不切換共享checkout、不丟棄提交。正式1023/setup_pending/Auth/角色/授權/schema與資料未動、不再0037。
- 探索→有效RED：3項actual handler＋actual background timer生命周期 **2 RED/1 PASS**；請假新增/審核/釘選成功晚回覆後S仍舊、pendingReload=false。另3條真PGlite migrated SQL＋actual SDK/204＋handler/600ms timer，各實際提交後hold回覆→新draft，皆在pendingReload=false有效RED；**6項新增分次有效重現合計5 RED/1 PASS**。不是源碼字串/HTTP200驗收，不是真雲端慢網路/兩actor資料寫入。
- **fixture問題分開記**：最初3 SQL setup缺created_by而23502，補合成actor後leave case又因同人同日既有pending踩唯一索引23505，且ready只等commit造成1測等待/2測連帶取消（共3 cancelled）。加Promise.race捕捉handler已返回、並只在resolve/pin種既有leave後才取得上述有效RED。這些不是產品5個新缺陷或真平台等待；沒有改migration/唯一索引/權限以迴避測試。
- **37fd415ec2466ed25481ebb86a4286e7f69b596f**只改`runDrawerWrite`與`leave-request-save`已完成成功但owner失效時：sameSession則pendingReload，finally既有maybeReload/600ms有界安全補讀。新草稿/preview/拖曳/在途/失敗写入仍前後guard延後，不重開舊視窗、不toast新draft、不向新actor讀取、不重送或另建request，不恢復失去owner的LINE副作用。Store/RPC/migration、未知失敗分類與memo-save另一路徑未改，不稱所有直接寫入風險已修。
- 聚焦 **50/50**、完整本機web dot exit0、build **index-78YwSAKS.js**通過，CI實測 **798/798 web、57/57工具**；來源Tests **38488020425/38488024508**、smoke **38488020571/38488024566**、synthetic **38488024543**全success。真SQL每條證明draft/原S不變，關閉後read1次，操作只dispatch1次、planned blocks逐項不變。create為pending且新ID只有1列；approve為approved且employee/date的leave1列；pin為true。沒有拿請假詢問成功當已准假。既有chunk>500k warning保留，不重跑age缺依賴6項/skip/stub/備份或新還原。
- Impeccable harden/craft-floor讀完、context同session不重跑，保留抽屜/版面/44px操作區與文案；detector一次無輸出，非全a11y或真手機Safari驗收。HTML/CSS/字典零變化，不重做已修手機抽屜。Computer Use skill已讀，既有IAB真qa-lead普通root **10/14／1廠22段/dialog0**只讀基準與6QA tabs/dev保留，沒有cloud審核/新增請假/釘選/報工/確認/套用。
- PR16 clean/無modifier（只有既有node19520/esbuild36560/本輪shell），local/tracking/ls-remote **b9ee82c**一致後普通merge **534e574b098b14caecd2dbd19191eb848332caaf**，原5檔105insert/3delete保留；50/50聚焦與build **index-2tQQ0ptl.js**成功後non-force push。PR16 Tests **38488138555/38488142101**、smoke **38488138549/38488142143**、synthetic **38488142097**現全success，沒有合main或正式deploy。
- Render deploy/monitor/post-deploy已讀；list_services核實既有 **srv-daubq860tbcc73eq5s6g / codex/excel-friendly-ui-20260930 / autoDeploy=yes / rootDir=web**。source5runs全success且remote精確909d1c0＋ancestor後non-force更新stage **37fd415**；auto new_commit **dep-db7cfj7avr4c73f4sl7g**於 **00:08:04.105546Z live37fd415**，普通rootHTTP200/**CF HIT/index-ocxx-Pc7.js**；真qa-lead普通reload同bundle，等雲端heading後 **10/14／1廠22段DOM id/label/text/style一致、dialog0/browser error0**。只讀load相容不是已實際觸發平台晚ACK/兩actor同步；沒有任何cloud寫入。Stage smoke **38488348454**success、Tests **38488348435**與2分鐘app error窗待收尾。solver/tools/workflow零diff，不主動重deploy solver/清cache/改env/建立資源。
- 不重匯12/8/20/103，不改正式資料/0037/帳號/密碼/寄信，不新增真明文dump/SQL/請求/身份artifact/log或費用。PR16/18仍draft，真不同actor角色/套用/手機桌面sync/斷線衝突/VITE_TEST門檻未全過，nightly367614493保持停用，本追蹤ACTIVE。下一候選：**memo-save自有sameContext路徑**成功晚ACK是否同類不補讀，尚未實證/修；以及直接寫入unknown結果的核對流程，不把本輪成功分支修正稱全面恢復。

## 2026-10-14 07:53 checkpoint：成功報工晚到後安全補讀

- **07:58收尾（取代下文stage待確認）**：stage Tests **38487179649**與smoke **38487179646**全success；Render app error於23:58:16Z後查實際 **23:56:06–23:58:08Z**窗 **0/hasMorefalse**，只输出彙總、不是真長期健康/Realtime恢復。PR16與PR18實查OPEN/draft/MERGEABLE，不因全綠或可merge而放行正式。6QA tabs/dev保留，doc-only不更新stage/solver，持久worktree供下一輪繼續。

- 起點 **46c47bbe540490abc5b0861d0318b4806d9c5d0f** clean；指定交接/缺陷總表/NEXT_TASKS/測試模式與最新checkpoint已讀。process僅既有esbuild/本輪shell，無第二modifier/deploy。fetch main新 **7d74ce8**只有他人12行紀錄，普通merge **52884b4**保留，不切換共享checkout、不覆蓋他人改動。上一輪CI/live/22段已過，不重做備份/0037/手機抽屜。
- 探索→RED：actual `reportWork`＋actual remote reload/timer的3新測 **2 RED/1 PASS**；report valid ACK在原視窗已關或新draft/preview/date/state後到達，S舊revision而pendingReload仍false。另真PGlite migrated SQL＋actual SDK＋handler/timer新測RED：SQL已提交start/revision1/version1，hold成功ACK→新draft→釋放ACK，草稿不變但不排補讀。**共4新測修前3 RED/1 PASS**，不是源碼字串/HTTP200檢查；合成傳輸延遲不是真平台慢網路或跨actor雲端寫入證據。
- **909d1c0a6c77df264483220aa522cac14ef6438d**僅app報工valid receipt清retry後，owner失效而sameSession仍成立時設pendingReload；finally既有maybeReload/600ms timer用草稿/preview/拖曳/在途/失敗寫入與前後state基準guard安全補讀。沒有重送report、新requestID、輪詢、改server RPC/migration/Store分類或新的UI文案。新actor/store/client/epoch不排舊actor補讀，舊toast/modal/新undo不被覆蓋；unknown/known rejection的原重試ID保留/清理規則保持。
- 修後 **70/70**聚焦回歸、完整本機web dot exit0、build **index-s1dDG2OA.js**通過；CI真實 **792/792 web、57/57工具**，來源Tests **38486819368/38486823470**、smoke **38486819328/38486823364**、synthetic **38486823339**全success。真SQL證實新draft/舊S保留，關閉draft後read1次才更新running/revision1/version1與accepted Store baseline，report RPC1次/events1筆，480–540/60件不變，undo仍new-draft且無舊toast。既有chunk>500k warning保留，不重跑age缺依賴6項/skip/stub，不新增備份或把fixture當真完整還原。
- Impeccable harden/craft-floor/context沿用既有操作世界；本sessioncontext不重跑，detector一次無輸出，不稱全a11y驗證。只有既有handler邊界變化，HTML/CSS/字典不變，不再重複手机44px/已修抽屜。Computer Use skill已讀，只用既有IAB供只讀部署核對；真qa-lead普通root **10/14/1廠22段/dialog0**基準保留，6QA tabs/dev留下。
- PR16 clean/無modifier，local/tracking/ls-remote **aa32bde**一致（process只有既有node19520/esbuild36560/本輪shell）後普通merge **b9ee82c3d8c878aefe98b861e901267dd14b3276**，原5檔105insert/3delete保留；70/70聚焦/build **index-D0S_d2Pa.js**後non-force push。PR16 Tests **38486959504/38486963805**、smoke **38486959450/38486963810**、synthetic **38486963794**現全success。
- Render deploy/monitor/post-deploy指引已讀，list_services核實既有 **srv-daubq860tbcc73eq5s6g / codex/excel-friendly-ui-20260930 / autoDeploy=yes / rootDir=web**。來源5runs全成功，remote精確b7e36cf＋ancestor後non-force stage推 **909d1c0**；auto new_commit **dep-db7ca06gekts73docv8g**於 **23:56:05.390717Z live909d1c0**；普通rootHTTP200/**CF MISS/index-raVtIbq-.js**，真qa-lead普通reload同bundle，等雲端heading完成後 **10/14／1廠22段DOM id/label/text/style一致、dialog0/browser error0**。只讀load相容，不是慢網路晚ACK在真平台已觸發/真正跨actorsync；未按開工/件數/完工/確認/套用。Stage smoke **38487179646**success、Tests **38487179649**與2分鐘app error窗待收尾。solver/tools/workflow零差異，不主動重deploy solver/env/cache/新建付費資源。
- 正式1023/setup_pending/Auth/角色/授權/schema/資料未動，不重套0037；沒有cloud報工/確認/套用/seed重匯、帳號/密碼/寄信、新明文真資料公開artifact/log或費用。PR16/18仍draft，真不同actor權限/真套用/手機桌面sync/斷線衝突/正式VITE_TEST門檻未全過，不合main/正式deploy；nightly367614493保持停用，本追蹤ACTIVE。
- 下一候選已只讀收斂：`runDrawerWrite`（請假審核/備忘釘選）及`leave-request-save`成功回覆owner失效時同樣直接return，是否造成儲存/顯示分歧尚未實際重現；下一輪先actual handler/隔離SQL測試，不以相似源碼冒稱已確認缺陷、不cloud請假/審核/備忘寫入。另同block重開表單遇valid晚ACK與跨reload/newlogin核對/確認server去重仍不能冒稱已全面解決。

## 2026-10-14 07:45 checkpoint：成功確認晚到後安全補讀

- **07:48收尾（取代下文PR16/stage待確認）**：PR16 Tests **38486032292/38486038365**、smoke **38486032370/38486038380**、synthetic **38486038371**現全success；stage Tests **38486128946**與smoke **38486128948**全success。Render app error於23:47:56Z後查實際 **23:45:38–23:47:40Z**窗 **0/hasMorefalse**，只输出彙總、不是真長期健康/平台Realtime恢復。PR16實查OPEN/draft/MERGEABLE；PR18 OPEN/draft、mergeable暫UNKNOWN，**不是衝突證據**，不為此force push/rebase。doc-only收尾不更新stage/solver、不部署無runtime變化的服務，持久環境保留繼續。

- 起點 **0fa610f9220d656dee26768ff5a383867193644c** clean；指定交接/缺陷總表/NEXT_TASKS/測試模式與最新checkpoint已讀，process只見既有esbuild/本輪shell，沒有第二modifier/deploy。上輪PR16最後待確認Tests **38485108762**現success，上一輪全CI可校正為全綠，不重做已過驗收。fetch main新增 **1d022f5/3f10800**只有他人22行紀錄，以普通merge **e242340**保留，未切換共享checkout或丟棄提交。
- **實際重現**：編譯actual `changeExecutionConfirmation`＋actual remote-reload/timer，關閉/新草稿/preview後valid ACK晚到，畫面仍舊confirmed=false且pendingReload=false，不排補讀。3項新生命周期測試修前 **2 RED/1 PASS**（old actor不補讀既有通過）。另新真PGlite migrated SQL＋actual SDK＋actual handler/600ms timer，先SQL提交true/version3後hold HTTP ACK，開新draft再回成功，亦RED。合成SDK傳輸不是平台真慢網路證據；沒有cloud寫入。
- **b7e36cf42af1be68d4e1fb51dacc53950384117d**：只修改app owner以獨立sameSession識別Store/client/user/authEpoch；確認有效ACK已完成但原view/modal/state/permission/preview變更時，同session設pendingReload，finally既有maybeReload以600ms有界補讀。新modal/草稿/preview/拖曳/在途或失敗儲存仍由既有前後兩層guard延後，不開舊視窗、不toast進新草稿、不重送RPC、不向新actor排補讀；沒有新輪詢、Store ledger/RPC/migration不變。真SQL修後draft/原S不變，草稿關閉後只read1次，confirmed=true/version3與accepted Store baseline同時更新，確認RPC1次/確認change_set1筆，480–540/60件不變。
- 新增4項測试、聚焦 **51/51**全PASS；修後第一次聚焦 **49 PASS/2 FAIL**是unit fixture缺少schema既有log欄位，補`log=[]`後全綠，非產品新缺陷。完整本機web dot exit0、build **index-C4ErUHC2.js**通過，CI實測 **788/788 web、57/57工具**；來源Tests **38485824455/38485830700**、smoke **38485824510/38485830688**、synthetic **38485830720**現全success。既有chunk>500k warning保留，未重跑本機age缺依賴6項/skip/stub或新備份/還原。Impeccable harden/craft-floor讀完，context同session不重跑，保留既有版面/文案/按鈕，detector單次無輸出（不冒稱全a11y）；沒有HTML/CSS/字典變化，不重複手機44px/既有抽屜验收。
- PR16 clean/無modifier（僅既有node19520/esbuild36560），local/tracking/ls-remote **6626782**一致後普通merge **aa32bde7edef06b1f692754554e936d915d27b53**；原5檔105insert/3delete保留，51/51聚焦/build **index-DgTfsLEF.js**通過後non-force push。PR16 Tests **38486032292/38486038365**待核對，smoke **38486032370/38486038380**、synthetic **38486038371**已success，不稱PR16已全部綠。
- Render deploy/monitor與post-deploy指引已讀，只針對既有服務；list_services核實 **srv-daubq860tbcc73eq5s6g / codex/excel-friendly-ui-20260930 / autoDeploy=yes / rootDir=web**。來源5runs全成功、remote仍71f1818及ancestor檢核後non-force更新stage **b7e36cf**；auto new_commit **dep-db7c51favr4c73f4hqk0**於 **23:45:37.885998Z live b7e36cf**，普通rootHTTP200/**CF MISS/index-CuJLhw6u.js**。真qa-lead普通reload同bundle，等heading雲端載入後 **10/14／1廠22段DOM id/label/text/style一致/dialog0/browser error0**；實際更多→現場回報表→底部Close→更多Close成功，22段不變。沒有按雲端確認/開工/件數/完工/套用，這是只讀相容，不是成功晚ACK在真平台已觸發或真正跨actor同步。solver/tools/workflow零diff，不主動部署solver/env/cache/新资源；stage smoke **38486128948**已success、Tests **38486128946**及部署後2分鐘app error窗待收尾。
- 本輪正式1023/setup_pending/Auth/角色/授權/正式schema及資料未動，沒有任何cloud確認/報工/套用/seed重匯、額外migration、帳號/密碼/寄信或新明文真資料artifact/log/費用。PR16/18維持draft，真不同actor角色/套用/兩端同步/斷線衝突/正式VITE_TEST門檻未全過，不合main/正式deploy，不啟nightly367614493；本追蹤ACTIVE與6QA tabs/dev保留。
- 下一候選已**只讀收斂**：`reportWork`成功時清executionRetries後owner失效亦不設pendingReload，可能有同類舊revision/新request風險；尚未補真SQL晚ACK/重開回歸、不稱已復現或已修。下一輪先actual SQL/SDK/handler最小實證，仍不cloud報工/確認。跨reload/new login與確認server去重亦未修，本輪成功補讀不替代這些門檻。

## 2026-10-14 07:36 checkpoint：同頁完工確認未知結果阻擋重送

- **07:37收尾（取代下文CI/log待確認部分）**：stage Tests **38485107632**與smoke **38485107636**全success；PR16 push Tests **38485102826**success，PR Tests **38485108762**仍in_progress，其餘smoke/synthetic全success，下一輪只核對這項最新結果。Render app error實際 **23:35:09–23:37:10Z**窗0/hasMorefalse；早先查詢的endTime曾在未來，不採作完整兩分鐘證據，此收尾於23:37:18Z後重新查詢完成。一次附錯job ID的CLI log查詢exit1/無輸出，不是測試失敗；通過數依來源正式run成功log，不用失敗查詢冒稱stage test數。6 QA tabs重新handoff，既有dev/資料保留，doc-only不觸發runtime部署。

- 起點 **46d23121884ccd7626df33b269110963024de089** clean；已讀指定交接/缺陷總表/NEXT_TASKS/測試模式與最新checkpoint，fetch main無新增，process只有既有dev/esbuild與本輪shell、無第二modifier/deploy。正式1023/setup_pending/Auth/角色/授權/schema及全部正式資料未動，不再0037、不改cloud確認/報工/套用/seed、不猜密碼/寄信、不增費用或新明文真資料artifact/log。
- 探索→RED：新增actual Supabase SDK/compiled renderer/beforeunload共7測，修前7 RED，其中同block未知結果重送、SDK在途重送直接重現；其餘部分因新API尚不存在而失敗，**不是7個獨立產品缺陷**。既有真PGlite migrated SQL＋actual SDK＋compiled confirmation handler回歸擴充：SQL confirmed=true/version3已提交但合成HTTP503遮蔽，關窗重開、接受fresh snapshot後再按同值/反向操作，修後只有原來1次SDK送出/version仍3。另一客戶端直接RPC仍使version3→4，server idempotency風險未修，不能把這個測試稱真平台503/跨端同步證據。
- **71f18181dd30042c0483549847f5ee563b82c9a9**只新增Store頁面session confirmation ledger，依Store/client/user/authEpoch/block（UUID大小寫正規化）隔離；dispatch前登記，在途/unknown/missing或錯誤ACK均阻擋同block同值及反向重送，其他block仍可操作。有效ACK/已知SQL拒絕才清原attempt，late舊actor不能抹新actor的record；fresh load不自行清除，沒有自動重讀或重送。actual execution workbench遇pending隱藏確認/解除確認控制，顯示既有四語待核對訊息；beforeunload即使modal已關亦提醒。**僅同頁session**，不持久化、不跨強制reload/新Store/新登入，不是server去重、不是完整重試已修。
- 聚焦 **32/32**通過；首次full web FAIL exit1只因新提示缺i18n key，修成沿用既有zh-TW/en/vi/th訊息後，翻譯＋新guard **19/19**、完整本機dot exit0/build **index-DVia22dt.js**通過。來源CI實測 **web784/784、tools57/57**，Tests **38484736417/38484742528**、smoke **38484736419/38484742553**、synthetic **38484742530**全success；不是以字串/HTTP200替代功能測試。既有chunk>500k warning保留，本機缺age的相同6失敗不重跑/skip/stub，不把crypto fixture當真庫新鮮完整restore。
- Impeccable harden/craft-floor限定既有版面與錯誤清楚化，context本session已跑不重做，detector一次`[]`非全a11y。LocalStore原確認入口相容：5203 reload17段，A01完成12件待確認仍可見正常確認；桌面48px、390×844 44px中心命中，**未按確認**。`outputs/local-confirm-guard-compatible-mobile-20261014.png`已目視，只證正常入口相容，不是pending手機/真Safari/雲端衝突驗收。Escape關modal、viewport clear、更多關閉，17段DOM id/label/text/style一致，環境保留。
- PR16 clean、無modifier且local/tracking/ls-remote **421b69b**一致後普通merge **66267825804866d6df46dd96afffe17db66dc8ee**，原5檔105insert/3delete完整保留；32/32聚焦/build **index-CDygW0go.js**成功後non-force push。PR16 smoke **38485102737/38485108681**與synthetic **38485108710**success；Tests **38485102826/38485108762**此checkpoint仍in_progress，待收尾核對，不提前稱全綠。
- Render deploy/monitor只更新既有web；來源5runs成功且remote仍3194cb8/ancestor後non-force stage推71f1818，沒有solver檔案差異、不主動重部署solver/新建資源/改env/clear cache。auto new_commit **dep-db7c06ks728c73d0a1ig**於 **23:35:09.123017Z live71f1818**；普通rootHTTP200/**CF HIT/index-CPwMAll6.js**。真qa-lead普通reload同bundle、等待雲端heading後 **10/14／1廠／22段DOM id/label/text/style逐項不變、dialog0/browser error0**，沒有按任何cloud確認/報工/套用。這是部署與只讀相容驗收，不稱未知guard已在真平台被觸發。
- Stage smoke **38485107636**success、Tests **38485107632**仍in_progress；Render部署後2–3分鐘app error窗尚待收尾，不冒稱長期健康或Realtime恢復。PR16/18實查OPEN/draft/MERGEABLE，正式不同actor權限/真套用/兩端同步/斷線衝突/VITE_TEST門檻仍未全過，不合main/正式deploy；nightly367614493不重啟，10分鐘追蹤ACTIVE。
- **下一候選**：valid late ACK在dialog/view owner已變時，SDK可清ledger而app不補讀，舊view再開是否重現冗餘確認；尚未重現/修，下一輪先用合成SQL/SDK/actual handler實證，不寫cloud確認。另跨reload/new login與server request ID安全核對仍未解，不能因本輪全綠停止探索。

## 2026-10-14 07:19 checkpoint：完工確認未知結果不再冒稱沒存到

- 起點 **e616d1ed2929392b0cc7ebd9d62bc1753ed6f7d8** clean；已讀最新本檔/HANDOFF/缺陷總表/NEXT_TASKS/測試模式交接，process僅既有dev/esbuild與本輪shell，無第二modifier/deploy。fetch main新 **736834d**僅11行他人紀錄，普通merge **9ce8f46**保留。正式1023/setup_pending/Auth/角色/個人權限/schema/全部正式資料未動，不再0037、不改任何cloud確認/排程/seed、不猜密碼/寄信/新增費用/明文真資料artifact/log。
- 探索→RED：確認SDK遇到HTTP503目前丟一般Error，actual `changeExecutionConfirmation`說 **「沒存到：Synthetic unavailable」**。新建記憶體PGlite真migrations/合成Auth與班表，真start/finish後（version2），actual SDK bridge先真執行`confirm_work_execution`提交confirmed=true/version3，才回合成503；UI還是confirmed=false且錯誤宣稱沒存到。新增2測修前皆RED，非源碼字串/HTTP200驗收，也不是真平台503證據。
- **3194cb858d110d61da88e6a8c1bf18102910fc8b**：只改SupabaseStore確認結果分類。42501/P0001/P0002配正常4xx（synthetic direct-SQL無status亦收）保留known rejected；PGRST202僅canonical404保留缺RPC/0035提示；未知/5xx即使带这些码，也改UnconfirmedWriteError **「完工確認結果待核對，請更新班表查看；不要重複送出。」**。有效receipt既有block/flag/version檢核不變；沒有自動補讀/重送/改UI facts/更動owner guards。existing handler會显示待核對而非沒存到，不覆蓋其他draft/預覽，權限/缺migration明確拒絕保持。
- 真SQL/SDK/compiled handler＋10種code/status契約回歸修後PASS；UI RPC只dispatch1次、原state仍false，真snapshot為true/version3、report events2，480–540/60件不變。**獨立實證未修風險**：在這個合成DB對同flag明確重送確認RPC，version3→4、確認change_sets1→2；原0035 RPC沒有idempotency/request ID，本輪沒改它。訊息修正**不是**去重/安全重試已修，不能因此放行正式。下一輪先補unknown confirmation的session owner/同block重送阻擋RED，評估最小client保護；不能僅憑一次freshread反向證明舊在途transaction未提交，不額外套正式migration。
- 聚焦 **25/25**（actual confirmation owner/late reply/double tap/現有LocalStore保持等亦過）；完整本機web dot exit0、build **index-BjsEBCaj.js**成功，CI實測數量 **web777/777、tools57/57**。新增2測其中一個含真SQL。Impeccable harden/craft-floor/context本session已讀，launcher不重跑；保留既有中文/版面/既有pending訊息，detector一次`[]`，不稱全a11y驗證或設計重做。本機缺age不重跑相同6失敗、不skip/stub，不把crypto fixture綠當新真專案完整restore。5203只reload新dev，既有17段/dialog0/完成12件待確認與情境保留，沒有按本機或雲端確認；6tabs重新handoff。
- 來源Tests **38482923159/38482927048**、smoke **38482923278/38482927010**、synthetic **38482927000**全success。PR16 clean、無modifier，local/tracking/ls-remote **f22a69b**一致後普通merge **421b69bad6cc427177b3bfafaa64bd3a5fd86714**，原5檔105insert/3delete保留，聚焦25/25/build **index-DfXA125N.js**通過後non-force push；PR16 Tests **38483126152/38483131154**、smoke **38483126104/38483131290**、synthetic **38483131157**現全success。
- 依Render deploy/monitor指引只核對/更新既有web：remote仍5e6a512＋ancestor＋來源5runs全成功後，non-force stage推 **3194cb8**。solver檔案零差異，不主動部署solver/改env/清cache/新建資源。auto new_commit **dep-db7bo0e0tbcc73bmr300**於 **23:17:44.756613Z live3194cb8**。普通rootHTTP200/**CF MISS/index-B7_NqMkY.js**；真qa-lead普通reload同bundle，等雲端heading載入後**10/14／1廠／22段DOM id/label/text/style一致**，不是把初始化短暫blocks0當丟資料，也不拿HTTP200冒充load。這輪沒有按雲端完工確認/報工/套用，不稱新unknown error在真平台已復現。
- staging此SHA只有第三套Tests **38483324396**與smoke **38483324394**，现已全success，不是多出synthetic第三套（與前stage工具workflow無diff）。真新頁browser error0、22段/dialog0；Render app error **23:17:44–23:20:33Z**查詢0／hasMorefalse（約2m49s窗，只輸出彙總，不是真長期健康/平台Realtime恢復或unknown503已重現）。兩PR仍draft，不合main/正式deploy，nightly367614493仍disabled_manually，本追蹤ACTIVE；真第二actor／套用／兩端sync／正式VITE_TEST與新確認去重風險都不能冒稱通過。

## 2026-10-14 07:07 checkpoint：PT409 客戶端相容修正與 staging 覆核

- 起點 **7fd7b378ef33e25ccbb9a36c84bd69366a2a0ff3** clean，指定交接/缺陷總表/NEXT_TASKS/測試模式文件及最新checkpoint已讀；process只有既有dev/esbuild/本輪shell，無本目錄另一modifier/deploy。fetch main新 **a99fa9d**僅11行他人E2E紀錄，普通merge **6587156**完整保留，沒有覆蓋其他agent提交。上輪PR16 **c0a026d**的Tests38480638686/38480644296、smoke38480644294、synthetic38480638658/38480644287均已success，修正舊checkpoint的待確認歷史。
- **先RED再修**：actual SDK PT409/409契約及真PGlite migrated SQL＋actual SDK＋compiled app handler共新增2測，修前均失敗（409仍unconfirmed、UI reloads0）；既有9測與新增503/PT409真commit重試測均PASS。真SQL只在新建記憶體合成DB內把報工revision guard改PT409，不修改migration檔或任何雲端RPC；先真提交revision1，再用舊view revision0回報，實際SQL錯誤碼PT409、沒有新event/version。HTTP409 bridge遵循[官方PTxyz對應HTTP碼](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes)，此層不是部署平台的HTTP實證；上一輪官方binary真HTTP對照已單獨通過，不重做手動平台探測。
- **5e6a512aefd463598981ae9fd7fb12ec63017009**最小新增3行：僅`error.code==='PT409' && status===409`進既有ConflictError流程（固定中文進度已被更新／請重新載入），legacy40001分類不變。PT409的400/500/502/503/504、大小寫與前綴偽碼仍unknown，保留原ID，不擴大5xx拒絕推論、不自動重送。known rollback在actual handler清除stale pending/ledger、補讀revision1/qty0、保留原undo與480–540/60件；503/PT409隱藏真commit後，關窗重開原IDexplicit replay，仍僅1 event/revision1/version1。新增3項web回歸（含一項多status邊界）；**不代表真平台曾回PT409，更不是server40001loop已修**。
- 聚焦 **36/36**、完整本機 **775/775 web**、build **index-COCk7GGl.js**通過；chunk>500k既有warning保留。本機full test最初用npm附dot參數在檔名後仍印TAP，實際完整exit0/775，不以輸出樣式替代驗收。Impeccable harden/context/craft-floor指引限定錯誤狀態、保存原操作/版面，不因缺PRODUCT/DESIGN重設設計或擴大範圍；mechanical detector一次`[]`，不是執行期或a11y全驗證。可另行init設計脈絡，本輪不創新面/不擴張操作負擔。
- 本機5203保留舊17段／A01完成12件待確認／情境，reload新dev後只讀開閉完成回報表單；桌面與390×844 footer Close46px中心命中且實際直接Close成功，17段id/label/text/style一致，沒有按寫入/確認/排程修改；viewport已clear、更多drawer已關。**outputs/local-pt409-compatible-mobile-20261014.png**已目視但viewport clip裁到部分底列，不用圖片冒稱關閉/衝突驗收或真機Safari，衝突核心依SQL/SDK/handler證據。6 QA tabs重新handoff，5202/5203 dev及既有本機資料保留。
- 來源Tests **38481410638/38481414718**、smoke **38481410707/38481414871**、synthetic **38481414845**均success，真CI **tools57/57、web775/775、build**通過；不重跑本機缺age的相同6失敗、不stub/skip、不新增真庫備份或把crypto fixture當完整真專案restore。
- PR16 clean、無modifier且local/tracking/ls-remote **c0a026d**一致後普通merge成 **f22a69bdf5712ad72db2dea2ceb7e6cfcc041e50**，原5檔105insert/3delete完整保留；第一次在repo root執行web test報「找不到tests檔」是command cwd錯誤，改正web cwd後聚焦 **12/12**及build **index-s-09hkf2.js**通過，不算產品RED。PR16 Tests **38481851121/38481856322**、smoke **38481851090/38481856311**、synthetic **38481856331**全success。兩PR仍draft，GitHub mergeable暫回UNKNOWN，不把它冒稱CONFLICTING或發布完成。
- 確認來源全CI、staging remote仍0114f9f及ancestor後non-force推stage **5e6a512**；沒有solver檔案差異，不主動部署solver/新建資源/改env/clear cache。既有web **srv-daubq860tbcc73eq5s6g** auto new_commit **dep-db7bhih42hec7391d0ug**於 **23:04:02.205686Z live5e6a512**；普通rootHTTP200/**CF MISS/index-CruR8gBZ.js**。staging第三套Tests **38481857006**、smoke **38481857036**、synthetic **38481856919**均success。
- 真qa-lead普通reload已載同bundle：初始化期間短暫blocks0/無heading，下一次fresh AX雲端load完成後**10/14／1廠／22段**逐項基準一致；不把初始尚未load當資料遺失，也不把HTTP200當資料已載入。實際「更多→現場回報→測試R10」新表單開啟/Close、再關更多，22段DOM一致/dialog0/browser error0。**outputs/staging-pt409-readonly-compatible-20261014.png**已目視，只證明新頁只讀相容，不是假造真衝突/報工/同步；新builder沒有按開工/件數/完工/確認/套用。Render app error **23:04:02–23:06:25Z**0、hasMorefalse（約2m23s窗，非長期保証/Realtime恢復），只回傳彙總、不輸出raw logs或身份資料。
- 本輪正式1023/setup_pending/Auth/角色/個人權限/正式schema及全部正式資料未動，不再0037；未修改staging DB、未重匯12/8/20/103 seed、沒有新明文真資料artifact/log、沒有寄信/猜密碼/改帳號/新增費用。正式main合併/deploy仍未放行，nightly367614493保持disabled_manually，追蹤ACTIVE。**接續候選**：先最小實證完工確認unknown HTTP結果的重試/版本一致性（本機合成SQL/SDK/handler，不碰cloud確認）；真第二actor／套用／两端sync／正式VITE_TEST門檻仍未全驗，不能以本輪相容fix放行或稱平台retry已修。

## 2026-10-14 06:51 checkpoint：真 PostgREST 有界合成對照

- 起點 **6e0b4005e1512ac5c563bf9de5a05a1da05e52da** clean，已讀指定交接與本檔最新checkpoint、fetch main無新提交；process僅既有dev/esbuild與本輪shell，沒有另一modifier/deploy。本輪完全不連Supabase、不用Secrets、不改正式1023/setup_pending/Auth/角色/schema/RPC、不重套0037、不重匯測試資料、不報工/套用/存檔；沒有Render更新、stage branch push或nightly重啟，PR16/18仍draft。
- **cc4037827f3324d6713bb3bdc5e64d8d4ca438d3**新增專用`Synthetic PostgREST retry comparison`及runner工具。官方GitHub release實際存在14.18/16.4，取其linux static binary並驗官方asset SHA256（98de1c0… / b47ecc8…）、執行`--version`再比對；Postgres16真容器digest **sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d**。不是PGlite/mock fetch或root自報版號。
- 只用新建GitHub runner的`retry_probe`合成DB/`probe_anon`角色/兩個raise函式，HTTP固定127.0.0.1:55440/55441，不接受外部DB URL、key或繼承專案Secrets。非交易sequence在rollback後仍保留attempts，**每case只POST一次**；ping readiness不算case。40001函式25ms延遲，**第50次改raise PT503安全終止**，request1500ms、psql8秒、binary驗證5秒、runner6分鐘上限；每case finally只停止自己spawn的child，TERM後1秒KILL、3秒cleanup上限。GitHub cleanup成功移除其自有容器/network，沒有docker prune/全系統終止或任何真庫backend操作。
- 實際push **38480309043**及PR **38480313750**各4case成功、SHA256兩檔OK、Stop containers成功。兩套結果逐項一致：

  | 官方 binary | SQLSTATE | HTTP | 單一請求的SQL次數 |
  | --- | --- | --- | --- |
  | 14.18 | 40001 | 503（測試上限PT503） | 50 |
  | 16.4 | 40001 | 500 | 1 |
  | 14.18 | PT409 | 409 | 1 |
  | 16.4 | PT409 | 409 | 1 |

- 這是**合成DB的真HTTP交易重試實證**，不是已觀測無限執行（被50次上限截斷）、不是真平台回503，也不代表本專案雲端已裝14.18/16.4或已修平台問題。上一輪匿名401/管理頁無版本仍是未驗證，不重複探測/不升權讀取。依[Supabase官方風險說明](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b)及[PostgREST上游修正](https://github.com/PostgREST/postgrest/pull/4222)校對原因；文件中的改函式/terminate/restart建議不是新增正式授權，本輪**沒有修正式或staging RPC**。
- 新工具本機4/4真函式安全限制測試通過，普通本機呼叫在SQL/spawn之前fail closed；CI另實際跑上述binary/HTTP/sequence。全套Tests **38480308838/38480313688**與smoke **38480313825**現已全success；真CI **tools57/57、web772/772、build**通過，兩版synthetic比較另2runs成功。本機缺age情況未重跑/偷skip，這輪不新增備份/restore或明文真資料artifact，合成實驗無artifact，不把age fixture成功當新真專案完整還原。
- PR16工作區clean、branch正確，local/tracking/ls-remote/PR head均 **6208a2484ae862e9a37e22755f4a4ea4a830bc4f**；只有既有node19520/esbuilddev與本輪shell，無modifier。來源5runs全成功後普通merge成 **c0a026d6e3de71a679578c0eb82484eea6777953**，工具4/4通過、原5檔105insert/3delete逐項保留，non-force push；沒有runtime差異不重build/stagepush/deploy。PR16新Tests **38480638686/38480644296**、smoke **38480644294**及synthetic **38480638658/38480644287**仍in_progress，待下一輪查結果，不冒稱PR16已全綠。
- 下一候選已用**actual SDK＋合成Response**（不送任何網路、不接DB）最小探測：HTTP409/PT409目前`conflict:false/unconfirmed:true`；HTTP503/PT409亦unknown，後者應繼續保護已dispatch的ID。這是客戶端契約候選，不是真平台曾回PT409，也還不是真SQL/handler回歸。下一輪先補本機真SQL＋SDK fixture的RED，再評估最小相容修正；**本輪沒改產品或migration**。未查真平台版本之前不以此改正式schema或宣稱雲端已修。仍缺真第二actor、真正套用/兩端sync及正式VITE_TEST門檻，正式不強發；本追蹤持續ACTIVE，下一輪繼續具體安全工作。

## 2026-10-14 06:39 checkpoint：平台40001風險查證／安全探測器

- 起點 **6ac95e6** clean，已核對process僅既有dev/本輪shell、無本目錄另一modifier/deploy；讀CONTINUOUS/HANDOFF/缺陷總表/NEXT_TASKS/測試模式交接，fetch main無新增提交。正式1023/setup_pending/Auth/角色/個人授權未動，不再0037、不改其他schema/RPC、不terminate backend/restart/新增付費服務/匯入seed；沒有cloud報工/套用/保存，沒有新明文真資料artifact/log。
- **d4eb3883cdd67bc4bb2348ab7fcca217487acb8b**新增`tools/postgrest-version-probe.mjs`及7項真函式輸入/傳輸回歸：只GET已部署staging root/bundle與**固定fkefarcwadvyqqjcjxvp/rest/v1/**。legacy JWT只收anon＋正確ref；新publishable不當Bearer JWT，只在bundle唯一Supabase專案且唯一公開key時收；缺/歧義/正式專案/service_role/secret key不送metadata，不使用user/admin權杖或讀旧SQL。redirect:error與每次15秒timeout、失敗只輸出HTTP整數/固定分類/階段，不輸出key、raw source、schema、錯誤body、身份資料。成功也只輸出OpenAPI**自報version**，root-spec可被覆寫，`retryLoopVerified:false`，不是installed binary/重試loop證據。
- 實際路徑：初版只收legacykey，安全停在unique key unavailable、未碰metadata；補官方publishable規格後，匿名metadata GET實測 **HTTP401/UNCLASSIFIED**，CLI exit1表示**版本未驗證**（不是unit failure，也不能從401判定原因），沒有切換user/secret key、正式專案或寫入RPC。7/7新回歸通過，含精確failure allowlist及敏感message不輸出。平台version/40001loop仍未重現，不計為新產品缺陷或宣稱已修。避免重複這條已拒絕的匿名讀取，後續採獨立全合成PostgREST有界對照。
- 只讀管理頁：新tab28直接進隔離Infrastructure（避免SQL歷史/密碼）。初始化Accessibility stale後依Browser troubleshooting重新getTab28，登入session有效（不是登出缺登入）；Infrastructure沒PostgREST版號。循已見link Data API Overview，**Enable Data API=true**、API URL是fk專案、沒有version欄位，未按任何switch/Save/Scale/新增服務/升級，不能由CPU圖或技術事件橫幅推論40001loop。臨時tab28已close，原6 QA tabs重新handoff、5202/5203與既有本機17段/1情境等保留；沒有更動QA帳號/資料/瀏覽器尺寸/network。
- **本機工具總回歸曾FAIL**：當時52測 **46 PASS/6 FAIL**，6個真age案例均在fixture `age-keygen must be installed (no silent skip)`失敗；Get-Command與指定workspace/.codex executable搜尋都沒有age/age-keygen，沒有偷skip/stub/把它們說成全綠。新第7項探測回歸加入後沒有反覆重跑相同缺依賴組。本機Docker/psql/postgres指令也未找到，不擅自裝系統服務；不把PGlite直接SQL當PostgREST retry loop證據。
- 來源兩套Tests **38478379548/38478385327**及smoke **38478385309**全success；tools變更只有PR smoke（push filter不觸發，只有3 runs，不偽造第4套）。真CI已安裝age，**tools53/53、web772/772**，加密fixture真roundtrip/錯私鑰/篡改等亦過；**這不是新完整真專案備份/還原**，不更新0037備份門檻或啟nightly。本輪沒有改web/solver/runtime，不推stage、不重部署/重跑UI或已有CI。
- **06:41收尾**：PR16先clean/localremote **a2de966**一致，普通merge **6208a2484ae862e9a37e22755f4a4ea4a830bc4f**，delta只有工具2檔＋歷史doc，原5檔105insert/3delete差異保留、網站程式無變；同步後新工具7/7、來源完整CI過後push。PR16 Tests **38478948657/38478954200**及smoke **38478954201**亦全success，本輪工具-only都是3 runs，不虛構第4或stage第3套。兩PR仍draft；正式角色/真套用/跨actor及兩端autosync/離線409/VITE_TEST_*門檻未全過，不合main/正式、不启nightly。doc-only只推own，兩worktree乾淨；本輪沒有runtime deploy，上一輪live0114證據不重做、不把新工具說成已進網站。
- 官方依據：[Supabase 40001已知風險（14/16）](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b)、[PostgREST OpenAPI/root-spec](https://docs.postgrest.org/en/v14/references/api/openapi.html)、[Supabase key類型與header規格](https://supabase.com/docs/guides/getting-started/api-keys)。文件的terminate/restart建議不是新授權。下一輪先核對PR16本工具合併CI收尾，**不要重複401探測、age缺依賴或既有0037/seed/live UI**；可用既有Linux CI的獨立全合成Postgres/PostgREST14/修復版，固定版本與有界timeout/自有容器cleanup驗重試差異，須先核對官方可用版本，不連真庫、不用Secrets/私人資料；沒有證據前不寫正式RPC。10分鐘追蹤持續，本輪結束不等於停止探索。

## 2026-10-14 06:10 checkpoint：非標準 gateway 衝突不能丟報工 ID

- **06:13部署覆核（取代以下建置/PR待確認）**：Render auto new_commit **dep-db7ap4ajnfac73d3fvsg**於 **22:11:52.201Z live 0114f9f**；一般root HTTP200/CF MISS新 **index-B6Y794zc.js**，真qa-lead普通reload/等待初始化後亦同bundle、10/14/1廠22段。22段DOM id/label/text/style逐項與原baseline完全一致，browser error0。**只讀首頁，未開工/回報量/完工/確認/套用、沒有cloud寫入**；本輪資料層無畫面改動，不重截上一輪圖冒充新fault驗收，未知gateway核心證據為上面真SQL＋SDK＋actual handler。6tabs再handoff，dev與既有本機資料保留；沒有viewport/network override/clear cache/重複deploy/env/solver/正式deploy。
- **06:15收尾**：PR16兩套Tests **38475846551/38475854253**及smoke **38475846536/38475854260**全success；stage第三套Tests **38476064173**及smoke **38476064078**亦success。Render app error **22:11:52–22:14:56Z**部署後3分鐘窗0，非長期保證/Realtime恢復，沒有雲端寫入驗收。兩PR仍draft、正式門檻未全过，不合main/正式、不啟nightly；本輪doc-only只推own，不重部署無runtime改變的服務。下一輪優先查官方40001服務端風險的真版本/合成隔離證據，而非重跑已過seed/0037/UI/CI。
- 起點 **fa926a2** clean，核對process僅既有dev/本輪shell，沒有本目录另一modifier/deploy；已讀CONTINUOUS/HANDOFF/DEFECT_HUNT_REPORT/NEXT_TASKS/測試模式交接。fetch main新增 **587858e**只有他agent10行紀錄，普通merge **769ef73**保留，沒有覆蓋其他提交。正式1023/setup_pending/Auth/角色/授權及資料全未動，不改正式RPC、不新增migration/付費服務/新明文artifact/log；cloud QA只有read，不重匯資料。
- **0114f9f5492b7fc2d91ecd4709c80af66b5d517e**：actual SDK非空40001不看HTTP狀態就ConflictError，actual handler會清pendingRequest與session ledger。新增SDK 502/503/504及既有4xx/正規500矩陣、真SQL＋SDK＋actual open/close/report handler，修前 **7 PASS/2 RED**，真SQL已commit卻503/40001使原ID丟失。最小資料層2行comment＋狀態条件：相容4xx/null adapter與**正規500/40001**仍可判定衝突，其餘非標準5xx保留UnconfirmedWriteError，不自動重送、不改UI。
- 重要校正：不能把所有5xx/40001都當未知。[PostgREST14官方mapping](https://docs.postgrest.org/en/v14/references/errors.html)定義**40* transaction rollback→HTTP500**；已保留此語義，不能根據合成503案例宣稱平台真回覆如此。actual PGlite stale revision真raise40001→依官方500 mapping傳給actual SDK仍conflict；event/version不增加。正常report真SQL先commit再合成503（unknown code與40001兩例），modal及ledger保留同ID/qtyDraft，真close/reopen→explicit replay兩RPC只有**1event/revision1/version1**、原480–540/60件不變，確認回條才清理。同時驗真SQL超量P0001/角色42501拒絕；fixture Auth/角色僅記憶體DB，不寫真專案。
- 修後聚焦 **48/48**，完整web cwd dot exit0/build **index-BYdAprkP.js**，原chunk>500k warning保留。未改frontend介面，不啟Impeccable polish或重做既有390/桌面外觀；已保留6tabs、已讀Computer Use及Render deploy/部署驗證skill，後續只核對既有隔離stage exact SHA/普通root/班表不變，不建新服務/env變更或solver無改重部署。
- PR16先核對clean/localremote **8d32cc6**一致，普通merge來源 **a2de9660df17f84a9d0fd79f988c80df6ca929b1**，原5檔105insert/3delete保留，完整本機web cwd dot exit0/build **index-CNpMmcwq.js**後push。來源Tests **38475646613/38475649798**與smoke **38475646602/38475649760**全success，真CI **web772/772、工具46/46**；全綠後才ancestor核對non-force stage5fe→0114，不把push當live。PR16 Tests **38475846551/38475854253**尚跑，smoke **38475846536/38475854260**success。兩PR仍draft，正式跨actor/真套用/autosync/offline409/VITE_TEST_*未全過，不合main/正式、不重啟nightly。
- **新增只讀風險查證候選**：[Supabase官方2026-10-13說明](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b)指出自訂raise40001在PostgREST14可觸發重試問題、16已修；repo0021報工revision guard的確使用該碼，但**本專案實際PostgREST版本/是否有迴圈尚未查證，不能冒稱產品執行期故障已重現**。下一輪先只讀查版本/匿名化彙總logs，或獨立合成PostgREST實證；不terminate backend、不restart專案、不因文件建議取得額外正式DB修改授權。這輪小修不解決server自動retry風險。另仍不宣稱跨reload/new login恢復待確認ID，實作只有session頁面ledger＋beforeunload提醒。
- 靜態擴充只做`rg --count`精確樣式：7份migration中有9處`errcode='40001'`（0020/21/22/23/24/30/31），不等於9個已重現缺陷/9份真實雲端函式、也未查實際部署body；不要以此擴大正式schema修改授權。SDK合成503/40001與正常500衝突是**客戶端最小分類修正**，與平台14重試loop是兩個不同待驗問題。

## 2026-10-14 05:56 checkpoint：報工待確認 ID 跨關窗保留

- **06:01部署覆核（取代以下建置/PR待確認）**：Render auto new_commit **dep-db7aith42hec73907qe0**於 **21:58:36.939Z live 5fe6707**；一般root HTTP200/CF HIT、新 **index-DS9n1F59.js**，真qa-lead普通reload亦載入同bundle、10/14/1廠22段。真「更多→現場回報→測試R10→查看／回報」表單只開讀再Close，沒有任何開工/件數/完工/確認/套用；22段DOM id/label/text/style逐項不變，browser error0。**outputs/staging-report-reopen-readonly-20261014.png**fullPage已目視（尚未開始），只能證明新build讀取/開閉相容，不是雲端未知回覆重試/跨actor/sync證據。關閉更多drawer後dialog0/drawer0/22段；6tabs重新handoff、5202/5203dev與既有本機資料保留。
- PR16两套Tests **38474320634/38474325040**及smoke **38474320555/38474325086**全success。收尾 **22:01:55Z**核實stage第三套Tests **38474482154**及smoke **38474482198**亦success；下一輪不重做已過的CI/live/root/seed/0037，直接接續候選實證。Render app error **21:58:36–22:01:53Z**（部署後3分鐘窗）為0，不是長期保證/平台Realtime恢復；此logs MCP曾延遲逾30秒但最終成功，沒有重複dispatch。無clear cache/重複部署/env改動/solver更新/正式deploy。两PR仍draft，正式門檻未全過，不因綠CI放行。
- 下一候選已用actual SDK合成fetch CLI（不讀寫真庫）收斂：HTTP503帶 **40001**目前仍 **conflict:true/unconfirmed:false**；尚未補「真SQL已提交→異常503/40001→原ID保留」實證/修正，不能宣稱平台曾回傳此碼，也不能把本輪5fe當已涵蓋此種gateway結果。後續先補RED再最小修分類，仍不自動重送。此doc-only只推own，無runtime改變不部署，10分鐘追蹤持續。
- 起點 **8896b27** clean，核對process僅既有dev/本輪shell，沒有另一輪本目錄修改/部署；已讀最新CONTINUOUS/HANDOFF/DEFECT_HUNT_REPORT/NEXT_TASKS/測試模式交接。普通merge最新main **1640d61→aa3605b**（其他agent25行紀錄保留、無runtime改動）。正式1023/setup_pending/Auth角色/授權與資料未動，沒有cloud報工/排程寫入、明文artifact/log、額外migration或付費資源。
- **5fe6707fc04a7926e7cde268118f88eca0909d3d**：實際openModal/closeModal/reportWork編譯執行證實關窗丟pendingRequest，晚到未知結果與in-flight關窗重開亦丟同ID；修前新增6條生命周期中 **4 RED/2 PASS**，原15測保持綠。最小新增**ExecutionRetries WeakMap**，只有已實際dispatch的request記入當前Store/client/user/authEpoch/block；重開只恢復同ID/qtyDraft/原提示，沒有自动重送。有效ACK/已知拒絕清理原request，即使已關窗也不影響新草稿/undo/toast；不同actor/client/epoch/store不能繼承；late cleanup按request reference防抹掉新版。此紀錄僅存在頁面工作階段，**不持久化、不跨reload或新登入恢復**；beforeunload對未釐清紀錄提醒，不能稱使用者強制刷新後不丟ID。
- pending finish已在DB完成時，actual renderer仍提供同ID明確重試，而不是開工/quantity/finish新操作；未實際dispatch的queued取消不生成幽靈紀錄。新增6生命周期＋1actual completed renderer＋2ledger邏輯測，聚焦 **37/37**。擴充原真PGlite migration/SQL＋actual SDK異常HTTP503＋actual handler回歸，加入真open/close/reopen後explicit retry：同ID兩RPC只有 **1 event/revision1/version1**、原480–540/60件不变、ledger清空。合成503不是平台已發生此error code證據；fixture Auth/角色在記憶體DB，非真庫寫入。
- 完整web cwd dot exit0/build **index-CeY4R5WD.js**；chunk>500k warning原有保留。使用Impeccable harden/craft-floor（context本session已讀不重跑），保留既有identity/版面，只補取消/重試/邊界；同cycle bounded桌面+390兩批，不延伸無限polish。本機5203既有A01 completed12件未確認和17段/1情境全保留，只開讀表單/Close；桌面/390 Close **46px中心命中**、390無水平溢出、17段DOM id/label/text/style相同。標準screenshot **local-report-reopen-compatible-20261014.png**縮圖異常，不能當證據；CDP明確clip **local-report-reopen-mobile-clip-20261014.png**390×844已目視，圖顯示已完成舊事實，截取範圍未全呈現底鈕，不冒稱圖能證明取消/未知回覆重試。viewport已clear；真取消/保留依DOM，未知結果核心依真SQL/SDK/VM，不稱真手機Safari或cloud雙帳號。
- PR16起點clean/localremote **9be2f20**一致，普通merge來源 **8d32cc679564dadb8346d6b19833e7df5719d34f**，原5檔105insert/3delete保留，完整本機web cwd dot exit0/build **index-DfzUjcYu.js**後push。來源Tests **38474053065/38474058161**與smoke **38474053073/38474058280**全success，真CI **web770/770、工具46/46**；全綠後才核對ancestor並non-force stage 81a4→5fe6707，Render建置/live仍需收尾。PR16新Tests38474320634/38474325040待確認、smoke38474320555/38474325086success，不冒稱PR全過。
- 後續依Render deploy skill，只更新已配置隔離staging並驗exact SHA/普通root/真表單開閉；不變env/solver、不建資源、不合main/正式、不启nightly。正式跨actor角色/真套用/autosync/offline409/VITE_TEST_*仍未全過。下一候選：意外5xx帶40001不可當確定conflict，及真正跨登入/刷新後的明確核對流程；本輪未修這兩項、不宣稱全部未知結果安全。6tabs/dev環境供後續保留，10分鐘追蹤持續。

## 2026-10-14 05:44 checkpoint：未知 RPC 錯誤不丟失報工重試 ID

- **05:49收尾（取代以下建置/PR待確認）**：Render auto new_commit **dep-db7acqugekts73dm4m50**於 **21:45:48.708Z live 81a4d26**；一般root HTTP200/CF HIT為新 **index-DdDmZZxQ.js**，真qa-lead普通reload後亦載入此bundle，初始化後10/14/1廠22段。依實際選單「更多→現場回報」開測試R10表單，僅查看再關閉，22段DOM id/label/text/style全部不變、browser error0；**未按開工/做了幾件/完工/確認/套用**。本地截图 **outputs/staging-report-open-only-20261014.png**已目視（未開始表單），只證明讀取/開啟相容，並非雲端同ID重試寫入實證；没有新增viewport或network override，不稱真手機/Safari。Render app error短窗21:45:48–21:46:52Z為0，非長期保證/Realtime復原。6tabs再次handoff，環境保留。
- PR16兩套Tests **38472728769/38472735416**與smoke **38472728705/38472735340**全success；stage第三套Tests **38472936213**與smoke **38472936185**亦全success。兩PR仍draft，正式跨actor角色/真排程套用/autosync/offline409/VITE_TEST_*未全過，不合main/正式、不重啟nightly；此輪doc-only只推own，不再部署無runtime改變的服務。下一輪接續待確認ID關窗/帳號切換的最小重現，保留真SQL＋SDK且不觸碰1023。
- 起點280fedd，開始已核對worktree/process/最新交接，僅既有dev可見，沒有其他本目錄modifier/deploy；普通merge最新main **1ce27d7→a321df9**（只22行他agent紀錄，保留）。正式1023/setup_pending/Auth/授權未動，無雲端報工或排程写入、無新明文artifact/log、無付費資源、無額外正式migration。
- **81a4d263a656e6a5d3a4f9663ac5e0ed775e6f8d**：根因為`reportExecution`以任意非空error.code判定rejected，真SQL已提交但合成gateway回覆HTTP503/未知code時，實際app reportWork清掉pendingRequest/reportOwner。新增actual Supabase SDK矩陣＋PGlite真migration/SQL橋接SDK及實際handler兩測，修前 **5 PASS/2 RED**，不是stub SQL；修後聚焦 **30/30**、完整web cwd dot exit0/build **index-BsgSZ1Gn.js**。未知code/空code以及HTTP503的P0001/42501維持UnconfirmedWriteError，只有本RPC已知42501/P0001且相容4xx（真SQLadapter無status）確定拒絕，既有40001衝突語義保留。只改資料層，沿用現有重試提示，不自動重送。
- 真SQL證明：第一次確已commit而回覆被合成503遮蔽，modal保留同ID/qtyDraft/待確認提示；本人explicit retry仍同ID、兩RPC只有 **1 event、revision1/version1**，原480–540/60件不變。真SQL超量P0001與viewer42501仍確定拒絕，不增第二event。合成gateway不是平台曾出現此code的證據；測試Auth/角色只在記憶體DB，**不是改隔離或正式帳號**。本轮沒有雲端寫入或真正跨actor同步/Safari驗收。
- PR16先確認clean/localremote96c一致，普通merge來源為 **9be2f2037f35a93a6d282aca3c8fba9dec348e97**，完整web cwd dot exit0/build **index-bQdvkx6a.js**後push，保留原5檔105insert/3delete。兩PR仍draft，正式門檻未全過，沒有main合併/正式deploy/nightly重新啟用。
- 來源Tests **38472527597/38472534646**與smoke **38472527659/38472534859**全success，CI真實 **web761/761、工具46/46**。全過後才驗ancestor並non-force FF stage f00→81a4，Render auto new_commit **dep-db7acqugekts73dm4m50**已開始建置，尚須核對live/root/功能；用Render deploy skill核對既有服務，不新建資源或變更env。PR16新Tests **38472728769/38472735416**尚跑、smoke **38472728705/38472735340**success，不能冒稱PR全綠。
- 候選續查：未知結果關窗後pendingRequest僅在modal的生命週期，以及意外5xx帶40001的衝突分類，**本輪尚未修/驗，不宣稱全部錯誤與重開視窗皆已安全**。目前真正qa-lead普通root10/14/1廠有22測試段；第二tab同actor，不當第二帳號。6tabs與dev環境保留，10分鐘追蹤持續。

## 2026-10-14 05:28 checkpoint：情境讀取 owner／工廠日期／手機長名稱

- **05:32收尾（取代下面最終CI/PR/stage待確認狀態）**：f00兩套Tests **38470467785/38470464606**與smoke **38470467297/38470464300**全success，真CI **web759/759、工具46/46**；全過才non-force FF stage d864→f00。Render new_commit **dep-db7a55tbedkc738ca53g**於 **21:29:16.833Z live f00cc7a**；普通root HTTP200/CF MISS、新 **index-Bc1F7c7Y.js**，真qa-lead重載普通/初始化後10/14/1廠22段。stage第三套Tests38470925467/smoke38470925445亦success。沒有clear cache/重複部署/env改動/solver更新/正式部署。
- PR16最终96c517b完整web cwd dot exit0/build index-C-fLbrUy成功後push，Tests **38470739166/38470734176**與smoke **38470737658/38470734211**全success。保留原diff，兩PR仍draft，正式發布門檻沒有因CI全綠放行。此doc只推own，不更新沒有runtime改變的服務。
- 真staging手機390×844：CDP暫設3000ms latency，UI情境清單明示role=status讀取中→Close→新手動視窗（此廠無可新增工作，**未驗合法新增/套用**）→開「新增工單」視窗，舊清單沒有取代新視窗。只填「驗收草稿-不儲存」後Cancel，未按下一步/Save/情境保存/用這套/報工/確認等；22段DOM id/label/text/style逐項不變，browser error0。一次getAttribute(value)讀到原HTML預設W27是attribute不是live input property，不當作失去輸入缺陷；此驗收證明視窗保留，**不聲稱字段在舊response前後逐位元組保留**。Network latency恢復0/throughput預設並disable，viewportclear，6tabs handoff；無cloud資料重匯/新增情境或工單。真正scenario detail late-ACK/跨actor取消仍以VM＋SDK owner回歸為證，雲端清單0份不能假稱真cloud detail已驗。
- Render app error **21:29:16–21:31:58Z**短窗0，非長期保證/Realtime復原。續查SDK候選的CLI合成custom fetch（不讀寫真DB）：HTTP503任意非空code SYNTHETIC_GATEWAY_UNKNOWN得到 **rejected:true/unconfirmed:false**。**尚未完成已commit但異常回覆的真SQL＋app retry-ID回歸，未修此候選**；下一輪優先補實證與最小修正，不把任意合成code宣稱平台曾回傳。正式1023不動，追蹤持續。
- 起點82e60a5乾淨，核對最新提交/process與交接，fetch main仍11ff07d已含在來源，沒有其他本目录modifier/deploy；讀本文件/HANDOFF/缺陷總表/NEXT_TASKS/測試模式歷史文件。前輪stage第三套Tests38468943127已success，不重驗seed/0037/root。正式1023/setup_pending/Auth角色/權限完全未動，無新明文公開artifact/log或付費資源。兩PR仍draft，不合main/正式、不启nightly，10分鐘追蹤與dev保留。
- **8bfd86381bfd1fb4d7fc785aa654e81b3c4d82ea**：真正編譯openScenarioList/viewScenario＋makeScenario/validateScenario/scenarioStale的6測 **5 RED/1 PASS→6 GREEN**。首次doubletap測試錯把第二個pending直接await，造成4 cancelled，已改為先resolve再await，這是fixture問題不是4個產品缺陷；重新有效重現才得到5 RED。late payload/error可取代新draft/PV，清單會把失效actor/context回覆寫入原modal；重點修Store/client/user/authEpoch/modal/state+JSON/date/factory/page/drawer/focus/PV owner，每次await後檢核，無自動重讀/重試、無schedule寫入。view必須來自owning list，viewLoading去重並鎖非Close控制、aria-busy/status；讀取失敗inline alert且保留items，允許本人再按，invalid payload或錯scenario ID不進PV。只讀comparison保持applicable:false，未新增apply入口。
- 情境原created_at UTC slice在台灣午夜顯示前一天，改純函式 **scenarioCreatedDate**固定Asia/Taipei輸出日期，缺/錯scalar隱藏日期不崩潰；實際工廠界限與跨年測試，另以TZ=UTC／America/Los_Angeles命令同一2026-12-31T16:00Z均得到2027-01-01，env最後還原，不用機器timezone決定。新增read8＋actual renderModal1＝9測，聚焦14/14及完整web cwd dot exit0/build **index-Cd0nRAIL.js**。8bfd兩套Tests38470060841/38470054407與smoke38470061018/38470054418全success，但未推stage，不能稱含後續wrap。
- **真UI獨立本機tab27**：原1份比較未重存；清單日期從10/13改10/14；桌面實點進入保存情境，only只讀/不可套用→結束查看後17段DOM id/label/text/style逐項一致。390×844同樣可開→底部取消→原班表不變。桌面outputs/local-scenario-factory-date-20261014.png已目視，非雲端情境讀取/真Safari/跨帳號證據。
- 手机第一批檢查發現**長name＋日期被單行按鈕截斷**，red screenshot **outputs/local-scenario-date-mobile-20261014.png**已目視（scrollWidth>clientWidth，48px可點但日期出界）。Impeccable main/harden/craft-floor全文，按bounded批次做最小wrap改善 **f00cc7a712a5398a592537a62312c8e12f35e7d7**：white-space normal/overflow-wrap anywhere/text-align left，未重造界面或更動機台×時間、日週切換、抽屜、午休灰底。HMR後drawer消失造成一次locator找不到，依fresh DOM重新進入，是測試上下文非新產品缺陷。一次確認：手機height50.625/center hit/無button或dialog overflow、日期整行完整；桌面48px/無溢出。green **outputs/local-scenario-date-mobile-fixed-20261014.png**已目視，red/green留存，不覆蓋證據。
- 最終f00本機完整dot exit0/build **index-B1EU688c.js**，chunk warning保留；含wrap的同SHA CI仍須核對，未推staging（仍d864 live）。PR16先clean/localremote e402一致，ordinarymerge8bfd為fe435e1（full dot/build index-BM7bS4Jq通過），再clean普通mergef00為 **96c517b884e8766cfbcb6bffe71bb6745b227a81**；最終build **index-C-fLbrUy.js**，full tests尚需收尾確認後push，原5檔105insert/3delete差異保留，不force/reset/sharedcheckout切換。
- 本輪沒有新增任何本機/雲端情境或報工；原local5203的17段/1份scenario/12件完成未確認、local5202的18段/memo/archive全保留。browser error0、viewportclear，6tabs handoff需收尾再標，dev保留。等待/晚到/連點由VM deferred覆核，不能當真平台復原或雲端兩端同步。正式發布門檻仍缺真第二帳號/角色雲端寫入/真套用/autosync/offline409/正式VITE_TEST_*。
- 下一輪：先依收尾新增checkpoint核對最終CI/部署，不重做情境讀取/date/長名；續查unknown PostgREST error.code被當確定拒絕而丟報工同ID、uncertain request關窗後生命週期；讀取長等待的取消仍需真雲端不同actor證據。維持追蹤，不因本輪通過而結束。

## 2026-10-14 05:12 checkpoint：試排情境保存競爭與有效回條

- **05:15部署覆核（取代下面尚未部署狀態）**：既有Render auto new_commit **dep-db79tt7avr4c73f1rca0**於 **21:13:46.144Z live d864885**；普通root HTTP200/CF MISS新 **index-CO1Rd82J.js**，真qa-lead普通/重載初始化後10/14／1廠22段。390×844：更多→情境清單原0份→保存表單，填「驗收草稿（不保存）」→直接取消→收drawer；22段ID/label/text/style逐項一致，name input19px、無水平溢出，X/取消/保存鈕44px且中心命中。**未按雲端確認保存/用這套/報工等**，不把唯讀取消當cloud save成功。browser error0；Render app error短窗21:13:46–21:15:08Z為0，非長期保證。Network未開、viewportclear、6tabs重新handoff，dev與local1份情境留存。stage第三套Tests38468943127仍in_progress、smoke38468942959success，下一輪僅核對第三套，不重做已過的前兩套/root/seed；正式發布門檻仍未全過。
- **05:14追加（部署覆核仍待完成）**：d864兩套Tests38468340891/38468334294、smoke38468340841/38468334342全success，真CI web **750/750**、工具 **46/46**。PR16 e402兩套Tests38468571910/38468563225及smoke38468571858/38468563227亦全success。全過後non-force FF既有stage73108→d864，尚需核對Render live/root與cloud只讀取消。CLI真函式診斷（未寫入檔案/DB）另重現viewScenario：原請求pending→UI改new-draft→舊response完成，仍呼叫enterPreview「Synthetic late comparison」1次；**已確立下一缺陷，不是本輪保存修復涵蓋**。不強合main/正式、不停止探索。
- 起點a43378f乾淨，核對modifier/dev與新提交，讀最新HANDOFF/缺陷總表/NEXT_TASKS/測試模式及本文件。正式1023/setup_pending/Auth角色/個人授權完全未動；0037、seed及備份不重做，無新明文公開artifact/log、付費服務、main合併或正式部署。10分鐘追蹤與持久環境保留。
- **真正重現**：編譯實際saveScenarioFromModal＋實際makeScenario/LocalStore的6項測試 **5 RED/1 PASS**：晚到成功關掉新草稿/舊失敗跑到新畫面；新button連點送兩次；失敗後改名稱仍送舊name；沒有busy/inline error；本機成功未明示只存在裝置。穩定PV內保存比較的既有正向測試原本PASS，保留，不把它當缺陷。額外實際SDK HTTP200/null/wrong UUID回條 **1 RED→GREEN**，沒有用字串源碼斷言代替功能。
- **d8648855ce7ab224819722775ed6582419b4b404**：保存捕捉Store/client/user/authEpoch/modal/state/view/PV，晚到結果只影響原owner，不關新草稿/顯示舊訊息。UI.scenarioSaving阻擋第二份保存，關窗後仍保護背景reload/beforeunload；同名稱重試沿用原item/ID/payload，**使用者明確改名則建立新comparison ID**，不再默默保存舊名稱。這不保證未知提交改名後沒有兩份情境，也沒有自動retry；關窗不是遠端取消。saving期間aria-busy/status與字段/保存鈕鎖定，Close仍可用，error escaped inline；本機成功文字明確裝置儲存，en/vi/th四鍵新增。Impeccable main/harden/craft-floor全文依既有Operate風格只改錯誤/非同步回饋，不改排程布局/日週/抽屜/午休灰底。
- Supabase save_planning_scenario經0021確認**returns UUID**，現在要求回條匹配送出的captured ID，空/格式錯/其他ID走Unconfirmed，不當成功。新增真PGlite全migrations＋Store：已commit但ACK剝除→unconfirmed；list確有1份；同ID重試2次RPC總共仍1份、完整snapshot JSON及version不變。此是in-memory SQL，不是真隔離Supabase/Safari/跨端或完整備份還原。
- 本輪新增9回歸（VM/Local6＋SDK1＋真SQL1＋renderModal1），聚焦20/20再補SQL15/15與render5/5全過。最初兩次全套从repo root執行，只有Excel範本相對路徑ENOENT失敗，是**測試命令cwd錯誤**非產品缺陷；改web cwd完整dot exit0。普通merge latest main **11ff07d**為 **e35c595**（保留模組coverage測試與其他agent docs；自有未提交修復原樣保留，無重置/force）；最終完整web cwd dot exit0/build **index-zdmavogY.js**，chunk warning保留。
- PR16先clean/localremote cd25一致，普通merge至 **e40285662fe4b4479a627cc47eb9eef2a1ed53bf**，完整dot exit0/build **index-DANi0onB.js**後push；相對source既有5檔105insert/3delete保留。兩PR仍draft，PR18 MERGEABLE、PR16當時UNKNOWN。來源Tests **38468340891/38468334294**與smoke **38468340841/38468334342**需收尾核對；05:10僅第一smoke綠、database綠、frontend/solver進行中，**尚未推staging**，不能冒稱已部署。既有live仍73108/dep-db79lovavr4c73f1ejbg。
- **獨立本機真UI**tab27/127.0.0.1:5203/?local=1：先本機/示範旗標，再更多→試排情境（原0份）→輸入「本機保存驗收 20261014-0512」→确认保存→裝置成功提示；reload→清單1份仍在，17段DOM id/label/text/style與before完全一致，前輪完成12未確認紀錄保留。新增僅一份local comparison，不改cloud test或localhost5202資料；outputs/local-scenario-saved-20261014.png已目視，**不是雲端scenario成功證據**。
- 390×844手機尺寸：空name確認→就地alert「情境名稱須為1–80字」，不寫入；input19px、無水平溢出，X/取消/確認均44px且中心命中enabled。取消後清panel，browser error0，viewport清除，6tabs handoff；outputs/local-scenario-mobile-error-20261014.png已目視，非真機Safari，等待/晚ACK仍為VM/deferred覆核。既有本機5203及5202dev保留，不新建服務。
- 未完成門檻仍是真第二帳號/角色雲端写入/真套用/跨端autosync/offline409/正式VITE_TEST_*，不強發，不启nightly。收尾要核對同SHA兩套CI、PR16 CI；全過才non-force更新既有staging並核對live/root/bundle/只讀取消與錯誤。下一輪續查**scenario-view/read晚到回覆**（本輪未改）、scenario建立日期用UTC slice在台灣跨午夜顯示前一天（本輪真本機畫面已觀察，未修）、unknown PostgREST error.code/uncertain request ID關窗生命週期；不重做seed/0037/已修保存，不停用追蹤。

## 2026-10-14 05:01 checkpoint：確認完工入口與非同步 owner 防護

- 起點3b3f095乾淨，先核對modifier、既有dev server與最新交接；正式1023/setup_pending/Auth角色/權限完全未動，0037/seed/備份不重做。沒有新明文公開artifact、付費資源、main合併或正式部署，nightly仍停用，10分鐘追蹤持續。
- **bcbe1d5**：真正編譯exec-confirm/unconfirm與directWriteOwner的VM回歸重現晚到ACK、排隊切actor、重複點擊、舊錯誤污染新草稿、protected reread未成功卻假稱刷新。初始9測皆失敗，但其中LocalStore測試缺員工catalog是fixture錯誤，修正fixture後才作有效正向驗證，不能算9個產品缺陷。captured Store/owner/state/view送出前與await後檢核；SYNC error、setupPending、PV與其他在途寫入擋下，UI.executionSaving保護關窗後背景補讀與beforeunload；finally只釋本operation，不重繪新草稿。已送出的資料庫要求不保證關窗取消或rollback，無自動重送。
- 真正MODALS.execution渲染另重現**兩個case存在但畫面沒有確認／取消確認入口**，新增第10測RED→GREEN。僅完成且有execution.manage權限、非setupPending才顯示控制；worker不顯示。confirmBusy role=status/aria-busy及所有非Close控制鎖定，saving-form-fields另1測RED→GREEN，關閉仍可操作；error escaped inline alert，en/vi/th鍵補齊。Impeccable main/harden/craft-floor全文影響只可达入口、async/error/權限與儲存文案，不改Gantt/日週/抽屜/午休灰底。
- **73108d53645d6c790ee3f0be8e9cd35189024ad0**：真LocalStore回歸發現成功卻聲稱「已存到資料庫」，增加有效斷言RED→GREEN；本機現在說「已存在這台裝置」，雲端維持資料庫文案。此輪新增11項真正回歸（owner/workbench10＋modal1），原message測試更新handler adapter，不當作新缺陷。聚焦15/15、完整dot exit0/build **index-DaJ_1vVH.js**，CI實際log **web740/740、工具46/46**；Tests38466283239/38466275862及smoke38466283163/38466275847全success，stage分支額外Tests38466724673/smoke38466724464亦success。本機chunk警告/age限制仍保留，工具46為CI真環境。
- 普通merge最新main **e31cc6c**為622176a，保留其他agent i18n/月曆/測試/紀錄，沒有force/reset或切共享checkout。PR16乾淨且local/remote一致後普通merge73108至 **cd25e234d329fe9b97a24a99393a8e08cc63b088**，完整dot exit0/build **index-hzsSytKa.js**並push；既有5檔105insert/3delete差異保留。Tests38466704151/38466709060、smoke38466704083/38466709117全success。PR16/18仍draft，未放行main/正式。
- **獨立本機真UI正向流程**：新127.0.0.1:5203/?local=1（tab27、dev session39943）先驗證本機/示範資料，17段demo；A01裁切原08:00–09:00/120件，實點開工04:50:36→回報12→完工04:50:48→確認→reload仍已確認→390×844實點取消確認44px中心命中→reload仍完工待確認/已做12，原計畫120件與時間不变。local存留1筆完成12件但未確認，不reset；原localhost5202的18段/memo/archive與雲端種子未動。outputs/local-completion-confirmed-20261014.png已目視，是取消前本機已確認畫面，**不是雲端confirm/Safari/跨帳號證據**。新origin導覽一度蓋在modal上，關窗略過導覽再進，列為後續候選，非本輪已修。雙員工同名選取造成locator ambiguity已限定A01，非產品缺陷。
- **staging發布順序如實記錄**：推stage時Tests38466283239已success，但第二套38466275862仍in_progress；沒有等兩套全完成才推，後於20:57Z核對第二套success。其後stage第三套亦全過，不追稱dispatch當時全部全綠。Render deploy/main及deployment-details/post-deploy-checks全文，non-force FF既有branch6195→73108，auto new_commit **dep-db79lovavr4c73f1ejbg**於 **20:56:27.810Z live73108**。無重複部署/clearcache/env改動/solver更新。
- 普通root **20:58:51Z HTTP200/CF MISS/s-maxage300、新index-CycH_XUf.js**，真qa-lead於普通/重載初始化後10/14/1廠22段。現場回報工作台22列都尚未開始，正常開/Close/收drawer後22段ID/label/text/style逐項一致；未為測試入口而產生雲端completed資料，未按cloud報工/確認/取消確認/Save/用這套。一次把REPL基準直接引用進evaluate的比較false是scope adapter問題，兩次DOM快照在REPL比較true，不能當作取消寫入缺陷。browser error0；Render app error短窗20:56:27–21:00:04Z為0，非長期保證或全部雲端功能驗收。
- 6個tab handoff（stage20/24同帳號、local25/27、Render21、GH23），viewport/Network清除，兩本機dev保留。Realtime仍中斷；真第二帳號/真套用/跨端autosync/offline409/正式VITE_TEST_*門檻未全過，不強合併。下一輪從本checkpoint續查**scenario-save**晚到回覆與連點（本輪尚未探索），unknown PostgREST error.code/uncertain報工ID關窗生命週期、導覽與modal競爭；不重做確認入口、root或seed，不停用追蹤。

## 2026-10-14 04:36 checkpoint：報工／確認完工有效回條與未確認班表守門

- **04:39收尾覆核（取代本節root待確認狀態）**：等待已觀察的s-maxage=300到期後，普通 **/** 於 **20:38:50Z**回HTTP200／CF **EXPIRED**、新ETag1607911fae617e9ea131d1075b44057a，實際DOM新 **index-K8czAH2g.js**；初始化後qa-lead10/14／1廠22段正常、無modal／drawer，browser error0。没有cache-buster／clear cache／重複部署，不能泛稱所有地區快取同步刷新。Network disabled、viewportclear、5tabs handoff已完成；staging branch第三套Tests38463614931／smoke38463614893亦success。own docs04f141c已push，此追加也只推own docs，不更新無變化服務。下一輪不重做root/回條/seed，改先查確認／情境UI競爭與報工uncertain ID生命週期；正式/雙端門檻仍未放行。
- 起點a34624d乾淨，僅既有PR16 Vite無modifier/deploy；讀最新本文件與HANDOFF/缺陷總表/NEXT_TASKS/測試模式文件，歷史mail未授權等不覆蓋最新人類授權。正式1023/setup_pending/Auth角色/授權完全未動，0037/備份/seed不重做；無新明文公開artifact/付費服務。環境與10分鐘追蹤保留。
- **校正前輪文件的錯誤假設**：0035 **confirm_work_execution returns jsonb**，不是void；真SQL明確回傳blockId/confirmed/version。本輪先讀0021/0035與全部patches，不沿用前輪「confirm void不能拒null」的錯誤。只修應用契約，沒有任何新增schema/migration或正式寫入。
- **db98963（合併前修復）**：新真正SDK/custom fetch及PGlite回條5測 **4 RED/1 PASS→5 GREEN**。報工HTTP200/null、錯工單/employee格式/status/qty/revision/version/time不再當成功；以實際送出的scalar request驗證block（UUID大小寫正規化）、qty、action/finish、revision、正數safe version及開始/完成時間，finish不得早於start。**重試回條version可比目前snapshot舊**，不錯誤要求store.version+1；合法同IDreplay仍接受，不改Store baseline直到後續正式read。confirm要求正確block/boolean旗標/正數version，失去回條Unconfirmed且明示更新核對、不盲目重送。
- 真PGlite全migrations＋FakeSupabase Store：報工已commit但剝除ACK→Unconfirmed；同ID重試version1/revision1、work_execution_events **1筆**，沒有第二次version bump。完工qty40/revision2正常；confirm已commit但null ACK→Unconfirmed，fresh load確實confirmed true/version3，**change_sets3筆**，沒有再送confirm。原計畫start480/end540/qty60不變。此是in-memory真SQL執行，不是正式/staging雲端寫入、不是完整專案還原或真跨端驗收。
- 三項真正reportWork VM競爭 **3 RED→3 GREEN**：SYNC error時不能新送/重試；排隊sync剛失敗不能dispatch；舊pending retry ID保留。初始/await syncChain後兩階段檢核，inline alert與累計輸入保留，未送出的新request移除但既有uncertain ID不改，executionSaving正確釋放，沒有自動重送/自動回報。本輪Impeccable main/harden/craft-floor全文，session context已跑不重跑，影響只error/async/i18n提示，沒有重設Gantt/抽屜/日週/午休灰底。
- Fetch發現main新d93ac13/54e1666/c3bac11/cbae122（翻譯、測試與其他agent紀錄）；普通merge **1197f73dacd9640d472c938d850e87e3e2617cf7**全保留，沒有workflow新明文artifact變動，非force/reset/sharedcheckout切換。完整本機dot exit0/build index-X1WlvUzT.js，Tests38462681345/38462673419、smoke38462681365/38462673275全success。
- **6195a7f2b1ea934d45f05e1c33b62bae474364bc**追加一項真正case handler VM **1 RED→1 GREEN**：exec-confirm/unconfirm原catch把Unconfirmed再冠「沒存到」會誤導成確定失敗；現在直接tx待核對文案，確定DB拒絕/缺0035分支原樣保留，不替使用者重送。**未處理其他確認UI的late ACK／雙點／read競爭**，不能稱所有確認流程已安全。本輪新9項回歸；最终完整本機dot exit0/build **index-CpgI1IJr.js**，聚焦SDK/VM/真SQL等41/41＋新confirm1/1；實際CI log **web728/728、工具46/46**，Tests **38463174861/38463167581**與smoke **38463175024/38463167605**全success。chunk警告與本機age限制仍留；工具46為CI真age環境。
- PR16 worktree clean/local remote45db一致、只有既有Vite/esbuild，普通merge1197成94f8e9e（完整dot/build index-Dcj2WElj成功push），再clean核對普通merge6195為 **5389ce42468109bf39456f3be93948b126f6b4db**；完整dot exit0/build **index-DZNvxpz2.js**成功push。原5檔diff保留（對sourcebranch），Tests **38463508456/38463503030**與smoke **38463508949/38463503054**全success。PR16/18仍draft/MERGEABLE，未合main/正式，nightly不啟用。
- source同SHA CI全綠後non-force FF既有stage706f→6195；Render deploy/main及deployment-details/post-deploy-checks全文，既有auto new_commit **dep-db79alm7bikc73cocm4g**於 **20:32:42.969Z live6195**。正式/無變化solver無部署，未改env/新增服務。**一般root版本不能冒稱更新完成**：20:33:25 rootHTTP200/CF MISS/cache-control public,max-age=0,s-maxage=300卻仍舊index-DOYep9Op.js，等初始化後仍22段舊bundle；單次 **?release=6195a7f**取得新 **index-K8czAH2g.js**。不重複部署／clear cache，新URL驗收≠canonical root刷新；收尾/下一輪必須核對一般root。
- 新URL真qa-lead **10/14／1廠22段**：390×844手機點「查看排班」，8個測試方塊與測試機台進入實際viewport，含R10/A02/A06/M20/X13/A05；22段ID/label/text/style逐項與before一致。**outputs/staging-seed-visible-20261014.png**已目視，這是實際測試排班可見性，非report pending/error/Safari/不同帳號證據。1440桌面新整合版本現場回報R10原定08:00–08:40/60件、未開始/實際時間—正常，X48／start64／close46px中心命中，quantity/finish正確disabled，直接Close/收drawer後22段仍逐項一致。全程沒有cloudSave/report/confirm/准駁/pin/用這套，不重匯seed，既有local18段/memo/archive保留。
- Render app error短觀測 **20:32:42–20:35:12Z**0，非長期保证；CDP Network臨時診斷/root header只讀，未展示Auth header／session／SQL密碼，後續清除Network/viewport並handoff5tabs。Realtime仍明示中斷，沒有宣稱兩端同步已解。正式1023不動，真雙帳號/真套用/手機桌面autosync/offline409/正式VITE_TEST_*門檻未全過，draft不強發。
- 下一輪：先覆核canonical root新bundle而非再部署；真正編譯exec-confirm/unconfirm/scenario-save重現late ACK、雙點及protected read缺口；檢查unknown PostgREST error.code是否被當作確定rejected而丟棄報工同ID（先SDK與真SQL證據）。關窗後uncertain報工ID是否會失去、quantity draft/error i18n/手機提示需獨立重現。這輪修好不自行停用追蹤，保留持久環境接續。

## 2026-10-14 04:17 checkpoint：七個 SDK 入口身分綁定／個人資料有效回條／排隊報工競爭修復

- 本輪從3191e0a/b828乾淨續作，讀最新CONTINUOUS及HANDOFF/缺陷總表/NEXT_TASKS/測試模式歷史文件，無重疊modifier/deploy，fetch main仍6b929ca。正式1023/setup_pending/Auth角色/個人授權完全未動；0037/備份/seed不重做，沒有新明文公開artifact/付費資源。環境及10分鐘追蹤保留，不因這輪通過而停用。
- **a99c53cc6acc3e590c10847a73fd3c6c53d87ed9**：實際安裝Supabase SDK＋僅synthetic custom fetch重現listAccessAccounts/setAccessPermissions/listScenarios/getScenario/saveScenario/reportExecution/confirmExecution在等待accessToken時會帶切换後Bearer；同profile空／錯回條會假接受名稱。新13測 **12 RED/1 PASS→13 GREEN**。七入口捕捉client/user/authEpoch/token，每條query用既有requestOwnerGuard per-query Authorization且await後核對，不改shared headers。維持同owner refresh／missing token不dispatch／client/logout/epoch／HTTP401/403/409/500／revision conflict語意，未泛稱全部read API已綁定。請求可能已在原owner提交，身分guard不是遠端取消或rollback。
- profile update要求真object且displayName與trimmed送出值一致；null/array/missing/mismatch不改userName，以既有UnconfirmedWriteError待核對。真PGlite全migrations＋Store保存成功但receipt被剝除，先拒假成功，再_profile讀到真已保存名稱，不重送、不改schedule。聚焦SDK/profile/真SQL Store等50/50成功，full dot exit0/build index-Xr31HsT8.js；a99兩套Tests38459694137/38459688358及smoke38459694234/38459688531全部success。
- **UI真正新重現**：編譯實際reportWork＋directWriteOwner（VM DOM adapter、合成資料）在syncChain排隊時換帳號／client／modal等，會透過新全域STORE送出舊回報；late ACK清新undo、舊error跑到新dialog、reread failed仍假成功。最初 **9/9 RED**，非源碼字串斷言／非雲端寫入。修復 **706f84333d57827f77c5bb145191d7eaea8f746b**：送出前捕捉owner及state/view，排隊完成與await後雙檢核，call captured Store；不跨actor携帶pending retry。現場回報setupPending/其他直接寫入/重複提交擋下，UI.executionSaving即使關窗仍保護remote reload與beforeunload，finally只釋本operation、不重繪新草稿。
- 同owner網路不確定保留原request ID及累計quantity draft，inline alert明示「尚未確認、重試同一筆」；確定rejected/conflict清retry，conflict丟棄舊qty並protected reread。成功先只關本modal及釋busy，再background保護重讀，applied且仍same view才重開新事實；failed/deferred不開舊報工表、不假稱全刷新。新modal/preview/state/date/權限/owner變更時不清新undo、不toast舊完成，不保證已送出回報可取消。busy狀態role=status、aria-busy，所有input/action鎖定但Close可用，三語新鍵；Impeccable main/harden/craft-floor本輪全文影響只saving/錯誤/焦點，未重設介面或日週/Gantt/午休灰底。
- 最終新增報工UI12測＋renderModal報工1測（共本輪backend13+UI13），聚焦報工/表單/SDK/請假/備忘 **49/49**成功。真LocalStore＋真reloadFromStore／in-memory localStorage正向開工，execution running/qty0、pin=true，原s/e/qty不變；不是實際瀏覽器或雲端送出。完整本機dot exit0，build **index-EuM1M9BB.js**，CI真log **web719/719、工具46/46**；Tests **38460902377/38460895305**與smoke **38460902445/38460895613**全success。既有chunk警告與本機age限制保留，工具46是CI真age環境，不稱本機age問題已解。
- PR16自己的worktree clean、本地remote6dd一致、只有既有Vite/esbuild，普通merge706f成 **45db614b120fe576ec51cc240a5593b0fa805d56**；原5檔diff保留（對sourcebranch），完整dot exit0/build **index-WeVTLiuW.js**後push。兩套Tests **38461141531/38461137709**與smoke **38461141560/38461137646**全部success。PR16/18仍draft/MERGEABLE，未合main/正式、nightly仍不啟用。
- source同SHA CI全綠後non-force FF既有staging b828→706f，Render deploy skill及deployment-details/post-deploy-checks全文；既有autoDeploy=yes/commit/new_commit，**dep-db792e5bedkc738aiso0**於 **2026-10-13T20:15:10.503Z live706f**。一般root無cache-buster讀到 **index-DOYep9Op.js**；初始化blocks0後真正載入qa-lead **10/14／1廠22段**才驗，不拿初始loading當資料遺失。正式與無變化solver未部署，未改env／服務。
- 真瀏覽器正常報工（未送出）驗收：local本機A01、stage測試R10的原定/尚未開始/實際時間—、start可用quantity/finish禁用，桌面X48／Start64／Close46px皆中心命中；390×844手機X44／Start64／Close46px皆中心命中。直接Close退出，收drawer，stage22段與before ID/label/text/style逐项一致；local18段亦一致、既有單一memo/archive未動。CUA native AX click shadow-root及checkbox語意失敗為adapter差異，DOM是button，用fresh DOM語意正常，不當產品bug。
- **outputs/staging-report-phone-20261014.png**已目視，是「尚未開始」的一般報工表單，**不是saving／執行期換帳號畫面**。全程無cloud Save/report/confirm/准駁/pin/用這套；busy/競爭/重試以實際VM/SDK/PGlite執行證據，不冒稱跨真帳號雲端E2E。stage browser error0，Render app error短觀測 **20:15:10–20:16:19Z**0，不是長期保证。CDP viewportclear，5tabs handoff，local UI已關，Realtime仍明示中斷。
- **下一輪新優先**：真正重現reportExecution null/malformed receipt目前仍return data（0021真RPC返回block/qty/status/revision/version，confirm RPC void不能一概拒null），先SDK＋真PGlite idempotent lost-ACK證據再最小修；確認syncChain失敗／SYNC error基準下報工是否仍適合dispatch；exec-confirm/unconfirm與scenario UI late ACK/read競爭需獨立真函式重現，不能沿用backend結果稱全UI修好。繼續其餘隔離探索。不同真帳號/真排程套用/兩端autosync/offline409/正式VITE_TEST_*發布門檻仍未全過，未知密碼不guess/reset/讀舊SQL/再寄信，正式1023不動。追蹤ACTIVE。

## 2026-10-14 03:54 checkpoint：排程同步／方案套用／個人資料請求身分與儲存中欄位修復

- 起點 **efae5df**乾淨，只有既有esbuild/Vite，沒有其他modifier/deploy；fetch後main仍6b929ca，沒有重做merge/0037/seed/備份。讀本輪最新CONTINUOUS與歷史HANDOFF/總表/NEXT_TASKS/測試模式文件，歷史寄信/0037描述不作新授權。正式1023/setup_pending/Auth角色/個人授權完全未動，無新明文公開artifact/無付費服務。
- **SDK真高風險競爭**：實際Supabase SDK（僅synthetic custom fetch、無外網）updateProfile/applyPlan/sync save_blocks/save_work_log在accessToken等待中換成B，HTTP header真的Bearer B，雖原guard拒絕舊ACK不能算安全。初版fixture一開始pause=true可能被SDK初始化叫到，及空worklog只有id正確被validation擋；改成明確在invoke前pause＋有效code後 **7/7真RED**，沒有把這兩fixture誤差稱產品bug。
- 修復 **e6bcf3743619e74ac38d66f38741efade8bbf5f5**：共用requestOwnerGuard允許原有UnconfirmedWriteError factory；profile保存/方案apply及sync **每條RPC、version preflight、upsert、delete、log_change**以原client及捕捉權杖per-query Authorization執行，query前後原user/client/authEpoch檢核。七版本RPC/UUID receipt/40001 Conflict/不確定結果/重試對帳語意保留，shared SDK headers不改、missing token不dispatch。同owner refresh可接受，但本次仍舊token；下一請求捕捉新token。**開始的原owner请求可能提交／分表sync可能部分完成，不保證取消或跨表rollback；過期token仍錯誤，不轉另一身份**。scenario/execution/access及read paths未全面實測，不泛稱所有API已綁定。
- **11項新真正SDK執行測試**覆盖四入口、同owner換token、missingtoken、preflight换owner不再写、七versioned branches、REST增刪/log、client/logout/epoch、HTTP401/403/409/500及conflict，不接受舊baseline/版本/name。真正PGlite全migrations Store正向/權限/請假/方案/版本/回條lost/網路失敗/復原 **18/18**成功。既有mock RPC只回eager Promise沒有setHeader，改成共用lazy requestQuery adapter（headers no-op、**真HTTP證據是SDK test**），等待RPC entered再改owner；保留原斷言，不silent skip。profile fixture初跑finish尚未建立，及full兩個supabase-store舊wrapper無setHeader為adapter錯誤，修後6/6及18/18，重跑full dot exit0。e6兩套Tests38457168349/38457163491與smoke38457168359/38457164188成功。
- **表單UX實證**：執行真renderModal與兩個真factory（僅unit DOM adapter），memo-edit/leave-request保存中fields仍enabled，2/2 RED。修復 **9f19caf7f65be73015d4c245fda009b2d02a9061**一行在pending鎖input/select/textarea；Save既有disabled，X/Close仍enabled、焦點落可用Close，完成/失敗後一般fields恢復＋submitted值仍在、aria-busy正確。2/2 GREEN及既有memo/leave23/23通過；這不是實際瀏覽器慢網路或真Safari證據。Impeccable main/harden/craft-floor本輪全文，session context已跑不重跑，影響僅欄位saving/錯誤/焦點，未redesign或改Gantt/抽屜/日週/午休加班。
- **回查前輪漏點，不能沿用舊結論**：UI directWriteOwner用store.client，但SupabaseStore真屬性是sb；先改fixture操作sb使leave/client真RED，memo-save亦新增sb case真RED。修復 **b828dfa2f18150f42e44bfcdbefb57bd7df884b5**讓direct helper和memo handler兩階段核對真sb，原13/14類其他變化保留，聚焦23/23 GREEN。前輪fixture錯用client已校正，本輪不是新增加帳號角色或改資料。
- 最終b828兩套Tests **38457814405/38457808650**及smoke **38457814351/38457808674**全部success，真CI log **web692/692＋工具46/46**（以執行log為準，不以手算總和或source檔數冒稱）；本機完整backend dot exit0、最終UI聚焦23/23及build **index-ChQTPsa_.js**成功。既有chunk警告、本機age限制保留；工具46來自CI真age環境，不重做正式備份/restore。
- PR16從2a46db0乾淨/remote一致、僅既有Vite/esbuild無modifier，普通merge9f為 **1ada7ec14951be0e84840f924f1c69652a1de2fa**，完整dot/build **index-CdCcGVvN.js**後push，其兩套Tests38458029280/38458019963＋smoke38458029262/38458019914全success。再核乾淨普通merge b828為 **6dd8233f68383a28bd797461d52f2368d1573ff2**，保留原5檔diff；完整dot exit0/build **index-aweP8YhE.js**後push，Tests38458279452/38458274722在途，smoke38458279691/38458274729success待最終確認。PR16/18仍draft，不合main/正式，夜備份不啟用。
- 同b828全CI綠後non-force FF staging **6e902d3→b828dfa**；Render deploy skill與required references全文，既有auto new_commit **dep-db78nqks728c73crr14g**於 **19:52:34Z liveb828**，一般root browser已抓新 **index-Cj_3JQMk.js**、初始化DOM0後需等正常讀取再驗，不拿deploy成功代替功能。正式／無變化solver未部署，無新env／資源。staging寫入仍禁止Save/准駁/pin/用這套，角色跨真帳號/真排程套用/兩端autosync/offline409/正式VITE_TEST_*門檻未全過，Realtime中斷不假稱修好。
- 本機真一般memo form：填QA取消文案、一般fields enabled、X/Cancel/Save48px中心命中、aria-busy false→Esc；既有唯一合成QA memo仍原pinned true，無新增memo。此僅正常/取消UI覆核，pending鎖定以真render runtime測試，不聲稱browser在途保存覆核。stage/local各5 tabs繼續hand off，臨時viewport後續覆核需clear；不guess/reset帳號或讀SQL密碼。
- 下一輪按最終覆核優先，不重做e6/9f/b828；續查scenario保存／現場報工／權限RPC的實際SDK token-binding及profile空ACK校驗。memo UTC無時區標示候選仍在，必須先locale/timezone/invalid值合成重現且不可修改createdAt。持久worktree保留，10分鐘追蹤ACTIVE；當前修好不是整體release放行。
- **03:57最終覆核（取代本節在途狀態）**：staging liveb828／index-Cj_3JQMk.js初始化後真qa-lead **10/14／1廠22段**。1440桌面memo一般fields enabled、X/Cancel/Save48px中心命中、busy false；填特殊字元QA文案→Esc，既有輪59 memo仍1筆。390手機同流程fields enabled、三按鈕44px中心命中；取消仍1筆，另新增詢問QA填寫→Esc，pending仍空；收drawer後22段ID/label/text/style逐項與before相同。沒有Save/准駁/pin/用這套/個人資料保存或任何雲端寫入，不能拿此取消走查冒稱SDK換帳號雲端寫入E2E或browser saving鎖定覆核。
- **outputs/staging-bound-form-phone-20261014.png**已目視，圖是未儲存QA表單的正常編輯／取消驗收，**不是saving畫面**；busy鎖定證據是兩個實際renderModal unit，不作照片偷換。stage本次browser error0、Render app error短觀測 **19:52:34Z–19:56:04Z**0，非长期保证；UI仍明示Realtime中斷。local18段與before逐項相同、既有單一QA memo/archive保留；兩tab viewport皆clear，5tabs handoff保留。
- PR16 **6dd8233**兩套Tests38458279452/38458274722與smoke38458279691/38458274729全部success、draft/MERGEABLE；sourceb828 staging branch第三套Tests **38458264880**／smoke **38458264928**也成功。正式0037/1023/setup_pending仍未動，不合main/正式、不重啟nightly。後續以本節已完成部署為真值，不重做前版本CI或重新seed；追蹤ACTIVE。

## 2026-10-14 03:33 checkpoint：請假詢問／准駁／備忘釘選舊回應與手機熱區修復

- 起點 **bcaa751**乾淨、只有既有Vite/esbuild；讀最新交接與本文件真值，正式0037/seed/備份不重做，未改正式1023/setup_pending/Auth角色/個人授權。普通merge origin/main **6b929ca**成 **dcfe26a**；people drawer同一return行衝突合併保留既有筆刷saving/error與新缺席人數翻譯，保留另一agent的全部翻譯/測試/紀錄，不切共享checkout、不reset/force push。
- 真實編譯執行原leave-request-save／resolveLeaveRequest／toggleMemoPin：pending後開新modal，舊ACK關新草稿／reload／強制people或notes／toast；新render的按鈕連點送两次；old error跑入新context，protected reread失敗仍宣告全成功。最初新增8測確定RED；其中真LocalStore正向fixture誤用已有pending同人同日，正確被業務拒絕，已改不同日及employee.leaves，不把該fixture錯誤當產品缺陷。其餘7測是實際舊handler錯誤，未寫雲端或送LINE重現。
- 修復 **6e902d3cd8fa6f59cfdaddabcba92c8373bb6910**：captured Store/client/user/authEpoch/state ref+JSON/date/factory/page/drawer/focus/modal/PV/permission兩階段守門；共享UI.directSaving阻止重複及memo/brush重疊。舊ACK/error不關窗、不拉回drawer、不報舊成功；ACK後先釋本次busy，再protected background reread，failed/deferred誠實說已保存但尚未讀到最新。直接請求關窗後仍擋remote/beforeunload，清busy只動request controls/spinner、不重繪新草稿。新增詢問捕捉送出的draft、錯誤inline保留、aria-busy/disabled/loading/Close文案三語；LINE僅當原操作仍擁有UI時才以捕捉的URL/token送，測試只stub無真通知。**關窗不是HTTP取消或交易撤銷；准假仍只有approved才正式休假，本輪沒有自動重排或雲端請假/備忘写入**。
- 新增 **12 leave-pin測（11真正handler/renderer/LocalStore + 1 CSS契約）＋1 remote runtime**，包括三條入口各14類晚ACK變化、late error、double-click、新UI於reread中、failed/deferred、draft/escaped alert/busy renderer、只清DOMcontrols不重繪、permission/memo/brush拒絕、真LocalStore新增pending/approve/pin及班表不變。CSS契約不冒充瀏覽器熱區實測。舊people-render測單独載入函式缺新directWriteStatus helper導致ReferenceError，已讓fixture載入**真helper**（非stub），11/11過，不放寬原斷言；首套full因此1fail後重跑全dot exit0，最終聚焦73/73含三語棘輪成功。同source兩套Tests **38455216053/38455204346**與smoke **38455215989/38455204386**全部success，CI真log **web678/678、工具46/46**（新增13自身測＋main新測整合）；本機缺age限制未假稱解除。最終build **index-BTC_7LGr.js**，既有chunk警告保留。
- 手機390×844真local pin鈕原34.35px、中心命中；修CSS44px／author留38px，實測44.46px與中心命中。使用**既有唯一合成QA memo**取消釘選→再釘選→reload，仍唯一同卡、釘選true；沒有新增memo/archive、不刪/reset。手機與桌面18段ID/label/text/style前後與reload一致；新增詢問填QA說明→Esc取消、pending仍空，X/Cancel/Submit44px中心命中、aria-busy false。雲端無Save/准駁/pin/用這套；browser在途/race/不同user尚非E2E，用真handler/Store回歸證據覆核，不稱真Safari。
- 證據 **outputs/local-pin-phone-20261014.png**已目視，標示合成非正式memo；首取圖時HMR/merge重載已收drawer，DOM cards0沒有被當作資料丟失，fresh開memo取得正確一張卡再取圖。viewport已clear，本機memo保持原pinned true，5 tabs持續handoff。已觀察UTC時間無時區標示候選仍未修，優先順序保持安全競爭/同步門檻，不能改createdAt資料。
- Impeccable main/harden/craft-floor本輪全文、session context不重跑，指引影響loading/錯誤/取消真實語意及44px熱區，未改Gantt/抽屜/主題/手動日週/午休加班設計。Render deploy與deployment/post-checks全文；同source全CI綠後non-force FF既有staging **361fdbb→6e902d3**，new_commit deploy **dep-db78egqvcj2c73dpi9q0**此刻build_in_progress，不冒稱live，待同SHA/root bundle/實際新UI與短錯誤紀錄覆核。正式與無變化solver不部署，無新資源/env/費用。
- PR16起點a6fb3e0乾淨/remote一致、僅Vite/esbuild無modifier，普通merge6e成 **2a46db02343fcc6d1a7e49668c3ab354330dee08**，原5檔差異保留；完整dot exit0/build **index-CdijOhra.js**後push，Tests **38455482864/38455474666**及smoke **38455482895/38455474716**待查（當時smoke全success、Tests在途）。PR16/18仍draft，不合main/正式；跨真帳號角色、真排程套用、兩端同步、離線409、正式VITE_TEST_*發布門檻未全過，Realtime平台中斷未冒称解决。nightly仍等加密main安全發布，既有舊明文檔不刪。寄信舊狀態不重問／重寄／猜密碼。
- 下一輪核本輪最終部署與PR CI更新為準，不重做已綠的修復/0037/seed。繼續查profile/sync/applyPlan其他SDK token-binding、memo日期顯示的合成locale/timezone真覆核、在途欄位可編輯後的draft語意（本輪未作真延遲瀏覽器測試）。不以連線徽章或CI綠當完整release驗收；持久worktree/環境保留，10分鐘追蹤ACTIVE，不自行停用。
- **03:35最終覆核（取代本節在途狀態）**：staging dep-db78egqvcj2c73dpi9q0於 **19:32:42Z live6e902d3**，一般root真browser **index-D1rApFE8.js**，未用release query／重複部署。初始化DOM0後完成讀取為 **10/14／1廠22段**，不是空班表或重新匯入。真qa-lead手機新增詢問填QA文字→Cancel，原pending仍空，X/Cancel/Submit44px center hit、aria-busy false；notes原有1筆輪59同步測試，手機及1440桌面pin44.46px中心命中，**沒有按pin／送詢問／准駁**。收drawer後22段ID/label/text/style逐項與本輪before相同。
- 真390手機「查看排班」正常捲到tst01，實際可見8個既有測試方塊（tst01/tst02）；**outputs/staging-direct-release-phone-20261014.png**已目視，含原測試R10/A02/A06/M20與時間軸，圖為10/14，不稱所有日期都有排班。scroll只改畫面、沒有拖曳套用/重新seed。stage/local viewport已clear，browser此次error log0，Render app error短觀測 **19:32:42Z–19:35:04Z**0，非長期或Realtime恢复保证；UI仍明确即時更新中斷。PR16 **2a46db0**兩套Tests38455482864/38455474666＋兩套smoke38455482895/38455474716全部success、draft/MERGEABLE；source6e staging branch Tests **38455628292**／smoke **38455628291**亦成功。不把draft可合併當正式發布門檻。

## 2026-10-14 03:08 checkpoint：備忘／請假直接請求身分綁定與備忘舊ACK覆蓋新草稿已修

- 起點 **6c54b39**乾淨，僅既有esbuild/Vite，沒有重疊modifier/deploy；普通merge最新main **799a55b**為 **1f60bab**，只納入另一agent輪123文件。讀最新handoff/總表/NEXT_TASKS/測試模式文件；不把歷史0037/seed/寄信記錄當新授權，不重做。正式1023/setup_pending/Auth角色/個人授權完全未動。
- SDK真缺陷 **8cbdbd2ad142308019682a85a1128a2cd5349430**：createLeaveRequest、resolveLeaveRequest、saveMemo在token取得中換帳號，實際SDK custom fetch看到Bearer B；舊程式亦沒有拒絕舊owner ACK。新增7項真正SDK執行期測試先 **6fail/1pass**，涵蓋三入口、client/logout/epoch變更、same-owner刷新與下一次新token、missing token、401/403/500不假成功。全部合成/in-memory transport，無任何對外HTTP/真帳號或資料。
- 把archive guard抽成共用requestOwnerGuard（legacyOwnerGuard仍alias），三個已證入口捕捉原client/user/epoch/token、query header binding與await後owner檢核；缺token fail closed，shared client headers不改、非owner不ACK，API錯誤保持。**開始的請求可能以原帳號完成，不聲稱取消或登出撤銷**；其他API尚未全面實證，不泛稱所有雲端操作安全。FakeSupabase既有rpc/upsert是eager Promise，新增setHeader遇TypeError是adapter契約缺口，不是production錯誤；改成lazy thenable讓guard在SQL執行前可設定，setHeader仍no-op、HTTP真證據来自SDK test，不用fake冒充。聚焦25/25含真PGlite權限/請假/備忘/快照/版本測試，本機全dot/build **index-BcqIp3e5.js**成功；同8cb兩套Tests **38450366862/38450359993**、smoke **38450367360/38450360116**success，frontend真log **653/653**、工具 **46/46**。
- 本輪又實際編譯執行memo-save發現UI真Major：存檔pending→開另一order-edit草稿→舊ACK執行close/reload/render/toast，關掉新草稿。ignored合成repro **outputs/repro-memo-modal-20261014.mjs**原版輸出closedNewDraft true；沒有真API/資料。新增六測初版double-submit直接await第二個pending導致5cancelled，修fixture在finally resolve兩job後 **6/6確定RED**，不把cancellation冒稱产品缺陷。
- UI修復 **361fdbb85d2aecc045558258b9430c7ff9431005**：same-modal/store/user/epoch/date/factory/PV/S引用+JSON/permission兩階段檢核，舊ACK/error不關新窗/重排/報成功；m.saving+UI.memoSaving防連點與關窗後background讀競爭/beforeunload。capture draft、stable memo ID與createdAt使失敗重試只同一logical memo；API ACK後釋本次busy、close自己的modal，再用protected background reread；reread新modal/PV/owner/view出現則不搶畫面，failed/deferred誠實說已存但尚未讀到最新。**不承諾DB原子取消／memo跨帳號版本鎖或rollback**。儲存中Close語意/role status/aria-busy/disabled、escaped error/欄位保留補三語，維持Gantt/抽屜/日週/午休加班既有設計。
- **10項新增真正UI handler/renderer/LocalStore/remote runtime回歸**：11類晚ACK失效、double-click、失敗+stable retry、晚error、reread5類新context、failed/deferred、真rendererstatus/draft values/escaped alert、真LocalStore保存+真protected reload一memo/班表不動、真LocalStore quota failure/retry、關memo後pending寫入仍擋remote read直到釋放。聚焦24/24（含舊remote）；full本機dot exit0＋build **index-CR9KEl2Y.js**，chunk警告保留。361同SHA Tests **38451956893**與smoke **38451956850**全success，frontend真log **663/663**、工具46/46、database/solver success。另staging branch push的CI待核，不拿前版653冒稱663。
- 真localhost5202／390×844：備忘→新增→填QA text/機台a/釘選→取消仍無memo；X/Cancel/Save44px中心可點。首次精確label「釘選」沒match，fresh DOM確認actual name含說明，改role checkbox完整name後成功，非產品checkbox失效。再同填寫→**僅本機**Save→toast已保存/一張黃色釘選卡；18段ID/label/text/style不變。收drawer→reload→重開備忘仍一張同QA卡，保留**單一合成本機memo**（文案明示僅驗收、非正式工作）；不刪任何材料，不重置seed。**outputs/local-memo-save-phone-20261014.png**已目視；沒有browser in-flight/失敗/換帳號寫入E2E，這些以真handler/Store回歸覆核。正式與隔離Supabase本輪沒有任何memo/leave/排程寫入。
- Impeccable main/harden/craft-floor本輪全文，context沿用已跑session不重跑；技能影響state/cancel/錯誤語意與手機熱區檢查，無redesign。Render deploy/references全文，等合併361全CI綠才non-force FF existing staging **3b0da87→361fdbb**；auto new_commit **dep-db7839qjnfac73cvea00**目前build_in_progress（不冒稱live），不建付費服務/env/正式或無變化solver部署。
- PR16從cb28c42乾淨/remote一致普通merge8cb為 **3ad328417ecdaa488de4e402c76b1525160475de**，本機dot/build **index-DOEqjU8G.js**成功後push，Tests **38450698229**及smoke **38450698262**success。再乾淨/remote一致merge361為 **a6fb3e0c80a95c3407d3772144a2f21880643643**，保留原5檔差異，本機test/build進行中/尚未push，需核最新結果。PR16/18仍draft，全發布門檻未過不合main/正式部署；nightly仍等加密main安全發布，正式0037已完成不再套用。接續stage僅備忘開/填/取消，不Save、不新增或准駁詢問，不宣稱兩端同步；仍無第二真帳號/Realtimes證據。
- 下一輪先以本輪最終覆核為準，不重做已完成SDK/備忘修復；續查leave-request-save/toggleMemoPin的晚ACK畫面競爭、以及其他RPC/sync/applyPlan/profile的實際SDK token-binding，先獨立可執行重現再修。所有臨時viewport/network需恢復，持久worktree/5 tabs繼續hand off，追蹤ACTIVE。
- **03:14最終部署/PR覆核（取代上方在途狀態）**：staging dep-db7839qjnfac73cvea00於 **19:08:47Z live361fdbb**，一般root真browser **index-DxdC6ckN.js**；無release query/cache workaround。source361第二套Tests **38452447789**及smoke **38452447838**也completed/success。PR16 a6fb3e0本機dot exit0/build **index-lIycy3UQ.js**後已push，其Tests **38452719725**/smoke **38452719526**全部success，原5檔差異保留；PR16/18仍draft，不合正式。
- 真qa-lead staging手機390×844：初始化blocks0後10/14／1廠22段完整；備忘抽屜原有**1筆輪59同步測試**，不是本輪新增。新增modal填「QA-取消驗收：不儲存至雲端」/指定tst01→Cancel：原1筆不變、無新QA備忘。X/Cancel/Save44px中心命中，aria-busy false；未按Save或任何詢問/准駁。收drawer/clear viewport後22段ID/label/text/style與本輪前逐項相同，最後date回10/15。No formal or isolated Supabase writes、沒有新增Auth/角色/個人授權。Render app error觀測 **19:08:47Z–19:13:18Z**0，browser本次error0，非長期保證/真跨帳號寫入/真Safari。
- 本輪共**17項新增真正執行期/SDK/SQL/renderer回歸**（7 direct SDK + 9 memo-save + 1 remote），不是17個真雲端E2E；663是來源CI總數，工具46來自CI真age環境，本機缺age既有6項工具限制未偽裝消除。正式0037/seed/backup不重做、nightly未開、release gate持續未過。兩個source修復都在staging，同SHA確認；不把前版驗收當新版。
- 新UX候選需下輪補純執行測試：本機QA memo於UTC19:06存入（台北03:06），卡片顯示`2026-10-13 19:06`未標UTC（截圖可見），renderer直接slice ISO而非使用者時區。僅影響時間顯示，不能改既有createdAt資料；先對locale/timezone/datetime無效值真重現再最小修正。更高安全優先仍為其他RPC/畫面晚ACK，各入口獨立驗，不泛称所有同步安全。stage/local viewport已clear、沒有臨時network阻擋；5 tabs handoff與持久worktree保留，10分鐘追蹤ACTIVE。

## 2026-10-14 02:44 checkpoint：實際SDK歷史檔請求權杖切換競爭已修，完整驗收／CI接續中

- 起點 **c9df14e**乾淨，只有既有esbuild/Vite，没有重疊modifier/deploy；讀最新handoff/總表/NEXT_TASKS/測試模式文件，歷史狀態不作新增授權。普通merge **origin/main63e6439**為 **cc9f095**，保留另一agent360px top-status/page-links換行與CSS棘輪，亦保留前輪抽屜/FAB修正，沒有切共享checkout、force push或改正式1023/setup_pending/Auth/權限。
- 真缺陷：使用**實際安裝Supabase SDK**、僅custom fetch transport回合成Response，saveLegacyArchive lookup返回空→POST等待SDK accessToken→session改B/epoch++→SDK回tokenB；舊程式POST真的組出Bearer B，雖之後assertOwner拒絕ACK，不能把拒絕舊UI當成請求安全。RED1/1正確顯示預期A／實際B。無任何對外HTTP或真帳號/資料，所有token/url/row是synthetic。
- 修復 **3b0da8792f939160b5197b145ce7aea7e6b94991**：legacyOwnerGuard捕捉原user/client/authEpoch/**access_token**，authorize每條archive builder的per-query Authorization，包含list/payload/查重/insert/23505補讀；缺owner/token fail closed。SDK後續仍await其mutable token，但不能替換已指定query header；不改shared client default headers。原owner guard保留，另帳號回應不展示、過期token仍錯誤而非偷偷轉新帳號。**已建請求可能繼續以原帳號送出，這不是取消／登出撤銷的保證**；修復限archive，不宣稱其他Store寫入/SDK競爭已通過。
- **5項新增真正SDK+Store執行期測試**：POST/token acquisition切帳號、list/payload read同競爭、23505 recovery GET同競爭、同owner刷新使本次headers固定而下一次Store/direct SDK用fresh token（shared default未污染）、缺token三方法不dispatch及expired401不假成功。不使用source字串斷言。PGlite與舊API边界fixtures增加setHeader介面/合成token；FakeSupabase此setter只是adapter no-op，不能拿它聲稱HTTPheaders驗證，header真證據全部是SDK+fetch tests。5/5及舊legacy聚焦25/25，本機全web dot exit0＋build **index-Dr2xyUtu.js**，大chunk警告保留。新CI **Tests38448870976/38448862146、smoke38448871344/38448862076**待最終核對（02:44 frontend/database success，solver在途），不拿工具/HTTP200當功能通過。
- 本機browser 360×780既有合成資料：documentWidth/topWidth等於360，沒有水平溢出；More→歷史班表讀出同synthetic archive兩格，七控制44px且中心命中，Escape/收More后18段ID/label/text/style與原array逐項相同；viewport clear。沒有保存/匯入新資料，不把LocalStore入口測試當成SDK/雲端寫入驗收。Impeccable main/harden/craft-floor本輪全文，context沿用已執行session不重跑，技能只影響檢查responsive/狀態一致性，未新增UI樣式；保留Gantt/抽屜/日週/午休加班。
- PR16自己worktree4f5a53b乾淨/remote一致、僅既有Vite/esbuild，普通merge為 **cb28c42d76a7c18391055fb71fa20c752433086a**，保留原5檔差異；本機完整dot exit0＋build **index-DzLVSSJo.js**後push，最新CI待核。Render deploy/references本輪已讀，待3b同SHA CI全部通過才更新既有staging，無新付費資源/服務/env/正式部署/solver重複部署。0037與seed不重做，nightly仍等加密main安全发布；寄設定信已授权且提交过，不重寄/猜密碼/讀舊SQL。
- 後續最高優先：其他SupabaseStore方法的SDK延遲token取得與寫入/讀取owner binding需各自真重現（目前只archive5項SDK過，不泛稱所有API安全）；stage新版歷史唯讀GET拒絕/重試要實際browser驗，不新增cloud archive。不放寬PR16/18跨帳號角色/真套用/兩端自動同步/offline409/正式VITE_TEST_*門檻。追蹤ACTIVE。
- **02:49最終CI覆核**：3b0da87兩套Tests **38448870976/38448862146**、兩套smoke **38448871344/38448862076**全completed/success，frontend真log **646/646**、工具 **46/46**，database/solver全success，取代02:44在途狀態。本機工具age缺執行檔是前輪已知限制，未偽稱本輪本機工具46綠。PR16 cb28c42兩套Tests **38449189357/38449180703**、smoke **38449189443/38449180677**也全success；PR16/18仍draft，不合main/部署正式。最新main **799a55b**僅另一agent輪123文件，3b source已包含最新63e6439 CSS，無需因文件重部署。
- CI綠後non-force FF既有staging **79384c1→3b0da87**；new_commit自動deploy **dep-db77ol142hec738rsm30**於 **18:46:08Z live**，一般root真browser **index-z4sCWggn.js**，不需release參數。qa-lead初始化blocks0後完整載入10/14／1廠22段；真新版legacy list GET成功顯示尚未存入，不是用本機/mock冒稱實際權杖可用。
- **失敗／重試真browser E2E**：僅tab20臨時CDP阻擋`*legacy_schedule_archives*`，其他API/帳號/正式環境不變。正常關窗後重開history先loading，完成後alert「讀取歷史排程失敗：TypeError: Failed to fetch」，提供關閉/重試；沒有空list偽成功。360×780全頁documentWidth360，三控制44px中心命中。截圖 **outputs/staging-history-read-failure-20261014.png**已目視，此是刻意網路失敗驗收，非正式庫事故；錯誤文案含技術字串可列下輪UX minor，未在本輪臨時加泛化提示。
- 已在finally撤銷blocked URLs並Network.disable，按**重試讀取**真GET恢復「尚未存入舊版排程」；Escape/收More/clear viewport後22段ID/label/text/style與本輪reread前逐項相同，最後日期回10/15。沒有上傳、保存、套用、寫leave、送聊天查詢或改Auth/授權；正式1023與測試排程都未寫。Render app error短觀測 **18:46:08Z–18:46:57Z**0，本次browser捕獲error0/unhandled0（工具沒有提供被阻擋網路錯誤log，不以此否認已見alert），非長期保證/真跨帳號/真Safari。stage/local viewport皆clear，20/24/25/21/23 handoff保留。持久worktree繼續使用；下一輪優先其他Store的同SDK競爭/歷史network UX文案，不重做已通過3b部署、646 CI、seed或0037；10分鐘追蹤ACTIVE。

## 2026-10-14 02:27 checkpoint：歷史檔並發存入與手機日曆遮擋已修，等待同SHA發布覆核

- 起點 **658c176**乾淨，僅既有esbuild/Vite，沒有其他modifier/deploy。普通merge最新main **791e2df**為 **77aefd8**，保留另一agent產能分析orderStatus及setUrlView query修正、三語和3項棘輪。歷史HANDOFF/NEXT_TASKS仍有已完成0037或寄信未授權等舊狀態，本輪依最新checkpoint；NEXT_TASKS实际路徑docs/agent/NEXT_TASKS.md，錯用根目錄讀取失敗後已改讀，不當成專案缺檔。
- 真缺陷 **e78bcc7d1a9a12073c5f33fe1736c45adc73193a**：兩個實際SupabaseStore在同一合成PostgreSQL DB先查重都空，第一insert成功、第二真23505後對外報存入失敗。沒有重複row或班表損壞，但第二端不收斂到同一存檔。僅23505時按同SHA补讀一次；須有valid id、matching source_sha256且無讀錯才能回existing ACK，不upsert、不覆蓋payload、不重insert，不隱藏其他權限／check／API錯誤，read前後沿用owner guard。
- **7項新增執行期回歸**：1個真migrations/PGlite SQL＋兩Store的查重barrier與unique碰撞（單連線role scope串行，並非真正多連線隔離級別認證），其餘真Store+可控API邊界覆盖bounded recovery、missing/error/invalid/wrong SHA不假成功、非unique不補讀、insert后與补读中owner变化、same-owner token刷新。先RED5/7，後GREEN7/7；初版PGlite `_run`回array不是maybeSingle轉換後null，及过晚掛reject handler兩項fixture問題已修，再重跑5個確定失敗斷言，沒有把fixture問題當產品錯誤。補讀失敗保留錯誤，不聲稱離線重試或跨帳號同步已過。真DB只存在memory、全after snapshot等於before；雲端archive和正式1023無寫入。
- e78本機完整web dot exit0＋build **index-jphuDXto.js**；同SHA兩套Tests **38445672360／38445666781**及smoke **38445672132／38445666736**success，frontend真log **637/637**、工具 **46/46**，database/solver成功。本機工具初跑6項age round-trip因age-keygen未在PATH／未找到exe失敗（其餘40pass），不silent skip、不改工具或假裝本機46綠；CI安裝真age後46全綠是本輪證據，未重做正式備份/還原/0037，nightly仍停用直到加密main安全合併。
- 續查手機真Major **79384c14314dc50a7263eea10bc4b3e7e1595c98**：390×844人抽屜24/25按鈕center的elementFromPoint命中chat-launch；放大與整月設定34px，人員切換42px。不是drawer body裁切或圓角邊緣假象（另一些不可見footer被nav擋只是scroll clipping，本輪未誤列）。mobile bottom-sheet既有680px breakpoint新增閉合chat隨抽屜隱藏，已開啟對話保留，close sheet後launcher恢復；三類compact controls min44px。chat hide在launcher無clientrect時focus回現存drawer，visible desktop launcher仍focus launcher；不把焦點送到display:none。
- 新增2個真focus helper runtime tests＋1個CSS contract（**結構斷言不代替真CSS命中驗收**）；聚焦52/52。CSS contract初版誤寫800px（實際sheet680px），修正fixture期望，非產品新斷點變更。最終本機全web dot exit0＋build **index-CaBUq7UF.js**，沒有不相干dependency變動，大chunk警告保留。同SHA兩套Tests **38446413955／38446405092**與smoke **38446413987／38446405073**需查最終結果，02:27 frontend/database success、solver在途。
- localhost真UI：worklog→URL保留`?local=1&view=worklog`→reload仍工作紀錄、本機→返回今天`?local=1`及18色塊；這是main導頁修正的執行覆核，沒有用source棘輪冒稱E2E。手機人抽屜修後24/25 center true，七個compact controls44px；close sheet後launcher visible正常可開，開chat後再開人不隱藏對話，textbox Escape後activeElement為ops-drawer且閉合chat display none。先對非focusable region press超時，fresh DOM核實chat仍visible再改可focus textbox，不盲重試／不稱keyboard產品故障。**outputs/local-drawer-calendar-hit-20261014.png**已目視。clear viewport後桌面drawer中launcher仍visible，18段ID/label/text/style與原合成班表逐項相同，最後人抽屜收回。未選日期筆刷／准駁／雲端存入／用這套，沒有Auth角色或正式資料變更；僅Chromium模擬尺寸，非真機Safari。
- Impeccable main/harden/craft-floor本輪全文，沿用已跑session context不重跑；技能影響僅狀態一致性、手機hit-area/焦點與閉合launcher避讓，維持Gantt/抽屜/主題/日週及午休加班樣式。Render deploy與references全文，等待同SHA全CI綠才FF現有staging，不建新服務/不改env/不部署正式或無變化solver。
- PR16原95cea乾淨／remote一致、普通merge e78為 **0bed902**（完整本機dot/build綠、已推）；再普通merge793為 **4f5a53b9948e52279784b03636105e01afcb55a8**，保留原5檔差異，本機build **index-AbJd_45A.js**及最終dot exit0、已推。02:28最新查證其Tests **38446615651／38446609595**與smoke **38446615830／38446609591**全completed/success。PR16/18都draft/MERGEABLE，仍缺跨帳號角色/真套用/自動兩端同步/offline409/正式VITE_TEST_*，不因mergeable就放行正式。追蹤ACTIVE。
- 02:28最終同793 SHA兩套Tests及smoke全部completed/success，frontend真log **640/640**、工具 **46/46**，database/solver成功，取代02:27在途狀態。non-force FF既有staging **6df0a99→79384c1**，new_commit自動deploy **dep-db77g7cs728c73cpoch0**，此刻build_in_progress；**不冒稱已live或實際新版驗收**，完成後另補結果，不手動重複deploy/清cache。正式服務和無變化solver未部署。
- **02:31部署覆核完成（取代上述在途狀態）**：staging dep-db77g7cs728c73cpoch0於 **18:28:06Z live79384c1**，一般root瀏覽器 **index-DSOXFXvC.js**，不用版本query。初始化blocks0後fresh DOM為22段／10/14／1廠，不稱班表消失。qa-lead 390×844真人抽屜closed-chat display none，compact controls≥44px；初讀24/25 hit false是17人名冊讓日曆在body可視區外，fresh position確認後正常Tab從24移25、自動捲body262px，兩日中心皆hit true。沒有按筆刷或日期、不寫leave。**outputs/staging-drawer-calendar-hit-20261014.png**已目視，含25焦點框與完整可操作下半日曆；非只source斷言。
- 真staging close sheet→launcher恢復可開→開對話再開人仍visible→textbox Escape回ops-drawer且closed launcher隱藏；收人後22段ID/label/text/style逐項等於上一輪同日，最後日期回10/15，clear viewport。沒有送聊天問題／匯入／套用／准駁／新增詢問，正式與test排程皆未寫。Render app error觀測 **18:28:06Z–18:29:39Z**為0，本輪browser error0，非長期保證；不把這項UI驗收說成雲端並發存檔或真Safari驗收。
- **下一輪**：不重做793部署／640 CI／0037，核對最新Git及其他modifier後續查SDK在await存取權杖時的owner競爭（現有Store guard不等同SDK HTTP實際token綁定已驗）、手機橫向/長名冊下抽屜可操作範圍與未儲存preview的焦點、無網路時archive retry語意。先實際重現再修；不要為並發測試匯入雲端歷史檔，不碰1023。PR16/18仍draft，全門檻未過不合正式；環境20/24/25/21/23 handoff保留，臨時viewport已clear，持久worktree繼續使用。10分鐘追蹤ACTIVE，不因兩個缺陷修完而結案。

## 2026-10-14 02:10 checkpoint：歷史檔案跨視窗／帳號競爭已修，測試站新版與手機色塊已覆核

- 起點 **2a3f092**乾淨，僅既有Vite/esbuild；普通merge origin/main **83d1f7c**成 **81bc7f4**，保留另一agent排程比對翻譯與測試。不重做備份、0037、seed或正式核對；正式1023／setup_pending／Auth角色與授權未動。一般staging root本輪已是前輪f151408新bundle，舊快取門檻解除，不重複部署前版。
- 修復 **6df0a999be03ade342a4dee073bd4467351e9f2c**：legacy-save、openLegacyHistory以同modal物件、store、user、authEpoch和權限守門，關閉／新modal／換帳號後舊回應不得重開history或toast成功。來源選擇使用每次request token，逆序回應／舊錯誤不能蓋掉最新來源。missing payload報讀取錯誤；null save ACK不能當存入成功；失敗保留可重試狀態，retry保持指定來源。loading aria-busy、escaped alert、儲存中disabled與關閉文案補三語；**关闭不會取消已送出的存檔**，沒有承諾HTTP取消或交易回滾。
- 真SupabaseStore另抓到lookup完成後owner改變仍可能接續insert：捕捉原client/user/authEpoch，lookup後且insert前檢核，所有read/write await後核對原owner。已提交insert的舊回應只拒絕ACK、不假称撤銷資料；沒有新增schema/RLS、改帳號或雲端archive寫入。
- **17項新增真正handler／renderer／LocalStore／SupabaseStore回歸**，涵蓋晚回應六類owner變更、double click、null ACK、list→payload兩段競爭、同modal來源逆序／舊error、current failure、missing payload、owner切換不接續insert／不接受read或write ACK、同owner token刷新及已有檔案查重、真LocalStore dedup/payload、index quota回滾不留orphan、retry來源、busy/error renderer。RED初版前3fail、第四個舊版意外payload await造成後續cancelled，修fixture正確resolve後8/8真RED，不拿cancelled冒稱產品失敗；後加renderer測試缺legacy.days的fixture修好再17/17，未放寬斷言。完整本機dot exit0＋build **index-D8gx_DUo.js**，既有chunk warning保留。
- 同SHA兩套Tests **38443425344／38443418116**及smoke **38443425334／38443418032**全部success，frontend真log **627/627**、工具 **46/46**，database/solver成功。PR16原5ebbf7c乾淨／remote一致，普通merge為 **95cea8e9cf8387af1cac9d999092c35fcb05e048**，保留原5檔差異；完整本機dot exit0＋build **index-B8Gk7-3a.js**並push。其Tests **38444308213／38444300133**仍需查最終solver結果（02:10 database/frontend success、solver in_progress）；兩套smoke **38444308343／38444300157**成功，不先冒稱PR16全CI綠。
- localhost5202合成檔 **outputs/synthetic-legacy-qa.xlsx**（1廠B3合成驗收機台／120件，2廠B5合成驗收工位／60件，10/14）：正常filechooser→舊版唯讀預覽→存入→歷史查看→2廠篩選；18段當日班表ID/label/text/style逐項相同。再次同檔存入沒有來源dropdown（只1檔）；關閉／收More／reload／重新More→歷史班表仍讀到兩格，18段再次逐項相同。保留**單一合成本機archive**供後續，不注入File、PointerEvent、localStorage或app state；未匯入原1023／未向staging存archive。手機390×844七個控制44px中心命中、aria-busy false；**outputs/local-legacy-history-phone-20261014.png**已目視。未真正瀏覽器切帳號／在途關閉／quota／reverse API E2E，這些以真函式與Store測試覆核；非真機Safari。
- CI綠後non-force FF既有staging **f151408→6df0a99**，new_commit自動deploy **dep-db777btbedkc7387gdsg**於 **18:09:12Z live**。普通root真瀏覽器新bundle **index-Cyjl3cLV.js**，無需release參數；初始化讀blocks0後fresh DOM有22段（10/14），不是資料消失。qa-lead真歷史入口完成雲端讀取後顯示「尚未存入舊版排程」，Escape回原班表，22段ID/label/text/style逐項相同；未按選擇Excel／存入／套用。手機切 **10/15／1廠**20段，按「查看排班」在viewport看到tst01／測試M20兩塊08:00–12:00、13:00–14:50；**outputs/staging-legacy-release-phone-20261014.png**已目視。此為同qa-lead讀取，不是不同帳號同步或真拖曳套用驗收。Realtime仍明確中斷。
- Render app error短觀測 **18:09:12Z–18:09:46Z**為0，browser本次error0，非長期保證。solver source未變不部署，正式服務未部署。PR16/18仍draft，跨帳號／角色／真套用／自動兩端同步／offline409／正式VITE_TEST_*未全過；nightly仍等加密版本安全進main。先前寄設定信已授權並提交，不重寄、不猜密碼。Impeccable harden/craft-floor及Render deploy/references本輪已讀，僅影響錯誤、loading、取消語意；保留Gantt／抽屜／手動日週／主題／午休加班既有設計。
- 02:12最終覆核：PR16 95cea兩套Tests **38444308213／38444300133**及兩套smoke **38444308343／38444300157**均completed/success，取代上述02:10在途狀態；仍不等同發布門檻已過。下一輪不重做已完成驗收；持續探索legacy查重lookup→insert的跨分頁unique競爭（目前只同本機重複存入已過，並發衝突**未重現／未修**）、真正同owner Auth token刷新與在途來源切換E2E，以及手机FAB完整熱區遮擋。任何新缺陷先可執行重現再修，禁止用source掃描當功能驗收；持久worktree與20/24/25/21/23 handoff保留，viewport均clear。追蹤ACTIVE，不因627綠而停用。

## 2026-10-14 01:50 checkpoint：筆刷假成功／RPC吞錯已修；新版測試站live，一般root快取仍待確認

- 起點 **6cf5650**乾淨、只有既有Vite/esbuild，沒有重疊modifier／deploy；依最新checkpoint處理筆刷false回應，不重做匯入修復、備份／0037或seed。必讀交接已查最新，歷史NEXT_TASKS的0037／staging舊版／寄信未授權記錄不作本輪真值。正式1023／setup_pending／Auth角色與權限未改。
- 修前新增5項真person-day／cal-brush branch執行測試全部RED：commit false仍reload／成功；pending仍可重設brushStart／切筆刷；沒有受保護background讀取；owner/state/view變動仍重開people／報成功；reread failed/deferred仍報成功。第三項舊版reload沒有options，引起讀background的TypeError，這是缺少保護參數的斷言邊界，不是聲稱網站本身在這裡TypeError。沒有寫任何真資料來重現。
- runtime **380a285bbe14810f089660d657878134cd2429f2**，補測 **f151408b72739dc7f1f2751227139f7bc15958e4**：保留main 9acd691的「等commit再讀」修復，再核對saved布林／同store/user/authEpoch、candidate S引用＋commit同步log後的JSON、drawer/modal/date/PV及permission。false不reload、不報已套用，顯示未確認提示並保留候選；既有sync狀態重試路徑仍可用。loading期間日期disabled、同一筆刷與切筆刷連點被擋，beforeunload含直接RPC在途；remote timer在brush busy期間不覆蓋資料。成功後才釋放本次busy並用background安全讀；讀取失敗／deferred只提示已儲存但未讀到最新，不冒稱已套用。新operation token防舊read回應覆蓋下一筆錯誤／成功。
- 同範圍另確認原applyBrush會吞resolve API錯誤、create失敗仍留下假的pending並繼續最終commit。改為先await捕捉的原store API，再核owner／state JSON後才變更當天本機leave/request；RPC失敗中止範圍、不吞錯、不發整段成功。部分日期已成功時保留那些日期並提示部分可能已存、需更新核對；**沒有跨日期交易／atomic保證**，既有DB schema不改。未核准詢問仍不列為正式請假／不自動重排。
- **12項新增真正執行期／Store／renderer回歸**：11個brush tests＋1個remote timer test，涵蓋false保留candidate、pending連點／切筆刷、ACK後protected reread、8類owner/state/view變更、read failed/deferred、create／resolve失敗不虛構詢問或隱藏pending、RPC在途owner/state變更、舊read污染新operation、真commit＋queueSync＋LocalStore quota（SYNC error／1次load／不reload／無成功）、第二日期RPC失敗的部分狀態、真people renderer status/date disabled／escaped alert及背景補讀釋放。聚焦25/25，i18n棘輪通過；初版新增tx('已儲存')只在SETTINGS_TEXT而非UI_TEXT，測試抓到漏鍵，三語補齊。原source棘輪更新成await saving與protected reload，但不拿它替代上述行為測試。
- 本機完整dot回歸exit0＋build **index-CKusOGRL.js**（runtime不再修改，兩個後加測試聚焦通過）；同SHA f151408两套Tests **38440646323／38440641036**＋smoke **38440646333／38440641168**全部success，frontend CI真log **609/609**、工具 **46/46**，database／solver jobs全success。380a285的Tests38440515231／38440507384及smoke38440515131／38440507624也已success，不以舊SHA冒稱新驗收。大chunk警告保留，沒有不相干dependency升降版。
- 真localhost5202本機合成demo：人→未確定→10/20起點→再點同日完成；僅1筆asking詢問／今日缺席0，toast確認已套用1天；18個當天色塊ID/label/text/style逐項相同。手機390×844底抽屜590.79px、top177.21，正常Tab定位准假→駁回，自動捲ops-drawer-b到332，兩審核鈕44px且中心命中，**沒有按准駁**。合成截圖 **outputs/local-brush-request-phone-20261014.png**已目視。再More→復原上一步→reload，18色塊逐項相同；人頁10/20 working／詢問0，最後關閉drawer、clear viewport。這不是雲端role／RPC失敗E2E；quota／RPC／競爭以真handler與Store回歸覆核，不能混稱真機Safari通過。
- 截圖工具限制已再次確立：Page.captureScreenshot clip y=0在window.scrollY1168時擷取文檔頂部，固定抽屜被漏掉；tab.screenshot手機圖有既有縮圖異常。先用正常Home把頁面回scrollY0、CDP按實際page offset捕捉才是可用證據。一次native tab.scroll未移動drawer-body，沒有盲重試；改正常Tab聚焦offscreen審核鈕，自動捲入可視區。這些是測試工具行為，不冒稱產品drawer缺失。FAB在右下角覆蓋部分卡片邊緣，但本次兩鈕中心皆可命中；窄屏完整熱區可列後續UX候選，不當已通過所有遮擋情境。
- Impeccable harden／craft-floor全文已讀，沿用session context，不重跑；只補loading／error／disabled語意、i18n及競爭防護，沒有改Gantt／日週／主題／午休加班樣式。Render deploy＋兩份reference全文，使用既有分支autoDeploy，不建服務／不改env或付費方案。
- PR16 worktree **cd77f5a**／remote一致、乾淨且僅既有Vite，普通merge f151408為 **5ebbf7cbc6c2fd935c57858c8a8a5b090f3924d7**，保留原5檔差異。全本機dot＋build **index-BdnKeP7m.js**成功、已推；两套Tests **38440951436／38440946732**＋smoke **38440951499／38440946689**實查全部success。PR16／18仍draft，不合main或部署正式；缺不同帳號／角色、真套用／兩端Realtime、offline409、正式VITE_TEST_*，nightly仍等加密main安全發布。寄設定信已授權且先前已提交，不重寄／猜密碼；沒有新的第二帳號登入證據。
- f151408 CI綠後non-force FF staging web **cbb70fa→f151408**，new_commit自動deploy **dep-db76s8142hec73fcals0**於 **17:45:32Z live**；solver source未改，不部署solver／正式。app error log觀測17:45:32Z–17:48:34Z為0，browser本次error0，非長期保証。
- **快取門檻未全過**：普通root reload及回root仍 **index-CxZY0SGE.js**（前版cbb70fa）；單次已知 `?release=f151408`得到新版 **index-BmfLAX55.js**，不能拿其結果冒稱所有普通URL已刷新。17:49:24Z HEAD實證root CF HIT、Age151、`public,max-age=0,s-maxage=300`、Last-Modified17:26:18Z。不重複deploy／清buildcache；下一輪先到期後核普通root是否新bundle，若仍舊再診斷，不只反覆報狀態。
- 真staging新版本參數URL／qa-lead手機390×844讀人抽屜：31個日期非busy可用、底抽屜尺寸正確、無等待詢問。僅讀與關閉，沒有點筆刷日期、詢問、准駁、用這套／儲存。新舊兩入口切同 **10/15／1廠**20個色塊逐項一致。Realtime仍Connecting→中斷的歷史平台問題，沒有第二帳號／自动同步實證，不因標籤暫時連線中就放行。
- 下一輪：先核正常root新bundle；普通merge **origin/main 83d1f7c**（本輪17:45 fetch才新增，排程比對4處翻譯＋測試，尚未納入f151408，已讀diff，不覆蓋其工作）並同步PR16。續修前一輪已證實legacy-save／openLegacyHistory／changeLegacyHistorySource的關窗／新請求／帳號變動競爭，加真執行期測試，不用原1023實體檔或雲端archive寫入重現。持久worktree與20/24/25/21/23 handoff保留；10分鐘追蹤ACTIVE，不因609綠而停止。

## 2026-10-14 01:30 checkpoint：確認匯入不再假成功；測試站更新，新筆刷失敗路徑待修

- 起點8a10841乾淨，僅既有Vite/esbuild，沒有重疊modifier／deploy。普通merge最新main（含09dc43a匯入錯誤翻譯、9acd691筆刷await修復）為 **3ccf147**，保留另一agent功能與測試。app catch保留原owner/request守門並納入tx；supabase-store衝突保留SQL current_date基準fixtureDay的故障／加班／audit測試，其餘納入main相對dayISO日期。最新origin/main **594cf5e**只補另一agent驗收文件，沒有漏掉新的source修復。未切共享checkout／未force push／未改正式1023、0037、setup_pending或Auth／角色。
- 已修Major **cbb70fa20628cc93ef72bc606e53646546c9400f**：`x-import-confirm`改await實際commit布林結果；儲存中status／aria-busy／disabled含X、取消、確認，Escape與overlay共用closeModal守門。連點不重複寫入；成功僅在同modal/store/user/authEpoch及同候選S／JSON版本確認後回報。失敗保留檔案與候選、明確「尚未確認儲存」，可重試原候選但不再pushUndo／重複import log；remote recovery／新草稿／新帳號時不能重用原檔覆蓋新S。重試仍核對原先清空blocks所需schedule權限；不聲稱master tables原子寫入或離線已存。
- **12項新增真正handler／renderer／LocalStore回歸**：pending與連點、false不假成功、六類晚回應owner/state變更、stale／權限／loading／無data、同候選retry、recovered snapshot不被覆蓋、真commit＋queueSync＋LocalStore quota失敗及恢復重試（兩次setItem嘗試、一次成功／一筆log／一個undo）、close guard、busy／alert／escaped HTML、original schedule權限。修前7項真斷言失敗；第8個原fixture缺cancelPlanCalculation先報ReferenceError，不冒稱其為產品錯誤。後續Saxes的HTML boolean屬性及VM重複宣告兩次fixture問題已修，未放寬產品斷言。main catch新增tx讓import-race錯誤fixture缺tx，補identity tx，原錯誤路徑重新通過。聚焦22/22，完整本機dot reporter exit0＋build **index-DP_7fpBZ.js**；既有大chunk warning保留。CI兩套Tests **38438122574／38438118337**、smoke **38438122579／38438118366**全success，frontend真log **597/597**、工具 **46/46**、database／solver jobs success。
- 真localhost5202既有本機合成demo：以repo既有Excel測試格式準備1人／1機／1產品／1工單fixture（outputs/synthetic-import-confirm.xlsx、無真實資料），正常filechooser→解析→合法確認預覽；首次取消18個可見色塊label/text/style逐項相同。初次DOM對照誤用dataset.id（實為data-bid）得到false，修正識別欄位後核對無差異，非班表修改。390×844預覽X／取消／確認均44px中心命中；真正按確認→合成機台顯示／班表按設計清空／成功status出現→復原上一步→reload後18個原色塊ID/label/text/style逐項一致。預覽警告24段指全state，18段指當天DOM，不能混稱資料量。另一個新IAB tab26顯示獨立demo／英文偏好，不能用它證明共享localStorage或跨端同步；已關閉。不注入browser state/File/PointerEvent；瀏覽器quota失敗與pending狀態尚無E2E（上述真正函式與LocalStore測試覆蓋），不把網路latency當local storage延遲。
- Impeccable harden/craft-floor全文已讀，沿用session context；技能只影響儲存中／失敗／成功語意與防連點，維持Gantt／抽屜原版型。新提示三語en/vi/th補齊，i18n棘輪全過。Render deploy及兩份reference全文，依既有autoDeploy核對，不建立新資源或更動付費設定。
- CI全綠後non-force FF既有staging web分支 **e81fe21→cbb70fa**；自動new_commit部署 **dep-db76j88jo6nc738igs2g**於 **17:26:18Z live**，一般root真瀏覽器 **index-CxZY0SGE.js**。solver source未變不重複部署，正式服務未部署。最近Render app error log觀測17:26:18Z–17:27:56Z為0，browser此次error0，不是長期零錯誤保證。
- 真staging qa-lead／390×844正常選同一合成file，只預覽：員工master權限拒絕且既有分組保護，無確認鈕，取消可用；未按確認匯入／用這套／儲存／clear。reload後首個讀取尚在初始化得blocks0，完成後日期預設10/14有22段；不冒稱資料遺失。正常datepick切回 **10/15／1廠**，原20段ID/label/text/style逐項一致；「查看排班」定位tst01、M20兩段在手機可視區。documentWidth375px（390 viewport減scrollbar）無水平溢出、modal0。截圖 **outputs/staging-import-gate-phone-20261014.png**已目視覆核。Realtime仍清楚顯示中斷，並非真自動同步已修；非真機Safari。
- PR16自己worktree核對乾淨／remote一致／僅既有Vite，普通merge cbb70fa為 **cd77f5ae8a8f5a076564375203f54c9f4cf3589c**，保留原5檔seed preflight／CSS／docs差異；完整本機dot exit0＋build **index-CjQH0rLY.js**，推送。兩套Tests **38438431405／38438422788**、smoke **38438431194／38438423134**實查全部success。PR16/18仍draft；角色跨帳號／真正排程套用／Realtime兩端更新／offline409／正式VITE_TEST_*仍未全過，不合main／正式部署，nightly仍停至加密main安全發布。備份／正式0037不重做。
- **下一輪第一優先：已重現的新Major（尚未修）**：main 9acd691只await筆刷commit，仍不核對false；真branch tail執行fixture **outputs/repro-brush-failed-save-20261014.mjs**回false→reload舊快照→仍toast「已套用休假」（candidate leaves被讀回空值）。無DB／browser／網路，不能把合成repro說成正式請假被清掉。保留另一agentawait修復，補failure／pending／owner競爭的實際handler測試與最小guard；另applyBrush直接RPC失敗／吞error需逐一查，不假設全範圍原子性。不要新增／審核任何正式或staging真請假來重現。
- 次優先新Major：**outputs/repro-legacy-save-owner-20261014.mjs**執行真legacy-save handler，close／new-modal／new-account三類在途完成都toast成功並open舊結果history覆蓋新畫面；synthetic-only且未寫任何真archive。需新增owner與request守門／失敗狀態測試，連同openLegacyHistory／changeLegacyHistorySource的late-result風險探索。此項尚未修，不用source掃描或僅工具成功結案。
- 臨時viewport已clear，More/modal收回，保留20/24/25/21/23 handoff及持久worktree；新reader26已關。10分鐘Codex追蹤仍ACTIVE，此輪完成不停止後續探索。

## 2026-10-14 01:06 checkpoint：Excel解析競爭與窄手機標頭修復；另有匯入儲存提示待修

- 起點3ef4ea7乾淨，無重疊modifier／deploy，只保留Vite/esbuild；必讀交接與最新checkpoint已核對。PR16 a88987e兩套Tests/smoke實查全success。普通merge最新main **b45c22e**為 **2d3f7c0**，保留另一agent的Excel解析loading與測試，main此段沒有workflow變更，不把舊明文備份artifact重新上傳。不切共享checkout、不改正式1023、0037/setup_pending/Auth/權限、不重匯seed。
- 真Excel change-handler最小重現 **7項中5失敗**：第一檔的成功／錯誤結果取代第二檔loading；legacy SHA256在途關窗後重開視窗、或蓋掉第二檔；store／user／authEpoch／archives permission改變仍接受舊解析。只有modal類型/loading不足以表示同一操作。runtime **4f4abe76ca7c4837c71d472004cde389119e2824**捕捉原modal物件與store/user/epoch，lazy module、parser、legacy digest與catch每個await邊界重新核對原操作與archive權限；關窗／新匯入／新登入的舊結果被丟棄，懶載入階段取消後也不再讀／解析檔案。保留原loading及真正當前錯誤回饋，未更改確認匯入或DB寫入邏輯。
- 新增 **10項真handler執行期回歸**（僅mock Excel懶載入/parser及可控digest/timer邊界），含正常預覽、當前錯誤、當前legacy date/hash、兩次解析成功／失敗、digest關窗／新檔、登入／權限變動及取消不寫S。聚焦22/22、全套dot reporter exit0＋build index-fpkMWRf3.js。初次修後有一項test自身unhandledRejection：新增早期取消讓第一檔根本沒開始解析，fixture卻reject未使用的promise；改成await tick確定第一檔parser已在途再選第二檔，沒有放鬆產品断言。runtime CI Tests **38433589098**＋smoke **38433589052**全部success，實際web **581/581**、solver **174**。
- 320px真瀏覽器先重現page-links第三鈕right378px；最小flex-wrap與content-based flex讓三入口保留44px並換行，本機documentWidth305px、三中心命中。第一次staging驗收又找到cloud status＋150px長帳號合計right363.67px；沒有把本機短帳號測試冒稱雲端全過。runtime **e81fe21c234f6e2330d8852f36fabd76ff4fa732**再讓手機top-status max-width100%／wrap，桌面nowrap保持。第二修正全本機回歸＋build index-BZ55fClu.js、CI Tests **38434656610**／smoke **38434656391**全success（web581/581、solver174）。Impeccable harden/craft-floor全文，沿用session context，app detector無輸出／exit0，CSS7個既有警告未擴成重設計；技能只影響邊界守門與避免短螢幕裁掉入口。
- CI綠後兩次non-force FF既有staging web分支：4f4abe7 **dep-db763foae00c73brnj6g** 16:52:38Z live、一般root index-BCWi7-ja.js；最終e81fe21 **dep-db7677jm8hqs73fdvlgg** 17:00:47Z live、一般root **index-D3nABJm6.js**，autoDeploy=new_commit成功，不手動重複部署／清cache。solver程式未改，不部署solver或正式服務。最後Render app error log 17:00:47Z–17:02:44Z觀測0；不是長期零錯誤保證。
- **檔案選擇器現在可正常用**：依cua filechooser文件操作，不能再把旧「IAB不支援file chooser」當本輪阻礙。真localhost5202／本機範本16048bytes（空資料表，尚未填寫）選檔→loading→清楚3個必填錯誤／零資料摘要；沒有確認匯入。再把真懶載入延遲6秒，普通選檔→loading時關閉，Excel module loadingFinished後仍modal0、18段ID/label/text/style相同。無state/File/PointerEvent注入，只有正常chooser.setFiles及臨時Network診斷。
- 真staging qa-lead／390×844同樣正常選合成公開範本→loading→關閉，懶載入excel chunk **200且loadingFinished**後仍modal0、20段逐欄相同、10/15不變；觀測範圍save_blocks/apply_plan/log_change請求 **0**。證據 **outputs/staging-import-loading-20261014.png**與 **outputs/import-empty-template-mobile-20261014.png**已目視。尚未做legacy實體檔hash競爭或真多帳號切換E2E，那些只有上述handler回歸證據；未發LINE／未清空名冊。
- 最終staging **320×844**一般root新bundle，documentWidth305px無水平溢出，3工具鈕＋雲端狀態／帳號5控制均44px、中心命中本鈕或其子元素。初次strict elementFromPoint===button把span誤列false，改成button.contains(hit)並真點帳號入口打開**設定抽屜**；原getByRole(dialog)期待錯UI型別超時，後以fresh DOM確認正確抽屜、關閉且drawer0／20段逐欄不變。沒有保存個人資料或改偏好。查看排班仍定位M20／焦點移轉／日期保留。桌面1440×900無溢出，status nowrap與tool48px保持。截圖 **outputs/staging-header-320-20261014.png**已目視。320初始高度仍需要垂直捲動才能看到班表／定位入口，不冒稱所有功能都在首屏；非真機Safari。
- PR16在各次確認乾淨／remote一致／只原Vite後普通merge4f4abe7為 **50ac436**（其CI Tests38434031086／smoke38434031082全success），再merge e81fe21為 **afbfd3a77a39441e45f2ea434796573dea3676cf**，保留原5檔seed/CSS/docs差異；兩次本機全回歸與build成功，最終index-BmYOqICE.js，已推。最終PR16 Tests **38435314994**及smoke **38435315603**實查全success。PR16/18仍draft；不同帳號／角色／Realtime自動同步／offline409／正式VITE_TEST_*未過，不合main或正式部署。新正式migration不准做，nightly仍等加密main安全發布才啟用。
- **新確認Major／下一輪第一優先，尚未修復**：真 `x-import-confirm` 在commit仍pending時立即closeModal及toast「Excel匯入完成」，commit回false後仍維持此成功提示。合成runtime實證在 **outputs/repro-import-confirm-20261014.mjs**（ignored，無DB／browser連線；可重跑），beforeAck success=true、afterFailedWrite success=true、S只在合成fixture變更。不是聲稱真正正式／staging DB被清空；本輪完全沒有按確認匯入。下一輪把此重現移成正式回歸，最小await確認儲存／原帳號與候選狀態守門，失敗保留可恢復輸入與正確沒存到回饋，不能觸碰1023來驗證。完整發布仍受此Major及多帳號門檻阻擋。
- 所有臨時Network latency/cacheDisabled及viewport已恢復，UI More/modal/設定drawer收回，保留20/24/25/21/23手交接與持久worktree。10分鐘Codex追蹤仍ACTIVE，不因本輪兩項修復／CI全過自行停止。

## 2026-10-14 00:40 checkpoint：手機空欄定位已修復並部署測試站

- 起點e2aa492乾淨，只有既有Vite/esbuild，無其他modifier／部署；fetch後最新main為b45c22e（新增Excel解析loading），其變更已讀但本輪未整合，不覆蓋另一agent。舊自動化prompt中的「寄信未同意」不採用：使用者已授權且先前已提交設定信，不重寄／猜密碼；仍沒有第二個可用不同帳號。正式0037不重套、1023與setup_pending不改。
- 新真dayHTML執行測試先失敗：有工作但前5個示範欄空白時沒有定位入口；另preview fixture初版PV=null導致測試自身TypeError，已改有效preview，不當產品缺陷。runtime **017876c6e65552129fe0a49d2463aae70ab7b403**：只在日班表有方塊且所有方塊水平不在可視機台範圍時顯示「{n}段排班在其他機台／查看排班」，點擊定位並將鍵盤焦點移到工作方塊，提示隨之收回；有可見工作時不增加操作列。保留空機台、日期／廠別／資料／日週手動切換，preview與真正空日不顯示假資料提示。只操作DOM視圖，沒有儲存呼叫。scroll listener／ResizeObserver於重繪時清理，避免重複監聽。
- 新增 **6項執行期／邏輯回歸**：真renderer、空日及preview不誤報、左右離屏與sticky時間欄遮擋、定位＋焦點、重繪/resize監聽釋放、真delegated click不改UI日期廠別或S；不是只掃源碼字串。本機全套dot reporter exit0＋build **index-DuZY9C7z.js**成功。CI Tests **38431450434／38431442408**、smoke **38431450260／38431442341**全部success；CI實際frontend **571/571**（含CI產生的合成seed驗收），不要把dot輸出推算成精確本機計數。b2f39d3前一輪兩套CI亦核對全成功。
- CI綠後non-force FF既有staging分支6dc3c6d→017876c，autoDeploy=new_commit確實觸發 **dep-db75rvvavr4c73c5ngvg**，**16:36:33Z live**，一般root真瀏覽器讀到 **index-CWkGt6jo.js**，不用cache-bust才通過。只更新staging web；solver程式未變不重部署。Render app error logs 16:36:15Z–16:38:03Z查詢0，本輪browser觀測的16:36:33Z之後error0；不是長期零錯誤保證。
- 真qa-lead測試庫 session **390×844、1廠、10/15、20段**：初始提示可見，定位鈕48px、中心hit正確、無水平溢出；普通點擊後tst01的M20兩段可見，焦點在第一段，提示隱藏，modal0，日期及1廠保持。20段ID/aria-label/text/inline-style逐欄相同。一次JSON物件整串對照因工具重排傳入鍵序得false，改用按ID逐欄對照差異=[]、unchanged=true；不是資料被改。沒有送儲存／套用／刪除／報工／角色變更，沒有重匯103段；Realtime仍中斷，不冒稱自動同步恢復。
- 本機390×844 Enter同樣定位／焦點不消失；desktop1440×900正常有可見工作時提示隱藏、無水平溢出；320px提示本身48px且不越界，但既有頂部「廠區平面圖」right378px造成整頁溢出，初次中心hit受頁面縮放/位置影響false，實際locator click成功；此為下一輪獨立Minor候選，不能稱320整页全過。真機iPhone Safari未測。手機修前／修後證據 **outputs/staging-locate-hint-20261014.png**、**outputs/staging-locate-work-20261014.png**均已目視覆核；local/desktop另有截圖，桌面clip留當時捲動位置，不當初始頁面證據。
- Impeccable adapt與craft-floor全文已讀，沿用本session context不重跑；app detector無輸出／exit0，CSS detector7項皆既有厚邊與width transition，無新增，沒有擴成版型重設計。技能影響是大48px定位與精簡可視區提示，不用卡片／modal掩蓋班表。
- PR16 worktree aa920f6／remote一致、乾淨且只有既有Vite，安全普通merge017876c為 **a88987e0d0c448fed62a9b115430b9b6093c5b1d**；全本機回歸與build exit0（index-B-g6tcSs.js），保留seed preflight／CSS等5檔差異；已推。00:40最新CI Tests **38431876429／38431871007**仍in_progress，smoke **38431876229／38431870575**success，需下一輪核結果；不要拿017876c CI冒稱PR16 head全綠。
- PR16/18仍draft，正式VITE_TEST_*、不同帳號/角色、Realtime自動更新及offline409門檻未全過，不合main／正式部署。nightly仍待加密版本安全進main才啟用。臨時local/staging手機viewport均已clear，保留20/24/25/21/23 browser handoff及持久worktree。10分鐘Codex追蹤維持ACTIVE。
- 下一輪：先核a88987e CI並讀最新main；安全整合b45c22e（保留Excel loading改善，另以延遲兩次匯入／關窗後錯誤回應等實際handler測試查同類loading型別守門競爭，不以字串斷言當驗收）。續修320px工具列溢出；補staging備援失敗回饋／草稿保護及角色同步門檻。手機人類網址仍未回覆，不能把本次已修水平空欄當成其個人手機的唯一原因；正式測試入口發布仍尚未完成。

## 2026-10-14 手機空表回報（修前歷史）：已重現顯示問題，當時尚未修復

- 使用者回報手機看不到測試排班；已詢問手機完整網址／日期截圖，尚未收到，不能斷言其個人手機根因。
- 真實 staging qa-lead session、2026-10-15／1廠，在 Chromium 390×844 有20段測試方塊。初始水平位置0先顯示5個空示範設備，第一個測試設備tst01方塊位於右側約1339px，初始手機可視欄沒有任何工作方塊。資料不是被刪除；正式網站尚未完成PR16測試模式發布，不能混稱正式已有可用測試入口。
- 透過正常點擊「測試M20 裁切360件08:00–12:00」開啟詳情，確認tst01／測試-張五，再關閉（沒有儲存），表格水平定位1214.67px後兩個M20方塊可見。截圖 `outputs/test-mobile-data-visible-20261014.png` 已目視覆核。原生scroll及CDP wheel兩次未移動，不能以此冒稱真機滑動通過；非iPhone Safari實測。
- 未修改任何正式／測試排班資料、角色或帳號，臨時手機viewport已還原。後续最小修正候選：清楚的有排班機台定位入口／空可視區提示，不默默刪除空設備或重匯測試資料。先等網址釐清是否另有正式／測試入口混淆。

## 授權與排程

- 使用者於2026-10-13授權：依序修復備份搜尋／模擬驗收、更新測試環境與登入權限同步驗收、確認備份後套用正式0037、全部發布門檻通過後合併PR #16並部署。
- 正式1023名冊、工單、班表、報工、請假與待核對限制不改；只允許上述0037 schema／權限函式遷移，不改個人授權或帳號角色。
- Codex本對話追蹤 `automation` 已更新並核對ACTIVE，每10分鐘接續。完成目前發布目標後仍繼續缺陷與介面功能改善，直到使用者主動停止；不可自行結案停用。這不是新增Render付費cron服務。
- 本機排程需要電腦開機、桌面app執行；服務限制、登入失效或工具權限可阻礙某個項目，不能假裝全天候無條件成功。
- 持久隔離worktree：`C:/Users/me060/Downloads/factory-scheduler-release-gate-20261013`；分支`codex/continuous-release-gate-20261013`。不要修改另一agent的`fs-hunt`或切換共享main。重疊執行不並行寫入／部署。

## 已查證的起點

- 基底main `5760a1e`。最新模擬驗收run `38347155112`是下載備份階段失敗（找不到artifact），尚未執行solver。
- workflow只查artifacts前20筆；實際有未過期備份`11786241413`（`db-backup-38338799281`），所以不能把這次紅燈當成INFEASIBLE重現。
- 先前batch=60實驗已還原；新main含「副本清空transfer_orders」實驗，但其求解結果尚待下載修好後確認。不要直接把猜測當根因或放寬正式排程規則。
- 測試資料已於2026-10-12實際匯入獨立Supabase：12人8資源20工單103段；保留5示範員工23段。不要重匯／重置。
- 本追蹤先前已更新兩個staging Render服務至cdfc40c，後续agent有更多修復需再核對版本。
- PR #16 head f93cc6b仍draft且CI綠；尚未配置正式Render VITE_TEST_*、兩端Realtime未驗收。需先merge最新main重跑，不只靠可合併狀態判定通過。
- 另一agent稱staging已有0037，並有老闆session；須本輪實際查證，不猜密碼、不讀／展示SQL片段中的密碼。
- 報告有10-14未來日期，但本機Git提交與目前客戶端日期為10-13。後續記錄以實際執行時間與run/commit證據為準。

## 本輪工作

- `tools/backup-artifact.mjs`：分頁搜尋所有有界頁面、選最新未過期db-backup，指定ID核對類型與期限，HTTP錯誤及ZIP內容驗證，憑證不輸出。
- 7項可執行mock-HTTP回歸通過：第二頁備份、過期／錯誤類型、指定ID、非法ID/URL注入、API錯誤、分頁上限、ZIP內容／下載失敗。
- acceptance-sim改用此模組並先跑其測試；Tests增加tools及工作流變更觸發與工具測試，後續需CI及真實副本模擬驗收。
- 新發現：apply-migration只查前5 artifacts、備份過舊只警告而未拒絕，且未下載／還原，實際比文件承諾弱；在套用0037前必須補足備份與atomicity關卡，不能沿用此弱驗收。

## 下一步

### 最新checkpoint（接續時優先讀本段）

#### 2026-10-13 23:59 heartbeat／2026-10-14 00:17：備援套用不等儲存與失敗前通知修復

- 起點 **00dbc7c38825c4f4b5a773a7302ed1a09322437f** 乾淨、fetch無額外main更新，無重疊modifier／部署，必讀交接已核對。90bf552 Tests **38426008893／38426003626**與smoke **38426008887／38426003528**、PR16 aa920f6既有四項CI全success。不重做上輪staging真ORTools C套用／版本8→9，不重寄信、猜密碼、匯入種子或碰正式1023。午夜後環境日期已10/14，記錄不沿用10/13的today。
- 新最小重現 **6/6失敗**：真pvApply備援支線沒有await commit，等待／寫入false亦先showResult；舊帳號／新preview／新state期間回應仍開舊成功結果；權限撤回後先換S與pushUndo再拒存；實際commit+queueSync+LocalStore儲存額度失敗時pvApply先返回、SYNC仍busy；共用commit先送LINE才等儲存。因此不是上輪apply_plan回條分支的回歸，是未經RPC preview的本機／雲端瀏覽器備援支線及共用通知時序。
- runtime **b2f39d3933eb72d074a8b612cfc9cb86ac19d76a**：備援套用前核對當前原始permission與P.base，拒絕時不改S/log/undo或送寫入；確認後等待commit，只有真saved且原store/user/authEpoch、同候選S物件／內容、沒有進新PV才showResult。失敗保留現有待重試候選，由既有queueSync維持「沒存到」/重試，沒有拿成功結果蓋掉失敗回饋或丟掉要重試的快照。共用commit在permission拒絕前不加假紀錄；LINE改為確認saved後才發，捕捉原帳號／store/authEpoch，不拿新登入的JWT發舊事件，通知失敗仍不影響已確認儲存。
- 新增 **10項實际函式回歸**：在途、false、晚回應（含新草稿內容／store／帳號／epoch／PV）、撤權、stale base、真LocalStore quota failure（明確assert SYNC.msg含儲存空間不足）、通知時序／只成功一次、permission拒絕零副作用、换帳號不發、通知同步/非同步失敗不改saved。quota是假測試儲存層內的真正LocalStore+commit+queueSync執行，不是瀏覽器CDP改localStorage，也不是正式／staging的quota E2E；LINE只用合成通知器，未發實際外部訊息。
- 第一輪全套 **560/563，3失敗**，因此沒有build／發布（PowerShell明確檢LASTEXITCODE失敗即throw）。修復漏加的權限提示三語；另兩個既有SupabaseStore回歸硬編10/6的fault/overtime在DB today翻到10/14時掉出schedule_snapshot預設七日前下限，不是修改app/Store引起。改用各自真DB `current_date`建立同樣fixture，保留4列audit、note/orig、ot_end=1200、加班授權等所有原断言，不更改SQL讀取範圍或正式資料。3失敗項聚焦重跑全過；最終全web **563/563**（53.65秒）＋build **index-Ro2yQp4p.js**（9.32秒）通過，最後增加quota訊息assert後10/10再過。大chunk警告仍在。
- Impeccable全文、harden/craft-floor全文，沿用先前session context不重跑；本輪detector app/i18n一次 **[]**。沒有新CSS／版型／機台Gantt／日週切換變動。只以確認結果／權限拒絕／錯誤時序減少誤導，沒有全面設計重做。
- 真本機 **tab25 / localhost:5202/?local=1**（非staging）正常更多→自動排班→計算→真「瀏覽器備援」三方案→選C維持現狀→填QA備註→對用這套按Enter一次，才出成功modal／本機儲存狀態。**390×844** modal無水平溢出，X/復原/知道了均44px，備註可見，證據 **outputs/fallback-confirmed-local-mobile-20261014.png**已目視。正常reload→更多/全部紀錄→00:14詳情仍有「QA fallback confirmed-save 2026-10-14」，證明真LocalStore持久化；未操作復原。收尾Emulation.clear、modal/More/PV皆關閉，本機留10/14。20/24/25/21/23保留handoff。沒有state注入、quota瀏覽器猴補丁或任何雲端寫入。
- b2f39d3已推，Tests **38429113037／38429104456**在00:17仍in_progress，smoke **38429113212／38429104378**success；**尚未部署此修復或90bf552匯入翻譯整合版**，staging仍已驗6dc3c6d/index-D7tYAvVb.js。新共用commit涵蓋其他手動/事件流程，要等同SHA跨層回歸及後續staging驗收，不能拿本機通過冒稱雲端LINE／離線／不同角色通過。PR16仍aa920f6，下一輪安全同步最新修復前先核干淨／無modifier／remote一致；PR16/18仍draft。
- 下一輪先核含b2f39d3的最新head CI，安全部署既有staging前端再只讀核對版本／匯入翻譯與備援失敗UI；不要重做已過ORTools C寫入。可在隔離staging暫阻出站log_change/save_blocks，先證明沒有DB提交及沒有提早LINE/成功modal，再考慮正常重試一次，不能盲重送或丟未存草稿。其他安全候選：套用中卡片／條件重排disabled一致性與其他commit呼叫者是否等待saved。真正不同帳號/角色、Realtime自動同步、offline409與原生Safari、正式VITE_TEST_*門檻仍未全過，不合main／正式部署／額外migration。正式0037不重套，正式1023/setup_pending/Auth/授權零改動。nightly仍待加密版本安全進main；10分鐘追蹤ACTIVE，繼續探索，不自行停用。

#### 2026-10-13 23:40 heartbeat／23:57：真 OR-Tools 單次套用、回條／版本／第二分頁補讀通過

- 起點 **6dc3c6d07b93b3a6aacca2030d06afab2c2ca532** 乾淨，只有既有Vite／本輪readcheck，無重疊modifier或部署。必讀交接已讀；舊寄信「未同意」敘述不採用，使用者已授權且一封已提交，不重寄／猜密碼／改憑證；仍無第二個可用不同帳號。Render-deploy全文與deployment-details/post-deploy-checks已讀，只更新既有staging web，不新增服務或費用。
- 6dc3c6d Tests **38423986027** frontend/database/solver全completed/success、smoke **38423985990**success後，non-force FF既有staging分支 **58b73ba→6dc3c6d**。自動new_commit部署 **dep-db7533mq1p3s73f1g7ig** 於 **15:43:36Z live**。staging同SHA新增Tests **38424459789**及smoke **38424460402**亦success。solver程式未改，不重部署。部署後staging error級日誌查詢0筆，不宣稱整个平台無故障。
- 普通root首次仍提供舊index-BnYNQgRr.js，單次`?release=6dc3c6d`取得新 **index-D7tYAvVb.js**；完成驗收後再正常root進入已是同新bundle，未重部署／清buildcache。真qa-lead組長session正常；選10/15、1廠、20段原測試工作。日期欄在AX叫textbox但locator角色不匹配；改用已觀察的真`#datepick`填值/Tab，屬工具語意差異，未改頁面或app state。
- 正常更多→自動排班→計算，Network單次POST **staging /plans/db200**（另OPTIONS為CORS）；真OR-Tools **3套**，選中的C「維持現狀」換0人、無工單時間改變、O17/O18既有逾期。因無影響日期PV先定位today10/13，正常日期欄再定位10/15後，**20段id/label/text/style與進入前逐筆相同**，才正常填備註「QA 2026-10-13 維持現狀套用驗收」並按**一次用這套**。沒有盲重送／第二次確認／重設種子。
- 在此tab暫阻staging `/notify/line*`防驗收外部通知，並加6秒診斷延遲，非真故障。單次在途套用：桌面 **1440×900** 頂列及手機 **390×844** 底列均為disabled「正在儲存，請稍候…」，DOM **pv-apply=0／pv-cancel=0**；手機48px、center elementFromPoint命中自身、可見／無水平溢出。截圖 **outputs/cloud-apply-desktop-b188b33-20261013.png、outputs/cloud-apply-mobile-b188b33-20261013.png** 均目視核對，僅本機保存。沒有用保留handler注入連點，連點/取消/換方案由前輪12項實際handler測試覆蓋；本輪是正常一次儲存鎖定真UI。
- Network真正 **1筆POST /rpc/apply_plan200 → 1筆POST /rpc/schedule_snapshot200**，沒有save_blocks。僅在已觀察的測試RPC回應內部解析必要格式／數字，**不輸出/保存原response body、headers、JWT或SQL快照**：有效UUID回條，與重新讀回change_sets中的**唯一QA備註稽核**id一致，**version_before=8、version_after=9**，快照version9。結果modal顯示「重新排程：採用維持現狀」、QA備註、既有逾期與3個短段提示；不是靠HTTP200或徽章冒充儲存驗收。UI20段還原同桌面版面後id/label/text/style全一致。保留這個正常版本與稽核，沒有復原／直接刪除／rollback版本。
- **第二分頁24仍是同qa-lead且舊bundle index-Cm7LbyXf.js**，不是另一角色／帳號。無草稿/預覽時正常按「按此更新班表」→成功提示→更多/全部紀錄→23:47那筆詳情，確見相同QA備註；20段ID、名稱／工作時間／件數一致。不同版面尺寸比較style不相同，不能當排程異動；已用同尺寸寫端全欄與讀端語意/ID對照。Realtime仍「即時更新中斷」，因此**只認同帳號跨分頁手動補讀通過，不認跨帳號、自動同步或不同角色通過**。
- 收尾關閉兩端modal/More，寫端回普通root/新bundle、10/15/1廠/20段，PV及modal皆0。明確還原blockedURLs=[]、offline=false/latency0/throughput-1、Network.disable、Emulation.clear；限工具捕获範圍warn/error0。IAB20/24/25/21/23已markHandoff。正式服務/DB/1023/Auth/角色授權/setup_pending及0037未改，既有測試12人8資源20單103段未重匯；本輪唯一雲端排程提交為上述隔離庫C方案。
- 最新origin/main **5ce857f**含他人 **a6b7e4a**（匯入13鍵三語、2項實際modal/翻譯回歸）與文件，讀diff後普通merge保留為 **90bf55276b258896c3aff9cecd71abced5addb9c**並推；不是部署到正式。整合版本機`node --test --test-reporter=dot tests/*.test.mjs`與build exit0，新本機bundle **index-CLoEQO2V.js**。此整合版新CI Tests **38426008893／38426003626**在23:55仍in_progress，smoke **38426008887／38426003528**success；尚未部署90bf552，不用已驗6dc3c6d冒稱新版全部E2E。
- PR16 worktree HEAD/remote9047987、乾淨、modifier只原Vite後，普通merge90bf552为 **aa920f6ad413876ae89ca3ce118038679cb22a99**，本機全套與build exit0 **index-Lj8WiijM.js**，保留seed preflight/CSS/docs差異；已推，該新SHA CI需下輪核對。PR16/18仍draft，不能因本次真套用通過就合main／正式部署。
- 收尾最新核對：PR16 aa920f6 Tests **38426297478／38426289216**及smoke **38426297476／38426288816**已全部completed/success，優先於上一項的待核狀態。仍未部署該整合版或通過不同帳號／自動同步門檻；不重做真C方案写入。
- 下一輪先核最新head及90bf552/aa920f6 CI，綠後僅部署尚未上線的匯入翻譯整合版並只讀驗收，不重做已過C方案寫入。可續查方案套用中仍看似可選的卡片／條件重排入口（handler已擋pv-pick，但視覺disabled是否一致須先真重現），以及失敗/409/草稿保護等安全缺陷。真正不同帳號/角色、Realtime自動更新、offline409及原生Safari/正式VITE_TEST_*仍未全過；nightly367614493仍需等加密版本安全進main才啟用。10分鐘追蹤ACTIVE，不自行停止。

#### 2026-10-13 23:19 heartbeat／23:38：雲端方案套用的連點、舊回應與回條缺陷

- 起點 **1a1ee4d** 乾淨、fetch後main仍498d5ec，無其他modifier／部署。必讀交接已核對；PR16 **9047987** Tests **38420624877／38420617060**及smoke **38420625094／38420617046**實查completed/success；ada整合CI亦已全綠。PR16/18仍draft/CLEAN，不等於發布門檻通過。未重做0037、備份或種子匯入。
- 原本要驗真OR-Tools維持現狀套用，先查RPC/handler發現風險，改做有界最小重現，**本輪未按雲端用這套／未送apply_plan/save_blocks**。修前新增7項實際函式測試 **5失敗／2通過**：快速雙確認送出2次RPC；late reply清掉另一個預覽；快照補讀失敗仍showResult；apply_plan成功HTTP但null回條未拒；帳號/client/authEpoch變更後仍接受舊回條。資料庫本來已有preview FOR UPDATE／applied_option及版本鎖，**沒有聲稱重現兩次DB提交／資料損壞**，問題是前端重送與誤導成功／狀態競爭。
- runtime **b188b33d208dbb37627a894371593968285d8538**：同步設PV.applying、重複確認／取消／換方案handler不執行；桌面頂列與手機既有底列均以同一儲存中文字停用。捕捉原store/user/authEpoch/PV/S物件、內容及version，RPC回來再核對；reload只有真applied且同登入／未進新預覽才showResult。store要求apply_plan契約的UUID change-set回條，空／ malformed不算確認；讀回真快照之前不前移baseline/version。未確認結果離開預覽先補讀，提示「排程套用結果待確認，請更新班表核對；不要重複套用。」四語，不盲重送，也不讓取消誤稱排程未變。
- 新增 **12項實際app/Store函式回歸**（連點、替換preview/store/user/epoch/S、原物件內容修改、version、補讀失敗／補讀時換帳號、取消／換方案、回條空值、無登入、保存情境唯讀）；手機HTML真函式＋解析測試延伸auto儲存中。另新增 **真PGlite＋完整migration apply_plan回條遺失**：DB確實提交、版本1／一段／一筆稽核／applied_option=A，原baseline仍0且未提前接受；一次補讀恢復真值，RPC只送1次。這是本機隔離SQL，不是staging真ORTools E2E。
- 最終全套web **551/551**（`node --test --test-reporter=dot tests/*.test.mjs` exit0；前一輪TAP亦551/551）、最終聚焦28/28與cloud12/12、build成功 **index-C9j4oXHx.js**；既有大chunk警告保留。Impeccable全文/context一次/harden/craft-floor完整、detector app一次 **[]**，技能只影響儲存／失敗回饋，不重設計Gantt或CSS。
- **尚未部署b188b33**，修復及文件已推；推送head **0f64da76563d3e43137194d5b45290c3c27e2290**（包含runtime b188b33）Tests **38423856402／38423852793**及smoke **38423856357／38423852342**在23:39仍in_progress。因一次推兩commit，請查推送head的CI，不用未單獨推送的runtime SHA查不到run就冒稱失敗。後續僅文件提交仍需讀最新head再核其CI。staging仍已驗58b73ba/index-BnYNQgRr.js，不拿此舊E2E冒稱新修復通過。沒有新Render資源／費用、沒有正式部署／正式DB/Auth/角色／1023/setup_pending寫入。IAB20/24/25/21/23已markHandoff，沒有開新設定信、猜密碼或改憑證；20/24仍同qa-lead，不是跨帳號。
- 下一輪優先核最新分支head（包含b188b33修復）的同SHA CI，綠後安全FF既有staging前端並核版本／bundle；用真雲端測试「維持現狀」套用一次，觀察一筆apply_plan、回條後班表及手動补讀一致，保留正常版本／稽核，不reset。補桌面／手機儲存中按鈕可見、不可取消／連點的真操作證據，測試失敗不盲重送。之後安全同步PR16，真正不同帳號／角色、Realtime、offline409、原生Safari與正式VITE_TEST_*門檻未全過仍不得合併／正式部署；nightly仍不能啟用。10分鐘追蹤保持ACTIVE，修完此項繼續下一缺陷。

#### 2026-10-13 23:01 heartbeat／23:16：安全重連新版部署及真網路失敗／取消驗收

- 起點798aaa0乾淨、無其他modifier／deploy，指定交接已讀。58b Tests **38417929344／38417923759**及smoke **38417929361／38417923758**、PR16 f11 Tests **38417980873／38417972686**及smoke **38417980692／38417972734**實查全completed/success。Render-deploy全文、deployment-details/post-deploy-checks已讀；只有staging前端FF **dfc2486→58b73baa78ce3281e38ae0d58027582dda5c41c3**，沒有manual trigger/toggle/cache或新增費用，未改solver／正式服務／1023/setup_pending/角色授權。
- 真 **new_commit / dep-db74g6eq1p3s73f0gieg** 於 **15:03:16Z live58b73ba**；普通root reload實讀 **index-BnYNQgRr.js**。推staging同SHA Tests **38418652268**及smoke **38418652331**success。PR16 f11本機獨立 **536/536**＋build成功 **index-B7ngRbvj.js**（不是staging bundle），保留多出的seed preflight測試，不用本分支535冒稱該分支已驗。
- 真桌面1440×900重連正向：**只在tab20暫時阻斷staging /health**並reload，Network見GET＋loadingFailed blockedReason=inspector；不改S/Auth/DB、其他裝置或server設定。Boot完成後仍真qa-lead/F1，導航10/15；清除阻斷後加**2秒診斷延遲**，正常更多→自動排班→計算，明確busy/disabled及「正在重新連線排程服務，最多等待45秒；可取消」可见。只見 **單次GET /health200→單次POST /plans/db200**（另OPTIONS是CORS），实际顯示OR-Tools **3套方案**（維持現狀為推薦，O17/O18會晚），沒有先去帳號手動重連，也不把health200單獨當功能成功。取消這個預覽後原20段id/label/text/style全相同。
- 一次locator.waitFor傳25000ms卻工具只等3000ms，當時尚無PV而報element detached／no-match；沒有重點／state注入，後續讀DOM及Network明確已生成ORM三方案，屬工具等待期限差異，不當產品崩潰或把逾時當成功。首次失敗為本輪人工阻斷，不冒稱此輪重現真正Free冷啟動。
- 真手機尺寸390×844（Chromium，不是原生iPhone）：正常帳號連線UI在健康阻斷下檢查一次，確顯示服務未連線；清阻斷，回普通auto入口，增加**10秒診斷延遲**让健康等待可重現。按計算後新45秒提示、aria-busy=true、只有計算disabled，X/取消均enabled／**44px中心命中**，overflow=false。對取消按 **Enter**，GET /health立即 **net::ERR_ABORTED/canceled=true**，整段觀測 **plans請求0**，0 modal/PV、10/15/F1、原20段完全一致。不是只檢源碼或HTTP碼。
- 截圖 **outputs/staging-recovery-desktop-58b73ba-20261013.png、outputs/staging-recovery-mobile-58b73ba-20261013.png** 1440×900及390×844已目視，提示換行／按鈕可讀；僅本機保留，不公開artifact。收尾關閉More並明確還原 blockedURLs=[]、offline=false/latency=0/throughput=-1、Network.disable、Emulation.clear；runtime warn/error工具查詢0，但不宣稱所有後端／平台無錯。保留IAB20/24/25/23/21；失效Chrome設定信tab不重開／重寄／猜密碼。本輪只計算預覽可能新增測試DB preview/options，**沒有apply_plan/save_blocks或正式資料寫入**。
- 最新main有他人 **498d5ec**（Excel範本四表範例一致／4按鈕i18n及3可執行測試），先讀stat/diff後普通merge保留為 **ada1608e86e2efd6d0442e5dcce134d61efa8b51**推送，不切共享checkout。整合本機 **538/538**（51.09秒）＋build **index-DJVpiX69.js**；log outputs/main-template-integration-web-tests-20261013.txt。其 Tests **38420270670／38420262180**在23:15仍in_progress，smoke **38420270641／38420261944**success；尚未部署含Excel範本的整合版，不拿58b真E2E冒稱新整合版E2E。
- PR16 f11本地/remote再次核對一致／乾淨，modifier僅原Vite；fetch后普通merge整合版為 **904798701e9a1bb0ebb93ef315b035574b80f7d0**推送，原seed/CSS/docs差異保留。新PR16同SHA CI／539全套待核，PR16/18仍draft，不合main／正式部署。不同帳號/角色、Realtime自動同步、真ORM套用、offline/409與原生Safari及正式VITE_TEST_*仍未全過；持續追蹤ACTIVE。下一轮先核ada/904 CI与安全整合，不重复本輪已過的重連；可優先在隔離fixture驗真ORM「維持現狀」正常套用（一筆版本／稽核、原班表一致，不reset）及後續補讀，缺不同登入仍不能冒稱跨帳號或全部發布門檻通過。
- 收尾實查更新：ada1608兩Tests **38420270670／38420262180**及兩smoke均已success；PR16 904 Tests **38420624877／38420617060**仍in_progress、smoke **38420625094／38420617046**success。此狀態優先於23:15的in_progress記錄，未為等待CI重複部署。

#### 2026-10-13 22:51 heartbeat／22:58：按計算安全重連及健康檢查競爭修復

- 起點378c4a2乾淨、無其他modifier／deploy；指定交接全文/選定最新段已讀，舊寄信／0037／artifact消費者待辦不重做。正式1023/setup_pending/角色及正式服務零改動；本輪沒有雲端資料或Auth寫入，測試seed不重匯。Impeccable全文、context一次、harden/craft-floor完整及detector app/i18n一次[]，保留既有UI世界，不新增CSS/Gantt/抽屜設計。
- 依前輪真3秒中止證據，新增實際app VM測試修前 **3 fail**：服務up=false時按計算不重試、取消沒有可Abort健康請求、只有事件權限的人不能在重連後走既有solver；明確合成transport，不當正式／真雲端E2E。改為**只有雲端使用者明確計算且up=false時check一次，45秒上限＋三語toast**；計算busy/同job去重沿用01740ea，close／換modal立即Abort健康請求，await後原有S/store/user/epoch/version/owner再驗。正常本機模式不等待遠端重連；未改startup預設3000ms／test45000ms，不新增poll／定時重試／費用。
- 健康transport新增4項：外部Abort、body時間上限、舊失敗覆蓋新成功、503的ok:true不得健康。原外部Abort測試只查aborted其實等滿3秒也會過，測試補80ms有界回條才足以檢驗即時Abort；原實跑body／舊失敗／HTTP三項確實fail。最小修check參數、healthEpoch、strict true及HTTP ok；fetchWithTimeout可選consume，health整個JSONbody仍在timer內，external signal合併且finally移除listener／timer，已abort不送fetch。**POST body時間上限仍未改**（只health用consume），不宣稱全部API都已覆蓋完整本文timeout。
- 追加capability負面實跑 **1 fail**：服務缺一般工作能力的分支會讓僅事件權限帳號產生完整瀏覽器重排預覽。集中openPlansLocal雲端schedule.manage防護，網路/能力/其他入口皆拒絕整張fallback；未改DB角色／RLS，也不宣稱此測試證明正式資料已被越權寫入。增加timeout非數字/過大上限與already-aborted無fetch測試。原local timer fixture由偽supabase改成真正kind=local，保留原取消／錯誤斷言；新增雲端retry fixtures明確kind=supabase，不放寬權限規則。
- 聚焦 **52/52**，完整 **535/535／0 fail**（53.76秒），build成功 **index-D_CW2lfP.js**，原chunk警告保留；全部無真憑證／雲端操作。logs僅本機outputs/health-recovery-focused-20261013.txt、health-recovery-web-tests-20261013.txt。**此批新UI toast／真健康重連、desktop/mobile/Safari未瀏覽器驗證，也未部署**，上一輪dfc取消截圖不可當58b新版完整回歸。
- runtime **58b73baa78ce3281e38ae0d58027582dda5c41c3**提交推送；其 Tests **38417929344／38417923759**及smoke **38417929361／38417923758**在22:58實查in_progress，待同SHA最終核對。上一個378c Tests38416894549/smoke38416894685成功不替代新SHA。PR16事前a1cc476本地/remote一致、乾淨，僅其原Vite，fetch核對後普通merge為 **f11db512259e4d993e399658f95a342be47ded4f**已推；保留seed/CSS/docs差異，不force、不合main。新PR16 CI／全套須獨立核對，不用535冒稱該分支536已跑完。
- staging仍 **dfc2486 / index-ZK94ERD9.js**；未把push持久/PR16分支當既有staging已部署。接续先核58b/f11同SHA CI，安全FF既有staging source（autoDeploy yes，不manualtrigger）後查live SHA及普通root，按正常UI製造可重現up=false（可有界臨時阻斷/離線health觀測後復原，不改app/auth/state），驗「按計算→單次健康重試→ORM方案」、在健康等待時取消不送plans、正常fallback/權限提示、原20色塊保存，保留手機/桌面44px/日期/F1。前輪真原生Safari/不同帳號/ORTools套用/offline409／Realtime／正式VITE_TEST_*門檻仍未全過，PR16/18維持draft，nightly不重啟。追蹤ACTIVE，繼續下一項，不因535綠結案。
- 收尾核對：58b兩個Tests仍in_progress，兩個smoke成功；PR16 f11 Tests **38417980873／38417972686**仍in_progress、smoke **38417980692／38417972734**成功。IAB20/24/25/23/21已重新保留；Chrome待設定信tab1703573257已不存在，沒有重開／重寄／讀取未知分頁或猜密碼，不把其消失當已完成第二帳號登入。

#### 2026-10-13 22:40 heartbeat／22:50：新版自動部署及真計算在途取消通過

- 起點c897b6a乾淨、無其他modifier／deploy，指定交接已讀。不重套0037、重匯測試seed、重寄已獲准設定信、改帳號角色或正式1023/setup_pending。Render-deploy全文及deployment-details/post-deploy-checks已讀，MCP先核既有staging web正確repo/root/branch/autoDeploy=yes；此前同SHA dfc2486 Tests/smoke均success，安全FF來源 **99d0760→dfc24865a413a11c7135b18054efbb5625a8fd8f**，沒有手動trigger/toggle/cache或新增服務費用。
- 真 **new_commit／dep-db7460ojo6nc738ei4f0** 於 **14:41:30Z live dfc2486**；這次push在Render App縮小為factory-only之後，證明縮小後自動部署仍運作。普通root reload實際 **index-ZK94ERD9.js**，boot完成後真qa-lead組長session可讀。reload預設10/13顯示停工（不擅改行事曆）；只導航回10/15/F1，原20段id/label/text/style全部一致，沒有重匯或reset。不宣稱全庫其他資料未變／全角色驗收。
- PR16事前f5a85db本地/remote一致且乾淨，modifier只有其既有Vite；fetch再次核對後普通merge本追蹤為 **a1cc476be18d3de4f139012df19d0a944bb31319**推送。原seed schema preflight、CSS banner contrast及docs差異保留，不force、不合main。PR16本機 **527/527**＋build成功 **index-CvTLu1kI.js**（此local bundle不是staging bundle）；Tests **38415541991／38415530930**、smoke **38415542250／38415530221**全部success，仍draft/MERGEABLE。staging push同SHA Tests **38415477950**（frontend/database/solver全success）及smoke **38415476759**success；不混用不同SHA CI。
- 真desktop1440×900：更多→自動排班→計算，實際 **aria-busy=true、計算鈕disabled、X與取消enabled、status明確說班表未改**；點取消在POST尚在途時回10/15，0 modal/PV。Network確見單次POST /plans/db（另一OPTIONS是CORS）於 **6.66秒**收到200，**晚回應後仍沒有PV**且原20段逐項一致，沒有使用這套／save_blocks／apply_plan。服務端可能已寫preview/options，取消是前端不接結果，不能宣稱測試庫完全零寫入。
- 真手機尺寸390×844（Chromium CDP，不是原生Safari）：aria-busy/status相同、pageOverflow=false、X/取消/計算鈕皆 **44px且中心命中**，只有計算disabled；對取消按 **Enter** 在途關閉，單次POST /plans/db於 **4.75秒**回200後0 PV/modal、10/15/F1及20段id/label/text/style全部不變，觀測沒有save_blocks/apply_plan。手機最初一次More操作因前一輪抽屜仍開而把它收回，auto locator no-match；重新讀DOM後正常展開，屬測試前置狀態錯誤，不当產品缺陷或跳過驗收。
- 桌面／手機busy截圖 **outputs/staging-plan-busy-desktop-dfc2486-20261013.png、outputs/staging-plan-busy-mobile-dfc2486-20261013.png** 分別1440×900/390×844，已目視；新提示及disabled對比清楚，不新增CSS。只是本機保留、不公開artifact。最後關閉More，Network.disable及Emulation.clear皆完成；真runtime warn/error查詢0（工具記錄有限，不代表後端／平台全無錯），date10/15／0 modal/PV，保留test sessions及Chrome待設定帳號，不改密碼。
- **新增精確重現：startup health 3秒timeout**。Network首次 /health request22056.1779被 **net::ERR_ABORTED/canceled，3013ms**中止，UI因此顯示瀏覽器算法；後來正常UI「重新連線排程服務」/health200耗 **454ms**、UI OR-Tools9.15.6755，才進行上述真POST。確證的是初次3秒中止及之後恢復，冷啟動是Free服務背景下的推論，不宣稱服務端cold原因已由log證明。下一輪安全改進可在使用者要求計算時做有界健康重試／等待，整合本輪job取消保護，不讓老人家自行找重連入口；先重現函式測試，別直接放寬正式timeout或誤把fallback標成ORTools。
- 本輪只staging前端部署/計算預覽，沒有排程套用／改正式資料或服務。角色/不同帳號及自動同步、真ORTools套用、offline/409/原生Safari、正式VITE_TEST_*門檻仍未全過；PR16/18保持draft不合正式。nightly仍待加密main發布；Codex10分鐘追蹤ACTIVE，持久環境保留，下一項缺陷探索继续。

#### 2026-10-13 22:23 heartbeat／22:32：計算在途連點、取消與過期結果修復

- 起點8c0513d乾淨；確認無其他modifier/deploy，原5202 Vite仍在；本輪新啟的同port IPv6 Vite為session45566，收尾停止此新增副本，保留原5202。指定交接已讀；舊NEXT_TASKS的0037／staging deploy hook／寄信待同意歷史不重做。寄測試帳號設定信已獲准及送出，沒有新第二帳號登入證據，不重寄或改密碼。正式1023/0037/setup_pending/角色授權以及測試Supabase排程零寫入。
- 新測試執行 **真app openPlans/openPlansSolver/openPlansLocal/openModal/closeModal函式**（Node VM、明確合成transport，非source字串成功斷言），修前8項 **0 pass/8 fail**：同步三連點送3次、取消後成功仍進PV、取消後error仍排備援timer、換modal仍接舊結果、舊結果以新S重新包base、切user/store/epoch/version仍接受、local timer取消仍計算、沒有loading/retry狀態。沒有製造真雲端競爭或宣稱刪除服務端已計算的preview。
- 最小修正固定每次計算的modal/PV、store/user/authEpoch、S身分/序列化base/version；同一在途工作不重送，關閉／換彈窗立即失效，await及local timer再驗，拒絕過期結果且不重啟備援。新工作不被舊finally清掉，正常error/空方案會解除busy可重試；本機timer例外也被捕捉。服務端已送出的計算未Abort，取消的是接受結果，不宣稱後端計算／preview記錄已撤回。
- 原modal新增aria-busy、三語「計算中，可取消；班表尚未變更。」並停用非close操作，關閉X／取消及Escape沿用可操作路徑；無CSS/Gantt/抽屜/日週規則變更。Impeccable context及harden/craft-floor全文，detector一次[]；不是完整a11y/真機Safari驗收。操作及關閉生命週期涵蓋auto/fault/leave/order/recover共用入口，其他事件表單需真瀏覽器後續覆核。
- 聚焦先49/49成功；擴充至11項時timeout備援測試因VM跨realm microtask未排完而fail，改setImmediate單次flush而未放寬斷言，**11/11成功**。初始完整 **525/526** 不當綠；修fixture後完整526/526，最後補跨身份不重畫舊modal保護，再重新全套 **526/526／0 fail**（51.15秒）＋build成功 **index-DhxFvM8v.js**，既有chunk警告保留。完整log僅本機outputs/plan-race-web-tests-final-20261013.txt。
- 真本機 **http://localhost:5202/?local=1**（與正式無連線、0當日示範色塊）從更多→自動排班→計算，確實生成3套瀏覽器備援方案；直接取消回10/13/1廠、0 modal/PV/色塊，runtime warn/error查詢0。計算太快，未捕捉新busy可見／中心命中或在途Escape的真UI，不以VM測試冒稱手機/桌面busy全部通過；沒有套用或儲存。tab25保留續測。
- runtime **01740ea** 已提交；最新main8ff680c/7101cc9/8c5e609僅另一agent文件15行，以普通merge保留為 **dfc24865a413a11c7135b18054efbb5625a8fd8f**已推。同SHA Tests **38414186563／38414175203**、smoke **38414186826／38414175427**均 completed/success。PR16尚未同步此版、兩PR仍draft，staging仍99d0760，不把本機新build當線上已更新。接續安全同步乾淨PR16、FF既有staging source並核真正auto-deploy/live SHA（App範圍已縮小factory-only）、busy/取消真桌面手機及錯誤記錄；門檻未全過不合正式。Codex10分鐘追蹤ACTIVE，不因526綠結案。本機取消後截圖outputs/local-plan-cancel-20261013.png不當雲端seed證據。

#### 2026-10-13使用者要求線上測試資料／同意自行處理測試登入

- 使用者要求實際部署網站可測拖曳，並回覆「你自行處理，沒有密碼就創新帳號，不要再詢問我而停止作業」。視為同意前一題具體的測試帳號設定信用途；既有帳號存在，不額外建立重複帳號，也不替本人輸入／修改新密碼。**先前寄信同意尚缺的阻礙已解除**，不要再沿用舊段落或重複詢問／重寄。
- 真 staging tab20 普通網址 **https://factory-scheduler-web-staging.onrender.com/** 仍 qa-lead session；10/15／1廠確見原20個可操作色塊，包含 M20 的13:00–14:50及測試裁切／沖壓／焊接／組裝工序，沒有重匯／reset／改排程。既有12人8資源20單103段的匯入及先前單段move/undo實證不重做；本輪不是新部署，也不把正式網址 ?mode=test 尚未配置當已可用。
- 另開 Chrome 獨立未登入頁，既有登入UI填 **me0608623+test-lead@gmail.com** 後單次按「忘記密碼／設定邀請帳號密碼」，先見disabled，再真正顯示「若此帳號存在，密碼設定信已寄出。請開啟信中的連結。」這是服務接受寄信請求，不是親自核對信箱送達或第二帳號登入成功；沒有讀或猜密碼／權杖、沒有新增帳號或改角色。新密碼須本人在手機收信後自行完成，不可由agent代填。Chrome tab1703573257保留handoff；本機證據outputs/staging-test-password-request-20261013.png，不公開artifact上傳。
- 手機交付：使用上述獨立staging網址、該測試Email，選2026-10-15／1廠，先測 M20 下午段往後10分鐘→預覽取消，再確認套用／復原。資料不共用正式1023；目前Realtime仍中斷，另一裝置需按「更新班表」補讀。正式測試模式發布、不同帳號角色／自動同步／ORTools真套用等門檻仍未全過，不合PR16/18或正式部署。本輪只有獲准測試Auth寄信請求及UI導航，正式1023零寫入。持續追蹤未停止，接續安全競爭測試，不因等待本人設定密碼而停止其他工作。

#### 2026-10-13 22:17：依本人回覆縮小 Render App 倉庫授權

- 使用者明確選擇「只允許 factory-scheduler」。既有 installation **170996374** 從 All repositories 改為 Only select repositories，僅選 **me0608623/factory-scheduler** 後按 Save；GitHub 導回 Render，重新開原 Configure 讀取已保存狀態：Only select repositories checked、Selected 1 repository、只有 factory-scheduler、Save/Cancel disabled。沒有新增授權、改密碼或重裝 App；其他公開倉庫仍有 GitHub 頁面註明的 read-only 例外，不宣稱完全禁止讀所有公開程式碼。
- 本機證據 **outputs/render-app-factory-only-20261013.png** 已保存並目視，沒有公開上傳；GitHub 設定與既有測試 session tabs 保留 handoff。Render MCP 再核 staging web repo/source/root/autoDeploy 仍正確，最新 live **99d0760 / dep-db73bb6q1p3s73euliag**（原 new_commit 事件），沒有為權限縮小製造空提交或重複部署。這不等同縮小後又發生新 push 的 webhook 驗證，下一筆安全 runtime 更新時再核對。
- 起點 e3a8153 工作樹乾淨；其同 SHA Tests **38411091684** 及 Deployment smoke **38411091856** 均 completed/success。本次只收斂 GitHub 安裝範圍及補紀錄，沒有程式變更，沒有 Supabase/正式1023寫入，也沒有合 PR16/18 或正式部署。發布門檻與下一項 auto 計算在途連點／取消探索仍依下段記錄；未進行的競爭測試不當通過。Codex持續追蹤未停用。

#### 2026-10-13使用者確認Render授權／22:08：自動部署恢復、新版真雲端套用復原及補讀

- 起點1715e56乾淨、無其他modifier／deploy；只有專屬Vite/esbuild。PR16 f5a85db Tests **38406785146／38406776111**及smoke **38406784793／38406776055**實查全success。最新main後續3筆只新增另一agent文件15行，以普通merge保留为 **c4f8f3fcea887f712b669773d13c9038ba68708d**，不切共享checkout、不force、不合PR到main。以下是**staging**驗收，正式1023/0037/setup_pending/帳號個人權限及正式服務未操作。
- 使用者明確回覆Render App授權已確認。tab23仍舊Install預览且只勾factory-scheduler；按此前已確認Install后GitHub回「GitHub App has already been installed」，沒有重複安裝；再讀Installed GitHub Apps確見新Render installation **170996374**。這證明本人已先完成，舊分頁是殘留表單，不再次點預設變回All的Install。實讀新Configure發現**All repositories已勾選**，不是先前本agent的Only selected預览；未擅自擴張或縮小現有授權，已詢問是否收斂factory-scheduler，仍待答覆，以免影響其他Render倉庫。所有本輪操作只在factory-scheduler及既有staging服務。
- 用Render-deploy全文及deployment-details/post-deploy-checks，確認staging來源ae1為99d祖先後安全FF **ae1bbb4→99d0760f50dde192e9a7b508a77999e2a8b05011**（已有完整515回歸且7a同runtime CI綠），未手動trigger/toggle/cache或新增費用。立即出現 **trigger=new_commit／dep-db73bb6q1p3s73euliag**，13:44:37Z live99d0760；該push同SHA Tests **38407400017** frontend/database/solver全部success、smoke **38407400938**success。對照安裝前多次push無deploy、App安裝後首次真new_commit，auto部署恢復已實證。solver root沒有改動，不重複部署。
- 真qa-lead@factory-scheduler.test（組長）舊tab20載入新版普通root，bundle **index-Cm7LbyXf.js**；起始blank快照只是boot未完成，後續正常雲端board，不能把它當啟動崩潰。reload預設回今天10/13，UI導航回10/15/F1後，原 **20段aria-label/text/inline style逐項一致**，沒有清空／重匯資料。新版profile契約在真Auth session可啟動，但尚無不同角色/不同帳號證據。
- 真「按此更新班表」動作查證 **POST fkefarcwadvyqqjcjxvp.../rpc/schedule_snapshot＋GET change_sets**，回應200后画面原20段仍一致，日期廠別不變；未讀／列出JWT、headers或body。這是實際補讀＋渲染，不只HTTP200或source斷言。Settings姓名改成TEST-UNSAVED-PROFILE後Escape取消，無儲存，重新開仍原名，班表不變；沒有聲稱真背景事件在草稿中發生（Realtime中斷）。
- 第一輪auto preview明確為 **瀏覽器備援**，Network沒有/plans請求，不當ORTools成功。帳號與連線→重新連線排程服務，實查staging /health200、UI變 **OR-Tools9.15.6755**；再算真正 **OPTIONS＋單次POST /plans/db200**，生成3套OR-Tools方案，選不同方案與跨日差異可見。最初健康檢查未抓Network，僅來源證明ordinary cloud health timeout3秒且solver Free，可疑冷啟動／一次up=false不再嘗試，但**具體初次失敗原因未實證**，留待後續重現。計算可能在測試DB建立preview/options，不宣稱測試庫零寫入；未按ORTools「用這套」或apply_plan。
- 手機390×844：最初browser viewport作用user tab22而非agent tab20（讀得641×524），明確剔除。改用tab20 CDP Emulation，DOM確認390×844、pageOverflow=false，展開的取消/用這套 **48px且中心命中**；瀏覽器備援與真ORTools各直接取消一次，回10/15/F1且20段逐項一致，無schedule寫入。1440×900另確認桌面右面板、OR-Tools/三方案/日期差異。只Chromium尺寸，不是原生Safari。一般screenshot在emulation有工具截圖縮圖問題，不能当完整手機證據；改Page.captureScreenshot明確clip，PNG尺寸1440×900及390×844正确並目視：**outputs/staging-ortools-desktop-99d0760-20261013.png、outputs/staging-ortools-mobile-99d0760-20261013.png**。手機頂部較長且開抽屜時本次截圖未見甘特，收合/捲動實際觀看仍待探索，不宣稱全UI門檻通過。
- 真新版手動套用／補讀測試（明確同一qa-lead的tab20/24，不是不同帳號）：未來10/15 M20裁切160件tst01 **13:00–14:50→13:10–15:00**，110分鐘/件數不變、0連帶工序、仍10/21期限前完成；只在已核對的隔離庫。暫以Network.setBlockedURLs阻擋staging /notify/line，防測試訊息外發，不改通知設定。確認後**save_blocks單次POST**（另一OPTIONS是CORS，不是連送），雲端已儲存；第二端仍原時段，按新版更新班表後真正看到13:10–15:00及固定標記。這放行UUID成功確認與單次補讀看到他端寫入，不是Realtime恢復。
- 再按正常「復原上一步」，另一單次save_blocks POST200完成，第二端補讀後 **原20段label/text/style逐項一致**。原fixture資料正常還原，但保留兩次版本/稽核，沒有倒轉version、刪歷史或reset；沒有比較全DB指紋。這是新版手動move/undo，不是ORTools apply_plan。全部Network阻擋已清urls=[]並disable，Emulation已clear，browser viewport已reset。真tab20 runtime warning/error查詢0，工具記錄範圍有限，不當後端/platform無error；Realtime徽章仍中斷。
- 發布仍未過：不同帳號登入/角色權限、Realtime自動同步（或明確接受降級）、真ORTools套用、offline/409瀏覽器及原生Safari/正式VITE_TEST_*未全驗。第二帳號設定信同意仍缺，不能寄信、猜密碼或改角色；PR16/18維持draft、未正式合併部署。nightly **367614493**實查disabled_manually至加密main安全發布，Codex10分鐘追蹤ACTIVE。下一轮先核對最新CI及App範圍答覆（无答不改），優先安全探索cold health false後的恢復／auto計算在途連點取消（目前僅DOM看到計算鈕仍enabled，未製造競爭，不當已確認bug），並保留單段不reset的驗收基準。tab20/24測試session、21Render、23安裝設定handoff。

#### 2026-10-13 21:32 heartbeat／21:38：個人資料及權限晚回應污染修復（僅隔離本機）

- 起點ddb35cf乾淨，無其他modifier／deploy，僅原Vite/esbuild；指定交接及最新checkpoint已讀。ddb35cf Tests **38405625230**與smoke **38405624810**成功。最新main72a0b48只新增5行另一agent文件，普通merge保留；正式1023／setup_pending／0037／帳號授權及測試Supabase均零寫入。
- 沒有收到Render App安裝同意，**不按Install／新增Git存取**，也不重複詢問。tab23仍為僅factory-scheduler的安裝预览，兩份Git/Render證據以先前實測為準，不把帳號憑證存在当App已安裝。第二測試帳號設定信也無同意，不寄信／猜或改密碼；autoDeploy不toggle，不用人工deploy繞過工具限制。staging仍未驗新SHA，不合PR16/18／不正式部署；nightly仍待加密main發布。
- 新真SupabaseStore函式測試先有測試fixture箭頭括號語法錯誤，修正後才作RED判定；4項實際測試 **4 fail／0 pass**：_profile的profile及permissions两段讀取可混入新帳號／client／同UID新登入生命週期，角色在grant完成前已先修改，updateProfile舊RPC會改新帳號name。不是雲端或瀏覽器實證，transport完全合成，不讀真帳號資料／秘密。
- 最小改_profile：固定client/user/authEpoch，两次await後核對；兩份結果成功才同步接受role、employeeId、userName及grants。讀取錯誤且仍為原session時清role/permissions/employeeId，避免舊write cache；過期回應不清新帳號的權限。updateProfile只在同一身份/生命週期/client才接受姓名回應，相同UID正常token刷新仍可成功；已送出的RPC不能撤回，拒絕的是其本機晚回應，不宣稱雲端寫入已撤销。
- 追加null／錯型權限回條驗證另有 **1 fail／1 pass**，修復後profile必須有合法角色，permissionRows必須為record array且allowed為boolean；缺profile或畸形權限不當空授權／默认可寫，error與transport reject都fail-closed。前端不修改任何資料庫role或個人授權；既有四角色enum與boolean schema只唯讀核對。原auth-session fixture補明確thenable空grant rows，沒有放寬斷言。
- 新profile-session **6項**覆蓋两阶段×三种身份变更、寫姓名三負一正、正常token、半份授權不採用、失敗清舊cache、6種畸形grant及缺profile、profile失敗不查grants。前4項＋既有Auth/真PGlite Store回歸 **23/23**是在追加契約防護前；之後最終聚焦 **8/8**，最終完整web **515/515／0 fail**（54秒），build成功（index-D67ONLEY.js），原chunk警告保留。只store/backend邊界邏輯及測試，沒有UI/CSS重設，不宣稱瀏覽器真人Auth/手機版型／跨帳號同步完成。
- runtime **99d0760**已提交，普通merge最新main為 **7a307b8813b5584a28cadd991e14a90a1d5d384d**已推。PR16事前e76796c本地/remote一致且乾淨，只既有Vite/esbuild，普通merge到 **f5a85db1269f1bad6002a09b808730082d08f705**已推；原3項runtime/test差異與2份docs保留。這兩個新SHA CI須後續核對，不能拿上一個e767/6f綠冒稱它們綠。
- 下一項安全探索：同一session的多個_profile並行／授權變更讀取晚回應次序，以及init/login在途SDK結果是否可復活登出身份；尚未測，不當已確認缺陷。log_change無version的UUID遺失仍待設計安全核對，不能盲重試重複稽核；故障重排、OR-Tools真套用、跨帳號/角色/雙端/offline/409/原生Safari仍門檻未過。工作環境保留，Codex10分鐘追蹤ACTIVE，不因515綠結案。
- 最後核對：7a307b8 Tests **38406469537／38406463149**及smoke **38406469485／38406463975**全success；PR16 f5a85db Tests **38406785146／38406776111**仍in_progress，smoke **38406784793／38406776055**success。新建置未部署，不用持久分支綠冒稱PR16全CI已完成。tab23/21/20 handoff重新保留，工作區乾淨。

#### 2026-10-13使用者續作：最新CI全綠，GitHub Render App未安裝，停在新增授權前

- 持久工作樹7309aaa乾淨，無其他modifier／deploy；僅專屬Vite/esbuild。main仍c58032b、staging source仍ae1bbb4，沒有改共享checkout或正式1023／setup_pending／帳號權限；沒有雲端資料寫入。
- 6f37083的Tests **38404332390／38404326289**、smoke **38404332297／38404326429**全部success；PR16 e76796c Tests **38404364111／38404358613**、smoke **38404364044／38404358653**全部success。兩個Tests各frontend/database/solver jobs全success，不把CI當登入／同步E2E。
- 使用Render-debug及render-deploy（全文及deployment-details/post-deploy-checks），MCP再核staging web：autoDeploy=yes／commit、root=web、source branch正確；latest只有5476a60 live／dep-db70mojrjlhs739hte6g，沒有新queued/failed deploy，故不是建置失敗。正式web/solver未觸碰，不手動deploy autoDeploy服務或toggle/cache繞過限制。
- 真UI核對：Render服務Source→Edit的Git Provider面板顯示Connect Git provider；但Account settings又確實有既有me0608623部署憑證。因此**更正先前簡化推論**：不是單憑Connect字樣就宣稱沒有任何Git credential。GitHub已登入同一個me0608623，Installed GitHub Apps清單**沒有Render**；依官方git-provider文件進既有診斷連結，最後是Install Render新安裝頁（非既有Configure），這才是新確認的缺失。Render殘留credential不代表GitHub App實際安裝／webhook可用；安裝後是否真的恢復auto仍需push＋deploy事件實證，尚不當已修復。
- 點Render的GitHub/Configure on GitHub按鈕都沒有出現新分頁（IAB inventory及console無可確認結果），未盲目重點／JS window.open。改用已登入GitHub的標準Installed Apps頁及官方連結，只讀／選取安裝預覽，不增權限。API key欄未展開或讀值，沒有新增credential／PAT／hook或secret。
- 安裝預覽已選**Only select repositories → me0608623/factory-scheduler（僅1個）**，尚未按Install。頁面要求讀code/metadata/Dependabot及讀寫Actions/checks/status/deployments/environments/issues/PR/hooks/workflows，並標明公開repo亦可read-only；屬新增security-sensitive授權，必須使用者當下確認，不能把「全權處理／更新測試站」當本次授權同意。正向Git部署憑證仍保留，沒有Disconnect；Render設定未存任何改動。
- 本機授權截圖outputs/render-app-install-review-20261013.png已保存及目視，未上傳公開artifact。GitHub tab23停在Install前，Render tab21與qa-lead測試tab20均handoff；user tab22保留。下一步等使用者確認最小Repo Render App權限，再核裝好且source能列repo；CI綠後安全FF既有staging來源到新runtime、查真auto事件/live SHA/bundle、再做實際測試。沒有更新成功前不拿舊版5476的DOM當新版回歸，不合PR16/18或部署正式。
- 第二帳號登入／設定信同意仍未收到，不猜／改密碼或寄信。不同角色、跨帳號同步、OR-Tools真套用、offline／409與原生Safari仍未通過。新備份安全版尚未main，nightly維持停用；Codex10分鐘追蹤繼續ACTIVE，授權阻礙不停止其他安全缺陷測試。

#### 2026-10-13 20:50延續／21:16 heartbeat：UUID儲存回條與帳號生命週期競爭防護

- 起點4a44611；8份未提交檔是本對話上一轮留下的修正／測試，沒有他人modifier，只有專屬Vite/esbuild。本輪延續它們而非重寫或丟棄。最新main c58032b相較11c7d9c只新增另一agent進度文件；普通merge保留，沒有改共享checkout／force。全部指定交接與最新checkpoint已讀；歷史NEXT_TASKS仍有已完成0037等條目，不照過時清單重做。
- 上輪ae1bbb4與PR16 e00c61e的Tests及smoke全成功；ae1另有staging branch的Tests38400538398／smoke38400538402成功。已安全FF將既有staging來源由2d040d0推到含web改動的ae1bbb4。但21:19左右Render MCP仍只有5476a60 live／dep-db70mojrjlhs739hte6g，沒有新增deploy；**來源SHA不等於live SHA**。不手動trigger autoDeploy服務、不toggle設定、不清cache或部署未驗新版；solver未改，不重部署。Render-monitor指引只作非侵入部署狀態核對，未查私密env/hook。
- Render登入舊提醒已更正：使用者說未看到側邊登入頁，重新開既有staging Settings，實際已登入，不需密碼。tab21保留可見交付；截圖outputs/render-visible-20261013.png只含服務頂部及General，無secret。舊tab15/16/17/18已不在inventory，僅tab20的同一qa-lead測試session仍保留；不要假定消失tab還能操作／另一帳號已登入。沒有寄設定信、猜密碼或改密碼。
- **save_blocks確認缺陷**：0017實際回change_set UUID，但前端只檢error便升版本。新增缺漏／錯型回條測試修前1 fail／1 pass，修後8種畸形回應保持待確認、不改version/base/protectedBase；有效大小寫UUID只寫一次。真本機PGlite＋全部migrations＋真SupabaseStore/queueSync，transport故意在SQL已提交後丟UUID；重試40001後重讀已提交結果，確認一個block、一個change_set、version=1，沒有第二次寫入。Auth是明確合成stub，不是雲端登入／雙帳號實證。
- **帳號切換競爭**：上一轮3項真函式測試已確認舊排隊snapshot可能送到新STORE/帳號/新登入生命週期，晚RPC會污染新baseline，SIGNED_IN新身分不清舊role。本輪完成authEpoch、同步SDK callback清session/權限及channel、queued write固定store/user/epoch，await前後核對；Store每個寫入await後確認身份一致，停止後續語句及remember。相同UID正常TOKEN_REFRESHED不被錯殺；身份已失效的重試不新增寫入，明確提示重新整理確認帳號（三語齊全）。無新登入API／權限擴張。
- **讀取及409恢復第二層漏洞**：新增4項修前全fail：Store.load晚snapshot或history可覆蓋新baseline、foreground recovery無身份防護、同UID刷新正向baseline未統一接受、切帳號後舊恢復成功toast抹掉新狀態。Store在snapshot/history兩個await後檢client/user/epoch；所有reload先remember=false，接受時才一起記baseline與render。背景原草稿／預覽／拖曳／在途及失敗寫入guards不放寬；foreground保留正常衝突rollback能力但也檢帳號生命週期。queue在恢復讀完再核對，不改新帳號S/SYNC，不報舊帳號成功。
- 聚焦首次50項有2項失敗是既有VM harness缺新增tx邊界；補tx mock而未鬆斷言。初始全套507/509不當通過；修harness後重新完整跑 **509/509／0 fail**（56.4秒），包含上述所有新增測試。另manual refresh/reload/auth/undo **29/29**及build成功（index-CPs1acFX.js），既有chunk警告保留。Impeccable context一次及harden/craft-floor全文、detector app/i18n/store一次[]；只改既有安全錯誤回饋，未改Gantt／抽屜／灰底／字體設計，不當全面視覺QA。
- runtime **2b5bf92**提交後普通merge最新main為 **6f37083**已推；PR16事前乾淨且e00c61e本地/remote一致，僅既有Vite/esbuild，普通merge為 **e76796ce6fd8feca0a1d7c5621002dba6cd7dc1e**已推，原3份runtime/test差異與2份docs保留。最新SHA CI待核對，不用ae1綠冒稱新版本綠。PR16/18仍draft、沒有合main／正式部署；nightly仍等待安全加密版进入main，Codex10分鐘追蹤繼續ACTIVE。
- 本輪正式1023／setup_pending／0037／角色授權、測試Supabase完全未寫入；新mutation僅本機拋棄式DB。缺第二帳號登入／寄信同意、OR-Tools真套用、真不同角色與跨帳號同步／409／offline、原生Safari仍未過。舊live5476的手動M20 apply＋undo不能當新帳號防護雲端E2E。下一輪先查6f37083/e76796c同SHA CI及staging自動部署原因；**log_change也回UUID但無version，回條遺失的安全冪等恢復尚未處理**，不可盲套save_blocks重試策略。另_profile/updateProfile等非schedule寫入的身份切換仍待真函式重現，不宣稱全Auth路徑已保護。
- 21:23實查：6f37083 Tests **38404332390／38404326289**仍in_progress，smoke **38404332297／38404326429**success；PR16 e76796c Tests **38404364111／38404358613**仍in_progress，smoke **38404364044／38404358653**success。用完整40位SHA查證；首次短SHA查回[]不能當沒有CI。nightly **367614493**再查disabled_manually。tab21交付、tab20 handoff已重新標記，本機與持久分支保留；不因509綠停止追蹤。

#### 2026-10-13 20:12 heartbeat／20:45：儲存確認、衝突佇列覆写及Render既有登入恢復

- 起點f731e4c乾淨，無其他modifier／deploy，僅原Vite/esbuild；全部指定交接讀取，main仍11c7d9c。上輪2d040d0 Tests **38395295245／38395289396**與smoke **38395295244／38395289506**、PR16 de0957b Tests **38395359154／38395350915**與smoke **38395359346／38395350794**均實查success；docs-only f731e4c Tests **38395513041**與smoke **38395513030**success。這不是發布門檻全過，不合main，不重做0037／匯入／還原。
- 新儲存契約缺陷：7條回版本的RPC（rosters、transfers、rush、work_log、work_contents、work_assignments、groups）會用Number(data)無條件接受null／畸形回應，並記住錯誤baseline。真正SupabaseStore＋明確mock transport的8項測試修前 **7 fail／1 pass**，修後只接受安全數字且恰為previous+1；13種缺漏／錯型／錯版本均拒絕，不改S.version/store.version/base/protectedBase，不以HTTP成功當確認。
- 新UnconfirmedWriteError明確表示「儲存结果待确认，重试核对，修改保留」，不能把可能已提交的回應遺失說成確定沒存到，也不誤報成功。Impeccable main/context一次及harden/craft-floor全文已讀，只改錯誤回饋／安全邏輯，不改Gantt／抽屜版型。兩個新增提示en/vi/th齊全；初始app/i18n/store detector為[]，不當全面手機／桌面視覺驗收。
- 真本機PGlite＋全migrations（Auth為明確stub、合成帳號，非真Supabase登入）：直接執行全部7 RPC，確認它們實際返回數字且每次version+1，不是nullable/void。另執行真queueSync＋真SupabaseStore＋真SQL：首筆group寫入已commit但transport故意丟掉確認；第一次UI保持error/待確認，版本基準不先跳；按重試遇版本衝突，真正重讀已存結果。最终該group與change_set各一次，version=1，未把一次重試當第二次成功寫入。其他void RPC／save_blocks UUID回條未改，不能宣稱所有寫入契約都已驗過。
- **新P0級 lost update 實證**：第一筆group修改被transport暫緩，第二筆本機快照先排進queue，再讓另一寫入先commit REMOTE；原queue第一筆40001後load最新baseline，第二筆舊快照卻用新版本寫回。真SQL覆核顯示REMOTE被刪，只剩LOCAL-A/B；新第11項修前 **10 pass／1 fail**，不是只看字串或toast。僅本機拋棄式DB，未在正式／測試雲端製造此衝突。
- 最小修queue generation：衝突／權限恢復讀取前後各遞增epoch，舊快照及恢復期間新排的快照均不自動重放；讀完後新動作仍可正常儲存。修後同SQL實證REMOTE保留、version仍1、LOCAL-A/B change_set=0。正常兩次成功仍依序寫入。恢復結果真的applied才說已載入／已還原；failed或reject保持error/待確認，reject也不打斷整條syncChain。新增reject探針修前確有unhandledRejection，修後有界3項queue測試通過。過程首次patch因原try/catch在同一行而context不匹配，未套用；讀實際原文後重新patch成功，沒有猜測改寫。
- write-confirmation共 **14項**，含7×13畸形回應、真SQL契約、回應遺失重試、真衝突舊佇列、failed/reject恢復、恢復期間新佇列、正常順序；既有undo測試只補epoch初始化，沒有放寬断言。修復各階段聚焦通過；最後全web **497/497／0 fail**（87.8秒）及build成功（index-DMIDQlxN.js）。先前493綠不取代新增P0修復後最後497結果；同SHA CI推送後仍待核對。既有chunk警告不改。
- **Render登入阻礙已有實際改善**：tab17點既有「GitHub／Last used」後直接進到staging服務，沒有輸入／變更密碼、沒有新的Authorize頁或新增授權；不再說需本人登入Render。只讀Settings的Build／Auto-Deploy，不開Environment，不讀金鑰／Deploy Hook。畫面確認來源branch codex/excel-friendly-ui-20260930、root web、On Commit、Git Credentials為既有本人、沒有列出的include/ignore paths；這不能證明GitHub App／webhook全正常，也不能確立自動部署失靈根因。完整AX設定不輸出，僅篩選非私密欄；OAuth callback參數未存入文件／截圖。
- 用Render-deploy主指引與deployment-details/post-deploy-checks核對，只更新既有staging來源：確認8ffa475為2d040d0祖先後，**fast-forward推2d040d0至原staging branch**，沒有切共享checkout、沒有force／改服務配置／新增服務／費用。該SHA上一輪CI已全綠。更新後兩次MCP及畫面均仍只有 **5476 live／dep-db70mojrjlhs739hte6g**，最後20:45實查沒有新deploy；不能把source push冒稱部署完成，也不手動trigger autoDeploy=yes服務來繞過限制。solver程式未改，不重複部署。登入後設定截圖 `outputs/render-login-restored-20261013.png` 保存並目視（只含服務頂部與General，沒有env或hook）。tab17保留handoff，後續可直接診斷不需重複求登入。
- 本輪正式1023、0037、setup_pending、角色／個人授權、測試Supabase全未寫入，所有新mutations只在本機拋棄式PGlite。另一測試帳號及設定信同意仍缺；真跨帳號／OR-Tools apply／新版補讀與衝突的雲端E2E／原生Safari未過。PR16/18仍draft，正式未合併／部署，nightly仍等加密main安全發布，Codex10分鐘追蹤ACTIVE。下一輪先核對最新CI，再推含web改動的新runtime SHA到原staging分支並查auto deploy／在已登入Render診斷；勿重做旧M20寫入／復原。之後優先驗save_blocks UUID確認與登入切換時的在途寫入，不以目前7條數值RPC測試放行所有路徑。
- 修正 **ae1bbb45a1214148710cb56327c1047b5493395b** 已推；同SHA Tests **38399869062／38399865301**仍in_progress，smoke **38399869003／38399865214**success（20:47核對）。PR16事前乾淨且de0957b本地／remote一致，普通merge至 **e00c61e3ccbf651e0138a3f614d42251686e885c**已推，原3項runtime/test差異及2份docs保留；Tests **38399967122／38399958772**仍in_progress、smoke **38399966821／38399958467**success（20:48核對）。nightly367614493再次實查disabled_manually。下一輪不可拿舊2d040d0綠冒稱ae1/e00全過。
- 後續若核對ae1 CI綠，staging source應FF至這個**含web變更的runtime commit ae1bbb4**，而不是本段記錄的後續docs-only HEAD；已推的2d040d0最後一提交是兩份docs merge，rootDir=web的自動觸發是否只看該提交尚未證實，不把此猜測當根因。不得force／toggle autoDeploy／借UI手動Deploy繞過既有自動部署限制；無新事件則繼續從已登入Settings/Git connection核對或交接，不冒稱新版已live。

#### 2026-10-13 19:52 heartbeat／20:08：斷線單次補讀與非彈窗草稿保護

- 起點7751ce8乾淨，無其他modifier／deploy，僅專屬Vite/esbuild。最新main仍11c7d9c，新增提交僅兩份agent文件；不重做正式0037、備份還原、C1–C7或測試資料匯入。7751ce8同SHA Tests **38392987907／38392982273**、smoke **38392987997／38392982212**全部success，實查frontend log **474 tests／474 pass／0 fail**，補足上一輪追加測試後完整回歸的證據。
- 上一輪同帳號tab20確實在Realtime中斷時維持舊M20時段，只有reload才見雲端寫入。本輪以真正sync switch case＋真正reloadFromStore/remote guards的VM執行重現：舊按鈕完全不讀取，9項中的初始6項 **5 fail／1 pass**。新增單次手動補讀，沿用remember=false speculative snapshot及接受前後state/store/user/version/write/draft檢核；不新增定時輪詢、不寫資料、不變日期／廠別、不整頁reload、不宣稱Realtime恢复。連點在途只提示，無額外排隊；讀取失敗不立即重試。原本機說明、寫入error重試、寫入busy提示、已連線說明均保留。
- 頂部及sidebar於未連線且寫入ok時加「按此更新班表」，真實寫入／連線狀態仍分開顯示；6個新增提示en/vi/th齊全。Impeccable main/context及harden/craft-floor全文已讀，維持既有Gantt與抽屜，沒有CSS重設。detector app/i18n一次為[]；此為機械輔證，不是手機新文字版型或真雲端新按鈕E2E。
- 第二個真錯誤：傳輸reject null時原catch再讀e.message，造成未處理TypeError。新增真函式測試修前 **8 pass／1 fail**，修後null/undefined/string/object都回固定可讀錯誤並保留原班表，沒有假成功。正常Error保留原訊息。
- 第三個保護缺口：inline表格UI.editCell、二次刪除UI.confirmRow及設定抽屜的profile-display-name都不在原remoteReloadBlocked內，儲存格及姓名草稿只在DOM而非S。擴充真timer／manual測試修前 **18 pass／2 fail**；修後三種狀態都不讀取。守住settings整個抽屜是保守選擇，請完成／取消並關閉後再按補讀；本輪未新增全頁定時刷新，也沒有把來源讀碼當「實際雲端姓名遺失」的瀏覽器證據。
- 新增manual-refresh **9項**：執行真正case、補讀函式；另用真正SupabaseStore加明確mock RPC驗完整snapshot可接受、畸形{}不清空可見班表或寫入baseline。覆蓋連點、離線、讀取中開草稿、版本／帳號／store切換、正常／畸形RPC、非Error失敗及舊路徑；相關測試加翻譯棘輪 **38/38**。中途480、482、483通過不取代最後結果；三項草稿guard增加後重新完整跑 **483/483／0 fail**（89秒）及最終build成功（index-BWR-IV48.js）。舊大chunk警告保留。推送後同SHA CI仍待核對，不把本機回歸當staging E2E。
- Render tab17仍是Sign In，未重複詢問／猜密碼／改配置／手動trigger；新版尚未stage live，不能把5476的真雲端手動套用／復原當此新補讀或7751提示修復的E2E。沒有第二帳號或寄設定信同意，PR16/18維持draft、未合main或正式部署。nightly **367614493仍disabled_manually**（用api實查；workflow view不支援--json的首次工具查詢已改正）。Codex10分鐘追蹤ACTIVE，保留5個QA/login handoff。
- 本輪正式1023、setup_pending、角色／個人授權與測試Supabase均未寫入；上一輪測試M20正常apply＋undo的兩個版本／稽核仍保留，沒有倒轉或重置。下一步核對最新CI、安全同步PR16與main文件、取得Render登入後核對真正部署SHA，再驗新補讀兩端與離線／409；不同帳號、OR-Tools真正套用與原生Safari門檻仍未過，不能提前發布。
- 修正 **a68a0d6** 已提交；以普通merge納入main 11c7d9c的兩份docs更新後，持久分支 **2d040d094e846c4a73ec484a434d306418bcd3ae**已推送。main沒有被合入PR／改寫，沒有force。PR16事前核對1451cff本地／remote一致、worktree乾淨且只有原Vite/esbuild，普通merge到 **de0957bf4b6a5cdcd3d08d9577990770e203a3c4**已推；相對持久分支仍保留原3項runtime/test差異（seed preflight、banner對比、seed回歸）與其2份docs。
- **20:11最新核對**：2d040d0 Tests **38395295245／38395289396**仍in_progress，smoke **38395295244／38395289506**success；PR16 de0957b Tests **38395359154／38395350915**仍in_progress，smoke **38395359346／38395350794**success。未以先前7751綠替代最新SHA CI。PR16/18仍draft、沒有部署新版，下一輪先查上述run與最新HEAD，不重跑已通過的本機483、正式0037或原M20apply／undo。

#### 2026-10-13 19:31 heartbeat／19:49：真雲端手動套用、復原與成功提示時序

- 起點763795b乾淨、無其他modifier／部署，全部指定交接已讀。e0c0e4a的Tests **38390490847／38390484974**及smoke **38390490985／38390485079**成功；docs-only763795b的Tests **38390675837**及smoke **38390676007**成功。最新main仍11c7d9c，沒有新增runtime。PR16仍1451cff、staging來源8ffa、live5476，不把舊heartbeat的f6部署當新版。
- 真IAB qa-lead（組長）登入仍有效，tab15基準10/12／1廠19段保存。原班表有3個刻意保留警示；未整份auto重排，以免復原受舊異常資料驗證影響。首次S16 10/12過去時段微調被正確擋下「不能把新工作排在已經過去的時間」，確認套用disabled；取消後原19段aria-label/text/style一致，沒有寫入。
- 再選未來10/15的M20裁切160件（tst01），13:00–14:50→13:10–15:00，110分鐘／件數不變、0連帶工序、沒有衝突、交期仍10/19準時。選擇此段是首站且後站在10/17以後，原狀可依一般復原流程還原，不解除核定或改請假。tab20先read-only重新讀取；只檢查Network URL/方法/狀態，實查 **fkefarcwadvyqqjcjxvp.supabase.co/rest/v1/rpc/schedule_snapshot**，不讀或輸出headers/JWT/body私密資料。未確認隔離目的地前不按確認。
- **第一次真測試雲端班表寫入已完成**：tab15按確認套用，RPC save_blocks一個POST成功（另一200是OPTIONS CORS預檢，已以request.method辨明，非重複提交）。tab20未reload仍原時段，reload＋切10/15後確實看到13:10–15:00及固定標記，原時段不存在；不是只靠200或成功toast。再用tab15「更多→復原上一步」，等雲端已儲存，tab20獨立reload後 **10/15原20段DOM label/text/style逐項一致**，M20回13:00–14:50且未固定；tab15回10/12後原19段一致。這是正常apply＋undo的兩次版本／稽核寫入，沒有倒轉版本、刪歷史、重匯或reset；未做全DB所有欄位的指紋比較，不能冒稱完全沒有資料庫副作用。
- 測試只在指定隔離庫，用同一qa-lead的兩分頁；單段手動預覽是瀏覽器邏輯，不是OR-Tools方案或apply_plan RPC。**可放行的僅真組長手動套用／雲端持久化／復原**；OR-Tools真正套用、不同帳號/角色、Realtime自動更新、原生Safari及全PR新SHA仍未過。tab20未reload前舊資料與兩端「即時更新中斷」一致，不宣稱同步修好。
- 期間僅tab15暫時阻擋 */notify/line，避免測試訊息外發（不改LINE設定/權限）；完畢已Network.setBlockedURLs urls=[]及Network.disable，tab20觀察器也disable，沒有留下攔截／離線模擬。390×844的tab20真手機尺寸重讀原工作、160件與未固定正確，Escape取消查看、20段仍一致，viewport已reset。只驗手機讀取／開窗／取消，不當手機實際寫入。手機截圖 `outputs/cloud-apply-undo-mobile-20261013.png` 本機保存且目視；QA分頁及原Render/local session已handoff。模糊qa-lead名稱定位器匹配兩個button曾逾時，改確切top帳號名稱後通過，這是測試定位器問題。
- 真undo操作另重現「同步中已說已復原」的回饋時序問題；使用Impeccable harden（main、context一次、harden/craft-floor全文）最小改undo為async，保留原樂觀S/undoStack/commit/queueSync資料與衝突策略，只等commit回true才成功toast，false保留原「沒存到／已載入最新」錯誤，不再提前誤報。沒有新CSS／文案或資料庫變動，detector app一次為[]。
- 新4項實際undo函式測試修前 **3失敗／1通過**：pending、false寫入、版本衝突仍提前成功；修後4/4。再加1項真undo＋真commit＋真queueSync連動，只有STORE transport明確mock：pending busy且無success，一次寫入；offline error保留沒存到，成功才顯示已復原，kind=edit不發LINE。聚焦 **5/5**；全套 **473/473**＋build成功是在最後這1項追加前已啟動的run，不能稱最新474全套已跑；下一輪同SHA CI須覆核全部474。本輪沒有部署新版undo，stage的保存／復原證據是5476，並非此新提示修復的線上E2E；offline／409瀏覽器實測仍待補。
- 正式1023、0037、setup_pending、角色／帳號完全未動，測試雲端只上述一段套用後正常復原，保留原fixture與稽核。Render登入及第二帳號設定信同意都未答覆，未重複問／猜密碼／寄信；autoDeploy來源不明仍不盲目手動trigger。nightly停用、Codex追蹤ACTIVE，不因本輪成功停止。下一輪查最新CI後安全同步PR16，再做新版undo的離線回饋／HTTP409真驗收與有界安全補讀探索，不強行正式發布。

#### 2026-10-13 19:13 heartbeat／19:28：失敗畫面保留裝置偏好與部署診斷

- 起點920fc9a工作樹乾淨、沒有其他modifier／deploy，只見專屬Vite的esbuild；所有指定交接與最新checkpoint已讀，不重做密文還原、C1–C7或正式0037。前輪test-only920fc9a的Tests **38388544855／38388540284**及smoke **38388544964／38388540111**全部success。
- 實際缺陷重現（僅本機5202）：新開local QA介面自動建立本機示範資料，沒有任何Supabase連線／匯入；從真正設定頁選Light、Large115%、高辨識、English，DOM明確lang=en/theme=light/font=clear/--z=1.15。另一同origin的mode=test失敗頁reload卻回zh-Hant/theme=null/font=null/--z空及中文retry。首次用AX的checkbox角色找選项失敗；DOM snapshot證明其實為button[aria-pressed]，改用真button後完成實測，這是測試角色映射問題，不是產品按鈕壞掉。
- 使用Impeccable harden，main/context一次及harden/craft-floor全文已讀；不重設版面，只在失敗catch以現有loadPreferences/applyPreferences讀取裝置偏好並套用I18N，正常boot不提前接管偏好。getter被拒、storage不可讀／JSON損毀仍有安全重試；不寫偏好、不更改雲端／帳號。錯誤textContent經tx，4個已知測試設定／私密金鑰／無效快照提示補en/vi/th；未知SDK／動態錯誤仍原文textContent，不插入HTML。
- 新3項真main＋真settings＋真i18n回歸，修前總10項 **2失敗／8通過**（偏好未套及未進讀取保護路徑）；修後10/10，聚焦 **37/37**、全web **469/469**、build成功。測試以mock DOM/storage/client邊界但執行真偏好讀取、正規化、套用及翻譯，明確不是雲端登入或跨端同步。成功boot不讀錯誤頁偏好回歸及blocked getter、storage、JSON案例都執行。detector一次main/i18n為[]，原chunk警告保留。
- 真桌面及 **390×844 Chromium** 失敗頁均保留lang=en、light、clear、1.15，英文錯誤與retry可讀；手機Enter真的reload，URL仍?mode=test&view=catalog，兩鈕 **50.59px**且中心命中，pageOverflow=false。第一次viewport設定作用於另一現用tab而讀到1280×720，已明確排除、未當手機通過；重新在當前新QA tab核實390×844後才截圖與量測。不是原生Safari／故障雲端成功復原／畸形HTTP200 RPC負向E2E。
- before/after截圖 `outputs/startup-preferences-before-20261013.png`、`outputs/startup-preferences-after-desktop-20261013.png`、`outputs/startup-preferences-after-mobile-20261013.png` 保存在本機並目視覆核。viewport已reset，重複手機tab19已關閉；原staging qa-lead、local錯誤與設定QA保留handoff。5202本機偏好保留供後續，不影響staging/正式host。
- Render-debug診斷：staging web API仍autoDeploy=yes／commit，來源8ffa已推，latest只有 **5476 live／dep-db70mojrjlhs739hte6g**，沒有新queued/failed部署，不當作build失敗。GitHub /user/installations因現有CLI token不是App授權而403，**不能據此判定Render App未安裝**。Render Dashboard已登出，第一次登入redirect沿用歷史正式env next，未登入或讀env；已安全改next到staging service登入頁並handoff，請使用者登入Render（不索取密碼）。未建立GitHub App授權、未改服務配置、未清cache或再手動trigger autoDeploy服務。
- 官方[Render部署文件](https://render.com/docs/deploys)明確說自動部署需要connected Git provider、public Git URL來源須人工部署；這只是可檢查假設，**尚未證明本服務屬此來源或具體根因**。Repo hooks=0不足以排除GitHub App。缺後台登入不擅自擴權／切autoDeploy來繞過工具限制。CI綠／source已推不能冒稱新版live。
- 本輪修正與同SHA CI尚待推送／核對；PR16/18不合main、不正式部署，正式1023/setup_pending/帳號權限及測試雲端資料均未寫入。nightly維持disabled、10分鐘Codex追蹤ACTIVE。下一輪先查本輪CI、自動部署／登入，再在唯一有效qa-lead的隔離staging做真正套用及安全復原驗收（不重匯或reset資料）；同帳號两tab只能作單帳號兩端驗收，不能冒稱不同角色／跨帳號門檻通過。第二帳號設定信授權仍未答，不寄信、不猜密碼。
- 補核對（優先於上行待推送初始狀態）：runtime **e0c0e4a1328365749fe720185d59065aecef7dc7** 已推；Tests **38390490847／38390484974**目前in_progress，smoke **38390490985／38390485079**success，不宣稱全CI綠。工作樹乾淨、nightly367614493實查disabled_manually。PR16仍1451cff，staging來源仍8ffa而live仍5476，這幾個SHA不得混用；下一輪等e0c同SHA全綠再安全同步，不盲目部署。

#### 2026-10-13 18:58 heartbeat／19:06：啟動失敗的同環境重試與初始化保護

- 起點dde5a6c乾淨、無其他modifier／部署（只找到本輪自己的pwsh）；指定交接全部讀取。最新main11c7d9c相較已整合1e019僅另一agent進度文件，0037/C1–C7/密文消費者已過不重做；歷史NEXT_TASKS仍列待辦不當新授權。正式1023、setup_pending、帳號角色、測試資料完全不寫入。
- 使用Impeccable harden：全文、context一次、harden/craft-floor已讀，保持窄域既有login-card／btn／色彩與版面。7項新真main入口VM回歸修前 **6失敗／1通過**：沒有原環境重試入口；同步createClient/LocalStore初始化例外繞過catch；reject(null)讓catch再次拋錯。DOM與client邊界明確mock，不當Supabase Auth／跨端證據。
- main將constructor及boot納入async start的同一錯誤界線；錯誤頁有「重新整理後再試」按鈕，保留同網址／模式，連點只觸發一次reload並disabled。僅test模式顯示測試標示與明確「回正式資料」次入口，使用modeUrl去mode與auth hash，保留path/view；production/local錯誤不再用誤導的「回正式資料」代替retry。錯誤用textContent且null-safe、role=alert，初始焦點在retry；長字串overflow-wrap:anywhere。新增文案en/vi/th完整，不改班表、抽屜或日週切換。
- 新7項全通過，聚焦 **28/28**，全web **466/466**、build通過（原chunk警告保留）。Impeccable detector一次發現7個styles.css既有其他介面border/transition警告，與本輪單行overflow-wrap無關，不越域重新設計它們；main/i18n無新警告。
- 本機真正瀏覽器 http://127.0.0.1:5202/?mode=test&view=catalog 以未設定測試連線的fail-closed路徑呈現錯誤：桌面Enter及手機390×844實際click retry均重新載入並保持mode=test/view=catalog，沒有建立雲端client或改任何資料。手機兩入口44px／中心命中，無頁面水平溢出；桌面48px／命中，Tab到退出link、Shift+Tab回retry，初始焦點正確。此案例缺設定故重試後仍報相同錯誤，**不是**成功復原雲端連線、HTTP200畸形RPC負向E2E或真機Safari。
- 桌面computed樣式對比（工具依實際RGB計算）：error **5.87**、retry **7.38**、exit **6.34**，大於4.5；截圖 `outputs/startup-recovery-mobile-20261013.png`、`outputs/startup-recovery-desktop-20261013.png` 保存在本機，不新增公開身份資料artifact。viewport已reset，local QA與原staging session均markHandoff；5202專屬dev server保留。
- 同SHA CI／staging部署尚待核對，PR16/18不合入正式，nightly仍維持停用至加密main發布；Codex10分鐘追蹤持續ACTIVE。下一步同SHA CI綠後僅更新既有staging web，驗普通root既有qa-lead班表、test模式retry，再安全同步PR16。第二帳號密碼設定信仍未有同意，不寄信／猜密碼。
- runtime修正 **8ffa475d59b6e05e10f89b374c115ace16bdc2ca** 已推；Tests **38387910616／38387905785** frontend/database/solver三job全success，smoke **38387910610／38387905770**success。PR16工作樹乾淨、remote568ce40一致，僅既有vite/esbuild dev server而無modifier後普通merge **1451cff7b9fe22dd759cf4d5b599630e1c44e9c5** 已推，原3項實作/測試差異保留；Tests **38388107392／38388102276**及smoke **38388107553／38388103010**全success。未合main／正式部署。
- 補強同一constructor測試：使用真正@supabase/supabase-js的createClient('invalid-url','PUBLIC') URL驗證同步拋錯，實際main仍呈現error與retry、boot未呼叫；没有建立合法client或發網路請求。此test-only補強本機7/7通過，未改已驗runtime；其後文件/測試提交仍須自身CI核對，不能用8ffa的綠燈冒稱最新SHA全部綠。
- CI全過後既有staging來源分支已安全fast-forward **5476→8ffa475**；Render實查 **autoDeploy=yes／autoDeployTrigger=commit**。最新部署仍 **dep-db70mojrjlhs739hte6g／5476 live**，尚未看到新部署。依目前Render工具規則，autoDeploy服務push後不得再觸發重複手動deploy，因此這輪未手動觸發、未清cache／改自動部署設定；source branch新版本不等於已live。後續核對自動部署或其未觸發的具體原因，本輪只能交付本機功能驗收＋CI，不能宣稱staging已含retry。solver不重複部署，沒有環境變數／付費資源變動。
- 最新main **11c7d9c** 相較已整合1e019只改另一agent的DEFECT_HUNT_REPORT／OVERNIGHT_PROGRESS，無新runtime；只讀核對，不為文件變化重部署服務。下輪先核對8ffa自動部署狀態與最新test-only CI，再查故障頁是否沿用語言/字體/主題偏好（目前僅來源顯示preferences在cloud讀取後載入，**未實測，不當已確認缺陷**），以及真正排程套用／兩端驗收缺口。持續追蹤不因本輪修完停止。

#### 2026-10-13 18:22 heartbeat／18:58覆核：雲端快照契約與基準防護

- 起點fd279a2乾淨、無其他modifier／deploy；全部指定交接已核對。PR16 2c105b3的Tests38382783155補查三job成功（另一38382788656需再核對），不把歷史docs的0037／模擬失敗當新工作。正式資料、帳號權限及schema皆不動。
- 使用Impeccable harden：main全文、context一次、harden/craft-floor全文已讀，context允許窄域existing refinement、不建立PRODUCT/DESIGN新世界。沿用現有錯誤訊息與班表／抽屜／日週切換，不改CSS；機械detector兩個Store目標為[]。技能影響是拒絕錯誤資料、保留狀態與真空狀態相容，不是視覺重設。
- 新5項真Store回歸修前全部失敗（舊2項通過）：畸形object/缺欄、版本缺失或coercible/負值/小數/非安全數、core與擴充集合型別、重複/缺失id及nested arrays、錯誤行事曆。修正assertCloudSnapshot先驗核心5集合、calendar及safe integer version；核心id唯一非空，必要nested arrays正確，已提供擴充集合不得null/錯型別。先擋再轉換／讀history，所有remember/protected/write bases保持原值。版本0、SQL空聚合week=null、真zero-row及未提供舊版extensions仍可讀，未知未來欄位不破相容。這是傳輸契約，不新增工作時數、產能、工序或排程可行性規則。
- 新增10項測試：5類真Store拒絕、完整migrations真RPC與真正0列/SQL nullweek、舊版/未來欄位相容、無私密值的錯誤、10,000段有界純契約驗證、真Store+真app background函式交叉測試（錯回應不render空表、S/baseline/reference不變）。大型fixture明確只是shape，重疊不能當可行排程。初次zero fixture用了不存在closed狀態，依schema改done後才取得真SQL通過，不把fixture錯當產品bug。
- 聚焦29/29、全web **459/459**與build通過；原大chunk警告保留。尚須同SHA CI、既有staging web部署與桌面/手機瀏覽器實證，未部署前不宣稱線上已修。Render-deploy main及post-deploy checks全文已讀；只使用既有測試web，不改環境变量、新增費用或重部署沒改的solver。
- IAB tab15真qa-lead組長session仍有效，10/12／1廠、19段DOM基準保存（data-id/aria-label/text/style），目前f6舊版仍顯示即時更新中斷；沒有第二帳號，不宣稱Realtime或跨端已修。未按儲存/用這套，也未重匯測試資料。PR16/18仍draft、nightly仍停用，Codex10分鐘追蹤ACTIVE。
- 修正提交 **5476a60e60781d50c55ebc803b4dd1a544051b06** 已推，Tests **38384643880／38384651609** 與smoke **38384643898／38384651601**成功。PR16在原工作樹乾淨、remote一致、無modifier後普通merge同步 **568ce40f5f20ec46fcc7708893703076cb4d504c**；Tests **38385329291／38385323257**及smoke **38385329183／38385323200**全success，原seed preflight、banner對比與seed回歸保留。兩PR仍draft，本輪查mergeable為UNKNOWN，不冒稱已合併或已通過全部發布門檻。
- 既有staging web來源分支以fast-forward同步到5476；兩次核對未有新的auto部署後才觸發一次clearCache=false部署，**dep-db70mojrjlhs739hte6g** 於 **10:44:08.159Z** live，版本5476。真qa-lead一般root reload載入 **index-iTKt6-Fj.js**，正常接受真雲端快照；預設10/13停工空表是既有日期設定，切前一日10/12後19段aria-label/text/style與部署前完全一致（data-id為null，不拿它宣稱已驗DB id）。solver程式未改，不重複部署；沒有改Render環境變數、增加資源或費用。
- 手機 **390×844 Chromium**：工作方塊正常開窗、開始時間08:00改成草稿08:10後按Escape，視窗关闭、焦點回同一工作方塊，19段DOM完全一致；pageOverflow=false。未按預覽／儲存／用這套，沒有任何雲端資料寫入，不把這次取消驗收當真正套用或跨帳號同步。桌面與手機都顯示雲端已儲存／即時更新中斷；缺第二帳號與平台恢復證據仍不能放行。不是原生iPhone Safari測試。
- HTTP200畸形{}的瀏覽器負向注入 **未驗證**：CDP Fetch第一次缺少non-Document resourceType被拒，另一嘗試REPL綁定不存在，最後清理的Fetch.disable不支援而掩蓋了注入結果。這些是驗收工具問題，不是產品bug、不能冒稱已見啟動失敗UI。已用受支援Fetch.enable patterns=[]清除raw interception並正常reload恢復qa-lead，再次證明10/12原19段一致，沒有留下阻擋規則。上述畸形回應防護仍有真Store／真app函式回歸證據，但尚無完整瀏覽器負向E2E。
- 部署後10:43:46Z起Render error filter取得0筆、hasMore=false，瀏覽器最近20筆error查詢0筆；這是該觀察窗的錯誤檢查，不代表所有歷史或Realtime功能正常。本機驗收截圖保存 `outputs/staging-contract-restored-20261013.png`、`outputs/staging-contract-mobile-20261013.png`（不放公開artifact），已目視覆核；fullPage手機截圖的fixed底部導覽位置不作viewport命中證據。viewport已reset，測試tab已markHandoff。
- 舊nightly367614493實查仍disabled_manually，未更改Codex ACTIVE追蹤。正式1023、0037、帳號與權限完全未碰。下一輪先核對本文件最新提交與工作區，再探索測試模式啟動失敗時的重試／回正式入口及資料列契約邊界；先實際重現再修，不因459全綠停止，也不在登入門檻未過時強推正式部署。

#### 2026-10-13 18:13 heartbeat：權限演練假綠與密文消費防護

- 起點3c51519乾淨、無其他modifier／deploy；讀取所有指定交接，歷史fs-hunt尚稱0037未完成等內容不當成新授權。PR16的63d1609 Tests **38379664662／38379670951**三job全success，補核對完成結果；正式與staging資料／服務／環境变量不變，不重新套正式0037。
- 真Bash回歸修前3失敗／1通過：SQL exit1被rows映射成成功0列；expect輸出私密actual；非預期錯誤直接印stderr。改共享permissions-drill.sh：psql強制ON_ERROR_STOP與-X，查詢失败QUERY_FAILED；真正成功0列與1列可區分；rejection分MATCHED／WRONG_ERROR／NO_ERROR／QUERY_FAILED，連線失敗不能冒充另一種SQL約束拒絕。expect只公開固定測試名稱，不印期待／原始回傳，必要setup與版本讀取失敗會中止，不吞錯後續跑。
- 新增7項真Bash／workflow入口執行期回歸：正確0/1列、SQL/連線失敗、私密比較與stderr防洩、正確拒絕與無錯誤、setup/version失敗停止、帳號變數shell-local不外傳。Docker/SQL傳輸是明確mock，不冒稱已驗真Auth／跨端同步。
- 沿途額外確認原演練廣泛revoke所有底線函式，會把唯讀snapshot invoker鏈一起鎖掉。新增PGlite跑全部真migrations並執行工作流實際grant/revoke SQL，修前**42501 permission denied for _snapshot_before_layout**；修後保留已由migrations明確授權的_snapshot_before_*，viewer能真正查schedule_snapshot，_guard_work_execution私有寫入guard仍無EXECUTE。這是副本授權模型修正，沒有變更正式ACL。初次SQL抽取與syntax block數量的測試程式有問題，已修正再取得上述功能實證；不把測試程式錯誤當產品bug。
- permissions-drill改為指定同密文／encryptedOnly、不回退明文，沿用已驗catalog的ZIP白名單、真age解密／scope／24小時checksum／PG17 public還原；stdout/stderr/SQL全部在受限runner.temp、always清除本輪副本／身份檔，不上傳任何artifact。auth stub與人造grant模型僅作DB流程演練，**不是完整還原證明或真雲端角色验收**。
- 備份05:40早於正式0037的06:11，因此只在拋棄式容器套repo0037以測目前15鍵／組長12預設，正式不重套。保留原A-I權限、覆寫、RLS、版本409、報工開始/件數/完工/確認及撤回檢查；補notes/rush/worklog鍵。取消確認RPC單獨驗成功，空plan_previews會建立僅副本的synthetic preview來驗viewer被拒，不再靜默SKIP；不把此preview當ORTools真方案套用。
- 重要隱私補強：Actions會自動列GITHUB_ENV，不能只刪echo UUID；BOSS/LEAD/VIEWER改存受限accounts.sh，BASH_ENV只載入shell-local並export -n，沒有UUID進GITHUB_ENV/log。其值先驗UUID格式；所有報工fixture mutation都只在拋棄式容器，不更改測試cloud或正式名冊。原第三方／Actions worker metadata不是備份身份資料，不偽稱全log零UUID。
- 工具 **46/46**（含8新真執行期／SQL測試）通過；18個實際workflow Bash區塊語法也通過。這輪沒有web/solver程式修改，前輪已驗449與build不重做，將以同SHA CI回歸後才dispatch密文11791661615的真PG17演練。CI／實際副本A-I結果待追加，未驗證前不宣稱全過；PR16/18仍draft、nightly仍停用，持續追蹤ACTIVE。
- 修正提交 **e708d207b292f0de402b38a43363b5066a38fa51** 已推；Tests **38382027868／38382032425**（frontend/database/solver三job）與smoke **38382032403**全部success。同SHA後dispatch的真PG17 **38382362453** 使用密文11791661615，真正解密、完整public副本約束還原、隔離授權模型、A-I與always清理全部success：A45+B6+C3+D7+E6+F2+G7+H5+I17 = **98 PASS／0 FAIL**。D覆寫前後實際UPDATE及G synthetic preview拒絕都執行，沒有把顯示在runner腳本中的SKIP/FAIL分支文案誤當執行結果。
- 這98項含真副本RPC commit與version持久化、stale-version拒絕、員工自己的開工/累計件數/完工及主管確認與撤回；只是本地PG17角色/GUC與auth stub，不是Supabase Auth登入、HTTP409 UI或手機/桌面跨帳號雲端同步，不解除正式發布門檻。workflow **artifacts=0**；log人工來源覆核只有Actions worker/checkout暫存UUID及第三方npm警告email，角色BOSS/LEAD/VIEWER未被列到env，無age私鑰或JWT模式。全原始query及恢復錯誤留在runner私密暫存並清理，不新增明文artifact。
- 讀最新main **1e01947205fc0d07769a3a460c469e0705a87384**，相較先前0e60483僅docs/agent/OVERNIGHT_PROGRESS.md變動，正常merge保留另一agent紀錄，不重做或部署相同程式。後續文件/merge SHA不取代e708的功能驗收證據。
- 持續探索新Major已用真SupabaseStore函式＋明確mock RPC重現：data={} 或 {error:'SYNTHETIC_INVALID_PAYLOAD'} 仍被接受為0員工/空班表，store.version由12變0、寫入baseline變空。首次探針把base誤當array而自身拋錯，已修探針後才確認accepted=true／baselineChanged=true；不是猜測。沒有任何雲端寫入或生產請求。**尚未修**；下一輪先補畸形object／缺欄／非安全version完整快照契約回歸，不因這輪全部測試綠而停下。修前需讀Impeccable harden指示，維持真正零列快照及本機首次使用相容，不能放寬cloud失敗防護。之後再驗environment-preserving重試介面及安全輪詢／登入門檻。
- main只讀整合 **9b9c64ae08211751593322b198f7c69eef621f8e**，證據文件 **dc0f588be90ddeb72f1ffeae039578b2ad43adba**已推，兩工作樹乾淨。PR16原remote/HEAD63d1609一致、無modifier後普通merge到 **2c105b37b66c6f615ca77f1be72df1730477a701**已推；原3項seed preflight/banner對比/seed回歸保留。最新Tests **38382783155／38382788656**目前in_progress，smoke **38382788636**success，下輪核對，不拿先前63d的CI冒稱新版本已全過。PR16/18均draft（18 MERGEABLE），正式仍未合併部署；nightly367614493仍disabled_manually，Codex追蹤不停止。只修工具/工作流故沒有重複部署任何Render服務。

#### 2026-10-13 17:50 heartbeat：加密資料盤點與公開輸出安全

- 起點cb7edcb乾淨、沒有其他modifier／deploy程序；正式1023、0037、角色及測試資料皆不寫入。這輪沒有web/solver執行期修改，不重複部署Render，也不重做C1–C7或既有還原證明。
- 已讀catalog-inventory與permissions-drill全部流程。兩者都排除db-backup-encrypted，且舊盤點會把資源名稱／產品代號／日期寫入公開報告，權限演練仍會印帳號UUID、原始RPC與SQL錯誤。因此先修catalog；permissions-drill仍不安全，**不得dispatch**，後續另修，不能把本輪通過冒稱權限演練已通過。
- 新backup-artifact encryptedOnly選項：只取未過期真正密文備份，保留其他舊消費者原有行為；指定明文ID也拒絕。兩項mock HTTP回歸修前確實失敗（誤選較新明文、明文ID未拒絕），修後通過。catalog新增artifact_id輸入可固定同一密文，ZIP只允許database.tar.age，age真正解密、scope／24小時新鮮度／checksum沿用原驗證，不回退舊明文。
- catalog只在拋棄式PG17還原public，auth為stub，明確不是完整資料庫還原證明／solver可行性測試。查詢BEGIN READ ONLY；公開結果改固定29項數值白名單，沒有姓名、資源／產品代號、個人日期、工單／請假／報工明細。缺欄、額外欄、字串、負值、不安全整數與非法provenance拒絕，CLI不印JSON來源、檔案路徑或資料庫錯誤。所有restore stdout/stderr只在受限runner.temp，錯誤不忽略；always清理本輪副本、SQL、身份金鑰，不刪旧GitHub artifact/log。
- PGlite合成fixture真正執行舊string_agg查询，確定會輸出PRIVATE-MACHINE；替換SQL實際執行得到員工／技能／機台／模具缺漏等正確數值、唯讀交易結束無資料變動。新增4項SQL／輸出／CLI回歸；不是源碼字串断言。
- 沿途確認第三個私密輸出缺陷：age已正確解密但manifest JSON損壞時，原CLI會印出解密內容片段（真正age＋CLI測試修前失敗）。CLI改固定安全訊息，清除明文的既有防護仍驗證；export API保留私下caller錯誤。新增1項真正age回歸。工具**38/38**、web**449/449**與build全過；大chunk警告既有未改。
- 密文artifact11791661615實查未過期（05:40:54Z建立），預定在同SHA CI綠後用它執行一次隔離catalog；不建立新明文備份、不讀正式DB。不把觸發workflow當還原成功，後續記錄run、各步與公開artifact內容。CI及實際PG17盤點結果待追加。
- PR16/18仍draft，第二帳號與真正排程套用／跨端同步門檻仍缺，nightly仍disabled_manually，10分鐘Codex追蹤ACTIVE。下輪先核對本輪實證，再修permissions-drill密文相容與公開輸出，持續探索，不自行結案。
- 修正提交 **7912a3d569d1ef2e59821012df0f650322fd0345** 已推；Tests **38379110463／38379115855**三job全success，smoke **38379115741** success。6個catalog Bash run區塊另以實際bundled Git Bash `bash -n`通過；這只作語法輔證，真SQL／CLI與以下真PG17才是功能證據。
- 真隔離盤點 **38379527666** 使用同密文11791661615，下載、age解密與scope/checksum、新鮮度驗證、PG17 public還原、唯讀查詢、報告及always清理各step全部success。唯一公開artifact **11803036790**／catalog-inventory／942 ZIP bytes，下載實查只有inventory.md，29項統計且無原始代號、名稱、日期、排程／身份資料。副本顯示啟用產品0，缺漏站數0 **不能解讀成正式資料可排或OR-Tools通過**；這輪沒有核定資料／建立產品，也沒有碰正式1023。
- 公開run log檢查：未出現age私鑰／JWT；模式掃描的3個UUID實查都是Actions worker或checkout暫存目錄，1個email為npm第三方公開棄用警告，非備份身份資料。查證時只顯示已遮罩的上下文，沒有把原始query stderr或解密資料追加到log。這是本run人工來源核對，不是聲稱所有歷史log無敏感資料；既有舊artifact/log保留。
- 發現下輪必修的驗收假綠：permissions-drill D的原有rows()把docker/psql exit=1經grep -c及`|| true`轉成成功0列，預期RLS拒絕的0列斷言可能誤過。讀取原函式並在實際bundled Git Bash執行，僅mock docker回傳SYNTHETIC_SQL_FAILURE＋exit1，確實得到exit0／stdout0；沒有聯絡Docker或資料庫。首次嘗試一般Program Files Git Bash路徑不存在，改用現有hermes/git/bin/bash.exe才完成實證。**尚未修此函式，不dispatch permissions-drill**；下一輪須補QUERY_FAILED與真正0列的分辨回歸，連同密文及輸出隱私修復，不只刪除log文案。
- PR16工作樹及remote均乾淨一致、無modifier，普通merge同步到 **63d1609232af222a00a19fbb93033a70d323cbb9** 已推，保留原banner對比與cloud-seed preflight；未force push、未合入main。Tests **38379664662／38379670951**目前in_progress，smoke **38379670925**success，下輪先核對完成結果，不冒稱最新PR16已全綠。舊nightly367614493本輪再次核對disabled_manually；不改正式/staging Render服務或環境变量。

#### 2026-10-13 17:12 heartbeat：訂閱成功補漏讀取與雲端啟動失敗防護

- 本輪891b0cd起點乾淨、沒有其他modifier／deploy程序；不再整合相同main或重跑已過C5。依Impeccable harden只補資料更新／失敗路徑，保留班表、抽屜、日週切換及午休背景；context已執行一次，craft-floor全文已讀，最終detector app.js為空結果。
- 真app start＋背景補讀函式執行期重現：初次snapshot與加入訂閱之間的空窗、斷線後SUBSCRIBED卻未補讀、重複join排程、草稿期間漏記pending等4項測試修前失敗（第5項未覆寫preview原已通過）。最小修正onRealtimeStatus：每次非SUBSCRIBED→SUBSCRIBED安靜補讀一次，重複SUBSCRIBED不補；初次join同樣補空窗。不新增定時輪詢。沿用508b794的timer／結果兩次安全檢核與speculative load，草稿、預覽、拖曳、在途／失敗儲存期間仍延後。補讀與延後補讀走reconcile，不憑人工觸發讀取就產生新變更通知。
- 沿途新Major/潛在資料安全缺陷實際重現：start()在STORE.load拋錯時吞錯後呼叫makeDemo，可能讓雲端session拿示範資料開始操作；另真SupabaseStore在RPC data=null時轉成空snapshot，且開始讀取log。新測試各修前失敗。現在雲端start讀取錯誤直接交由既有啟動失敗UI／登入handler顯示，不產生或儲存示範；Store拒絕null/undefined/array/string/number，version/base不變。真正零員工的有效雲端快照仍正常顯示空資料；本機首次使用仍產生並保存示範。
- 新增7項真start／註冊callback執行期回歸＋2項真Store RPC資料邊界，聚焦23/23及全web **449/449**、工具 **31/31**、build成功。測試有明確mock API與timer，不是源碼字串斷言，也不冒稱真平台或跨帳號雲端已恢復。實际平台仍中斷，第二帳號登入／寄設定信同意仍缺；後續須以同SHA CI、staging與正式門檻分開記錄。
- 目前只本機修正，CI／staging發布結果後續追加；正式0037不重套、正式1023與角色授權不改、不重匯測試資料。PR16/18維持draft，舊nightly仍停用，Codex10分鐘追蹤ACTIVE。catalog/permissions舊備份消費者待加密相容與公開輸出安全檢查，未dispatch。
- 修正提交 **f6af130cf8158b8a2a3d6f1045207aa2488fe4c6** 已推；同SHA Tests **38376326952**（前端、資料庫/跨層、solver全成功）及smoke **38376326947／38376320956**成功。PR16普通merge為 **0eb0c2c77872abcc3d244a8bd44916b8143a00b5**，Tests **38376648747**三job全success、smoke **38376648700／38376644280**成功。兩PR均MERGEABLE且draft，不合併正式。後續文件SHA不代表新的應用發布。
- CI後non-force FF staging分支到f6af130；repo hooks=0，實查無自動deploy後只手動部署既有web **dep-db6vkm3l550s73a9f25g**，09:31:37Z live f6af130。一般root MISS／**index-DSYR92oP.js**；IAB真qa-lead session確認此asset及組長身份。09:31:04–09:32:47Z部署error logs空；這不是瀏覽器或跨端全面零錯誤。solver仍2cde149，不改服務環境变量、不新增資源/費用。
- 真瀏覽器故障E2E：在IAB test tab以CDP只阻擋隔離Supabase的schedule_snapshot RPC（未讀JWT／私密key／request headers），reload得到 **啟動失敗／讀取排程失敗：TypeError: Failed to fetch**，沒有示範看板。Screenshot **outputs/staging-cloud-read-failure-20261013.jpg**。在finally設blocked URLs=[]並Network.disable，再reload恢復一般root及原帳號；回10/12／1廠，19段label/text/style與故障前逐筆一致。測試網路設定已全解除，沒有留離線或URL阻擋。
- 恢復後另開測試A01編輯，08:00改草稿08:10（DOM value490），Escape取消，19段仍逐筆一致，未按儲存/用這套。恢復畫面 **outputs/staging-reconnect-restored-20261013.jpg**，保留IAB登入handoff。真正平台仍報即時更新中斷，不能用這次RPC故障恢復冒稱Realtime重連補漏或真雙帳號同步已驗收。Chrome舊tab1703573242已消失；新列表有1703573245，但claim讀取逾時，已按troubleshooting處理、不重選瀏覽器/盲試，不知道其登入狀態。寄設定信同意仍未收到，不寄信/猜密碼/讀舊SQL。
- OpenAI Docs核對後更新**既有**automation提示，移除obsolete衝突／已修事項，保留heartbeat/每10分鐘/同一thread/ACTIVE與全部保護限制；沒建新cron或改費用、沒停用追蹤。下一輪先讀本節：不重做已過f6測試/部署/RPC故障E2E；若尚無可用第二帳號，繼續catalog/permissions密文消費與診斷隱私，或安全有界輪詢/草稿保護的實際重現。新介面候選：啟動失敗頁目前只有「回正式資料」root連結，先驗mode=test/本機模式的重試與環境保留、手機觸達，再決定最小修正；不把源碼猜測當已確認回退缺陷。正式1023/0037/權限不動，PR16/18仍draft，nightly仍停用至安全加密main發布。

#### 2026-10-13 16:50 heartbeat：安全整合最新main與模擬診斷隱私防護

- 開始工作目錄乾淨，沒有重疊modifier；正常fetch並普通merge **0e60483**，不切換共享checkout、不force push。四個衝突：acceptance-sim、backup-drill、C5案例、solver calendar bans。保留本分支已真驗收的分頁／密文解密及calendar union（忽略無長度區間、不合併真實工作占用），保留main新增test_leave_holiday_overlap三項測試與其他文件／工作流變更。C5保留完整求解件數、獨立合法性、實際DB拒絕及savepoint回滾，合入main新增「加班／調整期限」建議斷言，沒有弱化逾期套用閘門。
- 新缺陷實際重現：執行合併中的真simulation solve函式，2/2隱私測試修前失敗——main新增/tmp/sim-last-request.json寫出完整原始請求，且失敗stderr可外帶姓名／備註；另加無效stdout案例，真JSON.parse例外會夾帶原文而失敗。最小修正不寫快照檔，錯誤只報exit／失敗類型與格式錯誤，不回傳stdout／stderr；console仍有安全結構摘要。acceptance artifact僅原有安全報告，不納入main新增/tmp/sim-*.json；舊artifact／log依使用者要求保留，沒有刪除。
- 同步新備份策略時發現額外名稱碰撞：現有工具仍以db-backup-前綴接受任何演練／後綴檔。真mock HTTP兩項修前失敗（誤選較新的假檔＋明確ID不拒絕）；現限制兩個實際producer格式db-backup-數字與db-backup-encrypted-數字。已以GitHub實際metadata確認現存11791661615名為db-backup-encrypted-38352489633、未過期；沒有下載或展示正式內容。保留加密真備份資格，不沿用main排除所有encrypted的降級。
- 回歸：新3項實際driver執行期隱私＋2項artifact HTTP回歸通過；全部工具 **31/31**（真age加解密、未skip）、web **440/440**、build通過；solver新增測試與完整跨層等待同SHA CI，Windows OR-Tools仍不繞過防護。本機Python trampoline連YAML解析啟動都失敗，故不拿未執行的YAML解析當證據，交由GitHub workflow parser/CI核對。
- catalog-inventory／permissions-drill的main改進保留，仍是舊public備份診斷流程，未 dispatch：目前不聲稱這兩套可用新密文或公開輸出已隱私合格，後續另需安全整合；不為QA上傳人員盤點或身份資料。C1–C7原已通過不無故重跑，只針對本輪實質整合變更補驗C5。備份與正式0037不重做，正式1023、帳號權限與setup_pending不動。
- PR16/18仍不合併進main，真第二帳號／同步仍缺登入與同意；本輪沒有部署正式Render、寫正式DB或寄信。nightly367614493仍停用至安全加密版本進main，Codex10分鐘追蹤仍ACTIVE。下一步以本輪提交及CI／C5實證結果為準接續，不能拿單輪tests綠燈當全部發布門檻。
- 實際提交：正常雙親merge **635f7de842d0047deaaf705e3157d91f43dd1d1a**（parents 6f4809d／0e60483）；再補模擬還原失敗不得tail私密SQL／資料診斷、清除固定runner暫存 **47c6fc2940bc5ec47bddf94de954bc8366536f94**。同SHA Tests **38373485005**（frontend/db跨層/solver三job均success）、smoke **38373484907**success；635f的Tests38373289612也已成功。非force更新PR18，GitHub實查MERGEABLE但仍draft。
- 僅針對C5新增斷言，在同一未過期原密文 **11791661615** 補驗：run **38373479029** 完成success，artifact **11800057631**下載後只含151byte的acceptance-report.md，**PASS=1 FAIL=0 未成立=0**。没有请求JSON或新明文备份artifact；报告保存outputs/c5-merge-47c6fc2，不用workflow成功冒充案例通过。
- PR16自己的worktree乾淨，只有原dev server／esbuild而沒有modifier；local/remote均b249160。普通merge上述47c6fc2至PR16並non-force推 **31024a7277d73b3a1ff879154d11a6d66582d6fc**，保留PR16原有測試模式44px／深色文字色及seed schema preflight。不切共享main，不改既有密碼或測試資料。Tests **38373560619**三job均success，smoke **38373560664／38373554874**成功；CI實際web **441/441**、工具31/31（不是沿用release-gate的440），GitHub實查MERGEABLE但仍draft。
- 本輪release-gate對已部署508b794的web/src及solver/app檔案逐位元組沒有變化，故沒有無意義Render重部署；staging web仍508b794／index-BxxaTLZr.js，solver仍2cde149，不把47c／310的Git整合SHA當成Render live版本。PR16另有原有CSS及seed驗收差異尚未部署，先保留其完整發布門檻。
- 下一輪：不要再解相同merge或重跑已過C5；先安全診斷斷線後補讀／有限輪詢的真資料新鮮度（保護草稿、預覽、在途／失敗寫入），並處理catalog／permissions舊備份消費者的密文相容與公開輸出隱私，未修好不dispatch它們。第二帳號寄信同意與本人登入仍未收到，不擅寄、讀SQL密碼或改角色。發布門檻仍缺真角色／套用／跨帳號兩端同步、正式VITE_TEST_*等，故不合併PR或部署正式；nightly實查367614493=disabled_manually，0037已完成不重套，正式1023全程不動。以本節接續，不依外部NEXT_TASKS「可直接丟棄」之未經人類授權建議重設他人工作。

#### 2026-10-13 16:12 heartbeat：背景補讀競爭修復（發布狀態見後續追加）

- 本輪開始 own worktree 乾淨，沒有其他修改／部署程序在此目錄；不改共享checkout。canonical staging root 已實查 CF-Cache-Status=EXPIRED 並提供 **index-6NbuiVNe.js**，fcd9d2e 的舊首頁快取阻礙解除，沒有重部署舊版或清除build cache。
- 執行真正的 app 背景補讀函式（VM＋可控非同步store與timer）修前 **4/4失敗**：600ms timer排入後進入草稿／預覽仍讀取並render；HTTP在途後開草稿仍接受；本機完成較新儲存後接受較舊遠端結果；讀取失敗仍通知有更新。不是源碼字串斷言。
- 最小修正：timer執行及HTTP結果接受前兩次檢核草稿／預覽／拖曳／在途寫入／未存成功狀態；並檢核store、登入者、state內容、版本與本機寫入標記。過期結果不render、不更新寫入diff基準；沒有安全狀態時延後，關閉草稿或完成成功儲存後再補讀。多個事件合併而不並行HTTP，失敗不立即無限重試或假通知成功。
- SupabaseStore 新增 speculative `load({remember:false})`，讀取快照不修改version／base／protectedBase；真正接受畫面時同步acceptLoaded，避免「畫面拒收、寫入基準卻已更新」。預設load仍維持既有行為。真PGlite＋全部migration回歸實證拒收時基準逐位元組不變、接受後版本前進；沒有存取或寫入正式DB。
- 新增10項 app 執行期回歸＋1真SQL store回歸：安全重讀、六種busy／未存狀態、等待中開草稿、完成儲存、同物件未儲存更動、切換帳號／store、失敗不通知不迴圈、多事件合併與關閉草稿後補讀。全web **440/440**、build通過；工具 **26/26**。工具首跑因未加 age工具到此PowerShell PATH有5項環境失敗（不是產品缺陷），補既有已驗證工具路徑後26項真正執行通過，沒有跳過。一次誤用不存在tools/tests glob產生0測試，不作通過證據。Impeccable harden只影響本輪資料更新／錯誤安全，detector app.js無輸出，不做畫面重設計。
- 真staging平台即時通道中斷與第二帳號未登入仍是發布門檻，本輪程式測試不冒稱真兩端同步已通過，也未新增自動輪詢。寄設定信仍待本人同意，不能讀舊SQL／猜或改密碼。0037不重套、正式1023不動，PR16/18仍draft、nightly仍停用直到加密main安全發布。10分鐘追蹤ACTIVE。
- 修復提交 **508b79453453a362426e808e53f3b1434cdf1931** 已推own branch；同SHA Tests **38370357004**（frontend/database含跨層/solver全部成功）與smoke **38370357303**成功後，non-force FF既有staging分支。repo hooks仍0，觀察無自動deploy後才手動更新web **dep-db6usuk9v7es739tfko0**，08:40:55Z live508b794。canonical root實查MISS、**index-BxxaTLZr.js**，不是只靠HTTP200或API live判斷；solver維持2cde149，沒有新增服務、費用或正式部署。08:40:26–08:43:59Z部署error logs空，不代表浏览器或同步全面零問題。
- 最新main實查 **4008974297b0d0453ba1339a9efdf2d1e11ab9c9**，PR18 mergeable=CONFLICTING、PR16仍draft/b249160。下一輪普通merge整合需處理兩份calendar-overlap修正（保留已驗收邏輯與新增測試）、各workflow與其他提交；最新main的acceptance-report仍新增`/tmp/sim-*.json`公開上傳，**必須阻止新真實請求快照artifact**，但不得刪使用者要求保留的舊下載檔。不用force push或重設他人分支。
- 08:46Z真IAB qa-lead一般root載入 **index-BxxaTLZr.js**，top/sidebar仍如實「即時更新中斷」。回10/12／1廠，開測試A01編輯表單，開始時間08:00改草稿08:10（DOM value490），Escape取消後19段label/text/style逐筆一致；沒有按儲存或套用，不改測試DB。截圖 **outputs/staging-remote-read-safety-20261013.jpg**。手動新增入口本次正確顯示無剩餘工序，並可Escape關閉，**isNew完整新增路徑仍未測**。這不是有遠端事件的瀏覽器競爭E2E；實際即時通道仍失敗、第二帳號登入仍缺，不冒充同步成功。IAB/Chrome登入handoff保留供下輪，程式／資料發布門檻仍未全過。

#### 2026-10-13 16:00 台灣時間：即時通道狀態修復與登入阻礙

- 本輪07:32 heartbeat執行中又收到07:52 heartbeat，仍在同一工作目錄接續，沒有並行第二份修改／部署。工作區開始乾淨，只有本輪PowerShell命令在此目錄。
- Chrome既有分頁沒有staging帳號session；新開staging頁仍登入畫面。IAB tab15保留qa-lead session。沒有讀舊SQL密碼、猜密碼、改角色或密碼；已詢問是否同意寄設定信至既有me0608623+test-lead@gmail.com，**待人類回覆，尚未寄信**。Chrome tab1703573242留作登入handoff；不是第二帳號已驗收。
- 真實缺陷最小重現：新SDK mock＋真SupabaseStore訂閱測試修前4/4失敗（狀態callback根本未註冊）。修復runtime **291233d77680aaaccd825afb61764a54be35b17c**：報CONNECTING／SUBSCRIBED／CHANNEL_ERROR／TIMED_OUT／CLOSED；Postgres system error即使channel join成功仍降級，直到stream ok；新訂閱／登出先失效舊回呼，不讓過期狀態或資料事件干擾新工作階段。原始連線錯誤不輸出，沒有改DB或授權。
- UI分開「雲端已儲存」與「即時已連線／即時連線中／即時更新中斷」，寫入busy/error優先；本機沿用原提示。點中斷提示只說明完成目前操作後重新整理，**沒有新增自動reload／輪詢，也沒有覆蓋草稿、預覽或未儲存資料**。重連補漏讀取尚待後續安全實作與驗收，不冒稱已解決跨端資料新鮮度。
- 291233d新增9回歸全通過；原layout-regression源碼簽章斷言因subscribe新增參數誤判（非產品問題），換成真Store重複訂閱／登出移除通道執行期測試。全web **428/428**、工具26/26、build與Tests **38364764879**／smoke **38364764715**成功。
- 同SHA CI後non-force FF staging分支，只更新既有web。repo hooks仍0、舊deploy仍410d314才手動deploy **dep-db6u5iks728c73f0f3k0**，07:51:01Z live291233d。真IAB登入bundle **index-BHO4Rv3r.js**；沒有額外收費、沒有部署正式Render、solver仍2cde149。
- 真實staging本次明確顯示 **雲端已儲存／即時更新中斷**；本輪沒有模擬斷網或讀JWT／私密key，這是SDK實際訂閱回報。callback狀態不足以斷言是哪個平台根因。点击提示說明正確，當日19段id/text/style保持一致。手機390×844可操作，按鈕44px，warn字色rgb(154,91,0)／底rgb(247,248,250)。不是iPhone Safari測試；另一端同步仍未通過。
- 截圖工具在連續set/reset viewport同call時輸出過異常縮圖，不能拿它當手機證據；DOM已核實手機布局，桌面reset後分開call fullPage截圖可用：**outputs/staging-realtime-disconnected-desktop-verified-20261013.jpg**。mobile檔不作交付證據。
- 桌面完整截圖抓到另一顯示不一致：sidebar仍「雲端已同步」。已修 **fcd9d2e5e3cfb666f8a9c7e832ebeb95267a4a8e**，sidebar和top共用syncStatusView，updateSyncChip兩處都更新，警告圓點不再綠；補1真renderer回歸。全web **429/429**、工具26/26、build、Tests **38366477082**／smoke **38366477247**均成功。CI後FF staging分支、hooks=0且無自動deploy才手動更新，**dep-db6ucejl550s73a5a7a0**於08:05:41Z live fcd9d2e。
- 抓到部署快取差異：08:08Z canonical root仍CF-Cache-Status=HIT／Age112／舊asset index-BHO4Rv3r.js；同host單次cache-bust `?release=fcd9d2e`是MISS／新asset **index-6NbuiVNe.js**。正常部署不重複clear build cache，這不是程式沒編入。新URL真qa-lead登入已實測top與sidebar同時「即時更新中斷」，證據 **outputs/staging-realtime-status-final-20261013.jpg**。**canonical首頁快取刷新仍需下一輪核對**，不把API live冒稱所有一般網址已新版本。沒有改任何CDP網路設定，也沒有平台環境／資料寫入。
- 下一步先核對canonical root新asset／sidebar一致；若使用者同意寄信，僅測試站寄信並由其本人設定、登入。未回覆不重問未知密碼；繼續安全探索remote reload timer競爭及丟失草稿／預覽的最小重現。PR16/18未合併；與最新main普通merge時阻擋新的真實request明文artifact；加密nightly尚未進main、舊367614493仍disabled_manually。0037已完成、正式1023不動、10分鐘追蹤ACTIVE。

#### 2026-10-13 15:30 台灣時間：手機抽屜Major修復完成

- runtime **410d314e642443a31c584a73ccf7e24b2b831494**：把手機取消／套用置於抽屜固定底列，抽屜內容獨立捲動；收合後仍保留底列。桌面只顯示原頂部入口。沿用既有pv-cancel／pv-apply完整驗證，不新增儲存路徑；不改主要機台×時間班表、日週切換或午休加班背景。
- 新增4項真函式執行＋HTML解析回歸（自動合法方案、手動／自動無效方案disabled、儲存中無可點動作、只讀情境不得套用）；原16項真handler測試含取消不寫入與連點只存一次仍通過。全web **419/419**、工具26/26、build成功；同SHA Tests **38362247865**（frontend/database跨層/solver）及smoke **38362244978**均成功。既有chunk及依賴警告未聲稱修復。
- CI綠後non-force FF既有staging分支至410d314；repo hooks仍0且未出現自動deploy，才觸發既有staging web **dep-db6tq0rl550s73a3bj8g**。07:26:20Z live410d314，瀏覽器實際bundle **index-DAmlZZVm.js**。staging solver仍2cde149；沒有新增服務／費用、沒有部署正式Render。
- 真qa-lead session／真OR-Tools三方案：**390×844**展開與收合底列兩鈕均48px高，中心elementFromPoint命中本按鈕，沒有被抽屜覆蓋；選最佳化→切2廠10/14→直接按新底列取消→回1廠10/12，19段id/label/text/style逐筆一致，preview消失，沒有按用這套。**844×390**橫向底列兩鈕48px／中心命中，Enter取消成功。桌面預覽底列display:none、原入口48px，取消成功。證據outputs/staging-mobile-preview-actions-20261013.png與staging-desktop-preview-actions-20261013.png。
- Impeccable adapt限制本輪只修此觸達缺陷；一次detector報7個既有CSS警告，沒有新增同類規則，未擴成重設計。未做真機Safari、尚未端到端按新套用入口寫入或跨帳號同步；這些不能用enabled／已同步徽章冒充。
- 接續優先：取得既有另一個已登入測試session（不讀／猜密碼），驗角色／真正套用／兩端同步與Realtime失效回饋；`store/supabase.js` subscribe未處理訂閱狀態，平台故障時無資料新鮮度降級，先重現再最小修正。再普通merge最新main／PR16整合，**移除新真實request公開artifact**但不刪使用者指定保留的舊artifact。加密nightly安全進main後才啟用367614493，目前實查仍disabled_manually。
- 正式0037已完成，不再套用；1023與個人角色授權／setup_pending不動。PR16與PR18仍draft，發布門檻未全過。10分鐘追蹤ACTIVE，下一輪继续，不因本項驗收成功停止。

#### 2026-10-13 約15:15 台灣時間更新（以下本段優先於舊輪次敘述）

- 正式0037已由run38355345279安全提交；不重跑。新密文備份及真正完整還原、同SHA CI、交易內資料保護均通過。正式1023／Auth／個人權限／setup_pending未改。
- 最新runtime **c88a7ee6046118ea42a34707716223e05fec4cbb**；Tests38359130441全部成功，smoke38359130405成功。本機web **415/415**、build通過；工具26/26和真SQL回滾演練先前已通過。
- staging web dep-db6tc33rjlhs7396vvkg於06:56:30Z live c88a7ee，實際bundle index-BecRRKb0.js。staging solver仍是dep-db6solij9qps73adm3a0／2cde149（最新前端修正未改solver，不冒稱兩個SHA相同）。沒有新增服務／費用，沒有合併PR或部署正式Render。
- 已修兩個取消缺陷：取消預覽恢復進入時日期／廠別／檢視／聚焦；同步還原既有廠別偏好，reload不再跳到預覽中臨時切換的廠別。純UI context，不寫排程store。5純模組＋2實際handler VM回歸；確認套用不還原預覽入口日期。
- 桌面已實測取消回到10/12、1廠，19個方塊id／label／text／style完全一致；最新reload仍1廠。手機390×844也以真qa-lead session、真OR-Tools三方案測到選最佳化／切2廠／取消，**先收合方案抽屜後**回10/12、1廠及19段完全一致，reload仍1廠。未按「用這套」。手機證據outputs/staging-mobile-cancel-20261013.png；真機iPhone Safari未測。
- **新增Major待修（下一輪第一優先）**：手機展開方案比較抽屜佔住可視區，預覽「取消／用這套」被遮；直接locator click取消未生效，收合後才生效。不是取消context回歸；應確保展開抽屜仍有可見、可點的44px取消／套用入口，補實際遮擋／點擊回歸。因此手機驗收未全過，不能發布。
- 一次reload後計算明確顯示「瀏覽器備援」，後續手機與桌面另次計算明確顯示「OR-Tools」；冷啟動／健康探測原因仍待查，不能把全部嘗試稱ORTools。
- PR16/18均draft。跨帳號權限、套用／Realtime同步與離線衝突未通過；正式VITE_TEST_*未設定。與最新main普通merge時先查其新增真實request dump上傳，禁止新明文資料artifact；保留其他agent提交、不force。
- 舊nightly ID367614493仍disabled_manually；加密版本通過但尚未進main，安全合併後才能啟用，避免舊main繼續上傳明文。既有明文artifact/log依使用者要求保留。10分鐘Codex追蹤維持ACTIVE，不因本輪完成自行結案。

#### 先前輪次紀錄（已被上段取代的待辦不重做）

- **正式0037已套用**：runtime2cde149，Tests38354810746／完整還原＋guarded0037演練38354811296／純關卡38355195539全成功後，正式apply=true run38355345279於06:11:59Z提交。交易內所有public資料、Auth users/identities、角色／RLS／序列指紋不變；沒有改正式1023或解除setup_pending。詳見MIGRATION_0037_GATE_2026-10-13.md；不要重複套用。
- 工具26/26及真SQL回滾測試通過，不靠源碼字串。演練receipt artifact11792422005不含資料；私密診斷／fingerprints不上傳。
- staging solver分支non-force FF至2cde149，repo hooks=[]且staging不自動部署（觀測後仍cdfc40c），手動deploy dep-db6solij9qps73adm3a0已live於2cde149，health database=true／OR-Tools9.15.6755。06:15:26Z至06:19:59Z app error logs=0。
- 真實qa-lead session已計算3套OR-Tools方案；選最佳化→影響日10/14等、原本22段／調整15段，DOM內容與位置確實不同；取消後未套用方案，但抓到**取消未恢復原日期**（10/12→看10/14→取消仍10/14）。正在用純UI context修復，4單元＋2真handler VM回歸；不改班表資料或CSS世界。首次web412/411失敗為VM fixture沒引入新真模組，已补該import，不能記成產品ReferenceError。
- 新UI取消修復本機最新414項回歸與build通過（dot reporter exit0）；尚待此修復CI、staging web部署與桌面／手機確認。現有截圖outputs/staging-ortools-preview-20261013.png為修前真ORTools對照畫面。
- 5474f40 Tests38357296228全成功；staging web dep-db6t3qgn74is738umqtg已live5474f40，新bundle index-Bsy81hyT.js。桌面取消已回原10/12、factory1，當日19段data-bid／aria-label／text／style逐筆一致。此次重載後預覽明確是「瀏覽器備援」，不能冒稱此輪也走ORTools（前一輪真ORTools已驗3方案）。
- 桌面加測廠別→取消→reload抓到UI恢復1廠但偏好fsched-factory留2廠，重載變2廠。已最小補用既有setFactory還原UI偏好，沒有寫排程store；新增偏好回歸及實际cancel handler VM斷言。最新415項本機＋build通過，仍需最新CI/staging確認與手機390尺寸。本轮全部未按「用這套」。
- 2026-10-13使用者已回覆：維持公開、改用加密備份。新追蹤prompt已更新，不再等待可見性選擇；加密完整備份與還原本身仍是0037門檻。
- 使用者再明確要求「先保留舊檔，只改新備份」，不刪既有backup/debug artifacts或log。
- 新正式唯讀完整DB加密run38352489633／artifact11791661615已成功；下載真正解密SHA256驗證通過。完整隔離Supabase PG17還原run38353201806成功（角色SQL、Auth真實資料、full.dump ACL、FK/RLS等，無stub）。Storage物件0。新backup/nightly尚未merge main，舊nightly暫停保留以防明文。
- 最新修復head1986377：工具20/20＋實際PGlite recovery-proof SQL通過。03451e1兩套CI成功；1986377 Tests38353205423/38353200703也全成功。同新密文C1–C7 run38353425842 **PASS=7 FAIL=0 未成立=0**（已對到實際log，不只看job綠燈）。詳見ENCRYPTED_BACKUP_2026-10-13.md。
- 下一項：完成取消導航修復CI與staging UI驗收、補跨帳號同步並整合PR16／最新main；安全发布加密備份，才重啟nightly。正式0037已完成，不解除setup_pending。
- 舊nightly-backup ID367614493已disabled_manually，防止新明文備份；age私鑰已用本人+SYSTEM ACL保管，GitHub兩個BACKUP_AGE_*秘密已設定，不展示私鑰。
- 本輪加密模組真實age測試6/6；完整DB與角色加密＋真還原已通過，詳見docs/ENCRYPTED_BACKUP_2026-10-13.md。
- 修復分支runtime a48d9f6；PR #18 draft。固定同備份11786241413、週一2026-10-12，run **38350613478 PASS=7 FAIL=0 未成立=0**，是實際PostgreSQL副本＋OR-Tools＋DB套用／拒絕的驗收，不是源碼斷言。
- C5額外修正負面測試：在PL/pgSQL子交易中捕捉預期P0001拒絕，不讓外層交易abort導致Session SELECT哨兵等待180秒；仍驗證拒絕內容、資料與版本不變。
- PR #16已同步main11285ea並推到b249160，維持draft；最新head CI要再核對。未合併任何PR、未套用正式0037、未設定正式VITE_TEST_*。
- 既有staging web追蹤分支non-force fast-forward至11285ea（比Tests綠燈7f3df00只多文件），repo hooks仍空，所以手動部署 `dep-db6rugjl550s739sontg`，live11285ea。沒有新增主機或費用；staging solver尚未更新到本輪calendar union修復。
- staging執行期先重現加班日date-nav會ReferenceError otEnd、畫面停在舊日期；更新web後同一session切到10/12成功、1廠19段渲染。新bundle index-C4NJipl1.js，部署完成05:19:20Z之後本輪console新增error=0。
- screenshot `outputs/staging-calendar-render-20261013.png`。測試站畫面已有其他agent留下的休假等變更與3問題提示，不能把有畫面／已同步徽章當作無衝突或Realtime驗收；本輪未重置該資料，也未更動正式1023。
- browser IAB tab15是已登入qa-lead的staging app，handoff；沒有取得任何密碼。Supabase admin tab9不要讀其密碼片段。
- 備份保護選擇已明確：公開＋加密、舊檔保留。不再向使用者重問；automation仍ACTIVE每10分鐘，不自行停用。
- 下一輪先核對最新CI；在獨立staging部署通過的calendar修復、驗排程與跨帳號／兩端同步。修復同步降級或缺憑證時不得假裝已即時同步；再處理備份與0037、PR16正式發布門檻。

### 本輪後續證據與安全阻礙

- 備份搜尋修正後固定artifact11786241413已真正還原並跑到solver（run38349015940），仍6案INFEASIBLE；非下載階段假紅。
- 新增兩個最小回歸在修改model前的run38349491204真的失敗（unused員工的假日請假＋禁加班、重複請假），均INFEASIBLE。第三個真工作重疊測試初版誤用contentId而非workId，已更正，不能把該fixture錯誤當產品缺陷。
- 真因：員工calendar不可用區間被重複加入Cumulative，重疊兩個滿額ban會讓整個模型無解，包括未參與任何工作的人。只合併calendar bans，真實人工工作保持獨立占用，重疊仍INFEASIBLE。
- 同備份run38349834149已過C1/C2/C3/C4/C6/C7；安全摘要查到2位假日請假重疊員工，支持原先全案無解根因。其C5已非INFEASIBLE而是OPTIMAL但新單逾期不可套用。
- C5與早已存在的test_edges.py新單逾期保護不一致；修驗收以同時要求完整可行晚單、獨立validator零issue、逾期診斷、DB拒絕套用及版本／資料不變。沒有放寬產品保護。中間run38350130770的C5驗收用錯opt.blocks格式（DB格式，不是Snapshot格式），1073f92已修，等待重跑。
- e903911的Tests run38350130228全綠；solver **171 passed**（含3新calendar測試）；tools **11/11**本機通過。最新head重跑結果仍需核對。
- PR #18為本輪修復draft；未合併、未正式部署。PR #16仍未合併。
- GitHub repo公開（isPrivate=false）。既有未加密public-schema dump不是完整專案備份；日誌曾含真員工姓名與source_ref，已在本分支換成白名單safeSummary／匿名solver人名；與另一agent同步main時新增的原始request dump也已移除。沒有刪除既有artifact／log，需使用者決定保護方式。
- 已詢問使用者選「改私有」或「保留公開但加密備份」；答覆前不新增未加密備份、不套正式0037、不改倉庫可見性。automation prompt已補此關卡，仍ACTIVE。
- 本輪新開staging網站可直接載入既有`qa-lead@factory-scheduler.test` session，角色組長，測試資源tst01–tst08可見；未讀／猜任何密碼。完整跨帳號Realtime仍未驗收。
- 另一agent仍更新main（11285ea）；本分支以普通merge保留其副本隔離調整與紀錄，不force push，不改其工作區。既有原始敏感dump屬本輪安全修復範圍，不再保留到本分支發布。

1. 推此獨立分支，CI綠後用同一備份11786241413、週一2026-10-12跑C1–C7。未全過則讀精簡診斷，最小重現找原因，不偷偷修改案例期待值。
2. 確認staging現有session與0037、新版web/solver、Realtime；測試資料／權限、衝突、斷線与實際兩端更新。
3. 與PR #16整合；必要修復皆測試後保留PR待發布門檻，不讓其他agent的新提交被覆蓋。
4. 正式0037前另做新鮮備份與還原演練、核對project ref與資料指紋、single-transaction遷移及遷移後資料指紋相同。任何關卡失敗不得套用。

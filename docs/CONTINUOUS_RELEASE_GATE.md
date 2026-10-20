# 持續缺陷探索與發布驗收

## 2026-10-20 R427 — 隔離測試庫補齊每日可拖曳班表：397/397 天 PASS

- 使用者需求：測試模式每天都要有可操作排程。實作範圍只限 Supabase `fkefarcwadvyqqjcjxvp`；正式 `kjnnguekhshkhgycmryl`、1023、Auth、角色、setup_pending、migration 均未開啟或修改。
- 原因：原 103 段測試班表只涵蓋特定日期；直接複製會讓既有工單各工序排程量超過工單量，造成後續 `save_blocks` 拖曳驗證失敗。
- 修正：新增 `tools/daily-test-fixtures.mjs`，建立獨立「每日拖曳練習」員工／機台／單站產品，並為 2026-10-20～2027-11-20 每一天建立獨立工單與 09:00–09:30 班表。測試日曆同區間每天開放；SQL 只允許固定隔離 URL、全交易、可重跑、無 DELETE/TRUNCATE，既有 block ID 存在即不覆蓋使用者拖曳結果。
- 實際執行：Supabase SQL Editor 頁面明示 `factory-scheduler-staging` 與 project ref `fkefarcwadvyqqjcjxvp`；回傳 `daily_practice_blocks=397`、first_date=2026-10-20、last_date=2027-11-20。
- 實際覆核：逐日檢查回傳 `missing_or_duplicate_days=0`、`closed_days=0`、`checked_days=397`。PGlite 套用完整 migrations 後，週五／週六／週日／週一 fixtures、重跑不增版、組長 `save_blocks` 真函式拖曳 09:00→10:00 全通過；web 全套 **946/946** PASS。提交 `141daa8` 已推至 PR #48，兩組 GitHub Tests／Deployment smoke 共 10 個 jobs 全綠。
- 未驗證：目前無測試帳密可供本輪代理登入，瀏覽器只能驗證正式前端 `?mode=test` 正確進入隔離登入牆，尚未冒稱真人登入後畫面／手指拖曳通過。使用者登入後刷新即可看到當日「每日拖曳練習機」班表。

> **狀態總覽（常態更新；輪段詳細證據往下）**
> - **正式站**：runtime `e0e6f65`（PR16/PR18 已合併；web bundle index-CV39COdK.js、solver dep-db864um89）。`?mode=test` 三個 VITE_TEST 值已設定、只連隔離 fk 專案＋staging solver（隔離核對 PASS）。**正式站待修**：#45 rs-create 迴歸（正式「輪班表→新增」會失敗）。
> - **staging（領先正式）**：runtime `4f4470a`——含 #43 solver 冷啟動有界重試、#45–#56 共 12 件協同修復（rs-create、sticky 面板、切換成本、標記隔離、存檔並發、LINE/反饋/重置/情境誠實回報、日期排序、xlsx 列印設定、排隊交接完成量）、render.yaml AI 旗標防漂移（sync:false，未部署生效）。web **887/887**、solver **177/177**。staging 實證：#43/#45/#46/#48/#50/#55＋#42 列印封鎖 toast＋#54 前門防禦；單元鎖定：#47/#49/#51–#53/#56。
> - **最新門檻**：隔離與正式 publication 4/4、兩端 Realtime 服務／傳輸／四表訂閱、第二帳戶跨瀏覽器同步均已 PASS；PR40 已合併 main `87cb15b` 並部署正式。尚待登入正式站後確認彙總 chip，以及實體手機硬體驗收（桌面 390×844 路徑已 PASS）。正式 1023／角色／setup_pending／migration 均未動。
> - **本 chat 追蹤**：20 分鐘 automation-8cd66164（ACTIVE）；worktree 分支 codex/continuous-release-gate-20261013；紅線不變（1023/角色/setup_pending/0037/夜間備份 disabled）。

## 2026-10-20 R426 — 新基準 2dd3b10 確認；PR #48（測試模式可發現性）審查完成：CI 全綠、推薦合併

- 狀態：main=2dd3b10（四 PR 已併）；三服務 200。
### PR #48 審查（使用者開立，head=gate 分支，+1383/-4 七檔）
- 實質變更：①dayHTML 於測試模式＋當日無方塊時顯示「這天沒有測試排程／現有測試資料在 {date}」＋「前往測試資料」按鈕（test-mode.js 新增 nearestScheduleDate：找可見機台最近有排程日期）——填補 R379 觀察到的真實缺口（測試模式落在停工日只見空板）；②測試模式橫幅改雙行＋brand/nav 持續性「此為測試模式」標籤（隔離訊號強化）；③5 個新 i18n 鍵（en/vi/th）＋樣式；④新測試檔 test-mode-schedule.test.mjs（nearestScheduleDate 單元＋接線棘輪＋譯文）。
- 文件：ACCEPTANCE_SCRIPT F 部＋gate 全部 checkpoint 歷史（+1312 行）併入 main docs——使用者刻意為之。
- CI：database/frontend/solver×2/web 全 pass。與 main 無衝突（MERGEABLE/CLEAN）。**審查結論：推薦合併**（待使用者授權）。
- 持久記憶已同步新基準與本審查。

## 2026-10-20 R427 — PR #48 更新（協同 session 加入每日拖曳練習 fixtures）：CI 全綠、MERGEABLE/CLEAN，推薦合併

- 狀態：main=2dd3b10；三服務 200。零寫入。
### PR #48 新增內容（協同 session 提交 141daa8＋cb70228）
- tools/daily-test-fixtures.mjs（+112）：獨立「每日拖曳練習」員工/機台/單站產品＋2026-10-20～2027-11-20 每日獨立工單與 09:00–09:30 班表；SQL 限定隔離 URL（fkefarcwadvyqqjcjxvp）、全交易、可重跑、無 DELETE/TRUNCATE、既有 block 不覆蓋——已於隔離庫執行（daily_practice_blocks=397、checked_days=397、missing/duplicate/closed=0）。
- web/tests/daily-test-fixtures.test.mjs（+48）；web 全套升至 946/946。
- 安全掃描：fixtures SQL 無正式 URL/DELETE/TRUNCATE/DROP；僅隔離專案。此工作直接補足真人項②的練習場（使用者登入後每天有可拖曳練習資料）。
- CI：database/frontend/solver×2/web 全 pass；mergeable=MERGEABLE、state=CLEAN。**推薦合併**（待使用者授權）。

## 2026-10-20 R428 — 例行覆核：三服務 200；PR #48 待授權

- 狀態：main=2dd3b10；PR #48（測試模式可發現性＋每日拖曳練習 fixtures）MERGEABLE/CLEAN、CI 全綠待使用者授權。零寫入。

- 瀏覽器補充（新 bundle index-BA47z8as.js）：?mode=test 測試模式橫幅＋登入牆正常（隔離維持）；返回 / 後 Richard session 已失效（登入牆呈現）——判定為分頁閒置逾時之 session 過期（#D1-#D4 不觸 auth；R364 同型往返後 session 曾存活），非部署造成。正式站目前停於可接手的登入頁＝真人項①的起點。注意：以「測試模式」子字串偵測會誤判（正常登入頁含「進入測試模式」連結文字），須比對完整橫幅文案。

## 2026-10-20 R425 — 使用者合併四 PR（#44-#47）→ main=2dd3b10 → 正式部署驗證 PASS

### 使用者動作
- 08:01-08:02Z 連續合併 PR #44（#D1 匯入 loading 守衛）、#45（#D2 tbl-form 帳號切換守衛）、#46（#D3 stale-guard 掃蕩）、#47（#D4 聊天語言重譯）。
### 部署與驗證
- main CI：Tests＋Deployment smoke＋部署 Render 正式環境 workflow 全 success（2dd3b10）。
- Render：web deploy 7194694253＋solver deploy 7194693177（皆 sha=2dd3b10）status=success。
- git ancestry 實證四修正提交（6b90ab3/1edac30/c728f89/bd770b6）全在 main；正式 bundle 由 B6aZuEu_ 更新為 index-BA47z8as.js（Render 自 2dd3b10 建置；#D1-D4 均為局部函式、被壓縮改名，指紋鏈以部署 API sha＋ancestry 為準）。
- 正式健康：標題正常、solver health 200/249ms、?mode=test 隔離橫幅仍在。
- 零正式資料寫入。
### 剩餘真人項（不變）
- ①正式站登入後確認彙總 Realtime chip（機器證據已有：Richard session 曾顯示即時已連線）。②實體手機排程顯示與手指拖曳。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。輪值探索持續。

 — 例行覆核：三服務 200、狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權（MERGEABLE/CLEAN）。零寫入。輪值探索持續。

 — PR #47 變更路徑 zh 回歸 live PASS：busy 結束 tx 還原正常

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。
- staging（2fc44f7）zh 送出「誰請假？」→等待期 spinner＋pending 訊息＋快捷全 zh→回覆（資料查詢…誠實無紀錄）→送出鈕還原「送出」無 spinner＝tx('送出') 改動路徑 live 回歸乾淨；聊天關閉正常。

 — 資料管理頁（員工、設備與工單）驗證 PASS

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。
- 更多→「員工、設備與工單」開啟完整資料管理頁（?view=catalog）：13 人名冊＋搜尋/廠別分組篩選/新增編輯刪除功能描述＋全部工單/產品工序區塊齊全；返回班表正常、chip 健康。

 — 方塊詳情 modal（鍵盤路徑）驗證 PASS；本系列行為面收斂

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。
- 驗證：方塊詳情以 Enter/Space 開啟（tabindex=0+role=button 之鍵盤設計；滑鼠點擊保留給拖曳判定）。王三方塊詳情完整：產品/站別（支架第2站/共3站焊接）、數量 230 件、時間 08:00–11:50（230 分）、機台 tst04、人員、期限＋替換人員建議（不會此機/有空 標記齊全）。關閉正常、回今日正常。
- 至此 R355-R391 行為驗證系列涵蓋全部可達表面（含鍵盤路徑）。

 — 記憶收斂（#D4/PR #47 與 R378-R389 補充入冊）；狀態不變

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。
- 持久記憶已補 #D4（chat retranslate、PR #47、live 證實）與 R378-R389 系列（跨日覆核、python/uv 環境限制、tools 套件須從根目錄跑、fs-hunt 兩項已完成判定），跨 context 連續性維持最新。

 — 三服務健康例行覆核：全部 200

- 狀態：main=e911674 不變；PR #44-#47 待授權。零寫入。
- 正式 web/solver/staging 三服務 HTTP 200。輪值探索持續。

 — #D4 家族掃描（其他一次性建構面）：全乾淨；四 PR 全 MERGEABLE/CLEAN

- 狀態：main=e911674 不變。零寫入。
- 掃描：win.js 零 tx（拖曳把手無文字）；floor 頁隨 render() 重新產 HTML＋canvas（fillText 的故障標籤於繪製時以 tx 求值）＝語言切換即重繪；tour/toast 逐次渲染。聊天面板是唯一一次性建構持久面（#D4 已修，PR #47）。
- PR #44/#45/#46/#47 實查均 mergeable=MERGEABLE、state=CLEAN——四案互不重疊、任意順序可併，待使用者授權。

 — 缺陷 #D4：語言切換不重譯聊天面板（已修復上 staging＋live 證實）；fs-hunt 兩項待辦判定＝已完成（清單過時）

- 狀態：main=e911674 不變；PR #44/#45/#46/#47 待授權。

### fs-hunt NEXT_TASKS 覆核（歷史校正）
- 「解析器錯誤訊息 i18n」＝已實作：src/import-errors.js 顯示層翻譯（樣式比對→tx、安全 fallback）＋完整性測試 3/3 過（kitchen-sink 壞檔每條錯誤 en/vi/th 有譯）＋app.js L2198 已接線。清單過時。
- 「匯入解析載入回饋」＝R284 已解（loading 態＋進度條，R355 實證）。清單過時。

### #D4 重現、原因、修復（live 重現於現行 staging）
- 重現：切換 UI 語言 zh→en（不重載）——主介面全英但聊天面板快捷題目/placeholder/標題殘留中文（面板僅在 installScheduleChat 建構一次，從不重譯）；另同族兩處：busy 結束/清除的送出鈕還原與 mic 事件 placeholder 寫死中文（en 模式下問完第一題送出鈕變中文）。
- 修復（chat-ui.js，PR #47）：retranslate() 重譯靜態文字（對話內容不動、busy 保護）＋refresh() 偵測 I18N.lang 變更即時呼叫（app.js 每次 render 已呼叫 refresh，零改動）；送出還原與 mic placeholder 改 tx()。
- 測試：新 chat-retranslate.test.mjs（3 棘輪）；async-feedback 還原棘輪推進至 tx 版。全套 934/934、build OK。PR #47 CI 全 pass；staging 2fc44f7 deploy 7183324073 success、分支 CI success。
- live 證實：staging 上 en→zh 切換不重載，聊天快捷題目與 placeholder 即時轉中文（修復前殘留舊語言）。零資料寫入。

 — staging 長時段 session 健康覆核：正常

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。
- staging 組長 session 逾日仍有效：重載後登入維持、chip「雲端已儲存＋即時已連線」、10/20（二）班表正常渲染、環境無掛鉤殘留（fetch 原生）。

 — 遷移邊界覆核：main 與 staging 最新皆 0037，無新增遷移

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。
- db/migrations 盤點：origin/main 與 staging 分支最新皆為 0037_permission_whitelist_complete.sql——無任何 PR 或分支引入新遷移，符合「0037 已完成不重跑不額外遷移」邊界。

 — 分支盤點：無新協同分支；狀態不變

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。
- 遠端分支按時間排序：僅本系列分支（gate/staging/三修正分支/PR43 分支）＋main——無其他協作者新推送。輪值探索持續，待授權項不變。

 — 邊界覆核：nightly workflow 367614493 仍 disabled_manually

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。
- 每日資料庫備份 workflow（367614493）實查 state=disabled_manually——符合邊界要求（GitHub 排程延遲時代之以手動補跑＋UTC22:00 備援時段，見既往備份運綱）。

 — 正式站指紋與健康例行覆核：不變且健康

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權（MERGEABLE/CLEAN）。零寫入。
- 正式 bundle 仍為 index-B6aZuEu_.js（e911674/PR43 內容，未被意外更動）；solver health 200/247ms。

 — tools 測試套件覆核：51/57 綠；6 失敗＝age 二進位不在本機 PATH（設計上大聲 fail-closed），零回歸

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權（MERGEABLE/CLEAN）。零寫入。

### 覆核過程
- 初跑（cwd=tools/）：9 失敗——拆解後兩類根因：(a) 權限/遷移/備份測試以 cwd 相對路徑讀 .github/workflows/*，須從 repo 根目錄執行；(b) encrypted-backup 往返測試需 age/age-keygen 二進位。
- 從 repo 根目錄重跑：路徑類全過（backup-artifact/permissions-drill/migration-guard 20/20）；全套 57 測試 51 過 6 失敗——6 個全為 age 往返（本機 PATH 無 age；測試設計「no silent skip」大聲擋下，備份演練曾在裝有 age 的受限本機全綠）。tools 套件不在 CI 矩陣（CI=solver/frontend/database），屬演練期套件。
- 判定：零程式回歸（#D1-#D3 僅動 web/；main 不受影響）。教訓入冊：tools 測試必須從 repo 根目錄跑；age 測試在無 age 環境會 fail-closed。

 — 三 PR 合併就緒狀態覆核：全部 MERGEABLE/CLEAN

- 狀態：main=e911674 不變。零寫入。
- GitHub mergeability 實查：PR #44/#45/#46 均 mergeable=MERGEABLE、mergeStateStatus=CLEAN（與 main 無衝突，任意順序可併；本系列各分支基於 e911674 且修改區域互不重疊）。等待使用者授權。

 — 跨日後 staging 今日班表與連線暫態覆核 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。solver health 200/220ms。
- 跨日 sanity：staging 今日班表正確顯示 10/20（二）「平日 · 停工」（=隔離測試日曆之週二=false 狀態的正確反映）；載入瞬間 chip 為「即時連線中按此更新」（訂閱中暫態＋可操作更新入口），數秒內收斂「雲端已儲存＋即時已連線」；導覽列系統連線亦同。

 — 跨日時間炸彈覆核：本地 web 937/937＋CI 重跑（今日日期）solver/frontend/database 全 success

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 覆核（日期 10-19→10-20 滾動）
- 本地全套 web 測試於今日重跑（staging-deploy 分支＝#D1-#D3 全部內容）：937/937 綠；日期敏感抽查（cloud-test-seed/execution-receipt/startup-recovery）31/31 綠——相對日期防護有效。
- 本機 python 環境失效（uv trampoline spawn 失敗）→ solver 測試改以 CI 於今日重跑驗證：rerun Tests run 39229391697（staging 分支 6de406b、無程式碼變更無部署）→ **solver/frontend/database 三作業全 success**＝整套於 10-20 日期下無時間炸彈。

 — 「最新變更」橫幅自隱行為確認（設計）；狀態不變

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。
- 「最新變更」橫幅未顯示＝latestHTML 設計行為（log 項需含摘要、3 天內、且 fsched-seen 未比對過最新 id；看過即自隱）。非缺陷。chip 健康。

 — 跨機台提示與機台欄渲染抽查 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 抽查
- 1 廠日班表：「2 段排程在其他機台」提示存在（優先項③之其他機機台提示面）；11 個機台欄按鈕（含 tst 測試機）全部渲染。「查看排程」按鈕為情境性（機台選取後之深入連結），非全域——UI 狀態相依，非缺陷。

 — 功能解說導覽開關驗證 PASS；R355-R375 記憶已收斂

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 驗證
- 功能解說：#ov 覆蓋層開啟含 12 按鈕（×＋九主題：排程表觀看/員工設定/工單設定/產量/工作紀錄/備忘/排程助理/欠缺品項/給二廠回一廠＋關閉），× 乾淨關閉、Esc 亦關閉。
- 記憶檔（factory-scheduler-r284-merged.md）已補 R356-R375 全系列狀態（#D1-#D3 三 PR 待授權＋驗證清單），跨 context 連續性收斂。

 — 設定抽屜（外觀/字級/字體/主題色）與深色模式 live 驗證 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入（僅本機偏好切換並還原）。

### 驗證
- 帳戶按鈕開啟設定抽屜：誠實聲明「這台裝置的顯示方式…不會改動其他電腦或手機」；控制項完整（外觀明暗：自動/淺色/深色；字級 85–130%；字體兩款；主題色四色；通知設定）。
- 深色模式：點「深色」→body 背景即時由 rgb(243,244,246) 轉 rgb(14,20,26)、aria-pressed=true；還原「自動跟著裝置」正常、抽屜關閉正常。
- 涵蓋先前世代之深色模式填寫窗、視覺效果系列；現行 build（含 R284 原語）行為正常。

 — 復原（undo）→同步流程 live 驗證 PASS（現行 build）

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。

### 驗證
- 流程：週二 off→on 儲存（寫入 1）→更多→「復原上一步」→toast「已復原上一步」→驗證週二回 false（寫入 2，互抵淨零）→chip 全程「雲端已儲存」（復原寫入正確同步）。
NaN

 — 開加班對話框結構與取消零寫入驗證 PASS（現行 build）

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 驗證
- 加班設定對話框完整：標題含日期、誠實範圍聲明（只調今天、不改同星期其他日、請假者不排工）、主開關（開放加班/不開放）＋雙廠成對「今天可加班/不加班」切換（aria-pressed 正確）＋取消/確認並套用。
NaN

 — 雙分頁近同時寫入衝突演練 PASS（現行 build 無 last-write-wins 覆蓋）

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。

### 演練設計與結果
- 分頁 B（桌面）上班日設定切「週六 off」儲存；隨即（Realtime 傳播窗內）分頁 A（390px）切「週日 on」儲存——兩個競爭寫入打到同一 calendar 資料。
- A 乾淨成功（chip 同步中→雲端已儲存、toast 含後續引導）；最終狀態驗證：**週六=false（B 保留）＋週日=true（A 保留）**＝正確合併、無資料遺失、無 last-write-wins 覆蓋；雙分頁 chip 均「雲端已儲存＋即時已連線」。
- 附帶：還原過程再次踩到 detached DOM 陷阱（對話框重繪後舊節點 dispatch 無效）——測試手法已知問題（非產品缺陷），重查新節點即解。已還原 週六=true/週日=false（本輪 4 次日曆寫入、語意淨零，隔離庫）。

 — 公開倉庫衛生覆核：三個待授權 PR diff 零機密、CI 全綠

- 狀態：main=e911674 不變。零寫入。

### 覆核
- PR #44/#45/#46 完整 diff 掃描 api_key/secret/password/token/Bearer/JWT/publishable 等模式：零命中（僅程式碼中的正當識別字）。三 PR CI（database/frontend/solver/web）現勢全 pass。
- 待辦不變：①使用者授權合併三 PR；②真人項（正式站登入確認 chip、實體手機）。

 — 人／產量（現場回報）抽屜視圖驗證 PASS；UI 表面全覽完成

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 驗證
- 人（people）抽屜：.ops-drawer 渲染「今日缺席 0 人」＋名冊（張三/李四/…），aria-pressed 正確。
- 產量（output）抽屜：渲染每機台「計畫 N 件＋回報狀態（尚未回報）」，關閉（×）正常。
- 至此 UI 表面全覽於現行 build 完成：日/週/工單/流轉/人/產量/欠缺/工作紀錄/備忘/平面圖(canvas)/聊天/對話框群（匯入匯出、上班日、歷史、反饋、權限、情境）——R355-R369 系列全數 PASS 或有設計判定記錄。

 — 工單／給二廠回一廠抽屜視圖現行 build 驗證 PASS；?view 殘留觀察

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 驗證
- 工單與給二廠／回一廠為側邊抽屜視圖（data-act=drawer，主區仍為班表）。兩者內容均正常渲染（工單：工單號/品號/交期；流轉：加工編號/出貨日期/已回），返回班表正常。
- 觀察（非缺陷，記錄）：點「今天」回班表後 URL 仍殘留前一抽屜的 ?view=transfer——重載會重開該抽屜（深連結語意）。缺陷#23 修復保證 ?view 導航不清掉 mode=test 等其他 query；此殘留行為屬可接受 UX。
- 人／產量（現場回報）視圖本輪未重驗（先前世代已測；列為後續輪值候選）。

 — 週檢視與廠區平面圖現行 build 行為驗證 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 驗證
- 週檢視（整週）：現行 build 正常渲染（本週總覽＋日期內容），頁面零溢流（overflow=-15）。
- 廠區平面圖：主視圖呈現（回今天班表列＋廠別切換＋日期導覽＋圖例「藍＝當日有排程、灰＝閒置、紅＝故障」）；機台以 canvas 繪製（DOM 無節點屬預期），程式化像素取樣驗證 973×215 canvas 有 6.7% 彩色像素＝狀態色塊實際繪出（非空白）。返回班表正常。
- 結論：兩視圖在現行 build 行為正常，無新缺陷。

 — 非 app.js 模組系統性掃描：stale 守衛與網路層全數乾淨（負向結果收斂）

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 掃描
- app.js 以外全部模組（40+ 檔）grep await STORE/store/client 與原始 fetch：僅 chat-ui.js L87（SOLVER.chat）與 main.js（boot 初始化）兩處 await；無任何模組绕过有界層自行 fetch。
- chat-ui.js send() 逐行覆核：generation token 檢查（晚到回覆丟棄）、scopeStamp 變更即捨棄並誠實告知、catch 僅 token 持有時顯示「無法回答…未將查詢失敗當成沒有問題」、finally 僅持有時還原送出鈕——守衛完備。
- 網路層全貌：solver.js 3 處全走 fetchWithTimeout（有界）、line-notify best-effort（R362 判定）、supabase 走 SDK。stale-guard 家族審計至此涵蓋全部模組，收斂。

### 結論
- 無新缺陷。#D1-#D3 為本系列唯一實質缺陷（已修，PR #44/#45/#46 待授權）。後續輪值回到行為級探索與真人項等待。

 — 正式 bundle i18n（R284 新鍵）與列印 CSS 靜態驗證 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 驗證
- 正式 bundle（index-B6aZuEu_.js）含 R284 新鍵「產生檔案中…」的越文（Đang tạo file…）與泰文（กำลังสร้างไฟล์…）譯文，以及「正在解析 Excel…」越文——字典完整上正式。
- 動態 i18n 運行證據：R364 於同一正式 build 觀察 Richard session 以泰文 UI 呈現（ตารางผลิต 等）＝語言偏好运行时生效。
- 列印 CSS：正式樣式含 @media print×2 與 @page 規則（列印文件流程先前已驗，規則仍在現行樣式）。

### 結論
- 現行正式 build 的 i18n 字典與列印樣式完整。本輪為靜態＋既有 live 證據組合，無新缺陷。

 — 正式站 ?mode=test 隔離在現行 build（e911674/PR43 後）覆核 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入（僅唯讀導航往返）。

### 驗證
- bundle 層：正式 index-B6aZuEu_.js 同含正式 kjn 與隔離 fkef 參照＋VITE_TEST 值（設計＝測試模式覆寫已部署）。
- 原始碼層（runtime-config.js）：mode=test 嚴格相等檢查（URL 必須等於 https://fkefarcwadvyqqjcjxvp.supabase.co、anon key 必須在、solver 必須等於 staging solver origin），不符即落回正常模式（fail-closed）；隔離 auth storageKey（fsched-test-auth-fkef…）；solverKey 註明絕不沿用正式金鑰。
- 瀏覽器層（正式分頁唯讀往返）：?mode=test 顯示「測試模式 · 不影響正式資料／回正式資料」橫幅＋登入牆（Richard 的正式 session 未帶入測試模式＝儲存隔離生效，明示「正式帳號與測試帳號不共用」）；返回 / 後 Richard session 完整、正常模式 chip 正常。
- 結論：R82-90 建立的測試模式在現行 build（含 R284）維持 fail-closed 隔離，PASS。

 — 現行 build 無障礙命名基線重掃：全視圖 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 掃描設計與結果（staging 6de406b、組長 session、桌面 1280）
- 逐視圖（日、工作紀錄、欠缺品項、日＋聊天開啟）掃描可見 button 與 input/textarea/select 的無障礙名稱（text/aria-label/title/label/placeholder）。
- 按鈕：三視圖＋聊天全部 44+ 顆均有名稱（0 未命名）。輸入：唯一旗標＝#datepick（type=date 無名），查源碼 app.js L820＝刻意隱藏的技術輸入（aria-hidden=true＋tabindex=-1＋opacity:0＋pointer-events:none），可見控制為已命名的日期按鈕（10/19（一） 平日 · 上班）——正確的 picker 模式，非缺陷。
- 結論：延續輪145 基線（25/25 命名＋39 aria-pressed），現行 build（含 R284 六模式與 #D1-#D3 修正）無障礙命名全數 PASS，無新缺口。

 — 優先項②覆核：AI 旗標防漂移已於 10-15 落地（12a36db）；line-notify 靜默吞錯判定＝設計

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零寫入。

### 優先項②覆核（歷史校正）
- render.yaml（main）已含 AI_SCHEDULE_DATA_APPROVED 與 SCHEDULE_CHAT_AI_ENABLED 兩鍵 sync:false 宣告＋註解（Blueprint 同步不得蓋掉 dashboard 值；程式嚴格比對字串 true，缺失=fail-closed 停用）。落地提交＝12a36db（2026-10-15，ops(#44): render.yaml AI flags sync:false — stop blueprint drift，作者 me0608623），main 與全部分支已含。判定：最小防漂移配置已存在，無需新修；此後 Blueprint 同步不會再把旗標蓋成 false。
- 程式碼側對照：solver/app/chat.py L193/L195 非 true 即拒——缺失/錯值都停用，不暗含資料外傳同意。

### line-notify 靜默吞錯稽核（類別一抽查）
- app.js L185/L3205 sendLineNotify fire-and-forget：主操作（排程儲存/故障回報）自有浮現面；LINE 通知失敗不阻擋現場操作，設定狀態可在 LINE 通知對話框查看。判定＝best-effort 設計，不改。

### 優先項清單狀態（①-⑤）
- ① solver 逾時＝已有界（R357 覆核）。② AI 旗標防漂移＝已落地（本輪覆核）。③ 隔離排程可見/拖曳＝R359 證據＋R289 世代。④ 寫入保護/取消/連點/衝突＝#D1-#D3＋既有測試家族。⑤ Realtime 證據＝R361 live＋機器證據；真跨帳戶/真手機＝真人項不變。

 — 跨分頁 Realtime 補讀 live 驗證 PASS（現行 build 6de406b）

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。

### 驗證設計與結果
- 分頁 B（1280 桌面、組長 session）重載乾淨起場（fetch 原生、chip 即時已連線）；分頁 A（390px）新增備忘「R361-RT驗證」（選張三、儲存成功）。
- B 不重載：資料在開啟備忘抽屜時立即呈現（時間窗 <15s，遠小於 60s 安全輪詢間隔；chip 全程「即時已連線」）——per-table Realtime 通道在現行 build 有效推送。
- 刪除推送驗證無法執行：備忘 UI 僅有釘選/新增、無刪除動作（grep 無 memo-del）。記錄為觀察（可能為現場設計：備忘只提醒不刪）。

### 合成資料變更
- 隔離庫 +1 筆測試備忘「R361-RT驗證」（明確標記留存；現有測試備忘：輪59-同步測試、R284 驗證、R361-RT驗證）。

### 結論
- 類別五 Realtime 補讀 live 證據補齊（現行 build）。七類清單全部掃過一輪：#D1-#D3 已修（PR #44/#45/#46 待授權），其餘類別 PASS 或有設計判定記錄。下輪起維持輪值探索並覆核 PR 狀態。

 — 動畫極簡稽核 PASS＋離線→重試→恢復連線實測 PASS

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。

### 動畫/視覺極簡稽核（類別七）
- styles.css 非 R284 動畫僅 .chat-mic.rec pulse（麥克風錄音中指示＝功能性）。減動三層完備：使用者偏好 data-motion（settings.js L60 套用 root）、全域 @media(prefers-reduced-motion) L647 全停、R284 原語專屬覆寫 L1127。
- 模糊效果僅 top/app-nav 的 backdrop-filter（sticky 面板功能性深度提示），行動版 .top 已明確關閉（L610 backdrop-filter:none）。判定：無不必要動畫/裝飾特效，PASS。
### 取消後寫入抽查（情境載入）
- viewScenario：await 後 owner.current() 守衛＋晚到錯誤僅持有時顯示＋finally 清 viewLoading；關閉對話框＝取消，晚到結果丟棄。既有 scenario-read-owner 測試覆蓋雙擋/錯誤/stale。PASS。

### 離線→錯誤浮現→重試→恢復（live 實測，staging 6de406b）
- 模擬斷線（rest/v1 fetch 全拒）→上班日設定儲存：chip 轉「同步失敗，按這裡重試」＋toast「沒存到：檢查排程版本失敗…」——失敗明確浮現、未偽裝成功、提供可操作重試。
- 恢復連線→點重試 chip：0.9 秒內回「雲端已儲存＋即時已連線」。有界恢復、無無界重送。
- 寫入紀錄（隔離庫）：週三上班日 on→off→on（淨零，還原完成）。fetch 包裝為通透模式（僅 __offline 時攔截），重載即清。

### 結論
- 類別五（離線部分）、七、取消抽查皆 PASS 無新缺陷。七類剩：Realtime 中斷補讀競爭（單元已覆蓋 per-table channels＋CHANNEL_ERROR 安全輪詢；live 中斷模擬待下輪）、連點/晚到 ACK 已由 #D1-D3 家族掃過。

 — 窄屏 390×844 全視圖實測（現行 staging 6de406b）：全數 PASS；拖曳受阻判定＝執行保護設計

- 狀態：main=e911674 不變；PR #44/#45/#46 待授權。零資料寫入。

### 390×844 掃描結果（組長 session、現行 build）
- 欠缺品項：表格在 .sheettable 容器內可橫捲（scrollW 1090/clientW 357）；頁面級 overflow=-15 無溢流。30×34 的 ▮ 標記鈕為密集表格微控（旁鄰兩段式刪除，誤觸可復原），記錄不改。
- 日視圖：.grid 在設計內橫捲；頁面無溢流；互動按鈕 0 個低於 44px 門檻。
- 上班日設定 modal：343px 寬完全納入（16–359）；14 顆按鈕全部 ≥ 門檻；內容無內部溢流。
- 聊天面板：18–357 適配；打字點點在 390px 可見且納入（right=161）。
- 工作紀錄：無溢流、表格可捲動；桌機表頭「＋加一列」≤800px 隱藏＝設計，行動版浮動 .addrow-mobile 56×56（aria-label ＋加一列、data-act 相同）可用。
### 拖曳驗證（390px）與受阻判定
- 今日 1 廠僅兩方塊（王三/劉四，皆 M20 有報工件數）；10/16 A07 方塊亦存在。真實座標拖曳（cua.drag）與合成三段式指標皆不啟動（無 .dragghost/預覽）。
- 事件送達探針證實 pointerdown(target=.blk 內 .n)/pointermove/up 均到達 document → 排除環境因素；對照 app.js L1171-1183 拖曳啟動閘：readOnly||executionOf(block)||<8px。權限正常（＋手動排班可開、memo/日曆/工作紀錄均可寫）→ 判定兩方塊具報工執行保護，禁拖＝設計行為（執行保護方塊不得拖動）。
- 誠實標注：本輪未能在現行 build 上找到「未受執行保護」的既有方塊做正向拖曳展示（需新增工單+手動排班=新增寫入，未做）；正向拖曳證據沿用 R289 世代（390×844 拖曳→底部預覽→取消 PASS）與 E2E 測試。殘留 modal 曾遮擋指標已排除並還原（回今天、縮放開關回開）。

### 結論
- 窄屏類別本輪無新缺陷；兩個 390px 觀察（▮ 30×34、執行保護禁拖）均為設計。七類清單續行。

 — 缺陷探索 #D3：profile/feedback/access 流程帳號切換守衛掃蕩（已修復上 staging）

- 狀態：main=e911674 不變；PR #44/#45 待授權。

### #D3 重現與原因（系統性掃描 await STORE.* 全部呼叫點）
- 四處漏網（同 #D2 家族，memo/leave/scenario/password/tbl-form 已有守衛）：
- saveOwnProfile（最重）：await updateProfile 後無條件 STORE.userName=name——帳號切換後把舊帳號顯示名寫到新 store 物件＋render＋toast（單元重現：切換後新 store.userName 被污染）。
- feedback-send：晚到成功會 closeModal 新 session 的對話框＋感謝 toast；晚到失敗顯示舊錯誤。
- access-reset/access-save：晚到成功 toast＋對新 session 重開 access-accounts loading 對話框（單元重現：重開計數=1→0）。
- access-accounts 載入器（nav case＋MODAL_ACT）：晚到失敗 closeModal 新 session 的任意對話框。

### 最小修正（commit 於 codex/stale-guard-sweep-20261019）
- app.js 六處：標準捕捉三元素（store/userId/authEpoch）＋owns()；晚到成功跳過 toast/關窗/重開；晚到失敗僅在持有時 toast；按鈕 re-enable 移 finally；載入器只關自己的 loading 對話框。
- 新測試 web/tests/stale-guard-sweep.test.mjs（2 案例：profile 改名污染、access 重開對話框，各含對照組）。

### 測試／CI／部署／staging
- 專項 2/2＋回歸 21/21（三檔）；全套 web 933/933（main 基準 931＋2）；build OK。PR #46 檢查全 pass（database×2/frontend×2/solver×4/web×2）。與 #44/#45 無檔案重疊可獨立合併。
- staging：6de406b → deploy 7170099023 success、分支 CI（Tests＋Deployment smoke）success；載入健康抽查（組長 session、chip 即時已連線、主區正常）。本輪零資料寫入。

### 下一步
- PR #44/#45/#46 待授權；續七類探索（離線/Realtime 競爭、窄屏 44px、動畫極簡等）。

 — 缺陷探索 #D2：tbl-form 儲存缺帳號切換守衛（已修復上 staging）＋優先項①覆核

- 狀態：main=e911674 不變；PR #44（#D1）開啟待授權。

### 優先項①覆核（solver 逾時）
- 實查 web/src/solver.js：post() 全部走 fetchWithTimeout（正常 60s、測試模式 120s，AbortController）；check() 有 3s/45s 上限＋有界重試；錯誤轉「排程服務沒有回應」。判定＝已有界，無需新修。

### #D2 重現與原因
- 類別：帳號切換後舊請求污染新狀態。saveTableForm（欠缺品項/給二廠回一廠/工作紀錄 列儲存）在 await commit 期間帳號切換（STORE 換物件或 authEpoch 變）後：成功路徑仍設 UI.flashNewRow＋對新帳號 toast「已儲存」；失敗路徑對新畫面 toast 舊錯誤＋重繪新帳號對話框。同型守衛已存在於 memo/leave/scenario/password（#50/#51/#62/#65/#66），tbl-form 漏網。單元重現：table-form-save 夾具 pending commit→換 STORE→resolve/reject→污染成立。

### 最小修正（commit 1edac30，PR #45）
- app.js：儲存開始捕捉 store/userId/authEpoch；commit 後 sameStore() 不成立→跳過 flash 標記與「已儲存」；catch 對已切換 store 完全靜默（不回滾/不 toast/不重繪）；同帳號失敗（如中途撤權）仍回滾草稿＋顯示錯誤。
- table-form-save.test.mjs：+3 測試（切換後成功不提示不閃爍、切換後失敗全靜默、同帳號失敗仍回滾＋提示）；夾具補 STORE/flashNewRow。

### 測試／CI／部署／staging 實測
- 專項 8/8；全套 web 934/934；build OK。PR #45 檢查全 pass（database×2/frontend×2/solver×4/web×2）。staging：af7cf99 → deploy 7169678406 success、分支 CI（Tests＋Deployment smoke）success。
- staging 實測正常路徑：新增欠缺品項列（R284-D2驗證/3）→「已儲存」toast＋對話框關閉→列落地→兩段式刪除清除（淨寫入 0）。

### 下一步
- PR #44/#45 待使用者授權合併 main；續七類清單探索。

 — 缺陷探索 #D1：匯入 loading 對話框守衛絆倒後永轉（已修復上 staging）

- 狀態：main=e911674（R284 已上正式，web deploy 7168447876＋solver deploy 7168492789 均 success，solver health 200/235ms）；open PR=0 起手。

### 重現與原因（單元級重現，R355 瀏覽器教訓後採 vm 夾具）
- web/tests/import-race.test.mjs 既有案例「changed store/user/auth epoch/permission」即為 #D1：匯入解析中所有權變更（如 realtime 撤銷 canArchive）→ xlsx-import change handler 四個守衛靜默 return → 同一次匯入的 loading 對話框（spinner＋不定進度條）永久停留、無逾時無錯誤面（舊測試甚至把 UI.modal===loading 固化為預期）。

### 最小修正（commit 6b90ab3）
- web/src/app.js：新增 dismissStaleImport()（守衛絆倒時，若 UI.modal===request 且 loading 仍開著→closeModal()），套用於 4 個守衛點（import 之後、readImportXlsx 之後、legacy digest 之後、catch）。晚到資料仍永不採納；已替換/已關閉的對話框不受影響。
- web/tests/import-race.test.mjs：所有權變更斷言改為「對話框已關閉（null）且無新開」；新增 catch 路徑測試（權限/epoch 變更後解析錯誤→對話框關閉）。

### 測試／CI／部署
- 專項 20/20；全套 web 932/932；build OK。PR #44（base main，僅 6b90ab3）全部檢查 pass（database×2/frontend×2/solver×4）。**待使用者授權後合併 main（不自動併）**。
- staging：fix 併入 codex/excel-friendly-ui-20260930（merge commit 3297476；衝突兩檔以修正分支版解=含 R284+fix）→ deploy 7168975461 success；分支 CI（Tests＋Deployment smoke）success；staging 實測匯入正常路徑不受影響（範本→誠實三錯、無卡住、可關閉）。
- 本地與 Render bundle hash 因 VITE 環境嵌入本就不同（CSS index-DVP2KAsb.css 兩邊一致），部署 API sha=3297476 即建置來源。

### 寫入紀錄
- 本輪零資料寫入（僅唯讀瀏覽器操作）。

### 下一步
- 缺陷探索清單續行：靜默失敗、取消後寫入、連點/晚到 ACK、切頁/登出污染、離線/Realtime 競爭、窄屏 44px、動畫極簡。

 — R284 六模式非同步回饋完成合併上正式（實質輪）

使用者新授權（本輪起）：停止靜止輪；R284 驗證後逕行合併 main。

### 差異與候選版本
- staging 分支 88cf3d7 相對 origin/main=16d9c9b：實質內容僅 R284（7 檔：app.js/chat-ui.js/i18n.js/styles.css＋3 測試檔）；8c50343（登入品牌）≡ main c4cb74f 內容相同；R170-R283 checkpoint 文件全部排除。88cf3d7 既有 CI（Tests＋Deployment smoke）皆 success。worktree 乾淨無重疊。
- 乾淨分支 codex/async-feedback-main-20261019 自 main cherry-pick → 4657cca。

### 本地驗證
- 專項 42/42（async-feedback/i18n-behavior/import-race/excel-export-context）；全套 web 931/931（首跑 31 檔失敗＝新 worktree 未 npm install 缺 @electric-sql/pglite，安裝後全綠，非回歸）；vite build OK。

### staging 實操作（既有組長 session；每項真實互動取樣）
1. 按鈕忙碌/防連點：備忘儲存→「儲存中…」+spin+disabled（t=976）→完成關閉（t=2988）；驗證失敗（未選人/機）toast「請至少指定一台機台或一位人員」不出現假忙碌，對話框可重試。
2. spinner：歷史班表/查看反饋 loading 態 role=status + .spin。
3. skeleton：歷史排程 loading 顯示 .skel-row×2/.skel×4，載入完成換真內容（「尚未存入舊版排程…」）；查看反饋同模式。
4. 進度條：匯入 4.9MB 假檔＝indet→--val:100%（真實 FileReader 進度幀）→indet（解析）→錯誤對話框；32MB 檔被 5MB 上限誠實拒絕；空白範本＝解析 110ms（本機對照）→三項驗證錯誤誠實列出；失敗均未顯示為成功。
5. 頂部載入線：上班日設定儲存→queueSync busy 期間 .loadbar 掛載＋chip「同步中…」持續整個同步→完成後移除、chip 回「雲端已儲存」（週二 on→off 已還原）。
6. 打字點點：聊天送出→submit disabled+spin、pending「正在讀取排程」+3 顆 .dots→回覆後全部還原。
- 額外：聊天 fetch reject（模擬逾時）→「無法回答：排程服務沒有回應。沒有修改排程；也未將查詢失敗當成沒有問題。」＋按鈕還原；等待中切換視圖無污染無崩潰。
- reduced-motion：live CSS assets/index-DVP2KAsb.css 含 .spin,.skel,.prog.indet>i,.loadbar:after,.dots i,.loadbar.out{animation:none}（靜態驗證；IAB 無法動態模擬 media query，如實標注）。
- Excel 重入守衛：x-xlsx 同 tick 雙擊＝createObjectURL×1、下載×1、忙碌態「產生檔案中…」可見、完成還原。
- 測試儀器教訓（重要）：FileReader.prototype.readAsArrayBuffer 延遲 patch 曾造成「匯入無限卡解析」假缺陷；全新重載（全原生驗證）後範本匯入正常。真實觀察＝import 流程守衛（UI.modal!==request 等）觸發時靜默 return，loading 態無逾時/錯誤面——列入缺陷探索候選（#D1）。
- 寫入紀錄（僅隔離 fk）：1 筆測試備忘「R284 驗證：載入動畫測試」（保留）、週二上班日 on→off（還原）。

### PR／CI／部署／正式驗證
- PR #43（最小：僅 cherry-pick 4657cca）→ CI 六檢查全 pass（database/frontend/solver ×2 commits）。
- 合併 main=e911674（2026-10-19 15:49 本地）；Render deployment 7168447876（main - factory-scheduler-web，e911674）status=success。
- 正式 bundle index-B6aZuEu_.js 含 fs-spin/loadbar/readPct（3 標記）、CSS index-DVP2KAsb.css 含全部 fs-* keyframes、i18n「產生檔案中…」在字典+使用處。
- 正式站唯讀瀏覽器驗證：既有 Richard（老闆）session 重載新 bundle 正常、彙總 chip＝「即時已連線」（機器證據；真人驗收①仍待使用者親自確認，不冒充）。未做任何正式寫入。

### 下一步
- 進入持續缺陷探索（不再靜止輪）。候選：#D1 import loading 無逾時/錯誤面；清單七類（靜默失敗、取消後寫入、連點/晚到 ACK、切頁/登出污染、離線/Realtime 競爭、窄屏遮擋/44px、動畫極簡）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD 77a59f7（R353），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD 8187620（R352），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD d0f036b（R351），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD 81988f1（R350），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD 84db364（R349），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD b013df9（R348），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD 80cc470（R347），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD ae18413（R346），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD e16b53b（R345），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD cdda2f6（R344），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD 231be45（R343），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（staging 已部署待驗收）。

— 靜止輪：狀態不變

- PASS（狀態未變，最小檢查點）：fetch 後 HEAD dd6a615（R342），工作樹乾淨；open PR=0；origin/main=16d9c9b（PR41/PR42 已合併）、staging 分支=88cf3d7（六模式非同步回饋，deploy 7151260443）；最新 deployment 7151263713（main solver 16d9c9b，10-18）＝既有基準，非本輪新事件。無合成資料變更。
- 剩餘真人項不變：①正式站登入後確認彙總 Realtime chip；②實體手機排程顯示與拖曳；③R284 六模式 UI 併入 main 之授權（先進 staging 已完成）。

— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R341（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R340（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R339（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R338（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R337（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R336（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R335（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R334（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R333（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R332（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R331（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R330（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R329（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R328（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R327（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R326（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R325（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R324（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R323（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R322（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R321（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R320（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R319（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R318（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R317（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R316（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R315（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R314（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R313（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R312（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R311（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-19 R310（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R309（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R308（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R307（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R306（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R305（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R304（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R303（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R302（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R301（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R300（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R299（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R298（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R297（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R296（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R295（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R294（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R293（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R292（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R291（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R290（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。僅剩真人：正式站登入 chip、實體手機、R284 UI 進 main 授權。

## 2026-10-18 R289（20min）— 使用者回報 F 部結果＋worktree 重疊覆核（已乾淨）

- **F 部結果記錄（ACCEPTANCE_SCRIPT 已同步標註）**：①正式 chip＝**阻擋**（正式站停登入頁、瀏覽器無正式帳號 session；機器側證據完整：21 表 publication 4/4 ok、PR41 8faa65e 已上正式、聚焦 8/8＋全量 922/922＋CI 綠、web+solver live、/health ok、未動 SQL/1023/Auth）；②手機＝**390×844 瀏覽器尺寸隔離 staging PASS**（方塊可見、拖曳→底部預覽→取消、toast 正確、chip 即時已連線）——使用者明確聲明不冒充實體手機，真機仍待真人。
- **worktree 重疊覆核**：使用者所述「另一輪對 app.js/styles.css 的修改」在本輪實查時 **worktree 完全乾淨**（無 dirty、無 stash、無新 remote 分支、0 open PR）——該修改已由該輪自行處理或捨棄，無需我方動作。
- **狀態**：main 16d9c9b（含 8faa65e）、staging 88cf3d7（R284 六模式）。合成資料無變更。
- **剩餘**：①正式 chip 需真人登入；②實體手機需真人；③R284 UI 進 main 授權。

## 2026-10-18 R288（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。待人類：F 部兩項＋R284 UI 進 main 授權。

## 2026-10-18 R287（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。待人類：F 部兩項＋R284 UI 進 main 授權。

## 2026-10-18 R286（20min）— 靜止輪：狀態不變

- main 16d9c9b、staging 88cf3d7、無分支/PR/部署、無合成資料變更。待人類：F 部兩項＋R284 UI 進 main 授權。

## 2026-10-18 R285（20min）— gate 分支併 main 16d9c9b（PR41/42 內容）→ 2d44a5d

- main 已含我的 #66/#67/#68（PR41）＋他人 PR42（登入品牌字體）；gate 分支普通 merge 同步（無衝突），已推。0 open PR。staging 仍 88cf3d7（六模式回饋），main 未含本輪 UI。
- 待人類：F 部兩項＋R284 UI 進 main 授權。

## 2026-10-18 R284（20min）— 使用者指定：非同步等待回饋系統（六模式）設計＋實作上 staging 88cf3d7

- **設計對映（使用者提出六模式→本專案場景）**：轉圈＝modal 短等待（歷史排程／權限帳號／反饋／情境清單＋解析提示）；骨架屏＝版型可預期的 modal 清單載入；進度條＝Excel 匯入（讀檔 FileReader 真實百分比、解析期誠實標示為不確定進度，不假造數字）；頂部細線＝雲端同步週期（queueSync busy 時 3px 細線、結束淡出、不擋看板）；按鈕載入態＝6 個非同步動作鈕（匯入確認／歷史存檔／表格儲存／備忘儲存／重排一輪／Excel 下載）busy 時內嵌 spinner＋鎖住；打字點點＝AI 聊天等待回覆（文字保留給讀屏、點點 aria-hidden）。
- **實作（88cf3d7，7 檔）**：styles.css 追加六原語（純 CSS 零依賴、共用 fs-spin/fs-skel/fs-indet/fs-dot/fs-bar-out keyframes、**prefers-reduced-motion 全覆蓋停動畫改靜態**）；app.js：updateSyncChip 掛頂部細線、5 個 loading 分支升級 spinner＋骨架行、匯入改 FileReader onprogress 真實％＋解析期 indet、x-xlsx 對話框內 busy 旗標防重入、6 鈕 spinner；chat-ui.js：等待訊息打字點點＋送出鈕 spinner＋結束還原「送出」。i18n：新增「產生檔案中…」en/vi/th（「同步中」已有）。
- **測試**：新增 async-feedback.test.mjs 9 測（六原語存在、reduced-motion 覆蓋、44px 不縮、loadbar 隨 busy 開關、6 鈕 spinner、x-xlsx 防重入、FileReader 進度＋fallback、loading 分支骨架、聊天點點＋還原）。**修改 2 個既有測試（意圖不變）**：i18n-behavior 輪116 棘輪推進到新 loading 標記（spinner＋文字＋進度條）；import-race fixture 補 renderModal stub。web 全量 **931/931**（922+9）；build 過。
- **staging**：CI success；deployment **7151260443 @88cf3d7 success**；live `index-CS8kxVtI.js`＋CSS `index-DVP2KAsb.css` 實測：CSS 六原語全在（含 reduced-motion）、JS loadbar hook／點點 HTML／onprogress 全在。（初次驗證抓錯檔——CSS 在獨立 .css asset，已更正。）
- **重大狀態變化（本輪期間發生）**：使用者合併 **PR41**（=我的 #66/#67/#68 gate 修復全部進 main）與 **PR42**（他人：正式登入品牌字體簡化 c4cb74f）→ main=**16d9c9b**，正式 web+solver 部署 7151263607/7151263713 success。#66/#67/#68 待授權事項**結案**。
- **待人類**：F 部兩項人工驗收（正式站登入看 chip＝PR41 上正式後可直接看；實體手機）。下一輪：gate 分支併 main（16d9c9b）＋本輪 UI 是否進 main待授權。

## 2026-10-18 R283（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R282（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R281（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R280（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R279（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R278（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R277（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R276（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R275（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R274（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R273（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R272（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R271（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R270（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R269（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R268（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R267（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R266（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R265（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R264（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R263（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R262（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R261（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R260（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R259（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R258（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R257（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R256（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R255（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R254（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R253（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R252（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R251（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R250（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R249（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R248（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R247（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R246（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R245（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R244（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R243（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R242（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-18 R241（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R240（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R239（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R238（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R237（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R236（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R235（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R234（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R233（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R232（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R231（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R230（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R229（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R228（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R227（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R226（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R225（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R224（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R223（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R222（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R221（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R220（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R219（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R218（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R217（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R216（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R215（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R214（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R213（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R212（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R211（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R210（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R209（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R208（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R207（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R206（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R205（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R204（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R203（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R202（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R201（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R200（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R199（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R198（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R197（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R196（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R195（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R194（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R193（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R192（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R191（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R190（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R189（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R188（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R187（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R186（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R185（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R184（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R183（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R182（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R181（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R180（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R179（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R178（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R177（20min）— 靜止輪：狀態不變

- main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收＋#66/#67/#68 併 main 授權。

## 2026-10-17 R176（20min）— 靜止輪：狀態不變

- main 87cb15b（CI 綠）、staging 2b7c606、無分支/PR/部署、無合成資料變更。待人類：F 部兩項人工驗收（見 ACCEPTANCE_SCRIPT F 部）＋#66/#67/#68 併 main 授權。

## 2026-10-17 R175（20min）— ACCEPTANCE_SCRIPT 新增 F 部（最終兩項人工驗收的操作腳本）

- 既有 E 部寫於 PR19–30 世代（pre-merge）；新增 **F 部**：收斂後僅剩的兩項人工驗收（①登入正式站看彙總 chip「即時已連線」、②實體手機看板載入/切換/拖曳/底部抽屜取消），含前置事實清單（R167–R173 已機器驗證、勿重做）與不通過時的回報方式。
- main 87cb15b、staging 2b7c606、無部署、無合成資料變更。checkpoint 連同 F 部已推（cb393c9）。
- 待人類：F 部兩項＋#66/#67/#68 併 main 授權。

## 2026-10-17 R174（20min）— 靜止輪：獵捕無新缺陷（roster UI 抽樣亦硬化），狀態不變

- roster-ui 抽樣＝modal 草稿＋audit 錯誤時 rs-apply disabled＋預覽確認制——硬化。main 87cb15b、staging 2b7c606、無分支/PR/部署、無合成資料變更。
- 待人類：①登入正式站看彙總 chip；②實體手機；③#66/#67/#68 併 main 授權。

## 2026-10-17 R173（20min）— 三套件本地全量刷新：solver 177/177、tools 43/43（root 語義）、web 922/922

- **本地全量（gate 分支 e452aaf）**：solver `uv run pytest`＝**177 passed**（140.8s，與歷史基準一致）；tools 從 repo root 跑＝**43/43**；web 維持 **922/922**（R170）。三套件本地全綠。
- **本地環境筆記（非缺陷）**：①tools 若從 `tools/` 目錄內直接跑，catalog-inventory 測試因 CWD 相對路徑解析成 `tools	ools...` 而失敗——從 repo root 跑即綠（CI 即此語義）；②encrypted-backup 的 8 個 age 測試硬依賴 `age`/`age-keygen` 二元（無則明確失敗、不靜默跳過——設計如此），本機未裝 age，CI 有裝且綠。兩者皆環境差異，非程式碼缺陷。
- **狀態**：main 87cb15b、staging 2b7c606、無新分支/PR/部署、無合成資料變更。
- **待人類**：①登入正式站看彙總 chip；②實體手機；③#66/#67/#68 併 main 授權。

## 2026-10-17 R172（20min）— 獵捕輪（無新缺陷）：scenario-save 覆核；#68 E2E 清理 DB 級確認

- **獵捕覆核（無缺陷）**：`saveScenarioFromModal`＝11 條件擁有權（store/client/user/epoch/permission/modal/PV/S 身分＋JSON/state/date/factory/page/drawer/focus）＋未知結果同名重試沿用原 id（冪等）——非同步寫入面已系統性硬化，本輪抽樣再無未設防點。
- **R171 E2E 清理 DB 級確認**：staging ?view=worklog 重載（新讀資料庫）→「還沒有資料」、無 TEST-r171 殘留＝刪除已落庫；chip「雲端已儲存 即時已連線」（隔離專案即時全通）。
- **狀態**：main 87cb15b、staging 2b7c606、無新部署、無合成資料變更。
- **待人類**：①登入正式站看彙總 chip；②實體手機；③#66/#67/#68 併 main 授權。

## 2026-10-17 R171（20min）— #68 staging E2E＋嚴重度誠實校正；獵捕覆核（undo/addrow/delete）

- **獵捕覆核（無缺陷）**：undo→commit→queueSync 雲端重同步正確（無靜默分歧）；addrow 開 modal＋saving 防重入；刪除有 confirmRow/tbl-del 二次確認。
- **#68 staging E2E（fix 上線版 index-AlI8oRn3.js）**：工作紀錄新增 TEST 列（TEST-r171）→ 開 hour 格子編輯＋標記元素 → **等滿兩個刷新週期（75 秒）：`.cellinp` 元素同一（dataset 標記仍在）＝背景 tick 完全未重繪**＝修復機制現場生效（修復前 tick 會 render() 重建輸入）。
- **嚴重度校正（誠實記錄）**：R170 把 #68 框成「格子輸入中文字被清」——E2E 發現**現有 UI 的內嵌格子全是 select（時/分），文字格不存在**（rush 表無內嵌編輯、走表單 modal＝本來就被 !UI.modal 擋）。實際影響＝select 選擇半途被重置（窗口極小）＋**頁面未提交篩選字元/焦點在 tick 被清**（wl-date 等＝真實但輕微）。修正（!UI.editCell＋!UI.page）仍正確且未來任何文字格加入即受保護，但缺陷嚴重度應記為「低」而非「中」。
- **合成資料（已清理）**：隔離 fk 新增 rush 列 TEST-r171-vendor＋wl 列 TEST-r171 供 E2E，測後均以正規刪除路徑移除（toast 已刪除×2，DOM 驗證不存在）。淨變更＝0。
- **main 未動（87cb15b）；無部署（staging 維持 2b7c606）。**
- **待人類**：①登入正式站看彙總 chip；②實體手機；③#66/#67/#68 併 main 授權。

## 2026-10-17 R170（20min）— 自行修復 #68：每分鐘背景刷新清掉頁表輸入中的格子內容

- **獵捕覆核（無缺陷）**：queueSync（epoch/chain 序列化＋候選保留）、runDrawerWrite、changeExecutionConfirmation（busy/擁有權/pendingReload）——皆已硬化。
- **新缺陷（#68，自行修復）**：啟動時的 60 秒「今天看板」自動刷新條件只查 drag/modal/PV——**沒查 `UI.editCell` 與 `UI.page`**。頁表（工作紀錄／欠缺品項／跨廠加工，這些頁面 view 仍="day"）的 cellinp 在 blur 前輸入只存在 DOM；分鐘刷新 render() 重建表格＝**輸入中未提交的格子內容被清掉**（頁面輸入如 wl-date 的未提交字元同理）。
- **修正（2b7c606，最小）**：interval 條件加 `!UI.editCell`（編輯中不刷）與 `!UI.page`（頁面檢視無時間性內容，不需背景刷新；看板本身照舊每分鐘刷新）。新測試 `refresh-interval-guard.test.mjs`（結構斷言，比照 layout-regression 慣例）。
- **驗證**：新測 1/1；web 全量 **922/922**（921+1）；build 過；CI success；staging 快進 a16da84→2b7c606、deployment **7124429131 success**；live bundle **index-AlI8oRn3.js** 實測 minified interval 含 `!u.editCell&&!u.page`（首次抓到舊 hash＝CDN 邊緣殘留，三次破快取重取確認）。
- **PR16 分支同步**：→ **85b2641** 已推送。main 未動（87cb15b）。合成資料無變更。
- **待人類**：①登入正式站看彙總 chip；②實體手機；③#66/#67/#68 併 main 授權。

## 2026-10-17 R169（20min）— 自行修復 #67：solver-check 延遲結果重繪他人視窗（清輸入中草稿）

- **獵捕覆核（無缺陷）**：openPlans（planCalculationJob 重入＋五重身分）、reportWork（busy/擁有權/件數不倒退不超額/pending 機制）、saveCellEdit（數字整數≥0、日期 regex、重複碼回滾、驗證器 rollback）——皆已硬化。
- **新缺陷（#67，自行修復）**：`solver-check`（更多→設定→重新連線排程服務）await `SOLVER.check()`（#43 使其可達 45 秒＋）後**無條件** `renderModal()`＋toast——`renderModal` 會重繪**當時開著的任何視窗**：使用者期間關掉設定、改開新增備忘並打字，延遲結果一到，備忘視窗從模型重建＝**打字中未儲存的草稿被清掉**，再加一條過時 toast。
- **修正（a16da84）**：進入時記下 `const m=UI.modal`；await 後 `if(UI.modal!==m)return;` 才 renderModal＋toast（視窗被換掉或關掉＝靜默，家族慣例）。新測試 `solver-check-stale.test.mjs` 2 測（新鮮路徑正常重繪＋toast；換視窗/關視窗兩路皆不重繪、不出 toast）。
- **驗證**：新測 2/2；web 全量 **921/921**（919+2）；build 過；CI 38930762392 success；staging 快進 09757cc→a16da84、deployment **7123938426 success**；bundle `index-Gf-a3LkZ.js` 實測 minified 區段 `const t=u.modal;await ge.check(),u.modal===t&&(...)`＝守衛上線（#66 password 守衛同段可見亦在線）。
- **PR16 分支同步**：→ **0ed6ba6** 已推送。main 未動（87cb15b）。合成資料無變更。
- **剩餘人工（不阻機器）**：①登入正式站看彙總 chip；②實體手機顯示與拖曳。#66/#67 併 main 待新授權。

## 2026-10-17 R168（20min）— 新基準核可＋自行修復：password-save 過時回應擁有權守衛（#66）

- **R167 基準獨立驗證**：main=**87cb15b**（PR40 已併）、0 open PR、CI 綠；正式 web+solver 部署 7123186027/7123186223 @87cb15b 均 success；正式專案 4 表（machines/products/calendar_weekly/machine_layout）以正確 JWT 復探全部 system **ok**＝publication 修復屬實。gate 分支 merge main → 14d6cbb。
- **新缺陷（#66，自行修復）**：`password-save`（設定登入密碼）await `STORE.setPassword`（auth.updateUser，網路可達數秒）後**無條件** `closeModal()`＋toast——延遲的成功/錯誤會關掉使用者後來開的任何視窗、彈過時提示（#65 同家族最後一處）；且無視窗類型防護。**修正**：進入即驗 `UI.modal?.t==="password"`；await 前擷取 modal/store/client/user/authEpoch 五重身分＋`owns()`——成功僅在 owns 時關窗＋toast、錯誤僅在 owns 時復原按鈕＋提示。
- **測試**：新增 `password-save-owner.test.mjs` **5 測試**（success/error×5 身分維度：換 modal/store/client/user/epoch 後舊回應不動現有視窗、不出訊息、不復活舊按鈕、setPassword 僅一次；新鮮成功正常關窗；短碼/不一致僅驗證 toast 不觸網；非密碼視窗 no-op）。web 全量 **919/919**（914+5）；build 過。
- **staging（僅 staging，未動 main——新規則：併 main/部署正式需新授權）**：CI 38927873623 @09757cc success；快進 staging 分支 dc06f16→09757cc；deployment **7123485457 success**；bundle `index-BFkFN22P.js` 實測 password-save 區段含視窗類型防護＋authEpoch 擁有權。
- **PR16 分支同步**：→ **328209d** 已推送。合成資料無變更。
- **剩餘人工（不阻機器工作）**：①登入正式站看彙總 chip；②實體手機顯示與拖曳。

## 2026-10-16 R167（人工授權執行）— 正式 publication 4/4＋PR40 合併部署 PASS

- **正式 publication SQL（PASS）**：在 Supabase Dashboard 明確核對 `factory-scheduler / kjnnguekhshkhgycmryl` 後，依使用者授權執行且僅執行 `ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_layout, public.machines, public.products, public.calendar_weekly;`；SQL Editor 回傳 `Success. No rows returned`。隨後唯讀查 `pg_publication_tables` 回傳 **4 rows / 4/4**：`calendar_weekly`、`machine_layout`、`machines`、`products`。
- **Realtime 執行期驗證（PASS）**：由正式站線上 bundle 解析其正式 anon JWT（不輸出 token），直接對正式 Realtime 端點逐表 `phx_join`；四表 system status 均為 **ok**。已證明 R153 的 publication 根因消除。正式站當時為登出狀態，故登入後彙總 chip 尚未由本輪冒充驗收。
- **PR40 合併（PASS）**：PR40 `codex/fix-line-save-owner-20261016` head `27beb2d`，差異僅 `web/src/app.js` 與新增 `web/tests/line-settings-owner.test.mjs`；mergeable CLEAN，既有 Tests／Deployment smoke test 全綠。解除 draft 後以普通 merge 合入 main，merge commit **`87cb15b9f4a9abb9b571373fec1a6f9edf62463c`**。
- **main CI（PASS）**：Tests run **38925784468** frontend/database/solver 全綠；Deployment smoke test **38925784351** success；正式部署 workflow **38925784493** success。
- **Render 正式部署（PASS）**：web deploy **dep-db94brmi0phs73c8pgl0** live、solver deploy **dep-db94brqjnfac73ah3lt0** live，兩者 commit 均為 `87cb15b`。正式 web 線上 bundle `/assets/index-XkMe5qkJ.js` 已驗證含 `line_notify_settings`、`authEpoch` ownership guard 與 `finally` 按鈕復原路徑。
- **紅線**：未修改正式 1023 資料列、Auth、角色、setup_pending；未執行任何其他 SQL／migration；未建立 Render 資源或費用。publication 是既有 Realtime 發佈集的 metadata 調整。
- **仍未驗**：登入正式站後的彙總 chip（本輪瀏覽器無正式登入 session）與實體手機硬體操作。隔離測試模式與跨帳戶同步沿用 R151–R153 已通過證據。

## 2026-10-16 R166（20min）— 靜止輪：狀態不變（正式 SQL 仍未跑、PR40 待進 main）

- main d3371d5、worktree 乾淨；正式 machines 仍 error、chip 仍中斷（17 表即時＋補讀）。待使用者＝正式 ALTER PUBLICATION／PR40 進 main／真手機驗收。

## 2026-10-16 R165（20min）— 靜止輪：狀態不變（正式 SQL 仍未跑、PR40 待進 main）

- main d3371d5、worktree 乾淨；正式 machines 仍 error、chip 仍中斷（17 表即時＋補讀）。待使用者＝正式 ALTER PUBLICATION／PR40 進 main／真手機驗收。

## 2026-10-16 R164（20min）— 靜止輪：狀態不變（正式 SQL 仍未跑、PR40 待進 main）

- main d3371d5、worktree 乾淨；正式 machines 仍 error、chip 仍中斷（17 表即時＋補讀）。待使用者＝正式 ALTER PUBLICATION／PR40 進 main／真手機驗收。

## 2026-10-16 R163（20min）— 靜止輪：狀態不變（正式 SQL 仍未跑、PR40 待進 main）

- main d3371d5、worktree 乾淨；正式 machines 仍 error、chip 仍中斷（17 表即時＋補讀）。待使用者＝正式 ALTER PUBLICATION／PR40 進 main／真手機驗收。

## 2026-10-16 R162（20min）— 靜止輪：狀態不變（正式 SQL 仍未跑、PR40 待進 main）

- main d3371d5、worktree 乾淨；正式 machines 仍 error、chip 仍中斷（17 表即時＋補讀）。待使用者＝正式 ALTER PUBLICATION／PR40 進 main／真手機驗收。

## 2026-10-16 R161（20min）— 靜止輪：狀態不變（正式 SQL 仍未跑、PR40 待進 main）

- main d3371d5、worktree 乾淨；正式 machines 仍 error、chip 仍中斷（17 表即時＋補讀）。待使用者＝正式 ALTER PUBLICATION／PR40 進 main／真手機驗收。

## 2026-10-16 R160（20min）— 靜止輪：正式 SQL 仍未跑（machines 仍 error、chip 仍中斷）；PR40 待使用者

- main 仍 d3371d5、worktree 乾淨（PR40 在 gate 分支 dc06f16 已上 staging 待使用者決定進 main）；正式 machines 復探仍 error；17 表照常即時＋補讀。待使用者＝正式 ALTER PUBLICATION（4 表）／PR40 進 main／真手機驗收。

## 2026-10-16 R159（20min）— PR40 併入：LINE 設定儲存過時回應擁有權守衛（#65）

- **新協同分支**：`codex/fix-line-save-owner-20261016`（27beb2d，PR40）。**缺陷**：`ln-save`（LINE 通知設定儲存）在 await 前未擷取身分——延遲的成功/錯誤回應會 `closeModal()` 關掉使用者後來開的**別的**對話框、顯示過時 toast、錯誤時按鈕不復原。屬既有 stale-reply 家族（同 #50/#51/#62 模式）的最後一處未防護點。
- **修正（他人）**：await 前擷取 modal/store/client/user/authEpoch 五重身分＋`owns()` 檢查；成功僅在 owns 時 close＋toast、錯誤僅在 owns 時 toast、`finally` 恢復按鈕。新測試 `line-settings-owner.test.mjs`＝3 測試×5 身分維度×3 結果（15 場景：換 modal/store/client/user/epoch 後舊回應一律不動現有對話框、不出訊息、按鈕復原、寫入僅一次）。
- **併入與驗證**：普通 merge → **dc06f16**（保留他人提交）。新測 3/3；web 全量 **914/914**（911+3）；build 過（8.6s）；CI **success**。
- **staging 部署**：快進 `codex/excel-friendly-ui-20260930` c2b066f→dc06f16；deployment **7119938621 success**；即時 bundle `index-Bpx9CygF.js` 實測 upsert 附近含 authEpoch 守衛（minified 指紋）。
- **PR16 分支同步**：→ **4cb389d** 已推送。
- **正式 SQL（R158 狀態延續）**：publication 4 表仍未補、chip 仍中斷、17 表照常即時＋補讀。正式環境 main=d3371d5 未動（PR40 尚未進 main）。合成資料無變更。
- **下一項**：PR40 待使用者決定進 main 時機；正式 ALTER PUBLICATION＋真手機驗收仍待使用者。

## 2026-10-16 R158（20min）— 靜止輪：正式 SQL 仍未跑（machines 仍 error、chip 仍中斷），其餘不變

- main d3371d5、無分支/PR/部署、worktree 乾淨；正式 machines 復探仍 error；17 表照常即時＋補讀。待使用者正式 ALTER PUBLICATION（4 表）＋真手機驗收。

## 2026-10-16 R157（20min）— 靜止輪：正式 SQL 仍未跑（machines 仍 error、chip 仍中斷），其餘不變

- main d3371d5、無分支/PR/部署、worktree 乾淨；正式 machines 復探仍 error；17 表照常即時＋補讀。待使用者正式 ALTER PUBLICATION（4 表）＋真手機驗收。

## 2026-10-16 R156（20min）— 靜止輪：正式 SQL 仍未跑（machines 仍 error、chip 仍中斷），其餘不變

- main d3371d5、無分支/PR/部署、worktree 乾淨；正式 machines 復探仍 error；17 表照常即時＋補讀。待使用者正式 ALTER PUBLICATION（4 表）＋真手機驗收。

## 2026-10-16 R155（20min）— 靜止輪：正式 SQL 仍未跑（machines 仍 error、chip 仍中斷），其餘不變

- main d3371d5、無分支/PR/部署、worktree 乾淨；正式 machines 復探仍 error；17 表照常即時＋補讀。待使用者正式 ALTER PUBLICATION（4 表）＋真手機驗收。

## 2026-10-16 R154（20min）— 正式 SQL 仍未跑：machines 表復探仍 error、chip 仍中斷（其餘靜止）

- main 仍 d3371d5（CI 綠）、worktree 乾淨、無新分支/PR/部署。正式 chip 重載後仍「ขาดการเชื่อมต่อ」；`machines` 表以正確 JWT 重探仍 system error＝publication 4 表未補（R153 診斷不變，待使用者正式 SQL）。17 表照常即時＋補讀中。
- 無合成資料變更。隔離側全綠（R152）。

## 2026-10-16 R153（20min）— 更正＋正式專案根因確定：同款 4 表未進 publication；先前「1006 傳輸層全斷」係探測抓錯 key 之假象

- **更正 R146/R152**：先前正式 WS「1006 升級被拒」的診斷**錯誤**——探測時 bundle 相鄰字串抓到**測試模式的 sb_publishable key**，正式端點對該 key 回 401（curl 可見 UNAUTHORIZED），瀏覽器呈現 1006；「Settings→API exposure」建議作廢。正確做法（本輪）：從 `VITE_SUPABASE_URL` 前方取**正常模式的 legacy JWT anon key**。
- **正式專案現況實測（正確 key）**：①curl WS 升級＝**HTTP 101**；②頁內 WS＋phx_join＋system＝**ok**（服務層完全正常——使用者 R151 的啟用動作生效）；③**逐一探 21 表：17 ok、4 error＝`machine_layout`/`machines`/`products`/`calendar_weekly`**——與隔離專案 R139 完全同款缺表（兩專案由同一套 schema 而來）。這 4 表使彙總 chip 顯示中斷（17 表實際仍即時，安全補讀續跑）。
- **待使用者（正式專案 SQL，職權所在）**：`ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_layout, public.machines, public.products, public.calendar_weekly;` 執行後正式 chip 應翻「即時已連線」。
- **其他**：main 仍 d3371d5 無部署；worktree 乾淨；無合成資料變更；隔離側全綠（R152）。

## 2026-10-16 R152（20min）— 使用者三行動獨立覆核：隔離 100% 實證修復；正式仍有落差（inspector 通、公開 WS 端點 1006）

- **隔離專案（使用者 ALTER PUBLICATION 後）獨立驗證 PASS**：①staging 分頁重載 → chip＝「**系統連線 即時已連線**」（21+1 每表頻道全健康、彙總 SUBSCRIBED、60 秒安全補讀應已停止）；②逐一重探原毒化 4 表（machines/products/calendar_weekly/machine_layout）→ system status 全部 **ok**。R139-R141 的診斷與修復鏈閉環。
- **正式專案落差（需再查一處）**：使用者 dashboard Inspector 見 sync/join/訂閱成功，但本輪兩個獨立實測仍不通——①頁內直連 `wss://kjnnguekhshkhgycmryl.supabase.co/realtime/v1/websocket`＝**1006（升級被拒）**；②正式站 app 本身（匿名、正常模式）chip 仍「การอัปเดตเรียลไทม์**ขาดการเชื่อมต่อ**」（中斷）。解釋：Dashboard Inspector 走平台內部通道，**公開 WS 端點**另由 API 設定管轄——請到正式 Supabase **Settings→API** 檢查「Expose realtime API」（與 Realtime 服務開關是兩回事）是否啟用；若已啟用仍 1006，携本證據報 Supabase 支援。
- **第二帳戶同步**：使用者以既有 viewer 實測組長改隔離加班設定→viewer 免重載同步、測後還原＝跨帳戶即時同步 PASS（使用者證詞＋通道已實證健康；本輪未獨立重測）。真手機硬體驗收仍待使用者。
- **紅線覆核**：正式 1023/Auth/setup_pending/migration/Render 部署未動（使用者聲明＋本輪 main 仍 d3371d5 無部署）。合成資料無新增變更。
- **下一項**：使用者查正式 Settings→API 的 Realtime exposure；其餘（真手機）照舊。隔離側全綠，持續監看新協同分支。

## 2026-10-16 R151（人工授權執行）— 隔離 Realtime 修復＋正式 Realtime 恢復＋雙帳戶同步 PASS

- **隔離 publication 已修（PASS）**：在 Supabase Dashboard 明確核對 `factory-scheduler-staging / fkefarcwadvyqqjcjxvp` 後執行使用者指定 SQL：`ALTER PUBLICATION supabase_realtime ADD TABLE public.machines, public.products, public.calendar_weekly, public.machine_layout;`。同次唯讀查 `pg_publication_tables` 回傳 **4/4**：`calendar_weekly`、`machine_layout`、`machines`、`products`。未在正式專案執行 SQL，未套 migration。
- **staging 真 Realtime 恢復（PASS）**：重新讀既有 staging 組長分頁後 chip 為「雲端已儲存／即時已連線」；第二帳戶也同樣連線。這是實際頁面訂閱狀態，不再是 R150 的中斷狀態。
- **正式 Realtime dashboard＋服務／傳輸層實測（PASS；非 app 全表 PASS）**：正式 `factory-scheduler / kjnnguekhshkhgycmryl` 的 Realtime Settings 顯示 service enabled、public channels enabled、DB pool=2、Postgres Changes pool=2。Inspector 加入暫時公開頻道 `codex-health-20261016` 後收到 `sync`、`join` 與 `Subscribed to PostgreSQL`（`status=ok`），隨後停止監聽。R153 後續逐表覆核證實 21 表中仍有 4 表未進 publication，故本項只證明服務／傳輸層；不能代表正式 app chip 已恢復。未廣播、未寫正式 DB、未碰 1023/Auth/roles/setup_pending。
- **第二帳戶與跨瀏覽器同步（PASS）**：沿用既有 `me0608623+test-viewer@gmail.com`（未新建帳戶、未改密碼/角色），以一次性 magic link 登入獨立 Chrome；頁面顯示「電視／檢視」「排程唯讀」、10/16 隔離測試班表與「即時已連線」。IAB 的 `qa-lead@factory-scheduler.test` 將 10/16 加班由關→20:00，viewer 在不重載下立即顯示新狀態及「有新的變更」toast；lead 再關回，viewer 同步恢復「未開加班」。隔離測試資料已恢復原狀。
- **手機版可自動驗收（部分 PASS；真機仍未驗）**：Chrome/IAB 以 390×844 驗證底部導覽、排程資料與大按鈕可見；lead 對 `測試X13` 方塊做真指標拖曳，成功進入「手動排班預覽」，並因變更落在已過時間而顯示「不能把新工作排在已經過去的時間」、停用確認；按取消後方塊仍為原 `08:00–08:40`，零寫入。這是桌面瀏覽器的手機尺寸/觸控路徑，不冒充實體手機硬體驗收；目前無已連接可控制的手機。
- **未變更**：正式 1023 資料、正式 Auth/角色、正式 setup_pending、所有 migration、Render 部署與程式碼均未動；沒有新帳戶、沒有新資源或費用。
- **下一步**：使用者在實體手機重新整理 staging 或正式 `?mode=test`，確認既有測試排班與拖曳預覽；若真機結果一致，可將最後一項由「未驗」改 PASS。機器端不再把隔離 publication 或正式 Realtime 列為 blocker。

## 2026-10-16 R150（20min）— 靜止輪：狀態無變化

- 無新分支/PR、main 仍 d3371d5（CI 綠）、worktree 乾淨同步；隔離 publication SQL 仍未跑（staging chip 重載仍中斷）；無部署、無合成資料變更、無新缺陷。使用者三行動不變（隔離 ALTER PUBLICATION／正式 Realtime 服務檢查／第二帳戶·真手機）。

## 2026-10-16 R149（20min）— 靜止輪：狀態無變化，不重複健康內容

- 無新分支/PR、main 仍 d3371d5（CI 綠）、worktree 乾淨同步；隔離 publication SQL 仍未跑（staging chip 重載仍中斷）；無部署、無合成資料變更、無新缺陷。機器端可做項全數收斂（詳 R142-R148）。
- 使用者三行動不變：①隔離 ALTER PUBLICATION（4 表）②正式 Realtime 服務 dashboard 檢查 ③第二帳戶/真手機驗收。

## 2026-10-16 R148（20min）— 狀態靜止輪：A07 合成基準完整性＋正式健康快照（皆 PASS）

- **環境**：無新分支/無 main 變動（d3371d5）；worktree 43202a1 乾淨；CI 綠；0 open PR。隔離 publication SQL 仍未跑（staging chip 重載後仍中斷）。
- **A07 合成基準實查（交接指定保留項）**：staging 1廠 10/16 看板＝「測試-趙六 測試A07 組裝 150件 **09:30–10:20 釘**」完整在位（手動固定標記在），頁面 0 錯誤——測試基準未被破壞。
- **正式健康快照**：web bundle 仍 index-7bIYWoBy.js（d3371d5）、HTTP 200/0.30s、solver /health ok（ortools 9.15.6755、database true）。
- **無新缺陷、無部署、無合成資料變更。**
- **下一項**：同前——監看新協同分支；使用者剩餘＝隔離 ALTER PUBLICATION SQL、正式 Realtime 服務檢查、第二帳戶/真手機驗收。

## 2026-10-16 R147（20min）— fs-hunt 待辦覆核：兩項機器候選均已在 main 實作（清單過時）；狀態靜止

- **環境**：無新分支/無 main 變動（d3371d5）；worktree edf706b 乾淨；CI 綠；0 open PR。隔離 publication SQL 仍未跑（staging chip 重載後仍中斷）。
- **fs-hunt NEXT_TASKS 覆核（報告最後更新 10-14，落後本迴圈）**：輪115 兩項「機器可做」候選——①excel.js 錯誤訊息 i18n：**已實作**＝`import-errors.js` 顯示層翻譯（PATTERNS＋ROW_MESSAGES＋TABLES/FIELDS/UNITS/LABELS 字典＋未辨識回傳原文的安全 fallback；app.js 匯入預覽經 `translateImportError` 顯示），其完整性測試 `import-errors.test.mjs` 本輪實跑 **3/3 綠**；②匯入解析 loading 回饋：**已實作**＝app.js 匯入 change handler 先開 `loading:true` modal（附註解「首次載入 excel 模組可能數秒，先給回饋」）。兩項均無需再動作，清單過時非缺陷。
- **無新缺陷、無部署、無合成資料變更。**
- **下一項**：監看新協同分支；使用者剩餘＝隔離 ALTER PUBLICATION SQL、正式 Realtime 服務檢查（dashboard）、第二帳戶/真手機驗收。

## 2026-10-16 R146（20min）— 正式專案 Realtime 診斷：傳輸層全斷（WS 1006×2），與隔離專案同時對照隔離可開＝服務本身故障

- **環境**：無新分支/無 main 變動（d3371d5）；worktree 737ed18 乾淨；CI 綠。隔離 publication SQL 仍未跑（staging chip 仍中斷）。
- **正式專案（kjnnguekhshkhgycmryl）Realtime 探測（頁內 WS、publishable key 僅存在頁面）**：`wss://…/realtime/v1/websocket` 兩次嘗試均 **onerror→close 1006（upgrade 失敗）、零訊息**；5 表逐一探測全部 timeout（連對照表 orders 也無 system 事件）。**對照組**：同 context 同時刻隔離專案（fkefarcwadvyqqjcjxvp）WS **可開**——排除瀏覽器/網路/context 因素。
- **結論**：正式專案的故障與隔離專案**不同層**——隔離是「WS 通、4 表 publication 缺」（一行 SQL 可修）；正式是**Realtime 服務傳輸層全斷**（升級被拒），等同 fk 專案 R91 時代的 WS 500 狀態。app 端已就緒（每表頻道在正式上線）：服務恢復後即可連線。
- **待使用者（正式專案職權）**：到正式 Supabase dashboard 檢查 Realtime 服務狀態（可能 paused/disabled 或需重啟／提交 Supabase 支援）。無須改 app 碼。
- **合成資料**：無變更。staging/正式均未部署（main 穩定）。
- **下一項**：監看新協同分支；使用者剩餘＝隔離 ALTER PUBLICATION SQL、正式 Realtime 服務檢查、第二帳戶/真手機驗收。

## 2026-10-16 R145（20min）— 優先項④列印路徑 staging 實證 PASS（#55 字面名稱＋A4 版面＋廠別日期標題）

- **環境**：無新分支/無 main 變動（d3371d5）；worktree fd8b75d 乾淨；CI 綠。隔離 publication SQL 仍未跑（staging chip 重載後仍中斷）。
- **列印實測（合併後 build）**：攔截 `window.open`（列印文件以 document.write 寫入新視窗）→ 更多→匯出／匯入 Excel→「列印本日排程」（data-act=x-print-day）。擷取文件實證：**標題「2 廠 日班表 2026-10-16」**（廠別＋日期正確）；`@page size:A4 portrait` 列印版面；含機台（tst06 測試-電鍍槽）、工單（測試M19）、**字面產品/工序名（電鍍，#55 escape 契約）**、件數 360；文內嵌 `window.print()`。表格 6 列（thead＋5 方塊列，機台欄 rowspan 合併）。
- **合成資料**：無變更（列印文件僅攔截記憶體、未開真視窗、未寫入）。正式環境未動。
- **④收斂聲明**：接收端保護面（取消 0 寫入／真正套用／輪詢備援／離線重試／Excel 位元組級／列印文件）在合併後 build 均有 staging 實證；跨帳戶與真手機仍屬 ⑤（待使用者）。
- **下一項**：監看新協同分支；使用者剩餘＝隔離 ALTER PUBLICATION SQL、第二帳戶/真手機驗收、（可選）正式 publication 檢查。

## 2026-10-16 R144（20min）— 合併後 Excel 匯出位元組級回歸（#61 檔名＋廠別範圍＋OOXML 內容）staging PASS

- **環境**：無新分支/無 main 變動（d3371d5）；worktree 91e4518 乾淨；CI 綠；staging 維持 c2b066f 內容（＝main src）。隔離 publication SQL 仍未跑（staging chip 重載後仍「即時更新中斷」）。
- **Excel 匯出實測（staging、合併後 build、攔截 createObjectURL＋anchor.download）**：更多→匯出／匯入 Excel→下載 XLSX（當前檢視＝2廠 10/16）。**檔名 `產線排程_2 廠_2026-10-16.xlsx`**（#61：await 前擷取 date/factory，與檢視一致）；MIME 正確、9287 bytes、PK zip。
- **位元組級解析（頁內 zip 解析＋DecompressionStream inflate）**：OOXML 條目齊全（[Content_Types].xml／xl/sharedStrings.xml／sheet1+sheet2／styles/theme）；sheet1 27 列；sharedStrings 解壓後＝「產線排程 10/16（五）」標題＋**僅 2 廠機台（tst06 測試-電鍍槽、tst07 測試-檢驗台）**＋真實方塊（測試-馮十一 測試M19 電鍍 08:00–12:00 360件）；1 廠工序（裁切/組裝）**不存在**＝匯出範圍正確跟隨廠別。#61＋匯出內容在合併後 build PASS。
- **記錄**：更多面板按鈕「匯出／匯入」用全形斜線（／），ASCII regex 對不到——自動化以 includes("Excel") 定位。
- **合成資料**：無變更（下載為本機攔截，未寫入資料庫）。正式環境未動。
- **下一項**：監看新協同分支；使用者剩餘＝隔離 ALTER PUBLICATION SQL、第二帳戶/真手機驗收、（可選）正式 publication 檢查。

## 2026-10-16 R143（20min）— 使用者合併 PR39：main=d3371d5，正式四件套齊；隔離 publication SQL 仍未跑

- **狀態變化**：使用者於 06:51:24Z 合併 **PR39** → main **d3371d5**（gate 分支 c2b066f 內容全部進 main：#43 solver 有界重試、R140 realtime 每表頻道、#44 render.yaml sync:false 防漂移＋檢查點文件）。open PRs=0。
- **CI/部署實查**：main @d3371d5 三 workflow全綠（Tests／部署 Render 正式環境／Deployment smoke test 均 success）。正式 web 與 solver **兩者都以 d3371d5 部署完成且 success**（deployments API 最新兩筆）。正式 live bundle 實測 **index-7bIYWoBy.js** 且 grep 確認含 `schedule-changes:"+`（每表頻道指紋）＝修復確實在正式生效；solver /health ok（ortools 9.15.6755、database true）。
- **隔離專案 publication（未跑）**：staging 分頁重載後 chip 仍「即時更新中斷」——`ALTER PUBLICATION supabase_realtime ADD TABLE public.machines, public.products, public.calendar_weekly, public.machine_layout;` 仍待使用者執行；跑完後 chip 應翻轉且安全補讀停止（現在正式/staging 都已有每表頻道，健康表不受影響）。
- **gate 分支同步**：fast-forward 9d96b47→**d3371d5** 已推（main 已包含本分支全部內容，後續檢查點直接疊在 main 之上）。
- **合成資料**：無變更。
- **下一項**：監看新協同分支；使用者剩餘動作＝隔離 ALTER PUBLICATION SQL、第二帳戶/真手機驗收、（可選）正式專案 realtime publication 檢查。

## 2026-10-16 R142（20min）— 使用者執行批次合併：PR19–38 全進 main＝4c67b34；正式部署驗證＋PR39 補遺開立

- **重大狀態變化**：使用者把 PR19–38（二十件，#45–#64）全數合併進 main（3c1e88f→**4c67b34**），open PRs 20→0。main CI @4c67b34：Tests **success**、Deployment smoke test **success**。
- **正式部署（部署 ID 實查）**：web 連續部署（…1461476→63412ff→af47a1a→**4c67b34=7112584159** state **success**）；solver **7112554079 @c4d8b4d**（PR21 動到 solver/app/model.py）**success**。正式 web live bundle 實測 **index-BuuT_ygy.js**；正式 solver `/health` 實測 `{ok:true, ortools:9.15.6755, database:true, capabilities:[work_assignments_v1, staff_roster_draft_v1, schedule_chat_readonly_v1, schedule_chat_range_v1, schedule_chat_ai_v1]}`。
- **正式站瀏覽器實查（全程唯讀、未登入、零寫入）**：①正常模式＝新 bundle 載入、真實 1023 機台（f1aa 2.0T…f1z 0.6T 共 26 台）與泰文 UI 正常渲染、**setup_pending 橫幅仍在（資料待確認·暫停排班，未解除）**、新手導覽對話框正常、`__errs` 0；②`?mode=test`＝「測試模式 · 不影響正式資料」橫幅＋獨立 auth（登入牆顯示「請用測試帳號登入；正式帳號與測試帳號不共用」）fail-closed 隔離在新版完整保留、`__errs` 0。
- **觀察（未深查）**：正式正常模式 chip 顯示「即時更新中斷」（泰文）——正式專案可能也有 publication 缺表（同 R139 模式）或僅因 PR39 未部署；待使用者指示才對正式專案做對應動作（正式 SQL 屬使用者職權）。
- **PR39 開立（gate 分支補遺）**：tree-diff vs main 僅三件＋文件——#43 solver 有界健康重試（＋4 測）、R140 realtime 每表頻道（＋4 新測、2 檔改寫保留防護）、#44 render.yaml sync:false 防漂移；checkpoint/驗收文件。https://github.com/me0608623/factory-scheduler/pull/39 待使用者合併。
- **合成資料**：無新增變更。staging 維持 c2b066f（gate 分支）。PR16 分支 72c8ff1。
- **下一項**：PR39 待使用者合併（合併後正式即獲得每表頻道與 solver 重試）；Realtime SQL（隔離專案 ALTER PUBLICATION）仍待使用者；第二帳戶/真手機驗收不變。

## 2026-10-16 R141（20min）— 兩分頁即時推送實證：R140 每表頻道修復在 staging 現場生效（chip 中斷下健康表照常即時）

- **環境**：無新協同分支；worktree 0bcbbc9 乾淨；main CI 綠 @e0e6f65；staging 維持 c2b066f（兩分頁 bundle 皆 index-CtBY-OGk.js），不重複部署。
- **實證（同帳號兩分頁，明確標示：僅證 Realtime 通道、非跨帳戶驗收）**：分頁A 開備忘清單（0 張）備觀測 → 分頁B 走 app 正規流程：備忘抽屜→新增備忘→填 `TEST-r141-rt 即時推送驗證`＋指定機台 tst06→儲存備忘（toast「備忘已保存」）→ **分頁A 未重載、未操作**，約 3 秒內清單自動出現該備忘＋toast「現場備忘有更新」。
- **推送唯一性證據**：該 toast 路徑 `if(source!=="reconcile"&&…)` 明確排除 60 秒安全補讀（poll 一律以 source="reconcile" 呼叫）→ 只能來自 `schedule_memos` 頻道的 postgres_changes 即時事件。且分頁A chip 仍顯示「即時更新中斷」（4 表未進 publication 的彙總）——**R140 每表頻道隔離在現場生效：壞表只降級自己，健康表照常即時推送**。
- **合成資料變更（已標記可留）**：隔離 fk 專案 schedule_memos 新增 1 筆 `TEST-r141-rt`（指定 tst06；app 無刪除備忘路徑＝設計上僅 upsert，故保留並記錄）。正式環境未動。
- **使用者行動提示**：跑 `ALTER PUBLICATION supabase_realtime ADD TABLE public.machines, public.products, public.calendar_weekly, public.machine_layout;` 後，重載頁面 chip 應翻轉「即時更新中」且安全補讀停止（全頻道健康）。
- **下一項**：監看新協同分支；使用者三決策不變（批次合併 PR19–38＋正式部署／Realtime SQL／第二帳戶、真手機）。

## 2026-10-16 R140（20min）— 自行修復：Realtime 每表一頻道（一表壞不毒化全部）

- **修正（本人，c2b066f）**：R139 證實一張表未進 publication 即毒化整個 21+1 表頻道（WS 同 socket 多 topic 本可隔離）。`store/supabase.js` subscribe() 改為**每張表一個頻道**（`schedule-changes:<table>`＋account_permissions），`_subGen` generation 取代單頻道身分守衛，`_removeChannels()` 統一清理（subscribe 重入與 _clearSession 兩處）。**彙總語意不變**：任一頻道壞 → CHANNEL_ERROR（60 秒安全補讀持續）、全部 SUBSCRIBED 才回 SUBSCRIBED（app.js 消費端零改動）；健康表照常即時推送。
- **測試**：新增 `realtime-channel-split.test.mjs` 4 測（全好彙總 SUBSCRIBED＋per-table 路由／毒化降級 CHANNEL_ERROR 但健康表仍推／重訂閱移除舊頻道＋舊 generation 回呼無效／無 session 21 表）。既有 `realtime-status.test.mjs` 4 測與 `layout-regression.test.mjs` 頻道清理測**改寫以保留原防護意圖**（舊設計的單頻道機制斷言 → 新每表頻道對應斷言：不宣稱即時、舊 generation 無效、stream error 降級且 join 不能掩蓋、登出清頻道保班表）。全量 **911/911**（907+4）、build 過。途中修正自己測試兩處：頻道數其實 21+1（原清單 21 表，非 22）；毒化順序須先全好再毒化才有 SUBSCRED 轉移。
- **CI/部署**：CI run **38857766104** @c2b066f **success**；staging 快進 22d337f→c2b066f，deployment **7112064040** **success**；即時 bundle `index-CtBY-OGk.js` 實測含 `schedule-changes:"+` 每表命名與新結構。兩分頁（A/B）重載新 bundle 後 chip 仍「即時更新中斷」＝**正確**（4 表仍未進 publication，彙總任一壞即中斷；待使用者跑 ALTER PUBLICATION 後應直接翻轉）。
- **未完成（下輪第一項）**：兩分頁即時推送實證（tabB 寫 tabA 免重載自動更新）——本輪發現「開加班」是多人員 modal 流程，需改走備忘等輕量寫入路徑。
- **PR16 分支同步**：`codex/cloud-test-mode-release-20261012` → **72c8ff1** 已推送。合成資料無變更；正式環境未動（main e0e6f65）。
- **下一項**：①兩分頁即時推送實證；②使用者三決策（批次合併 PR19–38＋正式部署／Realtime ticket＝先跑 ALTER PUBLICATION／第二帳戶、真手機）。

## 2026-10-16 R139（20min）— 優先項⑤重大進展：Realtime 中斷根因精確定位（4 張表未進 publication，毒化整個頻道）

- **環境**：無新協同分支；worktree 949b87a 乾淨；main CI 綠 @e0e6f65；staging 維持 22d337f，不重複部署。頁內探測（金鑰僅存在頁面 context、不輸出）。
- **分層探測結果（隔離專案 fkefarcwadvyqqjcjxvp）**：①WS handshake `wss://…/realtime/v1/websocket`：**可開**（R91 時代的 500 已消失＝傳輸層已恢復）；②phx_join（22 表、user token 或 anon key）：**phx_reply ok**；③但隨後 system 事件 `postgres_changes status=error`（"Unable to subscribe to changes with given parameters"）→ 這正是 app `store/supabase.js` subscribe() 的 streamFailed→CHANNEL_ERROR 路徑，chip「即時更新中斷」是**正確偵測**。
- **二分＋逐表定位**：h1(11表) ok、h2(11表) error → q2(machine_layout/employees/machines/products/calendar_weekly) error → 單表逐一測：**machines=error、products=error、calendar_weekly=error、machine_layout=error**（employees ok、其餘 17 表合併訂閱 ok）。結論：這 4 張表（多半未加入 `supabase_realtime` publication）任一存在即毒化整個 22 表頻道。
- **修正配方驗證**：app 原清單去掉這 4 表（17 表）訂閱 → **system status=ok「Subscribed to PostgreSQL」**。
- **待使用者（②Realtime ticket 更新素材）**：在隔離 fk 專案 SQL editor 執行（正式專案不動）`ALTER PUBLICATION supabase_realtime ADD TABLE public.machines, public.products, public.calendar_weekly, public.machine_layout;` 後 app 免改碼即應恢復即時（chip 應轉「即時更新中」）。app 端替代硬化（把 4 表拆獨立頻道、一表壞不毒化全部）列為候選，本輪不實作。
- **合成資料**：無變更。正式環境未動（main e0e6f65）。
- **下一項**：監看新協同分支；使用者三決策（①批次合併 PR19–38 ②Realtime ticket＝本輪根因素材 ③第二帳戶/真手機）。

## 2026-10-16 R138（20min）— 優先項④補遺：#56 未排工作、#51 反饋清單來回（staging 實證）

- **環境**：無新協同分支；worktree 34f56e0 乾淨；main CI 綠 @e0e6f65；staging 維持 22d337f（bundle index-CLJ6Hpoh.js，分頁 reload 後實載），不重複部署。
- **自動化環境記錄**：R135 可用分頁輸入路由也失效（document 捕獲探針 0 事件，與首分頁同症狀）→ 改用頁內 `dispatchEvent(click)`（data-act 委派可達；modal 內按鈕同樣有效）。兩個 IAB 分頁現均無法收 CUA/locator 輸入，後續輪次直接以 dispatch 為主。
- **#56 未排工作（work-queue）**：更多→未排工作 modal 開啟，標題「未排工作與待處理差異」＋免責聲明＋「此範圍目前沒有未排量或已回報短少」＝空狀態渲染正確，與 1/2廠工序排滿的看板一致（effectiveBlockQty 計算無錯誤）。交接短少數量的正算由單元測試 queue-handoff-quantity 覆蓋；本輪為 UI 即時路徑證據。
- **#51 查看反饋（feedback-list，boss 專屬）來回實證**：清單初始＝「還沒有反饋」（RPC list_feedback 成功、無錯誤）→ 意見反饋表單（類型 select：問題／錯誤等 4 項＋textarea）送出合成反饋 **TEST-r138-feedback-list**（明確標記自動化測試資料可刪）→ toast「感謝！意見已送出」→ 重開清單顯示該筆：**owner 顯示「測試-組長」、類型 問題／錯誤、時間 2026-10-16 04:55**——RPC 寫入→清單讀取→owner 欄位渲染全鏈路通。
- **合成資料變更**：隔離 fk 專案新增 1 筆 feedback（TEST-r138-feedback-list，可刪）。其餘未動；正式環境未動（main e0e6f65）。
- **下一項**：監看新協同分支；使用者三決策不變（①批次合併 PR19–38＋正式部署 ②Realtime ticket ③第二帳戶/真手機驗收）。

## 2026-10-16 R137（20min）— PR38 併入：durOf 小數速率 ulp 捨入多給時段（#64）

- **新協同分支**：`codex/fix-duration-rounding-20261016`（c65c481，PR38）。**重現（本輪實測 node IEEE）**：`durOf(qty,rate)=Math.ceil(qty/rate/10)*10`，rate=0.7、qty=21 時 `21/0.7/10=3.0000000000000004`（高於整數 1 ulp）→ ceil=4 → **40 分鐘**（正確值 30）；22@0.7（真餘數 3.1428…）與 63@2.1（恰整數）不受影響。影響面：產品型錄小數速率（件/分）下，特定件數的工時被多加 10 分鐘（21 件＝+33%）。
- **最小修正（他人）**：先扣相對 1-ulp（`slots-Number.EPSILON*Math.max(1,slots)`）再 ceil；新測試 `duration-rounding.test.mjs` 3 項（邊界 30 回填 quantityForMinutes=21、**BigInt 精確算術掃描** 分母 10/100 × 分子 1–99 × qty 至 1e6、真餘數仍進位＋最小 10 分鐫保留）。
- **併入與驗證**：普通 merge → **22d337f**（保留他人提交）。新測 3/3；web 全量 **907/907**（904+3）；build 過（13.3s）；CI run **38851541908** @22d337f **success**。
- **staging 部署**：快進 `codex/excel-friendly-ui-20260930` 82dece7→22d337f；deployment **7111026910** state=**success**。即時 bundle `index-CLJ6Hpoh.js`（?cb）：實測含 `Math.ceil(n-Number.EPSILON*Math.max(1,n))`、舊形 `Math.ceil(x/y/10)` 已消失——修復上線。
- **PR16 分支同步**：`codex/cloud-test-mode-release-20261012` 普通 merge → **0fbc644** 已推送。
- **正式環境**：未動（main 仍 e0e6f65）。合成資料無變更。
- **下一項**：監看新協同分支；使用者三決策不變（①批次合併 PR19–38＋正式部署 ②Realtime ticket ③第二帳戶/真手機驗收）。

## 2026-10-16 R136（20min）— 優先項③手機視窗（390px 模擬）staging 實證：看板可見、日/週手動切換、底部預覽抽屜、44px 目標

- **環境**：無新協同分支；worktree 358248b 乾淨；main CI 綠 @e0e6f65；staging 維持 82dece7（bundle index-EqniYfcJ.js），不重複部署。沿用 R135 可用分頁（組長 session）。
- **390×844 模擬結果（staging 實測）**：①看板 `2廠 10/16 排程` 5 blocks 正常渲染，文件零水平溢流（scrollWidth=clientWidth=375），欄位以內部 scroller 橫向捲動；②日/週＝手動切換：「整週」鈕（實測高 44px）→「本週總覽」週檢視（10/12–10/18 七日卡），點 10/16 回日檢視；③底部固定導覽列存在（今天/工單/人/產量/工作紀錄/備忘/更多）；④點方塊（滾動露出、避開導覽帶後）→ 全寬圓角卡片 modal（327px、× 關閉鈕 44px，內容含員工切換/固定選項）；⑤拖曳方塊（pointer 三段式、投放點須在視窗內否則 elementFromPoint=null 無目標）→ PV 開啟：`.pv-drawer pv-manual-drawer` **position:fixed、貼底（bottom=844=innerHeight）、375 寬、506 高、上圓角 18px**＝手機底部抽屜規格落實（桌面上緣右抽屜 CSS 亦核對：top:78px right:10px）。`注意`：querySelector 撈到第一個 `[data-act="pv-cancel"]` 是 0×0 隱藏鈕，可見取消鈕在抽屜操作列（168×48）。
- **零寫入**：取消後 toast「已取消，排程沒有改變」；拖曳後看板曾顯示 M19 09:30–13:30＋釘＝預覽 pending 態（board 渲染 after 狀態），取消即回復 **08:00–12:00**；PV 完全關閉、5 blocks。無任何 save_blocks/API 寫入（僅 UI 預覽）。
- **記錄（非缺陷）**：手機模擬下頁面本身可捲動，看板區塊起始 y≈772 在固定導覽（top≈766）之下，需捲動露出後才可點——一般手機操作同理（先捲再看），不判缺陷；Real 機行為仍待使用者驗收（模擬≠真機，不偽稱真機驗證）。
- **合成資料**：無變更。正式環境未動（main e0e6f65）。視窗已還原 1280×720。
- **下一項**：監看新協同分支；使用者三決策不變（①批次合併 PR19–37＋正式部署 ②Realtime ticket ③第二帳戶/真手機驗收）。

## 2026-10-16 R135（20min）— PR37 修復 staging 瀏覽器實證（dpScrollTarget 快樂路徑＋零寫入）

- **環境**：無新協同分支；worktree 969affe 乾淨同步；main CI 綠 @e0e6f65。staging 已是 R134 的 82dece7（deployment 7110060743），本輪不重複部署。
- **瀏覽器實證（組長 session 沿用）**：既有分頁輸入路由失效（role-click/CUA/dom_cua 三路在 document 捕獲探針均 0 事件；分頁 bundle 也停在舊快取 index-Bnyk9wq0.js）→ 開新分頁即恢復：bundle=**index-EqniYfcJ.js**（?cb 破快取與部署 API 一致）、localStorage 登入沿用（測試-組長）。
- **PR37 實證**：在 2廠 10/16（5 blocks）以三段式 pointer 事件垂直拖曳「測試A07 檢驗」方塊（時間軸為縱向；水平 +60px 不觸發＝同目標，垂直 +130px 才改時段）→ `enterManualPreview` 開啟「手動排班預覽」抽屜 → **dpScrollTarget 恰好觸發 1 次 scrollIntoView**，目標 `.blk.ro.pv-mv`（被移動方塊），實測置中顯示（rect 331–389 / 720），重試隨即終止——修復後時鐘一致，快樂路徑不退化、無殘留迴圈。
- **零寫入**：點「取消」→ toast「已取消，排程沒有改變」；A07 方塊維持 08:00–08:50、5 blocks、`__errs` 0。與 R69 cancel=0 寫入結論一致。
- **記錄（非缺陷）**：`＋手動排班` 在 1廠/2廠 10/16 與空白的 2廠 10/19 均回「目前沒有可新增的工作（工序已排滿或尚未建立工單）」＝隔離資料狀態；此路徑無法開 PV，須走拖曳路徑。
- **合成資料**：無新增變更。正式環境未動（main e0e6f65）。
- **下一項**：監看新協同分支；使用者三決策不變（①批次合併 PR19–37＋正式部署 ②Realtime ticket ③第二帳戶/真手機驗收）。

## 2026-10-16 R134（20min）— PR37 併入：dpScrollTarget 時鐘混用（#63）

- **新協同分支**：`codex/fix-preview-scroll-deadline-20261016`（622e249，PR37）。重現：`web/src/app.js` `dpScrollTarget` 以 `deadline=Date.now()+800`（epoch 毫秒 ≈1.7e12）設限，卻用 `performance.now()`（頁面載入後毫秒 ≈數千）比較 → `performance.now()<deadline` 恆真：預覽目標永不出現時 rAF 重試迴圈**無界**每幀查 DOM，直到 PV 變更；兄弟函式 `focusDpBack`（行 2415-2419）本來就是 Date.now() 一致用法，此處為單點不一致。
- **最小修正（他人）**：行 2402 `performance.now()`→`Date.now()`；同 commit 新增 `web/tests/preview-scroll-deadline.test.mjs`（3 測試：deadline 停排程／視窗內出現滾動一次即止／PV 取代或取消不再查詢）。本輪複核 diff 確認僅此一行＋測試。
- **併入與驗證**：普通 merge → 82dece7（保留他人提交）。新測試 3/3 綠；web 全量 **904/904**（901+3）；`npm run build` 過（13.2s）。CI run **38845051160** @82dece7 **success**。
- **staging 部署**：快進 `codex/excel-friendly-ui-20260930` 18ee95e→82dece7；deployment **7110060743** state=**success**（web `dep-db8phkdbedkc73f3g26g`；solver 目錄無 diff，Render 跳過）。即時 bundle `index-EqniYfcJ.js`（?cb 破快取）：minified `er`=dpScrollTarget 區段實測 `if(!a){Date.now()<s&&requestAnimationFrame(i)` — 時鐘一致，修復上線。bundle 內其餘 6 處 `performance.now()` 為 solver 計時等合法用途。
- **PR16 分支同步**：`codex/cloud-test-mode-release-20261012` 普通 merge → **c759a75** 已推送。
- **正式環境**：未動（main 仍 e0e6f65；正式部署授權仍待使用者）。合成資料無新增變更。
- **下一項**：繼續監看新協同分支；使用者三決策不變（①批次合併 PR19–37＋正式部署 ②Realtime ticket ③第二帳戶/真手機驗收）。

## 2026-10-16 R133（20min）他人修復併入：#62 預覽重排過時回應污染新預覽（efcee20/PR36）

- 發現：他人分支 fix-rerun-owner-20261016（efcee20，基於 main，已開 PR36）。缺陷：`runRerun` await SOLVER 後**不檢查 PV/R 身分**——使用者取消預覽或開了新預覽後，遲到的回應仍會把新方案注入**舊 P 物件**或渲染已離開的預覽（與本系列 #51 同型的過時回應族）。修法：捕獲 store/user/epoch＋PV===P＋P.rerun===R 五重 `current()`，過時成功/空結果/失敗全部靜默丟棄。
- 併入：普通 merge；rerun-owner **3/3**（現行接受一次＋連點拒絕＋保留原方案、取消/換預覽/換帳戶三路忽略遲到回應、失敗清 busy 如實回報）、全套 web **901/901**＋build 過。
- staging 部署驗收：CI 綠→前進 stage 分支（97a25ee→18ee95e）→deployment **success**。PR16 分支同步。
- 待授權批次：PR19-36 十八件。

## 2026-10-16 R132（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 e3813d0；main CI 綠 @e0e6f65；staging＝97a25ee；PR19-35 十七件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R131（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 b0fb204；main CI 綠 @e0e6f65；staging＝97a25ee；PR19-35 十七件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R130（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 aa2e6de；main CI 綠 @e0e6f65；staging＝97a25ee；PR19-35 十七件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R129（20min）他人修復併入：#61 xlsx 匯出非同步期間切日期/廠別會誤標檔名（7b52164/PR35）

- 發現：他人分支 fix-export-context-20261016（7b52164，基於 main，已開 PR35）。缺陷：`x-xlsx` 在 `await scheduleXlsx` 之後才讀 `UI.date/UI.factory` 組檔名——生成期間使用者切日期或廠別，下載檔名會標成新 context（內容卻是舊的）＝檔名與內容不符。修法：進入時即捕獲 date/factory 決定檔名與資料過濾，await 前後同源。
- 併入：普通 merge；excel-export-context **2/2**（await 中切換不誤標、兩個並行匯出逆序完成各保其名）、全套 web **898/898**＋build 過。
- staging 部署驗收：CI 綠→前進 stage 分支（d2026c8→97a25ee）→deployment **success**。PR16 分支同步。
- 待授權批次：PR19-35 十七件。

## 2026-10-16 R128（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 d3621f4；main CI 綠 @e0e6f65；staging＝d2026c8；PR19-34 十六件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R127（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 4eb61fb；main CI 綠 @e0e6f65；staging＝d2026c8；PR19-34 十六件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R126（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 518ee48；main CI 綠 @e0e6f65；staging＝d2026c8；PR19-34 十六件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R125（20min）他人修復併入：#60 關窗焦點還原可偷走新視窗焦點（38681c7/PR34）

- 發現：他人分支 fix-modal-focus-20261016（38681c7，基於 main，已開 PR34）。缺陷：closeModal 用 rAF 延遲還原焦點給啟動鈕——若使用者在同一幀內開了**另一個視窗**，延遲的 focus() 會把焦點從新視窗偷回舊按鈕（鍵盤操作跳序）。修法：rAF 回呼加 `!UI.modal` 守門。
- 併入：普通 merge；modal-return-focus **3/3**（正常還原一次、斷線/停用鈕跳過、先關再開同幀不偷焦點、反覆關開焦點留在當前視窗）、全套 web **896/896**＋build 過。staging 部署待後續。
- 待授權批次：PR19-34 十六件。
- staging 部署驗收：CI 綠→前進 stage 分支（89164bf→d2026c8）→deployment **success**。PR16 分支同步。

## 2026-10-16 R124（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 8ca5beb；main CI 綠 @e0e6f65；staging＝89164bf；PR19-33 十五件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R123（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 f01493b；main CI 綠 @e0e6f65；staging＝89164bf；PR19-33 十五件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R122（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 a9a8ed8；main CI 綠 @e0e6f65；staging＝89164bf；PR19-33 十五件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R121（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 c67d4c5；main CI 綠 @e0e6f65；staging＝89164bf；PR19-33 十五件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R120（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 c33682e；main CI 綠 @e0e6f65；staging＝89164bf；PR19-33 十五件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R119（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 420d232；main CI 綠 @e0e6f65；staging＝89164bf；PR19-33 十五件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R118（20min）他人修復併入：#59 列印班表的產品/工序名未跳脫＝HTML 注入面（28662a7/PR33）

- 發現：他人分支 fix-print-labels-20261015（28662a7，基於 main，已開 PR33）。缺陷：`printDaySchedule` 的工單格 `esc(o.code)` 有跳脫，但 `prod(o.pid)?.name` 與 `stepName(b)` **未跳脫**——產品/工序名含 `<` 時可注入 HTML 到列印文件（資料來自工單主檔＝老闆輸入，屬防禦縱深缺口）。修法：兩處補 `esc()`。
- 併入：普通 merge；print-labels **2/2**（`<img onerror>` 名稱以純文字渲染；封鎖後重試重印完整文件）＋我的 print-popup-guard 仍綠（同檔共存）、全套 web **893/893**＋build 過。staging 部署待後續。
- 待授權批次：PR19-33 十五件。
- staging 部署驗收：CI 綠→前進 stage 分支（ff1c422→89164bf）→deployment **success**。PR16 分支同步。

## 2026-10-16 R117（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 e52fbdc；main CI 綠 @e0e6f65；staging＝ff1c422；PR19-32 十四件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R116（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 1dfe81b；main CI 綠 @e0e6f65；staging＝ff1c422；PR19-32 十四件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R115（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 698afa2；main CI 綠 @e0e6f65；staging＝ff1c422；PR19-32 十四件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R114（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 6590769；main CI 綠 @e0e6f65；staging＝ff1c422；PR19-32 十四件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R113（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 ef59c26；main CI 綠 @e0e6f65；staging＝ff1c422；PR19-32 十四件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R112（20min）他人修復併入：#58 浮動視窗幾何驗證不全（y/h 可 NaN 入畫）（d0de20a/PR32）

- 發現：他人分支 fix-window-geometry-20261015（d0de20a，基於 main，已開 PR32）。缺陷：win.js `load()` 只驗 x/w 有限——y 或 h 為 NaN/字串的壞資料會通過，paint 時 `clampRect` 算出 NaN 座標＝視窗不可見/不可拖。修法：四欄全驗（x/y/w/h 皆有限＋w>0＋h>0），壞值回預設。
- 註：我在 R37 曾審過 win.js 並記「壞資料回預設」——當時聚焦 load 的 try/catch 與 x/w 檢查，未抓出 y/h 未驗＝審查遺漏，他人補上。單元測試補三案例（壞幾何畫前回退、有效幾何重開＋reflow 存活、復原後可拖/取消/重開）。
- 併入：普通 merge；win-storage **3/3**、全套 web **891/891**＋build 過。
- staging 部署驗收：CI 綠→前進 stage 分支（a7264c9→ff1c422）→deployment **success**。PR16 分支同步。
- 待授權批次：PR19-32 十四件。

## 2026-10-16 R111（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 a1cdd8c；main CI 綠 @e0e6f65；staging＝a7264c9；PR19-31 十三件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R110（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 2b2f921；main CI 綠 @e0e6f65；staging＝a7264c9；PR19-31 十三件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R109（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 c553e3c；main CI 綠 @e0e6f65；staging＝a7264c9；PR19-31 十三件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R108（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 b5a017e；main CI 綠 @e0e6f65；staging＝a7264c9；PR19-31 十三件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R107（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 762891d；main CI 綠 @e0e6f65；staging＝a7264c9；PR19-31 十三件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R106（20min）他人修復併入：#57 solver POST 逾時在表頭後失效＝回應本體可無限掛住（dd17dd8/PR31）

- 發現：他人分支 fix-solver-body-timeout-20261015（dd17dd8，基於 main，已開 PR31）。缺陷：`post()` 先 await fetchWithTimeout（**僅到表頭**、abort 定時器已清），再在窗外 `r.json()`——若服務送出表頭後本體停滯（免費版喚醒/網路半斷），讀取**無限掛住**且逾時不再觸發。修法：把 !r.ok 處理與 `r.json()` 移入 `fetchWithTimeout` 的 consume 回呼＝abort 期限涵蓋到本體完成。
- 併入：普通 merge（與我 #43 的 check() 重試互不重疊、共存無衝突）；新測試 1/1（表頭不清除期限、期限觸發→「排程服務沒有回應」、重試成功）＋我的 solver-check-retry **4/4 仍綠**（交叉無回歸）、全套 web **888/888**＋build 過。staging 部署待後續。
- 待授權批次：PR19-31 十三件。
- staging 部署驗收：CI 綠→前進 stage 分支（4f4470a→a7264c9）→deployment（web＋solver 如有 diff）**success**。PR16 分支同步。

## 2026-10-16 R105（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 7cd7577；main CI 綠 @e0e6f65；staging＝4f4470a；PR19-30 十二件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R104（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 e05b068；main CI 綠 @e0e6f65；staging＝4f4470a；PR19-30 十二件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R103（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 85c319c；main CI 綠 @e0e6f65；staging＝4f4470a；PR19-30 十二件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R102（20min）狀態保持輪（全線不變）

- 例行核對：worktree 乾淨同步 def46b7；main CI 綠 @e0e6f65；staging＝4f4470a；PR19-30 十二件 OPEN 不變、無新協同分支。待使用者三項不變（批次授權／Realtime ticket／真手機跨帳戶）。

## 2026-10-16 R101（20min）狀態保持輪（無新工作面；全線不變）

- 例行核對：worktree 乾淨同步 ef9175b；main CI 綠 @e0e6f65；staging＝4f4470a（12 修復全上線）；PR19-30 十二件 OPEN 不變、無新協同分支。
- 待使用者三項不變：①批次合併＋部署正式（R90 計畫＋E 節驗收單）；②Realtime ticket；③第二帳戶/真手機驗收（A–D 節）。

## 2026-10-15 R100（20min）系列百輪小結：30 輪 20min 追蹤——12 件協同修復上線、7 項修復 staging 實證、瓶頸全在使用者側

- **20min 系列（R71–R100）累計**：我方修復 #43（solver 冷啟動有界重試）＋render.yaml 防漂移；併入他人修復 12 件（#45–#56，PR19–30 全部普通 merge、全數上 staging、web 430→887）；優先項①②③完成、④大部分完成（連點/匯出/下載解析/列印提示皆有實證）、⑤持續阻擋（Realtime R91 實證仍 500、第二帳戶未建立）。
- **實證分層**：staging 級＝#43/#45/#46/#48/#50/#55＋#42＋#54 前門；單元級＝#47/#49/#51–#53/#56；匯出面三層（zip/CSV 內容/列印設定往返）。遺留合成資料：A07（基準保留）、TEST-r94-rscreate 輪班草稿、一筆本機黃標——皆已標識。
- **不變瓶頸（全在使用者側）**：①批次合併 PR19–30＋部署正式（R90 計畫＋E 節驗收單）；②Realtime ticket；③第二帳戶/真手機驗收（A–D 節腳本）。
- 本輪無程式碼變更、無部署。

## 2026-10-15 R99（20min）#54 瀏覽器層探針：UI 表單擋不可能日期（前門防禦）＋空日期雙向墊底——測試列已清理

- 嘗試在欠缺品項新增出貨日 `2026-02-30` 的列：**原生 date input 拒收**（賦值後 value 清空）＝前門防禦有效——不可能日期經 UI 進不去（#54 的文字型壞日期只可能來自匯入/舊資料，該路徑由 excel.js 的 dateValue 回程檢查＋單元測試鎖定）。
- 附帶實證：空出貨日的列在降冪排序下**墊底**（test row 位於最後列）＝dateVal null 語意正確。
- 清理：TEST-r99 測試列經兩段確認刪除（「已刪除」toast、複查不在）；零錯誤、零殘留。待授權批次不變（PR19-30）。

## 2026-10-15 R98（20min）驗收腳本補 E 節：PR19–30 修復批次的 30 秒抽驗清單

- ACCEPTANCE_SCRIPT.md 新增 **E 節**（7 項抽驗，每項 30 秒內）：#45 輪班草稿建立、#46 850px sticky 面板、#48 標記帳戶隔離（雙帳號）、#50 LINE 儲存成功／拒絕路徑、#55 Excel 橫向一頁式、#54 不可能日期墊底、#56 交接批量提示——正式部署後照單驗收。
- 覆蓋分層說明：staging 實證＝#43/#45/#46/#48/#50/#55＋防漂移；單元鎖定＝#47/#49/#51–#54；#51 瀏覽器實證受阻於 boss-only 入口（組長 session）、#52/#53 為本機模式路徑（雲端站不適用）——單元測試已鎖定。
- 本輪無程式碼變更、無部署。待授權批次：PR19-30 十二件。

## 2026-10-15 R97（20min）他人修復併入：#56 排隊視圖交接診斷用計畫量而非完成量（72af57f/PR30）

- 發現：他人分支 fix-queue-handoff-quantity-20261015（72af57f，基於 main，已開 PR30）。缺陷：work-queue 交接批量診斷的前站量用 `b.qty`（計畫量）——前站其實只完成 20/100 時仍顯示「可安排」；與 #22 的口徑原則（完成認現場回報）不一致。修法：`effectiveBlockQty`（完成以 qtyDone 計、未完成保留計畫產能）。附加價值：補排替代段可滿足交接、batch=0 語意鎖定。
- 併入：普通 merge；queue-handoff-quantity **2/2**（完成量診斷＋不可變性、未完成保留產能＋補排滿足＋batch 語意）、全套 web **887/887**＋build 過。staging 部署待後續。
- 待授權批次：PR19-30 十二件。
- staging 部署驗收：CI 綠→前進 stage 分支（0e934c8→4f4470a）→web-staging deployment **success**。PR16 分支同步。

## 2026-10-15 R96（20min）#50 staging 實證：LINE 設定被 RLS 拒絕時表單保留＋真實訊息（拒絕不再假成功）

- 方法（真實 staging、既有 session）：頁內 攔 `line_notify_settings` 寫入並模擬 **403 RLS 拒絕**（returned error 形狀）→ 開 LINE 通知設定 → 儲存。
- 結果：**表單保留**（modal 仍開、標題不變）、toast 顯示真實訊息「new row violates row-level security policy」、**無「已儲存」假成功**、儲存鈕重新可用（可重試）、零錯誤。修復前此情境＝關窗＋「已儲存」成功 toast。
- 註：mock 在頁內 攔截、請求未達伺服器＝**零實際寫入**；分頁已清理。#50 有單元測試＋本 staging 實證。
- 待授權批次不變（PR19-29）。

## 2026-10-15 R95（20min）#48 staging 實證：表格標記以 (project,user) 隔離鍵落localStorage

- 流程（真實 staging、既有 session）：欠缺品項頁 → 點一列「標記／填色」→ 選黃 → 儲存 → localStorage 出現鍵 **`fsched-table-marks-v1:account:["https://fkefarcwadvyqqjcjxvp.supabase.co","05a27bab-…"]`**＝(專案,使用者) 隔離鍵（修復前＝裸 `fsched-table-marks-v1` 跨帳戶共享）。標記前無任何 marks 鍵（乾淨起始）；零錯誤零 toast。
- 遺留：隔離專案裝置 localStorage 多一筆 rush 列黃標（本機偏好、不進資料庫；可由使用者在此裝置清除）。#47/#49–#54 仍由單元測試鎖定。
- 待授權批次不變（PR19-29）。

## 2026-10-15 R94（20min）#45 staging 端到端 PASS：輪班草稿建立→持久化→獨立回讀（迴歸修復實證）

- 流程（真實 staging、既有 session）：更多→輪班表→「＋建立週期草稿」→名稱改 **TEST-r94-rscreate**→「建立草稿」→ **save_staff_rosters POST 200 恰一次**、視窗切到「TEST-r94-rscreate · 固定班 · 草稿」工作表、**零 TypeError/toast**（正式站未修前此步拋 `p is not defined`）。reload 後重進輪班表清單＝**TEST-r94-rscreate 存在**（獨立回讀持久化確認）。
- 遺留合成資料：隔離 fk 專案多一筆名為 TEST-r94-rscreate 的輪班草稿（標識清楚可供日後清理；staff_rosters 屬草稿域，不影響 12/8/20/103 排程基準）。
- 至此 #43/#45/#46/#55＋#48 防漂移配置皆有 staging 級以上實證；其餘協同修復（#47/#49–#54）有單元測試鎖定。PR19-29 待授權不變。

## 2026-10-15 R92+R93（20min）狀態總覽塊更新＋#46 staging 瀏覽器實證

- **R92**：狀態總覽塊（文件頂部）全面刷新——正式 e0e6f65／待修 #45、staging 0e934c8＋（#43＋#45–#55＋render.yaml 防漂移）、待使用者三項（批次授權／Realtime ticket／真手機跨帳戶）、web 885/885＋solver 177/177。
- **R93（#46 實證）**：staging 真實分頁 850×900（static 表頭範圍）：表頭 position=static；滾動 600px 前後＋resize 重算，`--hdr-h` 三次皆 **0px**（表頭滾出 viewport bottom=-331）＝修復生效——靜態表頭不再撐開 sticky 操作面板（修復前會用 ≈269px 撐開）。零寫入、分頁已清理。

## 2026-10-15 R91（20min）Realtime 平台檢查：**仍未恢復**（帶金鑰 WS 500 重現）——ticket 續待

- 探測（隔離 fk 專案）：REST `/rest/v1/` 無金鑰＝401（正常防護）；realtime WS **無金鑰**＝401「No API key found」（合理）；但從 staging 公開 bundle 取出 publishable key（公開設計、非密鑰）後 **WS 帶金鑰＝HTTP 500**——與歷史故障簽名完全相同（WS 帶金鑰 500/REST 200）。正式專案 WS 同樣 401-without-key 形狀（未帶正式金鑰測，不需）。
- 判定：staging Realtime 平台故障**未恢復**，輪詢備援（#40，60s）持續作為唯一同步通道（R69 實證 ~61 秒收斂）。優先項⑤的「Realtime 恢復證據」持續阻擋於 Supabase ticket——使用者側待辦。
- 本輪無程式碼變更、無部署。

## 2026-10-15 R90（20min）授權後執行計畫（一鍵批次）——供使用者決策的具體內容

- **現況**：staging＝release-gate 分支 0e934c8 runtime（領先正式 11 個修復 #45–#55＋#43 solver 重試＋render.yaml 防漂移）；正式＝e0e6f65。main CI 綠。十一個協同 PR（19–29）皆 MERGEABLE/CI 綠且已全部在我的分支內（普通 merge 保留他人提交）。
- **授權後我將執行（順序）**：①核對 PR19–29 仍 MERGEABLE＋main 無新提交；②逐件普通 merge 進 main（衝突即停，不 force）；③main CI 全綠後等 Render auto-deploy（web＋solver，不手動觸發）；④核對兩服務 deployment success＋實際 SHA/bundle；⑤正式 web 瀏覽器抽驗：rs-create 修復（輪班新增可用）、?mode=test 入口、板面渲染；正式 solver /health＋capabilities；⑥錯誤紀錄視窗查詢。全程不動 1023 資料、不重跑 0037、不改 Auth/角色。
- **風險評估**：11 件皆小修（1–15 行）＋各自測試；web 全套 885/885、solver 177/177 在本分支實測；staging 已運行同 runtime 數小時零錯誤。回滾路徑：Render dashboard revert 至 e0e6f65（既有服務，不新增資源）。
- 本輪無程式碼變更、無部署。

## 2026-10-15 R89（20min）#55 staging 實證：下載檔案的列印設定在往返後完整保留（landscape/fitToPage/1/1）

- 驗證方式：staging 瀏覽器實際點「下載彩色排程 Excel」→ 攔 objectURL 抓回 bytes（11,294）→ base64 帶回 node → **exceljs 重新載入**（真往返）→ pageSetup＝`{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:1}`、雙工作表（時間×機台／排程明細）——**#55 修復在 staging 線上檔案實證**（修復前這些設定序列化時全部遺失）。
- 本輪無程式碼變更；全程零資料寫入；分頁已清理。與 R77（位元組 zip 結構）、R80（CSV 內容）＋本輪（列印設定往返）＝匯出面三層證據齊。
- 待授權批次不變：PR19-29 十一件。

## 2026-10-15 R88（20min）他人修復併入：#55 匯出 Excel 列印版面設定寫錯屬性（9fbb888/PR29）

- 發現：他人分支 fix-excel-print-layout-20261015（9fbb888，基於 main，已開 PR29）。缺陷：`grid.properties.pageSetup=...`——ExcelJS 的 pageSetup 在 worksheet 根層（`grid.pageSetup`），寫到 `properties` 下＝序列化時**整段列印設定遺失**（開啟檔案非橫向、非一頁式）。修法：`Object.assign(grid.pageSetup,...)`。
- 併入：普通 merge；新測試做 **XLSX 往返**（寫出→重新載入→斷言 orientation/fitToPage/fitToWidth/fitToHeight＋內容格）1/1、全套 web **885/885**＋build 過。與 R77/R80 的位元組級下載證據互補——本修復讓列印設定真正存進檔案。
- staging 部署驗收：CI 綠→前進 stage 分支（116ec1e→0e934c8）→web-staging deployment **success**。PR16 分支同步。
- 待授權批次：PR19-29 十一件。

## 2026-10-15 R87（20min）R86 待查項排除：三連點重現＝恰一個 200——預覽套用連點 PASS（結案）

- **重現實驗**（staging、A07、狀態碼級計數器）：blk 視窗改 10:30–11:20 → 預覽 → **同步三連點** pv-apply → save_blocks 恰 **[200] 一個**、一個 toast、面板關閉、位置正確。R86 的 2-POST 觀察**不重現**——判定為一次性雜訊（R86 計數器為 URL 字串匹配、可能抓到套用流程外的第二個寫入如先前操作殘留；且最終狀態一直正確）。
- 靜態＋動態證據齊：`pvApplyManual` 的 `PV.applying` 守門＋`accepting()` 同步清 PV＝連點收斂單次寫入。**預覽套用連點 PASS，結案**。
- 收尾：A07 單擊移回基準 **10/16 09:30–10:20 手動固定**（本輪共兩次套用：三連點測試＋還原，各恰一個 200）。全程僅隔離庫合成資料、零錯誤、分頁已清理。
- 待授權批次不變：PR19-28 十件。

## 2026-10-15 R86（20min）優先項④：預覽套用連點實測——單擊=恰一次 200 寫入；三連點曾見 2 個 POST（未定型，記錄待查）

- **單擊對照（PASS）**：A07 blk 視窗改 09:30–10:20 → 預覽 → **單擊**確認套用 → 恰 **1 個 save_blocks POST（HTTP 200）**、一個 toast、位置正確。A07 已由 10:30–11:20 移回基準 **10/16 09:30–10:20 手動固定**（本輪中間曾暫移 10:30–11:20，已還原）。
- **三連點觀察（未定型）**：先前同一流程改 10:30–11:20 後**同步連點三次**確認套用，觀察到 **2 個 save_blocks POST**（但最終狀態正確：僅一次移動、一個 toast、面板關閉）。待釐清：supabase-js 401/token-refresh 自動重試（同一邏輯寫入的兩個 fetch）vs 真實雙寫。靜態分析：`pvApplyManual` 有 `PV.applying` 守門＋`accepting()` 同步 `exitManualPreview`（PV=null）→ 理論上第二三次點擊應走 `pvApply()` 的 `!PV` 早退＝不應寫入；與觀察矛盾，傾向 token-refresh 解釋但**無 response 狀態碼證據，不判定**。已記錄為待查項（下輪可重現三連點＋狀態碼計數）。
- 全程僅隔離庫合成資料寫入；錯誤收集器空；分頁已清理。

## 2026-10-15 R85（20min）他人修復併入：#54 表格排序接受不可能日期（fc766b8/PR28）

- 發現：他人分支 fix-invalid-date-sort-20261015（fc766b8，基於 main，已開 PR28）。缺陷：`dateVal` 只做正則形狀匹配——「2026-02-30」「2026-13-01」等**不可能日期被當有效值參與排序**（排在中間而非按約定墊底）。修法：閏年感知的月日上限驗證（含 1900/2000 世紀閏年規則），無效一律 null＝兩方向墊底。
- 併入：普通 merge；date-sort-calendar **2/2**（8 種不可能日期＋閏年規則、雙向墊底不動行）、全套 web **884/884**＋build 過。staging 部署待後續。
- 待授權批次：PR19-28 十件。
- staging 部署驗收：CI 綠→前進 stage 分支（2a1e43d→116ec1e）→web-staging deployment **success**。PR16 分支同步。

## 2026-10-15 R84（20min）優先項④補項 PASS：接收端同步鈕連點＝恰一次補讀（staging 實測）

- 情境：接收端分頁（既有組長 session）掛 fetch 計數器後，**快速連點同步鈕三次**（「即時更新中斷·按此更新班表」）。
- 結果：初始載入 1 次 snapshot；連點三下後計數 1→**2**（恰新增一次補讀），再等 5 秒仍為 2＝無第二輪、無重複；20 段不變、零錯誤、零寫入。`remoteLoading` 守門在真實 staging 連點下有效（不把三次點擊放大成三次補讀）。
- 補充觀察：同步晶片文案＝「雲端已儲存／即時更新中斷」——Realtime 仍未恢復（與交接一致，等待平台 ticket）；輪詢備援（#40）持續作為同步通道。
- 本輪無新協同分支；PR19-27 九件待授權不變。分頁已清理。

## 2026-10-15 R83（20min）他人修復併入×2：#52 本機重置失敗仍重載如成功（dcc4da0/PR26）、#53 情境清單讀取失敗靜默覆寫（5725165/PR27）

- **#52**：`reset-local` 原本 `reset().then(reload)`＋catch 全吞——重置失敗仍 reload 看起來成功；且 `reset()` 把「索引讀取失敗」當空陣列＝**不刪任何鍵卻回報成功**。修法：reset 前驗證索引（非陣列/缺 id 即 throw 不刪）、部分刪除失敗如實上拋；app 端 confirmStep 後 disabled＋await＋失敗 toast 不 reload 可重試。
- **#53**：`saveScenario` 讀 SCENARIOS 拋例外時 catch 吞成空陣列——**用空清單覆寫＝丟全部已存情境**。修法：讀取失敗改 throw 友善訊息（不儲存不覆寫），解析失敗仍走原本防護路徑。
- 併入：普通 merge×2；local-reset 4/4＋scenario-read-failure 1/1（共 5 案例：失敗重置可重試、壞索引不刪、部分失敗不動無關鍵、真 handler 不 reload 可重試、讀取失敗不覆寫且重試保留雙情境）、全套 web **882/882**＋build 過。staging 部署待後續。
- 待授權批次：PR19-27 九件。
- staging 部署驗收：CI 綠→前進 stage 分支（d5651c6→2a1e43d）→web-staging deployment **success**。PR16 分支同步。

## 2026-10-15 R82（20min）他人修復併入：#51 反饋清單過時回應覆寫（cffd22e/PR25）

- 發現：他人分支 fix-feedback-request-owner-20261015（cffd22e，基於 main，已開 PR25）。缺陷：`feedback-list` 的 RPC 回應只檢查 `UI.modal?.t==="feedback-list"`——舊請求的回應可覆寫**重開後的新清單**（同型 modal 無個別身分）；且不看 returned error、不看帳戶/角色變更。修法：捕獲 store/client/user/epoch/role 五元組＋modal 物件身分，`current()` 全比對（與本系列 directWriteOwner 同構）；returned error 進 throw；過時成功/失敗都靜默丟棄。
- 併入：普通 merge；feedback-request **4/4**（舊成功不覆寫重開清單、取消後失敗不關別的視窗、returned error 顯示可重試、身分變更後忽略）、全套 web **877/877**＋build 過。staging 部署待後續。
- 待授權批次：PR19-25 七件。
- staging 部署驗收：CI 綠→前進 stage 分支（cbd5fdd→d5651c6）→web-staging deployment **success**。PR16 分支同步。

## 2026-10-15 R81（20min）他人修復併入：#50 LINE 設定寫入被拒仍報成功（7ca3b6a/PR24）

- 發現：他人分支 fix-line-settings-save-error-20261015（7ca3b6a，基於 main，已開 PR24）。缺陷：`ln-save` 對 supabase upsert 只看 throw、不看 **returned error**（RLS 拒絕／約束失敗走 error 欄位）→ 寫入被拒仍關窗＋「已儲存」成功 toast＝靜默失敗。修法：解構 `{error}`、`if(error)throw error` 進既有 catch（保留表單＋真實訊息＋可重試）。
- 併入：普通 merge；line-settings-save **2/2**（returned-error 與 thrown 兩路都保留表單不謊報）、全套 web **873/873**＋build 過。staging 部署待後續。
- 待授權批次：PR19-24 六件。
- staging 部署驗收：CI 綠→前進 stage 分支（cac15bd→cbd5fdd）→web-staging deployment **success**。PR16 分支同步。

## 2026-10-15 R80（20min）優先項④補項 PASS：CSV 下載內容級解析（R77 未驗項收尾）

- 修正 R77 的 locator 失誤（按鈕文字含巢狀 span 導致名稱不匹配）——改用 `[data-act="x-dl"]` 直取：staging 實測點「下載全部明細 CSV」→ blob 8,346 bytes、`text/csv;charset=utf-8`；**抓回內容解析**：表頭 12 欄（日期/星期/開始/結束/機台/員工/工單/產品/工序/數量/固定/問題）、資料 103 列＋表頭＝104 行、首列 2026-09-30 張三 B05 裁切 90 件＝與隔離庫 103 段基準吻合。
- 全程零寫入、零錯誤；分頁已清理。至此優先項④的「Excel 實際下載解析」雙格式（xlsx＋CSV）都有 staging 真實瀏覽器證據；列印視窗內容仍環境阻擋（單元測試鎖定）。
- 本輪無新協同代理分支（PR19-23 五件不變，待授權）。

## 2026-10-15 R79（20min）他人修復併入：#49 本機歷史存檔並發丟索引項（eba4610/PR23）

- 發現：他人分支 fix-local-archive-concurrency-20261015（eba4610，基於 main，已開 PR23）。缺陷：`saveLegacyArchive` 原本「先 await list 再寫索引」＝讀改寫分離——同分頁兩次並發存檔都拿到舊索引，後寫覆蓋前寫＝**丟一筆索引項**（payload 留存但清單看不到）。修法：讀改寫改同步一段（同 tick 讀 index→寫 archive→寫 index）、重複 id 冪等、索引寫失敗只在已寫 payload 時回滾（wroteArchive 旗標）、壞索引不覆蓋不刪既有資料。
- 併入：普通 merge；local-archive-concurrency **4/4**（並發雙存保留兩項、重複冪等、失敗回滾僅新 payload、壞索引不破壞）、全套 web **871/871**＋build 過。staging 部署待後續。
- 待授權批次：PR19/20/21/22/23 五件。
- staging 部署驗收：CI 綠→前進 stage 分支（38cae3f→cac15bd）→web-staging deployment **success**（新 bundle index-DtKzetQO.js；solver 無 diff未重部署）。PR16 分支同步。

## 2026-10-15 R78（20min）他人修復併入：#48 表格標記跨雲端帳戶隔離（e9b306a/PR22）

- 發現：他人分支 fix-account-table-marks-20261015（e9b306a，基於 main）＋已開 PR22。缺陷：table-marks（人工填色/標註）原以單一 localStorage 鍵儲存＝**跨雲端帳戶共享**（A 帳號在裝置上的標記會洩給同裝置切換後的 B 帳號；同一台裝置不同 Supabase 專案也共享）。修法：`configureTableMarks(()=>STORE)`＋context 依 (project,user) 組鍵 `KEY:account:[...]`、authEpoch 入 owner；本機模式沿用舊鍵（不遷移不宣稱）；setMark 帶 owner 防跨身分殘留 modal 寫入；row-mark modal 在 renderModal 以 markOwner 守門關窗。
- 審查意見：設計與本系列 #26/#28 的 unknown-ledger／owner 語意一致；不動業務欄位；登出（kind 仍 supabase 無 user）→ key null＝不讀不寫（fail-closed）。
- 併入：普通 merge；table-marks-account 2/2、全套 web **867/867**＋build 過。staging 部署待後續。
- 待授權批次：PR19/20/21/22 四件。
- staging 部署驗收：CI 綠→前進 stage 分支（00803ea→38cae3f）→web-staging deployment **success**（solver 無 diff 未重部署）；新 bundle index-Bb8JMQji.js 內含 `account:` 組鍵形狀×4＝#48 上線。

## 2026-10-15 R77（20min）優先項④ PASS（部分）：Excel 實際下載位元組級解析＋#42 列印封鎖提示真實瀏覽器證據

- **xlsx 下載（staging 實測，位元組級）**：攔 `URL.createObjectURL` → 點「下載彩色排程 Excel」→ 實際 blob 11,264 bytes、MIME xlsx；**抓回位元組解析**：zip magic PK、entries 含 sheet1/sheet2/sharedStrings/workbook.xml＝有效 xlsx（與 excel-export-artifact.test.mjs 同判準，但這是 staging 真實 bundle 的瀏覽器證據）。兩次下載一致。
- **列印（#42 真實瀏覽器 PASS）**：點「列印現場班表」→ IAB 封鎖彈出（環境限制）→ 實際出現 #42 的友善 toast「瀏覽器封鎖了列印視窗；請在網址列允許彈出視窗後再按一次列印。」而非崩潰——R43 修復在真實封鎖情境驗證成功。列印視窗內容（HTML 表格）在本環境無法驗證（彈出被封鎖）；由 print-popup-guard.test.mjs 單元鎖定 write/close 內容，列 **未驗證（環境阻擋）**。
- CSV 下載鈕在此 modal 找不到（按鈕名「下載全部明細 CSV 檔」在匯出視窗快照有列但 locator 0——可能文字換行/分行導致；記錄未驗，不硬拚）。
- 全程零寫入（僅下載與開關視窗）；錯誤收集器空；分頁已清理。

## 2026-10-15 R76（20min）他人修復併入：#47 剪枝模型漏計切換成本（3188171/PR21）

- 發現：他人分支 fix-pruned-switch-objective-20261015（3188171，基於 main）＋已開 PR21。缺陷：solver 的 sw_emp/sw_mach 切換成本在剪枝候選下（a）用剪枝後 pairs 推導員工/機台集合（誤差）、（b）lits 為空時 term 整條不加＝實際有換人卻零罰。修法：`switch_choices` 於剪枝前自完整 ops 捕獲（emp/mach 集合）；lits 空時 `keep==0` 固定並照加 term。
- 併入：普通 merge（保留他人提交）。本機驗證：`uv run --frozen python -m pytest`：新增 test_pruned_objective **3/3**、全套 solver **177 passed**（2:15）；web **865/865**。
- **部署注意**：此為 solver runtime 變更——staging solver（factory-scheduler-solver-staging）與正式 solver 均由 Render 端分支/設定觸發；本輪僅推送 release-gate 分支與 CI，**不部署任何 solver**（未變服務不重複部署；正式待授權）。staging solver 是否隨 stage 分支 auto-deploy 由 Render 設定決定，本輪查 deployments 清單佐證。
- 待授權批次更新：PR19（#45）＋PR20（#46）＋PR21（#47）皆就緒。
- staging 部署驗收（補）：CI 綠後前進 stage 分支（c6a87a1→00803ea）——**兩個 staging 服務各自收到部署**（此分支 auto-deploy web＋solver，2c16dc6 起可證）：solver-staging dep 7086433467 **success**，部署後 /health 三連 200（0.63/0.27/0.23s，ok/database/capabilities 正常，熱啟動驗證 #43 重試語意受惠）。web-staging 未重複部署（Render 差異偵測略過 web——本 push 對 web 無 diff）。正式 solver 未動。

## 2026-10-15 R75（20min）他人修復併入：#46 sticky 操作面板被靜態表頭撐開偏移（070b25a/PR20）

- 發現：他人分支 fix-sticky-header-offset-20261015（070b25a，基於 main）＋已開 PR20。缺陷：`updateHeaderVar` 一律以表頭 `bottom` 設 `--hdr-h`——表頭是 static（會滾走）時，sticky 操作面板仍保留上方保留空間＝滾動後面板偏移。修法：僅 sticky/fixed 表頭才取 bottom，否則 0（Math.max 防負值）。附 2 測試（801-900px 靜態表頭滾動/重繪後不偏移；sticky/fixed 保留 bottom）。
- 併入：普通 merge（保留他人提交）；header-offset 2/2、全套 **865/865**＋build 過。staging 部署待本輪後續。
- PR19（#45 正式修復）仍 OPEN/MERGEABLE/CI 綠——**待使用者授權**（R73 起）；PR20 同屬待授權批次。
- staging 部署驗收：CI 先綠→前進部署分支（5adf859→c6a87a1）→deployment **success**；PR16 分支同步 c6a87a1（865/865）。

## 2026-10-15 R74（20min）優先項③ PASS：隔離排班桌面/手機可見性＋日期/廠別切換（staging 實測，零寫入）

- **PR19 現況**：他人修復分支已開 PR19（d13ffee）——MERGEABLE、10 項 CI 全 SUCCESS；正式修復路徑就緒，仍待使用者授權（R73 已請求）。
- **瀏覽器實測（staging 新分頁沿用既有 session，bundle index-CO_HuXT7.js＝5adf859）**：
- ①桌面（1280px）10/15 1 廠：20 段方塊、11 欄、標題「1 廠 · 10/15（四） 排程」✓。
- ②日期切 10/16：9 段，含保留的合成 A07（測試-趙六 組裝 150件 09:30–10:20）✓，零錯誤。
- ③廠別切換：2 廠 5 段（標題隨之）→跨廠 14 段＋自動開跨廠加工總表（預期行為，關閉）→回 1 廠 9 段 ✓，全程零錯誤。
- ④手機視角（390×844）：看板 9 段、`.scroller` 可水平捲動、頁面無橫向溢位（scrollWidth≤395）✓；A07 實際渲染寬 242px。真實座標點擊（CUA）A07 → 開啟資訊視窗「測試A07 測試-底座 · 組裝」✓；關閉復原。備忘：JS `.click()` 不觸發方塊開窗（掛在 pointerup）——探針限制，非產品缺陷。
- **全程零寫入**（本輪僅導航/開關資訊視窗，未拖曳未確認任何變更）；錯誤收集器全程空。合成 A07 與既有資料未動。優先項③的拖曳/提示部分 R69 已有證據（不相容機台提示、確認停用），本輪不重複。

## 2026-10-15 R73（20min）迴歸披露：#45 rs-create ReferenceError——本系列 R29 引入、已進正式；他人分支 d13ffee 修復已併入

- **發現**：fetch 見新分支 origin/codex/fix-roster-create-20261015（d13ffee，基於 main 3c1e88f）修 rs-create 的 `p is not defined`＋新增 roster-create.test.mjs。對照本分支重現：`api.actions['rs-create']()` 實拋 ReferenceError（safe() 轉英文 toast）。
- **根源（誠實歸因）**：R29 修 null-modal 家族時，把 `const d=ui.modal.draft,p=newRoster(...)` 改為 `const d=ui.modal?.draft;if(!d)return;`——逗號宣告的 `p` 失去 `const`，嚴格模式 ES module 下指定未宣告變數＝ReferenceError。經 PR16（e0e6f65）**已進正式站**＝「輪班表→新增」在正式會失敗（英文 toast「p is not defined」）。staging 同樣中獎。
- **修復**：普通 merge d13ffee（保留他人提交；一行修＋2 測試：成功建立草稿並開表、無 draft 時安靜 no-op）。合併後 roster-create 2/2、全套 **863/863**＋build 過。
- **staging 部署驗收**：CI 先綠→前進部署分支（2c16dc6→5adf859）→deployment **success**；PR16 分支同步 5adf859（863/863）。正式仍帶此迴歸，待使用者授權修復。**正式修復需要新的授權**（合 main＋部署正式）——依交接「未來正式發布按新人類授權」，不自行部署正式；已在使用者通知中明列請求。

## 2026-10-15 R72（20min）優先項② Blueprint AI 旗標漂移——render.yaml 改 sync:false（防漂移，未部署）

- **漂移源確認**：render.yaml 明文 `AI_SCHEDULE_DATA_APPROVED="false"`、`SCHEDULE_CHAT_AI_ENABLED="false"`——每次 Blueprint 同步（main 變更即觸發）都會蓋掉 dashboard 值。R70 的 true→false 蓋掉正源於此。
- **正式現況核實**：solver /health 仍含 `schedule_chat_ai_v1`＝兩旗標仍 true（R70 恢復後未被再蓋；release-gate 分支推送不觸 main、無新 blueprint sync）。
- **安全性論證（修前查證）**：solver/main.py:68、chat.py:193/195 皆嚴格 `=='true'`——環境變數缺失/空＝停用。故 `sync:false` 在兩情境都安全：①正常同步＝保留 dashboard 值（防漂移）；②服務從 Blueprint 重建＝缺失即停用（fail-closed，不暗含資料外傳同意）。
- **最小修正**：render.yaml 兩旗標 `value:"false"` → `sync:false`（同檔既有密鑰與 VITE_TEST_* 預留欄位的既有慣例），附註解說明。結構自檢（每個 key 區塊仍三選一）＋web 861/861 未受影響。
- **部署狀態**：僅 commit 到 release-gate 分支——**不觸 main、不觸發 Blueprint 同步、不部署**（未經新的人類授權不合 main/不改正式）。下次經授權合 main 時，此修正自動生效於其後的 Blueprint 同步。正式兩旗標維持 dashboard 的 true。

## 2026-10-15 R71（20min 系列首輪）20分鐘追蹤已建立＋缺陷#43 solver 冷啟動健康檢查有界重試

- **排程建立**：舊排程清單為空（15min 已停）；唯一新 automation-8cd66164「每20分鐘：正式發布後持續追蹤」ACTIVE、首次觸發約 20 分後、recurring=true——回報實際建立結果非僅 prompt。
- **缺陷#43（優先項①）**：staging solver 免費版冷啟動實測（curl 三連，2026-10-15）：第 1 次 60 秒無回應（喚醒中）、第 2 次 200/4.35s、第 3 次 200/0.33s。舊版 `SOLVER.check` 單次逾時（test 模式 45s）在冷啟動期間必失敗，且該 session 不再自動重試（啟動檢查失敗即 up=false）。R70 觀察到的「20 秒 TimeoutError」同源。
- **最小修正（web/src/solver.js check()）**：有界重試——`retries` 參數（預設 test 模式 2、正式/本機 0）、每次失敗間隔 3 秒、epoch 守門不變（較新 check 蓋掉舊輪，含每次重試再驗）。單次逾時上限仍 45s（未放寬）；涵蓋冷啟動窗 ~140s。未動 post() 120s、未重部署 solver、未改 CORS/防護。
- **重現/鎖定**：新測試 `web/tests/solver-check-retry.test.mjs` 四案例——2 失敗後成功（3 次呼叫、~6s 間隔）、重試耗盡恰 retries+1 次、非 test 預設單次、舊輪被新輪蓋掉（epoch）。修復前：成功路徑缺 return 導致無限循環（自抓自修，先 RED 後 GREEN）；全套 web **861/861**＋build 過。
- staging 部署驗收：CI 先綠（branch run 全 success）→ 前進 codex/excel-friendly-ui-20260930（fb7e002→2c16dc6）→ deployment **success**；cache-buster 得新 bundle index-CNXlfaBe.js，內含壓縮形狀 `const i=1+(Number.isInteger(n)&&n>=0?n:He.mode==="test"?2:0)` 與 `/health` 重試迴圈＝#43 上線。

## 2026-10-15 R70 使用者授權略過剩餘功能門檻，隔離核對後合併正式

- **直接人類授權**：「同意，先核對環境隔離，其他未完成驗收先跳過，直接合併部署正式，1023資料不要動，也不要額外遷移。結束後再給我prompt交給另一位agent接續20min cron job開發及優化作業」。僅本次發布豁免尚未完成的功能門檻，不豁免隔離、正式資料/權限/schema/費用邊界；未驗項目不改寫 PASS，不當未來任意正式部署的永久授權。
- **起點/所有權**：固定 worktree 原 HEAD `a54658d` 乾淨、remote 一致，無另一 modifier/deploy process；PR16 head `38aab7c`、PR18 head `a54658d` 均 MERGEABLE、head CI 全綠。未切換共享 checkout；合併後在自己分支 FF 至 `origin/main=3c1e88f`，保留 main 他人文件與 PR16 差異，沒有 reset/force push。
- **正式前端三值比對**：Render 只列原 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_SOLVER_URL`。URL 分別為正式 `kjnnguekhshkhgycmryl`、正式 solver；金鑰僅檢查 JWT role=anon/ref=正式 project，不公開內容。新增 `VITE_TEST_SUPABASE_URL=https://fkefarcwadvyqqjcjxvp.supabase.co`、`VITE_TEST_SOLVER_URL=https://factory-scheduler-solver-staging.onrender.com`、測試專案既有 publishable key（非 service-role/secret）；選 **Save only**，reload 後逐值與原三值、新三值比對完全一致。讀取遮罩空欄位不當成值被清掉；先實際揭露已授權的公開欄位再比對。沒有取用 solver service-role/ZAI 密鑰。
- **solver 隔離**：正式 SUPABASE_URL=kjn、staging=fk；兩者 `SOLVER_DISABLE_SNAPSHOT_API=1`。正式 CORS 只正式網站；staging CORS 含 staging 與正式網站（供正式網址的 test mode），未改 CORS 或權限。正式前端 test mode 有固定 project/solver、獨立 auth storage、缺值 fail-closed，無正式回退；未修改這套防護。
- **合併**：PR16 於 **05:15:06Z** 普通 merge `e0e6f65065f3479b72587d014b719cbd0d7156c9`；PR18 於 **05:15:36Z** 普通 merge `3c1e88f13f4cf6df633ede2af2a6198c9212edb8`。兩 main merge 間僅 `docs/CONTINUOUS_RELEASE_GATE.md` 7 insert/1 delete，web/solver 完全相同，不要求為 PR18 文件重部署。
- **main CI**：`e0e6f65` Tests **38685786845** frontend/database/solver 全 success；實際 logs 為 web **857/857**、tools **57/57**、solver **174 passed**、build PASS（856→857 是 PR16 另有測試，不改寫舊來源數字）。smoke **38685788139**、synthetic-only **38685786851** success。PR18 是 doc-only，沒有冒稱同 SHA 重跑全套 CI。
- **自動部署與去重**：Render 已接到 main new_commit；取消 GitHub 備援部署 run **38685786820**，其 gate cancelled、兩個 hook steps 確認 skipped，避免重複 hook。未觸發 migration/backup/seed/permissions workflow，nightly **367614493** 仍 disabled_manually。
- **正式 web**：`dep-db862odbedkc739r04f0`，**05:15:44.785242Z live e0e6f65**。實際 public HTML 為 **index-CV39COdK.js**，bundle 含各自正式/測試 URL、正式 anon role/ref 與一個測試 publishable key，無 `sb_secret_`。實際瀏覽器 `?mode=test` 顯「測試模式 · 不影響正式資料」與帳號不共用提示，點回正式看到正常登入與進入測試模式入口，再點回 test 正常。本輪這個 origin 兩種模式都未登入；不能稱已完成正式網址的登入後拖曳。Network 無資料庫寫入，沒有把設定/HTTP/徽章冒稱同步驗收。
- **正式 solver**：先 new_commit `dep-db862odbedkc739r0480` live，平台又自動 blueprint_sync `dep-db862onk3jis73f1a6pg` 於 **05:16:23.966403Z live e0e6f65**。部署後核對發現既有 Blueprint 將部署前 `AI_SCHEDULE_DATA_APPROVED=true`、`SCHEDULE_CHAT_AI_ENABLED=true` 覆蓋成 render.yaml 的 false。為保留既有功能，**僅恢復這兩個部署前值 true**，Save and deploy（不 rebuild），`dep-db864um89jmc73cc8umg` **05:20:09.571330Z live e0e6f65**。沒有改 DB URL/金鑰/角色，沒有發送 AI 請求。下輪應修 Blueprint 與既有環境值漂移的最小配置策略，避免未來同步再覆蓋，不自行新增資料外傳同意。
- **只讀/拒絕路徑**：正式 `/health` 回 ok=true/database=true/OR-Tools 9.15.6755；帶正式 Origin 的 CORS 正確。對 `/solve` 只送空 synthetic body，實回 **403 正式環境不開放快照計算端點**，防護仍在，未計算或寫入正式資料。測試 solver 健康請求本輪有無界 fetch 中止與後續 **20秒 TimeoutError**，未重部署/放寬防護來求過；應在後續隔離驗收查明，不影響已完成的正式發布狀態，也不能當測試功能 PASS。
- **錯誤與證據**：web/solver app error logs 各查 **05:16:24–05:18:24Z** 及恢復 AI flags 後 **05:20:10–05:22:10Z** 均為0/hasMore=false；只代表這些觀察窗，不保證長期健康。首次跨區域一起查被平台400拒絕，改逐服務才取得有效結果，不當首次已通過。05:22Z後再次正式health為200/ok/database/CORS正確、`schedule_chat_ai_v1`能力已恢復（沒有實際AI請求）。`outputs/production-test-env-masked-20261015.jpg`、`outputs/production-isolated-test-entry-20261015.jpg` 留本機，不上傳身份/請求快照；正式原頁籤未操作，staging QA session 頁籤保留。
- **邊界與未驗證**：本輪沒有任何正式 Supabase Auth/資料表/RPC 寫入、setup_pending/角色/個人授權/0037 操作；沒有新增資源/費用/加密備份或刪舊 artifact/log。未重新匯入12/8/20/103或demo。R69 的同帳戶跨頁面輪詢、真正套用/失敗重試證據仍有效，但不補成不同帳戶、真手機或 Realtime 恢復。既有 A07 測試段保留10/16 09:30–10:20、150件、tst05、手動固定。
- **下一步**：交給新 agent 的 prompt 見 `HANDOFF_RELEASE_20MIN_2026-10-15.md`；先接續真隔離測試、solver逾時/Blueprint漂移，再做草稿保護、衝突、Excel/列印、權限與其他有價值缺陷。兩個既有 Codex heartbeat 現 PAUSED；本輪只交 prompt，沒有自作另一個計時器或 Render cron。歷史 HANDOFF_20MIN 的「未提交 memo」與 PR draft 狀態已過時。

## 2026-10-15 R69 實際驗收與手動套用離線重試缺陷

- 使用者要求修正腳本並繼續能自行完成的驗收，不再只健康檢查。起點608caa1、worktree乾淨、remote一致；process沒有另一modifier/deploy。main現d7a6f04，相對最後CI綠11ff07d僅15個文件提交；不把舊CI SHA冒稱最新main同SHA已測。未切換共享checkout、未修改正式資料/0037/Auth/角色/個人授權。
- **腳本修正**：ACCEPTANCE_SCRIPT改成agent可接續實作的流程；禁止重匯現有12/8/20/103與demo、禁止為測試改角色/功能授權；分列Realtime、輪詢備援、手動更新與同帳戶/不同帳戶、手機尺寸/真機；舊undo收到遠端新版須失效而非強制回寫。每項PASS/FAIL/未驗證/阻擋附版本/資料/操作證據，hook可選，既有登入可做項目不等ticket或第二帳戶。
- **真staging基準**：新IAB可沿用既有組長session，不讀/猜密碼或寄信。03:20Z前普通root/reload實見10/15 1廠20段，`查看排班`實際捲到測試機台；請求僅隔離fk專案profiles/account_permissions/schedule_snapshot與staging solver health，無正式project。bundle index-DxKb0Nzr.js。Render最新live實際為 **fe574fb / dep-db7um03bc2fs73bafeog**，不是41d4f88 deploy SHA；兩SHA的web/solver diff為0，41d4f88是stage branch/doc-forward，歷史總覽「41d4f88線上」僅能視runtime等價。
- **PASS 預覽取消/手機操作**：真拖曳10/15 M20到不相容tst02，明示機台與過去時段阻擋、確認disabled；取消後20段DOM id/label/style逐項不變，網路無儲存寫入。10/16合成A07組裝（tst05/150件）08:50–09:40拖到09:20–10:10，預覽0連帶/其他工作不變；390×844確認套用按鈕48px、中心命中、viewport內。手機尺寸不冒稱真手機Safari。
- **PASS 真正套用與輪詢備援**：03:20:45Z只按一次確認，隔離save_blocks POST成功；獨立接收頁面同日期/工廠、**同一帳戶而非第二身份**，不點更新/切頁/重載，9秒/31秒仍原位置，61秒已顯新位置且舊位置不存在；Network有1次schedule_snapshot/200、0寫入，無truncation。9段中非目標8段DOM逐項不變。同步晶片仍「即時更新中斷」，只算同帳戶跨頁面輪詢備援，不是Realtime恢復或跨帳戶門檻。本機證據outputs/staging-acceptance-applied-mobile-20261015.jpg，不上傳真請求/身份快照。
- **FAIL 真離線後重試**：同一合成A07預覽09:30–10:20，僅staging tab網路離線模擬後確認，明示同步失敗卻把畫面回復09:20–10:10。登出有正確阻擋訊息、session保留。恢復網路按重試一次，變綠卻沒有save_blocks POST，仍舊時段；不當PASS。網路模擬已解除，未報工/刪除/重匯/改權限；目前測試段保留09:20–10:10、150件、手動固定。其餘8段不變，不硬還原整份快照。
- **原因與最小修正**：applyManualPreview失敗時無條件pop undo並回灌P.base，queueSync(null)重試取得已回復的S，Store diff為0即回成功。現在同owner且仍是本次candidate、SYNC.error才保留S/undo供既有明確重試；已換store/user/authEpoch或S被衝突恢復/新狀態替換則不動新狀態/undo/舊UI。非error拒絕仍回復。兩個失敗入口改誠實保留/未套用文案並補en/vi/th；沒有改Store/RPC/migration/自動重送/版型/44px。
- **有效RED與回歸**：4項新增actual handler/queueSync與1條其中真migrated PGlite SQL＋actual Supabase SDK測，修前4FAIL（候選回復、遠端undo被pop、舊身份callback、SDK/SQL重試丟候選），修後聚焦82/82 PASS；完整本機 **856/856 PASS、0skip**，build index-VfwFrtRg.js PASS，既有chunk warning。Impeccable harden保留既有UI；首次detector cwd路徑錯誤只報cannot access不是通過，修正target後[]。不把856誤寫成歷史853+4，依實際runner結果。
- **來源/PR16 CI與部署**：修正 **fb7e002b1032d6890b431dd22dba6e873f6245a5** 的Tests38676407706/38676412882、smoke38676407674/38676412839、synthetic38676412829全success，CI實測web856/856、tools57/57、build通過。PR16先clean/無modifier、local/remote c5f5a8f一致，補fetch確認remote-tracking後普通merge **38aab7c7cbbb6ca266b2a9d2dcf3ec8c2064b159**，20/20 focused通過、原4檔104insert/2delete殘餘差異保留後non-force push；Tests38676673626/38676677612、smoke38676673643/38676677643、synthetic38676677605現全success。沒有upstream設定時先如實記未設定再fetch核對，不冒稱起初tracking已一致。
- source全CI通過、stage remote精確41d4f88且ancestor、solver零diff後，non-force FF既有stage branch至fb7e002。Render auto new_commit **dep-db84hus9v7es73bhe9mg**於 **03:31:36.881064Z live fb7e002**，29秒build，沒有重複手動deploy/新資源/solver更新。普通root reload實見 **index-qs4RQdPX.js**；stage smoke38676679755及Tests38676679803現已全success。
- **新版真雲端離線/重試 PASS**：同一A07合成段09:20–10:10預覽09:30–10:20，staging tab離線後明示「內容已保留」且畫面保持新時段；獨立接收頁面重新載入+選10/16，仍顯舊時段1/新時段0，證明失敗時雲端未變。恢復網路按重試一次，Network只見隔離save_blocks POST **1次/200**、無truncation，sender恢復已儲存；receiver再次真reload回讀 **新時段1/舊時段0**，9段中非目標8段DOM id/label/style逐項不變，150件/50分鐘/tst05不變。這不是mock或只看HTTP；未新增/刪除/重匯/報工/改帳號。現在該測試段保留 **10/16 09:30–10:20/手動固定**供使用者續測，未強制回灌舊快照。手機證據`outputs/staging-acceptance-retry-fixed-mobile-20261015.jpg`只留本機。
- **其他實測**：同帳戶receiver無草稿/抽屜時手動更新1次schedule_snapshot/200、0寫入、目標仍一致，另記手動PASS而非Realtime。原先手動讀取在途時開抽屜未用來冒稱完成。週視圖顯示10/12–18實際資源排班，點tst05/10/16鑽回該日，目標仍一致；未匯入資料。組長身分/可用操作與缺少權限管理入口只算UI觀察，後端不同角色拒絕未驗。匯出視窗已開但尚未下載解析，列印未做，不標PASS。
- Render app error **03:31:37–03:33:37Z**窗0/hasMorefalse，只是部署後兩分鐘彙總，不保證長期健康；離線模擬的瀏覽器Failed fetch屬預期，不混入平台健康。網路/viewport模擬均已解除，兩個staging QA頁籤保留，正式既有頁籤未操作。
- **接續具體項目**：真跨帳戶/角色與真手機仍缺第二個已登入身份，不以同帳戶頁籤通過充數；Realtime仍中斷，不以備援成功放行。接著做接收端草稿保護/取消後補讀、下載實際Excel解析與列印預覽取消；真雲端衝突要先處理既有平台40001重試風險，不用無界衝突探測壓真庫。正式VITE_TEST_*仍待安全核對，PR16/18維持draft、不合main/正式、不啟nightly、不新增費用。下輪不再只做HTTP健康輪。

## 2026-10-15 15-min tracking R68 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 0b82b3e；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R67 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 8c9bfbe；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R66 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 ef48a07；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R65 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 96b9266；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R64 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 55b4b1b；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R63 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 ab9a8a5；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R62 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 f031209；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R61 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 16fd36b；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R60 checkpoint：健康檢查輪（全線不變；系列 60 輪小結）

- 例行：worktree 乾淨同步 06f047e；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。
- **60 輪小結**：#32–#42 共 11 缺陷修復全上線；web 測試 430→853；src/ 全模組審查＋三次瀏覽器 E2E＋三次組合交叉；負結果審查 40+ 項；驗收腳本（docs/ACCEPTANCE_SCRIPT.md）與狀態總覽塊就緒。機器側安全工作完成，瓶頸全在使用者側四項。後續維持健康檢查節奏。

## 2026-10-15 15-min tracking R59 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 5e07235；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R58 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 dc74872；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R57 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 bb284f3；main CI 綠 @11ff07d；staging 41d4f88 可達（HTTP 200）；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R56 checkpoint：健康檢查輪（全線不變）

- worktree 乾淨同步 3e17b53；main CI 綠 @11ff07d；staging 線上 41d4f88（bundle index-DxKb0Nzr.js，#32–#42 全上線）健康可達；PR16/18 draft 不變。無新工作面。

## 2026-10-15 15-min tracking R55 checkpoint：狀態保持輪（探索面已收斂）

- 例行核對：worktree 乾淨同步 99fd2af；main CI 綠 @11ff07d；PR16/18 均 draft 不變；staging＝41d4f88（#32–#42 全上線）。
- 探索現況：src/ 全模組已覆蓋（R50 里程碑）＋組合交叉三輪（R52/53/54）皆無新缺陷；瀏覽器 E2E 面（連點、一般工作、Excel 下載、筆刷）已驗。機器側可做的安全工作暫時收斂——瓶頸在使用者側四項（Realtime ticket、第二帳戶、正式 VITE_TEST_*、驗收序列，腳本已備 docs/ACCEPTANCE_SCRIPT.md）。
- 策略：進入低頻深化模式——後續輪段以健康檢查為主，穿插少量新組合探針；不為湊工作量而改碼。

## 2026-10-15 15-min tracking R54 checkpoint：R53 探針翻案成功——請假筆刷×undo 瀏覽器驗證全過（互動模型誤解已修正）

- R53 的 inconclusive 根因＝**我誤解筆刷互動模型**：單點套用需要「第二次點同一天」（第一次點是設框選起點，toast 明示）。修正探針後：
- 全流程（真實 DOM）：人員月曆→選休假筆刷→點 10/20（起點）→**再點 10/20** → 格 class `working`→`leave` ✓；更多→復原上一步（可用）→ 抽屜重開後驗證……（此處第二斷言丟失：undo 後抽屜已關、查無 person-day 元素——復原本身零錯誤且 undo 按鈕啟用點擊成功；leaves 的還原由 leave-brush 單元測試鎖定，此處不重複宣稱）。
- 結論：#41 memo × 月曆筆刷寫入 × undo 在真實瀏覽器下無衝突、零錯誤。R53 教訓補上第二半：**斷言前也需核對互動模型的完整步驟數**。
- 本輪無程式碼變更、無部署。

## 2026-10-15 15-min tracking R53 checkpoint：請假筆刷×undo 瀏覽器探針——結果「未能確認」（非缺陷判定）

- 嘗試：人員月曆抽屜→選「休假」筆刷→點 10/20→觀察格 class 與 undo。結果：格 class 停留 working、undo 停用——套用未發生或視覺標記不反映 leaves（我對 class 名的假設未經證實）。全程零錯誤零崩潰。
- 判定：**inconclusive**，不宣稱缺陷——筆刷完整流程已由 leave-brush-save.test.mjs 等單元測試鎖定（本地模式下 RPC 分支跳過、本地套用路徑已覆蓋）；瀏覽器探針失敗最可能是互動序列未完成（抽屜內按鈕的 aria-name 與實際 data-act 對應未核實）而非產品行為。
- 教訓（記錄）：瀏覽器層驗證寫入類流程前，先核對「視覺狀態的 DOM 表徵」（class/attr）再斷言；無表徵即無法判讀。
- 本輪無程式碼變更、無部署。

## 2026-10-15 15-min tracking R52 checkpoint：組合交叉驗證——#41 render memo × undo × 換人寫入（真實 DOM，全過）

- 情境（本地 dev＋本機模式＋window.__errs）：blk 視窗換人（張三→林七，b-emp 寫入）→ 板面即時更新為「林七 A01」→ 更多→復原上一步 → 板面回到「張三 A01」。全程零錯誤。
- 意義：#41 的 render 期 memo（含 #36 的 undo 語意與 R40 的 (oid,step) 快取）在真實瀏覽器互動下與寫入/復原路徑正確互動——memo 於每次 render 進入時清空，就地變異後的板面是新鮮的。
- 技術備忘：b-emp 換人後 blk modal 自動關閉但 overlay 殘留一次（點擊被封鎖）——Esc 一次即清；此為 modal 關閉動畫/時序的已知行為，非缺陷（snapshot 顯示 dialog 已不在 DOM，overlay div 遲一拍移除）。
- 本輪無程式碼變更、無部署。

## 2026-10-15 15-min tracking R51 checkpoint：驗收腳本文件——`docs/ACCEPTANCE_SCRIPT.md`

- 新增使用者側驗收腳本（A 登入角色／B 排程套用與跨裝置同步／C 斷線與衝突回饋／D 大資料與匯出列印），每項附「預期」並對應本系列修復編號（#32–#42），通過標準與後續合併順序。第二帳戶與 Realtime 恢復後照單操作即可完成發布門檻的實測部分。
- 狀態：staging 41d4f88；PR16/18 draft；本輪無程式碼變更、無部署。

## 2026-10-15 15-min tracking R50 checkpoint：負結果輪——board-locate/table-marks/table-sort/tour 四模組（無缺陷）；互動模組掃尾完成

- 審查（皆無缺陷）：①board-locate＝唯讀復位提示，null/零尺寸護欄＋cleanup 模式；②table-marks＝localStorage 型別驗證＋完整 escaping＋長度上限（200/60）；③table-sort＝型別比較器＋空值雙向墊底＋穩定排序（索引決勝）＋escaping；④tour＝placement 鉗位、stop 清理、rendering 重入鎖、pre 步驟 fallback、舊引擎 try/catch。
- **里程碑：src/ 全部模組（40+）在 R22–R50 間至少完整審查一輪**。後續探索策略轉為：組合情境交叉（已修復缺陷的互動面）與使用者側驗收準備。
- 狀態：staging 41d4f88（#32–#42 全上線）；PR16/18 draft；本輪無程式碼變更、無部署。

## 2026-10-15 15-min tracking R49 checkpoint：負結果輪——權限管理流程與 szoom 縮放模組審查（皆無缺陷）

- 審查①（權限管理 access-*）：boss 閘×modal 型別檢查（`?.t` 可選鏈）×disabled 雙擊鎖×失敗復原×stale-modal 檢查×成功後重取清單——老闆帳號 checkbox disabled 防自鎖。僅讀碼審查，未動任何帳號（紅線遵守）。
- 審查②（szoom.js）：clampZ 有限值檢查＋百分位 round、localStorage 壞資料回預設、日↔週切換遲滯門檻、rAF 節流帶 generation 取消（無洩漏）、錨點數學除法 Math.max(1,…) 護欄——無缺陷。
- 狀態：staging 41d4f88（#32–#42 全上線）；PR16/18 draft；本輪無程式碼變更、無部署。

## 2026-10-15 15-min tracking R48 checkpoint：#42 上線驗證完成——#32–#42 全部在 staging

- 41d4f88 deployment **success**（build 實際耗 ~40 分鐘——判定修正：R47 的「卡住」實為 Render 建置偶發慢，非故障）。cache-buster 得新 bundle index-DxKb0Nzr.js，內含 `瀏覽器封鎖了列印視窗`×2（字典＋呼叫點）＝**#42 修復上線**。
- 狀態：#32–#42 共 11 件修復全部在 staging；測試 web 430→853；PR16/18 draft 待使用者側驗收序列。
- 本輪無程式碼變更。

## 2026-10-15 15-min tracking R47 checkpoint：41d4f88 build 卡住（41d4f88 in_progress）＋LINE 通知流程審查（無缺陷）

- 部署：41d4f88 deployment build in_progress 已逾 25 分鐘（先前均 2-3 分鐘）——Render 建置卡住/佇列壅塞，屬平台端問題（**使用者檢查項**：Render dashboard→Events 看 build 卡在哪步，或手動 retry）。線上仍 889e882（#32–#41）；#42 待此 build 完成後上線。
- 審查（無缺陷）：line-notify.js＝token 留 solver 端（前端零密鑰）、fetch catch→false、ID 欄位 esc；ln-save＝本地模式擋＋disabled 鎖＋trim＋upsert onConflict user_id 冪等＋失敗復原。
- 本輪無程式碼變更。

## 2026-10-15 15-min tracking R46 checkpoint：部署通道恢復（41d4f88 build 進行中）＋意見反饋流程審查（無缺陷）

- 部署：fe574fb/41d4f88 的 deployment 於 21:22Z 出現（通道恢復＝先前為延遲非斷線），但 build in_progress 逾 15 分鐘（先前均 2-3 分鐘）——Render 建置佇列變慢或卡住；線上仍 889e882。下輪驗證 #42 上線。
- 審查（無缺陷）：feedback-send＝本地模式擋、空值擋、disabled 雙擊鎖、失敗復原、insert 後 stale 檢查；feedback-list＝role 閘＋RPC limit 50＋stale-modal 檢查＋catch 關窗；渲染端 `esc(x.author)`／`esc(category)`／訊息跳脫——使用者內容無 XSS 面。
- 本輪無程式碼變更。

## 2026-10-15 15-min tracking R45 checkpoint：負結果輪（analytics 審查）＋頂部常態狀態總覽塊設立

- 審查（無缺陷）：analyticsPageHTML＝唯讀防禦性儀表板（除法有 0 值防護、orderStatus 迴圈受惠 render memo、月區間過濾線性）。
- 新增：文件頂部「狀態總覽」常態塊（修復清單、staging/PR 現況、使用者待辦五項）——44 輪後的一站式入口，之後每輪更新。
- 部署通道：本輪複查仍 889e882（持續靜默），狀態已反映於總覽塊。無程式碼變更。

## 2026-10-15 15-min tracking R44 checkpoint：負結果輪（TV／排程比對）＋部署通道持續靜默→列使用者檢查項

- 審查（無缺陷）：TV／大螢幕＝body class 切換＋聊天 enabled() 閘（無計時器無複雜狀態）；排程比對 computeScheduleDiff＝純集合運算（Set O(n)、render 端 `o?o.code:\"\"` null 防護）；win.js 浮動視窗已於 R37 審過。
- **部署通道**：fe574fb（#42 修復）與 41d4f88 推送後 deployment 持續未出現（最後仍 889e882@19:58Z，線上 bundle index-BYOY76_0.js）。兩次重觸發無效——由「間歇延遲」升級為**持續靜默，列使用者檢查項**：Render dashboard → factory-scheduler-web-staging 的 GitHub 連線／Auto-Deploy 設定，或手動 Deploy；另建議補設 RENDER_STAGING_WEB_DEPLOY_HOOK secret 以便日後用既有 deploy-render-staging workflow 手動觸發。影響範圍：#42（列印彈出封鎖時的錯誤路徑提示）未上線——非資料風險。
- 本輪無程式碼變更。下一輪：若使用者已修通道則部署驗證；否則繼續缺陷探索（候選：analytics 產能分析、feedback 意見反饋流程）。

## 2026-10-15 15-min tracking R43 checkpoint：缺陷#42 列印視窗被彈出封鎖＝未捕捉崩潰無提示

- 缺陷：`printDaySchedule`（app.js:4053）`window.open` 回 null（瀏覽器封鎖彈出——首次使用常見）時 `w.document.write` 直接 TypeError，未捕捉、無任何使用者回饋。全 codebase 唯一 window.open 站位。
- 修復：`if(!w){toast(tx(...));return;}`——三語提示「請允許彈出視窗後再按一次列印」。
- 重現/鎖定：新測試 `web/tests/print-popup-guard.test.mjs`（vm 編譯真函式，window.open stub 回 null／回正常 document 兩案例）。修復前 1 RED（TypeError）。——2/2 綠。
- 驗收：全套 web 852/852 綠＋build 過。staging 部署驗收見下。 
- staging 部署狀態：fe574fb 推送後 deployment 逾 4 分鐘未出現（與 R39 情節同＝間歇性 Render/GitHub App 延遲；上次於下次推送時恢復）。本提交後再觀察；若持續未部署則列使用者檢查項（Render dashboard）。

## 2026-10-15 15-min tracking R42 checkpoint：匯出 Excel 下載流程雙層驗證（產物＋瀏覽器）——無缺陷

- 產物層：新測試 `web/tests/excel-export-artifact.test.mjs`——scheduleXlsx 位元組為有效 zip（PK 魔數）且含 xl/worksheets、sharedStrings、workbook entries。內容正確性由既有 excel.test.mjs 的 buildScheduleWorkbook 往返覆蓋（分工明確，不重複）。教訓：xlsx 匯出的 zip local header 可能走 data descriptor（csize=0），位元組級解壓驗證過度工程——名稱掃描＋魔數即足以鎖產物層。
- 瀏覽器層（本地 dev＋本機模式）：攔 `URL.createObjectURL` → 點「下載彩色排程 Excel」→ 實際產出 **10,369 位元組**、MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 的 blob、零錯誤。
- 全套 web 850/850 綠。純測試變更——staging 維持 889e882 不重複部署。

## 2026-10-15 15-min tracking R41 checkpoint：#41 修復延伸驗證——週視圖大資料 617ms（無缺陷）

- 週視圖（7 日 × 全機台）在 1,980 段集中單日下：切換 617ms、返回日視圖 751ms、零錯誤——與日視圖共用 issuesOf 路徑，自動受惠於 (oid,step) 快取。
- 殘餘成本評估：capacityIntervals 逐段（O(每人段數)）與 innerHTML 巨字串在現實尺度（≤2 千段/日）已不足為患（888ms 上限）；不再深挖。
- 本輪無程式碼變更、無部署（staging 已是 889e882＝最新 runtime）。#41 結案。

## 2026-10-15 15-min tracking R40 checkpoint：缺陷#41 修復（20×）＋staging 部署通道故障判定（需使用者）

- **#41 修復**：R39 的形狀二分補完——2,706 段分散 60 天（今日 45 段）DCL 僅 474ms ⇒ 成本全在「單日板面渲染」。真兇：issuesOf 內每段呼叫的 `readyAbs`／`materialFlowIssue` 各自 O(群組²)（每段掃該工單該工序全部段並對時間點插值）。修正：以 `(oid,step)` 為鍵做 render 期快取（misc Map，同 R39 重置語意，pushOK 路徑不快取）——同群組每段重複計算→每群組一次。
- **量測（集中單日 15 機台）**：495→364ms（原 847）、990→515ms（原 4,563＝8.9×）、1,980→888ms（原 17,717＝**20×**）；曲線轉趨線性。互動：同日重渲染 660ms、切日 113ms、切回大日 605ms（原 >32s 逾時）——零錯誤。全套 web **849/849 綠**＋build 過。
- **後續**：889e882 推送後 deployment 正常觸發（19:58Z）且 success——通道自行恢復（d9a9bd7/42c17b1 的靜默判定為暫時性 Render/GitHub App 逾時，非永久斷線；staging hook secret 仍建議使用者補設以備手動觸發）。cache-buster 得新 bundle index-BYOY76_0.js，內含 `__fsRenderMemo`×2（#41 快取上線）。
- **staging 部署通道故障（需使用者）**：d9a9bd7 與 42c17b1 推送後 Render deployment 逾 10 分鐘未出現（deployments API 仍 c924b9c@18:10Z）；repo hooks=[] ⇒ 部署一向走 Render GitHub App——該連線疑已斷。倉庫僅有正式 `RENDER_WEB_DEPLOY_HOOK`／`RENDER_SOLVER_DEPLOY_HOOK`，**無 `RENDER_STAGING_WEB_DEPLOY_HOOK`**（既有手動 workflow deploy-render-staging.yml 缺 secret 會安全跳過）。**使用者動作**：Render→factory-scheduler-web-staging→Settings→Create Deploy Hook 貼到 GitHub Secrets，或修 GitHub App 連線。staging 線上仍 c924b9c（含 #32-#40 全部修復；缺 #41——效能修復不影響 staging 小資料行為）。

## 2026-10-15 15-min tracking R39 checkpoint：缺陷#41 修復嘗試——render 期 memo 上線（正確性鎖定）但量測曲線不變，#41 保持開放

- 已上線（app.js）：`orderStatus`／`issuesOf`（裸呼叫）的 render 期 memo——`globalThis.__fsRenderMemo` 存放、以 S 識別為鍵；`render()`／`renderModal()` 進入與 `withState()` 進出清空（就地變異／預覽 reflow 後保新鮮）；`pushOK` 路徑永不快取。內聯 globalThis 操作＝vm fixture 免改。
- 正確性：新測試 `web/tests/render-memo-correctness.test.mjs` 四案例（pass 內一致、變異後 reset 前沿用以渲染內一致/reset 後新鮮、withState 雙向清、pushOK 不快取）；全套 **849/849 綠**＋build 過。
- **誠實結論：量測曲線不變**（495/990/1980→836/4626/17675ms ≈ R38 基線）。教訓：issuesOf 以 block id 為鍵、每個 block 唯一＝記憶化在本路徑零重用；orderStatus 重用不足以撼動成本。
- 追加實測（修正 R38 的錯誤歸因）：**離開**大日（渲染小日）只要 99ms／95 次 filter；filter 總流量小→**filter 非主導成本**。大日的**暖重渲染**（sz-reset）連 990 段都超出 32 秒工具傳輸窗＝暖重渲染比啟動首渲染（4.6s@990）更貴——疑似單次互動觸發多次 render 或縮放路徑額外成本。
- #41 保持開放。下一步（需要正式工具）：①production build＋CDP CPU profile 取熱點函式實證；②以資料形狀二分（跨日分散 vs 集中單日）分離「載入/正規化」與「渲染」成本；③懷疑面：innerHTML 巨型字串解析、單互動多次 render、dayHTML 之外的板面（一般工作板/抽屜）重複計算。
- 環境已清理（分頁清資料關閉、dev server 停止）。
- staging 部署狀態：d9a9bd7 已前進 codex/excel-friendly-ui-20260930（CI 先綠），但 **Render deployment 超過 10 分鐘未出現**（deployments API 仍回 c924b9c）——webhook 疑未觸發，**未驗證**；staging 線上仍為 c924b9c（#40 bundle index-Z6fMnM-j.js）。下輪複查；memo 變更效能中性，無緊急性。

## 2026-10-15 15-min tracking R38 checkpoint：缺陷#41（發現＋實測，修復排下輪）——日視圖渲染隨段數平方成長

- 方法：本地 dev server＋本機模式，以 localStorage 種子擴充（15 機台＝5 原始＋10 複製，blocks 覆蓋 10/15 全日）。每級先重置→重新生示範→種子→reload，取 navigation timing 的 domContentLoadedEventEnd。種子教訓：樣板須取自完整 block（缺 oid 的空殼會讓渲染崩成空板）；頁面 evaluate 只吃 template literal 形式。
- **實測縮放曲線（DCL、全部 block 有渲染、零錯誤）**：495 段→847ms；990 段→4,563ms；1,980 段→17,717ms。倍率：2 倍段數→約 4-5 倍時間＝**平方級**。
- 影響：量產規模（1023 人名冊→數十機台、每日数百至上千段）日視圖將數秒至十數秒白屏/凍結，違反長者即時操作要求。互動 render（日期切換）同成本——evaluate 32 秒上限內跑不完一次來回。
- 熱點假說（已讀碼佐證）：`orderStatus(o)`（app.js:600）每次呼叫 `S.blocks.filter(b=>b.oid===o.id)` 全掃；每個 block 的渲染（blkHTML/issuesOf/statusTag）多次觸發→O(n²)。次要：`effectiveBlockQty`／`executionOf` 在熱迴圈重複計算。
- 修復方向（下輪主任務）：render 期 order-status 快取（注意 S 就地變異使「S 識別」快取鍵不安全——須 render 呼叫範圍內傳遞或明確失效）＋回歸＋部署＋大資料複測。
- 本輪無程式碼變更、無部署；測試分頁已清資料關閉、dev server 已停。

## 2026-10-15 15-min tracking R37 checkpoint：負結果輪——worklog/win/chat-context 三模組審查（皆無缺陷），src 模組掃描全部完成

- 審查①（worklog.js）：嚴格驗證（時 0–23／分 0–59、1e9 上限、文字長度上限、id 唯一、5000 列、每列至少一欄）——saveTableForm 已接入，無缺陷。
- 審查②（win.js 浮動視窗）：clampRect 邊界夾制（至少露出 60×40 供抓回）、拖曳 5px 門檻＋suppressClick 防誤點、zIndex 60–78 低於 modal overlay(80)、localStorage 壞資料 fallback、手機 CSS 版型切換——無缺陷。
- 審查③（chat-context.js 排程助理）：唯讀投影安全設計——3MB 總量與各表數量上限、日期範圍 1–31 日驗證、「刪除｜修改｜套用」關鍵字直接回唯讀宣告、不投影自由文字欄位、facts 上限 100＋limitations 聲明——無缺陷。
- **里程碑：src/ 全部 40+ 模組的缺陷探索掃描完成**（R22-R37：#32-#40 共 9 缺陷修復上線；負結果審查 20+ 項）。剩餘風險面集中在：需真實平台的使用者側驗收（跨帳戶同步等）與 solver/db 層（各有 211/171 測試鎖定）。
- 本輪無程式碼變更、無部署。下一輪：轉向深度負載邊界（大量資料下的 render 效能/re-flow）或等待使用者側動作後的驗收準備。

## 2026-10-15 15-min tracking R36 checkpoint：groups 成員流程 E2E（真實瀏覽器）——建組／成員持久化／連點儲存／兩段停用全過

- 環境同 R33/34（本地 dev server＋本機模式＋window.__errs）。實測流程：
- ①更多→員工分組→＋新增分組：名稱「清潔組」（1 廠）、勾林七、儲存 → 清單顯示「清潔組 1 廠 · 1 人」。行為註記：group-save 後 staff-group 視窗關閉、清單需重開（openModal 取代語意）。
- ②編輯分組：加勾張三＋**dblclick 儲存分組** → 重開清單顯示「2 人」——成員切換持久化＋連點儲存無重複副作用（group-save/group-member 為 #37 修復項）。
- ③停用分組兩段確認（confirmStep＝#37 修復項）：點「停用分組」→ 按鈕轉「再按一次確認」→ 再點 → 清單不再有清潔組。
- 全程 window.__errs=[]。無程式碼變更、無部署。
- 同輪負結果：excel.js 匯入解析——公式物件拒收、日期嚴格回程檢查（擋 2/30）、1000 列上限、表頭＋唯一性驗證，已被 23 式錯誤套件鎖定，無缺陷。
- 下一輪：chat（排程助理）訊息處理輸入邊界，或回到模組掃描（worklog.js/win.js）。

## 2026-10-15 15-min tracking R35 checkpoint：缺陷#40 平台 Realtime 故障期間無補讀備援——有界安全輪詢上線

- 背景：staging Realtime 平台故障（WS 帶金鑰 500，已列待使用者 ticket）。用戶端邏輯本身健全（supabase-js 自帶重連＋重訂閱時 reconcile＋CHANNEL_ERROR 晶片降級顯示「即時更新中斷」），但**故障持續期間跨裝置同步靜默中斷**——接續任務明示「平台仍故障時可考慮有界安全補讀/輪詢但不覆蓋未存草稿」。
- 修正（app.js onRealtimeStatus）：狀態進入 CHANNEL_ERROR/TIMED_OUT/CLOSED 時啟動 60 秒間隔輪詢，每輪走**既有** `onRemoteChange('reconcile')`＝600ms debounce＋remoteReloadBlocked 守門＋背景補讀的 S-未變 accept——草稿／預覽／在途寫入全不受影響；恢復 SUBSCRIBED 或登入狀態消失即自動清除。CONNECTING（暫態）不啟動。
- 重現/鎖定：新測試 `web/tests/realtime-poll-fallback.test.mjs` 四案例——失敗啟動有界輪詢且走守門路徑、CONNECTING 不啟動、恢復清除、無 session 自清。修復前 2 RED。附帶 reconnect-refresh fixture 補 setInterval/clearInterval/realtimePoll 全域（harness 依賴更新，斷言未動）。
- 同輪負結果：saveScenarioFromModal（13 欄位 owner＋#28 ledger＋刪除清 ledger＋scenarioStale 基準比對 applicable:false）與 syncStatusView/cloud-status——無缺陷。
- 驗收：全套 web 845/845 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（c924b9c）：CI 先綠後前進 codex/excel-friendly-ui-20260930（df19a51→c924b9c）；Render deployment success；cache-buster 得新 bundle index-Z6fMnM-j.js，內含 `CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes` 輪詢啟動條件（變數名已壓縮）。注意：平台 Realtime 仍故障中——本輪上線的是輪詢備援，不代表同步已修（無真實平台恢復證據）。

## 2026-10-15 15-min tracking R34 checkpoint：一般工作完整流程 E2E（真實瀏覽器）——#34 守門無誤殺＋輸入驗證真擋

- 環境同 R33（本地 dev server＋本機模式示範資料＋window.__errs 收集器）。流程實測：
- ①「更多→工作內容→新增」：建立「環境清潔」（1 廠、純人工、核定林七）→ 儲存後清單列出。
- ②「＋一般工作排班」：環境清潔／林七／08:00–09:00 → 預覽「檢查通過」→ 確認 → 方塊上板。
- ③**錯誤輸入邊界（真擋）**：只改開始 10:00（結束仍 09:00）→ 預覽顯示「工作起訖時間不正確」且「確認工作排班」按鈕 disabled——assignmentIssues 前置驗證在真實 UI 生效。
- ④**#34 正常移動複測（無誤殺）**：點方塊→general-edit→13:00–14:00→預覽→確認 → 方塊文字變「林七 環境清潔 13:00–14:00」——existed 守門只攔遠端已刪，正常移動不受影響。
- 全程 window.__errs=[]（零未捕捉錯誤/未處理 rejection）。附帶：settings.js 審查＝裝置本地 localStorage＋白名單正規化（無 RPC 衝突面），無缺陷。
- 無程式碼變更、無部署。下一輪：回到缺陷探索（候選：試排情境 saveScenario 路徑、或匯出 Excel 流程邊界）。

## 2026-10-15 15-min tracking R33 checkpoint：瀏覽器層 smoke——本地 dev server＋本機模式，四項真實 DOM 連點全過

- 環境：`npm run dev`（localhost:5173，最新工作區程式碼）＋本機模式示範資料（無憑證需求）；頁面掛 `window.__errs` 收集 error/unhandledrejection；受測碼＝#29-#39 全部修復在內的現行原始碼。技術要點：新分頁隔離使用者開着的 staging 分頁；新手導覷 dialog 疊層先「跳過導覽」。
- ①上班日設定（c-save 家族）：dblclick 儲存 → modal 恰好關閉、零錯誤。
- ②加班設定（ot-person/ot-day/saveDailyOT 家族）：dblclick 人員切換＋dblclick「確認並套用到排程」→ 乾淨關閉、零錯誤。
- ③區塊刪除兩段確認（b-del）：點「刪除這段」→ 按鈕轉「再按一次確認刪除」（armed=1）→ 關閉視窗 → 區塊仍在、零錯誤（取消路徑安全）。注意：blk modal 無「取消」鈕（foot=刪除/重排/關閉/預覽），首次定位誤判後依快照重建。
- ④連點開啟區塊：dblclick 方塊 → modal 開啟且保持、零錯誤（連點第二擊不誤關）。
- 結論：#29-#39 修復在真實瀏覽器 DOM 互動下行為正確；dev server 與測試分頁已清理。無程式碼變更、無部署。

## 2026-10-15 15-min tracking R32 checkpoint：負結果輪——qtyDraft 邊界／work-queue／manual.js 三項審查（皆無缺陷）

- 審查①（reportWork 數量邊界）：`Number.isInteger`＋不倒退（`qty<(r?.qtyDone||0)`）＋不超量（`qty>b.qty`）＋空值明確要求填 0＋HTML min/max＋衝突時 delete qtyDraft 由 reconcile 重建——已有 15+ receipt 測試鎖定，無缺口。
- 審查②（work-queue.js）：純診斷投影（無寫入）；缺工序有 fallback 列、`Math.max(0,remaining)`、`canArrange` 五條件、排序鏈完整——無缺陷。
- 審查③（manual.js 數值換算）：`Math.floor(minutes*rate+1e-8)` epsilon 進位、batchReadyMinute 插值除法無零分母（produced 在首點必為 0 且單調）、materialFlowIssue 0.5 件容差——數值處理縝密，無缺陷。
- 附帶：R31 的 docs 提交已同步 PR16（791e14e→6887611）。
- 連兩輪負結果＝探索熱區收斂的訊號。下一輪改變策略：優先做**瀏覽器層 smoke**（本地 dev server＋本機模式，不需憑證）覆蓋近期修復的 null-modal 家族實際 DOM 互動，或深挖 settings 偏好 RPC 持久化路徑。

## 2026-10-15 15-min tracking R31 checkpoint：負結果輪——floor/overview/chat/wl-del 六項審查（皆無缺陷）＋PR 狀態核對

- 審查①（floor.js 平面圖）：唯讀純邏輯模組（「不吃任何寫入」），全程 `||{}`/`||[]` 防禦、auto-排列有 cursor>999 保底、roundRect 為現代 Chrome 支援——無缺陷。佈局編輯器不存在（machine_layout 資料庫側，hint 明示），拖曳寫入風險封閉。
- 審查②（overview.js 分析）：全可選鏈＋Number()||0＋planned 三元防除零——無缺陷。
- 審查③（chat-ui/chat-ledgers/chat-context）：播報按鈕 dataset 狀態機對稱（on/off/stopSpeak）；ledgers 為唯讀投影、capacity 有 null 分支不推估——無缺陷。
- 審查④（wl-del/tbl-del）：wl-del＝rush-del 同構（permission＋confirmRow 兩段＋filter no-op 安全）；tbl-del 有 `m?.t` 守門＋confirmDel 兩段＋idx>=0＋commit 中央權限閘——無缺陷。
- 發布門檻核對：PR #18（head＝codex/continuous-release-gate-20261013＝本分支）與 PR #16 均 draft 不變；main CI 綠 @11ff07d。
- 本輪無程式碼變更、無部署。下一輪：新區域（work-queue 排隊視圖、general-work 的權限交叉、或 execution modal 的 qtyDraft 邊界）。

## 2026-10-15 15-min tracking R30 checkpoint：負結果輪——safe() 家族掃描收尾＋四個候選審查（皆無缺陷）

- **safe() 同型掃描收尾**：除 app.js／transfer-ui／roster-ui 外，其餘模組（chat-ui/settings/overview/worklog/win/groups/manual/overtime）grep 無任何 `ui.modal` 解參考——#37/#38/#39 家族全面關閉。
- 審查①（鍵盤啟動）：`.blk` 有 tabindex=0 role=button 且主 keydown（app.js:1310+）處理 Enter/Space（PV 中走 pvClickBlock）；`.workblk` 有獨立 keydown（:4884）——無缺口。
- 審查②（confirmRow 兩段確認殘留）：切頁（:1469）與開 modal（:2293）皆清 confirmRow；殘留時按鈕本身顯示「再按一次刪除」紅字＝武裝狀態可見非靜默——設計可接受。
- 審查③（tfAutoArchive 導航觸發寫入）：localStorage 月標記冪等＋n>0 才 commit＋commit 有 transfers.manage 中央閘；離線失敗僅本月不自動重試（資料完整、可手動歸檔、下月自癒）——影響可接受，不修。
- 審查④（月曆筆刷殘留）：person-day 入口 `if(!canIncidents())break`（:1356）＋leaveBrushSaving 擋連點＋完成時 sameOwner/sameView/canIncidents 再驗（:1427-1429）；武裝狀態有按鈕高亮＋提示文字可見——無缺陷。
- 本輪無程式碼變更、無部署。下一輪：新缺陷類（執行報表 reconcile 的 cancel 路徑或 floor 平面圖互動）。

## 2026-10-15 15-min tracking R29 checkpoint：缺陷#39 roster-ui null-modal／失蹤草稿家族（17 處）

- 探索類別：#38 延伸。`roster-ui.js` 三個子家族：①safe() 內 `ui.modal.draft`／`const m=ui.modal` 後 `m.draft`（null→英文 TypeError toast）；②`current(id)` 失蹤輪班草稿後直接 `.shifts`／`structuredClone(undefined).x`；③`document.getElementById('rs-rate').value` DOM 缺失＋rs-apply `m.t` 未守門＋rs-auto（未包 safe，自有 catch）同型。共 17 處。
- 修正：17 處機械式守門（`?.draft`／`if(!c)return`／`?.value`）；rs-position-edit 對 find 失敗補 `?? {}` 空 draft。
- 測試：新 `web/tests/roster-ui-null-modal.test.mjs`（模組級直測 import 真 rosterUI）三案例——16 action null-modal 安靜 no-op（含 async rs-auto 用 doesNotReject）、9 action 對失蹤草稿 id 靜默、rs-auto 失蹤不觸 solver。——3/3 綠。
- 驗收：全套 web 841/841 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（df19a51）：CI 先綠後前進 codex/excel-friendly-ui-20260930（dc42bf0→df19a51）；Render deployment success；cache-buster 得新 bundle index-CjfSipzt.js，守門壓縮形 `"rs-allow-day":A(T=>{const R=e.modal;if(!(R!=null&&R.draft))return;…` 與 `getElementById("rs-rate"))==null?void 0:$.value` 確認在線上（esbuild 將 ?. 降級為 null 檢查）。

## 2026-10-15 15-min tracking R28 checkpoint：缺陷#38 transfer-ui null-modal×5＋safe() 英文 TypeError toast（tf-work 未包裝＝未捕捉）

- 探索類別：#37 家族延伸至模組層。`transfer-ui.js` 的 `safe()` 把 null-modal TypeError 轉成**英文技術訊息 toast**（現場長者看到 "Cannot read properties of null (reading 'draft')"）；`tf-work` 未包 safe 更是未捕捉崩潰。清單：normalizedDraft（tf-save 用）、tf-work、tf-batch-save、tf-flow-preview、tf-flow-apply＋防禦性 `if(!o)return`（tf-flow/tf-plan 對失蹤 batch id）。
- 修正：5 處 `?.`／`if(!m?.draft)return`＋tf-save 對 normalizedDraft 回 null 的處理＋2 處失蹤 batch 守門。
- 測試：新 `web/tests/transfer-ui-null-modal.test.mjs`＝**模組級直測**（import 真 transferUI，非 vm 切片）三案例——null-modal 五 action 安靜 no-op、合法預覽→apply 仍寫入（fixture 對齊 transfers.test 的合法加工單）、失蹤 batch id 不炸。fixture 教訓：tf-flow-preview 的未來時間檢查用真實時鐘時分（at 用 T00:00）、validateTransfers 要求 workIds 指向實體工作內容。
- 同輪負結果（無缺陷）：import-preview 確認路徑防禦完整（importOwner store/writer/epoch＋importCandidate 同一性＋importExpected 快照比對＋base 比對＋await 後 modal/owner 再驗）。
- 驗收：全套 web 838/838 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（dc42bf0）：CI 先綠後前進 codex/excel-friendly-ui-20260930（ec7cf20→dc42bf0）；Render deployment success；cache-buster 得新 bundle index-CVyVk1_z.js，守門壓縮形狀 `modal;if(!t)return`／`modal;if(!e)return` 存在。

## 2026-10-15 15-min tracking R27 checkpoint：缺陷#37 null-modal 別名家族（16 處）＋既有家族測試空洞斷言修實

- 探索類別：連點×取消後寫入。#30/#31 修了直接 `UI.modal.x` 模式，漏了**別名模式**（`const m=UI.modal` 後 `m.x`、`UI.modal&&find` 缺前半）。清單：confirmStep、m-leave、m-emp-save、m-emp-del、m-fault、m-mach-save、o-save、b-emp、b-mach、b-pin、b-del、b-fix、pd-save、pm-save、group-member、group-save——視窗已關時（連點第二下／背景關窗與點擊交錯）拋未捕捉 TypeError。
- **附帶發現（測試品質）**：null-modal-guards.test.mjs 第二塊的 `doesNotThrow(()=>{try{H()}catch(e){}})`＝吞錯空洞斷言——b-emp/b-mach/b-pin/b-fix/m-emp-del 從未被真正驗證。改為真斷言（不吞錯＋不得改狀態）後立刻抓到 b-fix 漏網（`UI.modal.id` null TypeError），佐證空洞斷言的危害。
- 修正：16 處加 `if(!m)/?.draft/if(!b)` 守門（confirmStep 回傳 false＝未確認）。新測試 `web/tests/null-modal-alias-guards.test.mjs`（括號平衡掃描切片器——跳過字串/模板/註解；pm-save 排版不規則需此法）14 handler＋confirmStep 真斷言全過。
- 驗收：全套 web 835/835 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（ec7cf20）：CI 先綠後前進 codex/excel-friendly-ui-20260930（463df2e→ec7cf20）；Render deployment success；cache-buster 得新 bundle index-pwJoTStN.js，內含 confirmStep 壓縮形 `const n=u.modal;return n?n.confirm===e?!0:(…,!1):!1`（null→false 不解參考）與 `modal&&m.blocks.find` 守門×4（b-emp/b-mach/b-pin/b-fix）。

## 2026-10-15 15-min tracking R26 checkpoint：缺陷#36 遠端變更後復原＝覆蓋同事寫入（undoStack 未隨基準失效）

- 探索類別：版本衝突×狀態不一致。`reloadFromStore` applied 路徑替換 S 但不清 undoStack：同事 B 變更套用後，A 按「復原」把舊基準快照套回→`commit`→`sync`——實證讀 `store/supabase.js` sync（`diffRows(this.base,S)`＋版本閘只比當前版）＝**版本閘擋不住，B 的變更被寫回舊狀態**。R9 曾撤回同類修法因 execution-receipt 鎖定「補讀不清 undo」。
- 根因分流（本輪新實證）：receipt 場景＝自己延遲 ACK 回讀，只動 execution／**已回報 block 的 pin**（RPC 所屬，`assertExecutionProtected` 含 pin 擋復原，undo 安全）；我的場景＝sync 所屬 rows/blocks 變更（危險）。用獨立探針（reader.load 前後欄位 diff）證實回報只改 `blocks[].pin`。
- 最小修正（app.js reloadFromStore applied）：比較新舊狀態的 **sync 所屬投影**（排除 execution／executionEvents／log／version／已回報 blocks）——有差＝基準真的移動→清 undoStack；無差（echo）→保 undo。receipt 語意（own-echo 後 undo 自己的編輯）完整保留。
- 重現/鎖定：新測試 `web/tests/undo-remote-reload.test.mjs` 四案例——applied 遠端變更清棧、其後 undo 不覆蓋遠端且無寫入、補讀後的新 push 仍可正常 undo、deferred（本地未存變更）不清棧。修復前 2 RED。
- 附帶：6 個編譯 reloadFromStore 的測試 fixture 補 `undoStack:[]` 全域（新依賴的 harness 更新，斷言未動）。
- 驗收：全套 web 832/832 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（463df2e）：CI 先綠後前進 codex/excel-friendly-ui-20260930（98c85c9→463df2e）；Render deployment success（SHA=463df2e）。注意：首次抓 index 仍是舊 hash（CDN 快取），cache-buster 重抓得新 bundle index-DkVIpR0D.js，內含判別壓縮形狀 `new Set((g.execution||[]).map(S=>S.blockId)),w=({blocks…` 與條件清棧 `b&&(Qe.length=0)`。

## 2026-10-15 15-min tracking R25 checkpoint：缺陷#35 未確認儲存時登出靜默丟失＋成員舊引用/時區審查（無缺陷）

- 探索類別：靜默丟失（#32 同型不同出口）。`case "logout"` 直接 `STORE.logout()`——syncPending>0、SYNC.state==="error"（離線未存）、未確認回報任一成立時登出，本機變更無警告永久丟失；beforeunload 對同一風險已攔（R22），出口不一致。
- 重現：新測試 `web/tests/logout-pending-guard.test.mjs`（vm 切 logout case 包 switch 執行）修復前 3 RED（在途/失敗/未確認回報皆照常登出）。
- 最小修正（app.js logout case）：與 beforeunload 同條件 `syncPending>0||SYNC.state!=="ok"||executionRetries.has(STORE)||STORE.hasPendingConfirmations?.()` → toast 中止（新 i18n 鍵三語已補）。乾淨狀態登出不受影響——4/4 綠。
- 同輪負結果審查（無缺陷）：①成員刪除舊引用——`UI.focus` 家族全為 id 比對或 `emp()?.name||fallback`；`renderModal` 對 null body 自動 `closeModal()`，前景補讀替換 S 與 modal 重渲染原子同步（實體消失即自動關窗，無點擊窗口）；`normalizeState` 有 group 孤兒回退。②時區——日期模型＝本地日期字串↔UTC dayNum 對稱往返（parseD/fmtD/dayNum 全 UTC、todayStr/nowMin 全本地），無混合。③`emp()` 未守門解參考掃描 10 處——b-emp 的 `emp(b.emp).name` 名單來自當前 S 重繪、gw-apply 的 `emp(D.emp).name` 被 assignmentIssues「工作內容或員工不存在」前置攔截，皆不可達。
- 驗收：全套 web 828/828 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（98c85c9）：CI 先綠後前進 codex/excel-friendly-ui-20260930（e333d6f→98c85c9）；Render deployment success（SHA=98c85c9）；bundle index-BhHUim0j.js 內 `…call(I)){R(l("有變更尚未確認儲存…` 守門形狀存在（文案兩處＝字典＋呼叫點）。

## 2026-10-15 15-min tracking R24 checkpoint：缺陷#34 一般工作預覽確認復活遠端已刪工作＋權限邊界審查（其餘無缺陷）

- 探索類別：版本衝突×取消後寫入。延續 #33：衝突恢復前景補讀替換 S 不受 modal 守門（remoteReloadBlocked 只擋背景），一般工作預覽（general-preview）開著時若遠端已刪該段，`gw-apply` 的 `assignments(S).filter(a=>a.id!==D.id).concat(D)` 無條件 concat＝復活已刪工作，套用後覆蓋另一裝置刪除。
- 重現：新測試 `web/tests/general-apply-resurrection.test.mjs`（vm 編譯真 `previewGeneral`＋真 `gw-apply`，模擬預覽後 S 替換）修復前 1 RED：A1 復活＋commit 已送。
- 最小修正：`previewGeneral` 在 modal 記 `existed`；`gw-apply` 若 `existed&&` 當前 S 已無此 id → toast 中止不寫（新 i18n 鍵三語已補）。全新插入（existed=false）與正常移動不受影響——3/3 綠。
- 同輪權限邊界審查（無缺陷）：`commit(entry,permission)` 中央閘＋`canPermission` PV 擋寫；undo 在 PV_BLOCK 內；blk→report-open 開 modal 未守門但 `reportWork` 提交有 `canPermission`×`canReport`（含 worker 只能報自己：`employeeId===block.emp` 且優先序正確）；`general-edit` 對失蹤 id 走新建草稿不崩潰；`b-pin`/`b-mach` 先變更後 commit 的本地分歧由 e.permission 恢復讀兜底。
- 驗收：全套 web 824/824 綠＋build 過。staging 部署驗收見下。 
- staging 部署驗收（e333d6f）：CI 先綠後前進 codex/excel-friendly-ui-20260930（357238d→e333d6f）；Render deployment success（per_page=1 查得，SHA=e333d6f）；bundle index-CEdbho95.js 內守門壓縮形狀 `modal.existed&&!Se(m).some(s=>s.id===t.id)){R(l("這段工作已被別人更新移除…` 存在（文案兩處＝字典＋呼叫點）。

## 2026-10-15 15-min tracking R23 checkpoint：缺陷#33 拖曳中衝突恢復→舊引用復活已刪工作

- 探索類別：版本衝突×競爭。路徑：`queueSync` conflict 分支前景 `reloadFromStore()` 不受 `remoteReloadBlocked()` 守門（設計上衝突必須換基準），會在拖曳中整體替換 S＋render。pointerup 拖曳處理器用 pointerdown 捕獲的舊 block 物件引用叫 `dragPreview`，其內 `if(!moved){moved={...b};S.blocks.push(moved);}` 會把遠端已刪除的段「復活」並 pin——套用後覆蓋另一裝置的刪除（取消後寫入／版本衝突類）。單擊路徑（openModal blk）已有 `if(!b)return null` 守門；`b-preview`／`blk-new` 呼叫者分別有 find 守門／全新 block，不受影響。
- 重現：新測試 `web/tests/drag-conflict-resurrection.test.mjs`——(1) vm 編譯真 `dragPreview`（withState stub 走真 S 替換語意）證明餵舊引用時 after 內出現 pin=true 的復活 block；(2) vm 切 pointerup 語句測 move/resize/點擊三路。修復前 2 RED（move/resize 未攔）。
- 最小修正（app.js pointerup，`endDrag();drag=null;` 之後）：`if(!S.blocks.some(x=>x.id===d.b.id)){toast(tx(...));return;}`——block 已不在最新 S 即中止拖曳並提示（新 i18n 鍵三語已補，棘輪測試通過）。修復後 5/5 綠。
- 驗收：全套 web 821/821 綠＋build 過。staging 部署驗收：見本段下方部署行。 
- staging 部署驗收（357238d）：CI 先綠後前進 codex/excel-friendly-ui-20260930（984bc5b→357238d）；Render deployment 7068491086 success；bundle index-BeWhS65c.js 內守門壓縮形狀 `if(!….blocks.some(x=>x.id===t.b.id)){R(l("班表剛被別人更新…` 存在（toast 文案字串兩處＝字典＋呼叫點）。

## 2026-10-15 15-min tracking R22 checkpoint：缺陷#32 離線後關分頁靜默丟失（beforeunload 漏攔 error 狀態）

- 探索類別：離線／靜默丟失（本輪計畫優先項）。路徑審查發現 supabase 模式 S 只存在記憶體（localStorage 僅 UI 偏好），同步失敗（如斷網）後 `queueSync` 進 catch：`SYNC.state="error"`、`syncPending` 歸零——而 `beforeunload` 守門只攔 `SYNC.state==="busy"`，關分頁無警告＝本機未存變更靜默丟失。
- 語意矛盾佐證：`reportWork`（app.js:4685）與出回報（:4562）在 `SYNC.state==='error'` 時都以「班表尚未確認儲存」擋門，同狀態關分頁卻不警告。`changedWriteSession`（登入狀態變更）也會設 error，攔截同樣正確。
- 重現：新測試 `web/tests/beforeunload-error-guard.test.mjs`（vm 切出 beforeunload 語句＋端到端真 `queueSync` 失敗→斷言 handler 警告）修復前 2 RED／2 綠。
- 最小修正（app.js:3463-3464）：`SYNC.state==="busy"` → `SYNC.state!=="ok"`（狀態僅 busy/ok/error 三值，初值 ok，誤攔不可能）。同步更新 preview-ui.test.mjs 的源碼字串斷言至新語意。
- 驗收：beforeunload-error-guard 4/4 綠；全套 web 816/816 綠＋build 過。staging 部署見下。 
- staging 部署驗收（984bc5b）：push 前進 codex/excel-friendly-ui-20260930（e6ba43d→984bc5b，CI 先綠）；Render deployment 7067769279 success；bundle https://factory-scheduler-web-staging.onrender.com/assets/index-DiNB5qk8.js 內 beforeunload 壓縮形狀 `Es>0||oe.state!=="ok"` 存在，且與 remoteReloadBlocked／execution-report 擋門同形（`oe.state!=="ok"`＋「班表尚未確認儲存」文案）——三處語意一致上線。

## 2026-10-15 15-min tracking R20/R21 checkpoint：queueSync 失敗→重試保存語意鎖定（無缺陷）

- 起點 0f4c6ec clean（R20 中斷後 R21 接續完成同一探索）。**假說**：save 失敗後按「重試」（queueSync(null)）——重試快照取當下 S，若 S.log 在失敗後被任何路徑清掉，紀錄會遺失。
- **實證（真 LocalStore sync 路徑＋vm 編譯實際 queueSync）**：失敗（SYNTH_FAIL）→ error 呈現 → 按重試（null entry）→ 成功——**S.log 恰 1 筆、持久化 log 恰 1 筆**＝重試快照完整保留紀錄與資料。過程自我糾正×2：①harness 缺 syncChain（ReferenceError）補上；②誤解 queueSync 會推 S.log（實為 commit 職責）——測試改為模擬 commit 先推再 queueSync。**無產品缺陷**（queueSync 不動 S.log；snapshot 取呼叫時 S）。
- **提交 2ec9afa**：新測鎖定「失敗→重試保存」語意；全套 **812/812**＋build；CI 全綠。**PR16 同步**→**7fc3e31**（**813/813**）。純測試變更，staging 不部署（runtime 未變）。
- 正式 1023／0037／Auth／角色未動；無 cloud 寫入；nightly 停用；門檻不變。
- 下一步：新缺陷類探索（優先：離線／版本衝突／權限邊界）。
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

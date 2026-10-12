# 正式網址內的獨立雲端測試模式

## 使用者同意的範圍

使用者同意：在正式網站新增測試模式，手機與電腦共用獨立測試雲端資料，真實1023名冊／工單／班表不動，不新增付費服務。

## 連線與資料隔離

- 正式網站：`https://factory-scheduler-web.onrender.com/`。
- 測試入口：同網址 `?mode=test`，只有設定完成後才可用。
- 唯一允許測試 Supabase：`fkefarcwadvyqqjcjxvp`；與正式 `kjnnguekhshkhgycmryl` 不同。
- 唯一允許測試 solver：`https://factory-scheduler-solver-staging.onrender.com`。
- 前端三個 `VITE_TEST_*` 設定缺漏、指向錯誤服務或與正式相同：停止啟動，禁止回退正式／本機。
- 測試 auth storage key 獨立；切環境連結移除 hash，邀請／密碼回復網址保留 `?mode=test`，不帶到正式登入流程。
- 前端禁止 private service-role／sb_secret keys；只可使用測試 publishable／anon key。
- 測試資料庫管理登入、前端測試帳號登入，是不同用途，不可混用憑證。

## 測試資料準備

- `tools/cloud-test-seed.mjs`：離線、無憑證、無雲端寫入；身分映射為UUID、機台代號符合資料庫限制，補齊跨廠電鍍／檢驗產品相容性。
- 12員工、8機台／工位、20工單、2分組與12組員、2欠缺品項；故障、休假、急單與逾期例子。
- 2026-10-12基準；CI OR-Tools預排103段，獨立solver檢核issues=0。
- CI run `38157696207` 的 `isolated-cloud-test-seed` artifact已下載到本驗收工作目錄的 `outputs/verified-seed-20261012/`。
- 整份103段SQL已在PGlite＋全部migration執行通過（12測試員工／103測試方塊）；保留原有示範名冊。
- SQL為新增、transactional；禁止覆蓋已存在的本次測試資料，含來源名冊時拒絕。不得將檔案貼進正式專案SQL Editor。
- 本機Windows App Control拒絕OR-Tools DLL，沒有停用或繞過防護；改用既有GitHub CI的Linux環境產生與檢核合成資料。

## 工作區協調

- 同工作區的背景任務已將本任務進行中的初版提交至main（535e918／01f30cc）。保留其提交，不反轉其變更。
- 後續驗收修正在獨立Git工作目錄 `C:/Users/me060/Downloads/factory-scheduler-test-mode-release`，分支 `codex/cloud-test-mode-release-20261012`。
- 原目錄的相同5個修正後來由背景任務提交為020bc75，原目錄已乾淨；本分支以正常merge納入，不反轉／不force-push其提交。

## 驗收與尚未完成

以下為前一輪歷史狀態；目前進度請以本文最後的「2026-10-12 13:15 台灣時間續作」為準。

- 前端375項測試、build通過（本修正）；模式隔離、hash剝離、登入回復連結、禁止私密金鑰與SQL真實migration測試通過。
- 手機390×844測試登入頁：清楚顯示測試模式、返回正式入口、沒有水平溢出；桌面／手機登入標示沿用現有風格。
- 既有大chunk警告保留。npm audit現在新增source-map-js high，npm explain確認僅dev的Vite→PostCSS建置依賴；另列獨立修復，未把它當成網站讀入使用者source map的runtime路徑。原有exceljs／uuid moderate未強制降版或套用breaking fix。
- Draft PR #16：https://github.com/me0608623/factory-scheduler/pull/16。439a55c的push CI Tests 38158258735通過；merge納入背景提交後仍須以最新head CI為準。
- **尚未匯入真正測試Supabase**：管理後台已登出，已請使用者登入；沒有使用正式連線字串替代或猜測密碼。
- **尚未配置正式Render的三個測試變數**：先完成匯入與帳號驗證，避免啟用一個無班表的入口。
- **尚未親測新版測試模式的兩端雲端同步／排程套用**：完成匯入與登入後才可判定通過。
- 既有測試Render服務追蹤舊staging分支；需核對更新後版本與CORS（正式網站origin）再交付手機測試，不以/health成功冒稱版本一致。

## 下一步（需登入後繼續）

1. 在Supabase管理後台核對網址為測試ref，讀取schema、原資料與三個測試帳號角色。匯入前先確認測試資料庫不是含1023資料的正式專案。
2. 複核artifact SQL，在測試SQL Editor交易匯入；確認12測試員工、8測試資源、20測試工單、103段，以及setup_pending只在測試環境解除。
3. 更新既有staging solver至已驗證版本，保留原環境變數並允許正式網站origin；不得新增費用或把正式service_role key給staging。
4. Render正式前端用merge方式設定VITE_TEST_SUPABASE_URL、VITE_TEST_SUPABASE_ANON_KEY、VITE_TEST_SOLVER_URL，不能replace全部變數。
5. 同SHA CI綠後部署；測試網址兩個獨立登入分頁驗證一端套用→另一端即時更新、衝突與斷線提示；最後交付手機網址、帳號說明與測試日期。

## 2026-10-12 13:15 台灣時間續作

- 使用者已登入Supabase管理後台；UI核對為 `factory-scheduler-staging` / `fkefarcwadvyqqjcjxvp`。正式專案沒有開啟或寫入。
- 匯入前唯讀盤點：5員工、5機台、6工單、23段、version=1、setup_pending=false、來源名冊0筆、測試員工0筆。既有7測試帳號保留，不新增帳號、不改密碼／角色。
- 第一份seed交易遇到缺 `rush_orders`，完整回滾；再讀確認仍5員工／23段／version=1。查證測試schema停在0024，尚無0026權限、0027覆蓋層與0030後表。
- 升級前經SQL Editor匯出排程快照CSV到本機Downloads（`Supabase Snippet Untitled query.csv`）；這只是應用排程快照，不是完整pg_dump，也不含Auth密碼。
- 只在測試SQL Editor，以單一交易套用repo已測試的0025–0036 migration，UI顯示Success。新版快照欄位及authenticated讀machine_layout權限已查證。
- 重試合成seed交易成功：12測試員工／8測試資源／20測試工單／103測試段，first_test_date=2026-10-12，version=2。原有5員工、23段保留，合計17員工／126段。
- 新增seed schema預檢，缺新版必要表時在任何seed寫入前明確拒絕；PGlite實際缺表回歸驗證名冊、version、setup_pending不變（cloud-test-seed 5/5）。匯入artifact仍是原始已驗證103段，不重置已匯入資料。
- 真實測試Postgres的transaction-only角色驗收：authenticated＋既有QA帳號claims，boss透過save_blocks寫相同126段且version暫升3；worker/viewer可讀，save_blocks回42501；整筆rollback，最後version=2／126段。這不等於瀏覽器登入、HTTP權杖或跨裝置Realtime驗收。
- 測試solver的ALLOWED_ORIGINS合併保留測試網站並加入正式網站origin；未變更其Supabase私密金鑰。正式網站origin的 `/plans/db` preflight從400變200，allow-origin精確對應正式網站。
- 既有測試服務追蹤分支已non-force fast-forward到已驗證main `cdfc40c4d89d2ddd44d81f09bf6842f12107a806`（比綠燈f42b276只多文件）；沒有合併PR16或改正式部署設定。
- 查GitHub repo hooks回空陣列，確認push不會自動觸發Render（與repo工作流說明一致）；因此只手動觸發兩個既有staging服務：web `dep-db66och42hec73b4b0kg`、solver `dep-db66ocdckfvc73cbi7ig`，均live於cdfc40c。沒有新增資源或費用。
- 新solver health=200／database=true／OR-Tools 9.15.6755；部署後app error logs為0（05:13:07Z–05:14:57Z觀測範圍，不是長期保證）。
- 合併最新main後，web全套383/383及build通過；新schema預檢另外5/5通過。新增測試提交的CI仍須以最新head為準。
- 仍未設定正式前端VITE_TEST_*：等待實際測試帳號登入與兩端同步。PR16維持draft，不把資料庫角色測試冒充完整上線驗收。
- 已開 `http://localhost:5197/?mode=test` 供使用者安全輸入自己保管的測試帳號密碼；只预填 `me0608623+test-lead@gmail.com`，沒有讀取／猜測密碼。dev server刻意留作登入handoff。
- 測試帳號employee_id目前均null：可驗排程讀寫權限，但員工自己的報工任務尚未綁定。需另核對授權後綁定，不冒稱員工手機報工已通過。

### 接续驗收

1. 等使用者回覆「測試帳號已登入」；驗證app load/角色/17人13資源26單126段、新增12人8資源20單103段可見。
2. localhost不是staging solver允許的origin，不能用本機solver fallback冒充OR-Tools通過。登入驗收後使用正式測試入口或staging網站驗證真正solver及同步。
3. 用merge方式配置正式web三個VITE_TEST_*公開設定、CI綠燈後重建；不拿正式帳號／私密金鑰替代測試權杖。
4. 以真實兩個獨立帳號／裝置測修改、即時更新、冲突與離線；有阻礙須如實保留未驗證。正式1023與setup_pending保持不動。

證據：本worktree `outputs/staging-seed-import-20261012.png`；原始預排artifact在 `outputs/verified-seed-20261012/`。

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
- 原目錄尚有本任務相同的5個未提交檔案，沒有重置或刪除，以免覆蓋背景任務；本分支只提交自己的修正。

## 驗收與尚未完成

- 前端375項測試、build通過（本修正）；模式隔離、hash剝離、登入回復連結、禁止私密金鑰與SQL真實migration測試通過。
- 手機390×844測試登入頁：清楚顯示測試模式、返回正式入口、沒有水平溢出；桌面／手機登入標示沿用現有風格。
- 既有大chunk警告保留。npm audit現在新增source-map-js high（建置工具依賴，需獨立評估與修復）；原有exceljs／uuid moderate未強制降版或套用breaking fix。
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

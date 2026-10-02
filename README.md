# 產線排程系統

工廠排班、機台故障、請假、插單、急單的排程看板。
**畫面是我們自己做的；計算用 Google OR-Tools；資料、帳號、即時推送用 Supabase。**

架構與規劃見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 目錄

| 路徑 | 內容 |
|---|---|
| `index.html` | 原型網頁（單一檔案，已發布給老闆試用） |
| `web/` | **正式版前端**：畫面沿用原型，方案改由 OR-Tools 計算；本機模式或 Supabase 模式 |
| `db/migrations/` | 資料庫結構：資料表、稽核紀錄、權限、套用方案的函式、即時推送 |
| `db/seed.sql` | 示範資料（和原型相同） |
| `db/tests/` | 資料庫測試（PGlite，不用安裝 PostgreSQL） |
| `solver/` | 排程服務：FastAPI ＋ OR-Tools CP-SAT |
| `.github/workflows/nightly-backup.yml` | 每日自動備份 |

## 1. 建立資料庫（Supabase）

1. 到 [supabase.com](https://supabase.com) 建立專案（目前使用東京 `ap-northeast-1`）。
2. 打開 **SQL Editor**，依序執行 `db/migrations/0001` 到最新 migration；要示範資料再執行 `db/seed.sql`。已建好的專案只需接續執行尚未套用的 migration，先在測試環境驗證。
3. 到 **Authentication → Sign In / Providers** 關閉「Allow new users to sign up」，避免任何人自行註冊後讀取排程資料。若刻意開放示範帳號測試，請只放非敏感示範資料。
4. 等老闆信箱確認後，由管理員在 **Authentication → Users** 邀請老闆。**所有新帳號預設只能看**；管理員核對身分後，在 SQL Editor 把該帳號的 `profiles.role` 設為 `boss`，再驗證角色。註冊順序不決定權限。
5. 其他人的職位（組長 lead、員工 worker、電視 viewer）保存在 `profiles`；套用 `0026_delegated_permissions.sql` 後，老闆可在網站的「帳號與連線 → 管理帳號權限」逐項調整既有帳號可用功能，不必更改職位。

目前的雲端專案為 `factory-scheduler`（`https://kjnnguekhshkhgycmryl.supabase.co`）。
`0001`–`0012` 已於 2026-09-26 套用；`0011` 新增獨立歷史排程資料表，與現行排程快照分離，只允許老闆和組長查閱、存入；`0012` 為員工、機台及產品工序加入 1／2 廠別，舊資料預設 1 廠。`0013` 將排程1023原檔的製作站別與人名欄位加入同一歷史封存的待確認名冊，不建立正式資源。先前資料庫已核對 RLS 和即時推送；`0009` 的新帳號觸發器不再依註冊順序給老闆權限；`0010` 新增每位員工同時顧機台上限。`0007`–`0008` 新增的加班星期與單日覆寫已在雲端驗證；工單與排程資料未刪除。
此獨立分支另有 `0014`（阻止直接套用未完成方案）與 `0015`（手動排程的跨工序物料、機台與員工容量檢查），目前只在本機測試資料庫執行，尚未在正式 Supabase 套用。
`db/seed.sql` 已匯入：5 位示範員工、5 台機台、3 種產品、6 張工單；排程方塊尚未建立。
`web/.env.local` 已設為雲端模式。`me0608623@gmail.com` 是測試用組長帳號，不是老闆帳號；老闆帳號等實際持有人確認後再邀請並授權。Supabase Dashboard 的「Allow new users to sign up」已關閉。

員工設定可指定「同時最多顧幾台機台」（預設 1 台、最多 100 台）；OR-Tools、瀏覽器備援和手動拖曳均依此上限檢查。這不等於兩人同時操作同一台機台：目前同一機台仍只容許一段工作，兩人合計產量尚未實作。

手動排班可在指定日期為「尚未排入的工單工序件數」選機台、合格員工與開始／結束時間；既有方塊可拉底邊或在明細中選結束時間。件數依工序速率與剩餘量估算，先預覽衝突與交期影響，確認後才寫入。已排滿的工單若要再加第二位員工同機合作，仍需另做多人同機資料模型，不能靠新增重疊方塊代替。

## 2. 啟動排程服務

需要 [uv](https://docs.astral.sh/uv/)。

```bash
cd solver
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8080
```

打開 http://localhost:8080/docs 可以直接試 API。

## 3. 啟動前端

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

打開 http://localhost:5173。

- 排程服務有開（第 2 步）：方案由 **OR-Tools** 計算；沒開就自動改用瀏覽器內的演算法，畫面會標示「瀏覽器備援」。
- `.env.local` 沒填 Supabase：**本機模式**，資料存在這台電腦的瀏覽器，不用登入。
- 填了 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`：**雲端模式**，要登入；職位提供預設權限，老闆也可逐項授權既有帳號；別人的變更會即時更新。

### 帳號職位與功能授權

`0026_delegated_permissions.sql` 將「職位」與「實際功能權限」分開。組長、員工或電視帳號都可由老闆個別開啟或關閉：排程、故障／請假、工單、工時／加班、基本資料、分組、工作內容、跨廠加工、輪班草稿、試排情境、現場回報及歷史排程。老闆本人的全部權限不能關閉，避免失去管理入口；非老闆不能轉授權限。

前端開關不是唯一保護：資料表 RLS、資料庫 RPC 和 OR-Tools 的登入端點會再次檢查相同權限。若某項設定會連帶搬動既有工作，例如把有班表的日期改成停工、刪除已排入的工單或設備，除了該資料的管理權限，仍須具備「調整與自動排程」權限。權限變更會即時通知已登入的該帳號；重新整理後也會重新讀取。

### 員工加班意願

老闆可在員工資料設定**固定每週哪幾天可加班**。排程表的「開加班到 20:00／調整加班人員」會先顯示每位員工當天的預設，再由老闆或組長臨時改成「今天可加班」或「今天不加班」；單日覆寫不會改到其他星期的日期。確認後才套用並自動調整不再符合條件的排程。舊資料的「可以加班／不能加班」會分別轉成每天可加班／每天不可加班。已請假者仍不排工作。

### Excel 匯出與批次匯入

在畫面右上角按 **Excel**：

- **彩色排程 Excel（.xlsx）**：匯出目前選取日期，第一張「時間×機台」以 30 分鐘列出各機台工作，格子依員工顏色填色；第二張「排程明細」保留每段工作的精確起迄時間、數量和固定狀態。空白日也能匯出。
- **批次匯入範本（.xlsx）**：填寫「員工」「機台」「產品工序」「工單」四張工作表。代號須跨表對應，每項產品的工序從 1 連續編號；「填寫說明」的例子不會匯入。
- 範本的「不加班」目前代表每週都不可加班；「否」代表每週都可加班。匯入後可在員工資料細選固定星期。
- 老闆權限或本機模式可選取填好的檔案。系統先檢查格式、數值與跨表關聯並列出錯誤；按 **確認匯入並清空舊排程** 前不改資料。確認後，四類基本資料由 Excel **整批取代**，原排程方塊清空，上班日設定保留；請接著按「自動排程」。可用畫面上的「復原」撤回這次匯入。
- 若選取含「1廠」「2廠」的舊版手填排程，系統先顯示原始格位與文字的**唯讀預覽**。老闆或組長可按「存為歷史排程」，另存到獨立的雲端資料表（本機模式則存在本機瀏覽器），再由畫面上方「歷史排程」按日期和廠別查閱。這不執行整批取代，不改示範排程。原表尚缺可靠的工作起訖時間與對應規則；確認前不會自動生成或調整排班方塊。原始 `.xlsx` 不放在公開網站或 Git 倉庫，存入的是解析後的歷史內容。
- 歷史排程內可切換「製作項目與人員」，查看依原檔欄名擷取的兩廠站別、人名候選與人力備註，並保留原始儲存格位置。這是待確認名冊：原檔是 2024 年資料，尚未確認在職、設備能力、工序速度或正式工單；不參與自動排程。

### 兩廠與跨廠工單

頂部可選 **1 廠／2 廠／跨廠**；各廠只顯示自己的人員、機台、相關工單和排程。老闆可在員工、機台與產品每道工序設定廠別。同一工單的產品工序可以先在 1 廠、再到 2 廠；OR-Tools 與瀏覽器備援都要求人、機、工序同廠，並依前後站數量約束進度。自動排程永遠以兩廠的完整資料一起計算，切換只是畫面篩選。

現有示範人員、機台、工序全部預設 1 廠，2 廠初始為空；歷史 Excel 不會自動轉成正式資源。上班日與「是否開加班」目前仍是兩廠共用設定。跨廠運送／交接時間尚未定義，求解器暫以可立即交接計算，正式啟用跨廠工單前須與現場確認。現有批次匯入範本尚未含廠別欄；當系統已有 2 廠資料時，畫面會阻止用舊範本整批覆蓋，避免誤清空。

匯入支援 `.xlsx`、檔案上限 5 MB；批次基本資料每張表最多 1000 列。請先匯出／備份原資料再進行整批取代。組長可存入歷史排程，但不能整批取代基本資料；員工和電視帳號只能匯出。

## 4. 測試

```bash
cd solver
uv run pytest
```

```bash
cd db/tests
npm install
npm test
```

```bash
cd web
npm test
```

前端的雲端資料層用 PGlite 加上真的資料庫結構來模擬 Supabase，不用帳號也能測試。
每次推送 `db/`、`web/` 或 `solver/` 的變更，GitHub Actions 也會執行這三組測試與前端建置；兩個容器另有部署煙霧測試。

## 5. 公開部署（Render）

`web/Dockerfile` 和 `solver/Dockerfile` 可分別部署到支援 Docker 的平台；兩個服務都需要公開 HTTPS 網址。
Render Blueprint 已於 2026-09-26 建立兩個服務：

- 前端：<https://factory-scheduler-web.onrender.com>（靜態網站，已上線）
- 排程服務：<https://factory-scheduler-solver.onrender.com>（`1c-2g`，已上線；`/health` 回報資料庫所需設定齊全，實際讀寫仍待登入驗收）

目前公開前端會要求登入，已有測試用組長帳號；**外部裝置實際操作驗收仍待完成**，不能僅憑網站可開啟就視為可供員工使用。這個 Blueprint 是從公開 Git URL 建立，Render 尚未連接 GitHub 帳號；推送程式後須確認是否自動同步，否則到 Render 手動同步 Blueprint／部署，並核對目前服務版本。

### 選平台後可直接使用的設定檔

- **Render（目前使用）**：根目錄的 `render.yaml` Blueprint 已建立免費靜態前端和 **付費 2 GB** 排程服務（`1c-2g`，建立時 Render 預估 US$25／月）。兩處 Supabase anon key 與**只給排程服務**的 service-role key 已填入 Render 環境變數；前後端網址由 Blueprint 互相引用。金鑰不要放入 Git；真實 Excel 也不要放進 Git 倉庫。參考 [Render Blueprint 規格](https://render.com/docs/blueprint-spec)。
- **Railway**：`web/railway.json`、`solver/railway.json` 設定 Docker 建置、健康檢查與重啟。從同一 GitHub 倉庫建立兩個服務，分別設定 Root Directory `/web` 與 `/solver`、Config File Path `/web/railway.json` 與 `/solver/railway.json`，然後各自產生公開網域。兩個服務都要**關閉 Serverless／App Sleeping**，才能避免閒置後冷啟動；排程服務記憶體上限至少 2 GB。參考 [Railway monorepo](https://docs.railway.com/deployments/monorepo) 與 [Serverless 說明](https://docs.railway.com/deployments/serverless)。
  - Railway 的 `web` 變數：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，以及 `VITE_SOLVER_URL=https://${{solver.RAILWAY_PUBLIC_DOMAIN}}`。
  - Railway 的 `solver` 變數：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`SOLVER_DISABLE_SNAPSHOT_API=1`，以及 `ALLOWED_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}`。參照變數取決於服務名稱正好為 `solver` 與 `web`；若命名不同，需同步改名。設定網域或建置時變數後，重建前端，確保 Vite 將正式網址寫入產物。

兩種設定檔都只是部署準備，不會自動開通付費服務；Render Blueprint 同步或 Railway 建立服務後才可能產生費用。若要保證低使用量時資料庫仍在線，Supabase Free 也不夠，需先看 [專案暫停規則](https://supabase.com/docs/guides/platform/free-project-pausing) 並由你決定是否升級。

1. **先部署排程服務**，以 `solver/` 為 Docker 建置目錄。平台須提供 `PORT`（沒提供時用 8080）。設定下列伺服器環境變數：

   | 變數 | 值 |
   |---|---|
   | `SUPABASE_URL` | `https://kjnnguekhshkhgycmryl.supabase.co` |
   | `SUPABASE_ANON_KEY` | Supabase 的 publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase 的 **service_role secret key**，只存在排程服務的私密環境變數 |
   | `SOLVER_DISABLE_SNAPSHOT_API` | `1`，公開部署必設；關閉不需登入的 `/plans`、`/solve` |
   | `ALLOWED_ORIGINS` | 正式前端的 `https://` 網址；多個用逗號隔開，不加結尾 `/` |
   | `SOLVER_MAX_WORKERS` | 選填，OR-Tools 每次求解最多使用的工作者數，允許 1–16；未設定或填錯時維持 8。降低數值通常可省記憶體，但可能讓方案變差或時限內找不到方案，須用現場資料量測後再調整。 |

   不要在前端、Git、建置參數或公開文件中放 `SUPABASE_SERVICE_ROLE_KEY`。排程服務的 `/plans/db` 仍須使用者登入憑證，並依事件種類檢查排程、故障／請假或工單權限。部署後先確認 `https://排程服務網址/health` 回傳 `"database":true`。

2. **再部署前端**，以 `web/` 為 Docker 建置目錄。以下為**建置時**的公開參數，平台若區分 build args 和執行時環境變數，請填在 build args：

   | 變數 | 值 |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://kjnnguekhshkhgycmryl.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase 的 publishable key；可以出現在瀏覽器 |
   | `VITE_SOLVER_URL` | 第 1 步取得的排程服務公開 `https://` 網址，不加結尾 `/` |

   前端容器會使用平台提供的 `PORT`（沒提供時用 8080），提供單頁應用的重新整理路由和 `/health`。換了排程服務網址或 Supabase 專案，需要重建前端，不能只改容器執行時環境變數。不要設定 `VITE_SOLVER_API_KEY`：前端變數無法保密。

3. 到 Supabase **Authentication → URL Configuration**，把 Site URL 改成正式前端網址，Redirect URLs 加上 `https://正式前端網址/**`；可保留本機 `http://localhost:5173/**` 供開發使用。
4. **公開前關閉自助註冊**。`0009` 已套用；等老闆信箱確定後邀請帳號，由管理員核對後設為 `boss`，驗證角色再讓外部人員使用。開發者信箱不是老闆帳號；不要靠「第一個註冊」取得權限。
5. 從手機行動網路或外部電腦登入正式網址，驗證示範資料、計算預覽顯示「OR-Tools」、套用與即時同步；再檢查 `POST /plans`、`POST /solve` 已回 403。

Render 已提供 HTTPS 網址並完成服務建立與環境變數設定；Supabase 登入設定及上述現場驗收仍須完成。若需要自己的網域，另行設定 DNS。

### 排程服務容量測試（2026-09-26，本機模擬資料）

在 `solver/` 執行 `uv run --with psutil python scripts/benchmark.py` 可重跑。每張工單有 4 道工序，以下是早期使用每次求解 5 秒、8 個工作執行緒的單次基準；測試器現已支援多方案、事件及依方案數延長外層保護時限。測得：

| 機台／員工／工單 | 結果 | 端到端時間 | 記憶體峰值 |
|---|---|---:|---:|
| 5／10／10 | 找到可行解 | 7.3 秒 | 137 MB |
| 10／20／30 | 找到可行解 | 7.3 秒 | 186 MB |
| 20／40／50 | 未找到可行解 | 25.5 秒 | 1,058 MB |
| 20／40／100 | 未找到可行解 | 16.3 秒 | 230 MB |

這是單次模擬量測，不代表所有資料的上限。求解資源耗用不會隨工單數線性增加；**不能據此承諾 50 或 100 張工單可穩定自動重排**，也不能只按 100 張那次的較低記憶體選主機。公開試用前應限制同時求解數，並以工廠實際資料重測。

後續跨廠、故障、請假及 500–750 張工單的合成壓測與修正，見 [過夜測試紀錄](docs/OVERNIGHT_2026-09-26.md)。這些只在獨立分支驗證，未替正式 Render 服務作容量保證。

排程服務目前每個程序同時只接受一組求解；第二個計算請求會得到 HTTP 429 與 `Retry-After: 5`，畫面提醒稍後重試，不會偷偷切換演算法。這避免同一台主機疊加多組 OR-Tools 記憶體峰值，但不是跨多台主機的全域佇列；擴充服務實例前須另設共用佇列與資源限制。

## 6. 每日備份

把專案放到 GitHub，在 **Settings → Secrets and variables → Actions** 新增 `SUPABASE_DB_URL`
（Supabase → Connect → **Session pooler** 的連線字串）。每天台灣時間 02:00 自動備份，保留 30 天。

還原：

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" factory-YYYYMMDD-HHMM.dump
```

### 還原演練與驗證（CI）

- `backup-drill.yml`（每月 1 日自動＋可手動）：下載最新備份 artifact，還原到拋棄式 PostgreSQL 17 容器，
  驗證表數、關鍵函式、RLS 政策與資料筆數。Supabase 專屬相依（`auth` schema、`auth.users`、
  `anon`／`authenticated` role）會在演練容器內建立 stub 或從備份資料回填，備份本體不受影響。
- `permissions-drill.yml`（手動）：同樣還原後模擬 boss／lead／worker／viewer 帳號，
  驗證權限矩陣、RLS、`setup_pending` 防護與排程寫入流程（版本衝突、現場回報、確認完工）。

### 復原範圍邊界（重要）

`--schema=public` 備份**只涵蓋 public schema**（排程、工單、權限覆寫、稽核紀錄）。以下項目**不在備份與演練範圍內**，
災難復原時要另外處理：

| 項目 | 說明 | 復原方式 |
|---|---|---|
| 登入帳號（`auth.users`） | Supabase Auth 服務管理，不在 public schema | 重新邀請建立；員工→帳號綁定靠 `profiles.employee_id` 重建 |
| 驗證服務設定 | Supabase 託管的 Auth（密碼、session） | 依 Supabase 儀表板設定；無法從本備份還原 |
| 儲存檔案（Storage） | 目前未使用；日後若上傳檔案需另訂備份 | — |
| 正式服務環境變數 | Render 的 `VITE_*`、solver 金鑰、`SUPABASE_DB_URL` secret | 依 Runbook 重新設定（密鑰不進 Git） |

演練中的 `auth.users` stub 只驗證外鍵結構完整，**不代表**登入帳號可從備份還原。

## 注意

- 在某些 Windows 電腦上，「應用程式控制」會擋住 pandas 的 DLL。OR-Tools 只是順帶載入 pandas，沒有真的用到，所以 `solver/app/__init__.py` 在這種情況下會換成空殼，排程服務照常運作。Linux 伺服器上不受影響。
- 國定假日請每年依行政院人事行政總處公告更新 `holidays` 資料表。

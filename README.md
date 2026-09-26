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
2. 打開 **SQL Editor**，依序貼上執行 `db/migrations/0001` 到 `0008`；要示範資料再執行 `db/seed.sql`。已建好的專案只需接續執行尚未套用的 migration。
3. 到 **Authentication → Sign In / Providers** 關閉「Allow new users to sign up」，避免有人自行註冊取得第一個老闆名額。
4. 等老闆信箱確認後，由管理員在 **Authentication → Users** 邀請老闆。**系統裡第一個帳號自動成為老闆**；不要先邀請開發者或測試帳號。
5. 其他人的角色（組長 lead、員工 worker、電視 viewer）由老闆在 `profiles` 資料表修改（之後會做成畫面）。

目前的雲端專案為 `factory-scheduler`（`https://kjnnguekhshkhgycmryl.supabase.co`）。
`0001`–`0008` 已於 2026-09-26 套用並核對：22 張資料表均啟用 RLS、9 張表加入即時推送。`0007`–`0008` 新增的加班星期與單日覆寫已在雲端驗證；舊員工設定轉換為 1 人每週不可加班、4 人每週可加班，工單與排程資料未刪除。
`db/seed.sql` 已匯入：5 位示範員工、5 台機台、3 種產品、6 張工單；排程方塊尚未建立。
`web/.env.local` 已設為雲端模式；尚需建立第一個老闆帳號，才能登入並實測即時同步。`me0608623@gmail.com` 是開發者聯絡信箱，不是老闆信箱，不可當作第一個應用程式帳號。關閉公開註冊須在 Supabase Dashboard 完成；此文件修改不會自動變更雲端設定。

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
- 填了 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`：**雲端模式**，要登入；老闆、組長能改，員工、電視只能看；別人的變更會即時更新。

### 員工加班意願

老闆可在員工資料設定**固定每週哪幾天可加班**。排程表的「開加班到 20:00／調整加班人員」會先顯示每位員工當天的預設，再由老闆或組長臨時改成「今天可加班」或「今天不加班」；單日覆寫不會改到其他星期的日期。確認後才套用並自動調整不再符合條件的排程。舊資料的「可以加班／不能加班」會分別轉成每天可加班／每天不可加班。已請假者仍不排工作。

### Excel 匯出與批次匯入

在畫面右上角按 **Excel**：

- **彩色排程 Excel（.xlsx）**：匯出目前選取日期，第一張「時間×機台」以 30 分鐘列出各機台工作，格子依員工顏色填色；第二張「排程明細」保留每段工作的精確起迄時間、數量和固定狀態。空白日也能匯出。
- **批次匯入範本（.xlsx）**：填寫「員工」「機台」「產品工序」「工單」四張工作表。代號須跨表對應，每項產品的工序從 1 連續編號；「填寫說明」的例子不會匯入。
- 範本的「不加班」目前代表每週都不可加班；「否」代表每週都可加班。匯入後可在員工資料細選固定星期。
- 老闆權限或本機模式可選取填好的檔案。系統先檢查格式、數值與跨表關聯並列出錯誤；按 **確認匯入並清空舊排程** 前不改資料。確認後，四類基本資料由 Excel **整批取代**，原排程方塊清空，上班日設定保留；請接著按「自動排程」。可用畫面上的「復原」撤回這次匯入。

匯入支援 `.xlsx`、檔案上限 5 MB、每張資料表最多 1000 列。請先匯出／備份原資料再進行整批取代。組長及唯讀帳號只能匯出，不能匯入。

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

## 5. 準備公開部署（平台待選）

`web/Dockerfile` 和 `solver/Dockerfile` 可分別部署到支援 Docker 的平台；兩個服務都需要公開 HTTPS 網址。
目前**只有部署檔，尚未部署或取得公開網址**，因此外部裝置仍不能使用。

1. **先部署排程服務**，以 `solver/` 為 Docker 建置目錄。平台須提供 `PORT`（沒提供時用 8080）。設定下列伺服器環境變數：

   | 變數 | 值 |
   |---|---|
   | `SUPABASE_URL` | `https://kjnnguekhshkhgycmryl.supabase.co` |
   | `SUPABASE_ANON_KEY` | Supabase 的 publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase 的 **service_role secret key**，只存在排程服務的私密環境變數 |
   | `SOLVER_DISABLE_SNAPSHOT_API` | `1`，公開部署必設；關閉不需登入的 `/plans`、`/solve` |
   | `ALLOWED_ORIGINS` | 正式前端的 `https://` 網址；多個用逗號隔開，不加結尾 `/` |

   不要在前端、Git、建置參數或公開文件中放 `SUPABASE_SERVICE_ROLE_KEY`。排程服務的 `/plans/db` 仍須使用者登入憑證，並檢查老闆／組長角色。部署後先確認 `https://排程服務網址/health` 回傳 `"database":true`。

2. **再部署前端**，以 `web/` 為 Docker 建置目錄。以下為**建置時**的公開參數，平台若區分 build args 和執行時環境變數，請填在 build args：

   | 變數 | 值 |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://kjnnguekhshkhgycmryl.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase 的 publishable key；可以出現在瀏覽器 |
   | `VITE_SOLVER_URL` | 第 1 步取得的排程服務公開 `https://` 網址，不加結尾 `/` |

   前端容器會使用平台提供的 `PORT`（沒提供時用 8080），提供單頁應用的重新整理路由和 `/health`。換了排程服務網址或 Supabase 專案，需要重建前端，不能只改容器執行時環境變數。不要設定 `VITE_SOLVER_API_KEY`：前端變數無法保密。

3. 到 Supabase **Authentication → URL Configuration**，把 Site URL 改成正式前端網址，Redirect URLs 加上 `https://正式前端網址/**`；可保留本機 `http://localhost:5173/**` 供開發使用。
4. **公開前先關閉自助註冊，等老闆信箱確定後再邀請第一個帳號**，核對 `profiles` 角色為 `boss`，再讓外部人員知道網址。開發者信箱不是老闆帳號。現有資料庫觸發器會把第一個註冊者設為老闆，因此這一步不可跳過。
5. 從手機行動網路或外部電腦登入正式網址，驗證示範資料、計算預覽顯示「OR-Tools」、套用與即時同步；再檢查 `POST /plans`、`POST /solve` 已回 403。

選定平台後還需建立兩個服務、設定 DNS／HTTPS 和環境變數，並做上述現場驗收。這些步驟尚未執行。

## 6. 每日備份

把專案放到 GitHub，在 **Settings → Secrets and variables → Actions** 新增 `SUPABASE_DB_URL`
（Supabase → Connect → **Session pooler** 的連線字串）。每天台灣時間 02:00 自動備份，保留 30 天。

還原：

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" factory-YYYYMMDD-HHMM.dump
```

## 注意

- 在某些 Windows 電腦上，「應用程式控制」會擋住 pandas 的 DLL。OR-Tools 只是順帶載入 pandas，沒有真的用到，所以 `solver/app/__init__.py` 在這種情況下會換成空殼，排程服務照常運作。Linux 伺服器上不受影響。
- 國定假日請每年依行政院人事行政總處公告更新 `holidays` 資料表。

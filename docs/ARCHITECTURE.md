# 產線排程系統：正式版架構

原則：**畫面用我們自己的，計算和基礎建設用開源的。**
原型（`index.html`）已經確認了操作方式；正式版把資料、計算、帳號、同步搬到伺服器上。

## 1. 整體架構

```mermaid
flowchart LR
  subgraph 使用者
    B[老闆／組長<br/>電腦、平板：可編輯]
    W[員工手機<br/>看自己的班表]
    TV[現場電視<br/>唯讀大螢幕]
  end
  subgraph 前端 web
    UI[排程看板<br/>沿用原型畫面]
  end
  subgraph Supabase（開源 Postgres 平台）
    DB[(PostgreSQL<br/>資料表＋稽核紀錄)]
    AUTH[帳號登入<br/>角色權限]
    RT[Realtime<br/>變更即時推送]
    RPC[資料庫函式<br/>apply_plan 套用方案]
  end
  subgraph 排程服務 solver（Python）
    API[FastAPI]
    ORT[Google OR-Tools<br/>CP-SAT 求解器]
    AI[AI 助理<br/>Claude API]
    XL[Excel／Google 試算表<br/>匯入匯出、同步]
  end
  B & W & TV --> UI
  UI -- 讀寫資料、訂閱變更 --> DB
  UI -- 登入 --> AUTH
  RT -- 有人套用方案就推送 --> UI
  UI -- 要方案（故障、請假、插單…） --> API
  API --> ORT
  API --> AI
  API --> XL
  API -- 讀資料、存預覽 --> DB
  UI -- 套用方案 --> RPC --> DB
```

一次「機台故障」的流程：

1. 組長在畫面按「突發狀況 → 機台故障」。
2. 前端呼叫 `POST /plans`，排程服務從資料庫讀出目前排程，用 OR-Tools 算出 3～4 種方案，存成一筆「預覽」。
3. 前端顯示預覽（原本 vs 調整後、跨日影響圖、每個人的變動）；可以按「問 AI」。
4. 按「套用」→ 資料庫函式 `apply_plan` 在**一個交易**裡換掉排程、寫入變更紀錄。若這期間別人已經改過排程（版本號不同），就拒絕並請使用者重新計算。
5. Realtime 把變更推到所有打開的畫面（電視、手機），畫面上出現「最新變更」。

## 2. 開源元件：別人做好的，放進我們的系統

| 用途 | 採用 | 授權 | 為什麼 |
|---|---|---|---|
| 排程計算 | **Google OR-Tools（CP-SAT）** | Apache 2.0 | 工廠排程（Job Shop）最常用的開源求解器，能同時考慮機台、人員、工序順序、日曆，並把「少動原本排程」寫進目標 |
| 資料庫、帳號、即時推送 | **Supabase**（PostgreSQL） | Apache 2.0／PostgreSQL | 一套就有資料庫、登入、權限（RLS）、即時推送、檔案儲存；也可以自己架 |
| API 服務 | **FastAPI** | MIT | Python 生態，和 OR-Tools 同一種語言 |
| Excel | **openpyxl**（伺服器）／**SheetJS**（瀏覽器） | MIT／Apache 2.0 | 讀寫 .xlsx |
| Google 試算表 | **gspread**（Google Sheets API） | MIT | 雙向同步 |
| 資料模型 | 參考 **frePPLe** 開源 APS 的概念 | — | 產品（item）、工序（operation）、資源（resource）、技能（skill）、日曆（calendar）、需求（demand）這套分法經過驗證，我們的資料表照這個方向設計 |
| 瀏覽器內備援演算法 | 派工規則（EDD、SPT、CR）＋模擬退火 | 學術通用方法 | 伺服器連不上時，畫面仍能用原型的演算法算出方案 |

## 3. 資料表

詳見 `db/migrations/`。主要資料表：

| 分類 | 資料表 | 說明 |
|---|---|---|
| 基本資料 | `employees`、`machines`、`employee_skills`、`products`、`product_steps`、`machine_products` | 員工、機台、誰會操作哪台、產品工序（標準公式）、機台有哪些模具 |
| 日曆 | `calendar_weekly`、`calendar_days`、`holidays` | 每週固定上班日、單日停工／加開／加班、國定假日 |
| 狀況 | `leaves`、`machine_faults` | 請假、機台故障（含故障前原本位置，恢復時用） |
| 工單 | `orders` | 數量、產品、最晚完成日、優先順序 |
| 排程 | `schedule_blocks`、`schedule_state` | 目前排程的每一段工作；`schedule_state.version` 用來防止兩人同時改 |
| 預覽與紀錄 | `plan_previews`、`change_sets` | 算好的方案（套用前）；每次套用的變更紀錄（總結、每個人的變動、AI 建議、備註） |
| 稽核 | `audit_log` | **每一筆資料的新增、修改、刪除都自動記下**：誰、什麼時候、改前、改後，屬於哪一次變更 |
| 帳號 | `profiles` | 使用者的角色、對應哪位員工 |
| 現場回報（第 2 階段） | `progress_reports` | 員工按開始、完成、做了幾件 |

## 4. 權限

| 動作 | 老闆 boss | 組長 lead | 員工 worker | 電視 viewer |
|---|:-:|:-:|:-:|:-:|
| 看排程、紀錄 | ✓ | ✓ | ✓ | ✓ |
| 報故障、登記請假、新增工單、套用方案、拖曳調整 | ✓ | ✓ | | |
| 改員工、機台、產品工序、上班日設定 | ✓ | | | |
| 管理帳號與角色 | ✓ | | | |
| 回報自己的進度、申請請假（第 2 階段） | ✓ | ✓ | ✓ | |

權限由資料庫的 Row Level Security 強制執行，不靠前端隱藏按鈕。

## 5. OR-Tools 排程模型

- **時間軸壓縮**：把每天的上班時段（08:00–12:00、13:00–17:00，開加班再加 17:00–20:00）接成一條連續的「工作時間軸」。一段工作在工作時間軸上是連續的，換算回真實時間時自動在午休、下班處切段，和原型的行為一致。
- **變數**：每張工單的每一站＝一個工作；每個可行的「機台＋人」組合是一個可選區間，恰好選一個。
- **硬性限制**：同一台機台、同一個人同時只做一件事；機台故障、員工請假時段不能排；不能加班的人不排加班與假日；前站做完（或做到可傳下站的件數）才開始下站；已經過去和手動固定的工作不動。
- **目標**（依方案調整權重）：
  1. 延誤時數 × 優先權重（特急 8、急 4、一般 2、不急 1）
  2. 完成時間（越早越好）
  3. **跟原本排程的差異**：開始時間移動多少、有沒有換人或換機台（「少動為主」的方案把這項權重調高）
- **方案**：少動為主、準時優先、開加班補回、不換人不換機（只調時間）；機台恢復時另有「搬回原位」。
- **時間限制**：每個方案最多算 5 秒，時間到就回傳目前最好的結果。

## 6. 備份

- Supabase 付費方案每天自動備份，可以還原到過去的時間點。
- 另外每天晚上用 GitHub Actions 跑 `pg_dump`，備份檔保留 30 天（`.github/workflows/nightly-backup.yml`），不依賴單一平台。
- 每季做一次還原演練。

## 7. 部署

| 元件 | 建議 | 備註 |
|---|---|---|
| 前端 | Vercel 或 Cloudflare Pages | 靜態網頁，免費方案即可 |
| 資料庫 | Supabase 雲端（新加坡區） | 之後要自架也可以，資料格式就是 PostgreSQL |
| 排程服務 | Google Cloud Run、Render 或 Fly.io（Docker） | OR-Tools 需要約 1GB 記憶體，計算時才用 CPU |
| 機密設定 | 環境變數 | Supabase service key、Anthropic API key、Google 服務帳號，**不放在前端** |

## 8. 階段

| 階段 | 內容 | 狀態 |
|---|---|---|
| 0 | 原型、與老闆確認操作方式 | 完成 |
| 1a | 資料庫結構、權限、稽核、備份 | 完成，36 項測試通過 |
| 1b | OR-Tools 排程服務＋測試 | 完成，11 項測試通過 |
| 1c | 前端改接資料庫與排程服務、登入、即時推送 | 前端已搬到 `web/`，本機模式接 OR-Tools 實測通過；Supabase 資料層用模擬資料庫測試通過，等真實專案接上 |
| 1d | AI 助理（解釋方案、口語指令）、Excel／Google 試算表 | 之後 |
| 2 | 現場回報進度、LINE 通知 | 之後 |

## 9. 需要準備的帳號

1. **Supabase**：建立專案，取得專案網址、anon key、service role key。
2. **Anthropic API key**：給 AI 助理用（放在排程服務的環境變數）。
3. **Google Cloud 服務帳號**（要同步 Google 試算表時才需要）。
4. **GitHub**：放程式碼、跑每日備份。

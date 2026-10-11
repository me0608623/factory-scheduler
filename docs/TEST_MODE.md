# 測試模式指南（?mode=test）

正式站用 `?mode=test` 進入**隔離的雲端測試環境**：連 staging Supabase（`fkefarcwadvyqqjcjxvp`）與 staging solver，資料與正式完全分開。目的：在真實雲端架構下驗收功能，而不碰正式資料。

## 安全設計（已內建，不需設定）

- **fail-closed**：`VITE_TEST_*` 任一未設或設錯，進入測試模式會顯示「測試環境尚未設定完成，已停止連線；不會使用正式資料」——絕不回退正式或本機資料
- **資料庫不可相同**：測試 URL 若等於正式 URL 直接拒絕連線
- **金鑰防呆**：`VITE_TEST_SUPABASE_ANON_KEY` 只能放 publishable key（`sb_publishable_…`）；放 `sb_secret_…` 或 service_role key 會被拒絕
- **session 隔離**：測試與正式的登入狀態存在不同 storageKey，可同時開兩個分頁各登各的
- **auth 信件導回**：測試模式註冊／忘記密碼的信件會帶回 `?mode=test`，不會把人帶進正式站（hash 憑證也會剝離）
- **solver 金鑰隔離**：測試模式只讀 `VITE_TEST_SOLVER_API_KEY`，絕不沿用正式金鑰

## 正式站啟用（Render）

在 Render 的 **web 服務**環境變數加入（staging 專案的值，Supabase Dashboard → 設定 → API）：

```
VITE_TEST_SUPABASE_URL=https://fkefarcwadvyqqjcjxvp.supabase.co
VITE_TEST_SUPABASE_ANON_KEY=<staging 的 publishable key>
VITE_TEST_SOLVER_URL=https://factory-scheduler-solver-staging.onrender.com
VITE_TEST_SOLVER_API_KEY=<staging solver 若有金鑰保護才需要>
```

存檔後 Render 會自動重新部署；首頁登入頁會出現「進入測試模式」按鈕。三個必要變數缺任一，按鈕不出現（與 fail-closed 同源判斷）。

## 本機開發啟用

在 `web/.env.local`（不進 git）放同樣四個變數，重跑 `npm run dev`，開 `http://localhost:5176/?mode=test`。

## 給測試環境種資料（可選）

CI（main 每次推送）會在 solver job 產出 artifact `isolated-cloud-test-seed`：含 `seed.json` 與 `seed.sql`——由 OR-Tools 驗證過的預排班表（12 員工／8 機台／20 工單）。要用時：

1. GitHub → Actions → 最新 Tests run → Artifacts 下載
2. Supabase staging Dashboard → SQL Editor 貼上 `seed.sql` 執行
3. 種子是 additive＋transactional：若已有測試資料會拒絕重置（保護你在測試環境的手動改動）

測試帳號：`me0608623+test-lead/-worker/-viewer@gmail.com`（詳 `docs/TEST_DATA_REPORT_2026-10-11.md`）。

## staging solver 冷啟動

Render 免費版閒置會休眠，第一次 health 檢查約 30–50 秒。測試模式已放寬：health 45s、排程計算 120s；等待期間畫面會顯示服務離線並暫以瀏覽器演算法備援，第二次呼叫起就是常駐速度。

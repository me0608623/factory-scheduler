# 欠缺品項新增儲存修復 — 2026-10-11

## 修復

- 新增列的 draft 未有 f1/f2，setPath 寫入 shipDate 時會拋 TypeError；建立缺少的父物件。
- 編輯先複製 draft，驗證失敗還原原資料列，保留使用者輸入以便修正。
- 數量不再默默四捨五入，非整數交由既有驗證拒絕。
- 儲存事件重新檢查權限；只在持久化成功回覆後顯示「已儲存」，失敗沿用同步錯誤與重試提示。

## 驗收

- 直接執行 app.js 的 setPath/saveTableForm，新增 5 項回歸測試：新增、無效新增、無效編輯、空白／權限、非同步成功／失敗。
- 本機全部前端 313 項通過；production build 通過，保留既有大 chunk 警告。
- 隔離 localhost:5193/?local=1：桌面新增、負數失敗保留輸入、修正後儲存、重新整理仍在；console error 0。
- 手機 390×844：二廠單邊資料新增與儲存成功。
- 介面強化 skill 僅影響錯誤與輸入保留；機械檢查未發現問題，無版面重設。
- 截圖：outputs/shortage-save-2026-10-11.png（本機測試資料，未寫入正式 Supabase）。

## 發佈門檻

PR 完整 CI 綠燈後才合併；Render web/solver 必須 live 且版本對應合併提交。
這次不含 SQL migration，不修改正式班表、不解除 setup_pending。
正式雲端新增／跨帳號同步不以本機測試冒充通過；本次沒有登入正式帳號寫入測試列。

## 已完成發佈

- PR #13 已合併：https://github.com/me0608623/factory-scheduler/pull/13
- 執行期提交：5d7d4ca3ad07a780c8a22c563afea1dd42dcce78。
- PR 與 main 同版本 CI 全綠：前端 313、資料庫 201、solver 168，跨層 A/B/C/D 與 Deployment smoke test 通過。
- main Tests run 38067988884；正式部署 workflow run 38067988889 成功。
- Render web dep-db56hq0473hc73a2cv2g、solver dep-db56hqbrjlhs73cjngt0 均 live，提交對應上述版本。
- 正式首頁 HTTP 200；JS /assets/index-DIBLqksn.js 與 Render 建置紀錄一致；CSS /assets/index-DZ6MXae5.css。
- solver /health：ok=true、database=true；正式瀏覽器登入頁載入正常，console error 0。
- 追加實测：既有列數量 10 改成 1.5 被拒；取消後仍為 10。
- 本文件之後的 docs-only 提交不觸發部署；線上執行期版本仍為 5d7d4ca。

# 過夜開發待辦清單

依優先級排序（P0 最高）。每項完成後打勾並記錄 commit。

## P2（重要改善）

- [x] 登入頁 backdrop/3D rAF 記憶體洩漏（→ `fc7a87f`）
- [ ] ~~檢查即時同步連線中斷恢復~~（Supabase client 自帶重連，非緊迫）

## P3（i18n / 品質）

- [x] 23 個 modal 標題翻譯（→ `0721cd8`）
- [x] 2 個三頁表格 action 標題翻譯（→ `6cd8afb`）
- [ ] ~29 個剩餘寫死中文 modal 標題（多為複合變數形式，投入產出比低）
- [ ] help modal 章節標籤翻譯（快速上手/看排程/拖曳調整等 10 個）
- [ ] 平面圖 canvas 內文字（當機器名含中文時無法翻譯——資料層問題）

## Phase 3（Solver 驗證）— 本機受限

- [ ] 在 CI 跑 Solver 回歸測試（pytest）— 需非 Windows 環境
- [ ] 驗證 CP-SAT 模型在邊界案例的行為（空工單、單工單、全部逾期）
- [ ] 效能基準（不同工單數量的解算時間）

## Phase 4（效能）

- [x] Bundle 分析（main 210K gz、three/excel lazy ✓）
- [ ] 檢查 render() 在大量排程方塊（500+）下的效能
- [ ] 檢查 localStorage 在本機模式大量資料下的限制

## 已確認安全（不需修復）

- 版本衝突（40001）處理鏈完整
- 權限矩陣（boss/lead/worker/viewer）邏輯正確
- 空資料狀態不崩潰
- null safety 全覆蓋（find() 均有 fallback）
- Solver 26 條驗證規則覆蓋完整
- 正式站健康（web 200/solver 200）

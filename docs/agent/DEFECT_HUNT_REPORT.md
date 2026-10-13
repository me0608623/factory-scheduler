# 缺陷探索系列總報告（輪 33–71，2026-10-12 ～ 10-14）

16 個缺陷全數修復、部署正式站並完成至少一次執行期覆核。測試從 web 390 / db 202 增至 **web 408 / db 211**，全綠。每項修復皆有回歸測試鎖住。

## 缺陷總表

| # | 缺陷 | 根因層 | 修復摘要 | 覆核 |
|---|------|--------|----------|------|
| 1 | 預覽導覽同目標重複堆疊 | 純邏輯 | navPush sameSel 去重 | 契約測試 |
| 2 | 加班日看板崩潰 | 渲染 | dayHTML 改用 di.otEnd | 輪44/69 執行期 |
| 3 | ot_ends 快照遺失 | 資料轉換 | fromSnapshot 讀回 ot_ends | 輪44 執行期 |
| 4 | 僅改 otEnd 無法儲存 | 儲存順序 | saveDailyOT 先讀 select | 輪69 執行期 |
| 5 | 假期矛盾死路 | 閘門修復後遺 | closeDaysPlanBad 前置檢查 | 輪70 執行期 |
| 6 | leaveq 提示口徑 | 文案 | futureOf 過濾＋預覽承諾 | 輪64 執行期 |
| 7 | 筆刷復原無效 | undo 順序 | pushUndo 移到變更前 | 契約測試＋輪35 |
| 8 | 權限管理無法儲存 | **DB 四層不一致** | 0037 遷移（白名單/CHECK/組長預設/寫入閘門 13→15 鍵） | 輪36/58 staging 雲端實證 |
| 9 | ＋班別靜默覆寫既有班 | 表單預設 | 預設改「新增班別」 | 輪61 執行期 |
| 10 | 本機聊天缺特別趕貨 | 前後端口徑不一 | 移植 solver 端 rush 事實投影＋關鍵字路由 | 輪63 執行期 |
| 11 | 聊天藥丸手機出畫面 | 浮動定位 | 安裝當下立即 positionPanel | 輪63 執行期 |
| 12 | 平面圖卡 322px 窄欄 | 標記結構 | page-top 正確關閉＋fullpage | 輪61 執行期 |
| 13 | 產能分析開成 LINE 通知 | switch 落穿 | analytics case 補 break＋主體歸位 | 輪61 執行期 |
| 14 | 本機反饋靜默失敗 | 閘門不一致 | feedback-send 補本機閘門 | 輪62 執行期* |
| 15 | 情境保存三處死路 | !PV 權限閘門 | canPermissionRaw 供情境四入口 | 輪63 執行期 |
| 16 | 兩顆死按鈕（ln-save/feedback-send） | **case 箭頭主體從未被呼叫** | 宣告 h 後 h(a)；棘輪掃描防同類 | 輪68 執行期＋補強 |

\* 輪48 初修寫在死箭頭內未生效（當時誤判為自動化不穩），輪62 抓出真因並更正——教訓已記錄：無 #toast 元素＝handler 未跑的可靠斷言。

## 額外成果（非缺陷編號）

- i18n 執行期掃描批次：13 字典鍵＋約 15 呼叫點補 tx＋**mdw 日期星期依語言**（64 呼叫點）＋factoryName 中央翻譯
- solver.js 零覆蓋→7 項單元測試；machine-layout 5 測試補回 npm test；machine-layout/permissions/模板往返等新測試
- 20 個功能入口首次執行期 E2E（週班表/工作內容/TV/備忘/主檔/分組/情境/三表/匯出/人員月曆/說明頁等），全數通過
- 並發安全屬性三次獨立 DB 真值實證（無 lost update、稽核鏈完整）

## 使用者待辦（三件）

1. **正式庫套用 0037**：GitHub Actions「套用資料庫 migration」→ `0037_permission_whitelist_complete.sql`（套用前正式站權限儲存仍是壞的）
2. **RENDER_STAGING_WEB_DEPLOY_HOOK**：設好後 staging web 一鍵更新（目前 staging 是輪 43 前版本）
3. **Realtime support ticket** 追蹤（平台故障，輪 59 已實證降級行為）

詳細過程見 `OVERNIGHT_PROGRESS.md` 輪 33–71 各段。

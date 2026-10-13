# 缺陷探索系列總報告（輪 33–122，2026-10-12 ～ 10-15）

**24 個缺陷全數修復**（前 18 個已部署正式站並完成至少一次執行期覆核；#19-#24 於輪 114-122 修復）。測試從 web 390 / db 202 增至 **web 424 / db 211 / solver 171**，全綠；模擬驗收 C1-C7 自 10-02 後首次回到 7/7 全綠。每項修復皆有回歸測試鎖住。

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
| 17 | solver 全案 INFEASIBLE（請假×假日 span 重疊） | solver 約束 | 合併員工不可用區間（同故障哲學）＋3 測試；模擬驗收 1/7→7/7 | 全綠 7/7（真實備份） |
| 18 | 備份 artifact 拾取兩層根因 | CI 命名空間＋分頁 | 排除加密檔＋分頁 20→100（含自我糾正×2） | 不指定 artifact 路徑 7/7 |
| 19 | 匯入範本範例自我矛盾（照抄即 2 錯誤） | 範本內容與解析器漂移 | 說明頁範例四表互相對應（技能 a,e＋補包裝機 e）；新增 import-template.test.mjs 3 測試鎖「範本↔解析器同步＋範例照抄零錯誤」 | 5180 頁面 origin fetch 200/16048B；npm test 411 綠 |
| 20 | 時間炸彈測試：supabase-store 硬編碼 2026-10-05~08 日期，schedule_snapshot 視窗（current_date-7 起）滾過後即爆紅（10-14 起爆、CI 下次必紅） | 測試資料日期寫死 | 全改相對日期 dayISO(n)（純函式往返測試除外）；本地 16/16 復綠 | 輪117 本地實證（10-14 當天兩測試紅→修後綠） |
| 21 | 筆刷範圍套用後 UI 與儲存不一致：commit 未 await 即 reloadFromStore，記憶體 S 被舊狀態覆蓋（資料其實有存，但 UI 看不到，且後續操作會把無該資料的 S 寫回＝資料遺失風險） | 同步佇列與重讀競態 | 筆刷套用分支改為 await commit(...) 完成後才 reload；棘輪測試鎖順序 | 輪118 live 實證：修前 UI 0 筆/儲存 1 筆分歧→修後即時一致；完整請假審核流 E2E 五步全過 |
| 22 | 產能分析「工單狀態」把已排程誤判為已完成（無回報全排程的 6 張示範工單顯示已完成 6，與工單抽屜「未做」矛盾） | 兩視圖口徑不一（分析頁用含計畫量的 effectiveBlockQty） | 分析頁改複用 orderStatus（完成需現場回報，單一事實來源）＋棘輪測試 | 輪121 live：修前已完成 6→修後 0 已完成/6 進行中 |
| 23 | ?view= 導航清掉整條 query，local=1/mode=test 遺失→重載落入登入牆 | replaceState 整梍 query 覆寫 | 新增 setUrlView()（只增刪 view 參數），9 處站點全換＋棘輪 | 輪121 live：board→analytics 導航 URL=local=1&view=analytics，重載保持本機模式 |
| 24 | 360px 手機頂欄橫向溢流（中文 375px 下列 378px、英文 381px；連線狀態簇英文再超 26px）——常見 Android 寬度即中 | 頂欄快捷列與狀態簇 flex 無 wrap | .page-links 與 .top-status 加 flex-wrap:wrap＋CSS 棘輪 | 輪122 live：360px 英文 scrollW=vw（修前 371 vs 345） |

\* 輪48 初修寫在死箭頭內未生效（當時誤判為自動化不穩），輪62 抓出真因並更正——教訓已記錄：無 #toast 元素＝handler 未跑的可靠斷言。

## 額外成果（非缺陷編號）

- i18n 執行期掃描批次：13 字典鍵＋約 15 呼叫點補 tx＋**mdw 日期星期依語言**（64 呼叫點）＋factoryName 中央翻譯
- solver.js 零覆蓋→7 項單元測試；machine-layout 5 測試補回 npm test；machine-layout/permissions/模板往返等新測試
- 20 個功能入口首次執行期 E2E（週班表/工作內容/TV/備忘/主檔/分組/情境/三表/匯出/人員月曆/說明頁等），全數通過
- 並發安全屬性三次獨立 DB 真值實證（無 lost update、稽核鏈完整）

## 使用者待辦（輪 100 更新）

1. ~~正式庫套用 0037~~ **✅ 已於 10-13 06:11 套用**（apply-migration run 38355345279，閘門全過；輪 81 查證）

1. **正式庫套用 0037**：GitHub Actions「套用資料庫 migration」→ `0037_permission_whitelist_complete.sql`（套用前正式站權限儲存仍是壞的）
2. **RENDER_STAGING_WEB_DEPLOY_HOOK**：設好後 staging web 一鍵更新（目前 staging 是輪 43 前版本）
3. **Realtime support ticket** 追蹤（平台故障，輪 59 已實證降級行為）

詳細過程見 `OVERNIGHT_PROGRESS.md` 輪 33–71 各段。

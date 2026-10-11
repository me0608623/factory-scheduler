# PR #15 互動式手動排班預覽：獨立驗收與正式發佈

## 範圍與環境

- PR：https://github.com/me0608623/factory-scheduler/pull/15。
- 原始提交：0ed55ab623d5891fc032ae81f3581ba55a6db35c；基準 main：784dea9。
- 原生 JS / Vite；既有 PV 預覽模式與 localStorage / Supabase 資料層。
- Agent 操作隔離 `http://127.0.0.1:5195/?local=1`，新 origin 的本機示範資料；沒有寫正式或 staging Supabase。
- 桌面 1440×900、手機尺寸 390×844 的 Chromium；不能冒充真機 Safari。
- 本次沒有 DB migration、密鑰或 Render 服務設定變更；使用既有 main CI 與部署關卡。

## 元件／路徑盤點

| 元件 | 事件／依賴 | 預期與狀態 | 驗收方式 |
|---|---|---|---|
| 拖曳、拉底邊、手動新增、修改時段 | dragPreview → enterManualPreview | 進入 PV，不寫班表 | 四入口佈線測試；拖曳、拉底邊與修改時段入口瀏覽器實測；新增入口本輪未單獨操作 |
| 原本／調整後／對照 | pv-mode → pvCtx | 選取保留；只有對照顯示原位 ghost | 瀏覽器＋執行函式測試 |
| 建議順延、連帶列表、交期列表 | dp-nav / preview-nav.js | 只讀詳情、高亮、定位；無 commit | 瀏覽器＋單元／佈線測試 |
| 各段定位 | dp-locate | 精確日期、機台、方塊與前後版本；跨廠切到目標廠 | 隔日具體段落瀏覽器實測；跨機／廠執行 handler 測試 |
| 返回、Escape、Browser Back | navBack / dpBack / popstate | 還原導航與捲動；根層取消不寫資料 | 瀏覽器＋導航／事件測試 |
| 預覽色塊 Enter／Space | keydown → pvClickBlock | 只讀詳情，禁止舊編輯彈窗 | 修前瀏覽器重現；修後 Enter 實測、Enter／Space 事件測試 |
| 確認套用 | pvApplyManual → applyManualPreview → acceptManualPreview → commit | 問題／唯讀／不適用拒絕；成功寫一次、失敗還原 | 正常套用／刷新瀏覽器實測；失敗／競態／保護執行函式測試 |
| 取消 | exitManualPreview | 班表不變 | 手機取消、桌面返回實測；事件測試 |
| 手機抽屜收合／展開 | pv-sheet | 班表與套用／取消可用 | 瀏覽器幾何、中心點命中、截圖 |

## 發現並修正的問題

1. Major：預覽色塊按 Enter 仍開舊編輯 modal，且顯示原班表的時間與修改控制。改走只讀詳情，Space 同路徑；自動預覽也不開編輯 modal。
2. Major：手機 PV 沒側欄卻保留 244px 左邊距，看板只剩約107px；底部抽屜遮住確認。移除預覽模式側欄空位，手動工具列縮小且黏頂、抽屜限60dvh，完整摘要留在抽屜。
3. Major：scrollIntoView 將目標移到抽屜後面。手機定位以工具列底與抽屜頂之間的可見區域為中心。
4. Major：安全檢核產生 applicable=false，套用 handler 卻只看 P.problems。補 applicable guard，確認核心重新檢查報工保護與人工工作驗證。
5. Major：各段定位只帶日期，同日多機或不同段仍定位第一塊。帶 date / machine / block id / orig-new mode，找指定實體方塊；跨廠能切到對應廠。
6. Minor：選中工序後，「調整後」仍顯示原位虛線。new 清除 ghosts，cmp 保留。
7. Minor：原因使用「同工單」寬鬆匹配，裁切詳情錯列沖壓、包裝的延後原因。只匹配工單＋工序；手動目標給明確手動調整說明。
8. Minor：返回未保存廠別、日週、對照模式、水平捲動，重繪後鍵盤焦點丟失。補快照與焦點保持；根層 Escape 可取消。
9. Minor：保留的 modal 套用成功沒有 ui.done，成功寫入後會丟 TypeError；驗證錯誤 close callback 也沒顯示原因。補成功 callback 與錯誤 toast。
10. Minor：延遲定位在取消後仍可能捲動普通班表。回呼核對同一 PV 實例後才執行。
11. Major：交期詳情仍加總原定數量，完工短少被蓋掉。重用既有純函式 effectiveBlockQty，以完工回報為準；進行中仍保留原定產能，不混淆兩者。完成日缺漏時改顯示無法比較，不宣稱日期不變。

## 已親測的關鍵流程

- A01 裁切 08:00–09:00 改成09:00–10:00 → 預覽 B02 裁切順延09:00–11:00到10:00–12:00，包含5道連帶工序。
- 預覽色塊 Enter → 詳情，沒有編輯 modal；焦點在返回鈕。
- 調整後：ghost數0、高亮1；對照恢復原位虛線；模式鈕保留焦點。
- B02 焊接隔日段定位 → 10/13 13:00–14:00，正確高亮實際段落。
- B02 交期詳情：原完成10/12、調整後10/13、晚1天但期限10/14仍準時。
- 手机取消／桌面 Browser Back：A01 仍08:00–09:00。
- 確認套用：A01 09:00–10:00、B02 10:00–12:00，顯示已存在這台電腦；重新整理再切10/12，結果仍在。
- 將 A01 沖壓移到前站未備妥的08:00 → 顯示原因、確認 disabled；取消保留15:20–16:00。
- 手機390px：無水平溢出、wrap左距0、套用／取消中心點可命中；選中色塊落在工具列與抽屜之間；收合／展開可用。
- 成功套用後 console error 0。
- 滑鼠拖曳36px：09:00–10:00 →09:30–10:30；拉底邊36px：09:00–10:30；兩者取消保留原09:00–10:00。

## 自動測試與限制

- 新增 preview-events.test.mjs，直接執行 app.js 事件／套用函式，不只檢查原始碼字串。
- 修前4項重現失敗；補測涵蓋原位虛線、鍵盤、安全診斷、成功／失敗儲存、過期方案、未解問題、各段定位、報工保護、連點、延遲取消、保險modal、手機捲動、Escape。
- preview-nav 增加完整快照還原與不誤用其他工序原因測試。
- 本機與最終 PR CI：前端364項、資料庫201項、solver168項通過，跨層整合通過。預覽專項38項（原21項＋新增17項）通過。
- 完工短少測試修前30件／預期20件失敗，修後採5件完工＋15件未完工產能＝20件；沒有把進行中3件誤當成這段最終产量。
- 本機 build 通過；既有大 chunk 警告仍存在，不在此 PR 拆包。
- UI偵測7項既有樣式警告保留；本 PR 新增的側邊粗色線改為1px框，不擴大改版。
- 網路斷線、雲端版本衝突與保護路徑以實際函式／既有資料層自動測試覆蓋；本次未操作正式登入帳號、多裝置同步或真機iPhone，不列為親測通過。
- 真機iPhone雙指捏合的使用者通過回報針對PR #14；不自動推定PR #15新抽屜與手勢組合全部通過。

## 發佈狀態

已於台灣時間2026-10-12完成合併與正式部署。

- 修正提交：a66f96c（介面與保護）、f97b2b7abaefc52860f19c71cd26611862fc57c5（報工數量）。
- 最終PR Tests 38153626082（PR）、38153621083（push）與冒煙測試均成功，才按預期head SHA合併。
- 正式執行期：4479cd10d3e95c9c67d73b4db55e8e883a65ba78；合併後與f97b2b7的web/db/solver內容一致。
- main Tests 38153844799、Deployment smoke test 38153844859、部署workflow 38153844797全部成功。
- Render前端dep-db5r7o59fdbs73dr7uag與solver dep-db5r7ofavr4c739pqpkg均live、提交相同；完成時間UTC16:06:14／16:06:18。
- 正式首頁HTTP200，assets/index-B79FZGKA.js與assets/index-Dm7lmUMZ.css；公開JS已包含pv-manual-drawer、精確段落定位與完成日期尚無法比較。
- solver /health：ok=true、database=true、OR-Tools9.15.6755。
- 部署時間起兩個服務error logs均0；跨region合併查log API被拒，已改各服務分開查。
- 正式瀏覽器目前未登入，登入頁console error 0；沒有把隔離本機的套用／刷新測試冒稱為正式雲端班表操作。
- 證據：outputs/pr15-mobile-qa-2026-10-11.jpg、outputs/pr15-desktop-qa-2026-10-11.jpg、outputs/pr15-production-login-2026-10-12.jpg（本機交付附件，不含帳號密碼）。
- 測試分頁關閉，僅停止本任務啟動的5195伺服器；其他既有dev server未動。
- 後續僅文件提交，不需重部署；本文件記錄的線上執行期仍4479cd1。

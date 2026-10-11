# PR #14 縮放驗收與發佈紀錄

## 範圍與決策

- 本機 feat/schedule-zoom、隔離 localhost:5194/?local=1；正式版本發佈到既有 Render，不新增服務或費用。
- 技術棧：Vite / 原生 JS、localStorage 與 Supabase 資料層；後端 Python / OR-Tools。
- 日／週僅經工具列「整週／詳細」、更多內「日班表／週班表」及點日期切換。倍率門檻不自動切視圖。
- 縮放只改裝置顯示偏好，不改排程、不寫正式 Supabase、不含 SQL migration。

## 互動盤點

| 元件／路徑 | 前端事件與預期 | 依賴／副作用 | 驗收 |
|---|---|---|---|
| − / ＋ / 100% | sz-out/in/reset → applyZoom；30%～250% | szoom.setZoom → localStorage，render，無 API | 桌面、手機、Enter、上限下限、焦點保持通過 |
| 滾輪縮放開關 | sz-wheeltoggle；off 還原捲動（含 Ctrl），pressed 正確 | localStorage，取消 pending wheel | 瀏覽器一般滾輪 off/on、事件 Ctrl/off 通過 |
| 表內垂直滾輪 | rAF 合併、只改倍率、錨點補償在 render 後 | 縮放 guard：modal、drag、pinch、水平／零增量 | 125%→140% 實測；guard 自動測試通過 |
| 整週／詳細 | sz-fitweek/day；七天可見、日期／廠別不變 | wkFit，render；不寫班表 | 手機 390×844 七欄、點 10/12 回日、桌面 1440×900 通過 |
| 每日欄頭／儲存格 | goto → 所選日期日表 | 完整日期 aria-label；fit 顯示日號 | 手機 12～18 日、完整讀屏名稱可對上 |
| 雙指開始／移動／結束／取消 | Touch Events，rAF 最新座標，取消舊工作 | 取消進行中的 drag，不提交，touchcancel 清狀態 | 事件函式測試通過；瀏覽器合成觸控不支援；真機未驗證 |
| 拖曳／拉底邊 | scaled hour 與畫面座標一致，放開先預覽 | 原有排班預覽，不自動套用 | 125%：45px→30分鐘，預覽取消原表不變；拉底邊見最終補充 |
| 一般人工工作 | workGridHTML 使用相同 --hour / hourPx | 僅幾何、無寫入 | 執行渲染函式的自動測試通過；空內容瀏覽器未實際拖曳 |
| 刷新／日週倍率／全站縮放 | 本機倍率持久化，與 UI.zoom 分離 | 獨立 fsched-schedzoom-v1 | 刷新250%保留；既有設定測試回歸 |

## 已修問題

1. Major：錨點在 render 前調整，而且把整頁上方內容也當成倍率縮放；改在 render 後依同一機台／週格的實際幾何補償。
2. Major：一般人工工作 block 用縮放 H，時間格線仍是原比例；補一致的 --hour，日表也不再四捨五入 --hour 造成高度漂移。
3. Major：雙指開始沒有撤回已有拖曳、touchcancel 沒清狀態，取消後 rAF 仍可套用；加入拖曳清理、取消、視圖／modal guards。
4. Major：滾輪關閉仍攔 Ctrl、零增量會縮小，拖曳期間可重新 render；修正 guards。
5. Major：整週 fit 縮放後仍強制 min-width:0，放大不展開；新縮放離開 fit；七欄以可用寬平均分配。
6. Major：手機整週日期截成全部「10」；fit 模式改顯示日號、完整日期 aria-label。工具列可換行且按鈕至少44px。
7. Minor：rAF 取第一筆而不是最新座標；改 latest args，加入 generation 防止取消舊框吞掉新手勢。
8. Minor：NaN 可污染縮放倍率；clampZ 非有限值回1。
9. Minor：重繪丟失工具列鍵盤焦點、＋／−缺明確名稱；補焦點保持與 aria-label。

## 測試與證據

- 先新增測試重現 NaN 與 rAF 舊座標問題（修前失敗），再修正。
- 13 項縮放專項測試通過（PR原6項＋7項）；事件測試直接執行 app.js 的手勢 handlers，不僅檢查字串。
- 本機全部前端 326 項通過、build 通過；保留既有大 chunk 警告。
- 手機七欄 scrollWidth=clientWidth=357；桌面縮放 125% 的 hour=90px，17 個 block 不變。
- 縮小30%與放大250%仍為「排程表」；date=2026-10-12。刷新保留倍率。
- console error 0；未寫入正式 Supabase。UI強化 skill 只影響輸入／手勢防護、焦點與工具列可用性。
- 機械偵測僅既有 CSS 風格警告（188/280/415/588/820/928 行），未擴大改版。
- 證據：outputs/pr14-mobile-week-2026-10-11.png、最終桌面 screenshot。

## 未驗證與限制（不能宣稱通過）

- 真機 iPhone Safari：沒有連接 iPhone；瀏覽器工具也拒絕 Input.dispatchTouchEvent。
- 真機需再點：雙指開始在工作方塊上、單指拖曳途中加入第二指、手勢取消／旋轉／背景切換、原生頁面縮放與觸控板、抬起一指後不誤開工作彈窗。
- 可用替代路徑：手機與桌面已實測的工具列縮放／整週／詳細。
- 正式瀏覽器未登入：不以本機測試冒充正式資料新增、跨帳號同步／各角色登入驗收；本 PR 無 API／schema 變動。
- 390px 的既有主頁 header 尚有約3px overflow（縮放工具列已完整可見），非本 PR 新增，保留為 Minor。

## 發佈門檻

PR CI 全綠後才合併。main 同提交測試綠燈觸發現有部署 workflow，核對 Render web/solver live 與公開 asset/health。

## 最終補充驗收

- 桌面1440×900：整週 scrollWidth=clientWidth=1147；點放大後離開 fit，但維持週視圖，日期仍2026-10-12。
- 125% 拉底邊45px：08:00–09:00 正確預覽為08:00–09:30；取消後原08:00–09:00工作仍在。
- 桌面縮放按鈕維持鍵盤焦點；Enter 放大生效。手機工具列44px以上、換行後所有按鈕可見。
- 整週模式標示「整週」，避免固定30%被誤認為實際自適應欄寬比例。
- 單元與瀏覽器的已驗證項目滿足此次合併門檻；iPhone原生手勢仍明確保留「未驗證」，工具列為已測替代入口。

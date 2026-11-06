# 排程助理展開遮擋修正

2026-10-25，修正與驗證紀錄納入既有 [PR #50](https://github.com/me0608623/factory-scheduler/pull/50)，尚未合併或部署。助理展開後在頁面中占位，班表接在面板下方。收合後，手機首屏仍顯示實際班次與手動、自動排班入口。

前輪只將助理入口移入正常排列，`.chat-panel` 仍採固定定位。這次用測試資料庫完整 SIM 快照重現，桌面與手機各量到 3 處面板與班表元素重疊。

`styles.css` 移除面板固定定位、手機底邊與浮層層級，讓展開的聊天室占滿既有容器。面板採自然高度，只有對話紀錄區限高並獨立捲動。沒有增加 JavaScript 狀態或改動掛載、權限、資料存取與求解邏輯。導覽同步改為描述目前操作，並更新英文、越南文、泰文翻譯。移除要求舊固定浮窗尺寸的過時測試，遮擋改由實際瀏覽器矩形交集驗證。

pstack 的 Fix Root Causes 原則使修正集中在造成遮擋的固定定位。Model the Domain 原則使實作沿用既有的 `aria-expanded` 與 `hidden` 狀態。Prove It Works 原則要求在實際 SIM 畫面量測交集，單元測試與建置不能代替版面驗證。

## 驗證結果

- 實際快照版本 26 包含 2,011 張工單、4,100 段排班。畫面使用 2026-10-25 的 5 張 SIM 工單、10 段排班，沒有重寫日期或建立合成排班。
- 1440×900、740×900、390×844、360×740、360×420 均為零班表重疊、零面板內控制項裁切。矮螢幕可經頁面捲動到達全部控制項，並逐一通過中心點命中檢查。
- 將既有 10 段 SIM 排班清單載入本機測試對話區，另驗證長內容。三種尺寸均零遮擋。手機紀錄區由 scrollTop 0 捲至 606，頁面 scrollY 維持 384，證明對話區獨立捲動。這個檢查沒有呼叫 AI 服務。
- 切換日期後仍保留草稿、展開狀態與單一聊天室節點。Escape 關閉後焦點回到助理入口。
- 週總覽、按工作檢視與桌面收合導覽通過。助理展開時，手動與自動入口可開啟對應視窗，沒有送出、儲存或求解。
- 360×740 收合首屏的 SIM 班次卡位於 y=565.83–629.83，底部導覽起點為 y=662。兩個排班按鈕也在首屏。
- 82 項相關非資料庫測試通過，包含聊天掛載、草稿焦點、翻譯、導覽、版面、手機操作、測試模式隔離與雲端讀取防護。建置通過，保留既有大 chunk 提示。
- 獨立審查發現並修正導覽翻譯遺漏；最終四個程式與測試檔案未有待修正發現。註解審查無刪除或未處理項目。

回歸指令在 `web` 目錄執行，沒有載入 migration。

```powershell
node --test tests/chat.test.mjs tests/chat-ledgers.test.mjs tests/chat-drawer.test.mjs tests/chat-mount.test.mjs tests/chat-render-focus.test.mjs tests/chat-retranslate.test.mjs tests/layout-regression.test.mjs tests/preview-mobile-actions.test.mjs tests/test-mode-schedule.test.mjs tests/runtime-config.test.mjs tests/cloud-load-safety.test.mjs tests/tour.test.mjs
npm.cmd run build
```

本機唯讀預覽為 `http://localhost:5173/.audit/real-sim-ui-qa.html?mode=test`。完整快照與測試頁保留在未追蹤的 `web/.audit/`，未加入公開來源。證據位於本機 `C:/Users/me060/Downloads/Factory-Scheduler-assistant-P1-20261025/`，包含前後截圖、`before.json`、`after-matrix.json`、`long-content-checks.json`、`interaction-checks.json`、`additional-views.json` 及測試與建置日誌。

本輪使用完整實際 SIM 快照的本機唯讀 UI，沒有雲端 session。手機驗證是瀏覽器尺寸測試，未操作實體 iPhone 或原生鍵盤，也未驗證 AI 服務端到端。原快照 SHA256 保持 `595439DEF53C16F29F4502A3DCFD532E55D1FCD9DD05191769A4F29007F161E8`。

本次提交包含助理版面、導覽與翻譯、過時測試移除，以及本紀錄與 handoff。沒有存取或修改正式 1023，沒有資料庫操作、migration、合併或部署。無關的未提交素材保留在本機，完整快照、驗證頁與原始日誌均未加入提交。

## PR CI 與審查追蹤（2026-10-26）

2026-10-26 10:21（Asia/Taipei）使用 pstack Babysit 的 `check` 模式檢查 PR #50，執行官方 `watch-pr --owner me0608623 --repo factory-scheduler --pr 50 --status-only`。Origin CLI 不存在，因此使用 GitHub CLI。查驗的遠端與本機提交皆為 `24071da98c7589f4b4761139f1d281d63518ee7e`。

同一提交的 4 次工作流程全部成功，共 10 項檢查。每個事件分別有 Tests 的 frontend、database、solver，以及 Deployment smoke test 的 web、solver；push 與 pull_request 各執行一次。

| 事件 | Tests | Deployment smoke test |
| --- | --- | --- |
| pull_request | [40169446809：成功](https://github.com/me0608623/factory-scheduler/actions/runs/40169446809) | [40169446835：成功](https://github.com/me0608623/factory-scheduler/actions/runs/40169446835) |
| push | [40169444167：成功](https://github.com/me0608623/factory-scheduler/actions/runs/40169444167) | [40169444170：成功](https://github.com/me0608623/factory-scheduler/actions/runs/40169444170) |

watcher 回報 `ci-clean`、零失敗、零待執行、零審查討論，GitHub 狀態為 `MERGEABLE` / `CLEAN`。另讀取 GitHub reviews、一般留言與行內留言，三者皆為空；沒有正在執行的審查自動化。這表示目前沒有已提交的 GitHub 審查意見，不代表已取得人工核准。前輪本機獨立審查結果仍見上方紀錄。

PR 維持 `OPEN`、未合併，`autoMergeRequest` 為 `null`。本輪只讀取既有 CI 結果，沒有重新觸發 CI、執行測試或 migration，也沒有存取正式 1023 或操作部署。Deployment smoke test 是 CI 容器測試，並非部署。因沒有失敗或待處理審查意見，本輪沒有程式修正，只更新本紀錄與 handoff；先前 SIM 瀏覽器驗證沒有重跑。

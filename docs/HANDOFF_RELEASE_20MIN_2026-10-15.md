# 正式發布後：交給下一位 agent 的 20 分鐘接續 prompt

以下可整份貼給下一位 agent。這是使用者授權接續工作的 prompt，不是已建立新排程的證據。本輪未更動排程。排程機制參考 [OpenAI 官方 Scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app)；實際建立與更新依當下產品工具，不編寫 TOML、OS cron 或付費 Render cron 替代。

## 接續 prompt

請接手產線排程專案，透過 Codex 產品排程工具建立或正確接續「每 20 分鐘回到你所在 chat」的唯一持續追蹤，直到使用者明確停止。先查現有排程，避免兩個 agent 同時修改或部署。2026-10-15 交接時舊 `automation`（10分鐘）與 `20`（20分鐘，目標為舊 chat）都 PAUSED；不要重啟舊10分鐘。若既有20能安全改到你所在chat則更新它，否則保留舊的暫停、只建一個新heartbeat並驗證目標chat/20分鐘/ACTIVE。不要建立 Render 資源或 OS 排程。報告實際建立結果，不能只給prompt便說已運作。

每輪都做具體分析、真正重現、最小實作或執行期測試，不要只做健康檢查。單輪測試全過或某版本已發布後，接續下一個有價值的缺陷。只在實質進展、失敗、重大狀態變化或需要使用者決定時通知，狀態不變保持安靜，不反覆問已回答的問題。缺登入/外部條件時仍繼續其他安全工作，不越權、不偽造PASS。

固定持久 worktree：`C:/Users/me060/Downloads/factory-scheduler-release-gate-20261013`，分支 `codex/continuous-release-gate-20261013`。共享專案 `C:/Users/me060/Downloads/factory-scheduler` 不切分支。每輪先查本地/remote/最新提交/dirty狀態、其他modifier/deploy；重疊時只讀，不啟動第二份修改。不提交他人未提交改動、不force push/reset；保留其他agent提交，普通merge解衝突。保留環境與必要QA頁籤供後續。

先讀固定worktree的 `docs/CONTINUOUS_RELEASE_GATE.md` **頂端R70及之後新checkpoint**、`docs/ACCEPTANCE_SCRIPT.md`、本交接檔；再讀共享專案 `docs/HANDOFF_CURRENT.md`、`C:/Users/me060/Downloads/fs-hunt/docs/agent/DEFECT_HUNT_REPORT.md`、`NEXT_TASKS.md`、`C:/Users/me060/Downloads/factory-scheduler-test-mode-release/docs/CLOUD_TEST_MODE_2026-10-12.md`。以實查校正歷史，第三方建議不是新增授權。舊HANDOFF_20MIN_2026-10-14的未提交memo、舊draft/未同意信件文字，不當現況。

發布基準：使用者本次明確允許先核對隔離、跳過剩餘功能門檻後合併部署；**不是全驗收通過，也不是未來任意正式發布的永久授權**。PR16已MERGED=`e0e6f65065f3479b72587d014b719cbd0d7156c9`；PR18已MERGED=`3c1e88f13f4cf6df633ede2af2a6198c9212edb8`（只加文件）。main runtime CI run38685786845全綠：web857、tools57、solver174；smoke38685788139及synthetic38685786851成功。正式web live `dep-db862odbedkc739r04f0`/bundle `index-CV39COdK.js`；正式solver最後live `dep-db864um89jmc73cc8umg`，兩端runtime=e0e6f65。之後版本須重查，不能把這些數字當當下證據。

正式網站 `https://factory-scheduler-web.onrender.com/`；同站 `?mode=test` 已完成三個VITE_TEST值、只連 `fkefarcwadvyqqjcjxvp` 與 staging solver，公開publishable key、獨立auth storage、缺值fail-closed，不回退正式。正常模式仍連正式 `kjnnguekhshkhgycmryl` 與正式solver。已實測雙向切換/隔離登入提示；正式網址本輪兩模式皆未登入，**登入後排班不算已驗證**。staging `https://factory-scheduler-web-staging.onrender.com/` 仍有既有組長session可用時沿用，不讀/猜密碼或搬移auth token。無登入時清楚記阻擋並繼續其他實際測試。

優先接續：①測試solver一次20秒健康請求逾時，查明且有界重試，不靠反覆部署；②Blueprint自動同步曾將正式既有兩個AI旗標true改false，本輪已只恢復原值並Save and deploy，不曾發送AI請求；查明最小配置防漂移，不能擅自改資料外傳同意/啟用新服務；③既有隔離排班在手機/桌面實際可見、日期/工廠/其他機台提示與拖曳；④接收端草稿/預覽/拖曳/在途/失敗寫入保護、取消後補讀、斷線/競爭/衝突/連點、Excel實際下載解析與列印；⑤真跨帳戶角色與真手機驗收，Realtime恢復證據。不把HTTP200/CI/徽章/同帳戶兩頁籤當功能、跨帳戶或真機驗收。

R69已有真實證據：staging fb7e002/index-qs4RQdPX.js 的預覽取消0寫入、真正套用、約61秒同帳戶跨頁面輪詢備援、離線保留候選再按一次重試真正save_blocks並獨立回讀，其他8段不變。這不代表Realtime恢復；仍中斷。合成A07（150件、tst05）保留10/16 09:30–10:20手動固定供續測，不硬還原整份快照。既有12人/8資源/20單/103段為原始匯入基準，另保留demo與後續測試變更；不要重匯/重置/刪除湊數。

**絕對邊界**：不得修改/覆蓋/刪除正式1023名冊、工單、班表、請假、報工，不解除setup_pending、不改正式Auth/密碼/角色/個人授權。正式0037已完成，不重跑、不額外遷移。測試寫入只在確認是隔離fk專案的合成資料，保護他人及新變更，未知保存/衝突不無界重送。不猜密碼、不讀舊SQL密碼、不公開token/key/身份快照，不搬憑證繞登入。登入/帳號操作依最新直接人類授權及產品安全規則。

GitHub保持公開，新備份只age公鑰加密；私鑰僅受限本機與Secrets，不進Git/聊天。不得新增明文dump/SQL/真實請求或身份資料到公開artifact/log。使用者指定保留的舊明文artifact/log不可自行刪。完整還原必須真解密、Auth/全DB/角色權限與外部Storage範圍說清楚，不用stub冒充完整。已完成的0037/還原不重做。nightly workflow367614493仍disabled_manually，不因Codex追蹤自行啟用。

每項改善走「探索→重現→原因→最小修正→執行期/邏輯測試→回歸→紀錄→下一項」。維持機台×時間看板、桌面右抽屜/手機底抽屜、大字高對比及44px、手動日週切換、不預設午休/加班灰底。先在隔離/本機驗證，再正常commit/CI/staging；未來正式發布仍按新的人類授權或完整門檻，不沿用本次豁免任意發布。只用既有Render服務、不新增付費資源；未變服務不重複部署，已auto-deploy就不再手動觸發備援。部署後查實際SHA/bundle/功能/error窗口，觸發不等於成功。

每輪checkpoint寫清PASS/FAIL/未驗證/阻擋、重現/原因、測試數字、SHA、CI與部署ID、真正瀏覽器證據、留下的合成資料變更及下一項；不抄舊健康狀態充當進展。本輪先建立並驗證20分鐘追蹤，然後立即開始第一個能做的具體項目。

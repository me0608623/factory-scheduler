# 持續缺陷探索與發布驗收

## 授權與排程

- 使用者於2026-10-13授權：依序修復備份搜尋／模擬驗收、更新測試環境與登入權限同步驗收、確認備份後套用正式0037、全部發布門檻通過後合併PR #16並部署。
- 正式1023名冊、工單、班表、報工、請假與待核對限制不改；只允許上述0037 schema／權限函式遷移，不改個人授權或帳號角色。
- Codex本對話追蹤 `automation` 已更新並核對ACTIVE，每10分鐘接續。完成目前發布目標後仍繼續缺陷與介面功能改善，直到使用者主動停止；不可自行結案停用。這不是新增Render付費cron服務。
- 本機排程需要電腦開機、桌面app執行；服務限制、登入失效或工具權限可阻礙某個項目，不能假裝全天候無條件成功。
- 持久隔離worktree：`C:/Users/me060/Downloads/factory-scheduler-release-gate-20261013`；分支`codex/continuous-release-gate-20261013`。不要修改另一agent的`fs-hunt`或切換共享main。重疊執行不並行寫入／部署。

## 已查證的起點

- 基底main `5760a1e`。最新模擬驗收run `38347155112`是下載備份階段失敗（找不到artifact），尚未執行solver。
- workflow只查artifacts前20筆；實際有未過期備份`11786241413`（`db-backup-38338799281`），所以不能把這次紅燈當成INFEASIBLE重現。
- 先前batch=60實驗已還原；新main含「副本清空transfer_orders」實驗，但其求解結果尚待下載修好後確認。不要直接把猜測當根因或放寬正式排程規則。
- 測試資料已於2026-10-12實際匯入獨立Supabase：12人8資源20工單103段；保留5示範員工23段。不要重匯／重置。
- 本追蹤先前已更新兩個staging Render服務至cdfc40c，後续agent有更多修復需再核對版本。
- PR #16 head f93cc6b仍draft且CI綠；尚未配置正式Render VITE_TEST_*、兩端Realtime未驗收。需先merge最新main重跑，不只靠可合併狀態判定通過。
- 另一agent稱staging已有0037，並有老闆session；須本輪實際查證，不猜密碼、不讀／展示SQL片段中的密碼。
- 報告有10-14未來日期，但本機Git提交與目前客戶端日期為10-13。後續記錄以實際執行時間與run/commit證據為準。

## 本輪工作

- `tools/backup-artifact.mjs`：分頁搜尋所有有界頁面、選最新未過期db-backup，指定ID核對類型與期限，HTTP錯誤及ZIP內容驗證，憑證不輸出。
- 7項可執行mock-HTTP回歸通過：第二頁備份、過期／錯誤類型、指定ID、非法ID/URL注入、API錯誤、分頁上限、ZIP內容／下載失敗。
- acceptance-sim改用此模組並先跑其測試；Tests增加tools及工作流變更觸發與工具測試，後續需CI及真實副本模擬驗收。
- 新發現：apply-migration只查前5 artifacts、備份過舊只警告而未拒絕，且未下載／還原，實際比文件承諾弱；在套用0037前必須補足備份與atomicity關卡，不能沿用此弱驗收。

## 下一步

### 本輪後續證據與安全阻礙

- 備份搜尋修正後固定artifact11786241413已真正還原並跑到solver（run38349015940），仍6案INFEASIBLE；非下載階段假紅。
- 新增兩個最小回歸在修改model前的run38349491204真的失敗（unused員工的假日請假＋禁加班、重複請假），均INFEASIBLE。第三個真工作重疊測試初版誤用contentId而非workId，已更正，不能把該fixture錯誤當產品缺陷。
- 真因：員工calendar不可用區間被重複加入Cumulative，重疊兩個滿額ban會讓整個模型無解，包括未參與任何工作的人。只合併calendar bans，真實人工工作保持獨立占用，重疊仍INFEASIBLE。
- 同備份run38349834149已過C1/C2/C3/C4/C6/C7；安全摘要查到2位假日請假重疊員工，支持原先全案無解根因。其C5已非INFEASIBLE而是OPTIMAL但新單逾期不可套用。
- C5與早已存在的test_edges.py新單逾期保護不一致；修驗收以同時要求完整可行晚單、獨立validator零issue、逾期診斷、DB拒絕套用及版本／資料不變。沒有放寬產品保護。中間run38350130770的C5驗收用錯opt.blocks格式（DB格式，不是Snapshot格式），1073f92已修，等待重跑。
- e903911的Tests run38350130228全綠；solver **171 passed**（含3新calendar測試）；tools **11/11**本機通過。最新head重跑結果仍需核對。
- PR #18為本輪修復draft；未合併、未正式部署。PR #16仍未合併。
- GitHub repo公開（isPrivate=false）。既有未加密public-schema dump不是完整專案備份；日誌曾含真員工姓名與source_ref，已在本分支換成白名單safeSummary／匿名solver人名；與另一agent同步main時新增的原始request dump也已移除。沒有刪除既有artifact／log，需使用者決定保護方式。
- 已詢問使用者選「改私有」或「保留公開但加密備份」；答覆前不新增未加密備份、不套正式0037、不改倉庫可見性。automation prompt已補此關卡，仍ACTIVE。
- 本輪新開staging網站可直接載入既有`qa-lead@factory-scheduler.test` session，角色組長，測試資源tst01–tst08可見；未讀／猜任何密碼。完整跨帳號Realtime仍未驗收。
- 另一agent仍更新main（11285ea）；本分支以普通merge保留其副本隔離調整與紀錄，不force push，不改其工作區。既有原始敏感dump屬本輪安全修復範圍，不再保留到本分支發布。

1. 推此獨立分支，CI綠後用同一備份11786241413、週一2026-10-12跑C1–C7。未全過則讀精簡診斷，最小重現找原因，不偷偷修改案例期待值。
2. 確認staging現有session與0037、新版web/solver、Realtime；測試資料／權限、衝突、斷線与實際兩端更新。
3. 與PR #16整合；必要修復皆測試後保留PR待發布門檻，不讓其他agent的新提交被覆蓋。
4. 正式0037前另做新鮮備份與還原演練、核對project ref與資料指紋、single-transaction遷移及遷移後資料指紋相同。任何關卡失敗不得套用。

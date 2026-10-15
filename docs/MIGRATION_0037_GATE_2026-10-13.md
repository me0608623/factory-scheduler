# 正式0037安全關卡與套用證據

## 已完成（2026-10-13台灣時間）

- 唯一授權 migration：`0037_permission_whitelist_complete.sql`。正規化LF後SHA256 `ab98a089c564ffd19a8d05dad96023b57811f45fcf911371167128c49e717b4f`；檔名或內容不同即拒絕，不以workflow input插入shell／SQL。
- 備份 artifact11791661615／run38352489633：24小時內完整加密DB，下載密文hash與還原收據必須一致。
- 完整Supabase PG17還原及0037副本演練 run **38354811296** 成功；收據 artifact11792422005，只有無個資metadata（backup ID／密文SHA／版本／完成旗標），沒有明文dump、SQL或資料快照。
- 同runtime SHA **2cde149d381d6988477fa7d3b9339ce26375e69e** 的Tests run38354810746全通過（web/database/cross-layer/solver）。關卡要求本SHA Tests完成且成功，演練SHA也必須為目前Git祖先。
- 純關卡驗收 run **38355195539** 成功，`apply=false`，未連正式DB。
- 正式run **38355345279** 成功，`apply=true`，2026-10-13 **06:11:59Z / 14:11:59台灣時間** 已確認提交。沒有部署正式web/solver、沒有個人角色／授權資料寫入。

## 真正資料不變與原子性

- `psql -X --single-transaction -v ON_ERROR_STOP=1` 包含before guard → 唯一審核0037 → after guard；不是先改完再比資料。
- 所有public普通／分區表、Auth users/identities的筆數＋逐行SHA256排序集合；Postgres角色、RLS policies、public序列也納入比較。指紋只放同交易TEMP表，不印出、不上傳。
- public表短暫SHARE鎖防別人在檢核中寫入；auth僅ACCESS SHARE避免要求更新Auth權限，若外部Auth同時更新造成差異則安全拒絕整筆。lock_timeout5秒、statement_timeout60秒，不能無界擋現場寫入。
- 前後不一致或權限行為未符合lead的rush/worklog、worker拒絕、master未授予等期待，交易直接失敗。沒有自動還原正式dump、沒有先重設或刪資料。
- pg_temp helper與TEMP snapshot不持久化；成功提交只留下原始0037允許的函式／CHECK變更。

## 實際測試

- 工具26/26：過期／未加密／錯專案／錯備份／錯SHA／錯workflow／失敗run／非完整或stub收據／缺演練／改過0037／錯DBURL全部拒絕。
- PGlite真SQL（全部migration至0036＋合成名冊）：同筆數改姓名、改setup_pending、改profiles角色、改Auth email、DDL後故意SQL錯誤均被拒絕且回滾；正確0037通過，資料／版本不變。沒有用源碼字串斷言冒充執行。
- 真Supabase相容PG17完整備份副本：實际還原＋guarded0037＋after guard通過，再到正式同份審核SQL提交；正式程序同樣通過before/after guard。

## 尚未完成／限制

- 這證明migration原子性與原資料不變，不是正式老闆登入後修改個人授權的UI驗收；本任務禁止額外修改正式個人授權。
- PR16仍draft；跨帳號／手機桌面Realtime、排程實際套用／衝突仍須在指定隔離Supabase驗收。
- 新夜間加密workflow尚待安全合併main後重新啟用；舊明文artifact按使用者選擇保留，不刪。

原子性與鎖語義參考：[PostgreSQL psql](https://www.postgresql.org/docs/17/app-psql.html)、[鎖定文件](https://www.postgresql.org/docs/17/explicit-locking.html)。

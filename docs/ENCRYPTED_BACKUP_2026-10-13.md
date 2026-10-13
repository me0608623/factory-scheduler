# 公開倉庫的加密備份切換

使用者2026-10-13明確選擇保留公開GitHub、改用加密備份。不得新增明文備份artifact，既有舊artifact尚未刪除（本次沒有刪除授權，且加密不能撤回過去已下載的內容）。

## 密鑰與安全性

- 使用官方age v1.3.2 Windows工具，下載SHA256與官方release資產digest相同。不是自造加密演算法。
- 私鑰位於 `C:/Users/me060/.codex/private-backups/factory-scheduler-20261013.agekey`，檔案ACL僅本人與SYSTEM，目錄無寬鬆繼承。age的Unix world-readable警告不代表Windows ACL；實際icacls已核對。
- 私鑰另存GitHub Secret `BACKUP_AGE_IDENTITY`，公鑰存 `BACKUP_AGE_RECIPIENT`，沒有顯示／提交私鑰。請另行離線保管私鑰，遺失便無法解密；GitHub secret不能讀回。
- 私鑰不與備份artifact一起上傳，下載備份者只有密文；有倉庫管理／修改工作流權限者仍需視為可信，GitHub Secrets不是對管理員隔離的外部金鑰庫。
- 原每日備份workflow ID367614493已暫停，避免公開明文續傳；加密版本發布及驗收後才重新啟用。Codex每10分鐘缺陷追蹤仍ACTIVE，未停止。

## 範圍與門檻

- 新備份規劃包含完整Postgres custom dump（不限定public、保留ACL）、單獨public副本供既有隔離模擬、角色SQL（不含角色登入密碼）、加密內的schema/Storage數量inventory與SHA256 manifest。
- 只上傳 `database.tar.age`，所有明文、manifest、SQL及錯誤診斷只在runner暫存且最後清理。失敗不回退明文，缺公鑰拒絕。
- 資料庫備份不包含Storage檔案本體、Render秘密環境變數、Supabase平台設定／加密根密鑰、外部服務；若Storage有檔案，需再做加密物件備份，不能把DB備份宣稱完整專案還原點。
- 同一天的新完整備份必須實際解密、驗SHA256、在隔離Supabase相容Postgres還原Auth與資料／權限。不准用auth.users stub冒稱完整；舊public-schema還原演練只證明應用資料相依還原。
- 正式0037仍禁止，直到完整備份／還原證據、資料指紋及single-transaction migration安全關卡全部通過。

參考：[age官方](https://github.com/FiloSottile/age)、[Supabase備份與還原](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、[平台還原到self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)。

## 已驗證／未驗證

- 本機6項真實age執行測試通過：逐byte round-trip、錯私鑰、竄改密文、過期manifest、錯專案／不完整範圍／多餘檔案、缺公鑰拒絕；不是源碼字串斷言。
- 完整Postgres dump／角色匯出是否在正式連線權限下可完成、Auth實際還原、Storage物件數與是否需物件備份：待CI真實唯讀備份及隔離演練。
- 新夜間工作流尚未發布至main，暫停狀態保留，防止舊main再上傳明文。

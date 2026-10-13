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

### 最新checkpoint（接續時優先讀本段）

#### 2026-10-13 16:50 heartbeat：安全整合最新main與模擬診斷隱私防護

- 開始工作目錄乾淨，沒有重疊modifier；正常fetch並普通merge **0e60483**，不切換共享checkout、不force push。四個衝突：acceptance-sim、backup-drill、C5案例、solver calendar bans。保留本分支已真驗收的分頁／密文解密及calendar union（忽略無長度區間、不合併真實工作占用），保留main新增test_leave_holiday_overlap三項測試與其他文件／工作流變更。C5保留完整求解件數、獨立合法性、實際DB拒絕及savepoint回滾，合入main新增「加班／調整期限」建議斷言，沒有弱化逾期套用閘門。
- 新缺陷實際重現：執行合併中的真simulation solve函式，2/2隱私測試修前失敗——main新增/tmp/sim-last-request.json寫出完整原始請求，且失敗stderr可外帶姓名／備註；另加無效stdout案例，真JSON.parse例外會夾帶原文而失敗。最小修正不寫快照檔，錯誤只報exit／失敗類型與格式錯誤，不回傳stdout／stderr；console仍有安全結構摘要。acceptance artifact僅原有安全報告，不納入main新增/tmp/sim-*.json；舊artifact／log依使用者要求保留，沒有刪除。
- 同步新備份策略時發現額外名稱碰撞：現有工具仍以db-backup-前綴接受任何演練／後綴檔。真mock HTTP兩項修前失敗（誤選較新的假檔＋明確ID不拒絕）；現限制兩個實際producer格式db-backup-數字與db-backup-encrypted-數字。已以GitHub實際metadata確認現存11791661615名為db-backup-encrypted-38352489633、未過期；沒有下載或展示正式內容。保留加密真備份資格，不沿用main排除所有encrypted的降級。
- 回歸：新3項實際driver執行期隱私＋2項artifact HTTP回歸通過；全部工具 **31/31**（真age加解密、未skip）、web **440/440**、build通過；solver新增測試與完整跨層等待同SHA CI，Windows OR-Tools仍不繞過防護。本機Python trampoline連YAML解析啟動都失敗，故不拿未執行的YAML解析當證據，交由GitHub workflow parser/CI核對。
- catalog-inventory／permissions-drill的main改進保留，仍是舊public備份診斷流程，未 dispatch：目前不聲稱這兩套可用新密文或公開輸出已隱私合格，後續另需安全整合；不為QA上傳人員盤點或身份資料。C1–C7原已通過不無故重跑，只針對本輪實質整合變更補驗C5。備份與正式0037不重做，正式1023、帳號權限與setup_pending不動。
- PR16/18仍不合併進main，真第二帳號／同步仍缺登入與同意；本輪沒有部署正式Render、寫正式DB或寄信。nightly367614493仍停用至安全加密版本進main，Codex10分鐘追蹤仍ACTIVE。下一步以本輪提交及CI／C5實證結果為準接續，不能拿單輪tests綠燈當全部發布門檻。

#### 2026-10-13 16:12 heartbeat：背景補讀競爭修復（發布狀態見後續追加）

- 本輪開始 own worktree 乾淨，沒有其他修改／部署程序在此目錄；不改共享checkout。canonical staging root 已實查 CF-Cache-Status=EXPIRED 並提供 **index-6NbuiVNe.js**，fcd9d2e 的舊首頁快取阻礙解除，沒有重部署舊版或清除build cache。
- 執行真正的 app 背景補讀函式（VM＋可控非同步store與timer）修前 **4/4失敗**：600ms timer排入後進入草稿／預覽仍讀取並render；HTTP在途後開草稿仍接受；本機完成較新儲存後接受較舊遠端結果；讀取失敗仍通知有更新。不是源碼字串斷言。
- 最小修正：timer執行及HTTP結果接受前兩次檢核草稿／預覽／拖曳／在途寫入／未存成功狀態；並檢核store、登入者、state內容、版本與本機寫入標記。過期結果不render、不更新寫入diff基準；沒有安全狀態時延後，關閉草稿或完成成功儲存後再補讀。多個事件合併而不並行HTTP，失敗不立即無限重試或假通知成功。
- SupabaseStore 新增 speculative `load({remember:false})`，讀取快照不修改version／base／protectedBase；真正接受畫面時同步acceptLoaded，避免「畫面拒收、寫入基準卻已更新」。預設load仍維持既有行為。真PGlite＋全部migration回歸實證拒收時基準逐位元組不變、接受後版本前進；沒有存取或寫入正式DB。
- 新增10項 app 執行期回歸＋1真SQL store回歸：安全重讀、六種busy／未存狀態、等待中開草稿、完成儲存、同物件未儲存更動、切換帳號／store、失敗不通知不迴圈、多事件合併與關閉草稿後補讀。全web **440/440**、build通過；工具 **26/26**。工具首跑因未加 age工具到此PowerShell PATH有5項環境失敗（不是產品缺陷），補既有已驗證工具路徑後26項真正執行通過，沒有跳過。一次誤用不存在tools/tests glob產生0測試，不作通過證據。Impeccable harden只影響本輪資料更新／錯誤安全，detector app.js無輸出，不做畫面重設計。
- 真staging平台即時通道中斷與第二帳號未登入仍是發布門檻，本輪程式測試不冒稱真兩端同步已通過，也未新增自動輪詢。寄設定信仍待本人同意，不能讀舊SQL／猜或改密碼。0037不重套、正式1023不動，PR16/18仍draft、nightly仍停用直到加密main安全發布。10分鐘追蹤ACTIVE。
- 修復提交 **508b79453453a362426e808e53f3b1434cdf1931** 已推own branch；同SHA Tests **38370357004**（frontend/database含跨層/solver全部成功）與smoke **38370357303**成功後，non-force FF既有staging分支。repo hooks仍0，觀察無自動deploy後才手動更新web **dep-db6usuk9v7es739tfko0**，08:40:55Z live508b794。canonical root實查MISS、**index-BxxaTLZr.js**，不是只靠HTTP200或API live判斷；solver維持2cde149，沒有新增服務、費用或正式部署。08:40:26–08:43:59Z部署error logs空，不代表浏览器或同步全面零問題。
- 最新main實查 **4008974297b0d0453ba1339a9efdf2d1e11ab9c9**，PR18 mergeable=CONFLICTING、PR16仍draft/b249160。下一輪普通merge整合需處理兩份calendar-overlap修正（保留已驗收邏輯與新增測試）、各workflow與其他提交；最新main的acceptance-report仍新增`/tmp/sim-*.json`公開上傳，**必須阻止新真實請求快照artifact**，但不得刪使用者要求保留的舊下載檔。不用force push或重設他人分支。
- 08:46Z真IAB qa-lead一般root載入 **index-BxxaTLZr.js**，top/sidebar仍如實「即時更新中斷」。回10/12／1廠，開測試A01編輯表單，開始時間08:00改草稿08:10（DOM value490），Escape取消後19段label/text/style逐筆一致；沒有按儲存或套用，不改測試DB。截圖 **outputs/staging-remote-read-safety-20261013.jpg**。手動新增入口本次正確顯示無剩餘工序，並可Escape關閉，**isNew完整新增路徑仍未測**。這不是有遠端事件的瀏覽器競爭E2E；實際即時通道仍失敗、第二帳號登入仍缺，不冒充同步成功。IAB/Chrome登入handoff保留供下輪，程式／資料發布門檻仍未全過。

#### 2026-10-13 16:00 台灣時間：即時通道狀態修復與登入阻礙

- 本輪07:32 heartbeat執行中又收到07:52 heartbeat，仍在同一工作目錄接續，沒有並行第二份修改／部署。工作區開始乾淨，只有本輪PowerShell命令在此目錄。
- Chrome既有分頁沒有staging帳號session；新開staging頁仍登入畫面。IAB tab15保留qa-lead session。沒有讀舊SQL密碼、猜密碼、改角色或密碼；已詢問是否同意寄設定信至既有me0608623+test-lead@gmail.com，**待人類回覆，尚未寄信**。Chrome tab1703573242留作登入handoff；不是第二帳號已驗收。
- 真實缺陷最小重現：新SDK mock＋真SupabaseStore訂閱測試修前4/4失敗（狀態callback根本未註冊）。修復runtime **291233d77680aaaccd825afb61764a54be35b17c**：報CONNECTING／SUBSCRIBED／CHANNEL_ERROR／TIMED_OUT／CLOSED；Postgres system error即使channel join成功仍降級，直到stream ok；新訂閱／登出先失效舊回呼，不讓過期狀態或資料事件干擾新工作階段。原始連線錯誤不輸出，沒有改DB或授權。
- UI分開「雲端已儲存」與「即時已連線／即時連線中／即時更新中斷」，寫入busy/error優先；本機沿用原提示。點中斷提示只說明完成目前操作後重新整理，**沒有新增自動reload／輪詢，也沒有覆蓋草稿、預覽或未儲存資料**。重連補漏讀取尚待後續安全實作與驗收，不冒稱已解決跨端資料新鮮度。
- 291233d新增9回歸全通過；原layout-regression源碼簽章斷言因subscribe新增參數誤判（非產品問題），換成真Store重複訂閱／登出移除通道執行期測試。全web **428/428**、工具26/26、build與Tests **38364764879**／smoke **38364764715**成功。
- 同SHA CI後non-force FF staging分支，只更新既有web。repo hooks仍0、舊deploy仍410d314才手動deploy **dep-db6u5iks728c73f0f3k0**，07:51:01Z live291233d。真IAB登入bundle **index-BHO4Rv3r.js**；沒有額外收費、沒有部署正式Render、solver仍2cde149。
- 真實staging本次明確顯示 **雲端已儲存／即時更新中斷**；本輪沒有模擬斷網或讀JWT／私密key，這是SDK實際訂閱回報。callback狀態不足以斷言是哪個平台根因。点击提示說明正確，當日19段id/text/style保持一致。手機390×844可操作，按鈕44px，warn字色rgb(154,91,0)／底rgb(247,248,250)。不是iPhone Safari測試；另一端同步仍未通過。
- 截圖工具在連續set/reset viewport同call時輸出過異常縮圖，不能拿它當手機證據；DOM已核實手機布局，桌面reset後分開call fullPage截圖可用：**outputs/staging-realtime-disconnected-desktop-verified-20261013.jpg**。mobile檔不作交付證據。
- 桌面完整截圖抓到另一顯示不一致：sidebar仍「雲端已同步」。已修 **fcd9d2e5e3cfb666f8a9c7e832ebeb95267a4a8e**，sidebar和top共用syncStatusView，updateSyncChip兩處都更新，警告圓點不再綠；補1真renderer回歸。全web **429/429**、工具26/26、build、Tests **38366477082**／smoke **38366477247**均成功。CI後FF staging分支、hooks=0且無自動deploy才手動更新，**dep-db6ucejl550s73a5a7a0**於08:05:41Z live fcd9d2e。
- 抓到部署快取差異：08:08Z canonical root仍CF-Cache-Status=HIT／Age112／舊asset index-BHO4Rv3r.js；同host單次cache-bust `?release=fcd9d2e`是MISS／新asset **index-6NbuiVNe.js**。正常部署不重複clear build cache，這不是程式沒編入。新URL真qa-lead登入已實測top與sidebar同時「即時更新中斷」，證據 **outputs/staging-realtime-status-final-20261013.jpg**。**canonical首頁快取刷新仍需下一輪核對**，不把API live冒稱所有一般網址已新版本。沒有改任何CDP網路設定，也沒有平台環境／資料寫入。
- 下一步先核對canonical root新asset／sidebar一致；若使用者同意寄信，僅測試站寄信並由其本人設定、登入。未回覆不重問未知密碼；繼續安全探索remote reload timer競爭及丟失草稿／預覽的最小重現。PR16/18未合併；與最新main普通merge時阻擋新的真實request明文artifact；加密nightly尚未進main、舊367614493仍disabled_manually。0037已完成、正式1023不動、10分鐘追蹤ACTIVE。

#### 2026-10-13 15:30 台灣時間：手機抽屜Major修復完成

- runtime **410d314e642443a31c584a73ccf7e24b2b831494**：把手機取消／套用置於抽屜固定底列，抽屜內容獨立捲動；收合後仍保留底列。桌面只顯示原頂部入口。沿用既有pv-cancel／pv-apply完整驗證，不新增儲存路徑；不改主要機台×時間班表、日週切換或午休加班背景。
- 新增4項真函式執行＋HTML解析回歸（自動合法方案、手動／自動無效方案disabled、儲存中無可點動作、只讀情境不得套用）；原16項真handler測試含取消不寫入與連點只存一次仍通過。全web **419/419**、工具26/26、build成功；同SHA Tests **38362247865**（frontend/database跨層/solver）及smoke **38362244978**均成功。既有chunk及依賴警告未聲稱修復。
- CI綠後non-force FF既有staging分支至410d314；repo hooks仍0且未出現自動deploy，才觸發既有staging web **dep-db6tq0rl550s73a3bj8g**。07:26:20Z live410d314，瀏覽器實際bundle **index-DAmlZZVm.js**。staging solver仍2cde149；沒有新增服務／費用、沒有部署正式Render。
- 真qa-lead session／真OR-Tools三方案：**390×844**展開與收合底列兩鈕均48px高，中心elementFromPoint命中本按鈕，沒有被抽屜覆蓋；選最佳化→切2廠10/14→直接按新底列取消→回1廠10/12，19段id/label/text/style逐筆一致，preview消失，沒有按用這套。**844×390**橫向底列兩鈕48px／中心命中，Enter取消成功。桌面預覽底列display:none、原入口48px，取消成功。證據outputs/staging-mobile-preview-actions-20261013.png與staging-desktop-preview-actions-20261013.png。
- Impeccable adapt限制本輪只修此觸達缺陷；一次detector報7個既有CSS警告，沒有新增同類規則，未擴成重設計。未做真機Safari、尚未端到端按新套用入口寫入或跨帳號同步；這些不能用enabled／已同步徽章冒充。
- 接續優先：取得既有另一個已登入測試session（不讀／猜密碼），驗角色／真正套用／兩端同步與Realtime失效回饋；`store/supabase.js` subscribe未處理訂閱狀態，平台故障時無資料新鮮度降級，先重現再最小修正。再普通merge最新main／PR16整合，**移除新真實request公開artifact**但不刪使用者指定保留的舊artifact。加密nightly安全進main後才啟用367614493，目前實查仍disabled_manually。
- 正式0037已完成，不再套用；1023與個人角色授權／setup_pending不動。PR16與PR18仍draft，發布門檻未全過。10分鐘追蹤ACTIVE，下一輪继续，不因本項驗收成功停止。

#### 2026-10-13 約15:15 台灣時間更新（以下本段優先於舊輪次敘述）

- 正式0037已由run38355345279安全提交；不重跑。新密文備份及真正完整還原、同SHA CI、交易內資料保護均通過。正式1023／Auth／個人權限／setup_pending未改。
- 最新runtime **c88a7ee6046118ea42a34707716223e05fec4cbb**；Tests38359130441全部成功，smoke38359130405成功。本機web **415/415**、build通過；工具26/26和真SQL回滾演練先前已通過。
- staging web dep-db6tc33rjlhs7396vvkg於06:56:30Z live c88a7ee，實際bundle index-BecRRKb0.js。staging solver仍是dep-db6solij9qps73adm3a0／2cde149（最新前端修正未改solver，不冒稱兩個SHA相同）。沒有新增服務／費用，沒有合併PR或部署正式Render。
- 已修兩個取消缺陷：取消預覽恢復進入時日期／廠別／檢視／聚焦；同步還原既有廠別偏好，reload不再跳到預覽中臨時切換的廠別。純UI context，不寫排程store。5純模組＋2實際handler VM回歸；確認套用不還原預覽入口日期。
- 桌面已實測取消回到10/12、1廠，19個方塊id／label／text／style完全一致；最新reload仍1廠。手機390×844也以真qa-lead session、真OR-Tools三方案測到選最佳化／切2廠／取消，**先收合方案抽屜後**回10/12、1廠及19段完全一致，reload仍1廠。未按「用這套」。手機證據outputs/staging-mobile-cancel-20261013.png；真機iPhone Safari未測。
- **新增Major待修（下一輪第一優先）**：手機展開方案比較抽屜佔住可視區，預覽「取消／用這套」被遮；直接locator click取消未生效，收合後才生效。不是取消context回歸；應確保展開抽屜仍有可見、可點的44px取消／套用入口，補實際遮擋／點擊回歸。因此手機驗收未全過，不能發布。
- 一次reload後計算明確顯示「瀏覽器備援」，後續手機與桌面另次計算明確顯示「OR-Tools」；冷啟動／健康探測原因仍待查，不能把全部嘗試稱ORTools。
- PR16/18均draft。跨帳號權限、套用／Realtime同步與離線衝突未通過；正式VITE_TEST_*未設定。與最新main普通merge時先查其新增真實request dump上傳，禁止新明文資料artifact；保留其他agent提交、不force。
- 舊nightly ID367614493仍disabled_manually；加密版本通過但尚未進main，安全合併後才能啟用，避免舊main繼續上傳明文。既有明文artifact/log依使用者要求保留。10分鐘Codex追蹤維持ACTIVE，不因本輪完成自行結案。

#### 先前輪次紀錄（已被上段取代的待辦不重做）

- **正式0037已套用**：runtime2cde149，Tests38354810746／完整還原＋guarded0037演練38354811296／純關卡38355195539全成功後，正式apply=true run38355345279於06:11:59Z提交。交易內所有public資料、Auth users/identities、角色／RLS／序列指紋不變；沒有改正式1023或解除setup_pending。詳見MIGRATION_0037_GATE_2026-10-13.md；不要重複套用。
- 工具26/26及真SQL回滾測試通過，不靠源碼字串。演練receipt artifact11792422005不含資料；私密診斷／fingerprints不上傳。
- staging solver分支non-force FF至2cde149，repo hooks=[]且staging不自動部署（觀測後仍cdfc40c），手動deploy dep-db6solij9qps73adm3a0已live於2cde149，health database=true／OR-Tools9.15.6755。06:15:26Z至06:19:59Z app error logs=0。
- 真實qa-lead session已計算3套OR-Tools方案；選最佳化→影響日10/14等、原本22段／調整15段，DOM內容與位置確實不同；取消後未套用方案，但抓到**取消未恢復原日期**（10/12→看10/14→取消仍10/14）。正在用純UI context修復，4單元＋2真handler VM回歸；不改班表資料或CSS世界。首次web412/411失敗為VM fixture沒引入新真模組，已补該import，不能記成產品ReferenceError。
- 新UI取消修復本機最新414項回歸與build通過（dot reporter exit0）；尚待此修復CI、staging web部署與桌面／手機確認。現有截圖outputs/staging-ortools-preview-20261013.png為修前真ORTools對照畫面。
- 5474f40 Tests38357296228全成功；staging web dep-db6t3qgn74is738umqtg已live5474f40，新bundle index-Bsy81hyT.js。桌面取消已回原10/12、factory1，當日19段data-bid／aria-label／text／style逐筆一致。此次重載後預覽明確是「瀏覽器備援」，不能冒稱此輪也走ORTools（前一輪真ORTools已驗3方案）。
- 桌面加測廠別→取消→reload抓到UI恢復1廠但偏好fsched-factory留2廠，重載變2廠。已最小補用既有setFactory還原UI偏好，沒有寫排程store；新增偏好回歸及實际cancel handler VM斷言。最新415項本機＋build通過，仍需最新CI/staging確認與手機390尺寸。本轮全部未按「用這套」。
- 2026-10-13使用者已回覆：維持公開、改用加密備份。新追蹤prompt已更新，不再等待可見性選擇；加密完整備份與還原本身仍是0037門檻。
- 使用者再明確要求「先保留舊檔，只改新備份」，不刪既有backup/debug artifacts或log。
- 新正式唯讀完整DB加密run38352489633／artifact11791661615已成功；下載真正解密SHA256驗證通過。完整隔離Supabase PG17還原run38353201806成功（角色SQL、Auth真實資料、full.dump ACL、FK/RLS等，無stub）。Storage物件0。新backup/nightly尚未merge main，舊nightly暫停保留以防明文。
- 最新修復head1986377：工具20/20＋實際PGlite recovery-proof SQL通過。03451e1兩套CI成功；1986377 Tests38353205423/38353200703也全成功。同新密文C1–C7 run38353425842 **PASS=7 FAIL=0 未成立=0**（已對到實際log，不只看job綠燈）。詳見ENCRYPTED_BACKUP_2026-10-13.md。
- 下一項：完成取消導航修復CI與staging UI驗收、補跨帳號同步並整合PR16／最新main；安全发布加密備份，才重啟nightly。正式0037已完成，不解除setup_pending。
- 舊nightly-backup ID367614493已disabled_manually，防止新明文備份；age私鑰已用本人+SYSTEM ACL保管，GitHub兩個BACKUP_AGE_*秘密已設定，不展示私鑰。
- 本輪加密模組真實age測試6/6；完整DB與角色加密＋真還原已通過，詳見docs/ENCRYPTED_BACKUP_2026-10-13.md。
- 修復分支runtime a48d9f6；PR #18 draft。固定同備份11786241413、週一2026-10-12，run **38350613478 PASS=7 FAIL=0 未成立=0**，是實際PostgreSQL副本＋OR-Tools＋DB套用／拒絕的驗收，不是源碼斷言。
- C5額外修正負面測試：在PL/pgSQL子交易中捕捉預期P0001拒絕，不讓外層交易abort導致Session SELECT哨兵等待180秒；仍驗證拒絕內容、資料與版本不變。
- PR #16已同步main11285ea並推到b249160，維持draft；最新head CI要再核對。未合併任何PR、未套用正式0037、未設定正式VITE_TEST_*。
- 既有staging web追蹤分支non-force fast-forward至11285ea（比Tests綠燈7f3df00只多文件），repo hooks仍空，所以手動部署 `dep-db6rugjl550s739sontg`，live11285ea。沒有新增主機或費用；staging solver尚未更新到本輪calendar union修復。
- staging執行期先重現加班日date-nav會ReferenceError otEnd、畫面停在舊日期；更新web後同一session切到10/12成功、1廠19段渲染。新bundle index-C4NJipl1.js，部署完成05:19:20Z之後本輪console新增error=0。
- screenshot `outputs/staging-calendar-render-20261013.png`。測試站畫面已有其他agent留下的休假等變更與3問題提示，不能把有畫面／已同步徽章當作無衝突或Realtime驗收；本輪未重置該資料，也未更動正式1023。
- browser IAB tab15是已登入qa-lead的staging app，handoff；沒有取得任何密碼。Supabase admin tab9不要讀其密碼片段。
- 備份保護選擇已明確：公開＋加密、舊檔保留。不再向使用者重問；automation仍ACTIVE每10分鐘，不自行停用。
- 下一輪先核對最新CI；在獨立staging部署通過的calendar修復、驗排程與跨帳號／兩端同步。修復同步降級或缺憑證時不得假裝已即時同步；再處理備份與0037、PR16正式發布門檻。

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

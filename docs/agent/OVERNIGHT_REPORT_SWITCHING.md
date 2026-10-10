# 過夜開發報告：Soft Switching Cost（軟性切換成本）

日期：2026-10-10｜分支：`feat/soft-switching-cost`｜狀態：**分支 CI 全綠，等待人工審核 PR**

---

## 1. 零碎工作段的實際原因（Phase 1 根本原因報告）

歷史案例（docs/TEST_STATUS.md 疑點②）：故障重排後「每個人的變動」出現 9/29 11:50–12:00 的 10 分鐘工作段。

**程式碼層分析（model.py / timeline.py）**：

1. 模型以 (工單, 工序) 為單位建 **單一壓縮時間軸區間**（`Op`，`dur_of()` 計算，最小粒度 10 分鐘）。
2. 壓縮時間軸**不含午休/下班**；輸出時 `to_real()` 展開成真實方塊——同一工序跨午休/下班/跨日會產生多個顯示方塊（自然分段，非切換）。
3. **11:50–12:00 的形成機制**：某工序的剩餘量小（`dur_of` 得 dur=10）形成完整合法短工序；或長工序的壓縮區間展開後剛好在午休邊界切出短尾段。CP-SAT 的既有目標（延誤×1000、完成時間×1-10）對「這 10 分鐘排在哪」近乎中性 → 沒有動力把短段併到相鄰工作或移離邊界。
4. **結論**：短段是 CP-SAT 合法且近乎無成本差的選擇，不是 `to_real()` 的 bug；需要「軟性成本」提供連續性偏好（本次產品決策：不用硬性最短工段限制）。

**可重現證據**（CI 實測，`test_solver_fault_reroute_repro_and_metrics`）：
```
fault-reroute: {'machine_switches': 13, 'employee_switches': 13,
  'short_necessary': 0, 'short_avoidable': 1, 'pieces_total': 25, 'continuity': 0.96}
```
合成故障情境重現了 1 個「可避免零碎短段」，且分類器正確將其與必要短段區分。

## 2. 採用的軟性成本公式（Phase 2-3）

**Total Objective = 既有目標 + sw_emp × Σ(1−same_emp) + sw_mach × Σ(1−same_mach)**

- `same_emp_{order,k}`：工單相鄰兩站（k-1→k）「用到同一位員工」的 reified 布林
  （對每個共通員工 e：兩站各自「選中含 e 的組合」先對機台維度 OR，再 AND；諸 e 之間 OR）
- `same_mach_{order,k}`：同構，機台維度（同機不論誰操作）
- **不罰的必要情況**（Phase 4）：兩站員工/機台集合本來就無交集（技能/工序路由限制）、該站只有單一人選或單一機台（無選擇）
- 權重（相對偏好值，**非實際換模分鐘或金額**）：`min_change` sw_emp=400/sw_mach=200、`keep_assign` 1200/400、`on_time` 150/80（對齊既有 `change` 權重 3,000–60,000 的尺度）
- **基準模式**：`Weights` 新欄位預設 0；環境變數 `SOLVER_SWITCH_COST=0` 整體關閉（A/B 用）
- 硬性限制完全未動；軟性成本只加線性目標項，**不可能**把合法解變 INFEASIBLE

**實作細節**：`uses()`（對另一維度 OR）+ `both()`（reified AND）兩個小工具；每工單每相鄰站 O(共通員工數＋共通機台數) 個布林——相對模型規模可忽略（效能實測見 §8）。

> 修復紀錄：第一版把「同機台」誤寫成「(機,人) 組合完全相同」——同機換人也被罰，與換機同價，求解器無差別選擇。CI 分支測試抓到（`兩站應同一台機台，實際 {'m-cut2','m-cut'}`）後改為正確的 OR-then-AND 兩段式。

## 3. 修改的檔案

| 檔案 | 內容 |
|---|---|
| `solver/app/switching.py`（新，97 行） | 量測：機台/員工切換計數、短段 necessary/avoidable 分類、continuity |
| `solver/app/model.py` | `Weights.sw_emp/sw_mach`、`_switch_cost_enabled()`、目標項、PRESETS 校準 |
| `solver/app/plans.py` | `describe()` 併入切換指標；摘要顯示可避免零碎短段數 |
| `solver/tests/test_switching_cost.py`（新，19 條） | 見 §4 |
| `.github/workflows/tests.yml` | solver job 加 `-rP`（通過測試的 stdout 可見，A/B 數值入 CI 報告） |

## 4. 新增的測試（19 條，全部通過）

量測層（確定性）：真實換工單計數、同工序連續不計、**午休分段不計切換且非零碎**、**歷史形態 11:50–12:00 尾段 → avoidable=1**、整工序本來就短 → necessary、故障貼邊短段 → necessary、固定短段 → necessary、並行顧機不算切換。

求解層：**sw_emp=50000 必同員工**（確定性）、**sw_mach=50000 必同機台**（確定性，即抓到 reification bug 的測試）、零權重＋環境關閉的基準相容、三 PRESETS 語意維持、故障重現＋分類自洽、急單準時、故障＋請假同日、跨廠物料守恆、10/120 工單效能、受限初稿(pair_cap) vs 完整模型、A/B 證據輸出。

## 5-6. 優化前後切換與零碎段（CI 實測，同一故障情境）

```
baseline   : machine=13 employee=13 short_necessary=0 short_avoidable=1 continuity=0.96
switch_cost: machine=13 employee=13 short_necessary=0 short_avoidable=1 continuity=0.96
```

**誠實結論**：在示範資料的這個故障情境，生產權重（400/200）下軟性成本**沒有改變**排程結果——既有 `change`/`dev` 權重已把人機組合錨定，新成本的量級是「溫和導引」而非主導。確定性測試（50000 權重）證明**機制有效**（必然收斂到同員工/同機台）；實際生產改善幅度需要更大規模、更多情境的實測校準——權重已參數化，可依現場回饋調整。

受限初稿 vs 完整（60 工單合成）：兩者指標完全相同（232/232 切換、continuity 1.0），新成本定義在兩種模式一致。

## 7. 交期與排程品質差異

A/B 兩案 `check()` 均 0 違規、工單逾期數相同（demo 全部準時）——**軟性成本未造成交期退化**。急單（priority 0）準時測試通過。

## 8. CPU／記憶體／執行時間（CI 實測）

- 效能煙霧（開啟成本後）：10 工單 10.01s、30 工單 10.02s、60 工單 10.11s（time_limit=10 的有界求解——新增約束在限時內可忽略）
- solver 全套 **165 passed in 130.75s**（CI 與主分支基準同量級）

## 9. CI 測試狀態

`feat/soft-switching-cost` 分支：Tests ✅（frontend/database/solver 三 job）、Deployment smoke test ✅。第一次推送曾失敗（reification bug＋2 個 fixture NameError），完整日誌已讀、修復、重跑至綠。

## 10. Git 與分支

- 分支：`feat/soft-switching-cost`（基準 main `7450d09`）
- commits：`3841f8e`（主實作＋18 測試）、reification 修復＋A/B 證據＋`-rP`
- **未合併 main**：依約束（正式部署保留人工核准），以 PR 交付審核

## 11. 尚未解決的問題

1. 生產權重下的實際改善幅度未量化（需更大規模/真實資料校準；權重可調）
2. 「avoidable 短段」的**事後量測**已上線，但 CP-SAT 內尚無直接抑制「邊界短尾段」的項（壓縮軸看不到午休邊界；可評估後續以邊界跨越表＋element 約束表達，成本較高）
3. 前端方案比較 UI 尚未展示新指標（metrics 已進 API 回應，UI 呈現待下輪）

## 12. 下一輪過夜任務建議

1. 前端方案預覽顯示切換/零碎指標（資料已在 describe() metrics）
2. 以 `scripts/benchmark.py` 大規模掃描權重（sw_emp/sw_mach 網格）校準生產值
3. NEXT_TASKS 其餘項目（API 例外處理、安全性回歸、測試缺口探索）

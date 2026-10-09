"""軟性切換成本測試（TEST_STATUS 9-26 疑點②；產品決策 2026-10-10：Soft Penalty）。

分兩層：
- 純量測層（不跑求解，確定性）：app/switching.py 的切換計數與零碎段分類
- 求解層（CP-SAT）：sw_emp/sw_mach 權重行為、基準相容、效能、方案合法性

本機 uv 受限時由 CI 執行（tests.yml solver job）。
"""
from types import SimpleNamespace

from app.model import PRESETS, Weights, solve
from app.schemas import (Calendar, Employee, Fault, Machine, Order, Product,
                         Snapshot, Step)
from app.switching import SHORT_PIECE_MIN, switching_metrics
from app.validate import check

DAY = "2026-09-29"


def _blk(order, step, machine, employee, start, end, qty=30, date_str=DAY, pinned=False):
    return SimpleNamespace(order=order, step=step, machine=machine, employee=employee,
                           date=date_str, start=start, end=end, qty=qty, pinned=pinned)


def _mach(mid="m", faults=()):
    return SimpleNamespace(id=mid, faults=list(faults))


def _snap(machines):
    return SimpleNamespace(machines=machines)


# ---------- 純量測層 ----------

def test_metric_real_order_switch_on_machine():
    """3：同機台相鄰、不同工單 → 1 次機台切換。"""
    blocks = [_blk("o1", 0, "m", "e1", 480, 540), _blk("o2", 0, "m", "e1", 540, 600)]
    m = switching_metrics(_snap([_mach()]), blocks)
    assert m["machine_switches"] == 1
    assert m["employee_switches"] == 1  # 人也換了工作


def test_metric_same_op_contiguous_not_switch():
    """4：同工序連續 → 0 切換、連續度 1.0。"""
    blocks = [_blk("o1", 0, "m", "e1", 480, 540), _blk("o1", 0, "m", "e1", 540, 600)]
    m = switching_metrics(_snap([_mach()]), blocks)
    assert m["machine_switches"] == 0 and m["employee_switches"] == 0
    assert m["continuity"] == 1.0


def test_metric_lunch_split_not_switch_not_fragment():
    """2：午休（12:00-13:00）造成的同工序分段 → 不計切換；兩段皆 ≥20 分非零碎。"""
    blocks = [_blk("o1", 0, "m", "e1", 480, 720), _blk("o1", 0, "m", "e1", 780, 900)]
    m = switching_metrics(_snap([_mach()]), blocks)
    assert m["machine_switches"] == 0
    assert m["short_avoidable"] == 0 and m["short_necessary"] == 0


def test_metric_avoidable_short_tail_historical_shape():
    """1（量測層重現）：長工序切出 11:50–12:00 的 10 分鐘尾段 → avoidable=1。"""
    blocks = [_blk("o1", 0, "m", "e1", 480, 700),       # 220 分
              _blk("o1", 0, "m", "e1", 710, 720)]       # 10 分（11:50–12:00）
    m = switching_metrics(_snap([_mach()]), blocks)
    assert m["short_avoidable"] == 1 and m["short_necessary"] == 0
    assert m["continuity"] < 1.0


def test_metric_short_whole_op_is_necessary():
    """6：工序剩量少、整個工序只有 10 分 → necessary（合法短工段）。"""
    blocks = [_blk("o1", 0, "m", "e1", 480, 490)]
    m = switching_metrics(_snap([_mach()]), blocks)
    assert m["short_necessary"] == 1 and m["short_avoidable"] == 0


def test_metric_fault_adjacent_short_is_necessary():
    """7：片段緊貼故障時段邊界 → necessary（故障迫使的中斷）。"""
    fault = SimpleNamespace(date=DAY, start=720, end=780)
    blocks = [_blk("o1", 0, "m", "e1", 480, 710), _blk("o1", 0, "m", "e1", 710, 720)]
    m = switching_metrics(_snap([_mach(faults=[fault])]), blocks)
    assert m["short_necessary"] >= 1 and m["short_avoidable"] == 0


def test_metric_pinned_short_is_necessary():
    """8：固定（釘）的短段 → necessary（不可移動）。"""
    blocks = [_blk("o1", 0, "m", "e1", 480, 710), _blk("o1", 0, "m", "e1", 710, 720, pinned=True)]
    m = switching_metrics(_snap([_mach()]), blocks)
    assert m["short_necessary"] == 1 and m["short_avoidable"] == 0


def test_metric_employee_parallel_machines_not_switch():
    """5：員工同時顧多機（同 start）不算切換；換機（不同工序連續）才算。"""
    blocks = [_blk("o1", 0, "m1", "e1", 480, 540), _blk("o2", 0, "m2", "e1", 480, 540),  # 並行
              _blk("o3", 0, "m1", "e1", 540, 600)]
    m = switching_metrics(_snap([_mach("m1"), _mach("m2")]), blocks)
    assert m["employee_switches"] == 1  # 並行不算；540 起換到 o3 算一次


# ---------- 求解層 ----------

def _two_step_factory(two_cut_machines=False):
    """兩位員工都會兩種工序 → sw_emp 有選擇空間；sw_mach 用 cut+cut。"""
    steps = [Step(process="cut", rate=1, batch=0)]
    steps.append(Step(process="cut" if two_cut_machines else "pack", rate=1, batch=0))
    machines = [Machine(id="m-cut", factory=1, process="cut", products=["p"])]
    if two_cut_machines:
        machines.append(Machine(id="m-cut2", factory=1, process="cut", products=["p"]))
    machines.append(Machine(id="m-pack", factory=1, process="pack", products=["p"]))
    employees = [Employee(id="e1", name="一", factory=1, skills=["m-cut", "m-cut2", "m-pack"],
                          max_concurrent_machines=1),
                 Employee(id="e2", name="二", factory=1, skills=["m-cut", "m-cut2", "m-pack"],
                          max_concurrent_machines=1)]
    orders = [Order(id="o1", code="A1", product="p", qty=60, due="2026-10-01", priority=2)]
    return Snapshot(calendar=Calendar(week=[False] + [True] * 6), machines=machines,
                    employees=employees, products=[Product(id="p", name="p", steps=steps)],
                    orders=orders)


NOW = type("N", (), {"date": "2026-09-28", "min": 480})()


def test_solver_employee_switch_weight_keeps_same_employee():
    """13a：sw_emp 極大時，同工單相鄰兩站必用同一位員工。"""
    snap = _two_step_factory()
    r = solve(snap, NOW, Weights(tard=1000, comp=1, sw_emp=50000), time_limit=5)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, NOW) == []
    emps = {b.employee for b in r.blocks if b.employee}
    assert len(emps) == 1, f"兩站應同一位員工，實際 {emps}"


def test_solver_machine_switch_weight_keeps_same_machine():
    """13b：cut+cut 兩台機台可選、sw_mach 極大 → 兩站同機台。"""
    snap = _two_step_factory(two_cut_machines=True)
    r = solve(snap, NOW, Weights(tard=1000, comp=1, sw_mach=50000), time_limit=5)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, NOW) == []
    machs = {b.machine for b in r.blocks}
    assert len(machs) == 1, f"兩站應同一台機台，實際 {machs}"


def test_solver_zero_weights_baseline_compatible(monkeypatch):
    """12：sw 權重 0 ＋環境關閉 → 模型行為回到基準（合法解、量測不受影響）。"""
    monkeypatch.setenv("SOLVER_SWITCH_COST", "0")
    snap, now = demo
    r = solve(snap, now, Weights(tard=1000, comp=10, dev=1, change=50), time_limit=3)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    m = switching_metrics(snap, r.blocks)
    assert m["pieces_total"] > 0


def test_solver_presets_keep_semantics_with_switch_cost():
    """15：三個 PRESETS 含軟性成本後仍各自有合法解。"""
    snap, now = demo
    for name, w in PRESETS.items():
        r = solve(snap, now, w, time_limit=3)
        assert r.status in ("OPTIMAL", "FEASIBLE"), name
        assert check(snap, r.blocks, now) == [], name


def test_solver_fault_reroute_repro_and_metrics(demo):
    """1（求解層重現）：故障重排後——合法解＋零碎段分類自洽（必要＋可避免＝短段總數）。"""
    snap, now = demo
    snap = snap.model_copy(deep=True)
    m0 = next(m for m in snap.machines if m.id == "a")
    m0.faults.append(Fault(date="2026-09-29", start=700, end=780))
    r = solve(snap, now, PRESETS["min_change"], time_limit=5)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    m = switching_metrics(snap, r.blocks)
    shorts = sum(1 for b in r.blocks if 0 < b.end - b.start < SHORT_PIECE_MIN)
    assert m["short_necessary"] + m["short_avoidable"] == shorts
    print(f"fault-reroute: {m}")


def test_solver_rush_due_respected_with_switch_cost(demo):
    """9：急單（priority 0、期限近）在軟性成本下仍準時且合法。"""
    snap, now = demo
    rush = Order(id="oz", code="Z9", product="p1", qty=120, due="2026-09-30", priority=0)
    snap.orders.append(rush)
    r = solve(snap, now, PRESETS["on_time"], time_limit=5)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []


def test_solver_fault_and_leave_same_day(demo):
    """10：故障＋請假同時發生，軟性成本下仍有合法解。"""
    snap, now = demo
    snap = snap.model_copy(deep=True)
    next(m for m in snap.machines if m.id == "a").faults.append(
        Fault(date="2026-09-29", start=480, end=600))
    next(e for e in snap.employees if e.id == "e1").leaves.append("2026-09-29")
    r = solve(snap, now, PRESETS["min_change"], time_limit=5)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []


def test_solver_cross_factory_material_flow():
    """11：跨廠工序＋交接批量，軟性成本下物料守恆仍由驗證器把關。"""
    from scripts.benchmark import snapshot_for
    snap = snapshot_for(8, 8, 8, cross_factory=True, transfer_batch=30)
    r = solve(snap, NOW, PRESETS["on_time"], time_limit=8)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, NOW) == []


def test_solver_perf_small_vs_large_with_switch_cost():
    """14：軟性成本下小型（10）與大型（120 工單）仍可有界求解（正式趨勢看 CI 日誌）。"""
    from scripts.benchmark import snapshot_for
    for n in (10, 120):
        snap = snapshot_for(8, 8, n)
        r = solve(snap, NOW, PRESETS["on_time"], time_limit=10)
        assert r.status in ("OPTIMAL", "FEASIBLE"), f"n={n}"
        assert check(snap, r.blocks, NOW) == [], f"n={n}"


def test_solver_restricted_draft_vs_full_quality():
    """16：受限候選初稿（pair_cap=1）與完整模型在軟性成本下都合法、指標可比較。"""
    from scripts.benchmark import snapshot_for
    snap = snapshot_for(8, 8, 60)
    full = solve(snap, NOW, PRESETS["on_time"], time_limit=8)
    draft = solve(snap, NOW, PRESETS["on_time"], time_limit=8, pair_cap=1)
    for r, tag in ((full, "full"), (draft, "draft")):
        assert r.status in ("OPTIMAL", "FEASIBLE"), tag
        assert check(snap, r.blocks, NOW) == [], tag
    mf, md = switching_metrics(snap, full.blocks), switching_metrics(snap, draft.blocks)
    print(f"full={mf} draft={md}")

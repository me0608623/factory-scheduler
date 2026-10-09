"""邊界案例：空工單、單工單、全部逾期——模型不崩潰且輸出可行排程（NEXT_TASKS Phase 3）。
本機 uv 環境受限，這些測試由 CI（tests.yml solver job）執行。
"""
from datetime import date, timedelta

from app.model import PRESETS, solve
from app.validate import check


def _yesterday(now_date: str) -> str:
    return (date.fromisoformat(now_date) - timedelta(days=1)).isoformat()


def test_empty_orders_yields_empty_valid_schedule(demo):
    snap, now = demo
    snap = snap.model_copy(deep=True)
    snap.orders = []
    snap.blocks = []
    r = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    assert r.blocks == []


def test_single_order_completes_validly(demo):
    snap, now = demo
    snap = snap.model_copy(deep=True)
    keep = snap.orders[0].id
    snap.orders = [o for o in snap.orders if o.id == keep]
    snap.blocks = [b for b in snap.blocks if b.order == keep]
    r = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    # 單一工單：最後一站必須被排到（不是只排前段）
    prod = next(p for p in snap.products if p.id == snap.orders[0].product)
    last = len(prod.steps) - 1
    assert any(b.step == last for b in r.blocks), "單工單應完成到最後一站"


def test_all_orders_overdue_still_produces_feasible_schedule(demo):
    snap, now = demo
    snap = snap.model_copy(deep=True)
    yesterday = _yesterday(now.date)
    for o in snap.orders:
        o.due = yesterday
    r = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    assert r.blocks, "全部逾期時仍應產生排程（盡量晚中之早），而非拒絕求解"


def test_no_machines_and_no_orders_is_valid(demo):
    """最極端：完全空白的工廠。"""
    snap, now = demo
    snap = snap.model_copy(deep=True)
    snap.orders = []
    snap.blocks = []
    snap.machines = []
    snap.employees = []
    r = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    assert r.blocks == []


def test_insert_option_with_new_order_late_is_downgraded(demo):
    """TEST_STATUS 2026-09-26 疑點①：新工單逾期的方案不可標為可套用。"""
    from app.plans import make_plans
    from app.schemas import Event, Order, PlanRequest

    snap, now = demo
    rush = Order(id="olate", code="L01", product="p1", qty=500, due="2026-09-27", priority=0)
    plan = make_plans(PlanRequest(snapshot=snap, event=Event(type="order", order=rush), now=now, time_limit=3))
    assert plan["options"]
    late_any = False
    for o in plan["options"]:
        new_late = "L01" in o["metrics"].get("late", [])
        if new_late:
            late_any = True
            assert not o["applicable"], f"方案 {o['id']} 新單逾期卻標為可套用"
            assert any("超過期限" in x or "排完" in x for x in o["diagnostics"]), f"方案 {o['id']} 缺降級說明"
    assert late_any, "本情境應至少有一個讓新單逾期的方案（測試前提）"

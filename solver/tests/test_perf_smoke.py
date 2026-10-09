"""效能煙霧測試：不同工單數量的解算時間仍有界（NEXT_TASKS Phase 3「效能基準」）。
CI 絕對時間會浮動，這裡只守「完成且有界」，數值印在日誌供趨勢比對；
正式基準仍以 scripts/benchmark.py（本機/手動）為準。
"""
import time

from scripts.benchmark import snapshot_for
from app.model import PRESETS, solve
from app.schemas import Now


def _solve_timed(order_count: int, time_limit: float = 10.0):
    snap = snapshot_for(machine_count=8, employee_count=8, order_count=order_count)
    now = Now(date="2026-09-28", min=480)
    t0 = time.perf_counter()
    r = solve(snap, now, PRESETS["on_time"], time_limit=time_limit)
    return time.perf_counter() - t0, r


def test_solve_time_bounded_across_order_counts():
    times = {}
    for n in (10, 30, 60):
        dt, r = _solve_timed(n)
        assert r.status in ("OPTIMAL", "FEASIBLE"), f"n={n} status={r.status}"
        # 煙霧上限：time_limit=10s 的模型建構＋求解，CI 慢機也應在 30 秒內完成整輪
        assert dt < 30, f"n={n} 解算 {dt:.1f}s 超過煙霧上限 30s"
        times[n] = round(dt, 2)
    print(f"perf-smoke solve seconds by order count: {times}")

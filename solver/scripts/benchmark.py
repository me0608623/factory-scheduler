"""Bounded, synthetic solver sizing check; never reads or writes production data.

Run from solver/: uv run --with psutil python scripts/benchmark.py
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def snapshot_for(machine_count: int, employee_count: int, order_count: int, cross_factory: bool = False):
    from app.schemas import Calendar, Employee, Machine, Order, Product, Snapshot, Step

    processes = ("cut", "press", "weld", "pack")
    factory_for = lambda process: 2 if cross_factory and process in ("weld", "pack") else 1
    machines = [
        Machine(id=f"m{i}", factory=factory_for(processes[i % 4]),
                process=processes[i % 4], products=["p"])
        for i in range(machine_count)
    ]
    employees = [
        Employee(id=f"e{i}", name=f"Employee {i}", factory=factory_for(processes[i % 4]),
                 skills=[m.id for m in machines if m.process == processes[i % 4]])
        for i in range(employee_count)
    ]
    start = date(2026, 9, 28)
    orders = [
        Order(id=f"o{i}", code=f"O{i:03}", product="p", qty=120,
              due=(start + timedelta(days=10 + i // 12)).isoformat())
        for i in range(order_count)
    ]
    return Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=machines, employees=employees,
        products=[Product(id="p", name="Product", steps=[
            Step(process=p, factory=factory_for(p), rate=2) for p in processes
        ])],
        orders=orders,
    )


def rss_bytes(pid: int) -> int | None:
    try:
        import psutil
    except ImportError:
        return None
    try:
        process = psutil.Process(pid)
        return sum(p.memory_info().rss for p in [process, *process.children(recursive=True)])
    except psutil.Error:
        return None


def stop_process_tree(proc: subprocess.Popen):
    try:
        import psutil
        parent = psutil.Process(proc.pid)
        for child in parent.children(recursive=True):
            child.kill()
    except (ImportError, psutil.Error):
        pass
    proc.kill()


def run_case(machines: int, employees: int, orders: int, cross_factory: bool = False,
             time_limit: float = 5.0, plans: bool = False):
    from app.model import PRESETS, solve
    from app.plans import make_plans
    from app.schemas import Event, Now, PlanRequest
    from app.validate import check

    snap = snapshot_for(machines, employees, orders, cross_factory)
    now = Now(date="2026-09-28", min=480)
    if plans:
        started = time.monotonic()
        result = make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"),
                                        now=now, time_limit=time_limit))
        print(json.dumps({"options": [{"id": option["id"], "status": option["status"],
                                        "applicable": option["applicable"]} for option in result["options"]],
                          "seconds": round(time.monotonic() - started, 2)}), flush=True)
        return
    result = solve(snap, now, PRESETS["on_time"],
                   time_limit=time_limit, days=45, workers=8)
    print(json.dumps({"status": result.status, "operations": result.n_ops,
                      "blocks": len(result.blocks), "solve_seconds": round(result.wall, 2),
                      "unplaced": len(result.unplaced),
                      "valid": not check(snap, result.blocks, now) if result.status in ("OPTIMAL", "FEASIBLE") else None}),
          flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", nargs=3, type=int)
    parser.add_argument("--cross-factory", action="store_true")
    parser.add_argument("--plans", action="store_true")
    parser.add_argument("--time-limit", type=float, default=5.0)
    parser.add_argument("--large-only", action="store_true")
    parser.add_argument("--cross-only", action="store_true")
    parser.add_argument("--memory-limit-mb", type=int, default=1500)
    args = parser.parse_args()
    if not 0 < args.time_limit <= 60 or not 100 <= args.memory_limit_mb <= 4096:
        parser.error("time limit must be 0-60 seconds and memory limit 100-4096 MB")
    if args.case:
        run_case(*args.case, cross_factory=args.cross_factory,
                 time_limit=args.time_limit, plans=args.plans)
        return
    for machines, employees, orders, cross_factory in ((5, 10, 10, False), (10, 20, 30, False),
                                                       (10, 20, 30, True),
                                                       (20, 40, 50, False), (20, 40, 100, False),
                                                       (20, 40, 100, True)):
        if args.large_only and orders < 100 or args.cross_only and not cross_factory:
            continue
        command = [sys.executable, __file__, "--case", *map(str, (machines, employees, orders)),
                   "--time-limit", str(args.time_limit)]
        if cross_factory:
            command.append("--cross-factory")
        if args.plans:
            command.append("--plans")
        started = time.monotonic()
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        peak = 0
        memory_limited = False
        while proc.poll() is None and time.monotonic() - started < max(30, args.time_limit + 15):
            peak = max(peak, rss_bytes(proc.pid) or 0)
            if peak >= args.memory_limit_mb * 1048576:
                memory_limited = True
                stop_process_tree(proc)
                break
            time.sleep(0.1)
        timed_out = proc.poll() is None and not memory_limited
        if timed_out:
            stop_process_tree(proc)
        stdout, stderr = proc.communicate()
        peak = max(peak, rss_bytes(proc.pid) or 0)
        print(json.dumps({"machines": machines, "employees": employees, "orders": orders,
                          "cross_factory": cross_factory,
                          "plans": args.plans,
                          "time_limit": args.time_limit,
                          "elapsed_seconds": round(time.monotonic() - started, 2),
                          "peak_rss_mb": round(peak / 1048576, 1) if peak else None,
                          "timeout": timed_out, "memory_limited": memory_limited, "exit_code": proc.returncode,
                          "result": stdout.strip(), "error": stderr.strip()[-1000:]},
                         ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

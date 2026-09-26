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


def snapshot_for(machine_count: int, employee_count: int, order_count: int):
    from app.schemas import Calendar, Employee, Machine, Order, Product, Snapshot, Step

    processes = ("cut", "press", "weld", "pack")
    machines = [
        Machine(id=f"m{i}", process=processes[i % 4], products=["p"])
        for i in range(machine_count)
    ]
    employees = [
        Employee(id=f"e{i}", name=f"Employee {i}",
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
            Step(process=p, rate=2) for p in processes
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


def run_case(machines: int, employees: int, orders: int):
    from app.model import PRESETS, solve
    from app.schemas import Now

    snap = snapshot_for(machines, employees, orders)
    result = solve(snap, Now(date="2026-09-28", min=480), PRESETS["on_time"],
                   time_limit=5.0, days=45, workers=8)
    print(json.dumps({"status": result.status, "operations": result.n_ops,
                      "blocks": len(result.blocks), "solve_seconds": round(result.wall, 2)}),
          flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", nargs=3, type=int)
    args = parser.parse_args()
    if args.case:
        run_case(*args.case)
        return
    for case in ((5, 10, 10), (10, 20, 30), (20, 40, 50), (20, 40, 100)):
        command = [sys.executable, __file__, "--case", *map(str, case)]
        started = time.monotonic()
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        peak = 0
        while proc.poll() is None and time.monotonic() - started < 30:
            peak = max(peak, rss_bytes(proc.pid) or 0)
            time.sleep(0.1)
        timed_out = proc.poll() is None
        if timed_out:
            stop_process_tree(proc)
        stdout, stderr = proc.communicate()
        peak = max(peak, rss_bytes(proc.pid) or 0)
        print(json.dumps({"machines": case[0], "employees": case[1], "orders": case[2],
                          "elapsed_seconds": round(time.monotonic() - started, 2),
                          "peak_rss_mb": round(peak / 1048576, 1) if peak else None,
                          "timeout": timed_out, "exit_code": proc.returncode,
                          "result": stdout.strip(), "error": stderr.strip()[-1000:]},
                         ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

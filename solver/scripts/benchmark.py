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


def snapshot_for(machine_count: int, employee_count: int, order_count: int,
                 cross_factory: bool = False, due_base_days: int = 10,
                 leave_days: int = 0, fault_days: int = 0,
                 heterogeneous: bool = False, transfer_batch: int = 0):
    from app.schemas import Calendar, Employee, Fault, Machine, Order, Product, Snapshot, Step

    processes = ("cut", "press", "weld", "pack")
    factory_for = lambda process: 2 if cross_factory and process in ("weld", "pack") else 1
    start = date(2026, 9, 28)
    machines = [
        Machine(id=f"m{i}", factory=factory_for(processes[i % 4]),
                process=processes[i % 4],
                products=(["p0", "p1"] if i // 4 % 3 == 0 else
                          ["p0"] if i // 4 % 3 == 1 else ["p1"]) if heterogeneous else ["p"],
                faults=[Fault(date=(start + timedelta(days=day)).isoformat(), start=480, end=1020)
                        for day in range(fault_days)] if i < machine_count // 2 else [])
        for i in range(machine_count)
    ]
    employees = [
        Employee(id=f"e{i}", name=f"Employee {i}", factory=factory_for(processes[i % 4]),
                 skills=[m.id for index, m in enumerate(machines)
                         if m.process == processes[i % 4]
                         and (not heterogeneous or (index // 4 + i // 4) % 3 != 0)],
                 leaves=[(start + timedelta(days=day)).isoformat() for day in range(leave_days)]
                 if i < employee_count // 2 else [])
        for i in range(employee_count)
    ]
    orders = [
        Order(id=f"o{i}", code=f"O{i:03}",
              product=("p0" if i % 2 == 0 else "p1") if heterogeneous else "p", qty=120,
              due=(start + timedelta(days=due_base_days + i // 12)).isoformat())
        for i in range(order_count)
    ]
    return Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=machines, employees=employees,
        products=[Product(id=product_id, name=product_id, steps=[
            Step(process=p, factory=factory_for(p), rate=rate,
                 batch=transfer_batch if index else 0)
            for index, p in enumerate(processes)
        ]) for product_id, rate in (("p0", 2), ("p1", 1.5))] if heterogeneous else
        [Product(id="p", name="Product", steps=[
            Step(process=p, factory=factory_for(p), rate=2,
                 batch=transfer_batch if index else 0)
            for index, p in enumerate(processes)
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
             time_limit: float = 5.0, plans: bool = False, pair_cap: int | None = None,
             due_base_days: int = 10, leave_days: int = 0, fault_days: int = 0,
             heterogeneous: bool = False, workers: int = 8, transfer_batch: int = 0):
    from app.model import PRESETS, solve
    from app.plans import make_plans
    from app.schemas import Event, Now, PlanRequest
    from app.timeline import abs_min
    from app.validate import check

    snap = snapshot_for(machines, employees, orders, cross_factory,
                        due_base_days, leave_days, fault_days, heterogeneous, transfer_batch)
    now = Now(date="2026-09-28", min=480)
    if plans:
        started = time.monotonic()
        result = make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"),
                                        now=now, time_limit=time_limit))
        print(json.dumps({"options": [{"id": option["id"], "status": option["status"],
                                        "applicable": option["applicable"],
                                        "late_orders": len(option["metrics"]["late"]),
                                        "score": option["score"],
                                        "solver_method": option["solver_method"],
                                        "solver_candidate_pairs": option["solver_candidate_pairs"]}
                                       for option in result["options"]],
                          "seconds": round(time.monotonic() - started, 2)}), flush=True)
        return
    result = solve(snap, now, PRESETS["on_time"],
                   time_limit=time_limit, days=45, workers=workers, pair_cap=pair_cap)
    last_step = len(snap.products[0].steps) - 1
    finish = {order.id: max((abs_min(block.date, block.end) for block in result.blocks
                             if block.order == order.id and block.step == last_step), default=None)
              for order in snap.orders}
    late = sum(value is not None and value > abs_min(order.due, 1440)
               for order in snap.orders for value in [finish[order.id]])
    print(json.dumps({"status": result.status, "solver_method": result.search_mode,
                      "solver_candidate_pairs": result.candidate_pairs,
                      "objective": result.objective,
                      "operations": result.n_ops,
                      "blocks": len(result.blocks), "solve_seconds": round(result.wall, 2),
                      "late_orders": late if result.status in ("OPTIMAL", "FEASIBLE") else None,
                      "unplaced": len(result.unplaced),
                      "valid": not check(snap, result.blocks, now) if result.status in ("OPTIMAL", "FEASIBLE") else None}),
          flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", nargs=3, type=int)
    parser.add_argument("--sized-case", nargs=3, type=int,
                        help="run one synthetic size through the memory-capped parent")
    parser.add_argument("--cross-factory", action="store_true")
    parser.add_argument("--plans", action="store_true")
    parser.add_argument("--pair-cap", type=int)
    parser.add_argument("--due-base-days", type=int, default=10)
    parser.add_argument("--leave-days", type=int, default=0)
    parser.add_argument("--fault-days", type=int, default=0)
    parser.add_argument("--heterogeneous", action="store_true")
    parser.add_argument("--transfer-batch", type=int, default=0)
    parser.add_argument("--time-limit", type=float, default=5.0)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--large-only", action="store_true")
    parser.add_argument("--cross-only", action="store_true")
    parser.add_argument("--memory-limit-mb", type=int, default=1500)
    args = parser.parse_args()
    if (not 0 < args.time_limit <= 60 or not 100 <= args.memory_limit_mb <= 4096
            or args.pair_cap is not None and args.pair_cap < 1
            or args.due_base_days < 0 or args.leave_days < 0 or args.fault_days < 0
            or not 1 <= args.workers <= 16 or args.transfer_batch < 0
            or args.sized_case is not None and min(args.sized_case) < 1):
        parser.error("time limit must be 0-60 seconds and memory limit 100-4096 MB")
    if args.case:
        run_case(*args.case, cross_factory=args.cross_factory,
                 time_limit=args.time_limit, plans=args.plans, pair_cap=args.pair_cap,
                 due_base_days=args.due_base_days, leave_days=args.leave_days,
                 fault_days=args.fault_days, heterogeneous=args.heterogeneous,
                 workers=args.workers, transfer_batch=args.transfer_batch)
        return
    cases = ([(*args.sized_case, args.cross_factory)] if args.sized_case else
             [(5, 10, 10, False), (10, 20, 30, False), (10, 20, 30, True),
              (20, 40, 50, False), (20, 40, 100, False), (20, 40, 100, True)])
    for machines, employees, orders, cross_factory in cases:
        if args.large_only and orders < 100 or args.cross_only and not cross_factory:
            continue
        command = [sys.executable, __file__, "--case", *map(str, (machines, employees, orders)),
                   "--time-limit", str(args.time_limit)]
        if cross_factory:
            command.append("--cross-factory")
        if args.plans:
            command.append("--plans")
        if args.pair_cap is not None:
            command.extend(("--pair-cap", str(args.pair_cap)))
        command.extend(("--due-base-days", str(args.due_base_days)))
        command.extend(("--leave-days", str(args.leave_days)))
        command.extend(("--fault-days", str(args.fault_days)))
        command.extend(("--workers", str(args.workers)))
        if args.heterogeneous:
            command.append("--heterogeneous")
        command.extend(("--transfer-batch", str(args.transfer_batch)))
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
                          "pair_cap": args.pair_cap,
                          "due_base_days": args.due_base_days,
                          "leave_days": args.leave_days,
                          "fault_days": args.fault_days,
                          "heterogeneous": args.heterogeneous,
                          "workers": args.workers,
                          "transfer_batch": args.transfer_batch,
                          "time_limit": args.time_limit,
                          "elapsed_seconds": round(time.monotonic() - started, 2),
                          "peak_rss_mb": round(peak / 1048576, 1) if peak else None,
                          "timeout": timed_out, "memory_limited": memory_limited, "exit_code": proc.returncode,
                          "result": stdout.strip(), "error": stderr.strip()[-1000:]},
                         ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

"""Bounded, synthetic solver sizing check; never reads or writes production data.

Run from solver/: uv run --with psutil python scripts/benchmark.py
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import subprocess
import sys
import time
from collections import defaultdict
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
             heterogeneous: bool = False, workers: int = 8, transfer_batch: int = 0,
             details: bool = False, event: str = "auto", option: str | None = None,
             extra_overtime: bool = False, prefill: bool = False):
    from app.model import PRESETS, solve
    from app.plans import STRATEGIES, apply_event, make_plans
    from app.schemas import Event, Now, PlanRequest
    from app.timeline import Timeline, abs_min
    from app.validate import check

    snap = snapshot_for(machines, employees, orders, cross_factory,
                        due_base_days, leave_days, fault_days, heterogeneous, transfer_batch)
    now = Now(date="2026-09-28", min=480)
    affected = None
    if prefill:
        initial = solve(snap, now, PRESETS["on_time"], time_limit=max(10, time_limit), workers=workers)
        if initial.status not in ("OPTIMAL", "FEASIBLE") or check(snap, initial.blocks, now):
            print(json.dumps({"prefill_status": initial.status,
                              "diagnostics": initial.unplaced[:2]}, ensure_ascii=False), flush=True)
            return
        snap.blocks = [block.model_copy(update={"id": f"seed-{index}"})
                       for index, block in enumerate(initial.blocks)]
        affected = min(snap.blocks, key=lambda block: abs_min(block.date, block.start))
        now = Now(date=affected.date, min=affected.start)
    selected_event = (Event(type="fault", machine=affected.machine if affected else snap.machines[0].id,
                            date=now.date, start=now.min, end=min(1020, now.min + 120)) if event == "fault" else
                      Event(type="leave", employee=affected.employee if affected else snap.employees[0].id,
                            date=now.date)
                      if event == "leave" else Event(type="auto"))
    if plans:
        os.environ["SOLVER_MAX_WORKERS"] = str(workers)
        started = time.monotonic()
        original = STRATEGIES[event]
        if option is not None:
            STRATEGIES[event] = [strategy for strategy in original if strategy.id == option]
        try:
            result = make_plans(PlanRequest(snapshot=snap, event=selected_event,
                                            now=now, time_limit=time_limit))
        finally:
            STRATEGIES[event] = original
        encoded_started = time.monotonic()
        encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        response_bytes = len(encoded)
        serialization_seconds = time.monotonic() - encoded_started
        compressed_started = time.monotonic()
        gzip_bytes = len(gzip.compress(encoded, compresslevel=6))
        gzip_seconds = time.monotonic() - compressed_started
        print(json.dumps({"event": event, "option": option, "workers": workers,
                          "prefill": prefill, "prefill_blocks": len(snap.blocks),
                          "event_day": now.date,
                          "response_bytes": response_bytes,
                          "serialization_seconds": round(serialization_seconds, 3),
                          "gzip_bytes": gzip_bytes,
                          "gzip_seconds": round(gzip_seconds, 3),
                          "affected_machine": affected.machine if affected and event == "fault" else None,
                          "affected_employee": affected.employee if affected and event == "leave" else None,
                          "options": [{"id": option["id"], "status": option["status"],
                                        "applicable": option["applicable"],
                                        "late_orders": len(option["metrics"]["late"]) if option["applicable"] else None,
                                        "moved_blocks": option["metrics"]["moved"],
                                        "diagnostics": option["diagnostics"][:2] if not option["applicable"] else [],
                                        "score": option["score"],
                                        "solver_method": option["solver_method"],
                                        "solver_candidate_pairs": option["solver_candidate_pairs"]}
                                       for option in result["options"]],
                          "seconds": round(time.monotonic() - started, 2)}), flush=True)
        return
    if event != "auto":
        snap = apply_event(snap, selected_event, now).snap
    result = solve(snap, now, PRESETS["on_time"],
                   extra_overtime=frozenset({now.date}) if extra_overtime else frozenset(),
                   time_limit=time_limit, days=45, workers=workers, pair_cap=pair_cap)
    last_step = len(snap.products[0].steps) - 1
    finish = {order.id: max((abs_min(block.date, block.end) for block in result.blocks
                             if block.order == order.id and block.step == last_step), default=None)
              for order in snap.orders}
    late = sum(value is not None and value > abs_min(order.due, 1440)
               for order in snap.orders for value in [finish[order.id]])
    output = {"status": result.status, "solver_method": result.search_mode,
              "solver_candidate_pairs": result.candidate_pairs,
              "objective": result.objective,
              "operations": result.n_ops,
              "blocks": len(result.blocks), "solve_seconds": round(result.wall, 2),
              "late_orders": late if result.status in ("OPTIMAL", "FEASIBLE") else None,
              "unplaced": len(result.unplaced),
              "diagnostics": result.unplaced[:2] if result.status not in ("OPTIMAL", "FEASIBLE") else [],
              "valid": not check(snap, result.blocks, now,
                                 frozenset({now.date}) if extra_overtime else frozenset())
              if result.status in ("OPTIMAL", "FEASIBLE") else None}
    if details and output["valid"] and not result.unplaced:
        finish_blocks = {order.id: max((block for block in result.blocks
                                        if block.order == order.id and block.step == last_step),
                                       key=lambda block: abs_min(block.date, block.end))
                         for order in snap.orders}
        late_by_product = defaultdict(int)
        late_by_due = defaultdict(int)
        late_days_total = 0
        for order in snap.orders:
            delay = max(0, (date.fromisoformat(finish_blocks[order.id].date)
                            - date.fromisoformat(order.due)).days)
            if delay:
                late_by_product[order.product] += 1
                due_delta = (date.fromisoformat(order.due) - date(2026, 9, 28)).days
                late_by_due["0-4" if due_delta < 5 else "5-9" if due_delta < 10 else "10+"] += 1
                late_days_total += delay
        window_start = date.fromisoformat(now.date)
        window_end = (window_start + timedelta(days=4)).isoformat()
        timeline = Timeline(snap.calendar, now.date, 5,
                            frozenset({now.date}) if extra_overtime else frozenset())
        load = defaultdict(int)
        capacity = defaultdict(int)
        products_by_id = {product.id: product for product in snap.products}
        orders_by_id = {order.id: order for order in snap.orders}
        for block in result.blocks:
            if now.date <= block.date <= window_end:
                order = orders_by_id[block.order]
                process = products_by_id[order.product].steps[block.step].process
                load[process] += block.end - block.start
        for machine in snap.machines:
            for window in timeline.wins:
                unavailable = sum(max(0, min(window.end, fault.end) - max(window.start, fault.start))
                                  for fault in machine.faults if fault.date == window.date)
                capacity[machine.process] += max(0, window.end - window.start - unavailable)
        output["details"] = {
            "late_by_product": dict(late_by_product), "late_by_due": dict(late_by_due),
            "late_calendar_days_total": late_days_total,
            "first_five_day_machine_utilization_pct": {
                process: round(100 * load[process] / minutes, 1) if minutes else None
                for process, minutes in capacity.items()},
        }
    print(json.dumps(output), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", nargs=3, type=int)
    parser.add_argument("--sized-case", nargs=3, type=int,
                        help="run one synthetic size through the memory-capped parent")
    parser.add_argument("--cross-factory", action="store_true")
    parser.add_argument("--plans", action="store_true")
    parser.add_argument("--prefill", action="store_true",
                        help="first solve and ID existing work, then inject an event on its first workday")
    parser.add_argument("--event", choices=("auto", "fault", "leave"), default="auto",
                        help="event to exercise with --plans")
    parser.add_argument("--option", choices=("A", "B", "C", "D"),
                        help="limit --plans benchmark to one strategy")
    parser.add_argument("--extra-overtime", action="store_true", help="open the event day for direct solve")
    parser.add_argument("--pair-cap", type=int)
    parser.add_argument("--due-base-days", type=int, default=10)
    parser.add_argument("--leave-days", type=int, default=0)
    parser.add_argument("--fault-days", type=int, default=0)
    parser.add_argument("--heterogeneous", action="store_true")
    parser.add_argument("--transfer-batch", type=int, default=0)
    parser.add_argument("--details", action="store_true")
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
    if args.option and not args.plans:
        parser.error("--option requires --plans")
    if args.prefill and not args.plans:
        parser.error("--prefill requires --plans")
    if args.case:
        run_case(*args.case, cross_factory=args.cross_factory,
                 time_limit=args.time_limit, plans=args.plans, pair_cap=args.pair_cap,
                 due_base_days=args.due_base_days, leave_days=args.leave_days,
                 fault_days=args.fault_days, heterogeneous=args.heterogeneous,
                 workers=args.workers, transfer_batch=args.transfer_batch,
                 details=args.details, event=args.event, option=args.option,
                 extra_overtime=args.extra_overtime, prefill=args.prefill)
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
        if args.prefill:
            command.append("--prefill")
        command.extend(("--event", args.event))
        if args.option:
            command.extend(("--option", args.option))
        if args.extra_overtime:
            command.append("--extra-overtime")
        if args.pair_cap is not None:
            command.extend(("--pair-cap", str(args.pair_cap)))
        command.extend(("--due-base-days", str(args.due_base_days)))
        command.extend(("--leave-days", str(args.leave_days)))
        command.extend(("--fault-days", str(args.fault_days)))
        command.extend(("--workers", str(args.workers)))
        if args.heterogeneous:
            command.append("--heterogeneous")
        command.extend(("--transfer-batch", str(args.transfer_batch)))
        if args.details:
            command.append("--details")
        started = time.monotonic()
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        peak = 0
        memory_limited = False
        # 多方案在大模型上逐案求解；外層保護時限需涵蓋所有策略，不能在
        # 每案合法的 10 秒預算下提早殺掉整個預覽程序。
        parent_limit = max(30, args.time_limit * (4 if args.plans else 1) + 30
                           + (max(10, args.time_limit) + 20 if args.prefill else 0))
        while proc.poll() is None and time.monotonic() - started < parent_limit:
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
                          "prefill": args.prefill,
                          "event": args.event,
                          "option": args.option,
                          "extra_overtime": args.extra_overtime,
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

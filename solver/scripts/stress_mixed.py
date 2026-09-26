"""Bounded, deterministic mixed scheduling scenarios; synthetic data only.

Run from solver/: uv run python scripts/stress_mixed.py --cases 30
"""
from __future__ import annotations

import argparse
import random
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.model import PRESETS, solve
from app.schemas import Calendar, Employee, Fault, Machine, Now, Order, Product, Snapshot, Step
from app.validate import check


START = date(2026, 9, 28)
PROCESSES = ("cut", "press", "weld", "pack")


def case(seed: int) -> tuple[Snapshot, Now, int | None]:
    rng = random.Random(seed)
    machines = []
    employees = []
    for index, process in enumerate(PROCESSES):
        factory = 1 if index < 2 else 2
        for number in range(2):
            machine_id = f"{process}{number}"
            fault = ([Fault(date=START.isoformat(), start=480, end=720)]
                     if number == 0 and rng.choice((False, True)) else [])
            machines.append(Machine(id=machine_id, factory=factory, process=process,
                                    products=["p0", "p1"], faults=fault))
            employees.append(Employee(id=f"e{machine_id}", name=machine_id,
                                      factory=factory, skills=[machine_id],
                                      leaves=[START.isoformat()] if number == 0 and rng.choice((False, True)) else []))
    products = []
    for product_id in ("p0", "p1"):
        products.append(Product(id=product_id, name=product_id, steps=[
            Step(process=process, factory=1 if index < 2 else 2,
                 rate=rng.choice((1, 1.5, 2)),
                 batch=rng.choice((0, 30, 60)) if index else 0)
            for index, process in enumerate(PROCESSES)
        ]))
    orders = [Order(id=f"o{i}", code=f"O{i}", product=rng.choice(("p0", "p1")),
                    qty=rng.choice((60, 90, 120)),
                    due=(START + timedelta(days=rng.randrange(1, 7))).isoformat(),
                    priority=rng.randrange(4))
              for i in range(rng.randrange(3, 9))]
    snapshot = Snapshot(calendar=Calendar(week=[False, True, True, True, True, True, False]),
                        machines=machines, employees=employees, products=products, orders=orders)
    return snapshot, Now(date=START.isoformat(), min=480), (None, 1, 2)[seed % 3]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", type=int, default=30)
    parser.add_argument("--time-limit", type=float, default=0.5)
    args = parser.parse_args()
    if not 1 <= args.cases <= 300 or not 0 < args.time_limit <= 2:
        parser.error("cases must be 1-300 and time-limit must be 0-2 seconds")
    counts = Counter()
    for seed in range(args.cases):
        snapshot, now, pair_cap = case(seed)
        result = solve(snapshot, now, PRESETS["on_time"], days=10,
                       time_limit=args.time_limit, workers=2, pair_cap=pair_cap)
        counts[result.status] += 1
        if result.status in ("OPTIMAL", "FEASIBLE"):
            issues = check(snapshot, result.blocks, now)
            if issues or result.unplaced:
                print({"seed": seed, "pair_cap": pair_cap, "status": result.status,
                       "issues": issues, "unplaced": result.unplaced})
                raise SystemExit(1)
        elif result.status not in ("UNKNOWN",):
            print({"seed": seed, "pair_cap": pair_cap, "status": result.status,
                   "unplaced": result.unplaced})
            raise SystemExit(1)
    print(f"{args.cases} mixed scenarios: {dict(counts)}; all returned schedules valid")


if __name__ == "__main__":
    main()

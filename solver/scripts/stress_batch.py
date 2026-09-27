"""Deterministic small cross-factory batch cases; synthetic data only.

Run from solver/: uv run python scripts/stress_batch.py --cases 100
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.model import PRESETS, dur_of, solve
from app.schemas import Block, Calendar, Employee, Machine, Now, Order, Product, Snapshot, Step
from app.validate import check


def case(seed: int):
    rng = random.Random(seed)
    qty = rng.choice((60, 90, 120, 180))
    first_rate = rng.choice((1, 1.5, 2))
    second_rate = rng.choice((1, 1.5, 2))
    batch = rng.choice((0, 10, qty // 2, qty - 10))
    fixed_qty = rng.choice(tuple(range(0, qty + 1, 10)))
    fixed_end = 480 + dur_of(fixed_qty, first_rate) if fixed_qty else 480
    blocks = ([Block(order="o", step=0, machine="m1", employee="e1",
                     date="2026-09-28", start=480, end=fixed_end, qty=fixed_qty)]
              if fixed_qty else [])
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="m1", factory=1, process="cut", products=["p"]),
                  Machine(id="m2", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="One", factory=1, skills=["m1"]),
                   Employee(id="e2", name="Two", factory=2, skills=["m2"])],
        products=[Product(id="p", name="Part", steps=[
            Step(process="cut", factory=1, rate=first_rate),
            Step(process="weld", factory=2, rate=second_rate, batch=batch),
        ])],
        orders=[Order(id="o", code="O", product="p", qty=qty, due="2026-09-28")],
        blocks=blocks,
    )
    return snap, Now(date="2026-09-28", min=fixed_end), {
        "seed": seed, "qty": qty, "first_rate": first_rate,
        "second_rate": second_rate, "batch": batch, "fixed_qty": fixed_qty,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.cases <= 1000:
        parser.error("cases must be 1-1000")
    for seed in range(args.cases):
        snap, now, desc = case(seed)
        result = solve(snap, now, PRESETS["on_time"], time_limit=0.5, days=5, workers=2)
        issues = check(snap, result.blocks, now) if result.status in ("OPTIMAL", "FEASIBLE") else []
        if result.status not in ("OPTIMAL", "FEASIBLE") or issues or result.unplaced:
            print({**desc, "status": result.status, "issues": issues,
                   "unplaced": result.unplaced})
            raise SystemExit(1)
    print(f"{args.cases} cross-factory batch cases valid")


if __name__ == "__main__":
    main()

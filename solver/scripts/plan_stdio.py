"""Local-only JSON bridge for the database/solver integration test; never opens a network port."""
from __future__ import annotations

import json
import sys

from app.plans import make_plans
from app.schemas import Now, PlanRequest, Snapshot
from app.validate import check


def main() -> None:
    request = json.load(sys.stdin)
    if request.get("mode") == "check":
        snapshot = Snapshot.model_validate(request["snapshot"])
        now = Now.model_validate(request["now"])
        json.dump({"issues": check(snapshot, snapshot.blocks, now)}, sys.stdout, ensure_ascii=False)
        return
    plan = make_plans(PlanRequest.model_validate(request))
    json.dump(plan, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()

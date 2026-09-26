import json
from pathlib import Path

import pytest

from app.schemas import Block, Now, Snapshot

FIX = Path(__file__).parent / "fixtures" / "demo.json"


@pytest.fixture
def demo() -> tuple[Snapshot, Now]:
    """和原型網頁一樣的示範資料；blocks 是原型（貪婪法）排出來的排程。"""
    d = json.loads(FIX.read_text(encoding="utf-8"))
    now = Now(**d.pop("now"))
    return Snapshot(**d), now


def snapshot_after(plan: dict, opt: dict, base: Snapshot) -> Snapshot:
    """把方案的結果套回快照（模擬 apply_plan），給下一個事件或檢查用。"""
    from app.plans import from_db
    from app.schemas import Fault, Order

    s = base.model_copy(deep=True)
    eff = opt["effects"]
    for f in eff.get("faults_insert", []):
        m = next(m for m in s.machines if m.id == f["machine_id"])
        m.faults.append(Fault(id=f["id"], date=f["date"], start=f["start_min"], end=f["end_min"], note=f.get("note"),
                              original_blocks=f.get("original_blocks", [])))
    for u in eff.get("faults_update", []):
        for m in s.machines:
            for f in m.faults:
                if f.id == u["id"]:
                    f.end = u.get("end_min") or f.end
                    f.fixed = True
    for fid in eff.get("faults_delete", []):
        for m in s.machines:
            m.faults = [f for f in m.faults if f.id != fid]
    for lv in eff.get("leaves_insert", []):
        e = next(e for e in s.employees if e.id == lv["employee_id"])
        e.leaves.append(lv["date"])
    for d in eff.get("overtime_on", []):
        s.calendar.overtime[d] = True
    for o in eff.get("orders_upsert", []):
        s.orders = [x for x in s.orders if x.id != o["id"]] + [
            Order(id=o["id"], code=o["code"], product=o["product_id"], qty=o["qty"], due=o["due_date"], priority=o["priority"])]
    s.blocks = [from_db(b) for b in opt["blocks"]]
    return s

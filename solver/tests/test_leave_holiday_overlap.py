"""缺陷#17：請假日的假日／加班時段重疊造成全案 INFEASIBLE。

重現（模擬驗收 C1-C7 FAIL=6 的根因）：一名與工單完全無關的員工
（甚至無任何技能）請假在「同時是國定假日」的那天，整個模型就
INFEASIBLE——請假整天 span 與不能加班者的假日 window span 重疊，
兩者各以 max_concurrent_machines 為需求量進 add_cumulative，
需求和 2×容量超過容量本身。
"""
from __future__ import annotations

from app.model import PRESETS, solve
from app.schemas import Employee, Machine, Now, Order, Snapshot, Step, Product

NOW = Now(date="2026-10-12", min=480)


def _snapshot(extra_employee: Employee) -> Snapshot:
    return Snapshot(
        calendar={"week": [False, True, True, True, True, True, False],
                  "windows": [{"start": 480, "end": 720, "overtime": False},
                              {"start": 780, "end": 1020, "overtime": False}],
                  "holidays": {"2026-10-25": "光復節", "2026-10-26": "光復節補假"}},
        machines=[Machine(id="m1", label="M1", factory=1, process="裁切", products=["p"]),
                  Machine(id="m2", label="M2", factory=1, process="焊接", products=["p"])],
        products=[Product(id="p", name="P", steps=[Step(process="裁切", factory=1, rate=2, batch=60),
                                                   Step(process="焊接", factory=1, rate=1, batch=0)])],
        employees=[Employee(id="e1", name="甲", factory=1, skills=["m1", "m2"],
                            max_concurrent_machines=1, no_overtime=True, overtime_weekdays=[]),
                   extra_employee],
        orders=[Order(id="o1", code="O1", product="p", qty=120, due="2026-10-26", priority=1)],
        blocks=[],
    )


def _solve(extra: Employee):
    return solve(_snapshot(extra), NOW, PRESETS["on_time"], time_limit=5)


def test_leave_on_due_holiday_does_not_poison_model() -> None:
    # 2026-10-26＝光復節補假（假日）；無技能的 F2 員工當天請假——修復前 INFEASIBLE
    bystander = Employee(id="z1", name="路人", factory=2, skills=[],
                         max_concurrent_machines=1, leaves=["2026-10-26"],
                         no_overtime=True, overtime_weekdays=[])
    result = _solve(bystander)
    assert result.status in ("OPTIMAL", "FEASIBLE"), f"修復前全案 INFEASIBLE：{result.unplaced}"


def test_leave_on_plain_day_stays_feasible() -> None:
    # 對照組：請假在非假日（10-27）本來就可排——修復不得破壞
    bystander = Employee(id="z1", name="路人", factory=2, skills=[],
                         max_concurrent_machines=1, leaves=["2026-10-27"],
                         no_overtime=True, overtime_weekdays=[])
    result = _solve(bystander)
    assert result.status in ("OPTIMAL", "FEASIBLE")


def test_cannot_overtime_employee_on_holiday_alone_still_feasible() -> None:
    # 對照組：不能加班者在場但沒請假——假日 window span 單獨存在不重疊，本來就可排
    bystander = Employee(id="z1", name="路人", factory=2, skills=[],
                         max_concurrent_machines=1, no_overtime=True, overtime_weekdays=[])
    result = _solve(bystander)
    assert result.status in ("OPTIMAL", "FEASIBLE")

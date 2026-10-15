"""Calendar bans are a union, not simultaneous work consuming capacity twice."""
from app.model import solve, PRESETS
from app.schemas import Snapshot, Now
from app.validate import check


def fixture():
    return Snapshot.model_validate({
        "calendar": {"week": [False, True, True, True, True, True, False],
                     "windows": [{"start": 480, "end": 720, "overtime": False},
                                 {"start": 780, "end": 1020, "overtime": False}],
                     "holidays": {"2026-10-14": "TEST holiday"}},
        "employees": [{"id": "TEST-E01", "name": "TEST worker", "skills": ["TEST-M01"]}],
        "machines": [{"id": "TEST-M01", "process": "TEST process", "products": ["TEST-P01"]}],
        "products": [{"id": "TEST-P01", "name": "TEST product",
                      "steps": [{"process": "TEST process", "rate": 2}]}],
        "orders": [{"id": "TEST-O01", "code": "TEST-O01", "product": "TEST-P01", "qty": 120,
                    "due": "2026-10-16"}], "blocks": [],
    })


def test_unused_employee_leave_on_open_holiday_cannot_poison_other_workers():
    snap = fixture()
    from app.schemas import Employee
    snap.employees.append(Employee(id="TEST-unused", name="TEST unused", skills=[],
                                   no_overtime=True, leaves=["2026-10-14"]))
    now = Now(date="2026-10-12", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=2)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.blocks and check(snap, result.blocks, now) == []


def test_duplicate_leave_dates_are_one_unavailable_period():
    snap = fixture()
    snap.employees[0].leaves = ["2026-10-14", "2026-10-14"]
    now = Now(date="2026-10-12", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=2)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.blocks and all(b.date != "2026-10-14" for b in result.blocks)
    assert check(snap, result.blocks, now) == []


def test_overlapping_real_manual_work_must_still_be_infeasible():
    snap = fixture()
    from app.schemas import WorkAssignment
    snap.work_assignments = [
        WorkAssignment(id="TEST-W01", emp="TEST-E01", workId="TEST-content", date="2026-10-12", s=480, e=600),
        WorkAssignment(id="TEST-W02", emp="TEST-E01", workId="TEST-content", date="2026-10-12", s=540, e=660),
    ]
    result = solve(snap, Now(date="2026-10-12", min=480), PRESETS["on_time"], time_limit=2)
    assert result.status == "INFEASIBLE"

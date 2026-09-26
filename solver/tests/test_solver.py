"""排程服務測試：時間軸、OR-Tools 模型、各種突發狀況的方案、API。"""
from fastapi.testclient import TestClient
from datetime import date, timedelta
from unittest.mock import patch

from ortools.sat.python import cp_model
from pydantic import ValidationError
import pytest

from app import main as api
from app import plans as plan_api
from app.main import app
from app.model import PRESETS, Result, Weights, configured_workers, solve
from app.plans import make_plans
from app.schemas import Block, Calendar, Employee, Event, Fault, Machine, Now, Order, PlanRequest, Product, Snapshot, Step, WindowDef
from app.timeline import Timeline, abs_min
from app.validate import check

from .conftest import snapshot_after
from scripts.benchmark import snapshot_for
from scripts.stress_batch import case as batch_case
from scripts.stress_mixed import case as mixed_case


def finish_total(snap, blocks):
    prods = {p.id: p for p in snap.products}
    tot = 0
    for o in snap.orders:
        last = len(prods[o.product].steps) - 1
        tot += max(abs_min(b.date, b.end) for b in blocks if b.order == o.id and b.step == last)
    return tot


# ---------- 時間軸 ----------
def test_timeline_splits_at_lunch_weekend_and_holiday(demo):
    snap, now = demo
    tl = Timeline(snap.calendar, "2026-09-26", 10)
    t = tl.to_t("2026-09-26", 930)                  # 週六 15:30（週六照常上班）
    segs = tl.to_real(t, t + 300)                   # 做 5 小時
    # 週六做到 17:00 → 週日停工 → 9/28 教師節照常上班（只是標示）08:00 起
    assert segs == [("2026-09-26", 930, 1020), ("2026-09-28", 480, 690)]
    assert tl.to_t("2026-09-28", 720) == tl.to_t("2026-09-28", 780), "午休不佔時間軸"
    assert tl.window_of("2026-09-27", 480, 540) is None, "週日停工"


def test_timeline_overtime_window_only_when_enabled(demo):
    snap, _ = demo
    assert Timeline(snap.calendar, "2026-09-29", 1).horizon == 480
    assert Timeline(snap.calendar, "2026-09-29", 1, {"2026-09-29"}).horizon == 660


def test_validator_accepts_workday_beyond_ninety_days():
    future_day = "2027-01-04"  # 2026-09-28 起第 99 天，週一上班
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="m", process="cut", products=["p"])],
        employees=[Employee(id="e", name="Worker", skills=["m"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", rate=1)])],
        orders=[Order(id="o", code="O", product="p", qty=60, due=future_day)],
        blocks=[Block(order="o", step=0, machine="m", employee="e",
                      date=future_day, start=480, end=540, qty=60)],
    )
    assert check(snap, snap.blocks, Now(date="2026-09-28", min=480)) == []


def test_employee_weekly_overtime_and_one_day_override(demo):
    snap, now = demo
    employee = next(e for e in snap.employees if e.id == "e1")
    employee.overtime_weekdays = [1, 3, 5]  # 週一、三、五；週六不加班
    assert not employee.allows_overtime("2026-09-26")
    assert employee.allows_overtime("2026-09-28")
    assert any("張三 不能加班" in issue for issue in check(snap, snap.blocks, now))
    employee.overtime_overrides["2026-09-26"] = True
    assert employee.allows_overtime("2026-09-26")
    assert not any("張三 不能加班" in issue for issue in check(snap, snap.blocks, now))


def test_solver_respects_one_day_overtime_change(demo):
    snap, _ = demo
    employee = next(e for e in snap.employees if e.id == "e1")
    employee.overtime_weekdays = [1]  # 只允許週一（週六出勤也算加班）
    snap.employees = [employee]
    snap.machines = [next(m for m in snap.machines if m.id == "a")]
    product = next(p for p in snap.products if p.id == "p1")
    product.steps = product.steps[:1]
    snap.products = [product]
    snap.orders = [Order(id="test", code="T01", product="p1", qty=20, due="2026-09-30", priority=1)]
    snap.blocks = []
    now = Now(date="2026-09-26", min=480)
    planned = solve(snap, now, PRESETS["on_time"], time_limit=2)
    assert planned.blocks and all(b.date == "2026-09-28" for b in planned.blocks)
    employee.overtime_overrides["2026-09-26"] = True
    changed = solve(snap, now, PRESETS["on_time"], time_limit=2)
    assert changed.blocks and all(b.date == "2026-09-26" for b in changed.blocks)


def test_employee_machine_limit_allows_two_machines_but_not_three():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[Employee(id="e", name="甲", skills=["a", "b", "c"], max_concurrent_machines=2)],
        machines=[Machine(id=id, process="裁切", products=["p"]) for id in ("a", "b", "c")],
        products=[Product(id="p", name="產品", steps=[Step(process="裁切", rate=1)])],
        orders=[Order(id=f"o{i}", code=f"O{i}", product="p", qty=120, due=day) for i in range(3)],
    )
    now = Now(date=day, min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, result.blocks, now) == []
    events = sorted([(b.start, 1) for b in result.blocks if b.date == day] +
                    [(b.end, -1) for b in result.blocks if b.date == day])
    concurrent = peak = 0
    for _, change in events:
        concurrent += change
        peak = max(peak, concurrent)
    assert peak == 2
    snap.employees[0].max_concurrent_machines = 1
    assert any("超過上限 1" in issue for issue in check(snap, result.blocks, now))
    single = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert single.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, single.blocks, now) == []


# ---------- 模型 ----------
def test_solver_worker_limit_can_be_configured_without_changing_default(demo, monkeypatch):
    snap, now = demo
    monkeypatch.delenv("SOLVER_MAX_WORKERS", raising=False)
    assert configured_workers() == 8
    monkeypatch.setenv("SOLVER_MAX_WORKERS", "4")
    assert configured_workers() == 4
    used = []

    def report_workers(solver, model):
        used.append(solver.parameters.num_workers)
        return cp_model.UNKNOWN

    with patch.object(cp_model.CpSolver, "solve", report_workers):
        solve(snap, now, PRESETS["on_time"], time_limit=0.01)
    assert used == [4]
    monkeypatch.setenv("SOLVER_MAX_WORKERS", "invalid")
    assert configured_workers() == 8


def test_plan_worker_limit_is_shared_across_parallel_options(monkeypatch):
    monkeypatch.setenv("SOLVER_MAX_WORKERS", "4")
    snap = Snapshot(calendar=Calendar(week=[False, True, True, True, True, True, False]),
                    machines=[], employees=[], products=[], orders=[])
    used = []

    def fake_solve(snapshot, now, weights, **kwargs):
        used.append(kwargs["workers"])
        return Result([], "UNKNOWN", None, 0, 0, ["測試用未完成方案"])

    monkeypatch.setattr(plan_api, "solve", fake_solve)
    make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"),
                           now=Now(date="2026-09-28", min=480), time_limit=0.1))
    assert used == [1, 1], "兩個實際求解選項同時執行時，總工作者不超過設定上限"


def test_cross_factory_steps_keep_one_order_and_precedence():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[Employee(id="e1", name="一廠員工", factory=1, skills=["a"]),
                   Employee(id="e2", name="二廠員工", factory=2, skills=["b"])],
        machines=[Machine(id="a", factory=1, process="裁切", products=["p"]),
                  Machine(id="b", factory=2, process="焊接", products=["p"])],
        products=[Product(id="p", name="跨廠產品", steps=[Step(process="裁切", factory=1, rate=1),
                                                Step(process="焊接", factory=2, rate=1)])],
        orders=[Order(id="o", code="O1", product="p", qty=60, due=day)],
    )
    result = solve(snap, Now(date=day, min=480), PRESETS["on_time"], time_limit=3)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, result.blocks) == []
    first = next(b for b in result.blocks if b.step == 0)
    second = next(b for b in result.blocks if b.step == 1)
    assert (first.machine, first.employee) == ("a", "e1")
    assert (second.machine, second.employee) == ("b", "e2")
    assert abs_min(second.date, second.start) >= abs_min(first.date, first.end)
    wrong = second.model_copy(update={"employee": "e1"})
    assert any("不在同一廠" in issue for issue in check(snap, [first, wrong]))


def test_unknown_does_not_retry_with_larger_horizon(demo):
    snap, now = demo
    with patch.object(cp_model.CpSolver, "solve", return_value=cp_model.UNKNOWN) as mocked:
        result = solve(snap, now, PRESETS["on_time"], time_limit=0.01)
    assert mocked.call_count == 1, "求解超時不是無解，不應擴大日期再跑兩次"
    assert result.status == "UNKNOWN"
    assert any("計算時間內" in reason for reason in result.unplaced)


def test_invalid_model_is_not_reported_as_resource_shortage(demo):
    snap, now = demo
    with patch.object(cp_model.CpSolver, "solve", return_value=cp_model.MODEL_INVALID) as mocked:
        result = solve(snap, now, PRESETS["on_time"], time_limit=0.01)
    assert mocked.call_count == 1
    assert result.status == "MODEL_INVALID"
    assert any("模型無法完成" in reason for reason in result.unplaced)


def test_missing_cross_factory_machine_explains_and_blocks_apply():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[Employee(id="e", name="一廠員工", factory=1, skills=["a"])],
        machines=[Machine(id="a", factory=1, process="裁切", products=["p"])],
        products=[Product(id="p", name="產品", steps=[Step(process="裁切", factory=2, rate=1)])],
        orders=[Order(id="o", code="O1", product="p", qty=60, due=day)],
    )
    plan = make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"), now=Now(date=day, min=480), time_limit=0.2))
    assert not any(o.get("recommended") for o in plan["options"])
    assert all(not o["applicable"] for o in plan["options"])
    assert any("2 廠" in reason and "機台" in reason for reason in plan["options"][0]["diagnostics"])
    assert any("其他廠有 a" in reason for reason in plan["options"][0]["diagnostics"])


def test_no_working_day_gives_specific_action():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False] * 7),
        employees=[Employee(id="e", name="甲", skills=["a"])],
        machines=[Machine(id="a", process="裁切", products=["p"])],
        products=[Product(id="p", name="產品", steps=[Step(process="裁切", rate=1)])],
        orders=[Order(id="o", code="O1", product="p", qty=60, due=day)],
    )
    result = solve(snap, Now(date=day, min=480), PRESETS["on_time"], days=7)
    assert result.status == "NO_WORKING_TIME"
    assert any("上班日設定" in reason for reason in result.unplaced)


def test_all_skilled_staff_on_leave_gives_specific_action():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[Employee(id="e", name="甲", skills=["a"],
                            leaves=[(date.fromisoformat(day) + timedelta(days=i)).isoformat() for i in range(240)])],
        machines=[Machine(id="a", process="裁切", products=["p"])],
        products=[Product(id="p", name="產品", steps=[Step(process="裁切", rate=1)])],
        orders=[Order(id="o", code="O1", product="p", qty=60, due=day)],
    )
    result = solve(snap, Now(date=day, min=480), PRESETS["on_time"], days=1)
    assert result.status == "NO_AVAILABLE_PAIR"
    assert any("請假" in reason and "故障" in reason for reason in result.unplaced)


def test_short_horizon_leave_expands_to_next_available_day():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[Employee(id="e", name="甲", skills=["a"], leaves=[day])],
        machines=[Machine(id="a", process="裁切", products=["p"])],
        products=[Product(id="p", name="產品", steps=[Step(process="裁切", rate=1)])],
        orders=[Order(id="o", code="O1", product="p", qty=60, due="2026-09-30")],
    )
    result = solve(snap, Now(date=day, min=480), PRESETS["on_time"], days=1, time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.blocks[0].date == "2026-09-29"


def test_machine_without_same_factory_operator_names_action():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[Employee(id="e", name="一廠員工", factory=1, skills=["b"])],
        machines=[Machine(id="b", factory=2, process="焊接", products=["p"])],
        products=[Product(id="p", name="產品", steps=[Step(process="焊接", factory=2, rate=1)])],
        orders=[Order(id="o", code="O1", product="p", qty=60, due=day)],
    )
    plan = make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"), now=Now(date=day, min=480), time_limit=0.2))
    assert all(not o["applicable"] for o in plan["options"])
    assert any("機台 b" in reason and "同廠人員" in reason for reason in plan["options"][0]["diagnostics"])


def test_step_rate_must_be_positive():
    with pytest.raises(ValidationError):
        Step(process="裁切", rate=0)


def test_solver_snapshot_rejects_invalid_quantities_and_priority():
    with pytest.raises(ValidationError):
        Step(process="裁切", rate=1, batch=-1)
    with pytest.raises(ValidationError):
        Order(id="o", code="O", product="p", qty=0, due="2026-09-28")
    with pytest.raises(ValidationError):
        Order(id="o", code="O", product="p", qty=1, due="2026-09-28", priority=4)
    with pytest.raises(ValidationError):
        Block(order="o", step=0, machine="m", employee="e", date="2026-09-28",
              start=480, end=540, qty=0)
    with pytest.raises(ValidationError):
        Block(order="o", step=-1, machine="m", employee="e", date="2026-09-28",
              start=480, end=540, qty=1)
    with pytest.raises(ValidationError):
        Block(order="o", step=0, machine="m", employee="e", date="2026-09-28",
              start=540, end=540, qty=1)
    with pytest.raises(ValidationError):
        Calendar(week=[True, False])
    with pytest.raises(ValidationError):
        Step(process="裁切", rate=float("inf"))
    with pytest.raises(ValidationError):
        Fault(date="2026-09-28", start=540, end=540)
    with pytest.raises(ValidationError):
        WindowDef(start=720, end=720)
    with pytest.raises(ValidationError):
        Calendar(week=[True] * 7, windows=[WindowDef(start=480, end=720),
                                            WindowDef(start=700, end=1020)])


def test_solve_api_returns_validation_error_for_zero_order_quantity(demo):
    snap, now = demo
    payload = {"snapshot": snap.model_dump(), "now": now.model_dump()}
    payload["snapshot"]["orders"][0]["qty"] = 0
    response = TestClient(app).post("/solve", json=payload)
    assert response.status_code == 422


def test_api_rejects_invalid_date_and_incomplete_fault_event(demo):
    snap, now = demo
    payload = {"snapshot": snap.model_dump(), "now": now.model_dump()}
    payload["now"]["date"] = "not-a-date"
    assert TestClient(app).post("/solve", json=payload).status_code == 422

    preview = {"snapshot": snap.model_dump(), "now": now.model_dump(),
               "event": {"type": "fault", "machine": "c", "date": now.date, "start": 480}}
    assert TestClient(app).post("/plans", json=preview).status_code == 422
    invalid_windows = {"snapshot": snap.model_dump(), "now": now.model_dump()}
    invalid_windows["snapshot"]["calendar"]["windows"] = [
        {"start": 480, "end": 720}, {"start": 700, "end": 1020}]
    assert TestClient(app).post("/solve", json=invalid_windows).status_code == 422


def test_missing_product_explains_instead_of_crashing():
    day = "2026-09-28"
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        employees=[], machines=[], products=[],
        orders=[Order(id="o", code="O1", product="missing", qty=60, due=day)],
    )
    plan = make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"), now=Now(date=day, min=480), time_limit=0.2))
    assert all(not o["applicable"] for o in plan["options"])
    assert any("找不到產品" in reason for reason in plan["options"][0]["diagnostics"])
    result = solve(snap, Now(date=day, min=480), PRESETS["on_time"], time_limit=0.2)
    assert result.status == "INCOMPLETE"
    response = TestClient(app).post("/solve", json={"snapshot": snap.model_dump(),
                                               "now": {"date": day, "min": 480}})
    assert response.status_code == 200
    assert response.json()["status"] == "INCOMPLETE"


def test_prototype_schedule_is_valid(demo):
    snap, now = demo
    assert check(snap, snap.blocks, now) == []


def test_on_time_is_valid_and_beats_greedy(demo):
    snap, now = demo
    r = solve(snap, now, PRESETS["on_time"], time_limit=5)
    assert r.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, r.blocks, now) == []
    assert finish_total(snap, r.blocks) < finish_total(snap, snap.blocks), "OR-Tools 應該比原型的貪婪法更早完成"


def test_min_change_keeps_a_valid_schedule_mostly_in_place(demo):
    snap, now = demo
    r = solve(snap, now, PRESETS["min_change"], time_limit=5)
    assert check(snap, r.blocks, now) == []
    same = {(b.order, b.step, b.machine, b.employee) for b in snap.blocks} & {(b.order, b.step, b.machine, b.employee) for b in r.blocks}
    assert len(same) >= 0.8 * len({(b.order, b.step) for b in snap.blocks}), "沒有狀況時，少動模式應該幾乎不換人不換機"


def test_pinned_block_stays(demo):
    snap, now = demo
    b = next(b for b in snap.blocks if b.order == "o4" and b.step == 1 and b.qty == 390)
    b.pinned = True
    r = solve(snap, now, PRESETS["on_time"], time_limit=3)
    assert any(x.id == b.id and x.start == b.start and x.date == b.date for x in r.blocks)
    assert check(snap, r.blocks, now) == []


# ---------- 突發狀況 → 方案 ----------
def test_fault_plans(demo):
    snap, now = demo
    ev = Event(type="fault", machine="c", date="2026-09-28", start=480, end=1020, note="馬達")
    plan = make_plans(PlanRequest(snapshot=snap, event=ev, now=now, time_limit=3))
    ids = [o["id"] for o in plan["options"]]
    assert ids == ["A", "B", "C", "D"]
    assert sum(1 for o in plan["options"] if o.get("recommended")) == 1
    for opt in plan["options"]:
        after = snapshot_after(plan, opt, snap)
        assert check(after, after.blocks, now) == [], opt["name"]
        assert not any(b.machine == "c" and b.date == "2026-09-28" and b.start < 1020 and b.end > 480 for b in after.blocks)
        assert opt["summary"].endswith("。")
        assert opt["effects"]["faults_insert"][0]["original_blocks"], "要記住故障前的位置"
    a, d = plan["options"][0], plan["options"][3]
    assert a["metrics"]["moved"] <= d["metrics"]["moved"], "少動為主應該比準時優先動得少"
    assert plan["options"][2]["effects"]["overtime_on"] == ["2026-09-28"]


def test_leave_plans_move_work_off_the_person(demo):
    snap, now = demo
    ev = Event(type="leave", employee="e2", date="2026-09-28")
    plan = make_plans(PlanRequest(snapshot=snap, event=ev, now=now, time_limit=3))
    for opt in plan["options"]:
        after = snapshot_after(plan, opt, snap)
        assert check(after, after.blocks, now) == []
        assert not any(b.employee == "e2" and b.date == "2026-09-28" for b in after.blocks)
    assert any(p["name"] == "李四" for p in plan["options"][0]["people"]), "每個人的變動要列出李四"


def test_rush_order_insert(demo):
    snap, now = demo
    rush = Order(id="oz", code="Z99", product="p1", qty=200, due="2026-09-28", priority=0)
    plan = make_plans(PlanRequest(snapshot=snap, event=Event(type="order", order=rush), now=now, time_limit=3))
    opts = {o["id"]: o for o in plan["options"]}
    assert opts["A"]["metrics"]["moved"] == 0, "排進空檔：別人的工作都不動"
    for opt in plan["options"]:
        after = snapshot_after(plan, opt, snap)
        assert check(after, after.blocks, now) == []
    assert "Z99" not in opts["C"]["metrics"]["late"], "插單＋加班應該趕得上"


def test_recover_after_fault(demo):
    snap, now = demo
    ev = Event(type="fault", machine="c", date="2026-09-28", start=480, end=1020)
    plan = make_plans(PlanRequest(snapshot=snap, event=ev, now=now, time_limit=3))
    faulted = snapshot_after(plan, plan["options"][0], snap)
    fid = plan["options"][0]["effects"]["faults_insert"][0]["id"]
    rec = make_plans(PlanRequest(snapshot=faulted, event=Event(type="recover", fault_id=fid), now=now, time_limit=3))
    opts = {o["id"]: o for o in rec["options"]}
    assert set(opts) == {"A", "B", "C", "D"}
    assert opts["D"]["metrics"]["moved"] == 0
    for opt in rec["options"]:
        after = snapshot_after(rec, opt, faulted)
        assert check(after, after.blocks, now) == [], opt["name"]
    orig = {(b["order_id"], b["step_seq"], b["date"], b["start_min"], b["machine_id"]) for b in
            plan["options"][0]["effects"]["faults_insert"][0]["original_blocks"]}
    back = {(b["order_id"], b["step_seq"], b["date"], b["start_min"], b["machine_id"]) for b in opts["A"]["blocks"]}
    assert len(orig & back) >= len(orig) // 2, "搬回原位：至少一半回到故障前的位置"
    assert opts["C"]["metrics"]["gain_h"] > 0, "恢復後最佳化應該讓工單提早"


# ---------- API ----------
def test_api_health_and_plans(demo):
    snap, now = demo
    c = TestClient(app)
    assert c.get("/health").json()["ok"] is True
    r = c.post("/plans", json={"snapshot": snap.model_dump(), "event": {"type": "auto"}, "now": now.model_dump(), "time_limit": 2})
    assert r.status_code == 200
    body = r.json()
    assert [o["id"] for o in body["options"]] == ["A", "B", "C"]
    assert body["options"][2]["metrics"]["moved"] == 0
    r2 = c.post("/plans/db", json={"event": {"type": "auto"}}, headers={"Authorization": "Bearer x"})
    assert r2.status_code == 503, "沒設定資料庫時要清楚回報"


def test_public_deployment_disables_snapshot_endpoints(demo, monkeypatch):
    snap, now = demo
    monkeypatch.setenv("SOLVER_DISABLE_SNAPSHOT_API", "1")
    c = TestClient(app)
    payload = {"snapshot": snap.model_dump(), "now": now.model_dump()}
    assert c.post("/plans", json={**payload, "event": {"type": "auto"}}).status_code == 403
    assert c.post("/solve", json=payload).status_code == 403
    assert c.get("/health").status_code == 200


def test_api_rejects_unbounded_solver_time(demo):
    snap, now = demo
    c = TestClient(app)
    payload = {"snapshot": snap.model_dump(), "now": now.model_dump(), "time_limit": 20}
    assert c.post("/solve", json=payload).status_code == 422
    assert c.post("/plans", json={**payload, "event": {"type": "auto"}}).status_code == 422
    assert c.post("/plans/db", json={"event": {"type": "auto"}, "time_limit": 20},
                  headers={"Authorization": "Bearer token"}).status_code == 422


def test_large_unknown_uses_valid_restricted_draft():
    snap = snapshot_for(20, 40, 50, cross_factory=True)
    now = Now(date="2026-09-28", min=480)
    original_solve = cp_model.CpSolver.solve
    calls = 0

    def first_search_times_out(self, model, *args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return cp_model.UNKNOWN
        return original_solve(self, model, *args, **kwargs)

    with patch.object(cp_model.CpSolver, "solve", first_search_times_out):
        result = solve(snap, now, PRESETS["on_time"], time_limit=5)
    assert calls == 2
    assert result.status == "FEASIBLE", "受限問題的 OPTIMAL 不能宣稱是全局最優"
    assert result.search_mode == "restricted_pairs"
    assert len(result.blocks) >= 200
    assert check(snap, result.blocks, now) == []


def test_large_plan_generation_limits_concurrent_models():
    snap = snapshot_for(20, 40, 100, cross_factory=True)
    req = PlanRequest(snapshot=snap, event=Event(type="auto"),
                      now=Now(date="2026-09-28", min=480))
    with patch("app.plans.ThreadPoolExecutor") as executor:
        executor.return_value.__enter__.return_value.map.return_value = []
        make_plans(req)
    assert executor.call_args.kwargs["max_workers"] == 1


def test_very_large_on_time_draft_skips_full_model():
    snap = snapshot_for(20, 40, 250, cross_factory=True)
    now = Now(date="2026-09-28", min=480)
    draft = Result(
        blocks=[Block(order=order.id, step=3, machine="m3", employee="e3",
                      date=order.due, start=480, end=490, qty=order.qty)
                for order in snap.orders],
        status="OPTIMAL", objective=1, wall=0.1, n_ops=1000,
        search_mode="restricted_pairs",
    )
    with patch("app.model.solve", return_value=draft) as recursive, patch("app.model.check", return_value=[]):
        result = solve(snap, now, PRESETS["on_time"], time_limit=5)
    assert recursive.call_count == 1
    assert recursive.call_args.kwargs["pair_cap"] == 1
    assert result.status == "FEASIBLE", "受限初稿不能宣稱是完整問題的最優解"
    assert result.search_mode == "restricted_pairs"


def test_very_large_absences_keep_two_pair_candidates():
    snap = snapshot_for(20, 40, 250, cross_factory=True, leave_days=5, fault_days=5)
    now = Now(date="2026-09-28", min=480)
    draft = Result(
        blocks=[Block(order=order.id, step=3, machine="m3", employee="e3",
                      date=order.due, start=480, end=490, qty=order.qty)
                for order in snap.orders],
        status="FEASIBLE", objective=1, wall=0.1, n_ops=1000,
        search_mode="restricted_pairs", candidate_pairs=2,
    )
    with patch("app.model.solve", return_value=draft) as recursive, patch("app.model.check", return_value=[]):
        result = solve(snap, now, PRESETS["on_time"], time_limit=5)
    assert recursive.call_args.kwargs["pair_cap"] == 2
    assert result.candidate_pairs == 2


def test_restricted_draft_balances_early_orders_across_machines():
    snap = snapshot_for(20, 40, 100, cross_factory=True, due_base_days=0)
    now = Now(date="2026-09-28", min=480)
    draft = solve(snap, now, PRESETS["on_time"], pair_cap=1, time_limit=5)
    assert draft.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, draft.blocks, now) == []
    first_step_machines = {block.machine for block in draft.blocks
                           if block.order in {f"o{i}" for i in range(12)} and block.step == 0}
    assert len(first_step_machines) == 5, "前 12 張急單應分散到 5 台同工序機台"
    late = [order for order in snap.orders if any(
        block.order == order.id and block.step == 3 and block.date > order.due
        for block in draft.blocks)]
    assert late == []


def test_restricted_draft_avoids_staff_absent_until_after_due():
    snap = snapshot_for(20, 40, 100, cross_factory=True,
                        due_base_days=0, leave_days=5)
    now = Now(date="2026-09-28", min=480)
    draft = solve(snap, now, PRESETS["on_time"], pair_cap=1, time_limit=5)
    assert draft.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, draft.blocks, now) == []
    assert not any(block.step == 3 and block.date > order.due
                   for order in snap.orders for block in draft.blocks if block.order == order.id)


def test_restricted_draft_with_machine_faults_is_valid():
    snap = snapshot_for(20, 40, 100, cross_factory=True,
                        due_base_days=0, leave_days=5, fault_days=5)
    now = Now(date="2026-09-28", min=480)
    draft = solve(snap, now, PRESETS["on_time"], pair_cap=1, time_limit=10)
    assert draft.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, draft.blocks, now) == []


def test_restricted_pairs_skip_long_leave_and_keep_reference():
    start = date(2026, 9, 28)
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="m0", process="cut", products=["p"]),
                  Machine(id="m1", process="cut", products=["p"])],
        employees=[Employee(id="e0", name="Leave", skills=["m0"],
                            leaves=[(start + timedelta(days=i)).isoformat() for i in range(45)]),
                   Employee(id="e1", name="Ready", skills=["m1"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", rate=2)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-10-01")],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], pair_cap=1, time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert {block.machine for block in result.blocks} == {"m1"}
    assert check(snap, result.blocks, now) == []

    snap.employees[0].leaves = []
    snap.blocks = [Block(order="o", step=0, machine="m1", employee="e1",
                         date="2026-09-29", start=480, end=540, qty=120)]
    with_reference = solve(snap, now, PRESETS["min_change"], pair_cap=1, time_limit=1)
    assert with_reference.status in ("OPTIMAL", "FEASIBLE")
    assert {block.machine for block in with_reference.blocks} == {"m1"}
    assert check(snap, with_reference.blocks, now) == []


def test_restricted_pair_needs_complete_gap_before_due():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="m0", process="cut", products=["p"],
                          faults=[Fault(date="2026-09-28", start=480, end=660)]),
                  Machine(id="m1", process="cut", products=["p"])],
        employees=[Employee(id="e0", name="A", skills=["m0"]),
                   Employee(id="e1", name="B", skills=["m1"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", rate=2)])],
        orders=[Order(id="o", code="O", product="p", qty=840, due="2026-09-28")],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], pair_cap=1, time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert {block.machine for block in result.blocks} == {"m1"}
    assert all(block.date == "2026-09-28" for block in result.blocks)
    assert check(snap, result.blocks, now) == []


def test_restricted_pair_respects_fixed_machine_work():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="m0", process="cut", products=["p"]),
                  Machine(id="m1", process="cut", products=["p"])],
        employees=[Employee(id="e0", name="A", skills=["m0"]),
                   Employee(id="e1", name="B", skills=["m1"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", rate=2)])],
        orders=[Order(id="fixed", code="F", product="p", qty=480, due="2026-09-28"),
                Order(id="new", code="N", product="p", qty=840, due="2026-09-28")],
        blocks=[Block(order="fixed", step=0, machine="m0", employee="e0",
                      date="2026-09-28", start=480, end=720, qty=480, pinned=True)],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], pair_cap=1, time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert {block.machine for block in result.blocks if block.order == "new"} == {"m1"}
    assert check(snap, result.blocks, now) == []


def test_restricted_objective_counts_forced_assignment_change():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="m0", process="cut", products=["p"],
                          faults=[Fault(date="2026-09-28", start=480, end=1020)]),
                  Machine(id="m1", process="cut", products=["p"])],
        employees=[Employee(id="e0", name="A", skills=["m0"]),
                   Employee(id="e1", name="B", skills=["m1"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", rate=2)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="m0", employee="e0",
                      date="2026-09-29", start=480, end=540, qty=120)],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, Weights(tard=0, comp=0, dev=0, change=123),
                   pair_cap=1, time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert {block.machine for block in result.blocks} == {"m1"}
    assert result.objective == 123
    assert check(snap, result.blocks, now) == []


def test_cross_factory_batch_can_overlap_previous_step():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    cut = next(block for block in result.blocks if block.step == 0)
    weld = next(block for block in result.blocks if block.step == 1)
    assert cut.start + 60 <= weld.start < cut.end
    assert check(snap, result.blocks, now) == []


def test_faster_cross_factory_step_can_finish_with_upstream():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=2, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    cut_end = max(block.end for block in result.blocks if block.step == 0)
    weld = next(block for block in result.blocks if block.step == 1)
    assert weld.start == 540
    assert weld.end == cut_end == 600
    assert check(snap, result.blocks, now) == []


def test_validator_rejects_downstream_consuming_unfinished_batch():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=0.4, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=480, end=540, qty=60),
                Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=960, end=1020, qty=60),
                Block(order="o", step=1, machine="weld", employee="e2",
                      date="2026-09-28", start=660, end=720, qty=24),
                Block(order="o", step=1, machine="weld", employee="e2",
                      date="2026-09-28", start=780, end=1020, qty=96)],
    )
    issues = check(snap, snap.blocks, Now(date="2026-09-28", min=480))
    assert any("前站累積產量不足" in issue for issue in issues)


def test_completed_batch_allows_cross_factory_step_to_start_now():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=480, end=540, qty=60)],
    )
    now = Now(date="2026-09-28", min=540)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    weld_start = min(block.start for block in result.blocks if block.step == 1)
    assert weld_start == 540, "前站已完成交接批量，後站不應等待尚未完成的剩餘件數"
    assert check(snap, result.blocks, now) == []


def test_fixed_previous_step_releases_batch_before_its_final_block():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=480, end=540, qty=60),
                Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=540, end=600, qty=60, pinned=True)],
    )
    now = Now(date="2026-09-28", min=540)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    weld_start = min(block.start for block in result.blocks if block.step == 1)
    assert weld_start == 540
    assert check(snap, result.blocks, now) == []


def test_parallel_fixed_upstream_blocks_release_batch_by_combined_output():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut1", factory=1, process="cut", products=["p"]),
                  Machine(id="cut2", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut1", factory=1, skills=["cut1"]),
                   Employee(id="e2", name="Cut2", factory=1, skills=["cut2"]),
                   Employee(id="e3", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=100, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="cut1", employee="e1",
                      date="2026-09-28", start=480, end=540, qty=50, pinned=True),
                Block(order="o", step=0, machine="cut2", employee="e2",
                      date="2026-09-28", start=480, end=540, qty=50, pinned=True)],
    )
    early = snap.blocks + [Block(order="o", step=1, machine="weld", employee="e3",
                                 date="2026-09-28", start=500, end=600, qty=100)]
    assert any("前站還沒做到可以開始" in issue for issue in check(snap, early))
    now = Now(date="2026-09-28", min=470)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert min(block.start for block in result.blocks if block.step == 1) >= 520
    assert check(snap, result.blocks, now) == []
    earlier_batch = snap.model_copy(deep=True)
    earlier_batch.products[0].steps[1].batch = 30
    assert check(earlier_batch, early) == [], "兩台合計產量可比任一單台更早達成首批"


def test_rounded_remaining_work_cannot_release_batch_early():
    snap, now, description = batch_case(21)
    assert description == {"seed": 21, "qty": 90, "first_rate": 1.5,
                           "second_rate": 2, "batch": 80, "fixed_qty": 40}
    result = solve(snap, now, PRESETS["on_time"], time_limit=1, days=5, workers=2)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert min(block.start for block in result.blocks if block.step == 1) >= 550
    assert check(snap, result.blocks, now) == []


@pytest.mark.parametrize("seed", [0, 1, 2])
def test_mixed_cross_factory_scenarios_remain_valid(seed):
    snap, now, pair_cap = mixed_case(seed)
    result = solve(snap, now, PRESETS["on_time"], days=10,
                   time_limit=1, workers=2, pair_cap=pair_cap)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.unplaced == []
    assert check(snap, result.blocks, now) == []


@pytest.mark.parametrize("seed,with_fixed,shared_operators", [
    (3, True, False), (4, False, True), (5, True, True),
])
def test_mixed_fixed_and_shared_operator_scenarios(seed, with_fixed, shared_operators):
    snap, now, pair_cap = mixed_case(seed, with_fixed=with_fixed,
                                     shared_operators=shared_operators)
    result = solve(snap, now, PRESETS["on_time"], days=10,
                   time_limit=1, workers=2, pair_cap=pair_cap)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.unplaced == []
    assert check(snap, result.blocks, now) == []


@pytest.mark.parametrize("seed,shared_operators", [(6, False), (7, True)])
def test_mixed_parallel_fixed_upstream_scenarios(seed, shared_operators):
    snap, now, pair_cap = mixed_case(seed, parallel_fixed=True,
                                     shared_operators=shared_operators)
    result = solve(snap, now, PRESETS["on_time"], days=10,
                   time_limit=1, workers=2, pair_cap=pair_cap)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.unplaced == []
    assert check(snap, result.blocks, now) == []


def test_fixed_downstream_cannot_precede_rescheduled_cross_factory_upstream():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"],
                          faults=[Fault(date="2026-09-28", start=480, end=540)]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=1, machine="weld", employee="e2",
                      date="2026-09-28", start=540, end=660, qty=120, pinned=True)],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1, days=5)
    assert result.status == "INFEASIBLE"


def test_fixed_cross_factory_downstream_accepts_completed_transfer_batch():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"],
                          faults=[Fault(date="2026-09-28", start=540, end=600)]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1, batch=60)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=480, end=540, qty=60, pinned=True),
                Block(order="o", step=1, machine="weld", employee="e2",
                      date="2026-09-28", start=540, end=660, qty=120, pinned=True)],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1, days=5)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert check(snap, result.blocks, now) == []


def test_invalid_fixed_cross_factory_precedence_is_not_reported_optimal():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", factory=1, process="cut", products=["p"]),
                  Machine(id="weld", factory=2, process="weld", products=["p"])],
        employees=[Employee(id="e1", name="Cut", factory=1, skills=["cut"]),
                   Employee(id="e2", name="Weld", factory=2, skills=["weld"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", factory=1, rate=1),
                                                       Step(process="weld", factory=2, rate=1)])],
        orders=[Order(id="o", code="O", product="p", qty=120, due="2026-09-28")],
        blocks=[Block(order="o", step=0, machine="cut", employee="e1",
                      date="2026-09-28", start=540, end=660, qty=120, pinned=True),
                Block(order="o", step=1, machine="weld", employee="e2",
                      date="2026-09-28", start=480, end=600, qty=120, pinned=True)],
    )
    now = Now(date="2026-09-28", min=480)
    result = solve(snap, now, PRESETS["on_time"], time_limit=1, days=5)
    assert result.status == "INVALID_SCHEDULE"
    assert any("前站還沒做到可以開始" in reason for reason in result.unplaced)
    preview = make_plans(PlanRequest(snapshot=snap, event=Event(type="auto"),
                                     now=now, time_limit=1))
    assert all(not option["applicable"] for option in preview["options"])
    assert not any(option.get("recommended") for option in preview["options"])


def test_unknown_step_is_reported_without_validator_crash():
    snap = Snapshot(
        calendar=Calendar(week=[False, True, True, True, True, True, False]),
        machines=[Machine(id="cut", process="cut", products=["p"])],
        employees=[Employee(id="e", name="Cut", skills=["cut"])],
        products=[Product(id="p", name="Part", steps=[Step(process="cut", rate=1)])],
        orders=[Order(id="o", code="O", product="p", qty=60, due="2026-09-28")],
        blocks=[Block(order="o", step=2, machine="cut", employee="e",
                      date="2026-09-28", start=480, end=540, qty=60, pinned=True)],
    )
    now = Now(date="2026-09-28", min=480)
    assert any("產品沒有這道工序" in issue for issue in check(snap, snap.blocks, now))
    result = solve(snap, now, PRESETS["on_time"], time_limit=1, days=5)
    assert result.status == "INVALID_SCHEDULE"


def test_only_one_plan_computation_per_service_process(demo, monkeypatch):
    snap, now = demo
    c = TestClient(app)

    class FakeSupabase:
        configured = True

        async def user_id(self, jwt):
            return "tester"

        async def role(self, jwt):
            return "boss"

        async def snapshot(self, jwt):
            return snap.model_dump()

    monkeypatch.setattr(api, "supa", FakeSupabase())
    payload = {"snapshot": snap.model_dump(), "now": now.model_dump(), "time_limit": 2}
    with api.computation_slot():
        for path, body, headers in [
            ("/solve", payload, {}),
            ("/plans", {**payload, "event": {"type": "auto"}}, {}),
            ("/plans/db", {"event": {"type": "auto"}, "now": now.model_dump()}, {"Authorization": "Bearer token"}),
        ]:
            response = c.post(path, json=body, headers=headers)
            assert response.status_code == 429, path
            assert response.headers["retry-after"] == "5"
    assert c.post("/plans", json={**payload, "event": {"type": "auto"}}).status_code == 200

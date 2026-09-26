"""排程服務測試：時間軸、OR-Tools 模型、各種突發狀況的方案、API。"""
from fastapi.testclient import TestClient

from app.main import app
from app.model import PRESETS, solve
from app.plans import make_plans
from app.schemas import Event, Now, Order, PlanRequest
from app.timeline import Timeline, abs_min
from app.validate import check

from .conftest import snapshot_after


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


# ---------- 模型 ----------
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

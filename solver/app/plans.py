"""突發狀況 → 幾種排法（方案）＋給人看的說明。

每個方案回傳：
- blocks：完整的新排程（資料庫格式，沿用的方塊帶 id），給 apply_plan 套用
- effects：一起寫入的變更（新增故障、請假、加班日、工單…）
- metrics／summary／lines／people／shifts：給老闆和員工看的前後差異
"""
from __future__ import annotations

import copy
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from time import monotonic
from typing import Callable

from .model import PRESETS, Result, Weights, configured_workers, solve
from .schemas import Block, Event, Fault, Now, Order, PlanRequest, Snapshot
from .timeline import abs_min, add_days, s2d, Timeline
from .validate import check

TW = timezone(timedelta(hours=8))   # 台灣沒有日光節約時間
WD = "日一二三四五六"


def now_tw() -> Now:
    t = datetime.now(TW)
    return Now(date=t.date().isoformat(), min=t.hour * 60 + t.minute)


def md(ds: str) -> str:
    d = s2d(ds)
    return f"{d.month}/{d.day}"


def mdw(ds: str) -> str:
    return f"{md(ds)}（{WD[s2d(ds).isoweekday() % 7]}）"


def hm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def fmt_delta(m: int) -> str:
    a = abs(m)
    if a < 60:
        return f"{a} 分"
    if a < 1440:
        return f"{round(a / 60, 1)} 小時"
    d, h = divmod(a, 1440)
    return f"{d} 天" + (f" {round(h / 60)} 小時" if h >= 30 else "")


def to_db(b: Block) -> dict:
    d = {"order_id": b.order, "step_seq": b.step, "machine_id": b.machine, "employee_id": b.employee,
         "date": b.date, "start_min": b.start, "end_min": b.end, "qty": b.qty, "pinned": b.pinned}
    if b.id:
        d["id"] = b.id
    return d


def from_db(d: dict) -> Block:
    return Block(id=d.get("id"), order=d["order_id"], step=d["step_seq"], machine=d["machine_id"], employee=d.get("employee_id"),
                 date=d["date"], start=d["start_min"], end=d["end_min"], qty=d["qty"], pinned=d.get("pinned", False))


# ---------- 套用突發狀況（在副本上） ----------
@dataclass
class Applied:
    snap: Snapshot
    effects: dict
    title: str
    date: str
    new_order: str | None = None
    fault_id: str | None = None
    fault: Fault | None = None
    affected_orders: list[str] = field(default_factory=list)


def apply_event(base: Snapshot, ev: Event, now: Now) -> Applied:
    snap = base.model_copy(deep=True)
    names = {e.id: e.name for e in snap.employees}
    if ev.type == "fault":
        m = next(m for m in snap.machines if m.id == ev.machine)
        fid = str(uuid.uuid4())
        m.faults.append(Fault(id=fid, date=ev.date, start=ev.start, end=ev.end, note=ev.note))
        eff = {"faults_insert": [{"id": fid, "machine_id": m.id, "date": ev.date, "start_min": ev.start,
                                  "end_min": ev.end, "note": ev.note, "original_blocks": []}]}
        return Applied(snap, eff, f"{m.id} 機台故障 {mdw(ev.date)} {hm(ev.start)}–{hm(ev.end)}", ev.date, fault_id=fid)
    if ev.type == "leave":
        e = next(e for e in snap.employees if e.id == ev.employee)
        if ev.date not in e.leaves:
            e.leaves.append(ev.date)
        eff = {"leaves_insert": [{"employee_id": e.id, "date": ev.date, "note": ev.note}]}
        return Applied(snap, eff, f"{names[e.id]} {mdw(ev.date)} 請假", ev.date)
    if ev.type == "order":
        o = ev.order
        old = next((x for x in snap.orders if x.id == o.id), None)
        if old and old.product != o.product:
            snap.blocks = [b for b in snap.blocks if b.order != o.id]
        if old:
            snap.orders = [o if x.id == o.id else x for x in snap.orders]
        else:
            snap.orders.append(o)
        tag = ["特急", "急", "一般", "不急"][o.priority]
        eff = {"orders_upsert": [{"id": o.id, "code": o.code, "product_id": o.product, "qty": o.qty,
                                  "due_date": o.due, "priority": o.priority}]}
        return Applied(snap, eff, f"{'修改' if old else '新增'}工單 {o.code}（{tag}）{o.qty}件", now.date, new_order=o.id)
    if ev.type == "recover":
        for m in snap.machines:
            for f in m.faults:
                if f.id == ev.fault_id:
                    now_min = -(-now.min // 10) * 10
                    title = f"{m.id} 機台修好了（{mdw(f.date)} 故障 {hm(f.start)}–{hm(f.end)}）"
                    orig = [from_db(x) for x in f.original_blocks]
                    affected = sorted({b.order for b in orig})
                    if f.date == now.date and f.start < now_min < f.end:
                        f.end = now_min
                        eff = {"faults_update": [{"id": f.id, "end_min": now_min, "fixed_at": datetime.now(TW).isoformat()}]}
                    elif abs_min(f.date, f.start) >= abs_min(now.date, now_min):
                        m.faults.remove(f)
                        eff = {"faults_delete": [f.id]}
                    else:
                        eff = {"faults_update": [{"id": f.id, "fixed_at": datetime.now(TW).isoformat()}]}
                    f.fixed = True
                    return Applied(snap, eff, title, max(f.date, now.date), fault_id=f.id, fault=f, affected_orders=affected)
        raise ValueError("找不到這筆故障")
    return Applied(snap, {}, "重新排程", now.date)


# ---------- 方案 ----------
@dataclass
class Strategy:
    id: str
    name: str
    desc: str
    preset: str | None                         # None = 不重排（維持現狀）
    when: Callable[[Applied, Now], bool] = lambda a, n: True
    overtime: Callable[[Applied, Now], set[str]] = lambda a, n: set()
    movable: Callable[[Applied], Callable[[Block], bool] | None] = lambda a: None
    reference: Callable[[Applied], list[Block] | None] = lambda a: None


def _ot_event_day(a: Applied, n: Now) -> set[str]:
    return {a.date}


def _ot_until_due(a: Applied, n: Now) -> set[str]:
    o = next(o for o in a.snap.orders if o.id == a.new_order)
    days, d = set(), n.date
    while d <= o.due:
        days.add(d)
        d = add_days(d, 1)
    return days


def _can_ot(a: Applied, n: Now) -> bool:
    tl = Timeline(a.snap.calendar, a.date, 1)
    return tl.is_open(a.date) and not a.snap.calendar.overtime.get(a.date)


def _outranked(a: Applied) -> Callable[[Block], bool]:
    orders = {o.id: o for o in a.snap.orders}
    me = orders[a.new_order]
    lower = {o.id for o in a.snap.orders if o.priority > me.priority or (o.priority == me.priority and o.due > me.due)}
    return lambda b: b.order == a.new_order or b.order in lower


def _restore_reference(a: Applied) -> list[Block]:
    orig = [from_db(x) for x in (a.fault.original_blocks if a.fault else [])]
    touched = {(b.order, b.step) for b in orig}
    return orig + [b for b in a.snap.blocks if (b.order, b.step) not in touched]


STRATEGIES: dict[str, list[Strategy]] = {
    "fault": [
        Strategy("A", "少動為主", "只移動受影響的工作，其他盡量不動", "min_change"),
        Strategy("B", "不換人不換機", "盡量維持原本的人和機台，只調整時間（順延）", "keep_assign"),
        Strategy("C", "開加班補回", "當天開加班到 20:00，再少動調整", "min_change", when=_can_ot, overtime=_ot_event_day),
        Strategy("D", "準時優先", "全部重新最佳化，延誤最少、完成最早", "on_time"),
    ],
    "order": [
        Strategy("A", "排進空檔", "不動別人，找最早的空檔", "on_time", movable=lambda a: (lambda b: b.order == a.new_order)),
        Strategy("B", "插單優先", "這張先做，擋到的較不急工作往後推", "min_change", movable=_outranked),
        Strategy("C", "插單＋加班", "插單，並在期限前的上班日開加班", "min_change", movable=_outranked, overtime=_ot_until_due),
        Strategy("D", "最佳化重排", "把新工單放進去，全部重新找最好的排法", "on_time"),
    ],
    "recover": [
        Strategy("A", "搬回原位", "因故障被移走的工作，盡量回到原本的時段", "min_change",
                 when=lambda a, n: bool(a.fault and a.fault.original_blocks), reference=_restore_reference),
        Strategy("B", "受影響工單往前補", "只重排被故障影響的工單，讓它們盡量提早，其他不動", "on_time",
                 when=lambda a, n: bool(a.affected_orders), movable=lambda a: (lambda b: b.order in a.affected_orders)),
        Strategy("C", "最佳化重排", "全部重新找最好的排法（固定的不動）", "on_time"),
        Strategy("D", "維持現狀", "排程不動，機台空出的時段留給新工單", None),
    ],
    "auto": [
        Strategy("A", "最佳化重排", "OR-Tools 全部重新找最好的排法（固定的不動）", "on_time"),
        Strategy("B", "少動微調", "只修正有問題的地方，其他盡量不動", "min_change"),
        Strategy("C", "維持現狀", "不重排", None),
    ],
}
STRATEGIES["leave"] = [s for s in STRATEGIES["fault"]]


# ---------- 前後差異：給人看的 ----------
def _key(b: Block):
    return (b.order, b.step, b.date, b.start, b.end, b.machine, b.employee, b.qty, b.pinned)


def _finish(snap: Snapshot, blocks: list[Block]) -> dict[str, dict]:
    prods = {p.id: p for p in snap.products}
    last_steps = {o.id: len(prods[o.product].steps) - 1 for o in snap.orders
                  if o.product in prods and prods[o.product].steps}
    last_blocks: dict[str, list[Block]] = {}
    for b in blocks:
        if b.step == last_steps.get(b.order):
            last_blocks.setdefault(b.order, []).append(b)
    out = {}
    for o in snap.orders:
        if o.id not in last_steps:
            out[o.id] = {"k": "part", "fin": None, "date": None}
            continue
        lb = last_blocks.get(o.id, [])
        if not lb or sum(b.qty for b in lb) < o.qty:
            out[o.id] = {"k": "part", "fin": None, "date": None}
            continue
        b = max(lb, key=lambda x: abs_min(x.date, x.end))
        out[o.id] = {"k": "late" if b.date > o.due else "ok", "fin": abs_min(b.date, b.end), "date": b.date, "min": b.end}
    return out


def _dm(a: int) -> dict:
    """絕對分鐘 → {date, min}（前端、資料庫都看得懂）。"""
    d, m = divmod(a, 1440)
    return {"date": date.fromordinal(d).isoformat(), "min": m}


def _ot_minutes(blocks: list[Block]) -> int:
    return sum(max(0, min(b.end, 1200) - max(b.start, 1020)) for b in blocks)


def describe(base: Snapshot, a: Applied, blocks: list[Block], res: Result | None, now: Now, kind: str) -> dict:
    orders = {o.id: o for o in a.snap.orders}
    prods = {p.id: p for p in a.snap.products}
    names = {e.id: e.name for e in a.snap.employees}
    step_name = lambda b: (prods[orders[b.order].product].steps[b.step].process
                           if b.order in orders and orders[b.order].product in prods
                           and b.step < len(prods[orders[b.order].product].steps) else "?")
    bk, ak = {_key(b) for b in base.blocks}, {_key(b) for b in blocks}
    gone = [b for b in base.blocks if _key(b) not in ak]
    added = [b for b in blocks if _key(b) not in bk]
    displaced_pins = [b for b in gone if b.pinned] if kind in ("fault", "leave") else []
    changed = [b for b in added if b.order != a.new_order]
    fb, fa = _finish(base, base.blocks), _finish(a.snap, blocks)

    late = [o for o in a.snap.orders if fa[o.id]["k"] != "ok"]
    late_days = sum((s2d(fa[o.id]["date"]) - s2d(o.due)).days if fa[o.id]["date"] else 5 for o in late)
    shifts = [{"code": o.code, "b": fb[o.id]["fin"], "a": fa[o.id]["fin"]} for o in a.snap.orders
              if o.id in fb and fb[o.id]["fin"] and fa[o.id]["fin"] and fb[o.id]["fin"] != fa[o.id]["fin"]]
    gain_h = round(sum(max(0, s["b"] - s["a"]) for s in shifts) / 60, 1)
    ot_h = round((_ot_minutes(blocks) - _ot_minutes(base.blocks)) / 60, 1)
    dates: dict[str, int] = {}
    machine_factories = {m.id: m.factory for m in a.snap.machines}
    affected_factories = sorted({machine_factories[b.machine] for b in gone + added
                                 if b.machine in machine_factories})
    for b in gone + added:
        dates[b.date] = dates.get(b.date, 0) + 1
    metrics = {"late": [o.code for o in late], "late_days": late_days, "moved": len(changed),
               "other_days": len([b for b in changed if b.date != a.date]), "gain_h": gain_h,
               "ot_h": ot_h, "dates": dates, "factories": affected_factories}

    # 一句話總結
    parts = []
    if displaced_pins:
        parts.append(f"{len(displaced_pins)} 段固定工作受突發狀況影響，未完成部分會解除固定並重排")
    later = [s for s in shifts if s["a"] > s["b"]]
    earlier = [s for s in shifts if s["a"] < s["b"]]
    if later:
        mx = max(later, key=lambda s: s["a"] - s["b"])
        parts.append(f"{len(later)} 張工單完成時間變晚（最多 {mx['code']} 晚 {fmt_delta(mx['a'] - mx['b'])}）")
    if earlier:
        parts.append(f"{len(earlier)} 張工單提早完成")
    parts.append("、".join(o.code for o in late) + " 會超過期限" if late else "所有工單都趕得上期限")
    if affected_factories:
        parts.append("影響 " + "、".join(f"{factory} 廠" for factory in affected_factories))
    if dates:
        parts.append(f"影響 {len(dates)} 天（{'、'.join(md(d) for d in sorted(dates))}）")
    who = sorted({b.employee for b in gone + added if b.employee}, key=lambda x: names.get(x, x))
    if who:
        parts.append("、".join(names.get(w, w) for w in who) + " 的班表有變")
    if ot_h > 0:
        parts.append(f"加班 +{ot_h} 小時")
    summary = "；".join(parts) + "。"

    # 每站的變動說明
    lines = []
    for b in displaced_pins:
        code = orders[b.order].code if b.order in orders else b.order
        lines.append({"k": "info", "t": f"固定工作 {code} {step_name(b)} {mdw(b.date)} {hm(b.start)}–{hm(b.end)} 與故障或請假衝突；確認方案後，未完成部分會解除固定並重新排入"})
    groups: dict[tuple, dict] = {}
    for b in gone:
        groups.setdefault((b.order, b.step), {"old": [], "new": []})["old"].append(b)
    for b in added:
        groups.setdefault((b.order, b.step), {"old": [], "new": []})["new"].append(b)
    for (oid, k), g in sorted(groups.items(), key=lambda x: min(abs_min(b.date, b.start) for b in x[1]["old"] + x[1]["new"])):
        if oid not in orders:
            continue
        o = orders[oid]
        proc = prods[o.product].steps[k].process if o.product in prods and k < len(prods[o.product].steps) else "未知工序"
        where = lambda bs: "、".join(f"{mdw(b.date)} {hm(b.start)} {b.machine} {names.get(b.employee, '')} {b.qty}件{'（固定）' if b.pinned else ''}" for b in sorted(bs, key=lambda x: abs_min(x.date, x.start))[:2]) + ("…" if len(bs) > 2 else "")
        if not g["old"]:
            lines.append({"k": "info", "t": f"{o.code} {proc}：新排入 {where(g['new'])}"})
        elif not g["new"]:
            lines.append({"k": "info", "t": f"{o.code} {proc}：拿掉 {where(g['old'])}"})
        else:
            t0 = min(abs_min(b.date, b.start) for b in g["old"])
            t1 = min(abs_min(b.date, b.start) for b in g["new"])
            same_who = {(b.machine, b.employee) for b in g["old"]} == {(b.machine, b.employee) for b in g["new"]}
            k2 = "early" if t1 < t0 else ("delay" if t1 > t0 else ("swap" if not same_who else "info"))
            lines.append({"k": k2, "t": f"{o.code} {proc}：{where(g['old'])} → {where(g['new'])}"})
    for u in (res.unplaced if res else []):
        lines.append({"k": "fail", "t": u})
    for o in late:
        f = fa[o.id]
        lines.append({"k": "late", "t": f"{o.code} " + (f"預計 {mdw(f['date'])} 完成，超過期限 {mdw(o.due)}" if f["date"] else "沒有排完")})

    # 每個人的變動
    people = []
    for w in who:
        items = [{"t": "out", "text": f"{mdw(b.date)} {hm(b.start)}–{hm(b.end)} {b.machine} {orders[b.order].code if b.order in orders else ''} {step_name(b)} {b.qty}件"}
                 for b in gone if b.employee == w]
        items += [{"t": "in", "text": f"{mdw(b.date)} {hm(b.start)}–{hm(b.end)} {b.machine} {orders[b.order].code} {step_name(b)} {b.qty}件"}
                  for b in added if b.employee == w]
        people.append({"employee": w, "name": names.get(w, w), "items": items})

    base_score = len(late) * 1000 + late_days * 100 + max(0, ot_h) * 6
    if kind in ("recover", "auto"):
        score = base_score - gain_h * 5 + metrics["other_days"] + metrics["moved"] * 0.5
    else:
        score = base_score + metrics["other_days"] * 3 + metrics["moved"]
    return {"metrics": metrics, "summary": summary, "lines": lines, "people": people,
            "shifts": [{"code": s["code"], "before": _dm(s["b"]), "after": _dm(s["a"]), "delta_min": s["a"] - s["b"]} for s in shifts],
            "score": score,
            "gone": [to_db(b) for b in gone]}


def make_plans(req: PlanRequest) -> dict:
    now = req.now or now_tw()
    base = req.snapshot
    a = apply_event(base, req.event, now)
    strategies = [s for s in STRATEGIES[req.event.type] if s.when(a, now)]
    products = {product.id: product for product in a.snap.products}
    operation_count = sum(len(products[order.product].steps) for order in a.snap.orders
                          if order.product in products)
    large = operation_count >= 150
    worker_cap = configured_workers()
    workers = worker_cap if large else max(1, worker_cap // max(1, len(strategies)))
    # 瀏覽器 60 秒會放棄請求；大型方案逐一計算，保留餘裕給資料庫存預覽、
    # JSON 回應及網路傳輸。已開始的單案不能在此處安全中斷。
    deadline = monotonic() + 50 if large else None
    same_unassigned_objective = (
        PRESETS["min_change"].tard == PRESETS["keep_assign"].tard
        and PRESETS["min_change"].comp == PRESETS["keep_assign"].comp
    )
    shared_unassigned: Result | None = None

    def run(st: Strategy):
        nonlocal shared_unassigned
        if st.preset is None:
            return st, None, list(a.snap.blocks)
        ot = st.overtime(a, now)
        # 尚未有任何排程方塊時，故障／請假的 A、B 策略沒有可維持的
        # 原時間或人機；兩者目標中的有效權重完全相同，無需重算一次。
        # 大案採單執行緒依序求解，才可安全重用前一個結果。
        if (large and same_unassigned_objective and not a.snap.blocks
                and req.event.type in ("fault", "leave") and not ot
                and st.id == "B" and shared_unassigned is not None):
            return st, shared_unassigned, shared_unassigned.blocks
        if deadline is not None and deadline - monotonic() < req.time_limit + 4:
            skipped = Result(list(a.snap.blocks), "SKIPPED", None, 0.0, operation_count,
                             ["大型排程已達整體等待上限，此方案尚未計算；可先查看已完成的方案，或縮小範圍後重試"],
                             search_mode="skipped")
            return st, skipped, skipped.blocks
        res = solve(a.snap, now, PRESETS[st.preset], reference=st.reference(a), movable=st.movable(a),
                    extra_overtime=frozenset(ot), time_limit=req.time_limit, workers=workers)
        if (large and same_unassigned_objective and not a.snap.blocks
                and req.event.type in ("fault", "leave") and not ot and st.id == "A"):
            shared_unassigned = res
        return st, res, res.blocks

    with ThreadPoolExecutor(max_workers=1 if large else len(strategies)) as pool:
        results = list(pool.map(run, strategies))

    now_abs = abs_min(now.date, now.min)
    options = []
    for st, res, blocks in results:
        d = describe(base, a, blocks, res, now, req.event.type)
        diagnostics = list(res.unplaced) if res else []
        overtime_days = st.overtime(a, now) if st.preset else set()
        missing_products = [o for o in a.snap.orders if o.product not in {p.id for p in a.snap.products}]
        if missing_products:
            diagnostics.extend(f"{o.code}：找不到產品資料；請先建立產品與工序" for o in missing_products)
        elif not (res and res.status == "SKIPPED"):
            diagnostics.extend(check(a.snap, blocks, now, overtime_days)[:5])
        applicable = (res is None or res.status in ("OPTIMAL", "FEASIBLE")) and not diagnostics
        eff = copy.deepcopy(a.effects)
        if overtime_days:
            eff["overtime_on"] = sorted(overtime_days)
        if "faults_insert" in eff:          # 記住故障前的位置，恢復時「搬回原位」用
            eff["faults_insert"][0]["original_blocks"] = [g for g in d.pop("gone") if abs_min(g["date"], g["end_min"]) > now_abs]
        else:
            d.pop("gone")
        options.append({"id": st.id, "name": st.name, "desc": st.desc, **d,
                        "status": res.status if res else "KEEP", "solve_seconds": round(res.wall, 2) if res else 0,
                        "solver_method": res.search_mode if res else "keep",
                        "solver_candidate_pairs": res.candidate_pairs if res else None,
                        "applicable": applicable, "diagnostics": diagnostics,
                        "blocks": [to_db(b) for b in blocks], "effects": eff})
    applicable_options = [o for o in options if o["applicable"]]
    if applicable_options:
        min(applicable_options, key=lambda o: o["score"])["recommended"] = True
    return {"kind": req.event.type, "title": a.title, "date": a.date, "base_version": base.version,
            "event": req.event.model_dump(), "options": options}

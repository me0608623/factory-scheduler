"""OR-Tools CP-SAT 排程模型。

每張工單的每一站 = 一個「工作」。每個可行的「機台＋人」組合是一個可選區間，恰好選一個。
硬性限制：同一台機台同時只排一件事；每人同時顧機台數不超過其設定上限；故障、請假時段不能排；不能加班的人不排加班與假日；
前站做完（或做到可傳下站的件數）才開始下站；已經過去、手動固定的工作不動。
目標：延誤 × 急件權重 ＞ 完成時間 ＞ 跟原本排程的差異（開始時間移動、換人換機台）。
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Callable

from ortools.sat.python import cp_model

from .schemas import Block, Now, Snapshot
from .timeline import Timeline, abs_min

PRI_W = [8, 4, 2, 1]


@dataclass(frozen=True)
class Weights:
    tard: int = 1000      # 每延誤 1 分鐘（再乘急件權重）
    comp: int = 1         # 完成時間越早越好
    dev: int = 0          # 開始時間跟原本差幾分鐘
    change: int = 0       # 換人或換機台


PRESETS: dict[str, Weights] = {
    "min_change": Weights(tard=1000, comp=1, dev=20, change=3000),     # 少動為主
    "keep_assign": Weights(tard=1000, comp=1, dev=20, change=60000),   # 盡量不換人不換機
    "on_time": Weights(tard=1000, comp=10, dev=1, change=50),          # 準時、提早優先
}


def dur_of(qty: int, rate: float) -> int:
    """標準工序公式：數量 ÷ 每分鐘件數，以 10 分鐘為單位進位。"""
    return max(10, math.ceil(qty / rate / 10) * 10)


@dataclass
class Op:
    key: tuple[str, int]              # (工單, 第幾站)
    qty: int
    dur: int
    pairs: list[tuple[str, str]]      # (機台, 員工)
    ref_start: int | None = None      # 原本的開始時間（時間軸）
    ref_pair: tuple[str, str] | None = None


@dataclass
class Result:
    blocks: list[Block]
    status: str
    objective: float | None
    wall: float
    n_ops: int
    unplaced: list[str] = field(default_factory=list)
    released: list[Block] = field(default_factory=list)   # 因為故障、請假被迫移動的原排程


def _cut_for_conflicts(b: Block, snap: Snapshot) -> int | None:
    """這段工作跟故障、請假衝突時，回傳衝突開始的分鐘；沒衝突回傳 None。"""
    cut = None
    for m in snap.machines:
        if m.id != b.machine:
            continue
        for f in m.faults:
            if f.date == b.date and f.start < b.end and f.end > b.start:
                c = max(f.start, b.start)
                cut = c if cut is None else min(cut, c)
    for e in snap.employees:
        if e.id == b.employee and b.date in e.leaves:
            cut = b.start
    return cut


def solve(
    snap: Snapshot,
    now: Now,
    weights: Weights,
    *,
    reference: list[Block] | None = None,
    movable: Callable[[Block], bool] | None = None,
    extra_overtime: frozenset[str] | set[str] = frozenset(),
    time_limit: float = 5.0,
    days: int = 45,
    workers: int = 8,
) -> Result:
    t_start = time.time()
    now_min = math.ceil(now.min / 10) * 10
    tl = Timeline(snap.calendar, now.date, days, extra_overtime)
    t_now = tl.to_t(now.date, now_min)
    now_abs = abs_min(now.date, now_min)

    orders = {o.id: o for o in snap.orders}
    prods = {p.id: p for p in snap.products}
    machs = {m.id: m for m in snap.machines}
    emps = {e.id: e for e in snap.employees}

    # ---------- 1. 哪些方塊不能動：已經開始的、手動固定的、呼叫端指定不動的 ----------
    fixed: list[Block] = []
    released: list[Block] = []
    for b in snap.blocks:
        if b.order not in orders:
            continue
        keep = b.pinned or abs_min(b.date, b.start) < now_abs or (movable is not None and not movable(b))
        if not keep:
            continue
        cut = _cut_for_conflicts(b, snap)
        if cut is None:
            fixed.append(b)
            continue
        released.append(b)
        if cut > b.start:                               # 衝突前做完的部分留著
            q = round(b.qty * (cut - b.start) / (b.end - b.start))
            if q > 0:
                fixed.append(b.model_copy(update={"end": cut, "qty": q}))

    # ---------- 2. 要排的工作：每站剩下的數量 ----------
    done = {}
    for b in fixed:
        done[(b.order, b.step)] = done.get((b.order, b.step), 0) + b.qty
    ref_blocks = reference if reference is not None else [b for b in snap.blocks if b not in fixed]
    refs: dict[tuple[str, int], list[Block]] = {}
    for b in ref_blocks:
        refs.setdefault((b.order, b.step), []).append(b)

    ops: dict[tuple[str, int], Op] = {}
    unplaced: list[str] = []
    for o in snap.orders:
        p = prods.get(o.product)
        if not p:
            unplaced.append(f"{o.code}：找不到產品")
            continue
        for k, st in enumerate(p.steps):
            rem = o.qty - done.get((o.id, k), 0)
            if rem <= 0:
                continue
            pairs = [(m.id, e.id) for m in snap.machines
                     if m.factory == st.factory and m.process == st.process and o.product in m.products
                     for e in snap.employees if e.factory == m.factory and m.id in e.skills]
            if not pairs:
                unplaced.append(f"{o.code} {st.process}：沒有能做的機台或人員")
                continue
            op = Op((o.id, k), rem, dur_of(rem, st.rate), pairs)
            rb = refs.get((o.id, k))
            if rb:
                first = min(rb, key=lambda x: abs_min(x.date, x.start))
                op.ref_start = max(t_now, tl.to_t(first.date, first.start))
                big = max(rb, key=lambda x: x.qty)
                if (big.machine, big.employee) in pairs:
                    op.ref_pair = (big.machine, big.employee)
            ops[op.key] = op

    # ---------- 3. 建模 ----------
    H = tl.horizon
    m = cp_model.CpModel()
    S, E, X = {}, {}, {}
    mach_iv: dict[str, list] = {mid: [] for mid in machs}
    emp_iv: dict[str, list] = {eid: [] for eid in emps}
    emp_unavailable: dict[str, list] = {eid: [] for eid in emps}

    for key, op in ops.items():
        s10 = m.new_int_var(math.ceil(t_now / 10), H // 10, f"s10_{key}")
        s = m.new_int_var(t_now, H, f"s_{key}")
        m.add(s == 10 * s10)
        e = m.new_int_var(t_now, H, f"e_{key}")
        m.add(e == s + op.dur)
        S[key], E[key] = s, e
        lits = []
        for pr in op.pairs:
            x = m.new_bool_var(f"x_{key}_{pr}")
            iv = m.new_optional_interval_var(s, op.dur, e, x, f"iv_{key}_{pr}")
            mach_iv[pr[0]].append(iv)
            emp_iv[pr[1]].append(iv)
            X[key, pr] = x
            lits.append(x)
        m.add_exactly_one(lits)
        if op.ref_start is not None:
            m.add_hint(s, op.ref_start)
        if op.ref_pair:
            m.add_hint(X[key, op.ref_pair], 1)

    def fixed_iv(t0: int, t1: int, name: str):
        return m.new_fixed_size_interval_var(t0, t1 - t0, name) if t1 > t0 else None

    for b in fixed:                                          # 不能動的工作佔住機台和人
        if abs_min(b.date, b.end) <= now_abs:
            continue
        iv = fixed_iv(tl.to_t(b.date, b.start), tl.to_t(b.date, b.end), f"fix_{b.id}")
        if iv is None:
            continue
        if b.machine in mach_iv:
            mach_iv[b.machine].append(iv)
        if b.employee in emp_iv:
            emp_iv[b.employee].append(iv)
    for mc in snap.machines:                                 # 機台故障
        for f in mc.faults:
            iv = fixed_iv(tl.to_t(f.date, f.start), tl.to_t(f.date, f.end), f"fault_{mc.id}_{f.date}_{f.start}")
            if iv is not None:
                mach_iv[mc.id].append(iv)
    for em in snap.employees:                                # 請假、不能加班
        for d in em.leaves:
            span = tl.day_span(d)
            if span:
                emp_unavailable[em.id].append(fixed_iv(*span, f"leave_{em.id}_{d}"))
        for i, w in enumerate(tl.wins):
            if (w.overtime or w.special) and not em.allows_overtime(w.date):
                emp_unavailable[em.id].append(fixed_iv(w.t0, w.t1, f"noot_{em.id}_{i}"))
    for ivs in mach_iv.values():
        ivs = [iv for iv in ivs if iv is not None]
        if len(ivs) > 1:
            m.add_no_overlap(ivs)
    for em in snap.employees:
        ivs = [iv for iv in emp_iv[em.id] if iv is not None]
        unavailable = [iv for iv in emp_unavailable[em.id] if iv is not None]
        if ivs or unavailable:
            m.add_cumulative(ivs + unavailable,
                             [1] * len(ivs) + [em.max_concurrent_machines] * len(unavailable),
                             em.max_concurrent_machines)

    # 工序順序（前站 → 下站）
    for o in snap.orders:
        p = prods.get(o.product)
        if not p:
            continue
        for k in range(1, len(p.steps)):
            cur = ops.get((o.id, k))
            if not cur:
                continue
            prev = ops.get((o.id, k - 1))
            batch = p.steps[k].batch
            if prev:
                if 0 < batch < o.qty:
                    m.add(S[cur.key] >= S[prev.key] + dur_of(batch, p.steps[k - 1].rate))
                    m.add(E[cur.key] >= E[prev.key] + dur_of(batch, p.steps[k].rate))
                else:
                    m.add(S[cur.key] >= E[prev.key])
            else:
                fe = [tl.to_t(b.date, b.end) for b in fixed if b.order == o.id and b.step == k - 1]
                if fe:
                    m.add(S[cur.key] >= max(fe))

    # ---------- 4. 目標 ----------
    terms = []
    for o in snap.orders:
        p = prods.get(o.product)
        if not p:
            continue
        last = ops.get((o.id, len(p.steps) - 1))
        if not last:
            continue
        due_t = tl.end_of_date(o.due)
        tard = m.new_int_var(0, H, f"tard_{o.id}")
        m.add(tard >= E[last.key] - due_t)
        terms.append(weights.tard * PRI_W[min(max(o.priority, 0), 3)] * tard)
        if weights.comp:
            terms.append(weights.comp * E[last.key])
    for key, op in ops.items():
        if weights.dev and op.ref_start is not None:
            d = m.new_int_var(0, H, f"dev_{key}")
            m.add_abs_equality(d, S[key] - op.ref_start)
            terms.append(weights.dev * d)
        if weights.change and op.ref_pair:
            terms.append(weights.change * (1 - X[key, op.ref_pair]))
    m.minimize(sum(terms) if terms else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = workers
    status = solver.solve(m)
    name = solver.status_name(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if days < 120:                                       # 排不下：把時間範圍拉長再試一次
            return solve(snap, now, weights, reference=reference, movable=movable,
                         extra_overtime=extra_overtime, time_limit=time_limit, days=days * 2, workers=workers)
        return Result(list(snap.blocks), name, None, time.time() - t_start, len(ops),
                      unplaced + ["排不出可行的排程，請檢查人員技能、機台與故障設定"], released)

    # ---------- 5. 換回真實時間的方塊 ----------
    out: list[Block] = list(fixed)
    for key, op in ops.items():
        pr = next(pr for pr in op.pairs if solver.value(X[key, pr]))
        t0 = solver.value(S[key])
        segs = tl.to_real(t0, t0 + op.dur)
        rate = prods[orders[key[0]].product].steps[key[1]].rate
        left = op.qty
        for i, (ds, a, b2) in enumerate(segs):
            q = left if i == len(segs) - 1 else min(left, round((b2 - a) * rate))
            left -= q
            if q > 0:
                out.append(Block(order=key[0], step=key[1], machine=pr[0], employee=pr[1], date=ds, start=a, end=b2, qty=q))
    # 位置沒變的方塊沿用原本的 id（資料庫只記真的有變的）
    sig = lambda b: (b.order, b.step, b.machine, b.employee, b.date, b.start, b.end, b.qty)
    old = {sig(b): b.id for b in snap.blocks if b.id}
    used = {b.id for b in out if b.id}
    for b in out:
        if b.id is None:
            oid = old.get(sig(b))
            if oid and oid not in used:
                b.id = oid
                used.add(oid)
    out.sort(key=lambda b: (b.date, b.machine, b.start))
    return Result(out, name, solver.objective_value, time.time() - t_start, len(ops), unplaced, released)

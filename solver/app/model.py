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
from .validate import check

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


def first_free_start(now: int, duration: int, horizon: int,
                     busy: list[tuple[int, int]]) -> int | None:
    """在壓縮後的工作時間軸找一段完整空檔；候選搜尋用，不取代 CP-SAT 限制。"""
    start = math.ceil(now / 10) * 10
    for occupied_start, occupied_end in busy:
        if occupied_end <= start:
            continue
        if start + duration <= occupied_start:
            break
        start = math.ceil(occupied_end / 10) * 10
    return start if start + duration <= horizon else None


@dataclass
class Op:
    key: tuple[str, int]              # (工單, 第幾站)
    qty: int
    dur: int
    pairs: list[tuple[str, str]]      # (機台, 員工)
    ref_start: int | None = None      # 原本的開始時間（時間軸）
    ref_pair: tuple[str, str] | None = None
    forced_change: bool = False       # 受限候選排除原人機組合時仍須計入換組合成本


@dataclass
class Result:
    blocks: list[Block]
    status: str
    objective: float | None
    wall: float
    n_ops: int
    unplaced: list[str] = field(default_factory=list)
    released: list[Block] = field(default_factory=list)   # 因為故障、請假被迫移動的原排程
    search_mode: str = "full"         # full 或 restricted_pairs（完整搜尋超時後的初稿）
    candidate_pairs: int | None = None


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
    pair_cap: int | None = None,
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
            unplaced.append(f"{o.code}：找不到產品資料；請先建立產品與工序，再重新排程")
            continue
        for k, st in enumerate(p.steps):
            rem = o.qty - done.get((o.id, k), 0)
            if rem <= 0:
                continue
            eligible_machines = [m for m in snap.machines
                                 if m.factory == st.factory and m.process == st.process and o.product in m.products]
            pairs = [(m.id, e.id) for m in eligible_machines
                     for e in snap.employees if e.factory == m.factory and m.id in e.skills]
            if not pairs:
                if not eligible_machines:
                    elsewhere = [m.id for m in snap.machines if m.factory != st.factory and m.process == st.process and o.product in m.products]
                    alternative = (f"；其他廠有 {', '.join(elsewhere[:3])}，若製程允許可改該站廠別" if elsewhere else "")
                    unplaced.append(f"{o.code} {st.process}（{st.factory} 廠）：沒有可加工此產品的機台；請設定該廠機台的工序與可加工產品{alternative}")
                else:
                    mids = ', '.join(m.id for m in eligible_machines[:3])
                    unplaced.append(f"{o.code} {st.process}（{st.factory} 廠）：機台 {mids} 可加工，但沒有具操作資格的同廠人員；請確認員工技能並指派可操作 {mids} 的員工")
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
    if ops and not any(w.t1 > t_now for w in tl.wins):
        if days < 120:
            return solve(snap, now, weights, reference=reference, movable=movable,
                         extra_overtime=extra_overtime, time_limit=time_limit, days=days * 2,
                         workers=workers, pair_cap=pair_cap)
        return Result(list(snap.blocks), "NO_WORKING_TIME", None, time.time() - t_start, len(ops),
                      unplaced + [f"從 {now.date} 起的 {days} 天內沒有可排的上班時段；請在上班日設定開放工作日或調整排程起日"], released)

    pairs_used = {pair for op in ops.values() for pair in op.pairs}
    first_available: dict[tuple[str, str], int] = {}
    for mid, eid in pairs_used:
        employee, machine = emps[eid], machs[mid]
        for w in tl.wins:
            if (w.t1 > t_now and w.date not in employee.leaves
                    and (not (w.overtime or w.special) or employee.allows_overtime(w.date))
                    and not any(f.date == w.date and f.start <= w.start and f.end >= w.end for f in machine.faults)):
                first_available[mid, eid] = max(w.t0, t_now)
                break
    available_pairs = set(first_available)
    availability = []
    for op in ops.values():
        if any(pair in available_pairs for pair in op.pairs):
            continue
        order = orders[op.key[0]]
        process = prods[order.product].steps[op.key[1]].process
        availability.append(f"{order.code} {process}：未來 {days} 天合格人員的請假／加班限制或機台故障覆蓋所有可上班時段；請檢查請假、加班意願與故障結束時間")
    if availability:
        if days < 120:
            return solve(snap, now, weights, reference=reference, movable=movable,
                         extra_overtime=extra_overtime, time_limit=time_limit, days=days * 2,
                         workers=workers, pair_cap=pair_cap)
        return Result(list(snap.blocks), "NO_AVAILABLE_PAIR", None, time.time() - t_start, len(ops),
                      unplaced + availability, released)

    early_draft: Result | None = None
    if pair_cap is None and len(ops) >= 1000 and not unplaced:
        # 大模型先給受限人機候選完整的求解預算；若可準時且驗證通過，省去
        # 大量可選區間的完整模型。若初稿仍逾期，保留它並繼續嘗試完整模型。
        delayed_pairs = sum(ready > t_now for ready in first_available.values())
        draft_pair_cap = 2 if delayed_pairs * 4 >= len(first_available) else 1
        candidate = solve(snap, now, weights, reference=reference, movable=movable,
                          extra_overtime=extra_overtime, time_limit=time_limit,
                          days=days, workers=workers, pair_cap=draft_pair_cap)
        if (candidate.status in ("OPTIMAL", "FEASIBLE") and not candidate.unplaced
                and not check(snap, candidate.blocks, now)):
            candidate.status = "FEASIBLE"
            early_draft = candidate
            finish_dates: dict[str, str] = {}
            for block in candidate.blocks:
                order = orders.get(block.order)
                if order and block.step == len(prods[order.product].steps) - 1:
                    finish_dates[order.id] = max(finish_dates.get(order.id, ""), block.date)
            if all(finish_dates.get(order.id, "9999-12-31") <= order.due for order in snap.orders):
                candidate.wall = time.time() - t_start
                return candidate

    if pair_cap is not None:
        machine_busy: dict[str, list[tuple[int, int]]] = {mid: [] for mid in machs}
        employee_busy: dict[str, list[tuple[int, int]]] = {eid: [] for eid in emps}

        def occupy(target: list[tuple[int, int]], start: int, end: int):
            if end > start:
                target.append((start, end))

        for machine in snap.machines:
            for fault in machine.faults:
                occupy(machine_busy[machine.id], tl.to_t(fault.date, fault.start),
                       tl.to_t(fault.date, fault.end))
        for block in fixed:
            start, end = tl.to_t(block.date, block.start), tl.to_t(block.date, block.end)
            if block.machine in machine_busy:
                occupy(machine_busy[block.machine], start, end)
            if block.employee in employee_busy and emps[block.employee].max_concurrent_machines == 1:
                occupy(employee_busy[block.employee], start, end)
        for employee in snap.employees:
            for day in employee.leaves:
                span = tl.day_span(day)
                if span:
                    employee_busy[employee.id].append(span)
            for window in tl.wins:
                if (window.overtime or window.special) and not employee.allows_overtime(window.date):
                    occupy(employee_busy[employee.id], window.t0, window.t1)
        pair_busy = {pair: sorted(machine_busy[pair[0]] + employee_busy[pair[1]])
                     for pair in pairs_used}
        earliest_cache: dict[tuple[tuple[str, str], int], int | None] = {}
        order_positions = {order.id: index for index, order in enumerate(snap.orders)}
        for op in ops.values():
            earliest = {}
            for pair in op.pairs:
                if pair not in available_pairs:
                    continue
                cache_key = (pair, op.dur)
                if cache_key not in earliest_cache:
                    earliest_cache[cache_key] = first_free_start(t_now, op.dur, H, pair_busy[pair])
                if earliest_cache[cache_key] is not None:
                    earliest[pair] = earliest_cache[cache_key]
            if not earliest:
                order = orders[op.key[0]]
                return Result(list(snap.blocks), "NO_AVAILABLE_PAIR", None,
                              time.time() - t_start, len(ops),
                              unplaced + [f"{order.code}：受限候選在搜尋期內找不到足夠長的機台與員工空檔"],
                              released)
            candidates = list(earliest)
            due_t = tl.end_of_date(orders[op.key[0]].due)
            on_time = [pair for pair in candidates if earliest[pair] + op.dur <= due_t]
            if on_time:
                candidates = on_time
            else:
                first = min(earliest.values())
                candidates = [pair for pair in candidates if earliest[pair] == first]
            if len(candidates) <= pair_cap:
                op.pairs = candidates
            else:
                machine_pairs: dict[str, list[tuple[str, str]]] = {}
                for pair in candidates:
                    machine_pairs.setdefault(pair[0], []).append(pair)
                machine_ids = list(machine_pairs)
                position = order_positions[op.key[0]]
                chosen = []
                offset = 0
                while len(chosen) < pair_cap:
                    mid = machine_ids[(position + offset) % len(machine_ids)]
                    on_machine = machine_pairs[mid]
                    pair = on_machine[(position // len(machine_ids) + offset // len(machine_ids)) % len(on_machine)]
                    if pair not in chosen:
                        chosen.append(pair)
                    offset += 1
                if op.ref_pair in candidates and op.ref_pair not in chosen:
                    chosen[-1] = op.ref_pair
                op.pairs = chosen
            if op.ref_pair not in op.pairs:
                op.forced_change = op.ref_pair is not None
                op.ref_pair = None

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
    fixed_by_key: dict[tuple[str, int], list[Block]] = {}
    for block in fixed:
        fixed_by_key.setdefault((block.order, block.step), []).append(block)

    def fixed_batch_ready(key: tuple[str, int], batch_qty: int) -> int | None:
        made = 0
        for block in sorted(fixed_by_key.get(key, []), key=lambda b: abs_min(b.date, b.start)):
            if made + block.qty >= batch_qty:
                start = tl.to_t(block.date, block.start)
                end = tl.to_t(block.date, block.end)
                portion = (batch_qty - made) / block.qty
                return math.ceil((start + portion * (end - start)) / 10) * 10
            made += block.qty
        return None

    for o in snap.orders:
        p = prods.get(o.product)
        if not p:
            continue
        for k in range(1, len(p.steps)):
            cur = ops.get((o.id, k))
            prev = ops.get((o.id, k - 1))
            batch = p.steps[k].batch
            fixed_prev = fixed_by_key.get((o.id, k - 1), [])
            fixed_end = max((tl.to_t(b.date, b.end) for b in fixed_prev), default=None)
            fixed_cur = fixed_by_key.get((o.id, k), [])
            if fixed_cur and prev:
                # 後站已固定時，不能只限制新排的後站：前站重排也必須趕上
                # 最早一段已固定的交接時間，否則會回傳「成功但不可套用」的方案。
                fixed_start = min(tl.to_t(b.date, b.start) for b in fixed_cur)
                fixed_cur_end = max(tl.to_t(b.date, b.end) for b in fixed_cur)
                if 0 < batch < o.qty:
                    completed = done.get((o.id, k - 1), 0)
                    if completed >= batch:
                        ready = fixed_batch_ready((o.id, k - 1), batch)
                        if ready is not None:
                            m.add(ready <= fixed_start)
                    else:
                        remaining_batch = batch - completed
                        ready_delta = math.ceil(remaining_batch * prev.dur / (prev.qty * 10)) * 10
                        m.add(S[prev.key] + ready_delta <= fixed_start)
                        if fixed_end is not None:
                            m.add(fixed_end <= fixed_start)
                else:
                    m.add(E[prev.key] <= fixed_start)
                    if fixed_end is not None:
                        m.add(fixed_end <= fixed_start)
                if not cur:
                    m.add(E[prev.key] <= fixed_cur_end)
            if not cur:
                continue
            if prev:
                if 0 < batch < o.qty:
                    completed = done.get((o.id, k - 1), 0)
                    if completed >= batch:
                        ready = fixed_batch_ready((o.id, k - 1), batch)
                        if ready is not None:
                            m.add(S[cur.key] >= ready)
                    else:
                        remaining_batch = batch - completed
                        # 輸出方塊把 prev.qty 均攤到進位後的 prev.dur；不能再用名目速率
                        # 算交接點，否則會比獨立驗證看到的實際產量更早放行。
                        ready_delta = math.ceil(remaining_batch * prev.dur / (prev.qty * 10)) * 10
                        m.add(S[cur.key] >= S[prev.key] + ready_delta)
                        if fixed_end is not None:
                            m.add(S[cur.key] >= fixed_end)
                    m.add(E[cur.key] >= E[prev.key] + dur_of(batch, p.steps[k].rate))
                else:
                    m.add(S[cur.key] >= E[prev.key])
                    if fixed_end is not None:
                        m.add(S[cur.key] >= fixed_end)
                if fixed_end is not None:
                    m.add(E[cur.key] >= fixed_end)
            else:
                if 0 < batch < o.qty:
                    ready = fixed_batch_ready((o.id, k - 1), batch)
                    if ready is not None:
                        m.add(S[cur.key] >= ready)
                elif fixed_end is not None:
                    m.add(S[cur.key] >= fixed_end)
                if fixed_end is not None:
                    m.add(E[cur.key] >= fixed_end)

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
        elif weights.change and op.forced_change:
            terms.append(weights.change)
    m.minimize(sum(terms) if terms else 0)

    solver = cp_model.CpSolver()
    # 2,000 道以上若已有合法初稿，完整模型僅作短時間改善，避免多方案預覽
    # 連續兩次「初稿 5 秒＋完整模型 5 秒」逼近 HTTP 請求逾時。
    solver.parameters.max_time_in_seconds = (
        min(time_limit, 1.0) if early_draft is not None and len(ops) >= 2000 else time_limit
    )
    solver.parameters.num_workers = workers
    status = solver.solve(m)
    name = solver.status_name(status)

    def restricted_draft() -> Result | None:
        if early_draft is not None:
            early_draft.wall = time.time() - t_start
            return early_draft
        if pair_cap is not None or len(ops) < 150 or unplaced:
            return None
        draft = solve(snap, now, weights, reference=reference, movable=movable,
                      extra_overtime=extra_overtime, time_limit=min(1.0, time_limit),
                      days=days, workers=workers, pair_cap=1)
        if (draft.status not in ("OPTIMAL", "FEASIBLE") or draft.unplaced
                or check(snap, draft.blocks, now)):
            return None
        draft.status = "FEASIBLE"  # 受限候選的最優，不代表完整問題的最優
        draft.wall = time.time() - t_start
        return draft

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if early_draft is not None:
            early_draft.wall = time.time() - t_start
            return early_draft
        if status == cp_model.UNKNOWN:
            draft = restricted_draft()
            if draft is not None:
                return draft
        if status == cp_model.INFEASIBLE and days < 120 and pair_cap is None:
            # 受限候選的無解不代表完整問題無解；不替備援搜尋擴大範圍。
            return solve(snap, now, weights, reference=reference, movable=movable,
                         extra_overtime=extra_overtime, time_limit=time_limit, days=days * 2,
                         workers=workers, pair_cap=pair_cap)
        if status == cp_model.UNKNOWN:
            reason = "計算時間內尚未找到可行方案（不代表無解）；可先用手動排班安排急件，或請管理員提高求解時限後重試"
        elif status == cp_model.INFEASIBLE:
            reason = "目前限制下排不出可行方案；請檢查固定工作、機台故障、請假與可上班日期"
        else:
            reason = "排程模型無法完成計算；請檢查產品速率、工單與固定方塊資料，必要時交由開發者診斷"
        return Result(list(snap.blocks), name, None, time.time() - t_start, len(ops),
                      unplaced + [reason], released)

    if status == cp_model.FEASIBLE:
        draft = restricted_draft()
        if (draft is not None and draft.objective is not None
                and draft.objective + 1e-6 < solver.objective_value):
            return draft

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
    return Result(out, name, solver.objective_value, time.time() - t_start, len(ops),
                  unplaced, released, "restricted_pairs" if pair_cap is not None else "full",
                  pair_cap)

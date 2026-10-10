"""OR-Tools CP-SAT 排程模型。

每張工單的每一站 = 一個「工作」。每個可行的「機台＋人」組合是一個可選區間，恰好選一個。
硬性限制：同一台機台同時只排一件事；每人同時顧機台數不超過其設定上限；故障、請假時段不能排；不能加班的人不排加班與假日；
前站做完（或做到可傳下站的件數）才開始下站；已經過去、手動固定的工作不動。
目標：延誤 × 急件權重 ＞ 完成時間 ＞ 跟原本排程的差異（開始時間移動、換人換機台）。
"""
from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field
from typing import Callable

from ortools.sat.python import cp_model

from .schemas import Block, Now, Snapshot
from .material import batch_ready
from .timeline import Timeline, abs_min
from .validate import check

PRI_W = [8, 4, 2, 1]


@dataclass(frozen=True)
class Weights:
    tard: int = 1000      # 每延誤 1 分鐘（再乘急件權重）
    comp: int = 1         # 完成時間越早越好
    dev: int = 0          # 開始時間跟原本差幾分鐘
    change: int = 0       # 換人或換機台
    # 軟性切換成本（相對權重，非實際換模分鐘或金額）：
    # 同工單相鄰兩站換員工 / 換掉兩站共通機台的懲罰。0 = 基準模式（不影響求解）。
    sw_emp: int = 0
    sw_mach: int = 0


def _switch_cost_enabled(w: Weights) -> bool:
    """SOLVER_SWITCH_COST=0 可整體關閉（基準模式 / A/B 對照用）。"""
    try:
        return os.environ.get("SOLVER_SWITCH_COST", "1") != "0" and (w.sw_emp or w.sw_mach)
    except Exception:
        return bool(w.sw_emp or w.sw_mach)


PRESETS: dict[str, Weights] = {
    "min_change": Weights(tard=1000, comp=1, dev=20, change=3000, sw_emp=400, sw_mach=200),     # 少動為主
    "keep_assign": Weights(tard=1000, comp=1, dev=20, change=60000, sw_emp=1200, sw_mach=400),  # 盡量不換人不換機
    "on_time": Weights(tard=1000, comp=10, dev=1, change=50, sw_emp=150, sw_mach=80),           # 準時、提早優先
}


def configured_workers() -> int:
    """每次求解最多使用的工作者數；未設定或填錯時維持既有預設。"""
    try:
        value = int(os.environ.get("SOLVER_MAX_WORKERS", "8"))
    except ValueError:
        return 8
    return value if 1 <= value <= 16 else 8


def dur_of(qty: int, rate: float) -> int:
    """10 分鐘格點進位，保留每段整數件數無法四捨五入的餘量。"""
    capacity_per_slot = math.floor(rate * 10 + 1e-8)
    if capacity_per_slot:
        return max(10, math.ceil(qty / capacity_per_slot) * 10)
    # 極慢工序不足以在 10 分鐘產出一件，仍按名目速率估時；分段後
    # 是否足夠由獨立驗證器判斷，不能把不合法的方案標為可套用。
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


def full_capacity_spans(intervals: list[tuple[int, int]], capacity: int) -> list[tuple[int, int]]:
    """員工已顧滿設定台數的時段；只供快速候選排序，不取代正式累積限制。"""
    changes: dict[int, int] = {}
    for start, end in intervals:
        if end > start:
            changes[start] = changes.get(start, 0) + 1
            changes[end] = changes.get(end, 0) - 1
    spans = []
    load = 0
    full_from = None
    for minute, delta in sorted(changes.items()):
        previous = load
        load += delta
        if previous < capacity <= load:
            full_from = minute
        elif previous >= capacity > load and full_from is not None:
            spans.append((full_from, minute))
            full_from = None
    return spans


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
    workers: int | None = None,
    pair_cap: int | None = None,
) -> Result:
    t_start = time.time()
    workers = configured_workers() if workers is None else workers
    now_min = math.ceil(now.min / 10) * 10
    tl = Timeline(snap.calendar, now.date, days, extra_overtime)
    t_now = tl.to_t(now.date, now_min)
    now_abs = abs_min(now.date, now_min)
    actual_now_abs = abs_min(now.date, now.min)

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
        if abs_min(b.date, b.end) <= actual_now_abs:
            # 已完成的歷史不因事後補登故障／請假而被抹掉或重做。
            fixed.append(b)
            continue
        cut = _cut_for_conflicts(b, snap)
        if cut is None:
            fixed.append(b)
            continue
        released.append(b)
        if cut > b.start:                               # 衝突前做完的部分留著
            # 已完成部分只能向下取整；四捨五入可能把 7.5 件記成 8 件，
            # 超過這 10 分鐘按工序速率實際做得出的整數產能。
            q = math.floor(b.qty * (cut - b.start) / (b.end - b.start) + 1e-8)
            if q > 0:
                fixed.append(b.model_copy(update={"end": cut, "qty": q}))

    # ---------- 2. 要排的工作：每站剩下的數量 ----------
    block_qty = {b.id: b.qty for b in snap.blocks if b.id is not None}
    # 資料庫會拒絕超量；求解器仍採有界防護，未知或異常回報不能讓剩餘量變成負數。
    reported_done = {r.blockId: min(r.qtyDone, block_qty[r.blockId]) for r in snap.work_execution
                     if r.status == "done" and r.blockId in block_qty}
    done = {}
    for b in fixed:
        done[(b.order, b.step)] = done.get((b.order, b.step), 0) + reported_done.get(b.id, b.qty)
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
        if not p.steps:
            unplaced.append(f"{o.code}：產品沒有工序；請先建立產品工序，再重新排程")
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
        # 大型加班案用兩組候選：額外視窗讓單候選模型在部分工單組合上
        # 長時間搜尋且高耗記憶體，兩組候選反而較快找到合法解。
        draft_pair_cap = 2 if (delayed_pairs * 4 >= len(first_available)
                               or (extra_overtime and len(ops) >= 2000)) else 1
        candidate = solve(snap, now, weights, reference=reference, movable=movable,
                          extra_overtime=extra_overtime, time_limit=time_limit,
                          days=days, workers=workers, pair_cap=draft_pair_cap)
        # 單一人機候選無解只代表「受限子問題」無解；先擴成兩組候選，
        # 不要直接掉進巨大完整模型並把仍可排的工作誤報成逾時。
        if draft_pair_cap == 1 and candidate.status in ("INFEASIBLE", "NO_AVAILABLE_PAIR"):
            candidate = solve(snap, now, weights, reference=reference, movable=movable,
                              extra_overtime=extra_overtime, time_limit=time_limit,
                              days=days, workers=workers, pair_cap=2)
        if (candidate.status in ("OPTIMAL", "FEASIBLE") and not candidate.unplaced
                and not check(snap, candidate.blocks, now, extra_overtime)):
            candidate.status = "FEASIBLE"
            early_draft = candidate
            finish_dates: dict[str, str] = {}
            for block in candidate.blocks:
                order = orders.get(block.order)
                if order and block.step == len(prods[order.product].steps) - 1:
                    finish_dates[order.id] = max(finish_dates.get(order.id, ""), block.date)
            # 2,000 道以上即使只給完整模型 1 秒，建模本身也可能吃掉大量記憶體；
            # 有合法初稿時先交付 FEASIBLE，避免為改善逾期而讓整個預覽失敗。
            if len(ops) >= 2000 or all(finish_dates.get(order.id, "9999-12-31") <= order.due for order in snap.orders):
                candidate.wall = time.time() - t_start
                return candidate

    if pair_cap is not None:
        machine_busy: dict[str, list[tuple[int, int]]] = {mid: [] for mid in machs}
        employee_busy: dict[str, list[tuple[int, int]]] = {eid: [] for eid in emps}
        employee_load: dict[str, list[tuple[int, int]]] = {eid: [] for eid in emps}

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
            if block.employee in employee_load:
                occupy(employee_load[block.employee], start, end)
        for a in snap.work_assignments:
            start, end = tl.to_t(a.date, a.s), tl.to_t(a.date, a.e)
            if a.resourceId:
                occupy(machine_busy[a.resourceId], start, end)
                occupy(employee_load[a.emp], start, end)
            else:
                occupy(employee_busy[a.emp], start, end)
        for employee in snap.employees:
            employee_busy[employee.id].extend(
                full_capacity_spans(employee_load[employee.id], employee.max_concurrent_machines)
            )
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
    for a in snap.work_assignments:
        iv = fixed_iv(tl.to_t(a.date, a.s), tl.to_t(a.date, a.e), f"work_{a.id}")
        if iv is None:
            continue
        if a.resourceId:
            mach_iv[a.resourceId].append(iv)
            emp_iv[a.emp].append(iv)
        else:
            emp_unavailable[a.emp].append(iv)
    for mc in snap.machines:                                 # 機台故障
        # 故障紀錄可以重疊（例如全天故障後再補登上午）。若直接把每筆
        # 固定區間都交給 NoOverlap，紀錄本身就互相衝突，會誤判排程無解。
        fault_spans = sorted((tl.to_t(f.date, f.start), tl.to_t(f.date, f.end))
                             for f in mc.faults)
        merged_faults: list[list[int]] = []
        for start, end in fault_spans:
            if end <= start:
                continue
            if merged_faults and start <= merged_faults[-1][1]:
                merged_faults[-1][1] = max(merged_faults[-1][1], end)
            else:
                merged_faults.append([start, end])
        for index, (start, end) in enumerate(merged_faults):
            mach_iv[mc.id].append(fixed_iv(start, end, f"fault_{mc.id}_{index}"))
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
        ready = batch_ready(fixed_by_key.get(key, []), batch_qty, tl.to_t)
        return math.ceil((ready - 1e-8) / 10) * 10 if ready is not None else None

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
                    # 前站全數連續新排時，交接批量後可同步加工，兩站可以同時完工。
                    # 若前站另有固定片段，中間可能有長空檔；仍保留一批加工時間的
                    # 緩衝，避免後站在下一批實際做出前消耗超過已交接的數量。
                    buffer = dur_of(batch, p.steps[k].rate) if fixed_prev else 0
                    m.add(E[cur.key] >= E[prev.key] + buffer)
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

    # 軟性切換成本：同工單相鄰兩站（k-1 → k）換掉共通員工 / 共通機台的懲罰。
    # 只在有選擇時罰（該站只有一種人選或機台 → 屬必要配置，不計），權重為 0
    # 或 SOLVER_SWITCH_COST=0 時完全不加項，模型與基準一致。
    if _switch_cost_enabled(weights):
        def uses(key, pred, tag):
            """「這站選的組合滿足 pred」的布林（對滿足 pred 的候選 OR）。"""
            v = m.new_bool_var(f"uses_{tag}_{key[0]}_{key[1]}")
            lits = [X[key, pr] for pr in ops[key].pairs if pred(pr)]
            if lits:
                m.add_max_equality(v, lits)
            return v, bool(lits)

        def both(a, b, tag):
            """a ∧ b 的 reified 布林。"""
            v = m.new_bool_var(tag)
            m.add(v >= a + b - 1)
            m.add_implication(v, a)
            m.add_implication(v, b)
            return v

        for o in snap.orders:
            p = prods.get(o.product)
            if not p:
                continue
            for k in range(1, len(p.steps)):
                prev, cur = ops.get((o.id, k - 1)), ops.get((o.id, k))
                if not prev or not cur:
                    continue
                if weights.sw_emp:
                    prev_emps = {pr[1] for pr in prev.pairs}
                    cur_emps = {pr[1] for pr in cur.pairs}
                    shared = prev_emps & cur_emps
                    # 兩站員工集合本來就無交集 → 路由必然換人（技能限制），不罰
                    if shared and len(cur_emps) > 1:
                        keep = m.new_bool_var(f"same_emp_{o.id}_{k}")
                        lits = []
                        for e in sorted(shared):
                            # 同員工不論在哪台機器：兩站各自「用到 e」的 OR 再 AND
                            pe, ok1 = uses(prev.key, lambda pr, e=e: pr[1] == e, f"emp_prev")
                            ce, ok2 = uses(cur.key, lambda pr, e=e: pr[1] == e, f"emp_cur")
                            if ok1 and ok2:
                                lits.append(both(pe, ce, f"same_emp_{o.id}_{k}_{e}"))
                        if lits:
                            m.add_max_equality(keep, lits)
                            terms.append(weights.sw_emp * (1 - keep))
                if weights.sw_mach:
                    prev_machs = {pr[0] for pr in prev.pairs}
                    cur_machs = {pr[0] for pr in cur.pairs}
                    shared_m = prev_machs & cur_machs
                    # 相鄰兩站通常是不同工序 → 不同機台集合屬路由本質，不罰
                    if shared_m and len(cur_machs) > 1:
                        keep_m = m.new_bool_var(f"same_mach_{o.id}_{k}")
                        lits_m = []
                        for mid in sorted(shared_m):
                            pm, ok1 = uses(prev.key, lambda pr, mid=mid: pr[0] == mid, f"mach_prev")
                            cm, ok2 = uses(cur.key, lambda pr, mid=mid: pr[0] == mid, f"mach_cur")
                            if ok1 and ok2:
                                lits_m.append(both(pm, cm, f"same_mach_{o.id}_{k}_{mid}"))
                        if lits_m:
                            m.add_max_equality(keep_m, lits_m)
                            terms.append(weights.sw_mach * (1 - keep_m))
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
                or check(snap, draft.blocks, now, extra_overtime)):
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
            q = left if i == len(segs) - 1 else min(left, math.floor((b2 - a) * rate + 1e-8))
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
    search_mode = "restricted_pairs" if pair_cap is not None else "full"
    if unplaced:
        # CP-SAT 只看到可建模的工序；其最優不等於整張排程已完成。
        return Result(out, "INCOMPLETE", None, time.time() - t_start, len(ops),
                      unplaced, released, search_mode, pair_cap)
    issues = check(snap, out, now, extra_overtime)
    if issues:
        # 固定方塊可能本來就互相矛盾（例如跨廠前後站顛倒）。
        # 即使 CP-SAT 的子模型可行，也不能對外宣稱整份排程有效。
        return Result(out, "INVALID_SCHEDULE", None, time.time() - t_start, len(ops),
                      issues[:5], released, search_mode, pair_cap)
    return Result(out, name, solver.objective_value, time.time() - t_start, len(ops),
                  unplaced, released, search_mode, pair_cap)

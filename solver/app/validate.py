"""獨立檢查一份排程有沒有違反硬性規則（測試與 API 都會用）。"""
from __future__ import annotations

import math
from collections import defaultdict

from .schemas import Block, Now, Snapshot
from .material import batch_ready, produced_at
from .timeline import Timeline, abs_min


def check(snap: Snapshot, blocks: list[Block], now: Now | None = None,
          extra_overtime: frozenset[str] | set[str] = frozenset()) -> list[str]:
    issues: list[str] = []
    orders = {o.id: o for o in snap.orders}
    prods = {p.id: p for p in snap.products}
    machs = {m.id: m for m in snap.machines}
    emps = {e.id: e for e in snap.employees}
    work_by_day = defaultdict(list)
    work_by_employee_day = defaultdict(list)
    for a in snap.work_assignments:
        work_by_day[a.date].append(a)
        work_by_employee_day[(a.emp, a.date)].append(a)
    # 只建立實際有方塊的日期；避免固定 90 天視窗把遠期合法排程誤判成休息日，
    # 也避免因兩個日期相距多年而配置龐大的連續時間軸。
    days: dict[str, Timeline] = {}
    now_abs = abs_min(now.date, now.min) if now else None

    def name(b: Block) -> str:
        o = orders.get(b.order)
        return f"{o.code if o else b.order} 第{b.step + 1}站 {b.date} {b.start}-{b.end} {b.machine}"

    for b in blocks:
        o, m, e = orders.get(b.order), machs.get(b.machine), emps.get(b.employee or "")
        if not o or not m:
            issues.append(f"{name(b)}：工單或機台不存在")
            continue
        product = prods.get(o.product)
        if not product:
            issues.append(f"{name(b)}：找不到產品資料")
            continue
        if not 0 <= b.step < len(product.steps):
            issues.append(f"{name(b)}：產品沒有這道工序")
            continue
        st = product.steps[b.step]
        if b.qty > math.floor((b.end - b.start) * st.rate + 1e-8):
            issues.append(f"{name(b)}：件數超過工序速率可完成的數量")
        if not e:
            issues.append(f"{name(b)}：沒有人員")
        elif b.machine not in e.skills:
            issues.append(f"{name(b)}：{e.name} 不會操作 {b.machine}")
        if e and e.factory != m.factory:
            issues.append(f"{name(b)}：員工與機台不在同一廠")
        if m.factory != st.factory or m.process != st.process or o.product not in m.products:
            issues.append(f"{name(b)}：機台不能做這道工序")
        is_new = now_abs is None or abs_min(b.date, b.start) >= now_abs
        if b.date not in days:
            days[b.date] = Timeline(snap.calendar, b.date, 1, extra_overtime)
        w = days[b.date].window_of(b.date, b.start, b.end)
        if is_new and not w:
            issues.append(f"{name(b)}：不在上班時段內")
        if e and is_new:
            if b.date in e.leaves:
                issues.append(f"{name(b)}：{e.name} 請假")
            if not e.allows_overtime(b.date) and w and (w.overtime or w.special):
                issues.append(f"{name(b)}：{e.name} 不能加班")
        for f in m.faults:
            if f.date == b.date and f.start < b.end and f.end > b.start and is_new:
                issues.append(f"{name(b)}：機台故障中")

    # 同一機台仍不能重疊；人員可依個別上限同時顧多台。
    machines_by_day = defaultdict(list)
    employees_by_day = defaultdict(list)
    for b in blocks:
        machines_by_day[(b.machine, b.date)].append(b)
        if b.employee in emps:
            employees_by_day[(b.employee, b.date)].append(b)
    for bl in machines_by_day.values():
        bl.sort(key=lambda x: x.start)
        for a, c in zip(bl, bl[1:]):
            if c.start < a.end:
                issues.append(f"{name(a)} 和 {name(c)}：同一個機台時間重疊")
    for (employee_id, day), bl in employees_by_day.items():
        # General labor occupies the person's whole capacity, even when they can
        # normally monitor multiple machines. Quantities do not enter order totals.
        fixed_work = work_by_employee_day[(employee_id, day)]
        limit = emps[employee_id].max_concurrent_machines
        events = sorted([(b.start, 1) for b in bl] + [(b.end, -1) for b in bl] +
                        [(a.s, 1 if a.resourceId else limit) for a in fixed_work] +
                        [(a.e, -(1 if a.resourceId else limit)) for a in fixed_work])
        concurrent = 0
        for minute, change in events:
            concurrent += change
            if concurrent > emps[employee_id].max_concurrent_machines:
                issues.append(f"{emps[employee_id].name} {day} {minute}：同時顧機台數超過上限 {emps[employee_id].max_concurrent_machines}")
                break

    # Also check the fixed work itself and equipment shared with production.
    for a in snap.work_assignments:
        e = emps[a.emp]
        if a.date not in days:
            days[a.date] = Timeline(snap.calendar, a.date, 1, extra_overtime)
        w = days[a.date].window_of(a.date, a.s, a.e)
        is_new = now_abs is None or abs_min(a.date, a.s) >= now_abs
        if is_new and (not w or a.date in e.leaves or (w.overtime or w.special) and not e.allows_overtime(a.date)):
            issues.append(f"一般工作 {a.id}：上班、請假或加班時段不符合；請手動調整")
        if a.resourceId:
            machine = machs[a.resourceId]
            if is_new and any(f.date == a.date and f.start < a.e and f.end > a.s for f in machine.faults):
                issues.append(f"一般工作 {a.id}：設備故障；請手動調整")
            if any(b.machine == a.resourceId and b.date == a.date and b.start < a.e and b.end > a.s for b in blocks):
                issues.append(f"一般工作 {a.id}：設備與工單工作重疊")
        peers = [b for b in work_by_day[a.date] if b.s < a.e and b.e > a.s]
        if any(b.id != a.id and a.resourceId and b.resourceId == a.resourceId for b in peers):
            issues.append(f"一般工作 {a.id}：設備工作重疊")
        own = [b for b in peers if b.emp == a.emp]
        events = sorted([(b.s, 1 if b.resourceId else e.max_concurrent_machines) for b in own] +
                        [(b.e, -(1 if b.resourceId else e.max_concurrent_machines)) for b in own])
        load = 0
        for _, change in events:
            load += change
            if load > e.max_concurrent_machines:
                issues.append(f"一般工作 {a.id}：人員時間衝突")
                break

    # 數量、工序順序
    by = defaultdict(list)
    for b in blocks:
        by[(b.order, b.step)].append(b)
    for o in snap.orders:
        p = prods.get(o.product)
        if not p:
            issues.append(f"{o.code}：找不到產品資料")
            continue
        if not p.steps:
            issues.append(f"{o.code}：產品沒有工序；請先建立產品工序")
            continue
        for k, st in enumerate(p.steps):
            q = sum(b.qty for b in by[(o.id, k)])
            if q != o.qty:
                issues.append(f"{o.code} 第{k + 1}站：數量 {q} 不等於 {o.qty}")
            if k == 0 or not by[(o.id, k)] or not by[(o.id, k - 1)]:
                continue
            prev = by[(o.id, k - 1)]
            cur_start = min(abs_min(b.date, b.start) for b in by[(o.id, k)])
            prev_end = max(abs_min(b.date, b.end) for b in prev)
            batch = st.batch if 0 < st.batch < o.qty else o.qty
            ready = batch_ready(prev, batch, abs_min)
            if ready is None:
                issues.append(f"{o.code} 第{k + 1}站：前站尚未完成交接批量 {batch} 件")
                ready = prev_end
            if cur_start < ready - 0.5:
                issues.append(f"{o.code} 第{k + 1}站：前站還沒做到可以開始")
            cur_end = max(abs_min(b.date, b.end) for b in by[(o.id, k)])
            if cur_end < prev_end:
                issues.append(f"{o.code} 第{k + 1}站：比前站先做完")
            if 0 < st.batch < o.qty:
                current = by[(o.id, k)]

                # 每段內產量線性變化；差額的最小值必在某段起點或終點。
                # 逐一檢查這些點，防止首批交接後、下一批尚未做出時後站超量加工。
                boundaries = sorted({abs_min(b.date, minute)
                                     for b in (*prev, *current) for minute in (b.start, b.end)})
                for minute in boundaries:
                    if produced_at(current, minute, abs_min) > produced_at(prev, minute, abs_min) + 0.5:
                        issues.append(f"{o.code} 第{k + 1}站：前站累積產量不足，後站不能先做完這些件數")
                        break
    return issues

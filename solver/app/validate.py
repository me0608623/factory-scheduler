"""獨立檢查一份排程有沒有違反硬性規則（測試與 API 都會用）。"""
from __future__ import annotations

from collections import defaultdict

from .schemas import Block, Now, Snapshot
from .timeline import Timeline, abs_min


def check(snap: Snapshot, blocks: list[Block], now: Now | None = None) -> list[str]:
    issues: list[str] = []
    orders = {o.id: o for o in snap.orders}
    prods = {p.id: p for p in snap.products}
    machs = {m.id: m for m in snap.machines}
    emps = {e.id: e for e in snap.employees}
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
            days[b.date] = Timeline(snap.calendar, b.date, 1)
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
        events = sorted([(b.start, 1) for b in bl] + [(b.end, -1) for b in bl])
        concurrent = 0
        for minute, change in events:
            concurrent += change
            if concurrent > emps[employee_id].max_concurrent_machines:
                issues.append(f"{emps[employee_id].name} {day} {minute}：同時顧機台數超過上限 {emps[employee_id].max_concurrent_machines}")
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
        for k, st in enumerate(p.steps):
            q = sum(b.qty for b in by[(o.id, k)])
            if q != o.qty:
                issues.append(f"{o.code} 第{k + 1}站：數量 {q} 不等於 {o.qty}")
            if k == 0 or not by[(o.id, k)] or not by[(o.id, k - 1)]:
                continue
            prev = sorted(by[(o.id, k - 1)], key=lambda b: abs_min(b.date, b.start))
            cur_start = min(abs_min(b.date, b.start) for b in by[(o.id, k)])
            prev_end = max(abs_min(b.date, b.end) for b in prev)
            batch = st.batch if 0 < st.batch < o.qty else o.qty
            cum, ready = 0, prev_end
            for b in prev:
                if cum + b.qty >= batch:
                    ready = abs_min(b.date, b.start) + (batch - cum) / b.qty * (b.end - b.start)
                    break
                cum += b.qty
            if cur_start < ready - 0.5:
                issues.append(f"{o.code} 第{k + 1}站：前站還沒做到可以開始")
            cur_end = max(abs_min(b.date, b.end) for b in by[(o.id, k)])
            if cur_end < prev_end:
                issues.append(f"{o.code} 第{k + 1}站：比前站先做完")
    return issues

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
    start = min([b.date for b in blocks] + ([now.date] if now else [])) if blocks else (now.date if now else "2000-01-01")
    tl = Timeline(snap.calendar, start, 90)
    now_abs = abs_min(now.date, now.min) if now else None

    def name(b: Block) -> str:
        o = orders.get(b.order)
        return f"{o.code if o else b.order} 第{b.step + 1}站 {b.date} {b.start}-{b.end} {b.machine}"

    for b in blocks:
        o, m, e = orders.get(b.order), machs.get(b.machine), emps.get(b.employee or "")
        if not o or not m:
            issues.append(f"{name(b)}：工單或機台不存在")
            continue
        st = prods[o.product].steps[b.step]
        if not e:
            issues.append(f"{name(b)}：沒有人員")
        elif b.machine not in e.skills:
            issues.append(f"{name(b)}：{e.name} 不會操作 {b.machine}")
        if m.process != st.process or o.product not in m.products:
            issues.append(f"{name(b)}：機台不能做這道工序")
        is_new = now_abs is None or abs_min(b.date, b.start) >= now_abs
        w = tl.window_of(b.date, b.start, b.end)
        if is_new and not w:
            issues.append(f"{name(b)}：不在上班時段內")
        if e and is_new:
            if b.date in e.leaves:
                issues.append(f"{name(b)}：{e.name} 請假")
            if e.no_overtime and w and (w.overtime or w.special):
                issues.append(f"{name(b)}：{e.name} 不能加班")
        for f in m.faults:
            if f.date == b.date and f.start < b.end and f.end > b.start and is_new:
                issues.append(f"{name(b)}：機台故障中")

    # 重疊：同一台機台、同一個人
    for attr in ("machine", "employee"):
        groups = defaultdict(list)
        for b in blocks:
            groups[(getattr(b, attr), b.date)].append(b)
        for (_, _), bl in groups.items():
            bl.sort(key=lambda x: x.start)
            for a, c in zip(bl, bl[1:]):
                if c.start < a.end:
                    issues.append(f"{name(a)} 和 {name(c)}：同一個{'機台' if attr == 'machine' else '人'}時間重疊")

    # 數量、工序順序
    by = defaultdict(list)
    for b in blocks:
        by[(b.order, b.step)].append(b)
    for o in snap.orders:
        p = prods[o.product]
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

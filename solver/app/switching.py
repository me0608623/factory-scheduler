"""軟性切換成本：量測與分類（Phase 5 指標）。

只做「事後量測」——從輸出方塊區分：
- 真正的機台切換（同機台相鄰、不同 (工單,工序)）
- 真正的員工切換（同人連續時段、不同 (工單,工序)）
- 零碎短段：necessary（整個工序剩量本來就短／故障迫近／固定不可動）
  vs avoidable（長工序被切出的短頭短尾，原則上有更連續的排法）

同一工序（同 order+step）因午休、下班、跨日、故障產生的多個顯示方塊，
彼此相鄰時「不」計為切換（自然分段，非換模）。

本模組不改變求解行為；CP-SAT 內的引導成本見 model.py Weights.sw_emp / sw_mach。
"""
from __future__ import annotations

SHORT_PIECE_MIN = 20  # 真實分鐘。短於此視為零碎段候選（不含 0 長度）


def _op_key(b) -> tuple:
    return (b.order, b.step)


def switching_metrics(snap, blocks) -> dict:
    """計算切換與零碎段指標。blocks 為真實時間方塊（含固定段）。"""
    faults_by_machine: dict[str, list] = {}
    for m in snap.machines:
        for f in m.faults:
            faults_by_machine.setdefault(m.id, []).append(f)

    # ---- 機台切換：同機台按時間排序，相鄰且不同工序 → 切換 ----
    machine_switches = 0
    by_machine: dict[str, list] = {}
    for b in blocks:
        if b.machine:
            by_machine.setdefault(b.machine, []).append(b)
    for mid, bs in by_machine.items():
        bs.sort(key=lambda b: (b.date, b.start))
        for prev, cur in zip(bs, bs[1:]):
            if _op_key(prev) == _op_key(cur):
                continue  # 同工序的分段（自然切段或故障中斷）
            if cur.date == prev.date and cur.start < prev.end:
                continue  # 防禦：重疊資料不計
            machine_switches += 1

    # ---- 員工切換：同人連續（起點不同）時段的工序變化 ----
    # 同時開始的多機並行 = 顧機台不是切換；同工序分段不算。
    employee_switches = 0
    by_emp: dict[str, list] = {}
    for b in blocks:
        if b.employee:
            by_emp.setdefault(b.employee, []).append(b)
    for eid, bs in by_emp.items():
        bs.sort(key=lambda b: (b.date, b.start))
        dedup: list = []
        for b in bs:
            if dedup and dedup[-1].date == b.date and dedup[-1].start == b.start:
                continue  # 並行顧機
            dedup.append(b)
        for prev, cur in zip(dedup, dedup[1:]):
            if _op_key(prev) != _op_key(cur):
                employee_switches += 1

    # ---- 零碎短段分類：以 (order, step) 為一個工序單位 ----
    ops_pieces: dict[tuple, list] = {}
    for b in blocks:
        if b.end > b.start:
            ops_pieces.setdefault(_op_key(b), []).append(b)
    short_necessary = 0
    short_avoidable = 0
    for key, pieces in ops_pieces.items():
        op_total = sum(p.end - p.start for p in pieces)
        pinned = any(p.pinned for p in pieces)
        for p in pieces:
            if p.end - p.start >= SHORT_PIECE_MIN:
                continue
            # 必要：整個工序本來就短（剩量少）、被固定、或片段緊貼故障邊界
            if op_total <= SHORT_PIECE_MIN or pinned or _touches_fault(p, faults_by_machine.get(p.machine, [])):
                short_necessary += 1
            else:
                short_avoidable += 1

    pieces_total = sum(len(v) for v in ops_pieces.values())
    continuity = round(1 - (short_avoidable / pieces_total), 3) if pieces_total else 1.0
    return {"machine_switches": machine_switches, "employee_switches": employee_switches,
            "short_necessary": short_necessary, "short_avoidable": short_avoidable,
            "pieces_total": pieces_total, "continuity": continuity}


def _touches_fault(b, faults) -> bool:
    """片段的頭或尾緊貼（±1 分鐘容差）該機台故障時段 → 故障迫使的邊界。"""
    for f in faults:
        if f.date != b.date:
            continue
        if abs(b.start - f.end) <= 1 or abs(b.end - f.start) <= 1:
            return True
    return False

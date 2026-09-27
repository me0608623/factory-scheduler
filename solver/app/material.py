"""按多個（可能並行）的工作方塊計算累積產量與交接時間。"""
from __future__ import annotations

from collections.abc import Callable, Iterable

from .schemas import Block


def produced_at(blocks: Iterable[Block], minute: float,
                time_of: Callable[[str, int], int]) -> float:
    total = 0.0
    for block in blocks:
        begin = time_of(block.date, block.start)
        finish = time_of(block.date, block.end)
        if finish <= begin:
            # 壓縮工作時間軸中，早於範圍起點的固定工作已在 t=0 完成。
            total += block.qty if minute >= finish else 0
        else:
            total += block.qty * min(1.0, max(0.0, (minute - begin) / (finish - begin)))
    return total


def batch_ready(blocks: Iterable[Block], batch_qty: int,
                time_of: Callable[[str, int], int]) -> float | None:
    pieces = list(blocks)
    if not pieces or sum(block.qty for block in pieces) < batch_qty:
        return None
    points = sorted({time_of(block.date, minute)
                     for block in pieces for minute in (block.start, block.end)})
    previous = points[0]
    made = produced_at(pieces, previous, time_of)
    if made >= batch_qty:
        return float(previous)
    for minute in points[1:]:
        next_made = produced_at(pieces, minute, time_of)
        if next_made >= batch_qty:
            return previous + (batch_qty - made) / (next_made - made) * (minute - previous)
        previous, made = minute, next_made
    return None

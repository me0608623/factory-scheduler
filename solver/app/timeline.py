"""工作時間軸：把每天的上班時段接成一條連續的線。

一段工作在時間軸上是連續的；換回真實時間時，會在午休、下班、停工日自動切成好幾段，
和原型網頁「工作太長會跨午休或跨日分段」的行為一致。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .schemas import Calendar


def s2d(s: str) -> date:
    return date.fromisoformat(s)


def add_days(s: str, n: int) -> str:
    return (s2d(s) + timedelta(days=n)).isoformat()


def weekday(s: str) -> int:
    """0 = 週日（和資料庫 calendar_weekly 一致）。"""
    return s2d(s).isoweekday() % 7


def abs_min(ds: str, minute: int) -> int:
    """真實時間的絕對分鐘數，用來比較先後。"""
    return s2d(ds).toordinal() * 1440 + minute


@dataclass(frozen=True)
class Win:
    date: str
    start: int
    end: int
    overtime: bool          # 晚上的加班時段
    special: bool           # 國定假日、週末出勤（對「不能加班」的人也算加班）
    t0: int                 # 在時間軸上的起點

    @property
    def t1(self) -> int:
        return self.t0 + self.end - self.start


class Timeline:
    def __init__(self, cal: Calendar, start: str, days: int = 60, extra_overtime: frozenset[str] | set[str] = frozenset()):
        self.cal = cal
        self.start = start
        self.days = days
        self.wins: list[Win] = []
        t = 0
        wdefs = sorted(cal.windows, key=lambda w: w.start)
        for i in range(days):
            ds = add_days(start, i)
            if not self.is_open(ds):
                continue
            ot = cal.overtime.get(ds, False) or ds in extra_overtime
            special = self.day_type(ds) != "work"
            for w in wdefs:
                if w.overtime and not ot:
                    continue
                self.wins.append(Win(ds, w.start, w.end, w.overtime, special, t))
                t += w.end - w.start
        self.horizon = t

    # ---------- 日曆 ----------
    def day_type(self, ds: str) -> str:
        if ds in self.cal.holidays:
            return "hol"
        w = weekday(ds)
        return "sun" if w == 0 else "sat" if w == 6 else "work"

    def is_open(self, ds: str) -> bool:
        if ds in self.cal.overrides:
            return self.cal.overrides[ds]
        return bool(self.cal.week[weekday(ds)])

    # ---------- 換算 ----------
    def to_t(self, ds: str, minute: int) -> int:
        """真實時間 → 時間軸位置；落在休息時段就取下一個上班時段的開頭。"""
        for w in self.wins:
            if (w.date, w.end) > (ds, minute):
                if (w.date, w.start) >= (ds, minute):
                    return w.t0
                return w.t0 + (minute - w.start)
        return self.horizon

    def end_of_date(self, ds: str) -> int:
        """某天最後一個上班時段結束時，在時間軸上的位置（期限用）。"""
        return self.to_t(add_days(ds, 1), 0)

    def to_real(self, t0: int, t1: int) -> list[tuple[str, int, int]]:
        """時間軸區間 → 真實時間的幾段 (日期, 開始, 結束)。

        每個上班時段各自一段：17:00 前後分開，加班的部分才看得出來。
        """
        out: list[tuple[str, int, int]] = []
        for w in self.wins:
            if w.t1 <= t0:
                continue
            if w.t0 >= t1:
                break
            a, b = max(t0, w.t0), min(t1, w.t1)
            out.append((w.date, w.start + a - w.t0, w.start + b - w.t0))
        return out

    def day_span(self, ds: str) -> tuple[int, int] | None:
        ws = [w for w in self.wins if w.date == ds]
        return (ws[0].t0, ws[-1].t1) if ws else None

    def overtime_spans(self) -> list[tuple[int, int]]:
        """「不能加班」的人不能排的時段：晚上加班時段、假日出勤。"""
        return [(w.t0, w.t1) for w in self.wins if w.overtime or w.special]

    def window_of(self, ds: str, s: int, e: int) -> Win | None:
        for w in self.wins:
            if w.date == ds and w.start <= s and e <= w.end:
                return w
        return None

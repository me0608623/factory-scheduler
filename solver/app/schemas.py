"""資料格式：和資料庫函式 schedule_snapshot() 的輸出一致。

時間一律用「日期字串 + 當天第幾分鐘」表示，例如 480 = 08:00。
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class Step(BaseModel):
    process: str
    rate: float                      # 一個人每分鐘做幾件
    batch: int = 0                   # 前站完成幾件就能傳到這站；0 = 前站全部完成


class Product(BaseModel):
    id: str
    name: str
    steps: list[Step]


class Fault(BaseModel):
    id: str | None = None
    date: str
    start: int
    end: int
    note: str | None = None
    fixed: bool = False
    original_blocks: list[dict] = Field(default_factory=list)


class Machine(BaseModel):
    id: str
    label: str = ""
    process: str
    products: list[str]
    faults: list[Fault] = Field(default_factory=list)


class Employee(BaseModel):
    id: str
    name: str
    skills: list[str]                # 會操作的機台
    max_concurrent_machines: int = Field(default=1, ge=1, le=100)
    leaves: list[str] = Field(default_factory=list)
    no_overtime: bool = False        # 不能加班（也不排國定假日、週末出勤）
    overtime_weekdays: list[int] | None = None  # 0=週日；舊快照用 no_overtime
    overtime_overrides: dict[str, bool] = Field(default_factory=dict)
    color: int = 0

    def allows_overtime(self, day: str) -> bool:
        if day in self.overtime_overrides:
            return self.overtime_overrides[day]
        if self.overtime_weekdays is None:
            return not self.no_overtime
        return date.fromisoformat(day).isoweekday() % 7 in self.overtime_weekdays


class Order(BaseModel):
    id: str
    code: str
    product: str
    qty: int
    due: str                         # 最晚完成日
    priority: int = 2                # 0 特急、1 急、2 一般、3 不急


class Block(BaseModel):
    id: str | None = None
    order: str
    step: int
    machine: str
    employee: str | None
    date: str
    start: int
    end: int
    qty: int
    pinned: bool = False


class WindowDef(BaseModel):
    start: int
    end: int
    overtime: bool = False


DEFAULT_WINDOWS = [WindowDef(start=480, end=720), WindowDef(start=780, end=1020), WindowDef(start=1020, end=1200, overtime=True)]


class Calendar(BaseModel):
    week: list[bool]                                     # 0 = 週日
    overrides: dict[str, bool] = Field(default_factory=dict)   # 單日改為上班／停工
    overtime: dict[str, bool] = Field(default_factory=dict)    # 開加班的日子
    holidays: dict[str, str] = Field(default_factory=dict)
    windows: list[WindowDef] = Field(default_factory=lambda: list(DEFAULT_WINDOWS))


class Now(BaseModel):
    date: str
    min: int


class Snapshot(BaseModel):
    version: int = 0
    calendar: Calendar
    employees: list[Employee]
    machines: list[Machine]
    products: list[Product]
    orders: list[Order]
    blocks: list[Block] = Field(default_factory=list)


class Event(BaseModel):
    type: Literal["fault", "leave", "order", "recover", "auto"]
    machine: str | None = None       # fault
    date: str | None = None          # fault、leave
    start: int | None = None         # fault
    end: int | None = None           # fault
    note: str | None = None
    employee: str | None = None      # leave
    order: Order | None = None       # order（新增或修改的工單）
    fault_id: str | None = None      # recover


class PlanRequest(BaseModel):
    snapshot: Snapshot
    event: Event
    now: Now | None = None
    time_limit: float = 5.0          # 每個方案最多算幾秒


class SolveRequest(BaseModel):
    snapshot: Snapshot
    now: Now | None = None
    preset: Literal["min_change", "on_time"] = "on_time"
    time_limit: float = 5.0

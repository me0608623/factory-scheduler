"""資料格式：和資料庫函式 schedule_snapshot() 的輸出一致。

時間一律用「日期字串 + 當天第幾分鐘」表示，例如 480 = 08:00。
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


def iso_day(value: str) -> str:
    """保留 API 的日期字串格式，同時在進入時間軸前驗證它。"""
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("日期必須是 YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise ValueError("日期必須是 YYYY-MM-DD")
    return value


class Step(BaseModel):
    process: str
    factory: int = Field(default=1, ge=1, le=2)
    rate: float = Field(gt=0, allow_inf_nan=False)  # 一個人每分鐘做幾件；須為有限正數
    batch: int = Field(default=0, ge=0)  # 前站完成幾件就能傳到這站；0 = 前站全部完成


class Product(BaseModel):
    id: str
    name: str
    steps: list[Step]


class Fault(BaseModel):
    id: str | None = None
    date: str
    start: int = Field(ge=0, lt=1440)
    end: int = Field(gt=0, le=1440)
    note: str | None = None
    fixed: bool = False
    original_blocks: list[dict] = Field(default_factory=list)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        return iso_day(value)

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end <= self.start:
            raise ValueError("故障結束時間必須晚於開始時間")
        return self


class Machine(BaseModel):
    id: str
    label: str = ""
    factory: int = Field(default=1, ge=1, le=2)
    process: str
    products: list[str]
    faults: list[Fault] = Field(default_factory=list)


class Employee(BaseModel):
    id: str
    name: str
    factory: int = Field(default=1, ge=1, le=2)
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
    qty: int = Field(gt=0)
    due: str                         # 最晚完成日
    priority: int = Field(default=2, ge=0, le=3)  # 0 特急、1 急、2 一般、3 不急

    @field_validator("due")
    @classmethod
    def valid_due(cls, value: str) -> str:
        return iso_day(value)


class Block(BaseModel):
    id: str | None = None
    order: str
    step: int = Field(ge=0)
    machine: str
    employee: str | None
    date: str
    start: int = Field(ge=0, lt=1440)
    end: int = Field(gt=0, le=1440)
    qty: int = Field(gt=0)
    pinned: bool = False

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        return iso_day(value)

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end <= self.start:
            raise ValueError("工作結束時間必須晚於開始時間")
        return self


class WindowDef(BaseModel):
    start: int = Field(ge=0, lt=1440)
    end: int = Field(gt=0, le=1440)
    overtime: bool = False

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end <= self.start:
            raise ValueError("上班時段結束時間必須晚於開始時間")
        return self


DEFAULT_WINDOWS = [WindowDef(start=480, end=720), WindowDef(start=780, end=1020), WindowDef(start=1020, end=1200, overtime=True)]


class Calendar(BaseModel):
    week: list[bool] = Field(min_length=7, max_length=7)  # 0 = 週日
    overrides: dict[str, bool] = Field(default_factory=dict)   # 單日改為上班／停工
    overtime: dict[str, bool] = Field(default_factory=dict)    # 開加班的日子
    holidays: dict[str, str] = Field(default_factory=dict)
    windows: list[WindowDef] = Field(default_factory=lambda: list(DEFAULT_WINDOWS))

    @model_validator(mode="after")
    def no_overlapping_windows(self):
        ordered = sorted(self.windows, key=lambda window: window.start)
        if any(right.start < left.end for left, right in zip(ordered, ordered[1:])):
            raise ValueError("上班時段不可重疊")
        return self


class Now(BaseModel):
    date: str
    min: int = Field(ge=0, le=1440)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        return iso_day(value)


class WorkAssignment(BaseModel):
    """Independent planned work. No manufactured equipment or production rate."""
    id: str
    workId: str
    emp: str
    resourceId: str | None = None
    date: str
    s: int = Field(ge=0, lt=1440)
    e: int = Field(gt=0, le=1440)

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        return iso_day(value)

    @model_validator(mode="after")
    def valid_span(self):
        if self.e <= self.s:
            raise ValueError("一般工作結束時間須晚於開始時間")
        return self


class WorkExecution(BaseModel):
    """現場回報；完工後排程以實際良品數而非原定件數扣除。"""
    blockId: str
    status: Literal["running", "done"]
    qtyDone: int = Field(default=0, ge=0)


class Snapshot(BaseModel):
    version: int = 0
    setup_pending: bool = False
    calendar: Calendar
    employees: list[Employee]
    machines: list[Machine]
    products: list[Product]
    orders: list[Order]
    blocks: list[Block] = Field(default_factory=list)
    work_assignments: list[WorkAssignment] = Field(default_factory=list, max_length=10000)
    work_execution: list[WorkExecution] = Field(default_factory=list, max_length=10000)

    @model_validator(mode="after")
    def work_references(self):
        employees = {e.id: e for e in self.employees}
        machines = {m.id: m for m in self.machines}
        seen = set()
        for a in self.work_assignments:
            if a.id in seen or a.emp not in employees:
                raise ValueError("一般工作代號重複或員工不存在")
            seen.add(a.id)
            if a.resourceId is not None:
                m = machines.get(a.resourceId)
                e = employees[a.emp]
                if m is None or m.factory != e.factory or m.id not in e.skills:
                    raise ValueError("一般工作設備或員工操作資格不符合")
        return self


class Event(BaseModel):
    type: Literal["fault", "leave", "order", "recover", "auto"]
    machine: str | None = None       # fault
    date: str | None = None          # fault、leave
    start: int | None = Field(default=None, ge=0, lt=1440)  # fault
    end: int | None = Field(default=None, gt=0, le=1440)    # fault
    note: str | None = None
    employee: str | None = None      # leave
    order: Order | None = None       # order（新增或修改的工單）
    fault_id: str | None = None      # recover

    @field_validator("date")
    @classmethod
    def valid_date(cls, value: str | None) -> str | None:
        return iso_day(value) if value is not None else None

    @model_validator(mode="after")
    def required_fields(self):
        if self.type == "fault" and (not self.machine or not self.date or self.start is None
                                      or self.end is None or self.end <= self.start):
            raise ValueError("故障需指定機台、日期與有效起訖時間")
        if self.type == "leave" and (not self.employee or not self.date):
            raise ValueError("請假需指定員工與日期")
        if self.type == "order" and self.order is None:
            raise ValueError("新增或修改工單需提供工單資料")
        if self.type == "recover" and not self.fault_id:
            raise ValueError("機台恢復需指定故障紀錄")
        return self


class PlanRequest(BaseModel):
    snapshot: Snapshot
    event: Event
    now: Now | None = None
    time_limit: float = Field(default=5.0, gt=0, le=10)  # 每個方案最多算幾秒


class SolveRequest(BaseModel):
    snapshot: Snapshot
    now: Now | None = None
    preset: Literal["min_change", "on_time"] = "on_time"
    time_limit: float = Field(default=5.0, gt=0, le=10)

"""Bounded staff-roster draft optimization. No payroll or production mutations.

The browser performs a second legal audit. No legal-certification flag is returned.
Fixed rest-day patterns and known production occupancy are hard constraints.
"""
from datetime import date, timedelta
from math import floor
from typing import Literal

from ortools.sat.python import cp_model
from pydantic import BaseModel, Field, model_validator


class Shift(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    segments: list[tuple[int, int]] = Field(min_length=1, max_length=8)

    @model_validator(mode='after')
    def valid_segments(self):
        end = -1
        for a, b in self.segments:
            if not 0 <= a < b <= 2880 or a < end:
                raise ValueError('班別時段無效或重疊')
            end = b
        if self.segments[0][0] >= 1440 or end - self.segments[0][0] > 1440:
            raise ValueError('班別須從當日開始且跨度不超過 24 小時')
        return self

    @property
    def minutes(self):
        return sum(b-a for a, b in self.segments)


class Position(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    employeeIds: list[str] = Field(max_length=100)
    rate: float | None = Field(default=None, gt=0, le=1000000, allow_inf_nan=False)


class Availability(BaseModel):
    emp: str
    shiftIds: list[str] = Field(max_length=8)
    weekdays: list[int] = Field(max_length=7)


class Cell(BaseModel):
    emp: str
    date: date
    type: Literal['work', 'regular', 'rest', 'leave', 'holiday']
    shiftId: str | None
    positionId: str | None
    pin: bool = False


class Demand(BaseModel):
    date: date
    shiftId: str
    positionId: str
    people: int = Field(ge=0, le=100)
    target: int = Field(ge=0, le=1000000000)


class Roster(BaseModel):
    id: str
    regime: Literal['fixed', 'two', 'four', 'eight']
    start: date
    anchor: date
    eligibilityRef: str = Field(default='', max_length=500)
    consentRef: str = Field(default='', max_length=500)
    rotationConsentRef: str = Field(default='', max_length=500)
    shifts: list[Shift] = Field(min_length=1, max_length=8)
    positions: list[Position] = Field(min_length=1, max_length=40)
    employees: list[Availability] = Field(min_length=1, max_length=100)
    cells: list[Cell] = Field(max_length=5600)
    demands: list[Demand] = Field(min_length=1, max_length=4480)


class Worker(BaseModel):
    id: str
    leaves: list[date] = Field(default_factory=list, max_length=730)


class Occupancy(BaseModel):
    emp: str | None
    date: date
    s: int = Field(ge=0, lt=1440)
    e: int = Field(gt=0, le=1440)


class RosterRequest(BaseModel):
    roster: Roster
    workers: list[Worker] = Field(max_length=100)
    occupied: list[Occupancy] = Field(default_factory=list, max_length=10000)
    previous: list[Cell] = Field(default_factory=list, max_length=600)
    previousShifts: list[Shift] = Field(default_factory=list, max_length=8)
    time_limit: float = Field(default=3, gt=0, le=10)


RULES = {'fixed': (7, 480, 2400, 2400, 2), 'two': (14, 600, 2880, 4800, 4),
         'four': (28, 600, None, 9600, 8), 'eight': (56, 480, 2880, 19200, 16)}


def solve_roster(req: RosterRequest):
    p = req.roster
    days, daily, weekly, total, rests = RULES[p.regime]
    dates = [p.start + timedelta(days=i) for i in range(days)]
    emps = {e.emp: e for e in p.employees}
    workers = {e.id: e for e in req.workers}
    shifts = {s.id: s for s in p.shifts}
    positions = {s.id: s for s in p.positions}
    cells = {(c.emp, c.date): c for c in p.cells}
    demands = {(d.date, d.shiftId, d.positionId): d for d in p.demands}
    if (p.start-p.anchor).days % days or len(emps) != len(p.employees) or len(shifts) != len(p.shifts) or len(positions) != len(p.positions) or len(cells) != len(p.cells) or len(demands) != len(p.demands):
        raise ValueError('代號重複或週期基準日未對齊')
    if set(cells) != {(e, d) for e in emps for d in dates} or not set(emps) <= set(workers):
        raise ValueError('必須提供全部員工及完整週期班格')
    if p.regime != 'fixed' and (not p.eligibilityRef.strip() or not p.consentRef.strip()):
        raise ValueError('變形工時適用依據／工會或勞資會議同意紀錄尚未確認')
    if any(not set(e.shiftIds) <= set(shifts) or any(d not in range(7) for d in e.weekdays) for e in emps.values()) or any(not set(pos.employeeIds) <= set(emps) for pos in positions.values()):
        raise ValueError('可用班別、星期或崗位資格无效')
    if any(d.date not in dates or d.shiftId not in shifts or d.positionId not in positions for d in p.demands):
        raise ValueError('需求參照無效')
    if any(d.target and positions[d.positionId].rate is None for d in p.demands):
        raise ValueError('有產量目標的崗位必須先確認每人每小時產能')
    for c in p.cells:
        if c.shiftId and c.shiftId not in shifts or c.positionId and c.positionId not in positions or c.type != 'work' and (c.shiftId or c.positionId):
            raise ValueError('每日班格參照無效')
    # The optimizer does not relabel leave as a statutory rest day or invent rest patterns.
    for emp in emps:
        cs = [cells[emp, d] for d in dates]
        if sum(c.type in ('regular', 'rest') for c in cs) < rests:
            raise ValueError('固定休假樣式的例假＋休息日不足，請先調整')
        span = 14 if p.regime == 'four' else 7
        for i in range(0, days, span):
            if sum(c.type == 'regular' for c in cs[i:i+span]) < (2 if span == 14 else 1) or p.regime == 'fixed' and not any(c.type == 'rest' for c in cs[i:i+span]):
                raise ValueError('固定休假樣式的例假／休息日不足')
        if p.regime != 'four':
            prior = sorted([c for c in req.previous if c.emp == emp and p.start-timedelta(days=6) <= c.date < p.start], key=lambda c:c.date)
            run = 0
            for c in prior + cs:
                run = run+1 if c.type == 'work' else 0
                if run > 6:
                    raise ValueError('跨日／跨週期連續工作超過六日')
    model = cp_model.CpModel()
    choices = {}
    terms = []
    existing = {(c.emp, c.date): (c.shiftId, c.positionId) for c in p.cells}
    occupied = {}
    for b in req.occupied:
        if b.e <= b.s:
            raise ValueError('既有工作時段無效')
        if b.emp in emps and b.date in dates:
            occupied.setdefault((b.emp, b.date), []).append(b)
            if cells[b.emp, b.date].type != 'work':
                raise ValueError('既有產線工作落在例假／休息／請假日，請先處理衝突')
    for emp, avail in emps.items():
        previous = sorted([c for c in req.previous if c.emp == emp and c.date < p.start and c.shiftId], key=lambda c:c.date)
        tail = previous[-1] if previous else None
        tail_shift = next((s for s in req.previousShifts if tail and s.id == tail.shiftId), None)
        for i, day in enumerate(dates):
            c = cells[emp, day]
            if c.type != 'work':
                continue
            daychoices = []
            for s in p.shifts:
                if s.id not in avail.shiftIds or (day.weekday()+1) % 7 not in avail.weekdays or s.minutes > daily:
                    continue
                if any(day + timedelta(days=k) in workers[emp].leaves for k in range(2) if any(a < (k+1)*1440 and b > k*1440 for a,b in s.segments)):
                    continue
                if any(b > 1440 for a,b in s.segments) and i+1 < days and cells[emp,dates[i+1]].type != 'work':
                    continue
                continuous = 0
                for j,(a,b) in enumerate(s.segments):
                    if j == 0 or a-s.segments[j-1][1] >= 30:
                        continuous = 0
                    continuous += b-a
                    if continuous > 240:
                        break
                if continuous > 240 or any(not any(b.s >= a and b.e <= z for a,z in s.segments) for b in occupied.get((emp,day), [])):
                    continue
                if tail_shift and (day-tail.date).days*1440+s.segments[0][0]-tail_shift.segments[-1][1] < 660:
                    continue
                for pos in p.positions:
                    if emp not in pos.employeeIds:
                        continue
                    if (day,s.id,pos.id) not in demands and not c.pin and (emp,day) not in occupied:
                        continue
                    x = model.new_bool_var(f'x_{emp}_{i}_{s.id}_{pos.id}')
                    choices[emp,day,s.id,pos.id] = x
                    daychoices.append(x)
                    terms.append(x*(100000 + (0 if existing[emp,day] == (s.id,pos.id) else 5)))
                    if len(choices) > 24000:
                        raise ValueError('候選班格超過 24,000，請縮小崗位／員工範圍')
            model.add(sum(daychoices) <= 1)
            if c.pin or (emp,day) in occupied:
                if c.pin and (emp,day,c.shiftId,c.positionId) not in choices:
                    raise ValueError('固定班格不可用／資格未確認，請先解除固定或修正')
                model.add(sum(daychoices) == 1)
                if c.pin:
                    model.add(choices[emp,day,c.shiftId,c.positionId] == 1)
    # Shift-rest and weekly rotation constraints include non-adjacent workdays.
    by_emp_day = {}
    for (emp,day,sid,pid), x in choices.items():
        by_emp_day.setdefault((emp,day,sid), []).append(x)
    for emp in emps:
        for i,a in enumerate(dates):
            for j in range(i+1, min(max((i//7+1)*7,i+3),days)):
                b = dates[j]
                for s in p.shifts:
                    for t in p.shifts:
                        if (b-a).days*1440+t.segments[0][0]-s.segments[-1][1] < 660 or not p.rotationConsentRef.strip() and i//7 == j//7 and s.id != t.id:
                            model.add(sum(by_emp_day.get((emp,a,s.id),[]))+sum(by_emp_day.get((emp,b,t.id),[])) <= 1)
        hours = [(day,shifts[sid].minutes*x) for (e,day,sid,pid),x in choices.items() if e == emp]
        model.add(sum(t for day,t in hours) <= total)
        if weekly:
            for i in range(0,days,7):
                model.add(sum(t for day,t in hours if dates[i] <= day <= dates[i+6]) <= weekly)
        if p.regime == 'two':
            model.add(sum(max(0,shifts[sid].minutes-480)*x for (e,day,sid,pid),x in choices.items() if e == emp) <= 960)
    loads=[]
    for emp in emps:
        load=model.new_int_var(0,total,f'load_{emp}')
        model.add(load == sum(shifts[sid].minutes*x for (e,day,sid,pid),x in choices.items() if e == emp))
        loads.append(load)
    high=model.new_int_var(0,total,'high');low=model.new_int_var(0,total,'low')
    model.add_max_equality(high,loads);model.add_min_equality(low,loads);terms.append(high-low)
    for d in p.demands:
        xs=[x for (emp,day,sid,pid),x in choices.items() if (day,sid,pid)==(d.date,d.shiftId,d.positionId)]
        missing=model.new_int_var(0,d.people,'missing')
        model.add(missing >= d.people-sum(xs));terms.append(missing*10000000)
        if d.target:
            capacity=floor(positions[d.positionId].rate*shifts[d.shiftId].minutes/60*1000)
            gap=model.new_int_var(0,d.target*1000,'quantity_gap')
            model.add(gap >= d.target*1000-capacity*sum(xs));terms.append(gap*100)
    model.minimize(sum(terms))
    solver=cp_model.CpSolver();solver.parameters.max_time_in_seconds=req.time_limit
    solver.parameters.num_search_workers=1;solver.parameters.random_seed=0
    status=solver.solve(model)
    if status not in (cp_model.OPTIMAL,cp_model.FEASIBLE):
        return {'status':solver.status_name(status),'cells':None,'engine':'OR-Tools CP-SAT','seconds':round(solver.wall_time,3)}
    output=[c.model_dump(mode='json') for c in p.cells]
    for c in output:
        if c['type']=='work':
            match=next(((sid,pid) for (emp,day,sid,pid),x in choices.items() if emp==c['emp'] and day.isoformat()==c['date'] and solver.value(x)),None)
            c['shiftId'],c['positionId']=match if match else (None,None)
    return {'status':solver.status_name(status),'cells':output,'engine':'OR-Tools CP-SAT','seconds':round(solver.wall_time,3)}

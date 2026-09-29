"""排程服務 API（FastAPI）。

POST /plans/db   正式用：從資料庫讀排程 → 算方案 → 存成預覽 → 回傳（需要使用者登入憑證，老闆或組長）
POST /plans      不連資料庫：直接送快照進來算方案（測試、原型網頁用）
POST /solve      不連資料庫：單純排一次
GET  /health     健康檢查
"""
from __future__ import annotations

import os
from datetime import date, timedelta
from contextlib import contextmanager
from threading import BoundedSemaphore

import ortools
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .db import Supabase, SupabaseError
from .model import PRESETS, solve
from .plans import make_plans, now_tw
from .schemas import Event, Now, PlanRequest, Snapshot, SolveRequest
from .validate import check
from .roster import RosterRequest, Roster, solve_roster
from .chat import ChatQuery, SnapshotChatQuery, ChatUnavailable, build_context, respond

app = FastAPI(title="產線排程服務", version="0.1.0")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
supa = Supabase()
_chat_slot = BoundedSemaphore(2)
_solve_slot = BoundedSemaphore(1)


@contextmanager
def computation_slot():
    """同一服務程序一次只執行一組 OR-Tools 求解，避免多請求疊加記憶體峰值。"""
    if not _solve_slot.acquire(blocking=False):
        raise HTTPException(429, "排程正在計算，請稍後重試", headers={"Retry-After": "5"})
    try:
        yield
    finally:
        _solve_slot.release()


def require_api_key(x_api_key: str | None = Header(default=None)):
    """不連資料庫的端點：有設定 SOLVER_API_KEY 時要帶金鑰，避免被外人拿來佔用運算資源。"""
    if os.environ.get("SOLVER_DISABLE_SNAPSHOT_API", "").lower() in ("1", "true", "yes"):
        raise HTTPException(403, "正式環境不開放快照計算端點")
    key = os.environ.get("SOLVER_API_KEY")
    if key and x_api_key != key:
        raise HTTPException(401, "需要 API 金鑰")


@app.get("/health")
def health():
    return {"ok": True, "ortools": ortools.__version__, "database": supa.configured,
            "capabilities": ["work_assignments_v1", "staff_roster_draft_v1", "schedule_chat_readonly_v1"]}


async def answer_chat(req,raw):
    if not _chat_slot.acquire(blocking=False):
        raise HTTPException(429,'聊天室正忙，請稍後重試',headers={'Retry-After':'5'})
    try:
        context=await run_in_threadpool(build_context,raw,req)
        return await respond(req,context)
    except (ValueError,KeyError,TypeError):
        raise HTTPException(400,'排程資料格式或容量無法查詢；請縮小範圍並核對資料')
    except ChatUnavailable as exc:
        raise HTTPException(503,str(exc))
    finally:
        _chat_slot.release()


@app.post('/chat',dependencies=[Depends(require_api_key)])
async def chat_snapshot(req: SnapshotChatQuery):
    # Never allow an anonymous snapshot to spend money on a model in production.
    if req.generate and not os.environ.get('SOLVER_API_KEY'):
        raise HTTPException(403,'快照 AI 查詢必須先啟用 API 金鑰保護')
    return await answer_chat(req,req.snapshot)


@app.post('/chat/db')
async def chat_database(req: ChatQuery,authorization: str=Header(...)):
    if not supa.configured:raise HTTPException(503,'聊天室尚未設定資料庫')
    if not authorization.startswith('Bearer ') or not authorization[7:].strip():
        raise HTTPException(401,'需要有效登入憑證')
    jwt=authorization[7:].strip()
    try:
        if await supa.role(jwt) not in ('boss','lead'):
            raise HTTPException(403,'目前只有老闆或組長可查詢管理排程；尚未開放員工／電視聊天室')
        raw=await supa.snapshot(jwt,start=req.date.isoformat(),end=req.date.isoformat())
    except SupabaseError:
        raise HTTPException(401,'無法依登入權限讀取排程，請重新登入或核對權限')
    return await answer_chat(req,raw)


@app.post('/roster/plans', dependencies=[Depends(require_api_key)])
def roster_plans(req: RosterRequest):
    try:
        with computation_slot():
            return solve_roster(req)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/solve", dependencies=[Depends(require_api_key)])
def solve_once(req: SolveRequest):
    require_catalog_ready(req.snapshot)
    now = req.now or now_tw()
    with computation_slot():
        res = solve(req.snapshot, now, PRESETS[req.preset], time_limit=req.time_limit)
    return {"status": res.status, "seconds": round(res.wall, 2), "unplaced": res.unplaced,
            "solver_method": res.search_mode, "solver_candidate_pairs": res.candidate_pairs,
            "issues": check(req.snapshot, res.blocks, now), "blocks": [b.model_dump() for b in res.blocks]}


@app.post("/plans", dependencies=[Depends(require_api_key)])
def plans(req: PlanRequest):
    require_catalog_ready(req.snapshot)
    try:
        with computation_slot():
            return make_plans(req)
    except (ValueError, StopIteration) as e:
        raise HTTPException(400, str(e) or "資料不完整")


class DbPlanRequest(BaseModel):
    event: Event
    now: Now | None = None
    time_limit: float = Field(default=5.0, gt=0, le=10)


def require_catalog_ready(snapshot: Snapshot):
    if snapshot.setup_pending:
        raise HTTPException(409, "原檔名冊與工作資料尚待確認，暫不開放排程計算")


class DbRosterRequest(BaseModel):
    roster: Roster
    time_limit: float = Field(default=3, gt=0, le=10)


@app.post('/roster/plans/db')
async def roster_plans_db(req: DbRosterRequest, authorization: str = Header(...)):
    if not supa.configured:
        raise HTTPException(503, '排程服務尚未設定資料庫')
    jwt = authorization.removeprefix('Bearer ').strip()
    try:
        if await supa.role(jwt) not in ('boss', 'lead'):
            raise HTTPException(403, '只有老闆或組長可計算輪班')
        from .roster import RULES
        raw = await supa.snapshot(jwt,start=(req.roster.start-timedelta(days=6)).isoformat(),
                                  end=(req.roster.start+timedelta(days=RULES[req.roster.regime][0])).isoformat())
        snap = Snapshot(**raw)
        require_catalog_ready(snap)
        ids = {e.emp for e in req.roster.employees}
        if not ids <= {e.id for e in snap.employees}:
            raise HTTPException(400, '員工不存在')
        if any(e.get('review_status','confirmed') != 'confirmed' for e in raw['employees'] if e['id'] in ids):
            raise HTTPException(409, '員工身分尚待確認')
        previous = next((p for p in raw.get('staff_rosters', []) if p['id'] != req.roster.id and
                         date.fromisoformat(p['start'])+timedelta(days=RULES[p['regime']][0]) == req.roster.start), None)
        request = RosterRequest(roster=req.roster, workers=[{'id':e.id,'leaves':e.leaves} for e in snap.employees if e.id in ids],
            occupied=[{'emp':b.employee,'date':b.date,'s':b.start,'e':b.end} for b in snap.blocks if b.employee in ids]+[
                {'emp':a.emp,'date':a.date,'s':a.s,'e':a.e} for a in snap.work_assignments if a.emp in ids],
            previous=[c for c in previous['cells'] if c['emp'] in ids and c['date'] >= (req.roster.start-timedelta(days=6)).isoformat()] if previous else [],
            previousShifts=previous['shifts'] if previous else [],time_limit=req.time_limit)
        with computation_slot():
            return await run_in_threadpool(solve_roster,request)
    except SupabaseError as e:
        raise HTTPException(502,str(e))
    except ValueError as e:
        raise HTTPException(400,str(e))


@app.post("/plans/db")
async def plans_db(req: DbPlanRequest, authorization: str = Header(...)):
    if not supa.configured:
        raise HTTPException(503, "排程服務還沒設定資料庫連線")
    jwt = authorization.removeprefix("Bearer ").strip()
    try:
        uid = await supa.user_id(jwt)
        if await supa.role(jwt) not in ("boss", "lead"):
            raise HTTPException(403, "只有老闆或組長可以計算方案")
        snap = Snapshot(**await supa.snapshot(jwt))
        require_catalog_ready(snap)
        with computation_slot():
            plan = await run_in_threadpool(make_plans, PlanRequest(snapshot=snap, event=req.event, now=req.now, time_limit=req.time_limit))
        plan["preview_id"] = await supa.save_preview(plan, uid)
        return plan
    except SupabaseError as e:
        raise HTTPException(502, str(e))

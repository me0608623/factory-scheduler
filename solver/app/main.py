"""排程服務 API（FastAPI）。

POST /plans/db   正式用：從資料庫讀排程 → 算方案 → 存成預覽 → 回傳（需要使用者登入憑證，老闆或組長）
POST /plans      不連資料庫：直接送快照進來算方案（測試、原型網頁用）
POST /solve      不連資料庫：單純排一次
GET  /health     健康檢查
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from threading import BoundedSemaphore

import ortools
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .db import Supabase, SupabaseError
from .model import PRESETS, solve
from .plans import make_plans, now_tw
from .schemas import Event, Now, PlanRequest, Snapshot, SolveRequest
from .validate import check

app = FastAPI(title="產線排程服務", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
supa = Supabase()
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
    return {"ok": True, "ortools": ortools.__version__, "database": supa.configured}


@app.post("/solve", dependencies=[Depends(require_api_key)])
def solve_once(req: SolveRequest):
    now = req.now or now_tw()
    with computation_slot():
        res = solve(req.snapshot, now, PRESETS[req.preset], time_limit=req.time_limit)
    return {"status": res.status, "seconds": round(res.wall, 2), "unplaced": res.unplaced,
            "issues": check(req.snapshot, res.blocks, now), "blocks": [b.model_dump() for b in res.blocks]}


@app.post("/plans", dependencies=[Depends(require_api_key)])
def plans(req: PlanRequest):
    try:
        with computation_slot():
            return make_plans(req)
    except (ValueError, StopIteration) as e:
        raise HTTPException(400, str(e) or "資料不完整")


class DbPlanRequest(BaseModel):
    event: Event
    now: Now | None = None
    time_limit: float = Field(default=5.0, gt=0, le=10)


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
        with computation_slot():
            plan = await run_in_threadpool(make_plans, PlanRequest(snapshot=snap, event=req.event, now=req.now, time_limit=req.time_limit))
        plan["preview_id"] = await supa.save_preview(plan, uid)
        return plan
    except SupabaseError as e:
        raise HTTPException(502, str(e))

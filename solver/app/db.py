"""透過 Supabase 的 REST API 讀寫資料庫。

- 讀排程快照：用「使用者自己的登入憑證」呼叫 schedule_snapshot()，資料庫權限（RLS）照樣生效
- 存方案預覽：plan_previews 不開放前端直接寫，由排程服務用 service role key 寫入
"""
from __future__ import annotations

import os

import httpx


class SupabaseError(RuntimeError):
    pass


class Supabase:
    def __init__(self, url: str | None = None, service_key: str | None = None, anon_key: str | None = None):
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.service_key = service_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.anon_key = anon_key or os.environ.get("SUPABASE_ANON_KEY", "")

    @property
    def configured(self) -> bool:
        return bool(self.url and self.service_key and self.anon_key)

    def _user_headers(self, jwt: str) -> dict:
        return {"apikey": self.anon_key, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}

    def _service_headers(self) -> dict:
        return {"apikey": self.service_key, "Authorization": f"Bearer {self.service_key}", "Content-Type": "application/json"}

    async def _post(self, path: str, headers: dict, body: dict, prefer: str | None = None):
        h = dict(headers)
        if prefer:
            h["Prefer"] = prefer
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{self.url}{path}", headers=h, json=body)
        if r.status_code >= 400:
            raise SupabaseError(f"{path} {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else None

    async def user_id(self, jwt: str) -> str:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.url}/auth/v1/user", headers=self._user_headers(jwt))
        if r.status_code != 200:
            raise SupabaseError("登入已過期，請重新登入")
        return r.json()["id"]

    async def role(self, jwt: str) -> str | None:
        return await self._post("/rest/v1/rpc/app_role", self._user_headers(jwt), {})

    async def snapshot(self, jwt: str) -> dict:
        return await self._post("/rest/v1/rpc/schedule_snapshot", self._user_headers(jwt), {})

    async def save_preview(self, plan: dict, user_id: str) -> str:
        row = {"kind": plan["kind"], "title": plan["title"], "event": plan["event"],
               "base_version": plan["base_version"], "options": plan["options"], "created_by": user_id}
        out = await self._post("/rest/v1/plan_previews", self._service_headers(), row, prefer="return=representation")
        return out[0]["id"]

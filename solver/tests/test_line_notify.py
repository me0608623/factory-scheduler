"""Actual ASGI endpoint and Supabase methods; HTTP is synthetic, sockets blocked."""
import socket

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as api
from app.db import Supabase

USER = "11111111-1111-4111-8111-111111111111"
DEFAULTS = dict(schedule_change=True, leave_request=True, rush_order=True,
                fault=True, daily_summary=False)


@pytest.fixture
def harness(monkeypatch):
    def blocked(*args, **kwargs):
        pytest.fail("External network forbidden")
    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN", "synthetic-line-token")
    monkeypatch.setattr(api, "supa", Supabase("https://db.invalid", "never-service", "synthetic-anon"))
    state = dict(rows=[dict(enabled=True, events=DEFAULTS.copy(),
                           line_user_id="U-synthetic", line_group_id="C-synthetic")],
                 auth=200, database=200, outcomes=[200, 200], calls=[], pushes=[])

    def handle(request):
        state["calls"].append(request)
        if request.url.host == "db.invalid":
            assert request.method == "GET"
            assert request.headers["apikey"] == "synthetic-anon"
            assert request.headers["authorization"] == "Bearer synthetic-jwt"
            assert request.headers["content-type"] == "application/json"
            assert "never-service" not in str(request.headers)
            if request.url.path == "/auth/v1/user":
                if isinstance(state["auth"], Exception):
                    raise state["auth"]
                return httpx.Response(state["auth"], json={"id": USER})
            assert request.url.path == "/rest/v1/line_notify_settings"
            assert dict(request.url.params) == {
                "select": "enabled,events,line_user_id,line_group_id",
                "user_id": "eq." + USER, "limit": "1"}
            if isinstance(state["database"], Exception):
                raise state["database"]
            return httpx.Response(state["database"], json=state["rows"])
        assert str(request.url) == "https://api.line.me/v2/bot/message/push"
        assert request.method == "POST"
        assert request.headers["authorization"] == "Bearer synthetic-line-token"
        state["pushes"].append(request)
        outcome = state["outcomes"].pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return httpx.Response(outcome, json={})

    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(
        **kw, transport=httpx.MockTransport(handle)))
    client = TestClient(api.app)
    def send(event="fault", **kwargs):
        return client.post("/notify/line", json={"event": event, "message": "synthetic"},
                           headers={"Authorization": "Bearer synthetic-jwt"}, **kwargs)
    state["send"] = send
    return state


def test_actual_path_success(harness):
    response = harness["send"]()
    assert response.status_code == 200
    assert response.json() == {"ok": True, "sent": 2}
    import json
    assert [json.loads(r.content) for r in harness["pushes"]] == [
        {"to": target, "messages": [{"type": "text", "text": "[排程系統] synthetic"}]}
        for target in ("U-synthetic", "C-synthetic")]


@pytest.mark.parametrize("event", list(DEFAULTS))
@pytest.mark.parametrize("enabled", [True, False])
def test_explicit_event_preferences(harness, event, enabled):
    harness["rows"][0]["events"][event] = enabled
    response = harness["send"](event)
    assert response.json()["sent"] == (2 if enabled else 0)
    assert len(harness["pushes"]) == (2 if enabled else 0)


@pytest.mark.parametrize("event", list(DEFAULTS))
def test_database_defaults(harness, event):
    assert harness["send"](event).json()["sent"] == (2 if DEFAULTS[event] else 0)


@pytest.mark.parametrize("events", [{}, None])
@pytest.mark.parametrize("event", list(DEFAULTS))
def test_missing_known_keys_match_ui_checked_state(harness, events, event):
    harness["rows"][0]["events"] = events
    assert harness["send"](event).json()["sent"] == 2


@pytest.mark.parametrize("event", ["", "unknown", "FAULT"])
def test_unknown_events_do_not_subscribe(harness, event):
    harness["rows"][0]["events"][event] = True
    assert harness["send"](event).json()["sent"] == 0
    assert not harness["pushes"]


@pytest.mark.parametrize("rows", [[], [dict(enabled=False)], [dict(enabled=True)]])
def test_missing_disabled_or_no_targets(harness, rows):
    harness["rows"] = rows
    assert harness["send"]().json()["sent"] == 0
    assert not harness["pushes"]


@pytest.mark.parametrize("field", ["line_user_id", "line_group_id"])
def test_single_recipient(harness, field):
    harness["rows"][0][field] = ""
    assert harness["send"]().json()["sent"] == 1


@pytest.mark.parametrize("outcomes,sent", [([400, 500], 0), ([200, 400], 1),
    ([httpx.ConnectError("synthetic"), 200], 1), ([302, 200], 1),
    ([httpx.ReadTimeout("synthetic"), httpx.ConnectError("synthetic")], 0)])
def test_upstream_failures_are_not_sent(harness, outcomes, sent):
    harness["outcomes"] = outcomes
    response = harness["send"]()
    assert response.status_code == 502
    assert response.json() == {"ok": False, "sent": sent, "failed": 2-sent}


@pytest.mark.parametrize("status", [401, 403, 500, httpx.ConnectError("synthetic")])
def test_auth_failure(harness, status):
    harness["auth"] = status
    assert harness["send"]().status_code == 401
    assert len(harness["calls"]) == 1
    assert not harness["pushes"]


def test_no_channel_token(harness, monkeypatch):
    monkeypatch.delenv("LINE_CHANNEL_ACCESS_TOKEN")
    assert harness["send"]().status_code == 503
    assert not harness["calls"]


def test_missing_authorization(harness):
    response = TestClient(api.app).post("/notify/line", json={"event": "fault", "message": "x"})
    assert response.status_code == 422
    assert not harness["calls"]


@pytest.mark.parametrize("failure", [403, 500, httpx.ConnectError("synthetic")])
def test_database_failure_never_pushes(harness, failure):
    harness["database"] = failure
    assert harness["send"]().status_code == 502
    assert not harness["pushes"]


def test_missing_events_field_uses_ui_semantics(harness):
    del harness["rows"][0]["events"]
    assert harness["send"]().json()["sent"] == 2


def test_empty_recipients(harness):
    harness["rows"][0].update(line_user_id="", line_group_id=None)
    assert harness["send"]().json() == {"ok": True, "sent": 0, "reason": "no targets"}
    assert not harness["pushes"]


def test_missing_event_is_rejected(harness):
    response = TestClient(api.app).post("/notify/line", json={"message": "x"},
                                       headers={"Authorization": "Bearer synthetic-jwt"})
    assert response.status_code == 422
    assert not harness["calls"]


def test_duplicate_recipient_is_sent_once(harness):
    harness["rows"][0]["line_group_id"] = "U-synthetic"
    assert harness["send"]().json() == {"ok": True, "sent": 1}
    assert len(harness["pushes"]) == 1


@pytest.mark.parametrize("blank", [" ", "\t\n"])
def test_whitespace_only_recipient_is_skipped(harness, blank):
    harness["rows"][0]["line_group_id"] = blank
    assert harness["send"]().json() == {"ok": True, "sent": 1}
    assert len(harness["pushes"]) == 1


def test_nonblank_recipient_is_not_rewritten(harness):
    import json
    harness["rows"][0]["line_group_id"] = " U-synthetic "
    assert harness["send"]().json() == {"ok": True, "sent": 2}
    assert [json.loads(r.content)["to"] for r in harness["pushes"]] == [
        "U-synthetic", " U-synthetic "]

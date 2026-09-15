import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import websocketapi as api

HEADERS = {"origin": "http://localhost:5173"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api, "missing_settings", lambda: [])
    with TestClient(api.api) as client:
        yield client


def ask(socket, request_id="test-1", text="Sabar"):
    socket.send_json({"request_id": request_id, "pertanyaan": text})


@pytest.mark.parametrize("origin", [None, "https://evil.example", "http://localhost:5173.evil.example"])
def test_origin_rejected(client, origin):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/ask", headers={"origin": origin} if origin else {}):
            pass


def test_credentials_endpoint_removed(client):
    assert client.get("/graph-config", headers=HEADERS).status_code == 404


def test_health_reports_configuration_without_claiming_connectivity(client, monkeypatch):
    assert client.get("/health").json()["services_checked"] is False
    monkeypatch.setattr(api, "missing_settings", lambda: ["OPENAI_API_KEY"])
    result = client.get("/health")
    assert result.status_code == 503
    assert result.json()["missing"] == ["OPENAI_API_KEY"]


@pytest.mark.parametrize("raw", ["not json", "[]", "null", "1", '{}', '{"pertanyaan": 123}',
                                  '{"pertanyaan": "   "}', json.dumps({"pertanyaan": "a" * 2001}),
                                  json.dumps({"pertanyaan": "x", "request_id": [1]})])
def test_invalid_message_keeps_socket_usable(client, raw):
    with client.websocket_connect("/ws/ask", headers=HEADERS) as socket:
        socket.send_text(raw)
        assert socket.receive_json()["code"] == "invalid_request"
        socket.send_text("{}")
        assert socket.receive_json()["error"] is True


def test_oversized_and_binary_messages(client):
    with client.websocket_connect("/ws/ask", headers=HEADERS) as socket:
        socket.send_text("x" * 16385)
        assert socket.receive_json()["error"] is True
        socket.send_bytes(b"binary")
        assert socket.receive_json()["error"] is True


def test_stream_hides_private_state_and_has_terminal_event(client, monkeypatch):
    async def stream(*args, **kwargs):
        yield {"STEP1": {"thought": "Progress", "query_rewrite": "private", "list_cypher": ["secret"], "password": "secret"}}
        yield {"STEP5": {"jawaban_final": "Selesai", "citation_status": "no_sources"}}
    monkeypatch.setattr(api, "get_pipeline", lambda: SimpleNamespace(astream=stream))
    with client.websocket_connect("/ws/ask", headers=HEADERS) as socket:
        ask(socket)
        first = socket.receive_json()
        assert first["payload"] == {"thought": "Progress"}
        assert first["request_id"] == "test-1"
        assert socket.receive_json()["agent"] == "STEP5"
        assert socket.receive_json()["type"] == "done"


def test_provider_error_is_sanitized(client, monkeypatch):
    async def stream(*args, **kwargs):
        raise RuntimeError("secret credential should not escape")
        yield
    monkeypatch.setattr(api, "get_pipeline", lambda: SimpleNamespace(astream=stream))
    with client.websocket_connect("/ws/ask", headers=HEADERS) as socket:
        ask(socket)
        result = socket.receive_json()
        assert result["code"] == "processing_failed"
        assert "secret" not in json.dumps(result)


def test_running_request_can_be_cancelled_and_next_request_processed(client, monkeypatch):
    async def stream(*args, **kwargs):
        yield {"STEP1": {"thought": "Started"}}
        await asyncio.sleep(10)
    monkeypatch.setattr(api, "get_pipeline", lambda: SimpleNamespace(astream=stream))
    with client.websocket_connect("/ws/ask", headers=HEADERS) as socket:
        ask(socket)
        assert socket.receive_json()["agent"] == "STEP1"
        ask(socket, "test-2")
        assert socket.receive_json()["code"] == "busy"
        socket.send_json({"type": "cancel", "request_id": "test-1"})
        assert socket.receive_json()["type"] == "cancelled"
        ask(socket, "test-3")
        assert socket.receive_json()["request_id"] == "test-3"


def test_timeout_ends_request(client, monkeypatch):
    async def stream(*args, **kwargs):
        await asyncio.sleep(10)
        yield
    monkeypatch.setattr(api, "REQUEST_TIMEOUT", 0.02)
    monkeypatch.setattr(api, "get_pipeline", lambda: SimpleNamespace(astream=stream))
    with client.websocket_connect("/ws/ask", headers=HEADERS) as socket:
        ask(socket)
        assert socket.receive_json()["code"] == "timeout"


def test_rate_limit_expires_and_memory_is_bounded():
    limiter = api.RateLimiter(limit=2, capacity=2)
    assert limiter.allow("a", now=0) and limiter.allow("a", now=1)
    assert not limiter.allow("a", now=2)
    assert limiter.allow("a", now=60)
    limiter.allow("b", now=60)
    limiter.allow("c", now=60)
    assert len(limiter.clients) == 2


def test_global_capacity_rejects_work_and_recovers_after_disconnect(client, monkeypatch):
    monkeypatch.setattr(api.api.state, "slots", asyncio.Semaphore(1))
    async def stream(*args, **kwargs):
        yield {"STEP1": {"thought": "Started"}}
        await asyncio.sleep(10)
    monkeypatch.setattr(api, "get_pipeline", lambda: SimpleNamespace(astream=stream))
    with client.websocket_connect("/ws/ask", headers=HEADERS) as first:
        ask(first)
        assert first.receive_json()["agent"] == "STEP1"
        with client.websocket_connect("/ws/ask", headers=HEADERS) as second:
            ask(second, "second")
            assert second.receive_json()["code"] == "overloaded"
    with client.websocket_connect("/ws/ask", headers=HEADERS) as third:
        ask(third, "third")
        assert third.receive_json()["agent"] == "STEP1"

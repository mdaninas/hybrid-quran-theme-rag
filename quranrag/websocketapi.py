"""WebSocket transport with input validation, cancellation, and resource limits."""
import asyncio
import json
import logging
import re
import sys
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketDisconnect

from config import (ALLOWED_ORIGINS, MAX_CONCURRENT_REQUESTS, MAX_FRAME_BYTES,
                    MAX_QUESTION_LENGTH, REQUEST_TIMEOUT, REQUESTS_PER_MINUTE,
                    missing_settings)

logger = logging.getLogger(__name__)
PUBLIC_FIELDS = {"thought", "sources", "graphs", "jawaban_final", "citation_status"}


class RateLimiter:
    """Bounded per-process rate limit; production proxies should also limit traffic."""
    def __init__(self, limit=REQUESTS_PER_MINUTE, capacity=4096):
        self.limit, self.capacity = limit, capacity
        self.clients = OrderedDict()

    def allow(self, client, now=None):
        now = time.monotonic() if now is None else now
        timestamps = self.clients.setdefault(client, deque())
        self.clients.move_to_end(client)
        while timestamps and timestamps[0] <= now - 60:
            timestamps.popleft()
        while len(self.clients) > self.capacity:
            self.clients.popitem(last=False)
        if len(timestamps) >= self.limit:
            return False
        timestamps.append(now)
        return True


@asynccontextmanager
async def lifespan(application):
    application.state.slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    application.state.limiter = RateLimiter()
    yield
    graph_module = sys.modules.get("module.skill.retriever_graph")
    if graph_module:
        await graph_module.close_driver()


api = FastAPI(title="Qur'an Thematic RAG", version="1.0.0", lifespan=lifespan)
api.add_middleware(CORSMiddleware, allow_origins=list(ALLOWED_ORIGINS),
                   allow_methods=["GET"], allow_headers=[])


@api.get("/health")
def health():
    missing = missing_settings()
    return JSONResponse(
        {"status": "not_configured" if missing else "configured", "missing": missing,
         "services_checked": False}, status_code=503 if missing else 200,
        headers={"Cache-Control": "no-store"},
    )


def get_pipeline():
    from multi_agent import app
    return app


def parse_message(raw):
    if len(raw.encode("utf-8")) > MAX_FRAME_BYTES:
        raise ValueError("Pesan terlalu besar.")
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, RecursionError):
        raise ValueError("Format pesan harus berupa JSON yang valid.") from None
    if not isinstance(data, dict):
        raise ValueError("Pesan harus berupa objek JSON.")
    request_id = data.get("request_id")
    if request_id is None:
        request_id = str(uuid4())
    if not isinstance(request_id, str) or not re.fullmatch(r"[\w-]{1,64}", request_id, flags=re.ASCII):
        raise ValueError("ID permintaan tidak valid.")
    if data.get("type") == "cancel":
        return {"type": "cancel", "request_id": request_id}
    if data.get("type", "ask") != "ask":
        raise ValueError("Jenis pesan tidak didukung.")
    question = data.get("pertanyaan", data.get("text", ""))
    if not isinstance(question, str) or not question.strip():
        raise ValueError("Pertanyaan tidak boleh kosong.")
    if len(question.strip()) > MAX_QUESTION_LENGTH:
        raise ValueError(f"Pertanyaan maksimal {MAX_QUESTION_LENGTH} karakter.")
    return {"type": "ask", "request_id": request_id, "pertanyaan": question.strip()}


@api.websocket("/ws/ask")
async def ws_ask(ws: WebSocket):
    if ws.headers.get("origin", "") not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    running = None
    active_id = None
    send_lock = asyncio.Lock()

    async def send(data):
        async with send_lock:
            await ws.send_json(data)

    async def error(message, request_id=None, code="invalid_request"):
        await send({"type": "error", "error": True, "code": code,
                    "request_id": request_id, "message": message})

    async def run_question(data):
        request_id = data["request_id"]
        started = time.monotonic()
        try:
            async with asyncio.timeout(REQUEST_TIMEOUT):
                async for chunk in get_pipeline().astream(
                    {"pertanyaan": data["pertanyaan"]}, stream_mode="updates",
                ):
                    for agent, payload in chunk.items():
                        await send({"type": "step", "request_id": request_id,
                                    "agent": agent, "payload": {
                                        k: v for k, v in payload.items() if k in PUBLIC_FIELDS
                                    }})
                await send({"type": "done", "request_id": request_id})
        except TimeoutError:
            await error("Waktu pemrosesan habis. Silakan coba lagi.", request_id, "timeout")
        except (WebSocketDisconnect, OSError):
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Do not log user questions, retrieved text, credentials, or provider error bodies.
            logger.error("request=%s failed exception=%s", request_id, type(exc).__name__)
            await error("Pertanyaan belum berhasil diproses. Silakan coba lagi.", request_id, "processing_failed")
        finally:
            logger.info("request=%s duration_ms=%d", request_id, (time.monotonic() - started) * 1000)

    try:
        while True:
            packet = await ws.receive()
            if packet["type"] == "websocket.disconnect":
                break
            raw = packet.get("text")
            if raw is None:
                await error("Gunakan pesan teks JSON.")
                continue
            try:
                data = parse_message(raw)
            except ValueError as exc:
                await error(str(exc))
                continue
            request_id = data["request_id"]
            if data["type"] == "cancel":
                if running and not running.done() and active_id == request_id:
                    running.cancel()
                    await asyncio.gather(running, return_exceptions=True)
                    await send({"type": "cancelled", "request_id": request_id})
                continue
            if running and not running.done():
                await error("Tunggu pertanyaan sebelumnya selesai.", request_id, "busy")
                continue
            client = ws.client.host if ws.client else "unknown"
            if not ws.app.state.limiter.allow(client):
                await error("Terlalu banyak pertanyaan. Coba lagi dalam satu menit.", request_id, "rate_limited")
                continue
            if ws.app.state.slots.locked():
                await error("Server sedang sibuk. Silakan coba beberapa saat lagi.", request_id, "overloaded")
                continue
            if missing_settings():
                await error("Layanan belum siap. Konfigurasi server perlu dilengkapi.", request_id, "not_configured")
                continue
            active_id = request_id
            await ws.app.state.slots.acquire()
            running = asyncio.create_task(run_question(data))
            # A callback also releases the slot if cancellation precedes task startup.
            running.add_done_callback(lambda _task: ws.app.state.slots.release())
    except (WebSocketDisconnect, OSError):
        pass
    finally:
        if running:
            running.cancel()
            await asyncio.gather(running, return_exceptions=True)

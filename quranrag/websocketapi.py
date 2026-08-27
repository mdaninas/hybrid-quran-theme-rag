import json
import os
from datetime import date, datetime

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from starlette.websockets import WebSocketDisconnect

from multi_agent import app

load_dotenv()

# Matikan tracing LangSmith bila kunci tidak valid (§9.2 #9).
if os.environ.get("LANGSMITH_TRACING", "").strip().lower() not in ("true", "1", "yes"):
    os.environ["LANGSMITH_TRACING"] = "false"

api = FastAPI()


def _parse_graph_config_origins():
    raw = os.environ.get("GRAPH_CONFIG_ORIGINS", "").strip()
    if raw:
        origins = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
        if origins:
            return tuple(origins)
    return (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    )


GRAPH_CONFIG_ORIGINS = _parse_graph_config_origins()

api.add_middleware(
    CORSMiddleware,
    allow_origins=list(GRAPH_CONFIG_ORIGINS),
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Pengecualian dari aturan "hanya WebSocket": frontend membutuhkan kredensial Neo4j
# tanpa meng-inline VITE_* ke bundle JavaScript.
@api.get("/graph-config")
def graph_config(request: Request):
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")
    origin_allowed = origin in GRAPH_CONFIG_ORIGINS
    referer_allowed = any(referer.startswith(allowed) for allowed in GRAPH_CONFIG_ORIGINS)
    if not origin_allowed and not referer_allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    config_token = os.environ.get("GRAPH_CONFIG_TOKEN", "").strip()
    if config_token:
        supplied = request.headers.get("x-graph-config-token", "").strip()
        if supplied != config_token:
            raise HTTPException(status_code=403, detail="Forbidden")

    return {
        "uri": os.environ["NEO4J_LOKAL_URI"],
        "user": os.environ["NEO4J_LOKAL_USER"],
        "password": os.environ["NEO4J_LOKAL_PASSWORD"],
    }


def to_jsonable(x):
    if x is None or isinstance(x, (int, float, str, bool)):
        return x
    if isinstance(x, (datetime, date)):
        return x.isoformat()
    if isinstance(x, bytes):
        return x.decode("utf-8", errors="ignore")
    if isinstance(x, (list, tuple, set)):
        return [to_jsonable(v) for v in x]
    if isinstance(x, dict):
        return {str(k): to_jsonable(v) for k, v in x.items()}
    if isinstance(x, Document):
        return {
            "page_content": x.page_content,
            "metadata": to_jsonable(x.metadata),
        }
    if isinstance(x, BaseMessage):
        return {
            "type": getattr(x, "type", x.__class__.__name__),
            "content": x.content,
            "additional_kwargs": to_jsonable(getattr(x, "additional_kwargs", {})),
        }
    return str(x)


@api.websocket("/ws/ask")
async def ws_ask(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            try:
                raw = await ws.receive_text()
            except WebSocketDisconnect:
                raise

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({
                    "error": True,
                    "message": "Format pesan tidak valid.",
                }))
                continue

            pertanyaan = data.get("pertanyaan", "") or data.get("text", "")

            try:
                stream = app.astream({"pertanyaan": pertanyaan}, stream_mode="updates")
                async for chunk in stream:
                    for agent_name, payload in chunk.items():
                        await ws.send_text(json.dumps({
                            "agent": agent_name,
                            "payload": to_jsonable(payload),
                        }))
            except WebSocketDisconnect:
                raise
            except Exception:
                await ws.send_text(json.dumps({
                    "error": True,
                    "message": (
                        "Terjadi kesalahan saat memproses pertanyaan. "
                        "Silakan coba lagi."
                    ),
                }))
    except WebSocketDisconnect:
        return

"""Runtime configuration; importing this module never opens a connection."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
if os.getenv("LANGSMITH_TRACING", "").lower() not in {"true", "1", "yes"}:
    os.environ["LANGSMITH_TRACING"] = "false"


def integer_setting(name, default, minimum, maximum):
    value = int(os.getenv(name) or default)
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


ALLOWED_ORIGINS = tuple(value.strip().rstrip("/") for value in (
    os.getenv("ALLOWED_ORIGINS") or os.getenv("GRAPH_CONFIG_ORIGINS")
    or "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if value.strip())
MAX_QUESTION_LENGTH = 2000
MAX_FRAME_BYTES = 16384
REQUEST_TIMEOUT = integer_setting("REQUEST_TIMEOUT_SECONDS", 120, 1, 120)
MAX_CONCURRENT_REQUESTS = integer_setting("MAX_CONCURRENT_REQUESTS", 4, 1, 32)
REQUESTS_PER_MINUTE = integer_setting("REQUESTS_PER_MINUTE", 12, 1, 120)
RETRIEVAL_TOP_K = integer_setting("RETRIEVAL_TOP_K", 5, 1, 10)
MAX_VERSES_PER_PATH = integer_setting("MAX_VERSES_PER_PATH", 25, 1, 100)
MAX_CONTEXT_VERSES = integer_setting("MAX_CONTEXT_VERSES", 60, 1, 200)
MAX_CONTEXT_CHARS = integer_setting("MAX_CONTEXT_CHARS", 30000, 1000, 100000)
LLM_MODEL = os.getenv("LLM_MODEL") or "gpt-4o-mini-2024-07-18"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL") or "text-embedding-ada-002"


def missing_settings():
    required = ("OPENAI_API_KEY", "PINECONE_API_KEY", "INDEX_NAME1",
                "NEO4J_LOKAL_URI", "NEO4J_LOKAL_USER", "NEO4J_LOKAL_PASSWORD")
    return [name for name in required if not os.getenv(name, "").strip()]

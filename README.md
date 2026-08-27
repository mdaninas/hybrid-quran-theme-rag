# Thematic Qur'an Hybrid RAG

A question answering system for the Qur'an that combines semantic search with graph
traversal. A question is matched against thematic paths in a Pinecone index, those paths
are turned into Cypher queries, and the verses they return are used to compose the answer.
The same paths are drawn as an interactive knowledge graph beside the chat.

Built as a thesis project at Universitas Islam Riau.

## How it works

The backend runs a five step LangGraph pipeline and streams each step to the browser over a
WebSocket:

1. Rewrite the question into short keywords
2. Retrieve the five closest thematic paths from Pinecone
3. Build a Cypher query for each path
4. Run them against Neo4j and collect the verses
5. Compose the answer with citations

The answer text comes from the backend. The graph panel works differently: it queries Neo4j
directly from the browser with neovis.js, reusing the Cypher strings the backend already
sent. It gets its Bolt credentials from the backend at `/graph-config`, so the graph will
not render unless the backend is running.

## Layout

```
quranrag/            backend
  multi_agent.py     the pipeline, also runnable straight from the terminal
  websocketapi.py    WebSocket endpoint plus the graph config endpoint
  module/state/      GraphState, the contract between steps
  module/skill/      one file per capability: rewriting, retrieval, reasoning
  process/           ingestion scripts and source data, not touched at runtime

quranragfrontend/    frontend
  src/components/    Layout, Chat, Popoto (the graph), Icons, LoginScreen
  src/constants.js   storage keys and endpoint URLs
```

## Requirements

Python 3.11, Node 20 or newer, a running Neo4j instance, a Pinecone index, and an OpenAI
API key.

## Setup

Backend:

```bash
conda create -n quranrag python=3.11 -y
conda run -n quranrag python -m pip install -r quranrag/requirement.txt
```

Copy `quranrag/env.example` to `quranrag/.env`. The variables that matter are
`NEO4J_LOKAL_URI`, `NEO4J_LOKAL_USER` and `NEO4J_LOKAL_PASSWORD` for the graph,
`PINECONE_API_KEY` and `INDEX_NAME1` for thematic retrieval, and `OPENAI_API_KEY` for the
LLM. Set `LANGSMITH_TRACING=false` unless you have a valid LangSmith key, otherwise every
request fills the log with 403s.

Two optional settings guard `/graph-config`. `GRAPH_CONFIG_ORIGINS` lists the browser
origins allowed to call it and defaults to Vite on port 5173, which is worth setting if
your dev server ends up on another port. `GRAPH_CONFIG_TOKEN` makes the endpoint require a
matching `X-Graph-Config-Token` header.

Frontend:

```bash
cd quranragfrontend
npm install
```

Copy `env.example` to `.env`. Only two variables are read. `VITE_WS_URL` points at the
WebSocket endpoint, and `VITE_API_BASE` sets the HTTP base URL, which is derived from
`VITE_WS_URL` if you leave it empty.

Do not put database credentials in `VITE_*` variables. Vite inlines them into the
production bundle where anyone can read them. The frontend asks the backend for Neo4j
credentials at runtime instead.

## Running

```bash
conda run -n quranrag python -m uvicorn websocketapi:api --reload --host 127.0.0.1 --port 8000
```

```bash
npm run dev
```

The app is served at http://localhost:5173.

Keep the backend bound to `127.0.0.1`. `/graph-config` hands out Neo4j credentials and is
protected only by an origin check, which any HTTP client can forge. Exposing it on a public
interface gives those credentials away.

To run the pipeline without the web UI:

```bash
conda run -n quranrag python quranrag/multi_agent.py
```

## Building the graph

`ingest_neo4j_safe.ps1` reads `process/READY/*.json` and `process/tematik_.json` and writes
them to Neo4j. It is idempotent, so running it again is safe.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\quranrag\process\ingest_neo4j_safe.ps1
```

Pass `-ValidateOnly` to check the source files without touching the database.

The two notebooks under `process/` are kept as a record of how the data was prepared. Do not
run them end to end; they contain cells that delete data.

## Stack

Backend: LangGraph, LangChain, FastAPI, Uvicorn, Neo4j, Pinecone, OpenAI.
Frontend: React 19, Vite 7, neovis.js, react-markdown.

## Author

Muhammad Dani Nasution
Teknik Informatika, Universitas Islam Riau
[@mdaninas](https://github.com/mdaninas)

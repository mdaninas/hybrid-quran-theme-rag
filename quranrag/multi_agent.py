"""Five-step hybrid retrieval pipeline; no service connections at import time."""
import asyncio
import json
import logging
from config import MAX_CONTEXT_CHARS, MAX_CONTEXT_VERSES
from langgraph.graph import END, START, StateGraph
from module.retrieval import (NO_SOURCES, collect_sources, graph_from_group,
                              select_paths, validate_answer)
from module.skill.query_rewriting import get_extraction_chain
from module.skill.reasoning import get_reasoning_chain
from module.skill.retriever_embedding import search_vectorstore
from module.skill.retriever_graph import close_driver, retrieve_from_graph
from module.state.state import GraphState

logger = logging.getLogger(__name__)


async def STEP_1(state):
    response = await get_extraction_chain().ainvoke({"pertanyaan": state["pertanyaan"]})
    rewritten = response.content if isinstance(response.content, str) else ""
    return {"query_rewrite": rewritten.strip()[:500] or state["pertanyaan"],
            "thought": "Mencari jalur tema yang sesuai dengan pertanyaan."}


async def STEP_2(state):
    paths = select_paths(await search_vectorstore(state["query_rewrite"]))
    return {"paths": paths, "thought": f"Ditemukan {len(paths)} jalur tema untuk ditelusuri."}


async def STEP_3(state):
    return {"thought": f"Memeriksa hubungan tema dan ayat pada {len(state['paths'])} jalur."}


async def STEP_4(state):
    groups = []
    for path in state["paths"]:
        verses = await retrieve_from_graph(path["themes"])
        groups.append({**path, "full_path": path["path"], "ayat_collection": verses})
    sources = collect_sources(groups, MAX_CONTEXT_VERSES, MAX_CONTEXT_CHARS)
    allowed = {source["id_surah_ayat"] for source in sources}
    graphs = [graph_from_group(group, allowed) for group in groups]
    return {"sources": sources, "graphs": graphs,
            "thought": f"Menggunakan {len(sources)} ayat unik sebagai sumber jawaban."}


async def STEP_5(state):
    sources = state["sources"]
    if not sources:
        return {"jawaban_final": NO_SOURCES, "citation_status": "no_sources", "thought": "Pencarian selesai."}
    result = await get_reasoning_chain().ainvoke({
        "pertanyaan": state["pertanyaan"], "retrieval": json.dumps(sources, ensure_ascii=False),
    })
    text = result.content if isinstance(result.content, str) else ""
    answer, status = validate_answer(text, sources)
    if status == "fallback":
        logger.warning("Generated answer failed source citation validation")
    return {"jawaban_final": answer, "citation_status": status, "thought": "Jawaban selesai."}


workflow = StateGraph(GraphState)
for number, step in enumerate((STEP_1, STEP_2, STEP_3, STEP_4, STEP_5), start=1):
    workflow.add_node(f"STEP{number}", step)
workflow.add_edge(START, "STEP1")
for number in range(1, 5):
    workflow.add_edge(f"STEP{number}", f"STEP{number + 1}")
workflow.add_edge("STEP5", END)
app = workflow.compile()


async def main():
    question = input("Apa yang ingin Anda ketahui?\n").strip()
    if not 1 <= len(question) <= 2000:
        raise SystemExit("Pertanyaan harus berisi 1–2000 karakter.")
    try:
        result = await app.ainvoke({"pertanyaan": question})
        print(result["jawaban_final"])
    finally:
        await close_driver()


if __name__ == "__main__":
    asyncio.run(main())

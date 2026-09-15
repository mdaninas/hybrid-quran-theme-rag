from typing import TypedDict


class GraphState(TypedDict, total=False):
    pertanyaan: str
    query_rewrite: str
    paths: list[dict]
    sources: list[dict]
    graphs: list[dict]
    jawaban_final: str
    citation_status: str
    thought: str

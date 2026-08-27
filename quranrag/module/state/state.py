from typing import TypedDict, List, Dict, Tuple, Any
from langchain_core.documents import Document


class GraphState(TypedDict):
    pertanyaan: str
    query_rewrite: str
    retrieval_top5_tematik: List[Tuple[Document, float]]
    tematikskor: List[float]
    full_path: List[str]
    list_cypher: List[str]
    list_cypher_frontend: List[str]
    gabungan_retriever: List[Dict[str, Any]]
    jawaban_final: Any
    thought: str

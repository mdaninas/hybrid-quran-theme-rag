import os

from dotenv import load_dotenv
load_dotenv()

if os.environ.get("LANGSMITH_TRACING", "").strip().lower() not in ("true", "1", "yes"):
    os.environ["LANGSMITH_TRACING"] = "false"
from langgraph.graph import StateGraph,START
from module.skill.retriever_embedding import search_vectorstore
from module.skill.retriever_graph import retrieve_from_graph
from module.skill.reasoning import chain_reasoning
from module.state.state import GraphState
import json
from module.skill.query_rewriting import chain_extraction

def STEP_1(state):
    print("\nSTEP 1")
    print("=========================================")
    pertanyaan_awal = state['pertanyaan']
    res = chain_extraction.invoke({"pertanyaan":pertanyaan_awal})
    print("PERTANYAAN AWAL :",pertanyaan_awal)
    print("PERTANYAAN DISINGKAT UNTUK EMBEDDING :",res.content)
    return ({"query_rewrite":res.content,"thought":"Saya akan mencari 5 path tematik!"})

def STEP_2(state):
    print("\nSTEP 2")
    print("=========================================")
    print("5 TEMATIK DARI VECTORSTORE")
    result = search_vectorstore(state['query_rewrite'])
    print("5 jalur yang cocok : ")
    skor = []
    path = []
    for i, (doc, score) in enumerate(result):
        print(f"{i+1}. {doc.metadata['path']} (score: {score})")
        skor.append(round(score, 3))
        path.append(doc.metadata["path"])
    return {"full_path":path,"retrieval_top5_tematik": result,'tematikskor':skor,"thought":"Sekarang saya akan menghasilkan 5 cypher query berdasarkan path yang cocok!"}


def STEP_3(state):
    print("\nSTEP 3")
    print("=========================================")
    metadata_list = [doc.metadata for doc, _ in state['retrieval_top5_tematik']]
    # Diteruskan lagi ke payload STEP 3 karena frontend membaca skor tema
    # bersamaan dengan list_cypher_frontend (stream_mode="updates").
    skor = state['tematikskor']
    cypher_list = []
    cypher_list_frontend = []
    for i, cypher in enumerate(metadata_list, start=1):
        root_q = json.dumps(cypher["root"], ensure_ascii=False)  
        leaf_q = json.dumps(cypher["leaf"], ensure_ascii=False)
        cypher_list.append(
            f"""
            
            MATCH p=(a:Tematik {{nama:{root_q}}})-[:SUB_TEMA*]->(b:Tematik {{nama:{leaf_q}}})
                -[:TERKAIT_AYAT]->(c:Ayat)<-[:MEMILIKI_AYAT]-(d:Surah)
            WITH a, b, c, d
            ORDER BY c.id
            RETURN a.nama AS node_root,
                b.nama AS node_leaf,
                collect({{
                    id_ayat : c.ayat,
                    id_surah: d.id,
                    id_surah_ayat: c.id,
                    ayat_arab: c.ayat_arab,
                    ayat_indonesia: c.ayat_indonesia,
                    surah: d.nama_latin
                }}) AS ayat_collection"""
                
                .strip()
        )
        cypher_list_frontend.append(
            f"""
        MATCH p=(:Tematik {{nama:{root_q}}})-[:SUB_TEMA*]->(:Tematik {{nama:{leaf_q}}})
            -[:TERKAIT_AYAT]->(:Ayat)<-[:MEMILIKI_AYAT]-(:Surah)
        RETURN p
        LIMIT 100
        """.strip()
        )
        print(f"{i}. {cypher_list[i-1]}")
    return {"list_cypher":cypher_list,"list_cypher_frontend":cypher_list_frontend,'tematikskor':skor,"thought":"Saya akan mengambil data dari Knowledge Graph saya!"}

def STEP_4(state):
    print("\nSTEP 4")
    print("=========================================")
    hasil_gabungan_retrieval = []
    cypher_list = state['list_cypher']
    flat_results = []
    jumlah_ayat = 0
    for i, value in enumerate(cypher_list):
        print(f"CYPHER {i+1} YANG DIPANGGIL : ",value)
        print("============================================================")
        hasil = retrieve_from_graph(value)
        current_path = state['full_path'][i]

        hasil_with_path = []
        ayat_count = 0
        for item in hasil:
            ayat_collection = item.get("ayat_collection") or []
            ayat_count += len(ayat_collection)
            hasil_with_path.append({
                **item,
                "ayat_collection": ayat_collection,
                "full_path": current_path,
            })
        hasil_gabungan_retrieval.append(hasil_with_path)
        jumlah_ayat += ayat_count
        print(f"CYPHER MENGHASILKAN {ayat_count} AYAT")
        print("============================================================")

    for sublist in hasil_gabungan_retrieval:
            for item in sublist:
                flat_results.append(item)
    print(f"TOTAL SURAH YANG DIDAPATKAN : {jumlah_ayat} AYAT")
    return {'gabungan_retriever': flat_results,"thought":f"Dengan {len(flat_results)} total jumlah surah, Saya akan menyusun jawaban!"}

def STEP_5(state):
    print("\nSTEP 5")
    print("=========================================")
    ARRAY = state['gabungan_retriever']
    hasil = [
    {
        "id_surah": ayat["id_surah"],
        "id_ayat": ayat["id_ayat"],
        "id_surah_ayat": ayat["id_surah_ayat"],
        "surah": ayat["surah"],
        "ayat_arab": ayat["ayat_arab"],
        "ayat_indonesia": ayat["ayat_indonesia"],
        "tema": item["full_path"]
    }
    for item in ARRAY
    for ayat in item["ayat_collection"]  
    ]

    pertanyaan = state['pertanyaan']

    res = chain_reasoning.invoke({
        "pertanyaan":pertanyaan,
        "retrieval":hasil
    })
    # Pemakaian token diambil dari respons LLM (tanpa unduh encoding tiktoken).
    usage = getattr(res, "usage_metadata", None) or {}
    if usage:
        print(f"Token prompt: {usage.get('input_tokens')} | jawaban: {usage.get('output_tokens')}")
    print("\nJAWABAN : ")
    print(res.content)
    return ({"jawaban_final":res,"thought":"Saya selesai!"})
         
workflow = StateGraph(GraphState)

workflow.add_node("STEP2", STEP_2)
workflow.add_node("STEP1", STEP_1)
workflow.add_node("STEP3", STEP_3)
workflow.add_node("STEP4", STEP_4)
workflow.add_node("STEP5", STEP_5)

workflow.add_edge(START, "STEP1")

workflow.add_edge("STEP1", "STEP2")
workflow.add_edge("STEP2", "STEP3")
workflow.add_edge("STEP3", "STEP4")
workflow.add_edge("STEP4", "STEP5")


app = workflow.compile()


if __name__ == "__main__":
    # Mode terminal: python multi_agent.py
    pertanyaan = input("Apa yang ingin anda ketahui? \n")
    app.invoke({"pertanyaan": pertanyaan})

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from module.retrieval import collect_sources, graph_from_group, select_paths, validate_answer
from module.skill.retriever_graph import build_query


def verse(ref="2:153"):
    surah, ayah = ref.split(":")
    return {"id_surah_ayat": ref, "id_surah": surah, "id_ayat": int(ayah),
            "surah": "Surah uji", "ayat_indonesia": "Teks fixture pengujian.", "ayat_arab": ""}


def group(path, refs):
    return {"full_path": path, "themes": path.split(" > "), "score": 0.8,
            "ayat_collection": [verse(ref) for ref in refs]}


def test_invalid_metadata_duplicates_and_non_finite_scores_are_ignored():
    doc = SimpleNamespace(metadata={"path": "A > B", "root": "A", "leaf": "B"})
    bad = SimpleNamespace(metadata={"path": "A > B", "root": "X", "leaf": "B"})
    assert select_paths([(doc, float("nan")), (bad, 1), (doc, 0.8), (doc, 0.7)]) == [
        {"themes": ["A", "B"], "path": "A > B", "score": 0.8}]


def test_duplicate_sources_keep_all_paths_and_sample_across_paths():
    groups = [group("A > B", ["2:153", "2:154", "2:155"]), group("C > D", ["2:153", "3:1"])]
    result = collect_sources(groups, 3, 10000)
    assert [s["id_surah_ayat"] for s in result] == ["2:153", "2:154", "3:1"]
    assert result[0]["themes"] == ["A > B", "C > D"]


def test_context_stays_within_budget_without_truncating_verses():
    groups = [group("A", ["2:153", "2:154"])]
    result = collect_sources(groups, 10, 260)
    assert len(result) == 1
    assert len(json.dumps(result, ensure_ascii=False)) <= 260
    assert result[0]["ayat_indonesia"] == groups[0]["ayat_collection"][0]["ayat_indonesia"]


def test_empty_context_and_missing_translation():
    g = group("A", ["2:153"])
    g["ayat_collection"][0]["ayat_indonesia"] = ""
    assert collect_sources([g], 10, 10000) == []
    assert collect_sources([], 10, 10000) == []


def test_graph_only_contains_context_sources_and_deduplicates_edges():
    result = graph_from_group(group("A > B", ["2:153", "2:153", "2:154"]), {"2:153"})
    ids = {n["id"] for n in result["nodes"]}
    assert ids == {"theme:0", "theme:1", "verse:2:153", "surah:2"}
    assert len(result["edges"]) == 3
    assert all(e["from"] in ids and e["to"] in ids for e in result["edges"])


def test_empty_graph_has_no_invented_relationships():
    result = graph_from_group(group("A > B", []), set())
    assert result["nodes"] == result["edges"] == []


def test_query_uses_parameters_full_path_and_exact_depth():
    injected = 'B"}) DETACH DELETE n //'
    query = build_query(["A", injected])
    assert injected not in query
    assert "[:SUB_TEMA*1]" in query
    assert "= $themes" in query and "LIMIT $limit" in query
    assert "toInteger(id_surah)" in query
    assert "[:SUB_TEMA*0]" in build_query(["A"])


@pytest.mark.parametrize("themes", [[], ["A"] * 17, [""], [None]])
def test_invalid_query_path_rejected(themes):
    with pytest.raises(ValueError):
        build_query(themes)


@pytest.mark.parametrize("text", ["Tanpa sitasi", "Rujukan [QS. 3:1](verse:3:1)",
                                  "[QS. 3:1](verse:2:153)", "[QS. 2:153](verse:2:153) dan 4:1"])
def test_unverified_answers_are_replaced(text):
    answer, status = validate_answer(text, [verse()])
    assert status == "fallback"
    assert "verse:2:153" in answer and "verse:3:1" not in answer


def test_valid_answer_retained():
    text = "Contoh ringkasan [QS. Surah uji 2:153](verse:2:153)."
    assert validate_answer(text, [verse()]) == (text, "validated")


def test_label_and_target_must_agree_even_when_both_sources_exist():
    assert validate_answer("[QS. 3:1](verse:2:153)", [verse(), verse("3:1")])[1] == "fallback"


def test_catalog_keeps_identical_leaf_names_separate():
    from module.catalog import index_theme_paths
    data = {"A": {"SAMA": [{"surah": 2, "ayat": 153}]}, "B": {"SAMA": [{"surah": 3, "ayat": 1}]}}
    assert index_theme_paths(data) == {("A", "SAMA"): {"2:153"}, ("B", "SAMA"): {"3:1"}}


def test_catalog_excludes_known_invalid_references():
    from module.catalog import source_catalog
    all_ids = set().union(*source_catalog().values())
    assert not all_ids & {"1:64", "103:6", "221:10", "23:161", "48:57", "58:58", "61:15", "8:128"}


def test_unknown_path_never_queries_database(monkeypatch):
    import module.skill.retriever_graph as graph
    monkeypatch.setattr(graph, "get_driver", lambda: pytest.fail("Unknown paths must not query Neo4j"))
    assert asyncio.run(graph.retrieve_from_graph(["UNKNOWN_TEST_PATH"])) == []


def test_empty_retrieval_never_calls_reasoning(monkeypatch):
    import multi_agent
    def unexpected():
        raise AssertionError("No LLM call should occur without sources")
    monkeypatch.setattr(multi_agent, "get_reasoning_chain", unexpected)
    result = asyncio.run(multi_agent.STEP_5({"sources": []}))
    assert result["citation_status"] == "no_sources"


def test_pipeline_streams_five_steps_and_preserves_sources(monkeypatch):
    import multi_agent
    doc = SimpleNamespace(metadata={"path": "A > B", "root": "A", "leaf": "B"})
    monkeypatch.setattr(multi_agent, "get_extraction_chain", lambda: SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content="SABAR"))))
    monkeypatch.setattr(multi_agent, "search_vectorstore", AsyncMock(return_value=[(doc, 0.8)]))
    monkeypatch.setattr(multi_agent, "retrieve_from_graph", AsyncMock(return_value=[verse()]))
    monkeypatch.setattr(multi_agent, "get_reasoning_chain", lambda: SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content="Contoh [QS. 2:153](verse:2:153)."))))
    async def run():
        return [chunk async for chunk in multi_agent.app.astream({"pertanyaan": "Uji"}, stream_mode="updates")]
    updates = asyncio.run(run())
    assert [next(iter(chunk)) for chunk in updates] == [f"STEP{i}" for i in range(1, 6)]
    assert updates[3]["STEP4"]["sources"][0]["id_surah_ayat"] == "2:153"
    assert updates[4]["STEP5"]["citation_status"] == "validated"

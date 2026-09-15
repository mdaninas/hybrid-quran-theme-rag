import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from module.skill import retriever_embedding as embedding


def setup(monkeypatch, query):
    index = SimpleNamespace(query=query)
    index_context = AsyncMock()
    index_context.__aenter__.return_value = index
    client = SimpleNamespace(IndexAsyncio=lambda **kwargs: index_context,
                             describe_index=AsyncMock(return_value=SimpleNamespace(host="https://index.example")))
    client_context = AsyncMock()
    client_context.__aenter__.return_value = client
    monkeypatch.setenv("PINECONE_API_KEY", "test-key")
    monkeypatch.setenv("INDEX_NAME1", "test-index")
    monkeypatch.delenv("PINECONE_INDEX_HOST", raising=False)
    monkeypatch.setattr(embedding, "PineconeAsyncio", lambda **kwargs: client_context)
    monkeypatch.setattr(embedding, "get_embeddings", lambda: SimpleNamespace(aembed_query=AsyncMock(return_value=[0.1, 0.2])))
    return client_context, index_context


def test_metadata_and_scores_preserved_and_sessions_closed(monkeypatch):
    query = AsyncMock(return_value=SimpleNamespace(matches=[SimpleNamespace(metadata={"path": "A > B"}, score=0.8)]))
    client, index = setup(monkeypatch, query)
    result = asyncio.run(embedding.search_vectorstore("Test"))
    assert result[0][0].metadata == {"path": "A > B"}
    assert result[0][1] == 0.8
    assert query.call_args.kwargs["include_metadata"] is True
    client.__aexit__.assert_awaited_once()
    index.__aexit__.assert_awaited_once()


def test_cancel_closes_sessions(monkeypatch):
    client, index = setup(monkeypatch, AsyncMock(side_effect=asyncio.CancelledError))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(embedding.search_vectorstore("Test"))
    client.__aexit__.assert_awaited_once()
    index.__aexit__.assert_awaited_once()

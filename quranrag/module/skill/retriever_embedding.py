import asyncio
import os
from functools import lru_cache
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from pinecone import PineconeAsyncio
from config import EMBEDDING_MODEL, RETRIEVAL_TOP_K


@lru_cache(maxsize=1)
def get_embeddings():
    return OpenAIEmbeddings(model=EMBEDDING_MODEL, request_timeout=30, max_retries=1)


async def search_vectorstore(query):
    async with asyncio.timeout(45):
        vector = await get_embeddings().aembed_query(query)
        # Each request owns its async session, including on cancellation.
        async with PineconeAsyncio(api_key=os.environ["PINECONE_API_KEY"]) as client:
            host = os.getenv("PINECONE_INDEX_HOST")
            if not host:
                host = (await client.describe_index(os.environ["INDEX_NAME1"])).host
            async with client.IndexAsyncio(host=host) as index:
                result = await index.query(vector=vector, top_k=RETRIEVAL_TOP_K,
                                           namespace=os.getenv("PINECONE_NAMESPACE") or "",
                                           include_metadata=True)
    return [(Document(page_content="", metadata=match.metadata or {}), match.score)
            for match in result.matches]

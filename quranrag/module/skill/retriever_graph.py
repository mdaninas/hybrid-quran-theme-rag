"""Bounded, parameterized reads; database credentials stay on the server."""
import os
from neo4j import AsyncGraphDatabase, Query, READ_ACCESS
from config import MAX_VERSES_PER_PATH
from module.catalog import allowed_verse_ids

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            os.environ["NEO4J_LOKAL_URI"],
            auth=(os.environ["NEO4J_LOKAL_USER"], os.environ["NEO4J_LOKAL_PASSWORD"]),
            connection_timeout=10, connection_acquisition_timeout=10,
            max_transaction_retry_time=10, max_connection_pool_size=10,
        )
    return _driver


async def close_driver():
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


def build_query(themes):
    if not themes or len(themes) > 16 or any(not isinstance(t, str) or not t for t in themes):
        raise ValueError("Invalid thematic path")
    # Only a validated integer enters the query; dataset strings are parameters.
    hops = len(themes) - 1
    return f"""
        MATCH p=(a:Tematik {{nama: $root}})-[:SUB_TEMA*{hops}]->(b:Tematik {{nama: $leaf}})
        WHERE [n IN nodes(p) | n.nama] = $themes
        WITH DISTINCT b
        MATCH (b)-[:TERKAIT_AYAT]->(c:Ayat)<-[:MEMILIKI_AYAT]-(d:Surah)
        WHERE c.id IN $verse_ids
        RETURN DISTINCT c.ayat AS id_ayat, d.id AS id_surah,
            c.id AS id_surah_ayat, c.ayat_arab AS ayat_arab,
            c.ayat_indonesia AS ayat_indonesia, d.nama_latin AS surah
        ORDER BY toInteger(id_surah), toInteger(id_ayat)
        LIMIT $limit
    """.strip()


async def retrieve_from_graph(themes):
    verse_ids = allowed_verse_ids(themes)
    if not verse_ids:
        return []
    query = Query(build_query(themes), timeout=20)
    async with get_driver().session(
        database=os.getenv("NEO4J_DATABASE") or "neo4j", default_access_mode=READ_ACCESS,
    ) as session:
        result = await session.run(query, {
            "root": themes[0], "leaf": themes[-1], "themes": themes,
            "limit": MAX_VERSES_PER_PATH, "verse_ids": verse_ids,
        })
        return await result.data()

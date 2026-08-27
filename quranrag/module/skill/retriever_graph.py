import os

from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph

load_dotenv()

neo4j_url = os.environ["NEO4J_LOKAL_URI"]
neo4j_user = os.environ["NEO4J_LOKAL_USER"]
neo4j_password = os.environ["NEO4J_LOKAL_PASSWORD"]

graph = Neo4jGraph(url=neo4j_url, username=neo4j_user, password=neo4j_password,refresh_schema=False)

def retrieve_from_graph(cypher_query: str):
    return graph.query(cypher_query)

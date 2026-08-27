from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
import os
from dotenv import load_dotenv

load_dotenv()

embeddings = OpenAIEmbeddings()
vectorstore = PineconeVectorStore.from_existing_index(
    index_name=os.environ["INDEX_NAME1"],
    embedding=embeddings
)

def search_vectorstore(query):
    results = vectorstore.similarity_search_with_score(query, k=5)
    return results  

import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TEMATIK_JSON = SCRIPT_DIR.parent / "tematik_.json"
OUTPUT_JSON = SCRIPT_DIR.parent / "tematik_filtered.json"

with open(TEMATIK_JSON, encoding="utf-8") as f:
    data = json.load(f)

docs = []

def extract_leaf_paths(node, path=None):
    if path is None:
        path = []

    if isinstance(node, dict):
        for key, value in node.items():
            extract_leaf_paths(value, path + [key])

    elif isinstance(node, list):
        # cek apakah list ini adalah daftar ayat (leaf)
        if all(isinstance(v, dict) and "surah" in v and "ayat" in v for v in node):
            root = path[0]
            leaf = path[-1]
            docs.append({
                "content": " > ".join(path),
                "metadata": {
                    "root": root,
                    "leaf": leaf
                }
            })
        else:
            # kalau list berisi dict nested, lanjutkan
            for item in node:
                extract_leaf_paths(item, path)

# Jalankan
extract_leaf_paths(data)

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(docs, f, indent=2, ensure_ascii=False)

print(f"Total leaf ditemukan: {len(docs)}")
print(docs[-1])
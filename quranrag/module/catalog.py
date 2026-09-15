"""Local source catalog prevents identically named graph themes mixing verse lists."""
import json
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "process"


def index_theme_paths(data):
    paths = defaultdict(set)

    def visit(node, path=()):
        if isinstance(node, dict):
            if "surah" in node and "ayat" in node:
                paths[path].add(f"{node['surah']}:{node['ayat']}")
            else:
                for name, value in node.items():
                    visit(value, (*path, name))
        elif isinstance(node, list):
            for value in node:
                visit(value, path)
    visit(data)
    return dict(paths)


@lru_cache(maxsize=1)
def source_catalog():
    verses = json.loads((DATA_DIR / "READY" / "NODE_AYAT.json").read_text(encoding="utf-8"))
    themes = json.loads((DATA_DIR / "tematik_.json").read_text(encoding="utf-8"))
    valid_ids = {v["surah:ayat"] for v in verses}
    return {path: refs & valid_ids for path, refs in index_theme_paths(themes).items()}


def allowed_verse_ids(themes):
    return sorted(source_catalog().get(tuple(themes), set()),
                  key=lambda ref: tuple(map(int, ref.split(":"))))

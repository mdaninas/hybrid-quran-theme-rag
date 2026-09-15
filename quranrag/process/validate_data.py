"""Offline validation; no credentials, external services, or mutations required."""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from module.catalog import DATA_DIR, index_theme_paths


def audit():
    verses = json.loads((DATA_DIR / "READY/NODE_AYAT.json").read_text(encoding="utf-8"))
    surahs = json.loads((DATA_DIR / "READY/NODE_SURAH.json").read_text(encoding="utf-8"))
    themes = json.loads((DATA_DIR / "tematik_.json").read_text(encoding="utf-8"))
    paths = index_theme_paths(themes)
    ids = Counter(v["surah:ayat"] for v in verses)
    counts = Counter(str(v["id_surah"]) for v in verses)
    missing = [{"path": " > ".join(path), "reference": ref}
               for path, refs in paths.items() for ref in sorted(refs) if ref not in ids]
    leaf_paths = defaultdict(list)
    for path in paths:
        leaf_paths[path[-1]].append(path)
    ambiguous = {leaf: [" > ".join(p) for p in branches] for leaf, branches in leaf_paths.items()
                 if len(branches) > 1 and len({frozenset(paths[p]) for p in branches}) > 1}
    return {
        "surahs": len(surahs), "verses": len(verses), "thematic_paths": len(paths),
        "duplicate_verse_ids": [ref for ref, count in ids.items() if count > 1],
        "inconsistent_verse_ids": [v["surah:ayat"] for v in verses if v["surah:ayat"] != f"{v['id_surah']}:{v['ayat']}"],
        "surah_count_mismatches": [s["id"] for s in surahs if counts[str(s["id"])] != int(s["total_ayat"])],
        "missing_arabic": [v["surah:ayat"] for v in verses if not v.get("ayat_arab", "").strip()],
        "missing_indonesian": [v["surah:ayat"] for v in verses if not v.get("ayat_bahasa_indonesia", "").strip()],
        "missing_theme_references": missing,
        "ambiguous_leaf_names": ambiguous,
        "max_path_depth": max(map(len, paths)),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--strict", action="store_true", help="Exit 1 for missing references or corpus inconsistencies")
    args = parser.parse_args()
    report = audit()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: len(v) if isinstance(v, (dict, list)) else v for k, v in report.items()}, indent=2))
    failures = any(report[k] for k in ("duplicate_verse_ids", "inconsistent_verse_ids", "surah_count_mismatches",
                                      "missing_arabic", "missing_indonesian", "missing_theme_references"))
    sys.exit(1 if args.strict and failures else 0)

"""Pure transformations shared by the pipeline and offline regression tests."""
import json
import math
import re

NO_SOURCES = ("Belum ditemukan ayat sumber yang cukup untuk menjawab pertanyaan ini. "
              "Coba gunakan tema atau kata kunci yang lebih spesifik.")


def select_paths(results):
    paths, seen = [], set()
    for doc, score in results:
        metadata = doc.metadata
        path = metadata.get("path")
        if not isinstance(path, str):
            continue
        themes = [part.strip() for part in path.split(">")]
        if not 1 <= len(themes) <= 16 or any(not t or len(t) > 300 for t in themes):
            continue
        if metadata.get("root") != themes[0] or metadata.get("leaf") != themes[-1]:
            continue
        try:
            score = float(score)
        except (TypeError, ValueError):
            continue
        key = tuple(themes)
        if key in seen or not math.isfinite(score):
            continue
        seen.add(key)
        paths.append({"themes": themes, "path": " > ".join(themes), "score": round(score, 4)})
    return paths


def collect_sources(groups, max_verses, max_chars):
    """Round-robin paths for coverage; deduplicate without truncating verse text."""
    sources = {}
    for group in groups:
        for verse in group["ayat_collection"]:
            ref = str(verse.get("id_surah_ayat", ""))
            if not re.fullmatch(r"[1-9]\d{0,2}:[1-9]\d{0,2}", ref):
                continue
            if int(ref.split(":")[0]) > 114:
                continue
            if ref != f"{verse.get('id_surah')}:{verse.get('id_ayat')}":
                continue
            if not verse.get("ayat_indonesia"):
                continue
            if ref not in sources:
                sources[ref] = {**verse, "id_surah_ayat": ref, "themes": []}
            if group["full_path"] not in sources[ref]["themes"]:
                sources[ref]["themes"].append(group["full_path"])
    selected, seen, chars = [], set(), 2
    for index in range(max((len(g["ayat_collection"]) for g in groups), default=0)):
        for group in groups:
            if index >= len(group["ayat_collection"]):
                continue
            ref = str(group["ayat_collection"][index].get("id_surah_ayat", ""))
            if ref in seen or ref not in sources:
                continue
            seen.add(ref)
            source = sources[ref]
            size = len(json.dumps(source, ensure_ascii=False)) + 2
            if chars + size > max_chars:
                continue
            selected.append(source)
            chars += size
            if len(selected) >= max_verses:
                return selected
    return selected


def graph_from_group(group, allowed_ids):
    verses = [v for v in group["ayat_collection"] if str(v["id_surah_ayat"]) in allowed_ids]
    nodes, edges = {}, {}

    def edge(start, end, label):
        key = f"{start}|{label}|{end}"
        edges[key] = {"id": key, "from": start, "to": end, "label": label}

    if verses:
        for index, theme in enumerate(group["themes"]):
            key = f"theme:{index}"
            nodes[key] = {"id": key, "label": theme, "group": "theme"}
            if index:
                edge(f"theme:{index - 1}", key, "SUB_TEMA")
        for verse in verses:
            verse_id, surah_id = f"verse:{verse['id_surah_ayat']}", f"surah:{verse['id_surah']}"
            nodes[verse_id] = {"id": verse_id, "label": str(verse["id_surah_ayat"]),
                               "group": "verse", "verseId": str(verse["id_surah_ayat"]),
                               "arabic": verse.get("ayat_arab") or "",
                               "translation": verse.get("ayat_indonesia") or ""}
            nodes[surah_id] = {"id": surah_id, "label": verse["surah"], "group": "surah"}
            edge(f"theme:{len(group['themes']) - 1}", verse_id, "TERKAIT_AYAT")
            edge(surah_id, verse_id, "MEMILIKI_AYAT")
    return {"path": group["full_path"], "score": group["score"],
            "nodes": list(nodes.values()), "edges": list(edges.values())}


def validate_answer(text, sources):
    allowed = {v["id_surah_ayat"] for v in sources}
    references = set(re.findall(r"\b(\d{1,3}:\d{1,3})\b", text))
    linked = set(re.findall(r"\]\(verse:(\d{1,3}:\d{1,3})\)", text))
    pattern = r"\[([^\]\n]*)\]\(verse:(\d{1,3}:\d{1,3})\)"
    links_consistent = all(
        all(ref == target for ref in re.findall(r"\b\d{1,3}:\d{1,3}\b", label))
        for label, target in re.findall(pattern, text)
    )
    if text.strip() and linked and references <= allowed and links_consistent:
        by_id = {s["id_surah_ayat"]: s for s in sources}
        # Display the source's actual surah name, never an unverified model-generated name.
        text = re.sub(pattern, lambda m: f"[QS. {by_id[m[2]]['surah']} {m[2]}](verse:{m[2]})", text)
        return text.strip(), "validated"
    links = ", ".join(f"[QS. {s['surah']} {s['id_surah_ayat']}](verse:{s['id_surah_ayat']})"
                      for s in sources[:5])
    return ("Jawaban belum dapat disusun dengan sitasi yang terverifikasi. "
            f"Silakan periksa ayat sumber berikut: {links}.", "fallback")

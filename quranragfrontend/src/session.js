import { SESSION_GRAPH_KEY, SESSION_KEY } from "./constants";

export const emptyEvidence = () => ({ sources: [], graphs: [] });

export function readStorage(key, fallback, storageName = "sessionStorage") {
  try {
    const raw = window[storageName].getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value, storageName = "sessionStorage") {
  try {
    window[storageName].setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function normalizeEvidence(value) {
  const sourceIds = new Set();
  return {
    sources: Array.isArray(value?.sources) ? value.sources.filter((s) =>
      s && typeof s.id_surah_ayat === "string" && /^\d{1,3}:\d{1,3}$/.test(s.id_surah_ayat)
      && typeof s.ayat_indonesia === "string" && !sourceIds.has(s.id_surah_ayat)
      && sourceIds.add(s.id_surah_ayat)).map((s) => ({
        ...s, surah: typeof s.surah === "string" ? s.surah : "Al-Qur'an",
        ayat_arab: typeof s.ayat_arab === "string" ? s.ayat_arab : "",
        themes: Array.isArray(s.themes) ? s.themes.filter((t) => typeof t === "string") : [],
      })) : [],
    graphs: Array.isArray(value?.graphs) ? value.graphs.filter((g) =>
      g && Array.isArray(g.nodes) && g.nodes.every((n) => n && typeof n.id === "string"
        && typeof n.label === "string" && ["theme", "verse", "surah"].includes(n.group))
      && Array.isArray(g.edges) && g.edges.every((e) => e && typeof e.id === "string"
        && typeof e.from === "string" && typeof e.to === "string") && typeof g.path === "string") : [],
  };
}

export function readMessages() {
  const saved = readStorage(SESSION_KEY, []);
  if (!Array.isArray(saved)) return [];
  const ids = new Set();
  return saved.filter((m) => {
    if (!m || typeof m.id !== "string" || ids.has(m.id) || typeof m.text !== "string"
      || !["user", "assistant"].includes(m.role)) return false;
    ids.add(m.id);
    return true;
  }).slice(-40).map((m) => ({ ...m, evidence: normalizeEvidence(m.evidence) }));
}

export function saveEvidence(evidence) {
  writeStorage(SESSION_GRAPH_KEY, evidence);
}

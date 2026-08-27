export const PROFILE_KEY = "quranrag-demo-profile";
export const SESSION_KEY = "quranrag-session";
export const SESSION_GRAPH_KEY = "quranrag-session-graph";
export const SESSION_NEO4J_CONFIG_KEY = "quranrag-neo4j-config";

export const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/ask";

function deriveApiBase() {
  const configured = import.meta.env.VITE_API_BASE;
  if (configured) return String(configured).replace(/\/$/, "");

  try {
    const wsUrl = new URL(WS_URL);
    wsUrl.protocol = wsUrl.protocol === "wss:" ? "https:" : "http:";
    wsUrl.pathname = "";
    wsUrl.search = "";
    wsUrl.hash = "";
    return wsUrl.toString().replace(/\/$/, "");
  } catch {
    return "http://127.0.0.1:8000";
  }
}

export const API_BASE = deriveApiBase();
export const GRAPH_CONFIG_URL = `${API_BASE}/graph-config`;

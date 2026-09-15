export const PROFILE_KEY = "quranrag-demo-profile";
export const SESSION_KEY = "quranrag-session-v2";
export const SESSION_GRAPH_KEY = "quranrag-session-graph-v2";
export const MAX_QUESTION_LENGTH = 2000;

// The Vite proxy supports local development; deployments use same-origin /ws/ask.
const defaultUrl = new URL("/ws/ask", window.location.href);
defaultUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
export const WS_URL = import.meta.env.VITE_WS_URL || defaultUrl.toString();

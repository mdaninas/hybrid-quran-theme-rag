import { useState } from "react";
import Layout from "./components/Layout";
import LoginScreen from "./components/LoginScreen";
import { PROFILE_KEY, SESSION_GRAPH_KEY, SESSION_KEY } from "./constants";
import { readStorage, writeStorage } from "./session";

function removeKey(storageName, key) {
  try { window[storageName].removeItem(key); } catch { /* Storage may be disabled. */ }
}

function readProfile() {
  // Delete credentials and old, incompatible query-based sessions left by earlier versions.
  for (const key of ["quranrag-neo4j-config", "quranrag-session", "quranrag-session-graph"]) removeKey("sessionStorage", key);
  for (const storageName of ["localStorage", "sessionStorage"]) {
    const value = readStorage(PROFILE_KEY, null, storageName);
    if (value && typeof value.name === "string" && value.name.trim() && ["guest", "local"].includes(value.mode)) {
      return { name: value.name.trim().slice(0, 60), mode: value.mode };
    }
  }
  return null;
}

export default function App() {
  const [profile, setProfile] = useState(readProfile);
  const login = (next) => {
    const saved = { name: next.name, mode: next.mode };
    removeKey("localStorage", PROFILE_KEY); removeKey("sessionStorage", PROFILE_KEY);
    writeStorage(PROFILE_KEY, saved, next.remember ? "localStorage" : "sessionStorage");
    setProfile(saved);
  };
  const logout = () => {
    removeKey("localStorage", PROFILE_KEY);
    for (const key of [PROFILE_KEY, SESSION_KEY, SESSION_GRAPH_KEY]) removeKey("sessionStorage", key);
    setProfile(null);
  };
  return profile ? <Layout profile={profile} onLogout={logout} /> : <LoginScreen onLogin={login} />;
}

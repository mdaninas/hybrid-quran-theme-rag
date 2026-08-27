import { useState } from "react";
import Layout from "./components/Layout";
import LoginScreen from "./components/LoginScreen";
import { PROFILE_KEY, SESSION_GRAPH_KEY, SESSION_KEY } from "./constants";

function readStoredProfile() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(PROFILE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Storage can be disabled by the browser. The demo still works in memory.
    }
  }
  return null;
}

export default function App() {
  const [profile, setProfile] = useState(readStoredProfile);

  const handleLogin = (nextProfile) => {
    const profileToStore = {
      email: nextProfile.email,
      mode: nextProfile.mode,
      name: nextProfile.name,
    };

    try {
      const storage = nextProfile.remember ? localStorage : sessionStorage;
      localStorage.removeItem(PROFILE_KEY);
      sessionStorage.removeItem(PROFILE_KEY);
      storage.setItem(PROFILE_KEY, JSON.stringify(profileToStore));
    } catch {
      // Keep the profile in React state when browser storage is unavailable.
    }
    setProfile(profileToStore);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(PROFILE_KEY);
      sessionStorage.removeItem(PROFILE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_GRAPH_KEY);
    } catch {
      // No-op when storage is unavailable.
    }
    setProfile(null);
  };

  if (!profile) return <LoginScreen onLogin={handleLogin} />;

  return <Layout onLogout={handleLogout} profile={profile} />;
}

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { SESSION_GRAPH_KEY } from "../constants";
import { emptyEvidence, normalizeEvidence, readStorage, saveEvidence } from "../session";
import Chat from "./Chat";
import GraphBoundary from "./GraphBoundary";
import { AtlasPreviewSvg, BookOpenIcon, LogOutIcon, MessageIcon, NetworkIcon, WifiIcon, WifiOffIcon } from "./Icons";

const ThematicGraph = lazy(() => import("./Popoto"));

export default function Layout({ profile, onLogout }) {
  const [evidence, setEvidence] = useState(() => normalizeEvidence(readStorage(SESSION_GRAPH_KEY, emptyEvidence())));
  const [connection, setConnection] = useState("connecting");
  const [showVerses, setShowVerses] = useState(false);
  const [selectedVerseId, setSelectedVerseId] = useState(null);
  const [mobileView, setMobileView] = useState("chat");
  const { graphs, sources } = evidence;
  const initials = profile.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const updateEvidence = useCallback((next) => { setEvidence(next); setSelectedVerseId(null); }, []);
  const openSources = useCallback((next) => {
    if (next) { setEvidence(next); saveEvidence(next); setSelectedVerseId(null); }
    setShowVerses(true); setMobileView("graph");
  }, []);
  const selectVerse = useCallback((id, next) => {
    if (next) { setEvidence(next); saveEvidence(next); }
    setSelectedVerseId(id); setShowVerses(true); setMobileView("graph");
  }, []);
  useEffect(() => {
    if (selectedVerseId) document.getElementById(`source-${selectedVerseId}`)?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest",
    });
  }, [selectedVerseId, evidence]);

  return <div className="app-shell">
    <a className="skip-link" href="#main-chat" onClick={() => setMobileView("chat")}>Lewati ke percakapan</a>
    <header className="topbar">
      <div className="topbar-brand"><span className="brand-mark"><BookOpenIcon size={24} /></span><div><strong>Ruang Jelajah</strong><span>Al-Qur&apos;an Tematik</span></div></div>
      <div className="topbar-actions">
        <span className={`connection-pill connection-${connection}`} role="status">{connection === "connected" ? <WifiIcon size={16} /> : <WifiOffIcon size={16} />}{connection === "connected" ? "Terhubung" : connection === "connecting" ? "Menghubungkan" : "Terputus"}</span>
        <div className="profile-chip"><span className="profile-avatar">{initials}</span><span className="profile-name"><strong>{profile.name}</strong><small>{profile.mode === "guest" ? "Mode tamu" : "Mode demo"}</small></span></div>
        <button aria-label="Keluar dari demo" className="icon-button logout-button" onClick={onLogout} type="button"><LogOutIcon size={20} /></button>
      </div>
    </header>
    <main className="workspace">
      <section className={`chat-pane mobile-section ${mobileView === "chat" ? "mobile-active" : ""}`} id="main-chat" tabIndex={-1}>
        <Chat onConnectionChange={setConnection} onOpenSources={openSources} onSelectVerse={selectVerse}
          onUpdateEvidence={updateEvidence} profile={profile} selectedVerseId={selectedVerseId} />
      </section>
      <section className={`discovery-pane atlas-stage mobile-section ${mobileView === "graph" ? "mobile-active" : ""} ${showVerses ? "verses-open" : ""}`} aria-label="Peta tematik">
        <div className="atlas-toolbar"><h2>Peta tematik</h2><button aria-expanded={showVerses} aria-controls="verse-panel" className="atlas-verse-toggle"
          disabled={!sources.length} onClick={() => setShowVerses((v) => !v)} type="button">Ayat{sources.length ? ` ${sources.length}` : ""}</button></div>
        <div className="discovery-body">
          {!graphs.length ? <div className="graph-empty">
            <AtlasPreviewSvg size={200} /><h2>{showVerses ? "Belum ada ayat terkait." : "Peta muncul setelah ada pertanyaan."}</h2>
            <p>Ajukan pertanyaan untuk melihat hubungan tema, ayat, dan surah dari sumber jawaban.</p>
          </div> : <GraphBoundary><Suspense fallback={<div className="graph-loading"><NetworkIcon size={24} /><strong>Menyiapkan peta hubungan…</strong></div>}>
            <ThematicGraph graphs={graphs} onSelectVerse={selectVerse} selectedVerseId={selectedVerseId} />
          </Suspense></GraphBoundary>}
          {sources.length > 0 && <aside className={`verse-panel${showVerses ? " is-open" : ""}`} id="verse-panel" aria-label="Ayat sumber">
            <div className="verse-panel-header"><strong>{sources.length} ayat sumber</strong><button className="message-copy-button" onClick={() => setShowVerses(false)} type="button">Tutup</button></div>
            <div className="verse-list">{sources.map((source, index) => <article className={`verse-card${source.id_surah_ayat === selectedVerseId ? " is-selected" : ""}`}
              id={`source-${source.id_surah_ayat}`} key={source.id_surah_ayat}>
              <button className="verse-select" aria-pressed={source.id_surah_ayat === selectedVerseId} onClick={() => selectVerse(source.id_surah_ayat)} type="button">
                <span className="verse-number">{index + 1}</span><span><strong>QS. {source.surah}</strong><small>{source.id_surah_ayat}</small></span>
              </button>
              {source.ayat_arab && <p className="verse-arabic" dir="rtl" lang="ar">{source.ayat_arab}</p>}
              <p className="verse-translation">{source.ayat_indonesia}</p>
              {source.themes?.length > 0 && <details className="source-themes"><summary>Jalur tema</summary><ul>{source.themes.map((theme) => <li key={theme}>{theme}</li>)}</ul></details>}
            </article>)}</div>
          </aside>}
        </div>
      </section>
    </main>
    <nav className="mobile-nav" aria-label="Navigasi seluler">
      <button className={mobileView === "chat" ? "active" : ""} aria-current={mobileView === "chat" ? "page" : undefined} onClick={() => setMobileView("chat")} type="button"><MessageIcon size={20} /><span>Tanya</span></button>
      <button className={mobileView === "graph" && showVerses ? "active" : ""} aria-current={mobileView === "graph" && showVerses ? "page" : undefined} onClick={() => openSources()} type="button"><BookOpenIcon size={20} /><span>Ayat</span>{sources.length > 0 && <i>{sources.length}</i>}</button>
      <button className={mobileView === "graph" && !showVerses ? "active" : ""} aria-current={mobileView === "graph" && !showVerses ? "page" : undefined} onClick={() => { setShowVerses(false); setMobileView("graph"); }} type="button"><NetworkIcon size={20} /><span>Peta</span></button>
    </nav>
  </div>;
}

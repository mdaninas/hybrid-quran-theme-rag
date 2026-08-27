import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { SESSION_GRAPH_KEY } from "../constants";
import Chat from "./Chat";
import {
  AtlasPreviewSvg,
  BookOpenIcon,
  LogOutIcon,
  MessageIcon,
  NetworkIcon,
  WifiIcon,
  WifiOffIcon,
} from "./Icons";

const NeovisGraph = lazy(() => import("./Popoto"));

function GraphAtlasEmpty({ description, title }) {
  return (
    <div className="graph-empty">
      <AtlasPreviewSvg size={200} />
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="graph-legend-preview">
        <span><i className="legend-dot theme" /> Tema</span>
        <span><i className="legend-dot verse" /> Ayat</span>
        <span><i className="legend-dot surah" /> Surah</span>
      </div>
    </div>
  );
}

function readGraphSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_GRAPH_KEY);
    if (!raw) return { cypher: [], thematicScores: [], sources: [] };
    const data = JSON.parse(raw);
    return {
      cypher: Array.isArray(data.cypher) ? data.cypher : [],
      thematicScores: Array.isArray(data.thematicScores) ? data.thematicScores : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
    };
  } catch {
    return { cypher: [], thematicScores: [], sources: [] };
  }
}

function sourceReference(source) {
  if (source.id_surah_ayat) return source.id_surah_ayat;
  if (source.id_surah && source.id_ayat) return `${source.id_surah}:${source.id_ayat}`;
  return "Ayat terkait";
}

export default function Layout({ profile, onLogout }) {
  const initialGraphRef = useRef(null);
  if (!initialGraphRef.current) {
    initialGraphRef.current = readGraphSession();
  }

  const [cypher, setCypher] = useState(() => initialGraphRef.current.cypher);
  const [thematicScores, setThematicScores] = useState(() => initialGraphRef.current.thematicScores);
  const [sources, setSources] = useState(() => initialGraphRef.current.sources);
  const [connection, setConnection] = useState("connecting");
  const [showVerses, setShowVerses] = useState(false);
  const [selectedVerseId, setSelectedVerseId] = useState(null);
  const [mobileView, setMobileView] = useState("chat");

  const initials = useMemo(
    () => profile.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "RJ",
    [profile.name],
  );

  const openVersesPanel = () => {
    setShowVerses(true);
    setMobileView("graph");
  };

  const openGraph = () => {
    setShowVerses(false);
    setMobileView("graph");
  };

  const handleSelectVerse = (id) => {
    setSelectedVerseId(id);
  };

  const isDiscoveryActive = mobileView === "graph";
  const versesPanelOpen = showVerses && sources.length > 0;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-chat">Lewati ke percakapan</a>
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark"><BookOpenIcon size={24} /></span>
          <div><strong>Ruang Jelajah</strong><span>Al-Qur&apos;an Tematik</span></div>
        </div>

        <div className="topbar-actions">
          <span className={`connection-pill connection-${connection}`}>
            {connection === "connected" ? <WifiIcon size={16} /> : <WifiOffIcon size={16} />}
            {connection === "connected" ? "Terhubung" : connection === "connecting" ? "Menghubungkan" : "Terputus"}
          </span>
          <div className="profile-chip">
            <span className="profile-avatar">{initials}</span>
            <span className="profile-name"><strong>{profile.name}</strong><small>{profile.mode === "guest" ? "Mode tamu" : "Mode demo"}</small></span>
          </div>
          <button aria-label="Keluar dari demo" className="icon-button logout-button" onClick={onLogout} title="Keluar" type="button">
            <LogOutIcon size={20} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className={`chat-pane mobile-section ${mobileView === "chat" ? "mobile-active" : ""}`} id="main-chat">
          <Chat
            onConnectionChange={setConnection}
            onOpenSources={openVersesPanel}
            onSelectVerse={handleSelectVerse}
            onUpdateCypher={setCypher}
            onUpdateSkorTM={setThematicScores}
            onUpdateSources={setSources}
            profile={profile}
            selectedVerseId={selectedVerseId}
          />
        </section>

        <section
          className={`discovery-pane atlas-stage mobile-section ${mobileView !== "chat" ? "mobile-active" : ""}`}
          aria-label="Peta tematik"
        >
          <div className="atlas-toolbar">
            <h2>Peta tematik</h2>
            <button
              aria-expanded={versesPanelOpen}
              className={sources.length ? "atlas-verse-toggle" : "atlas-verse-toggle is-muted"}
              disabled={!sources.length}
              onClick={() => setShowVerses((current) => !current)}
              type="button"
            >
              {sources.length ? `Ayat ${sources.length}` : "Ayat"}
            </button>
          </div>

          <div className="discovery-body">
            {cypher.length === 0 ? (
              showVerses ? (
                <div className="graph-empty verse-empty-hint">
                  <BookOpenIcon size={24} />
                  <h2>Belum ada ayat terkait.</h2>
                  <p>Ajukan pertanyaan dulu; ayat sumber akan muncul di sini.</p>
                </div>
              ) : (
                <GraphAtlasEmpty
                  description="Hanya jalur yang relevan yang ditampilkan, supaya hubungan tema–ayat–surah tetap terbaca."
                  title="Peta muncul setelah ada pertanyaan."
                />
              )
            ) : (
              <Suspense
                fallback={(
                  <div className="graph-loading">
                    <span><NetworkIcon size={24} /></span>
                    <strong>Menyiapkan peta hubungan…</strong>
                  </div>
                )}
              >
                <NeovisGraph
                  cypherList={cypher}
                  onSelectVerse={handleSelectVerse}
                  selectedVerseId={selectedVerseId}
                  skorTM={thematicScores}
                />
              </Suspense>
            )}

            {sources.length > 0 ? (
              <aside className={`verse-panel${versesPanelOpen ? " is-open" : ""}`}>
                <div className="verse-panel-header">
                  <strong>{sources.length} ayat terkait</strong>
                </div>
                <div className="verse-list">
                  {sources.map((source, index) => {
                    const verseId = sourceReference(source);
                    const isSelected = verseId === selectedVerseId;

                    return (
                      <article
                        className={`verse-card${isSelected ? " is-selected" : ""}`}
                        key={`${verseId}-${index}`}
                        onClick={() => handleSelectVerse(verseId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleSelectVerse(verseId);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="verse-card-topline">
                          <span className="verse-number">{index + 1}</span>
                          <div>
                            <strong>QS. {source.surah || "Al-Qur'an"}</strong>
                            <small>{verseId}</small>
                          </div>
                        </div>
                        {source.ayat_arab ? <p className="verse-arabic" dir="rtl" lang="ar">{source.ayat_arab}</p> : null}
                        <p className="verse-translation">{source.ayat_indonesia || "Terjemahan belum tersedia pada payload ini."}</p>
                      </article>
                    );
                  })}
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Navigasi seluler">
        <button className={mobileView === "chat" ? "active" : ""} onClick={() => setMobileView("chat")} type="button"><MessageIcon size={20} /><span>Tanya</span></button>
        <button className={isDiscoveryActive && showVerses ? "active" : ""} onClick={openVersesPanel} type="button"><BookOpenIcon size={20} /><span>Ayat</span>{sources.length ? <i>{sources.length}</i> : null}</button>
        <button className={isDiscoveryActive && !showVerses ? "active" : ""} onClick={openGraph} type="button"><NetworkIcon size={20} /><span>Peta</span></button>
      </nav>
    </div>
  );
}

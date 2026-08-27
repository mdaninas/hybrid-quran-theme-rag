import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SESSION_GRAPH_KEY, SESSION_KEY, WS_URL } from "../constants";
import {
  BookOpenIcon,
  ChevronRightIcon,
  SendIcon,
} from "./Icons";

const suggestedPrompts = [
  "Apa makna sabar dalam Al-Qur'an?",
  "Ayat tentang ketenangan hati",
  "Bagaimana Al-Qur'an menjelaskan keadilan?",
];

const progressLabels = {
  STEP1: "Memahami pertanyaanmu",
  STEP2: "Menemukan tema yang relevan",
  STEP3: "Menelusuri hubungan ayat",
  STEP4: "Mengumpulkan rujukan terbaik",
  STEP5: "Menyusun jawaban dan sumber",
};

const SURAH_NAMES = [
  "Al-Fatihah", "Al-Baqarah", "Ali 'Imran", "An-Nisa", "Al-Ma'idah", "Al-An'am",
  "Al-A'raf", "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim",
  "Al-Hijr", "An-Nahl", "Al-Isra", "Al-Kahf", "Maryam", "Taha", "Al-Anbya", "Al-Hajj",
  "Al-Mu'minun", "An-Nur", "Al-Furqan", "Ash-Shu'ara", "An-Naml", "Al-Qasas",
  "Al-'Ankabut", "Ar-Rum", "Luqman", "As-Sajdah", "Al-Ahzab", "Saba", "Fatir",
  "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir", "Fussilat", "Ash-Shuraa",
  "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf", "Muhammad", "Al-Fath",
  "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman",
  "Al-Waqi'ah", "Al-Hadid", "Al-Mujadila", "Al-Hashr", "Al-Mumtahanah", "As-Saf",
  "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq", "At-Tahrim", "Al-Mulk",
  "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn", "Al-Muzzammil",
  "Al-Muddaththir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba", "An-Nazi'at",
  "'Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj",
  "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams",
  "Al-Layl", "Ad-Duhaa", "Ash-Sharh", "At-Tin", "Al-'Alaq", "Al-Qadr", "Al-Bayyinah",
  "Az-Zalzalah", "Al-'Adiyat", "Al-Qari'ah", "At-Takathur", "Al-'Asr", "Al-Humazah",
  "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad",
  "Al-Ikhlas", "Al-Falaq", "An-Nas",
];

const SURAH_NAME_TO_ID = SURAH_NAMES.reduce((map, name, index) => {
  map[normalizeSurahName(name)] = index + 1;
  return map;
}, {});

function normalizeSurahName(name) {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSurahId(name) {
  const normalized = normalizeSurahName(name);
  if (SURAH_NAME_TO_ID[normalized]) return SURAH_NAME_TO_ID[normalized];
  if (normalized.startsWith("al ")) {
    return SURAH_NAME_TO_ID[normalized.slice(3)] ?? null;
  }
  return null;
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { messages: [], sourceCount: 0, nextId: 0 };
    const data = JSON.parse(raw);
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const maxId = messages.reduce((max, message) => Math.max(max, message.id || 0), 0);
    return {
      messages,
      sourceCount: typeof data.sourceCount === "number" ? data.sourceCount : 0,
      nextId: typeof data.nextId === "number" ? data.nextId : maxId,
    };
  } catch {
    return { messages: [], sourceCount: 0, nextId: 0 };
  }
}

function writeSession(data) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // Storage can be disabled by the browser.
  }
}

function persistGraph(patch) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(SESSION_GRAPH_KEY) || "{}");
    sessionStorage.setItem(SESSION_GRAPH_KEY, JSON.stringify({ ...existing, ...patch }));
  } catch {
    // Storage can be disabled by the browser.
  }
}

function preprocessCitations(text) {
  if (!text || typeof text !== "string") return text;

  const placeholders = [];
  const stash = (label, verseId) => {
    const index = placeholders.length;
    placeholders.push({ label, verseId });
    return `\u0000CITE${index}\u0000`;
  };

  let result = text;

  result = result.replace(
    /(?:QS\.?\s+)([A-Za-z][A-Za-z'\- ]+?)\s+(\d{1,3}):(\d{1,3})/gi,
    (match, _name, surah, ayah) => stash(match, `${surah}:${ayah}`),
  );

  result = result.replace(
    /\(([A-Za-z][A-Za-z'\- ]+?)[: ](\d{1,3})\)/g,
    (match, name, ayah) => {
      const surahId = resolveSurahId(name.trim());
      if (!surahId) return match;
      return stash(match, `${surahId}:${ayah}`);
    },
  );

  result = result.replace(
    /([A-Za-z][A-Za-z'\- ]+?)\s+(\d{1,3}):(\d{1,3})/g,
    (match, name, surah, ayah) => {
      if (/^QS\.?$/i.test(name.trim())) return match;
      const resolved = resolveSurahId(name.trim());
      if (resolved && String(resolved) === surah) {
        return stash(match, `${surah}:${ayah}`);
      }
      return match;
    },
  );

  result = result.replace(/\b(\d{1,3}):(\d{1,3})\b/g, (match, surah, ayah) => {
    const surahNum = parseInt(surah, 10);
    const ayahNum = parseInt(ayah, 10);
    if (surahNum < 1 || surahNum > 114 || ayahNum < 1) return match;
    return stash(match, `${surah}:${ayah}`);
  });

  placeholders.forEach(({ label, verseId }, index) => {
    result = result.replace(`\u0000CITE${index}\u0000`, `[${label}](verse:${verseId})`);
  });

  return result;
}

function extractSources(retrieval) {
  const uniqueSources = new Map();
  if (!Array.isArray(retrieval)) return [];

  retrieval.forEach((group) => {
    const verses = Array.isArray(group?.ayat_collection) ? group.ayat_collection : [];
    verses.forEach((verse) => {
      const key = verse.id_surah_ayat || `${verse.id_surah}:${verse.id_ayat}`;
      if (!uniqueSources.has(key)) {
        uniqueSources.set(key, {
          ...verse,
          full_path: group.full_path || null,
          node_leaf: group.node_leaf || null,
          node_root: group.node_root || null,
        });
      }
    });
  });

  return Array.from(uniqueSources.values());
}

function cleanAnswer(payload) {
  const candidate =
    payload?.jawaban_final?.content ??
    payload?.text?.content ??
    payload?.text ??
    payload?.answer ??
    payload?.output ??
    (typeof payload === "string" ? payload : null);

  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return "Jawaban belum tersedia. Coba ajukan pertanyaan dengan tema yang lebih spesifik.";
}

function AssistantAvatar() {
  return <span className="assistant-avatar"><BookOpenIcon size={16} /></span>;
}

function AssistantMessage({ text, selectedVerseId, onSelectVerse }) {
  const [copied, setCopied] = useState(false);
  const processed = useMemo(() => preprocessCitations(text), [text]);

  const components = useMemo(() => ({
    a: ({ href, children }) => {
      if (href?.startsWith("verse:")) {
        const verseId = href.slice(6);
        const isSelected = selectedVerseId === verseId;
        return (
          <button
            className={`verse-citation${isSelected ? " verse-citation-active" : ""}`}
            onClick={() => onSelectVerse?.(verseId)}
            type="button"
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {children}
        </a>
      );
    },
  }), [selectedVerseId, onSelectVerse]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked by the browser.
    }
  };

  return (
    <div className="assistant-message-body">
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) =>
          url.startsWith("verse:") ? url : defaultUrlTransform(url)
        }
      >
        {processed}
      </ReactMarkdown>
      <button
        aria-label="Salin jawaban"
        className="message-copy-button"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "Tersalin" : "Salin"}
      </button>
    </div>
  );
}

export default function Chat({
  onConnectionChange,
  onOpenSources,
  onUpdateCypher,
  onUpdateSkorTM,
  onUpdateSources,
  onSelectVerse,
  profile,
  selectedVerseId,
}) {
  const initialSessionRef = useRef(null);
  if (!initialSessionRef.current) {
    initialSessionRef.current = readSession();
  }

  const [messages, setMessages] = useState(() => initialSessionRef.current.messages);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [agentThought, setAgentThought] = useState(null);
  const [sourceCount, setSourceCount] = useState(() => initialSessionRef.current.sourceCount);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pendingRef = useRef([]);
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(initialSessionRef.current.nextId);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onUpdateCypherRef = useRef(onUpdateCypher);
  const onUpdateSkorTMRef = useRef(onUpdateSkorTM);
  const onUpdateSourcesRef = useRef(onUpdateSources);

  const firstName = profile.name === "Tamu" ? null : profile.name.split(" ")[0];

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
    onUpdateCypherRef.current = onUpdateCypher;
    onUpdateSkorTMRef.current = onUpdateSkorTM;
    onUpdateSourcesRef.current = onUpdateSources;
  }, [onConnectionChange, onUpdateCypher, onUpdateSkorTM, onUpdateSources]);

  useEffect(() => {
    writeSession({
      messages,
      sourceCount,
      nextId: messageIdRef.current,
    });
  }, [messages, sourceCount]);

  useEffect(() => {
    let stopped = false;

    const setConnection = (status) => {
      setConnectionStatus(status);
      onConnectionChangeRef.current?.(status);
    };

    const connect = () => {
      if (stopped) return;
      setConnection("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (stopped || wsRef.current !== ws) return;
        setConnection("connected");
        if (pendingRef.current.length) {
          pendingRef.current.forEach((payload) => ws.send(payload));
          pendingRef.current = [];
          setIsProcessing(true);
          setActiveStep("STEP1");
        }
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          messageIdRef.current += 1;
          setMessages((current) => [
            ...current,
            { id: messageIdRef.current, role: "assistant", text: String(event.data) },
          ]);
          setIsProcessing(false);
          return;
        }

        if (data.error) {
          messageIdRef.current += 1;
          setMessages((current) => [
            ...current,
            {
              id: messageIdRef.current,
              role: "assistant",
              text: typeof data.message === "string" && data.message.trim()
                ? data.message.trim()
                : "Terjadi kesalahan saat memproses pertanyaan. Silakan coba lagi.",
            },
          ]);
          setIsProcessing(false);
          setActiveStep(null);
          setAgentThought(null);
          return;
        }

        if (!data.agent) return;

        const { agent } = data;
        const payload = data.payload || {};
        setActiveStep(agent);
        setIsProcessing(agent !== "STEP5");

        if (typeof payload.thought === "string" && payload.thought.trim()) {
          setAgentThought(payload.thought.trim());
        }

        const thematicScores = payload.tematikskor ?? [];
        const cyphers = payload.list_cypher_frontend ?? payload.list_cypher ?? [];
        if (Array.isArray(cyphers) && cyphers.length) {
          onUpdateCypherRef.current?.(cyphers);
          onUpdateSkorTMRef.current?.(thematicScores);
          persistGraph({ cypher: cyphers, thematicScores });
        }

        const extractedSources = extractSources(payload.gabungan_retriever);
        if (extractedSources.length) {
          setSourceCount(extractedSources.length);
          onUpdateSourcesRef.current?.(extractedSources);
          persistGraph({ sources: extractedSources, sourceCount: extractedSources.length });
        }

        if (agent === "STEP5") {
          messageIdRef.current += 1;
          setMessages((current) => [
            ...current,
            {
              id: messageIdRef.current,
              role: "assistant",
              text: cleanAnswer(payload),
            },
          ]);
          setIsProcessing(false);
          setActiveStep(null);
          setAgentThought(null);
        }
      };

      ws.onclose = () => {
        if (stopped || wsRef.current !== ws) return;
        setConnection("disconnected");
        reconnectRef.current = window.setTimeout(connect, 1800);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isProcessing]);

  const sendQuestion = useCallback((question) => {
    const text = question.trim();
    if (!text || isProcessing) return;

    messageIdRef.current += 1;
    setMessages((current) => [
      ...current,
      { id: messageIdRef.current, role: "user", text },
    ]);
    setInput("");
    setIsProcessing(true);
    setAgentThought(null);
    setSourceCount(0);
    onUpdateSources?.([]);
    onUpdateCypher?.([]);
    onUpdateSkorTM?.([]);
    persistGraph({ sources: [], cypher: [], thematicScores: [], sourceCount: 0 });

    const payload = JSON.stringify({ pertanyaan: text });
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      setActiveStep("STEP1");
      ws.send(payload);
    } else {
      pendingRef.current.push(payload);
      setActiveStep(null);
    }
  }, [isProcessing, onUpdateCypher, onUpdateSkorTM, onUpdateSources]);

  const handleSubmit = (event) => {
    event.preventDefault();
    sendQuestion(input);
  };

  return (
    <div className="chat-experience">
      <div className="chat-heading is-compact">
        <div>
          <h1>Tanya peta</h1>
          {firstName ? <small className="chat-user-name">{firstName}</small> : null}
          <p>Ajukan tema untuk mengisi atlas.</p>
        </div>
        <div className={`compact-connection compact-${connectionStatus}`}>
          <i /> {connectionStatus === "connected" ? "Siap menjawab" : connectionStatus === "connecting" ? "Menyiapkan koneksi" : "Menunggu koneksi"}
        </div>
      </div>

      <div className="messages-scroll" aria-live="polite">
        {!messages.length && !isProcessing ? (
          <div className="conversation-empty">
            <div className="suggestion-grid" aria-label="Contoh pertanyaan">
              {suggestedPrompts.map((prompt) => (
                <button key={prompt} onClick={() => sendQuestion(prompt)} type="button">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="message-list">
          {messages.map((message) => (
            <article className={`message-row message-${message.role}`} key={message.id}>
              {message.role === "assistant" ? <AssistantAvatar /> : null}
              <div className="message-content">
                {message.role === "assistant" ? <span className="message-author">Ruang Jelajah</span> : null}
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <AssistantMessage
                      onSelectVerse={onSelectVerse}
                      selectedVerseId={selectedVerseId}
                      text={message.text}
                    />
                  ) : (
                    message.text
                  )}
                </div>
                {message.role === "assistant" && sourceCount ? (
                  <button className="message-source-link" onClick={onOpenSources} type="button">
                    <BookOpenIcon size={16} /> Lihat {sourceCount} ayat terkait <ChevronRightIcon size={16} />
                  </button>
                ) : null}
              </div>
            </article>
          ))}

          {isProcessing ? (
            <article className="message-row message-assistant processing-row">
              <AssistantAvatar />
              <div className="message-content">
                <span className="message-author">Ruang Jelajah</span>
                <div className="progress-card">
                  {connectionStatus === "connected" ? (
                    <>
                      <div className="progress-card-title"><span className="thinking-dots"><i /><i /><i /></span>{progressLabels[activeStep] || "Menyiapkan jawaban"}</div>
                      {agentThought ? (
                        <p className="agent-thought">
                          <span className="agent-thought-label">Langkah agent:</span> {agentThought}
                        </p>
                      ) : null}
                      <div className="progress-track">
                        {Object.keys(progressLabels).map((step) => (
                          <span className={step === activeStep ? "active" : ""} key={step} />
                        ))}
                      </div>
                      <small>Biasanya selesai dalam kurang dari satu menit.</small>
                    </>
                  ) : (
                    <>
                      <div className="progress-card-title">Menunggu koneksi ke server…</div>
                      <small>Pertanyaan tersimpan dan akan dikirim otomatis.</small>
                    </>
                  )}
                </div>
              </div>
            </article>
          ) : null}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="composer-area">
        {connectionStatus !== "connected" ? (
          <p className="queue-notice">Pertanyaan akan dikirim otomatis saat koneksi kembali.</p>
        ) : null}
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Pertanyaan tentang Al-Qur'an"
            disabled={isProcessing}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendQuestion(input);
              }
            }}
            placeholder="Tanyakan tema untuk memetakan ayat…"
            rows="2"
            value={input}
          />
          <button aria-label="Kirim pertanyaan" className="send-button" disabled={!input.trim() || isProcessing} type="submit">
            <SendIcon size={20} />
          </button>
        </form>
        <p className="composer-hint">Enter untuk mengirim · Shift + Enter untuk baris baru</p>
      </div>
    </div>
  );
}

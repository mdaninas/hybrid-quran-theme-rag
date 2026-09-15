import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MAX_QUESTION_LENGTH, SESSION_KEY, WS_URL } from "../constants";
import { emptyEvidence, normalizeEvidence, readMessages, saveEvidence, writeStorage } from "../session";
import { BookOpenIcon, ChevronRightIcon, SendIcon } from "./Icons";

const suggestions = ["Apa makna sabar dalam Al-Qur'an?", "Ayat tentang ketenangan hati", "Bagaimana Al-Qur'an menjelaskan keadilan?"];
const progressLabels = {
  STEP1: "Memahami pertanyaanmu", STEP2: "Menemukan tema yang relevan",
  STEP3: "Menelusuri hubungan ayat", STEP4: "Mengumpulkan sumber ayat",
  STEP5: "Menyusun jawaban dan sumber",
};

function AssistantMessage({ message, selectedVerseId, onSelectVerse }) {
  const [copyStatus, setCopyStatus] = useState("Salin");
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const components = useMemo(() => ({
    a: ({ href, children }) => {
      if (href?.startsWith("verse:")) {
        const verseId = href.slice(6);
        if (!message.evidence.sources.some((s) => s.id_surah_ayat === verseId)) return <span>{children}</span>;
        return <button className={`verse-citation${selectedVerseId === verseId ? " verse-citation-active" : ""}`}
          onClick={() => onSelectVerse(verseId, message.evidence)} type="button">{children}</button>;
      }
      return <a href={href} rel="noopener noreferrer" target="_blank">{children}</a>;
    },
  }), [message.evidence, selectedVerseId, onSelectVerse]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopyStatus("Tersalin");
    } catch {
      setCopyStatus("Gagal menyalin");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyStatus("Salin"), 1800);
  };
  return <div className="assistant-message-body">
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}
      urlTransform={(url) => /^verse:\d{1,3}:\d{1,3}$/.test(url) ? url : defaultUrlTransform(url)}>
      {message.text}
    </ReactMarkdown>
    <button aria-label="Salin jawaban" className="message-copy-button" onClick={copy} type="button">{copyStatus}</button>
  </div>;
}

export default function Chat({ onConnectionChange, onOpenSources, onUpdateEvidence, onSelectVerse, profile, selectedVerseId }) {
  const [messages, setMessages] = useState(readMessages);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [thought, setThought] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const wsRef = useRef(null);
  const activeRef = useRef(null);
  const evidenceRef = useRef(emptyEvidence());
  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const followScroll = useRef(true);
  const callbacks = useRef({ onConnectionChange, onUpdateEvidence });
  useEffect(() => { callbacks.current = { onConnectionChange, onUpdateEvidence }; }, [onConnectionChange, onUpdateEvidence]);

  const finish = useCallback((reason = "") => {
    window.clearTimeout(timerRef.current);
    activeRef.current = null;
    setProcessing(false);
    setActiveStep(null);
    setThought("");
    if (reason) setError(reason);
  }, []);

  useEffect(() => {
    setStorageError(!writeStorage(SESSION_KEY, messages.slice(-40)));
  }, [messages]);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer;
    let attempts = 0;
    const setStatus = (status) => {
      setConnection(status);
      callbacks.current.onConnectionChange(status);
    };
    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      let socket;
      try {
        socket = new WebSocket(WS_URL);
      } catch {
        setStatus("disconnected");
        setError("Koneksi belum dapat dibuka. Periksa alamat layanan.");
        return;
      }
      wsRef.current = socket;
      socket.onopen = () => {
        if (stopped || wsRef.current !== socket) return;
        attempts = 0;
        setStatus("connected");
      };
      socket.onmessage = (event) => {
        if (stopped || wsRef.current !== socket || !activeRef.current) return;
        let data;
        try { data = JSON.parse(event.data); } catch { finish("Respons server tidak valid. Silakan coba lagi."); return; }
        if (!data || typeof data !== "object") { finish("Respons server tidak valid."); return; }
        if (data.request_id && data.request_id !== activeRef.current.id) return;
        if (data.error || data.type === "error") { finish(data.message || "Pertanyaan gagal diproses."); return; }
        if (data.type === "cancelled") { finish("Pemrosesan dihentikan."); return; }
        if (data.type === "done") { finish("Server selesai tanpa jawaban. Silakan coba lagi."); return; }
        if (data.type !== "step" || !progressLabels[data.agent]) return;
        const payload = data.payload || {};
        setActiveStep(data.agent);
        setThought(typeof payload.thought === "string" ? payload.thought : "");
        if (data.agent === "STEP4") {
          evidenceRef.current = normalizeEvidence(payload);
          callbacks.current.onUpdateEvidence(evidenceRef.current);
          saveEvidence(evidenceRef.current);
          setActiveStep("STEP5");
        }
        if (data.agent === "STEP5") {
          if (typeof payload.jawaban_final !== "string" || !payload.jawaban_final.trim()) {
            finish("Jawaban belum tersedia. Silakan coba lagi."); return;
          }
          const message = { id: crypto.randomUUID(), role: "assistant", text: payload.jawaban_final,
            evidence: evidenceRef.current, requestId: activeRef.current.id };
          setMessages((current) => [...current, message].slice(-40));
          finish();
        }
      };
      socket.onerror = () => { /* onclose handles recovery once, including failed handshakes. */ };
      socket.onclose = () => {
        if (stopped || wsRef.current !== socket) return;
        setStatus("disconnected");
        if (activeRef.current) finish("Koneksi terputus saat memproses. Coba kirim ulang pertanyaan.");
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(timerRef.current);
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket) { socket.onclose = null; socket.onmessage = null; socket.onopen = null; socket.close(); }
    };
  }, [finish]);

  useEffect(() => {
    if (followScroll.current) bottomRef.current?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end",
    });
  }, [messages, processing, error]);

  const sendQuestion = (question) => {
    const text = question.trim();
    if (!text || activeRef.current) return;
    if (text.length > MAX_QUESTION_LENGTH) { setError(`Pertanyaan maksimal ${MAX_QUESTION_LENGTH} karakter.`); return; }
    const socket = wsRef.current;
    if (socket?.readyState !== WebSocket.OPEN) { setError("Koneksi belum siap. Pertanyaan tetap tersimpan di kolom input."); setInput(text); return; }
    const id = crypto.randomUUID();
    activeRef.current = { id, text };
    evidenceRef.current = emptyEvidence();
    followScroll.current = true;
    setError(""); setProcessing(true); setActiveStep("STEP1"); setThought("");
    // Keep the question available for retry if the connection fails.
    try { socket.send(JSON.stringify({ type: "ask", request_id: id, pertanyaan: text })); }
    catch { finish("Pertanyaan gagal dikirim. Silakan coba lagi."); return; }
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, evidence: emptyEvidence() }].slice(-40));
    setInput("");
    callbacks.current.onUpdateEvidence(emptyEvidence());
    saveEvidence(emptyEvidence());
    timerRef.current = window.setTimeout(() => {
      if (!activeRef.current) return;
      finish("Respons terlalu lama. Silakan coba lagi.");
      socket.close();
    }, 150000);
  };
  const stop = () => {
    const active = activeRef.current;
    if (active && wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: "cancel", request_id: active.id })); }
      catch { /* Closing the socket below also cancels the server task. */ }
    }
    finish("Pemrosesan dihentikan.");
    // A new connection prevents a new question racing the server's cancellation.
    wsRef.current?.close();
  };
  const clear = () => {
    setMessages([]); setError(""); setInput("");
    callbacks.current.onUpdateEvidence(emptyEvidence()); saveEvidence(emptyEvidence());
  };
  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.text;

  return <div className="chat-experience">
    <div className="chat-heading is-compact">
      <div><h1>Tanya peta</h1><p>{profile.name === "Tamu" ? "Ajukan tema untuk menelusuri ayat." : `Selamat menjelajah, ${profile.name.split(" ")[0]}.`}</p></div>
      <button className="message-copy-button" type="button" disabled={processing || !messages.length} onClick={clear}>Percakapan baru</button>
    </div>
    <div className="messages-scroll" ref={scrollRef} role="log" aria-label="Percakapan" aria-live="polite"
      onScroll={() => { const el = scrollRef.current; followScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }}>
      {!messages.length && <div className="conversation-empty"><div className="suggestion-grid" aria-label="Contoh pertanyaan">
        {suggestions.map((prompt) => <button key={prompt} onClick={() => sendQuestion(prompt)} type="button">{prompt}</button>)}
      </div></div>}
      <div className="message-list">
        {messages.map((message) => <article className={`message-row message-${message.role}`} key={message.id}>
          {message.role === "assistant" && <span className="assistant-avatar"><BookOpenIcon size={16} /></span>}
          <div className="message-content">
            {message.role === "assistant" && <span className="message-author">Ruang Jelajah</span>}
            <div className="message-bubble">{message.role === "assistant"
              ? <AssistantMessage message={message} selectedVerseId={selectedVerseId} onSelectVerse={onSelectVerse} /> : message.text}</div>
            {message.role === "assistant" && message.evidence.sources.length > 0 && <button className="message-source-link" onClick={() => onOpenSources(message.evidence)} type="button">
              <BookOpenIcon size={16} /> Lihat {message.evidence.sources.length} ayat terkait <ChevronRightIcon size={16} />
            </button>}
          </div>
        </article>)}
        {processing && <article className="message-row message-assistant processing-row">
          <span className="assistant-avatar"><BookOpenIcon size={16} /></span>
          <div className="progress-card" role="status">
            <div className="progress-card-title"><span className="thinking-dots"><i /><i /><i /></span>{progressLabels[activeStep] || "Menyiapkan jawaban"}</div>
            {thought && <p className="agent-thought">{thought}</p>}
            <div className="progress-track">{Object.keys(progressLabels).map((step) => <span className={step === activeStep ? "active" : ""} key={step} />)}</div>
            <button className="message-copy-button" type="button" onClick={stop}>Hentikan</button>
          </div>
        </article>}
      </div>
      {error && <div className="chat-error" role="alert"><p>{error}</p>{lastQuestion && !processing && <button type="button" className="message-copy-button" disabled={connection !== "connected"} onClick={() => sendQuestion(lastQuestion)}>Coba lagi</button>}</div>}
      <div ref={bottomRef} />
    </div>
    <div className="composer-area">
      {storageError && <p className="queue-notice" role="status">Riwayat hanya tersedia selama halaman ini terbuka; penyimpanan browser tidak tersedia atau penuh.</p>}
      {connection !== "connected" && <p className="queue-notice" role="status">Menghubungkan ke server… Anda dapat menulis pertanyaan sambil menunggu.</p>}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); sendQuestion(input); }}>
        <textarea aria-label="Pertanyaan tentang Al-Qur'an" aria-describedby="composer-hint" disabled={processing}
          maxLength={MAX_QUESTION_LENGTH} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendQuestion(input); } }}
          placeholder="Tanyakan tema untuk memetakan ayat…" rows="2" value={input} />
        <button aria-label="Kirim pertanyaan" className="send-button" disabled={!input.trim() || processing || connection !== "connected"} type="submit"><SendIcon size={20} /></button>
      </form>
      <p className="composer-hint" id="composer-hint">Enter untuk mengirim · Shift + Enter untuk baris baru <span>{input.length}/{MAX_QUESTION_LENGTH}</span></p>
    </div>
  </div>;
}

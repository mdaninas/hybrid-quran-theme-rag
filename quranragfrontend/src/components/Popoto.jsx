import { useEffect, useRef, useState } from "react";
import { Network } from "vis-network/esnext";
import { MaximizeIcon, RefreshIcon } from "./Icons";

function tooltip(node) {
  const element = document.createElement("div");
  element.className = "graph-tooltip";
  const title = document.createElement("strong");
  title.textContent = node.label;
  element.append(title);
  if (node.arabic) {
    const arabic = document.createElement("p");
    arabic.className = "graph-tooltip-arabic";
    arabic.lang = "ar"; arabic.dir = "rtl"; arabic.textContent = node.arabic;
    element.append(arabic);
  }
  if (node.translation) {
    const text = document.createElement("p");
    text.className = "graph-tooltip-translation";
    text.textContent = node.translation;
    element.append(text);
  }
  return element;
}

function wrapLabel(label) {
  return String(label || "").match(/.{1,23}(?:\s|$)|.{1,23}/g)?.slice(0, 4).map((s) => s.trim()).join("\n") || "";
}

export default function ThematicGraph({ graphs, selectedVerseId, onSelectVerse }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const canvasRef = useRef(null);
  const networkRef = useRef(null);
  const onSelectRef = useRef(onSelectVerse);
  const index = Math.min(selectedIndex, graphs.length - 1);
  const graph = graphs[index];
  useEffect(() => { onSelectRef.current = onSelectVerse; }, [onSelectVerse]);

  useEffect(() => {
    if (!selectedVerseId) return;
    setSelectedIndex((current) => {
      const includes = (g) => g.nodes.some((n) => n.verseId === selectedVerseId);
      if (graphs[current] && includes(graphs[current])) return current;
      const match = graphs.findIndex(includes);
      return match >= 0 ? match : current;
    });
  }, [graphs, selectedVerseId]);

  useEffect(() => {
    if (!canvasRef.current || !graph) return;
    setError("");
    let network;
    let resizeObserver;
    try {
      network = new Network(canvasRef.current, {
        nodes: graph.nodes.map((node) => ({ ...node, title: tooltip(node), label: wrapLabel(node.label) })),
        edges: graph.edges.map((edge) => ({ ...edge, label: undefined, title: undefined })),
      }, {
        layout: { randomSeed: 17 },
        nodes: { shape: "box", margin: 12, font: { color: "#ffffff", size: 13, face: "IBM Plex Sans" }, borderWidth: 2 },
        groups: {
          theme: { color: { background: "#1e2933", border: "#0f1720", highlight: { background: "#334756", border: "#c45c26" } } },
          verse: { shape: "dot", size: 19, color: { background: "#c45c26", border: "#9a451c", highlight: { background: "#e17e43", border: "#643118" } }, font: { color: "#65331b" } },
          surah: { color: { background: "#386a61", border: "#245047", highlight: { background: "#4a8277", border: "#c45c26" } } },
        },
        edges: { arrows: { to: { enabled: true, scaleFactor: 0.6 } }, width: 1.7, color: "#8a9aa3", smooth: { type: "continuous" } },
        interaction: { hover: true, keyboard: { enabled: true, bindToWindow: false } },
        physics: { solver: "forceAtlas2Based", forceAtlas2Based: { gravitationalConstant: -45, springLength: 100, avoidOverlap: 0.5 }, stabilization: { iterations: 160 } },
      });
      networkRef.current = network;
      network.once("stabilizationIterationsDone", () => {
        network.setOptions({ physics: false }); network.fit({ maxZoomLevel: 1.2 });
      });
      network.on("click", (event) => {
        const node = graph.nodes.find((n) => n.id === event.nodes[0]);
        if (node?.verseId) onSelectRef.current(node.verseId);
      });
      resizeObserver = new ResizeObserver(() => { network.redraw(); network.fit({ maxZoomLevel: 1.2 }); });
      resizeObserver.observe(canvasRef.current);
    } catch {
      setError("Peta belum berhasil digambar. Ayat sumber tetap tersedia melalui tombol Ayat.");
    }
    return () => { resizeObserver?.disconnect(); network?.destroy(); networkRef.current = null; };
  }, [graph, revision]);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    const node = graph?.nodes.find((n) => n.verseId === selectedVerseId);
    if (node) { network.selectNodes([node.id]); network.focus(node.id, { scale: 1.1, animation: false }); }
    else network.unselectAll();
  }, [selectedVerseId, graph, revision]);

  return <div className="graph-workspace">
    <div className="graph-toolbar"><div className="graph-tool-actions">
      <button aria-label="Susun ulang peta" className="icon-button toolbar-button" onClick={() => setRevision((v) => v + 1)} type="button"><RefreshIcon size={16} /></button>
      <button aria-label="Tampilkan seluruh peta" className="icon-button toolbar-button" onClick={() => networkRef.current?.fit({ maxZoomLevel: 1.2 })} type="button"><MaximizeIcon size={16} /></button>
    </div></div>
    <div className="reference-selector" aria-label="Pilih hasil tematik">
      {graphs.map((g, i) => <button className={i === index ? "reference-chip active" : "reference-chip"} aria-pressed={i === index}
        key={`${g.path}-${i}`} onClick={() => setSelectedIndex(i)} type="button" title={g.path}>
        Jalur {i + 1} <small>{Number.isFinite(g.score) ? g.score.toFixed(3) : "–"}</small>
      </button>)}
    </div>
    <p className="graph-path">{graph?.path}</p>
    {error && <div className="graph-error" role="alert">{error}</div>}
    <div className="graph-canvas-wrap">
      <div ref={canvasRef} className="graph-canvas" role="img" aria-label={`Peta ${graph?.path || "tematik"}. Rincian teks tersedia di panel Ayat.`} />
      {!graph?.nodes.length && <div className="graph-rendering">Belum ada ayat sumber pada jalur ini.</div>}
      <div className="graph-legend"><span><i className="legend-dot theme" /> Tema</span><span><i className="legend-dot verse" /> Ayat</span><span><i className="legend-dot surah" /> Surah</span></div>
    </div>
    <p className="graph-caption">{graph?.nodes.length || 0} simpul · {graph?.edges.length || 0} relasi · Skor menunjukkan kemiripan tema, bukan kepastian jawaban.</p>
  </div>;
}

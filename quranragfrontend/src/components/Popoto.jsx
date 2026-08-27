import { Component, useEffect, useMemo, useRef, useState } from "react";
import NeoVis, {
  NEOVIS_ADVANCED_CONFIG,
  NeoVisEvents,
} from "neovis.js";
import { GRAPH_CONFIG_URL, SESSION_NEO4J_CONFIG_KEY } from "../constants";
import {
  MaximizeIcon,
  RefreshIcon,
} from "./Icons";

function readCachedNeo4jConfig() {
  try {
    const raw = sessionStorage.getItem(SESSION_NEO4J_CONFIG_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.uri && data?.user && data?.password) return data;
  } catch {
    // Browser may block sessionStorage in restricted contexts.
  }
  return null;
}

function writeCachedNeo4jConfig(config) {
  try {
    sessionStorage.setItem(SESSION_NEO4J_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Browser may block sessionStorage in restricted contexts.
  }
}

function graphConfigErrorMessage(response, error) {
  if (response?.status === 403) {
    return (
      "Akses konfigurasi peta ditolak server. "
      + "Pastikan port frontend diizinkan (GRAPH_CONFIG_ORIGINS) atau token graph-config benar."
    );
  }
  if (response && !response.ok) {
    return `Gagal mengambil konfigurasi peta (HTTP ${response.status}). Pastikan backend berjalan.`;
  }
  if (error?.name === "TypeError") {
    return "Gagal menghubungi server. Pastikan backend berjalan di port 8000.";
  }
  return "Gagal mengambil konfigurasi peta dari server. Pastikan backend berjalan.";
}

function formatScore(score) {
  const value = Number(score);
  if (Number.isNaN(value)) return score || "–";
  return value.toFixed(3);
}

function normalizeScoreBars(scores) {
  if (!Array.isArray(scores) || !scores.length) return [];
  const values = scores.map((score) => Number(score)).filter((value) => !Number.isNaN(value));
  if (!values.length) return scores.map(() => 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return scores.map((score) => {
    const value = Number(score);
    if (Number.isNaN(value)) return 0;
    if (min === max) return 57.5;
    return 15 + ((value - min) / (max - min)) * 85;
  });
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function wrapNodeLabel(value, lineLength = 18, maxLines = 3) {
  const words = toTitleCase(value)
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "Tanpa Label";

  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= lineLength || !currentLine) {
      currentLine = candidate;
      return;
    }
    lines.push(currentLine);
    currentLine = word;
  });
  if (currentLine) lines.push(currentLine);

  if (lines.length <= maxLines) return lines.join("\n");
  const visibleLines = lines.slice(0, maxLines);
  visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1].slice(0, lineLength - 1)}…`;
  return visibleLines.join("\n");
}

function nodeLabel(node, property, lineLength, maxLines) {
  return wrapNodeLabel(node?.properties?.[property], lineLength, maxLines);
}

const CP1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function arabicCharacterCount(value) {
  return Array.from(value || "").filter((character) => /[\u0600-\u06ff]/.test(character)).length;
}

function normalizeArabic(value) {
  const original = String(value || "");
  if (!original || arabicCharacterCount(original) > 0) return original;

  const bytes = [];
  for (const character of original) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
    } else if (CP1252_BYTES.has(codePoint)) {
      bytes.push(CP1252_BYTES.get(codePoint));
    } else {
      return original;
    }
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    return arabicCharacterCount(decoded) > arabicCharacterCount(original) ? decoded : original;
  } catch {
    return original;
  }
}

function clippedText(value, limit = 360) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}

function createTooltipElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function graphNodeTooltip(node, typeLabel = "Detail", fields = []) {
  const tooltip = document.createElement("div");
  tooltip.className = "graph-tooltip";
  tooltip.append(createTooltipElement("span", "graph-tooltip-type", typeLabel));

  fields.forEach(({ label, property }) => {
    const value = node?.properties?.[property];
    if (value === undefined || value === null || value === "") return;
    const row = document.createElement("p");
    row.className = "graph-tooltip-row";
    row.append(createTooltipElement("strong", "", `${label}: `));
    row.append(document.createTextNode(clippedText(value, 180)));
    tooltip.append(row);
  });

  return tooltip;
}

function verseTooltip(node) {
  const properties = node?.properties || {};
  const tooltip = document.createElement("div");
  tooltip.className = "graph-tooltip graph-verse-tooltip";
  tooltip.append(createTooltipElement("span", "graph-tooltip-type", "Ayat Al-Qur'an"));
  tooltip.append(createTooltipElement("strong", "graph-tooltip-title", properties.id || "Ayat"));

  const arabic = normalizeArabic(properties.ayat_arab);
  if (arabic) {
    const arabicText = createTooltipElement("p", "graph-tooltip-arabic", clippedText(arabic, 420));
    arabicText.lang = "ar";
    arabicText.dir = "rtl";
    tooltip.append(arabicText);
  }

  if (properties.ayat_indonesia) {
    tooltip.append(createTooltipElement("p", "graph-tooltip-translation", clippedText(properties.ayat_indonesia, 320)));
  }

  return tooltip;
}

function boxNodeConfig({ property, background, border, typeLabel, tooltipFields = [], lineLength = 18, maxLines = 3 }) {
  return {
    [NEOVIS_ADVANCED_CONFIG]: {
      function: {
        label: (node) => nodeLabel(node, property, lineLength, maxLines),
        title: (node) => graphNodeTooltip(node, typeLabel, tooltipFields),
      },
      static: {
        shape: "box",
        borderWidth: 1.8,
        color: {
          background,
          border,
          highlight: { background, border: "#c45c26" },
          hover: { background, border: "#c45c26" },
        },
        font: {
          color: "#ffffff",
          face: '"IBM Plex Sans", "Segoe UI", sans-serif',
          size: 13,
          strokeWidth: 0,
          multi: false,
        },
        margin: { top: 9, right: 12, bottom: 9, left: 12 },
        widthConstraint: { minimum: 74, maximum: 190 },
        shadow: { enabled: true, color: "rgba(30, 41, 51, .16)", size: 8, x: 0, y: 3 },
      },
    },
  };
}

function findAyatNode(viz, verseId) {
  if (!viz?.nodes?.get || verseId == null || verseId === "") return null;
  const targetId = String(verseId);
  const match = viz.nodes.get({
    filter: (node) =>
      node.raw?.labels?.includes("Ayat") &&
      String(node.raw?.properties?.id ?? "") === targetId,
  })[0] ?? null;
  return match;
}

function highlightVerseNode(viz, verseId) {
  if (!viz?.network) return;
  const matchingNode = findAyatNode(viz, verseId);
  if (!matchingNode) {
    viz.network.unselectAll();
    return;
  }
  viz.network.selectNodes([matchingNode.id]);
  viz.network.focus(matchingNode.id, {
    scale: 1.05,
    animation: { duration: 280, easingFunction: "easeInOutQuad" },
  });
}

class GraphErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Graph render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="graph-error" role="alert">
          Peta gagal ditampilkan. Muat ulang halaman atau coba pertanyaan lain.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NeovisGraph({
  cypherList = [],
  skorTM = [],
  selectedVerseId = null,
  onSelectVerse,
}) {
  const vizRef = useRef(null);
  const skipInitialUpdateRef = useRef(false);
  const onSelectVerseRef = useRef(onSelectVerse);
  const selectedVerseIdRef = useRef(selectedVerseId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [graphError, setGraphError] = useState("");
  const [graphStats, setGraphStats] = useState(null);
  const [isRendering, setIsRendering] = useState(false);
  const [neo4jConfig, setNeo4jConfig] = useState(null);
  const [configError, setConfigError] = useState("");

  onSelectVerseRef.current = onSelectVerse;
  selectedVerseIdRef.current = selectedVerseId;

  const hasQueries = Array.isArray(cypherList) && cypherList.length > 0;

  useEffect(() => {
    if (!hasQueries) {
      setNeo4jConfig(null);
      setConfigError("");
      return undefined;
    }

    let cancelled = false;
    setConfigError("");

    const cachedConfig = readCachedNeo4jConfig();
    if (cachedConfig) {
      setNeo4jConfig(cachedConfig);
      return () => {
        cancelled = true;
      };
    }

    setNeo4jConfig(null);

    fetch(GRAPH_CONFIG_URL)
      .then((response) => {
        if (!response.ok) {
          throw Object.assign(new Error("graph-config unavailable"), { response });
        }
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const uri = data?.uri;
        const user = data?.user;
        const password = data?.password;
        if (!uri || !user || !password) {
          setConfigError("Konfigurasi peta belum tersedia dari server.");
          return;
        }
        const config = { uri, user, password };
        writeCachedNeo4jConfig(config);
        setNeo4jConfig(config);
      })
      .catch((error) => {
        if (!cancelled) {
          setConfigError(graphConfigErrorMessage(error.response, error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasQueries]);

  useEffect(() => {
    if (!hasQueries || !neo4jConfig) return undefined;

    setGraphError("");
    setGraphStats(null);
    setIsRendering(true);
    const config = {
      containerId: "viz",
      neo4j: {
        serverUrl: neo4jConfig.uri,
        serverUser: neo4jConfig.user,
        serverPassword: neo4jConfig.password,
        driverConfig: {
          // Neo4j's relationship IDs exceed JavaScript's safe integer range.
          // Keeping lossless integers prevents every edge ID becoming Infinity.
          disableLosslessIntegers: false,
        },
      },
      labels: {
        Surah: boxNodeConfig({
          property: "nama_latin",
          background: "#2f6f86",
          border: "#214f61",
          typeLabel: "Surah",
          tooltipFields: [
            { label: "Nomor", property: "id" },
            { label: "Nama", property: "nama_latin" },
          ],
        }),
        ArtiNama: boxNodeConfig({
          property: "arti",
          background: "#5c6b75",
          border: "#3d4a52",
          typeLabel: "Arti nama surah",
          tooltipFields: [{ label: "Arti", property: "arti" }],
        }),
        Tempat: boxNodeConfig({
          property: "lokasi",
          background: "#ad6853",
          border: "#854b3b",
          typeLabel: "Tempat turun",
          tooltipFields: [{ label: "Lokasi", property: "lokasi" }],
        }),
        Ayat: {
          [NEOVIS_ADVANCED_CONFIG]: {
            function: {
              label: (node) => nodeLabel(node, "id", 12, 2),
              title: verseTooltip,
            },
            static: {
              shape: "circle",
              size: 29,
              borderWidth: 2,
              color: {
                background: "#c45c26",
                border: "#9a451c",
                highlight: { background: "#d06a32", border: "#c45c26" },
                hover: { background: "#d06a32", border: "#c45c26" },
              },
              font: { color: "#ffffff", face: '"IBM Plex Sans", "Segoe UI", sans-serif', size: 12, strokeWidth: 0 },
              shadow: { enabled: true, color: "rgba(30, 41, 51, .16)", size: 8, x: 0, y: 3 },
            },
          },
        },
        Tematik: boxNodeConfig({
          property: "nama",
          background: "#1e2933",
          border: "#0f1720",
          typeLabel: "Tema",
          tooltipFields: [{ label: "Nama", property: "nama" }],
          lineLength: 20,
          maxLines: 3,
        }),
      },
      visConfig: {
        layout: {
          improvedLayout: true,
          randomSeed: 17,
          hierarchical: {
            enabled: false,
          },
        },
        nodes: {
          chosen: true,
          font: { strokeWidth: 0, strokeColor: "transparent" },
        },
        edges: {
          arrows: { to: { enabled: true, scaleFactor: 0.72 } },
          arrowStrikethrough: false,
          color: {
            color: "#8a9aa3",
            highlight: "#c45c26",
            hover: "#c45c26",
            inherit: false,
            opacity: 1,
          },
          smooth: { enabled: true, type: "cubicBezier", forceDirection: "horizontal", roundness: 0.35 },
          width: 2.2,
          hoverWidth: 0.8,
          selectionWidth: 1.2,
        },
        interaction: {
          hover: true,
          navigationButtons: true,
          keyboard: true,
          zoomView: true,
          dragNodes: true,
          zoomMin: 0.25,
          zoomMax: 1.5,
        },
        physics: {
          enabled: true,
          forceAtlas2Based: {
            gravitationalConstant: -50,
            centralGravity: 0.01,
            springLength: 100,
            springConstant: 0.08,
            damping: 0.4,
            avoidOverlap: 0.5,
          },
          stabilization: { enabled: true, iterations: 200, fit: true },
        },
      },
    };

    let handleNetworkClick;
    let clickListenerAttached = false;

    try {
      const viz = new NeoVis(config);
      vizRef.current = viz;
      skipInitialUpdateRef.current = true;

      handleNetworkClick = (event) => {
        if (!event.nodes?.length || !viz.nodes?.get) return;
        const nodeId = event.nodes[0];
        const nodeData = viz.nodes.get(nodeId);
        if (!nodeData?.raw?.labels?.includes("Ayat")) return;
        const verseId = nodeData.raw?.properties?.id;
        if (verseId != null && verseId !== "") {
          onSelectVerseRef.current?.(String(verseId));
        }
      };

      viz.registerOnEvent(NeoVisEvents.CompletionEvent, () => {
        if (vizRef.current !== viz) return;

        if (!clickListenerAttached && viz.network?.on) {
          viz.network.on("click", handleNetworkClick);
          clickListenerAttached = true;
        }

        const nodes = viz.nodes?.length || 0;
        const edges = viz.edges?.length || 0;
        setGraphStats({ nodes, edges });
        setIsRendering(false);

        if (nodes > 1 && edges === 0) {
          setGraphError("Node ditemukan, tetapi relasinya belum berhasil divisualisasikan.");
          return;
        }

        setGraphError("");
        const fitNetwork = () => {
          if (vizRef.current === viz) {
            viz.network?.fit?.({
              animation: { duration: 320, easingFunction: "easeInOutQuad" },
              maxZoom: 1.15,
            });
          }
        };
        const stopPhysics = () => {
          if (vizRef.current === viz) {
            viz.network?.setOptions?.({ physics: { enabled: false } });
          }
        };
        viz.network?.once?.("stabilizationIterationsDone", () => {
          stopPhysics();
          fitNetwork();
        });
        window.requestAnimationFrame(fitNetwork);

        if (selectedVerseIdRef.current) {
          highlightVerseNode(viz, selectedVerseIdRef.current);
        }
      });

      viz.registerOnEvent(NeoVisEvents.ErrorEvent, () => {
        if (vizRef.current !== viz) return;
        setGraphError("Peta belum berhasil mengambil relasi dari Neo4j.");
        setIsRendering(false);
      });

      viz.renderWithCypher(cypherList[0]);
      setSelectedIndex(0);
    } catch {
      setGraphError("Peta belum berhasil dimuat. Coba beberapa saat lagi.");
      setIsRendering(false);
    }

    return () => {
      try {
        if (handleNetworkClick && clickListenerAttached) {
          vizRef.current?.network?.off?.("click", handleNetworkClick);
        }
        vizRef.current?.clearNetwork?.();
        vizRef.current?.network?.destroy?.();
      } catch {
        // The network may already be disposed by NeoVis.
      }
      vizRef.current = null;
      skipInitialUpdateRef.current = false;
    };
    // cypherList updates are handled by the effect below via renderWithCypher.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only when Neo4j config changes
  }, [hasQueries, neo4jConfig]);

  useEffect(() => {
    if (!vizRef.current || !hasQueries || !neo4jConfig) return;
    if (skipInitialUpdateRef.current) {
      skipInitialUpdateRef.current = false;
      return;
    }
    const nextIndex = Math.min(selectedIndex, cypherList.length - 1);
    const query = cypherList[nextIndex] || cypherList[0];
    if (!query) return;
    try {
      setGraphError("");
      setGraphStats(null);
      setIsRendering(true);
      vizRef.current.renderWithCypher(query);
    } catch {
      setGraphError("Peta belum berhasil diperbarui.");
      setIsRendering(false);
    }
  }, [cypherList, hasQueries, neo4jConfig, selectedIndex]);

  useEffect(() => {
    if (!vizRef.current?.network || isRendering) return;
    highlightVerseNode(vizRef.current, selectedVerseId);
  }, [selectedVerseId, isRendering]);

  const scoreBarWidths = useMemo(() => normalizeScoreBars(skorTM), [skorTM]);

  if (configError) {
    return (
      <div className="graph-error" role="alert">
        {configError}
      </div>
    );
  }

  if (!neo4jConfig) {
    return (
      <div className="graph-loading">
        <strong>Menyiapkan koneksi peta…</strong>
      </div>
    );
  }

  const renderReference = (index) => {
    if (isRendering || index === selectedIndex) return;
    setSelectedIndex(index);
    setGraphError("");
    setIsRendering(true);
  };

  const fitGraph = () => vizRef.current?.network?.fit?.({
    animation: { duration: 280 },
    maxZoom: 1.15,
  });
  const refreshGraph = () => {
    if (isRendering) return;
    const query = cypherList[selectedIndex] || cypherList[0];
    if (query) {
      setGraphError("");
      setGraphStats(null);
      setIsRendering(true);
      vizRef.current?.renderWithCypher?.(query);
    }
  };

  return (
    <GraphErrorBoundary>
      <div className="graph-workspace">
        <div className="graph-toolbar">
          <div className="graph-tool-actions">
            <button aria-label="Muat ulang peta" className="icon-button toolbar-button" disabled={isRendering} onClick={refreshGraph} title="Muat ulang" type="button"><RefreshIcon size={16} /></button>
            <button aria-label="Tampilkan seluruh peta" className="icon-button toolbar-button" onClick={fitGraph} title="Tampilkan semua" type="button"><MaximizeIcon size={16} /></button>
          </div>
        </div>

        <div className="reference-selector" aria-label="Pilih hasil tematik">
          {cypherList.map((_, index) => (
            <button
              className={selectedIndex === index ? "reference-chip active" : "reference-chip"}
              disabled={isRendering}
              key={index}
              onClick={() => renderReference(index)}
              type="button"
            >
              Jalur {index + 1}
              {skorTM[index] !== undefined ? (
                <span
                  aria-label={`Kemiripan tematik ${formatScore(skorTM[index])}`}
                  className="reference-score"
                  title={`Kemiripan tematik ${formatScore(skorTM[index])}`}
                >
                  <i style={{ width: `${scoreBarWidths[index] ?? 0}%` }} />
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {graphError ? <div className="graph-error" role="alert">{graphError}</div> : null}
        <p className="graph-columns">Surah · Tema · Ayat</p>
        <div className="graph-canvas-wrap">
          <div id="viz" className="graph-canvas" />
          {isRendering ? <div className="graph-rendering"><span /> Menyusun relasi…</div> : null}
          <div className="graph-legend">
            <span><i className="legend-dot theme" /> Tema</span>
            <span><i className="legend-dot verse" /> Ayat</span>
            <span><i className="legend-dot surah" /> Surah</span>
          </div>
        </div>
        {graphStats ? (
          <p className="graph-caption">{graphStats.nodes} simpul · {graphStats.edges} relasi · Jalur penelusuran paling relevan</p>
        ) : null}
      </div>
    </GraphErrorBoundary>
  );
}

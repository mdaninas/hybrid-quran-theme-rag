import { expect, it } from "vitest";
import { normalizeEvidence } from "./session";

it("filters corrupt nested graph data and normalizes optional source fields", () => {
  const result = normalizeEvidence({
    graphs: [{ path: "A", nodes: [null], edges: [] }],
    sources: [{ id_surah_ayat: "2:153", ayat_indonesia: "Fixture", themes: "not an array", ayat_arab: {} }],
  });
  expect(result.graphs).toEqual([]);
  expect(result.sources[0].themes).toEqual([]);
  expect(result.sources[0].ayat_arab).toBe("");
});

it("removes repeated source IDs when restoring browser storage", () => {
  const source = { id_surah_ayat: "2:153", ayat_indonesia: "Fixture" };
  expect(normalizeEvidence({ sources: [source, source] }).sources).toHaveLength(1);
});

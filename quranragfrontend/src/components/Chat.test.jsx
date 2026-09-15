import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Chat from "./Chat";
import { SESSION_KEY } from "../constants";

class FakeSocket {
  static OPEN = 1;
  static instances = [];
  readyState = 0;
  send = vi.fn();
  constructor() { FakeSocket.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

function evidence(ref = "2:153") {
  return { sources: [{ id_surah_ayat: ref, surah: "Surah uji", ayat_indonesia: "Teks fixture." }], graphs: [] };
}

function setup() {
  const props = { onConnectionChange: vi.fn(), onOpenSources: vi.fn(), onUpdateEvidence: vi.fn(), onSelectVerse: vi.fn(), profile: { name: "Tamu" } };
  render(<Chat {...props} />);
  const socket = FakeSocket.instances.at(-1);
  act(() => socket.open());
  return { socket, props };
}

function ask(socket, text = "Sabar") {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Kirim pertanyaan" }));
  return JSON.parse(socket.send.mock.lastCall[0]).request_id;
}

function complete(socket, id, ref = "2:153") {
  act(() => {
    socket.message({ type: "step", agent: "STEP4", request_id: id, payload: evidence(ref) });
    socket.message({ type: "step", agent: "STEP5", request_id: id, payload: { jawaban_final: `Rujukan [QS. ${ref}](verse:${ref}).` } });
    socket.message({ type: "done", request_id: id });
  });
}

beforeEach(() => { FakeSocket.instances = []; vi.stubGlobal("WebSocket", FakeSocket); });

describe("question lifecycle", () => {
  it("re-enables input after disconnect and allows retry on reconnect", () => {
    vi.useFakeTimers();
    const { socket } = setup();
    ask(socket);
    expect(screen.getByRole("textbox").disabled).toBe(true);
    act(() => socket.close());
    expect(screen.getByRole("textbox").disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("Koneksi terputus");
    act(() => vi.advanceTimersByTime(1000));
    const next = FakeSocket.instances.at(-1);
    act(() => next.open());
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(JSON.parse(next.send.mock.lastCall[0]).pertanyaan).toBe("Sabar");
    vi.useRealTimers();
  });

  it("keeps evidence attached to each answer across subsequent questions", () => {
    const { socket, props } = setup();
    complete(socket, ask(socket), "2:153");
    complete(socket, ask(socket, "Tema kedua"), "3:1");
    fireEvent.click(screen.getAllByRole("button", { name: /Lihat 1 ayat terkait/ })[0]);
    expect(props.onOpenSources.mock.lastCall[0].sources[0].id_surah_ayat).toBe("2:153");
    fireEvent.click(screen.getByRole("button", { name: "QS. 3:1" }));
    expect(props.onSelectVerse.mock.lastCall[0]).toBe("3:1");
    expect(props.onSelectVerse.mock.lastCall[1].sources[0].id_surah_ayat).toBe("3:1");
  });

  it("ignores late replies for an earlier request", () => {
    const { socket } = setup();
    const id = ask(socket);
    act(() => socket.message({ type: "step", request_id: "obsolete", agent: "STEP5", payload: { jawaban_final: "Stale answer" } }));
    expect(screen.queryByText("Stale answer")).toBeNull();
    expect(screen.getByRole("textbox").disabled).toBe(true);
    complete(socket, id);
    expect(screen.getByRole("textbox").disabled).toBe(false);
  });

  it("can cancel and removes indefinite processing state", () => {
    const { socket } = setup();
    const id = ask(socket);
    fireEvent.click(screen.getByRole("button", { name: "Hentikan" }));
    expect(JSON.parse(socket.send.mock.lastCall[0])).toEqual({ type: "cancel", request_id: id });
    expect(screen.getByRole("textbox").disabled).toBe(false);
  });

  it("handles malformed responses without rendering arbitrary text", () => {
    const { socket } = setup();
    ask(socket);
    act(() => socket.onmessage({ data: "invalid response" }));
    expect(screen.getByRole("alert").textContent).toContain("Respons server tidak valid");
    expect(screen.getByRole("textbox").disabled).toBe(false);
  });

  it("shows server failures separately from assistant answers", () => {
    const { socket } = setup();
    const id = ask(socket);
    act(() => socket.message({ type: "error", request_id: id, message: "Server sibuk" }));
    expect(screen.getByRole("alert").textContent).toContain("Server sibuk");
    expect(screen.queryByRole("button", { name: "Salin jawaban" })).toBeNull();
  });

  it("keeps typed questions while disconnected", () => {
    const { socket } = setup();
    act(() => socket.close());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Pertanyaan tersimpan" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(socket.send).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox").value).toBe("Pertanyaan tersimpan");
  });

  it("does not submit during IME composition", () => {
    const { socket } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Sabar" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true });
    expect(socket.send).not.toHaveBeenCalled();
  });

  it("ignores corrupt session entries", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([null, { id: 12 }, { id: "x", text: "wrong role", role: "bad" }]));
    setup();
    expect(screen.queryByText("wrong role")).toBeNull();
  });

  it("clears conversation and evidence together", () => {
    const { socket, props } = setup();
    complete(socket, ask(socket));
    fireEvent.click(screen.getByRole("button", { name: "Percakapan baru" }));
    expect(props.onUpdateEvidence.mock.lastCall[0]).toEqual({ sources: [], graphs: [] });
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY))).toEqual([]);
  });
});

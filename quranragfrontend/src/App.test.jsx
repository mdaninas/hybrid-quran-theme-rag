import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "./App";
import { PROFILE_KEY } from "./constants";

vi.mock("./components/Layout", () => ({ default: ({ profile, onLogout }) => <div>{profile.name}<button onClick={onLogout}>Keluar</button></div> }));

it("rejects corrupt profile and removes legacy credential cache", () => {
  localStorage.setItem(PROFILE_KEY, '{"name": 3, "mode": "local"}');
  sessionStorage.setItem("quranrag-neo4j-config", '{"password":"old-secret"}');
  render(<App />);
  expect(screen.getByRole("heading", { name: "Mulai menjelajah" })).toBeTruthy();
  expect(sessionStorage.getItem("quranrag-neo4j-config")).toBeNull();
  expect(screen.queryByLabelText(/Kata sandi/)).toBeNull();
});

it("supports guest entry and logout without requesting credentials", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Masuk sebagai tamu" }));
  expect(screen.getByText("Tamu")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
  expect(sessionStorage.getItem(PROFILE_KEY)).toBeNull();
});

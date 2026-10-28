import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { makeBootstrap, serve } from "../test/fixtures";
import { PeekCard } from "./PeekCard";

let fetchMock: ReturnType<typeof serve>;
beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  fetchMock = serve({ "GET /api/bootstrap": makeBootstrap() });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("Space shows a read-only card: key, title, status · priority · assignee, feature · sprint · estimate, description", () => {
  render(<PeekCard />);
  act(() => uiStore.getState().openPeek(1001));
  const card = screen.getByRole("complementary", { name: "Story preview" });
  for (const text of ["US1001", "[DEMO] Example story", "In Progress", "High", "Dana Demo", "[DEMO] Feature A", "PI 4 · Sprint 3", "5", "Hello"]) {
    expect(card).toHaveTextContent(text);
  }
  expect(card.querySelector("input, textarea, [contenteditable]")).toBeNull(); // read-only
  expectRallyWords(card);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/issues/"))).toHaveLength(0); // cache only (ruling 6)
});

test("it follows the selection and closes with the peek", () => {
  render(<PeekCard />);
  act(() => uiStore.getState().openPeek(1001));
  act(() => uiStore.getState().openPeek(1002));
  expect(screen.getByRole("complementary", { name: "Story preview" })).toHaveTextContent("[DEMO] Backlog one");
  expect(screen.getByRole("complementary", { name: "Story preview" })).toHaveTextContent("No description");
  act(() => uiStore.getState().openPeek(null));
  expect(screen.queryByRole("complementary", { name: "Story preview" })).toBeNull();
});

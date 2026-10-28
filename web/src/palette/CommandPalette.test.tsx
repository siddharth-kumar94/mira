import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { CommandPalette } from "./CommandPalette";
import { expectRallyWords } from "../test/vocabulary";

beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  serve({
    "GET /api/bootstrap": makeBootstrap(),
    "PATCH /api/issues/1001": makeIssue({ priority: 1 }),
    "GET /api/users": [{ id: 777, name: "Pat Person" }],
    "GET /api/search": { issues: [], teams: [], projects: [] },
  });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("no backdrop dimming; the context chip; no heading before typing; one keycap per key", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette(null, [1001]));
  expect(screen.getByText("US1001").closest("[data-context-chip]")).toHaveTextContent("US1001 ⋅ [DEMO] Example story");
  const project = await screen.findByRole("option", { name: "Move to feature…" });
  expect([...project.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["⇧", "P"]);
  expect(document.querySelector("[cmdk-overlay]")?.className ?? "").not.toMatch(/bg-black/);
  expect(screen.queryByText("US1001", { selector: "[cmdk-group-heading]" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear context" }));
  expect(uiStore.getState().palette.targetIds).toEqual([]);
});

test("a picker checks the current value; a number key picks; the choice is written and the palette closes", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette("priority", [1001]));
  const high = await screen.findByRole("option", { name: "High" });
  expect(high.querySelector('[data-check]')).not.toBeNull();
  fireEvent.keyDown(screen.getByPlaceholderText("Change priority to…"), { key: "1" });
  expect(appStore.getState().issues[1001].priority).toBe(1);
  expect(uiStore.getState().palette.open).toBe(false);
});

test("typed queries show Quick results: features first, then stories packed tight", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette());
  fireEvent.change(screen.getByPlaceholderText("Type a command or search…"), { target: { value: "feature" } });
  const group = await screen.findByRole("group", { name: 'Quick results for "feature"' });
  expect(within(group).getAllByRole("option")[0]).toHaveTextContent("Feature›[DEMO] Feature A");
});

test("searching finds a cached story and opens it", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette());
  fireEvent.change(screen.getByPlaceholderText("Type a command or search…"), { target: { value: "backlog one" } });
  fireEvent.click(await screen.findByRole("option", { name: /US1002/ }));
  expect(uiStore.getState().route).toEqual({ name: "issue", key: "US1002" });
});

test("the assignee picker searches every workspace user", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette("assignee", [1001]));
  fireEvent.change(screen.getByPlaceholderText("Assign to…"), { target: { value: "pat" } });
  expect(await screen.findByRole("option", { name: "Pat Person" }, { timeout: 2000 })).toBeInTheDocument();
});

test("the command list is in Rally's words", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette(null, [1001]));
  await screen.findByRole("option", { name: "Move to feature…" });
  expect(screen.getByRole("option", { name: "Move to sprint…" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Type a command or search…")).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("with nothing targeted the commands (go-to, create, copy) are in Rally's words", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette());
  await screen.findByRole("option", { name: /My stories/ });
  expect(screen.getByRole("option", { name: /Create story/ })).toBeInTheDocument();
  expectRallyWords(document.body);
});

test.each([
  ["project", "Move to feature…"], ["cycle", "Move to sprint…"], ["status", "Change status…"], ["priority", "Change priority to…"],
  ["assignee", "Assign to…"], ["labels", "Add labels…"], ["estimate", "Set estimate to…"],
] as const)("the %s picker is in Rally's words", async (picker, placeholder) => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette(picker, [1001]));
  expect(await screen.findByPlaceholderText(placeholder)).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("a picker over a multi-team selection explains itself in Rally's words", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette("project", [1001, 1201]));
  await screen.findByPlaceholderText("Move to feature…");
  expect(screen.getByRole("option", { name: "Features from one team only" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { runAction } from "./actions";

const ui = () => uiStore.getState();

beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  serve({ "GET /api/bootstrap": makeBootstrap() });
  await appStore.getState().load();
  ui().setVisible([1001, 1201, 1002]);
});
afterEach(() => vi.unstubAllGlobals());

test("J and K move through the visible rows, and an open peek follows", () => {
  runAction("down");
  expect(ui().selectedId).toBe(1001);
  runAction("down");
  ui().openPeek(1201);
  runAction("down");
  expect([ui().selectedId, ui().peekId]).toEqual([1002, 1002]);
  runAction("down");
  expect(ui().selectedId).toBe(1002); // stays on the last row
  runAction("up");
  expect(ui().selectedId).toBe(1201);
});

test("X adds the selected row to the multi-selection", () => {
  ui().select(1201);
  runAction("toggle-select");
  expect(ui().selectedIds).toEqual([1201]);
});

test("pickers target the multi-selection, else the selected row", () => {
  ui().select(1001);
  runAction("pick-status");
  expect(ui().palette).toEqual({ open: true, picker: "status", targetIds: [1001] });
  ui().closePalette();
  ui().toggleSelected(1002);
  ui().toggleSelected(1201);
  runAction("pick-project");
  expect(ui().palette).toEqual({ open: true, picker: "project", targetIds: [1002, 1201] });
});

test("I assigns the targets to you", () => {
  const spy = vi.spyOn(appStore.getState(), "updateIssues").mockResolvedValue();
  ui().select(1300);
  runAction("assign-me");
  expect(spy).toHaveBeenCalledWith([1300], { assignee_id: 501 });
});

test("Enter opens the issue page and Esc goes back", () => {
  ui().navigate({ name: "team", teamId: 9001, tab: "backlog" });
  ui().select(1002);
  runAction("open-page");
  expect(ui().route).toEqual({ name: "issue", key: "US1002" });
  runAction("escape");
  expect(ui().route).toEqual({ name: "team", teamId: 9001, tab: "backlog" });
});

test("G M, G P, G N navigate; F toggles the filter menu", () => {
  runAction("go-projects");
  expect(ui().route).toEqual({ name: "projects" });
  runAction("go-initiatives");
  expect(ui().route).toEqual({ name: "initiatives" });
  runAction("go-my-issues");
  expect(ui().route).toEqual({ name: "my", tab: "assigned" });
  runAction("filter");
  expect(ui().menu).toBe("filter");
  runAction("filter");
  expect(ui().menu).toBeNull();
});

test("while the palette is open only ⌘K acts", () => {
  runAction("palette");
  runAction("down");
  expect(ui().selectedId).toBeNull();
  runAction("palette");
  expect(ui().palette.open).toBe(false);
});

test("⌘. copies the selected IDs", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  ui().toggleSelected(1001);
  ui().toggleSelected(1201);
  runAction("copy-id");
  expect(writeText).toHaveBeenCalledWith("US1001, US1201");
});

test("I assigns to me, and un-assigns when it's already mine", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "PATCH /api/issues/1001": makeIssue({ assignee: null }) });
  ui().select(1001); // already Dana's (me)
  runAction("assign-me");
  expect(appStore.getState().issues[1001].assignee).toBeNull();
});

test("on an issue page J and K step through the view it was opened from", () => {
  ui().navigate({ name: "my", tab: "assigned" });
  ui().openIssue("US1201");
  runAction("down");
  expect(ui().route).toEqual({ name: "issue", key: "US1002" });
  runAction("up");
  runAction("up");
  expect(ui().route).toEqual({ name: "issue", key: "US1001" });
  expect(ui().backRoute).toEqual({ name: "my", tab: "assigned" });
});

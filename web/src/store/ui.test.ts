import { beforeEach, expect, test, vi } from "vitest";
import { createUiStore, sidebarTeamIds } from "./ui";

const fakeHistory = () => ({ pushState: vi.fn(), replaceState: vi.fn() });

beforeEach(() => localStorage.clear());

test("the root path opens My issues and fixes the URL", () => {
  const h = fakeHistory();
  const ui = createUiStore(h, "/");
  expect(ui.getState().route).toEqual({ name: "my", tab: "assigned" });
  expect(h.replaceState).toHaveBeenCalledWith(null, "", "/my/assigned");
  createUiStore(h, "/issue/us1001");
  expect(h.replaceState).toHaveBeenLastCalledWith(null, "", "/issue/US1001");
});

test("navigate pushes history and clears the selection; the same route is a no-op", () => {
  const h = fakeHistory();
  const ui = createUiStore(h, "/my/assigned");
  ui.getState().select(1001);
  ui.getState().toggleSelected(1002);
  ui.getState().navigate({ name: "team", teamId: 9001, tab: "active" });
  expect(h.pushState).toHaveBeenCalledWith(null, "", "/team/9001/active");
  expect(ui.getState()).toMatchObject({ selectedId: null, selectedIds: [] });
  ui.getState().navigate({ name: "team", teamId: 9001, tab: "active" });
  expect(h.pushState).toHaveBeenCalledTimes(1);
});

test("opening an issue keeps the selection and remembers where Esc goes back to", () => {
  const ui = createUiStore(fakeHistory(), "/team/9001/backlog");
  ui.getState().select(1002);
  ui.getState().openIssue("us1002");
  expect(ui.getState().route).toEqual({ name: "issue", key: "US1002" });
  expect(ui.getState().selectedId).toBe(1002);
  ui.getState().openIssue("US1003"); // issue to issue keeps the original way back
  ui.getState().closeTopOverlay();
  expect(ui.getState().route).toEqual({ name: "team", teamId: 9001, tab: "backlog" });
});

test("Escape closes the topmost thing first", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  const s = () => ui.getState();
  s().openIssue("US1001");
  s().select(1001);
  s().openPeek(1001);
  s().setCheatsheet(true);
  s().setComposer(true);
  s().openPalette("status", [1001]);
  s().setMenu("display"); // after the palette: opening the palette closes menus
  const order: string[] = [];
  const snapshot = () =>
    s().palette.open ? "palette" : s().composerOpen ? "composer" : s().cheatsheetOpen ? "cheatsheet" : s().menu ? "menu"
      : s().peekId !== null ? "peek" : s().route.name === "issue" ? "page" : s().selectedId !== null ? "selection" : "none";
  for (let n = 0; n < 7; n++) {
    order.push(snapshot());
    s().closeTopOverlay();
  }
  expect(order).toEqual(["palette", "composer", "cheatsheet", "menu", "peek", "page", "selection"]);
  expect(snapshot()).toBe("none");
});

test("back and forward follow the location", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  ui.getState().syncFromLocation("/my/created");
  expect(ui.getState().route).toEqual({ name: "my", tab: "created" });
});

test("filters are kept per view", () => {
  const ui = createUiStore(fakeHistory(), "/");
  ui.getState().setFilters("my:assigned", { priority: [1] });
  ui.getState().setFilters("team:9001:active", { status: ["todo"] });
  expect(ui.getState().filters["my:assigned"]).toEqual({ priority: [1] });
});

test("joined and hidden teams persist", () => {
  const ui = createUiStore(fakeHistory(), "/");
  ui.getState().hideTeam(9050);
  ui.getState().joinTeam(9050); // joining un-hides
  ui.getState().hideTeam(9001);
  const again = createUiStore(fakeHistory(), "/");
  expect(again.getState().joinedTeamIds).toEqual([9050]);
  expect(again.getState().hiddenTeamIds).toEqual([9001]);
  expect(sidebarTeamIds([9001, 9002], [9050], [9001])).toEqual([9002, 9050]);
});

test("corrupted saved teams are ignored", () => {
  localStorage.setItem("mira-teams-joined", "{oops");
  localStorage.setItem("mira-teams-hidden", JSON.stringify(["a", 3]));
  const ui = createUiStore(fakeHistory(), "/");
  expect(ui.getState().joinedTeamIds).toEqual([]);
  expect(ui.getState().hiddenTeamIds).toEqual([3]);
});

test("setVisible drops selected issues the view no longer shows, so bulk actions can't reach hidden issues", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  ui.getState().setVisible([1001, 1002, 1003]);
  ui.getState().select(1001);
  ui.getState().toggleSelected(1002);
  ui.getState().toggleSelected(1003);
  ui.getState().setVisible([1001, 1003]); // a filter now hides 1002
  expect(ui.getState().selectedIds).toEqual([1003]);
  expect(ui.getState().selectedId).toBe(1001);
  expect(ui.getState().visibleIds).toEqual([1001, 1003]);
});

test("setComposer(true) opens with no prefill; openComposer carries one", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  ui.getState().openComposer({ status: "backlog" });
  expect(ui.getState()).toMatchObject({ composerOpen: true, composerPrefill: { status: "backlog" } });
  ui.getState().setComposer(true);
  expect(ui.getState().composerPrefill).toBeNull();
});

test("the context menu acts on the selection when the row is in it, else on that row, and Esc closes it first", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  ui.getState().toggleSelected(1);
  ui.getState().toggleSelected(2);
  ui.getState().openContextMenu(2, 10, 20);
  expect(ui.getState().contextMenu).toEqual({ x: 10, y: 20, ids: [1, 2] });
  ui.getState().closeTopOverlay();
  expect(ui.getState().contextMenu).toBeNull();
  expect(ui.getState().selectedIds).toEqual([1, 2]); // Esc closed only the menu
  ui.getState().openContextMenu(3, 0, 0);
  expect(ui.getState().contextMenu?.ids).toEqual([3]);
  expect(ui.getState().selectedId).toBe(3);
  expect(ui.getState().selectedIds).toEqual([]); // right-clicking outside the selection selects just that row
});

test("toggleTheme still flips when storage throws", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  const ui = createUiStore(history, "/");
  expect(() => ui.getState().toggleTheme()).not.toThrow();
  expect(ui.getState().theme).toBe("dark");
  spy.mockRestore();
});

test("leaveTeam drops a joined team and hides it; showTeam brings it back, both persisted", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  ui.getState().joinTeam(9500);
  ui.getState().leaveTeam(9500);
  expect(ui.getState().joinedTeamIds).toEqual([]);
  expect(ui.getState().hiddenTeamIds).toEqual([9500]);
  expect(JSON.parse(localStorage.getItem("mira-teams-joined")!)).toEqual([]);
  expect(JSON.parse(localStorage.getItem("mira-teams-hidden")!)).toEqual([9500]);
  ui.getState().showTeam(9500);
  expect(ui.getState().hiddenTeamIds).toEqual([]);
  expect(JSON.parse(localStorage.getItem("mira-teams-hidden")!)).toEqual([]);
  expect(createUiStore(fakeHistory(), "/my/assigned").getState().hiddenTeamIds).toEqual([]);
});

test("setTheme sets and remembers the theme", () => {
  const ui = createUiStore(fakeHistory(), "/");
  ui.getState().setTheme("dark");
  expect(ui.getState().theme).toBe("dark");
  expect(createUiStore(fakeHistory(), "/").getState().theme).toBe("dark");
  ui.getState().setTheme("light");
  expect(localStorage.getItem("rally-poc-theme")).toBe("light");
});

test("appRoute is the last screen outside settings, for Back to app", () => {
  const ui = createUiStore(fakeHistory(), "/team/9001/backlog");
  ui.getState().navigate({ name: "settings", section: "preferences" });
  ui.getState().navigate({ name: "settings", section: "account" });
  ui.getState().navigate({ name: "team-settings", teamId: 9001 });
  expect(ui.getState().appRoute).toEqual({ name: "team", teamId: 9001, tab: "backlog" });
  ui.getState().navigate({ name: "projects" });
  expect(ui.getState().appRoute).toEqual({ name: "projects" });
  // Opening settings straight from its URL goes back to My issues.
  expect(createUiStore(fakeHistory(), "/settings/account").getState().appRoute).toEqual({ name: "my", tab: "assigned" });
});

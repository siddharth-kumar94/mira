import { beforeEach, expect, test } from "vitest";
import { DEFAULT_PROPERTIES, defaultOptions, isDefault, loadOptions, normalizeOptions, saveOptions } from "./options";

beforeEach(() => localStorage.clear());
const active = { kind: "team", teamId: 9001, tab: "active" } as const;
const backlog = { kind: "team", teamId: 9001, tab: "backlog" } as const;
const mine = { kind: "my", tab: "assigned" } as const;
const cycle = { kind: "cycle", teamId: 9001, cycleKey: "PI 4 · Sprint 3|2026-10-19|2026-11-01" } as const;
const project = { kind: "project", projectId: 201 } as const;

test("defaults follow Linear: My issues by Focus; teams by status and priority; Backlog manual", () => {
  expect(defaultOptions(mine)).toEqual({ layout: "list", groupBy: "focus", orderBy: "importance", showEmpty: false,
    completed: "day", collapsed: [], properties: DEFAULT_PROPERTIES });
  expect(defaultOptions(active)).toMatchObject({ groupBy: "status", orderBy: "priority" });
  expect(defaultOptions(backlog).orderBy).toBe("manual");
  expect(DEFAULT_PROPERTIES).toContain("created");
  expect(DEFAULT_PROPERTIES).not.toContain("updated");
  expect(DEFAULT_PROPERTIES).not.toContain("creator");
});

test("Focus always orders by Importance; leaving it restores the view's default ordering", () => {
  expect(normalizeOptions({ ...defaultOptions(mine), orderBy: "estimate" }, mine).orderBy).toBe("importance");
  expect(normalizeOptions({ ...defaultOptions(mine), groupBy: "status" }, mine).orderBy).toBe("priority");
  expect(normalizeOptions({ ...defaultOptions(active), groupBy: "focus", orderBy: "importance" }, active))
    .toMatchObject({ groupBy: "status", orderBy: "priority" }); // review focus 2: Focus is My issues only
});

test("options are saved per view under a versioned key", () => {
  saveOptions("team:9001:active", { ...defaultOptions(active), layout: "board", collapsed: ["todo"] });
  expect(localStorage.getItem("mira-view:v2:team:9001:active")).not.toBeNull();
  expect(loadOptions("team:9001:active", active)).toMatchObject({ layout: "board", collapsed: ["todo"] });
  expect(loadOptions("team:9001:backlog", backlog).layout).toBe("list");
});

test("Phase 2's saved options, corrupt JSON and unknown values fall back to the defaults", () => {
  // Review focus 2.
  localStorage.setItem("mira-view:my:assigned", JSON.stringify({ layout: "board", groupBy: "status" }));
  expect(loadOptions("my:assigned", mine)).toEqual(defaultOptions(mine));
  localStorage.setItem("mira-view:v2:a", "{not json");
  expect(loadOptions("a", active)).toEqual(defaultOptions(active));
  localStorage.setItem("mira-view:v2:b", JSON.stringify({ layout: "kanban", groupBy: "state", orderBy: "manual", showEmpty: "yes",
    completed: "year", collapsed: [3, "todo"], properties: ["feature", "id"] }));
  expect(loadOptions("b", active)).toEqual({ ...defaultOptions(active), orderBy: "manual", collapsed: ["todo"], properties: ["id"] });
  localStorage.setItem("mira-view:v2:c", JSON.stringify({ properties: ["feature"] }));
  expect(loadOptions("c", active).properties).toEqual(DEFAULT_PROPERTIES); // only unknown names: keep the defaults
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
  expect(loadOptions("d", active, broken)).toEqual(defaultOptions(active));
  expect(() => saveOptions("d", defaultOptions(active), broken)).not.toThrow();
});

test("isDefault ignores collapsed groups and property order", () => {
  expect(isDefault({ ...defaultOptions(mine), collapsed: ["f:done"] }, mine)).toBe(true);
  expect(isDefault({ ...defaultOptions(mine), properties: [...DEFAULT_PROPERTIES].reverse() }, mine)).toBe(true);
  expect(isDefault({ ...defaultOptions(mine), layout: "board" }, mine)).toBe(false);
});

test("cycle and project scopes group by status and order by priority, without their own property (§19.6)", () => {
  expect(defaultOptions(cycle)).toEqual({ ...defaultOptions(active), properties: DEFAULT_PROPERTIES.filter((p) => p !== "cycle") });
  expect(defaultOptions(project)).toEqual({ ...defaultOptions(active), properties: DEFAULT_PROPERTIES.filter((p) => p !== "project") });
  expect(defaultOptions(cycle).properties).toContain("project");
  expect(defaultOptions(project).properties).toContain("cycle");
  expect(isDefault(defaultOptions(cycle), cycle)).toBe(true);
  expect(loadOptions("cycle:x", cycle)).toEqual(defaultOptions(cycle));
});

test("options saved before the words changed still load under their existing storage key and names", () => {
  localStorage.setItem("mira-view:v2:team:9001:active", JSON.stringify({ layout: "board", groupBy: "project", orderBy: "priority", showEmpty: true,
    completed: "week", collapsed: ["pr201"], properties: ["id", "project", "cycle"] }));
  expect(loadOptions("team:9001:active", active)).toEqual({ layout: "board", groupBy: "project", orderBy: "priority", showEmpty: true,
    completed: "week", collapsed: ["pr201"], properties: ["id", "project", "cycle"] });
});

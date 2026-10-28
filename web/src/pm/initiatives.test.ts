import { describe, expect, test } from "vitest";
import { makeInitiative, makeProject, SAM } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";
import {
  defaultInitiativeOptions, doneCount, groupInitiatives, healthCounts, initiativeFilterFields, initiativeFilterOptions, initiativeTab,
  INITIATIVE_PROPERTIES, INITIATIVE_PROPERTY_LABEL, isDefaultInitiatives, loadInitiativeOptions, matchesInitiative, saveInitiativeOptions, sortInitiatives, toggleInitiativeFilter,
} from "./initiatives";

const ACTIVE = makeInitiative({ id: 251, name: "Agentic Platform", status: "active", rank: "b", target: "2026-12-31" });
const PLANNED = makeInitiative({ id: 252, name: "Metrics", status: "planned", rank: "a", target: null, group_id: 272, group_name: "Data Outcome",
  owner: SAM, priority: 2, updated_at: "2026-10-18T10:00:00.000Z" });
const DONE = makeInitiative({ id: 253, name: "Graph", status: "completed", rank: "c", target: "2026-03-01", group_id: null, group_name: null,
  parent_group_id: null, parent_group_name: null, owner: null, priority: 1 });

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(),
    key: (n) => [...m.keys()][n] ?? null, get length() { return m.size; },
  };
}

test("tabs: Active is the active status, Planned the planned one, All capabilities everything", () => {
  expect([ACTIVE, PLANNED, DONE].filter((i) => initiativeTab(i, "active")).map((i) => i.id)).toEqual([251]);
  expect([ACTIVE, PLANNED, DONE].filter((i) => initiativeTab(i, "planned")).map((i) => i.id)).toEqual([252]);
  expect([ACTIVE, PLANNED, DONE].filter((i) => initiativeTab(i, "all")).map((i) => i.id)).toEqual([251, 252, 253]);
});

test("healthCounts omits zeros and keeps on track, at risk, off track; no target is not a reported health", () => {
  expect(healthCounts(["off_track", "no_target", "on_track", "off_track"])).toEqual([
    { value: "on_track", count: 1 }, { value: "off_track", count: 2 }]);
  expect(healthCounts(["at_risk", "on_track"])).toEqual([{ value: "on_track", count: 1 }, { value: "at_risk", count: 1 }]);
  expect(healthCounts([])).toEqual([]);
  expect(healthCounts(["no_target"])).toEqual([]);
});

test("doneCount counts the capability's completed features of its total", () => {
  const projects = [
    makeProject({ id: 1, initiative_id: 251, status_category: "completed" }), makeProject({ id: 2, initiative_id: 251, status_category: "started" }),
    makeProject({ id: 3, initiative_id: 252, status_category: "completed" }),
  ];
  expect(doneCount({ ...ACTIVE, project_count: 2 }, projects)).toEqual({ done: 1, total: 2 });
  // Before the children load, Rally's child count stands in for the total.
  expect(doneCount({ ...ACTIVE, project_count: 3 }, [])).toEqual({ done: 0, total: 3 });
  expect(doneCount({ ...DONE, project_count: 0 }, projects)).toEqual({ done: 0, total: 0 });
});

describe("groupInitiatives", () => {
  test("no grouping is one group, in the given order", () => {
    const groups = groupInitiatives([PLANNED, ACTIVE], "none", false);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("All capabilities");
    expect(groups[0].initiatives.map((i) => i.id)).toEqual([252, 251]);
  });

  test("Outcome groups by the parent outcome by name, No outcome last", () => {
    const groups = groupInitiatives([DONE, ACTIVE, PLANNED], "outcome", false);
    expect(groups.map((g) => [g.label, g.initiatives.map((i) => i.id)])).toEqual([
      ["[DEMO] Outcome", [251]], ["Data Outcome", [252]], ["No outcome", [253]]]);
  });

  test("Initiative groups by the outcome's parent (Rally's Program) by name, No initiative last", () => {
    const north = makeInitiative({ id: 254, name: "Search", parent_group_id: 281, parent_group_name: "North Program" });
    const alpha = makeInitiative({ id: 255, name: "Ingest", parent_group_id: 282, parent_group_name: "Alpha Program" });
    const alsoNorth = makeInitiative({ id: 256, name: "Index", parent_group_id: 281, parent_group_name: "North Program" });
    const groups = groupInitiatives([DONE, north, alpha, alsoNorth], "initiative", false);
    expect(groups.map((g) => [g.key, g.label, g.value, g.initiatives.map((i) => i.id)])).toEqual([
      ["initiative:282", "Alpha Program", 282, [255]], ["initiative:281", "North Program", 281, [254, 256]],
      ["initiative:none", "No initiative", null, [253]]]);
    expect(groups.every((g) => g.field === "initiative")).toBe(true);
  });

  test("a capability whose initiative's name is missing still groups with the rest of that initiative, under its name", () => {
    const unnamed = makeInitiative({ id: 254, name: "Search", parent_group_id: 281, parent_group_name: null });
    const named = makeInitiative({ id: 255, name: "Ingest", parent_group_id: 281, parent_group_name: "North Program" });
    expect(groupInitiatives([unnamed, named], "initiative", false).map((g) => [g.label, g.initiatives.map((i) => i.id)])).toEqual([
      ["North Program", [254, 255]]]);
    // With no member carrying the name, the header is the id; this is the one place the word may show.
    expect(groupInitiatives([unnamed], "initiative", false).map((g) => g.label)).toEqual(["Initiative 281"]);
  });

  test("Status runs Planned, Active, Completed; Owner by name, No owner last", () => {
    expect(groupInitiatives([DONE, ACTIVE, PLANNED], "status", false).map((g) => g.label)).toEqual(["Planned", "Active", "Completed"]);
    expect(groupInitiatives([DONE, ACTIVE, PLANNED], "owner", false).map((g) => g.label)).toEqual(["Dana Demo", "Sam Sample", "No owner"]);
  });

  test("Priority groups only with the field; without it, it is no grouping (D38)", () => {
    expect(groupInitiatives([ACTIVE, PLANNED, DONE], "priority", true).map((g) => g.label)).toEqual(["Urgent", "High", "No priority"]);
    expect(groupInitiatives([ACTIVE, PLANNED, DONE], "priority", false).map((g) => g.field)).toEqual(["none"]);
  });
});

test("ordering: Manual is Rally's rank, Target date nulls last, Last updated newest first, Priority only with the field", () => {
  const all = [ACTIVE, PLANNED, DONE];
  expect(sortInitiatives(all, "manual", false).map((i) => i.id)).toEqual([252, 251, 253]);
  expect(sortInitiatives(all, "target", false).map((i) => i.id)).toEqual([253, 251, 252]);
  expect(sortInitiatives(all, "updated", false).map((i) => i.id)[0]).toBe(252);
  expect(sortInitiatives(all, "priority", true).map((i) => i.id)).toEqual([253, 252, 251]);
  expect(sortInitiatives(all, "priority", false).map((i) => i.id)).toEqual([252, 251, 253]); // manual
});

test("options are saved under mira-pm:v1:initiatives; no grouping by default; a saved Priority falls back without the field", () => {
  const storage = memoryStorage();
  const d = defaultInitiativeOptions();
  expect(d.groupBy).toBe("none");
  expect(d.orderBy).toBe("manual");
  expect(d.properties).toEqual(["description", "owner", "status", "priority", "health", "projects", "active", "target"]);
  saveInitiativeOptions({ ...d, groupBy: "priority", orderBy: "priority" }, storage);
  expect(JSON.parse(storage.getItem("mira-pm:v1:initiatives")!).groupBy).toBe("priority");
  expect(loadInitiativeOptions(true, storage)).toMatchObject({ groupBy: "priority", orderBy: "priority" });
  const without = loadInitiativeOptions(false, storage);
  expect(without).toMatchObject({ groupBy: "none", orderBy: "manual" });
  expect(without.properties).not.toContain("priority");
  storage.setItem("mira-pm:v1:initiatives", "{not json");
  expect(loadInitiativeOptions(true, storage)).toEqual(d);
  storage.setItem("mira-pm:v1:initiatives", JSON.stringify({ groupBy: "outcome", properties: ["owner", "bogus"] }));
  expect(loadInitiativeOptions(true, storage)).toMatchObject({ groupBy: "outcome", orderBy: "manual", properties: ["owner"] });
});

test("Initiative is a saved grouping; options saved before it existed still load", () => {
  const storage = memoryStorage();
  saveInitiativeOptions({ ...defaultInitiativeOptions(), groupBy: "initiative" }, storage);
  expect(loadInitiativeOptions(false, storage).groupBy).toBe("initiative");
  for (const groupBy of ["none", "outcome", "status", "owner"]) {
    storage.setItem("mira-pm:v1:initiatives", JSON.stringify({ groupBy, orderBy: "target", properties: ["owner"], collapsed: ["outcome:271"] }));
    expect(loadInitiativeOptions(false, storage)).toEqual({ groupBy, orderBy: "target", properties: ["owner"], collapsed: ["outcome:271"] });
  }
});

test("isDefaultInitiatives ignores property order, collapsed groups, and Priority without the field", () => {
  const d = defaultInitiativeOptions();
  expect(isDefaultInitiatives(d, true)).toBe(true);
  expect(isDefaultInitiatives({ ...d, properties: [...d.properties].reverse(), collapsed: ["outcome:1"] }, true)).toBe(true);
  expect(isDefaultInitiatives({ ...d, groupBy: "outcome" }, true)).toBe(false);
  expect(isDefaultInitiatives({ ...d, properties: d.properties.filter((p) => p !== "priority") }, false)).toBe(true);
});

describe("filters", () => {
  test("the fields: Status, Priority only with the field, Owner, Health, Outcome", () => {
    expect(initiativeFilterFields(true).map(([, l]) => l)).toEqual(["Status", "Priority", "Owner", "Health", "Outcome"]);
    expect(initiativeFilterFields(false).map(([, l]) => l)).toEqual(["Status", "Owner", "Health", "Outcome"]);
  });

  test("options: fixed domains in Linear's order; owners and outcomes by name with No … last", () => {
    const all = [ACTIVE, PLANNED, DONE];
    expect(initiativeFilterOptions("status", all).map((o) => o.label)).toEqual(["Planned", "Active", "Completed"]);
    expect(initiativeFilterOptions("health", all).map((o) => o.label)).toEqual(["On track", "At risk", "Off track", "No updates"]);
    expect(initiativeFilterOptions("owner", all).map((o) => [o.value, o.label])).toEqual([[501, "Dana Demo"], [502, "Sam Sample"], [null, "No owner"]]);
    expect(initiativeFilterOptions("outcome", all).map((o) => [o.value, o.label])).toEqual([[271, "[DEMO] Outcome"], [272, "Data Outcome"], [null, "No outcome"]]);
  });

  test("values within a field are ORed, fields ANDed; Priority is ignored without the field", () => {
    const all = [ACTIVE, PLANNED, DONE];
    const byOutcome = toggleInitiativeFilter({}, "outcome", 272);
    expect(all.filter((i) => matchesInitiative(i, byOutcome, false)).map((i) => i.id)).toEqual([252]);
    const either = toggleInitiativeFilter(byOutcome, "outcome", null);
    expect(all.filter((i) => matchesInitiative(i, either, false)).map((i) => i.id)).toEqual([252, 253]);
    expect(all.filter((i) => matchesInitiative(i, { ...either, owner: [502] }, false)).map((i) => i.id)).toEqual([252]);
    expect(all.filter((i) => matchesInitiative(i, { priority: [1] }, false))).toHaveLength(3);
    expect(all.filter((i) => matchesInitiative(i, { priority: [1] }, true)).map((i) => i.id)).toEqual([253]);
    expect(toggleInitiativeFilter(byOutcome, "outcome", 272)).toEqual({});
  });
});

test("the display property labels, and the filter field labels, are in Rally's words", () => {
  const labels = INITIATIVE_PROPERTIES.map((p) => INITIATIVE_PROPERTY_LABEL[p]);
  expect(labels).toContain("Features");
  expect(labels).toContain("Active features");
  const host = document.createElement("div");
  host.textContent = [...labels, ...initiativeFilterFields(true).map(([, l]) => l), groupInitiatives([ACTIVE], "none", false)[0].label].join(" | ");
  expectRallyWords(host);
});

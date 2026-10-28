import { beforeEach, describe, expect, test } from "vitest";
import type { Initiative, Issue, Project, Release, Team } from "../api/types";
import { AIML, DANA, DEMO_TEAM, makeIssue, makeProject, SAM } from "../test/fixtures";
import {
  DEFAULT_PM_PROPERTIES, defaultPmOptions, groupProjects, inClosedWindow, isDefaultPm, isOverdue, loadPmOptions, matchesProject,
  normalizePmOptions, PM_PROPERTIES, pmFilterFields, pmFilterOptions, pmValueLabel, savePmOptions, sortProjects, type PmContext, type PmOptions,
} from "./model";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const DAY = 86_400_000;
const PI4: Release = { id: 701, name: "PI 4", start: "2026-10-08", end: "2026-12-31", ids: [701, 703] };
const PI5: Release = { id: 702, name: "PI 5", start: "2027-01-01", end: "2027-03-31", ids: [702] };
const GROWTH: Initiative = {
  id: 251, key: "C251", name: "Growth", status: "active", status_name: "Active", owner: DANA, start: null, target: null, progress: 0,
  project_count: 1, group_id: null, group_name: null, parent_group_id: null, parent_group_name: null, health: null, latest_update: null, project_health: [], priority: 0, summary: "", rank: "", updated_at: "", created_at: "",
};
const ctx = (over: Partial<PmContext> = {}): PmContext => ({
  now: NOW, users: { 501: DANA, 502: SAM }, teams: { 9001: DEMO_TEAM, 9002: AIML } as Record<number, Team>,
  initiatives: { 251: GROWTH }, releases: { 701: PI4, 702: PI5, 703: PI4 }, priority: true, ...over,
});
const update = { id: 1, author: DANA, html: "", created_at: "2026-10-16T12:00:00.000Z", progress: null, target: null };
const health = (value: "on_track" | "at_risk" | "off_track") =>
  ({ health: { value, source: "update" as const, reason: "" }, latest_update: { ...update, health: value } });
const names = (ps: Project[]) => ps.map((p) => p.name);

beforeEach(() => localStorage.clear());

describe("options", () => {
  test("the workspace defaults to Timeline and a team to List (§19.5); both no grouping, manual, all closed", () => {
    expect(defaultPmOptions("workspace")).toEqual({
      layout: "timeline", groupBy: "none", orderBy: "manual", closed: "all", properties: DEFAULT_PM_PROPERTIES, collapsed: [],
      showList: true, weekNumbers: false, cycleTeamId: null, showPis: false, zoom: "year", showEmpty: false,
    });
    expect(defaultPmOptions("team").layout).toBe("list");
    // Linear's List shows the milestone (Mira's PI), Health, Priority, Lead, Target date, Issues and Status; ID is off.
    expect(DEFAULT_PM_PROPERTIES).toEqual(["pi", "priority", "status", "health", "lead", "target", "issues"]);
  });

  test("the property set is the spec's, in its order", () => {
    expect(PM_PROPERTIES).toEqual(["id", "pi", "priority", "status", "health", "teams", "initiatives", "lead", "start", "target",
      "issues", "created", "updated", "completed", "labels"]);
  });

  test("without a priority field, priority grouping, ordering and the property fall back (Review Focus 5)", () => {
    const o: PmOptions = { ...defaultPmOptions("team"), groupBy: "priority", orderBy: "priority" };
    const n = normalizePmOptions(o, { priority: false });
    expect(n.groupBy).toBe("none");
    expect(n.orderBy).toBe("manual");
    expect(n.properties).not.toContain("priority");
    expect(n.properties).toContain("health");
    expect(normalizePmOptions(o, { priority: true })).toEqual(o);
  });

  test("saved options load field by field under mira-pm:v1:<view>; a saved Priority falls back without the field", () => {
    savePmOptions("team:9002:projects", { ...defaultPmOptions("team"), layout: "board", groupBy: "priority", orderBy: "priority", zoom: "month" });
    expect(localStorage.getItem("mira-pm:v1:team:9002:projects")).not.toBeNull();
    expect(loadPmOptions("team:9002:projects", "team", true)).toMatchObject({ layout: "board", groupBy: "priority", orderBy: "priority", zoom: "month" });
    const fallback = loadPmOptions("team:9002:projects", "team", false);
    expect(fallback).toMatchObject({ layout: "board", groupBy: "none", orderBy: "manual" });
    expect(fallback.properties).not.toContain("priority");
  });

  test("unknown or broken saved values fall back to the scope's defaults", () => {
    localStorage.setItem("mira-pm:v1:projects", JSON.stringify({ layout: "gantt", groupBy: 4, properties: ["id", "bogus"], cycleTeamId: "x" }));
    expect(loadPmOptions("projects", "workspace", true)).toMatchObject({ layout: "timeline", groupBy: "none", properties: ["id"], cycleTeamId: null });
    localStorage.setItem("mira-pm:v1:projects", "{not json");
    expect(loadPmOptions("projects", "workspace", true)).toEqual(defaultPmOptions("workspace"));
  });

  test("isDefaultPm ignores collapsed groups and property order, and Priority when the field is missing", () => {
    const d = defaultPmOptions("team");
    expect(isDefaultPm({ ...d, collapsed: ["status:planned"], properties: [...d.properties].reverse() }, "team")).toBe(true);
    expect(isDefaultPm({ ...d, layout: "board" }, "team")).toBe(false);
    expect(isDefaultPm({ ...d, showPis: true }, "team")).toBe(false);
    expect(isDefaultPm(normalizePmOptions(d, { priority: false }), "team", false)).toBe(true);
  });
});

describe("closed window (ruling 6)", () => {
  const done = (daysAgo: number | null) => makeProject({
    status_category: "completed", completed_at: daysAgo === null ? null : new Date(NOW - daysAgo * DAY).toISOString(),
  });
  test("All keeps everything, Recent the last 14 days of Completed, None no Completed; open projects always stay", () => {
    expect([done(20), done(3)].map((p) => inClosedWindow(p, "all", NOW))).toEqual([true, true]);
    expect([done(20), done(13), done(null)].map((p) => inClosedWindow(p, "recent", NOW))).toEqual([false, true, false]);
    expect(inClosedWindow(done(1), "none", NOW)).toBe(false);
    expect(inClosedWindow(makeProject(), "none", NOW)).toBe(true);
  });
});

describe("filters", () => {
  const a = makeProject({ id: 1, name: "Alfred Onboarding", status_category: "started", priority: 2, labels: ["ml"], lead: DANA,
    team_id: 9001, initiative_id: 251, pi_id: 701, target: "2026-10-01", ...health("off_track") });
  const b = makeProject({ id: 2, name: "CCMS Metrics", status_category: "backlog", priority: 0, labels: [], lead: null, team_id: 9002,
    initiative_id: null, pi_id: null, target: null });
  const c = makeProject({ id: 3, name: "Done thing", status_category: "completed", target: "2026-09-01", completed_at: "2026-09-02T00:00:00Z",
    team_id: 9002, ...health("on_track") });
  const all = [a, b, c];
  const pick = (f: Parameters<typeof matchesProject>[1], context = ctx()) => all.filter((p) => matchesProject(p, f, context)).map((p) => p.id);

  test("the menu's fields in the spec's order, Priority only with the field", () => {
    expect(pmFilterFields(true).map(([, l]) => l)).toEqual(
      ["Status", "Priority", "Labels", "Teams", "Lead", "Health", "Dates", "Capabilities", "PI", "Title"]);
    expect(pmFilterFields(false).map(([, l]) => l)).not.toContain("Priority");
  });

  test("each field ORs its values and ANDs with the others", () => {
    expect(pick({ status: ["started", "backlog"] })).toEqual([1, 2]);
    expect(pick({ priority: [2] })).toEqual([1]);
    expect(pick({ labels: ["ml"] })).toEqual([1]);
    expect(pick({ labels: [null] })).toEqual([2, 3]);
    expect(pick({ teams: [9002] })).toEqual([2, 3]);
    expect(pick({ lead: [null] })).toEqual([2]);
    expect(pick({ lead: [501] })).toEqual([1, 3]);
    expect(pick({ health: ["off_track", "none"] })).toEqual([1, 2]);
    expect(pick({ initiatives: [251] })).toEqual([1, 3]);
    expect(pick({ initiatives: [null] })).toEqual([2]);
    expect(pick({ pi: [701] })).toEqual([1, 3]);
    expect(pick({ pi: [null] })).toEqual([2]);
    expect(pick({ status: ["started", "backlog"], teams: [9002] })).toEqual([2]);
  });

  test("Dates: Overdue is past target and not Completed; No target date has none (ruling 14)", () => {
    expect(pick({ dates: ["overdue"] })).toEqual([1]);
    expect(pick({ dates: ["no_target"] })).toEqual([2]);
    expect(pick({ dates: ["overdue", "no_target"] })).toEqual([1, 2]);
  });

  test("Title contains, case-insensitive; blank matches all", () => {
    expect(pick({ title: "onboard" })).toEqual([1]);
    expect(pick({ title: "METRICS" })).toEqual([2]);
    expect(pick({ title: "  " })).toEqual([1, 2, 3]);
  });

  test("a priority filter is ignored without the field (Review Focus 5)", () => {
    expect(pick({ priority: [2] }, ctx({ priority: false }))).toEqual([1, 2, 3]);
  });

  test("Teams also matches the teams of a project's loaded issues (ruling 13)", () => {
    const issues: Record<number, Issue> = { 1: makeIssue({ id: 1, project_id: 1, team_id: 9002 }) };
    expect(pick({ teams: [9002] }, ctx({ issues }))).toEqual([1, 2, 3]);
  });

  test("isOverdue: target before today and not Completed; today itself is not overdue", () => {
    expect(isOverdue(makeProject({ target: "2026-10-18" }), NOW)).toBe(true);
    expect(isOverdue(makeProject({ target: "2026-10-19" }), NOW)).toBe(false);
    expect(isOverdue(makeProject({ target: null }), NOW)).toBe(false);
    expect(isOverdue(makeProject({ target: "2026-09-01", status_category: "completed" }), NOW)).toBe(false);
  });
});

describe("sorting", () => {
  const p = (id: number, rank: string, over: Partial<Project> = {}) => makeProject({ id, name: `P${id}`, rank, ...over });
  const x = p(1, "b", { priority: 0, target: null, progress: 0.5, updated_at: "2026-10-10T00:00:00Z" });
  const y = p(2, "a", { priority: 3, target: "2026-12-01", progress: 0.2, updated_at: "2026-10-12T00:00:00Z" });
  const z = p(3, "c", { priority: 1, target: "2026-11-01", progress: 0.5, updated_at: "2026-10-12T00:00:00Z" });
  const w = p(4, "d", { priority: 3, target: "2026-11-01", progress: 0.9, updated_at: "2026-10-01T00:00:00Z" });
  const ps = [x, y, z, w];

  test("manual is Rally's rank (ruling 7)", () => expect(names(sortProjects(ps, "manual"))).toEqual(["P2", "P1", "P3", "P4"]));
  test("priority: Urgent first, No priority last, ties by rank", () =>
    expect(names(sortProjects(ps, "priority"))).toEqual(["P3", "P2", "P4", "P1"]));
  test("target date: soonest first, none last, ties by rank", () =>
    expect(names(sortProjects(ps, "target"))).toEqual(["P3", "P4", "P2", "P1"]));
  test("progress: most done first, ties by rank", () => expect(names(sortProjects(ps, "progress"))).toEqual(["P4", "P1", "P3", "P2"]));
  test("updated: newest first, ties by rank", () => expect(names(sortProjects(ps, "updated"))).toEqual(["P2", "P3", "P1", "P4"]));
  test("sorting doesn't touch its input", () => {
    sortProjects(ps, "priority");
    expect(names(ps)).toEqual(["P1", "P2", "P3", "P4"]);
  });
});

describe("grouping", () => {
  const o = (over: Partial<PmOptions>) => ({ ...defaultPmOptions("team"), ...over });
  const ps = [
    makeProject({ id: 1, name: "Done", status_category: "completed", rank: "a", ...health("on_track") }),
    makeProject({ id: 2, name: "Going", status_category: "started", rank: "b", ...health("off_track") }),
    makeProject({ id: 3, name: "Later", status_category: "backlog", rank: "c", lead: null, pi_id: 702, initiative_id: null }),
    makeProject({ id: 4, name: "Next", status_category: "planned", rank: "d", ...health("at_risk"), lead: SAM, team_id: 9002 }),
  ];

  test("no grouping is one group in the chosen order", () => {
    const g = groupProjects(ps, o({ orderBy: "manual" }), ctx());
    expect(g.map((x) => x.key)).toEqual(["all"]);
    expect(names(g[0].projects)).toEqual(["Done", "Going", "Later", "Next"]);
  });

  test("status groups are Backlog, Planned, In Progress, Completed", () => {
    expect(groupProjects(ps, o({ groupBy: "status" }), ctx()).map((g) => g.label)).toEqual(["Backlog", "Planned", "In Progress", "Completed"]);
  });

  test("health groups are On track, At risk, Off track, No updates", () => {
    expect(groupProjects(ps, o({ groupBy: "health" }), ctx()).map((g) => g.label)).toEqual(["On track", "At risk", "Off track", "No updates"]);
  });

  test("empty groups are left out, except a board's columns with Show empty columns", () => {
    const two = ps.slice(0, 2);
    expect(groupProjects(two, o({ groupBy: "status" }), ctx()).map((g) => g.label)).toEqual(["In Progress", "Completed"]);
    expect(groupProjects(two, o({ groupBy: "status", layout: "board", showEmpty: true }), ctx()).map((g) => g.label))
      .toEqual(["Backlog", "Planned", "In Progress", "Completed"]);
  });

  test("lead, team, initiative and PI groups are named, with the \"No …\" group last", () => {
    expect(groupProjects(ps, o({ groupBy: "lead" }), ctx()).map((g) => g.label)).toEqual(["Dana Demo", "Sam Sample", "No lead"]);
    expect(groupProjects(ps, o({ groupBy: "team" }), ctx()).map((g) => g.label)).toEqual(["AI/ML Solutions", "Data Services"]);
    expect(groupProjects(ps, o({ groupBy: "initiative" }), ctx()).map((g) => g.label)).toEqual(["Growth", "No capability"]);
    expect(groupProjects([...ps, makeProject({ id: 5, pi_id: null })], o({ groupBy: "pi" }), ctx()).map((g) => g.label))
      .toEqual(["PI 4", "PI 5", "No PI"]);
  });

  test("a capability not loaded yet is named by its id in Rally's word", () => {
    expect(groupProjects(ps, o({ groupBy: "initiative" }), ctx({ initiatives: {} })).map((g) => g.label)).toEqual(["Capability 251", "No capability"]);
    expect(pmValueLabel("initiatives", 251, ctx({ initiatives: {} }))).toBe("Capability 251");
  });

  test("PI groups and filter options join a PI's team copies, and an unknown PI never shows its id", () => {
    const pis = [makeProject({ id: 1, pi_id: 701 }), makeProject({ id: 2, pi_id: 703 }), makeProject({ id: 3, pi_id: 9999901 }),
      makeProject({ id: 4, pi_id: 9999902 }), makeProject({ id: 5, pi_id: null })];
    const g = groupProjects(pis, o({ groupBy: "pi" }), ctx());
    expect(g.map((x) => [x.label, x.projects.map((p) => p.id)])).toEqual([["PI 4", [1, 2]], ["Unknown PI", [3, 4]], ["No PI", [5]]]);
    expect(pmFilterOptions("pi", pis, ctx()).map((x) => x.label)).toEqual(["PI 4", "Unknown PI", "No PI"]);
    expect(pis.filter((p) => matchesProject(p, { pi: [701] }, ctx())).map((p) => p.id)).toEqual([1, 2]);
    expect(pis.filter((p) => matchesProject(p, { pi: ["unknown"] }, ctx())).map((p) => p.id)).toEqual([3, 4]);
    expect(pmValueLabel("pi", 9999901, ctx())).toBe("Unknown PI");
    const years = [makeProject({ id: 6, pi_id: 702 }), makeProject({ id: 7, pi_id: 701 })];
    expect(pmFilterOptions("pi", years, ctx()).map((x) => x.label)).toEqual(["PI 4", "PI 5"]); // by date, not by label
  });

  test("PIs sharing a name across years get the year in groups and filter hints; a unique PI stays bare", () => {
    const old: Release = { id: 650, name: "PI 4", start: "2025-09-11", end: "2025-12-31", ids: [650] };
    const undated: Release = { id: 640, name: "PI 4", start: "2024-09-12", end: null, ids: [640] };
    const c = ctx({ releases: { 701: PI4, 703: PI4, 702: PI5, 650: old, 640: undated } });
    const pis = [makeProject({ id: 1, pi_id: 703 }), makeProject({ id: 2, pi_id: 650 }), makeProject({ id: 3, pi_id: 702 }),
      makeProject({ id: 4, pi_id: 640 })];
    // The end date's year; the start date's when there is no end.
    expect(groupProjects(pis, o({ groupBy: "pi" }), c).map((g) => g.label)).toEqual(["PI 4 · 2024", "PI 4 · 2025", "PI 4 · 2026", "PI 5"]);
    const opts = pmFilterOptions("pi", pis, c);
    expect(opts.map((x) => [x.label, x.hint ?? null])).toEqual([["PI 4", "2024"], ["PI 4", "2025"], ["PI 4", "2026"], ["PI 5", null]]);
    expect(pmFilterOptions("pi", [pis[2]], c).map((x) => [x.label, x.hint ?? null])).toEqual([["PI 5", null]]);
    expect(groupProjects([pis[0]], o({ groupBy: "pi" }), c).map((g) => g.label)).toEqual(["PI 4"]); // alone in the list: bare
  });

  test("priority groups follow Linear's order; without the field there is no priority grouping", () => {
    const pri = [makeProject({ id: 1, priority: 0 }), makeProject({ id: 2, priority: 4 }), makeProject({ id: 3, priority: 1 })];
    expect(groupProjects(pri, o({ groupBy: "priority" }), ctx()).map((g) => g.label)).toEqual(["Urgent", "Low", "No priority"]);
    expect(groupProjects(pri, o({ groupBy: "priority" }), ctx({ priority: false })).map((g) => g.key)).toEqual(["all"]);
  });

  test("projects inside a group keep the ordering", () => {
    const g = groupProjects([makeProject({ id: 1, name: "B", rank: "b" }), makeProject({ id: 2, name: "A", rank: "a" })], o({ groupBy: "status" }), ctx());
    expect(names(g[0].projects)).toEqual(["A", "B"]);
  });
});


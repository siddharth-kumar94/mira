import { expect, test } from "vitest";
import type { Issue, Team } from "../api/types";
import { AIML, DANA, DEMO_TEAM, makeIssue, makeProject, SAM, SPRINT3, SPRINT3_AIML, SPRINT4 } from "../test/fixtures";
import { buildGroups, comparator, cycleKey, filterOptions, groupPrefill, groupTotal, inScope, matches, teamScopeIds, toggleFilter, viewKey, withScopePrefill, type Context } from "./model";
import type { DisplayOptions } from "./types";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const ctx: Context = {
  meId: 501, now: NOW, users: { 501: DANA, 502: SAM },
  projects: { 201: makeProject(), 202: makeProject({ id: 202, key: "F202", name: "Real project", team_id: 9002 }) },
  cycles: { 301: SPRINT3, 302: SPRINT4, 401: SPRINT3_AIML }, memberIds: [501, 502], teamId: 9001,
  teams: { 9001: DEMO_TEAM, 9002: AIML },
};
const opts = (over: Partial<DisplayOptions> = {}): DisplayOptions =>
  ({ layout: "list", groupBy: "status", orderBy: "priority", showEmpty: false, completed: "two_weeks", collapsed: [], properties: [], ...over });
const ids = (xs: Issue[]) => xs.map((i) => i.id);

const open = makeIssue({ id: 1, status: "todo" });
const doneRecently = makeIssue({ id: 2, status: "done", completed_at: "2026-10-10T00:00:00.000Z" });
const doneLongAgo = makeIssue({ id: 3, status: "done", completed_at: "2026-09-01T00:00:00.000Z" });
const theirs = makeIssue({ id: 4, assignee: SAM, creator: DANA });
const backlog = makeIssue({ id: 5, status: "backlog", cycle_id: null });
const otherTeam = makeIssue({ id: 6, team_id: 9002 });

test("My stories: assigned or created by you, open or done in the last 14 days, across teams", () => {
  const all = [open, doneRecently, doneLongAgo, theirs, backlog, otherTeam];
  expect(ids(all.filter((i) => inScope(i, { kind: "my", tab: "assigned" }, ctx)))).toEqual([1, 2, 5, 6]);
  expect(ids(all.filter((i) => inScope(i, { kind: "my", tab: "created" }, ctx)))).toEqual([1, 2, 4, 5, 6]);
});

test("Team tabs: Active excludes Backlog and Done (D31); Backlog is Backlog; All is everything in the team", () => {
  const all = [open, doneRecently, doneLongAgo, theirs, backlog, otherTeam];
  const team = (tab: "active" | "backlog" | "all") => ids(all.filter((i) => inScope(i, { kind: "team", teamId: 9001, tab }, ctx)));
  expect(team("active")).toEqual([1, 4]);
  expect(team("backlog")).toEqual([5]);
  expect(team("all")).toEqual([1, 2, 3, 4, 5]);
});

const team = (id: number, parent_id: number | null, level: Team["level"] = "team"): Team => ({ id, name: `Team ${id}`, level, parent_id });

test("teamScopeIds: a team and all its descendants by parent, and a parent loop ends", () => {
  const teams = { 10: team(10, null, "art"), 11: team(11, 10), 12: team(12, 10), 13: team(13, 12), 20: team(20, null) };
  expect(teamScopeIds(10, teams)).toEqual([10, 11, 12, 13]);
  expect(teamScopeIds(12, teams)).toEqual([12, 13]);
  expect(teamScopeIds(20, teams)).toEqual([20]);
  expect(teamScopeIds(99, teams)).toEqual([99]); // unknown: itself
  const loop = { 1: team(1, 2), 2: team(2, 1) };
  expect(teamScopeIds(1, loop)).toEqual([1, 2]);
});

test("inScope with an ART: an issue of a child's child team is in the ART's Active", () => {
  const art = { kind: "team", teamId: 10, tab: "active" } as const;
  const scoped = { meId: 501, now: NOW, scopeTeamIds: [10, 11, 12, 13] };
  expect(inScope(makeIssue({ team_id: 13, status: "todo" }), art, scoped)).toBe(true);
  expect(inScope(makeIssue({ team_id: 13, status: "backlog" }), art, scoped)).toBe(false); // the tab still applies
  expect(inScope(makeIssue({ team_id: 20, status: "todo" }), art, scoped)).toBe(false);
  expect(inScope(makeIssue({ team_id: 10, status: "todo" }), art, { meId: 501, now: NOW })).toBe(true); // no scope ids: the team alone
  expect(inScope(makeIssue({ team_id: 13, status: "todo" }), art, { meId: 501, now: NOW })).toBe(false);
});

test("filters OR within a field and AND across fields; null means none", () => {
  const unassigned = makeIssue({ id: 7, assignee: null, priority: 1 });
  expect(matches(unassigned, { assignee: [null] })).toBe(true);
  expect(matches(unassigned, { assignee: [null], priority: [2, 3] })).toBe(false);
  expect(matches(makeIssue({ labels: ["ux", "PI4"] }), { label: ["PI4"] })).toBe(true);
  expect(matches(makeIssue({ labels: [] }), { label: [null] })).toBe(true);
  expect(matches(open, {})).toBe(true);
  expect(toggleFilter(toggleFilter({}, "status", "todo"), "status", "todo")).toEqual({});
});

test("ordering: priority puts Urgent first and No priority last; updated is newest first; manual is rank", () => {
  const xs = [makeIssue({ id: 1, priority: 0, rank: "a" }), makeIssue({ id: 2, priority: 3, rank: "b" }), makeIssue({ id: 3, priority: 1, rank: "c" })];
  expect(ids([...xs].sort(comparator("priority")))).toEqual([3, 2, 1]);
  expect(ids([...xs].sort(comparator("manual")))).toEqual([1, 2, 3]);
  const newer = makeIssue({ id: 9, updated_at: "2026-10-16T11:00:00.000Z" });
  expect(ids([makeIssue({ id: 8 }), newer].sort(comparator("updated")))).toEqual([9, 8]);
});

test("status groups: list leads with work in flight, board follows the workflow, empty groups on request", () => {
  const xs = [open, makeIssue({ id: 10, status: "in_progress" }), backlog];
  expect(buildGroups(xs, opts(), ctx).map((g) => g.label)).toEqual(["In Progress", "Todo", "Backlog"]);
  expect(buildGroups(xs, opts({ layout: "board", showEmpty: true }), ctx).map((g) => g.label))
    .toEqual(["Backlog", "Todo", "In Progress", "In Review", "Done"]);
});

test("assignee groups: you first, then people by name, No assignee last; empty ones are the team's people", () => {
  const xs = [makeIssue({ id: 1, assignee: SAM }), makeIssue({ id: 2, assignee: null }), makeIssue({ id: 3 })];
  expect(buildGroups(xs, opts({ groupBy: "assignee" }), ctx).map((g) => g.label)).toEqual(["Dana Demo", "Sam Sample", "No assignee"]);
  const empty = buildGroups([], opts({ groupBy: "assignee", showEmpty: true }), ctx);
  expect(empty.map((g) => [g.label, g.value])).toEqual([["Dana Demo", 501], ["Sam Sample", 502], ["No assignee", null]]);
});

test("project and priority groups; filter options name their values", () => {
  const xs = [makeIssue({ id: 1, project_id: 202 }), makeIssue({ id: 2 }), makeIssue({ id: 3, kind: "defect", project_id: null })];
  expect(buildGroups(xs, opts({ groupBy: "project" }), ctx).map((g) => g.label)).toEqual(["[DEMO] Feature A", "Real project", "No feature"]);
  expect(buildGroups(xs, opts({ groupBy: "priority", showEmpty: true }), ctx).map((g) => g.label))
    .toEqual(["Urgent", "High", "Medium", "Low", "No priority"]);
  expect(filterOptions("assignee", [makeIssue({ assignee: null }), makeIssue()], ctx).map((o) => o.label)).toEqual(["Dana Demo", "No assignee"]);
  expect(buildGroups(xs, opts({ groupBy: "none" }), ctx).map((g) => [g.label, g.issues.length])).toEqual([["All stories", 3]]);
});

const PAST = { ...SPRINT3, id: 300, name: "PI 4 · Sprint 2", short_name: "Sprint 2", start: "2026-09-24T04:00:00.000Z", end: "2026-10-08T03:59:59.000Z" };
const focusCtx = { ...ctx, now: NOW, teamId: undefined, cycles: { ...ctx.cycles, 300: PAST } };
const focus = opts({ groupBy: "focus", orderBy: "importance" });

test("Focus: urgent, each team's current cycle, upcoming cycles, other active, backlog, completed", () => {
  const xs = [
    makeIssue({ id: 1, priority: 1, cycle_id: 302 }),                                   // urgent beats its cycle
    makeIssue({ id: 2, cycle_id: 301, status: "todo" }),
    makeIssue({ id: 3, team_id: 9002, cycle_id: 401, status: "in_progress" }),          // AI/ML's own Sprint 3
    makeIssue({ id: 4, cycle_id: 302, status: "todo" }),
    makeIssue({ id: 5, cycle_id: null, status: "in_review" }),
    makeIssue({ id: 6, cycle_id: 300, status: "todo" }),                                // review focus 1: ended cycle
    makeIssue({ id: 7, cycle_id: null, status: "backlog" }),
    makeIssue({ id: 8, status: "done", completed_at: "2026-10-16T09:00:00.000Z" }),
  ];
  const groups = buildGroups(xs, focus, focusCtx);
  expect(groups.map((g) => [g.label, ids(g.issues)])).toEqual([
    ["Urgent stories", [1]],
    ["PI 4 · Sprint 3 · AI/ML Solutions", [3]],
    ["PI 4 · Sprint 3 · Data Services", [2]],
    ["PI 4 · Sprint 4 · Data Services", [4]],
    ["Other active", [5, 6]],
    ["Backlog", [7]],
    ["Completed", [8]],
  ]);
  expect(groups[1].cycle?.id).toBe(401);
  expect(groups[1].teamId).toBe(9002);
});

test("Importance: further along first, then priority, then rank; completed newest first", () => {
  const xs = [
    makeIssue({ id: 1, cycle_id: null, status: "todo", priority: 2, rank: "A" }),
    makeIssue({ id: 2, cycle_id: null, status: "in_progress", priority: 4, rank: "B" }),
    makeIssue({ id: 3, cycle_id: null, status: "in_review", priority: 0, rank: "C" }),
    makeIssue({ id: 4, cycle_id: null, status: "todo", priority: 0, rank: "D" }),
    makeIssue({ id: 5, cycle_id: null, status: "todo", priority: 2, rank: "0" }),
    makeIssue({ id: 6, status: "done", completed_at: "2026-10-15T09:00:00.000Z" }),
    makeIssue({ id: 7, status: "done", completed_at: "2026-10-16T09:00:00.000Z" }),
  ];
  const groups = buildGroups(xs, focus, focusCtx);
  expect(ids(groups[0].issues)).toEqual([3, 2, 5, 1, 4]);
  expect(ids(groups[1].issues)).toEqual([7, 6]);
});

test("Active has no Done (D31); My stories keeps Done inside the completed window", () => {
  const done = (hoursAgo: number) => makeIssue({ status: "done", completed_at: new Date(NOW - hoursAgo * 3600_000).toISOString() });
  const active = { kind: "team", teamId: 9001, tab: "active" } as const;
  const mine = { kind: "my", tab: "assigned" } as const;
  const c = { meId: 501, now: NOW };
  expect(inScope(done(1), active, c)).toBe(false);
  expect(inScope(makeIssue({ status: "in_review" }), active, c)).toBe(true);
  expect(inScope(done(20), mine, c, "day")).toBe(true);
  expect(inScope(done(30), mine, c, "day")).toBe(false);
  expect(inScope(done(30), mine, c, "week")).toBe(true);
  expect(inScope(done(24 * 10), mine, c, "two_weeks")).toBe(true);
  expect(inScope(done(1), mine, c, "none")).toBe(false);
  expect(inScope(makeIssue({ status: "todo" }), mine, c, "none")).toBe(true);
});

test("cycle groups keep each team's sprint separate unless merging is asked for (D29)", () => {
  const xs = [makeIssue({ id: 1, cycle_id: 301 }), makeIssue({ id: 2, team_id: 9002, cycle_id: 401 })];
  expect(buildGroups(xs, opts({ groupBy: "cycle" }), { ...ctx, teamId: undefined }).map((g) => g.label))
    .toEqual(["PI 4 · Sprint 3 · AI/ML Solutions", "PI 4 · Sprint 3 · Data Services"]); // same dates: by team name
  expect(buildGroups(xs, opts({ groupBy: "cycle" }), { ...ctx, teamId: undefined, mergeCycles: true }).map((g) => g.label))
    .toEqual(["PI 4 · Sprint 3"]);
  expect(buildGroups([xs[0]], opts({ groupBy: "cycle" }), ctx).map((g) => g.label)).toEqual(["PI 4 · Sprint 3"]); // a team view
});

test("group totals are points when any issue has an estimate, else a count", () => {
  const [g] = buildGroups([makeIssue({ id: 1, estimate: 3 }), makeIssue({ id: 2, estimate: null }), makeIssue({ id: 3, estimate: 5 })],
    opts({ groupBy: "none" }), ctx);
  expect(groupTotal(g)).toEqual({ points: 8 });
  const [h] = buildGroups([makeIssue({ estimate: null })], opts({ groupBy: "none" }), ctx);
  expect(groupTotal(h)).toEqual({ count: 1 });
});

test("a group's + pre-fills the composer with the group's value", () => {
  const xs = [makeIssue({ id: 1, priority: 1 }), makeIssue({ id: 2, cycle_id: 302, status: "todo", priority: 3 }),
              makeIssue({ id: 3, cycle_id: null, status: "backlog", priority: 3 }), makeIssue({ id: 4, cycle_id: null, status: "todo", priority: 3 })];
  const byLabel = Object.fromEntries(buildGroups(xs, focus, focusCtx).map((g) => [g.label, groupPrefill(g)]));
  expect(byLabel["Urgent stories"]).toEqual({ priority: 1 });
  expect(byLabel["PI 4 · Sprint 4 · Data Services"]).toEqual({ teamId: 9001, cycle_id: 302, status: "todo" });
  expect(byLabel["Backlog"]).toEqual({ status: "backlog" });
  expect(byLabel["Other active"]).toBeNull();
  const status = buildGroups([makeIssue({ status: "in_review" })], opts({ groupBy: "status" }), ctx);
  expect(groupPrefill(status[0])).toEqual({ status: "in_review" });
  const people = buildGroups([makeIssue({ assignee: null })], opts({ groupBy: "assignee" }), ctx);
  expect(groupPrefill(people[0])).toEqual({ assignee_id: null });
  const projects = buildGroups([makeIssue()], opts({ groupBy: "project" }), ctx);
  expect(groupPrefill(projects[0])).toEqual({ project_id: 201 });
});

test("the Cycle filter matches each team's cycle and names the team across teams", () => {
  const xs = [makeIssue({ id: 1, cycle_id: 301 }), makeIssue({ id: 2, team_id: 9002, cycle_id: 401 }), makeIssue({ id: 4, cycle_id: null })];
  const options = filterOptions("cycle", xs, { ...ctx, teamId: undefined });
  expect(options.map((o) => o.label)).toEqual(["PI 4 · Sprint 3 · AI/ML Solutions", "PI 4 · Sprint 3 · Data Services", "No sprint"]);
  expect(ids(xs.filter((i) => matches(i, { cycle: [301] }, ctx)))).toEqual([1]);
});

test("team and estimate filter by their values", () => {
  const xs = [makeIssue({ id: 1, estimate: 3 }), makeIssue({ id: 2, team_id: 9002, estimate: null })];
  expect(ids(xs.filter((i) => matches(i, { team: [9002] })))).toEqual([2]);
  expect(ids(xs.filter((i) => matches(i, { estimate: [null] })))).toEqual([2]);
  expect(filterOptions("estimate", xs, ctx).map((o) => o.label)).toEqual(["3 Points", "No estimate"]);
  expect(filterOptions("team", xs, ctx).map((o) => o.label)).toEqual(["AI/ML Solutions", "Data Services"]);
});

test("cycle scope: the team's issues in any cycle with that name and dates, an ART sibling's included, every status", () => {
  const teams = { 9100: team(9100, null, "art"), 9001: { ...DEMO_TEAM, parent_id: 9100 }, 9002: { ...AIML, parent_id: 9100 }, 9003: team(9003, null) };
  const twin = { ...SPRINT3, id: 501, team_id: 9003 }; // same name and dates, outside the ART
  const cycles = { 301: SPRINT3, 302: SPRINT4, 401: SPRINT3_AIML, 501: twin };
  const xs = [
    makeIssue({ id: 1, cycle_id: 301 }), makeIssue({ id: 2, team_id: 9002, cycle_id: 401 }), makeIssue({ id: 3, cycle_id: 302 }),
    makeIssue({ id: 4, cycle_id: null }), makeIssue({ id: 5, team_id: 9003, cycle_id: 501 }),
    makeIssue({ id: 6, cycle_id: 301, status: "done", completed_at: "2026-08-01T00:00:00.000Z" }), makeIssue({ id: 7, cycle_id: 999 }),
  ];
  const art = { kind: "cycle", teamId: 9100, cycleKey: cycleKey(SPRINT3) } as const;
  const scoped = { meId: 501, now: NOW, cycles, scopeTeamIds: teamScopeIds(9100, teams) };
  expect(ids(xs.filter((i) => inScope(i, art, scoped)))).toEqual([1, 2, 6]);
  const plain = { kind: "cycle", teamId: 9001, cycleKey: cycleKey(SPRINT3) } as const;
  expect(ids(xs.filter((i) => inScope(i, plain, { meId: 501, now: NOW, cycles })))).toEqual([1, 6]);
  expect(viewKey(art)).toBe(`cycle:9100:${cycleKey(SPRINT3)}`);
});

test("project scope: the project's issues across teams", () => {
  const xs = [makeIssue({ id: 1 }), makeIssue({ id: 2, team_id: 9002 }), makeIssue({ id: 3, project_id: 202 }), makeIssue({ id: 4, project_id: null })];
  const scope = { kind: "project", projectId: 201 } as const;
  expect(ids(xs.filter((i) => inScope(i, scope, ctx)))).toEqual([1, 2]);
  expect(viewKey(scope)).toBe("project:201");
});

test("a scope's prefill goes under the group's; a group with its own cycle drops the scope's cycle key; no + stays no +", () => {
  const cyclePage = { teamId: 9001, cycle_id: 301, cycleKey: cycleKey(SPRINT3) };
  expect(withScopePrefill({ status: "todo" }, cyclePage)).toEqual({ ...cyclePage, status: "todo" });
  expect(withScopePrefill({ teamId: 9002, cycle_id: 401, status: "todo" }, cyclePage))
    .toEqual({ teamId: 9002, cycle_id: 401, status: "todo", cycleKey: undefined });
  expect(withScopePrefill(null, cyclePage)).toBeNull();
  expect(withScopePrefill({ status: "todo" }, null)).toEqual({ status: "todo" });
  expect(withScopePrefill({ status: "todo" }, { project_id: 201 })).toEqual({ project_id: 201, status: "todo" });
});

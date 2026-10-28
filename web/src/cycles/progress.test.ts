import { expect, test } from "vitest";
import type { Cycle, CycleStats } from "../api/types";
import { AIML, DANA, DEMO_TEAM, makeIssue, makeProject, SAM } from "../test/fixtures";
import type { Context } from "../views/model";
import { breakdown, capacityFraction, cycleStatus, mergedCycleRows, percent, progressOf } from "./progress";

const cycle = (id: number, start: string, end: string, over: Partial<Cycle> = {}): Cycle => ({
  id, team_id: 9001, name: `PI 4 · Sprint ${id}`, short_name: `Sprint ${id}`, start, end, capacity: null, ...over,
});
const A = cycle(1, "2026-09-24T04:00:00.000Z", "2026-10-08T03:59:59.000Z");
const B = cycle(2, "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z");
const C = cycle(3, "2026-10-22T04:00:00.000Z", "2026-11-05T03:59:59.000Z");
const D = cycle(4, "2026-11-05T04:00:00.000Z", "2026-11-19T03:59:59.000Z");
const ALL = [D, B, A, C]; // order of the input does not matter
const stat = (cycle_id: number, over: Partial<CycleStats> = {}): CycleStats =>
  ({ cycle_id, scope: 0, started: 0, completed: 0, issue_count: 0, ...over });

test("cycleStatus: past, current, upcoming (the first after now), then planned (ruling 3)", () => {
  const now = Date.parse("2026-10-16T12:00:00.000Z");
  expect([A, B, C, D].map((c) => cycleStatus(c, ALL, now))).toEqual(["past", "current", "upcoming", "planned"]);
});

test("cycleStatus: now exactly at a cycle's end is still current", () => {
  expect(cycleStatus(B, ALL, Date.parse(B.end))).toBe("current");
  expect(cycleStatus(C, ALL, Date.parse(B.end))).toBe("upcoming");
});

test("cycleStatus: an ART's same-dated copies of the next cycle are all upcoming", () => {
  const twin = { ...C, id: 33, team_id: 9002 };
  const now = Date.parse("2026-10-16T12:00:00.000Z");
  expect([C, twin, D].map((c) => cycleStatus(c, [...ALL, twin], now))).toEqual(["upcoming", "upcoming", "planned"]);
});

test("progressOf: the same numbers as the server's stats (ruling 2)", () => {
  const issues = [
    makeIssue({ id: 1, estimate: 3, status: "in_progress" }),
    makeIssue({ id: 2, estimate: 5, status: "in_review" }),
    makeIssue({ id: 3, estimate: 2, status: "done" }),
    makeIssue({ id: 4, estimate: null, status: "todo" }),
  ];
  expect(progressOf(issues)).toEqual({ scope: 10, started: 8, completed: 2, count: 4 });
});

test("progressOf: unestimated issues give zeros, and percent of nothing is 0, never NaN (Review Focus 4)", () => {
  const issues = [makeIssue({ id: 1, estimate: null, status: "done" }), makeIssue({ id: 2, estimate: null, status: "in_progress" })];
  expect(progressOf(issues)).toEqual({ scope: 0, started: 0, completed: 0, count: 2 });
  expect(progressOf([])).toEqual({ scope: 0, started: 0, completed: 0, count: 0 });
  expect(percent(0, 0)).toBe(0);
  expect(percent(3, 0)).toBe(0);
  expect(percent(7, 18)).toBe(39);
  expect(percent(3, 18)).toBe(17);
});

test("capacityFraction: scope over capacity, null when no capacity is set", () => {
  expect(capacityFraction(18, 30)).toBeCloseTo(0.6);
  expect(capacityFraction(0, 30)).toBe(0);
  expect(capacityFraction(18, null)).toBeNull();
  expect(capacityFraction(18, 0)).toBeNull();
});

test("mergedCycleRows: one row per cycle, newest first, stats by id (zeros when missing)", () => {
  const rows = mergedCycleRows([A, C, B], { 2: stat(2, { scope: 18 }), 3: stat(3, { scope: 8 }) }, false);
  expect(rows.map((r) => r.cycle.id)).toEqual([3, 2, 1]);
  expect(rows.map((r) => r.ids)).toEqual([[3], [2], [1]]);
  expect(rows.map((r) => r.stats.scope)).toEqual([8, 18, 0]);
  expect(new Set(rows.map((r) => r.key)).size).toBe(3);
});

test("mergedCycleRows: with merge, same name and dates are one row with summed stats; other dates stay apart", () => {
  const twin = { ...B, id: 22, team_id: 9002, capacity: 10 };
  const shifted = { ...B, id: 23, team_id: 9003, start: "2026-10-09T04:00:00.000Z" };
  const stats = {
    2: stat(2, { scope: 10, started: 4, completed: 2, issue_count: 5 }),
    22: stat(22, { scope: 8, started: 3, completed: 1, issue_count: 3 }),
    23: stat(23, { scope: 1 }),
  };
  const rows = mergedCycleRows([A, { ...B, capacity: 20 }, twin, shifted], stats, true);
  expect(rows.map((r) => r.ids)).toEqual([[23], [2, 22], [1]]);
  expect(rows[1].stats).toMatchObject({ scope: 18, started: 7, completed: 3, issue_count: 8 });
  expect(rows[1].cycle.capacity).toBe(30); // the copies' capacities add up, as their scopes do
  // Without merge the twins stay two rows.
  expect(mergedCycleRows([A, B, twin], stats, false)).toHaveLength(3);
});

/** Linear's Cycle 1 (inventory-p4 §4.2, priorities read off cycle-page.png): 18 points, 3 done, 7 in flight. */
const INVENTORY = [
  makeIssue({ id: 4, status: "in_review", priority: 3, estimate: 2 }),
  makeIssue({ id: 1, status: "in_progress", priority: 2, estimate: 5 }),
  makeIssue({ id: 3, status: "todo", priority: 2, estimate: 5 }),
  makeIssue({ id: 2, status: "todo", priority: 3, estimate: 3 }),
  makeIssue({ id: 5, status: "done", priority: 4, estimate: 3 }),
];
const CTX: Context = {
  meId: 501, now: 0, users: { 501: DANA, 502: SAM }, cycles: {}, teams: { 9001: DEMO_TEAM, 9002: AIML },
  projects: { 201: makeProject(), 202: makeProject({ id: 202, name: "Real feature", team_id: 9002 }) },
};
const shown = (rows: ReturnType<typeof breakdown>) => rows.map((r) => `${r.label} ${percent(r.done, r.total)}% of ${r.total}`);

test("breakdown by priority: Linear's rows, High 13% of 10, Medium 10% of 5, Low 100% of 3", () => {
  // Done points count whole and in-flight points a quarter, which is what makes Linear's 13%, 10% and 26%.
  expect(breakdown(INVENTORY, "priority", CTX)).toEqual([
    { key: "p2", label: "High", done: 1.25, total: 10 },
    { key: "p3", label: "Medium", done: 0.5, total: 5 },
    { key: "p4", label: "Low", done: 3, total: 3 },
  ]);
  expect(shown(breakdown(INVENTORY, "priority", CTX))).toEqual(["High 13% of 10", "Medium 10% of 5", "Low 100% of 3"]);
  expect(shown(breakdown(INVENTORY, "assignees", CTX))).toEqual(["Dana Demo 26% of 18"]);
  expect(shown(breakdown(INVENTORY, "projects", CTX))).toEqual(["[DEMO] Feature A 26% of 18"]);
  expect(shown(breakdown(INVENTORY, "teams", CTX))).toEqual(["Data Services 26% of 18"]);
});

test("breakdown: largest first, the \"No …\" rows last whatever their size; an issue counts under each of its labels", () => {
  const xs = [
    makeIssue({ id: 1, estimate: 2, labels: ["api", "ui"] }),
    makeIssue({ id: 2, estimate: 5, labels: ["ui"], assignee: SAM, team_id: 9002, project_id: 202, status: "done" }),
    makeIssue({ id: 3, estimate: 20, labels: [], assignee: null, priority: 0, project_id: null, status: "todo" }),
    makeIssue({ id: 4, estimate: null, labels: ["api"] }),
  ];
  expect(breakdown(xs, "labels", CTX)).toEqual([
    { key: "l:ui", label: "ui", done: 5.5, total: 7 },
    { key: "l:api", label: "api", done: 0.5, total: 2 },
    { key: "none", label: "No labels", done: 0, total: 20 },
  ]);
  expect(breakdown(xs, "assignees", CTX).map((r) => r.label)).toEqual(["Sam Sample", "Dana Demo", "No assignee"]);
  expect(breakdown(xs, "priority", CTX).map((r) => r.label)).toEqual(["High", "No priority"]);
  expect(breakdown(xs, "projects", CTX).map((r) => r.label)).toEqual(["Real feature", "[DEMO] Feature A", "No feature"]);
  expect(breakdown(xs, "teams", CTX).map((r) => [r.label, r.total])).toEqual([["Data Services", 22], ["AI/ML Solutions", 5]]);
  expect(breakdown([], "labels", CTX)).toEqual([]);
});

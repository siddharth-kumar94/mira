import { expect, test } from "vitest";
import type { Burnup } from "../api/types";
import { axisLabels, chartScale, paths, positions, projection, weekendBands, weeklyGuides } from "./geometry";

const NOW = Date.parse("2026-10-21T12:00:00.000Z"); // the middle of the third day
/** A Mon Oct 19 → Fri Oct 30 cycle, three days in: scope 18 → 20, started (not done) 2 → 4, done 0 → 3. */
const B: Burnup = {
  start: "2026-10-19", end: "2026-10-30",
  points: [
    { day: "2026-10-19", scope: 18, started: 2, completed: 0 },
    { day: "2026-10-20", scope: 20, started: 4, completed: 1 },
    { day: "2026-10-21", scope: 20, started: 4, completed: 3 },
  ],
};
/** Every number in an SVG path string, as [x, y] pairs. */
const coords = (d: string) => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]] as const);
};

test("the scale runs from the start to the end of the last day, and up to the largest scope", () => {
  const s = chartScale(B, 240, 100, NOW);
  expect(s.x(Date.parse("2026-10-19T00:00:00Z"))).toBe(0);
  expect(s.x(Date.parse("2026-10-31T00:00:00Z"))).toBe(240); // 12 days, the 30th included
  expect(s.y(20)).toBe(0);
  expect(s.y(0)).toBe(100);
  expect(s.nowX).toBe(50); // 2.5 days of 20px
});

test("a series with no scope still has a scale (no division by zero)", () => {
  const s = chartScale({ ...B, points: [{ day: "2026-10-19", scope: 0, started: 0, completed: 0 }] }, 240, 100, NOW);
  expect(s.y(0)).toBe(100);
  expect(Number.isFinite(s.y(1))).toBe(true);
});

test("points sit at the end of their day, today's at now, after an origin at the start; started includes done", () => {
  const s = chartScale(B, 240, 100, NOW);
  expect(positions(B, s)).toEqual([
    { x: 0, scope: 18, started: 0, completed: 0 },
    { x: 20, scope: 18, started: 2, completed: 0 },
    { x: 40, scope: 20, started: 5, completed: 1 },
    { x: 50, scope: 20, started: 7, completed: 3 },
  ]);
});

test("paths for a 3-point series have monotone x and reach the top at the max scope", () => {
  const s = chartScale(B, 240, 100, NOW);
  const p = paths(B, s);
  for (const d of [p.scope, p.started, p.completed]) {
    const xs = coords(d).map(([x]) => x);
    expect(xs.length).toBeGreaterThan(1);
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1])).toBe(true);
  }
  const scope = coords(p.scope);
  expect(scope[0]).toEqual([0, 10]); // 18 of 20
  expect(Math.min(...scope.map(([, y]) => y))).toBe(0); // 20 is the top
  expect(scope.at(-1)).toEqual([240, 0]); // scope runs on, flat, to the end
  expect(coords(p.completed).at(-1)).toEqual([50, 85]); // 3 of 20, at now
  expect(coords(p.started).at(-1)).toEqual([50, 65]); // 4 started + 3 done
  // The area closes along the baseline.
  expect(p.scopeArea.startsWith(p.scope)).toBe(true);
  expect(p.scopeArea).toMatch(/L240,100L0,100Z$/);
});

test("an empty series draws nothing", () => {
  const empty = { ...B, points: [] };
  const p = paths(empty, chartScale(empty, 240, 100, NOW));
  expect(p).toEqual({ scope: "", scopeArea: "", started: "", startedArea: "", completed: "", completedArea: "" });
});

test("a cycle from Fri to the next Thu has bands for Sat and Sun", () => {
  const b: Burnup = { start: "2026-10-16", end: "2026-10-22", points: [] };
  const s = chartScale(b, 70, 100, NOW);
  expect(weekendBands(b.start, b.end, s)).toEqual([{ x: 10, w: 10 }, { x: 20, w: 10 }]);
});

test("projection: the scope spread over the working days from (start, 0), flat on weekends (Linear's measured line)", () => {
  // Mon Oct 19 → Sun Nov 1, 20px a day: 10 working days, so 2 of the 20 points a weekday (10px up each).
  const b: Burnup = { ...B, end: "2026-11-01" };
  const s = chartScale(b, 280, 100, NOW);
  const pts = coords(projection(b, b.end, s)!);
  expect(pts[0]).toEqual([0, 100]); // the origin, not the first point
  expect(pts.find(([x]) => x === 100)).toEqual([100, 50]); // Friday's end: half the scope
  expect(pts.filter(([x]) => x >= 100 && x <= 140).map(([, y]) => y)).toEqual([50, 50, 50]); // flat over Sat and Sun
  expect(pts.find(([x]) => x === 240)).toEqual([240, 0]); // the scope at the end of the last working day
  expect(pts.at(-1)).toEqual([280, 0]); // then flat across the last weekend
  expect(pts.every(([, y]) => y >= 0 && y <= 100)).toBe(true);
  // Day 1 has one point and still projects; no points, or a cycle that has ended, has none.
  expect(projection({ ...b, points: B.points.slice(0, 1) }, b.end, s)).not.toBeNull();
  expect(projection({ ...b, points: [] }, b.end, s)).toBeNull();
  expect(projection(b, b.end, chartScale(b, 280, 100, Date.parse("2026-11-02T00:00:00Z")))).toBeNull();
});

test("projection: a cycle with no scope stays on the baseline; one with no working days has none", () => {
  const zero: Burnup = { ...B, points: B.points.map((p) => ({ ...p, scope: 0, started: 0, completed: 0 })) };
  const s = chartScale(zero, 240, 100, NOW);
  expect(coords(projection(zero, zero.end, s)!).every(([, y]) => y === 100)).toBe(true);
  const weekend: Burnup = { start: "2026-10-24", end: "2026-10-25", points: [{ day: "2026-10-24", scope: 5, started: 0, completed: 0 }] };
  expect(projection(weekend, weekend.end, chartScale(weekend, 40, 100, Date.parse("2026-10-24T12:00:00Z")))).toBeNull();
});

test("weekly guides fall 7 days apart inside the range", () => {
  const s = chartScale(B, 240, 100, NOW);
  expect(weeklyGuides(s)).toEqual([140]);
});

test("axis labels: start, today and end, each once", () => {
  const s = chartScale(B, 480, 100, NOW);
  expect(axisLabels(s, "project").map((l) => [l.text, l.x, l.anchor])).toEqual(
    [["Oct 19", 0, "start"], ["Oct 30", 480, "end"], ["Oct 21", 100, "middle"]]);
  // A cycle's end is the day after its last (Linear's "Nov 2" for a cycle ending Nov 1), and its weeks are marked.
  expect(axisLabels(s, "cycle").map((l) => l.text)).toEqual(["Oct 19", "Oct 31", "Oct 21", "Oct 26"]);
  // Today reads in local time (New York in tests): Oct 22 01:00 UTC is still Oct 21 there; the days stay UTC.
  const late = chartScale(B, 480, 100, Date.parse("2026-10-22T01:00:00Z"));
  expect(axisLabels(late, "project").find((l) => l.anchor === "middle")?.text).toBe("Oct 21");
  // Today on top of the start is dropped.
  const early = chartScale(B, 480, 100, Date.parse("2026-10-19T03:00:00Z"));
  expect(axisLabels(early, "project").map((l) => l.text)).toEqual(["Oct 19", "Oct 30"]);
});

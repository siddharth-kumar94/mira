import { expect, test } from "vitest";
import { makeProject } from "../test/fixtures";
import {
  PX_PER_DAY, bands, barGeometry, dayLabels, isoWeek, makeScale, monthLabels, timelineRange, todayPill, weekLines, weekends,
} from "./timeline";

const TODAY = "2026-10-19";
const year = makeScale("2026-01-01", "year");

test("zoom scales are Linear's, measured: a 31-day month is 77.5 at Year, then 2x, 6x and 12x", () => {
  // Linear's 77.5 grid step is a 31-day month at 2.5 px a day (75 for 30 days, 70 for February), not a week.
  expect(PX_PER_DAY.year * 31).toBe(77.5);
  expect(PX_PER_DAY.year * 30).toBe(75);
  expect([PX_PER_DAY.quarter, PX_PER_DAY.month, PX_PER_DAY.week]).toEqual([5, 15, 30]);
});

test("a scale maps days to x from its origin and back; a timestamp lands inside its local day", () => {
  expect(year.x("2026-01-01")).toBe(0);
  expect(year.x("2026-02-01")).toBe(77.5);
  expect(year.day(77.5)).toBe("2026-02-01");
  expect(year.day(78.9)).toBe("2026-02-01");
  const noon = new Date(2026, 0, 2, 12).toISOString();
  expect(year.x(noon)).toBeCloseTo(2.5 * 1.5);
  expect(makeScale("2026-01-01", "week").x("2026-01-08")).toBe(210);
});

test("a bar spans its start day to the end of its target day", () => {
  const p = makeProject({ start: "2026-06-25", target: "2026-10-01", status_category: "started" });
  const g = barGeometry(p, TODAY, year)!;
  expect(g.left).toBe(year.x("2026-06-25"));
  expect(g.width).toBe(99 * 2.5); // Jun 25 → Oct 1 inclusive, Linear's 247.5
  expect(g.overrun).toBe(year.x(TODAY) - year.x("2026-10-01"));
  expect(g.overrun).toBeGreaterThan(0);
});

test("no start: a 1-day bar at the target (Review Focus 1)", () => {
  const g = barGeometry(makeProject({ start: null, target: "2026-12-01" }), TODAY, year)!;
  expect(g.left).toBe(year.x("2026-12-01"));
  expect(g.width).toBeCloseTo(PX_PER_DAY.year);
  expect(g.overrun).toBe(0);
});

test("a start after the target is swapped: positive width, never NaN (Review Focus 1)", () => {
  const g = barGeometry(makeProject({ start: "2026-12-10", target: "2026-11-10" }), TODAY, year)!;
  expect(g.left).toBe(year.x("2026-11-10"));
  expect(g.width).toBe(31 * 2.5);
  expect(Number.isNaN(g.left + g.width + g.overrun)).toBe(false);
});

test("no target, or an unreadable one: no bar (Review Focus 1)", () => {
  expect(barGeometry(makeProject({ start: "2026-09-01", target: null }), TODAY, year)).toBeNull();
  expect(barGeometry(makeProject({ start: "2026-09-01", target: "soon" }), TODAY, year)).toBeNull();
  // An unreadable start is no start.
  expect(barGeometry(makeProject({ start: "later", target: "2026-12-01" }), TODAY, year)?.width).toBeCloseTo(2.5);
});

test("widths never fall below 1px, even at the narrowest scale", () => {
  const tiny = { ...year, ppd: 0.1, x: (iso: string) => year.x(iso) / 25 };
  expect(barGeometry(makeProject({ start: null, target: "2026-12-01" }), TODAY, tiny)!.width).toBe(1);
});

test("overrun: today past the target and not Completed; Completed, on-time or target today have none", () => {
  const late = makeProject({ start: "2026-09-01", target: "2026-10-12", status_category: "started" });
  expect(barGeometry(late, TODAY, year)!.overrun).toBe(7 * 2.5);
  expect(barGeometry({ ...late, status_category: "completed" }, TODAY, year)!.overrun).toBe(0);
  expect(barGeometry({ ...late, target: TODAY }, TODAY, year)!.overrun).toBe(0);
  expect(barGeometry({ ...late, target: "2026-12-01" }, TODAY, year)!.overrun).toBe(0);
  // "now" mid-day: the overrun reaches the today line.
  const now = new Date(2026, 9, 19, 12).toISOString();
  expect(barGeometry(late, now, year)!.overrun).toBeCloseTo(7.5 * 2.5);
});

test("week lines fall on Mondays", () => {
  const xs = weekLines("2026-01-01", "2026-01-31", year);
  expect(xs.map((x) => year.day(x))).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
});

test("month labels are uppercase at each month's first day; January carries its year", () => {
  const ms = monthLabels("2025-11-15", "2026-03-02", year);
  expect(ms.map((m) => m.label)).toEqual(["DEC", "JAN 2026", "FEB", "MAR"]);
  expect(ms[1].x).toBe(0);
  expect(ms[2].x).toBe(77.5);
});

test("day labels: Mondays of odd ISO weeks at Year, every Monday closer in; week numbers on request", () => {
  const ys = dayLabels("2025-12-28", "2026-02-01", year, false);
  expect(ys.map((d) => d.label)).toEqual(["29", "12", "26"]);
  expect(ys[0].x).toBe(year.x("2025-12-29"));
  expect(dayLabels("2025-12-28", "2026-02-01", year, true).map((d) => d.label)).toEqual(["1", "3", "5"]);
  const q = makeScale("2026-01-01", "quarter");
  expect(dayLabels("2026-01-01", "2026-01-31", q, false).map((d) => d.label)).toEqual(["5", "12", "19", "26"]);
  expect(isoWeek("2026-10-19")).toBe(43);
  expect(isoWeek("2027-01-01")).toBe(53);
});

test("weekends are Saturday and Sunday, two days wide", () => {
  const w = makeScale("2026-01-01", "week");
  const ws = weekends("2026-01-01", "2026-01-12", w);
  expect(ws).toEqual([{ x: w.x("2026-01-03"), width: 60 }, { x: w.x("2026-01-10"), width: 60 }]);
});

test("bands: a date-only end includes its day, a timestamp end is itself; undated or unreadable items are left out", () => {
  const bs = bands([
    { name: "PI 4", start: "2026-10-01", end: "2026-12-31" },
    { name: "Sprint 3", start: new Date(2026, 9, 8).toISOString(), end: new Date(2026, 9, 21, 23, 59, 59).toISOString() },
    { name: "Undated", start: null, end: "2026-12-31" },
    { name: "Bad", start: "x", end: "y" },
    { name: "Backwards", start: "2026-03-10", end: "2026-03-01" },
  ], year);
  expect(bs.map((b) => b.name)).toEqual(["PI 4", "Sprint 3", "Backwards"]);
  expect(bs[0]).toMatchObject({ left: year.x("2026-10-01"), width: 92 * 2.5 });
  expect(bs[1].width).toBeCloseTo(14 * 2.5, 2);
  expect(bs[2]).toMatchObject({ left: year.x("2026-03-01"), width: 10 * 2.5 });
});

test("the range covers every date and today, from a month's first day, with a screen of room either side", () => {
  const ps = [makeProject({ start: "2026-06-25", target: "2026-10-01" }), makeProject({ start: null, target: "2027-02-15" })];
  const r = timelineRange(ps, TODAY, "year");
  expect(r.from.endsWith("-01")).toBe(true);
  expect(r.from < "2026-06-25").toBe(true);
  expect(r.to > "2027-02-15").toBe(true);
  // Nothing dated: today alone. Absurd dates are clamped to five years either side.
  expect(timelineRange([makeProject({ start: null, target: null })], TODAY, "week").from < TODAY).toBe(true);
  expect(timelineRange([makeProject({ start: "1901-01-01", target: "2999-01-01" })], TODAY, "week").from >= "2021-10-01").toBe(true);
});

test("the today pill reads Linear's uppercase month and day", () => {
  expect(todayPill(new Date(2026, 9, 19, 23).getTime())).toBe("OCT 19");
  expect(todayPill(new Date(2026, 0, 5).getTime())).toBe("JAN 5");
});

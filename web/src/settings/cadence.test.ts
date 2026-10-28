import { expect, test } from "vitest";
import type { Cycle } from "../api/types";
import { SPRINT3, SPRINT4 } from "../test/fixtures";
import { cadence } from "./cadence";

/** A cycle of `days` starting on `start`, with Rally's end-of-day end (one second before the next start). */
const cycle = (id: number, start: string, days: number): Cycle => {
  const from = new Date(start);
  const to = new Date(from.getTime() + days * 86_400_000 - 1000);
  return { ...SPRINT3, id, start: from.toISOString(), end: to.toISOString() };
};

test("14-day cycles: every 2 weeks", () => {
  expect(cadence([SPRINT3, SPRINT4])).toBe("Every 2 weeks");
});

test("fewer than 2 cycles: no cadence", () => {
  expect(cadence([SPRINT3])).toBeNull();
  expect(cadence([])).toBeNull();
});

test("one week is 'Every week'; three weeks 'Every 3 weeks'", () => {
  expect(cadence([cycle(1, "2026-10-01T04:00:00Z", 7), cycle(2, "2026-10-08T04:00:00Z", 7)])).toBe("Every week");
  expect(cadence([cycle(1, "2026-10-01T04:00:00Z", 21), cycle(2, "2026-10-22T04:00:00Z", 21)])).toBe("Every 3 weeks");
});

test("the most common length wins, rounded to whole weeks", () => {
  // Two 2-week cycles (one a day short, one ending on the date itself) and a single 1-week one.
  const short = { ...SPRINT3, id: 9, start: "2026-09-10", end: "2026-09-23" };
  expect(cadence([cycle(1, "2026-10-01T04:00:00Z", 7), SPRINT3, short])).toBe("Every 2 weeks");
});

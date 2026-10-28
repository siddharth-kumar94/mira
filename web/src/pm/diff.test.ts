import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Project, Update } from "../api/types";
import { DANA, makeProject } from "../test/fixtures";
import { initiativeRiskRows, ordinalDate, previousOf, updateDiff } from "./diff";

const update = (over: Partial<Update> = {}): Update => ({
  id: 801, author: DANA, health: "on_track", html: "<p>Going well.</p>", created_at: "2026-10-19T12:00:00.000Z",
  progress: 0.52, target: "2027-01-01", ...over,
});
const earlier = (over: Partial<Update> = {}) => update({ id: 800, created_at: "2026-10-16T12:00:00.000Z", progress: 0.37, ...over });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

test("ordinal dates take Linear's suffixes, and the year when asked for or not this year", () => {
  const day = (d: number) => ordinalDate(`2026-10-${String(d).padStart(2, "0")}`);
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(day)).toEqual(
    ["Oct 1st", "Oct 2nd", "Oct 3rd", "Oct 4th", "Oct 11th", "Oct 12th", "Oct 13th", "Oct 21st", "Oct 22nd"]);
  expect(ordinalDate("2027-01-01")).toBe("Jan 1st, 2027");
  expect(ordinalDate("2027-01-01", false)).toBe("Jan 1st");
  expect(ordinalDate("2026-12-01", true)).toBe("Dec 1st, 2026");
});

test("a target with none before it is set; a different one moved; the same one, or one cleared, is no row", () => {
  expect(updateDiff(update(), null)).toEqual([{ label: "Target date", text: "set to Jan 1st, 2027" }]);
  expect(updateDiff(update(), earlier({ target: null }))).toContainEqual({ label: "Target date", text: "set to Jan 1st, 2027" });
  expect(updateDiff(update(), earlier({ target: "2026-12-01" }))).toContainEqual(
    { label: "Target date", text: "moved from Dec 1st to Jan 1st, 2027" });
  expect(updateDiff(update(), earlier()).map((r) => r.label)).not.toContain("Target date");
  expect(updateDiff(update({ target: null }), earlier()).map((r) => r.label)).not.toContain("Target date"); // no Linear wording
});

test("progress since the previous update shows when it moved", () => {
  expect(updateDiff(update(), earlier())).toEqual([{ label: "Progress since Oct 16", text: "37% → 52%" }]);
  expect(updateDiff(update({ progress: 0.37 }), earlier())).toEqual([]); // nothing changed
  expect(updateDiff(update({ target: null, progress: 0 }), null)).toEqual([]);
});

test("a missing footer (progress and target both null, as the server parses it) claims nothing on either side", () => {
  const bare = { progress: null, target: null };
  expect(updateDiff(update(bare), earlier())).toEqual([]); // not "removed", not a progress change
  expect(updateDiff(update(bare), null)).toEqual([]);
  expect(updateDiff(update(), earlier(bare))).toEqual([]); // not "set to …" against an unknown target
});

test("the previous update is the nearest earlier one with a footer, or none for the first", () => {
  const latest = update();
  const rewritten = earlier({ id: 799, progress: null, target: null });
  const footed = earlier({ id: 798, created_at: "2026-10-09T12:00:00.000Z", target: "2026-12-01" });
  expect(previousOf([latest, rewritten, footed], 0)).toBe(footed);
  expect(updateDiff(latest, previousOf([latest, rewritten, footed], 0))).toEqual([
    { label: "Target date", text: "moved from Dec 1st to Jan 1st, 2027" },
    { label: "Progress since Oct 9", text: "37% → 52%" },
  ]);
  expect(previousOf([latest], 0)).toBeNull();
  // Only footerless updates before it: the oldest is returned, and the diff says nothing.
  expect(previousOf([latest, rewritten], 0)).toBe(rewritten);
  expect(updateDiff(latest, previousOf([latest, rewritten], 0))).toEqual([]);
});

test("target rows come before progress rows", () => {
  expect(updateDiff(update(), earlier({ target: "2026-12-01" }))).toEqual([
    { label: "Target date", text: "moved from Dec 1st to Jan 1st, 2027" },
    { label: "Progress since Oct 16", text: "37% → 52%" },
  ]);
});

test("initiative risk rows are the active projects worse than on track", () => {
  const health = (value: "on_track" | "at_risk" | "off_track") => ({ value, source: "update" as const, reason: "" });
  const projects: Project[] = [
    makeProject({ id: 1, key: "F1", name: "Risky", health: health("at_risk") }),
    makeProject({ id: 2, key: "F2", name: "Fine", health: health("on_track") }),
    makeProject({ id: 3, key: "F3", name: "Late", health: { value: "off_track", source: "auto", reason: "Past its target date" } }),
    makeProject({ id: 4, key: "F4", name: "Planned and risky", status_category: "planned", health: health("at_risk") }),
    makeProject({ id: 5, key: "F5", name: "No health", health: null }),
  ];
  expect(initiativeRiskRows(projects)).toEqual([
    { name: "Risky", key: "F1", value: "at_risk" },
    { name: "Late", key: "F3", value: "off_track" },
  ]);
});

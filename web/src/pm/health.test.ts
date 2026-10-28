import { expect, test } from "vitest";
import type { Health, Update } from "../api/types";
import { DANA } from "../test/fixtures";
import { age, healthAria, healthText } from "./health";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const before = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const DAY = 86_400;

const update = (over: Partial<Update> = {}): Update => ({
  id: 801, author: DANA, health: "at_risk", html: "<p>Blocked on review.</p>", created_at: before(3 * DAY),
  progress: 0.4, target: null, ...over,
});
const reported = (value: Health["value"]): Health => ({ value, source: "update", reason: "" });
const auto = (value: Health["value"], reason = "Target in 9 days, 40% done"): Health => ({ value, source: "auto", reason });

test("age reads now, minutes, hours, days, weeks, then months (ruling 9)", () => {
  expect(age(before(30), NOW)).toBe("now");
  expect(age(before(5 * 60), NOW)).toBe("5m");
  expect(age(before(2 * 3600), NOW)).toBe("2h");
  expect(age(before(3 * DAY), NOW)).toBe("3d");
  expect(age(before(15 * DAY), NOW)).toBe("2w");
  expect(age(before(120 * DAY), NOW)).toBe("4mo");
});

test("a reported health shows its label and the latest update's age", () => {
  expect(healthText(reported("at_risk"), update(), NOW)).toEqual({ label: "At risk", age: "3d", none: false });
});

test("Auto health puts Auto in the age slot (D36)", () => {
  expect(healthText(auto("on_track"), null, NOW)).toEqual({ label: "On track", age: "Auto", none: false });
});

test("no target reads No updates", () => {
  expect(healthText(auto("no_target"), null, NOW)).toEqual({ label: "No updates", age: null, none: true });
});

test("no health yet (an issue-side read; the server always sends one) is blank, not No updates", () => {
  expect(healthText(null, null, NOW)).toEqual({ label: "", age: null, none: true });
  expect(healthAria(null, null, "project", NOW)).toBe("");
  expect(healthAria(null, null, "project", NOW, true)).toBe("");
});

test("aria text is Linear's, word for word", () => {
  expect(healthAria(reported("off_track"), update({ health: "off_track" }), "project", NOW))
    .toBe("Off track, last update 3 days ago. Click to open updates.");
  expect(healthAria(auto("no_target"), null, "project", NOW)).toBe("No updates. Click to write update.");
  expect(healthAria(auto("no_target"), null, "project", NOW, true)).toBe("There are no updates for this feature");
  expect(healthAria(auto("no_target"), null, "initiative", NOW, true)).toBe("There are no updates for this capability");
});

test("icon-only aria drops the click hint; one day reads singular", () => {
  expect(healthAria(reported("at_risk"), update({ created_at: before(DAY) }), "initiative", NOW, true))
    .toBe("At risk, last update 1 day ago");
});

test("Auto aria names the reason instead of an update", () => {
  expect(healthAria(auto("at_risk"), null, "initiative", NOW))
    .toBe("At risk, set automatically: Target in 9 days, 40% done. Click to write update.");
});

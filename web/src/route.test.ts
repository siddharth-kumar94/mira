import { expect, test } from "vitest";
import { formatRoute, HOME, parsePath, sameRoute, type Route } from "./route";

test("every route round-trips through its URL", () => {
  const routes: Route[] = [
    { name: "my", tab: "assigned" }, { name: "my", tab: "created" },
    { name: "team", teamId: 9001, tab: "active" }, { name: "team", teamId: 9001, tab: "backlog" },
    { name: "team", teamId: 9001, tab: "all" }, { name: "team", teamId: 9001, tab: "cycles" },
    { name: "team", teamId: 9001, tab: "projects" }, { name: "issue", key: "US1001" },
    { name: "projects" }, { name: "initiatives" }, { name: "settings", section: "preferences" },
    { name: "settings", section: "account" }, { name: "settings", section: "teams" },
    { name: "team-settings", teamId: 9 }, { name: "cycle", teamId: 5, cycleId: 77 },
    { name: "project", key: "F12", tab: "overview" }, { name: "project", key: "F12", tab: "activity" },
    { name: "project", key: "F12", tab: "issues" }, { name: "initiative", key: "C3", tab: "overview" },
    { name: "initiative", key: "C3", tab: "activity" }, { name: "initiative", key: "C3", tab: "projects" },
    { name: "icons" },
  ];
  for (const r of routes) expect(parsePath(formatRoute(r))).toEqual(r);
});

test("the root, a bare team and lowercase keys normalise", () => {
  expect(parsePath("/")).toEqual(HOME);
  expect(parsePath("/team/9001")).toEqual({ name: "team", teamId: 9001, tab: "active" });
  expect(parsePath("/issue/us1001")).toEqual({ name: "issue", key: "US1001" });
  expect(parsePath("/my/assigned?x=1")).toEqual(HOME);
});

test("anything else is not found", () => {
  for (const path of ["/team/abc/active", "/team/9001/nope", "/issue/../user", "/my", "/elsewhere", "/project/F12/nope", "/initiative/C3/issues", "/team/5/cycles/x",
    "/settings/nope", "/settings/teams/x", "/project/F12/issues/extra"]) {
    expect(parsePath(path)).toEqual({ name: "not-found", path });
  }
});

test("sameRoute compares URLs", () => {
  expect(sameRoute({ name: "team", teamId: 1, tab: "active" }, parsePath("/team/1"))).toBe(true);
  expect(sameRoute(HOME, { name: "my", tab: "created" })).toBe(false);
});

test("the icon sheet lives at /dev/icons", () => {
  expect(parsePath("/dev/icons")).toEqual({ name: "icons" });
  expect(formatRoute({ name: "icons" })).toBe("/dev/icons");
});

test("the new screens parse from their URLs", () => {
  expect(parsePath("/team/5/cycles/77")).toEqual({ name: "cycle", teamId: 5, cycleId: 77 });
  expect(parsePath("/project/f12")).toEqual({ name: "project", key: "F12", tab: "overview" });
  expect(formatRoute(parsePath("/project/f12"))).toBe("/project/F12");
  expect(parsePath("/project/F12/issues")).toEqual({ name: "project", key: "F12", tab: "issues" });
  expect(parsePath("/initiative/c3/projects")).toEqual({ name: "initiative", key: "C3", tab: "projects" });
  expect(parsePath("/settings")).toEqual({ name: "settings", section: "preferences" });
  expect(formatRoute(parsePath("/settings"))).toBe("/settings/preferences");
  expect(parsePath("/settings/teams/9")).toEqual({ name: "team-settings", teamId: 9 });
  expect(parsePath("/project/F12/nope")).toEqual({ name: "not-found", path: "/project/F12/nope" });
});

test("saved links keep their paths although the words on screen changed (Rally's words)", () => {
  expect(parsePath("/issue/US1")).toEqual({ name: "issue", key: "US1" });
  expect(parsePath("/team/5/cycles")).toEqual({ name: "team", teamId: 5, tab: "cycles" });
  expect(parsePath("/project/F1")).toEqual({ name: "project", key: "F1", tab: "overview" });
  expect(formatRoute({ name: "issue", key: "US1" })).toBe("/issue/US1");
  expect(formatRoute({ name: "team", teamId: 5, tab: "cycles" })).toBe("/team/5/cycles");
  expect(formatRoute({ name: "project", key: "F1", tab: "overview" })).toBe("/project/F1");
});

import { afterEach, expect, test, vi } from "vitest";
import { serve } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";
import { api, ApiError, errorFrom, OFFLINE } from "./client";

afterEach(() => vi.unstubAllGlobals());

test("errorFrom reads the proxy envelope, FastAPI validation details, and a dead proxy", () => {
  expect(errorFrom(403, { error: "Demo mode: only [DEMO] items can be edited" }).message).toBe("Demo mode: only [DEMO] items can be edited");
  expect(errorFrom(422, { detail: [{ msg: "a" }, { msg: "b" }] }).message).toBe("a; b");
  const dead = errorFrom(502, null);
  expect([dead.status, dead.message]).toEqual([0, OFFLINE]);
});

test("changes sends the loaded teams; issue refs are encoded", async () => {
  const f = serve({ "GET /api/changes": { issues: [] }, "GET /api/issues/US1001": {} });
  await api.changes("2026-10-16T11:59:30.000Z", [9001, 9002]);
  expect(String(f.mock.calls[0][0])).toBe("/api/changes?since=2026-10-16T11%3A59%3A30.000Z&teams=9001,9002");
  await api.issue("US1001");
  expect(String(f.mock.calls[1][0])).toBe("/api/issues/US1001");
});

test("a failed fetch is the offline error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  await expect(api.bootstrap()).rejects.toEqual(new ApiError(0, OFFLINE));
});

test("comments and sub-issues post to their issue", async () => {
  const fetchMock = serve({
    "POST /api/issues/1001/comments": [201, { id: 92, author: null, html: "<p>x</p>", created_at: "2026-10-16T12:00:00.000Z" }],
    "POST /api/issues/1001/sub-issues": [201, { id: 4100 }],
  });
  expect((await api.postComment(1001, "<p>x</p>")).id).toBe(92);
  expect((await api.createSubIssue(1001, { title: "[DEMO] Step" })).id).toBe(4100);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ html: "<p>x</p>" });
});

test("each new method hits its exact path, method and body", async () => {
  const f = serve({
    "GET /api/projects": {}, "GET /api/projects/F12": {}, "GET /api/initiatives": {}, "GET /api/initiatives/C3": {},
    "GET /api/releases": [], "GET /api/teams/5/cycles": {}, "GET /api/teams/5/cycles/77": {},
    "POST /api/projects/F12/updates": {}, "POST /api/initiatives/C3/updates": {},
    "POST /api/projects/F12/comments": {}, "POST /api/initiatives/C3/comments": {},
    "PATCH /api/projects/F12": {}, "PATCH /api/initiatives/C3": {},
    "POST /api/session": {}, "DELETE /api/session": {},
  });
  const seen = () => f.mock.calls.map(([url, init]) => [init?.method ?? "GET", String(url), init?.body ? JSON.parse(String(init.body)) : undefined]);
  await api.projects([1, 2]);
  await api.projects([1, 2], 251);
  await api.project("F12");
  await api.initiatives([1, 2]);
  await api.initiative("C3");
  await api.releases([1, 2]);
  await api.teamCycles(5, 2);
  await api.cycle(5, 77);
  await api.postUpdate("project", "F12", "at_risk", "<p>x</p>");
  await api.postUpdate("initiative", "C3", "on_track", "");
  await api.postPmComment("project", "F12", "<p>c</p>");
  await api.postPmComment("initiative", "C3", "<p>c</p>");
  await api.patchPortfolio("project", "F12", 2);
  await api.patchPortfolio("initiative", "C3", 0);
  await api.connect("k");
  await api.disconnect();
  expect(seen()).toEqual([
    ["GET", "/api/projects?teams=1,2", undefined],
    ["GET", "/api/projects?teams=1,2&initiative=251", undefined],
    ["GET", "/api/projects/F12", undefined],
    ["GET", "/api/initiatives?teams=1,2", undefined],
    ["GET", "/api/initiatives/C3", undefined],
    ["GET", "/api/releases?teams=1,2", undefined],
    ["GET", "/api/teams/5/cycles?past=2", undefined],
    ["GET", "/api/teams/5/cycles/77", undefined],
    ["POST", "/api/projects/F12/updates", { health: "at_risk", html: "<p>x</p>" }],
    ["POST", "/api/initiatives/C3/updates", { health: "on_track", html: "" }],
    ["POST", "/api/projects/F12/comments", { html: "<p>c</p>" }],
    ["POST", "/api/initiatives/C3/comments", { html: "<p>c</p>" }],
    ["PATCH", "/api/projects/F12", { priority: 2 }],
    ["PATCH", "/api/initiatives/C3", { priority: 0 }],
    ["POST", "/api/session", { api_key: "k" }],
    ["DELETE", "/api/session", undefined],
  ]);
});

test("the messages the client builds itself use Rally's words", () => {
  const el = document.createElement("div");
  el.textContent = [OFFLINE, errorFrom(404, {}).message, errorFrom(422, { detail: [{}] }).message, errorFrom(502, null).message].join(" | ");
  expectRallyWords(el);
});

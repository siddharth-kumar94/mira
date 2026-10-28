import { expect, test } from "vitest";
import { ApiError } from "../api/client";
import type { Burnup, Comment, Cycle, CycleStats, Initiative, Update } from "../api/types";
import {
  AIML, DANA, DEMO_TEAM, deferred, fakeApi, makeBootstrap, makeIssue, makeProject, makeTeamLoad, readyStore, SPRINT3, SPRINT4,
} from "../test/fixtures";
import { createAppStore } from "./store";

const tick = () => new Promise((r) => setTimeout(r, 0));
const makeInitiative = (over: Partial<Initiative> = {}): Initiative => ({
  id: 251, key: "I251", name: "[DEMO] Initiative", status: "active", status_name: "Active", owner: DANA, start: null, target: null,
  progress: 0.2, project_count: 1, group_id: null, group_name: null, parent_group_id: null, parent_group_name: null, health: null, latest_update: null, project_health: [],
  priority: 0, summary: "", rank: "", updated_at: "", created_at: "", ...over,
});
const makeUpdate = (over: Partial<Update> = {}): Update => ({
  id: 801, author: DANA, health: "at_risk", html: "<p>Slipping</p>", created_at: "2026-10-19T14:30:00.000Z", progress: 0.4,
  target: "2026-12-31", ...over,
});
const makeComment = (over: Partial<Comment> = {}): Comment => ({
  id: 91, author: DANA, html: "<p>First</p>", created_at: "2026-10-16T10:00:00.000Z", ...over,
});
const stat = (cycle_id: number, over: Partial<CycleStats> = {}): CycleStats =>
  ({ cycle_id, scope: 20, started: 5, completed: 8, issue_count: 6, ...over });

const projectDetail = (over = {}) => ({
  project: makeProject({ id: 9001, key: "F9001" }), description: "<p>About</p>", issues: [], updates: [], comments: [makeComment()],
  cycles: [], teams: [], users: [], ...over,
});

/** A store with project 9001 (key F9001) and its detail loaded. */
async function withProject() {
  const ctx = await readyStore();
  ctx.api.project.mockResolvedValueOnce(projectDetail());
  await ctx.store.getState().loadProject("F9001");
  return ctx;
}

test("loadProjects keys the list by sorted team ids and merges what it returns", async () => {
  const { store, api } = await readyStore();
  api.projects.mockResolvedValue({
    projects: [makeProject({ id: 205, key: "F205" })], initiatives: [makeInitiative()], teams: [AIML],
  });
  await store.getState().loadProjects([7, 3]);
  await store.getState().loadProjects([3, 7]);
  const s = store.getState();
  expect(Object.keys(s.lists)).toEqual(["projects:3,7"]);
  expect(s.lists["projects:3,7"]).toEqual({ status: "ready", ids: [205] });
  expect(s.projects[205].key).toBe("F205");
  expect(s.initiatives[251].name).toBe("[DEMO] Initiative");
  expect(s.teams[9002]).toBeDefined();
});

test("a project list in flight keeps the ids it had and a failure leaves them", async () => {
  const { store, api } = await readyStore();
  api.projects.mockResolvedValueOnce({ projects: [makeProject()], initiatives: [], teams: [] });
  await store.getState().loadProjects([9001]);
  const reply = deferred<never>();
  api.projects.mockReturnValueOnce(reply.promise);
  const loading = store.getState().loadProjects([9001]);
  expect(store.getState().lists["projects:9001"].ids).toEqual([201]);
  reply.reject(new ApiError(502, "Rally unreachable"));
  await loading;
  expect(store.getState().lists["projects:9001"]).toEqual({ status: "ready", ids: [201] });
  expect(store.getState().toasts).toHaveLength(1);
  api.projects.mockRejectedValueOnce(new ApiError(502, "Rally unreachable"));
  await store.getState().loadProjects([9002]);
  expect(store.getState().lists["projects:9002"]).toEqual({ status: "error", ids: [] });
});

test("an initiative's projects have their own list key", async () => {
  const { store, api } = await readyStore();
  api.projects.mockResolvedValueOnce({ projects: [makeProject()], initiatives: [], teams: [] });
  await store.getState().loadInitiativeProjects(251);
  expect(api.projects).toHaveBeenCalledWith([], 251);
  expect(store.getState().lists["project-initiative:251"]).toEqual({ status: "ready", ids: [201] });
});

test("loadInitiatives and loadReleases merge into the caches", async () => {
  const { store, api } = await readyStore();
  api.initiatives.mockResolvedValueOnce({ initiatives: [makeInitiative()], projects: [makeProject({ id: 206, key: "F206" })] });
  api.releases.mockResolvedValueOnce([{ id: 701, name: "PI 4", start: "2026-10-01", end: "2026-12-31", ids: [701] }]);
  await store.getState().loadInitiatives([9001, 9002]);
  await store.getState().loadReleases([9001]);
  expect(store.getState().lists["initiatives:9001,9002"]).toEqual({ status: "ready", ids: [251] });
  expect(store.getState().projects[206]).toBeDefined();
  expect(store.getState().releases[701].name).toBe("PI 4");
});

test("a project's PI resolves through any team copy's id, and the same PI from two reads stays one release", async () => {
  const { store, api } = await readyStore();
  const pi4 = { id: 701, name: "PI 4", start: "2026-10-01", end: "2026-12-31", ids: [701, 702] };
  api.projects.mockResolvedValueOnce({ projects: [makeProject({ id: 207, key: "F207", pi_id: 702 })], initiatives: [], teams: [], releases: [pi4] });
  await store.getState().loadProjects([9002]);
  expect(store.getState().releases[702]).toMatchObject({ id: 701, name: "PI 4" }); // 702 is the second copy's id
  // /api/releases merged the copies in the other order: still one PI, now under all three ids.
  api.releases.mockResolvedValueOnce([{ ...pi4, id: 703, ids: [703, 702] }]);
  await store.getState().loadReleases([9002]);
  const s = store.getState().releases;
  expect([s[701], s[702], s[703]].map((r) => [r.id, r.ids])).toEqual([[701, [701, 702, 703]], [701, [701, 702, 703]], [701, [701, 702, 703]]]);
});

test("loadProject stores the detail, keeps a comment still being posted, and reports not-found", async () => {
  const { store, api } = await readyStore();
  api.project.mockResolvedValueOnce(projectDetail({ issues: [makeIssue({ id: 1777, key: "US1777" })], users: [DANA] }));
  expect(await store.getState().loadProject("F9001")).toBe(9001);
  expect(store.getState().pmDetails["project:9001"]).toMatchObject({ description: "<p>About</p>", comments: [{ id: 91 }] });
  expect(store.getState().issues[1777]).toBeDefined();

  const reply = deferred<Comment>();
  api.postPmComment.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postPmComment("project", 9001, "<p>Mine</p>");
  // The detail reloads while the comment is still in flight: the server doesn't have it yet.
  api.project.mockResolvedValueOnce(projectDetail({ comments: [makeComment(), makeComment({ id: 92, html: "<p>Theirs</p>" })] }));
  await store.getState().loadProject("F9001");
  expect(store.getState().pmDetails["project:9001"].comments.map((c) => c.html)).toEqual(["<p>First</p>", "<p>Theirs</p>", "<p>Mine</p>"]);
  reply.resolve(makeComment({ id: 93, html: "<p>Mine</p>" }));
  await posting;
  expect(store.getState().pmDetails["project:9001"].comments.map((c) => c.id)).toEqual([91, 92, 93]);

  api.project.mockRejectedValueOnce(new ApiError(404, "No such project"));
  expect(await store.getState().loadProject("F0")).toBe("not-found");
  api.project.mockRejectedValueOnce(new ApiError(502, "Rally unreachable"));
  expect(await store.getState().loadProject("F0")).toBe("error");
});

test("loadInitiative stores the detail and its projects", async () => {
  const { store, api } = await readyStore();
  api.initiative.mockResolvedValueOnce({
    initiative: makeInitiative(), description: "<p>Why</p>", projects: [makeProject()], updates: [makeUpdate()], comments: [],
  });
  expect(await store.getState().loadInitiative("I251")).toBe(251);
  expect(store.getState().initiatives[251]).toBeDefined();
  expect(store.getState().pmDetails["initiative:251"].updates).toHaveLength(1);
  api.initiative.mockRejectedValueOnce(new ApiError(404, "No such initiative"));
  expect(await store.getState().loadInitiative("I0")).toBe("not-found");
});

test("postUpdate success: the update leads, the project reports it, and a loaded initiatives list reloads", async () => {
  const { store, api } = await withProject();
  api.initiatives.mockResolvedValueOnce({ initiatives: [makeInitiative()], projects: [] });
  await store.getState().loadInitiatives([9001]);
  const update = makeUpdate();
  api.postUpdate.mockResolvedValueOnce(update);
  api.initiatives.mockResolvedValueOnce({ initiatives: [makeInitiative({ progress: 0.9 })], projects: [] });
  expect(await store.getState().postUpdate("project", 9001, "at_risk", "<p>Slipping</p>")).toBe(true);
  expect(api.postUpdate).toHaveBeenCalledWith("project", "F9001", "at_risk", "<p>Slipping</p>");
  await tick(); // the initiatives reload runs on its own
  const s = store.getState();
  expect(s.pmDetails["project:9001"].updates).toEqual([update]);
  expect(s.projects[9001].latest_update).toEqual(update);
  expect(s.projects[9001].health).toEqual({ value: "at_risk", source: "update", reason: "Reported 2026-10-19" });
  expect(api.initiatives).toHaveBeenCalledTimes(2);
  expect(s.initiatives[251].progress).toBe(0.9);
});

test("postUpdate on an initiative sets the initiative's health and reloads nothing", async () => {
  const { store, api } = await readyStore();
  api.initiative.mockResolvedValueOnce({
    initiative: makeInitiative(), description: "", projects: [], updates: [makeUpdate({ id: 700, health: "on_track" })], comments: [],
  });
  await store.getState().loadInitiative("I251");
  api.postUpdate.mockResolvedValueOnce(makeUpdate({ health: "off_track" }));
  expect(await store.getState().postUpdate("initiative", 251, "off_track", "<p>Bad</p>")).toBe(true);
  expect(api.postUpdate).toHaveBeenCalledWith("initiative", "I251", "off_track", "<p>Bad</p>");
  expect(store.getState().initiatives[251].health?.value).toBe("off_track");
  expect(store.getState().pmDetails["initiative:251"].updates.map((u) => u.id)).toEqual([801, 700]);
});

test("a refused update changes nothing and says why", async () => {
  // Review focus 2: the guard refuses updates on real projects.
  const { store, api } = await withProject();
  const before = store.getState().projects[9001];
  api.postUpdate.mockRejectedValueOnce(new ApiError(403, "Demo mode: only [DEMO] projects can take updates"));
  expect(await store.getState().postUpdate("project", 9001, "at_risk", "<p>x</p>")).toBe(false);
  expect(store.getState().projects[9001]).toEqual(before);
  expect(store.getState().pmDetails["project:9001"].updates).toEqual([]);
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] projects can take updates"]);
});

test("an update waits for Rally: nothing shows until it answers", async () => {
  const { store, api } = await withProject();
  const reply = deferred<Update>();
  api.postUpdate.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postUpdate("project", 9001, "on_track", "<p>ok</p>");
  expect(store.getState().projects[9001].latest_update).toBeNull();
  expect(store.getState().pmDetails["project:9001"].updates).toEqual([]);
  reply.resolve(makeUpdate({ health: "on_track" }));
  await posting;
  expect(store.getState().projects[9001].latest_update?.health).toBe("on_track");
});

test("an id with no loaded key goes to the API as its number", async () => {
  const { store, api } = await readyStore();
  api.postUpdate.mockResolvedValueOnce(makeUpdate());
  await store.getState().postUpdate("project", 424242, "on_track", "<p>x</p>");
  expect(api.postUpdate).toHaveBeenCalledWith("project", "424242", "on_track", "<p>x</p>");
});

test("a project comment shows at once and is replaced by the saved one", async () => {
  const { store, api } = await withProject();
  const reply = deferred<Comment>();
  api.postPmComment.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postPmComment("project", 9001, "<p>Second</p>");
  const shown = store.getState().pmDetails["project:9001"].comments;
  expect(shown.map((c) => [c.html, c.author?.id])).toEqual([["<p>First</p>", 501], ["<p>Second</p>", 501]]);
  expect(shown[1].id).toBeLessThan(0);
  reply.resolve(makeComment({ id: 92, html: "<p>Second</p>" }));
  expect(await posting).toBe(true);
  expect(api.postPmComment).toHaveBeenCalledWith("project", "F9001", "<p>Second</p>");
  expect(store.getState().pmDetails["project:9001"].comments.map((c) => c.id)).toEqual([91, 92]);
});

test("a refused project comment disappears and says why", async () => {
  const { store, api } = await withProject();
  api.postPmComment.mockRejectedValueOnce(new ApiError(403, "Demo mode: only [DEMO] projects can take comments"));
  expect(await store.getState().postPmComment("project", 9001, "<p>Nope</p>")).toBe(false);
  expect(store.getState().pmDetails["project:9001"].comments.map((c) => c.id)).toEqual([91]);
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] projects can take comments"]);
  expect(store.getState().toasts[0].retry).toBeUndefined();
});

test("setPmPriority shows at once, takes Rally's copy, and rolls back on failure", async () => {
  const { store, api } = await withProject();
  const reply = deferred<ReturnType<typeof makeProject>>();
  api.patchPortfolio.mockReturnValueOnce(reply.promise);
  const done = store.getState().setPmPriority("project", 9001, 1);
  expect(store.getState().projects[9001].priority).toBe(1);
  await tick(); // writes leave through the per-item queue
  expect(api.patchPortfolio).toHaveBeenCalledWith("project", "F9001", 1);
  reply.resolve(makeProject({ id: 9001, key: "F9001", priority: 1, updated_at: "2026-10-19T15:00:00.000Z" }));
  await done;
  expect(store.getState().projects[9001].updated_at).toBe("2026-10-19T15:00:00.000Z");

  api.patchPortfolio.mockRejectedValueOnce(new ApiError(422, "Rally doesn't allow that priority"));
  await store.getState().setPmPriority("project", 9001, 3);
  expect(store.getState().projects[9001].priority).toBe(1);
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Rally doesn't allow that priority"]);
  expect(store.getState().pending).toEqual({});
});

test("a list load that began before a priority edit does not undo it", async () => {
  const { store, api } = await readyStore();
  api.initiatives.mockResolvedValueOnce({ initiatives: [makeInitiative()], projects: [] });
  await store.getState().loadInitiatives([9001]);
  const stale = deferred<{ initiatives: Initiative[]; projects: never[] }>();
  api.initiatives.mockReturnValueOnce(stale.promise);
  const loading = store.getState().loadInitiatives([9001]);
  const write = deferred<Initiative>();
  api.patchPortfolio.mockReturnValueOnce(write.promise);
  const editing = store.getState().setPmPriority("initiative", 251, 2);
  stale.resolve({ initiatives: [makeInitiative({ priority: 0 })], projects: [] });
  await loading;
  expect(store.getState().initiatives[251].priority).toBe(2);
  write.resolve(makeInitiative({ priority: 2 }));
  await editing;
  expect(api.patchPortfolio).toHaveBeenCalledWith("initiative", "I251", 2);
});

test("loadCycles stores stats by cycle id; a larger past keeps the ids while loading", async () => {
  const { store, api } = await readyStore();
  api.teamCycles.mockResolvedValueOnce({ cycles: [SPRINT3, SPRINT4], stats: [stat(301), stat(302, { scope: 3 })], has_older: true });
  await store.getState().loadCycles(9001);
  expect(api.teamCycles).toHaveBeenLastCalledWith(9001, 2);
  expect(store.getState().cycleLists[9001]).toEqual({ status: "ready", ids: [301, 302], hasOlder: true, past: 2 });
  expect(store.getState().cycleStats[302].scope).toBe(3);
  expect(store.getState().cycles[302]).toBeDefined();

  const older: Cycle = { ...SPRINT3, id: 299, name: "PI 4 · Sprint 1", short_name: "Sprint 1" };
  const reply = deferred<{ cycles: Cycle[]; stats: CycleStats[]; has_older: boolean }>();
  api.teamCycles.mockReturnValueOnce(reply.promise);
  const loading = store.getState().loadCycles(9001, 8);
  expect(store.getState().cycleLists[9001]).toMatchObject({ status: "loading", ids: [301, 302] });
  reply.resolve({ cycles: [older, SPRINT3, SPRINT4], stats: [stat(299), stat(301), stat(302)], has_older: false });
  await loading;
  expect(api.teamCycles).toHaveBeenLastCalledWith(9001, 8);
  expect(store.getState().cycleLists[9001]).toEqual({ status: "ready", ids: [299, 301, 302], hasOlder: false, past: 8 });
});

test("a failed older-cycles load goes back to what was showing", async () => {
  const { store, api } = await readyStore();
  api.teamCycles.mockResolvedValueOnce({ cycles: [SPRINT3], stats: [stat(301)], has_older: true });
  await store.getState().loadCycles(9001);
  api.teamCycles.mockRejectedValueOnce(new ApiError(502, "Rally unreachable"));
  await store.getState().loadCycles(9001, 8);
  expect(store.getState().cycleLists[9001]).toEqual({ status: "ready", ids: [301], hasOlder: true, past: 2 });
  expect(store.getState().toasts).toHaveLength(1);
  api.teamCycles.mockRejectedValueOnce(new ApiError(502, "Rally unreachable"));
  await store.getState().loadCycles(9002);
  expect(store.getState().cycleLists[9002]).toMatchObject({ status: "error", ids: [] });
});

test("loadCycle merges its issues without undoing an edit still being written", async () => {
  const { store, api } = await readyStore();
  const write = deferred<ReturnType<typeof makeIssue>>();
  api.patchIssue.mockReturnValueOnce(write.promise);
  const editing = store.getState().updateIssue(1001, { priority: 1 });
  api.cycle.mockResolvedValueOnce({
    cycle: SPRINT3, siblings: [{ ...SPRINT3, id: 402, team_id: 9002 }],
    issues: [makeIssue({ priority: 4 }), makeIssue({ id: 1555, key: "US1555" })], projects: [makeProject({ id: 208, key: "F208" })],
    users: [DANA], teams: [DEMO_TEAM, AIML],
  });
  expect(await store.getState().loadCycle(9001, 301)).toBe(301);
  const s = store.getState();
  expect(s.issues[1001].priority).toBe(1); // hot: the local copy wins
  expect(s.issues[1555]).toBeDefined();
  expect(s.cycles[402]).toBeDefined();
  expect(s.projects[208]).toBeDefined();
  write.resolve(makeIssue({ priority: 1 }));
  await editing;
  api.cycle.mockRejectedValueOnce(new ApiError(404, "No such cycle"));
  expect(await store.getState().loadCycle(9001, 999)).toBe("not-found");
});

test("loadTeam merges an ART's child teams into teams", async () => {
  const { store, api } = await readyStore();
  const child = { id: 9003, name: "Child Team", level: "team" as const, parent_id: 9001 };
  api.team.mockResolvedValueOnce(makeTeamLoad({ child_teams: [child] }));
  await store.getState().loadTeam(9001);
  expect(store.getState().teams[9003]).toEqual(child);
});

test("bootstrap tells whether Rally has portfolio priority fields", async () => {
  const { store } = await readyStore(undefined, makeBootstrap({ project_priority: true, initiative_priority: false }));
  expect(store.getState().meta).toMatchObject({ projectPriority: true, initiativePriority: false });
});

test("connect: a rejected key says so and leaves the app needing a key", async () => {
  const api = fakeApi();
  api.bootstrap.mockRejectedValueOnce(new ApiError(401, "Not connected"));
  const store = createAppStore(api);
  await store.getState().load();
  api.connect.mockRejectedValueOnce(new ApiError(401, "401 Unauthorized"));
  expect(await store.getState().connect("bad-key")).toBe("Rally rejected that key");
  expect(store.getState().status).toBe("needs-key");
  expect(api.bootstrap).toHaveBeenCalledTimes(1); // no load after a rejection
});

test("connect: another failure passes its message through", async () => {
  const { store, api } = await readyStore();
  api.connect.mockRejectedValueOnce(new ApiError(0, "Local server isn't running"));
  expect(await store.getState().connect("k")).toBe("Local server isn't running");
});

test("connect: success resolves null and loads the app", async () => {
  const api = fakeApi();
  api.bootstrap.mockRejectedValueOnce(new ApiError(401, "Not connected"));
  const store = createAppStore(api);
  await store.getState().load();
  expect(store.getState().status).toBe("needs-key");
  api.connect.mockResolvedValueOnce({ connected: true, me: DANA, workspace: null, write_guard: "demo", error: null });
  api.bootstrap.mockResolvedValueOnce(makeBootstrap());
  expect(await store.getState().connect("good-key")).toBeNull();
  expect(api.connect).toHaveBeenCalledWith("good-key");
  expect(store.getState().status).toBe("ready");
  expect(store.getState().meta?.me).toEqual(DANA);
});

test("disconnect forgets the session and every cache", async () => {
  const { store, api } = await withProject();
  api.disconnect.mockResolvedValueOnce({ connected: false, me: null, workspace: null, write_guard: "demo", error: null });
  await store.getState().disconnect();
  const s = store.getState();
  expect(s.status).toBe("needs-key");
  expect(s.meta).toBeNull();
  expect(s.issues).toEqual({});
  expect(s.projects).toEqual({});
  expect(s.pmDetails).toEqual({});
  expect(s.yourTeamIds).toEqual([]);
});

test("a failed disconnect keeps the session and says why", async () => {
  const { store, api } = await readyStore();
  api.disconnect.mockRejectedValueOnce(new ApiError(0, "Local server isn't running"));
  await store.getState().disconnect();
  expect(store.getState().status).toBe("ready");
  expect(store.getState().toasts).toHaveLength(1);
});

test("a slow earlier cycle load does not undo a newer one", async () => {
  const { store, api } = await readyStore();
  const early = deferred<{ cycles: Cycle[]; stats: CycleStats[]; has_older: boolean }>();
  const late = deferred<{ cycles: Cycle[]; stats: CycleStats[]; has_older: boolean }>();
  api.teamCycles.mockReturnValueOnce(early.promise).mockReturnValueOnce(late.promise);
  const first = store.getState().loadCycles(9001);
  const second = store.getState().loadCycles(9001, 8);
  const older: Cycle = { ...SPRINT3, id: 299, name: "PI 4 · Sprint 1", short_name: "Sprint 1" };
  late.resolve({ cycles: [older, SPRINT3], stats: [stat(299), stat(301)], has_older: false });
  await second;
  early.resolve({ cycles: [SPRINT3], stats: [stat(301)], has_older: true });
  await first;
  expect(store.getState().cycleLists[9001]).toEqual({ status: "ready", ids: [299, 301], hasOlder: false, past: 8 });
  // and a stale failure doesn't overwrite a newer success either
  const stale = deferred<never>();
  api.teamCycles.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ cycles: [older, SPRINT3], stats: [], has_older: false });
  const a = store.getState().loadCycles(9001, 8);
  await store.getState().loadCycles(9001, 9);
  stale.reject(new ApiError(502, "Rally unreachable"));
  await a;
  expect(store.getState().cycleLists[9001].status).toBe("ready");
  expect(store.getState().toasts).toHaveLength(0);
});

test("a cycle load for the same team and past while one is pending makes no second API call", async () => {
  const { store, api } = await readyStore();
  const reply = deferred<{ cycles: Cycle[]; stats: CycleStats[]; has_older: boolean }>();
  api.teamCycles.mockClear();
  api.teamCycles.mockReturnValueOnce(reply.promise);
  const first = store.getState().loadCycles(9001);
  const second = store.getState().loadCycles(9001);
  expect(api.teamCycles).toHaveBeenCalledTimes(1);
  reply.resolve({ cycles: [SPRINT3], stats: [stat(301)], has_older: false });
  await Promise.all([first, second]);
  expect(store.getState().cycleLists[9001]).toEqual({ status: "ready", ids: [301], hasOlder: false, past: 2 });
  // once it has settled, the same load goes to Rally again (Retry, or coming back to the page)
  api.teamCycles.mockResolvedValueOnce({ cycles: [SPRINT3], stats: [stat(301)], has_older: false });
  await store.getState().loadCycles(9001);
  expect(api.teamCycles).toHaveBeenCalledTimes(2);
  // another past, or another team, is its own load
  const a = deferred<{ cycles: Cycle[]; stats: CycleStats[]; has_older: boolean }>();
  api.teamCycles.mockReturnValueOnce(a.promise).mockReturnValueOnce(a.promise);
  const loads = [store.getState().loadCycles(9001, 8), store.getState().loadCycles(9002, 8)];
  expect(api.teamCycles).toHaveBeenCalledTimes(4);
  a.resolve({ cycles: [], stats: [], has_older: false });
  await Promise.all(loads);
});

test("a slow earlier list load does not undo a newer one", async () => {
  const { store, api } = await readyStore();
  const early = deferred<{ projects: never[]; initiatives: Initiative[]; teams: never[] }>();
  api.projects.mockReturnValueOnce(early.promise)
    .mockResolvedValueOnce({ projects: [makeProject()], initiatives: [], teams: [] });
  const first = store.getState().loadProjects([9001]);
  await store.getState().loadProjects([9001]);
  early.resolve({ projects: [], initiatives: [], teams: [] });
  await first;
  expect(store.getState().lists["projects:9001"]).toEqual({ status: "ready", ids: [201] });
  // a stale failure is dropped too
  const stale = deferred<never>();
  api.projects.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ projects: [makeProject()], initiatives: [], teams: [] });
  const a = store.getState().loadProjects([9001]);
  await store.getState().loadProjects([9001]);
  stale.reject(new ApiError(502, "Rally unreachable"));
  await a;
  expect(store.getState().lists["projects:9001"].status).toBe("ready");
  expect(store.getState().toasts).toHaveLength(0);
});

test("a cycle list that failed twice is still an error, not an empty list", async () => {
  const { store, api } = await readyStore();
  api.teamCycles.mockRejectedValue(new ApiError(502, "Rally unreachable"));
  await store.getState().loadCycles(9001);
  await store.getState().loadCycles(9001);
  expect(store.getState().cycleLists[9001]).toMatchObject({ status: "error", ids: [] });
});

const BURNUP: Burnup = { start: "2026-10-19", end: "2026-11-01", points: [{ day: "2026-10-19", scope: 18, started: 7, completed: 3 }] };
const CYCLE_TARGET = { kind: "cycle", teamId: 9001, cycleId: 301 } as const;

test("a burn-up loads under its key; a reload keeps the chart up, and a failure says \"error\" without a toast", async () => {
  const { store, api } = await readyStore();
  const first = deferred<Burnup>();
  api.burnup.mockReturnValueOnce(first.promise);
  const loading = store.getState().loadBurnup("cycle:9001:301", CYCLE_TARGET);
  expect(store.getState().burnups["cycle:9001:301"]).toBe("loading");
  expect(api.burnup).toHaveBeenCalledWith(CYCLE_TARGET);
  first.resolve(BURNUP);
  await loading;
  expect(store.getState().burnups["cycle:9001:301"]).toEqual(BURNUP);
  // A reload shows the last chart until it lands, and a failed one leaves it.
  const again = deferred<Burnup>();
  api.burnup.mockReturnValueOnce(again.promise);
  const reloading = store.getState().loadBurnup("cycle:9001:301", CYCLE_TARGET);
  expect(store.getState().burnups["cycle:9001:301"]).toEqual(BURNUP);
  again.reject(new ApiError(502, "Burn-up unavailable"));
  await reloading;
  expect(store.getState().burnups["cycle:9001:301"]).toEqual(BURNUP);
  // With nothing shown, a failure is "error"; the chart area says so (ruling 15), with no toast.
  api.burnup.mockRejectedValueOnce(new ApiError(502, "Burn-up unavailable"));
  await store.getState().loadBurnup("project:F201", { kind: "project", ref: "F201" });
  expect(store.getState().burnups["project:F201"]).toBe("error");
  expect(store.getState().toasts).toEqual([]);
});

test("two loads of one burn-up at once share one request", async () => {
  const { store, api } = await readyStore();
  const first = deferred<Burnup>();
  api.burnup.mockReturnValueOnce(first.promise);
  const a = store.getState().loadBurnup("cycle:9001:301", CYCLE_TARGET);
  const b = store.getState().loadBurnup("cycle:9001:301", CYCLE_TARGET);
  expect(api.burnup).toHaveBeenCalledTimes(1);
  first.resolve(BURNUP);
  await Promise.all([a, b]);
  expect(store.getState().burnups["cycle:9001:301"]).toEqual(BURNUP);
});

test("a burn-up asked for before a change of account is dropped", async () => {
  const { store, api } = await readyStore();
  const old = deferred<Burnup>();
  api.burnup.mockReturnValueOnce(old.promise);
  const pending = store.getState().loadBurnup("cycle:9001:301", CYCLE_TARGET);
  api.disconnect.mockResolvedValueOnce({ connected: false, me: null, workspace: null, write_guard: "demo", error: null });
  await store.getState().disconnect();
  old.resolve(BURNUP);
  await pending;
  expect(store.getState().burnups).toEqual({});
  // The new session loads afresh rather than joining the old request.
  api.burnup.mockResolvedValueOnce(BURNUP);
  await store.getState().loadBurnup("cycle:9001:301", CYCLE_TARGET);
  expect(api.burnup).toHaveBeenCalledTimes(2);
});

// Issue-side reads (bootstrap, team, cycle, issue, search) carry projects without health: Rally's health comes from the PM reads.
const HEALTHY = { value: "at_risk" as const, source: "update" as const, reason: "Reported 2026-10-19" };
const withHealth = async () => {
  const ctx = await readyStore();
  ctx.api.projects.mockResolvedValueOnce({
    projects: [makeProject({ health: HEALTHY, latest_update: makeUpdate() })], initiatives: [], teams: [],
  });
  await ctx.store.getState().loadProjects([9001]);
  return ctx;
};

test("a team load's health-less projects keep the health and latest update the project list read", async () => {
  const { store, api } = await withHealth();
  api.team.mockResolvedValueOnce(makeTeamLoad({ projects: [makeProject({ name: "[DEMO] Renamed" })] }));
  await store.getState().loadTeam(9001);
  const p = store.getState().projects[201];
  expect(p.name).toBe("[DEMO] Renamed"); // the rest of the read lands
  expect(p.health).toEqual(HEALTHY);
  expect(p.latest_update?.id).toBe(801);
});

test("a refresh does not wipe a project's health", async () => {
  const { store, api } = await withHealth();
  api.bootstrap.mockResolvedValueOnce(makeBootstrap());
  await store.getState().refresh();
  expect(store.getState().projects[201].health).toEqual(HEALTHY);
  expect(store.getState().projects[201].latest_update?.id).toBe(801);
});

test("a read that does carry health replaces it", async () => {
  const { store, api } = await withHealth();
  const off = { value: "off_track" as const, source: "auto" as const, reason: "Past its target date" };
  api.projects.mockResolvedValueOnce({ projects: [makeProject({ health: off, latest_update: null })], initiatives: [], teams: [] });
  await store.getState().loadProjects([9001]);
  expect(store.getState().projects[201].health).toEqual(off);
  expect(store.getState().projects[201].latest_update).toBeNull();
});

test("a project priority write in flight survives a cycle load's copy of the project", async () => {
  const { store, api } = await withHealth();
  const write = deferred<ReturnType<typeof makeProject>>();
  api.patchPortfolio.mockReturnValueOnce(write.promise);
  const editing = store.getState().setPmPriority("project", 201, 2);
  api.cycle.mockResolvedValueOnce({
    cycle: SPRINT3, siblings: [], issues: [], projects: [makeProject({ priority: 0 })], users: [], teams: [],
  });
  await store.getState().loadCycle(9001, 301);
  expect(store.getState().projects[201].priority).toBe(2);
  write.resolve(makeProject({ priority: 2, health: HEALTHY }));
  await editing;
  expect(store.getState().projects[201].priority).toBe(2);
});

test("a project list read that began before an update was posted does not revert its health", async () => {
  const { store, api } = await withHealth();
  const stale = deferred<{ projects: ReturnType<typeof makeProject>[]; initiatives: never[]; teams: never[] }>();
  api.projects.mockReturnValueOnce(stale.promise);
  const loading = store.getState().loadProjects([9001]);
  api.postUpdate.mockResolvedValueOnce(makeUpdate({ id: 802, health: "on_track", created_at: "2026-10-20T09:00:00.000Z" }));
  expect(await store.getState().postUpdate("project", 201, "on_track", "<p>Better</p>")).toBe(true);
  stale.resolve({ projects: [makeProject({ health: HEALTHY, latest_update: makeUpdate() })], initiatives: [], teams: [] });
  await loading;
  expect(store.getState().projects[201].health?.value).toBe("on_track");
  expect(store.getState().projects[201].latest_update?.id).toBe(802);
});

test("postUpdate resolves once Rally takes the update, without waiting for the initiatives reload", async () => {
  const { store, api } = await withProject();
  api.initiatives.mockResolvedValueOnce({ initiatives: [makeInitiative()], projects: [] });
  await store.getState().loadInitiatives([9001]);
  const reload = deferred<{ initiatives: Initiative[]; projects: never[] }>();
  api.initiatives.mockReturnValueOnce(reload.promise);
  api.postUpdate.mockResolvedValueOnce(makeUpdate());
  let settled = false;
  const posting = store.getState().postUpdate("project", 9001, "at_risk", "<p>Slipping</p>").then((ok) => { settled = true; return ok; });
  await tick();
  expect(settled).toBe(true);
  expect(await posting).toBe(true);
  expect(api.initiatives).toHaveBeenCalledTimes(2); // the reload started
  reload.resolve({ initiatives: [makeInitiative({ progress: 0.9 })], projects: [] });
  await tick();
  expect(store.getState().initiatives[251].progress).toBe(0.9);
});

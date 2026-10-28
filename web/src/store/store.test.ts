import { expect, test, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Changes, Comment, CycleList, Issue, ProjectList, TeamLoad } from "../api/types";
import { DANA, deferred, EMPTY_CHANGES, fakeApi, makeBootstrap, makeIssue, makeProject, makeSubIssue, makeTeamLoad, readyStore } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";
import { startPoller } from "./poller";
import { createAppStore } from "./store";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("load maps the bootstrap", async () => {
  const { store } = await readyStore();
  const s = store.getState();
  expect(s.status).toBe("ready");
  expect(s.meta).toMatchObject({ me: DANA, writeGuard: "demo", demoTeamId: 9001, workspace: { name: "Demo Workspace" } });
  expect(s.yourTeamIds).toEqual([9001, 9002]);
  expect(Object.keys(s.issues).map(Number).sort()).toEqual([1001, 1002, 1201, 1300]);
  expect(s.subIssues[4002].issue_id).toBe(1300);
  expect(s.cycles[401].team_id).toBe(9002);
  expect(s.lastSync).toBe("2026-10-16T11:59:30.000Z");
});

test.each([[401, "needs-key"], [0, "offline"], [500, "error"]] as const)("a %i on load means %s", async (status, expected) => {
  const api = fakeApi();
  api.bootstrap.mockRejectedValueOnce(new ApiError(status, "nope"));
  const store = createAppStore(api);
  await store.getState().load();
  expect(store.getState().status).toBe(expected);
});

test("an edit shows at once and the server copy then replaces it", async () => {
  const { store, api } = await readyStore();
  const reply = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(reply.promise);
  const done = store.getState().updateIssue(1001, { priority: 1 });
  expect(store.getState().issues[1001].priority).toBe(1);
  reply.resolve(makeIssue({ priority: 1, updated_at: "2026-10-16T12:01:00.000Z" }));
  await done;
  expect(store.getState().issues[1001].updated_at).toBe("2026-10-16T12:01:00.000Z");
});

test("a failed edit rolls back only its fields and offers retry only when Rally was unreachable", async () => {
  const { store, api } = await readyStore();
  api.patchIssue.mockRejectedValueOnce(new ApiError(502, "Rally returned HTTP 503"));
  await store.getState().updateIssue(1001, { priority: 4, title: "[DEMO] Renamed" });
  expect(store.getState().issues[1001]).toMatchObject({ priority: 2, title: "[DEMO] Example story" });
  expect(store.getState().toasts[0].message).toBe("Rally returned HTTP 503");
  expect(store.getState().toasts[0].retry).toBeTypeOf("function");
  api.patchIssue.mockRejectedValueOnce(new ApiError(403, "Demo mode: only [DEMO] items can be edited"));
  await store.getState().updateIssue(1201, { priority: 4 });
  expect(store.getState().toasts[1].retry).toBeUndefined();
});

test("two edits of one field: failures restore the value from before the first", async () => {
  const { store, api } = await readyStore();
  const first = deferred<Issue>();
  const second = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const a = store.getState().updateIssue(1001, { priority: 1 });
  const b = store.getState().updateIssue(1001, { priority: 3 });
  first.reject(new ApiError(422, "no"));
  await a;
  expect(store.getState().issues[1001].priority).toBe(3); // the later edit still shows
  second.reject(new ApiError(422, "no"));
  await b;
  expect(store.getState().issues[1001].priority).toBe(2); // the true original
});

test("Backlog clears the cycle, a cycle makes a Backlog issue Todo, and a failure restores both", async () => {
  const { store, api } = await readyStore();
  const reply = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(reply.promise).mockReturnValue(new Promise(() => {}));
  const backlog = store.getState().updateIssue(1001, { status: "backlog" });
  expect(store.getState().issues[1001]).toMatchObject({ status: "backlog", cycle_id: null });
  void store.getState().updateIssue(1002, { cycle_id: 301 });
  expect(store.getState().issues[1002]).toMatchObject({ status: "todo", cycle_id: 301 });
  reply.reject(new ApiError(422, "no"));
  await backlog;
  expect(store.getState().issues[1001]).toMatchObject({ status: "in_progress", cycle_id: 301 });
});

test("bulk edits show at once and reach Rally one at a time", async () => {
  const { store, api } = await readyStore();
  const first = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(first.promise).mockResolvedValueOnce(makeIssue({ id: 1002, key: "US1002", priority: 1 }));
  const all = store.getState().updateIssues([1001, 1002], { priority: 1 });
  expect(store.getState().issues[1002].priority).toBe(1);
  await tick();
  expect(api.patchIssue).toHaveBeenCalledTimes(1);
  first.resolve(makeIssue({ priority: 1 }));
  await all;
  expect(api.patchIssue).toHaveBeenCalledTimes(2);
});

test("a rank drop places the issue between its new neighbours at once; the server rank replaces it", async () => {
  const { store, api } = await readyStore(); // ranks: 1201 N~~~, 1001 O~~~, 1002 P~~~, 1300 Q~~~
  const reply = deferred<Issue>();
  api.rankIssue.mockReturnValueOnce(reply.promise);
  const done = store.getState().rankIssue(1300, { above: 1001 });
  const r = store.getState().issues[1300].rank;
  expect(r > "N~~~" && r < "O~~~").toBe(true);
  reply.resolve(makeIssue({ id: 1300, key: "US1300", rank: "Nz" }));
  await done;
  expect(store.getState().issues[1300].rank).toBe("Nz");
});

test("two quick drags where the first fails: the issue stays where the last drop put it", async () => {
  // Review focus 3.
  const { store, api } = await readyStore();
  const first = deferred<Issue>();
  const second = deferred<Issue>();
  api.rankIssue.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const a = store.getState().rankIssue(1300, { above: 1001 });
  const b = store.getState().rankIssue(1300, { below: 1002 });
  const latest = store.getState().issues[1300].rank;
  expect(latest > "P~~~").toBe(true);
  first.reject(new ApiError(502, "Rally returned HTTP 503"));
  await a;
  expect(store.getState().issues[1300].rank).toBe(latest);
  second.resolve(makeIssue({ id: 1300, key: "US1300", rank: "Pz" }));
  await b;
  expect(store.getState().issues[1300].rank).toBe("Pz");
});

test("loading a team merges its issues, cycles, projects and people", async () => {
  const { store, api } = await readyStore();
  api.team.mockResolvedValueOnce(makeTeamLoad());
  const p = store.getState().loadTeam(9001);
  expect(store.getState().teamState[9001].status).toBe("loading");
  await p;
  expect(store.getState().teamState[9001]).toMatchObject({ status: "ready", memberIds: [501, 502] });
  expect(store.getState().issues[1401].title).toBe("[DEMO] Teammate's story");
  expect(store.getState().loadedTeamIds()).toEqual([9001]);
});

test("a team that 404s is marked notFound; another failure is a plain error", async () => {
  const { store, api } = await readyStore();
  api.team.mockRejectedValueOnce(new ApiError(404, "no such team"));
  await store.getState().loadTeam(777);
  expect(store.getState().teamState[777]).toMatchObject({ status: "error", notFound: true });
  api.team.mockRejectedValueOnce(new ApiError(502, "rally down"));
  await store.getState().loadTeam(778);
  expect(store.getState().teamState[778].status).toBe("error");
  expect(store.getState().teamState[778].notFound).toBeFalsy();
  api.team.mockResolvedValueOnce(makeTeamLoad({ team: { ...makeTeamLoad().team, id: 777 } }));
  await store.getState().loadTeam(777); // a retry that works clears it
  expect(store.getState().teamState[777]).toMatchObject({ status: "ready" });
  expect(store.getState().teamState[777].notFound).toBeFalsy();
});

test("a team refresh keeps an issue that is mid-edit, even when the server no longer lists it", async () => {
  // Review focus 4.
  const { store, api } = await readyStore();
  api.patchIssue.mockReturnValue(new Promise(() => {}));
  void store.getState().updateIssue(1001, { priority: 1 });
  api.team.mockResolvedValueOnce(makeTeamLoad({ issues: [] }));
  await store.getState().loadTeam(9001);
  expect(store.getState().issues[1001].priority).toBe(1);
  expect(store.getState().issues[1002]).toBeUndefined(); // open, not mid-edit, and gone from its team: dropped
  expect(store.getState().issues[1201]).toBeDefined();   // another team's issue is untouched
});

test("a poll that began before an edit settled doesn't overwrite it", async () => {
  const { store, api } = await readyStore();
  const stamp = store.getState().stamp();
  api.patchIssue.mockResolvedValueOnce(makeIssue({ priority: 1 }));
  await store.getState().updateIssue(1001, { priority: 1 });
  store.getState().applyChanges({ ...EMPTY_CHANGES, issues: [makeIssue({ priority: 2 })] }, stamp);
  expect(store.getState().issues[1001].priority).toBe(1);
  store.getState().applyChanges({ ...EMPTY_CHANGES, issues: [makeIssue({ priority: 3 })] }, store.getState().stamp());
  expect(store.getState().issues[1001].priority).toBe(3);
  expect(store.getState().lastSync).toBe("2026-10-16T12:00:30.000Z");
});

test("the All tab pages until the server says there are no more", async () => {
  const { store, api } = await readyStore();
  const page = { cycles: [], projects: [], users: [] };
  api.teamIssues
    .mockResolvedValueOnce({ ...page, issues: [makeIssue({ id: 1500, key: "US1500", status: "done" })], next_cursor: 101 })
    .mockResolvedValueOnce({ ...page, issues: [], next_cursor: null });
  await store.getState().loadTeamPage(9001);
  await store.getState().loadTeamPage(9001);
  await store.getState().loadTeamPage(9001);
  expect(api.teamIssues.mock.calls).toEqual([[9001, 1], [9001, 101]]);
  expect(store.getState().issues[1500]).toBeDefined();
});

test("opening an unknown issue reports not-found without a toast", async () => {
  const { store, api } = await readyStore();
  api.issue.mockRejectedValueOnce(new ApiError(404, "Story US999999 was not found"));
  expect(await store.getState().loadIssueDetail("US999999")).toBe("not-found");
  expect(store.getState().toasts).toEqual([]);
});

test("the 5-minute refresh drops issues that are no longer yours", async () => {
  const { store, api } = await readyStore();
  api.bootstrap.mockResolvedValueOnce(makeBootstrap({ issues: [makeIssue()] }));
  await store.getState().refresh();
  expect(store.getState().issues[1002]).toBeUndefined();
  expect(store.getState().issues[1201]).toBeUndefined();
  expect(store.getState().issues[1300]).toBeDefined(); // Sam's: a sub-issue's parent, not "mine", so kept
});

test("sub-issue edits are optimistic and roll back", async () => {
  const { store, api } = await readyStore();
  api.patchSubIssue.mockRejectedValueOnce(new ApiError(422, "no"));
  const p = store.getState().updateSubIssue(4002, { status: "done" });
  expect(store.getState().subIssues[4002].status).toBe("done");
  await p;
  expect(store.getState().subIssues[4002].status).toBe("todo");
});

test("remote search keeps local copies and caches teams; people search caches users", async () => {
  const { store, api } = await readyStore();
  api.search.mockResolvedValueOnce({ issues: [makeIssue({ title: "stale" })], teams: [{ id: 9050, name: "DataLine", level: "team", parent_id: null }], projects: [] });
  await store.getState().searchRemote("example");
  expect(store.getState().issues[1001].title).toBe("[DEMO] Example story");
  expect(store.getState().teams[9050].name).toBe("DataLine");
  api.users.mockResolvedValueOnce([{ id: 777, name: "Pat Person" }]);
  await store.getState().searchUsers("pat");
  expect(store.getState().users[777].name).toBe("Pat Person");
});

const detail = (over = {}) => ({
  issue: makeIssue(), sub_issues: [], cycles: [], projects: [], users: [],
  comments: [{ id: 91, author: DANA, html: "<p>First</p>", created_at: "2026-10-16T09:00:00.000Z" }],
  activity: [{ id: "81.0", author: DANA, text: "set estimate to 5", created_at: "2026-10-16T08:00:00.000Z" }],
  ...over,
});

test("the issue detail keeps its comments and activity", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  expect(store.getState().details[1001].comments.map((c) => c.html)).toEqual(["<p>First</p>"]);
  expect(store.getState().details[1001].activity.map((a) => a.text)).toEqual(["set estimate to 5"]);
});

test("a comment shows at once and the server copy replaces it", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  const reply = deferred<Comment>();
  api.postComment.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postComment(1001, "<p>Second</p>");
  const shown = store.getState().details[1001].comments;
  expect(shown.map((c) => [c.html, c.author?.id])).toEqual([["<p>First</p>", 501], ["<p>Second</p>", 501]]);
  expect(shown[1].id).toBeLessThan(0); // a temporary id until Rally answers
  reply.resolve({ id: 92, author: DANA, html: "<p>Second</p>", created_at: "2026-10-16T12:00:00.000Z" });
  expect(await posting).toBe(true);
  expect(store.getState().details[1001].comments.map((c) => c.id)).toEqual([91, 92]);
});

test("a detail reload landing while a comment posts keeps the comment, and then the saved one", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  const reply = deferred<Comment>();
  api.postComment.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postComment(1001, "<p>Second</p>");
  // The reload reads before Rally has the comment.
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  expect(store.getState().details[1001].comments.map((c) => c.html)).toEqual(["<p>First</p>", "<p>Second</p>"]);
  reply.resolve({ id: 92, author: DANA, html: "<p>Second</p>", created_at: "2026-10-16T12:00:00.000Z" });
  expect(await posting).toBe(true);
  expect(store.getState().details[1001].comments.map((c) => c.id)).toEqual([91, 92]);
});

test("a reload that already has the posted comment doesn't show it twice", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  const reply = deferred<Comment>();
  api.postComment.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postComment(1001, "<p>Second</p>");
  const saved = { id: 92, author: DANA, html: "<p>Second</p>", created_at: "2026-10-16T12:00:00.000Z" };
  api.issue.mockResolvedValueOnce(detail({ comments: [...detail().comments, saved] }));
  await store.getState().loadIssueDetail(1001);
  reply.resolve(saved);
  await posting;
  expect(store.getState().details[1001].comments.map((c) => c.id)).toEqual([91, 92]);
});

test("a refused comment disappears and says why", async () => {
  // Review focus 4: the guard refuses comments on real issues.
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  api.postComment.mockRejectedValueOnce(new ApiError(403, "Demo mode: only [DEMO] items can take comments"));
  expect(await store.getState().postComment(1001, "<p>Nope</p>")).toBe(false);
  expect(store.getState().details[1001].comments.map((c) => c.id)).toEqual([91]);
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] items can take comments"]);
});

test("a new sub-issue joins its issue", async () => {
  const { store, api } = await readyStore();
  api.createSubIssue.mockResolvedValueOnce(makeSubIssue({ id: 4100, key: "TA4100", title: "[DEMO] New step", issue_id: 1001 }));
  const sub = await store.getState().createSubIssue(1001, "[DEMO] New step");
  expect(api.createSubIssue).toHaveBeenCalledWith(1001, { title: "[DEMO] New step" });
  expect(sub?.id).toBe(4100);
  expect(store.getState().subIssues[4100].issue_id).toBe(1001);
  expect(store.getState().issues[1001].sub_issue_count).toBe(2);
});

test("a comment that could not reach Rally offers no toast retry", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  api.postComment.mockRejectedValueOnce(new ApiError(502, "Rally unreachable"));
  expect(await store.getState().postComment(1001, "<p>Later</p>")).toBe(false);
  expect(store.getState().toasts[0].retry).toBeUndefined();
});

const session = (me: { id: number; name: string }, workspace: { id: number; name: string }) =>
  ({ connected: true, me, workspace, write_guard: "demo" as const, error: null });

test("connecting as another account drops the old account's data before loading", async () => {
  const { store, api } = await readyStore();
  const other = { id: 777, name: "Other Person" };
  api.connect.mockResolvedValueOnce(session(other, { id: 8002, name: "Other WS" }));
  const boot = deferred<ReturnType<typeof makeBootstrap>>();
  api.bootstrap.mockReturnValueOnce(boot.promise);
  const accepted: string[] = [];
  const done = store.getState().connect("synthetic-key", (s) => accepted.push(`${s.me?.name}|${store.getState().status}`));
  await tick();
  expect(accepted).toEqual(["Other Person|ready"]); // told before the reload starts
  expect(store.getState()).toMatchObject({ status: "loading", meta: null, issues: {}, teams: {}, lists: {}, teamState: {} });
  boot.resolve(makeBootstrap({ me: other, workspace: { id: 8002, name: "Other WS" }, issues: [makeIssue({ id: 5001, key: "US5001", assignee: other })] }));
  expect(await done).toBeNull();
  expect(Object.keys(store.getState().issues)).toEqual(["5001"]);
  expect(store.getState().meta?.me).toEqual(other);
});

test("re-keying the same account keeps the cache and never shows loading", async () => {
  const { store, api } = await readyStore();
  api.connect.mockResolvedValueOnce(session(DANA, { id: 8001, name: "Demo Workspace" }));
  const boot = deferred<ReturnType<typeof makeBootstrap>>();
  api.bootstrap.mockReturnValueOnce(boot.promise);
  const done = store.getState().connect("synthetic-key");
  await tick();
  expect(store.getState().status).toBe("ready");
  expect(store.getState().issues[1001]).toBeDefined();
  boot.resolve(makeBootstrap());
  expect(await done).toBeNull();
  expect(store.getState().status).toBe("ready");
});

test("a rejected key changes nothing and never calls back", async () => {
  const { store, api } = await readyStore();
  api.connect.mockRejectedValueOnce(new ApiError(401, "Rally rejected that key"));
  const onAccepted = vi.fn();
  expect(await store.getState().connect("not-a-key", onAccepted)).toBe("Rally rejected that key");
  expect(onAccepted).not.toHaveBeenCalled();
  expect(store.getState()).toMatchObject({ status: "ready", meta: { me: DANA } });
  expect(store.getState().issues[1001]).toBeDefined();
});

test.each(["connecting as another account", "disconnecting"])("replies to requests made before %s are dropped, toasts and all", async (how) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const { store, api } = await readyStore();
    const list = deferred<ProjectList>();
    const team = deferred<TeamLoad>();
    const poll = deferred<Changes>();
    const cycles = deferred<CycleList>();
    api.projects.mockReturnValueOnce(list.promise);
    api.team.mockReturnValueOnce(team.promise);
    api.changes.mockReturnValueOnce(poll.promise);
    api.teamCycles.mockReturnValueOnce(cycles.promise);
    const stop = startPoller(store, api, { intervalMs: 1000 });
    const inFlight = [store.getState().loadProjects([9001]), store.getState().loadTeam(9001), store.getState().loadCycles(9001)];
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.changes).toHaveBeenCalledTimes(1); // the poll is in flight too

    const other = { id: 777, name: "Other Person" };
    if (how === "disconnecting") {
      api.disconnect.mockResolvedValueOnce({ connected: false, me: null, workspace: null, write_guard: "demo", error: null });
      await store.getState().disconnect();
    } else {
      api.connect.mockResolvedValueOnce(session(other, { id: 8002, name: "Other WS" }));
      api.bootstrap.mockResolvedValueOnce(makeBootstrap({
        me: other, workspace: { id: 8002, name: "Other WS" }, teams: [], issues: [], sub_issues: [], cycles: [], projects: [], users: [other],
      }));
      expect(await store.getState().connect("synthetic-key")).toBeNull();
    }
    const after = store.getState();

    // The old account's replies land now: a list, a team, a poll, and a failed cycle load that would toast.
    list.resolve({ projects: [makeProject({ id: 901, key: "F901" })], initiatives: [], teams: [], releases: [] });
    team.resolve(makeTeamLoad({ issues: [makeIssue({ id: 1401, key: "US1401" })] }));
    poll.resolve({ ...EMPTY_CHANGES, issues: [makeIssue({ id: 1999, key: "US1999" })] });
    cycles.reject(new ApiError(502, "Rally timed out"));
    await Promise.all(inFlight);
    await vi.advanceTimersByTimeAsync(0);
    stop();

    const s = store.getState();
    expect(s.issues).toEqual({});
    expect(s.projects[901]).toBeUndefined();
    expect(s.teams[9001]).toBeUndefined();
    expect(s.teamState).toEqual({});
    expect(s.lists).toEqual({});
    expect(s.cycleLists).toEqual({});
    expect(s.toasts).toEqual([]);
    expect(s.stale).toBe(false);
    expect(s.lastSync).toBe(after.lastSync);
    expect(s.status).toBe(how === "disconnecting" ? "needs-key" : "ready");
    if (how !== "disconnecting") expect(s.meta?.me).toEqual(other);
  } finally {
    vi.useRealTimers();
  }
});

test("after a change of account, a cycle load starts fresh rather than joining the old account's pending one", async () => {
  const { store, api } = await readyStore();
  const old = deferred<CycleList>();
  api.teamCycles.mockReturnValueOnce(old.promise);
  void store.getState().loadCycles(9001);
  api.disconnect.mockResolvedValueOnce({ connected: false, me: null, workspace: null, write_guard: "demo", error: null });
  await store.getState().disconnect();
  api.teamCycles.mockResolvedValueOnce({ cycles: [], stats: [], has_older: false });
  await store.getState().loadCycles(9001);
  expect(api.teamCycles).toHaveBeenCalledTimes(2);
  old.resolve({ cycles: [], stats: [], has_older: false });
});

test.each([
  ["two issues edited at once", "issue"],
  ["two edits of one issue", "same-issue"],
  ["two edits of one sub-issue", "sub-issue"],
  ["two priority edits of one project", "project"],
] as const)("%s, then another account before the second is sent: only the first reaches Rally", async (_, kind) => {
  const { store, api } = await readyStore();
  const first = deferred<never>();
  const sent = { issue: api.patchIssue, "same-issue": api.patchIssue, "sub-issue": api.patchSubIssue, project: api.patchPortfolio }[kind];
  sent.mockReturnValueOnce(first.promise);
  sent.mockResolvedValue(makeIssue() as never);
  const s = store.getState();
  const writing = kind === "issue" ? s.updateMany([{ id: 1001, patch: { priority: 1 } }, { id: 1002, patch: { priority: 2 } }])
    : kind === "same-issue" ? Promise.all([s.updateIssue(1001, { priority: 1 }), s.updateIssue(1001, { priority: 2 })])
      : kind === "sub-issue" ? Promise.all([s.updateSubIssue(4002, { status: "done" }), s.updateSubIssue(4002, { status: "todo" })])
        : Promise.all([s.setPmPriority("project", 201, 1), s.setPmPriority("project", 201, 2)]);
  await tick();
  expect(sent).toHaveBeenCalledTimes(1);

  const other = { id: 777, name: "Other Person" };
  api.connect.mockResolvedValueOnce(session(other, { id: 8002, name: "Other WS" }));
  api.bootstrap.mockResolvedValueOnce(makeBootstrap({ me: other, workspace: { id: 8002, name: "Other WS" } }));
  expect(await store.getState().connect("synthetic-key")).toBeNull();
  first.reject(new ApiError(502, "Rally timed out"));
  await writing;
  await tick();
  expect(sent).toHaveBeenCalledTimes(1);
  expect(store.getState().toasts).toEqual([]);
  expect(store.getState().pending).toEqual({});
});

test("after a change of account, a write does not wait behind the old account's queue", async () => {
  const { store, api } = await readyStore();
  const stuck = deferred<never>();
  api.patchIssue.mockReturnValueOnce(stuck.promise);
  void store.getState().updateIssue(1001, { priority: 1 });
  await tick();
  api.connect.mockResolvedValueOnce(session({ id: 777, name: "Other Person" }, { id: 8002, name: "Other WS" }));
  api.bootstrap.mockResolvedValueOnce(makeBootstrap());
  await store.getState().connect("synthetic-key");
  api.patchIssue.mockResolvedValueOnce(makeIssue({ priority: 3 }));
  await store.getState().updateIssue(1001, { priority: 3 }); // would hang behind the stuck write without the queue cleared
  expect(api.patchIssue).toHaveBeenCalledTimes(2);
  expect(store.getState().issues[1001].priority).toBe(3);
});

/** The text a toast would show: nothing a person reads may use Linear's words. */
const shown = (message: string) => {
  const el = document.createElement("div");
  el.textContent = message;
  expectRallyWords(el);
};

test("a failed story load toasts Rally's own words, and a missing story does not toast", async () => {
  const { store, api } = await readyStore();
  api.issue.mockRejectedValueOnce(new ApiError(502, "Rally returned HTTP 503"));
  expect(await store.getState().loadIssueDetail("US1001")).toBe("error");
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Rally returned HTTP 503"]);
  store.getState().toasts.forEach((t) => shown(t.message));
  api.issue.mockRejectedValueOnce(new ApiError(0, "Local server isn't running"));
  await store.getState().loadIssueDetail("US1001");
  store.getState().toasts.forEach((t) => shown(t.message));
});

test("a failed task create toasts a message without Linear's words and adds nothing", async () => {
  const { store, api } = await readyStore();
  api.createSubIssue.mockRejectedValueOnce(new ApiError(403, "Demo mode: only [DEMO] items can be edited"));
  expect(await store.getState().createSubIssue(1001, "Step")).toBeNull();
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] items can be edited"]);
  store.getState().toasts.forEach((t) => shown(t.message));
  expect(store.getState().issues[1001].sub_issue_count).toBe(1);
});

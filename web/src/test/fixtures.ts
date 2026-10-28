import { vi, type Mocked } from "vitest";
import type { Api } from "../api/client";
import type { Bootstrap, Changes, Cycle, Initiative, Issue, Project, SubIssue, Team, TeamLoad, User } from "../api/types";
import { createAppStore } from "../store/store";

export const DANA: User = { id: 501, name: "Dana Demo" };
export const SAM: User = { id: 502, name: "Sam Sample" };
export const DEMO_TEAM: Team = { id: 9001, name: "Data Services", level: "team", parent_id: null };
export const AIML: Team = { id: 9002, name: "AI/ML Solutions", level: "team", parent_id: null };
export const SPRINT3: Cycle = { id: 301, team_id: 9001, name: "PI 4 · Sprint 3", short_name: "Sprint 3", start: "2026-10-08T04:00:00.000Z", end: "2026-10-22T03:59:59.000Z", capacity: null };
export const SPRINT4: Cycle = { id: 302, team_id: 9001, name: "PI 4 · Sprint 4", short_name: "Sprint 4", start: "2026-10-22T04:00:00.000Z", end: "2026-11-05T03:59:59.000Z", capacity: null };
export const SPRINT3_AIML: Cycle = { ...SPRINT3, id: 401, team_id: 9002 };

export function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 201, key: "F201", name: "[DEMO] Feature A", status_name: "Current PI", status_category: "started", lead: DANA,
    start: "2026-09-10", target: "2026-12-31", progress: 0.4, issue_count: 10, done_count: 4, points: 30, done_points: 12,
    pi_id: 701, initiative_id: 251, team_id: 9001, risk: false, updated_at: "2026-10-15T10:00:00.000Z", health: null,
    latest_update: null, priority: 0, rank: "", created_at: "2026-09-01T10:00:00.000Z", completed_at: null, labels: [], ...over,
  };
}

export function makeInitiative(over: Partial<Initiative> = {}): Initiative {
  return {
    id: 251, key: "C251", name: "[DEMO] Capability", status: "active", status_name: "Developing", owner: DANA, start: "2026-07-01",
    target: "2026-12-31", progress: 0.5, project_count: 0, group_id: 271, group_name: "[DEMO] Outcome",
    parent_group_id: 281, parent_group_name: "[DEMO] Program", health: null, latest_update: null,
    project_health: [], priority: 0, summary: "", rank: "", updated_at: "2026-10-14T10:00:00.000Z",
    created_at: "2026-06-20T10:00:00.000Z", ...over,
  };
}

export function makeIssue(over: Partial<Issue> = {}): Issue {
  return {
    id: 1001, key: "US1001", kind: "story", title: "[DEMO] Example story", status: "in_progress", priority: 2,
    assignee: DANA, creator: DANA, team_id: 9001, cycle_id: 301, project_id: 201, estimate: 5,
    labels: ["collabathon-demo"], blocked: false, blocked_reason: "", description: "<p>Hello</p>", rank: "O~~~",
    created_at: "2026-10-01T14:00:00.000Z", updated_at: "2026-10-16T06:25:17.000Z", completed_at: null,
    sub_issue_count: 1, ...over,
  };
}

export function makeSubIssue(over: Partial<SubIssue> = {}): SubIssue {
  return {
    id: 4001, key: "TA4001", title: "[DEMO] Example task", status: "todo", assignee: DANA, issue_id: 1001, team_id: 9001,
    hours: 3, index: 0, updated_at: "2026-10-16T06:25:17.000Z", ...over,
  };
}

/** Mine across two teams (1001 and 1002 in the demo team, 1201 in AI/ML), plus Sam's 1300, the parent of my sub-issue 4002. */
export function makeBootstrap(over: Partial<Bootstrap> = {}): Bootstrap {
  return {
    me: DANA, workspace: { id: 8001, name: "Demo Workspace" },
    teams: [DEMO_TEAM, AIML],
    issues: [
      makeIssue(),
      makeIssue({ id: 1002, key: "US1002", title: "[DEMO] Backlog one", status: "backlog", cycle_id: null, priority: 0, rank: "P~~~", description: "" }),
      makeIssue({ id: 1201, key: "US1201", title: "Real AI/ML work", team_id: 9002, cycle_id: 401, project_id: 202, labels: [],
                  status: "todo", priority: 1, rank: "N~~~" }),
      makeIssue({ id: 1300, key: "US1300", title: "[DEMO] Sam's story", assignee: SAM, creator: SAM, status: "todo", rank: "Q~~~" }),
    ],
    sub_issues: [makeSubIssue({ id: 4002, key: "TA4002", issue_id: 1300 })],
    cycles: [SPRINT3, SPRINT4, SPRINT3_AIML],
    projects: [makeProject(), makeProject({ id: 202, key: "F202", name: "Real feature", team_id: 9002 })],
    users: [DANA, SAM], server_time: "2026-10-16T11:59:30.000Z", project_priority: false, initiative_priority: false,
    ...over,
  };
}

export function makeTeamLoad(over: Partial<TeamLoad> = {}): TeamLoad {
  const b = makeBootstrap();
  return {
    team: DEMO_TEAM,
    issues: [
      ...b.issues.filter((i) => i.team_id === 9001),
      makeIssue({ id: 1401, key: "US1401", title: "[DEMO] Teammate's story", assignee: SAM, creator: SAM, status: "todo", rank: "R~~~" }),
    ],
    cycles: [SPRINT3, SPRINT4], projects: [makeProject()], users: [DANA, SAM], member_ids: [501, 502],
    server_time: "2026-10-16T11:59:30.000Z", child_teams: [], ...over,
  };
}

export const EMPTY_CHANGES: Changes = {
  issues: [], sub_issues: [], cycles: [], projects: [], users: [], server_time: "2026-10-16T12:00:30.000Z",
};

export function fakeApi(): Mocked<Api> {
  const notStubbed = (name: string) => vi.fn(() => Promise.reject(new Error(`${name} not stubbed`)));
  const names: (keyof Api)[] = ["session", "bootstrap", "team", "teamIssues", "changes", "issue", "patchIssue", "createIssue",
    "rankIssue", "patchSubIssue", "postComment", "createSubIssue", "search", "users", "labels",
    "connect", "disconnect", "projects", "project", "initiatives", "initiative", "releases", "teamCycles", "cycle", "burnup", "postUpdate",
    "postPmComment", "patchPortfolio"];
  return Object.fromEntries(names.map((n) => [n, notStubbed(n)])) as unknown as Mocked<Api>;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function readyStore(api: Mocked<Api> = fakeApi(), bootstrap: Bootstrap = makeBootstrap()) {
  api.bootstrap.mockResolvedValueOnce(bootstrap);
  const store = createAppStore(api);
  await store.getState().load();
  return { store, api };
}

type Route = unknown | [number, unknown];

/** Stub global fetch: keys are "METHOD /api/path" (query string ignored); values are a body or [status, body]. */
export function serve(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input).split("?")[0]}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: `unrouted ${key}` }), { status: 404 });
    const route = routes[key];
    const [status, body] = Array.isArray(route) && typeof route[0] === "number" ? route : [200, route];
    return new Response(JSON.stringify(body), { status: status as number });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

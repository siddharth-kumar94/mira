import type {
  Bootstrap, Burnup, BurnupTarget, Changes, Comment, CycleDetail, CycleList, Initiative, InitiativeDetail, InitiativeList, Issue, IssueCreate, IssueDetail,
  IssuePage, IssuePatch, Priority, Project, ProjectDetail, ProjectList, RankRequest, Release, ReportedHealth, SearchResult, Session,
  SubIssue, SubIssueCreate, SubIssuePatch, TeamLoad, Update, User,
} from "./types";

export const OFFLINE = "Local server isn't running";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Projects and initiatives share their update, comment and priority routes. */
export type PortfolioKind = "project" | "initiative";

export interface Api {
  session(): Promise<Session>;
  connect(apiKey: string): Promise<Session>;
  disconnect(): Promise<Session>;
  bootstrap(): Promise<Bootstrap>;
  team(id: number): Promise<TeamLoad>;
  teamIssues(id: number, cursor: number): Promise<IssuePage>;
  changes(since: string, teams: number[]): Promise<Changes>;
  issue(ref: string | number): Promise<IssueDetail>;
  patchIssue(id: number, patch: IssuePatch): Promise<Issue>;
  createIssue(data: IssueCreate): Promise<Issue>;
  rankIssue(id: number, req: RankRequest): Promise<Issue>;
  patchSubIssue(id: number, patch: SubIssuePatch): Promise<SubIssue>;
  postComment(issueId: number, html: string): Promise<Comment>;
  createSubIssue(issueId: number, data: SubIssueCreate): Promise<SubIssue>;
  search(q: string): Promise<SearchResult>;
  users(q: string): Promise<User[]>;
  labels(q: string): Promise<string[]>;
  projects(teamIds: number[], initiativeId?: number): Promise<ProjectList>;
  project(ref: string): Promise<ProjectDetail>;
  initiatives(teamIds: number[]): Promise<InitiativeList>;
  initiative(ref: string): Promise<InitiativeDetail>;
  releases(teamIds: number[]): Promise<Release[]>;
  teamCycles(teamId: number, past: number): Promise<CycleList>;
  cycle(teamId: number, cycleId: number): Promise<CycleDetail>;
  burnup(target: BurnupTarget): Promise<Burnup>;
  postUpdate(kind: PortfolioKind, ref: string, health: ReportedHealth, html: string): Promise<Update>;
  postPmComment(kind: PortfolioKind, ref: string, html: string): Promise<Comment>;
  patchPortfolio(kind: PortfolioKind, ref: string, priority: Priority): Promise<Project | Initiative>;
}

export function errorFrom(status: number, data: unknown): ApiError {
  const body = (data ?? {}) as { error?: unknown; detail?: unknown };
  if (typeof body.error === "string") return new ApiError(status, body.error);
  if (Array.isArray(body.detail)) {
    return new ApiError(status, body.detail.map((d: { msg?: string }) => d.msg ?? "invalid").join("; "));
  }
  if (typeof body.detail === "string") return new ApiError(status, body.detail);
  // Vite's dev proxy answers 5xx with no JSON body when the FastAPI process is down.
  if (status >= 500) return new ApiError(0, OFFLINE);
  return new ApiError(status, `Request failed (${status})`);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw errorFrom(res.status, data);
}

const q = encodeURIComponent;
const base = (kind: PortfolioKind, ref: string) => `/${kind === "project" ? "projects" : "initiatives"}/${q(ref)}`;

export const api: Api = {
  session: () => request("GET", "/session"),
  connect: (apiKey) => request("POST", "/session", { api_key: apiKey }),
  disconnect: () => request("DELETE", "/session"),
  bootstrap: () => request("GET", "/bootstrap"),
  team: (id) => request("GET", `/teams/${id}`),
  teamIssues: (id, cursor) => request("GET", `/teams/${id}/issues?cursor=${cursor}`),
  changes: (since, teams) => request("GET", `/changes?since=${q(since)}&teams=${teams.join(",")}`),
  issue: (ref) => request("GET", `/issues/${q(String(ref))}`),
  patchIssue: (id, patch) => request("PATCH", `/issues/${id}`, patch),
  createIssue: (data) => request("POST", "/issues", data),
  rankIssue: (id, req) => request("POST", `/issues/${id}/rank`, req),
  patchSubIssue: (id, patch) => request("PATCH", `/sub-issues/${id}`, patch),
  postComment: (id, html) => request("POST", `/issues/${id}/comments`, { html }),
  createSubIssue: (id, data) => request("POST", `/issues/${id}/sub-issues`, data),
  search: (text) => request("GET", `/search?q=${q(text)}`),
  users: (text) => request("GET", `/users?q=${q(text)}`),
  labels: (text) => request("GET", `/labels?q=${q(text)}`),
  projects: (teamIds, initiativeId) =>
    request("GET", `/projects?teams=${teamIds.join(",")}${initiativeId === undefined ? "" : `&initiative=${initiativeId}`}`),
  project: (ref) => request("GET", `/projects/${q(ref)}`),
  initiatives: (teamIds) => request("GET", `/initiatives?teams=${teamIds.join(",")}`),
  initiative: (ref) => request("GET", `/initiatives/${q(ref)}`),
  releases: (teamIds) => request("GET", `/releases?teams=${teamIds.join(",")}`),
  teamCycles: (teamId, past) => request("GET", `/teams/${teamId}/cycles?past=${past}`),
  cycle: (teamId, cycleId) => request("GET", `/teams/${teamId}/cycles/${cycleId}`),
  burnup: (t) => request("GET", t.kind === "cycle" ? `/burnup?team=${t.teamId}&cycle=${t.cycleId}` : `/burnup?project=${q(t.ref)}`),
  postUpdate: (kind, ref, health, html) => request("POST", `${base(kind, ref)}/updates`, { health, html }),
  postPmComment: (kind, ref, html) => request("POST", `${base(kind, ref)}/comments`, { html }),
  patchPortfolio: (kind, ref, priority) => request("PATCH", base(kind, ref), { priority }),
};

import { createStore, type StoreApi } from "zustand/vanilla";
import { ApiError, type Api, type PortfolioKind } from "../api/client";
import type {
  Activity, Bootstrap, Burnup, BurnupTarget, Changes, Comment, Cycle, CycleStats, Initiative, Issue, IssueCreate, IssuePatch, Priority,
  Project, RankRequest, Release, ReportedHealth, SearchResult, Session, SubIssue, SubIssuePatch, Team, Update, User, Workspace,
} from "../api/types";
import { applyIssuePatch, applySubIssuePatch, revertIssueFields, revertSubIssueFields, type LocalIssuePatch } from "./patch";
import { byRank, rankBetween } from "./rank";

export type Status = "loading" | "ready" | "needs-key" | "offline" | "error";
export interface Toast { id: number; message: string; retry?: () => void }
export interface Meta {
  me: User;
  workspace: Workspace;
  /** False when Rally has no priority field for projects / initiatives (D38): their priority controls stay hidden. */
  projectPriority: boolean;
  initiativePriority: boolean;
}
/** Load state per team (spec §7). `nextCursor` is undefined until the All tab asks, and null once every page is in. */
export interface TeamState {
  status: "loading" | "ready" | "error"; memberIds: number[]; nextCursor?: number | null;
  /** The server answered 404: there is no such team, as opposed to a failure worth retrying. */
  notFound?: boolean;
}
export type DetailResult = number | "not-found" | "error";

/** Comments and activity of one issue, from its detail load. */
export interface IssueExtras { comments: Comment[]; activity: Activity[] }
/** Description, updates and comments of one project or initiative, from its detail load. */
export interface PmExtras { description: string; updates: Update[]; comments: Comment[] }
export type LoadState = "loading" | "ready" | "error";
export interface ListState { status: LoadState; ids: number[] }
export interface CycleListState { status: LoadState; ids: number[]; hasOlder: boolean; past: number }

export interface AppState {
  status: Status;
  error: string | null;
  meta: Meta | null;
  /** Teams Rally says are yours (spec D6). The sidebar adds joined and removes hidden ones. */
  yourTeamIds: number[];
  users: Record<number, User>;
  teams: Record<number, Team>;
  cycles: Record<number, Cycle>;
  projects: Record<number, Project>;
  initiatives: Record<number, Initiative>;
  /** PIs under every team copy's id (`Release.ids`), so any project's `pi_id` resolves; one object per PI. */
  releases: Record<number, Release>;
  /** Keyed "projects:<sorted team ids>", "initiatives:<sorted team ids>", "project-initiative:<id>". */
  lists: Record<string, ListState>;
  cycleLists: Record<number, CycleListState>;
  cycleStats: Record<number, CycleStats>;
  /** Keyed "project:<id>" / "initiative:<id>". */
  pmDetails: Record<string, PmExtras>;
  /** Burn-ups (spec §19.9), keyed "cycle:<team>:<cycle>" / "project:<ref>" (`burnupKey`). */
  burnups: Record<string, Burnup | "error" | "loading">;
  issues: Record<number, Issue>;
  subIssues: Record<number, SubIssue>;
  /** Comments and activity per issue, from its detail load (spec §18.10). */
  details: Record<number, IssueExtras>;
  teamState: Record<number, TeamState>;
  lastSync: string | null;
  stale: boolean;
  toasts: Toast[];
  /** In-flight write counts per "issue:<id>" and "sub:<id>". */
  pending: Record<string, number>;
  load(): Promise<void>;
  /** The 5-minute full refresh (spec §6.4): re-bootstrap, then reload every loaded team. Throws if Rally fails. */
  refresh(): Promise<void>;
  loadTeam(id: number): Promise<void>;
  loadTeamPage(id: number): Promise<void>;
  loadedTeamIds(): number[];
  /** `readStamp` is `stamp()` taken when the poll began; items written since then are left alone. */
  applyChanges(changes: Changes, readStamp?: number): void;
  stamp(): number;
  /** The current session (bumped when the account changes or disconnects): a reply from an earlier one is dropped. */
  session(): number;
  updateIssue(id: number, patch: IssuePatch): Promise<void>;
  updateIssues(ids: number[], patch: IssuePatch): Promise<void>;
  /** Several issues, each with its own patch: all show at once, and the writes reach Rally one at a time. */
  updateMany(changes: { id: number; patch: IssuePatch }[]): Promise<void>;
  rankIssue(id: number, req: RankRequest): Promise<void>;
  createIssue(data: IssueCreate): Promise<Issue | null>;
  loadIssueDetail(ref: string | number): Promise<DetailResult>;
  searchRemote(q: string): Promise<SearchResult>;
  searchUsers(q: string): Promise<User[]>;
  searchLabels(q: string): Promise<string[]>;
  updateSubIssue(id: number, patch: SubIssuePatch): Promise<void>;
  /** Shows the comment at once; resolves false (comment removed, toast shown) when Rally or the guard refuses it. */
  postComment(issueId: number, html: string): Promise<boolean>;
  createSubIssue(issueId: number, title: string): Promise<SubIssue | null>;
  loadProjects(teamIds: number[]): Promise<void>;
  loadInitiativeProjects(initiativeId: number): Promise<void>;
  loadInitiatives(teamIds: number[]): Promise<void>;
  loadReleases(teamIds: number[]): Promise<void>;
  loadProject(ref: string): Promise<DetailResult>;
  loadInitiative(ref: string): Promise<DetailResult>;
  /** `past` is how many ended cycles to include; "Show older cycles" passes the current one plus 6. */
  loadCycles(teamId: number, past?: number): Promise<void>;
  loadCycle(teamId: number, cycleId: number): Promise<DetailResult>;
  /** Loads one burn-up; a chart already shown stays up while it reloads and if the reload fails. Never toasts (ruling 15). */
  loadBurnup(key: string, target: BurnupTarget): Promise<void>;
  /** Waits for Rally (no optimistic copy): resolves false, with a toast, when Rally or the guard refuses it. */
  postUpdate(kind: PortfolioKind, id: number, health: ReportedHealth, html: string): Promise<boolean>;
  /** Shows the comment at once; resolves false (comment removed, toast shown) when Rally or the guard refuses it. */
  postPmComment(kind: PortfolioKind, id: number, html: string): Promise<boolean>;
  setPmPriority(kind: PortfolioKind, id: number, priority: Priority): Promise<void>;
  /**
   * Resolves null once connected (and loaded), else the message to show under the key field. `onAccepted` runs once Rally
   * accepts the key, before the reload, so a dialog can close first. Another account's key drops the cached data.
   */
  connect(apiKey: string, onAccepted?: (session: Session) => void): Promise<string | null>;
  disconnect(): Promise<void>;
  pushToast(message: string, retry?: () => void): void;
  dismissToast(id: number): void;
  setStale(stale: boolean): void;
}

export type AppStore = StoreApi<AppState>;

export function asApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(-1, e instanceof Error ? e.message : String(e));
}

const byId = <T extends { id: number }>(xs: T[]): Record<number, T> => Object.fromEntries(xs.map((x) => [x.id, x]));
const merge = <T extends { id: number }>(into: Record<number, T>, xs: T[] = []): Record<number, T> =>
  xs.length ? { ...into, ...byId(xs) } : into;
const BLANK_TEAM: TeamState = { status: "loading", memberIds: [] };
/** The `pending` key for an issue's writes. */
export const issueKey = (id: number) => `issue:${id}`;
const subKey = (id: number) => `sub:${id}`;

const metaFrom = (b: Bootstrap): Meta => ({
  me: b.me, workspace: b.workspace, projectPriority: b.project_priority, initiativePriority: b.initiative_priority,
});

/**
 * PIs merged into the cache under every copy id. A read that shares any id with a known PI joins it (union of ids, the
 * known `id` kept), so one PI read in a different copy order never becomes two.
 */
export function mergeReleases(into: Record<number, Release>, incoming: Release[] = []): Record<number, Release> {
  if (!incoming.length) return into;
  const out = { ...into };
  for (const r of incoming) {
    const copies = r.ids?.length ? r.ids : [r.id];
    const known = [r.id, ...copies].map((id) => out[id]).find(Boolean);
    const ids = [...new Set([...(known?.ids ?? []), ...copies, r.id])];
    const merged: Release = { ...r, id: known?.id ?? r.id, ids };
    for (const id of ids) out[id] = merged;
  }
  return out;
}

/** The `lists` key for a team set: "projects:9001,9002" (ids sorted). */
export const listKey = (kind: string, teamIds: number[]) => `${kind}:${[...teamIds].sort((a, b) => a - b).join(",")}`;
const pmKey = (kind: PortfolioKind, id: number) => `${kind}:${id}`;
/** The `burnups` key of a cycle's or a project's burn-up. */
export const burnupKey = (t: BurnupTarget) => (t.kind === "cycle" ? `cycle:${t.teamId}:${t.cycleId}` : `project:${t.ref}`);
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);
const PAST_DEFAULT = 2;
/** The server's `_reported` (server/app/pm.py): the health an update gives its project or initiative. */
const reportedHealth = (u: Update) => ({ value: u.health, source: "update" as const, reason: `Reported ${u.created_at.slice(0, 10)}` });

/** What a signed-out store holds: nothing from the last session. */
const emptyData = () => ({
  status: "needs-key" as Status, error: null, meta: null, yourTeamIds: [] as number[], users: {}, teams: {}, cycles: {}, projects: {},
  initiatives: {}, releases: {}, lists: {}, cycleLists: {}, cycleStats: {}, pmDetails: {}, burnups: {}, issues: {}, subIssues: {},
  details: {}, teamState: {}, lastSync: null, stale: false, pending: {},
});

export function createAppStore(api: Api): AppStore {
  const queues = new Map<string, Promise<void>>();
  interface Entry<T, P> { patch: P; before: T }
  const entries = new Map<string, Entry<never, never>[]>();
  let toastSeq = 0;
  let tempSeq = 0;
  /** A logical clock ticked whenever a write starts or finishes, so a read can tell it predates a write. */
  let clock = 0;
  const touched = new Map<string, number>();
  /** The newest request per list key ("cycles:<team>" for cycle lists): an older one that settles later is dropped. */
  const latestLoad = new Map<string, number>();
  let loadSeq = 0;
  /** Each team's last cycle list that loaded fully, which a failed reload falls back to. */
  const settledCycles = new Map<number, CycleListState>();
  const cycleLoads = new Map<string, Promise<void>>(); // teamId:past -> its load while it is pending
  const burnupLoads = new Map<string, Promise<void>>(); // burn-up key -> its load while it is pending
  /**
   * The session: bumped when the account changes or disconnects. A reply to a request made in an earlier session is
   * dropped, toast and all, so nothing of the old account lands in the new one.
   */
  let epoch = 0;
  /** Call before an await; the returned check is false once the session has changed. */
  const session = () => {
    const at = epoch;
    return () => at === epoch;
  };

  return createStore<AppState>()((set, get) => {
    const bump = (key: string, delta: number) =>
      set((s) => {
        touched.set(key, ++clock);
        const n = (s.pending[key] ?? 0) + delta;
        const pending = { ...s.pending };
        if (n > 0) pending[key] = n;
        else delete pending[key];
        return { pending };
      });

    /** One queue per item: its writes reach Rally in the order they were made. */
    const enqueue = (key: string, job: () => Promise<void>): Promise<void> => {
      const next = (queues.get(key) ?? Promise.resolve()).then(job);
      queues.set(key, next);
      void next.then(() => {
        if (queues.get(key) === next) queues.delete(key);
      });
      return next;
    };

    /** Keys with a write in flight, or one that started or finished after the read began (`since`). */
    const hotKeys = (s: AppState, since: number) => {
      const hot = new Set(Object.keys(s.pending));
      for (const [key, at] of touched) if (at > since) hot.add(key);
      return hot;
    };

    /**
     * Merge server issues and sub-issues without clobbering local writes: anything hot keeps its local copy.
     * `drop` first removes cached issues a full refresh no longer returns (deletions, moves out of scope), unless hot.
     */
    const mergeItems = (s: AppState, issues: Issue[], subs: SubIssue[], since: number, drop?: (i: Issue) => boolean) => {
      const hot = hotKeys(s, since);
      const nextIssues = { ...s.issues };
      if (drop) for (const i of Object.values(s.issues)) if (drop(i) && !hot.has(issueKey(i.id))) delete nextIssues[i.id];
      for (const i of issues) if (!hot.has(issueKey(i.id))) nextIssues[i.id] = i;
      const nextSubs = { ...s.subIssues };
      for (const t of subs) if (!hot.has(subKey(t.id))) nextSubs[t.id] = t;
      return { issues: nextIssues, subIssues: nextSubs };
    };

    /** Portfolio items from a read, except those with a write in flight or one that started or finished since it began. */
    const keepCold = <T extends { id: number }>(hot: Set<string>, xs: T[], kind: PortfolioKind) =>
      xs.filter((x) => !hot.has(pmKey(kind, x.id)));

    /**
     * Every project merge. Issue-side reads (bootstrap, team, cycle, issue, search) build projects without health, so a
     * null health means "not read here": the copy keeps the health and latest update a PM read gave it.
     */
    const mergeProjects = (s: AppState, xs: Project[] = [], since: number): Record<number, Project> => {
      const live = keepCold(hotKeys(s, since), xs, "project");
      if (!live.length) return s.projects;
      const next = { ...s.projects };
      for (const p of live) {
        const had = s.projects[p.id];
        next[p.id] = p.health === null && had ? { ...p, health: had.health, latest_update: had.latest_update } : p;
      }
      return next;
    };

    const mergeRefs = (s: AppState, r: { cycles?: Cycle[]; projects?: Project[]; users?: User[]; teams?: Team[] }, since: number) => ({
      cycles: merge(s.cycles, r.cycles), projects: mergeProjects(s, r.projects, since), users: merge(s.users, r.users),
      teams: merge(s.teams, r.teams),
    });

    /** Projects and initiatives from a read, except those with a write in flight or finished since it began. */
    const mergePortfolio = (s: AppState, r: { projects?: Project[]; initiatives?: Initiative[] }, since: number) => {
      const initiatives = keepCold(hotKeys(s, since), r.initiatives ?? [], "initiative");
      return { projects: mergeProjects(s, r.projects, since), initiatives: initiatives.length ? merge(s.initiatives, initiatives) : s.initiatives };
    };

    /**
     * A detail's comments from the server, followed by this session's comments Rally hasn't confirmed yet (negative ids),
     * so a reload in the middle of posting doesn't make the comment vanish.
     */
    const withTemps = (server: Comment[], cached: Comment[] = []): Comment[] => [...server, ...cached.filter((c) => c.id < 0)];
    /** The saved comment takes its temp's place, unless a reload brought it in already: then the temp just goes. */
    const settle = (cs: Comment[], tempId: number, saved: Comment): Comment[] =>
      cs.some((c) => c.id === saved.id) ? cs.filter((c) => c.id !== tempId) : cs.map((c) => (c.id === tempId ? saved : c));

    /** Rally's own key for the API ("F201"); the proxy also accepts the ObjectID, which is the fallback (ruling R1). */
    const refOf = (kind: PortfolioKind, id: number) =>
      (kind === "project" ? get().projects[id]?.key : get().initiatives[id]?.key) ?? String(id);

    /** Shared by the three list loads: ids kept while reloading; a failed reload of a list already shown leaves it up. */
    async function loadList<R>(key: string, call: () => Promise<R>, ingest: (s: AppState, r: R, since: number) => Partial<AppState>,
                               idsOf: (r: R) => number[]): Promise<void> {
      const known = get().lists[key]?.status === "ready";
      if (!known) set((s) => ({ lists: { ...s.lists, [key]: { status: "loading", ids: s.lists[key]?.ids ?? [] } } }));
      const started = clock;
      const token = ++loadSeq;
      latestLoad.set(key, token);
      const live = session();
      try {
        const r = await call();
        if (!live() || latestLoad.get(key) !== token) return;
        set((s) => ({ ...ingest(s, r, started), lists: { ...s.lists, [key]: { status: "ready", ids: idsOf(r) } } }));
      } catch (e) {
        if (!live() || latestLoad.get(key) !== token) return;
        set((s) => ({ lists: { ...s.lists, [key]: { status: known ? "ready" : "error", ids: s.lists[key]?.ids ?? [] } } }));
        fail(e, () => void loadList(key, call, ingest, idsOf));
      }
    }
    const ingestProjects = (s: AppState, r: { projects: Project[]; initiatives?: Initiative[]; teams?: Team[]; releases?: Release[] },
                            since: number) => ({
      ...mergePortfolio(s, r, since), teams: merge(s.teams, r.teams), releases: mergeReleases(s.releases, r.releases),
    });

    const putIssue = (issue: Issue) => set((s) => ({ issues: { ...s.issues, [issue.id]: issue } }));
    const putSub = (sub: SubIssue) => set((s) => ({ subIssues: { ...s.subIssues, [sub.id]: sub } }));
    /** True when no later write for this key is still queued, so the server copy is the latest truth. */
    const lastInQueue = (key: string) => (get().pending[key] ?? 0) <= 1;
    /**
     * A failed entry reverts only the fields no later pending entry also sets. For those, each later entry
     * inherits this entry's original value, so it restores the true original if it fails too.
     */
    function rollback<T, P extends object>(
      key: string, entry: Entry<T, P>, current: T | undefined, revert: (c: T, b: T, p: P) => T,
    ): T | undefined {
      const list = (entries.get(key) ?? []) as unknown as Entry<T, P>[];
      const later = list.slice(list.indexOf(entry) + 1);
      const own: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(entry.patch)) {
        const hit = later.filter((l) => field in l.patch);
        if (hit.length === 0) own[field] = value;
        else for (const l of hit) l.before = revert(l.before, entry.before, { [field]: value } as P);
      }
      return current === undefined ? undefined : revert(current, entry.before, own as P);
    }
    const track = <T, P>(key: string, entry: Entry<T, P>) =>
      entries.set(key, [...(entries.get(key) ?? []), entry as unknown as Entry<never, never>]);
    const untrack = (key: string, entry: object) => {
      const rest = (entries.get(key) ?? []).filter((x) => x !== entry);
      if (rest.length) entries.set(key, rest);
      else entries.delete(key);
    };
    /** Only a slow or unreachable Rally can succeed on retry; guard and validation refusals won't. */
    const fail = (e: unknown, retry?: () => void) => {
      const err = asApiError(e);
      get().pushToast(err.message, [0, 502, 504].includes(err.status) ? retry : undefined);
    };
    const setTeam = (id: number, patch: Partial<TeamState>) =>
      set((s) => ({ teamState: { ...s.teamState, [id]: { ...BLANK_TEAM, ...s.teamState[id], ...patch } } }));

    /** Applies the edit at once; `after` holds the send back until that promise settles (used to serialise bulk edits). */
    const writeIssue = (id: number, patch: LocalIssuePatch, send: () => Promise<Issue>, retry: () => void,
                        after: Promise<void> = Promise.resolve()): Promise<void> => {
      const before = get().issues[id];
      if (!before) return Promise.resolve();
      putIssue(applyIssuePatch(before, patch, get().users));
      const key = issueKey(id);
      const entry = { patch, before };
      track(key, entry);
      bump(key, 1);
      const live = session();
      return enqueue(key, async () => {
        await after;
        if (!live()) return; // the account changed while this waited: it must not reach Rally under the new key
        try {
          const fresh = await send();
          if (live() && lastInQueue(key)) putIssue(fresh);
        } catch (e) {
          if (!live()) return;
          const reverted = rollback(key, entry, get().issues[id], revertIssueFields);
          if (reverted) putIssue(reverted);
          fail(e, retry);
        } finally {
          untrack(key, entry);
          bump(key, -1);
        }
      });
    };

    const fetchCycles = async (teamId: number, past: number): Promise<void> => {
      const before = get().cycleLists[teamId];
      const token = ++loadSeq;
      const key = `cycles:${teamId}`;
      latestLoad.set(key, token);
      set((s) => ({
        cycleLists: { ...s.cycleLists, [teamId]: { status: "loading", ids: before?.ids ?? [], hasOlder: before?.hasOlder ?? false, past } },
      }));
      const live = session();
      try {
        const r = await api.teamCycles(teamId, past);
        if (!live() || latestLoad.get(key) !== token) return;
        const loaded: CycleListState = { status: "ready", ids: ids(r.cycles), hasOlder: r.has_older, past };
        settledCycles.set(teamId, loaded);
        set((s) => ({
          cycles: merge(s.cycles, r.cycles), cycleStats: { ...s.cycleStats, ...Object.fromEntries(r.stats.map((x) => [x.cycle_id, x])) },
          cycleLists: { ...s.cycleLists, [teamId]: loaded },
        }));
      } catch (e) {
        if (!live() || latestLoad.get(key) !== token) return;
        // A failed "Show older cycles" goes back to the cycles that were showing; with none shown, it is an error.
        const settled = settledCycles.get(teamId);
        set((s) => ({
          cycleLists: { ...s.cycleLists, [teamId]: settled ?? { status: "error", ids: [], hasOlder: false, past } },
        }));
        fail(e, () => void get().loadCycles(teamId, past));
      }
    };

    /** A new session: empty data, and every per-session map cleared, so no earlier request's reply is let back in. */
    const resetSession = (status: Status) => {
      epoch += 1;
      latestLoad.clear();
      settledCycles.clear();
      cycleLoads.clear();
      burnupLoads.clear();
      touched.clear();
      queues.clear();
      entries.clear();
      set({ ...emptyData(), status });
    };

    return {
      status: "loading",
      error: null,
      meta: null,
      yourTeamIds: [],
      users: {},
      teams: {},
      cycles: {},
      projects: {},
      initiatives: {},
      releases: {},
      lists: {},
      cycleLists: {},
      cycleStats: {},
      pmDetails: {},
      burnups: {},
      issues: {},
      subIssues: {},
      details: {},
      teamState: {},
      lastSync: null,
      stale: false,
      toasts: [],
      pending: {},

      async load() {
        // keep the offline banner up while a retry is in flight
        set(get().status === "offline" ? { error: null } : { status: "loading", error: null });
        const started = clock;
        const live = session();
        try {
          const b = await api.bootstrap();
          if (!live()) return;
          set((s) => ({
            status: "ready", error: null, meta: metaFrom(b), yourTeamIds: b.teams.map((t) => t.id), lastSync: b.server_time,
            stale: false, ...mergeRefs(s, b, started), ...mergeItems(s, b.issues, b.sub_issues, started),
          }));
        } catch (e) {
          if (!live()) return;
          const err = asApiError(e);
          set({ status: err.status === 401 ? "needs-key" : err.status === 0 ? "offline" : "error", error: err.message });
        }
      },

      async refresh() {
        const started = clock;
        const live = session();
        const b = await api.bootstrap();
        if (!live()) return;
        const loaded = new Set(get().loadedTeamIds());
        const me = b.me.id;
        // Yours before, absent now, and not covered by a loaded team's refresh: reassigned away, or deleted.
        const gone = (i: Issue) => !loaded.has(i.team_id) && (i.assignee?.id === me || i.creator?.id === me);
        set((s) => ({
          meta: metaFrom(b), yourTeamIds: b.teams.map((t) => t.id), lastSync: b.server_time, stale: false,
          ...mergeRefs(s, b, started), ...mergeItems(s, b.issues, b.sub_issues, started, gone),
        }));
        await Promise.all([...loaded].map((id) => get().loadTeam(id)));
      },

      async loadTeam(id) {
        const known = get().teamState[id]?.status === "ready";
        if (!known) setTeam(id, { status: "loading", notFound: false });
        const started = clock;
        const live = session();
        try {
          const t = await api.team(id);
          if (!live()) return;
          const listed = new Set(t.issues.map((i) => i.id));
          // A full team load catches deletions and moves out of the team (spec §6.4): open issues it no longer lists go.
          const gone = (i: Issue) => i.team_id === id && i.status !== "done" && !listed.has(i.id);
          set((s) => ({
            ...mergeRefs(s, { ...t, teams: [t.team, ...t.child_teams] }, started), ...mergeItems(s, t.issues, [], started, gone),
            teamState: { ...s.teamState, [id]: { ...s.teamState[id], status: "ready", memberIds: t.member_ids, notFound: false } },
          }));
        } catch (e) {
          if (!live()) return;
          const notFound = !known && asApiError(e).status === 404;
          setTeam(id, { status: known ? "ready" : "error", notFound });
          if (!notFound) fail(e, () => void get().loadTeam(id)); // the screen says so; no toast on top

        }
      },

      async loadTeamPage(id) {
        const cursor = get().teamState[id]?.nextCursor;
        if (cursor === null) return;
        const started = clock;
        const live = session();
        try {
          const page = await api.teamIssues(id, cursor ?? 1);
          if (!live()) return;
          set((s) => ({
            ...mergeRefs(s, page, started), ...mergeItems(s, page.issues, [], started),
            teamState: { ...s.teamState, [id]: { ...BLANK_TEAM, ...s.teamState[id], nextCursor: page.next_cursor } },
          }));
        } catch (e) {
          if (live()) fail(e, () => void get().loadTeamPage(id));
        }
      },

      loadedTeamIds: () =>
        Object.entries(get().teamState).filter(([, st]) => st.status === "ready").map(([id]) => Number(id)),

      stamp: () => clock,
      session: () => epoch,

      applyChanges(changes, readStamp = Infinity) {
        set((s) => ({
          ...mergeRefs(s, changes, readStamp), ...mergeItems(s, changes.issues, changes.sub_issues, readStamp),
          lastSync: changes.server_time, stale: false,
        }));
      },

      updateIssue(id, patch) {
        return writeIssue(id, patch, () => api.patchIssue(id, patch), () => void get().updateIssue(id, patch));
      },

      updateIssues(ids, patch) {
        return get().updateMany(ids.map((id) => ({ id, patch })));
      },

      async updateMany(changes) {
        // Every item changes on screen now; the writes then reach Rally one after another, because Rally
        // answers parallel writes with ConcurrencyConflict. Each send waits for the previous item's write to settle.
        let previous: Promise<void> = Promise.resolve();
        const all = changes.map(({ id, patch }) =>
          (previous = writeIssue(id, patch, () => api.patchIssue(id, patch), () => void get().updateIssue(id, patch), previous)));
        await Promise.all(all);
      },

      rankIssue(id, req) {
        const s = get();
        const targetId = "above" in req ? req.above : req.below;
        const target = s.issues[targetId];
        if (targetId === id || !s.issues[id] || !target) return Promise.resolve();
        // Place it between the target and the target's cached neighbour on that side (spec §5.5).
        const others = Object.values(s.issues).filter((i) => i.id !== id).sort(byRank);
        const at = others.indexOf(target);
        const rank = "above" in req
          ? rankBetween(others[at - 1]?.rank ?? null, target.rank)
          : rankBetween(target.rank, others[at + 1]?.rank ?? null);
        return writeIssue(id, rank === null ? {} : { rank }, () => api.rankIssue(id, req), () => void get().rankIssue(id, req));
      },

      async createIssue(data) {
        const live = session();
        try {
          const issue = await api.createIssue(data);
          if (!live()) return null;
          putIssue(issue);
          return issue;
        } catch (e) {
          if (live()) fail(e);
          return null;
        }
      },

      async loadIssueDetail(ref) {
        const started = clock;
        const live = session();
        try {
          const d = await api.issue(ref);
          if (!live()) return "error";
          set((s) => ({
            ...mergeRefs(s, d, started), ...mergeItems(s, [d.issue], d.sub_issues, started),
            details: { ...s.details, [d.issue.id]: { comments: withTemps(d.comments, s.details[d.issue.id]?.comments), activity: d.activity } },
          }));
          return d.issue.id;
        } catch (e) {
          if (!live()) return "error";
          if (asApiError(e).status === 404) return "not-found";
          fail(e);
          return "error";
        }
      },

      async searchRemote(q) {
        const started = clock;
        const live = session();
        try {
          const found = await api.search(q);
          if (!live()) return { issues: [], teams: [], projects: [] };
          set((s) => ({
            issues: { ...byId(found.issues), ...s.issues }, // local copies (maybe mid-edit) win
            ...mergeRefs(s, { teams: found.teams, projects: found.projects }, started),
          }));
          return found;
        } catch {
          return { issues: [], teams: [], projects: [] };
        }
      },

      async searchUsers(q) {
        try {
          const live = session();
          const users = await api.users(q);
          if (live()) set((s) => ({ users: merge(s.users, users) }));
          return users;
        } catch {
          return [];
        }
      },

      async searchLabels(q) {
        try {
          return await api.labels(q);
        } catch {
          return [];
        }
      },

      updateSubIssue(id, patch) {
        const before = get().subIssues[id];
        if (!before) return Promise.resolve();
        putSub(applySubIssuePatch(before, patch, get().users));
        const key = subKey(id);
        const entry = { patch, before };
        track(key, entry);
        bump(key, 1);
        const live = session();
        return enqueue(key, async () => {
          if (!live()) return; // the account changed while this waited
          try {
            const fresh = await api.patchSubIssue(id, patch);
            if (live() && lastInQueue(key)) putSub(fresh);
          } catch (e) {
            if (!live()) return;
            const reverted = rollback(key, entry, get().subIssues[id], revertSubIssueFields);
            if (reverted) putSub(reverted);
            fail(e, () => void get().updateSubIssue(id, patch));
          } finally {
            untrack(key, entry);
            bump(key, -1);
          }
        });
      },

      async postComment(issueId, html) {
        const me = get().meta?.me ?? null;
        const temp: Comment = { id: -++tempSeq, author: me, html, created_at: new Date().toISOString() };
        const edit = (fn: (cs: Comment[]) => Comment[]) => set((s) => {
          const d = s.details[issueId] ?? { comments: [], activity: [] };
          return { details: { ...s.details, [issueId]: { ...d, comments: fn(d.comments) } } };
        });
        edit((cs) => [...cs, temp]);
        const live = session();
        try {
          const saved = await api.postComment(issueId, html);
          if (!live()) return false;
          edit((cs) => settle(cs, temp.id, saved));
          return true;
        } catch (e) {
          if (!live()) return false;
          edit((cs) => cs.filter((c) => c.id !== temp.id));
          // No Retry on the toast: the comment box restores the text, and resending from there is the retry.
          fail(e);
          return false;
        }
      },

      async createSubIssue(issueId, title) {
        const live = session();
        try {
          const sub = await api.createSubIssue(issueId, { title });
          if (!live()) return null;
          putSub(sub);
          const parent = get().issues[issueId];
          if (parent) putIssue({ ...parent, sub_issue_count: parent.sub_issue_count + 1 });
          return sub;
        } catch (e) {
          if (live()) fail(e);
          return null;
        }
      },

      loadProjects: (teamIds) =>
        loadList(listKey("projects", teamIds), () => api.projects(teamIds), ingestProjects, (r) => ids(r.projects)),

      loadInitiativeProjects: (initiativeId) =>
        loadList(`project-initiative:${initiativeId}`, () => api.projects([], initiativeId), ingestProjects, (r) => ids(r.projects)),

      loadInitiatives: (teamIds) =>
        loadList(listKey("initiatives", teamIds), () => api.initiatives(teamIds),
                 (s, r, since) => ({ ...mergePortfolio(s, r, since), releases: mergeReleases(s.releases, r.releases) }),
                 (r) => ids(r.initiatives)),

      async loadReleases(teamIds) {
        const live = session();
        try {
          const releases = await api.releases(teamIds);
          if (live()) set((s) => ({ releases: mergeReleases(s.releases, releases) }));
        } catch (e) {
          if (live()) fail(e, () => void get().loadReleases(teamIds));
        }
      },

      async loadProject(ref) {
        const started = clock;
        const live = session();
        try {
          const d = await api.project(ref);
          if (!live()) return "error";
          const key = pmKey("project", d.project.id);
          set((s) => ({
            ...mergeRefs(s, d, started), ...mergePortfolio(s, { projects: [d.project] }, started), ...mergeItems(s, d.issues, [], started),
            releases: mergeReleases(s.releases, d.releases),
            pmDetails: { ...s.pmDetails, [key]: { description: d.description, updates: d.updates, comments: withTemps(d.comments, s.pmDetails[key]?.comments) } },
          }));
          return d.project.id;
        } catch (e) {
          if (!live()) return "error";
          if (asApiError(e).status === 404) return "not-found";
          fail(e);
          return "error";
        }
      },

      async loadInitiative(ref) {
        const started = clock;
        const live = session();
        try {
          const d = await api.initiative(ref);
          if (!live()) return "error";
          const key = pmKey("initiative", d.initiative.id);
          set((s) => ({
            ...mergePortfolio(s, { initiatives: [d.initiative], projects: d.projects }, started), releases: mergeReleases(s.releases, d.releases),
            pmDetails: { ...s.pmDetails, [key]: { description: d.description, updates: d.updates, comments: withTemps(d.comments, s.pmDetails[key]?.comments) } },
          }));
          return d.initiative.id;
        } catch (e) {
          if (!live()) return "error";
          if (asApiError(e).status === 404) return "not-found";
          fail(e);
          return "error";
        }
      },

      loadCycles(teamId, past = PAST_DEFAULT) {
        // The same load while one is pending (a re-render, a double click) is that load, not another trip to Rally.
        const same = `${teamId}:${past}`;
        const pending = cycleLoads.get(same);
        if (pending) return pending;
        const load: Promise<void> = fetchCycles(teamId, past).finally(() => {
          if (cycleLoads.get(same) === load) cycleLoads.delete(same);
        });
        cycleLoads.set(same, load);
        return load;
      },

      loadBurnup(key, target) {
        const pending = burnupLoads.get(key);
        if (pending) return pending;
        const shown = () => typeof get().burnups[key] === "object";
        if (!shown()) set((s) => ({ burnups: { ...s.burnups, [key]: "loading" } }));
        const live = session();
        const run: Promise<void> = api.burnup(target).then(
          (b) => { if (live()) set((s) => ({ burnups: { ...s.burnups, [key]: b } })); },
          // The chart area says "Burn-up unavailable" and the legend stays (ruling 15); no toast on top.
          () => { if (live() && !shown()) set((s) => ({ burnups: { ...s.burnups, [key]: "error" } })); },
        ).finally(() => { if (burnupLoads.get(key) === run) burnupLoads.delete(key); });
        burnupLoads.set(key, run);
        return run;
      },

      async loadCycle(teamId, cycleId) {
        const started = clock;
        const live = session();
        try {
          const d = await api.cycle(teamId, cycleId);
          if (!live()) return "error";
          set((s) => ({
            ...mergeRefs(s, { ...d, cycles: [d.cycle, ...d.siblings] }, started), ...mergeItems(s, d.issues, [], started),
          }));
          return d.cycle.id;
        } catch (e) {
          if (!live()) return "error";
          if (asApiError(e).status === 404) return "not-found";
          fail(e);
          return "error";
        }
      },

      async postUpdate(kind, id, health, html) {
        const ref = refOf(kind, id);
        const live = session();
        try {
          const update = await api.postUpdate(kind, ref, health, html);
          if (!live()) return false;
          const key = pmKey(kind, id);
          const reported = reportedHealth(update);
          touched.set(key, ++clock); // a read that began before this can't put the old health back
          set((s) => {
            const d = s.pmDetails[key] ?? { description: "", updates: [], comments: [] };
            const next = { pmDetails: { ...s.pmDetails, [key]: { ...d, updates: [update, ...d.updates] } } };
            if (kind === "project") {
              const p = s.projects[id];
              return p ? { ...next, projects: { ...s.projects, [id]: { ...p, latest_update: update, health: reported } } } : next;
            }
            const i = s.initiatives[id];
            return i ? { ...next, initiatives: { ...s.initiatives, [id]: { ...i, latest_update: update, health: reported } } } : next;
          });
          // An initiative without its own update reports the worst of its projects, so its list is now out of date.
          // The reload runs on its own: the post is done once Rally has it ("Posting…" doesn't wait for the lists).
          if (kind === "project") {
            const loaded = Object.entries(get().lists).filter(([k, l]) => k.startsWith("initiatives:") && l.status === "ready");
            for (const [k] of loaded) void get().loadInitiatives(k.slice("initiatives:".length).split(",").filter(Boolean).map(Number));
          }
          return true;
        } catch (e) {
          // No Retry on the toast: the composer keeps the text, and posting again from there is the retry.
          if (live()) fail(e);
          return false;
        }
      },

      async postPmComment(kind, id, html) {
        const me = get().meta?.me ?? null;
        const temp: Comment = { id: -++tempSeq, author: me, html, created_at: new Date().toISOString() };
        const key = pmKey(kind, id);
        const edit = (fn: (cs: Comment[]) => Comment[]) => set((s) => {
          const d = s.pmDetails[key] ?? { description: "", updates: [], comments: [] };
          return { pmDetails: { ...s.pmDetails, [key]: { ...d, comments: fn(d.comments) } } };
        });
        edit((cs) => [...cs, temp]);
        const live = session();
        try {
          const saved = await api.postPmComment(kind, refOf(kind, id), html);
          if (!live()) return false;
          edit((cs) => settle(cs, temp.id, saved));
          return true;
        } catch (e) {
          if (!live()) return false;
          edit((cs) => cs.filter((c) => c.id !== temp.id));
          fail(e);
          return false;
        }
      },

      setPmPriority(kind, id, priority) {
        type Item = Project | Initiative;
        const field = kind === "project" ? "projects" : "initiatives";
        const read = (): Item | undefined => get()[field][id];
        const put = (item: Item) => set((s) => ({ [field]: { ...s[field], [id]: item } }) as Partial<AppState>);
        const before = read();
        if (!before) return Promise.resolve();
        put({ ...before, priority });
        const key = pmKey(kind, id);
        const entry = { patch: { priority }, before };
        track(key, entry);
        bump(key, 1);
        const live = session();
        return enqueue(key, async () => {
          if (!live()) return; // the account changed while this waited
          try {
            const fresh = await api.patchPortfolio(kind, refOf(kind, id), priority);
            if (live() && lastInQueue(key)) put(fresh);
          } catch (e) {
            if (!live()) return;
            const reverted = rollback(key, entry, read(), (c, b, p: { priority?: Priority }) => ({ ...c, ...("priority" in p ? { priority: b.priority } : {}) }));
            if (reverted) put(reverted);
            fail(e, () => void get().setPmPriority(kind, id, priority));
          } finally {
            untrack(key, entry);
            bump(key, -1);
          }
        });
      },

      async connect(apiKey, onAccepted) {
        let session: Session;
        try {
          session = await api.connect(apiKey);
          if (!session.connected) return session.error ?? "Couldn't connect to Rally";
        } catch (e) {
          const err = asApiError(e);
          return err.status === 401 ? "Rally rejected that key" : err.message;
        }
        onAccepted?.(session);
        const prev = get().meta;
        const sameAccount = !!prev && session.me?.id === prev.me.id && session.workspace?.id === prev.workspace.id;
        // Another user's or workspace's key: nothing cached for the old account may survive into the new one.
        if (!sameAccount) resetSession("loading");
        else if (get().status === "ready") {
          // The same account with a new key: the cache is still right, so refresh it in place (no "Loading Rally…").
          try {
            await get().refresh();
            return null;
          } catch {
            /* fall back to a full load, which reports the failure */
          }
        }
        await get().load();
        return null;
      },

      async disconnect() {
        try {
          await api.disconnect();
        } catch (e) {
          fail(e);
          return;
        }
        resetSession("needs-key");
      },

      pushToast(message, retry) {
        set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, message, retry }] }));
      },

      dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },

      setStale(stale) {
        set({ stale });
      },
    };
  });
}

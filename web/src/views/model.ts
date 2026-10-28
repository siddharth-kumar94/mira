import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Cycle, type Issue, type Priority, type Project, type Status, type Team, type User } from "../api/types";
import { points } from "../components/format";
import { byRank } from "../store/rank";
import type { CompletedWindow, ComposerPrefill, DisplayOptions, FilterField, FilterValue, Filters, GroupBy, OrderBy, Scope } from "./types";

const DAY = 24 * 60 * 60 * 1000;
/** Bootstrap loads 14 days of Done (spec §6.2); the window narrows it per view (§18.1). */
export const COMPLETED_MS: Record<CompletedWindow, number> = { none: -1, day: DAY, week: 7 * DAY, two_weeks: 14 * DAY };
const PROGRESS: Status[] = ["in_review", "in_progress", "todo", "backlog", "done"]; // work in flight first
/** Linear's Filter menu order, limited to what Rally backs (spec §18.6). "team" shows only across teams. */
export const FILTER_FIELDS: ([FilterField, string] | "divider")[] = [
  ["team", "Team"], ["status", "Status"], ["assignee", "Assignee"], ["creator", "Creator"], ["priority", "Priority"],
  ["estimate", "Estimate"], ["label", "Labels"], "divider", ["project", "Feature"], ["cycle", "Sprint"],
];
export const FIELD_LABEL = Object.fromEntries(FILTER_FIELDS.filter((f) => f !== "divider")) as Record<FilterField, string>;

export interface Context {
  meId: number | null;
  now: number;
  users: Record<number, User>;
  projects: Record<number, Project>;
  cycles: Record<number, Cycle>;
  /** A team's people, for empty assignee groups. */
  memberIds?: number[];
  /** Limits empty project and cycle groups to that team's own. */
  teamId?: number;
  teams: Record<number, Team>;
  /** The team and every team under it (an ART's children). Defaults to `[teamId]`. */
  scopeTeamIds?: number[];
  /** Same-named cycles become one group or filter value (ART views, Phase 4). Off everywhere else (D29). */
  mergeCycles?: boolean;
}

export interface Group {
  key: string;
  label: string;
  field: GroupBy;
  /** What dropping an issue here sets: a status, priority, user id, project id, or null for "none". */
  value: FilterValue;
  /** Every cycle merged into this group (cycle grouping only). */
  cycleIds: number[];
  /** The cycle this group is (focus and cycle grouping), for its icon and dates. */
  cycle: Cycle | null;
  /** The team of that cycle, for the label and the composer prefill. */
  teamId: number | null;
  issues: Issue[];
}

export function viewKey(scope: Scope): string {
  switch (scope.kind) {
    case "my": return `my:${scope.tab}`;
    case "team": return `team:${scope.teamId}:${scope.tab}`;
    case "cycle": return `cycle:${scope.teamId}:${scope.cycleKey}`;
    case "project": return `project:${scope.projectId}`;
  }
}

const doneWithin = (i: Issue, window: CompletedWindow, now: number) =>
  i.completed_at !== null && now - Date.parse(i.completed_at) <= COMPLETED_MS[window];

/** The team and all its descendants by `parent_id` (an ART's child teams). Safe against a parent loop. */
export function teamScopeIds(teamId: number, teams: Record<number, Team>): number[] {
  const out = [teamId];
  for (let n = 0; n < out.length; n++) {
    for (const t of Object.values(teams)) if (t.parent_id === out[n] && !out.includes(t.id)) out.push(t.id);
  }
  return out;
}

/**
 * Spec §4: what each issue tab contains. Active has no Done (D31); My issues keeps Done inside its window. A cycle holds
 * every status, in the team's (or an ART's teams') copies of the cycle (§19.4); a project, its issues in any team (§19.6).
 */
export function inScope(i: Issue, scope: Scope, ctx: Pick<Context, "meId" | "now" | "scopeTeamIds"> & Partial<Pick<Context, "cycles">>,
                        completed: CompletedWindow = "two_weeks"): boolean {
  if (scope.kind === "my") {
    const who = scope.tab === "assigned" ? i.assignee : i.creator;
    return who !== null && who.id === ctx.meId && (i.status !== "done" || doneWithin(i, completed, ctx.now));
  }
  if (scope.kind === "project") return i.project_id === scope.projectId;
  if (!(ctx.scopeTeamIds ?? [scope.teamId]).includes(i.team_id)) return false;
  if (scope.kind === "cycle") {
    const cycle = i.cycle_id !== null ? ctx.cycles?.[i.cycle_id] : undefined;
    return cycle !== undefined && cycleKey(cycle) === scope.cycleKey;
  }
  if (scope.tab === "active") return i.status !== "backlog" && i.status !== "done";
  if (scope.tab === "backlog") return i.status === "backlog";
  return true;
}

/** With `ctx.mergeCycles`, a cycle is its merged key (see cycleKey), so same-named sprints of several teams are one value. */
export function fieldValues(i: Issue, field: FilterField, ctx?: Pick<Context, "cycles" | "mergeCycles">): FilterValue[] {
  switch (field) {
    case "team": return [i.team_id];
    case "status": return [i.status];
    case "assignee": return [i.assignee?.id ?? null];
    case "creator": return [i.creator?.id ?? null];
    case "priority": return [i.priority];
    case "estimate": return [i.estimate];
    case "label": return i.labels.length ? i.labels : [null];
    case "project": return [i.project_id];
    case "cycle": {
      const cycle = i.cycle_id !== null ? ctx?.cycles[i.cycle_id] : undefined;
      return [cycle && ctx?.mergeCycles ? cycleKey(cycle) : i.cycle_id];
    }
  }
}

export function matches(i: Issue, filters: Filters, ctx?: Pick<Context, "cycles" | "mergeCycles">): boolean {
  return (Object.entries(filters) as [FilterField, FilterValue[] | undefined][]).every(
    ([field, wanted]) => !wanted || wanted.length === 0 || fieldValues(i, field, ctx).some((v) => wanted.includes(v)));
}

export function toggleFilter(filters: Filters, field: FilterField, value: FilterValue): Filters {
  const current = filters[field] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const out = { ...filters };
  if (next.length) out[field] = next;
  else delete out[field];
  return out;
}

const time = (s: string | null) => (s ? Date.parse(s) : 0);

export function comparator(order: OrderBy): (a: Issue, b: Issue) => number {
  switch (order) {
    case "manual": return byRank;
    case "priority": return (a, b) => (a.priority || 5) - (b.priority || 5) || byRank(a, b);
    case "updated": return (a, b) => time(b.updated_at) - time(a.updated_at) || byRank(a, b);
    case "created": return (a, b) => time(b.created_at) - time(a.created_at) || byRank(a, b);
    case "importance": return (a, b) => {
      if (a.status === "done" && b.status === "done") return time(b.completed_at) - time(a.completed_at) || byRank(a, b);
      return PROGRESS.indexOf(a.status) - PROGRESS.indexOf(b.status) || (a.priority || 5) - (b.priority || 5) || byRank(a, b);
    };
    case "estimate": return (a, b) => (b.estimate ?? -1) - (a.estimate ?? -1) || byRank(a, b);
  }
}

/** Same-named cycles with the same dates are one cycle in cross-team views (spec D8, assumption 8). */
export const cycleKey = (c: Cycle): string => `${c.name}|${c.start.slice(0, 10)}|${c.end.slice(0, 10)}`;

/** "PI 4 · Sprint 3", plus " · AI/ML Solutions" when the view spans teams (D29). */
const cycleLabel = (c: Cycle, ctx: Pick<Context, "teamId" | "teams">) =>
  ctx.teamId === undefined ? `${c.name} · ${ctx.teams[c.team_id]?.name ?? "Team"}` : c.name;

export function valueLabel(field: FilterField | GroupBy, v: FilterValue, ctx: Context): string {
  switch (field) {
    case "team": return ctx.teams[v as number]?.name ?? `Team ${v}`;
    case "estimate": return v === null ? "No estimate" : points(v as number);
    case "status": return STATUS_LABEL[v as Status];
    case "priority": return PRIORITY_LABEL[v as Priority];
    case "assignee": return v === null ? "No assignee" : ctx.users[v as number]?.name ?? `Person ${v}`;
    case "creator": return v === null ? "No creator" : ctx.users[v as number]?.name ?? `Person ${v}`;
    case "label": return v === null ? "No labels" : String(v);
    case "project": return v === null ? "No feature" : ctx.projects[v as number]?.name ?? `Feature ${v}`;
    case "cycle":
      if (v === null) return "No sprint";
      if (typeof v === "string") return v.split("|")[0]; // a merged cycle key
      return ctx.cycles[v] ? cycleLabel(ctx.cycles[v], ctx) : `Sprint ${v}`;
    case "focus": return "Focus";
    case "none": return "All stories";
  }
}

export function filterOptions(field: FilterField, issues: Issue[], ctx: Context): { value: FilterValue; label: string }[] {
  if (field === "status") return STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
  if (field === "priority") return PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));
  const seen = new Map<string, { value: FilterValue; label: string }>();
  for (const i of issues) {
    for (const v of fieldValues(i, field, ctx)) if (!seen.has(String(v))) seen.set(String(v), { value: v, label: valueLabel(field, v, ctx) });
  }
  if (field === "estimate") return [...seen.values()].sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : (a.value as number) - (b.value as number)));
  const byStart = (v: FilterValue) => (field === "cycle" && typeof v === "number" ? ctx.cycles[v]?.start ?? "" : "");
  return [...seen.values()].sort((a, b) => (a.value === null ? 1 : b.value === null ? -1
    : byStart(a.value).localeCompare(byStart(b.value)) || a.label.localeCompare(b.label)));
}

type Bucket = Omit<Group, "issues" | "field"> & { sort: string | number };
const LAST = "￿";

function bucketFor(i: Issue, opts: Pick<DisplayOptions, "groupBy" | "layout">, ctx: Context): Bucket {
  switch (opts.groupBy) {
    case "focus": return focusBucket(i, ctx);
    case "status": return statusBucket(i.status, opts.layout);
    case "priority": return priorityBucket(i.priority);
    case "assignee": return userBucket(i.assignee?.id ?? null, ctx);
    case "project": return projectBucket(i.project_id, ctx);
    case "cycle": return i.cycle_id !== null && ctx.cycles[i.cycle_id] ? cycleBucket(ctx.cycles[i.cycle_id], ctx)
      : i.cycle_id === null ? plain("none", "No sprint", null, LAST) : plain(`c${i.cycle_id}`, `Sprint ${i.cycle_id}`, i.cycle_id, "~");
    case "none": return plain("all", "All stories", null, 0);
  }
}

const plain = (key: string, label: string, value: FilterValue, sort: string | number): Bucket =>
  ({ key, label, value, cycleIds: [], cycle: null, teamId: null, sort });

const statusBucket = (s: Status, layout: DisplayOptions["layout"]): Bucket =>
  plain(s, STATUS_LABEL[s], s, (layout === "board" ? STATUSES : PROGRESS).indexOf(s));
const priorityBucket = (p: Priority): Bucket => plain(`p${p}`, PRIORITY_LABEL[p], p, PRIORITIES.indexOf(p));
const userBucket = (id: number | null, ctx: Context): Bucket => id === null
  ? plain("none", "No assignee", null, LAST)
  : plain(`u${id}`, ctx.users[id]?.name ?? `Person ${id}`, id, id === ctx.meId ? "" : (ctx.users[id]?.name ?? "").toLowerCase());
const projectBucket = (id: number | null, ctx: Context): Bucket => id === null
  ? plain("none", "No feature", null, LAST)
  : plain(`pr${id}`, ctx.projects[id]?.name ?? `Feature ${id}`, id, (ctx.projects[id]?.name ?? "~").toLowerCase());
function cycleBucket(c: Cycle, ctx: Context, keyPrefix = ""): Bucket {
  const merged = ctx.mergeCycles ? Object.values(ctx.cycles).filter((x) => cycleKey(x) === cycleKey(c)).map((x) => x.id) : [c.id];
  return { key: keyPrefix + (ctx.mergeCycles ? cycleKey(c) : `c${c.id}`), label: ctx.mergeCycles ? c.name : cycleLabel(c, ctx),
           value: c.id, cycleIds: merged, cycle: c, teamId: c.team_id, sort: `${c.start}|${ctx.teams[c.team_id]?.name ?? ""}` };
}
/** Spec §18.1: urgent, current cycles, upcoming cycles, other active, backlog, completed. First match wins. */
function focusBucket(i: Issue, ctx: Context): Bucket {
  if (i.status === "done") return plain("f:done", "Completed", null, "5");
  if (i.priority === 1) return plain("f:urgent", "Urgent stories", null, "0");
  const c = i.cycle_id !== null ? ctx.cycles[i.cycle_id] : undefined;
  if (c && Date.parse(c.end) >= ctx.now) {
    const b = cycleBucket(c, { ...ctx, mergeCycles: false }, "f:");
    return { ...b, sort: `${Date.parse(c.start) <= ctx.now ? "1" : "2"}${b.sort}` };
  }
  if (i.status === "backlog") return plain("f:backlog", "Backlog", "backlog", "4");
  return plain("f:active", "Other active", null, "3"); // no cycle, or an ended one (assumption 13)
}

function emptyBuckets(opts: Pick<DisplayOptions, "groupBy" | "layout">, ctx: Context): Bucket[] {
  const inTeams = (id: number) => (ctx.scopeTeamIds ?? [ctx.teamId]).includes(id);
  switch (opts.groupBy) {
    case "focus": return [];
    case "status": return STATUSES.map((s) => statusBucket(s, opts.layout));
    case "priority": return PRIORITIES.map(priorityBucket);
    case "assignee": return [...(ctx.memberIds ?? []).map((id) => userBucket(id, ctx)), userBucket(null, ctx)];
    case "project": return [
      ...Object.values(ctx.projects).filter((p) => inTeams(p.team_id) && p.status_category !== "completed").map((p) => projectBucket(p.id, ctx)),
      projectBucket(null, ctx)];
    case "cycle": return [
      ...Object.values(ctx.cycles).filter((c) => inTeams(c.team_id) && Date.parse(c.end) >= ctx.now).map((c) => cycleBucket(c, ctx)),
      plain("none", "No sprint", null, LAST)];
    case "none": return [];
  }
}

/** Groups in display order, each sorted by the view's ordering (spec §7). */
export function buildGroups(issues: Issue[], opts: Pick<DisplayOptions, "groupBy" | "orderBy" | "showEmpty" | "layout">, ctx: Context): Group[] {
  const buckets = new Map<string, Bucket & { issues: Issue[] }>();
  const add = (b: Bucket) => {
    if (!buckets.has(b.key)) buckets.set(b.key, { ...b, issues: [] });
    return buckets.get(b.key)!;
  };
  if (opts.showEmpty) emptyBuckets(opts, ctx).forEach(add);
  for (const i of [...issues].sort(comparator(opts.orderBy))) add(bucketFor(i, opts, ctx)).issues.push(i);
  return [...buckets.values()]
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
    .map((b) => ({ key: b.key, label: b.label, field: opts.groupBy, value: b.value, cycleIds: b.cycleIds, cycle: b.cycle,
                   teamId: b.teamId, issues: b.issues }));
}

export function groupTotal(g: Group): { points: number } | { count: number } {
  const estimated = g.issues.filter((i) => i.estimate !== null);
  return estimated.length ? { points: estimated.reduce((sum, i) => sum + (i.estimate ?? 0), 0) } : { count: g.issues.length };
}

/**
 * A scope's own values under every group's "+" (a cycle's team and cycle, a project's id): null where the group
 * has no "+". A group that sets its own cycle drops the scope's cycle key with the scope's cycle.
 */
export function withScopePrefill(group: ComposerPrefill | null, scope: ComposerPrefill | null | undefined): ComposerPrefill | null {
  if (!group || !scope) return group;
  const base = "cycle_id" in group ? { ...scope, cycleKey: undefined } : scope;
  return { ...base, ...group };
}

/** Plan ruling 7: what the group's "+" pre-fills, or null where the group has no single value. */
export function groupPrefill(g: Group): ComposerPrefill | null {
  switch (g.field) {
    case "status": return { status: g.value as Status };
    case "priority": return { priority: g.value as Priority };
    case "assignee": return { assignee_id: g.value as number | null };
    case "project": return g.value === null ? null : { project_id: g.value as number };
    case "cycle": return g.cycle ? { teamId: g.cycle.team_id, cycle_id: g.cycle.id, status: "todo" } : { cycle_id: null };
    case "focus":
      if (g.key === "f:urgent") return { priority: 1 };
      if (g.key === "f:backlog") return { status: "backlog" };
      return g.cycle ? { teamId: g.cycle.team_id, cycle_id: g.cycle.id, status: "todo" } : null;
    case "none": return null;
  }
}

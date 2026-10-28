import {
  HEALTH_LABEL, PRIORITIES, PRIORITY_LABEL, PROJECT_STATUS_LABEL, type Initiative, type Issue, type Priority, type Project,
  type ProjectCategory, type Release, type ReportedHealth, type Team, type User,
} from "../api/types";
import { dayOf } from "../components/format";
import { byRank } from "../store/rank";

/** The projects view (spec §19.5): Linear's display options and filters, limited to what Rally backs. Pure. */

export type PmLayout = "list" | "board" | "timeline";
export type PmGroup = "none" | "status" | "priority" | "lead" | "team" | "initiative" | "pi" | "health";
export type PmOrder = "manual" | "priority" | "target" | "progress" | "updated";
export type ClosedWindow = "all" | "recent" | "none";
export type Zoom = "year" | "quarter" | "month" | "week";
export type PmProperty = "id" | "pi" | "priority" | "status" | "health" | "teams" | "initiatives" | "lead" | "start" | "target"
  | "issues" | "created" | "updated" | "completed" | "labels";
export interface PmOptions {
  layout: PmLayout; groupBy: PmGroup; orderBy: PmOrder; closed: ClosedWindow; properties: PmProperty[];
  /** Group keys folded shut. */
  collapsed: string[];
  /** Timeline options: the left panel, week numbers, a team's cycles as bands, PIs as bands (D37), the zoom. */
  showList: boolean; weekNumbers: boolean; cycleTeamId: number | null; showPis: boolean; zoom: Zoom;
  /** Board option "Show empty columns". */
  showEmpty: boolean;
}
export type PmFilterField = "status" | "priority" | "labels" | "teams" | "lead" | "health" | "dates" | "initiatives" | "pi";
export type PmFilterValue = string | number | null;
/** Values within a field are ORed, fields ANDed; `title` is a case-insensitive "contains". */
export type PmFilters = Partial<Record<PmFilterField, PmFilterValue[]>> & { title?: string };
export interface PmContext {
  now: number;
  users: Record<number, User>;
  teams: Record<number, Team>;
  initiatives: Record<number, Initiative>;
  /** PIs under every team copy's id (the store's `releases`), so any `pi_id` resolves. */
  releases: Record<number, Release>;
  /** The workspace has a portfolio priority field (D38). */
  priority: boolean;
  /** Loaded issues: a project's Teams include its issues' teams (ruling 13). */
  issues?: Record<number, Issue>;
}
/** Whose projects a view shows; only the workspace defaults to the timeline. */
export type PmScope = "workspace" | "team" | "initiative";
export interface ProjectGroup { key: string; label: string; field: PmGroup; value: PmFilterValue; projects: Project[] }

/** The spec's property set (§19.5), in its order: Linear's less what Rally can't back. */
export const PM_PROPERTIES: PmProperty[] = ["id", "pi", "priority", "status", "health", "teams", "initiatives", "lead", "start", "target",
  "issues", "created", "updated", "completed", "labels"];
/** Linear's List defaults: everything its list shows (the milestone slot is the PI here); ID off. */
export const DEFAULT_PM_PROPERTIES: PmProperty[] = ["pi", "priority", "status", "health", "lead", "target", "issues"];
/** Linear's Timeline offers fewer: ID, Milestones, Priority, Status, Health and Lead of what Rally backs. */
export const TIMELINE_PROPERTIES: PmProperty[] = ["id", "pi", "priority", "status", "health", "lead"];
export const PM_PROPERTY_LABEL: Record<PmProperty, string> = {
  id: "ID", pi: "PI", priority: "Priority", status: "Status", health: "Health", teams: "Teams", initiatives: "Capabilities", lead: "Lead",
  start: "Start date", target: "Target date", issues: "Stories", created: "Created", updated: "Updated", completed: "Completed", labels: "Labels",
};

const LAYOUTS: PmLayout[] = ["list", "board", "timeline"];
const GROUPS: PmGroup[] = ["none", "status", "priority", "lead", "team", "initiative", "pi", "health"];
const ORDERS: PmOrder[] = ["manual", "priority", "target", "progress", "updated"];
const WINDOWS: ClosedWindow[] = ["all", "recent", "none"];
const ZOOMS: Zoom[] = ["year", "quarter", "month", "week"];
const KEY = (view: string) => `mira-pm:v1:${view}`;
const DAY = 86_400_000;
/** "Recent" closed projects: completed in the last 14 days (ruling 6). */
const RECENT_MS = 14 * DAY;

export function defaultPmOptions(scope: PmScope): PmOptions {
  return {
    layout: scope === "workspace" ? "timeline" : "list", groupBy: "none", orderBy: "manual", closed: "all",
    properties: DEFAULT_PM_PROPERTIES, collapsed: [], showList: true, weekNumbers: false, cycleTeamId: null, showPis: false,
    zoom: "year", showEmpty: false,
  };
}

/** Without a portfolio priority field (D38) nothing groups, orders or shows by priority (Review Focus 5). */
export function normalizePmOptions(o: PmOptions, ctx: { priority: boolean }): PmOptions {
  if (ctx.priority) return o;
  if (o.groupBy !== "priority" && o.orderBy !== "priority" && !o.properties.includes("priority")) return o;
  return {
    ...o, groupBy: o.groupBy === "priority" ? "none" : o.groupBy, orderBy: o.orderBy === "priority" ? "manual" : o.orderBy,
    properties: o.properties.filter((p) => p !== "priority"),
  };
}

const pick = <T,>(allowed: T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Saved options, field by field; anything missing, unknown or unreadable falls back to the scope's default. */
export function loadPmOptions(view: string, scope: PmScope, priority: boolean, storage: Storage | undefined = globalThis.localStorage): PmOptions {
  const base = defaultPmOptions(scope);
  try {
    const raw = storage?.getItem(KEY(view));
    if (!raw) return normalizePmOptions(base, { priority });
    const s = JSON.parse(raw) as Record<string, unknown>;
    const props = Array.isArray(s.properties) ? s.properties.filter((p): p is PmProperty => PM_PROPERTIES.includes(p as PmProperty)) : null;
    return normalizePmOptions({
      layout: pick(LAYOUTS, s.layout, base.layout),
      groupBy: pick(GROUPS, s.groupBy, base.groupBy),
      orderBy: pick(ORDERS, s.orderBy, base.orderBy),
      closed: pick(WINDOWS, s.closed, base.closed),
      properties: props && (props.length || (s.properties as unknown[]).length === 0) ? props : base.properties,
      collapsed: Array.isArray(s.collapsed) ? s.collapsed.filter((k): k is string => typeof k === "string") : base.collapsed,
      showList: bool(s.showList, base.showList),
      weekNumbers: bool(s.weekNumbers, base.weekNumbers),
      cycleTeamId: typeof s.cycleTeamId === "number" ? s.cycleTeamId : base.cycleTeamId,
      showPis: bool(s.showPis, base.showPis),
      zoom: pick(ZOOMS, s.zoom, base.zoom),
      showEmpty: bool(s.showEmpty, base.showEmpty),
    }, { priority });
  } catch {
    return normalizePmOptions(base, { priority });
  }
}

export function savePmOptions(view: string, o: PmOptions, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY(view), JSON.stringify(o));
  } catch {
    /* storage blocked: the options last for this session */
  }
}

/** For the Display button's dot: collapsed groups and property order don't count; Priority doesn't without its field. */
export function isDefaultPm(o: PmOptions, scope: PmScope, priority = true): boolean {
  const d = normalizePmOptions(defaultPmOptions(scope), { priority });
  const same = (a: PmProperty[], b: PmProperty[]) => a.length === b.length && a.every((p) => b.includes(p));
  return o.layout === d.layout && o.groupBy === d.groupBy && o.orderBy === d.orderBy && o.closed === d.closed
    && same(o.properties, d.properties) && o.showList === d.showList && o.weekNumbers === d.weekNumbers
    && o.cycleTeamId === d.cycleTeamId && o.showPis === d.showPis && o.zoom === d.zoom && o.showEmpty === d.showEmpty;
}

/** "Show closed projects" (ruling 6): All is everything loaded, Recent the last 14 days of Completed, None no Completed. */
export function inClosedWindow(p: Project, w: ClosedWindow, now: number): boolean {
  if (p.status_category !== "completed" || w === "all") return true;
  if (w === "none") return false;
  return p.completed_at !== null && now - Date.parse(p.completed_at) <= RECENT_MS;
}

const startOfDay = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Past its target day and not Completed: the list's red calendar and the "Overdue" filter. */
export function isOverdue(p: Project, now: number): boolean {
  return p.target !== null && p.status_category !== "completed" && dayOf(p.target).getTime() < startOfDay(now);
}

export type HealthKey = ReportedHealth | "none";
/** "none" is no update, or no target (computed health). */
export const healthKey = (p: Project): HealthKey => (!p.health || p.health.value === "no_target" ? "none" : p.health.value);

const teamIndex = new WeakMap<Record<number, Issue>, Map<number, Set<number>>>();
/** The project's own team, plus the teams of its loaded issues (ruling 13). */
export function projectTeamIds(p: Project, issues?: Record<number, Issue>): number[] {
  if (!issues) return [p.team_id];
  let index = teamIndex.get(issues);
  if (!index) {
    index = new Map();
    for (const i of Object.values(issues)) {
      if (i.project_id === null) continue;
      const set = index.get(i.project_id) ?? new Set<number>();
      set.add(i.team_id);
      index.set(i.project_id, set);
    }
    teamIndex.set(issues, index);
  }
  return [...new Set([p.team_id, ...(index.get(p.id) ?? [])])];
}

/** What a project holds for a filter field; null is "none" (no lead, no labels …). */
export function pmFieldValues(p: Project, field: PmFilterField, ctx: PmContext): PmFilterValue[] {
  switch (field) {
    case "status": return [p.status_category];
    case "priority": return [p.priority];
    case "labels": return p.labels.length ? p.labels : [null];
    case "teams": return projectTeamIds(p, ctx.issues);
    case "lead": return [p.lead?.id ?? null];
    case "health": return [healthKey(p)];
    case "dates": return [...(isOverdue(p, ctx.now) ? ["overdue"] : []), ...(p.target === null ? ["no_target"] : [])];
    case "initiatives": return [p.initiative_id];
    case "pi": return [piValue(p, ctx)];
  }
}

/** A project's PI as one value per PI: its first copy's id, whichever team copy the project points at; "unknown" if unread. */
const UNKNOWN_PI = "unknown";
const piValue = (p: Project, ctx: PmContext): PmFilterValue =>
  p.pi_id === null ? null : ctx.releases[p.pi_id]?.id ?? UNKNOWN_PI;

export function matchesProject(p: Project, f: PmFilters, ctx: PmContext): boolean {
  const title = f.title?.trim().toLowerCase();
  if (title && !p.name.toLowerCase().includes(title)) return false;
  return (Object.keys(f) as (PmFilterField | "title")[]).every((field) => {
    if (field === "title" || (field === "priority" && !ctx.priority)) return true;
    const wanted = f[field];
    if (!wanted?.length) return true;
    return pmFieldValues(p, field, ctx).some((v) => wanted.includes(v));
  });
}

export function togglePmFilter(f: PmFilters, field: PmFilterField, value: PmFilterValue): PmFilters {
  const current = f[field] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const out = { ...f };
  if (next.length) out[field] = next;
  else delete out[field];
  return out;
}

/** The Filter menu (§19.5), in order; Priority only with the field (D38). */
export function pmFilterFields(priority: boolean): [PmFilterField | "title", string][] {
  const all: [PmFilterField | "title", string][] = [
    ["status", "Status"], ["priority", "Priority"], ["labels", "Labels"], ["teams", "Teams"], ["lead", "Lead"], ["health", "Health"],
    ["dates", "Dates"], ["initiatives", "Capabilities"], ["pi", "PI"], ["title", "Title"],
  ];
  return priority ? all : all.filter(([f]) => f !== "priority");
}

const CATEGORIES: ProjectCategory[] = ["backlog", "planned", "started", "completed"];
const HEALTHS: HealthKey[] = ["on_track", "at_risk", "off_track", "none"];
const healthLabel = (h: HealthKey) => (h === "none" ? "No updates" : HEALTH_LABEL[h]);

export function pmValueLabel(field: PmFilterField, v: PmFilterValue, ctx: PmContext): string {
  switch (field) {
    case "status": return PROJECT_STATUS_LABEL[v as ProjectCategory] ?? String(v);
    case "priority": return PRIORITY_LABEL[v as Priority] ?? String(v);
    case "labels": return v === null ? "No labels" : String(v);
    case "teams": return ctx.teams[v as number]?.name ?? `Team ${v}`;
    case "lead": return v === null ? "No lead" : ctx.users[v as number]?.name ?? `Person ${v}`;
    case "health": return healthLabel(v as HealthKey);
    case "dates": return v === "overdue" ? "Overdue" : "No target date";
    case "initiatives": return v === null ? "No capability" : ctx.initiatives[v as number]?.name ?? `Capability ${v}`;
    // Never an ObjectID on screen: a PI that didn't load is "Unknown PI".
    case "pi": return v === null ? "No PI" : (typeof v === "number" && ctx.releases[v]?.name) || "Unknown PI";
  }
}

/** The year that tells apart PIs D30 names alike: the end date's, else the start date's. */
const piYear = (r: Release | undefined) => (r?.end ?? r?.start)?.slice(0, 4);
/** PI names held by more than one distinct PI among these release ids: those get their year. */
function sharedPiNames(ids: Iterable<PmFilterValue>, ctx: PmContext): Set<string> {
  const byName = new Map<string, Set<number>>();
  for (const v of ids) {
    const r = typeof v === "number" ? ctx.releases[v] : undefined;
    if (r) byName.set(r.name, (byName.get(r.name) ?? new Set()).add(r.id));
  }
  return new Set([...byName].filter(([, set]) => set.size > 1).map(([name]) => name));
}

/** A field's choices: fixed domains in Linear's order, the rest from the projects shown, by name with "No …" last. */
export function pmFilterOptions(field: PmFilterField, projects: Project[], ctx: PmContext): { value: PmFilterValue; label: string; hint?: string }[] {
  const fixed = (values: PmFilterValue[]) => values.map((value) => ({ value, label: pmValueLabel(field, value, ctx) }));
  if (field === "status") return fixed(CATEGORIES);
  if (field === "priority") return fixed(PRIORITIES);
  if (field === "health") return fixed(HEALTHS);
  if (field === "dates") return fixed(["overdue", "no_target"]);
  const seen = new Set<PmFilterValue>(projects.flatMap((p) => pmFieldValues(p, field, ctx)));
  // PIs run in time order (D30 names repeat across years); the rest by name.
  const order = (v: PmFilterValue) => (field === "pi" ? (typeof v === "number" && ctx.releases[v]?.start) || "~" : "");
  const named = [...seen].filter((v) => v !== null).map((value) => ({ value, label: pmValueLabel(field, value, ctx) }))
    .sort((a, b) => (order(a.value) < order(b.value) ? -1 : order(a.value) > order(b.value) ? 1 : a.label.localeCompare(b.label)));
  // PIs sharing a name ("PI 4" from two years) carry the year as a hint; the label stays D30's (§19.1).
  const shared = field === "pi" ? sharedPiNames(seen, ctx) : new Set<string>();
  const hinted = named.map((o) => {
    const r = typeof o.value === "number" ? ctx.releases[o.value] : undefined;
    const year = r && shared.has(r.name) ? piYear(r) : undefined;
    return year ? { ...o, hint: year } : o;
  });
  return seen.has(null) ? [...hinted, { value: null, label: pmValueLabel(field, null, ctx) }] : hinted;
}

/** Linear's priority order: Urgent … Low, then No priority. */
const priorityRank = (p: Priority) => (p === 0 ? 5 : p);
const time = (iso: string | null) => (iso === null ? Infinity : dayOf(iso).getTime());
const COMPARE: Record<PmOrder, (a: Project, b: Project) => number> = {
  manual: () => 0,
  priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  target: (a, b) => (time(a.target) === time(b.target) ? 0 : time(a.target) < time(b.target) ? -1 : 1),
  progress: (a, b) => b.progress - a.progress,
  updated: (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
};

/** Manual is Rally's rank (ruling 7); every other order breaks ties by rank. */
export function sortProjects(ps: Project[], order: PmOrder): Project[] {
  const cmp = COMPARE[order];
  return [...ps].sort((a, b) => cmp(a, b) || byRank(a, b));
}

interface Bucket { key: string; label: string; value: PmFilterValue; sort: string }
const NONE_LAST = "￿";

function bucketOf(p: Project, by: PmGroup, ctx: PmContext): Bucket {
  switch (by) {
    case "none": return { key: "all", label: "All features", value: null, sort: "" };
    case "status": return { key: `status:${p.status_category}`, label: PROJECT_STATUS_LABEL[p.status_category], value: p.status_category,
      sort: String(CATEGORIES.indexOf(p.status_category)) };
    case "priority": return { key: `priority:${p.priority}`, label: PRIORITY_LABEL[p.priority], value: p.priority, sort: String(priorityRank(p.priority)) };
    case "health": {
      const h = healthKey(p);
      return { key: `health:${h}`, label: healthLabel(h), value: h, sort: String(HEALTHS.indexOf(h)) };
    }
    case "lead": return p.lead
      ? { key: `lead:${p.lead.id}`, label: ctx.users[p.lead.id]?.name ?? p.lead.name, value: p.lead.id, sort: (ctx.users[p.lead.id]?.name ?? p.lead.name).toLowerCase() }
      : { key: "lead:none", label: "No lead", value: null, sort: NONE_LAST };
    case "team": {
      const name = ctx.teams[p.team_id]?.name ?? `Team ${p.team_id}`;
      return { key: `team:${p.team_id}`, label: name, value: p.team_id, sort: name.toLowerCase() };
    }
    case "initiative": {
      if (p.initiative_id === null) return { key: "initiative:none", label: "No capability", value: null, sort: NONE_LAST };
      const name = ctx.initiatives[p.initiative_id]?.name ?? `Capability ${p.initiative_id}`;
      return { key: `initiative:${p.initiative_id}`, label: name, value: p.initiative_id, sort: name.toLowerCase() };
    }
    case "pi": {
      if (p.pi_id === null) return { key: "pi:none", label: "No PI", value: null, sort: NONE_LAST };
      const r = ctx.releases[p.pi_id];
      // One group per PI across its team copies, in time order (undated by name); a PI that didn't load is "Unknown PI".
      if (!r) return { key: `pi:${UNKNOWN_PI}`, label: "Unknown PI", value: UNKNOWN_PI, sort: "~~" };
      return { key: `pi:${r.id}`, label: r.name, value: r.id, sort: `${r.start ?? "~"}|${r.name.toLowerCase()}` };
    }
  }
}

/** Groups with a fixed domain: a board can show them empty. */
const FIXED: Partial<Record<PmGroup, Bucket[]>> = {
  status: CATEGORIES.map((c, n) => ({ key: `status:${c}`, label: PROJECT_STATUS_LABEL[c], value: c, sort: String(n) })),
  priority: PRIORITIES.map((p) => ({ key: `priority:${p}`, label: PRIORITY_LABEL[p], value: p, sort: String(priorityRank(p)) })),
  health: HEALTHS.map((h, n) => ({ key: `health:${h}`, label: healthLabel(h), value: h, sort: String(n) })),
};

/**
 * The ordered projects in groups. Empty groups are left out, except a board's fixed columns with "Show empty columns".
 * Without the priority field (D38), priority grouping is no grouping.
 */
export function groupProjects(ps: Project[], o: PmOptions, ctx: PmContext): ProjectGroup[] {
  const by: PmGroup = o.groupBy === "priority" && !ctx.priority ? "none" : o.groupBy;
  const buckets = new Map<string, Bucket & { projects: Project[] }>();
  if (o.layout === "board" && o.showEmpty) for (const b of FIXED[by] ?? []) buckets.set(b.key, { ...b, projects: [] });
  for (const p of sortProjects(ps, o.orderBy)) {
    const b = bucketOf(p, by, ctx);
    const entry = buckets.get(b.key) ?? { ...b, projects: [] };
    entry.projects.push(p);
    buckets.set(b.key, entry);
  }
  // PI groups sharing a name read "PI 4 · 2026"; a unique PI stays bare.
  const shared = by === "pi" ? sharedPiNames([...buckets.values()].map((b) => b.value), ctx) : new Set<string>();
  const labelOf = (b: Bucket) => {
    const r = typeof b.value === "number" ? ctx.releases[b.value] : undefined;
    const year = r && shared.has(r.name) ? piYear(r) : undefined;
    return year ? `${b.label} · ${year}` : b.label;
  };
  return [...buckets.values()]
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.label.localeCompare(b.label)))
    .map((b) => ({ key: b.key, label: labelOf(b), field: by, value: b.value, projects: b.projects }));
}

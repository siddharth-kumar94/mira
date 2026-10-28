import {
  HEALTH_LABEL, INITIATIVE_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL, type HealthValue, type Initiative, type InitiativeStatus, type Priority, type Project,
  type ReportedHealth, type User,
} from "../api/types";
import { dayOf } from "../components/format";
import { byRank } from "../store/rank";

/** The initiatives list (spec §19.7): Linear's tabs, display options and roll-ups. Pure. */

export type InitiativesTab = "active" | "planned" | "all";
/** "initiative" is the outcome's parent (Rally's Program): the one place the word shows (D39). */
export type InitiativeGroup = "none" | "outcome" | "initiative" | "status" | "owner" | "priority";
export type InitiativeOrder = "manual" | "priority" | "target" | "updated";
/** Linear's initiative properties (inventory-p4 §3.1) less what Rally can't back: contributing teams, created, completed, labels. */
export type InitiativeProperty = "id" | "description" | "owner" | "status" | "priority" | "health" | "projects" | "active" | "target" | "updated";
export interface InitiativeOptions {
  groupBy: InitiativeGroup; orderBy: InitiativeOrder; properties: InitiativeProperty[];
  /** Group keys folded shut. */
  collapsed: string[];
}
export interface InitiativeGroupOf {
  key: string; label: string; field: InitiativeGroup; value: string | number | null; initiatives: Initiative[];
}

/** Linear's Display properties, in its order. */
export const INITIATIVE_PROPERTIES: InitiativeProperty[] = ["id", "description", "owner", "status", "priority", "health", "projects", "active",
  "target", "updated"];
export const INITIATIVE_PROPERTY_LABEL: Record<InitiativeProperty, string> = {
  id: "ID", description: "Description", owner: "Owner", status: "Status", priority: "Priority", health: "Health", projects: "Features",
  active: "Active features", target: "Target date", updated: "Updated",
};
/** What Linear's list shows by default: everything but ID (and the dates it has off). */
const DEFAULT_PROPERTIES: InitiativeProperty[] = ["description", "owner", "status", "priority", "health", "projects", "active", "target"];
const GROUPS: InitiativeGroup[] = ["none", "outcome", "initiative", "status", "owner", "priority"];
const ORDERS: InitiativeOrder[] = ["manual", "priority", "target", "updated"];
const KEY = "mira-pm:v1:initiatives";

export function initiativeTab(i: Initiative, tab: InitiativesTab): boolean {
  return tab === "all" || i.status === tab;
}

const REPORTED: ReportedHealth[] = ["on_track", "at_risk", "off_track"];
/** One pill per reported health among the active projects, in Linear's order; "no target" is computed, not reported. */
export function healthCounts(values: HealthValue[]): { value: ReportedHealth; count: number }[] {
  return REPORTED.map((value) => ({ value, count: values.filter((v) => v === value).length })).filter((c) => c.count > 0);
}

/** "n / total" projects completed. Until the children load, Rally's child count is the total. */
export function doneCount(i: Initiative, projects: Project[]): { done: number; total: number } {
  const mine = projects.filter((p) => p.initiative_id === i.id);
  return { done: mine.filter((p) => p.status_category === "completed").length, total: Math.max(mine.length, i.project_count) };
}

export function defaultInitiativeOptions(): InitiativeOptions {
  return { groupBy: "none", orderBy: "manual", properties: DEFAULT_PROPERTIES, collapsed: [] };
}

/** Without a portfolio priority field (D38) nothing groups, orders or shows by priority (Review Focus 5). */
export function normalizeInitiativeOptions(o: InitiativeOptions, priority: boolean): InitiativeOptions {
  if (priority || (o.groupBy !== "priority" && o.orderBy !== "priority" && !o.properties.includes("priority"))) return o;
  return {
    ...o, groupBy: o.groupBy === "priority" ? "none" : o.groupBy, orderBy: o.orderBy === "priority" ? "manual" : o.orderBy,
    properties: o.properties.filter((p) => p !== "priority"),
  };
}

const pick = <T,>(allowed: T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Saved options, field by field; anything missing, unknown or unreadable falls back to the default. */
export function loadInitiativeOptions(priority: boolean, storage: Storage | undefined = globalThis.localStorage): InitiativeOptions {
  const base = defaultInitiativeOptions();
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return normalizeInitiativeOptions(base, priority);
    const s = JSON.parse(raw) as Record<string, unknown>;
    const props = Array.isArray(s.properties)
      ? s.properties.filter((p): p is InitiativeProperty => INITIATIVE_PROPERTIES.includes(p as InitiativeProperty)) : null;
    return normalizeInitiativeOptions({
      groupBy: pick(GROUPS, s.groupBy, base.groupBy),
      orderBy: pick(ORDERS, s.orderBy, base.orderBy),
      properties: props && (props.length || (s.properties as unknown[]).length === 0) ? props : base.properties,
      collapsed: Array.isArray(s.collapsed) ? s.collapsed.filter((k): k is string => typeof k === "string") : base.collapsed,
    }, priority);
  } catch {
    return normalizeInitiativeOptions(base, priority);
  }
}

export function saveInitiativeOptions(o: InitiativeOptions, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage blocked: the options last for this session */
  }
}

/** For the Display button's dot and Reset: collapsed groups and property order don't count; Priority doesn't without its field. */
export function isDefaultInitiatives(o: InitiativeOptions, priority: boolean): boolean {
  const d = normalizeInitiativeOptions(defaultInitiativeOptions(), priority);
  const props = o.properties.filter((p) => priority || p !== "priority");
  return o.groupBy === d.groupBy && o.orderBy === d.orderBy && props.length === d.properties.length && props.every((p) => d.properties.includes(p));
}

/** Linear's priority order: Urgent … Low, then No priority. */
const priorityRank = (p: Priority) => (p === 0 ? 5 : p);
const time = (iso: string | null) => (iso === null ? Infinity : dayOf(iso).getTime());
const COMPARE: Record<InitiativeOrder, (a: Initiative, b: Initiative) => number> = {
  manual: () => 0,
  priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  target: (a, b) => (time(a.target) === time(b.target) ? 0 : time(a.target) < time(b.target) ? -1 : 1),
  updated: (a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0),
};

/** Manual is Rally's rank; every other order breaks ties by rank. Priority is manual without the field (D38). */
export function sortInitiatives(list: Initiative[], order: InitiativeOrder, priority: boolean): Initiative[] {
  const cmp = COMPARE[order === "priority" && !priority ? "manual" : order];
  return [...list].sort((a, b) => cmp(a, b) || byRank(a, b));
}

const STATUSES: InitiativeStatus[] = ["planned", "active", "completed"];
const NONE_LAST = "￿";
/** `unnamed`: the label stands in for a name Rally didn't send; any member with the name gives it to the group. */
interface Bucket { key: string; label: string; value: string | number | null; sort: string; unnamed?: boolean }
const named = (user: User) => user.name.toLowerCase();

function bucketOf(i: Initiative, by: InitiativeGroup): Bucket {
  switch (by) {
    case "none": return { key: "all", label: "All capabilities", value: null, sort: "" };
    case "outcome": return i.group_id === null
      ? { key: "outcome:none", label: "No outcome", value: null, sort: NONE_LAST }
      : { key: `outcome:${i.group_id}`, label: i.group_name ?? "Outcome", value: i.group_id, sort: (i.group_name ?? "").toLowerCase() };
    case "initiative": {
      const id = i.parent_group_id, name = i.parent_group_name;
      if (id === null) return { key: "initiative:none", label: "No initiative", value: null, sort: NONE_LAST };
      return name ? { key: `initiative:${id}`, label: name, value: id, sort: name.toLowerCase() }
        : { key: `initiative:${id}`, label: `Initiative ${id}`, value: id, sort: `initiative ${id}`, unnamed: true };
    }
    case "status": return { key: `status:${i.status}`, label: INITIATIVE_STATUS_LABEL[i.status], value: i.status, sort: String(STATUSES.indexOf(i.status)) };
    case "owner": return i.owner
      ? { key: `owner:${i.owner.id}`, label: i.owner.name, value: i.owner.id, sort: named(i.owner) }
      : { key: "owner:none", label: "No owner", value: null, sort: NONE_LAST };
    case "priority": return { key: `priority:${i.priority}`, label: PRIORITY_LABEL[i.priority], value: i.priority,
      sort: String(priorityRank(i.priority)) };
  }
}

/** Groups in their domain's order, each keeping the list's order. Without the priority field (D38) priority grouping is none. */
export function groupInitiatives(list: Initiative[], by: InitiativeGroup, priority: boolean): InitiativeGroupOf[] {
  const field: InitiativeGroup = by === "priority" && !priority ? "none" : by;
  const buckets = new Map<string, Bucket & { initiatives: Initiative[] }>();
  for (const i of list) {
    const b = bucketOf(i, field);
    const entry = buckets.get(b.key) ?? { ...b, initiatives: [] };
    if (entry.unnamed && !b.unnamed) Object.assign(entry, { label: b.label, sort: b.sort, unnamed: false });
    entry.initiatives.push(i);
    buckets.set(b.key, entry);
  }
  return [...buckets.values()]
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.label.localeCompare(b.label)))
    .map(({ key, label, value, initiatives }) => ({ key, label, field, value, initiatives }));
}

export type InitiativeFilterField = "status" | "priority" | "owner" | "health" | "outcome";
export type InitiativeFilterValue = string | number | null;
/** Values within a field are ORed, fields ANDed. */
export type InitiativeFilters = Partial<Record<InitiativeFilterField, InitiativeFilterValue[]>>;
type HealthKey = ReportedHealth | "none";

/** The Filter menu, in order: Priority only with the field (D38); Outcome is the initiative's parent. */
export function initiativeFilterFields(priority: boolean): [InitiativeFilterField, string][] {
  const all: [InitiativeFilterField, string][] = [["status", "Status"], ["priority", "Priority"], ["owner", "Owner"], ["health", "Health"],
    ["outcome", "Outcome"]];
  return priority ? all : all.filter(([f]) => f !== "priority");
}

const healthKey = (i: Initiative): HealthKey => (!i.health || i.health.value === "no_target" ? "none" : i.health.value);

export function initiativeFieldValue(i: Initiative, field: InitiativeFilterField): InitiativeFilterValue {
  switch (field) {
    case "status": return i.status;
    case "priority": return i.priority;
    case "owner": return i.owner?.id ?? null;
    case "health": return healthKey(i);
    case "outcome": return i.group_id;
  }
}

export function matchesInitiative(i: Initiative, f: InitiativeFilters, priority: boolean): boolean {
  return (Object.keys(f) as InitiativeFilterField[]).every((field) => {
    const wanted = f[field];
    return (field === "priority" && !priority) || !wanted?.length || wanted.includes(initiativeFieldValue(i, field));
  });
}

export function toggleInitiativeFilter(f: InitiativeFilters, field: InitiativeFilterField, value: InitiativeFilterValue): InitiativeFilters {
  const current = f[field] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const out = { ...f };
  if (next.length) out[field] = next;
  else delete out[field];
  return out;
}

const HEALTH_KEYS: HealthKey[] = ["on_track", "at_risk", "off_track", "none"];
const NO_VALUE: Partial<Record<InitiativeFilterField, string>> = { owner: "No owner", outcome: "No outcome" };

/** A value's name; owners and outcomes are named by the initiatives that hold them. */
export function initiativeValueLabel(field: InitiativeFilterField, v: InitiativeFilterValue, list: Initiative[]): string {
  switch (field) {
    case "status": return INITIATIVE_STATUS_LABEL[v as InitiativeStatus] ?? String(v);
    case "priority": return PRIORITY_LABEL[v as Priority] ?? String(v);
    case "health": return v === "none" ? "No updates" : HEALTH_LABEL[v as ReportedHealth] ?? String(v);
    case "owner": return v === null ? NO_VALUE.owner! : list.find((i) => i.owner?.id === v)?.owner?.name ?? "Owner";
    case "outcome": return v === null ? NO_VALUE.outcome! : list.find((i) => i.group_id === v)?.group_name ?? "Outcome";
  }
}

/** A field's choices: fixed domains in Linear's order; owners and outcomes from the list, by name, with "No …" last. */
export function initiativeFilterOptions(field: InitiativeFilterField, list: Initiative[]): { value: InitiativeFilterValue; label: string }[] {
  const named = (values: InitiativeFilterValue[]) => values.map((value) => ({ value, label: initiativeValueLabel(field, value, list) }));
  if (field === "status") return named(STATUSES);
  if (field === "priority") return named(PRIORITIES);
  if (field === "health") return named(HEALTH_KEYS);
  const seen = new Set(list.map((i) => initiativeFieldValue(i, field)));
  const sorted = named([...seen].filter((v) => v !== null)).sort((a, b) => {
    const [x, y] = [a.label.toLowerCase(), b.label.toLowerCase()];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return seen.has(null) ? [...sorted, ...named([null])] : sorted;
}

import { PRIORITY_LABEL, type Cycle, type CycleStats, type Issue } from "../api/types";
import { cycleKey, type Context } from "../views/model";

/** Cycle maths (spec §19.3–19.4, planning rulings 2 and 3). Pure: no store, no clock but the `now` passed in. */

export type CycleStatus = "current" | "upcoming" | "planned" | "past";

/**
 * Ruling 3: current contains now (its end included); upcoming is the first cycle to start after now (every
 * same-dated copy of it, for an ART); planned is any later one; past has ended.
 */
export function cycleStatus(c: Cycle, all: Cycle[], now: number): CycleStatus {
  const start = Date.parse(c.start);
  if (Date.parse(c.end) < now) return "past";
  if (start <= now) return "current";
  const next = Math.min(...all.map((x) => Date.parse(x.start)).filter((s) => s > now));
  return start === next ? "upcoming" : "planned";
}

/** Ruling 2: scope is every issue's points (no estimate counts 0), started is In Progress plus In Review, completed is Done. */
export function progressOf(issues: Issue[]): { scope: number; started: number; completed: number; count: number } {
  const out = { scope: 0, started: 0, completed: 0, count: issues.length };
  for (const i of issues) {
    const points = i.estimate ?? 0;
    out.scope += points;
    if (i.status === "in_progress" || i.status === "in_review") out.started += points;
    else if (i.status === "done") out.completed += points;
  }
  return out;
}

/** A whole percentage; 0 when there is nothing to be a part of (Review Focus 4). */
export function percent(part: number, whole: number): number {
  return whole > 0 && Number.isFinite(part) ? Math.round((part / whole) * 100) : 0;
}

/** The capacity ring's fill: scope over PlannedVelocity, unclamped; null when the cycle has none (§19.1). */
export function capacityFraction(scope: number, capacity: number | null): number | null {
  return capacity !== null && capacity > 0 ? scope / capacity : null;
}

export interface CycleRow { key: string; cycle: Cycle; ids: number[]; stats: CycleStats }

/**
 * The cycles list's rows, newest first. With `merge` (an ART), cycles with the same name and dates are one row: their
 * stats are summed, and so are the capacities that are set. The row's cycle is the first copy, which it links to.
 */
export function mergedCycleRows(cycles: Cycle[], stats: Record<number, CycleStats>, merge: boolean): CycleRow[] {
  const rows = new Map<string, CycleRow>();
  for (const c of cycles) {
    const key = merge ? cycleKey(c) : `c${c.id}`;
    const s = stats[c.id];
    const row = rows.get(key);
    if (!row) {
      rows.set(key, { key, cycle: c, ids: [c.id], stats: {
        cycle_id: c.id, scope: s?.scope ?? 0, started: s?.started ?? 0, completed: s?.completed ?? 0, issue_count: s?.issue_count ?? 0,
      } });
      continue;
    }
    row.ids.push(c.id);
    if (c.capacity !== null) row.cycle = { ...row.cycle, capacity: (row.cycle.capacity ?? 0) + c.capacity };
    if (s) {
      row.stats.scope += s.scope;
      row.stats.started += s.started;
      row.stats.completed += s.completed;
      row.stats.issue_count += s.issue_count;
    }
  }
  return [...rows.values()].sort((a, b) =>
    Date.parse(b.cycle.start) - Date.parse(a.cycle.start) || Date.parse(b.cycle.end) - Date.parse(a.cycle.end)
    || a.cycle.name.localeCompare(b.cycle.name));
}

export type BreakdownBy = "assignees" | "labels" | "priority" | "projects" | "teams";
export interface BreakdownRow { key: string; label: string; done: number; total: number }

/** In-flight points count a quarter done in the breakdown rings: Linear's Cycle 1 rows (13%, 10%, 26%) come out of it. */
const STARTED_CREDIT = 0.25;

/** Each issue's rows: an issue counts under every one of its labels; "none" is the "No …" row. */
function rowsOf(i: Issue, by: BreakdownBy, ctx: Pick<Context, "users" | "projects" | "teams">): [string, string][] {
  switch (by) {
    case "assignees": return [i.assignee ? [`u${i.assignee.id}`, ctx.users[i.assignee.id]?.name ?? i.assignee.name] : ["none", "No assignee"]];
    case "labels": return i.labels.length ? i.labels.map((l): [string, string] => [`l:${l}`, l]) : [["none", "No labels"]];
    case "priority": return [i.priority ? [`p${i.priority}`, PRIORITY_LABEL[i.priority]] : ["none", PRIORITY_LABEL[0]]];
    case "projects": return [i.project_id !== null ? [`pr${i.project_id}`, ctx.projects[i.project_id]?.name ?? `Feature ${i.project_id}`] : ["none", "No feature"]];
    case "teams": return [[`t${i.team_id}`, ctx.teams[i.team_id]?.name ?? `Team ${i.team_id}`]];
  }
}

/**
 * The cycle panel's breakdown tabs (spec §19.4): points done and in all per assignee, label, priority, project or team,
 * largest first, the "No …" row last. Done is Done's points plus a quarter of In Progress and In Review's.
 */
export function breakdown(issues: Issue[], by: BreakdownBy, ctx: Pick<Context, "users" | "projects" | "teams">): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const i of issues) {
    const points = i.estimate ?? 0;
    const done = i.status === "done" ? points : i.status === "in_progress" || i.status === "in_review" ? points * STARTED_CREDIT : 0;
    for (const [key, label] of rowsOf(i, by, ctx)) {
      const row = rows.get(key) ?? rows.set(key, { key, label, done: 0, total: 0 }).get(key)!;
      row.done += done;
      row.total += points;
    }
  }
  return [...rows.values()].sort((a, b) =>
    Number(a.key === "none") - Number(b.key === "none") || b.total - a.total || a.label.localeCompare(b.label));
}

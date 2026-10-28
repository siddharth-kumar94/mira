import { PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Cycle, type Issue, type IssuePatch, type Priority, type Project, type Status, type User } from "../api/types";
import { pickerRange, points } from "../components/format";
import type { AppState } from "../store/store";
import type { Picker } from "../store/ui";

export interface PickerOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  status?: Status;
  priority?: Priority;
  user?: User | null;
  /** Number keycap (§18.9): status 1–5, priority 0–4. */
  keys?: string;
  /** Every target already has this value: shows the check. */
  current?: boolean;
  cycle?: Cycle;
  project?: Project;
  /** The change for one issue, or null when that issue needs none. */
  apply(issue: Issue): IssuePatch | null;
}

export const PICKER_PLACEHOLDER: Record<Picker, string> = {
  status: "Change status…", priority: "Change priority to…", assignee: "Assign to…", labels: "Add labels…",
  project: "Move to feature…", cycle: "Move to sprint…", estimate: "Set estimate to…",
};
export const ESTIMATES = [1, 2, 3, 5, 8, 13]; // spec assumption 7

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

const all = (targets: Issue[], test: (i: Issue) => boolean) => targets.length > 0 && targets.every(test);

export function pickerOptions(picker: Picker, app: AppState, targets: Issue[], remoteLabels: string[] = []): PickerOption[] {
  const teams = new Set(targets.map((t) => t.team_id));
  switch (picker) {
    case "status":
      return STATUSES.map((s, n): PickerOption => ({ id: s, label: STATUS_LABEL[s], status: s, keys: String(n + 1),
        current: all(targets, (i) => i.status === s), apply: (i) => (i.status === s ? null : { status: s }) }));
    case "priority":
      return ([0, 1, 2, 3, 4] as Priority[]).map((p): PickerOption => ({ id: `p${p}`, label: PRIORITY_LABEL[p], priority: p, keys: String(p),
        current: all(targets, (i) => i.priority === p), apply: (i) => (i.priority === p ? null : { priority: p }) }));
    case "assignee": {
      const me = app.meta?.me;
      const assign = (u: User | null, hint?: string): PickerOption => ({
        id: u ? `u${u.id}` : "none", label: u?.name ?? "No assignee", hint, user: u,
        current: all(targets, (i) => (i.assignee?.id ?? null) === (u?.id ?? null)),
        apply: (i) => ((i.assignee?.id ?? null) === (u?.id ?? null) ? null : { assignee_id: u?.id ?? null }) });
      return [assign(null), ...(me ? [assign(me, "You")] : []),
        ...Object.values(app.users).filter((u) => u.id !== me?.id).sort(byName).map((u) => assign(u))];
    }
    case "project": {
      // A project belongs to one team, and an issue can only move to its own team's projects: a selection across
      // teams has none to offer, and says so.
      if (teams.size > 1) return [{ id: "one-team", label: "Features from one team only", disabled: true, apply: () => null }];
      return Object.values(app.projects)
        .filter((p) => teams.has(p.team_id) && p.status_category !== "completed")
        .sort(byName)
        .map((p): PickerOption => ({
          id: `pr${p.id}`, label: p.name, hint: p.key, project: p,
          current: all(targets, (i) => i.project_id === p.id),
          apply: (i) => (i.kind !== "story" || i.project_id === p.id ? null : { project_id: p.id }),
        }));
    }
    case "cycle": {
      const now = Date.now();
      const cycles = Object.values(app.cycles)
        .filter((c) => teams.has(c.team_id) && Date.parse(c.end) >= now)
        .sort((a, b) => a.start.localeCompare(b.start));
      return [
        { id: "none", label: "No sprint", keys: "0", current: all(targets, (i) => i.cycle_id === null),
          apply: (i) => (i.cycle_id === null ? null : { cycle_id: null }) },
        ...cycles.map((c): PickerOption => ({
          id: `c${c.id}`, label: c.name, cycle: c, current: all(targets, (i) => i.cycle_id === c.id),
          hint: [teams.size > 1 ? app.teams[c.team_id]?.name : null, pickerRange(c), Date.parse(c.start) <= now ? "Current" : "Upcoming"]
            .filter(Boolean).join(" · "),
          apply: (i) => (i.team_id !== c.team_id || i.cycle_id === c.id ? null : { cycle_id: c.id }),
        })),
      ];
    }
    case "estimate": {
      const inUse = targets.map((t) => t.estimate).filter((e): e is number => e !== null && !ESTIMATES.includes(e));
      const values = [...new Set([...ESTIMATES, ...inUse])].sort((a, b) => a - b);
      return [
        { id: "none", label: "No estimate", current: all(targets, (i) => i.estimate === null),
          apply: (i) => (i.estimate === null ? null : { estimate: null }) },
        ...values.map((n): PickerOption => ({ id: `e${n}`, label: points(n), current: all(targets, (i) => i.estimate === n),
          apply: (i) => (i.estimate === n ? null : { estimate: n }) })),
      ];
    }
    case "labels": {
      const names = new Set<string>([...Object.values(app.issues).flatMap((i) => i.labels), ...remoteLabels]);
      return [...names].sort().map((label): PickerOption => {
        const every = all(targets, (i) => i.labels.includes(label));
        return {
          id: `l:${label}`, label: `${every ? "Remove" : "Add"} ${label}`, current: every,
          apply: (i) => {
            const has = i.labels.includes(label);
            if (every) return has ? { labels: i.labels.filter((l) => l !== label) } : null;
            return has ? null : { labels: [...i.labels, label] };
          },
        };
      });
    }
  }
}

/**
 * D16: an assignee list looks past the cache once two letters are typed, as ⌘K's does. The people found join
 * `users`, so the list re-renders with them. Undefined for the other pickers.
 */
export function peopleLookup(picker: Picker, app: Pick<AppState, "searchUsers">): ((q: string) => void) | undefined {
  if (picker !== "assignee") return undefined;
  return (q) => {
    if (q.length >= 2) void app.searchUsers(q);
  };
}

/** The writes one option makes over the targets; issues that already have the value are skipped. */
export function patchesFor(o: PickerOption, targets: Issue[]): { id: number; patch: IssuePatch }[] {
  return targets.flatMap((issue) => {
    const patch = o.apply(issue);
    return patch ? [{ id: issue.id, patch }] : [];
  });
}

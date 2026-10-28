import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import type { Cycle, Issue, IssuePatch, Priority, RankRequest, Status } from "../api/types";
import type { Group } from "./model";
import type { OrderBy } from "./types";

/**
 * Rows and cards (numeric IDs) are preferred over their group (a "group:..." ID). With closestCenter the group's own
 * centre could outrank the rows near it, so a same-group drop landed on the group and silently did nothing.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const isRow = (c: { id: unknown }) => typeof c.id === "number";
  const rows = args.droppableContainers.filter(isRow);
  const onRow = pointerWithin({ ...args, droppableContainers: rows });
  if (onRow.length) return onRow;
  const onGroup = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isRow(c)) });
  return onGroup.length ? onGroup : closestCenter({ ...args, droppableContainers: rows });
};

export const REORDER_HINT = "Set Ordering to Manual to reorder stories";
export const FOCUS_HINT = "Focus sorts by importance. Switch Grouping to move stories";


export interface Drop {
  issue: Issue;
  from: Group;
  to: Group;
  /** The row it was dropped on, or null for the group itself. */
  overId: number | null;
  orderBy: OrderBy;
  cycles: Record<number, Cycle>;
}
export interface DropResult { patch: IssuePatch | null; rank: RankRequest | null; hint: string | null }

const none: DropResult = { patch: null, rank: null, hint: null };
const explain = (hint: string): DropResult => ({ ...none, hint });

/** What dropping into `to` writes, or the reason it can't. */
function patchFor(issue: Issue, to: Group, cycles: Record<number, Cycle>): IssuePatch | string | null {
  switch (to.field) {
    case "status": return { status: to.value as Status };
    case "priority": return { priority: to.value as Priority };
    case "assignee": return { assignee_id: to.value as number | null };
    case "project":
      if (to.value === null) return "Stories need a feature";
      if (issue.kind !== "story") return "Defects can't belong to a feature";
      return { project_id: to.value as number };
    case "cycle": {
      if (to.value === null) return { cycle_id: null };
      const own = to.cycleIds.find((id) => cycles[id]?.team_id === issue.team_id);
      return own === undefined ? "That sprint isn't in this story's team" : { cycle_id: own };
    }
    case "focus": return FOCUS_HINT;
    case "none": return null;
  }
}

/** Spec §7 drag rules: into a group sets its property; between rows ranks, but only when ordered manually. */
export function resolveDrop(d: Drop): DropResult {
  if (d.from.field === "focus" && (d.from.key !== d.to.key || (d.overId !== null && d.overId !== d.issue.id))) return explain(FOCUS_HINT);
  const crossing = d.from.key !== d.to.key;
  let patch: IssuePatch | null = null;
  if (crossing) {
    const p = patchFor(d.issue, d.to, d.cycles);
    if (typeof p === "string") return explain(p);
    patch = p;
  }
  const over = d.overId;
  if (over === null || over === d.issue.id) return { ...none, patch };
  if (d.orderBy !== "manual") return crossing ? { ...none, patch } : explain(REORDER_HINT);
  if (crossing) return { patch, rank: { above: over }, hint: null };
  const from = d.from.issues.findIndex((i) => i.id === d.issue.id);
  const to = d.to.issues.findIndex((i) => i.id === over);
  return { ...none, rank: from < to ? { below: over } : { above: over } };
}

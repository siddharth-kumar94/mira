import type { Priority, Status } from "../api/types";

/** A view is a scope, plus filters, plus display options (spec §7). */
export type Layout = "list" | "board";
export type GroupBy = "focus" | "status" | "assignee" | "priority" | "project" | "cycle" | "none";
export type OrderBy = "importance" | "manual" | "priority" | "updated" | "created" | "estimate";
export type Property = "priority" | "id" | "status" | "labels" | "project" | "cycle" | "estimate" | "assignee" | "creator" | "created" | "updated";
/** My issues' "Completed issues" window (spec §18.1, assumption 2). */
export type CompletedWindow = "none" | "day" | "week" | "two_weeks";
export interface DisplayOptions {
  layout: Layout; groupBy: GroupBy; orderBy: OrderBy; showEmpty: boolean; completed: CompletedWindow;
  /** Group keys folded shut in this view (spec §18.3). */
  collapsed: string[];
  properties: Property[];
}

export type FilterField = "team" | "status" | "assignee" | "creator" | "priority" | "estimate" | "label" | "project" | "cycle";
/** A status, a priority, an id, a label name, or null for "none" (no assignee, no project …). */
export type FilterValue = string | number | null;
/** Values within a field are ORed; fields are ANDed. */
export type Filters = Partial<Record<FilterField, FilterValue[]>>;

export type Scope =
  | { kind: "my"; tab: "assigned" | "created" }
  | { kind: "team"; teamId: number; tab: "active" | "backlog" | "all" }
  /** One cycle of the team (spec §19.4); `cycleKey` (model.ts) takes in an ART's same-named, same-dated copies. */
  | { kind: "cycle"; teamId: number; cycleKey: string }
  /** One project's issues across teams (spec §19.6 Issues). */
  | { kind: "project"; projectId: number };

/** What a group's "+" puts into the composer (plan ruling 7). */
export interface ComposerPrefill {
  teamId?: number; status?: Status; priority?: Priority; assignee_id?: number | null; project_id?: number; cycle_id?: number | null;
  /** The cycle's merge key (an ART's cycle page): picking another team takes that team's copy of the cycle. */
  cycleKey?: string;
}

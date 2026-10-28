import type { Issue, IssuePatch, SubIssue, SubIssuePatch, User } from "../api/types";

/** An edit as the store applies it: the API patch, or a rank the store computed for a drop. */
export type LocalIssuePatch = IssuePatch & { rank?: string };

const userFor = (id: number | null | undefined, users: Record<number, User>): User | null =>
  id == null ? null : (users[id] ?? { id, name: "" });

/** The optimistic copy of an edit. It follows the server's status/cycle rules (spec §5.2). */
export function applyIssuePatch(issue: Issue, patch: LocalIssuePatch, users: Record<number, User>): Issue {
  const next: Issue = { ...issue };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if ("assignee_id" in patch) next.assignee = userFor(patch.assignee_id, users);
  if (patch.project_id !== undefined) next.project_id = patch.project_id;
  if ("estimate" in patch) next.estimate = patch.estimate ?? null;
  if (patch.labels !== undefined) next.labels = patch.labels;
  if (patch.blocked !== undefined) next.blocked = patch.blocked;
  if (patch.blocked_reason !== undefined) next.blocked_reason = patch.blocked_reason;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.rank !== undefined) next.rank = patch.rank;
  if ("cycle_id" in patch) {
    next.cycle_id = patch.cycle_id ?? null;
    if (next.cycle_id !== null && next.status === "backlog") next.status = "todo"; // in a cycle, Defined reads as Todo
  }
  if (patch.status !== undefined) {
    next.status = patch.status;
    if (patch.status === "backlog") next.cycle_id = null;
    next.completed_at = patch.status === "done" ? (issue.completed_at ?? new Date().toISOString()) : null;
  }
  return next;
}

/** The issue fields each patch key can change, side effects included. */
const ISSUE_FIELDS: Record<keyof LocalIssuePatch, (keyof Issue)[]> = {
  title: ["title"], status: ["status", "cycle_id", "completed_at"], priority: ["priority"], assignee_id: ["assignee"],
  cycle_id: ["cycle_id", "status"], project_id: ["project_id"], estimate: ["estimate"], labels: ["labels"],
  blocked: ["blocked"], blocked_reason: ["blocked_reason"], description: ["description"], rank: ["rank"],
};

/** Put back only the fields this patch touched, so a later in-flight edit keeps its optimistic value. */
export function revertIssueFields(current: Issue, before: Issue, patch: LocalIssuePatch): Issue {
  const next = { ...current } as Record<keyof Issue, unknown>;
  for (const key of Object.keys(patch) as (keyof LocalIssuePatch)[]) {
    for (const field of ISSUE_FIELDS[key]) next[field] = before[field];
  }
  return next as unknown as Issue;
}

export function applySubIssuePatch(sub: SubIssue, patch: SubIssuePatch, users: Record<number, User>): SubIssue {
  const next: SubIssue = { ...sub };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.status !== undefined) next.status = patch.status;
  if ("assignee_id" in patch) next.assignee = userFor(patch.assignee_id, users);
  if ("hours" in patch) next.hours = patch.hours ?? null;
  return next;
}

const SUB_FIELDS: Record<keyof SubIssuePatch, keyof SubIssue> = { title: "title", status: "status", assignee_id: "assignee", hours: "hours" };

export function revertSubIssueFields(current: SubIssue, before: SubIssue, patch: SubIssuePatch): SubIssue {
  const next = { ...current } as Record<keyof SubIssue, unknown>;
  for (const key of Object.keys(patch) as (keyof SubIssuePatch)[]) next[SUB_FIELDS[key]] = before[SUB_FIELDS[key]];
  return next as unknown as SubIssue;
}

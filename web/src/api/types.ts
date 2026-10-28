// Mirrors server/app/domain.py. Rally shapes never reach the client (spec D2); every word here is Linear's.
export type Status = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export const STATUSES: Status[] = ["backlog", "todo", "in_progress", "in_review", "done"];
export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog", todo: "Todo", in_progress: "In Progress", in_review: "In Review", done: "Done",
};
export type SubStatus = "todo" | "in_progress" | "done";
export const SUB_STATUS_LABEL: Record<SubStatus, string> = { todo: "Todo", in_progress: "In Progress", done: "Done" };
/** Linear's numbers: 0 no priority, 1 urgent … 4 low. */
export type Priority = 0 | 1 | 2 | 3 | 4;
export const PRIORITIES: Priority[] = [1, 2, 3, 4, 0];
export const PRIORITY_LABEL: Record<Priority, string> = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
export type HealthValue = "on_track" | "at_risk" | "off_track" | "no_target";
/** What a person can report in an update; "no target" is only ever computed. */
export type ReportedHealth = Exclude<HealthValue, "no_target">;
export const HEALTH_LABEL: Record<ReportedHealth, string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };
export type ProjectCategory = "backlog" | "planned" | "started" | "completed";
export const PROJECT_STATUS_LABEL: Record<ProjectCategory, string> = {
  backlog: "Backlog", planned: "Planned", started: "In Progress", completed: "Completed",
};
export type InitiativeStatus = "planned" | "active" | "completed";
export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = { planned: "Planned", active: "Active", completed: "Completed" };

export interface User { id: number; name: string }
export interface Workspace { id: number; name: string }
export interface Team { id: number; name: string; level: "team" | "art"; parent_id: number | null }
/** `name` is "PI 4 · Sprint 3" for headers and pickers; `short_name` is "Sprint 3" for chips. */
export interface Cycle {
  id: number; team_id: number; name: string; short_name: string; start: string; end: string;
  /** PlannedVelocity when it is above 0. */
  capacity: number | null;
}
export interface CycleStats { cycle_id: number; scope: number; started: number; completed: number; issue_count: number }
export interface Health { value: HealthValue; source: "update" | "auto"; reason: string }
export interface Update {
  id: number; author: User | null; health: ReportedHealth; html: string; created_at: string;
  progress: number | null; target: string | null;
}
export interface Project {
  id: number; key: string; name: string; status_name: string; status_category: ProjectCategory;
  lead: User | null; start: string | null; target: string | null; progress: number; issue_count: number; done_count: number;
  points: number; done_points: number; pi_id: number | null; initiative_id: number | null; team_id: number; risk: boolean;
  updated_at: string; health: Health | null; latest_update: Update | null;
  /** 0 when Rally has no priority field for projects (D38). */
  priority: Priority; rank: string; created_at: string; completed_at: string | null; labels: string[];
}
export interface Initiative {
  id: number; key: string; name: string; status: InitiativeStatus; status_name: string; owner: User | null;
  start: string | null; target: string | null; progress: number; project_count: number; group_id: number | null;
  group_name: string | null;
  /** The outcome's parent (Rally's Program), shown as the "Initiative" grouping. */
  parent_group_id: number | null; parent_group_name: string | null;
  health: Health | null; latest_update: Update | null; project_health: HealthValue[];
  /** 0 when Rally has no priority field for initiatives (D38). */
  priority: Priority;
  /** The description as one line of plain text: the list's second line (spec §19.7). */
  summary: string;
  /** Rally's rank: the list's Manual ordering. */
  rank: string;
  updated_at: string;
  /** Rally's creation date: the Activity tab's "created the initiative" line. */
  created_at: string;
}
/** A PI. Each Rally team has its own copy: `id` is the first copy's, `ids` every copy merged into it (a project's `pi_id` is one). */
export interface Release { id: number; name: string; start: string | null; end: string | null; ids: number[] }

export interface Issue {
  id: number;
  key: string;
  kind: "story" | "defect";
  title: string;
  status: Status;
  priority: Priority;
  assignee: User | null;
  creator: User | null;
  team_id: number;
  cycle_id: number | null;
  project_id: number | null;
  estimate: number | null;
  labels: string[];
  blocked: boolean;
  blocked_reason: string;
  description: string;
  rank: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  sub_issue_count: number;
}

export interface SubIssue {
  id: number; key: string; title: string; status: SubStatus; assignee: User | null; issue_id: number; team_id: number;
  hours: number | null; index: number; updated_at: string;
}
export interface Comment { id: number; author: User | null; html: string; created_at: string }
export interface Activity { id: string; author: User | null; text: string; created_at: string }

export interface Session { connected: boolean; me: User | null; workspace: Workspace | null; error: string | null }

export interface Bootstrap {
  me: User; workspace: Workspace;
  teams: Team[]; issues: Issue[]; sub_issues: SubIssue[]; cycles: Cycle[]; projects: Project[]; users: User[]; server_time: string;
  /** False when Rally has no priority field on Features / Capabilities (D38). */
  project_priority: boolean; initiative_priority: boolean;
}
export interface TeamLoad {
  team: Team; issues: Issue[]; cycles: Cycle[]; projects: Project[]; users: User[]; member_ids: number[]; server_time: string;
  /** An ART's open descendant teams, for names and scope. */
  child_teams: Team[];
}
export interface IssuePage { issues: Issue[]; next_cursor: number | null; cycles: Cycle[]; projects: Project[]; users: User[] }
export interface Changes {
  issues: Issue[]; sub_issues: SubIssue[]; cycles: Cycle[]; projects: Project[]; users: User[]; server_time: string;
}
export interface IssueDetail {
  issue: Issue; sub_issues: SubIssue[]; comments: Comment[]; activity: Activity[]; cycles: Cycle[]; projects: Project[]; users: User[];
}
export interface SearchResult { issues: Issue[]; teams: Team[]; projects: Project[] }
/** Spec §19.9: one point per UTC day, its state at the end of that day; `started` excludes Done. Points run from `start` to
 * the earlier of today and `end`; a project's `end` is the later of its target and today (ruling T22-end). */
export interface BurnupPoint { day: string; scope: number; started: number; completed: number }
export interface Burnup { start: string; end: string; points: BurnupPoint[] }
export type BurnupTarget = { kind: "cycle"; teamId: number; cycleId: number } | { kind: "project"; ref: string };
export interface CycleList { cycles: Cycle[]; stats: CycleStats[]; has_older: boolean }
export interface CycleDetail {
  cycle: Cycle; siblings: Cycle[]; issues: Issue[]; projects: Project[]; users: User[]; teams: Team[];
}
export interface ProjectList { projects: Project[]; initiatives: Initiative[]; teams: Team[]; releases?: Release[] }
export interface ProjectDetail {
  project: Project; description: string; issues: Issue[]; updates: Update[]; comments: Comment[]; cycles: Cycle[]; teams: Team[];
  users: User[]; releases?: Release[];
}
export interface InitiativeList { initiatives: Initiative[]; projects: Project[]; releases?: Release[] }
export interface InitiativeDetail {
  initiative: Initiative; description: string; projects: Project[]; updates: Update[]; comments: Comment[]; releases?: Release[];
}

export interface IssuePatch {
  title?: string;
  status?: Status;
  priority?: Priority;
  assignee_id?: number | null;
  cycle_id?: number | null;
  project_id?: number;
  estimate?: number | null;
  labels?: string[];
  blocked?: boolean;
  blocked_reason?: string;
  description?: string;
}
export interface IssueCreate {
  team_id: number; title: string; project_id: number; status?: Status; priority?: Priority; assignee_id?: number | null;
  labels?: string[]; cycle_id?: number | null; estimate?: number | null; description?: string; position?: "top" | "bottom";
}
export interface SubIssuePatch { title?: string; status?: SubStatus; assignee_id?: number | null; hours?: number | null }
export interface SubIssueCreate { title: string; assignee_id?: number | null; hours?: number | null }
export type RankRequest = { above: number } | { below: number };

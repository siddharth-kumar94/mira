import type { Cycle, Health, Project, Update } from "../api/types";

export const SPRINT_PREVIEW: Record<"current" | "upcoming", Cycle> = {
  current: { id: -1, team_id: -1, name: "PI 4 · Sprint 3", short_name: "Sprint 3", start: "2026-10-08T04:00:00.000Z", end: "2026-10-22T03:59:59.000Z", capacity: null },
  upcoming: { id: -2, team_id: -1, name: "PI 4 · Sprint 4", short_name: "Sprint 4", start: "2026-10-22T04:00:00.000Z", end: "2026-11-05T03:59:59.000Z", capacity: null },
};

/** Health samples for the PM pieces on /dev/icons, three days after an update (synthetic). */
export const SHEET_NOW = Date.parse("2026-10-19T12:00:00.000Z");
export const SHEET_UPDATE: Update = {
  id: -1, author: null, health: "at_risk", html: "", created_at: "2026-10-16T12:00:00.000Z", progress: 0.31, target: null,
};
export const SHEET_HEALTH: Record<"on" | "risk" | "off" | "auto" | "none", Health> = {
  none: { value: "no_target", source: "auto", reason: "No planned end date" },
  on: { value: "on_track", source: "update", reason: "" },
  risk: { value: "at_risk", source: "update", reason: "" },
  off: { value: "off_track", source: "update", reason: "" },
  auto: { value: "at_risk", source: "auto", reason: "Target in 9 days, 40% done" },
};

/** A synthetic project for the icon tile's cells. */
export const TILE_PROJECT: Project = {
  id: -1, key: "F0", name: "Sample", status_name: "Current PI", status_category: "started", lead: null, start: null, target: null,
  progress: 0.3, issue_count: 0, done_count: 0, points: 0, done_points: 0, pi_id: null, initiative_id: null, team_id: -1, risk: false,
  updated_at: "2026-10-16T12:00:00.000Z", health: null, latest_update: null, priority: 0, rank: "", created_at: "2026-09-01T12:00:00.000Z",
  completed_at: null, labels: [],
};

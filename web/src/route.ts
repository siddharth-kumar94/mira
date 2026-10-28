/** Every screen has a URL (spec D18). History routing; the dev server serves index.html for any path. */
export type MyTab = "assigned" | "created";
export type IssueTab = "active" | "backlog" | "all";
export type TeamTab = IssueTab | "cycles" | "projects";
export type ProjectTab = "overview" | "activity" | "issues";
export type InitiativeTab = "overview" | "activity" | "projects";
export type SettingsSection = "preferences" | "account" | "teams";
export type Route =
  | { name: "my"; tab: MyTab }
  | { name: "team"; teamId: number; tab: TeamTab }
  | { name: "issue"; key: string }
  | { name: "projects" }
  | { name: "initiatives" }
  | { name: "cycle"; teamId: number; cycleId: number }
  | { name: "project"; key: string; tab: ProjectTab }
  | { name: "initiative"; key: string; tab: InitiativeTab }
  | { name: "settings"; section: SettingsSection }
  | { name: "team-settings"; teamId: number }
  | { name: "icons" }
  | { name: "not-found"; path: string };

export const HOME: Route = { name: "my", tab: "assigned" };
const TEAM_TABS: TeamTab[] = ["active", "backlog", "all", "cycles", "projects"];
const PROJECT_TABS: ProjectTab[] = ["overview", "activity", "issues"];
const INITIATIVE_TABS: InitiativeTab[] = ["overview", "activity", "projects"];
const SETTINGS_SECTIONS: SettingsSection[] = ["preferences", "account", "teams"];
const ID = /^\d+$/;
const KEY = /^[A-Za-z]{1,4}\d+$/;

export function parsePath(path: string): Route {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  if (parts.length === 0) return HOME;
  const [head, a, b, c] = parts;
  if (head === "my" && parts.length === 2 && (a === "assigned" || a === "created")) return { name: "my", tab: a };
  if (head === "team" && parts.length === 4 && ID.test(a) && b === "cycles" && ID.test(c)) {
    return { name: "cycle", teamId: Number(a), cycleId: Number(c) };
  }
  if (head === "team" && ID.test(a ?? "") && parts.length <= 3) {
    const tab = (b ?? "active") as TeamTab;
    if (TEAM_TABS.includes(tab)) return { name: "team", teamId: Number(a), tab };
  }
  if (head === "issue" && parts.length === 2 && KEY.test(a)) return { name: "issue", key: a.toUpperCase() };
  if (head === "project" && parts.length <= 3 && KEY.test(a ?? "")) {
    const tab = (b ?? "overview") as ProjectTab;
    if (PROJECT_TABS.includes(tab)) return { name: "project", key: a.toUpperCase(), tab };
  }
  if (head === "initiative" && parts.length <= 3 && KEY.test(a ?? "")) {
    const tab = (b ?? "overview") as InitiativeTab;
    if (INITIATIVE_TABS.includes(tab)) return { name: "initiative", key: a.toUpperCase(), tab };
  }
  if (parts.length === 1 && (head === "projects" || head === "initiatives")) return { name: head };
  if (head === "settings") {
    if (parts.length === 1) return { name: "settings", section: "preferences" };
    if (parts.length === 2 && SETTINGS_SECTIONS.includes(a as SettingsSection)) return { name: "settings", section: a as SettingsSection };
    if (parts.length === 3 && a === "teams" && ID.test(b)) return { name: "team-settings", teamId: Number(b) };
  }
  if (head === "dev" && a === "icons" && parts.length === 2) return { name: "icons" };
  return { name: "not-found", path };
}

export function formatRoute(r: Route): string {
  switch (r.name) {
    case "my": return `/my/${r.tab}`;
    case "team": return `/team/${r.teamId}/${r.tab}`;
    case "issue": return `/issue/${r.key}`;
    case "cycle": return `/team/${r.teamId}/cycles/${r.cycleId}`;
    case "project": return r.tab === "overview" ? `/project/${r.key}` : `/project/${r.key}/${r.tab}`;
    case "initiative": return r.tab === "overview" ? `/initiative/${r.key}` : `/initiative/${r.key}/${r.tab}`;
    case "settings": return `/settings/${r.section}`;
    case "team-settings": return `/settings/teams/${r.teamId}`;
    case "icons": return "/dev/icons";
    case "not-found": return r.path;
    default: return `/${r.name}`;
  }
}

export const sameRoute = (a: Route, b: Route): boolean => formatRoute(a) === formatRoute(b);

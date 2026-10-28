import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../App";
import type { Team } from "../api/types";
import { appStore, uiStore } from "../store";
import { DEMO_TEAM, makeBootstrap, makeTeamLoad, serve, SPRINT3, SPRINT4 } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";

const ART: Team = { id: 9003, name: "Platform ART", level: "art", parent_id: null };
const CHILD: Team = { id: 9004, name: "Platform Core", level: "team", parent_id: 9003 };
const ART_SPRINTS = [{ ...SPRINT3, id: 501, team_id: 9004 }, { ...SPRINT4, id: 502, team_id: 9004 }];

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/my/assigned");
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

const routes = {
  "GET /api/bootstrap": makeBootstrap(),
  "GET /api/teams/9001": makeTeamLoad(),
  "GET /api/teams/9001/cycles": { cycles: [SPRINT3, SPRINT4], stats: [], has_older: false },
  "GET /api/teams/9003": makeTeamLoad({ team: ART, issues: [], cycles: [], projects: [], member_ids: [501, 502, 503], child_teams: [CHILD] }),
  "GET /api/teams/9003/cycles": { cycles: ART_SPRINTS, stats: [], has_older: false },
  "GET /api/search": { issues: [], teams: [ART], projects: [] },
};

async function open(route: Parameters<ReturnType<typeof uiStore.getState>["navigate"]>[0], joined: number[] = []) {
  const fetchMock = serve(routes);
  render(<App />);
  await screen.findByRole("navigation", { name: "Main" });
  for (const id of joined) uiStore.getState().joinTeam(id);
  uiStore.getState().navigate(route);
  await screen.findByRole("navigation", { name: "Settings" });
  return fetchMock;
}

/** A settings row is a list item: its title, its description and its controls. */
const row = (title: string) => {
  const found = [...document.querySelectorAll("main [data-part=row-title]")].find((t) => t.textContent === title);
  if (!found) throw new Error(`no row "${title}"`);
  return found.closest("li")!;
};
const titles = (el: ParentNode) => [...el.querySelectorAll("[data-part=row-title]")].map((t) => t.textContent);

test("Teams lists your sidebar and joined teams: tile, name, ART or Team, Join or Leave, Show in sidebar", async () => {
  await open({ name: "settings", section: "teams" }, [9003]);
  expect(screen.getByRole("heading", { level: 1, name: "Teams" })).toBeInTheDocument();
  const yours = within(screen.getByRole("main")).getByRole("region", { name: "Your teams" });
  expect(await within(yours).findByText("Platform ART")).toBeInTheDocument();
  expect(titles(yours)).toEqual(["Data Services", "AI/ML Solutions", "Platform ART"]);
  expect(row("Data Services")).toHaveTextContent("Team");
  expect(row("Platform ART")).toHaveTextContent("ART");
  for (const name of ["Data Services", "AI/ML Solutions", "Platform ART"]) {
    const r = row(name);
    expect(r.querySelector("[data-part=icon-tile]"), name).not.toBeNull();
    expect(within(r).getByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(within(r).getByRole("switch", { name: "Show in sidebar" })).toHaveAttribute("aria-checked", "true");
  }

  // Show in sidebar: off hides the team (hideTeam), on shows it again (showTeam).
  fireEvent.click(within(row("Data Services")).getByRole("switch", { name: "Show in sidebar" }));
  expect(uiStore.getState().hiddenTeamIds).toEqual([9001]);
  expect(within(row("Data Services")).getByRole("switch", { name: "Show in sidebar" })).toHaveAttribute("aria-checked", "false");
  expect(within(screen.getByRole("navigation", { name: "Settings" })).queryByRole("button", { name: "Data Services" })).toBeNull();
  // Hiding one of Rally's own teams is leaving it (D6): the row offers Join.
  expect(within(row("Data Services")).getByRole("button", { name: "Join" })).toBeInTheDocument();
  fireEvent.click(within(row("Data Services")).getByRole("switch", { name: "Show in sidebar" }));
  expect(uiStore.getState().hiddenTeamIds).toEqual([]);
  expect(within(row("Data Services")).getByRole("switch", { name: "Show in sidebar" })).toHaveAttribute("aria-checked", "true");

  // Leave keeps the row (with Join) so it can be joined again; a team you're not in can't be shown in the sidebar.
  fireEvent.click(within(row("Platform ART")).getByRole("button", { name: "Leave" }));
  expect(uiStore.getState().joinedTeamIds).toEqual([]);
  expect(titles(yours)).toEqual(["Data Services", "AI/ML Solutions", "Platform ART"]);
  const sw = within(row("Platform ART")).getByRole("switch", { name: "Show in sidebar" });
  expect(sw).toHaveAttribute("aria-checked", "false");
  expect(sw).toBeDisabled();
  fireEvent.click(within(row("Platform ART")).getByRole("button", { name: "Join" }));
  expect(uiStore.getState().joinedTeamIds).toEqual([9003]);
  expect(within(row("Platform ART")).getByRole("switch", { name: "Show in sidebar" })).toHaveAttribute("aria-checked", "true");

  // The name opens the team's settings.
  fireEvent.click(within(row("AI/ML Solutions")).getByRole("button", { name: "AI/ML Solutions" }));
  expect(uiStore.getState().route).toEqual({ name: "team-settings", teamId: 9002 });
});

test("Find a team searches Rally's teams and lists them with Join", async () => {
  const fetchMock = await open({ name: "settings", section: "teams" });
  const find = screen.getByRole("region", { name: "Find a team" });
  fireEvent.change(within(find).getByRole("searchbox", { name: "Find a team" }), { target: { value: "plat" } });
  const result = await within(find).findByRole("button", { name: "Platform ART" });
  expect(fetchMock).toHaveBeenCalledWith("/api/search?q=plat", expect.anything());
  const r = result.closest("li")!;
  expect(r).toHaveTextContent("ART");
  fireEvent.click(within(r).getByRole("button", { name: "Join" }));
  expect(uiStore.getState().joinedTeamIds).toEqual([9003]);
  expect(titles(within(screen.getByRole("main")).getByRole("region", { name: "Your teams" }))).toEqual(["Data Services", "AI/ML Solutions", "Platform ART"]);
  expect(within(screen.getByRole("navigation", { name: "Settings" })).getByRole("button", { name: "Platform ART" })).toBeInTheDocument();
});

test("Find a team says so when nothing matches", async () => {
  serve({ ...routes, "GET /api/search": { issues: [], teams: [], projects: [] } });
  render(<App />);
  await screen.findByRole("navigation", { name: "Main" });
  uiStore.getState().navigate({ name: "settings", section: "teams" });
  const find = await screen.findByRole("region", { name: "Find a team" });
  fireEvent.change(within(find).getByRole("searchbox", { name: "Find a team" }), { target: { value: "zzz" } });
  expect(await within(find).findByText("No teams match")).toBeInTheDocument();
});

const value = (title: string) => row(title).querySelector("[data-part=value]")?.textContent;

/** A link row has the hover and the chevron; a plain row neither. */
const isLink = (title: string) => {
  const r = row(title);
  const chevron = r.querySelector("[data-part=chevron]") !== null;
  const hover = r.className.includes("hover:bg-hover-soft");
  expect(chevron, `${title} chevron vs hover`).toBe(hover);
  return chevron;
};

test("team settings for an ART: ‹ Teams, the name, Team overview ›, plain rows, and link rows for Sprints and each child team", async () => {
  await open({ name: "team-settings", teamId: 9003 }, [9003]);
  expect(await screen.findByRole("heading", { level: 1, name: "Platform ART" })).toBeInTheDocument();
  expect(await screen.findByText("3 members")).toBeInTheDocument();
  expect(await screen.findByText("Every 2 weeks")).toBeInTheDocument();
  expect(titles(document)).toEqual(["Members", "Story statuses", "Sprints", "Child teams", "Platform Core"]);
  expect(value("Members")).toBe("3 members");
  expect(value("Story statuses")).toBe("5 statuses");
  expect(value("Sprints")).toBe("Every 2 weeks");
  expect(value("Child teams")).toBe("1 team");
  expect(value("Platform Core")).toBe("Team");
  expect(["Members", "Story statuses", "Sprints", "Child teams", "Platform Core"].map(isLink)).toEqual([false, false, true, false, true]);
  for (const title of ["Members", "Story statuses", "Sprints", "Child teams", "Platform Core"]) {
    const r = row(title);
    expect(r.querySelector("[data-part=icon-tile]"), title).not.toBeNull();
    for (const role of ["switch", "checkbox", "combobox", "textbox", "menuitem"]) expect(within(r).queryAllByRole(role), `${title} ${role}`).toEqual([]);
  }
  // Plain rows have nothing to press.
  for (const title of ["Members", "Story statuses", "Child teams"]) expect(within(row(title)).queryAllByRole("button"), title).toEqual([]);

  fireEvent.click(within(row("Sprints")).getByRole("button", { name: "Sprints" }));
  expect(uiStore.getState().route).toEqual({ name: "team", teamId: 9003, tab: "cycles" });
  uiStore.getState().navigate({ name: "team-settings", teamId: 9003 });
  await screen.findByRole("heading", { level: 1, name: "Platform ART" });

  fireEvent.click(within(row("Platform Core")).getByRole("button", { name: "Platform Core" }));
  expect(uiStore.getState().route).toEqual({ name: "team-settings", teamId: 9004 });
  expect(window.location.pathname).toBe("/settings/teams/9004");
  uiStore.getState().navigate({ name: "team-settings", teamId: 9003 });
  await screen.findByRole("heading", { level: 1, name: "Platform ART" });

  fireEvent.click(screen.getByRole("button", { name: "Team overview" }));
  expect(uiStore.getState().route).toEqual({ name: "team", teamId: 9003, tab: "active" });
  uiStore.getState().navigate({ name: "team-settings", teamId: 9003 });
  await screen.findByRole("heading", { level: 1, name: "Platform ART" });
  fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Teams" }));
  expect(uiStore.getState().route).toEqual({ name: "settings", section: "teams" });
});

test("team settings for a team: members from the team load, no Child teams row", async () => {
  const fetchMock = await open({ name: "team-settings", teamId: 9001 });
  expect(screen.getByRole("heading", { level: 1, name: DEMO_TEAM.name })).toBeInTheDocument();
  expect(await screen.findByText("2 members")).toBeInTheDocument();
  expect(await screen.findByText("Every 2 weeks")).toBeInTheDocument();
  expect(titles(document)).toEqual(["Members", "Story statuses", "Sprints"]);
  expect(fetchMock).toHaveBeenCalledWith("/api/teams/9001", expect.anything());
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/teams\/9001\/cycles\?past=/), expect.anything());
});

/**
 * The routes, with some team loads replaced; `hang` loads of that team never settle. The store keeps pending and settled
 * cycle loads per team for its lifetime, so each of these tests uses its own team id.
 */
function serveTeam(teamRoutes: Record<string, unknown>, hang?: number) {
  const base = serve({ ...routes, ...teamRoutes } as typeof routes);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    hang !== undefined && String(input).startsWith(`/api/teams/${hang}`) ? new Promise<Response>(() => {}) : base(input, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openTeam(teamId: number) {
  render(<App />);
  await screen.findByRole("navigation", { name: "Main" });
  uiStore.getState().navigate({ name: "team-settings", teamId });
  await screen.findByRole("navigation", { name: "Settings" });
}

test("team settings while the team and its cycles load: a muted Loading… in each value", async () => {
  serveTeam({}, 9002);
  await openTeam(9002);
  expect(value("Members")).toBe("Loading…");
  expect(value("Sprints")).toBe("Loading…");
  expect(value("Story statuses")).toBe("5 statuses");
  expect(row("Members").querySelector("[data-part=value] .text-ink-4")).not.toBeNull();
});

test("team settings when the loads fail: Unavailable with Retry, and Retry loads them", async () => {
  const OPS: Team = { id: 9006, name: "Ops", level: "team", parent_id: null };
  serveTeam({ "GET /api/teams/9006": [500, { error: "Rally is down" }], "GET /api/teams/9006/cycles": [500, { error: "Rally is down" }] });
  await openTeam(9006);
  expect(await within(row("Members")).findByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(await within(row("Sprints")).findByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(value("Members")).toContain("Unavailable");
  expect(value("Sprints")).toContain("Unavailable");

  serve({ ...routes, "GET /api/teams/9006": makeTeamLoad({ team: OPS }), "GET /api/teams/9006/cycles": routes["GET /api/teams/9001/cycles"] });
  fireEvent.click(within(row("Members")).getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("2 members")).toBeInTheDocument();
  fireEvent.click(within(row("Sprints")).getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Every 2 weeks")).toBeInTheDocument();
  expect(uiStore.getState().route).toEqual({ name: "team-settings", teamId: 9006 }); // Retry doesn't open the Sprints tab
});

test("team settings for a team Rally doesn't have: Couldn't find this team, and no rows", async () => {
  serveTeam({ "GET /api/teams/9005": [404, { error: "not found" }] });
  await openTeam(9005);
  expect(await screen.findByText("Couldn't find this team.")).toBeInTheDocument();
  expect(titles(document)).toEqual([]);
  expect(screen.queryByRole("button", { name: "Team overview" })).toBeNull();
  expect(within(screen.getByRole("main")).getByRole("button", { name: "Teams" })).toBeInTheDocument();
});

test("Teams and Find a team, in Rally's words", async () => {
  await open({ name: "settings", section: "teams" }, [9003]);
  const yours = within(screen.getByRole("main")).getByRole("region", { name: "Your teams" });
  expect(await within(yours).findByText("Platform ART")).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("team settings, loaded: the Sprints and Story statuses rows and their descriptions", async () => {
  await open({ name: "team-settings", teamId: 9003 }, [9003]);
  expect(await screen.findByText("Every 2 weeks")).toBeInTheDocument();
  expect(await screen.findByText("3 members")).toBeInTheDocument();
  expect(row("Story statuses")).toHaveTextContent("The statuses stories go through");
  expect(row("Sprints")).toHaveTextContent("How long each sprint runs");
  expectRallyWords(document.body);
});

test("team settings, loading: Rally's words around the muted Loading…", async () => {
  serveTeam({}, 9002);
  await openTeam(9002);
  expect(value("Sprints")).toBe("Loading…");
  expect(row("Story statuses")).toHaveTextContent("5 statuses");
  expectRallyWords(document.body);
});

test("team settings, failed: Rally's words around Unavailable and Retry", async () => {
  serveTeam({ "GET /api/teams/9007": [500, { error: "Rally is down" }], "GET /api/teams/9007/cycles": [500, { error: "Rally is down" }] });
  await openTeam(9007);
  expect(await within(row("Sprints")).findByRole("button", { name: "Retry" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("team settings, not found: Rally's words", async () => {
  serveTeam({ "GET /api/teams/9008": [404, { error: "not found" }], "GET /api/teams/9008/cycles": [404, { error: "not found" }] });
  await openTeam(9008);
  expect(await screen.findByText("Couldn't find this team.")).toBeInTheDocument();
  expectRallyWords(document.body);
});

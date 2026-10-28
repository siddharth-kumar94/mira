import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Project, ProjectList, Release } from "../api/types";
import { formatRoute } from "../route";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { AIML, DANA, DEMO_TEAM, makeBootstrap, makeProject, serve } from "../test/fixtures";
import { ProjectsView } from "./ProjectsView";

const PI4: Release = { id: 701, name: "PI 4", start: "2026-10-08", end: "2026-12-31", ids: [701, 702] };
const ALFRED = makeProject({
  id: 12, key: "F12", name: "Alfred Onboarding", team_id: 9002, status_category: "started", status_name: "Current PI", progress: 0.37,
  start: "2026-09-01", target: "2026-10-01", issue_count: 6, lead: DANA, pi_id: 701, rank: "a",
  health: { value: "on_track", source: "update", reason: "" },
  latest_update: { id: 1, author: DANA, health: "on_track", html: "", created_at: "2026-10-16T12:00:00.000Z", progress: null, target: null },
});
const PORTAL = makeProject({ id: 13, key: "F13", name: "Enterprise AI Portal", team_id: 9002, status_category: "planned", progress: 0,
  target: "2027-02-15", issue_count: 2, pi_id: 702, rank: "b", health: { value: "no_target", source: "auto", reason: "" } }); // the other team's copy of PI 4
const LIST: ProjectList = { projects: [ALFRED, PORTAL], initiatives: [], teams: [AIML] };

async function start({ priority = true, projects = LIST }: { priority?: boolean; projects?: ProjectList } = {}) {
  serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML], project_priority: priority }),
    "GET /api/projects": projects, "GET /api/releases": [PI4],
  });
  await appStore.getState().load();
}
const team = () => render(<ProjectsView scope={{ kind: "team", teamId: 9002 }} />);
const row = (name: string) => screen.findByRole("link", { name: new RegExp(name) });
const openDisplay = () => {
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  return screen.getByRole("dialog", { name: "Display options" });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the team view is a breadcrumb, the All features tab, then Filter and Display; no New project (D23)", async () => {
  await start();
  team();
  await row("Alfred");
  const crumb = screen.getByRole("heading", { level: 1 });
  expect(crumb).toHaveTextContent("AI/ML Solutions›Features");
  expect(within(crumb).getByRole("button", { name: "AI/ML Solutions" }).querySelector("[aria-hidden]")).not.toBeNull(); // the tile
  expect(screen.getByRole("tab", { name: "All features" })).toHaveAttribute("aria-selected", "true");
  const tools = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter((l) => l === "Add filter" || l === "Display options" || l === "Open sidebar");
  expect(tools).toEqual(["Add filter", "Display options"]);
  expect(screen.queryByRole("button", { name: /New project/ })).toBeNull();
});

test("the workspace view is titled Projects and loads the sidebar teams' projects", async () => {
  await start();
  const fetchSpy = vi.mocked(fetch);
  render(<ProjectsView scope={{ kind: "workspace" }} />);
  await row("Alfred");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Features$/);
  // The workspace defaults to the timeline (§19.5).
  expect(screen.getByRole("group", { name: "Features timeline" })).toBeInTheDocument();
  expect(fetchSpy.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/api/projects"))).toContain("teams=9001,9002");
});

test("list columns are Linear's, with Priority only when the field exists (D38)", async () => {
  await start();
  const { unmount } = team();
  await row("Alfred");
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Health", "Priority", "Lead", "Target date", "Stories", "Status"]);
  unmount();
  appStore.setState(appStore.getInitialState(), true);
  await start({ priority: false });
  team();
  await row("Alfred");
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Health", "Lead", "Target date", "Stories", "Status"]);
  expect(screen.queryByRole("img", { name: "No priority" })).toBeNull();
});

test("a row: cube, name, PI chip, health, lead, overdue date, issues, then status % and sparkline", async () => {
  await start();
  team();
  const r = await row("Alfred");
  const cols = [...r.querySelectorAll("[data-col]")].map((c) => c.getAttribute("data-col"));
  expect(cols).toEqual(["name", "health", "priority", "lead", "target", "issues", "status"]);
  const cell = (c: string) => r.querySelector(`[data-col="${c}"]`) as HTMLElement;
  expect(cell("name").querySelector("[data-part=cube]")).not.toBeNull();
  expect(cell("name")).toHaveTextContent("Alfred OnboardingPI 4");
  expect(within(cell("health")).getByRole("button", { name: "On track, last update 3 days ago. Click to open updates." })).toHaveTextContent("On track · 3d");
  expect(cell("lead")).toHaveTextContent("Dana Demo");
  expect(cell("target")).toHaveTextContent("Oct 1st");
  expect(cell("target").querySelector(".text-overrun")).not.toBeNull(); // the overdue calendar
  expect(cell("issues")).toHaveTextContent("6");
  expect(cell("status")).toHaveTextContent("37%");
  expect(cell("status").querySelectorAll("svg")).toHaveLength(2); // the status hexagon and the sparkline
  const portal = await row("Enterprise");
  expect(portal.querySelector('[data-col="target"] .text-overrun')).toBeNull();
  expect(portal.querySelector('[data-col="status"]')!.querySelectorAll("svg")).toHaveLength(1); // no sparkline at 0%
  expect(portal.querySelector('[data-col="health"]')).toHaveTextContent("No updates");
  expect(portal.querySelector('[data-col="name"]')).toHaveTextContent("Enterprise AI PortalPI 4"); // through the copy id 702
});

test("clicking a row opens the project", async () => {
  await start();
  team();
  const r = await row("Alfred");
  expect(r).toHaveAttribute("href", "/project/F12");
  fireEvent.click(r);
  expect(formatRoute(uiStore.getState().route)).toBe("/project/F12");
});

test("the Display popover: layout tabs, Grouping, Ordering, Show closed features, the properties in spec order, Reset once changed", async () => {
  await start();
  team();
  await row("Alfred");
  const display = screen.getByRole("button", { name: "Display options" });
  const menu = openDisplay();
  expect(display.className).toContain("bg-pill-on");
  expect(within(menu).getAllByRole("tab").map((t) => t.textContent)).toEqual(["List", "Board", "Timeline"]);
  expect(within(menu).getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
  expect(within(menu).getByRole("button", { name: "Grouping: No grouping" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Ordering: Manual" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Show closed features: All" })).toBeInTheDocument();
  const pills = within(within(menu).getByRole("group", { name: "Display properties" })).getAllByRole("button");
  expect(pills.map((p) => p.textContent)).toEqual(["ID", "PI", "Priority", "Status", "Health", "Teams", "Capabilities", "Lead", "Start date",
    "Target date", "Stories", "Created", "Updated", "Completed", "Labels"]);
  expect(pills.filter((p) => p.getAttribute("aria-pressed") === "true").map((p) => p.textContent))
    .toEqual(["PI", "Priority", "Status", "Health", "Lead", "Target date", "Stories"]);
  // Linear shows its footer only once the view differs from its default (measured live on the team's List).
  expect(within(menu).queryByRole("button", { name: "Reset to view default" })).toBeNull();
  fireEvent.click(within(menu).getByRole("button", { name: "ID" }));
  expect(within(menu).getByRole("button", { name: "Reset to view default" })).toHaveTextContent("Reset");
  expect(within(menu).queryByText("Set default for everyone")).toBeNull();
});

test("Display choices change the list and are saved; Reset restores the default", async () => {
  await start();
  team();
  await row("Alfred");
  const menu = openDisplay();
  fireEvent.click(within(menu).getByRole("button", { name: "Grouping: No grouping" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Status" }));
  expect(screen.getAllByRole("region").map((g) => g.getAttribute("aria-label"))).toEqual(["Planned", "In Progress"]);
  fireEvent.click(within(menu).getByRole("button", { name: "Stories" }));
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("Stories");
  expect(JSON.parse(localStorage.getItem("mira-pm:v1:team:9002:projects")!).groupBy).toBe("status");
  expect(screen.getByRole("button", { name: "Display options" }).querySelector("[data-dot]")).not.toBeNull();
  fireEvent.click(within(menu).getByRole("button", { name: "Reset to view default" }));
  expect(screen.queryAllByRole("region")).toHaveLength(0);
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Stories");
  expect(screen.getByRole("button", { name: "Display options" }).querySelector("[data-dot]")).toBeNull();
});

test("Board adds Columns, Rows and Show empty columns; Timeline its switches and the Show cycles team picker", async () => {
  await start();
  team();
  await row("Alfred");
  const menu = openDisplay();
  fireEvent.click(within(menu).getByRole("tab", { name: "Board" }));
  expect(within(menu).getByRole("button", { name: "Columns: Status" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Rows: No grouping" })).toBeInTheDocument();
  expect(within(menu).queryByRole("button", { name: /^Grouping/ })).toBeNull();
  expect(within(menu).getByRole("switch", { name: "Show empty columns" })).toHaveAttribute("aria-checked", "false");
  fireEvent.click(within(menu).getByRole("tab", { name: "Timeline" }));
  const switches = within(menu).getAllByRole("switch").map((s) => [s.getAttribute("aria-label"), s.getAttribute("aria-checked")]);
  expect(switches).toEqual([["Show feature list", "true"], ["Show week numbers", "false"], ["Show PIs", "false"]]);
  expect(within(menu).getByRole("button", { name: "Show sprints: None" })).toBeInTheDocument();
  // Timeline mounts the timeline (ledger R3): its project list, no list headers.
  expect(screen.getByRole("group", { name: "Features timeline" })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Feature list" })).getByRole("link", { name: /Alfred/ })).toHaveAttribute("href", "/project/F12");
  expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
});

test("the Board layout mounts the projects board: status columns and cards, no list headers (ledger R3)", async () => {
  await start();
  team();
  await row("Alfred");
  fireEvent.click(within(openDisplay()).getByRole("tab", { name: "Board" }));
  const board = screen.getByRole("group", { name: "Features board" });
  expect(within(board).getAllByRole("region").map((c) => c.getAttribute("aria-label"))).toEqual(["Planned column", "In Progress column"]);
  expect(within(screen.getByRole("region", { name: "In Progress column" })).getByRole("link", { name: /Alfred/ })).toHaveAttribute("href", "/project/F12");
  expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
  fireEvent.click(screen.getByRole("switch", { name: "Show empty columns" }));
  expect(within(board).getAllByRole("region")).toHaveLength(4);
});

test("the Filter menu lists the spec's fields in order and filters the rows", async () => {
  await start();
  team();
  await row("Alfred");
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  const menu = screen.getByRole("menu", { name: "Filter" });
  expect(within(menu).getAllByRole("menuitem").map((i) => i.getAttribute("aria-label")))
    .toEqual(["Status", "Priority", "Labels", "Teams", "Lead", "Health", "Dates", "Capabilities", "PI", "Title"]);
  fireEvent.mouseEnter(within(menu).getByRole("menuitem", { name: "Dates" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Overdue" }));
  expect(screen.queryByRole("link", { name: /Enterprise/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Alfred/ })).toBeInTheDocument();
  expect(screen.getByText("Dates is Overdue")).toBeInTheDocument();
});

test("the Title filter matches names containing the text", async () => {
  await start();
  team();
  await row("Alfred");
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Title" }));
  const input = screen.getByRole("textbox", { name: "Title contains" });
  fireEvent.change(input, { target: { value: "portal" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.queryByRole("link", { name: /Alfred/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Enterprise/ })).toBeInTheDocument();
  expect(screen.getByText("Title contains portal")).toBeInTheDocument();
});

test("without the priority field there is no Priority filter, grouping, ordering or property (Review Focus 5)", async () => {
  localStorage.setItem("mira-pm:v1:team:9002:projects", JSON.stringify({ groupBy: "priority", orderBy: "priority", properties: ["priority", "health"] }));
  await start({ priority: false });
  team();
  await row("Alfred");
  expect(screen.queryAllByRole("region")).toHaveLength(0); // the saved priority grouping fell back to none
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Health"]);
  const menu = openDisplay();
  expect(within(menu).getByRole("button", { name: "Ordering: Manual" })).toBeInTheDocument();
  expect(within(within(menu).getByRole("group", { name: "Display properties" })).queryByRole("button", { name: "Priority" })).toBeNull();
  fireEvent.click(within(menu).getByRole("button", { name: "Grouping: No grouping" }));
  expect(screen.queryByRole("menuitemcheckbox", { name: "Priority" })).toBeNull();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  fireEvent.click(within(menu).getByRole("button", { name: "Ordering: Manual" }));
  expect(screen.queryByRole("menuitemcheckbox", { name: "Priority" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  expect(within(screen.getByRole("menu", { name: "Filter" })).queryByRole("menuitem", { name: "Priority" })).toBeNull();
});

test("Show closed features: None hides Completed", async () => {
  const done: Project = makeProject({ id: 14, key: "F14", name: "Shipped thing", team_id: 9002, status_category: "completed",
    completed_at: "2026-10-10T00:00:00.000Z", rank: "c" });
  await start({ projects: { ...LIST, projects: [...LIST.projects, done] } });
  team();
  await row("Shipped");
  const menu = openDisplay();
  fireEvent.click(within(menu).getByRole("button", { name: "Show closed features: All" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "None" }));
  expect(screen.queryByRole("link", { name: /Shipped/ })).toBeNull();
});

test("the features list, Display and Filter popovers use Rally's words", async () => {
  await start();
  const { container } = team();
  await row("Alfred");
  expect(screen.getByRole("tab", { name: "All features" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AI/ML Solutions›Features");
  expect(screen.getByRole("group", { name: "AI/ML Solutions features" })).toBeInTheDocument();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Stories");
  expect(screen.getAllByRole("checkbox", { name: "Select feature" })).toHaveLength(2);
  expectRallyWords(container);
  const menu = openDisplay();
  expect(within(menu).getByRole("button", { name: "Show closed features: All" })).toBeInTheDocument();
  expect(within(within(menu).getByRole("group", { name: "Display properties" })).getByRole("button", { name: "Capabilities" })).toBeInTheDocument();
  expectRallyWords(document.body);
  fireEvent.click(within(menu).getByRole("button", { name: "Grouping: No grouping" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Capability" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the Display popover on Timeline and Board, and the Filter menu, use Rally's words", async () => {
  await start();
  team();
  await row("Alfred");
  const menu = openDisplay();
  fireEvent.click(within(menu).getByRole("tab", { name: "Timeline" }));
  expect(within(menu).getByRole("switch", { name: "Show feature list" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Show sprints: None" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Features timeline" })).toBeInTheDocument();
  expectRallyWords(document.body);
  fireEvent.click(within(menu).getByRole("tab", { name: "Board" }));
  expect(screen.getByRole("group", { name: "Features board" })).toBeInTheDocument();
  expect(screen.getByText("2 stories")).toBeInTheDocument();
  expect(screen.getByText("6 stories")).toBeInTheDocument();
  expectRallyWords(document.body);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  const filter = screen.getByRole("menu", { name: "Filter" });
  expect(within(filter).getByRole("menuitem", { name: "Capabilities" })).toBeInTheDocument();
  fireEvent.mouseEnter(within(filter).getByRole("menuitem", { name: "PI" }));
  const pi4 = await screen.findByRole("menuitemcheckbox", { name: /PI 4/ });
  expect(pi4).toHaveTextContent("2 features"); // both team copies of PI 4 count their feature
  expectRallyWords(document.body);
});

test("empty, error and loading states read in Rally's words", async () => {
  await start({ projects: { projects: [], initiatives: [], teams: [AIML] } });
  const first = team();
  expect(await screen.findByText("No features.")).toBeInTheDocument();
  expectRallyWords(first.container);
  first.unmount();
  appStore.setState(appStore.getInitialState(), true);
  await start();
  uiStore.setState(uiStore.getInitialState(), true);
  const filtered = team();
  await row("Alfred");
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Title" }));
  const input = screen.getByRole("textbox", { name: "Title contains" });
  fireEvent.change(input, { target: { value: "zzz" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText("No features match this view.")).toBeInTheDocument();
  expectRallyWords(filtered.container);
  filtered.unmount();
  appStore.setState(appStore.getInitialState(), true);
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML] }), "GET /api/projects": [500, { error: "nope" }] });
  await appStore.getState().load();
  const failed = team();
  expect(await screen.findByText(/Couldn't load features\./)).toBeInTheDocument();
  expectRallyWords(failed.container);
});

test("Join a team to see its features", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [] }) });
  await appStore.getState().load();
  const { container } = render(<ProjectsView scope={{ kind: "workspace" }} />);
  expect(await screen.findByText("Join a team to see its features.")).toBeInTheDocument();
  expectRallyWords(container);
});

test("view options saved with the old keys still load and show the new words", async () => {
  localStorage.setItem("mira-pm:v1:team:9002:projects", JSON.stringify({ groupBy: "initiative", properties: ["initiatives", "issues"] }));
  await start();
  team();
  await row("Alfred");
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Capabilities", "Stories"]);
  expect(screen.getAllByRole("region").map((g) => g.getAttribute("aria-label"))).toContain("Capability 251");
});

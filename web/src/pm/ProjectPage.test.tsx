import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Initiative, InitiativeDetail, ProjectDetail, Release, Update } from "../api/types";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { AIML, DANA, DEMO_TEAM, SAM, makeBootstrap, makeIssue, makeProject, serve } from "../test/fixtures";
import type { ProjectTab } from "../route";
import { ProjectPage } from "./ProjectPage";

const PI4: Release = { id: 701, name: "PI 4", start: "2026-10-08", end: "2026-12-31", ids: [701] };
const INITIATIVE: Initiative = {
  id: 251, key: "I251", name: "[DEMO] Agentic Platform", status: "active", status_name: "Active", owner: DANA, start: null,
  target: null, progress: 0.2, project_count: 1, group_id: null, group_name: null, parent_group_id: null, parent_group_name: null, health: null, latest_update: null,
  project_health: [], priority: 0, summary: "", rank: "", updated_at: "", created_at: "",
};
const LATEST: Update = {
  id: 802, author: DANA, health: "on_track", created_at: "2026-10-16T12:00:00.000Z", progress: 0.52, target: "2027-01-01",
  html: '<p>First group is onboarding.</p><script>alert(1)</script><p onclick="steal()">Runbook drafted.</p>',
};
const FIRST: Update = { id: 801, author: SAM, health: "at_risk", html: "<p>Started.</p>", created_at: "2026-10-09T12:00:00.000Z",
  progress: 0.37, target: "2026-12-01" };
const PROJECT = makeProject({
  id: 205, key: "F205", name: "[DEMO] Linear-style Rally client", status_name: "Current PI", status_category: "started",
  start: "2026-09-10", target: "2026-12-31", team_id: 9001, pi_id: 701, initiative_id: 251, labels: ["collabathon-demo"],
  health: { value: "on_track", source: "update", reason: "" }, latest_update: LATEST,
});
const ISSUES = [
  makeIssue({ id: 1101, key: "US1101", project_id: 205, team_id: 9001, status: "done", estimate: 3, assignee: DANA, labels: ["api"] }),
  makeIssue({ id: 1102, key: "US1102", project_id: 205, team_id: 9002, status: "in_progress", estimate: 5, assignee: SAM, labels: [] }),
  makeIssue({ id: 1103, key: "US1103", project_id: 205, team_id: 9001, status: "todo", estimate: 2, assignee: null, labels: [] }),
];
const DETAIL: ProjectDetail = {
  project: PROJECT, description: '<p>What it is.</p><img src="x" onerror="steal()">', issues: ISSUES, updates: [LATEST, FIRST],
  comments: [], cycles: [], teams: [DEMO_TEAM, AIML], users: [DANA, SAM], releases: [PI4],
};
const INITIATIVE_DETAIL: InitiativeDetail = { initiative: INITIATIVE, description: "", projects: [PROJECT], updates: [], comments: [] };

async function start({ priority = false, detail = DETAIL as unknown, tab = "overview" as ProjectTab } = {}) {
  const fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML], project_priority: priority }),
    "GET /api/projects/F205": detail,
    "GET /api/initiatives/251": INITIATIVE_DETAIL,
    "PATCH /api/projects/F205": { ...PROJECT, priority: 2 },
  });
  await appStore.getState().load();
  render(<ProjectPage projectKey="F205" tab={tab} />);
  return fetchMock;
}
const overview = () => screen.findByRole("region", { name: "Overview" });
const sidebar = () => screen.getByRole("complementary", { name: "Feature details" });
/** Each breakdown row's text after its avatar or icon. */
const rowTexts = (panel: HTMLElement) => within(within(panel).getByRole("tabpanel")).getAllByRole("listitem")
  .map((li) => [...li.children].slice(1).map((c) => c.textContent).join(""));

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

test("the header shows the cube, the name and Copy page URL; the tabs are Overview, Activity, Stories", async () => {
  await start();
  await overview();
  const title = screen.getByRole("heading", { level: 1 });
  expect(title).toHaveTextContent("[DEMO] Linear-style Rally client");
  expect(title.querySelector("svg")).not.toBeNull(); // the cube
  expect(screen.getByRole("button", { name: "Copy page URL" })).toBeInTheDocument();
  const tabs = within(screen.getByRole("tablist", { name: "Feature" })).getAllByRole("tab");
  expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Activity", "Stories"]);
  expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  fireEvent.click(tabs[1]);
  expect(uiStore.getState().route).toEqual({ name: "project", key: "F205", tab: "activity" });
});

test("the main column is the tile, the name, Properties, Initiatives, the latest update and Description, in that order", async () => {
  await start({ priority: true });
  const main = await overview();
  await within(main).findByText("[DEMO] Agentic Platform");
  const parts = [...main.querySelectorAll("[data-section]")].map((e) => e.getAttribute("data-section"));
  expect(parts).toEqual(["icon-tile", "name", "properties", "initiatives", "latest-update", "description"]);
  expect(within(main).getByRole("heading", { level: 2 })).toHaveTextContent("[DEMO] Linear-style Rally client");
  const props = main.querySelector('[data-section="properties"]') as HTMLElement;
  // Status (the Rally state's name), priority (the flag is on), lead, start → target, teams (ruling 13).
  expect([...props.querySelectorAll("[data-prop]")].map((e) => e.getAttribute("data-prop"))).toEqual(
    ["status", "priority", "lead", "dates", "teams"]);
  expect(props).toHaveTextContent("Current PI");
  expect(props).toHaveTextContent("No priority");
  expect(props).toHaveTextContent("Dana Demo");
  const dates = props.querySelector('[data-prop="dates"]') as HTMLElement;
  expect(dates).toHaveTextContent("Sep 10th, '26Dec 31st, '26");
  expect(within(dates).getByRole("img", { name: "to" })).toBeInTheDocument();
  expect(props).toHaveTextContent("Data Services, AI/ML Solutions");
  expect(within(main).queryByText(/Resources|Milestones/)).toBeNull();
  expect(screen.queryByText(/Add document or link|Milestone/)).toBeNull();
});

test("without the priority field the Properties row and the sidebar have no priority", async () => {
  await start();
  const main = await overview();
  const props = main.querySelector('[data-section="properties"]') as HTMLElement;
  expect([...props.querySelectorAll("[data-prop]")].map((e) => e.getAttribute("data-prop"))).toEqual(["status", "lead", "dates", "teams"]);
  expect(screen.queryByText("No priority")).toBeNull();
  const panel = within(sidebar()).getByRole("region", { name: "Properties" });
  expect(within(panel).queryByText("Priority")).toBeNull();
});

test("the priority pill opens the priority menu, checks the current value and sets it on the project", async () => {
  const fetchMock = await start({ priority: true });
  const main = await overview();
  fireEvent.click(within(main).getByRole("button", { name: "Change priority" }));
  const menu = screen.getByRole("menu", { name: "Change priority" });
  const items = within(menu).getAllByRole("menuitemcheckbox");
  expect(items.map((i) => i.getAttribute("aria-label"))).toEqual(["No priority", "Urgent", "High", "Medium", "Low"]);
  expect(items[0]).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(within(menu).getByRole("textbox"), { key: "2" });
  expect(appStore.getState().projects[205].priority).toBe(2);
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/api/projects/F205") && init?.method === "PATCH")).toBe(true));
});

test("the sidebar is Properties, Progress and Activity, with Linear's rows and breakdown tabs", async () => {
  await start({ priority: true });
  await overview();
  const side = sidebar();
  const panels = within(side).getAllByRole("region");
  expect(panels.map((p) => p.getAttribute("aria-label"))).toEqual(["Properties", "Progress", "Activity"]);
  const labels = [...panels[0].querySelectorAll("[data-row]")].map((e) => e.getAttribute("data-row"));
  expect(labels).toEqual(["Status", "Priority", "Lead", "Dates", "Teams", "Capabilities", "PI", "Labels"]);
  const row = (name: string) => panels[0].querySelector(`[data-row="${name}"]`) as HTMLElement;
  expect(row("Status")).toHaveTextContent("Current PI");
  expect(row("Dates")).toHaveTextContent("Sep 10thDec 31st");
  expect(within(row("Dates")).getByRole("img", { name: "to" })).toBeInTheDocument();
  expect(row("Teams")).toHaveTextContent("Data Services, AI/ML Solutions");
  await vi.waitFor(() => expect(row("Capabilities")).toHaveTextContent("[DEMO] Agentic Platform"));
  expect(row("PI")).toHaveTextContent("PI 4");
  expect(row("Labels")).toHaveTextContent("collabathon-demo");
  // Progress: the legend in points (10 in scope, 5 started, 3 done), then Assignees, Labels and Teams over the project's issues.
  expect(within(panels[1]).getByText("Scope").nextElementSibling).toHaveTextContent("10");
  expect(within(panels[1]).getByText("Started").nextElementSibling).toHaveTextContent("5");
  expect(within(panels[1]).getByText("Completed").nextElementSibling).toHaveTextContent("3");
  const tabs = within(panels[1]).getAllByRole("tab");
  expect(tabs.map((t) => t.textContent)).toEqual(["Assignees", "Labels", "Teams"]);
  expect(rowTexts(panels[1])).toEqual(
    ["Sam Sample25% of5", "Dana Demo100% of3", "No assignee0% of2"]);
  fireEvent.click(tabs[2]);
  expect(rowTexts(panels[1])).toEqual(
    ["AI/ML Solutions25% of5", "Data Services60% of5"]);
  // Activity: the latest update and the project's creation, with "See all" to the Activity tab.
  expect(panels[2]).toHaveTextContent("Dana Demo posted an update · Oct 16 · View");
  fireEvent.click(within(panels[2]).getByRole("link", { name: "See all" }));
  expect(uiStore.getState().route).toEqual({ name: "project", key: "F205", tab: "activity" });
});

test("the sidebar's Progress draws the 362×200 burn-up with the project's target line", async () => {
  const fetchMock = await start();
  await overview();
  const progress = within(sidebar()).getByRole("region", { name: "Progress" });
  expect(within(progress).getByText("Scope").nextElementSibling).toHaveTextContent("10"); // the legend stays while it loads
  expect(fetchMock).toHaveBeenCalledWith("/api/burnup?project=F205", expect.anything());
  appStore.setState({ burnups: { "project:F205": { start: "2026-09-10", end: "2026-12-31", points: [{ day: "2026-10-19", scope: 10, started: 2, completed: 3 }] } } });
  const chart = await within(progress).findByRole("img", { name: "Burn-up chart" });
  expect(chart).toHaveAttribute("width", "362");
  expect(chart).toHaveAttribute("height", "200");
  expect(chart.querySelector('[data-part="target"]')).toHaveAttribute("stroke", "var(--color-overrun)");
});

test("the update card shows health, author and age, the body sanitized, and what changed since the last update", async () => {
  await start();
  const main = await overview();
  const card = main.querySelector('[data-section="latest-update"]') as HTMLElement;
  expect(within(card).getByRole("button", { name: /Latest update/ })).toHaveAttribute("aria-expanded", "true");
  expect(card).toHaveTextContent("On track");
  expect(card).toHaveTextContent("Dana Demo");
  const age = within(card).getByText("3d ago");
  expect(age).toHaveAttribute("title", expect.stringContaining("Oct 16"));
  expect(card).toHaveTextContent("First group is onboarding.");
  expect(card).toHaveTextContent("Runbook drafted.");
  expect(card.querySelector("script")).toBeNull();
  expect(card.querySelector("[onclick]")).toBeNull();
  const rows = [...card.querySelectorAll("[data-diff]")].map((r) => r.textContent);
  expect(rows).toEqual(["Target datemoved from Dec 1st to Jan 1st, 2027", "Progress since Oct 937% → 52%"]);
  // "Update" opens the Activity tab, where the composer is (Task 14).
  fireEvent.click(within(card).getByRole("button", { name: "Update" }));
  expect(uiStore.getState().route).toEqual({ name: "project", key: "F205", tab: "activity" });
});

test("the diff skips an earlier update whose footer Rally rewrote, comparing with the one before it", async () => {
  const rewritten: Update = { ...FIRST, id: 803, created_at: "2026-10-12T12:00:00.000Z", progress: null, target: null };
  await start({ detail: { ...DETAIL, updates: [LATEST, rewritten, FIRST] } });
  const main = await overview();
  const card = main.querySelector('[data-section="latest-update"]') as HTMLElement;
  expect([...card.querySelectorAll("[data-diff]")].map((r) => r.textContent)).toEqual(
    ["Target datemoved from Dec 1st to Jan 1st, 2027", "Progress since Oct 937% → 52%"]);
});

test("the latest update collapses from its header", async () => {
  await start();
  const main = await overview();
  const card = main.querySelector('[data-section="latest-update"]') as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /Latest update/ }));
  expect(card).not.toHaveTextContent("First group is onboarding.");
  expect(within(card).getByRole("button", { name: /Latest update/ })).toHaveAttribute("aria-expanded", "false");
});

test("the description is sanitized", async () => {
  await start();
  const main = await overview();
  const description = main.querySelector('[data-section="description"]') as HTMLElement;
  expect(within(description).getByRole("heading", { level: 3 })).toHaveTextContent("Description");
  expect(description).toHaveTextContent("What it is.");
  expect(description.querySelector("[onerror]")).toBeNull();
});

test("a project with no update, initiative or description leaves those out", async () => {
  const bare = makeProject({ ...PROJECT, initiative_id: null, latest_update: null, health: null });
  await start({ detail: { ...DETAIL, project: bare, updates: [], description: "" } });
  const main = await overview();
  const parts = [...main.querySelectorAll("[data-section]")].map((e) => e.getAttribute("data-section"));
  expect(parts).toEqual(["icon-tile", "name", "properties", "description"]);
  expect(within(main.querySelector('[data-section="description"]') as HTMLElement).getByText("No description")).toBeInTheDocument();
});

test("a 404 says so, with a link back to Features", async () => {
  await start({ detail: [404, { error: "not found" }] });
  expect(await screen.findByText("Couldn't find this feature.")).toBeInTheDocument();
  const back = screen.getByRole("link", { name: "Back to Features" });
  expect(back).toHaveAttribute("href", "/projects");
  fireEvent.click(back);
  expect(uiStore.getState().route).toEqual({ name: "projects" });
});

test("the sidebar toggle closes and reopens the project details", async () => {
  await start();
  await overview();
  fireEvent.click(screen.getByRole("button", { name: "Close feature details" }));
  expect(screen.queryByRole("complementary", { name: "Feature details" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open feature details" }));
  expect(sidebar()).toBeInTheDocument();
});

test("Activity shows the composer, Update selected, over the feed; the sidebar stays", async () => {
  await start({ tab: "activity" });
  const form = await screen.findByRole("form", { name: "Feature update" });
  expect(within(form).getByRole("tab", { name: "Update" })).toHaveAttribute("aria-selected", "true");
  // The health chip defaults to the latest update's (On track).
  expect(within(form).getByRole("button", { name: "Set feature health" })).toHaveTextContent("On track");
  const feed = screen.getByRole("list", { name: "Activity" });
  await vi.waitFor(() => expect([...feed.children].map((li) => li.getAttribute("data-item"))).toEqual(["update:802", "update:801", "created"]));
  expect(feed.querySelector('[data-item="created"]')).toHaveTextContent("Dana Demo created the feature · Sep 1");
  expect(sidebar()).toBeInTheDocument();
});

test("Issues is the issue view scoped to the project, grouped by status, rows with the cycle chip and not the project's", async () => {
  await start({ tab: "issues" });
  const list = await screen.findByRole("listbox", { name: "[DEMO] Linear-style Rally client" });
  // Status groups in Linear's order; the other teams' issue (1102) is in.
  expect(screen.getAllByRole("region").map((g) => g.getAttribute("aria-label")).filter((l) => ["In Progress", "Todo", "Done"].includes(l!)))
    .toEqual(["In Progress", "Todo", "Done"]);
  const rows = within(list).getAllByRole("option");
  expect(rows.map((r) => r.getAttribute("data-issue-id")).sort()).toEqual(["1101", "1102", "1103"]);
  const row = rows.find((r) => r.getAttribute("data-issue-id") === "1103")!;
  expect(row).toHaveTextContent("Sprint 3");
  expect(row).not.toHaveTextContent("[DEMO] Linear-style Rally client");
  // The header row: the tabs, then Filter, Display and the side-panel toggle; the sidebar stays open beside the list.
  expect(within(screen.getByRole("tablist", { name: "Feature" })).getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Add filter" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Display options" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close feature details" })).toBeInTheDocument();
  expect(sidebar()).toBeInTheDocument();
});

test("the Overview tab and its sidebar read in Rally's words", async () => {
  await start();
  const main = await overview();
  expect(within(main).getByText("Capabilities")).toBeInTheDocument();
  expect(within(sidebar()).getByText("Capabilities")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close feature details" })).toBeInTheDocument();
  expect(screen.getByRole("tablist", { name: "Feature" })).toBeInTheDocument();
  expect(within(sidebar()).getByText(/created the feature/)).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the Activity tab's page and sidebar read in Rally's words", async () => {
  await start({ tab: "activity" });
  await screen.findByRole("form", { name: "Feature update" }); // the composer: proof the Activity tab rendered
  const feed = screen.getByRole("list", { name: "Activity" });
  await vi.waitFor(() => expect(feed.querySelectorAll("[data-item]")).toHaveLength(3));
  expect(screen.getByRole("complementary", { name: "Feature details" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the Stories tab, its list and the sidebar read in Rally's words", async () => {
  await start({ tab: "issues" });
  await screen.findByRole("listbox", { name: "[DEMO] Linear-style Rally client" });
  expect(screen.getByRole("tab", { name: "Stories" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("complementary", { name: "Feature details" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the Stories tab's empty and error states", async () => {
  await start({ tab: "issues", detail: { ...DETAIL, issues: [] } });
  expect(await screen.findByText("No stories in this feature.")).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("a feature that can't be found, and a failed load, read in Rally's words", async () => {
  await start({ detail: [404, { error: "not found" }] });
  expect(await screen.findByText("Couldn't find this feature.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to Features" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

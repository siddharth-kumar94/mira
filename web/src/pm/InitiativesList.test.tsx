import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { InitiativeList } from "../api/types";
import { formatRoute } from "../route";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { AIML, DANA, DEMO_TEAM, makeBootstrap, makeInitiative, makeProject, serve } from "../test/fixtures";
import { InitiativesList } from "./InitiativesList";

const PLATFORM = makeInitiative({
  id: 251, key: "C251", name: "Agentic Platform", summary: "Capability-level notes (Rally Capability).", status: "active", rank: "a",
  project_count: 3, project_health: ["on_track", "at_risk", "no_target"], group_id: 271, group_name: "Run Outcome",
  health: { value: "at_risk", source: "update", reason: "" },
  latest_update: { id: 1, author: DANA, health: "at_risk", html: "", created_at: "2026-10-16T12:00:00.000Z", progress: null, target: null },
});
const METRICS = makeInitiative({ id: 252, key: "C252", name: "V2.6 Metrics", summary: "", status: "planned", rank: "b", project_count: 1,
  project_health: ["off_track"], group_id: null, group_name: null });
const GRAPH = makeInitiative({ id: 253, key: "C253", name: "Graph Platform", status: "completed", rank: "c", project_count: 0, group_id: null,
  group_name: null, health: { value: "no_target", source: "auto", reason: "" } });
const CHILDREN = [
  makeProject({ id: 11, initiative_id: 251, status_category: "started" }), makeProject({ id: 12, initiative_id: 251, status_category: "started" }),
  makeProject({ id: 13, initiative_id: 251, status_category: "planned" }), makeProject({ id: 14, initiative_id: 252, status_category: "completed" }),
];
const LIST: InitiativeList = { initiatives: [PLATFORM, METRICS, GRAPH], projects: CHILDREN };

async function start({ priority = true }: { priority?: boolean } = {}) {
  const fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML], projects: [], initiative_priority: priority }),
    "GET /api/initiatives": LIST,
  });
  await appStore.getState().load();
  return fetchMock;
}
const row = (name: string) => screen.findByRole("link", { name: new RegExp(name) });
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
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

test("Capabilities: the tabs Active, Planned, All capabilities, then Display; no New capability (D23); the sidebar teams' capabilities", async () => {
  const fetchMock = await start();
  const { container } = render(<InitiativesList />);
  await row("Agentic");
  expectRallyWords(container); // after a real row rendered: the title, tabs, chips and Display button
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Capabilities$/);
  expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Active", "Planned", "All capabilities"]);
  expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("button", { name: /New capability/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Display options" })).toBeInTheDocument();
  expect(fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/api/initiatives"))).toContain("teams=9001,9002");
});

test("the tabs filter by status: Active, Planned, then everything", async () => {
  await start();
  render(<InitiativesList />);
  await row("Agentic");
  const names = () => screen.queryAllByRole("link").map((l) => l.querySelector("[data-part=name]")?.textContent);
  expect(names()).toEqual(["Agentic Platform"]);
  tab("Planned");
  expect(names()).toEqual(["V2.6 Metrics"]);
  tab("All capabilities");
  expect(names()).toEqual(["Agentic Platform", "V2.6 Metrics", "Graph Platform"]);
});

test("the columns are Linear's, with Priority only when the field exists (Review Focus 5)", async () => {
  await start();
  const { unmount } = render(<InitiativesList />);
  await row("Agentic");
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent))
    .toEqual(["Name", "Status", "Priority", "Owner", "Target", "Features", "Health", "Active features"]);
  unmount();
  appStore.setState(appStore.getInitialState(), true);
  await start({ priority: false });
  render(<InitiativesList />);
  const r = await row("Agentic");
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent))
    .toEqual(["Name", "Status", "Owner", "Target", "Features", "Health", "Active features"]);
  expect(r.querySelector('[data-col="priority"]')).toBeNull();
  expect(within(openDisplay()).queryByRole("button", { name: "Priority" })).toBeNull();
});

test("a row: the glyph, the name over a one-line description, status, owner, target, n / total, health, one pill per health", async () => {
  await start();
  const { container } = render(<InitiativesList />);
  const r = await row("Agentic");
  expectRallyWords(container); // rows, pills and the exact aria strings below
  expect(r).toHaveAttribute("href", "/initiative/C251");
  const cell = (c: string) => r.querySelector(`[data-col="${c}"]`) as HTMLElement;
  expect([...r.querySelectorAll("[data-col]")].map((c) => c.getAttribute("data-col")))
    .toEqual(["name", "status", "priority", "owner", "target", "projects", "health", "active"]);
  expect(cell("name").querySelector("[data-part=glyph] svg")).not.toBeNull();
  expect(cell("name").querySelector("[data-part=name]")).toHaveTextContent("Agentic Platform");
  expect(cell("name").querySelector("[data-part=description]")).toHaveTextContent("Capability-level notes (Rally Capability).");
  expect(cell("status")).toHaveTextContent("Active");
  expect(within(cell("owner")).getByLabelText("Dana Demo")).toBeInTheDocument();
  expect(cell("target")).toHaveTextContent("Dec 31st");
  const projects = within(cell("projects")).getByRole("button", { name: "0 of 3 features completed. Click to view features." });
  expect(projects.textContent).toBe("0\u00a0/\u00a03"); // no-break spaces, as Linear's
  expect(within(cell("health")).getByRole("button", { name: "At risk, last update 3 days ago" })).toBeInTheDocument();
  const pills = within(cell("active")).getAllByRole("button");
  expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual([
    "1 feature on track. Click to open updates.", "1 feature at risk. Click to open updates."]);
  expect(pills.map((p) => p.textContent)).toEqual(["1", "1"]);
});

test("one feature, plural counts, and a capability without features reads a bare 0", async () => {
  await start();
  const { container } = render(<InitiativesList />);
  await row("Agentic");
  tab("All capabilities");
  const metrics = await row("Metrics");
  expect(within(metrics).getByRole("button", { name: "1 of 1 feature completed. Click to view features." }).textContent).toBe("1\u00a0/\u00a01");
  expect(within(metrics).getByRole("button", { name: "1 feature off track. Click to open updates." })).toBeInTheDocument();
  expect(metrics.querySelector("[data-part=description]")).toBeNull(); // no description, no second line
  const graph = await row("Graph");
  expect(within(graph).getByRole("button", { name: "0 of 0 features completed. Click to view features." })).toHaveTextContent(/^0$/);
  expect(within(graph).getByRole("button", { name: "There are no updates for this capability" })).toBeInTheDocument();
  expect(within(graph.querySelector('[data-col="active"]') as HTMLElement).queryAllByRole("button")).toHaveLength(0);
  expectRallyWords(container);
});

test("the row opens the capability; the features count opens its Features tab; health and the health pills its updates", async () => {
  await start();
  render(<InitiativesList />);
  const r = await row("Agentic");
  fireEvent.click(within(r).getByRole("button", { name: /features completed/ }));
  expect(formatRoute(uiStore.getState().route)).toBe("/initiative/C251/projects");
  fireEvent.click(within(r).getByRole("button", { name: "1 feature on track. Click to open updates." }));
  expect(formatRoute(uiStore.getState().route)).toBe("/initiative/C251/activity");
  uiStore.getState().navigate({ name: "initiatives" });
  fireEvent.click(within(r).getByRole("button", { name: "At risk, last update 3 days ago" }));
  expect(formatRoute(uiStore.getState().route)).toBe("/initiative/C251/activity");
  fireEvent.click(r);
  expect(formatRoute(uiStore.getState().route)).toBe("/initiative/C251");
});

test("no grouping by default; grouping by Outcome shows the outcome headers, saved under mira-pm:v1:initiatives", async () => {
  await start();
  render(<InitiativesList />);
  await row("Agentic");
  tab("All capabilities");
  expect(screen.queryAllByRole("region")).toHaveLength(0);
  const menu = openDisplay();
  expect(within(menu).queryAllByRole("tab")).toHaveLength(0); // no layout tabs
  expect(within(menu).getByRole("button", { name: "Grouping: No grouping" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Ordering: Manual" })).toBeInTheDocument();
  fireEvent.click(within(menu).getByRole("button", { name: "Grouping: No grouping" }));
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent)).toEqual(
    ["No grouping", "Outcome", "Initiative", "Status", "Owner", "Priority"]);
  expectRallyWords(document.body, { allow: ["initiative"] }); // the open Grouping menu (its Initiative option) and the Display popover
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Outcome" }));
  expect(screen.getAllByRole("region").map((g) => g.getAttribute("aria-label"))).toEqual(["Run Outcome", "No outcome"]);
  expect(within(screen.getByRole("region", { name: "No outcome" })).getAllByRole("link")).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem("mira-pm:v1:initiatives")!).groupBy).toBe("outcome");
});

test("without the priority field the Grouping menu reads No grouping, Outcome, Initiative, Status, Owner", async () => {
  await start({ priority: false });
  render(<InitiativesList />);
  await row("Agentic");
  fireEvent.click(within(openDisplay()).getByRole("button", { name: "Grouping: No grouping" }));
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent)).toEqual(["No grouping", "Outcome", "Initiative", "Status", "Owner"]);
});

const NORTH = { parent_group_id: 281, parent_group_name: "North Program" };
async function groupedByInitiative() {
  serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML], projects: [], initiative_priority: false }),
    "GET /api/initiatives": { ...LIST, initiatives: [{ ...PLATFORM, ...NORTH }, { ...METRICS, parent_group_id: 282, parent_group_name: "Alpha Program" },
      { ...GRAPH, parent_group_id: null, parent_group_name: null }] },
  });
  await appStore.getState().load();
  const view = render(<InitiativesList />);
  await row("Agentic");
  tab("All capabilities");
  fireEvent.click(within(openDisplay()).getByRole("button", { name: "Grouping: No grouping" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Initiative" }));
  expect(screen.getAllByRole("region").map((g) => g.getAttribute("aria-label"))).toEqual(["Alpha Program", "North Program", "No initiative"]);
  return view;
}

/** The group header's mark (the glyph between the caret and the name), "" when it has none. */
const mark = (name: string) => {
  const before = screen.getByRole("region", { name }).querySelector("h3")!.previousElementSibling!;
  return before.tagName === "BUTTON" ? "" : before.outerHTML;
};

test("grouping by Initiative: the outcome's parent's headers by name, No initiative last, the Outcome grouping's glyph", async () => {
  const { container } = await groupedByInitiative();
  expect(within(screen.getByRole("region", { name: "North Program" })).getByRole("link", { name: /Agentic/ })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "No initiative" })).getAllByRole("link")).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem("mira-pm:v1:initiatives")!).groupBy).toBe("initiative");
  expectRallyWords(container, { allow: ["initiative"] }); // the headers and rows just asserted
  const initiativeMark = mark("North Program");
  expect(initiativeMark).not.toBe("");
  expect(mark("No initiative")).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Grouping: Initiative" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Outcome" }));
  expect(mark("Run Outcome")).toBe(initiativeMark);
});

test("Initiative shows only as this grouping: the same screen fails the scan without allowing it", async () => {
  await groupedByInitiative();
  expect(screen.getByRole("region", { name: "No initiative" })).toBeInTheDocument();
  expect(() => expectRallyWords(document.body)).toThrow(/Initiative/);
  expectRallyWords(document.body, { allow: ["initiative"] });
});

test("Display: Linear's properties, Reset only once changed; hiding a property drops its column", async () => {
  await start();
  render(<InitiativesList />);
  await row("Agentic");
  const display = screen.getByRole("button", { name: "Display options" });
  const menu = openDisplay();
  expect(display.className).toContain("bg-pill-on");
  const pills = within(within(menu).getByRole("group", { name: "Display properties" })).getAllByRole("button");
  expect(pills.map((p) => p.textContent)).toEqual(["ID", "Description", "Owner", "Status", "Priority", "Health", "Features", "Active features",
    "Target date", "Updated"]);
  expect(pills.filter((p) => p.getAttribute("aria-pressed") === "true").map((p) => p.textContent))
    .toEqual(["Description", "Owner", "Status", "Priority", "Health", "Features", "Active features", "Target date"]);
  expect(within(menu).queryByRole("button", { name: "Reset to view default" })).toBeNull();
  expectRallyWords(document.body); // the Display popover, its property pills just asserted
  expect(display.querySelector("[data-dot]")).toBeNull();
  fireEvent.click(within(menu).getByRole("button", { name: "Owner" }));
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("Owner");
  fireEvent.click(within(menu).getByRole("button", { name: "Description" }));
  expect(screen.getByRole("link", { name: /Agentic/ }).querySelector("[data-part=description]")).toBeNull();
  expect(display.querySelector("[data-dot]")).not.toBeNull();
  fireEvent.click(within(menu).getByRole("button", { name: "Reset to view default" }));
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Owner");
  expect(within(menu).queryByRole("button", { name: "Reset to view default" })).toBeNull();
});

test("ordering by Target date reorders the rows", async () => {
  await start();
  render(<InitiativesList />);
  await row("Agentic");
  tab("All capabilities");
  const menu = openDisplay();
  fireEvent.click(within(menu).getByRole("button", { name: "Ordering: Manual" }));
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent)).toEqual(["Manual", "Priority", "Target date", "Last updated"]);
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Last updated" }));
  expect(JSON.parse(localStorage.getItem("mira-pm:v1:initiatives")!).orderBy).toBe("updated");
});

test("loading, error with Retry, and an empty tab", async () => {
  serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML] }),
    "GET /api/initiatives": [500, { error: "boom" }],
  });
  await appStore.getState().load();
  render(<InitiativesList />);
  expect(screen.getByText("Loading capabilities…")).toBeInTheDocument();
  expect(await screen.findByText(/Couldn't load capabilities/)).toBeInTheDocument();
  expectRallyWords(document.body); // the error sentence and its Retry are real content
  serve({ "GET /api/initiatives": { initiatives: [GRAPH], projects: [] } });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No active capabilities.")).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("Add filter sits left of Display, with no Open sidebar; its fields are Status, Priority (with the field), Owner, Health, Outcome", async () => {
  await start();
  const { unmount } = render(<InitiativesList />);
  await row("Agentic");
  const tools = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter((l) => l === "Add filter" || l === "Display options" || l === "Open sidebar");
  expect(tools).toEqual(["Add filter", "Display options"]);
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  expect(screen.getByRole("button", { name: "Add filter" }).className).toContain("bg-pill-on");
  expect(within(screen.getByRole("menu", { name: "Filter" })).getAllByRole("menuitem").map((i) => i.getAttribute("aria-label")))
    .toEqual(["Status", "Priority", "Owner", "Health", "Outcome"]);
  expectRallyWords(document.body);
  unmount();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  await start({ priority: false });
  render(<InitiativesList />);
  await row("Agentic");
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  expect(within(screen.getByRole("menu", { name: "Filter" })).getAllByRole("menuitem").map((i) => i.getAttribute("aria-label")))
    .toEqual(["Status", "Owner", "Health", "Outcome"]);
});

test("a filter narrows the rows and shows as a removable chip in the tabs row", async () => {
  await start();
  render(<InitiativesList />);
  await row("Agentic");
  tab("All capabilities");
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  fireEvent.mouseEnter(within(screen.getByRole("menu", { name: "Filter" })).getByRole("menuitem", { name: "Outcome" }));
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.getAttribute("aria-label") ?? m.textContent)).toEqual([
    expect.stringContaining("Run Outcome"), expect.stringContaining("No outcome")]);
  expectRallyWords(document.body); // the Outcome value menu with its counts
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent).join()).toMatch(/2 capabilities|1 capability/);
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /No outcome/ }));
  const names = () => screen.queryAllByRole("link").map((l) => l.querySelector("[data-part=name]")?.textContent);
  expect(names()).toEqual(["V2.6 Metrics", "Graph Platform"]);
  expect(screen.getByText("Outcome is No outcome")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear Outcome filter" }));
  expect(names()).toEqual(["Agentic Platform", "V2.6 Metrics", "Graph Platform"]);
});

test("the Filter menu's value counts and chips read capabilities, and the empty states read in Rally's words", async () => {
  await start();
  const { container } = render(<InitiativesList />);
  await row("Agentic");
  tab("All capabilities");
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  fireEvent.mouseEnter(within(screen.getByRole("menu", { name: "Filter" })).getByRole("menuitem", { name: "Status" }));
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => m.textContent).join()).toContain("1 capability");
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Completed/ }));
  expect(await screen.findByText("Status is Completed")).toBeInTheDocument();
  tab("Active"); // no active capability is completed
  expect(await screen.findByText("No capabilities match this view.")).toBeInTheDocument();
  expectRallyWords(container);
});

test("Join a team: a user with no teams is told to join one in Rally's words", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [] }) });
  await appStore.getState().load();
  const { container } = render(<InitiativesList />);
  expect(await screen.findByText("Join a team to see its capabilities.")).toBeInTheDocument();
  expectRallyWords(container);
});

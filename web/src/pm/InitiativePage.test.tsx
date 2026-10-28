import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { InitiativeDetail, ProjectList, Update } from "../api/types";
import type { InitiativeTab } from "../route";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { AIML, DANA, DEMO_TEAM, SAM, makeBootstrap, makeInitiative, makeProject, serve } from "../test/fixtures";
import { InitiativePage } from "./InitiativePage";

const LATEST: Update = {
  id: 902, author: DANA, health: "at_risk", created_at: "2026-10-16T12:00:00.000Z", progress: null, target: null,
  html: "<p>Alfred on track; TNM staging at risk.</p><script>alert(1)</script>",
};
const auto = (value: "at_risk" | "off_track" | "on_track") => ({ value, source: "auto" as const, reason: "" });
const reported = (value: "at_risk" | "off_track" | "on_track") => ({ value, source: "update" as const, reason: "" });
// Two active projects worse than on track, one on track, one completed at risk (not active), one planned off track.
const TNM = makeProject({ id: 211, key: "F211", name: "[DEMO] TNM Staging", status_category: "started", health: reported("at_risk"), lead: SAM, rank: "a" });
const ALFRED = makeProject({ id: 212, key: "F212", name: "[DEMO] Alfred", status_category: "started", health: reported("on_track"), rank: "b" });
const PORTAL = makeProject({ id: 213, key: "F213", name: "[DEMO] Portal", status_category: "started", health: auto("off_track"), rank: "c" });
const DONE = makeProject({ id: 214, key: "F214", name: "[DEMO] Shipped", status_category: "completed", health: reported("at_risk"), rank: "d",
  completed_at: "2026-10-10T10:00:00.000Z" });
const LATER = makeProject({ id: 215, key: "F215", name: "[DEMO] Later", status_category: "planned", health: reported("off_track"), rank: "e" });
const PROJECTS = [TNM, ALFRED, PORTAL, DONE, LATER].map((p) => ({ ...p, initiative_id: 251 }));
const INITIATIVE = makeInitiative({
  id: 251, key: "C251", name: "[DEMO] Agentic Platform", status: "active", status_name: "Developing", owner: DANA, target: "2026-12-31",
  project_count: 5, health: reported("at_risk"), latest_update: LATEST, summary: "Capability notes",
});
const DETAIL: InitiativeDetail = {
  initiative: INITIATIVE, description: '<p>What it is.</p><img src="x" onerror="steal()">', projects: PROJECTS, updates: [LATEST], comments: [],
};
const NO_UPDATE: InitiativeDetail = {
  ...DETAIL, initiative: { ...INITIATIVE, latest_update: null, health: { value: "off_track", source: "auto", reason: "Worst of 3 active features" } },
  updates: [],
};
const LIST: ProjectList = { projects: PROJECTS, initiatives: [], teams: [AIML] };

async function start({ priority = false, detail = DETAIL as unknown, tab = "overview" as InitiativeTab } = {}) {
  const fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM, AIML], projects: [], initiative_priority: priority, project_priority: priority }),
    "GET /api/initiatives/C251": detail,
    "GET /api/projects": LIST,
    "PATCH /api/initiatives/C251": { ...INITIATIVE, priority: 2 },
  });
  await appStore.getState().load();
  render(<InitiativePage initiativeKey="C251" tab={tab} />);
  return fetchMock;
}
const overview = () => screen.findByRole("region", { name: "Overview" });
const section = (main: HTMLElement, name: string) => main.querySelector(`[data-section="${name}"]`) as HTMLElement;

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

test("the header shows the glyph, the name and Copy page URL; the tabs are Overview, Activity, Features", async () => {
  await start();
  await overview();
  const title = screen.getByRole("heading", { level: 1 });
  expect(title).toHaveTextContent("[DEMO] Agentic Platform");
  expect(title.querySelector("svg")).not.toBeNull(); // the initiative glyph
  expect(screen.getByRole("button", { name: "Copy page URL" })).toBeInTheDocument();
  const tabs = within(screen.getByRole("tablist", { name: "Capability" })).getAllByRole("tab");
  expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Activity", "Features"]);
  expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  fireEvent.click(tabs[2]);
  expect(uiStore.getState().route).toEqual({ name: "initiative", key: "C251", tab: "projects" });
});

test("the details panel is closed: no side panel, and the content is the 805 column centred", async () => {
  await start();
  const column = (await overview()).querySelector("[data-column]") as HTMLElement;
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(column.className).toContain("w-(--size-content)");
  expect(column.className).toContain("mx-auto");
});

test("the overview is the tile, the name, Properties, the latest update, Description and the features list, in order", async () => {
  await start({ priority: true });
  const main = await overview();
  await within(main).findByText("Alfred on track; TNM staging at risk.");
  const parts = [...main.querySelectorAll("[data-section]")].map((e) => e.getAttribute("data-section"));
  expect(parts).toEqual(["icon-tile", "name", "properties", "latest-update", "description", "projects"]);
  expect(within(main).getByRole("heading", { level: 2 })).toHaveTextContent("[DEMO] Agentic Platform");
  expect(section(main, "name").tagName).toBe("H2");
  // No summary line: it would repeat the description (Rally has no summary field).
  expect(within(main).queryByText("Capability notes")).toBeNull();
  const props = section(main, "properties");
  expect([...props.querySelectorAll("[data-prop]")].map((e) => e.getAttribute("data-prop"))).toEqual(["status", "priority", "owner", "target"]);
  expect(props.querySelector('[data-prop="status"]')).toHaveTextContent("Active");
  expect(props.querySelector('[data-prop="owner"]')).toHaveTextContent("Dana Demo");
  expect(props.querySelector('[data-prop="target"]')).toHaveTextContent("Dec 31st");
  const description = section(main, "description");
  expect(description).toHaveTextContent("What it is.");
  expect(description.querySelector("img")?.getAttribute("onerror")).toBeNull(); // sanitized
  await within(main).findByRole("group", { name: "[DEMO] Agentic Platform features" }); // the embedded list rendered
  expectRallyWords(document.body);
});

test("without the priority field the Properties row has no priority (D38)", async () => {
  await start({ priority: false });
  const main = await overview();
  const props = section(main, "properties");
  expect([...props.querySelectorAll("[data-prop]")].map((e) => e.getAttribute("data-prop"))).toEqual(["status", "owner", "target"]);
  expect(within(main).queryByRole("button", { name: "Change priority" })).toBeNull();
});

test("the priority pill sets the capability's priority through setPmPriority", async () => {
  const fetchMock = await start({ priority: true });
  const main = await overview();
  fireEvent.click(within(section(main, "properties")).getByRole("button", { name: "Change priority" }));
  const menu = screen.getByRole("menu", { name: "Change priority" });
  fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "High" }));
  expect(appStore.getState().initiatives[251].priority).toBe(2);
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/api/initiatives/C251") && init?.method === "PATCH")).toBe(true));
});

test("the latest update card has a fixed header, the byline, the body and one Features row per active feature worse than on track", async () => {
  await start();
  const main = await overview();
  const card = within(section(main, "latest-update")).getByRole("article", { name: "Capability update" });
  // Linear's initiative card header is an h3, not a collapsible button, with "Update" on its right.
  expect(within(card).getByRole("heading", { level: 3, name: "Latest update" })).toBeInTheDocument();
  expect(within(card).queryByRole("button", { name: /Latest update/ })).toBeNull();
  expect(card).toHaveTextContent("At risk");
  expect(card).toHaveTextContent("3d ago");
  expect(card.querySelector("script")).toBeNull();
  expectRallyWords(card);
  const rows = [...card.querySelectorAll("[data-diff]")].map((r) => r.textContent);
  // "Features" labels the first row only; the rest keep an empty label column, so their values stack under the first.
  expect(rows).toEqual(["Features[DEMO] TNM Staging at risk", "[DEMO] Portal off track"]);
  const labels = [...card.querySelectorAll("[data-diff] > span:first-child")];
  expect(labels.map((l) => [l.textContent, l.className.includes("min-w-[79px]")])).toEqual([["Features", true], ["", true]]);
  const link = within(card).getByRole("link", { name: "[DEMO] TNM Staging" });
  expect(link).toHaveAttribute("href", "/project/F211");
  fireEvent.click(within(card).getByRole("button", { name: "Update" }));
  expect(uiStore.getState().route).toEqual({ name: "initiative", key: "C251", tab: "activity" });
});

test("with no update, health is Auto: the worst of the active features, with Auto in the age slot (D36)", async () => {
  await start({ detail: NO_UPDATE });
  const main = await overview();
  await within(main).findByText("What it is.");
  expect(section(main, "latest-update")).toBeNull();
  const health = section(main, "properties").querySelector('[data-prop="health"]') as HTMLElement;
  const chip = within(health).getByRole("button");
  expect(chip).toHaveTextContent("Off track · Auto");
  expect(chip).toHaveAttribute("title", "Worst of 3 active features");
  expectRallyWords(document.body);
  fireEvent.click(chip);
  expect(uiStore.getState().route).toEqual({ name: "initiative", key: "C251", tab: "activity" });
});

test("the embedded features list is grouped by feature status with Name, Health, Priority, Lead, Target date, Status", async () => {
  await start({ priority: true });
  const main = await overview();
  const projects = section(main, "projects");
  expect(within(projects).getByRole("heading", { level: 3, name: "Features" })).toBeInTheDocument(); // Linear's h3, 18/500
  const list = await within(projects).findByRole("group", { name: "[DEMO] Agentic Platform features" });
  expect(within(list).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
    ["Name", "Health", "Priority", "Lead", "Target date", "Status"]);
  expect(within(list).getAllByRole("region").map((g) => g.getAttribute("aria-label"))).toEqual(["Planned", "In Progress", "Completed"]);
  const started = within(list).getByRole("region", { name: "In Progress" });
  expect(within(started).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/project/F211", "/project/F212", "/project/F213"]);
  // No create or display controls (D23); the Features tab has the full view.
  expect(within(projects).queryByRole("button", { name: /Create new feature|Add a feature/ })).toBeNull();
  expectRallyWords(document.body);
});

test("without the priority field the embedded list has no Priority column", async () => {
  await start({ priority: false });
  const main = await overview();
  const list = await within(section(main, "projects")).findByRole("group", { name: "[DEMO] Agentic Platform features" });
  expect(within(list).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Health", "Lead", "Target date", "Status"]);
});

test("Activity is the shared feed for the capability", async () => {
  await start({ tab: "activity" });
  const feed = await screen.findByRole("region", { name: "Capability activity" });
  expect(within(feed).getByPlaceholderText("Write a capability update…")).toBeInTheDocument();
  expect(feed).toHaveTextContent("Dana Demo created the capability · Jun 20");
  expectRallyWords(document.body);
});

test("Features is the features view scoped to the capability, under the capability's tabs", async () => {
  const fetchMock = await start({ tab: "projects" });
  await screen.findByRole("link", { name: /\[DEMO\] Portal/ });
  expect(fetchMock.mock.calls.some(([u]) => /^\/api\/projects\?.*initiative=251/.test(String(u)))).toBe(true);
  expect(within(screen.getByRole("tablist", { name: "Capability" })).getByRole("tab", { name: "Features" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("tab", { name: "All features" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add filter" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Display options" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("[DEMO] Agentic Platform");
  expectRallyWords(document.body);
});

test("a 404 shows Couldn't find this capability with a link back to Capabilities", async () => {
  await start({ detail: [404, { error: "not found" }] });
  expect(await screen.findByText(/Couldn't find this capability\./)).toBeInTheDocument();
  expectRallyWords(document.body);
  fireEvent.click(screen.getByRole("link", { name: "Back to Capabilities" }));
  expect(uiStore.getState().route).toEqual({ name: "initiatives" });
});

test("a failed read offers Retry", async () => {
  await start({ detail: [500, { error: "boom" }] });
  expect(await screen.findByText(/Couldn't load this capability\./)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

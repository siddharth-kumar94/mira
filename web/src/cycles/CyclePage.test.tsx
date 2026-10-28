import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Cycle, CycleDetail, CycleList, Issue, Team } from "../api/types";
import { appStore, uiStore } from "../store";
import { AIML, DANA, DEMO_TEAM, makeBootstrap, makeIssue, makeProject, serve } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";
import { cycleKey } from "../views/model";
import { CyclePage } from "./CyclePage";

const cycle = (id: number, n: number, start: string, end: string, team_id = 9001): Cycle =>
  ({ id, team_id, name: `PI 4 · Sprint ${n}`, short_name: `Sprint ${n}`, start, end, capacity: null });
const S2 = cycle(309, 2, "2026-10-05T04:00:00.000Z", "2026-10-19T03:59:59.000Z");
const S3 = cycle(310, 3, "2026-10-19T04:00:00.000Z", "2026-11-02T04:59:59.000Z"); // Oct 19 → Nov 1 in New York
const S4 = cycle(311, 4, "2026-11-02T05:00:00.000Z", "2026-11-16T04:59:59.000Z");
const S3_AIML = { ...S3, id: 410, team_id: 9002 };
const ART: Team = { id: 9100, name: "Data Train", level: "art", parent_id: null };

/** Linear's Cycle 1 (inventory-p4 §4.2): 5 issues, 18 points, 7 in flight, 3 done. */
const issue = (id: number, status: Issue["status"], priority: Issue["priority"], estimate: number, over: Partial<Issue> = {}) =>
  makeIssue({ id, key: `US${id}`, title: `[DEMO] Story ${id}`, status, priority, estimate, cycle_id: 310, labels: [], ...over });
const ISSUES = [
  issue(1504, "in_review", 3, 2), issue(1501, "in_progress", 2, 5), issue(1503, "todo", 2, 5), issue(1502, "todo", 3, 3),
  issue(1505, "done", 4, 3, { completed_at: "2026-10-19T15:00:00.000Z" }),
];
const DETAIL: CycleDetail = { cycle: S3, siblings: [S3], issues: ISSUES, projects: [makeProject()], users: [DANA], teams: [DEMO_TEAM] };
const LIST: CycleList = { cycles: [S2, S3, S4], stats: [], has_older: false };

async function start({ detail = DETAIL, teams = [DEMO_TEAM, AIML], teamId = 9001 }: { detail?: CycleDetail; teams?: Team[]; teamId?: number } = {}) {
  serve({
    "GET /api/bootstrap": makeBootstrap({ teams }),
    [`GET /api/teams/${teamId}/cycles/310`]: detail,
    [`GET /api/teams/${teamId}/cycles`]: LIST,
  });
  await appStore.getState().load();
  render(<CyclePage teamId={teamId} cycleId={310} />);
  await screen.findByRole("complementary", { name: "Sprint details" });
  await vi.waitFor(() => expect(appStore.getState().cycleLists[teamId]?.status).toBe("ready"));
}
const panel = () => screen.getByRole("complementary", { name: "Sprint details" });
/** Each breakdown row's text after its avatar or icon. */
const rowTexts = () => within(within(panel()).getByRole("tabpanel")).getAllByRole("listitem")
  .map((li) => [...li.children].slice(1).map((c) => c.textContent).join(""));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z")); // inside Sprint 3
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the breadcrumb is the team, Sprints, then the sprint switcher with Next and Previous sprint first", async () => {
  await start();
  const crumb = screen.getByRole("heading", { level: 1 });
  expect(crumb).toHaveTextContent("Data Services›Sprints›PI 4 · Sprint 3");
  const switcher = within(crumb).getByRole("button", { name: "Open sprint" });
  expect(switcher).toHaveTextContent("PI 4 · Sprint 3");
  expect(switcher.querySelectorAll("svg")).toHaveLength(2); // the cycle icon and the chevron
  expect(within(switcher).getByText("PI 4 · Sprint 3")).toHaveClass("text-small", "font-medium"); // 13/500, measured
  fireEvent.click(switcher);
  const menu = await screen.findByRole("menu", { name: "Switch sprint" });
  // Linear's sections (measured live): "Next sprint (<its state>)", "Previous sprint (<its state>)"; then the team's cycles.
  expect(within(menu).getByText("Next sprint (upcoming)")).toBeInTheDocument();
  expect(within(menu).getByText("Previous sprint (completed)")).toBeInTheDocument();
  const items = within(menu).getAllByRole("menuitem");
  expect(items.map((i) => i.getAttribute("aria-label"))).toEqual(
    ["PI 4 · Sprint 4", "PI 4 · Sprint 2", "PI 4 · Sprint 4", "PI 4 · Sprint 3", "PI 4 · Sprint 2"]);
  expect(items[0]).toHaveTextContent("PI 4 · Sprint 4Nov 2 - Nov 15");
  expect(items[1]).toHaveTextContent("PI 4 · Sprint 2Oct 5 - Oct 18");
  expect(within(menu).queryByText("Go to current sprint")).toBeNull(); // this is the current cycle
  expect(within(menu).queryByRole("textbox")).toBeNull(); // no filter, as in Linear
  fireEvent.click(items[0]);
  expect(uiStore.getState().route).toEqual({ name: "cycle", teamId: 9001, cycleId: 311 });
});

test("the second row counts the cycle's issues, and the list groups them by status without the cycle chip", async () => {
  await start();
  expect(screen.getByText("5 stories")).toBeInTheDocument();
  const list = screen.getByRole("listbox", { name: "PI 4 · Sprint 3" });
  expect(within(list).getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["In Review", "In Progress", "Todo", "Done"]);
  expect(within(list).queryByText("Sprint 3")).toBeNull(); // the cycle property is off in a cycle's view
  expect(within(list).getAllByText("[DEMO] Feature A")).toHaveLength(5);
});

test("the panel: the Current tag and Oct 19 → Nov 1, the cycle's name, and Progress in points", async () => {
  await start();
  const p = panel();
  expect(within(p).getByText("Current")).toBeInTheDocument();
  expect(within(p).getByRole("group", { name: "Oct 19 → Nov 1" })).toHaveTextContent("Oct 19Nov 1");
  expect(within(p).getByRole("heading", { level: 2, name: "PI 4 · Sprint 3" })).toBeInTheDocument();
  const progress = within(p).getByRole("region", { name: "Progress" });
  expect(progress).toHaveTextContent(/Scope18Started7• 39%Completed3• 17%/);
  fireEvent.click(within(p).getByRole("button", { name: "Collapse progress section" }));
  expect(within(p).queryByText("Scope")).toBeNull();
});

test("the panel's burn-up is 402 wide under the legend, and a Lookback failure says \"Burn-up unavailable\" with the legend kept", async () => {
  await start();
  // start() routes no burn-up: the proxy's answer stands in for Lookback failing (ruling 15).
  const progress = within(panel()).getByRole("region", { name: "Progress" });
  expect(await within(progress).findByText("Burn-up unavailable")).toHaveStyle({ width: "402px" });
  expect(progress).toHaveTextContent(/Scope18Started7• 39%Completed3• 17%/);
  expect(fetch).toHaveBeenCalledWith("/api/burnup?team=9001&cycle=310", expect.anything());
});

test("the breakdown tabs are Assignees, Labels, Priority and Features; Priority shows Linear's rows", async () => {
  await start();
  const tabs = within(panel()).getByRole("tablist", { name: "Breakdown" });
  expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Assignees", "Labels", "Priority", "Features"]);
  expect(within(tabs).getByRole("tab", { name: "Assignees" })).toHaveAttribute("aria-selected", "true");
  const rows = rowTexts;
  expect(rows()).toEqual(["Dana Demo26% of18"]);
  fireEvent.click(within(tabs).getByRole("tab", { name: "Priority" }));
  expect(rows()).toEqual(["High13% of10", "Medium10% of5", "Low100% of3"]);
  fireEvent.click(within(tabs).getByRole("tab", { name: "Features" }));
  expect(rows()).toEqual(["[DEMO] Feature A26% of18"]);
});

test("Labels says \"No labels used\" when no issue has one", async () => {
  await start();
  fireEvent.click(within(panel()).getByRole("tab", { name: "Labels" }));
  expect(within(panel()).getByRole("tabpanel")).toHaveTextContent("No labels used");
});

test("an ART's cycle takes in its child teams' copy, and adds the Teams tab", async () => {
  const child = { ...DEMO_TEAM, parent_id: 9100 };
  const sibling = { ...AIML, parent_id: 9100 };
  const theirs = issue(1601, "todo", 2, 4, { team_id: 9002, cycle_id: 410, project_id: 202 });
  await start({
    teamId: 9100, teams: [ART, child, sibling],
    detail: { ...DETAIL, siblings: [S3, S3_AIML], issues: [...ISSUES, theirs], teams: [child, sibling],
              projects: [makeProject(), makeProject({ id: 202, name: "Real feature", team_id: 9002 })] },
  });
  expect(await screen.findByText("6 stories")).toBeInTheDocument();
  const tabs = within(panel()).getByRole("tablist", { name: "Breakdown" });
  expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Assignees", "Labels", "Priority", "Features", "Teams"]);
  fireEvent.click(within(tabs).getByRole("tab", { name: "Teams" }));
  expect(rowTexts()).toEqual(["Data Services26% of18", "AI/ML Solutions0% of4"]);
});

test("the toolbar's panel toggle closes and reopens the panel", async () => {
  await start();
  const close = screen.getByRole("button", { name: "Close sprint details" });
  expect(close).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(close);
  expect(screen.queryByRole("complementary", { name: "Sprint details" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open sprint details" }));
  expect(panel()).toBeInTheDocument();
});

test("from a cycle two ahead, the switcher offers Previous sprint (upcoming) and Go to current sprint", async () => {
  const S5 = cycle(312, 5, "2026-11-16T05:00:00.000Z", "2026-11-30T04:59:59.000Z");
  serve({
    "GET /api/bootstrap": makeBootstrap(),
    "GET /api/teams/9001/cycles/312": { ...DETAIL, cycle: S5, siblings: [S5], issues: [] },
    "GET /api/teams/9001/cycles": { ...LIST, cycles: [S2, S3, S4, S5] },
  });
  await appStore.getState().load();
  render(<CyclePage teamId={9001} cycleId={312} />);
  await vi.waitFor(() => expect(appStore.getState().cycleLists[9001]?.status).toBe("ready"));
  fireEvent.click(await screen.findByRole("button", { name: "Open sprint" }));
  const menu = await screen.findByRole("menu", { name: "Switch sprint" });
  expect(within(menu).queryByText(/^Next sprint/)).toBeNull();
  expect(within(menu).getByText("Previous sprint (upcoming)")).toBeInTheDocument();
  expect(within(menu).getByText("Go to current sprint")).toBeInTheDocument();
  expect(within(menu).getAllByRole("menuitem").slice(0, 2).map((i) => i.getAttribute("aria-label"))).toEqual(["PI 4 · Sprint 4", "PI 4 · Sprint 3"]);
});

test("a status group's + puts the new issue in this cycle, on the cycle's team", async () => {
  await start();
  const todo = screen.getByRole("region", { name: "Todo" });
  fireEvent.click(within(todo).getByRole("button", { name: "Create new story" }));
  expect(uiStore.getState().composerPrefill).toEqual({ teamId: 9001, cycle_id: 310, cycleKey: cycleKey(S3), status: "todo" });
});

test("on an ART's cycle page, + takes the route's cycle and its team, with the key for the other teams' copies", async () => {
  const child = { ...DEMO_TEAM, parent_id: 9100 };
  const sibling = { ...AIML, parent_id: 9100 };
  await start({ teamId: 9100, teams: [ART, child, sibling], detail: { ...DETAIL, siblings: [S3, S3_AIML], teams: [child, sibling] } });
  fireEvent.click(within(screen.getByRole("region", { name: "Done" })).getByRole("button", { name: "Create new story" }));
  expect(uiStore.getState().composerPrefill).toEqual({ teamId: 9001, cycle_id: 310, cycleKey: cycleKey(S3), status: "done" });
});

test("a sprint Rally doesn't have says so", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001/cycles/310": [404, { error: "Cycle 310 was not found" }],
          "GET /api/teams/9001/cycles": LIST });
  await appStore.getState().load();
  render(<CyclePage teamId={9001} cycleId={310} />);
  expect(await screen.findByText("Couldn't find this sprint.")).toBeInTheDocument();
});

test("the sprint page in Rally's words: the crumb, the open switcher, the panel and each breakdown tab", async () => {
  const child = { ...DEMO_TEAM, parent_id: 9100 };
  const sibling = { ...AIML, parent_id: 9100 };
  const loose = issue(1602, "todo", 2, 4, { team_id: 9002, cycle_id: 410, project_id: null });
  await start({
    teamId: 9100, teams: [ART, child, sibling],
    detail: { ...DETAIL, siblings: [S3, S3_AIML], issues: [...ISSUES, loose], teams: [child, sibling] },
  });
  await screen.findByText("6 stories");
  await within(panel()).findByText("Burn-up unavailable"); // the panel's chart has settled
  const tabs = within(panel()).getByRole("tablist", { name: "Breakdown" });
  for (const tab of within(tabs).getAllByRole("tab")) {
    fireEvent.click(tab);
    expect(within(panel()).getByRole("tabpanel").textContent, tab.textContent ?? "").not.toBe("");
    expectRallyWords(document.body);
  }
  fireEvent.click(within(tabs).getByRole("tab", { name: "Features" }));
  expect(within(panel()).getByRole("tabpanel")).toHaveTextContent("No feature");
  fireEvent.click(within(screen.getByRole("heading", { level: 1 })).getByRole("button", { name: "Open sprint" }));
  const menu = await screen.findByRole("menu", { name: "Switch sprint" });
  expect(within(menu).getByText("Next sprint (upcoming)")).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the switcher's Go to current sprint, and the toolbar toggle, are in Rally's words", async () => {
  const S5 = cycle(312, 5, "2026-11-16T05:00:00.000Z", "2026-11-30T04:59:59.000Z");
  serve({
    "GET /api/bootstrap": makeBootstrap(),
    "GET /api/teams/9001/cycles/312": { ...DETAIL, cycle: S5, siblings: [S5], issues: [] },
    "GET /api/teams/9001/cycles": { ...LIST, cycles: [S2, S3, S4, S5] },
  });
  await appStore.getState().load();
  render(<CyclePage teamId={9001} cycleId={312} />);
  await vi.waitFor(() => expect(appStore.getState().cycleLists[9001]?.status).toBe("ready"));
  fireEvent.click(await screen.findByRole("button", { name: "Open sprint" }));
  const menu = await screen.findByRole("menu", { name: "Switch sprint" });
  expect(within(menu).getByText("Previous sprint (upcoming)")).toBeInTheDocument();
  expect(within(menu).getByText("Go to current sprint")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close sprint details" })).toBeInTheDocument();
  expect(await screen.findByText("No stories in this sprint.")).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the sprint page while loading, when it fails and when Rally doesn't have it: Rally's words", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001/cycles/310": [404, { error: "Cycle 310 was not found" }], "GET /api/teams/9001/cycles": LIST });
  await appStore.getState().load();
  const missing = render(<CyclePage teamId={9001} cycleId={310} />);
  expect(screen.getByText("Loading sprint…")).toBeInTheDocument();
  expectRallyWords(missing.container);
  expect(await screen.findByText("Couldn't find this sprint.")).toBeInTheDocument();
  expectRallyWords(missing.container);
  missing.unmount();

  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001/cycles/399": [500, { error: "down" }], "GET /api/teams/9001/cycles": LIST });
  const failed = render(<CyclePage teamId={9001} cycleId={399} />);
  expect(await screen.findByText(/Couldn't load this sprint\./)).toBeInTheDocument();
  expectRallyWords(failed.container);
});

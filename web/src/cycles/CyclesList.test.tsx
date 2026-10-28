import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Cycle, CycleList, CycleStats, Team } from "../api/types";
import { appStore, uiStore } from "../store";
import { DEMO_TEAM, makeBootstrap, serve, SPRINT3, SPRINT4 } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";
import { CyclesList } from "./CyclesList";

const SPRINT2: Cycle = { ...SPRINT3, id: 300, name: "PI 4 · Sprint 2", short_name: "Sprint 2", start: "2026-09-24T04:00:00.000Z", end: "2026-10-08T03:59:59.000Z" };
const SPRINT5: Cycle = { ...SPRINT3, id: 303, name: "PI 4 · Sprint 5", short_name: "Sprint 5", start: "2026-11-05T05:00:00.000Z", end: "2026-11-19T04:59:59.000Z" };
const stat = (cycle_id: number, over: Partial<CycleStats> = {}): CycleStats =>
  ({ cycle_id, scope: 0, started: 0, completed: 0, issue_count: 0, ...over });
const LIST: CycleList = {
  // The server sends oldest first.
  cycles: [SPRINT2, { ...SPRINT3, capacity: 30 }, SPRINT4, SPRINT5],
  stats: [stat(300, { scope: 5, completed: 5 }), stat(301, { scope: 18, started: 7, completed: 3, issue_count: 9 }), stat(302, { scope: 8 }), stat(303)],
  has_older: true,
};

async function start(list: CycleList = LIST, teams: Team[] = [DEMO_TEAM]) {
  serve({ "GET /api/bootstrap": makeBootstrap({ teams }), "GET /api/teams/9001/cycles": list, "GET /api/teams/9100/cycles": list });
  await appStore.getState().load();
}
const rows = () => screen.getAllByRole("link");
const row = (name: string) => screen.getByRole("link", { name: new RegExp(name) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z")); // inside Sprint 3
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the breadcrumb is the team, then Sprints", async () => {
  await start();
  render(<CyclesList teamId={9001} />);
  const crumb = screen.getByRole("heading", { level: 1 });
  expect(within(crumb).getByRole("button", { name: "Data Services" })).toBeInTheDocument();
  expect(crumb).toHaveTextContent("Data Services›Sprints");
});

test("rows are newest first, and only current and future cycles get a tag", async () => {
  await start();
  render(<CyclesList teamId={9001} />);
  await screen.findByRole("link", { name: /Sprint 3/ });
  expect(rows().map((r) => within(r).getByText(/^PI 4 · Sprint/).textContent)).toEqual(
    ["PI 4 · Sprint 5", "PI 4 · Sprint 4", "PI 4 · Sprint 3", "PI 4 · Sprint 2"]);
  const tag = (name: string) => within(row(name)).queryByText(/^(Current|Upcoming|Planned)$/)?.textContent ?? null;
  expect(["Sprint 5", "Sprint 4", "Sprint 3", "Sprint 2"].map(tag)).toEqual(["Planned", "Upcoming", "Current", null]);
});

test("capacity shows only when it is set; scope is the triangle, the points and \"scope\"", async () => {
  await start();
  render(<CyclesList teamId={9001} />);
  const current = await screen.findByRole("link", { name: /Sprint 3/ });
  expect(within(current).getByText("of capacity").parentElement).toHaveTextContent(/^60%of capacity$/);
  expect(within(row("Sprint 4")).queryByText("of capacity")).toBeNull();
  expect(screen.getAllByText("of capacity")).toHaveLength(1);
  const scope = (name: string) => within(row(name)).getByText("scope").parentElement;
  expect(scope("Sprint 3")).toHaveTextContent(/^18scope$/);
  expect(scope("Sprint 4")).toHaveTextContent(/^8scope$/);
  expect(scope("Sprint 5")).toHaveTextContent(/^0scope$/); // no estimates: 0, not blank or NaN
});

test("the current cycle is expanded with the legend: Scope 18, Started 7 • 39%, Completed 3 • 17%", async () => {
  await start();
  render(<CyclesList teamId={9001} />);
  const current = await screen.findByRole("link", { name: /Sprint 3/ });
  const legend = within(current).getByRole("list", { name: "Progress" });
  expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Scope18", "Started7•39%", "Completed3•17%"]);
  expect(within(row("Sprint 4")).queryByRole("list", { name: "Progress" })).toBeNull();
  expect(screen.getAllByRole("list", { name: "Progress" })).toHaveLength(1);
});

test("the current cycle draws its burn-up left of the legend; the other rows have none", async () => {
  const fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM] }), "GET /api/teams/9001/cycles": LIST,
    "GET /api/burnup": { start: "2026-10-08", end: "2026-10-21", points: [{ day: "2026-10-08", scope: 18, started: 7, completed: 3 }] },
  });
  await appStore.getState().load();
  render(<CyclesList teamId={9001} />);
  const current = await screen.findByRole("link", { name: /Sprint 3/ });
  const chart = await within(current).findByRole("img", { name: "Burn-up chart" });
  expect(chart).toHaveAttribute("height", "166");
  expect(chart.compareDocumentPosition(within(current).getByRole("list", { name: "Progress" }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(fetchMock).toHaveBeenCalledWith("/api/burnup?team=9001&cycle=301", expect.anything());
  expect(screen.getAllByRole("img", { name: "Burn-up chart" })).toHaveLength(1);
});

test("a cycle with no estimates shows 0% of its capacity, never NaN (Review Focus 4)", async () => {
  await start({ ...LIST, cycles: [{ ...SPRINT3, capacity: 20 }], stats: [stat(301)], has_older: false });
  render(<CyclesList teamId={9001} />);
  const current = await screen.findByRole("link", { name: /Sprint 3/ });
  expect(within(current).getByText("of capacity").parentElement).toHaveTextContent(/^0%of capacity$/);
  const legend = within(current).getByRole("list", { name: "Progress" });
  expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Scope0", "Started0•0%", "Completed0•0%"]);
  expect(current.textContent).not.toMatch(/NaN/);
});

test("\"Show older sprints\" loads 6 more ended cycles", async () => {
  await start();
  render(<CyclesList teamId={9001} />);
  await screen.findByRole("link", { name: /Sprint 3/ });
  const load = vi.spyOn(appStore.getState(), "loadCycles");
  fireEvent.click(screen.getByRole("button", { name: "Show older sprints" }));
  expect(load).toHaveBeenCalledWith(9001, 8);
});

test("\"Show older sprints\" stops at the server's 50 past cycles", async () => {
  await start();
  await appStore.getState().loadCycles(9001, 46);
  render(<CyclesList teamId={9001} />);
  await screen.findByRole("link", { name: /Sprint 3/ });
  const load = vi.spyOn(appStore.getState(), "loadCycles");
  fireEvent.click(screen.getByRole("button", { name: "Show older sprints" }));
  expect(load).toHaveBeenCalledWith(9001, 50); // not 52, which the server refuses
});

test("no \"Show older sprints\" once 50 past cycles show, even if Rally has older", async () => {
  await start(); // has_older: true
  await appStore.getState().loadCycles(9001, 50);
  render(<CyclesList teamId={9001} />);
  await screen.findByRole("link", { name: /Sprint 3/ });
  expect(screen.queryByRole("button", { name: "Show older sprints" })).toBeNull();
});

test("no \"Show older sprints\" when there are none", async () => {
  await start({ ...LIST, has_older: false });
  render(<CyclesList teamId={9001} />);
  await screen.findByRole("link", { name: /Sprint 3/ });
  expect(screen.queryByRole("button", { name: "Show older sprints" })).toBeNull();
});

test("each row links to its cycle page", async () => {
  await start();
  render(<CyclesList teamId={9001} />);
  await screen.findByRole("link", { name: /Sprint 3/ });
  expect(rows().map((r) => r.getAttribute("href"))).toEqual(
    ["/team/9001/cycles/303", "/team/9001/cycles/302", "/team/9001/cycles/301", "/team/9001/cycles/300"]);
  fireEvent.click(row("Sprint 4"));
  expect(uiStore.getState().route).toEqual({ name: "cycle", teamId: 9001, cycleId: 302 });
});

test("an ART shows its child teams' same-dated sprints as one row with summed scope", async () => {
  const art: Team = { id: 9100, name: "Data ART", level: "art", parent_id: null };
  const child: Team = { ...DEMO_TEAM, parent_id: 9100 };
  const twin = { ...SPRINT3, id: 401, team_id: 9002 };
  await start({ cycles: [SPRINT3, twin], stats: [stat(301, { scope: 10 }), stat(401, { scope: 8 })], has_older: false }, [art, child]);
  render(<CyclesList teamId={9100} />);
  const current = await screen.findByRole("link", { name: /Sprint 3/ });
  expect(rows()).toHaveLength(1);
  expect(within(current).getAllByText("18").length).toBeGreaterThan(0);
});

test("the list in Rally's words: the breadcrumb, tags, the expanded current row with its legend and burn-up, Show older sprints", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM] }), "GET /api/teams/9001/cycles": LIST });
  await appStore.getState().load();
  const { container } = render(<CyclesList teamId={9001} />);
  const current = await screen.findByRole("link", { name: /Sprint 3/ });
  await within(current).findByRole("list", { name: "Progress" });
  await within(current).findByText("Burn-up unavailable"); // the chart has settled
  await screen.findByRole("button", { name: "Show older sprints" });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Data Services›Sprints");
  expectRallyWords(container);
});

test("the list's empty text are in Rally's words", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [DEMO_TEAM] }), "GET /api/teams/9001/cycles": { ...LIST, cycles: [], stats: [], has_older: false } });
  await appStore.getState().load();
  const empty = render(<CyclesList teamId={9001} />);
  await screen.findByText("This team has no sprints.");
  expectRallyWords(empty.container);
});

test("the list's error text is in Rally's words", async () => {
  // Its own team: the store keeps a team's last good list for its lifetime, which would hide the error.
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [{ ...DEMO_TEAM, id: 9050 }] }), "GET /api/teams/9050/cycles": [500, { error: "down" }] });
  await appStore.getState().load();
  const failed = render(<CyclesList teamId={9050} />);
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.getByText(/Couldn't load sprints\./)).toBeInTheDocument();
  expectRallyWords(failed.container);
});

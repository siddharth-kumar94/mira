import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Release } from "../api/types";
import { useShortcuts } from "../keyboard/useShortcuts";
import { formatRoute } from "../route";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { AIML, DANA, DEMO_TEAM, SPRINT3, SPRINT4, makeProject } from "../test/fixtures";
import { defaultPmOptions, type PmContext, type PmOptions } from "./model";
import { Timeline } from "./ProjectTimeline";
import { makeScale, timelineRange } from "./timeline";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const PI4: Release = { id: 701, name: "PI 4", start: "2026-10-08", end: "2026-12-31", ids: [701, 702] };
const PI1: Release = { id: 703, name: "PI 1", start: "2027-01-01", end: "2027-03-31", ids: [703] };
const ctx = (over: Partial<PmContext> = {}): PmContext => ({
  now: NOW, users: {}, teams: { 9001: DEMO_TEAM, 9002: AIML }, initiatives: {}, releases: { 701: PI4, 702: PI4, 703: PI1 }, priority: true, ...over,
});
const timeline = (over: Partial<PmOptions> = {}): PmOptions => ({ ...defaultPmOptions("workspace"), ...over });

const ALFRED = makeProject({
  id: 12, key: "F12", name: "Alfred Onboarding", status_category: "started", progress: 0.37, start: "2026-09-01", target: "2026-10-01",
  lead: DANA, pi_id: 701, rank: "a", health: { value: "on_track", source: "update", reason: "" },
  latest_update: { id: 1, author: DANA, health: "on_track", html: "", created_at: "2026-10-16T12:00:00.000Z", progress: null, target: null },
});
const PORTAL = makeProject({ id: 13, key: "F13", name: "Enterprise AI Portal", status_category: "planned", progress: 0, start: null,
  target: "2027-02-15", lead: null, rank: "b", health: { value: "no_target", source: "auto", reason: "" } });
const UNDATED = makeProject({ id: 14, key: "F14", name: "Intake", status_category: "backlog", progress: 0, start: null, target: null, rank: "c" });
const PROJECTS = [ALFRED, PORTAL, UNDATED];

/** Holds the options the way ProjectsView does, so keys and the zoom menu really change the zoom. */
function Harness({ initial = {}, c = ctx(), onOptions }: { initial?: Partial<PmOptions>; c?: PmContext; onOptions?: (o: Partial<PmOptions>) => void }) {
  const [options, setOptions] = useState(timeline(initial));
  return (
    <>
      <input aria-label="Filter by title" />
      <Timeline projects={PROJECTS} options={options} ctx={c}
        onOptions={(next) => { onOptions?.(next); setOptions((o) => ({ ...o, ...next })); }} />
    </>
  );
}
const zoomButton = () => screen.getByRole("button", { name: "Zoom" });
const row = (name: string) => screen.getByRole("link", { name: new RegExp(name) });
const bar = (id: number) => document.querySelector<HTMLElement>(`[data-project="${id}"] [data-part=bar]`);

beforeEach(() => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.restoreAllMocks());

test("the left panel: cube, name, icon-only health, status, priority (with its field) and lead; undated projects keep their row", () => {
  render(<Harness />);
  const panel = screen.getByRole("group", { name: "Feature list" });
  expect(within(panel).getAllByRole("link").map((l) => l.querySelector("[data-part=name]")?.textContent))
    .toEqual(["Alfred Onboarding", "Enterprise AI Portal", "Intake"]);
  const alfred = row("Alfred");
  expect(alfred).toHaveAttribute("href", formatRoute({ name: "project", key: "F12", tab: "overview" }));
  expect(alfred.querySelector("[data-part=cube] svg")).not.toBeNull();
  const marks = [...alfred.querySelectorAll("[data-part=marks] > *")].map((m) => m.getAttribute("data-part"));
  expect(marks).toEqual(["health", "status", "priority", "lead"]);
  expect(within(alfred).getByRole("button", { name: "On track, last update 3 days ago" })).toBeInTheDocument();
  expect(within(alfred).getByRole("img", { name: "In Progress" })).toBeInTheDocument();
  expect(within(row("Enterprise")).getByRole("button", { name: "There are no updates for this feature" })).toBeInTheDocument();
  // No target: the row stays, with no bar (Review Focus 1).
  expect(row("Intake")).toBeInTheDocument();
  expect(bar(14)).toBeNull();
  expect(bar(12)).not.toBeNull();
});

test("without the priority field, rows have no priority mark (D38); Show feature list off hides the panel", () => {
  const { unmount } = render(<Harness c={ctx({ priority: false })} />);
  expect(row("Alfred").querySelector("[data-part=priority]")).toBeNull();
  unmount();
  render(<Harness initial={{ showList: false }} />);
  expect(screen.queryByRole("group", { name: "Feature list" })).toBeNull();
  // The bars become the links.
  expect(screen.getByRole("link", { name: "Alfred Onboarding" })).toBe(bar(12));
});

test("Today and the zoom pill; the zoom menu lists Year Y, Quarter Q, Month M, Week W, the current one checked", () => {
  render(<Harness />);
  expect(screen.getByRole("button", { name: "Center the timeline on today’s date" })).toHaveTextContent(/^Today$/);
  expect(zoomButton()).toHaveTextContent(/^Year$/);
  fireEvent.click(zoomButton());
  const menu = screen.getByRole("menu", { name: "Zoom" });
  const items = within(menu).getAllByRole("menuitemcheckbox");
  expect(items.map((i) => i.textContent)).toEqual(["YearY", "QuarterQ", "MonthM", "WeekW"]);
  expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
  fireEvent.click(items[2]);
  expect(screen.queryByRole("menu", { name: "Zoom" })).toBeNull();
  expect(zoomButton()).toHaveTextContent(/^Month$/);
});

test("Y, Q, M and W set the zoom, but not while typing; ⌘⌥Z opens the zoom menu", () => {
  const onOptions = vi.fn();
  render(<Harness onOptions={onOptions} />);
  fireEvent.keyDown(window, { key: "q" });
  expect(onOptions).toHaveBeenLastCalledWith({ zoom: "quarter" });
  expect(zoomButton()).toHaveTextContent(/^Quarter$/);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Filter by title" }), { key: "w" });
  expect(zoomButton()).toHaveTextContent(/^Quarter$/);
  fireEvent.keyDown(window, { key: "m", metaKey: true });
  expect(zoomButton()).toHaveTextContent(/^Quarter$/);
  fireEvent.keyDown(window, { key: "W" });
  expect(zoomButton()).toHaveTextContent(/^Week$/);
  fireEvent.keyDown(window, { key: "Ω", code: "KeyZ", metaKey: true, altKey: true });
  expect(screen.getByRole("menu", { name: "Zoom" })).toBeInTheDocument();
});

test("g m goes to My issues and leaves the zoom alone, whichever key handler hears it first", () => {
  const actions: string[] = [];
  function Shortcuts() { // App's handler, registered after the timeline's: the worst order for the timeline
    useShortcuts((a) => actions.push(a));
    return null;
  }
  const onOptions = vi.fn();
  render(<><Harness onOptions={onOptions} /><Shortcuts /></>);
  fireEvent.keyDown(window, { key: "g" });
  fireEvent.keyDown(window, { key: "m" });
  expect(actions).toEqual(["go-my-issues"]);
  expect(onOptions).not.toHaveBeenCalled();
  expect(zoomButton()).toHaveTextContent(/^Year$/);
  fireEvent.keyDown(window, { key: "m" }); // the prefix is spent: a lone M is Month again
  expect(zoomButton()).toHaveTextContent(/^Month$/);
});

test("zoom keys don't fire while a menu or popover is open", () => {
  const onOptions = vi.fn();
  render(<><Harness onOptions={onOptions} /><div role="dialog" aria-label="Display options" /></>);
  fireEvent.keyDown(window, { key: "q" });
  expect(onOptions).not.toHaveBeenCalled();
  expect(zoomButton()).toHaveTextContent(/^Year$/);
});

test("the today pill reads today's month and day in capitals", () => {
  render(<Harness />);
  expect(document.querySelector("[data-part=today-pill]")).toHaveTextContent(/^OCT 19$/);
});

test("bars: the name sits above the bar (bar top − 19); an overdue open project overruns to the today line", () => {
  render(<Harness />);
  const b = bar(12)!;
  const name = document.querySelector<HTMLElement>('[data-project="12"] [data-part=bar-name]')!;
  expect(name).toHaveTextContent("Alfred Onboarding");
  const track = name.parentElement!;
  expect(parseFloat(b.style.top) - parseFloat(track.style.top)).toBe(19);
  expect(track.style.left).toBe(`${parseFloat(b.style.left) + 1}px`);
  // Scrolled off to the left, the name pins 13 past the panel (333) and can stay there until the bar and its overrun
  // have passed the edge: its sticky box is the name followed by a run as long as bar plus overrun. It never slides
  // under the panel (the name is the first item, so its box always extends a full name-width past the overrun's end).
  expect(name).toHaveClass("sticky");
  expect(name.style.left).toBe("333px");
  expect([...track.children].indexOf(name)).toBe(0);
  const s = makeScale(timelineRange(PROJECTS, "2026-10-19", "year").from, "year");
  expect(parseFloat(b.style.left)).toBe(s.x("2026-09-01"));
  expect(parseFloat(b.style.width)).toBe(31 * 2.5);
  const overrun = document.querySelector<HTMLElement>('[data-project="12"] [data-part=overrun]')!;
  const right = parseFloat(overrun.style.left) + parseFloat(overrun.style.width);
  expect(right).toBeCloseTo(s.x(new Date(NOW).toISOString()));
  const run = document.querySelector<HTMLElement>('[data-project="12"] [data-part=bar-name-run]')!;
  expect(parseFloat(track.style.left) + parseFloat(run.style.width)).toBeCloseTo(right);
  // The planned project, the no-start one: a 1-day bar at its target, no overrun.
  expect(parseFloat(bar(13)!.style.width)).toBe(2.5);
  expect(document.querySelector('[data-project="13"] [data-part=overrun]')).toBeNull();
});

test("Show PIs is off by default: no bands; on, one band per PI with its name in the header (deduped across team copies)", () => {
  const { unmount } = render(<Harness />);
  expect(document.querySelectorAll("[data-part=pi-band]")).toHaveLength(0);
  unmount();
  render(<Harness initial={{ showPis: true }} />);
  expect(document.querySelectorAll("[data-part=pi-band]")).toHaveLength(2);
  const header = screen.getByRole("row", { name: "PIs" });
  expect([...header.querySelectorAll("[data-part=band-name]")].map((n) => n.textContent)).toEqual(["PI 4", "PI 1"]);
});

test("Show cycles draws the chosen team's cycles, lighter, numbered in the header; it loads them when needed", async () => {
  appStore.setState({ cycles: { 301: SPRINT3, 302: SPRINT4 }, cycleLists: { 9001: { status: "ready", ids: [301, 302], hasOlder: false, past: 2 } } });
  const load = vi.spyOn(appStore.getState(), "loadCycles");
  render(<Harness initial={{ cycleTeamId: 9001 }} />);
  expect(load).not.toHaveBeenCalled();
  expect(document.querySelectorAll("[data-part=cycle-band]")).toHaveLength(2);
  const header = screen.getByRole("row", { name: "Data Services sprints" });
  expect([...header.querySelectorAll("[data-part=band-name]")].map((n) => n.textContent)).toEqual(["3", "4"]);
  // The current cycle's label is the accent's.
  expect(header.querySelector("[data-current=true] [data-part=band-name]")).toHaveTextContent("3");

  const loadCycles = vi.fn(async () => {});
  appStore.setState({ loadCycles });
  await act(async () => { render(<Harness initial={{ cycleTeamId: 9002 }} />); });
  expect(loadCycles).toHaveBeenCalledWith(9002);
});

test("clicking a bar or a row opens the project", () => {
  render(<Harness />);
  fireEvent.click(row("Alfred"));
  expect(formatRoute(uiStore.getState().route)).toBe("/project/F12");
  uiStore.setState(uiStore.getInitialState(), true);
  fireEvent.click(bar(13)!);
  expect(formatRoute(uiStore.getState().route)).toBe("/project/F13");
});

test("the timeline reads in Rally's words: panel, zoom menu and sprint band", () => {
  appStore.setState({ cycles: { 301: SPRINT3, 302: SPRINT4 }, cycleLists: { 9001: { status: "ready", ids: [301, 302], hasOlder: false, past: 2 } } });
  const { container } = render(<Harness initial={{ cycleTeamId: 9001, showPis: true }} />);
  expect(screen.getByRole("group", { name: "Features timeline" })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Feature list" })).getByRole("link", { name: /Alfred/ })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: "Data Services sprints" })).toBeInTheDocument();
  expectRallyWords(container);
  fireEvent.click(zoomButton());
  expect(screen.getByRole("menu", { name: "Zoom" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

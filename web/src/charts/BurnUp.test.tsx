import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Burnup } from "../api/types";
import { appStore } from "../store";
import { deferred, serve } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";
import { BurnUp } from "./BurnUp";

const CYCLE: Burnup = {
  start: "2026-10-19", end: "2026-11-01",
  points: [
    { day: "2026-10-19", scope: 18, started: 4, completed: 1 },
    { day: "2026-10-20", scope: 18, started: 7, completed: 2 },
    { day: "2026-10-21", scope: 18, started: 7, completed: 3 },
  ],
};
/** Overdue: the target was Oct 15, so the series runs to today (ruling T22-end). */
const PROJECT: Burnup = {
  start: "2026-09-10", end: "2026-10-21",
  points: [{ day: "2026-10-20", scope: 26, started: 7, completed: 3 }, { day: "2026-10-21", scope: 26, started: 7, completed: 3 }],
};
const cycle = { kind: "cycle", teamId: 9001, cycleId: 301 } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  appStore.setState(appStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("while loading it keeps the chart's space and shows nothing", () => {
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => pending.promise));
  // Its own cycle: the store shares a pending load per key, and this one never settles.
  const { container } = render(<BurnUp target={{ ...cycle, cycleId: 399 }} width={402} height={157} variant="cycle" />);
  const slot = container.firstElementChild as HTMLElement;
  expect(slot).toHaveStyle({ width: "402px", height: "157px" });
  expect(slot).toHaveAttribute("aria-busy", "true");
  expect(slot).toBeEmptyDOMElement();
  expect(fetch).toHaveBeenCalledWith("/api/burnup?team=9001&cycle=399", expect.anything());
});

test("a failed load says \"Burn-up unavailable\" in the chart's space (ruling 15)", async () => {
  serve({ "GET /api/burnup": [502, { error: "Burn-up unavailable" }] });
  render(<BurnUp target={cycle} width={402} height={157} variant="cycle" />);
  const msg = await screen.findByText("Burn-up unavailable");
  expect(msg.closest("[data-burnup]")).toHaveStyle({ width: "402px", height: "157px" });
  expect(screen.queryByRole("img")).toBeNull();
  expect(appStore.getState().toasts).toEqual([]); // the chart says so; no toast on top
});

test("with data: the scope area, started and completed lines, the today marker and the axis labels", async () => {
  serve({ "GET /api/burnup": CYCLE });
  const { container } = render(<BurnUp target={cycle} width={402} height={157} variant="cycle" />);
  const svg = await screen.findByRole("img", { name: "Burn-up chart" });
  expect(svg).toHaveAttribute("width", "402");
  expect(svg).toHaveAttribute("height", "157");
  const part = (name: string) => container.querySelector(`[data-part="${name}"]`);
  expect(part("scope-area")?.getAttribute("d")).toMatch(/Z$/);
  expect(part("scope")).toHaveAttribute("stroke", "var(--color-chart-scope)");
  expect(part("started")).toHaveAttribute("stroke", "var(--color-health-risk-icon)");
  expect(part("completed")).toHaveAttribute("stroke", "var(--color-chart-done)");
  expect(part("today")).toHaveAttribute("stroke", "var(--color-chart-today)");
  expect(part("dot-started")).toHaveAttribute("fill", "var(--color-health-risk-icon)");
  expect(part("dot-completed")).toHaveAttribute("fill", "var(--color-chart-done)");
  // The cycle extras: weekends hatched, the weekly guide and the dashed projection to the end.
  expect(container.querySelectorAll('[data-part="weekend"]')).toHaveLength(4); // Oct 24–25, Oct 31–Nov 1
  expect(part("guide")).toHaveAttribute("stroke", "var(--color-chart-guide)");
  expect(part("projection")).toHaveAttribute("stroke-dasharray");
  const labels = [...container.querySelectorAll("text")];
  expect(labels.map((t) => t.textContent)).toEqual(["Oct 19", "Nov 2", "Oct 21", "Oct 26"]);
  for (const t of labels) {
    expect(t).toHaveClass("text-mini");
    expect(t).toHaveAttribute("font-weight", "400");
    expect(t).toHaveAttribute("fill", "var(--color-ink-3)");
  }
  expect(part("target")).toBeNull();
});

test("the project variant draws the target line in overrun with a dashed fill past it, and no cycle extras", async () => {
  const fetchMock = serve({ "GET /api/burnup": PROJECT });
  const { container } = render(
    <BurnUp target={{ kind: "project", ref: "F201" }} width={362} height={200} variant="project" targetDate="2026-10-15" />);
  await screen.findByRole("img", { name: "Burn-up chart" });
  expect(fetchMock).toHaveBeenCalledWith("/api/burnup?project=F201", expect.anything());
  const target = container.querySelector('[data-part="target"]')!;
  expect(target).toHaveAttribute("stroke", "var(--color-overrun)");
  const past = container.querySelector('[data-part="past-target"]')!;
  expect(past.getAttribute("fill")).toMatch(/^url\(#/);
  const pattern = container.querySelector(past.getAttribute("fill")!.slice(4, -1))!;
  expect(pattern.querySelector("line")).toHaveAttribute("stroke-dasharray");
  expect(pattern.querySelector("line")).toHaveAttribute("stroke", "var(--color-overrun)");
  // The fill starts at the target line and runs to the end.
  expect(Number(past.getAttribute("x"))).toBeCloseTo(Number(target.getAttribute("x1")));
  expect(Number(past.getAttribute("x")) + Number(past.getAttribute("width"))).toBeCloseTo(362);
  for (const name of ["weekend", "projection", "guide"]) expect(container.querySelector(`[data-part="${name}"]`)).toBeNull();
  expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["Sep 10", "Oct 21"]); // today is the end
});

test("a project on schedule has no fill past its target", async () => {
  serve({ "GET /api/burnup": { ...PROJECT, end: "2026-12-31" } });
  const { container } = render(
    <BurnUp target={{ kind: "project", ref: "F201" }} width={362} height={200} variant="project" targetDate="2026-12-31" />);
  await screen.findByRole("img", { name: "Burn-up chart" });
  expect(Number(container.querySelector('[data-part="target"]')!.getAttribute("x1"))).toBeCloseTo(362);
  expect(container.querySelector('[data-part="past-target"]')).toBeNull();
});

test.each([
  ["no points", { ...CYCLE, points: [] }],
  ["all-zero scope", { ...CYCLE, points: CYCLE.points.map((p) => ({ ...p, scope: 0, started: 0, completed: 0 })) }],
])("a chart with %s draws no NaN", async (_, b) => {
  serve({ "GET /api/burnup": b });
  const { container } = render(<BurnUp target={{ ...cycle, cycleId: 390 + b.points.length }} width={402} height={157} variant="cycle" />);
  await screen.findByRole("img", { name: "Burn-up chart" });
  for (const el of container.querySelectorAll("*")) {
    for (const a of ["d", "x", "x1", "x2", "y", "y1", "y2", "cx", "cy", "width", "height"]) {
      expect(el.getAttribute(a) ?? "", `${el.tagName} ${a}`).not.toMatch(/NaN|Infinity/);
    }
  }
});

test("a target before the start keeps its line on the chart's left edge", async () => {
  serve({ "GET /api/burnup": PROJECT });
  const { container } = render(
    <BurnUp target={{ kind: "project", ref: "F299" }} width={362} height={200} variant="project" targetDate="2026-08-01" />);
  await screen.findByRole("img", { name: "Burn-up chart" });
  expect(container.querySelector('[data-part="target"]')).toHaveAttribute("x1", "0");
});

test("the chart in Rally's words: loaded, and unavailable (loading draws no words at all)", async () => {
  serve({ "GET /api/burnup": CYCLE });
  const loaded = render(<BurnUp target={{ ...cycle, cycleId: 380 }} width={402} height={157} variant="cycle" />);
  expect(loaded.container.firstElementChild).toHaveAttribute("aria-busy", "true");
  expect(loaded.container.textContent).toBe("");
  await screen.findByRole("img", { name: "Burn-up chart" });
  expect(loaded.container).toHaveTextContent("Oct 19");
  expectRallyWords(loaded.container);
  loaded.unmount();

  serve({ "GET /api/burnup": [502, { error: "Burn-up unavailable" }] });
  const failed = render(<BurnUp target={{ ...cycle, cycleId: 381 }} width={402} height={157} variant="cycle" />);
  await screen.findByText("Burn-up unavailable");
  expectRallyWords(failed.container);
});

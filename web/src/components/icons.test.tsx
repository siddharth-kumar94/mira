import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SPRINT3, SPRINT4, makeProject } from "../test/fixtures";
import { CycleIcon, ICONS, Icon, ProjectIcon, type IconName } from "./icons";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";
import { CycleStatusIcon, HealthIcon, InitiativeIcon, ProjectStatusIcon, ProjectsDoneIcon } from "./pm";

test("every icon draws on a 16-unit grid and hides itself unless labelled", () => {
  for (const name of Object.keys(ICONS) as IconName[]) {
    const { container, unmount } = render(<Icon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox"), name).toBe("0 0 16 16");
    expect(svg.getAttribute("aria-hidden"), name).toBe("true");
    expect(svg.getAttribute("width"), name).toBe("14");
    expect(svg.childElementCount, name).toBeGreaterThan(0);
    unmount();
  }
  render(<Icon name="filter" label="Add filter" size={16} />);
  expect(screen.getByRole("img", { name: "Add filter" })).toHaveAttribute("width", "16");
});

test("the cycle icon: elapsed arc when current, dots when upcoming, a full ring when past", () => {
  const now = Date.parse("2026-10-15T04:00:00.000Z"); // halfway through SPRINT3 (Oct 8–22)
  const current = render(<CycleIcon cycle={SPRINT3} now={now} />).container;
  expect(current.querySelector('[data-part="elapsed"]')!.getAttribute("stroke-dasharray")).toMatch(/^19\.\d+ 39\.\d+$/);
  const upcoming = render(<CycleIcon cycle={SPRINT4} now={now} />).container;
  expect(upcoming.querySelector('[data-part="dots"]')).not.toBeNull();
  const past = render(<CycleIcon cycle={SPRINT3} now={Date.parse("2026-11-01T00:00:00.000Z")} />).container;
  expect(past.querySelector('[data-part="elapsed"]')!.getAttribute("stroke-dasharray")).toMatch(/^39\.\d+ 39\.\d+$/);
});

test("projects are a cube coloured by their status category", () => {
  const { container } = render(<ProjectIcon project={makeProject({ status_category: "started" })} />);
  expect(container.querySelector("svg")!.getAttribute("style")).toContain("var(--color-status-progress)");
});

test("status and priority icons keep their names; Completed uses the monochrome done disc", () => {
  render(<><StatusIcon status="done" mono /><PriorityIcon priority={1} tone="ink" /><PriorityIcon priority={0} /></>);
  expect(screen.getByRole("img", { name: "Done" }).innerHTML).toContain("var(--color-status-completed)");
  expect(screen.getByRole("img", { name: "Urgent" }).innerHTML).toContain("var(--color-ink-1)");
  expect(screen.getByRole("img", { name: "No priority" })).toHaveAttribute("width", "16");
});

test("status marks keep Linear's measured geometry: pie radius 4 and 12 backlog dashes", () => {
  const { container } = render(<><StatusIcon status="in_progress" /><StatusIcon status="backlog" /></>);
  expect(container.innerHTML).toContain('d="M7 3a4 4 0 0 1 0 8z"');
  const [a, b] = container.querySelector("circle[stroke-dasharray]")!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
  expect(Math.round((2 * Math.PI * 6) / (a + b))).toBe(12);
});

test("project status hexagons: Backlog dashed, Completed filled with a check, In Progress a progress wedge", () => {
  const backlog = render(<ProjectStatusIcon category="backlog" progress={0} />).container;
  // Linear's measured pattern: 12 periods of 55% dash, 45% gap, opening and closing on half a gap so the seam stays in a gap.
  const [lead, half, dash, tail] = backlog.querySelector('[data-part="hex"]')!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
  const period = 34.415 / 12;
  expect(lead).toBe(0);
  expect(dash).toBeCloseTo(0.55 * period, 2);
  expect(half).toBeCloseTo(0.45 * period / 2, 2);
  expect(tail).toBeCloseTo(0.45 * period / 2, 2);
  const planned = render(<ProjectStatusIcon category="planned" progress={0} />).container;
  expect(planned.querySelector('[data-part="hex"]')!.getAttribute("stroke-dasharray")).toBeNull();
  const completed = render(<ProjectStatusIcon category="completed" progress={1} />).container;
  expect(completed.querySelector('[data-part="hex"]')!.getAttribute("fill")).toBe("currentColor");
  expect(completed.querySelector('[data-part="check"]')!.getAttribute("d")).toMatch(/^M/);
  const started = render(<ProjectStatusIcon category="started" progress={0.5} />).container;
  const [wedge, round] = started.querySelector('[data-part="wedge"]')!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
  expect(wedge / round).toBeCloseTo(0.5, 2);
});

test("cycle status icons: Planned is a dashed ring, Upcoming a solid ring, Current an elapsed arc", () => {
  const planned = render(<CycleStatusIcon status="planned" elapsed={0} />).container;
  expect(planned.querySelector('[data-part="ring"]')!.getAttribute("stroke-dasharray")).toBe("1.636 1.636");
  const upcoming = render(<CycleStatusIcon status="upcoming" elapsed={0} />).container;
  expect(upcoming.querySelector('[data-part="ring"]')!.getAttribute("stroke-dasharray")).toBeNull();
  const current = render(<CycleStatusIcon status="current" elapsed={0.25} />).container;
  const [arc, round] = current.querySelector('[data-part="elapsed"]')!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
  expect(arc / round).toBeCloseTo(0.25, 2);
});

test("health icons: a tinted disc with a stroke in the health colour, or the dashed circle", () => {
  const on = render(<HealthIcon value="on_track" />).container.querySelector("svg")!;
  expect(on.getAttribute("class")).toContain("text-health-on");
  expect(on.querySelector("circle")).toHaveAttribute("fill-opacity", "0.25");
  const none = render(<HealthIcon value="none" />).container.querySelector("svg")!;
  expect(none.querySelector("circle")!.getAttribute("stroke-dasharray")).toBe("2.36 2.36");
});

test("initiative glyphs: the arc over a triangle, or ringed for a status", () => {
  const glyph = render(<InitiativeIcon color="red" />).container.querySelector("svg")!;
  expect(glyph.getAttribute("style")).toContain("red");
  const active = render(<InitiativeIcon status="active" />).container.querySelector("svg")!;
  expect(active.getAttribute("style")).toContain("var(--color-health-risk-icon)");
  expect(active.querySelector('[data-part="ring"]')).not.toBeNull();
  expect(render(<ProjectsDoneIcon />).container.querySelector('[data-part="check"]')).not.toBeNull();
});

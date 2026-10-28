import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Health, Update } from "../api/types";
import { DANA } from "../test/fixtures";
import { DateChip, HealthChip, HealthDot, Legend, PersonChip, PiChip, Ring, Sparkline, StatusTag } from "./pm";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const AT_RISK: Health = { value: "at_risk", source: "update", reason: "" };
const LATEST: Update = {
  id: 801, author: DANA, health: "at_risk", html: "<p>Blocked.</p>", created_at: "2026-10-16T12:00:00.000Z", progress: 0.4, target: null,
};

test("the health chip: icon, label, a 0.7 age, the health colour and Linear's aria", () => {
  const onClick = vi.fn();
  render(<HealthChip health={AT_RISK} latest={LATEST} kind="project" now={NOW} onClick={onClick} />);
  const chip = screen.getByRole("button", { name: "At risk, last update 3 days ago. Click to open updates." });
  expect(chip).toHaveTextContent("At risk · 3d");
  expect(chip.className).toContain("h-6");
  expect(chip.className).toContain("rounded-full");
  expect(chip.className).toContain("hover:bg-health-hover");
  const label = chip.querySelector("span.text-health-risk")!;
  expect(label).toHaveTextContent("At risk");
  const ageSpan = [...chip.querySelectorAll("span")].find((s) => s.textContent === "\u00a0·\u00a03d")!;
  expect(ageSpan).toHaveStyle({ opacity: "0.7" });
  fireEvent.click(chip);
  expect(onClick).toHaveBeenCalled();
});

const NO_UPDATES: Health = { value: "no_target", source: "auto", reason: "No planned end date" };

test("no updates: the dashed circle and ink-3 text", () => {
  render(<HealthChip health={NO_UPDATES} latest={null} kind="project" now={NOW} />);
  const chip = screen.getByRole("button", { name: "No updates. Click to write update." });
  expect(chip).toHaveTextContent("No updates");
  expect(chip.querySelector(".text-ink-3")).toHaveTextContent("No updates");
  expect(chip.querySelector("circle[stroke-dasharray]")).not.toBeNull();
});

test("health not read yet (null, from an issue-side read) is a quiet blank, not No updates", () => {
  const { container } = render(<>
    <HealthChip health={null} latest={null} kind="project" now={NOW} />
    <HealthChip health={null} latest={null} kind="initiative" now={NOW} iconOnly />
  </>);
  expect(container).not.toHaveTextContent(/No updates/);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByLabelText(/no updates/i)).toBeNull();
  const [chip, icon] = container.querySelectorAll("[data-health=unread]");
  expect(chip.className).toContain("h-6"); // holds the chip's height
  expect(icon.className).toContain("size-7"); // and the icon cell's box
  expect(container.querySelector("svg")).toBeNull();
});

test("Auto health reads Auto in the age slot, with the reason as the tooltip", () => {
  render(<HealthChip health={{ value: "off_track", source: "auto", reason: "Past target" }} latest={null} kind="initiative" now={NOW} />);
  const chip = screen.getByRole("button", { name: /^Off track, set automatically/ });
  expect(chip).toHaveTextContent("Off track · Auto");
  expect(chip).toHaveAttribute("title", "Past target");
});

test("the icon-only chip is a 28 round button with no visible text", () => {
  render(<HealthChip health={NO_UPDATES} latest={null} kind="initiative" now={NOW} iconOnly />);
  const chip = screen.getByRole("button", { name: "There are no updates for this capability" });
  expect(chip).toHaveTextContent("");
  expect(chip.className).toContain("size-7");
});

test("the ring: only the top dot at 0, an arc of 26% at 0.26", () => {
  const zero = render(<Ring fraction={0} />).container;
  expect(zero.querySelector('[data-part="dot"]')).not.toBeNull();
  expect(zero.querySelector('[data-part="arc"]')).toBeNull();
  const quarter = render(<Ring fraction={0.26} />).container;
  expect(quarter.querySelector('[data-part="dot"]')).toBeNull();
  const [arc, rest] = quarter.querySelector('[data-part="arc"]')!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
  expect(arc / rest).toBeCloseTo(0.26, 2);
});

test("the sparkline is a rising line, and nothing at 0%", () => {
  const { container, rerender } = render(<Sparkline start="2026-09-10" progress={0} now={NOW} />);
  expect(container.innerHTML).toBe("");
  rerender(<Sparkline start="2026-09-10" progress={0.31} now={NOW} />);
  expect(container.querySelector("svg")).toHaveAttribute("width", "32");
  expect(container.querySelector("path")!.getAttribute("d")).toBe("M0 16L32 11.04");
  rerender(<Sparkline start={null} progress={0.31} now={NOW} />);
  expect(container.innerHTML).toBe("");
});

test("the legend: Scope, Started and Completed with percentages; 0 scope shows 0%, never NaN%", () => {
  const { container, rerender } = render(<Legend scope={18} started={7} completed={3} percent />);
  expect(container).toHaveTextContent(/Scope\s*18\s*Started\s*7\s*•\s*39%\s*Completed\s*3\s*•\s*17%/);
  rerender(<Legend scope={0} started={0} completed={0} percent />);
  expect(container).toHaveTextContent("0%");
  expect(container.textContent).not.toContain("NaN");
  rerender(<Legend scope={26} started={7} completed={3} />);
  expect(container.textContent).not.toContain("%");
});

test("chips: PI, date (ordinal; the overdue calendar), person and status tag", () => {
  render(<>
    <PiChip release={{ id: 701, name: "PI 4", start: "2026-09-01", end: "2026-11-30", ids: [701] }} />
    <DateChip iso="2026-10-01" ariaLabel="Target date" overdue now={NOW} />
    <DateChip iso="2027-02-15" now={NOW} />
    <PersonChip user={DANA} />
    <StatusTag>Current</StatusTag>
  </>);
  expect(screen.getByText("PI 4").closest("span")!.className).toContain("text-ink-3");
  const overdue = screen.getByLabelText("Target date");
  expect(overdue).toHaveTextContent("Oct 1st");
  expect(overdue.querySelector("svg")!.getAttribute("class")).toContain("text-overrun");
  expect(screen.getByText("Feb 15th, 2027")).toBeInTheDocument();
  expect(screen.getByText("Dana Demo").parentElement!.className).toContain("hover:bg-fill-tag");
  expect(screen.getByText("Current").className).toContain("bg-fill-tag");
});

test("an empty PI renders nothing", () => {
  const { container } = render(<PiChip release={undefined} />);
  expect(container.innerHTML).toBe("");
});

test("the active-project health dot: 8px in the health colour, centred in 16; the strong date chip reads ink-1", () => {
  const { container } = render(<><HealthDot value="off_track" /><DateChip iso="2026-12-31" now={NOW} strong /></>);
  const dot = container.querySelector("svg")!;
  expect(dot).toHaveClass("text-health-off");
  expect(dot.querySelector("circle")).toHaveAttribute("r", "4");
  expect(screen.getByText("Dec 31st").closest("span")).toHaveClass("text-ink-1");
});

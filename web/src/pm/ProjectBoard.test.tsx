import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Project, Release } from "../api/types";
import { formatRoute } from "../route";
import { uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { DANA, makeProject } from "../test/fixtures";
import { defaultPmOptions, type PmContext, type PmOptions } from "./model";
import { ProjectBoard } from "./ProjectBoard";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const PI4: Release = { id: 701, name: "PI 4", start: "2026-10-08", end: "2026-12-31", ids: [701, 702] };
const ctx = (priority = true): PmContext => ({ now: NOW, users: {}, teams: {}, initiatives: {}, releases: { 701: PI4, 702: PI4 }, priority });
const board = (over: Partial<PmOptions> = {}): PmOptions => ({ ...defaultPmOptions("team"), layout: "board", ...over });

const ALFRED = makeProject({
  id: 12, key: "F12", name: "Alfred Onboarding", status_category: "started", progress: 0.37, target: "2026-10-01", issue_count: 6,
  lead: DANA, pi_id: 701, rank: "a", health: { value: "on_track", source: "update", reason: "" },
  latest_update: { id: 1, author: DANA, health: "on_track", html: "", created_at: "2026-10-16T12:00:00.000Z", progress: null, target: null },
});
const PORTAL = makeProject({ id: 13, key: "F13", name: "Enterprise AI Portal", status_category: "planned", progress: 0, target: "2027-02-15",
  issue_count: 2, pi_id: 702, rank: "b" });
const INTAKE = makeProject({ id: 14, key: "F14", name: "Intake", status_category: "backlog", progress: 0, rank: "c" });
const SHIPPED = makeProject({ id: 15, key: "F15", name: "Shipped", status_category: "completed", progress: 1, completed_at: "2026-10-10T00:00:00.000Z", rank: "d" });

const columns = () => screen.getAllByRole("region").map((c) => c.getAttribute("aria-label"));
const card = (name: string) => screen.getByRole("link", { name: new RegExp(name) });

beforeEach(() => uiStore.setState(uiStore.getInitialState(), true));
afterEach(() => vi.restoreAllMocks());

test("four columns in Linear's order, each with its status icon, name and project count; no + or … (D23)", () => {
  render(<ProjectBoard projects={[SHIPPED, ALFRED, INTAKE, PORTAL]} options={board()} ctx={ctx()} />);
  expect(columns()).toEqual(["Backlog column", "Planned column", "In Progress column", "Completed column"]);
  const progress = screen.getByRole("region", { name: "In Progress column" });
  const header = progress.querySelector("header")!;
  expect(header.querySelector("svg")).not.toBeNull(); // the status hexagon
  expect(within(header).getByRole("heading", { name: "In Progress" })).toBeInTheDocument();
  expect(within(header).getByLabelText("Feature count")).toHaveTextContent("1");
  expect(within(header).queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /Open menu|Create new project|Add new project|New project/ })).toBeNull();
});

test("empty columns show only with Show empty columns on", () => {
  const { rerender } = render(<ProjectBoard projects={[ALFRED, PORTAL]} options={board()} ctx={ctx()} />);
  expect(columns()).toEqual(["Planned column", "In Progress column"]);
  rerender(<ProjectBoard projects={[ALFRED, PORTAL]} options={board({ showEmpty: true })} ctx={ctx()} />);
  expect(columns()).toEqual(["Backlog column", "Planned column", "In Progress column", "Completed column"]);
  expect(within(screen.getByRole("region", { name: "Backlog column" })).getByLabelText("Feature count")).toHaveTextContent("0");
});

test("the board's columns are the status whatever the list's grouping", () => {
  render(<ProjectBoard projects={[ALFRED, PORTAL]} options={board({ groupBy: "lead" })} ctx={ctx()} />);
  expect(columns()).toEqual(["Planned column", "In Progress column"]);
});

test("a card: the cube and name; icon-only health, status, priority and the lead; the target date and PI; N issues", () => {
  render(<ProjectBoard projects={[ALFRED]} options={board()} ctx={ctx()} />);
  const c = card("Alfred");
  expect(c.querySelector("[data-part=cube] svg")).not.toBeNull();
  expect(c.querySelector("[data-part=name]")).toHaveTextContent(/^Alfred Onboarding$/);
  const marks = [...c.querySelectorAll("[data-part=marks] > *")].map((m) => m.getAttribute("data-part"));
  expect(marks).toEqual(["health", "status", "priority", "lead"]);
  const health = within(c).getByRole("button", { name: "On track, last update 3 days ago" });
  expect(health.textContent).toBe(""); // icon only
  expect(c.querySelector("[data-part=status]")).toHaveAttribute("aria-label", "In Progress");
  expect(within(c).getByRole("img", { name: "No priority" })).toBeInTheDocument();
  expect(within(c).getByLabelText("Dana Demo")).toBeInTheDocument();
  const dates = c.querySelector("[data-part=dates]") as HTMLElement;
  expect(dates).toHaveTextContent("Oct 1stPI 4");
  expect(dates.querySelector(".text-overrun")).not.toBeNull(); // past target and not Completed
  expect(c.querySelector("[data-part=issues]")).toHaveTextContent(/^6 stories$/);
});

test("a card's PI resolves through any team copy; one issue reads singular", () => {
  render(<ProjectBoard projects={[{ ...PORTAL, issue_count: 1 }]} options={board()} ctx={ctx()} />);
  const c = card("Enterprise");
  expect(c.querySelector("[data-part=dates]")).toHaveTextContent("Feb 15th, 2027PI 4");
  expect(c.querySelector("[data-part=dates] .text-overrun")).toBeNull();
  expect(c.querySelector("[data-part=issues]")).toHaveTextContent(/^1 story$/);
});

test("with no update the card leaves health out, as Linear's does", () => {
  render(<ProjectBoard projects={[PORTAL]} options={board()} ctx={ctx()} />);
  const marks = [...card("Enterprise").querySelectorAll("[data-part=marks] > *")].map((m) => m.getAttribute("data-part"));
  expect(marks).toEqual(["status", "priority", "lead"]);
});

test("priority shows only when the workspace has the field (D38)", () => {
  render(<ProjectBoard projects={[ALFRED]} options={board()} ctx={ctx(false)} />);
  expect(within(card("Alfred")).queryByRole("img", { name: "No priority" })).toBeNull();
  expect(card("Alfred").querySelector("[data-part=priority]")).toBeNull();
});

test("a card for a project with no target renders without a date row (Review Focus 1)", () => {
  const bare: Project = { ...INTAKE, target: null, pi_id: null };
  const piOnly: Project = { ...INTAKE, id: 16, key: "F16", name: "Scoping", target: null, pi_id: 701 };
  render(<ProjectBoard projects={[bare, piOnly]} options={board()} ctx={ctx()} />);
  const c = card("Intake");
  expect(c.querySelector("[data-part=dates]")).toBeNull();
  expect(c.querySelector("[data-part=issues]")).toHaveTextContent("10 stories");
  expect(c).not.toHaveTextContent("NaN");
  const p = card("Scoping").querySelector("[data-part=dates]") as HTMLElement;
  expect(p).toHaveTextContent(/^PI 4$/); // the PI keeps its slot; no calendar, no date
  expect(p.querySelector("svg")).toBeNull();
});

test("the card's display properties follow the Display menu", () => {
  render(<ProjectBoard projects={[ALFRED]} options={board({ properties: ["id", "status"] })} ctx={ctx()} />);
  const c = card("Alfred");
  expect(c.querySelector("[data-part=id]")).toHaveTextContent("F12");
  expect([...c.querySelectorAll("[data-part=marks] > *")].map((m) => m.getAttribute("data-part"))).toEqual(["status"]);
  expect(c.querySelector("[data-part=dates]")).toBeNull();
  expect(c.querySelector("[data-part=issues]")).toBeNull();
});

test("clicking a card opens the project; its health opens the updates", () => {
  render(<ProjectBoard projects={[ALFRED]} options={board()} ctx={ctx()} />);
  const c = card("Alfred");
  expect(c).toHaveAttribute("href", "/project/F12");
  fireEvent.click(c);
  expect(formatRoute(uiStore.getState().route)).toBe("/project/F12");
  fireEvent.click(within(c).getByRole("button", { name: "On track, last update 3 days ago" }));
  expect(formatRoute(uiStore.getState().route)).toBe("/project/F12/activity");
});

test("the board reads in Rally's words: columns, cards, counts", () => {
  const { container } = render(<ProjectBoard projects={[SHIPPED, ALFRED, INTAKE, PORTAL, { ...PORTAL, id: 20, key: "F20", name: "Solo", issue_count: 1 }]} options={board({ showEmpty: true })} ctx={ctx()} />);
  expect(screen.getByRole("group", { name: "Features board" })).toBeInTheDocument();
  expect(card("Alfred").querySelector("[data-part=issues]")).toHaveTextContent(/^6 stories$/);
  expect(card("Solo").querySelector("[data-part=issues]")).toHaveTextContent(/^1 story$/);
  expect(card("Enterprise").querySelector("[data-part=issues]")).toHaveTextContent(/^2 stories$/);
  expectRallyWords(container);
});

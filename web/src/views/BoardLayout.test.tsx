import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeIssue, makeProject, SPRINT3 } from "../test/fixtures";
import { BoardLayout } from "./BoardLayout";
import { buildGroups } from "./model";
import type { DisplayOptions } from "./types";
import { expectRallyWords } from "../test/vocabulary";

const options: DisplayOptions = { layout: "board", groupBy: "status", orderBy: "priority", showEmpty: false, completed: "day", collapsed: [],
  properties: ["priority", "id", "status", "labels", "project", "cycle", "estimate", "assignee", "created"] };
const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: { 201: makeProject() }, cycles: { 301: SPRINT3 }, teams: {} };
const many = Array.from({ length: 175 }, (_, n) => makeIssue({ id: 5000 + n, key: `US${5000 + n}`, status: "todo", rank: `R${n}` }));

beforeEach(() => {
  appStore.setState({ projects: { 201: makeProject() }, cycles: { 301: SPRINT3 } });
  uiStore.setState(uiStore.getInitialState(), true);
});

test("columns hold the viewport height and scroll on their own, below a fixed header", () => {
  // Review focus 3: a 175-card column must not stretch the page.
  render(<BoardLayout label="Board" groups={buildGroups(many, options, ctx)} options={options} onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const board = screen.getByRole("listbox", { name: "Board" });
  expect(board.className).toContain("overflow-y-hidden");
  const column = screen.getByRole("region", { name: "Todo column" });
  expect(column.className).toContain("h-full");
  const body = column.querySelector("[data-column-body]")!;
  expect(body.className).toContain("overflow-y-auto");
  expect(body.contains(within(column).getByRole("heading", { name: "Todo" }))).toBe(false);
  expect(within(body as HTMLElement).getAllByRole("option")).toHaveLength(175);
});

test("a column header shows icon, name, points, and … and + buttons; the footer adds a story too", () => {
  render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo", estimate: 3 })], options, ctx)} options={options}
    onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const column = screen.getByRole("region", { name: "Todo column" });
  expect(within(column).getByTitle("3 points")).toHaveTextContent("3");
  fireEvent.click(within(column).getByRole("button", { name: "Create new story" }));
  expect(uiStore.getState().composerPrefill).toEqual({ status: "todo" });
  fireEvent.click(within(column).getByRole("button", { name: "Add new story" }));
  expect(uiStore.getState().composerOpen).toBe(true);
});

test("a card: ID and avatar, status and title, a chip row, then the created date", () => {
  render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo", labels: ["ux"] })], options, ctx)} options={options}
    onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const card = screen.getByRole("option", { name: /Example story/ });
  expect(card.className).toContain("shadow-card");
  expect(card.className).toContain("p-2");
  for (const text of ["US1001", "Sprint 3", "[DEMO] Feature A", "ux", "Created Oct 1"]) expect(within(card).getByText(text)).toBeInTheDocument();
  expect(within(card).getByRole("img", { name: "High" })).toBeInTheDocument();
});

test("collapsing a column from its … menu", () => {
  const onToggleGroup = vi.fn();
  render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo" })], options, ctx)} options={options} onDrop={vi.fn()} onToggleGroup={onToggleGroup} />);
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Collapse column" }));
  expect(onToggleGroup).toHaveBeenCalledWith("todo");
});

test("a board in Rally's words: its columns, cards and add buttons", () => {
  const { container } = render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo" }), makeIssue({ id: 2, kind: "defect", status: "todo", project_id: null })], options, ctx)}
    options={options} onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const column = screen.getByRole("region", { name: "Todo column" });
  expect(within(column).getByRole("button", { name: "Add new story" })).toBeInTheDocument();
  expectRallyWords(container);
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeIssue, makeProject, makeSubIssue, SAM, SPRINT3 } from "../test/fixtures";
import { buildGroups } from "../views/model";
import { ALL_PROPERTIES } from "../views/options";
import { GroupHeader } from "./GroupHeader";
import { IssueRow } from "./IssueRow";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";
import { SubIssueRow } from "./SubIssueRow";
import { expectRallyWords } from "../test/vocabulary";

beforeEach(() => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});

test("status and priority icons name themselves", () => {
  render(<><StatusIcon status="in_review" /><StatusIcon status="backlog" /><PriorityIcon priority={1} /><PriorityIcon priority={0} /><PriorityIcon priority={3} /></>);
  for (const name of ["In Review", "Backlog", "Urgent", "No priority", "Medium"]) expect(screen.getByRole("img", { name })).toBeInTheDocument();
});

const allOn = ["priority", "id", "status", "labels", "project", "cycle", "estimate", "assignee", "creator", "created", "updated"] as const;

test("a row shows only the chosen properties, in Linear's order, with the created date after the avatar", () => {
  appStore.setState({ projects: { 201: makeProject() }, cycles: { 301: SPRINT3 } });
  const issue = makeIssue({ labels: ["ux", "api", "infra"], creator: SAM });
  const { rerender } = render(<IssueRow issue={issue} properties={[...allOn]} />);
  for (const text of ["US1001", "[DEMO] Feature A", "Sprint 3", "ux", "api", "+1", "Oct 1"]) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByText("Sprint 3").closest("[title]")).toHaveAttribute("title", expect.stringMatching(/^PI 4 · Sprint 3 · Oct \d+ → Oct \d+$/));
  const row = screen.getByRole("option");
  const order = ["High", "US1001", "In Progress", "[DEMO] Example story", "ux", "[DEMO] Feature A", "Sprint 3", "5", "Dana Demo", "Oct 1", "Sam Sample"];
  const nodes = order.map((t) => within(row).getAllByText((_, el) => el?.getAttribute("aria-label") === t || el?.textContent === t)[0]);
  for (let i = 1; i < nodes.length; i++) expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
  rerender(<IssueRow issue={issue} properties={["id"]} />);
  expect(screen.queryByText("[DEMO] Feature A")).toBeNull();
  expect(screen.queryByRole("img", { name: "High" })).toBeNull();
  expect(screen.getByText("US1001")).toBeInTheDocument();
});

test("double-clicking the checkbox selects; it never opens the issue", () => {
  render(<IssueRow issue={makeIssue()} properties={["id"]} />);
  fireEvent.doubleClick(screen.getByRole("checkbox", { name: "Select US1001" }));
  expect(uiStore.getState().route.name).not.toBe("issue");
});

test("a group header: caret, icon, name, points total, cycle dates and a + that pre-fills the composer", () => {
  appStore.setState({ cycles: { 302: { ...SPRINT3, id: 302, start: "2026-10-22T04:00:00.000Z", end: "2026-11-05T03:59:59.000Z", name: "PI 4 · Sprint 4", short_name: "Sprint 4" } } });
  const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: {}, cycles: appStore.getState().cycles,
                teams: { 9001: { id: 9001, name: "Data Services", level: "team" as const, parent_id: null } } };
  const [group] = buildGroups([makeIssue({ cycle_id: 302, status: "todo", priority: 3, estimate: 3 }), makeIssue({ id: 2, cycle_id: 302, status: "todo", priority: 3, estimate: 5 })],
    { groupBy: "focus", orderBy: "importance", showEmpty: false, layout: "list" }, ctx);
  const onToggle = vi.fn();
  render(<GroupHeader group={group} collapsed={false} onToggle={onToggle} />);
  expect(screen.getByRole("heading", { name: "PI 4 · Sprint 4 · Data Services" })).toBeInTheDocument();
  expect(screen.getByTitle("8 points")).toHaveTextContent("8");
  expect(screen.getByText(/^Oct 22 → Nov 4$/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Collapse group" }));
  expect(onToggle).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create new story" }));
  expect(uiStore.getState()).toMatchObject({ composerOpen: true, composerPrefill: { teamId: 9001, cycle_id: 302, status: "todo" } });
});

test("a group header bar is inset 8 either side, as Linear's: caret, icon box, name and count at Linear's offsets", () => {
  const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: {}, cycles: {}, teams: {} };
  const [group] = buildGroups([makeIssue({ status: "in_review", estimate: 2 })],
    { groupBy: "status", orderBy: "importance", showEmpty: false, layout: "list" }, ctx);
  const { container } = render(<GroupHeader group={group} collapsed={false} onToggle={() => {}} />);
  const bar = container.firstElementChild as HTMLElement;
  // team-active / project-issues bars (t19): x253 w1458 on a list from 245, radius 8, fill `hover`;
  // caret at +10, the status icon at +35 in a 16 box, the name at +58, the count 8 after it, the + 8 from the right end.
  expect(bar.className.split(" ")).toEqual(expect.arrayContaining(["mx-2", "pl-2", "pr-2", "gap-1.5", "rounded-control", "bg-hover"]));
  expect(bar.className).not.toMatch(/\bp[lr]-4\b/);
  const icon = bar.children[1] as HTMLElement;
  expect(icon.className.split(" ")).toEqual(expect.arrayContaining(["w-4", "justify-center", "empty:hidden"]));
  expect(screen.getByRole("heading", { name: "In Review" }).className).toContain("ml-0.5");
  expect(screen.getByTitle("2 points").className.split(" ")).toEqual(expect.arrayContaining(["ml-0.5", "gap-1"]));
});

test("click selects, the checkbox multi-selects, double-click opens the issue page", () => {
  render(<IssueRow issue={makeIssue()} properties={ALL_PROPERTIES} />);
  const row = screen.getByRole("option", { name: /Example story/ });
  fireEvent.click(row);
  expect(uiStore.getState().selectedId).toBe(1001);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select US1001" }));
  expect(uiStore.getState().selectedIds).toEqual([1001]);
  fireEvent.doubleClick(row);
  expect(uiStore.getState().route).toEqual({ name: "issue", key: "US1001" });
});

test("a sub-issue row completes its sub-issue", () => {
  const spy = vi.spyOn(appStore.getState(), "updateSubIssue").mockResolvedValue();
  render(<SubIssueRow sub={makeSubIssue()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Complete TA4001" }));
  expect(spy).toHaveBeenCalledWith(4001, { status: "done" });
});

test("a row and a group header read in Rally's words, titles and chips included", () => {
  appStore.setState({ projects: { 201: makeProject() }, cycles: { 301: SPRINT3 } });
  const { container } = render(<IssueRow issue={makeIssue({ kind: "defect", key: "DE9", title: "[DEMO] Broken thing" })} properties={ALL_PROPERTIES} />);
  expectRallyWords(container);
  const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: {}, cycles: { 301: SPRINT3 }, teams: {} };
  const [group] = buildGroups([makeIssue()], { groupBy: "cycle", orderBy: "priority", showEmpty: false, layout: "list" }, ctx);
  const header = render(<GroupHeader group={group} collapsed={false} onToggle={() => {}} />);
  expect(header.getByRole("button", { name: "Create new story" })).toBeInTheDocument();
  expectRallyWords(header.container);
});

test("counts take the plural of story: 1 story, 2 stories", () => {
  const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: {}, cycles: {}, teams: {} };
  const opts = { groupBy: "status" as const, orderBy: "priority" as const, showEmpty: false, layout: "list" as const };
  for (const [issues, title] of [[[makeIssue({ estimate: null })], "1 story"], [[makeIssue({ estimate: null }), makeIssue({ id: 2, estimate: null })], "2 stories"]] as const) {
    const [group] = buildGroups([...issues], opts, ctx);
    const { unmount } = render(<GroupHeader group={group} collapsed={false} onToggle={() => {}} />);
    expect(screen.getByTitle(title)).toBeInTheDocument();
    unmount();
  }
});

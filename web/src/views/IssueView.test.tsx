import type { DragEndEvent } from "@dnd-kit/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve, SPRINT3 } from "../test/fixtures";
import { IssueView } from "./IssueView";
import { handleDragEnd } from "./ListLayout";
import type { Scope } from "./types";
import { expectRallyWords } from "../test/vocabulary";

const MY: Scope = { kind: "my", tab: "assigned" };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  serve({ "GET /api/bootstrap": makeBootstrap() });
  await appStore.getState().load();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("My stories groups your work across teams by Focus and registers the J/K order", () => {
  render(<IssueView scope={MY} label="My stories" empty={<p>empty</p>} />);
  const list = screen.getByRole("listbox", { name: "My stories" });
  expect(within(list).getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["Urgent stories", "PI 4 · Sprint 3 · Data Services", "Backlog"]);
  expect(within(list).getByRole("option", { name: /Real AI\/ML work/ })).toBeInTheDocument(); // the other team
  expect(within(list).queryByRole("option", { name: /Sam's story/ })).toBeNull();
  expect(uiStore.getState().visibleIds).toEqual([1201, 1001, 1002]);
});

test("Display switches to a board and remembers it for this view", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  fireEvent.click(screen.getByRole("tab", { name: "Board" }));
  expect(screen.getByRole("region", { name: "Backlog column" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("mira-view:v2:my:assigned")!).layout).toBe("board");
});

test("the Display menu: Focus with a disabled Importance ordering, Completed stories, properties in Linear's order", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  const menu = screen.getByRole("dialog", { name: "Display options" });
  expect(within(menu).getByRole("button", { name: "Grouping: Focus" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Ordering: Importance" })).toBeDisabled();
  expect(within(menu).getByRole("button", { name: "Ordering: Importance" })).toHaveAttribute("title", "Ordering is disabled for Focus grouping");
  expect(within(menu).getByRole("button", { name: "Completed stories: Past day" })).toBeInTheDocument();
  expect(within(menu).queryByRole("switch", { name: "Show empty groups" })).toBeNull(); // team views only
  expect(within(within(menu).getByRole("group", { name: "Display properties" })).getAllByRole("button").map((b) => b.textContent))
    .toEqual(["ID", "Status", "Assignee", "Creator", "Priority", "Feature", "Sprint", "Estimate", "Labels", "Created", "Updated"]);
});

test("grouping by assignee with empty groups shows No assignee", () => {
  const team = { kind: "team", teamId: 9001, tab: "active" } as const;
  serve({ "GET /api/bootstrap": makeBootstrap() });
  appStore.setState({ teamState: { 9001: { status: "ready", memberIds: [501, 502] } } });
  render(<IssueView scope={team} label="Data Services active" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  fireEvent.click(screen.getByRole("button", { name: "Grouping: Status" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Assignee" }));
  fireEvent.click(screen.getByRole("switch", { name: "Show empty groups" }));
  expect(screen.getByRole("region", { name: "Dana Demo" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "No assignee" })).toBeInTheDocument();
});

test("a priority filter narrows the view, with a chip that clears it; values show counts", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  const menu = screen.getByRole("menu", { name: "Filter" });
  expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent?.trim()))
    .toEqual(["Team", "Status", "Assignee", "Creator", "Priority", "Estimate", "Labels", "Feature", "Sprint"]);
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Priority" }));
  const urgent = screen.getByRole("menuitemcheckbox", { name: /Urgent/ });
  expect(urgent).toHaveTextContent("1 story");
  fireEvent.click(urgent);
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByText("Priority is Urgent")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear Priority filter" }));
  expect(screen.getAllByRole("option")).toHaveLength(3);
});

test("a sprint filter lists each team's sprint with its team", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Sprint" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /PI 4 · Sprint 3 · Data Services/ }));
  expect(screen.getAllByRole("option").map((o) => o.getAttribute("data-issue-id"))).toEqual(["1001"]);
});

test("an empty view shows its empty state", () => {
  render(<IssueView scope={{ kind: "team", teamId: 9002, tab: "backlog" }} label="Backlog" empty={<p>Nothing here</p>} />);
  expect(screen.getByText("Nothing here")).toBeInTheDocument();
});

test("selecting rows brings up the bulk bar, whose pickers target the selection", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select US1001" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select US1002" }));
  const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
  expect(bar).toHaveTextContent("2 selected");
  fireEvent.click(within(bar).getByRole("button", { name: "Priority…" }));
  expect(uiStore.getState().palette).toEqual({ open: true, picker: "priority", targetIds: [1001, 1002] });
});

test("on the board, a multi-selected card shows as selected", () => {
  localStorage.setItem("mira-view:v2:my:assigned", JSON.stringify({ layout: "board" }));
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  const card = () => screen.getByRole("option", { name: /Real AI\/ML work/ });
  expect(card()).toHaveAttribute("aria-selected", "false");
  act(() => uiStore.getState().toggleSelected(1201));
  expect(card()).toHaveAttribute("aria-selected", "true");
  expect(card().className).toContain("bg-selected");
});

test("on the board, the selected card scrolls into view", () => {
  localStorage.setItem("mira-view:v2:my:assigned", JSON.stringify({ layout: "board" }));
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  act(() => uiStore.getState().select(1201));
  expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  scroll.mockRestore();
});

test("drag ends map to group keys and the row dropped on", () => {
  const onDrop = vi.fn();
  const active = { id: 1001, data: { current: { groupKey: "in_progress" } } };
  handleDragEnd({ active, over: { id: 1201, data: { current: { groupKey: "todo" } } } } as unknown as DragEndEvent, onDrop);
  expect(onDrop).toHaveBeenCalledWith(1001, "in_progress", "todo", 1201);
  handleDragEnd({ active, over: { id: "group:done", data: { current: { groupKey: "done" } } } } as unknown as DragEndEvent, onDrop);
  expect(onDrop).toHaveBeenLastCalledWith(1001, "in_progress", "done", null);
  handleDragEnd({ active, over: null } as unknown as DragEndEvent, onDrop);
  expect(onDrop).toHaveBeenCalledTimes(2);
});

test("the toolbar is one row: tabs on the left, round Filter and Display buttons on the right", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} tabs={<span>TABS</span>} />);
  const row = screen.getByText("TABS").parentElement!;
  expect(within(row).getByRole("button", { name: "Add filter" }).className).toContain("rounded-full");
  expect(within(row).getByRole("button", { name: "Display options" })).toBeInTheDocument();
});

test("Display shows a dot once the view differs from its defaults", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  const display = () => screen.getByRole("button", { name: "Display options" });
  expect(display().querySelector("[data-dot]")).toBeNull();
  act(() => uiStore.getState().flipLayout()); // ⌘B
  expect(screen.getByRole("region", { name: "Backlog column" })).toBeInTheDocument();
  expect(display().querySelector("[data-dot]")).not.toBeNull();
});

test("⌘B in one view doesn't flip the next view on mount", () => {
  act(() => uiStore.getState().flipLayout());
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  expect(screen.getByRole("listbox", { name: "My stories" }).querySelector('[aria-label$=" column"]')).toBeNull();
});

test("collapsing a group hides its rows and is remembered", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(within(screen.getByRole("region", { name: "Backlog" })).getByRole("button", { name: "Collapse group" }));
  expect(within(screen.getByRole("region", { name: "Backlog" })).queryAllByRole("option")).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("mira-view:v2:my:assigned")!).collapsed).toEqual(["f:backlog"]);
});

test("the board keeps the footer and drops collapsed columns from the J/K order", () => {
  localStorage.setItem("mira-view:v2:my:assigned", JSON.stringify({ layout: "board", collapsed: ["f:backlog"] }));
  render(<IssueView scope={MY} label="My stories" empty={null} footer={<p>load more</p>} />);
  expect(screen.getByText("load more")).toBeInTheDocument();
  expect(uiStore.getState().visibleIds).toEqual([1201, 1001]);
});

test("a collapsed group's issues leave the J/K order", () => {
  render(<IssueView scope={MY} label="My stories" empty={null} />);
  fireEvent.click(within(screen.getByRole("region", { name: "Backlog" })).getByRole("button", { name: "Collapse group" }));
  expect(uiStore.getState().visibleIds).toEqual([1201, 1001]);
});

describe("an ART team view", () => {
  const art = { kind: "team", teamId: 10, tab: "all" } as const;
  const teams = [
    { id: 10, name: "Platform ART", level: "art" as const, parent_id: null },
    { id: 11, name: "Team Alpha", level: "team" as const, parent_id: 10 },
    { id: 12, name: "Team Beta", level: "team" as const, parent_id: 10 },
  ];
  const sprint = (id: number, team_id: number, over = {}) => ({ ...SPRINT3, id, team_id, ...over });
  const groupCycles = (cycles: ReturnType<typeof sprint>[]) => {
    appStore.setState({
      teams: { ...appStore.getState().teams, ...Object.fromEntries(teams.map((t) => [t.id, t])) },
      cycles: Object.fromEntries(cycles.map((c) => [c.id, c])),
      issues: Object.fromEntries([makeIssue({ id: 1, team_id: 11, cycle_id: cycles[0].id }), makeIssue({ id: 2, team_id: 12, cycle_id: cycles[1].id })]
        .map((i) => [i.id, i])),
      teamState: { 10: { status: "ready", memberIds: [] } },
    });
    render(<IssueView scope={art} label="Platform ART all" empty={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Display options" }));
    fireEvent.click(screen.getByRole("button", { name: "Grouping: Status" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Sprint" }));
    return within(screen.getByRole("listbox", { name: "Platform ART all" })).getAllByRole("region");
  };

  test("ART merges same-named cycles with equal dates into one group", () => {
    const regions = groupCycles([sprint(501, 11), sprint(502, 12)]);
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual(["PI 4 · Sprint 3"]);
    expect(within(regions[0]).getAllByRole("option")).toHaveLength(2); // both child teams' issues
  });

  test("same-named cycles with different dates stay two groups", () => {
    const regions = groupCycles([sprint(501, 11), sprint(502, 12, { start: "2026-10-09T04:00:00.000Z" })]);
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual(["PI 4 · Sprint 3", "PI 4 · Sprint 3"]);
  });
});

describe("Rally's words", () => {
  beforeEach(async () => {
    appStore.setState(appStore.getInitialState(), true);
    serve({ "GET /api/bootstrap": makeBootstrap() });
    await appStore.getState().load();
  });
  const defect = makeIssue({ id: 7001, key: "DE7001", kind: "defect", title: "[DEMO] Broken thing", project_id: null, cycle_id: null });

  const twin = makeIssue({ id: 7002, key: "US7002", title: "[DEMO] Broken thing", project_id: null, cycle_id: null });
  const shape = (row: Element) => row.outerHTML.replace(/DE7001|US7002/g, "KEY").replace(/data-issue-id="\d+"/, "").replace(/aria-selected="\w+"/, "");
  const rowOf = (id: number) => document.querySelector(`[role="option"][data-issue-id="${id}"]`)!;
  const withBoth = () => appStore.setState({ issues: { ...appStore.getState().issues, 7001: defect, 7002: twin } });

  test("a defect row reads like a story row: no defect or issue wording, the same shape", () => {
    withBoth();
    const { container } = render(<IssueView scope={MY} label="My stories" empty={null} />);
    const row = rowOf(7001);
    expect(row.getAttribute("aria-label") ?? "").not.toMatch(/defect|issue/i);
    expect(row.textContent).not.toMatch(/defect|issue/i);
    expect(shape(row)).toBe(shape(rowOf(7002)));
    expectRallyWords(container);
  });

  test("a defect card on the board reads like a story card: no defect or issue wording, the same shape", () => {
    withBoth();
    localStorage.setItem("mira-view:v2:my:assigned", JSON.stringify({ layout: "board" }));
    const { container } = render(<IssueView scope={MY} label="My stories" empty={null} />);
    const card = rowOf(7001);
    expect(card.textContent).not.toMatch(/defect|issue/i);
    expect(shape(card)).toBe(shape(rowOf(7002)));
    expectRallyWords(container);
  });

  test("the Display menu, in both layouts and its grouping and ordering lists", () => {
    const { baseElement } = render(<IssueView scope={{ kind: "team", teamId: 9001, tab: "active" }} label="Data Services active" empty={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Display options" }));
    expectRallyWords(baseElement);
    expect(within(screen.getByRole("group", { name: "Display properties" })).getAllByRole("button").map((b) => b.textContent)).toContain("Feature");
    fireEvent.click(screen.getByRole("button", { name: "Grouping: Status" }));
    expectRallyWords(baseElement);
    expect(screen.getByRole("menuitemcheckbox", { name: "Feature" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Sprint" })).toBeInTheDocument();
  });

  test("the Filter menu and its Feature and Sprint values", () => {
    appStore.setState({ issues: { ...appStore.getState().issues, 7001: defect } }); // a defect has no feature
    const { baseElement } = render(<IssueView scope={MY} label="My stories" empty={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expectRallyWords(baseElement);
    const menu = screen.getByRole("menu", { name: "Filter" });
    expect(within(menu).getByRole("menuitem", { name: "Feature" })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Feature" }));
    expectRallyWords(baseElement);
    expect(screen.getByRole("menuitemcheckbox", { name: /No feature/ })).toBeInTheDocument();
  });

  test("the Sprint filter and its No sprint value", () => {
    const { baseElement } = render(<IssueView scope={MY} label="My stories" empty={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sprint" }));
    expectRallyWords(baseElement);
    expect(screen.getByRole("menuitemcheckbox", { name: /No sprint/ })).toBeInTheDocument();
  });

  test("an applied story-count and the bulk bar", () => {
    const { baseElement } = render(<IssueView scope={MY} label="My stories" empty={null} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select US1001" }));
    expectRallyWords(baseElement);
    const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(within(bar).getByRole("button", { name: "Feature…" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Sprint…" })).toBeInTheDocument();
  });

  test("the toolbar count reads 1 story, 2 stories", () => {
    const view = (scope: Scope) => render(<IssueView scope={scope} label="Backlog" count empty={null} />);
    const { unmount } = view({ kind: "team", teamId: 9001, tab: "backlog" });
    expect(screen.getByText("1 story")).toBeInTheDocument();
    unmount();
    view({ kind: "team", teamId: 9001, tab: "all" });
    expect(screen.getByText(/^\d+ stories$/)).toBeInTheDocument();
  });

  test("filter value counts read \"1 story\"", () => {
    const { baseElement } = render(<IssueView scope={MY} label="My stories" empty={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Priority" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Urgent/ })).toHaveTextContent("1 story");
    expectRallyWords(baseElement);
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { DANA, makeBootstrap, makeIssue, makeProject, makeSubIssue, serve, SPRINT3 } from "../test/fixtures";
import { IssuePage } from "./IssuePage";

beforeEach(() => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

const detail = { issue: makeIssue(), sub_issues: [makeSubIssue()], comments: [], activity: [], cycles: [SPRINT3], projects: [makeProject()], users: [DANA] };

test("a story opened by its URL loads by key and shows its properties", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ issues: [] }), "GET /api/issues/US1001": detail, "GET /api/issues/1001": detail });
  await appStore.getState().load();
  const { container } = render(<IssuePage issueKey="US1001" />);
  expect(await screen.findByDisplayValue("[DEMO] Example story")).toBeInTheDocument();
  for (const name of ["Status: In Progress", "Priority: High", "Assignee: Dana Demo", "Feature: [DEMO] Feature A", "Sprint: PI 4 · Sprint 3"]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  expect(screen.getByRole("checkbox", { name: "Complete TA4001" })).toBeInTheDocument();
  const props = screen.getByRole("complementary", { name: "Properties" });
  expect(within(props).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Properties", "Labels", "Feature"]);
  expect(within(props).getAllByLabelText(/^(Status|Team|Priority|Assignee|Estimate|Sprint): /).map((e) => e.getAttribute("aria-label")))
    .toEqual(["Status: In Progress", "Team: Data Services", "Priority: High", "Assignee: Dana Demo", "Estimate: 5 Points", "Sprint: PI 4 · Sprint 3"]);
  expect(screen.getByRole("textbox", { name: "Story title" }).tagName).toBe("TEXTAREA");
  expect(await screen.findByRole("button", { name: "Add tasks" })).toBeInTheDocument();
  expectRallyWords(container);
  fireEvent.click(screen.getByRole("button", { name: "Priority: High" }));
  expect(uiStore.getState().palette).toMatchObject({ open: true, picker: "priority", targetIds: [1001] });
});

test("an unknown story says so instead of loading forever", async () => {
  // Review focus 2.
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/issues/US999999": [404, { error: "Story US999999 was not found" }] });
  await appStore.getState().load();
  const { container } = render(<IssuePage issueKey="US999999" />);
  expect(await screen.findByText("Story US999999 not found.")).toBeInTheDocument();
  expectRallyWords(container);
  expect(appStore.getState().toasts).toEqual([]);
});

test("the breadcrumb is where you came from, with a pager through that view", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/issues/1002": { ...detail, issue: makeIssue({ id: 1002, key: "US1002", status: "backlog", cycle_id: null }) },
          "GET /api/issues/1001": detail });
  await appStore.getState().load();
  uiStore.getState().navigate({ name: "team", teamId: 9001, tab: "backlog" });
  uiStore.getState().setVisible([1001, 1002]);
  uiStore.getState().openIssue("US1002");
  const { container } = render(<IssuePage issueKey="US1002" />);
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Add tasks" })).toBeInTheDocument();
  expectRallyWords(container); // the story menu and copy buttons too
  expect(screen.getByRole("button", { name: "Story options" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy story URL" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Navigate up" }));
  expect(uiStore.getState().route).toEqual({ name: "issue", key: "US1001" });
  fireEvent.click(screen.getByRole("button", { name: "Data Services › Backlog" }));
  expect(uiStore.getState().route).toEqual({ name: "team", teamId: 9001, tab: "backlog" });
});

test("Add tasks opens a title row; Enter creates it and keeps the row open", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/issues/1001": detail,
          "POST /api/issues/1001/sub-issues": [201, makeSubIssue({ id: 4100, key: "TA4100", title: "[DEMO] Step two" })] });
  await appStore.getState().load();
  const { container } = render(<IssuePage issueKey="US1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Add tasks" }));
  expect(await screen.findByText("TA4001", { exact: false })).toBeInTheDocument();
  expectRallyWords(container); // task list heading, count and the open title row
  const input = screen.getByRole("textbox", { name: "Task title" });
  expect(input).toHaveValue("[DEMO] "); // the server requires the prefix in demo mode
  fireEvent.change(input, { target: { value: "[DEMO] Step two" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText("[DEMO] Step two")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue("[DEMO] "); // demo mode keeps the prefix
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Task title" }));
});

test("a comment draft does not carry over to the next story", async () => {
  const second = { ...detail, issue: makeIssue({ id: 1002, key: "US1002", title: "[DEMO] Other story" }), sub_issues: [] };
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/issues/1001": detail, "GET /api/issues/1002": second });
  await appStore.getState().load();
  const { rerender } = render(<IssuePage issueKey="US1001" />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Leave a comment" }), { target: { value: "for story A" } });
  rerender(<IssuePage issueKey="US1002" />);
  expect(await screen.findByDisplayValue("[DEMO] Other story")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Leave a comment" })).toHaveValue("");
});

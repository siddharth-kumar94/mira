import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { RowMenu } from "./RowMenu";
import { expectRallyWords } from "../test/vocabulary";

let fetchMock: ReturnType<typeof serve>;
beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap(),
    "PATCH /api/issues/1001": makeIssue({ status: "in_review" }),
    "PATCH /api/issues/1002": makeIssue({ id: 1002, key: "US1002", status: "in_review" }),
    "GET /api/users": [{ id: 777, name: "Pat Person" }],
  });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("right-click: Linear's items in order, with bare shortcut glyphs", () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  const menu = screen.getByRole("menu", { name: "Story actions" });
  expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
    "StatusS", "PriorityP", "AssigneeA", "LabelsL", "Feature⇧ P", "Estimate⇧ E", "Sprint⇧ C", "Mark as", "Copy", "Open in"]);
  expect(uiStore.getState().selectedId).toBe(1001);
});

test("a property submenu checks the current value and writes the choice", async () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Status/ }));
  const sub = screen.getByRole("menu", { name: "Status" });
  expect(within(sub).getByRole("menuitemcheckbox", { name: /In Progress/ })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(within(sub).getByRole("menuitemcheckbox", { name: /In Review/ }));
  expect(appStore.getState().issues[1001].status).toBe("in_review");
  expect(uiStore.getState().contextMenu).toBeNull();
});

test("on a multi-selection the menu acts on every selected issue", async () => {
  render(<RowMenu />);
  act(() => {
    uiStore.getState().toggleSelected(1001);
    uiStore.getState().toggleSelected(1002);
    uiStore.getState().openContextMenu(1002, 300, 200);
  });
  fireEvent.click(screen.getByRole("menuitem", { name: /^Status/ }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /In Review/ }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => i?.method === "PATCH")).toHaveLength(2));
});

test("Esc closes it before anything else", () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  act(() => uiStore.getState().closeTopOverlay());
  expect(screen.queryByRole("menu", { name: "Story actions" })).toBeNull();
});

test("typing two letters in the assignee list searches the whole workspace (D16)", async () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Assignee/ }));
  const filter = within(screen.getByRole("menu", { name: "Assignee" })).getByPlaceholderText("Filter…");
  fireEvent.change(filter, { target: { value: "p" } });
  fireEvent.change(filter, { target: { value: "pat" } });
  expect(await screen.findByRole("menuitemcheckbox", { name: "Pat Person" }, { timeout: 2000 })).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/users")).map(([url]) => String(url))).toEqual(["/api/users?q=pat"]);
});

test("the row menu, its submenus and the Project and Cycle entries are in Rally's words", () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  expectRallyWords(document.body);
  expect(screen.getByRole("menu", { name: "Story actions" })).toBeInTheDocument();
  for (const sub of [/^Feature/, /^Sprint/, /^Copy/, /^Mark as/]) {
    fireEvent.click(screen.getByRole("menuitem", { name: sub }));
    expectRallyWords(document.body);
  }
});

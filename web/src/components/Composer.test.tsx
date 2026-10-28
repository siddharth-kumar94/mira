import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Route } from "../route";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { makeBootstrap, makeIssue, makeProject, makeTeamLoad, serve, SPRINT3 } from "../test/fixtures";
import { cycleKey } from "../views/model";
import { Composer } from "./Composer";

let fetchMock: ReturnType<typeof serve>;
beforeEach(async () => {
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap(),
    "GET /api/teams/9001": makeTeamLoad({ projects: [makeProject(), makeProject({ id: 203, key: "F203", name: "[DEMO] Feature B" })] }),
    "GET /api/teams/9002": makeTeamLoad({ team: { id: 9002, name: "AI/ML Solutions", level: "team", parent_id: null }, projects: [] }),
    "GET /api/users": [{ id: 777, name: "Pat Person" }],
    "POST /api/issues": [201, makeIssue({ id: 1600, key: "US1600", title: "[DEMO] New one", status: "todo" })],
  });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

const openIn = (route: Route) => act(() => {
  uiStore.getState().navigate(route);
  uiStore.getState().setComposer(true);
});
const chip = (name: RegExp) => screen.getByRole("button", { name });

test("the dialog: team chip, New story, Close; title and description; seven chips; Create more and Create story", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  const dialog = screen.getByRole("dialog", { name: "Create story" });
  expect(dialog.className).toContain("rounded-(--radius-composer)");
  expect(within(dialog).getByRole("button", { name: "Set team" })).toHaveTextContent("Data Services");
  expect(within(dialog).getByText("New story")).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox", { name: "Story title" })).toHaveValue("[DEMO] ");
  expect(within(dialog).getByRole("textbox", { name: "Story description" })).toHaveAttribute("placeholder", "Add description…");
  expect(within(dialog).getAllByRole("button", { name: /^(Change|Add to sprint)/ }).map((b) => b.getAttribute("aria-label")?.split(".")[0]))
    .toEqual(["Change status", "Change priority", "Change assignee", "Change feature", "Change estimate", "Change labels", "Add to sprint"]);
  expect(chip(/^Change status/)).toHaveTextContent("Todo"); // inside Active (spec §8)
  expect(within(dialog).getByRole("switch", { name: "Create more" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
  await waitFor(() => expect(chip(/^Change feature/)).toHaveTextContent("[DEMO] Feature A"));
  expectRallyWords(document.body); // dialog text, aria-labels and placeholders once the team has loaded
});

test("each chip's picker reads in Rally's words", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  await waitFor(() => expect(chip(/^Change feature/)).toHaveTextContent("[DEMO] Feature A"));
  for (const name of [/^Change status/, /^Change priority/, /^Change assignee/, /^Change feature/, /^Change estimate/, /^Change labels/, /^Add to sprint/]) {
    fireEvent.click(chip(name));
    expect(await screen.findAllByRole("menuitemcheckbox")).not.toHaveLength(0); // the picker's options are there
    expectRallyWords(document.body);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  }
  expect(chip(/^Add to sprint/).getAttribute("aria-label")).toContain("Add to sprint");
  fireEvent.click(chip(/^Add to sprint/));
  expect(screen.getByPlaceholderText("Add to sprint…")).toBeInTheDocument();
});

test("a chip opens its picker under it; choosing sets the value; numbers pick", async () => {
  openIn({ name: "my", tab: "assigned" });
  render(<Composer />);
  expect(chip(/^Change assignee/)).toHaveTextContent("Dana Demo"); // you, from My stories
  fireEvent.click(chip(/^Change priority/));
  fireEvent.keyDown(screen.getByPlaceholderText("Set priority to…"), { key: "2" });
  expect(chip(/^Change priority/)).toHaveTextContent("High");
  fireEvent.click(chip(/^Change estimate/));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^5 Points/ }));
  expect(chip(/^Change estimate/)).toHaveTextContent("5 Points");
});

test("Create stays disabled until the title says more than the prefix", () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  const create = screen.getByRole("button", { name: "Create story" });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Story title"), { target: { value: "No prefix" } });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Story title"), { target: { value: "[DEMO] Fine" } });
  expect(create).toBeEnabled();
});

test("⌘↵ creates with team, project, description and chips, and remembers the project", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  await waitFor(() => expect(chip(/^Change feature/)).toHaveTextContent("[DEMO] Feature A"));
  fireEvent.change(screen.getByLabelText("Story description"), { target: { value: "Line one" } });
  const title = screen.getByLabelText("Story title");
  fireEvent.change(title, { target: { value: "[DEMO] New one" } });
  fireEvent.keyDown(title, { key: "Enter", metaKey: true });
  await waitFor(() => expect(uiStore.getState().composerOpen).toBe(false));
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toMatchObject({ team_id: 9001, project_id: 201, title: "[DEMO] New one", status: "todo",
    description: "<p>Line one</p>", position: "top" });
  expect(localStorage.getItem("mira-last-project:9001")).toBe("201");
});

test("Create more keeps it open with the same team and chips, and a fresh title", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  await waitFor(() => expect(chip(/^Change feature/)).toHaveTextContent("[DEMO] Feature A"));
  fireEvent.click(screen.getByRole("switch", { name: "Create more" }));
  fireEvent.change(screen.getByLabelText("Story title"), { target: { value: "[DEMO] New one" } });
  fireEvent.click(screen.getByRole("button", { name: "Create story" }));
  await waitFor(() => expect(screen.getByLabelText("Story title")).toHaveValue("[DEMO] "));
  expect(uiStore.getState().composerOpen).toBe(true);
  expect(chip(/^Change feature/)).toHaveTextContent("[DEMO] Feature A");
});

test("a team with no features says so in Rally's words, and only once the team has loaded", async () => {
  act(() => {
    uiStore.getState().navigate({ name: "my", tab: "assigned" });
    uiStore.getState().openComposer({ teamId: 9002 });
  });
  render(<Composer />);
  expect(screen.queryByText(/no \[DEMO\] features/)).toBeNull(); // not before the load answers
  expect(await screen.findByText("This team has no [DEMO] features to add stories to.")).toBeInTheDocument();
  expectRallyWords(document.body);
  expect(screen.queryByText(/Rally/)).toBeNull();
});

test("a group's + opens the composer pre-filled", () => {
  act(() => {
    uiStore.getState().navigate({ name: "my", tab: "assigned" });
    uiStore.getState().openComposer({ teamId: 9001, status: "in_review", priority: 1 });
  });
  render(<Composer />);
  expect(chip(/^Change status/)).toHaveTextContent("In Review");
  expect(chip(/^Change priority/)).toHaveTextContent("Urgent");
});

test("from an ART's cycle page, another team takes its own copy of the cycle; without the key, the cycle is cleared", () => {
  act(() => uiStore.getState().openComposer({ teamId: 9001, cycle_id: 301, status: "todo", cycleKey: cycleKey(SPRINT3) }));
  render(<Composer />);
  expect(chip(/^Add to sprint/)).toHaveTextContent("Sprint 3");
  fireEvent.click(chip(/^Set team/));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "AI/ML Solutions" }));
  expect(chip(/^Set team/)).toHaveTextContent("AI/ML Solutions");
  const draft = () => chip(/^Add to sprint/).textContent;
  expect(draft()).toContain("Sprint 3"); // SPRINT3_AIML (401), the same name and dates
  act(() => uiStore.getState().setComposer(false));
  act(() => uiStore.getState().openComposer({ teamId: 9001, cycle_id: 301, status: "todo" }));
  fireEvent.click(chip(/^Set team/));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "AI/ML Solutions" }));
  expect(draft()).not.toContain("Sprint 3");
});

test("Esc closes an open picker first, then the dialog", () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  fireEvent.click(chip(/^Change status/));
  expect(screen.getByRole("menu").className).toContain("shadow-menu");
  expect(screen.getByRole("menu").className).not.toContain("shadow-palette");
  fireEvent.keyDown(screen.getByPlaceholderText("Change status…"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(uiStore.getState().composerOpen).toBe(true);
  fireEvent.keyDown(screen.getByLabelText("Story title"), { key: "Escape" });
  expect(uiStore.getState().composerOpen).toBe(false);
});

test("the Labels chip lists plain label names, not Add/Remove wording", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  fireEvent.click(chip(/^Change labels/));
  const names = within(screen.getByRole("menu", { name: "Add labels…" })).getAllByRole("menuitemcheckbox").map((m) => m.getAttribute("aria-label"));
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((n) => !/^(Add|Remove) /.test(n!))).toBe(true);
});

test("typing two letters in the assignee list searches the whole workspace (D16)", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  fireEvent.click(chip(/^Change assignee/));
  const filter = screen.getByPlaceholderText("Assign to…");
  fireEvent.change(filter, { target: { value: "p" } });
  fireEvent.change(filter, { target: { value: "pat" } });
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Pat Person" }, { timeout: 2000 }));
  expect(chip(/^Change assignee/)).toHaveTextContent("Pat Person");
  expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/users")).map(([url]) => String(url))).toEqual(["/api/users?q=pat"]);
});

test("typing starts after the [DEMO] prefix: the caret opens at the end of the title", () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  const title = screen.getByLabelText<HTMLTextAreaElement>("Story title");
  expect(title).toHaveValue("[DEMO] ");
  expect([title.selectionStart, title.selectionEnd]).toEqual([7, 7]);
});

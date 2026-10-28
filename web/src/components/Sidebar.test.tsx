import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, serve } from "../test/fixtures";
import { Sidebar } from "./Sidebar";
import { expectRallyWords } from "../test/vocabulary";

beforeEach(async () => {
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  serve({ "GET /api/bootstrap": makeBootstrap() });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("the header: workspace tile and menu, search, and a compose button that opens the composer", () => {
  render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Create new story" }));
  expect(uiStore.getState().composerOpen).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Demo Workspace menu" }));
  expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Settings", "Toggle theme", "Keyboard shortcuts"]);
});

test("no shortcut hints; sections and teams collapse and remember it", () => {
  const { container } = render(<Sidebar />);
  expect(container.querySelector("kbd")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  expect(screen.queryByRole("button", { name: "Capabilities" })).toBeNull();
  const teams = screen.getByRole("region", { name: "Your teams" });
  fireEvent.click(within(teams).getByRole("button", { name: "Data Services" }));
  expect(within(teams).getAllByRole("button", { name: "Stories" })).toHaveLength(1); // only AI/ML's children remain
  expect(JSON.parse(localStorage.getItem("mira-nav-collapsed")!)).toEqual(["workspace", "team:9001"]);
});

test("a team's … menu hides it", () => {
  render(<Sidebar />);
  fireEvent.click(screen.getAllByRole("button", { name: "Team menu" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Hide team" }));
  expect(uiStore.getState().hiddenTeamIds).toEqual([9001]);
});

test("the help menu at the bottom", () => {
  render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Open Help menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));
  expect(uiStore.getState().cheatsheetOpen).toBe(true);
});

test("the sidebar speaks Rally's words: My stories, Capabilities, Features, and a team's Stories, Sprints, Features", () => {
  const { container } = render(<Sidebar />);
  expect(screen.getByRole("button", { name: "My stories" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Capabilities" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create new story" })).toBeInTheDocument();
  const teams = screen.getByRole("region", { name: "Your teams" });
  expect(within(teams).getAllByRole("button", { name: "Stories" }).length).toBeGreaterThan(0);
  expect(within(teams).getAllByRole("button", { name: "Sprints" }).length).toBeGreaterThan(0);
  expect(within(teams).getAllByRole("button", { name: "Features" }).length).toBeGreaterThan(0);
  expectRallyWords(container);
});

test("the workspace, team and help menus are in Rally's words", () => {
  const { container } = render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Demo Workspace menu" }));
  expectRallyWords(container);
  fireEvent.click(screen.getAllByRole("button", { name: "Team menu" })[0]);
  expectRallyWords(document.body);
  fireEvent.click(screen.getByRole("button", { name: "Open Help menu" }));
  expectRallyWords(document.body);
});

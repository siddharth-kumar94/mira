import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { appStore, uiStore } from "./store";
import { makeBootstrap, makeTeamLoad, serve } from "./test/fixtures";
import { expectRallyWords } from "./test/vocabulary";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/my/assigned");
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("My stories shows your work from both teams, grouped by Focus", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
  serve({ "GET /api/bootstrap": makeBootstrap() });
  render(<App />);
  expect(await screen.findByRole("option", { name: /Example story/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Real AI\/ML work/ })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Backlog" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Tasks" })).toHaveTextContent("TA4002");
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByText("Demo Workspace")).toBeInTheDocument();
  expect(within(nav).getByRole("button", { name: "AI/ML Solutions" })).toBeInTheDocument();
});

test("a user with no recent activity sees empty states, not a crash", async () => {
  // Review focus 1.
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [], issues: [], sub_issues: [], cycles: [], projects: [] }) });
  render(<App />);
  expect(await screen.findByText("Nothing is assigned to you.")).toBeInTheDocument();
  expect(screen.getByText(/No teams yet/)).toBeInTheDocument();
});

test("a team opens from the sidebar, loads, and has a URL; back and forward follow", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001": makeTeamLoad() });
  render(<App />);
  const nav = await screen.findByRole("navigation", { name: "Main" });
  await screen.findByRole("option", { name: /Example story/ });
  fireEvent.click(within(within(nav).getByRole("list", { name: "Data Services views" })).getByRole("button", { name: "Stories" }));
  expect(window.location.pathname).toBe("/team/9001/active");
  expect(await screen.findByRole("option", { name: /Teammate's story/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Backlog" }));
  expect(screen.getByRole("option", { name: /Backlog one/ })).toBeInTheDocument();
  act(() => {
    window.history.pushState(null, "", "/my/created");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("tab", { name: "Created" })).toHaveAttribute("aria-selected", "true");
});

test("a team that fails to load offers Retry instead of loading forever", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001": [500, { error: "boom" }] });
  render(<App />);
  const nav = await screen.findByRole("navigation", { name: "Main" });
  await screen.findByRole("option", { name: /Example story/ });
  fireEvent.click(within(within(nav).getByRole("list", { name: "Data Services views" })).getByRole("button", { name: "Stories" }));
  expect(await screen.findByText(/Couldn't load this team\./)).toBeInTheDocument();
  expect(screen.queryByText(/Loading Data Services/)).not.toBeInTheDocument();
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001": makeTeamLoad() });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("option", { name: /Teammate's story/ })).toBeInTheDocument();
});

test("a team you haven't joined offers Join team", async () => {
  uiStore.setState({ route: { name: "team", teamId: 9050, tab: "active" } });
  const dataline = { id: 9050, name: "DataLine", level: "team" as const, parent_id: null };
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9050": makeTeamLoad({ team: dataline, issues: [] }) });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Join team" }));
  expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "DataLine" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("mira-teams-joined")!)).toEqual([9050]);
});

test("with no key, the connect screen: title, a password field, the Rally link and Connect, and no app nav", async () => {
  serve({ "GET /api/bootstrap": [401, { error: "Rally rejected the API key" }] });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Connect Mira to Rally" })).toBeInTheDocument();
  expect(screen.getByLabelText("Rally API key")).toHaveAttribute("type", "password");
  expect(screen.getByRole("link", { name: "Get a key in Rally" })).toHaveAttribute("href", "https://rally1.rallydev.com/#/detail/userprofile/apikeys");
  expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).toBeNull();
});

test("an invalid key shows Rally's rejection under the field, and the key never stays in the page", async () => {
  const fetchMock = serve({ "GET /api/bootstrap": [401, { error: "no key" }], "POST /api/session": [401, { error: "Rally rejected that key" }] });
  render(<App />);
  const field = await screen.findByLabelText("Rally API key");
  fireEvent.change(field, { target: { value: "not-a-key" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByText("Rally rejected that key")).toBeInTheDocument();
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveValue("");
  expect(document.body.innerHTML).not.toContain("not-a-key");
  expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "POST", body: JSON.stringify({ api_key: "not-a-key" }) }));
});

test("a good key connects, says who you are and goes to My stories", async () => {
  window.history.replaceState(null, "", "/settings/account");
  uiStore.setState(uiStore.getInitialState(), true);
  uiStore.getState().syncFromLocation("/settings/account");
  serve({ "GET /api/bootstrap": [401, { error: "no key" }] });
  render(<App />);
  const field = await screen.findByLabelText("Rally API key");
  serve({
    "POST /api/session": { connected: true, me: { id: 501, name: "Dana Demo" }, workspace: { id: 8001, name: "Demo Workspace" }, error: null },
    "GET /api/bootstrap": makeBootstrap(),
  });
  fireEvent.change(field, { target: { value: "synthetic-good-key" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("option", { name: /Example story/ })).toBeInTheDocument();
  expect(screen.getByText("Connected as Dana Demo · Demo Workspace")).toBeInTheDocument();
  expect(window.location.pathname).toBe("/my/assigned");
  expect(document.body.innerHTML).not.toContain("synthetic-good-key");
});

test("the offline banner stays up while retries are in flight, then recovers", async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Local server isn't running. Retrying every 5 seconds…")).toBeInTheDocument();
    serve({ "GET /api/bootstrap": makeBootstrap() });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("option", { name: /Example story/ })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("My stories and its empty states are in Rally's words", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ teams: [], issues: [], sub_issues: [], cycles: [], projects: [] }) });
  const { container } = render(<App />);
  expect(await screen.findByText("Nothing is assigned to you.")).toBeInTheDocument();
  expectRallyWords(container);
  fireEvent.click(screen.getByRole("tab", { name: "Created" }));
  expect(screen.getByText("You haven't created any open stories.")).toBeInTheDocument();
  expectRallyWords(container);
});

test("My stories, with work in it, the shell and the sub-issue footer read in Rally's words", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap() });
  const { container } = render(<App />);
  await screen.findByRole("option", { name: /Example story/ });
  expect(screen.getByRole("region", { name: "Tasks" })).toHaveTextContent("Tasks on others' stories");
  expectRallyWords(container);
});

test("a team's Stories open from the sidebar, in Rally's words, beside its Sprints and Features items", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/teams/9001": makeTeamLoad() });
  const { container } = render(<App />);
  const nav = await screen.findByRole("navigation", { name: "Main" });
  const views = within(nav).getByRole("list", { name: "Data Services views" });
  fireEvent.click(within(views).getByRole("button", { name: "Stories" }));
  await screen.findByRole("option", { name: /Example story/ });
  expect(screen.getByRole("tab", { name: "All stories" })).toBeInTheDocument();
  expectRallyWords(container);
  expect(within(views).getByRole("button", { name: "Sprints" })).toBeInTheDocument();
  expect(within(views).getByRole("button", { name: "Features" })).toBeInTheDocument();
});

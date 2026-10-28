import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { expectRallyWords } from "../test/vocabulary";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/my/assigned");
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

async function openSettings(section: "preferences" | "account" = "preferences", bootstrap = makeBootstrap()) {
  const fetchMock = serve({ "GET /api/bootstrap": bootstrap, "DELETE /api/session": { connected: false, me: null, workspace: null, error: null } });
  render(<App />);
  await screen.findByRole("navigation", { name: "Main" });
  uiStore.getState().navigate({ name: "my", tab: "created" });
  uiStore.getState().navigate({ name: "settings", section });
  return { nav: await screen.findByRole("navigation", { name: "Settings" }), fetchMock };
}

/** Nav item labels (a team item's tile initials are decoration). */
const labels = (nav: HTMLElement) => within(nav).getAllByRole("button").map((b) => (b.querySelector("[data-part=label]") ?? b).textContent);

/** A settings row is a list item: its title, its description and its control. */
const row = (title: string) => screen.getByText(title, { selector: "[data-part=row-title]" }).closest("li")!;

test("settings replace the app sidebar; Back to app returns to the last screen outside settings", async () => {
  const { nav } = await openSettings();
  expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  fireEvent.click(within(nav).getByRole("button", { name: "Account" }));
  expect(window.location.pathname).toBe("/settings/account");
  expect(within(nav).getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(within(nav).getByRole("button", { name: "Back to app" }));
  expect(uiStore.getState().route).toEqual({ name: "my", tab: "created" });
  expect(window.location.pathname).toBe("/my/created");
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
});

test("the nav: Personal (Preferences, Account), Administration (Teams), Your teams (one per sidebar team)", async () => {
  const { nav } = await openSettings();
  expect(within(nav).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Personal", "Administration", "Your teams"]);
  expect(labels(nav)).toEqual(["Back to app", "Preferences", "Account", "Teams", "Data Services", "AI/ML Solutions"]);
  expect(within(nav).getByRole("button", { name: "Preferences" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(within(nav).getByRole("button", { name: "AI/ML Solutions" }));
  expect(uiStore.getState().route).toEqual({ name: "team-settings", teamId: 9002 });
  expect(within(nav).getByRole("button", { name: "AI/ML Solutions" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(within(nav).getByRole("button", { name: "Teams" }));
  expect(window.location.pathname).toBe("/settings/teams");
  // The search field filters the items.
  fireEvent.change(within(nav).getByRole("searchbox", { name: "Search settings" }), { target: { value: "acc" } });
  expect(labels(nav)).toEqual(["Back to app", "Account"]);
});

test("Preferences: Interface theme, Display names and a read-only Write guard row", async () => {
  await openSettings();
  expect(screen.getByRole("heading", { level: 1, name: "Preferences" })).toBeInTheDocument();
  expect([...document.querySelectorAll("[data-part=row-title]")].map((t) => t.textContent)).toEqual(["Interface theme", "Display names"]);

  fireEvent.click(within(row("Interface theme")).getByRole("button", { name: "Interface theme: Light" }));
  expect(screen.getAllByRole("menuitemcheckbox").map((m) => [m.textContent, m.getAttribute("aria-checked")])).toEqual([["Light", "true"], ["Dark", "false"]]);
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Dark" }));
  expect(uiStore.getState().theme).toBe("dark");
  expect(localStorage.getItem("rally-poc-theme")).toBe("dark");
  expect(within(row("Interface theme")).getByRole("button", { name: "Interface theme: Dark" })).toBeInTheDocument();

  expect(row("Display names")).toHaveTextContent("Full name");

});

test("Account: connected as you, a masked key with Change key, and Disconnect", async () => {
  const { fetchMock } = await openSettings("account");
  expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
  expect(screen.getByText("Connected as Dana Demo · Demo Workspace")).toBeInTheDocument();
  expect(row("Rally API key")).toHaveTextContent("••••••••");

  fireEvent.click(within(row("Rally API key")).getByRole("button", { name: "Change key" }));
  const dialog = screen.getByRole("dialog", { name: "Connect Mira to Rally" });
  expect(within(dialog).getByLabelText("Rally API key")).toHaveAttribute("type", "password");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();

  fireEvent.click(within(row("Disconnect")).getByRole("button", { name: "Disconnect" }));
  expect(await screen.findByRole("heading", { name: "Connect Mira to Rally" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "DELETE" }));
  expect(screen.queryByRole("navigation", { name: "Settings" })).toBeNull();
});

const changeKey = (key: string) => {
  fireEvent.click(within(row("Rally API key")).getByRole("button", { name: "Change key" }));
  const dialog = screen.getByRole("dialog", { name: "Connect Mira to Rally" });
  fireEvent.change(within(dialog).getByLabelText("Rally API key"), { target: { value: key } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
  return dialog;
};

test("Change key, rejected: the error shows under the field and the dialog stays", async () => {
  await openSettings("account");
  serve({ "POST /api/session": [401, { error: "Rally rejected that key" }] });
  const dialog = changeKey("not-a-key");
  expect(await within(dialog).findByText("Rally rejected that key")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Connect Mira to Rally" })).toBe(dialog);
  expect(within(dialog).getByLabelText("Rally API key")).toHaveValue("");
  expect(document.body.innerHTML).not.toContain("not-a-key");
  expect(screen.getByText("Connected as Dana Demo · Demo Workspace")).toBeInTheDocument();
});

test("Change key to another account: the dialog closes, a toast names it, and the old account's data is gone", async () => {
  await openSettings("account");
  const other = { id: 777, name: "Other Person" };
  const ws = { id: 8002, name: "Other WS" };
  serve({
    "POST /api/session": { connected: true, me: other, workspace: ws, error: null },
    "GET /api/bootstrap": makeBootstrap({ me: other, workspace: ws, teams: [], issues: [makeIssue({ id: 5001, key: "US5001", assignee: other, team_id: 9050 })], sub_issues: [], projects: [] }),
  });
  changeKey("synthetic-other-key");
  expect(await screen.findByText("Connected as Other Person · Other WS", { selector: "[data-part=row-title]" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(within(screen.getByRole("status")).getByText("Connected as Other Person · Other WS")).toBeInTheDocument();
  expect(Object.keys(appStore.getState().issues)).toEqual(["5001"]);
  expect(appStore.getState().teams[9001]).toBeUndefined();
  expect(document.body.innerHTML).not.toContain("synthetic-other-key");
});

test("the key field keeps password managers out: new-password, ignore hints, no username field", async () => {
  await openSettings("account");
  fireEvent.click(within(row("Rally API key")).getByRole("button", { name: "Change key" }));
  const dialog = screen.getByRole("dialog", { name: "Connect Mira to Rally" });
  const field = within(dialog).getByLabelText("Rally API key");
  expect(field).toHaveAttribute("type", "password");
  expect(field).toHaveAttribute("autocomplete", "new-password");
  expect(field).toHaveAttribute("data-1p-ignore");
  expect(field).toHaveAttribute("data-lpignore", "true");
  expect(field).toHaveAttribute("data-bwignore");
  expect(dialog.querySelectorAll("input")).toHaveLength(1);
});

test("Preferences, in Rally's words", async () => {
  await openSettings();
  expect(row("Display names")).toHaveTextContent("Full name");
  expectRallyWords(document.body);
});

test("Account, in Rally's words", async () => {
  await openSettings("account");
  expect(await screen.findByText("Connected as Dana Demo · Demo Workspace")).toBeInTheDocument();
  expect(row("Rally API key")).toHaveTextContent("••••••••");
  expectRallyWords(document.body);
});

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Comment, Initiative, Update } from "../api/types";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { DANA, SAM, deferred, makeBootstrap, serve } from "../test/fixtures";
import { PmActivity } from "./PmActivity";

const AT_RISK: Update = { id: 802, author: DANA, health: "at_risk", html: "<p>Slipping a little.</p>", created_at: "2026-10-16T12:00:00.000Z",
  progress: 0.52, target: "2027-01-01" };
const OLDER: Update = { id: 801, author: SAM, health: "on_track", html: "<p>Started.</p>", created_at: "2026-10-09T12:00:00.000Z",
  progress: 0.37, target: "2026-12-01" };
const COMMENT: Comment = { id: 901, author: SAM, html: "<p>Looks good.</p>", created_at: "2026-10-12T12:00:00.000Z" };
const POSTED: Update = { id: 803, author: DANA, health: "off_track", html: "<p>Blocked on access.</p>", created_at: "2026-10-19T12:00:00.000Z",
  progress: 0.52, target: "2027-01-01" };
const INITIATIVE: Initiative = {
  id: 251, key: "I251", name: "[DEMO] Agentic Platform", status: "active", status_name: "Active", owner: SAM, start: null,
  target: null, progress: 0.2, project_count: 1, group_id: null, group_name: null, parent_group_id: null, parent_group_name: null, health: null, latest_update: null,
  project_health: [], priority: 0, summary: "", rank: "", updated_at: "", created_at: "",
};
const CREATED = "2026-09-01T10:00:00.000Z";

async function start({ updates = [] as Update[], comments = [] as Comment[], routes = {} as Record<string, unknown>, kind = "project" as "project" | "initiative" } = {}) {
  const fetchMock = serve({ "GET /api/bootstrap": makeBootstrap(), ...routes });
  await appStore.getState().load();
  const id = kind === "project" ? 201 : 251;
  appStore.setState((s) => ({
    initiatives: { ...s.initiatives, 251: INITIATIVE },
    pmDetails: { ...s.pmDetails, [`${kind}:${id}`]: { description: "", updates, comments } },
  }));
  render(<PmActivity kind={kind} id={id} createdAt={CREATED} owner={kind === "project" ? DANA : SAM} />);
  return fetchMock;
}
const composer = () => screen.getByRole("form", { name: /Feature update|Capability update|Comment/ });
const editor = () => within(composer()).getByRole("textbox");
const chip = () => within(composer()).queryByRole("button", { name: /Set (feature|capability) health/ });
const posts = (fetchMock: ReturnType<typeof serve>, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === path && init?.method === "POST");
const feedItems = () => [...screen.getByRole("list", { name: "Activity" }).children].map((li) => li.getAttribute("data-item"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the toggle is Comment | Update, with Update selected", async () => {
  await start();
  const tabs = within(screen.getByRole("tablist", { name: "Activity type" })).getAllByRole("tab");
  expect(tabs.map((t) => t.textContent)).toEqual(["Comment", "Update"]);
  expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  expect(tabs[0]).toHaveAttribute("aria-selected", "false");
});

test("the health chip defaults to On track with no update, else to the latest reported health", async () => {
  await start();
  expect(chip()).toHaveTextContent("On track");
});

test("the health chip takes the latest update's health", async () => {
  await start({ updates: [AT_RISK, OLDER] });
  expect(chip()).toHaveTextContent("At risk");
});

test("Update mode reads 'Write a feature update…' and Post update; Comment mode hides the chip and reads Leave a comment…", async () => {
  await start();
  expect(editor()).toHaveAttribute("placeholder", "Write a feature update…");
  expect(screen.getByRole("form", { name: "Feature update" })).toBeInTheDocument();
  expect(chip()).toHaveAccessibleName("Set feature health");
  expectRallyWords(document.body);
  const post = within(composer()).getByRole("button", { name: "Submit update" });
  expect(post).toHaveTextContent("Post update");
  fireEvent.click(screen.getByRole("tab", { name: "Comment" }));
  expect(screen.getByRole("tab", { name: "Comment" })).toHaveAttribute("aria-selected", "true");
  expect(editor()).toHaveAttribute("placeholder", "Leave a comment…");
  expect(screen.getByRole("textbox", { name: "Feature comment" })).toBeInTheDocument();
  expectRallyWords(document.body);
  expect(chip()).toBeNull();
  // Linear's comment button shows "Comment" and is named "Submit comment" (project-comment-mode.png, inventory-p4 §2.4).
  expect(within(composer()).getByRole("button", { name: "Submit comment" })).toHaveTextContent("Comment");
});

test("a capability's placeholder is 'Write a capability update…'", async () => {
  await start({ kind: "initiative" });
  expect(editor()).toHaveAttribute("placeholder", "Write a capability update…");
  expect(chip()).toHaveAccessibleName("Set capability health");
  expect(screen.getByRole("form", { name: "Capability update" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Capability update" })).toBeInTheDocument();
  expectRallyWords(document.body);
  fireEvent.click(screen.getByRole("tab", { name: "Comment" }));
  expect(screen.getByRole("textbox", { name: "Capability comment" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

test("the health picker is a dialog of On track, At risk and Off track with no number keys; choosing sets the chip", async () => {
  await start();
  fireEvent.click(chip()!);
  const dialog = screen.getByRole("dialog", { name: "Set feature health" });
  const items = within(dialog).getAllByRole("menuitem");
  expect(items.map((i) => i.getAttribute("aria-label"))).toEqual(["On track", "At risk", "Off track"]);
  expectRallyWords(document.body); // the open picker
  expect(dialog.querySelector("kbd")).toBeNull();
  fireEvent.click(items[2]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(chip()).toHaveTextContent("Off track");
  expect(chip()).toHaveFocus();
});

test("the picker filters as you type", async () => {
  await start();
  fireEvent.click(chip()!);
  const menu = within(screen.getByRole("dialog", { name: "Set feature health" })).getByRole("menu");
  expect(menu).toHaveTextContent("Showing all items");
  fireEvent.keyDown(menu, { key: "r" });
  fireEvent.keyDown(menu, { key: "i" });
  expect(within(menu).getAllByRole("menuitem").map((i) => i.getAttribute("aria-label"))).toEqual(["At risk"]);
  fireEvent.keyDown(menu, { key: "Enter" });
  expect(chip()).toHaveTextContent("At risk");
});

test("⌘↵ posts the update with its health as HTML, shows Posting… until Rally answers, then clears and leads the feed", async () => {
  await start({ updates: [AT_RISK] });
  const reply = deferred<Update>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/projects/F201/updates" && init?.method === "POST") return new Response(JSON.stringify(await reply.promise));
    return new Response(JSON.stringify({ error: "unrouted" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  fireEvent.click(chip()!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Off track" }));
  fireEvent.change(editor(), { target: { value: "Blocked on access.\n\nAsked IT <today>." } });
  fireEvent.keyDown(editor(), { key: "Enter", metaKey: true });
  const post = within(composer()).getByRole("button", { name: "Submit update" });
  expect(post).toHaveTextContent("Posting…");
  expect(post).toBeDisabled();
  expect(editor()).toHaveAttribute("readonly"); // edits made while posting would be lost when it clears
  expect(editor()).toHaveValue("Blocked on access.\n\nAsked IT <today>.");
  const [, init] = posts(fetchMock as never, "/api/projects/F201/updates")[0];
  expect(JSON.parse(String(init?.body))).toEqual({ health: "off_track", html: "<p>Blocked on access.</p><p>Asked IT &lt;today&gt;.</p>" });
  await act(async () => reply.resolve(POSTED));
  expect(editor()).toHaveValue("");
  expect(post).toHaveTextContent("Post update");
  expect(feedItems()[0]).toBe("update:803");
  expect(chip()).toHaveTextContent("Off track"); // the latest reported health is now the new one
  expect(appStore.getState().projects[201].health?.value).toBe("off_track");
});

test("a refused update keeps the text and the health, and toasts why", async () => {
  // Review focus 2: the guard answers 403 on anything but a tagged [DEMO] feature in the demo team.
  const fetchMock = await start({ updates: [AT_RISK], routes: {
    "POST /api/projects/F201/updates": [403, { error: "Demo mode: only [DEMO] features can take updates" }],
  } });
  const before = appStore.getState().projects[201];
  fireEvent.click(chip()!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Off track" }));
  fireEvent.change(editor(), { target: { value: "Should not land" } });
  fireEvent.click(within(composer()).getByRole("button", { name: "Submit update" }));
  await vi.waitFor(() => expect(appStore.getState().toasts.map((t) => t.message)).toContain("Demo mode: only [DEMO] features can take updates"));
  expect(posts(fetchMock, "/api/projects/F201/updates")).toHaveLength(1);
  expect(editor()).toHaveValue("Should not land");
  expect(chip()).toHaveTextContent("Off track");
  expect(within(composer()).getByRole("button", { name: "Submit update" })).toHaveTextContent("Post update");
  expect(appStore.getState().projects[201]).toEqual(before);
  expect(feedItems()).toEqual(["update:802", "created"]);
});

test("an empty editor doesn't post", async () => {
  const fetchMock = await start();
  expect(within(composer()).getByRole("button", { name: "Submit update" })).toBeDisabled();
  fireEvent.change(editor(), { target: { value: "   " } });
  fireEvent.keyDown(editor(), { key: "Enter", metaKey: true });
  expect(posts(fetchMock, "/api/projects/F201/updates")).toHaveLength(0);
});

test("a comment shows at once and clears the editor; a refused one comes off the feed and its text comes back", async () => {
  const saved: Comment = { id: 902, author: DANA, html: "<p>On it.</p>", created_at: "2026-10-19T12:00:00.000Z" };
  const fetchMock = await start({ routes: { "POST /api/projects/F201/comments": saved } });
  fireEvent.click(screen.getByRole("tab", { name: "Comment" }));
  fireEvent.change(editor(), { target: { value: "On it." } });
  fireEvent.keyDown(editor(), { key: "Enter", ctrlKey: true });
  expect(editor()).toHaveValue("");
  expect(screen.getByRole("list", { name: "Activity" })).toHaveTextContent("On it.");
  await vi.waitFor(() => expect(feedItems()[0]).toBe("comment:902"));
  const [, init] = posts(fetchMock, "/api/projects/F201/comments")[0];
  expect(JSON.parse(String(init?.body))).toEqual({ html: "<p>On it.</p>" });

  serve({ "POST /api/projects/F201/comments": [403, { error: "Demo mode: only [DEMO] features can take comments" }] });
  fireEvent.change(editor(), { target: { value: "Refused" } });
  fireEvent.click(within(composer()).getByRole("button", { name: "Submit comment" }));
  await vi.waitFor(() => expect(editor()).toHaveValue("Refused"));
  expect(screen.getByRole("list", { name: "Activity" })).not.toHaveTextContent("Refused");
  expect(appStore.getState().toasts.map((t) => t.message)).toContain("Demo mode: only [DEMO] features can take comments");
});

test("the feed is newest first, updates and comments by date, then '<owner> created the feature · date'", async () => {
  await start({ updates: [AT_RISK, OLDER], comments: [COMMENT] });
  expect(feedItems()).toEqual(["update:802", "comment:901", "update:801", "created"]);
  const feed = screen.getByRole("list", { name: "Activity" });
  // Update cards in the feed carry the absolute date, not the age.
  const card = within(feed).getAllByRole("article", { name: "Feature update" })[0];
  expect(card).toHaveTextContent("Oct 16");
  expect(card).not.toHaveTextContent("3d ago");
  expect(card).toHaveTextContent("Slipping a little.");
  expect(card).toHaveClass("pt-3"); // 12 above the byline: health text at y360 under a y339 card (project-activity-points.json)
  // The diff block compares with the earlier footed update.
  expect([...card.querySelectorAll("[data-diff]")].map((r) => r.textContent)).toContain("Target datemoved from Dec 1st to Jan 1st, 2027");
  const created = feed.querySelector('[data-item="created"]') as HTMLElement;
  expect(created).toHaveTextContent("Dana Demo created the feature · Sep 1");
  expect(created.querySelector("svg")).not.toBeNull(); // the cube
  expectRallyWords(document.body); // the whole feed: cards, diff rows, the system line
});

test("a capability's system line reads 'created the capability'", async () => {
  await start({ kind: "initiative" });
  expect(screen.getByRole("list", { name: "Activity" }).querySelector('[data-item="created"]')).toHaveTextContent(
    "Sam Sample created the capability · Sep 1");
  expect(screen.getByRole("region", { name: "Capability activity" })).toBeInTheDocument();
  expectRallyWords(document.body);
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { expectRallyWords } from "../test/vocabulary";
import { DANA, makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { Activity } from "./Activity";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-16T12:00:00.000Z") });
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function load(routes: Record<string, unknown> = {}) {
  serve({ "GET /api/bootstrap": makeBootstrap(), ...routes });
  await appStore.getState().load();
  appStore.setState({ details: { 1001: {
    comments: [{ id: 91, author: DANA, html: "<p>Looks good</p>", created_at: "2026-10-16T09:00:00.000Z" }],
    activity: [
      { id: "81.0", author: DANA, text: "set estimate to 5", created_at: "2026-10-16T10:00:00.000Z" },
      { id: "80.0", author: DANA, text: "created the story", created_at: "2026-10-16T08:00:00.000Z" },
    ] } } });
}

test("events and comments interleave oldest first, in Rally's words", async () => {
  await load();
  const { container } = render(<Activity issueId={1001} />);
  expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expectRallyWords(container);
  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items[0]).toContain("created the story");
  expect(items[1]).toContain("Looks good");
  expect(items[2]).toContain("set estimate to 5");
  expect(items[2]).toContain("2h ago");
});

test("⌘↵ posts the comment at once; the box clears", async () => {
  await load({ "POST /api/issues/1001/comments": [201, { id: 92, author: DANA, html: "<p>Ship it</p>", created_at: "2026-10-16T12:00:00.000Z" }] });
  render(<Activity issueId={1001} />);
  const box = screen.getByRole("textbox", { name: "Leave a comment" });
  fireEvent.change(box, { target: { value: "Ship it" } });
  fireEvent.keyDown(box, { key: "Enter", metaKey: true });
  expect(screen.getByText("Ship it")).toBeInTheDocument();
  expect(box).toHaveValue("");
  await waitFor(() => expect(appStore.getState().details[1001].comments.map((c) => c.id)).toEqual([91, 92]));
});

test("a refused comment comes back into the box, with a toast", async () => {
  await load({ "POST /api/issues/1001/comments": [403, { error: "Demo mode: only [DEMO] stories can take comments" }] });
  render(<Activity issueId={1001} />);
  const box = screen.getByRole("textbox", { name: "Leave a comment" });
  fireEvent.change(box, { target: { value: "Not allowed" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit comment" })); });
  await waitFor(() => expect(box).toHaveValue("Not allowed"));
  expect(screen.queryByText("Not allowed", { selector: "p" })).toBeNull();
  expect(appStore.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] stories can take comments"]);
});

test("text typed while a post is pending stays after the refused text", async () => {
  await load({ "POST /api/issues/1001/comments": [403, { error: "Demo mode: only [DEMO] stories can take comments" }] });
  render(<Activity issueId={1001} />);
  const box = screen.getByRole("textbox", { name: "Leave a comment" });
  fireEvent.change(box, { target: { value: "First" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Submit comment" }));
    fireEvent.change(box, { target: { value: "Second" } });
  });
  await waitFor(() => expect(box).toHaveValue("First\nSecond"));
});

test("an edit made on the page reloads the detail once it settles, so the feed shows it", async () => {
  const changed = { id: "82.0", author: DANA, text: "changed priority from High to Urgent", created_at: "2026-10-16T12:00:00.000Z" };
  const fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap(),
    "PATCH /api/issues/1001": makeIssue({ priority: 1 }),
    "GET /api/issues/1001": { issue: makeIssue({ priority: 1 }), sub_issues: [], cycles: [], projects: [], users: [], comments: [], activity: [changed] },
  });
  await appStore.getState().load();
  render(<Activity issueId={1001} />);
  const reads = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/issues/1001" && (init?.method ?? "GET") === "GET");
  expect(reads()).toHaveLength(0);
  await act(async () => {
    const first = appStore.getState().updateIssue(1001, { priority: 1 });
    const second = appStore.getState().updateIssue(1001, { estimate: 3 });
    await Promise.all([first, second]);
  });
  expect(await screen.findByText("changed priority from High to Urgent")).toBeInTheDocument();
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(reads()).toHaveLength(1); // once, after both writes, not per write
});

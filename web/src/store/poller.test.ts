import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "../api/client";
import { EMPTY_CHANGES, makeBootstrap, makeTeamLoad, readyStore } from "../test/fixtures";
import { startPoller } from "./poller";

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => vi.useRealTimers());

test("polls every 20s with the last sync time and the loaded teams", async () => {
  const { store, api } = await readyStore();
  api.team.mockResolvedValueOnce(makeTeamLoad());
  await store.getState().loadTeam(9001);
  api.changes.mockResolvedValue(EMPTY_CHANGES);
  const stop = startPoller(store, api);
  await vi.advanceTimersByTimeAsync(19_999);
  expect(api.changes).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.changes).toHaveBeenCalledWith("2026-10-16T11:59:30.000Z", [9001]);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(api.changes).toHaveBeenLastCalledWith("2026-10-16T12:00:30.000Z", [9001]);
  stop();
});

test("backs off 40s then 80s and marks data stale after three failures", async () => {
  const { store, api } = await readyStore();
  api.changes.mockRejectedValue(new ApiError(504, "Rally didn't respond in time"));
  // The timeline here runs past 5 minutes; keep the full refresh out of it.
  const stop = startPoller(store, api, { refreshMs: Infinity });
  await vi.advanceTimersByTimeAsync(20_000); // failure 1
  expect(api.changes).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(40_000); // failure 2
  expect(api.changes).toHaveBeenCalledTimes(2);
  expect(store.getState().stale).toBe(false);
  await vi.advanceTimersByTimeAsync(80_000); // failure 3
  expect(api.changes).toHaveBeenCalledTimes(3);
  expect(store.getState().stale).toBe(true);
  await vi.advanceTimersByTimeAsync(80_000); // capped at 80s
  expect(api.changes).toHaveBeenCalledTimes(4);
  api.changes.mockResolvedValue(EMPTY_CHANGES);
  await vi.advanceTimersByTimeAsync(80_000);
  expect(store.getState().stale).toBe(false);
  await vi.advanceTimersByTimeAsync(20_000); // back to 20s after a success
  expect(api.changes).toHaveBeenCalledTimes(6);
  stop();
});

test("a full refresh replaces a poll every 5 minutes", async () => {
  const { store, api } = await readyStore();
  api.team.mockResolvedValue(makeTeamLoad());
  await store.getState().loadTeam(9001);
  api.changes.mockResolvedValue(EMPTY_CHANGES);
  api.bootstrap.mockResolvedValue(makeBootstrap());
  const stop = startPoller(store, api, { refreshMs: 60_000 });
  await vi.advanceTimersByTimeAsync(60_000); // ticks at 20s and 40s poll; 60s refreshes
  expect(api.changes).toHaveBeenCalledTimes(2);
  expect(api.bootstrap).toHaveBeenCalledTimes(2); // the first load, then the refresh
  expect(api.team).toHaveBeenCalledTimes(2);
  stop();
});

test("pauses while the tab is hidden and polls on return", async () => {
  const { store, api } = await readyStore();
  api.changes.mockResolvedValue(EMPTY_CHANGES);
  const stop = startPoller(store, api);
  visibility = "hidden";
  await vi.advanceTimersByTimeAsync(60_000);
  expect(api.changes).not.toHaveBeenCalled();
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(api.changes).toHaveBeenCalledTimes(1);
  stop();
});

test("stop cancels future polls", async () => {
  const { store, api } = await readyStore();
  api.changes.mockResolvedValue(EMPTY_CHANGES);
  startPoller(store, api)();
  await vi.advanceTimersByTimeAsync(100_000);
  expect(api.changes).not.toHaveBeenCalled();
});

import type { Api } from "../api/client";
import type { AppStore } from "./store";

export interface PollerOptions { intervalMs?: number; maxBackoffMs?: number; staleAfterFailures?: number; refreshMs?: number }

/**
 * Spec §6.4: poll your issues and every loaded team every 20s; back off 20s → 40s → 80s and mark data stale after
 * 3 failures; pause while hidden; every 5 minutes run a full refresh instead, which catches deletions and moves.
 */
export function startPoller(store: AppStore, api: Pick<Api, "changes">, opts: PollerOptions = {}): () => void {
  const interval = opts.intervalMs ?? 20_000;
  const maxBackoff = opts.maxBackoffMs ?? 80_000;
  const staleAfter = opts.staleAfterFailures ?? 3;
  const refreshEvery = opts.refreshMs ?? 300_000;
  let failures = 0;
  let lastRefresh = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void tick(), ms);
  };

  async function tick() {
    if (document.visibilityState === "hidden") return; // resumed by the visibilitychange listener
    const s = store.getState();
    if (s.status !== "ready" || !s.lastSync) {
      schedule(interval);
      return;
    }
    // A reply from before a change of account or a disconnect belongs to the old session: drop it (store.session()).
    const session = s.session();
    const sameSession = () => store.getState().session() === session;
    try {
      if (Date.now() - lastRefresh >= refreshEvery) {
        lastRefresh = Date.now();
        await s.refresh();
      } else {
        const readStamp = s.stamp();
        const changes = await api.changes(s.lastSync, s.loadedTeamIds());
        if (sameSession()) s.applyChanges(changes, readStamp);
      }
      failures = 0;
      schedule(interval);
    } catch {
      if (!sameSession()) {
        schedule(interval);
        return;
      }
      failures += 1;
      if (failures >= staleAfter) store.getState().setStale(true);
      schedule(Math.min(interval * 2 ** failures, maxBackoff));
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule(0);
  };
  document.addEventListener("visibilitychange", onVisibility);
  schedule(interval);

  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

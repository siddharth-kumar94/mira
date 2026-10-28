import { useApp } from "../store";

export function StatusBanner() {
  const status = useApp((s) => s.status);
  const stale = useApp((s) => s.stale);
  const text = status === "offline" ? "Local server isn't running. Retrying every 5 seconds…"
    : stale ? "Showing cached data. Rally isn't responding." : null;
  if (!text) return null;
  return <div role="alert" className="border-b border-line-1 bg-hover px-4 py-1.5 text-mini text-ink-2">{text}</div>;
}

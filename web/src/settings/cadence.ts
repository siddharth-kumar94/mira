import type { Cycle } from "../api/types";

const DAY = 86_400_000;

/**
 * Team settings' Cycles value (§19.10): "Every 2 weeks", from the team's cycle lengths. The most common length wins,
 * in whole weeks (a cycle ending at 23:59:59 or on the date before the next start still counts as its full length).
 * Null with fewer than 2 cycles: one cycle says nothing about a cadence.
 */
export function cadence(cycles: Cycle[]): string | null {
  if (cycles.length < 2) return null;
  const counts = new Map<number, number>();
  for (const c of cycles) {
    const days = (Date.parse(c.end) - Date.parse(c.start)) / DAY;
    const weeks = Math.max(1, Math.round(days / 7));
    counts.set(weeks, (counts.get(weeks) ?? 0) + 1);
  }
  // Ties go to the length seen first.
  let best = 0;
  let most = 0;
  for (const [weeks, n] of counts) if (n > most) [best, most] = [weeks, n];
  return best === 1 ? "Every week" : `Every ${best} weeks`;
}

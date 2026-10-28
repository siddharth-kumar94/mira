import type { Project, Update } from "../api/types";
import { dayOf, ordinal, shortDate } from "../components/format";

/** Spec §19.8's diff block: what an update changed against the one before it, from §9.3's footer. Pure. */

export interface DiffRow { label: string; text: string }

/** Linear's diff dates: "Jan 1st", with ", 2027" when `withYear`, which defaults to "not this year". */
export function ordinalDate(iso: string, withYear?: boolean): string {
  const d = dayOf(iso);
  const year = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return `${d.toLocaleDateString("en-US", { month: "short" })} ${ordinal(d.getDate())}${year ? `, ${d.getFullYear()}` : ""}`;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** §9.3's footer ("progress 37% · target 2027-01-01") was parsed: the server leaves `progress` null when it wasn't. */
export const hasFooter = (u: Update) => u.progress !== null;

/**
 * The update `updates[index]` is compared against (`updates` newest first): the nearest earlier one with a footer; null
 * when it is the first update; else the oldest earlier one, footerless, so that `updateDiff` claims nothing.
 */
export function previousOf(updates: Update[], index: number): Update | null {
  const earlier = updates.slice(index + 1);
  return earlier.find(hasFooter) ?? earlier.at(-1) ?? null;
}

/**
 * "Target date · set to Jan 1st, 2027" (the first update, or none before) or "· moved from Dec 1st to Jan 1st, 2027";
 * then "Progress since Oct 16 · 37% → 52%" when it moved. No rows when nothing changed, when either footer is missing
 * (a post Rally rewrote): nothing is known then. A target cleared has no Linear wording, so it is no row either.
 */
export function updateDiff(update: Update, previous: Update | null): DiffRow[] {
  if (!hasFooter(update) || (previous && !hasFooter(previous))) return [];
  const rows: DiffRow[] = [];
  const before = previous?.target ?? null;
  if (update.target !== null && update.target !== before) {
    const text = before === null ? `set to ${ordinalDate(update.target)}` : `moved from ${ordinalDate(before)} to ${ordinalDate(update.target)}`;
    rows.push({ label: "Target date", text });
  }
  if (previous && pct(previous.progress!) !== pct(update.progress!)) {
    rows.push({ label: `Progress since ${shortDate(previous.created_at)}`, text: `${pct(previous.progress!)} → ${pct(update.progress!)}` });
  }
  return rows;
}

export interface RiskRow { name: string; key: string; value: "at_risk" | "off_track" }

/** On initiatives: one "Features · [cube] <name> at risk" row per active project worse than on track (§19.8). */
export function initiativeRiskRows(projects: Project[]): RiskRow[] {
  return projects.flatMap((p) => {
    const value = p.health?.value;
    return p.status_category === "started" && (value === "at_risk" || value === "off_track") ? [{ name: p.name, key: p.key, value }] : [];
  });
}

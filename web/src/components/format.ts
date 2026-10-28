import type { Cycle } from "../api/types";

const MONTH_DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", MONTH_DAY);
export const longDate = (iso: string) => new Date(iso).toLocaleString("en-US",
  { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
/** Group headers (§18.3). */
export const rangeLabel = (c: Cycle) => `${shortDate(c.start)} → ${shortDate(c.end)}`;
/** Picker hints (§18.9). */
export const pickerRange = (c: Cycle) => `${shortDate(c.start)} – ${shortDate(c.end)}`;
/** "1 story", "2 stories". */
export const storyCount = (n: number) => `${n} ${n === 1 ? "story" : "stories"}`;
/** Linear's estimate wording: "1 Point", "5 Points" (inventory §14.7). */
export const points = (n: number) => `${n} ${n === 1 ? "Point" : "Points"}`;

/** Activity times: "just now", "5m ago", "2h ago", "3d ago", then the date. */
export function ago(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return shortDate(iso);
}

/** A date-only "2026-10-01" is that local day, not UTC midnight; a timestamp is itself. */
export function dayOf(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** Linear's project dates: "Oct 1st", with the year when it isn't this year ("Feb 15th, 2027"). */
export function ordinalDate(iso: string, now: number = Date.now()): string {
  const d = dayOf(iso);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const year = d.getFullYear() === new Date(now).getFullYear() ? "" : `, ${d.getFullYear()}`;
  return `${month} ${ordinal(d.getDate())}${year}`;
}

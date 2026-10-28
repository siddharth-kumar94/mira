import type { Project } from "../api/types";
import type { Zoom } from "./model";

/**
 * The projects timeline's geometry (spec §19.5), pure. Days are local calendar days, as everywhere in Mira (`dayOf`):
 * a date-only "2026-10-01" is that day, a timestamp is its local day plus the time of day.
 */

/**
 * Pixels per day, measured on Linear at every zoom (bar widths, header labels): Year 2.5, so a 31-day month is the
 * 77.5 step of its dashed grid (75 for 30 days, 70 for February); Quarter 5; Month 15; Week 30. Ruling 4 read the
 * 77.5 step as a week; the measurement wins (T10's ruling), and only these four constants change.
 */
export const PX_PER_DAY: Record<Zoom, number> = { year: 2.5, quarter: 5, month: 15, week: 30 };

export interface Scale {
  origin: string; zoom: Zoom; ppd: number;
  /** The left edge of a day ("2026-10-01"), or a moment's place inside its day (a timestamp). */
  x(iso: string): number;
  /** The day under an x. */
  day(x: number): string;
}

const DAY = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 as a continuous number; NaN when unreadable. */
export function dayNumber(iso: string): number {
  const m = DATE.exec(iso);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  const midnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const ms = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
  return (midnight + ms) / DAY;
}
/** The ISO date of a whole day number. */
export const isoOf = (day: number): string => new Date(Math.floor(day) * DAY).toISOString().slice(0, 10);
const weekday = (day: number) => (((Math.floor(day) + 4) % 7) + 7) % 7; // 0 Sunday … 6 Saturday (1970-01-01 was a Thursday)
const parts = (day: number) => { const d = new Date(Math.floor(day) * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };

export function makeScale(origin: string, zoom: Zoom): Scale {
  const o = Math.floor(dayNumber(origin));
  const ppd = PX_PER_DAY[zoom];
  return { origin, zoom, ppd, x: (iso) => (dayNumber(iso) - o) * ppd, day: (x) => isoOf(o + Math.floor(x / ppd + 1e-9)) };
}

/** A local "now" as an ISO timestamp, for `x` (the today line sits at the time of day, as Linear's). */
export const nowIso = (now: number): string => new Date(now).toISOString();

/** The ISO 8601 week number of a day. */
export function isoWeek(iso: string): number {
  const day = Math.floor(dayNumber(iso));
  const thursday = day - ((weekday(day) + 6) % 7) + 3; // the Thursday of its Monday-to-Sunday week
  const jan1 = Date.UTC(parts(thursday).y, 0, 1) / DAY;
  return Math.floor((thursday - jan1) / 7) + 1;
}

export interface Bar { left: number; width: number; overrun: number }
/**
 * A project's bar: its start day to the end of its target day (Linear: Jun 25 → Oct 1 is 99 days). No target, no bar
 * (the row stays); no start, a 1-day bar at the target; a start after the target is swapped. Never NaN, never under 1px.
 * The overrun is x(today) − x(target) once today is past the target and the project isn't Completed; drawn from the
 * target, under the bar's last day, it ends on the today line.
 */
export function barGeometry(p: Project, today: string, s: Scale): Bar | null {
  const target = p.target === null ? NaN : Math.floor(dayNumber(p.target));
  if (!Number.isFinite(target)) return null;
  const startDay = p.start === null ? NaN : Math.floor(dayNumber(p.start));
  const start = Number.isFinite(startDay) ? startDay : target;
  const lo = Math.min(start, target), hi = Math.max(start, target);
  const left = s.x(isoOf(lo));
  const width = Math.max(1, (hi - lo + 1) * s.ppd);
  const now = dayNumber(today);
  const late = p.status_category !== "completed" && Number.isFinite(now) && Math.floor(now) > hi;
  return { left, width, overrun: late ? Math.max(0, s.x(today) - s.x(isoOf(hi))) : 0 };
}

const days = (from: string, to: string) => {
  const a = Math.floor(dayNumber(from)), b = Math.floor(dayNumber(to));
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : { a: 0, b: -1 };
};

/** The x of every Monday from `from` to `to`. */
export function weekLines(from: string, to: string, s: Scale): number[] {
  const { a, b } = days(from, to);
  const out: number[] = [];
  for (let d = a + ((8 - weekday(a)) % 7); d <= b; d += 7) out.push(s.x(isoOf(d)));
  return out;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Each month's first day from `from` to `to`, labelled as Linear's header: "MAR", and "JAN 2026" for a January. */
export function monthLabels(from: string, to: string, s: Scale): { x: number; label: string }[] {
  const { a, b } = days(from, to);
  const out: { x: number; label: string }[] = [];
  let { y, m } = parts(a);
  if (parts(a).d !== 1) m += 1;
  for (;;) {
    const first = Date.UTC(y, m, 1) / DAY;
    if (first > b) break;
    const p = parts(first);
    out.push({ x: s.x(isoOf(first)), label: p.m === 0 ? `JAN ${p.y}` : MONTHS[p.m] });
    m += 1;
  }
  return out;
}

/**
 * The day row: Mondays, every other one (odd ISO weeks) at Year and every one closer in, as Linear's header. The label
 * is the day of the month, or the ISO week number with "Show week numbers".
 */
export function dayLabels(from: string, to: string, s: Scale, weekNumbers: boolean): { x: number; label: string }[] {
  return weekLines(from, to, s).map((x) => s.day(x))
    .filter((iso) => s.zoom !== "year" || isoWeek(iso) % 2 === 1)
    .map((iso) => ({ x: s.x(iso), label: String(weekNumbers ? isoWeek(iso) : parts(dayNumber(iso)).d) }));
}

/** Saturdays and Sundays, shaded at Month and Week zoom (Linear's 2-day columns). */
export function weekends(from: string, to: string, s: Scale): { x: number; width: number }[] {
  const { a, b } = days(from, to);
  const out: { x: number; width: number }[] = [];
  for (let d = a + ((6 - weekday(a) + 7) % 7); d <= b; d += 7) out.push({ x: s.x(isoOf(d)), width: 2 * s.ppd });
  return out;
}

export interface Band { name: string; left: number; width: number; start: number; end: number }
/**
 * Time bands for PIs (D37) and "Show cycles": start to end, a date-only end including its day. Items without both
 * dates, or with unreadable ones, are left out; reversed dates are swapped.
 */
export function bands(items: { name: string; start: string | null; end: string | null }[], s: Scale): Band[] {
  const out: Band[] = [];
  for (const it of items) {
    if (it.start === null || it.end === null) continue;
    const [first, last] = dayNumber(it.end) < dayNumber(it.start) ? [it.end, it.start] : [it.start, it.end];
    const lo = dayNumber(first);
    const hi = dayNumber(last) + (DATE.test(last) ? 1 : 0);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    out.push({ name: it.name, left: s.x(first), width: Math.max(1, (hi - lo) * s.ppd), start: lo, end: hi });
  }
  return out;
}

/** Five years either side of today: a date typed as 1901 doesn't make the canvas a century wide. */
const CLAMP_DAYS = 5 * 365;
/** About a screen of room past the first and last dates, so "Today" can always centre today. */
const ROOM_PX = 1600;

/** The canvas: from the first of the month before the earliest date (or today) less a screen, to the latest plus a screen. */
export function timelineRange(projects: Project[], today: string, zoom: Zoom): { from: string; to: string } {
  const t = Math.floor(dayNumber(today));
  const dates = projects.flatMap((p) => [p.start, p.target]).filter((d): d is string => d !== null)
    .map((d) => Math.floor(dayNumber(d))).filter((d) => Number.isFinite(d) && Math.abs(d - t) <= CLAMP_DAYS);
  const room = Math.ceil(ROOM_PX / PX_PER_DAY[zoom]);
  const lo = Math.min(t, ...dates) - room, hi = Math.max(t, ...dates) + room;
  const first = parts(lo);
  return { from: isoOf(Date.UTC(first.y, first.m, 1) / DAY), to: isoOf(hi) };
}

/** Linear's today pill: "OCT 19". */
export function todayPill(now: number): string {
  const d = new Date(now);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

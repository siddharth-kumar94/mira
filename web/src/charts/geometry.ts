/**
 * The burn-up's geometry (spec §19.9), pure so it tests without a DOM. Days are UTC days, as the server's series.
 * x runs from the start of the first day to the end of the last; y from 0 (the bottom) up to the largest scope (the top).
 */
import type { Burnup } from "../api/types";

const DAY = 86_400_000;
/** "2026-10-19" (or a full ISO stamp) as the UTC midnight that starts that day. */
export const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
/** Two decimals: SVG strings stay short and tests can compare them. */
const r = (n: number) => Math.round(n * 100) / 100;

export interface Scale {
  width: number;
  height: number;
  /** UTC midnight of the first day. */
  start: number;
  /** UTC midnight after the last day. */
  end: number;
  /** The largest scope: the top of the chart. */
  max: number;
  now: number;
  /** Now, as x; it may fall outside 0..width for a past or future range. */
  nowX: number;
  x(ms: number): number;
  y(points: number): number;
}

export function chartScale(b: Burnup, width: number, height: number, now: number = Date.now()): Scale {
  const start = dayMs(b.start);
  const end = dayMs(b.end) + DAY;
  const max = Math.max(0, ...b.points.map((p) => p.scope)) || 1;
  const x = (ms: number) => r(((ms - start) / (end - start)) * width);
  const y = (v: number) => r(height - (v / max) * height);
  return { width, height, start, end, max, now, nowX: x(now), x, y };
}

export interface Position { x: number; scope: number; started: number; completed: number }

/**
 * Where each point is drawn. A point is its day's state at the day's end, so it sits at the end of its day, and today's at
 * now. An origin at the start carries the first day's scope with nothing started or done yet (Linear's lines rise from 0).
 * `started` is In Progress plus Done here: Linear's yellow line stacks over the completed one (cycles.png: 7 + 3 at "10").
 */
export function positions(b: Burnup, s: Scale): Position[] {
  if (b.points.length === 0) return [];
  const at = (day: string) => Math.min(s.x(dayMs(day) + DAY), Math.max(s.nowX, 0), s.width);
  return [
    { x: 0, scope: b.points[0].scope, started: 0, completed: 0 },
    ...b.points.map((p) => ({ x: at(p.day), scope: p.scope, started: p.started + p.completed, completed: p.completed })),
  ];
}

/**
 * A monotone cubic through the points (Fritsch–Carlson, d3's curveMonotoneX): smooth like Linear's project scope curve,
 * never overshooting a flat stretch. Continues an open path when `move` is false.
 */
function monotone(pts: [number, number][], move = true): string {
  const n = pts.length;
  if (n === 0) return "";
  const head = move ? `M${pts[0][0]},${pts[0][1]}` : `L${pts[0][0]},${pts[0][1]}`;
  if (n === 1) return head;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push(dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0);
  }
  const m = pts.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2]
    : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i];
    const c = m[i + 1] / slope[i];
    const h = a * a + c * c;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * slope[i]; m[i + 1] = t * c * slope[i]; }
  }
  let d = head;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (!dx[i]) { d += `L${x1},${y1}`; continue; }
    const k = dx[i] / 3;
    d += `C${r(x0 + k)},${r(y0 + m[i] * k)},${r(x1 - k)},${r(y1 - m[i + 1] * k)},${x1},${y1}`;
  }
  return d;
}

export interface Paths { scope: string; scopeArea: string; started: string; startedArea: string; completed: string; completedArea: string }

/** The three lines, and the areas under them. Scope runs on, flat, to the end; started and completed stop at today. */
export function paths(b: Burnup, s: Scale): Paths {
  const ps = positions(b, s);
  if (ps.length === 0) return { scope: "", scopeArea: "", started: "", startedArea: "", completed: "", completedArea: "" };
  const line = (key: "scope" | "started" | "completed") => monotone(ps.map((p) => [p.x, s.y(p[key])]));
  const last = ps[ps.length - 1];
  const scope = last.x < s.width ? `${line("scope")}L${s.width},${s.y(last.scope)}` : line("scope");
  const close = (d: string, to: number) => `${d}L${to},${s.height}L0,${s.height}Z`;
  const started = line("started");
  const completed = line("completed");
  return {
    scope, scopeArea: close(scope, s.width), started, startedArea: close(started, last.x), completed,
    completedArea: close(completed, last.x),
  };
}

/** A UTC day that is a Saturday or Sunday. */
const weekend = (d: number) => { const dow = new Date(d).getUTCDay(); return dow === 0 || dow === 6; };

/** One band per Saturday and Sunday from `start` to `end` (both days included). */
export function weekendBands(start: string, end: string, s: Scale): { x: number; w: number }[] {
  const bands: { x: number; w: number }[] = [];
  for (let d = dayMs(start); d <= dayMs(end); d += DAY) {
    if (weekend(d)) bands.push({ x: s.x(d), w: r(s.x(d + DAY) - s.x(d)) });
  }
  return bands;
}

/** The week boundaries (7, 14, … days from the start) inside the range, as x. */
export function weeklyGuides(s: Scale): number[] {
  return weeks(s).map(s.x);
}
const weeks = (s: Scale) => {
  const ms: number[] = [];
  for (let d = s.start + 7 * DAY; d < s.end; d += 7 * DAY) ms.push(d);
  return ms;
};

/**
 * The cycle's ideal line, as Linear draws it (cycles.png, cycle-page.png): from (start, 0), the scope spread over the working
 * days up to the end of `end`, rising a share each weekday and flat across each weekend, so it reaches the scope at the end of
 * the last working day. Scope is the latest point's. Null with no points, no working days, or once the cycle has ended.
 */
export function projection(b: Burnup, end: string, s: Scale): string | null {
  if (b.points.length === 0 || s.now >= s.end) return null;
  const last = dayMs(end);
  const working = (d: number) => !weekend(d);
  let days = 0;
  for (let d = s.start; d <= last; d += DAY) if (working(d)) days += 1;
  if (days === 0) return null;
  const scope = Math.max(0, b.points[b.points.length - 1].scope);
  const step = scope / days;
  let v = 0;
  let d0 = `M0,${s.y(0)}`;
  for (let d = s.start; d <= last; d += DAY) {
    if (working(d)) v = Math.min(scope, v + step);
    d0 += `L${s.x(d + DAY)},${s.y(Math.max(0, Math.min(scope, v)))}`;
  }
  return d0;
}

export interface AxisLabel { text: string; x: number; anchor: "start" | "middle" | "end" }

const label = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** 12/400 Inter: about 6px a character ("Oct 19" is 35.7 wide in cycles-points.json). */
const textWidth = (t: string) => t.length * 6;
const extent = (l: AxisLabel) => {
  const w = textWidth(l.text);
  const left = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - w : l.x - w / 2;
  return [left, left + w] as const;
};

/**
 * Labels at the start, today and the end (spec §19.9), in that order of precedence; the cycle variant adds Linear's week
 * marks (cycles.png: "Oct 19 · Oct 26 · Nov 2"). A cycle's end is the day after its last, as Linear's "Nov 2" for a cycle
 * ending Nov 1; a project's is its last day, as Linear's "Jan 1" target. A label that would touch one already placed is dropped.
 */
export function axisLabels(s: Scale, variant: "cycle" | "project"): AxisLabel[] {
  const candidates: AxisLabel[] = [
    { text: label(s.start), x: 0, anchor: "start" },
    { text: label(variant === "cycle" ? s.end : s.end - DAY), x: s.width, anchor: "end" },
  ];
  // Today reads in the viewer's own time; the days, and every other label, stay UTC as the server's series.
  const local = new Date(s.now).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (s.nowX >= 0 && s.nowX <= s.width) candidates.push({ text: local, x: s.nowX, anchor: "middle" });
  if (variant === "cycle") for (const d of weeks(s)) candidates.push({ text: label(d), x: s.x(d), anchor: "middle" });
  const placed: AxisLabel[] = [];
  for (const c of candidates) {
    const [l, rr] = extent(c);
    if (placed.every((p) => { const [pl, pr] = extent(p); return rr + 8 <= pl || l >= pr + 8; })) placed.push(c);
  }
  return placed;
}

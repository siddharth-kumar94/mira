import type { CSSProperties, ReactNode } from "react";
import type { Cycle, Project } from "../api/types";

/** Mira's own icons on a 16-unit grid, in currentColor, drawn to Linear's geometry (spec §18, inventory §13). */
export const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const SOLID = { fill: "currentColor", stroke: "currentColor", strokeWidth: 1, strokeLinejoin: "round" } as const;
const KNOB = { fill: "var(--color-surface)", stroke: "currentColor", strokeWidth: 1.5 } as const;
export const PLAY = <path d="M6.75 5.75v4.5L10.5 8z" {...SOLID} />;

type Pt = readonly [number, number];
const num = (n: number) => +n.toFixed(3);
const toward = (a: Pt, b: Pt, d: number): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [a[0] + ((b[0] - a[0]) / l) * d, a[1] + ((b[1] - a[1]) / l) * d];
};

/**
 * A closed polygon whose corners are cut back `r` (one for all, or per vertex) along each edge and curved through the vertex.
 * The path starts at the middle of the last edge, moved `shift` toward the first vertex (negative: away from it),
 * so a dashed regular polygon can put its seam inside a gap.
 */
export function roundedPolygon(pts: readonly Pt[], r: number | readonly number[], shift = 0): string {
  const at = (i: number) => pts[(i + pts.length) % pts.length];
  const p = (q: Pt) => `${num(q[0])} ${num(q[1])}`;
  const mid: Pt = [(at(-1)[0] + at(0)[0]) / 2, (at(-1)[1] + at(0)[1]) / 2];
  let d = `M${p(shift ? toward(mid, at(0), shift) : mid)}`;
  pts.forEach((v, i) => {
    const cut = typeof r === "number" ? r : r[i];
    d += `L${p(toward(v, at(i - 1), cut))}Q${p(v)} ${p(toward(v, at(i + 1), cut))}`;
  });
  return `${d}Z`;
}

/** A pointy-top hexagon of circumradius `size` (project statuses, inventory-p4 §7). */
export const hexagon = (cx: number, cy: number, size: number, r: number, shift = 0) =>
  roundedPolygon([0, 1, 2, 3, 4, 5].map((k): Pt => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
  }), r, shift);

const TRIANGLE: Pt[] = [[8, 1.75], [14.4, 13.75], [1.6, 13.75]];
/** The calendar's filled header band, y 1–6 inside the 1–15 outline (measured on the date-target crop). */
const BAND = <path d="M1 6V4.5A3.5 3.5 0 0 1 4.5 1h7A3.5 3.5 0 0 1 15 4.5V6z" fill="currentColor" />;

export const ICONS = {
  filter: <path {...S} d="M1.75 3.75h12.5M4 8h8M6 12.25h4" />,
  display: <><path {...S} d="M2.25 5h12.5M2.25 11h12.5" /><circle cx="6" cy="5" r="1.75" {...KNOB} /><circle cx="10" cy="11" r="1.75" {...KNOB} /></>,
  caret: <path d="M5.25 6.25h5.5L8 9.75z" {...SOLID} />,
  chevron: <path {...S} d="M4.5 6.25 8 9.75l3.5-3.5" />,
  chevronRight: <path {...S} d="M6.25 4.5 9.75 8l-3.5 3.5" />,
  /** The settings "Back to app" pill. */
  chevronLeft: <path {...S} d="M9.75 4.5 6.25 8l3.5 3.5" />,
  plus: <path {...S} d="M8 3.25v9.5M3.25 8h9.5" />,
  more: <><circle cx="3.5" cy="8" r="1.25" fill="currentColor" /><circle cx="8" cy="8" r="1.25" fill="currentColor" /><circle cx="12.5" cy="8" r="1.25" fill="currentColor" /></>,
  compose: <><path {...S} d="M13.25 8.75v3.5a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5h3.5" /><path {...S} d="m7.25 8.75 5.5-5.5" /></>,
  search: <><circle {...S} cx="7" cy="7" r="4.1" /><path {...S} d="m10.2 10.2 3.3 3.3" /></>,
  myIssues: <><path {...S} d="M2.75 5.75v-1.5a1.5 1.5 0 0 1 1.5-1.5h1.5M10.25 2.75h1.5a1.5 1.5 0 0 1 1.5 1.5v1.5M13.25 10.25v1.5a1.5 1.5 0 0 1-1.5 1.5h-1.5M5.75 13.25h-1.5a1.5 1.5 0 0 1-1.5-1.5v-1.5" /><circle cx="8" cy="8" r="2" fill="currentColor" /></>,
  initiatives: <><path {...S} d="M3.9 11.7a5.75 5.75 0 1 1 8.2 0" /><path d="M8 5.75 11.25 12 8 10.3 4.75 12z" {...SOLID} /></>,
  project: <><path {...S} d="M8 1.75 13.5 4.9v6.2L8 14.25 2.5 11.1V4.9z" /><path {...S} d="M2.75 5 8 8.1 13.25 5M8 8.1v6" /></>,
  issues: <><rect {...S} x="2.25" y="2.25" width="8.5" height="8.5" rx="2" /><path {...S} d="M13.75 6.25v5.5a2 2 0 0 1-2 2h-5.5" /></>,
  cycles: <><path {...S} d="M13.75 8a5.75 5.75 0 1 1-2.6-4.8" />{PLAY}</>,
  estimate: <><path {...S} d={roundedPolygon(TRIANGLE, 2)} /><path {...SOLID} strokeWidth={1.5} d={roundedPolygon([[8, 1.75], [14.4, 13.75], [8, 13.75]], [2, 2, 0])} /></>,
  tag: <><path {...S} d="M2.5 8 5.6 3.75h6.65a1.25 1.25 0 0 1 1.25 1.25v6a1.25 1.25 0 0 1-1.25 1.25H5.6z" /><circle cx="6.5" cy="8" r="1" fill="currentColor" /></>,
  team: <><rect {...S} x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5" /><circle cx="8" cy="6.75" r="1.75" fill="currentColor" /><path {...S} d="M5 11.25c.5-1.3 1.6-2 3-2s2.5.7 3 2" /></>,
  assign: <><circle cx="7" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M2.75 13.25c.35-2.5 2-4.25 4.25-4.25.9 0 1.7.25 2.35.75M10 12.5h4M12.25 10.75 14 12.5l-1.75 1.75" /></>,
  unassign: <><circle cx="7" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M2.75 13.25c.35-2.5 2-4.25 4.25-4.25.9 0 1.7.25 2.35.75M14 11.25h-3.5a1.5 1.5 0 0 0 0 3h1M11.75 9.5 10 11.25 11.75 13" /></>,
  creator: <><circle cx="7" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M2.75 13.25c.35-2.5 2-4.25 4.25-4.25M9.75 13.5l.4-1.6 3.1-3.1a.85.85 0 0 1 1.2 1.2l-3.1 3.1z" /></>,
  status: <><circle {...S} cx="8" cy="8" r="5.75" /><path d="M8 4.25a3.75 3.75 0 0 0 0 7.5z" fill="currentColor" /></>,
  priority: <><rect x="1.5" y="8" width="3" height="6" rx="1" fill="currentColor" /><rect x="6.5" y="5" width="3" height="9" rx="1" fill="currentColor" /><rect x="11.5" y="2" width="3" height="12" rx="1" fill="currentColor" /></>,
  link: <path {...S} d="M7 9a2.75 2.75 0 0 0 3.9 0l2-2a2.75 2.75 0 0 0-3.9-3.9l-.75.75M9 7a2.75 2.75 0 0 0-3.9 0l-2 2a2.75 2.75 0 0 0 3.9 3.9l.75-.75" />,
  copy: <><rect {...S} x="5.25" y="5.25" width="8.5" height="8.5" rx="2" /><path {...S} d="M10.75 5.25v-1a2 2 0 0 0-2-2h-4.5a2 2 0 0 0-2 2v4.5a2 2 0 0 0 2 2h1" /></>,
  send: <path {...S} d="M8 13V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  close: <path {...S} d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />,
  check: <path {...S} d="m3.5 8.5 3 3 6-6.75" />,
  list: <path {...S} d="M3 4.5h10M3 8h10M3 11.5h10" />,
  /** The Timeline layout tab: three staggered bars on a vertical axis. */
  timeline: <><path {...S} d="M5.25 2.25v11.5" /><rect x="2" y="3" width="6" height="2.5" rx="1" fill="currentColor" /><rect x="6.5" y="6.75" width="7.5" height="2.5" rx="1" fill="currentColor" /><rect x="3.5" y="10.5" width="6.5" height="2.5" rx="1" fill="currentColor" /></>,
  board: <><rect {...S} x="2.5" y="2.5" width="4.5" height="4.5" rx="1.25" /><rect {...S} x="9" y="2.5" width="4.5" height="4.5" rx="1.25" /><rect {...S} x="2.5" y="9" width="4.5" height="4.5" rx="1.25" /><rect {...S} x="9" y="9" width="4.5" height="4.5" rx="1.25" /></>,
  blocked: <><circle {...S} cx="8" cy="8" r="5.75" /><path {...S} d="m4 12 8-8" /></>,
  help: <><circle {...S} cx="8" cy="8" r="5.75" /><path {...S} d="M6.4 6.4a1.7 1.7 0 0 1 3.3.55c0 1.15-1.7 1.4-1.7 2.55" /><circle cx="8" cy="11.25" r=".9" fill="currentColor" /></>,
  arrowUp: <path {...S} d="M8 13V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  groupOrdering: <path {...S} d="M4.5 13V3M2 5.5 4.5 3 7 5.5M11.5 3v10M9 10.5l2.5 2.5 2.5-2.5" />,
  arrowDown: <path {...S} d="M8 3v9.5M4.25 8.75 8 12.5l3.75-3.75" />,
  open: <path {...S} d="M9.25 2.75h4v4M13 3 7.75 8.25M11.75 9.5v2.25a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5H6.5" />,
  theme: <><circle {...S} cx="8" cy="8" r="5.75" /><path d="M8 2.25a5.75 5.75 0 0 1 0 11.5z" fill="currentColor" /></>,
  calendar: <><rect {...S} x="1.75" y="1.75" width="12.5" height="12.5" rx="2.75" />{BAND}</>,
  calendarStart: <><path {...S} d="M14.25 6V4.5a2.75 2.75 0 0 0-2.75-2.75h-7A2.75 2.75 0 0 0 1.75 4.5v7a2.75 2.75 0 0 0 2.75 2.75h1.1M6.75 11h4.5" />{BAND}<path {...SOLID} d="M11.5 8.5 14.5 11l-3 2.5z" /></>,
  calendarOverdue: <><path {...S} d="M14.25 6V4.5a2.75 2.75 0 0 0-2.75-2.75h-7A2.75 2.75 0 0 0 1.75 4.5v7a2.75 2.75 0 0 0 2.75 2.75h1.55M8.9 8.9l5.2 5.2M14.1 8.9l-5.2 5.2" />{BAND}</>,
  settings: <><circle {...S} cx="8" cy="8" r="2" /><path {...S} d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4M12.4 12.4l-1.05-1.05M4.65 4.65 3.6 3.6" /></>,
  /** The projects Filter's Status field: a dashed circle (Linear's project-status filter mark). */
  statusDashed: <circle {...S} cx="8" cy="8" r="5.75" strokeDasharray="2.26 2.26" strokeLinecap="butt" />,
  /** A person: a filled head over open shoulders (the projects Filter's Lead). */
  person: <><circle cx="8" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M3.75 13.25c.4-2.6 2-4.25 4.25-4.25s3.85 1.65 4.25 4.25" /></>,
  /** The projects Filter's Health field: a filled disc with a rising zigzag knocked out of it. */
  health: <><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M4.6 9.5 6.85 7.1l2.2 2.3 2.35-2.75" fill="none" stroke="var(--color-surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>,
  /** The milestone slot's diamond (inventory-p4 §7 "No milestone", solid here): the projects Filter's PI field. */
  milestone: <path {...S} d={roundedPolygon([[8, 1.75], [14.25, 8], [8, 14.25], [1.75, 8]], 1.75)} />,
  /** The side-panel toggle (inventory-p4 §7 "view-header-buttons"): a window with its right pane filled. */
  panel: <><rect {...S} x="1.75" y="2.75" width="12.5" height="10.5" rx="2.75" /><rect x="8" y="5.5" width="3.5" height="5" rx="1" fill="currentColor" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 14, label, className = "" }: { name: IconName; size?: number; label?: string; className?: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return <svg width={size} height={size} viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...a11y}>{ICONS[name]}</svg>;
}

const R = 6.25;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Current: a ring whose dark arc is the time elapsed, around a play mark; upcoming: a dotted ring; past: a full ring (§18.3). */
export function CycleIcon({ cycle, now = Date.now(), size = 14 }: { cycle: Cycle; now?: number; size?: number }) {
  const start = Date.parse(cycle.start);
  const end = Date.parse(cycle.end);
  const upcoming = now < start;
  const done = now > end ? 1 : upcoming ? 0 : (now - start) / Math.max(1, end - start);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0 text-ink-3" aria-hidden>
      {upcoming
        ? <circle data-part="dots" cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.636 1.636" />
        : <>
            <circle cx="8" cy="8" r={R} fill="none" stroke="var(--color-ink-4)" strokeWidth="1.5" />
            <circle data-part="elapsed" cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeDasharray={`${(CIRCUMFERENCE * done).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`} transform="rotate(-90 8 8)" />
          </>}
      {PLAY}
    </svg>
  );
}

const PROJECT_COLOR: Record<Project["status_category"], string> = {
  backlog: "var(--color-ink-3)", planned: "var(--color-ink-3)", started: "var(--color-status-progress)", completed: "var(--color-status-done)",
};

/** Rally features have no colour: the cube takes its status category's (assumption 15). */
export function ProjectIcon({ project, size = 14 }: { project: Project | undefined; size?: number }) {
  const style: CSSProperties = { color: project ? PROJECT_COLOR[project.status_category] : "var(--color-ink-3)" };
  return <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" style={style} aria-hidden>{ICONS.project}</svg>;
}

/**
 * The project page's icon tile (inventory-p4 §2.2 #1, §7): 36, radius 6, the project colour at 0.125 alpha, the cube
 * centred on it at Linear's 19.5×21 glyph (the cube spans 11×12.5 of its 16 box, so it is drawn at 27).
 */
export function ProjectTile({ project }: { project: Project | undefined }) {
  const color = project ? PROJECT_COLOR[project.status_category] : "var(--color-ink-3)";
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[6px]"
      style={{ background: `color-mix(in lch, ${color} 12.5%, transparent)` }}>
      <ProjectIcon project={project} size={27} />
    </span>
  );
}

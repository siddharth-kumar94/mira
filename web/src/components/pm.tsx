import { useId, type CSSProperties, type ReactNode } from "react";
import type { Health, InitiativeStatus, ProjectCategory, Release, ReportedHealth, Update, User } from "../api/types";
import { healthAria, healthText } from "../pm/health";
import { Avatar } from "./Avatar";
import { dayOf, ordinalDate } from "./format";
import { Icon, PLAY, S, SOLID, hexagon } from "./icons";

/** Mira's own PM marks and chips (spec §19.2), drawn on the 16 grid from inventory-p4 §7's descriptions. */

const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const num = (n: number) => +n.toFixed(3);

type HealthMark = ReportedHealth | "none";
const HEALTH_CLASS: Record<HealthMark, string> = {
  on_track: "text-health-on", at_risk: "text-health-risk", off_track: "text-health-off", none: "text-ink-4",
};
/** On track rises (down, up, up-right); off track is its mirror; at risk dips, then rises. */
const HEALTH_STROKE: Record<ReportedHealth, string> = {
  on_track: "M3.8 9.75 6.9 6.25l2.2 3.5 3.1-3.5",
  off_track: "M3.8 6.25 6.9 9.75l2.2-3.5 3.1 3.5",
  at_risk: "M3.95 8.2 6.55 10.9 9.8 4.6l2.25 2",
};

export function HealthIcon({ value, size = 16 }: { value: HealthMark; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`shrink-0 ${HEALTH_CLASS[value]}`} aria-hidden>
      {value === "none"
        ? <circle cx="8" cy="8" r="7.5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2.36 2.36" strokeLinecap="round" />
        : <><circle cx="8" cy="8" r="8" fill="currentColor" fillOpacity="0.25" /><path {...S} d={HEALTH_STROKE[value]} /></>}
    </svg>
  );
}

/** The initiatives list's active-project health: an 8px dot in the health colour, centred in a 16 box (inventory-p4 §7). */
export function HealthDot({ value, size = 16 }: { value: ReportedHealth; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={`shrink-0 ${HEALTH_CLASS[value]}`} aria-hidden>
      <circle cx="8" cy="8" r="4" fill="currentColor" />
    </svg>
  );
}

/** Linear's health chip: 24h, fully rounded, pad 0 8; "· 3d" at 0.7 alpha, or "· Auto" with the reason as its tooltip (D36). */
export function HealthChip({ health, latest, kind, now = Date.now(), iconOnly = false, onClick }: {
  health: Health | null; latest: Update | null; kind: "project" | "initiative"; now?: number; iconOnly?: boolean; onClick?: () => void;
}) {
  // Not read yet (an issue-side copy): a blank holding the chip's box until a PM read brings the health.
  if (!health) return <span aria-hidden data-health="unread" className={iconOnly ? "inline-flex size-7 shrink-0" : "inline-flex h-6 shrink-0"} />;
  const text = healthText(health, latest, now);
  const mark: HealthMark = health.value === "no_target" ? "none" : health.value;
  const title = health.source === "auto" && !text.none && health.reason ? health.reason : undefined;
  const common = { type: "button" as const, "aria-label": healthAria(health, latest, kind, now, iconOnly), title, onClick };
  if (iconOnly) {
    return (
      <button {...common} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-health-hover">
        <HealthIcon value={mark} size={14} />
      </button>
    );
  }
  return (
    <button {...common}
      className="inline-flex h-6 shrink-0 items-center gap-2 rounded-full border border-transparent px-2 text-mini font-medium whitespace-nowrap hover:bg-health-hover">
      <HealthIcon value={mark} />
      <span className={text.none ? "text-ink-3" : HEALTH_CLASS[mark]}>
        {text.label}{text.age && <span style={{ opacity: 0.7 }}>{`\u00a0·\u00a0${text.age}`}</span>}
      </span>
    </button>
  );
}

const PROJECT_STATUS_COLOR: Record<ProjectCategory, string> = {
  backlog: "var(--color-project-backlog)", planned: "var(--color-project-planned)",
  started: "var(--color-health-risk-icon)", completed: "var(--color-chart-done)",
};
const HEX = hexagon(8, 8, 6, 1.5);
/**
 * Backlog's 12 dashes sit on the 6 vertices and 6 edge midpoints. Linear's measured pattern is 55% dash, 45% gap
 * (1.65px, 1.35px), here over the 34.415 perimeter. The path starts mid-gap, halfway between a midpoint and a vertex,
 * and the pattern opens with that half gap, so the closing seam stays inside a gap.
 * (Absolute lengths: Chrome's pathLength scaling drifts on the rounded corners.)
 */
const PERIOD = 34.415 / 12;
const BACKLOG_HEX = hexagon(8, 8, 6, 1.5, PERIOD / 2);
const BACKLOG_DASHES = [0, (0.45 * PERIOD) / 2, 0.55 * PERIOD, (0.45 * PERIOD) / 2].map(num).join(" ");
const INNER_HEX = hexagon(8, 8, 3.4, 0.5);
const WEDGE_ROUND = 2 * Math.PI * 4;
const CHECK = "M4.95 8.1 6.85 9.75l3.9-3.4";

/** Backlog a dashed hexagon, Planned an open one, In Progress a hexagon with a progress wedge, Completed filled with a check. */
export function ProjectStatusIcon({ category, progress, size = 16 }: { category: ProjectCategory; progress: number; size?: number }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" style={{ color: PROJECT_STATUS_COLOR[category] }} aria-hidden>
      {category === "completed"
        ? <><path data-part="hex" d={HEX} {...SOLID} strokeWidth={1.5} />
            <path data-part="check" d={CHECK} {...S} stroke="var(--color-accent-ink)" /></>
        : category === "backlog"
          ? <path data-part="hex" d={BACKLOG_HEX} {...S} strokeDasharray={BACKLOG_DASHES} strokeLinecap="butt" />
          : <path data-part="hex" d={HEX} {...S} />}
      {category === "started" && <>
        <clipPath id={clip}><path d={INNER_HEX} /></clipPath>
        {/* The clip sits on a group: on the circle it would turn with the circle's rotation. */}
        <g clipPath={`url(#${clip})`}>
          <circle data-part="wedge" cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="8"
            strokeDasharray={`${num(WEDGE_ROUND * clamp(progress))} ${num(WEDGE_ROUND)}`} transform="rotate(-90 8 8)" />
        </g>
      </>}
    </svg>
  );
}

const INITIATIVE_STATUS_COLOR: Record<InitiativeStatus, string> = {
  planned: "var(--color-status-todo)", active: "var(--color-health-risk-icon)", completed: "var(--color-chart-done)",
};
/** An open-bottomed arc (centre 8, 7.83) over a notched triangle. */
const INITIATIVE = <>
  <path {...S} strokeWidth={1.6} d="M2.48 10.17A6 6 0 1 1 13.52 10.17" />
  <path {...SOLID} d="M8 8.8 10.5 12.55 8 11.6 5.5 12.55z" />
</>;

/** The same glyph drawn small (7×6 at 4.5,4.5) for inside the status ring. */
const INITIATIVE_SMALL = <>
  <path {...S} strokeWidth={1.25} d="M5.4 9.2A2.875 2.875 0 1 1 10.6 9.2" />
  <path {...SOLID} strokeWidth={0.75} d="M8 6.9 9.6 10.1 8 9.4 6.4 10.1z" />
</>;

/** The initiative glyph in its colour; with a status, the glyph sits small inside a ring in the status colour. */
export function InitiativeIcon({ status, size = 16, color }: { status?: InitiativeStatus; size?: number; color?: string }) {
  const style: CSSProperties = { color: color ?? (status ? INITIATIVE_STATUS_COLOR[status] : "var(--color-chart-done)") };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" style={style} aria-hidden>
      {status
        ? <><circle data-part="ring" cx="8" cy="8" r="6.25" {...S} />{INITIATIVE_SMALL}</>
        : INITIATIVE}
    </svg>
  );
}

const DONE_HEX = hexagon(8, 7.75, 6, 1.5);

/** "n / total" projects completed: an accent hexagon outline with a check, on Linear's 1–15 box (inventory-p4 §3.1). */
export function ProjectsDoneIcon() {
  return (
    <svg width={16} height={16} viewBox="1 1 14 14" className="shrink-0 text-chart-done" aria-hidden>
      <path d={DONE_HEX} {...S} />
      <path data-part="check" {...S} d="M5.75 8.1 7.4 9.75l2.85-3.5" />
    </svg>
  );
}

/**
 * An accent arc from 12 o'clock for `fraction`, over a track that leaves `gap` (along the circle) either side of it.
 * At 0 only a dot marks the top; at 1 the arc closes.
 */
function Arc({ r, width, fraction, gap, track, part }: { r: number; width: number; fraction: number; gap: number; track: string; part: string }) {
  const round = 2 * Math.PI * r;
  const f = clamp(fraction);
  const arc = round * f;
  const rest = round - arc - 2 * gap;
  const ring = { cx: 8, cy: 8, r, fill: "none", strokeWidth: width, strokeLinecap: "round" as const, transform: "rotate(-90 8 8)" };
  return <>
    {f < 1 && rest > 0 && <circle {...ring} stroke={track} strokeDasharray={`${num(rest)} ${num(round)}`} strokeDashoffset={num(-(arc + gap))} />}
    {f === 0
      ? <circle data-part="dot" cx="8" cy={8 - r} r={width / 2} fill="var(--color-chart-done)" />
      : <circle data-part={part} {...ring} stroke="var(--color-chart-done)" strokeDasharray={`${num(arc)} ${num(round)}`} />}
  </>;
}

/** Planned a dashed ring, Upcoming a solid one, Current the elapsed time in accent, Past a closed ring; each around a play mark. */
export function CycleStatusIcon({ status, elapsed, size = 16, track = "var(--color-ink-4)", play }: {
  status: "planned" | "upcoming" | "current" | "past"; elapsed: number; size?: number;
  /** The cycle panel's title icon draws its ring in `chart-scope` and its play mark in `ink-3` (cycle-icons.json). */
  track?: string; play?: string;
}) {
  const ring = { cx: 8, cy: 8, r: 6.25, fill: "none", stroke: track, strokeWidth: 1.5 };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" aria-hidden>
      {status === "planned" && <circle data-part="ring" {...ring} strokeDasharray="1.636 1.636" />}
      {status === "upcoming" && <circle data-part="ring" {...ring} />}
      {(status === "current" || status === "past") &&
        <Arc r={6.25} width={1.5} fraction={status === "past" ? 1 : elapsed} gap={3.5} track={track} part="elapsed" />}
      <g className={play ?? (status === "current" ? "text-ink-1" : "text-ink-3")}>{PLAY}</g>
    </svg>
  );
}

/** The capacity and breakdown ring: a 2-wide track with an accent arc for the fraction; 0 shows only the top dot. */
export function Ring({ fraction, size = 16, track = "var(--color-line-2)" }: { fraction: number; size?: number; track?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" aria-hidden>
      <Arc r={7} width={2} fraction={fraction} gap={3.5} track={track} part="arc" />
    </svg>
  );
}

/** Progress since the start, drawn as a straight rise across 32×16 (ruling 8); nothing at 0% or before the start. */
export function Sparkline({ start, progress, now }: { start: string | null; progress: number; now: number }) {
  if (!start || !(progress > 0) || dayOf(start).getTime() > now) return null;
  return (
    <svg width={32} height={16} viewBox="0 0 32 16" className="shrink-0" aria-hidden>
      <path d={`M0 16L32 ${num(16 - 16 * clamp(progress))}`} fill="none" stroke="var(--color-chart-done)" strokeWidth="1.25" />
    </svg>
  );
}

/** The PI in the next-milestone slot: 12/450 `ink-3`, no border (§19.1); Linear's milestone pill is 27h, radius 48, pad 0 4. */
export function PiChip({ release }: { release: Release | undefined }) {
  if (!release) return null;
  const day = (iso: string) => dayOf(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const range = release.start && release.end ? `${day(release.start)} – ${day(release.end)}` : undefined;
  return (
    <span title={range} className="inline-flex h-[27px] shrink-0 items-center rounded-[48px] px-1 text-mini font-normal whitespace-nowrap text-ink-3">
      {release.name}
    </span>
  );
}

/** A calendar and "Oct 1st" (12/450 `ink-2`; `ink-3` when `muted` as on board cards, `ink-1` when `strong`) in a 28h pill; past target swaps in the red calendar with an ×. */
export function DateChip({ iso, overdue = false, icon = "target", ariaLabel, now, muted = false, strong = false }: {
  iso: string | null; overdue?: boolean; icon?: "target" | "start"; ariaLabel?: string; now?: number; muted?: boolean;
  /** `ink-1`, as the initiatives list's target (initiatives-points.json). */
  strong?: boolean;
}) {
  if (!iso) return null;
  const name = overdue ? "calendarOverdue" : icon === "start" ? "calendarStart" : "calendar";
  return (
    <span role={ariaLabel ? "group" : undefined} aria-label={ariaLabel}
      className={`inline-flex h-7 shrink-0 items-center gap-2 rounded-full px-1.5 text-mini font-normal whitespace-nowrap ${muted ? "text-ink-3" : strong ? "text-ink-1" : "text-ink-2"}`}>
      <Icon name={name} size={16} className={overdue ? "text-overrun" : "text-ink-3"} />
      {ordinalDate(iso, now)}
    </span>
  );
}

/** A 16 avatar and the full name (12/450 `ink-2`) in a 28h pill; hover `fill-tag`. */
export function PersonChip({ user }: { user: User | null }) {
  return (
    <span className="inline-flex h-7 min-w-0 items-center gap-2 rounded-full px-1.5 text-mini font-normal text-ink-2 hover:bg-fill-tag">
      <Avatar user={user} size={16} />
      {user && <span className="truncate">{user.name}</span>}
    </span>
  );
}

/** Planned / Upcoming / Current: 13/450 `ink-3` on `fill-tag`, radius 2, pad 2 6. */
export function StatusTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-[2px] bg-fill-tag px-1.5 text-small leading-4 font-normal text-ink-3">{children}</span>;
}

const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Scope / Started / Completed in points, each with its 6×6 swatch and the estimate triangle; "• N%" of scope when `percent`.
 * Columns as in the cycle panel and project sidebar (`dense`: the sidebar's 12/500 labels), rows as in the cycles list.
 */
export function Legend({ scope, started, completed, percent = false, layout = "columns", dense = false }: {
  scope: number; started: number; completed: number; percent?: boolean; layout?: "columns" | "rows"; dense?: boolean;
}) {
  const items = [
    { label: "Scope", color: "var(--color-chart-scope)", value: scope, pct: null },
    { label: "Started", color: "var(--color-health-risk-icon)", value: started, pct: percent ? percentOf(started, scope) : null },
    { label: "Completed", color: "var(--color-chart-done)", value: completed, pct: percent ? percentOf(completed, scope) : null },
  ];
  const swatch = (color: string) => <span className="size-1.5 shrink-0 rounded-[1px]" style={{ background: color }} />;
  const amount = (value: number, pct: number | null) => <>
    <Icon name="estimate" size={14} className="text-ink-3" />
    <span className="font-medium text-ink-1">{value}</span>
    {pct !== null && <span className="text-mini text-ink-3">{`• ${pct}%`}</span>}
  </>;
  if (layout === "rows") {
    // The cycles list's legend (inventory-p4 §4.1, measured): 300 wide; rows pad 14 0 with a 1px line above all but the
    // first; the swatch (Scope's in `ink-4` here) 14 before the label; the triangle, then 12/500 points and "• 39%" 4 apart.
    return (
      <ul aria-label="Progress" className="w-[300px]">
        {items.map((it, n) => (
          <li key={it.label} className={`flex items-center py-3.5 text-ink-3 ${n ? "border-t border-line-2" : ""}`}>
            <span className="mr-3.5 size-1.5 shrink-0 rounded-[1px]" style={{ background: n ? it.color : "var(--color-ink-4)" }} />
            <span className="flex-1 text-small leading-4">{it.label}</span>
            <Icon name="estimate" size={14} className="text-ink-3" />
            <span className="ml-1 text-mini leading-[15px] font-medium text-ink-1 tabular-nums">{it.value}</span>
            {it.pct !== null && <span className="ml-1 text-mini leading-[15px] tabular-nums"><span className="mx-[3px]">•</span>{it.pct}%</span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="grid grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          {/* Dense (project-overview.png, measured): the swatch on the column's edge, the label 4 after it, the triangle 9 in. */}
          <div className={`flex h-[26px] items-center text-ink-3 ${dense ? "gap-1 text-mini font-medium" : "gap-2 pl-0.5 text-small"}`}>{swatch(it.color)}{it.label}</div>
          {/* The amount sits under the label's text (16 in), its centre 33.5 below the label row's top (cycle-page.png). */}
          <div className={`flex h-[15px] items-center ${dense ? "gap-1 pl-[9px] text-mini" : "gap-1.5 pl-4 text-small"}`}>{amount(it.value, it.pct)}</div>
        </div>
      ))}
    </div>
  );
}

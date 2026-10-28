import { useEffect, useId } from "react";
import type { Burnup, BurnupTarget } from "../api/types";
import { appStore, useApp } from "../store";
import { burnupKey } from "../store/store";
import { axisLabels, chartScale, dayMs, paths, positions, projection, weekendBands, weeklyGuides } from "./geometry";

type Variant = "cycle" | "project";
/**
 * Room above the plot: a cycle's today line rises 14 over the scope line (cycles.png: y287 against 301); a project's
 * scope line sits 47 under the legend's numbers (project-overview.png: the Progress panel's top +121.5, the numbers +74.5).
 */
const PAD_TOP: Record<Variant, number> = { cycle: 14, project: 38 };
/**
 * Under the plot: the 4px ticks 1.5 below the baseline, then the labels' baseline 21 down (the text box 8.5 down, 15 tall).
 * A project's 362×200 keeps 6 more, so its breakdown pills sit 54 under the baseline as Linear's.
 */
const AXIS: Record<Variant, number> = { cycle: 24, project: 30 };
/** Linear's completed bar at today (cycles.png and project-overview.png, both 38.5 tall at 2x), 4 wide. */
const BAR = 38;
const LINE = 1.5;

/**
 * Spec §19.9's burn-up: scope (grey line and area), started (yellow, stacked on completed as Linear's) and completed
 * (accent), with today's line, dots and bar. Cycles add the weekend hatch, weekly guides and the dashed ideal line (the projection) to the
 * end; projects add the target-date line in `overrun`, with a dashed fill past it. While it loads it keeps its space empty;
 * if Lookback fails the space says "Burn-up unavailable" (ruling 15).
 */
export function BurnUp({ target, width, height, variant, targetDate }: {
  target: BurnupTarget; width: number; height: number; variant: Variant; targetDate?: string | null;
}) {
  const key = burnupKey(target);
  const state = useApp((s) => s.burnups[key]);
  // Load on every mount: the chart already shown stays up while it reloads.
  useEffect(() => { void appStore.getState().loadBurnup(key, target); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `target` is `key`
  const box = { width, height };
  if (state === undefined || state === "loading") return <div data-burnup="loading" aria-busy="true" style={box} />;
  if (state === "error") {
    return (
      <div data-burnup="error" style={box} className="flex items-center justify-center text-mini text-ink-3">Burn-up unavailable</div>
    );
  }
  return <Chart b={state} width={width} height={height} variant={variant} targetDate={targetDate ?? null} />;
}

function Chart({ b, width, height, variant, targetDate }: { b: Burnup; width: number; height: number; variant: Variant; targetDate: string | null }) {
  const id = useId().replace(/:/g, "");
  const top = PAD_TOP[variant];
  const plot = Math.max(1, height - top - AXIS[variant]);
  const s = chartScale(b, width, plot);
  const p = paths(b, s);
  const ps = positions(b, s);
  const last = ps[ps.length - 1];
  const today = s.nowX >= 0 && s.nowX <= width ? s.nowX : null;
  const cycle = variant === "cycle";
  const proj = cycle ? projection(b, b.end, s) : null;
  // The end of the target day, as the cycle's end is the end of its last day; Linear's "Jan 1" target sits on the right edge.
  const targetX = !cycle && targetDate ? Math.max(0, Math.min(s.x(dayMs(targetDate) + 86_400_000), width)) : null;
  const url = (name: string) => `url(#${id}-${name})`;
  const vline = (x: number, y1: number, stroke: string, part: string) => (
    <line data-part={part} x1={x} x2={x} y1={y1} y2={plot} stroke={stroke} strokeWidth={1} shapeRendering="crispEdges" />
  );
  return (
    <svg data-burnup="ready" role="img" aria-label="Burn-up chart" width={width} height={height} className="block overflow-visible">
      <defs>
        <linearGradient id={`${id}-scope`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-chart-scope)" stopOpacity={0.08} />
          <stop offset="0.6" stopColor="var(--color-chart-scope)" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-started`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-health-risk-icon)" stopOpacity={0.09} />
          <stop offset="1" stopColor="var(--color-health-risk-icon)" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-completed`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-chart-done)" stopOpacity={0.27} />
          <stop offset="1" stopColor="var(--color-chart-done)" stopOpacity={0} />
        </linearGradient>
        {/* Linear's weekend hatch (cycles.png at 2x): "/" stripes 2 wide every 5.75 across, at atan(2). */}
        <pattern id={`${id}-hatch`} patternUnits="userSpaceOnUse" width={5.75} height={11.5}>
          <path d="M-5.75,11.5L0,0M0,11.5L5.75,0M5.75,11.5L11.5,0" stroke="var(--color-chart-hatch)" strokeWidth={1.8} />
        </pattern>
        <pattern id={`${id}-overrun`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--color-overrun)" strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.5} />
        </pattern>
        {p.scopeArea && <clipPath id={`${id}-under`}><path d={p.scopeArea} /></clipPath>}
      </defs>
      <g transform={`translate(0,${top})`}>
        {cycle && weeklyGuides(s).map((x) => <g key={x}>{vline(x, 0, "var(--color-chart-guide)", "guide")}</g>)}
        {p.scopeArea && <path data-part="scope-area" d={p.scopeArea} fill={url("scope")} />}
        {cycle && (
          <g clipPath={p.scopeArea ? url("under") : undefined}>
            {weekendBands(b.start, b.end, s).map((w) => <rect key={w.x} data-part="weekend" x={w.x} y={0} width={w.w} height={plot} fill={url("hatch")} />)}
          </g>
        )}
        {targetX !== null && targetX < width && (
          <rect data-part="past-target" x={targetX} y={0} width={width - targetX} height={plot} fill={url("overrun")} />
        )}
        {targetX !== null && vline(targetX, 0, "var(--color-overrun)", "target")}
        {today !== null && vline(today, cycle ? -top : 0, "var(--color-chart-today)", "today")}
        {p.startedArea && <path d={p.startedArea} fill={url("started")} />}
        {p.completedArea && <path d={p.completedArea} fill={url("completed")} />}
        {proj && <path data-part="projection" d={proj} fill="none" stroke="var(--color-chart-done)" strokeWidth={LINE} strokeDasharray="3 3" />}
        {p.scope && <path data-part="scope" d={p.scope} fill="none" stroke="var(--color-chart-scope)" strokeWidth={LINE} />}
        {p.started && <path data-part="started" d={p.started} fill="none" stroke="var(--color-health-risk-icon)" strokeWidth={LINE} strokeLinejoin="round" />}
        {p.completed && <path data-part="completed" d={p.completed} fill="none" stroke="var(--color-chart-done)" strokeWidth={LINE} strokeLinejoin="round" />}
        {today !== null && last && <>
          <rect x={today - 2} y={plot - Math.min(BAR, plot)} width={4} height={Math.min(BAR, plot)} rx={2} fill="var(--color-chart-done)" />
          <circle data-part="dot-started" cx={last.x} cy={s.y(last.started)} r={3.5} fill="var(--color-health-risk-icon)" />
          <circle data-part="dot-completed" cx={last.x} cy={s.y(last.completed)} r={3.5} fill="var(--color-chart-done)" />
        </>}
        {axisLabels(s, variant).map((l) => (
          <g key={`${l.text}-${l.x}`}>
            <line x1={l.x} x2={l.x} y1={plot + 1.5} y2={plot + 5.5} stroke="var(--color-ink-3)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={l.x} y={plot + 21} textAnchor={l.anchor} className="text-mini" fontWeight={400} fill="var(--color-ink-3)">{l.text}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

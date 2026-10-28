import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PROJECT_STATUS_LABEL, type Cycle, type Project, type Release } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Icon, ProjectIcon } from "../components/icons";
import { Menu, type MenuEntry } from "../components/Menu";
import { HealthChip, ProjectStatusIcon } from "../components/pm";
import { Popover } from "../components/Popover";
import { PriorityIcon } from "../components/PriorityIcon";
import { isTypingTarget } from "../keyboard/shortcuts";
import { formatRoute, type Route } from "../route";
import { appStore, useApp } from "../store";
import type { PmContext, PmOptions, PmProperty, Zoom } from "./model";
import { go } from "./ProjectList";
import {
  bands, barGeometry, dayLabels, dayNumber, isoOf, makeScale, monthLabels, nowIso, timelineRange, todayPill, weekends,
  type Band, type Scale,
} from "./timeline";

/**
 * Spec §19.5 Timeline (inventory-p4 §1.6, measured live 2026-10-19 at every zoom). The canvas is `panel`. The left
 * panel (320, "Show project list") has a row every 72 from 32 under the canvas top; it covers the canvas and sits under
 * the header's labels. The header is 32 tall: month labels at 1, week ticks at 10, day labels at 17, the today pill at 16;
 * PIs (D37) and cycles each add a 16 row under it, as Linear's "Show cycles" row. Year and Quarter draw dashed
 * `line-grid` month lines (Linear's 77.5 step is a 31-day month); Month and Week shade weekends instead. Read-only (D24).
 */
const ROW = 72;
const HEADER = 32;
const BAND_ROW = 16;
/** Bars sit 24 into their row; the name is 19 above the bar's top (barLabel at 133 over the bar at 152). */
const BAR_TOP = 24;
const NAME_ABOVE = 19;
/** Where a name pins while its bar runs under the panel: the panel's 320 plus 13. */
const NAME_PIN = 333;
/** The overrun box starts this far under the bar's end, so the pink fills behind its rounded corners (Linear: 10). */
const UNDERLAP = 10;

const ZOOMS: Zoom[] = ["year", "quarter", "month", "week"];
const ZOOM_LABEL: Record<Zoom, string> = { year: "Year", quarter: "Quarter", month: "Month", week: "Week" };
const ZOOM_KEY: Record<string, Zoom> = { y: "year", q: "quarter", m: "month", w: "week" };

/** Linear's overrun edge: a 6px checker of `overrun` at 0.5, showing through the box's 1px transparent border as dashes. */
const CHECKER: CSSProperties = {
  backgroundImage: [
    "linear-gradient(45deg, var(--color-overrun) 25%, transparent 25%)", "linear-gradient(-45deg, var(--color-overrun) 25%, transparent 25%)",
    "linear-gradient(45deg, transparent 75%, var(--color-overrun) 75%)", "linear-gradient(-45deg, transparent 75%, var(--color-overrun) 75%)",
  ].join(", "),
  backgroundSize: "6px 6px",
  backgroundPosition: "100% 100%, 100% calc(100% - 3px), calc(100% - 3px) calc(100% + 3px), calc(100% + 3px) 100%",
};
/** The today line: solid accent at the top, fading toward the bottom of the canvas, at 0.6. */
const TODAY_LINE: CSSProperties = { backgroundImage: "linear-gradient(0deg, var(--color-today-fade) 0%, var(--color-accent) 100%)", opacity: 0.6 };
/** Linear's cycle row: the number, then a 3px dotted run to the cycle's end, in the label's colour at 0.5. */
const dots = (color: string): CSSProperties => ({
  backgroundImage: `repeating-conic-gradient(${color} 0% 25%, transparent 0% 50%)`, backgroundSize: "3px 3px",
});

interface BandRow { kind: "pi" | "cycle"; label: string; items: (Band & { current: boolean; mark: string })[] }

export function Timeline({ projects, options, ctx, onOptions }: {
  projects: Project[]; options: PmOptions; ctx: PmContext; onOptions(next: Partial<PmOptions>): void;
}) {
  const now = nowIso(ctx.now);
  const today = isoOf(dayNumber(now));
  const { zoom } = options;
  const { from, to } = useMemo(() => timelineRange(projects, today, zoom), [projects, today, zoom]);
  const s = useMemo(() => makeScale(from, zoom), [from, zoom]);
  const width = (dayNumber(to) - dayNumber(from) + 1) * s.ppd;
  const todayX = s.x(now);

  // Show cycles: the chosen team's cycles, loaded once if no view has them yet.
  const cycleTeam = options.cycleTeamId;
  const cycleList = useApp((st) => (cycleTeam === null ? undefined : st.cycleLists[cycleTeam]));
  const cycles = useApp((st) => st.cycles);
  useEffect(() => {
    if (cycleTeam !== null && !appStore.getState().cycleLists[cycleTeam]) void appStore.getState().loadCycles(cycleTeam);
  }, [cycleTeam]);

  const rows = useMemo<BandRow[]>(() => {
    const out: BandRow[] = [];
    const t = dayNumber(now);
    const mark = (b: Band) => ({ ...b, current: b.start <= t && t < b.end });
    if (options.showPis) {
      // The store keeps one PI under every team copy's id: one band per PI.
      const pis = [...new Map(Object.values(ctx.releases).map((r): [number, Release] => [r.id, r])).values()]
        .sort((a, b) => (a.start ?? "~").localeCompare(b.start ?? "~"));
      out.push({ kind: "pi", label: "PIs", items: bands(pis, s).map((b) => ({ ...mark(b), mark: b.name })) });
    }
    if (cycleTeam !== null) {
      const list = (cycleList?.ids ?? []).flatMap((id): Cycle[] => (cycles[id] ? [cycles[id]] : []));
      const items = bands(list.map((c) => ({ name: c.short_name || c.name, start: c.start, end: c.end })), s)
        .map((b) => ({ ...mark(b), mark: /(\d+)\s*$/.exec(b.name)?.[1] ?? b.name }));
      out.push({ kind: "cycle", label: `${ctx.teams[cycleTeam]?.name ?? "Team"} sprints`, items });
    }
    return out;
  }, [options.showPis, ctx.releases, ctx.teams, cycleTeam, cycleList, cycles, s, now]);
  const header = HEADER + rows.length * BAND_ROW;

  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [viewHeight, setViewHeight] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    setViewHeight(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "Today" centres today on the canvas (measured on Linear after "Today": the line at 984 on 245–1719): on arrival, on
  // a zoom change and on the button. Until you
  // scroll yourself the view stays on today (projects still loading widen the range); after that, a range that moves
  // (a filter) keeps the date under the view.
  const pinned = useRef<number | null>(null);
  const centre = (smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    const left = Math.max(0, todayX - el.clientWidth / 2);
    if (smooth && typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "smooth" });
    else el.scrollLeft = left;
    pinned.current = smooth ? null : el.scrollLeft;
  };
  const shown = useRef<{ zoom: Zoom; from: string; to: string } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    const prev = shown.current;
    shown.current = { zoom, from, to };
    if (!el) return;
    if (!prev || prev.zoom !== zoom || pinned.current !== null) centre();
    else if (prev.from !== from) el.scrollLeft += (dayNumber(prev.from) - dayNumber(from)) * s.ppd;
  }, [zoom, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (pinned.current !== null && Math.abs(el.scrollLeft - pinned.current) > 1) pinned.current = null;
    // Rows scroll under the header, which is see-through (the grid and today line run through it): clip them at its foot.
    if (body.current) body.current.style.clipPath = `inset(${el.scrollTop}px 0 0 0)`;
  };

  const [zoomOpen, setZoomOpen] = useState(false);
  const onOptionsRef = useRef(onOptions);
  useLayoutEffect(() => {
    onOptionsRef.current = onOptions;
  });
  useEffect(() => {
    // The app's G prefix (spec §10): the key after G belongs to it ("g m" is My issues), whichever handler hears it first.
    let afterG = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const prefixed = afterG;
      afterG = false;
      clearTimeout(timer);
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (e.metaKey && e.altKey && !e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        setZoomOpen(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "g") {
        afterG = true;
        timer = setTimeout(() => (afterG = false), 1000); // the app's prefix lasts as long
        return;
      }
      if (prefixed || document.querySelector('[role="menu"], [role="dialog"]')) return; // an open menu or popover has the keys
      const next = ZOOM_KEY[key];
      if (!next) return;
      e.preventDefault();
      onOptionsRef.current({ zoom: next });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, []);

  const props = options.properties.filter((p) => ctx.priority || p !== "priority");
  const list = options.showList;
  const zoomEntries: MenuEntry[] = ZOOMS.map((z) => ({
    id: z, label: ZOOM_LABEL[z], glyphs: z[0].toUpperCase(), checked: z === zoom, onSelect: () => onOptions({ zoom: z }),
  }));

  return (
    <div role="group" aria-label="Features timeline" className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <div ref={scroller} onScroll={onScroll} data-part="canvas" className="min-h-0 flex-1 overflow-auto overscroll-x-contain">
        <div className="group/tl relative flex min-h-full flex-col" style={{ width }}>
          {/* The canvas layers, fixed to the viewport's height as Linear's: grid or weekends, bands, the today line. */}
          <div aria-hidden className="pointer-events-none sticky top-0 h-0 shrink-0">
            <Backdrop s={s} from={from} to={to} rows={rows} height={viewHeight} todayX={todayX} />
          </div>
          <Header s={s} from={from} to={to} height={header} rows={rows} todayX={todayX} now={ctx.now} list={list} weekNumbers={options.weekNumbers} />
          <div ref={body} role={list ? "group" : undefined} aria-label={list ? "Feature list" : undefined} className="relative flex flex-1 flex-col">
            {projects.map((p) => <Row key={p.id} project={p} s={s} now={now} props={props} ctx={ctx} list={list} todayX={todayX} />)}
            {list && <div aria-hidden className="flex flex-1"><div className={`${PANEL_CELL} min-h-0`} /></div>}
          </div>
        </div>
      </div>
      {/* The header's right-edge fade, under Today and Zoom (1594 and 1651, 5 under the canvas top, 10 from its right). */}
      <div aria-hidden className="pointer-events-none absolute top-0 right-0 z-30 h-[34px] w-[161px] bg-[linear-gradient(to_left,var(--color-panel),var(--color-panel)_70%,transparent)]" />
      <div className="absolute top-[5px] right-[10px] z-40 flex items-center gap-1">
        <button type="button" aria-label="Center the timeline on today’s date" onClick={() => centre(true)} className={PILL}>Today</button>
        <Popover open={zoomOpen} onClose={() => setZoomOpen(false)}
          button={
            <button type="button" aria-label="Zoom" aria-expanded={zoomOpen} onClick={() => setZoomOpen((o) => !o)}
              className={`${PILL} gap-1.5 ${zoomOpen ? "bg-pill-on!" : ""}`}>
              {ZOOM_LABEL[zoom]}
              <svg aria-hidden width="8" height="9" viewBox="0 0 8 9" className="shrink-0"><path d="M1 3.25 4 6.25 7 3.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          }>
          <Menu label="Zoom" entries={zoomEntries} onClose={() => setZoomOpen(false)} width={175} shadow="menu"
            className="absolute top-full right-0 mt-1 border! border-line-popover!" />
        </Popover>
      </div>
    </div>
  );
}

/** Today and Zoom: 24 tall, fully rounded, `surface`, 12/500 `ink-2`, pad 0 8; hover lch(95.88). */
const PILL = "inline-flex h-6 shrink-0 items-center rounded-full border border-transparent bg-surface px-2 text-mini font-medium text-ink-2 hover:bg-pill-hover";
/** The panel's column: sticky at the left over the canvas; its right edge shows `line-frame` while a row is hovered. */
const PANEL_CELL = "sticky left-0 z-10 w-[320px] shrink-0 border-r border-transparent bg-panel group-has-[[data-part=panel-row]:hover]/tl:border-line-frame";

function Backdrop({ s, from, to, rows, height, todayX }: { s: Scale; from: string; to: string; rows: BandRow[]; height: number; todayX: number }) {
  const fine = s.zoom === "month" || s.zoom === "week";
  return (
    <div className="absolute top-0 left-0" style={{ height }}>
      {fine
        ? weekends(from, to, s).map((w) => <div key={w.x} className="absolute top-0 h-full bg-weekend" style={{ left: w.x, width: w.width }} />)
        : monthLabels(from, to, s).map((m) => <div key={m.x} data-part="grid" className="absolute top-0 h-full w-px border-r border-dashed border-line-grid" style={{ left: m.x }} />)}
      {rows.map((r) => r.items.map((b, i) => (
        <div key={`${r.kind}${b.left}`} data-part={`${r.kind}-band`}
          className={`absolute top-0 h-full border-l ${r.kind === "pi" ? `border-band-pi-edge ${i % 2 === 0 ? "bg-band-pi" : ""}` : `border-band-cycle-edge ${i % 2 === 0 ? "bg-band-cycle" : ""}`}`}
          style={{ left: b.left, width: b.width }} />
      )))}
      <div data-part="today-line" className="absolute top-0 h-full w-px" style={{ left: todayX, ...TODAY_LINE }} />
    </div>
  );
}

function Header({ s, from, to, height, rows, todayX, now, list, weekNumbers }: {
  s: Scale; from: string; to: string; height: number; rows: BandRow[]; todayX: number; now: number; list: boolean; weekNumbers: boolean;
}) {
  const days = dayLabels(from, to, s, weekNumbers);
  return (
    <div className="sticky top-0 z-20 shrink-0" style={{ height }}>
      {/* The panel covers the canvas under the header too; the labels stay on top. */}
      {list && <div aria-hidden className="sticky left-0 h-full w-[320px] bg-panel" />}
      <div aria-hidden className="text-[11px] leading-[14px] font-medium">
        {monthLabels(from, to, s).map((m) => (
          <span key={m.x}>
            <span className="absolute top-0 h-0.5 w-px bg-line-3" style={{ left: m.x }} />
            <span className="absolute top-px whitespace-nowrap text-ink-3" style={{ left: m.x + 0.5 }}>{m.label}</span>
          </span>
        ))}
        {/* The today pill covers the day labels under it. */}
        {days.filter((d) => Math.abs(d.x - todayX) >= 34).map((d) => (
          <span key={d.x}>
            <span className="absolute top-2.5 h-[3px] w-px bg-line-3" style={{ left: d.x }} />
            <span className="absolute top-[17px] w-8 text-center text-ink-4 tabular-nums" style={{ left: d.x - 16 }}>{d.label}</span>
          </span>
        ))}
        <span data-part="today-pill" className="absolute top-4 h-4 w-[46px] rounded-[8px] bg-accent text-center leading-4 text-accent-ink"
          style={{ left: todayX - 23 }}>{todayPill(now)}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.kind} role="row" aria-label={r.label} className="absolute left-0 h-4 w-full text-[11px] leading-[14px] font-medium" style={{ top: HEADER + i * BAND_ROW }}>
          {r.items.map((b) => {
            const color = b.current ? "color-mix(in srgb, var(--color-focus) 50%, transparent)" : "color-mix(in srgb, var(--color-ink-4) 50%, transparent)";
            return (
              <span key={b.left} data-current={b.current} title={b.name} className="absolute top-0 flex h-4 items-center" style={{ left: b.left, width: b.width }}>
                {/* Linear's label starts 2 before its cycle, on the panel colour; a long one truncates at the band's end. */}
                <span data-part="band-name" className="-ml-0.5 max-w-full min-w-0 truncate bg-panel pr-0.5" style={{ color }}>{b.mark}</span>
                <span aria-hidden className="h-[3px] min-w-0 flex-1" style={dots(color)} />
              </span>
            );
          })}
          {/* The row's name rides the left edge, over the bands, as Linear's team key. */}
          <span className="sticky left-0 z-10 inline-flex h-4 items-center bg-panel px-2 text-ink-3">{r.kind === "pi" ? "PIs" : r.label.replace(/ sprints$/, "")}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ project: p, s, now, props, ctx, list, todayX }: {
  project: Project; s: Scale; now: string; props: PmProperty[]; ctx: PmContext; list: boolean; todayX: number;
}) {
  const route: Route = { name: "project", key: p.key, tab: "overview" };
  const g = barGeometry(p, now, s);
  const show = (prop: PmProperty) => props.includes(prop);
  const end = g ? g.left + g.width : 0;
  const overrunLeft = g ? Math.max(g.left, end - UNDERLAP) : 0;
  return (
    <div data-project={p.id} className="relative flex shrink-0" style={{ height: ROW }}>
      {list && (
        <div className={PANEL_CELL}>
          {/* Rows: the cube (28, 13 in), the name 13/500 `ink-2` (121 wide, as Linear's), then 28 round marks 6 apart ending 18
              from the panel's edge (17 inside its 1px border). Hover: a `highlight` box 8 in, 13 short of the outer edge, 7 off the top and 5 off the bottom, radius 8. */}
          <a href={formatRoute(route)} onClick={go(route)} data-part="panel-row"
            className="group/row relative isolate flex h-full items-center pr-[17px] pl-[13px] outline-none before:absolute before:top-[7px] before:bottom-[5px] before:right-3 before:left-2 before:-z-10 before:rounded-control before:content-[''] hover:before:bg-highlight focus-visible:before:bg-highlight">
            <span data-part="cube" className="flex size-7 shrink-0 items-center justify-center rounded-control"><ProjectIcon project={p} size={16} /></span>
            {show("id") && <span className="ml-1 shrink-0 text-mini text-ink-3">{p.key}</span>}
            <span data-part="name" className="ml-1 min-w-0 truncate text-small leading-4 font-medium text-ink-2">{p.name}</span>
            <Icon name="chevronRight" size={16} className="hidden shrink-0 text-ink-2 group-hover/row:block" />
            <span data-part="marks" className="ml-auto flex shrink-0 items-center gap-1.5 pl-1.5">
              {show("health") && (
                <span data-part="health" onClick={go({ name: "project", key: p.key, tab: "activity" })} className="flex">
                  <HealthChip health={p.health} latest={p.latest_update} kind="project" now={ctx.now} iconOnly />
                </span>
              )}
              {show("status") && (
                <span data-part="status" role="img" aria-label={PROJECT_STATUS_LABEL[p.status_category]} title={p.status_name}
                  className="flex size-7 items-center justify-center rounded-full">
                  <ProjectStatusIcon category={p.status_category} progress={p.progress} />
                </span>
              )}
              {show("priority") && <span data-part="priority" className="flex size-7 items-center justify-center rounded-full"><PriorityIcon priority={p.priority} /></span>}
              {show("lead") && <span data-part="lead" className="flex size-7 items-center justify-center rounded-full"><Avatar user={p.lead} size={16} /></span>}
            </span>
          </a>
        </div>
      )}
      {g && (
        <>
          {g.overrun > 0 && todayX > end && (
            // Joined to the bar's end, radius 0 6 6 0: the pink gradient inside a 1px checker edge. It ends on the today line.
            <span data-part="overrun" aria-hidden className="absolute rounded-r-[6px]" style={{ top: BAR_TOP, height: 24, left: overrunLeft, width: todayX - overrunLeft }}>
              <span className="absolute inset-0 rounded-r-[6px] opacity-50" style={CHECKER} />
              <span className="absolute inset-px rounded-r-[5px] bg-linear-to-r from-overrun-from to-overrun-to" />
            </span>
          )}
          {/* With the project list showing, its row is the link; the bar is a mouse target only. */}
          <a href={formatRoute(route)} onClick={go(route)} data-part="bar" aria-hidden={list || undefined} tabIndex={list ? -1 : undefined}
            aria-label={list ? undefined : p.name}
            className="absolute rounded-[6px] border border-line-3 bg-surface shadow-comment outline-none hover:border-line-bar-hover hover:bg-pill-on focus-visible:border-focus"
            style={{ top: BAR_TOP, height: 24, left: g.left, width: g.width }} />
          {/* The name rides the canvas's left edge (13 past the panel) while its bar runs off it, as Linear's. Its sticky box
              is the name plus a spacer as long as the bar and overrun, so it stays pinned until the bar's end passes the
              edge and never slides under the panel. */}
          <span aria-hidden data-part="bar-name-track" className="pointer-events-none absolute flex h-4" style={{ top: BAR_TOP - NAME_ABOVE, left: g.left + 1 }}>
            <span data-part="bar-name" className="sticky shrink-0 text-small leading-4 font-medium whitespace-nowrap text-ink-2" style={{ left: list ? NAME_PIN : 13 }}>{p.name}</span>
            <span data-part="bar-name-run" className="shrink-0" style={{ width: Math.max(0, (g.overrun > 0 ? Math.max(g.width, todayX - g.left) : g.width) - 1) }} />
          </span>
        </>
      )}
    </div>
  );
}

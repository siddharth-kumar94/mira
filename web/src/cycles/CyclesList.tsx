import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { BurnUp } from "../charts/BurnUp";
import { Icon } from "../components/icons";
import { CycleStatusIcon, Legend, Ring, StatusTag } from "../components/pm";
import { Tile } from "../components/ui";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { formatRoute, type Route } from "../route";
import { appStore, uiStore, useApp } from "../store";
import { capacityFraction, cycleStatus, mergedCycleRows, percent, type CycleRow, type CycleStatus } from "./progress";

/** "Show older sprints" adds this many ended cycles to the ones showing, up to the server's limit (MAX_PAST_CYCLES). */
const OLDER_STEP = 6;
const MAX_PAST = 50;
const TAG: Record<Exclude<CycleStatus, "past">, string> = { current: "Current", upcoming: "Upcoming", planned: "Planned" };
const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
/** Points can be fractional; sums must not print float noise. */
const pts = (n: number) => +n.toFixed(2);
const railDate = (iso: string) => {
  const d = new Date(iso);
  return [d.toLocaleDateString("en-US", { month: "short" }), d.getDate()] as const;
};

/** Spec §19.3: a team's cycles in Linear's list (inventory-p4 §4.1), newest first, the current one expanded. */
export function CyclesList({ teamId }: { teamId: number }) {
  const team = useApp((s) => s.teams[teamId]);
  const notFound = useApp((s) => s.teamState[teamId]?.notFound);
  const list = useApp((s) => s.cycleLists[teamId]);
  const cycles = useApp((s) => s.cycles);
  const stats = useApp((s) => s.cycleStats);
  // The poller doesn't refresh cycle lists: load on every visit, keeping how far back the list was opened.
  useEffect(() => {
    const s = appStore.getState();
    void s.loadCycles(teamId, s.cycleLists[teamId]?.past);
    if (!s.teams[teamId] && !s.teamState[teamId]) void s.loadTeam(teamId); // the name and whether it is an ART
  }, [teamId]);
  const merge = team?.level === "art";
  const rows = useMemo(
    () => mergedCycleRows((list?.ids ?? []).flatMap((id) => (cycles[id] ? [cycles[id]] : [])), stats, merge),
    [list, cycles, stats, merge]);
  const now = Date.now();
  const all = rows.map((r) => r.cycle);
  const name = team?.name ?? "Team";
  const ui = uiStore.getState();
  const crumb = (
    <>
      <button type="button" onClick={() => ui.navigate({ name: "team", teamId, tab: "active" })} className="flex items-center gap-1.5 rounded-control hover:text-ink-1">
        <Tile id={teamId} name={name} size={16} />{name}
      </button>
      <span aria-hidden className="text-ink-4">›</span>
      <span>Sprints</span>
    </>
  );
  const body = notFound ? <Empty>Couldn't find this team.</Empty>
    : !list || (list.status !== "ready" && rows.length === 0)
      ? list?.status === "error"
        ? <Empty>
            Couldn't load sprints.{" "}
            <button type="button" onClick={() => void appStore.getState().loadCycles(teamId, list.past)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button>
          </Empty>
        : <Empty>Loading sprints…</Empty>
      : rows.length === 0 ? <Empty>This team has no sprints.</Empty>
        : <>
            {/* Linear's grid: [title] 1fr [status] [capacity] [scope] [actions] 44, 12 apart; rows are subgrids. */}
            <div className="isolate grid grid-cols-[minmax(0,1fr)_auto_auto_auto_44px] gap-x-3">
              {rows.map((r, n) => (
                <CycleListRow key={r.key} row={r} teamId={teamId} first={n === 0} status={cycleStatus(r.cycle, all, now)} now={now} />
              ))}
            </div>
            {list.hasOlder && list.past < MAX_PAST && (
              <button type="button" disabled={list.status === "loading"}
                onClick={() => void appStore.getState().loadCycles(teamId, Math.min(MAX_PAST, list.past + OLDER_STEP))}
                className="mx-auto my-3 block rounded-full border-[0.5px] border-line-menu bg-surface px-3 py-1 text-mini font-medium text-ink-2 hover:bg-hover disabled:opacity-60">
                Show older sprints
              </button>
            )}
          </>;
  return (
    <ViewFrame title={crumb}>
      {/* The header's 1px rule (lch 95.24): ViewFrame's header overlaps its body by 1px, so the rows start at y53. */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line-1">{body}</div>
    </ViewFrame>
  );
}

function CycleListRow({ row, teamId, first, status, now }: { row: CycleRow; teamId: number; first: boolean; status: CycleStatus; now: number }) {
  const { cycle, stats } = row;
  const current = status === "current";
  const route: Route = { name: "cycle", teamId, cycleId: row.ids[0] };
  const open = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let the browser open a new tab
    e.preventDefault();
    uiStore.getState().navigate(route);
  };
  const start = Date.parse(cycle.start);
  const elapsed = clamp((now - start) / (Date.parse(cycle.end) - start));
  const capacity = capacityFraction(stats.scope, cycle.capacity);
  const scope = pts(stats.scope);
  return (
    // 70 tall (the current one 288), radius 8; the hover is a ::before inset 8 either side; the 1px line runs from x+128.
    <a href={formatRoute(route)} onClick={open}
      className={`relative col-span-full grid grid-cols-subgrid items-center pl-[126px] outline-none before:absolute before:inset-y-0 before:inset-x-2 before:-z-10 before:rounded-[8px] before:content-[''] hover:before:bg-hover focus-visible:before:bg-hover after:absolute after:right-0 after:left-[128px] after:h-px after:bg-line-2 after:content-[''] ${current ? "py-px after:bottom-px" : "after:bottom-0"}`}>
      <Rail first={first} current={current} start={cycle.start} />
      <div className="flex h-[70px] min-w-0 items-center gap-4">
        <CycleStatusIcon status={status} elapsed={elapsed} />
        <span className={`truncate text-small leading-4 font-medium whitespace-nowrap ${current ? "text-ink-1" : "text-ink-2"}`}>{cycle.name}</span>
      </div>
      <div className="flex items-center">{status !== "past" && <StatusTag>{TAG[status]}</StatusTag>}</div>
      <div className="flex items-center text-small leading-4 whitespace-nowrap tabular-nums">
        {capacity !== null && cycle.capacity !== null && <>
          <span className="mr-2 inline-flex"><Ring fraction={capacity} /></span>
          <span className="font-medium text-ink-2">{percent(stats.scope, cycle.capacity)}%</span>
          <span className="ml-[5px] text-ink-3">of capacity</span>
        </>}
      </div>
      <div className="flex items-center text-small leading-4 whitespace-nowrap tabular-nums">
        <span className="mr-1 inline-flex"><Icon name="estimate" size={14} className="text-ink-3" /></span>
        <span className="font-medium text-ink-1">{scope}</span>
        <span className="ml-[5px] text-ink-3">scope</span>
      </div>
      <div aria-hidden />{/* Linear's "Open menu" column; the cycle options menu is not copied (§19.4) */}
      {current && (
        // The burn-up on the left (x381, its today line at y287, 20 before the legend), the legend on the right (cycles.png).
        <div className="col-span-full -mt-4 mb-4 flex h-[216px] items-center gap-5 pr-[60px] pl-2.5">
          <InlineBurnUp teamId={teamId} cycleId={row.ids[0]} />
          <Legend scope={scope} started={pts(stats.started)} completed={pts(stats.completed)} percent layout="rows" />
        </div>
      )}
    </a>
  );
}

/**
 * The inline chart fills the row left of the legend (958 at 1728, x381–1339 in cycles.png; inventory-p4 §4.1 says about
 * 942, the width before the first measure); 166 tall, the plot 128.
 */
const INLINE_WIDTH = 942;
function InlineBurnUp({ teamId, cycleId }: { teamId: number; cycleId: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(INLINE_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => { if (el.clientWidth > 0) setWidth(el.clientWidth); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="min-w-0 flex-1 self-start pt-[38px]">
      <BurnUp target={{ kind: "cycle", teamId, cycleId }} width={width} height={166} variant="cycle" />
    </div>
  );
}

/**
 * The left rail (x245–359): this cycle's start date (two lines, 12/450 `ink-4`) and a 9px dot on the row's bottom edge,
 * and a 1px line up to the dot above. The current cycle's line is `accent` and its dot filled; the rest are grey.
 */
function Rail({ first, current, start }: { first: boolean; current: boolean; start: string }) {
  const [month, day] = railDate(start);
  return (
    <div aria-hidden className={`pointer-events-none absolute left-0 w-[114px] ${current ? "inset-y-px" : "inset-y-0"}`}>
      <div className={`absolute left-[73.6px] w-px ${current ? "bg-accent" : "bg-line-2"}`}
        style={{ top: first ? 0 : 4.5, bottom: current ? 0 : 4.5 }} />
      <span className="absolute bottom-[-16px] left-0 w-[62.7px] pr-3 text-right text-mini leading-[15px] text-ink-4">{month}<br />{day}</span>
      <div className={`absolute left-[69.6px] size-[9px] rounded-full border ${current ? "bottom-[-5.5px] border-accent bg-accent" : "bottom-[-4.5px] border-ink-4"}`} />
    </div>
  );
}

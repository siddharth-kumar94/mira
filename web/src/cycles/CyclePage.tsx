import { useEffect, useMemo, useState } from "react";
import type { Cycle } from "../api/types";
import { BurnUp } from "../charts/BurnUp";
import { rangeLabel, shortDate } from "../components/format";
import { Icon } from "../components/icons";
import { MenuButton, type MenuEntry } from "../components/Menu";
import { CycleStatusIcon, Legend } from "../components/pm";
import { IconButton, Tile } from "../components/ui";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { appStore, uiStore, useApp } from "../store";
import type { DetailResult } from "../store/store";
import { IssueView, useViewContext } from "../views/IssueView";
import { cycleKey, inScope } from "../views/model";
import type { Scope } from "../views/types";
import { Breakdown } from "./Breakdown";
import { cycleStatus, mergedCycleRows, progressOf, type CycleRow, type CycleStatus } from "./progress";

const TAG: Record<Exclude<CycleStatus, "past">, string> = { current: "Current", upcoming: "Upcoming", planned: "Planned" };
const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
/** Points can be fractional; sums must not print float noise. */
const pts = (n: number) => +n.toFixed(2);
const elapsedOf = (c: Cycle, now: number) => clamp((now - Date.parse(c.start)) / (Date.parse(c.end) - Date.parse(c.start)));

/**
 * Spec §19.4: one cycle's issues (an ART's teams' copies included) in the issue view, grouped by status, beside
 * Linear's 428-wide panel (inventory-p4 §4.2). The poller doesn't refresh cycles: the cycle loads on every visit.
 */
export function CyclePage({ teamId, cycleId }: { teamId: number; cycleId: number }) {
  const team = useApp((s) => s.teams[teamId]);
  const cycle = useApp((s) => s.cycles[cycleId]);
  const [result, setResult] = useState<DetailResult | "loading">("loading");
  const [panelOpen, setPanelOpen] = useState(true);
  const load = () => {
    setResult("loading");
    return appStore.getState().loadCycle(teamId, cycleId);
  };
  useEffect(() => {
    let live = true;
    void load().then((r) => live && setResult(r));
    const s = appStore.getState();
    void s.loadCycles(teamId, s.cycleLists[teamId]?.past); // the switcher's list
    if (!s.teams[teamId] && !s.teamState[teamId]) void s.loadTeam(teamId); // the name and whether it is an ART
    return () => { live = false; };
  }, [teamId, cycleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = cycle ? cycleKey(cycle) : null;
  const scope = useMemo<Scope | null>(() => (key ? { kind: "cycle", teamId, cycleKey: key } : null), [teamId, key]);
  // Every "+" puts the issue in this cycle, on the cycle's own team (an ART's other teams take their copy in the composer).
  const prefill = useMemo(() => (cycle && key ? { teamId: cycle.team_id, cycle_id: cycle.id, cycleKey: key } : undefined), [cycle, key]);
  const name = team?.name ?? "Team";
  const ui = uiStore.getState();
  // Linear's crumbs are 24-tall links, pad 0 5 0 4, 3.6 either side of each "›" (cycle-controls.json).
  const crumb = (
    <span className="flex min-w-0 items-center gap-[3.6px]">
      <button type="button" onClick={() => ui.navigate({ name: "team", teamId, tab: "active" })}
        className="-ml-1 flex h-6 items-center gap-1.5 rounded-control pr-[5px] pl-1 hover:bg-hover">
        <Tile id={teamId} name={name} size={16} />{name}
      </button>
      <span aria-hidden className="text-ink-4">›</span>
      <button type="button" onClick={() => ui.navigate({ name: "team", teamId, tab: "cycles" })}
        className="flex h-6 items-center rounded-control pr-[5px] pl-1 hover:bg-hover">Sprints</button>
      {cycle && <>
        <span aria-hidden className="text-ink-4">›</span>
        <CycleSwitcher teamId={teamId} cycle={cycle} />
      </>}
    </span>
  );
  const toggle = (
    <IconButton label={panelOpen ? "Close sprint details" : "Open sprint details"} icon="panel" aria-pressed={panelOpen}
      onClick={() => setPanelOpen((o) => !o)} className={panelOpen ? "bg-pill-on! text-ink-1!" : ""} />
  );
  return (
    <ViewFrame title={crumb}>
      {result === "not-found" ? <Empty>Couldn't find this sprint.</Empty>
        : !cycle || !scope
          ? result === "error"
            ? <Empty>
                Couldn't load this sprint.{" "}
                <button type="button" onClick={() => void load().then(setResult)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button>
              </Empty>
            : <Empty>Loading sprint…</Empty>
          // Row 2 starts at y53 here, not over the header's last pixel: Linear's toolbar sits 1px lower on this page.
          : <div className="flex min-h-0 flex-1 flex-col pt-px"><IssueView scope={scope} label={cycle.name} count tools={toggle} prefill={prefill}
              empty={<Empty>{result === "loading" ? "Loading sprint…" : "No stories in this sprint."}</Empty>}
              aside={panelOpen && <CyclePanel teamId={teamId} scope={scope} cycle={cycle} art={team?.level === "art"} />} /></div>}
    </ViewFrame>
  );
}

/** The team's cycles, newest first, merged by name and dates for an ART (as the cycles list). */
function useTeamCycles(teamId: number, art: boolean) {
  const list = useApp((s) => s.cycleLists[teamId]);
  const cycles = useApp((s) => s.cycles);
  const stats = useApp((s) => s.cycleStats);
  return useMemo(() => mergedCycleRows((list?.ids ?? []).flatMap((id) => (cycles[id] ? [cycles[id]] : [])), stats, art),
    [list, cycles, stats, art]);
}

/** Linear's switcher words for a cycle's state; "completed" for an ended one is unmeasured (the sandbox has none). */
const STATE_WORD: Record<CycleStatus, string> = { current: "current", upcoming: "upcoming", planned: "planned", past: "completed" };
/** The switcher's dates, as Linear writes them there: "Nov 2 - Nov 15". */
const switcherRange = (c: Cycle) => `${shortDate(c.start)} - ${shortDate(c.end)}`;

/**
 * "[icon] PI 4 · Sprint 3 ⌄": Linear's sections, measured live (mira-p4/t9/lin-menu*.json): "Next cycle (upcoming)", then
 * "Previous cycle (current)", then "Go to current cycle" when neither is the current one. Below a divider, the team's cycles
 * (spec §19.4). Linear's ⌥K, ⌥J and G then V keycaps are left out: Mira doesn't have those shortcuts.
 */
function CycleSwitcher({ teamId, cycle }: { teamId: number; cycle: Cycle }) {
  const art = useApp((s) => s.teams[teamId]?.level === "art");
  const rows = useTeamCycles(teamId, art);
  const now = Date.now();
  const all = rows.map((r) => r.cycle);
  const statusOf = (c: Cycle) => cycleStatus(c, all.length ? all : [c], now);
  const go = (id: number) => uiStore.getState().navigate({ name: "cycle", teamId, cycleId: id });
  const item = (id: string, row: CycleRow, section?: string): MenuEntry => ({
    id, label: row.cycle.name, hint: switcherRange(row.cycle), inlineHint: true, section, onSelect: () => go(row.ids[0]),
    icon: <CycleStatusIcon status={statusOf(row.cycle)} elapsed={elapsedOf(row.cycle, now)} />,
  });
  const entries = (): MenuEntry[] => {
    const at = rows.findIndex((r) => r.ids.includes(cycle.id) || cycleKey(r.cycle) === cycleKey(cycle));
    const next = at > 0 ? rows[at - 1] : undefined; // rows are newest first
    const previous = at >= 0 ? rows[at + 1] : undefined;
    const current = rows.find((r) => statusOf(r.cycle) === "current");
    const jumps = [
      ...(next ? [item("next", next, `Next sprint (${STATE_WORD[statusOf(next.cycle)]})`)] : []),
      ...(previous ? [item("previous", previous, `Previous sprint (${STATE_WORD[statusOf(previous.cycle)]})`)] : []),
      ...(current && current !== rows[at] && current !== next && current !== previous ? [item("current", current, "Go to current sprint")] : []),
    ];
    return [...jumps, ...(jumps.length ? ["divider" as const] : []), ...rows.map((r) => item(r.key, r))];
  };
  const status = statusOf(cycle);
  // Measured on Linear's button (cycle 1): icon 16, then 8, the name 13/500 `ink-2`, then 5, the 8×9 chevron; pad 0 4.
  // The menu opens inside the crumb's h1: its rows take Linear's 13/450, not the crumb's 500.
  return (
    <span className="contents font-normal"><MenuButton label="Switch sprint" entries={entries} width={260} button={({ open, toggle }) => (
      <button type="button" aria-label="Open sprint" aria-expanded={open} onClick={toggle}
        className={`flex h-6 items-center rounded-[6px] px-1 text-mini font-medium text-ink-2 hover:bg-hover ${open ? "bg-hover" : ""}`}>
        <CycleStatusIcon status={status} elapsed={elapsedOf(cycle, now)} />
        <span className="ml-2 truncate text-small font-medium">{cycle.name}</span>
        <svg width={8} height={9} viewBox="0 0 8 9" aria-hidden className="ml-[5px] shrink-0">
          <path d="M1.05 3.05 4 5.9l2.95-2.85" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    )} /></span>
  );
}

/**
 * The side panel (inventory-p4 §4.2, cycle-points.json): one `surface` card, radius 10, 1px `line-menu`, `shadow-comment`.
 * The status tag and the dates; the icon and name (15/600); Progress (the legend, then the burn-up); the breakdowns.
 * Not copied (§19.4): favourites, the options menu, "Add document or link…" and date editing.
 */
function CyclePanel({ teamId, scope, cycle, art }: { teamId: number; scope: Scope; cycle: Cycle; art: boolean }) {
  const ctx = useViewContext(scope);
  const issues = useApp((s) => s.issues);
  const inCycle = useMemo(() => Object.values(issues).filter((i) => inScope(i, scope, ctx)), [issues, scope, ctx]);
  const [progressOpen, setProgressOpen] = useState(true);
  const now = Date.now();
  const sameTeams = Object.values(ctx.cycles).filter((c) => (ctx.scopeTeamIds ?? [ctx.teamId]).includes(c.team_id));
  const status = cycleStatus(cycle, sameTeams.length ? sameTeams : [cycle], now);
  const p = progressOf(inCycle);
  return (
    // 12 from the list, the card 428 wide, 8 from the frame (x1283 in Linear's 1728 frame).
    <aside aria-label="Sprint details" className="w-[448px] shrink-0 overflow-y-auto pr-2 pb-2 pl-3">
      <div className="rounded-[10px] border border-line-menu bg-surface px-3 pt-2.5 pb-3 shadow-comment">
        <div className="-ml-0.5 flex h-7 items-center gap-2 text-small leading-[19.5px] font-[400] text-ink-2">
          {status !== "past" && <span className="rounded-[4px] bg-fill-cycle px-1.5 py-0.5">{TAG[status]}</span>}
          {/* Read-only: Linear's start is fixed once a cycle has begun and its end is editable; Mira edits neither. */}
          <span role="group" aria-label={rangeLabel(cycle)} className="flex h-7 items-center rounded-[4px] bg-fill-cycle pr-0.5 pl-1.5">
            <span className="ml-1">{shortDate(cycle.start)}</span>
            <svg width={14} height={14} viewBox="0 0 16 16" aria-label="to" role="img" className="mr-px ml-2.5 shrink-0 text-ink-3">
              <path d="M3.25 8h9.5M9.25 4.5 12.75 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {/* Linear's end date is a 12/500 button (pad 0 8); here it is read-only text in the same type. */}
            <span className="px-2 text-mini font-medium">{shortDate(cycle.end)}</span>
          </span>
        </div>
        <div className="mt-4 flex h-7 items-center gap-2.5 pl-1">
          <CycleStatusIcon status={status} elapsed={elapsedOf(cycle, now)} track="var(--color-chart-scope)" play="text-ink-3" />
          <h2 className="truncate text-regular leading-[23px] font-semibold text-ink-2">{cycle.name}</h2>
        </div>
        <section aria-label="Progress" className="mt-[38px]">
          <button type="button" aria-label={progressOpen ? "Collapse progress section" : "Expand progress section"} aria-expanded={progressOpen}
            onClick={() => setProgressOpen((o) => !o)}
            className="-ml-2 flex h-7 w-[402px] items-center gap-1.5 rounded-[8px] px-2 text-small leading-4 text-ink-3 hover:bg-hover">
            Progress
            <Icon name="caret" size={16} className={`text-ink-3 transition-transform duration-150 ${progressOpen ? "" : "-rotate-90"}`} />
          </button>
          {progressOpen && <>
            <div className="mt-[7px] ml-[3px] w-[406px]">
              <Legend scope={pts(p.scope)} started={pts(p.started)} completed={pts(p.completed)} percent />
            </div>
            {/* The burn-up, 402 wide (cycle-page.png): the today line 114 under the Progress header, the scope line 128, the
                baseline 247; the breakdown pills 300 under it. */}
            <div className="mt-[38px] pb-1.5">
              <BurnUp target={{ kind: "cycle", teamId, cycleId: cycle.id }} width={402} height={157} variant="cycle" />
            </div>
          </>}
        </section>
        <div className="mt-5">
          <Breakdown issues={inCycle} ctx={ctx} teams={art} />
        </div>
      </div>
    </aside>
  );
}

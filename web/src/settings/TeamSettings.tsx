import { useEffect, type ReactNode } from "react";
import { STATUSES } from "../api/types";
import { Icon, type IconName } from "../components/icons";
import { Tile } from "../components/ui";
import type { LoadState } from "../store/store";
import { appStore, uiStore, useApp } from "../store";
import { cadence } from "./cadence";
import { ROW_SEPARATOR, RowText, SettingsCard, SettingsIconTile, SettingsPage } from "./SettingsShell";
import { LEVEL } from "./TeamsSettings";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * inventory-p4 §5.3: a 66-tall row. The 32 icon tile, the title over its description, then the value (12/450 `ink-3`).
 * A row that opens somewhere is a link row: hover `hover-soft` (the card's corners clip it) and a 16 "›" 12 after the
 * value. A row with nowhere to go is plain: no hover, no chevron. The link covers the row under the value, so a Retry
 * in the value slot stays its own button.
 */
function InfoRow({ tile, title, description, value, onOpen }: {
  tile: ReactNode; title: string; description?: string; value: ReactNode; onOpen?: () => void;
}) {
  return (
    <li className={`relative flex h-[66px] items-center gap-3 px-4 ${ROW_SEPARATOR} ${onOpen ? "transition-colors duration-150 first:rounded-t-[10px] last:rounded-b-[10px] hover:bg-hover-soft" : ""}`}>
      {onOpen && <button type="button" aria-label={title} onClick={onOpen} className="absolute inset-0 rounded-[inherit]" />}
      <SettingsIconTile>{tile}</SettingsIconTile>
      <RowText title={title} description={description} />
      <span data-part="value" className="pointer-events-none relative ml-auto flex shrink-0 items-center gap-2 text-mini [&_button]:pointer-events-auto leading-[normal] text-ink-3">{value}</span>
      {onOpen && <span data-part="chevron" aria-hidden className="pointer-events-none flex shrink-0 text-ink-3"><Icon name="chevronRight" size={16} /></span>}
    </li>
  );
}

const glyph = (name: IconName) => <Icon name={name} size={16} />;

/** A value that waits on a load: "Loading…" while pending, "Unavailable" and Retry when it failed. */
function Loaded({ status, retry, children }: { status: LoadState | undefined; retry(): void; children: () => ReactNode }) {
  if (status === "ready") return <>{children()}</>;
  if (status === "error") {
    return (
      <>
        Unavailable
        <button type="button" onClick={retry}
          className="-my-1 inline-flex h-6 items-center rounded-full border border-transparent px-2 text-mini font-medium text-ink-2 transition-colors duration-150 hover:bg-pill-on">
          Retry
        </button>
      </>
    );
  }
  return <span className="text-ink-4">Loading…</span>;
}

/**
 * §19.10 team settings (`/settings/teams/:id`): "‹ Teams", the name, "Team overview ›", and one card of read-only rows:
 * Members, Issue statuses, Cycles (the cadence, opening the team's Cycles) and, for an ART, Child teams followed by a
 * link row per child team.
 */
export function TeamSettings({ teamId }: { teamId: number }) {
  const team = useApp((s) => s.teams[teamId]);
  const state = useApp((s) => s.teamState[teamId]);
  const list = useApp((s) => s.cycleLists[teamId]);
  const cycles = useApp((s) => s.cycles);
  const teams = useApp((s) => s.teams);
  useEffect(() => {
    const s = appStore.getState();
    if (!s.teamState[teamId]) void s.loadTeam(teamId);
    if (!s.cycleLists[teamId]) void s.loadCycles(teamId);
  }, [teamId]);
  const ui = uiStore.getState();
  const retryTeam = () => void appStore.getState().loadTeam(teamId);
  const retryCycles = () => void appStore.getState().loadCycles(teamId);
  const children = Object.values(teams).filter((t) => t.parent_id === teamId).sort((a, b) => a.name.localeCompare(b.name));
  const notFound = state?.notFound === true;
  return (
    <>
      <button type="button" onClick={() => ui.navigate({ name: "settings", section: "teams" })}
        className="absolute left-2 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent px-2 text-small font-medium leading-[normal] text-ink-3 transition-colors duration-150 hover:bg-pill-on">
        <Icon name="chevronLeft" size={14} />Teams
      </button>
      <SettingsPage title={team?.name ?? "Team"}>
        <div className="mt-[5px] flex h-[22px] items-center px-4">
          <span className="truncate text-small font-[450] leading-[22px] text-ink-3">
            {notFound ? "Couldn't find this team." : "Settings come from Rally and are read-only here"}
          </span>
          {!notFound && (
            <button type="button" onClick={() => ui.navigate({ name: "team", teamId, tab: "active" })}
              className="-mr-1.5 ml-auto inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-transparent pl-2 pr-1.5 text-mini font-medium leading-[normal] text-ink-2 transition-colors duration-150 hover:bg-pill-on">
              Team overview<Icon name="chevronRight" size={14} />
            </button>
          )}
        </div>
        {!notFound && (
          <SettingsCard className="mt-[33px]">
            <InfoRow tile={glyph("person")} title="Members" description="People on this team in Rally"
              value={<Loaded status={state?.status} retry={retryTeam}>{() => count(state!.memberIds.length, "member")}</Loaded>} />
            <InfoRow tile={glyph("status")} title="Story statuses" description="The statuses stories go through" value={count(STATUSES.length, "status", "statuses")} />
            <InfoRow tile={glyph("cycles")} title="Sprints" description="How long each sprint runs"
              value={<Loaded status={list?.status} retry={retryCycles}>{() => cadence(list!.ids.map((id) => cycles[id]).filter((c) => c !== undefined)) ?? "None"}</Loaded>}
              onOpen={() => ui.navigate({ name: "team", teamId, tab: "cycles" })} />
            {team?.level === "art" && (
              <InfoRow tile={glyph("team")} title="Child teams" description="The teams in this ART"
                value={<Loaded status={state?.status} retry={retryTeam}>{() => count(children.length, "team")}</Loaded>} />
            )}
            {team?.level === "art" && state?.status === "ready" && children.map((c) => (
              <InfoRow key={c.id} tile={<Tile id={c.id} name={c.name} size={16} />} title={c.name} value={LEVEL[c.level]}
                onOpen={() => ui.navigate({ name: "team-settings", teamId: c.id })} />
            ))}
          </SettingsCard>
        )}
      </SettingsPage>
    </>
  );
}

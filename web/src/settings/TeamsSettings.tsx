import { useEffect, useMemo, useRef, useState } from "react";
import type { Team } from "../api/types";
import { Icon } from "../components/icons";
import { Switch, Tile } from "../components/ui";
import { appStore, uiStore, useApp, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";
import { SettingsButton, SettingsCard, SettingsGroup, SettingsIconTile, SettingsPage, SettingsRow } from "./SettingsShell";

/** A team's kind, as the Teams list and child-team rows show it. */
export const LEVEL: Record<Team["level"], string> = { art: "ART", team: "Team" };

/**
 * One team: its tile, its name (opening its settings) over "ART" or "Team", then Join or Leave and "Show in sidebar".
 * You're in a team you joined, or one of Rally's own teams you haven't hidden (leaving one of those hides it, D6).
 * Only your own and joined teams can be in the sidebar, so a team you left here has its switch off and disabled.
 */
function TeamRow({ team }: { team: Team }) {
  const yours = useApp((s) => s.yourTeamIds);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const id = team.id;
  const member = joined.includes(id) || (yours.includes(id) && !hidden.includes(id));
  const shown = sidebarTeamIds(yours, joined, hidden).includes(id);
  const listable = yours.includes(id) || joined.includes(id);
  const ui = uiStore.getState();
  const name = (
    <button type="button" onClick={() => ui.navigate({ name: "team-settings", teamId: id })} className="max-w-full truncate text-left">
      {team.name}
    </button>
  );
  return (
    <SettingsRow title={name} description={LEVEL[team.level]} icon={<SettingsIconTile><Tile id={id} name={team.name} size={16} /></SettingsIconTile>}>
      <SettingsButton onClick={() => (member ? ui.leaveTeam(id) : ui.joinTeam(id))}>{member ? "Leave" : "Join"}</SettingsButton>
      <span className="flex items-center" title="Show in sidebar">
        <Switch size="settings" label="Show in sidebar" checked={shown} disabled={!listable}
          onChange={(on) => (on ? ui.showTeam(id) : ui.hideTeam(id))} />
      </span>
    </SettingsRow>
  );
}

/** Rally's teams matching the query (ruling 11: `GET /api/search`; there is no all-teams list). 2+ characters, 300ms after typing stops. */
function FindTeam() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Team[] | null>(null);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setFound(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => void appStore.getState().searchRemote(text).then((r) => { if (live) setFound(r.teams); }), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  return (
    <section aria-label="Find a team" className="mt-12">
      <h2 className="px-4 text-regular font-medium leading-[23px] text-ink-1">Find a team</h2>
      <div className="relative mt-4">
        <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1.5 text-ink-3" />
        <input type="search" aria-label="Find a team" placeholder="Search Rally's teams…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="h-7 w-full rounded-control border border-line-frame bg-surface pl-8 pr-[25px] text-small font-medium text-ink-1 shadow-comment placeholder:text-ink-nav" />
      </div>
      {found !== null && (
        <SettingsCard className="mt-4">
          {found.length === 0
            ? <li className="flex h-[66px] items-center px-4 text-small text-ink-3">No teams match</li>
            : found.map((t) => <TeamRow key={t.id} team={t} />)}
        </SettingsCard>
      )}
    </section>
  );
}

/**
 * §19.10 Teams (ruling 11): your sidebar and joined teams in one card, then "Find a team". A team you leave here keeps
 * its row until you go elsewhere, so it can be joined again.
 */
export function TeamsSettings() {
  const yours = useApp((s) => s.yourTeamIds);
  const teams = useApp((s) => s.teams);
  const joined = useUi((u) => u.joinedTeamIds);
  const listed = useRef(new Set<number>());
  const ids = useMemo(() => {
    for (const id of [...yours, ...joined]) listed.current.add(id);
    return [...listed.current];
  }, [yours, joined]);
  return (
    <SettingsPage title="Teams">
      <SettingsGroup title="Your teams">
        {ids.map((id) => <TeamRow key={id} team={teams[id] ?? { id, name: `Team ${id}`, level: "team", parent_id: null }} />)}
      </SettingsGroup>
      <FindTeam />
    </SettingsPage>
  );
}

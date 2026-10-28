import { useEffect, useMemo } from "react";
import { Tabs } from "../components/Tabs";
import { Tile } from "../components/ui";
import { Empty, TabsRow, ViewFrame } from "../components/ViewFrame";
import type { IssueTab } from "../route";
import { appStore, uiStore, useApp, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";
import { IssueView } from "../views/IssueView";
import type { Scope } from "../views/types";

const EMPTY: Record<IssueTab, string> = {
  active: "No active stories: nothing in Todo, In Progress or In Review.", backlog: "The backlog is empty.", all: "This team has no stories.",
};

/** Spec §4: a team's Active, Backlog and All issues. Loads the team on first open (spec D10). */
export function TeamIssues({ teamId, tab }: { teamId: number; tab: IssueTab }) {
  const team = useApp((s) => s.teams[teamId]);
  const state = useApp((s) => s.teamState[teamId]);
  const yours = useApp((s) => s.yourTeamIds);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const inSidebar = useMemo(() => sidebarTeamIds(yours, joined, hidden).includes(teamId), [yours, joined, hidden, teamId]);
  useEffect(() => {
    if (!appStore.getState().teamState[teamId]) void appStore.getState().loadTeam(teamId);
  }, [teamId]);
  useEffect(() => {
    if (tab === "all" && appStore.getState().teamState[teamId]?.nextCursor === undefined) void appStore.getState().loadTeamPage(teamId);
  }, [tab, teamId]);
  const scope = useMemo<Scope>(() => ({ kind: "team", teamId, tab }), [teamId, tab]);
  const name = team?.name ?? "Team";
  const ui = uiStore.getState();
  const tabs = <Tabs label="Stories" tabs={[["active", "Active"], ["backlog", "Backlog"], ["all", "All stories"]]} value={tab}
    onChange={(t) => ui.navigate({ name: "team", teamId, tab: t })} />;
  const crumb = (
    <>
      <button type="button" onClick={() => ui.navigate({ name: "team", teamId, tab: "active" })} className="flex items-center gap-1.5 rounded-control hover:text-ink-1">
        <Tile id={teamId} name={name} size={16} />{name}
      </button>
      <span aria-hidden className="text-ink-4">›</span>
      <span>Stories</span>
    </>
  );
  const more = tab === "all" && typeof state?.nextCursor === "number" && (
    <button type="button" onClick={() => void appStore.getState().loadTeamPage(teamId)}
      className="mx-auto my-3 block rounded-full border-[0.5px] border-line-menu bg-surface px-3 py-1 text-mini font-medium text-ink-2 hover:bg-hover">Load more</button>
  );
  return (
    <ViewFrame title={crumb}
      actions={!inSidebar && <button type="button" onClick={() => ui.joinTeam(teamId)}
        className="h-7 rounded-full border-[0.5px] border-line-menu bg-surface px-2.5 text-mini font-medium text-ink-2 hover:bg-hover">Join team</button>}>
      {state?.notFound ? <Empty>Couldn't find this team.</Empty>
      : state?.status === "error" ? (
        <><TabsRow>{tabs}</TabsRow><Empty>
          Couldn't load this team.{" "}
          <button type="button" onClick={() => void appStore.getState().loadTeam(teamId)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button>
        </Empty></>
      ) : state?.status !== "ready" ? <><TabsRow>{tabs}</TabsRow><Empty>Loading {name}…</Empty></>
        : <IssueView scope={scope} label={`${name} ${tab}`} tabs={tabs} footer={more} empty={<Empty>{EMPTY[tab]}</Empty>} />}
    </ViewFrame>
  );
}

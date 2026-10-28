import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Project } from "../api/types";
import { Popover } from "../components/Popover";
import { Tabs } from "../components/Tabs";
import { IconButton, Tile } from "../components/ui";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { appStore, uiStore, useApp, useUi } from "../store";
import { listKey } from "../store/store";
import { sidebarTeamIds } from "../store/ui";
import {
  groupProjects, inClosedWindow, isDefaultPm, loadPmOptions, matchesProject, normalizePmOptions, savePmOptions, type PmContext,
  type PmFilters, type PmOptions, type PmScope,
} from "./model";
import { ProjectBoard } from "./ProjectBoard";
import { ProjectList } from "./ProjectList";
import { ProjectsDisplay } from "./ProjectsDisplay";
import { PmFilterChips, ProjectsFilter } from "./ProjectsFilter";
import { Timeline } from "./ProjectTimeline";

export type ProjectsScope = { kind: "workspace" } | { kind: "team"; teamId: number } | { kind: "initiative"; initiativeId: number };
const NO_FILTERS: PmFilters = {};

/** Display options per view, saved under "mira-pm:v1:<view>"; Priority falls away without the field (D38). */
function usePmOptions(view: string, scope: PmScope, priority: boolean): [PmOptions, (next: Partial<PmOptions>) => void] {
  const [options, setOptions] = useState(() => loadPmOptions(view, scope, priority));
  useEffect(() => setOptions(loadPmOptions(view, scope, priority)), [view, priority]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback((next: Partial<PmOptions>) => setOptions((current) => {
    const merged = normalizePmOptions({ ...current, ...next }, { priority });
    savePmOptions(view, merged);
    return merged;
  }), [view, priority]);
  return [options, update];
}

/**
 * Spec §19.5: the workspace's projects (`/projects`, the sidebar teams, assumption 12), a team's (its Projects tab) or an
 * initiative's (its Projects tab, §19.7). The header has no "New project" (D23); the tab row is "All projects", then Filter
 * and Display. An initiative's view sits under the initiative page's header: it takes that page's `tabs` in place of
 * "All projects" and draws no header of its own. This shell picks the layout (ledger R3): the list, the board or the timeline.
 */
export function ProjectsView({ scope, tabs }: { scope: ProjectsScope; tabs?: ReactNode }) {
  const yours = useApp((s) => s.yourTeamIds);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const teamId = scope.kind === "team" ? scope.teamId : null;
  const initiativeId = scope.kind === "initiative" ? scope.initiativeId : null;
  const teamIds = useMemo(
    () => (teamId !== null ? [teamId] : sidebarTeamIds(yours, joined, hidden).sort((a, b) => a - b)), [teamId, yours, joined, hidden]);
  const key = initiativeId !== null ? `project-initiative:${initiativeId}` : listKey("projects", teamIds);
  const list = useApp((s) => s.lists[key]);
  const projects = useApp((s) => s.projects);
  const users = useApp((s) => s.users);
  const teams = useApp((s) => s.teams);
  const initiatives = useApp((s) => s.initiatives);
  const releases = useApp((s) => s.releases);
  const issues = useApp((s) => s.issues);
  const priority = useApp((s) => s.meta?.projectPriority ?? false);
  const notFound = useApp((s) => (teamId !== null ? s.teamState[teamId]?.notFound : false));
  const menu = useUi((u) => u.menu);

  // The poller doesn't refresh projects: load on every visit and whenever the team set changes. PI names come with releases
  // (an initiative's projects read carries its own).
  useEffect(() => {
    const s = appStore.getState();
    if (initiativeId !== null) {
      void s.loadInitiativeProjects(initiativeId);
      return;
    }
    if (!teamIds.length) return;
    void s.loadProjects(teamIds);
    void s.loadReleases(teamIds);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = appStore.getState();
    if (teamId !== null && !s.teams[teamId] && !s.teamState[teamId]) void s.loadTeam(teamId); // the name, for the breadcrumb
  }, [teamId]);
  useEffect(() => uiStore.getState().setVisible([]), []); // J/K have no issues to walk here

  const kind: PmScope = scope.kind;
  const view = initiativeId !== null ? `initiative:${initiativeId}:projects` : teamId !== null ? `team:${teamId}:projects` : "projects";
  const [options, setOptions] = usePmOptions(view, kind, priority);
  const [filterSets, setFilterSets] = useState<Record<string, PmFilters>>({});
  const filters = filterSets[view] ?? NO_FILTERS;
  const setFilters = (f: PmFilters) => setFilterSets((all) => ({ ...all, [view]: f }));

  const ctx = useMemo<PmContext>(() => ({ now: Date.now(), users, teams, initiatives, releases, priority, issues }),
    [users, teams, initiatives, releases, priority, issues]);
  const loaded = useMemo(() => (list?.ids ?? []).flatMap((id): Project[] => (projects[id] ? [projects[id]] : [])), [list, projects]);
  const inView = useMemo(() => loaded.filter((p) => inClosedWindow(p, options.closed, ctx.now)), [loaded, options.closed, ctx.now]);
  const shown = useMemo(() => inView.filter((p) => matchesProject(p, filters, ctx)), [inView, filters, ctx]);
  const groups = useMemo(() => groupProjects(shown, options, ctx), [shown, options, ctx]);
  const timelineProjects = useMemo(() => groups.flatMap((g) => g.projects), [groups]);

  const closeMenu = useCallback(() => uiStore.getState().setMenu(null), []);
  const toggle = (m: "filter" | "display") => () => uiStore.getState().setMenu(menu === m ? null : m);
  const toggleGroup = (k: string) => setOptions({ collapsed: options.collapsed.includes(k) ? options.collapsed.filter((x) => x !== k) : [...options.collapsed, k] });
  const sidebarTeams = useMemo(() => sidebarTeamIds(yours, joined, hidden).map((id) => ({ id, name: teams[id]?.name ?? `Team ${id}` })),
    [yours, joined, hidden, teams]);
  const open = (m: "filter" | "display") => (menu === m ? "bg-pill-on! text-ink-1!" : ""); // fill-open while the popover is up

  const name = teamId !== null ? teams[teamId]?.name ?? "Team" : "";
  const title = teamId !== null
    ? <>
        <button type="button" onClick={() => uiStore.getState().navigate({ name: "team", teamId, tab: "active" })}
          className="flex items-center gap-1.5 rounded-control hover:text-ink-1">
          <Tile id={teamId} name={name} size={16} />{name}
        </button>
        <span aria-hidden className="text-ink-4">›</span>
        <span className="text-ink-2">Features</span>
      </>
    : <span className="text-ink-2">Features</span>;

  const retry = () => void (initiativeId !== null
    ? appStore.getState().loadInitiativeProjects(initiativeId) : appStore.getState().loadProjects(teamIds));
  const body = notFound ? <Empty>Couldn't find this team.</Empty>
    : initiativeId === null && !teamIds.length ? <Empty>Join a team to see its features.</Empty>
    : !list || (list.status !== "ready" && loaded.length === 0)
      ? list?.status === "error"
        ? <Empty>Couldn't load features.{" "}
            <button type="button" onClick={retry} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button></Empty>
        : <Empty>Loading features…</Empty>
      : shown.length === 0
        ? <Empty>{loaded.length === 0 ? "No features." : "No features match this view."}</Empty>
        : options.layout === "board" ? <ProjectBoard projects={shown} options={options} ctx={ctx} />
        // The timeline keeps the ordering; its rows are one list (Linear's timeline groups aren't copied).
        : options.layout === "timeline" ? <Timeline projects={timelineProjects} options={options} ctx={ctx} onOptions={setOptions} />
        : <ProjectList label={teamId !== null ? `${name} features` : "Features"} groups={groups} options={options} ctx={ctx} onToggleGroup={toggleGroup} />;

  const content = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Linear's tab row sits at y61, a pixel under the issue views' (team-projects-controls.json). */}
      <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2 pt-[2px]">
        {tabs ?? <Tabs label="Features" tabs={[["all", "All features"]]} value="all" onChange={() => {}} />}
        <PmFilterChips filters={filters} ctx={ctx} onChange={setFilters} />
        <div className="ml-auto flex items-center gap-1.5">
          <Popover open={menu === "filter"} onClose={closeMenu}
            button={<IconButton label="Add filter" icon="filter" aria-expanded={menu === "filter"} onClick={toggle("filter")} className={open("filter")} />}>
            <ProjectsFilter projects={inView} filters={filters} ctx={ctx} onChange={setFilters} onClose={closeMenu} />
          </Popover>
          <Popover open={menu === "display"} onClose={closeMenu}
            button={<IconButton label="Display options" icon="display" dot={!isDefaultPm(options, kind, priority)} aria-expanded={menu === "display"}
              onClick={toggle("display")} className={open("display")} />}>
            <ProjectsDisplay options={options} onChange={setOptions} scope={kind} priority={priority} teams={sidebarTeams} />
          </Popover>
        </div>
      </div>
      {/* The board scrolls sideways and its columns on their own, the timeline its canvas; the list scrolls as one. */}
      <div className={`min-h-0 flex-1 ${options.layout === "list" ? "overflow-y-auto" : "flex flex-col"}`}>{body}</div>
    </div>
  );
  return initiativeId !== null ? content : <ViewFrame title={title}>{content}</ViewFrame>;
}

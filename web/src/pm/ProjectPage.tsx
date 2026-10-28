import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Issue, Project, Update } from "../api/types";
import { Avatar } from "../components/Avatar";
import { dayOf, ordinal } from "../components/format";
import { Icon, ProjectIcon, ProjectTile } from "../components/icons";
import { InitiativeIcon, ProjectStatusIcon } from "../components/pm";
import { Tabs } from "../components/Tabs";
import { IconButton, Tile } from "../components/ui";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { sanitize } from "../editor/sanitize";
import { copyPageUrl } from "../palette/copy";
import { formatRoute, type ProjectTab, type Route } from "../route";
import { appStore, uiStore, useApp } from "../store";
import type { DetailResult } from "../store/store";
import { IssueView } from "../views/IssueView";
import type { Scope } from "../views/types";
import { projectTeamIds } from "./model";
import { go } from "./ProjectList";
import { Line, PILL, PriorityPicker, teamsLabel, ToArrow } from "./pmControls";
import { ProjectSidebar } from "./ProjectSidebar";
import { previousOf } from "./diff";
import { PmActivity } from "./PmActivity";
import { UpdateCard } from "./UpdateCard";

const TABS: [ProjectTab, string][] = [["overview", "Overview"], ["activity", "Activity"], ["issues", "Stories"]];

/** The Properties row's dates always carry the short year: "Sep 10th, '26" (project-overview-controls.json). */
const rowDate = (iso: string) => {
  const d = dayOf(iso);
  return `${d.toLocaleDateString("en-US", { month: "short" })} ${ordinal(d.getDate())}, '${String(d.getFullYear()).slice(2)}`;
};

/**
 * /project/:key (spec §19.6, inventory-p4 §2.1–2.3). The header (44): the cube and name, "Copy page URL" on the right;
 * the tabs Overview, Activity and Issues with the side-panel toggle; then the overview's 805 column centred left of the
 * 388 sidebar. Projects aren't refreshed by the poller: the project loads on every visit. Activity is `PmActivity`; Issues
 * is the issue view scoped to the project (§19.6).
 */
export function ProjectPage({ projectKey, tab }: { projectKey: string; tab: ProjectTab }) {
  const id = useApp((s) => Object.values(s.projects).find((p) => p.key === projectKey)?.id ?? null);
  const project = useApp((s) => (id === null ? undefined : s.projects[id]));
  const [result, setResult] = useState<DetailResult | "loading">("loading");
  const [panelOpen, setPanelOpen] = useState(true);
  const load = () => {
    setResult("loading");
    return appStore.getState().loadProject(projectKey);
  };
  useEffect(() => {
    let live = true;
    void load().then((r) => live && setResult(r));
    return () => { live = false; };
  }, [projectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = (t: ProjectTab): Route => ({ name: "project", key: projectKey, tab: t });
  const title = project && (
    // Linear's header link: pad 2 4, radius 6, the 16 cube 6 before the name (13/500 `ink-2`).
    <a href={formatRoute(route("overview"))} onClick={go(route("overview"))}
      className="-ml-1 flex h-7 min-w-0 items-center gap-1.5 rounded-[6px] px-1 text-ink-2 hover:bg-hover">
      <ProjectIcon project={project} size={16} /><span className="truncate">{project.name}</span>
    </a>
  );
  const actions = project && <IconButton label="Copy page URL" icon="link" bordered={false} onClick={() => void copyPageUrl()} className="-mr-2.5" />;

  if (!project || result === "not-found") {
    const back = { name: "projects" } as const;
    return (
      <ViewFrame title={<span className="text-ink-2">Feature</span>}>
        {result === "not-found"
          ? <Empty>
              Couldn't find this feature.{" "}
              <a href={formatRoute(back)} onClick={go(back)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Back to Features</a>
            </Empty>
          : result === "error"
            ? <Empty>
                Couldn't load this feature.{" "}
                <button type="button" onClick={() => void load().then(setResult)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button>
              </Empty>
            : <Empty>Loading feature…</Empty>}
      </ViewFrame>
    );
  }
  const tabs = <Tabs label="Feature" tabs={TABS} value={tab} tight onChange={(t) => uiStore.getState().navigate(route(t))} />;
  const toggle = (
    <IconButton label={panelOpen ? "Close feature details" : "Open feature details"} icon="panel" bordered={false} aria-pressed={panelOpen}
      onClick={() => setPanelOpen((o) => !o)} className={`ml-auto ${panelOpen ? "bg-pill-on! text-ink-1!" : ""}`} />
  );
  return (
    <ViewFrame title={title} actions={actions}>
      <ProjectBody project={project} tab={tab} tabs={tabs} toggle={toggle} panelOpen={panelOpen} loading={result === "loading"} failed={result === "error"}
        onUpdate={() => uiStore.getState().navigate(route("activity"))} />
    </ViewFrame>
  );
}

/**
 * Below the header: the tab row (Linear's at y61, 4 apart) with the side-panel toggle on the right (pill-on while open),
 * then the tab's body beside the sidebar. On Issues the issue view owns the row, adding Filter and Display before the
 * toggle (inventory-p4 §2.5), and the sidebar stays beside the list.
 */
function ProjectBody({ project: p, tab, tabs, toggle, panelOpen, loading, failed, onUpdate }: {
  project: Project; tab: ProjectTab; tabs: ReactNode; toggle: ReactNode; panelOpen: boolean; loading: boolean; failed: boolean; onUpdate(): void;
}) {
  const details = useApp((s) => s.pmDetails[`project:${p.id}`]);
  const all = useApp((s) => s.issues);
  const teams = useApp((s) => s.teams);
  const initiative = useApp((s) => (p.initiative_id === null ? undefined : s.initiatives[p.initiative_id]));
  const release = useApp((s) => (p.pi_id === null ? undefined : s.releases[p.pi_id]));
  const priority = useApp((s) => s.meta?.projectPriority ?? false);
  const issues = useMemo(() => Object.values(all).filter((i: Issue) => i.project_id === p.id), [all, p.id]);
  const teamIds = projectTeamIds(p, all);
  // The project read doesn't carry its initiative; one opened from a link loads it (ruling R1: the proxy takes ObjectIDs).
  useEffect(() => {
    if (p.initiative_id !== null && !appStore.getState().initiatives[p.initiative_id]) void appStore.getState().loadInitiative(String(p.initiative_id));
  }, [p.initiative_id]);
  const latest = details?.updates[0] ?? null;
  const scope = useMemo<Scope>(() => ({ kind: "project", projectId: p.id }), [p.id]);
  const sidebar = panelOpen && (
    <ProjectSidebar project={p} issues={issues} teamIds={teamIds} initiative={initiative} release={release}
      latest={latest ?? p.latest_update} priority={priority} />
  );
  if (tab === "issues") {
    // 1 lower than the issue view's own row, as the other tabs: Linear's buttons at y61, the sidebar and first group at y97.
    return (
      <div className="flex min-h-0 flex-1 flex-col pt-px">
        {/* Linear's rows end 4 short of the sidebar (x1319, the sidebar at 1323: project-issues-controls.json). */}
        <IssueView scope={scope} label={p.name} tabs={tabs} tools={toggle} aside={sidebar && <div className="flex pl-1">{sidebar}</div>}
          empty={<Empty>{loading ? "Loading stories…" : failed ? "Couldn't load this feature's stories." : "No stories in this feature."}</Empty>} />
      </div>
    );
  }
  return <>
    <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2 pt-[2px]">{tabs}{toggle}</div>
    {/* 1 under the tab row (Linear's sidebar at y97); the column centres 3 left of the space beside the sidebar (x380). */}
    <div className="flex min-h-0 flex-1 pt-px">
      <div className="min-w-0 flex-1 overflow-y-auto pr-[3px]">
        {tab === "overview" && (
          <Overview project={p} teamIds={teamIds} teamsText={teamsLabel(teamIds, teams)} initiative={initiative?.name}
            latest={latest} previous={details ? previousOf(details.updates, 0) : null} description={details?.description} failed={failed} priority={priority} onUpdate={onUpdate} />
        )}
        {tab === "activity" && <PmActivity kind="project" id={p.id} createdAt={p.created_at} owner={p.lead} />}
      </div>
      {sidebar}
    </div>
  </>;
}

/**
 * The overview's main column (inventory-p4 §2.2), in Linear's order: the tile, the name (24/600), the Properties row,
 * Initiatives, the latest update and Description. No summary (Rally has none), Resources or Milestones (§19.1, §19.12).
 */
function Overview({ project: p, teamIds, teamsText, initiative, latest, previous, description, failed, priority, onUpdate }: {
  project: Project; teamIds: number[]; teamsText: string; initiative: string | undefined; latest: Update | null;
  previous: Update | null; description: string | undefined; failed: boolean; priority: boolean; onUpdate(): void;
}) {
  const body = useMemo(() => (description ? sanitize(description) : ""), [description]);
  return (
    <section aria-label="Overview" className="mx-auto w-(--size-content) pt-16 pb-16">
      <div data-section="icon-tile"><ProjectTile project={p} /></div>
      <h2 data-section="name" className="mt-3 text-title leading-8 font-semibold text-ink-1">{p.name}</h2>
      <div className="mt-5">
        <Line part="properties" label="Properties">
          <span data-prop="status" className={PILL}><ProjectStatusIcon category={p.status_category} progress={p.progress} />{p.status_name}</span>
          {priority && <span data-prop="priority" className="flex"><PriorityPicker kind="project" id={p.id} priority={p.priority} pill={PILL} /></span>}
          <span data-prop="lead" className={PILL}><Avatar user={p.lead} size={18} />{p.lead?.name ?? "No lead"}</span>
          {(p.start || p.target) && (
            <span data-prop="dates" className="flex items-center">
              {p.start && <span className={PILL}><Icon name="calendarStart" size={16} className="text-ink-3" />{rowDate(p.start)}</span>}
              {p.start && p.target && <ToArrow />}
              {p.target && <span className={PILL}>{!p.start && <Icon name="calendar" size={16} className="text-ink-3" />}{rowDate(p.target)}</span>}
            </span>
          )}
          <span data-prop="teams" className={`${PILL} pr-2.5`}>
            <span className="flex w-4 justify-center"><Tile id={teamIds[0]} name={teamsText} size={14} /></span>{teamsText}
          </span>
        </Line>
      </div>
      {initiative !== undefined && (
        <div className="mt-3">
          <Line part="initiatives" label="Capabilities">
            <span className={PILL}><InitiativeIcon size={16} />{initiative}</span>
          </Line>
        </div>
      )}
      {latest && (
        <div data-section="latest-update" className="mt-4">
          <UpdateCard update={latest} previous={previous} kind="project" collapsible onUpdate={onUpdate} />
        </div>
      )}
      <div data-section="description" className="mt-[22px]">
        <h3 className="flex h-7 items-center text-small leading-4 font-medium text-ink-3">Description</h3>
        {body
          ? <div className="prose-rally py-1 text-regular text-ink-2" dangerouslySetInnerHTML={{ __html: body }} />
          : <p className="py-1 text-regular text-ink-4">{description !== undefined ? "No description" : failed ? "Couldn't load the description." : "Loading…"}</p>}
      </div>
    </section>
  );
}

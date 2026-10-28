import { useEffect, useMemo, useState, type ReactNode } from "react";
import { INITIATIVE_STATUS_LABEL, type Initiative, type Project, type Update } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ordinalDate } from "../components/format";
import { Icon } from "../components/icons";
import { HealthChip, InitiativeIcon } from "../components/pm";
import { Tabs } from "../components/Tabs";
import { IconButton } from "../components/ui";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { sanitize } from "../editor/sanitize";
import { copyPageUrl } from "../palette/copy";
import { formatRoute, type InitiativeTab, type Route } from "../route";
import { appStore, uiStore, useApp } from "../store";
import type { DetailResult } from "../store/store";
import { initiativeRiskRows, previousOf } from "./diff";
import { defaultPmOptions, groupProjects, normalizePmOptions, type PmContext, type PmOptions } from "./model";
import { PmActivity } from "./PmActivity";
import { go, ProjectList } from "./ProjectList";
import { ProjectsView } from "./ProjectsView";
import { Line, PILL, PriorityPicker } from "./pmControls";
import { UpdateCard } from "./UpdateCard";

const TABS: [InitiativeTab, string][] = [["overview", "Overview"], ["activity", "Activity"], ["projects", "Features"]];
/** The embedded list (inventory-p4 §3.2): grouped by project status, sorted by priority (manual without the field, D38). */
const EMBEDDED: PmOptions = {
  ...defaultPmOptions("initiative"), layout: "list", groupBy: "status", orderBy: "priority",
  properties: ["priority", "health", "lead", "target", "status"],
};

/**
 * /initiative/:key (spec §19.7, inventory-p4 §3.2). The header (44): the glyph and name, "Copy page URL" on the right; the
 * tabs Overview, Activity and Projects. Linear's details panel is closed by default, so the 805 column is centred; Mira has
 * no panel to open (§19.7 defines none), so there is no toggle. Activity is `PmActivity`; Projects is §19.5's view scoped
 * to the initiative, under these tabs. Initiatives aren't refreshed by the poller: the initiative loads on every visit.
 */
export function InitiativePage({ initiativeKey, tab }: { initiativeKey: string; tab: InitiativeTab }) {
  const id = useApp((s) => Object.values(s.initiatives).find((i) => i.key === initiativeKey)?.id ?? null);
  const initiative = useApp((s) => (id === null ? undefined : s.initiatives[id]));
  const [result, setResult] = useState<DetailResult | "loading">("loading");
  const load = () => {
    setResult("loading");
    return appStore.getState().loadInitiative(initiativeKey);
  };
  useEffect(() => {
    let live = true;
    void load().then((r) => live && setResult(r));
    return () => { live = false; };
  }, [initiativeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = (t: InitiativeTab): Route => ({ name: "initiative", key: initiativeKey, tab: t });
  if (!initiative || result === "not-found") {
    const back = { name: "initiatives" } as const;
    return (
      <ViewFrame title={<span className="text-ink-2">Capability</span>}>
        {result === "not-found"
          ? <Empty>
              Couldn't find this capability.{" "}
              <a href={formatRoute(back)} onClick={go(back)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Back to Capabilities</a>
            </Empty>
          : result === "error"
            ? <Empty>
                Couldn't load this capability.{" "}
                <button type="button" onClick={() => void load().then(setResult)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button>
              </Empty>
            : <Empty>Loading capability…</Empty>}
      </ViewFrame>
    );
  }
  // Linear's header link: pad 2 4, radius 6, the 16 glyph 6 before the name (13/500 `ink-2`), as the project page's.
  const title = (
    <a href={formatRoute(route("overview"))} onClick={go(route("overview"))}
      className="-ml-1 flex h-7 min-w-0 items-center gap-1.5 rounded-[6px] px-1 text-ink-2 hover:bg-hover">
      <InitiativeIcon size={16} /><span className="truncate">{initiative.name}</span>
    </a>
  );
  const actions = <IconButton label="Copy page URL" icon="link" bordered={false} onClick={() => void copyPageUrl()} className="-mr-2.5" />;
  const tabs = <Tabs label="Capability" tabs={TABS} value={tab} tight onChange={(t) => uiStore.getState().navigate(route(t))} />;
  return (
    <ViewFrame title={title} actions={actions}>
      {tab === "projects"
        ? <ProjectsView scope={{ kind: "initiative", initiativeId: initiative.id }} tabs={tabs} />
        : <>
            <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2 pt-[2px]">{tabs}</div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-px">
              {tab === "overview"
                ? <Overview initiative={initiative} failed={result === "error"} onUpdate={() => uiStore.getState().navigate(route("activity"))} />
                : <PmActivity kind="initiative" id={initiative.id} createdAt={initiative.created_at} owner={initiative.owner} />}
            </div>
          </>}
    </ViewFrame>
  );
}

/** The 36 tile (radius 6) in the accent at 12.5%, the 24 glyph centred (initiative-controls.json "Choose icon"). */
function InitiativeTile() {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[6px]"
      style={{ background: "color-mix(in lch, var(--color-chart-done) 12.5%, transparent)" }}>
      <InitiativeIcon size={24} />
    </span>
  );
}

/**
 * The overview (inventory-p4 §3.2), in Linear's order: the tile, the name (24/600), the Properties row (status, priority,
 * owner, target), the latest update with its automatic at-risk rows, Description, then the embedded projects list. No
 * summary (it would repeat the description; Rally has none) and no Resources (§19.12). With no update the row carries the
 * initiative's health, which is then Auto: the worst of its active projects (D36).
 */
function Overview({ initiative: i, failed, onUpdate }: { initiative: Initiative; failed: boolean; onUpdate(): void }) {
  const details = useApp((s) => s.pmDetails[`initiative:${i.id}`]);
  const all = useApp((s) => s.projects);
  const priority = useApp((s) => s.meta?.initiativePriority ?? false);
  const projects = useMemo(() => Object.values(all).filter((p) => p.initiative_id === i.id), [all, i.id]);
  const latest: Update | null = details?.updates[0] ?? null;
  const description = details?.description;
  const body = useMemo(() => (description ? sanitize(description) : ""), [description]);
  return (
    <section aria-label="Overview" className="pt-16 pb-16">
      <div data-column className="mx-auto w-(--size-content)">
        <div data-section="icon-tile"><InitiativeTile /></div>
        <h2 data-section="name" className="mt-3 text-title leading-8 font-semibold text-ink-1">{i.name}</h2>
        <div className="mt-5">
          <Line part="properties" label="Properties">
            <span data-prop="status" title={i.status_name} className={PILL}><InitiativeIcon status={i.status} />{INITIATIVE_STATUS_LABEL[i.status]}</span>
            {priority && <span data-prop="priority" className="flex"><PriorityPicker kind="initiative" id={i.id} priority={i.priority} pill={PILL} /></span>}
            <span data-prop="owner" className={PILL}><Avatar user={i.owner} size={18} />{i.owner?.name ?? "No owner"}</span>
            {i.target && <span data-prop="target" className={PILL}><Icon name="calendar" size={16} className="text-ink-3" />{ordinalDate(i.target)}</span>}
            {/* Not while the detail read is out for an initiative the list says has an update: the card is on its way. */}
            {!latest && !i.latest_update && (
              <span data-prop="health" className="flex h-7 items-center px-0.5">
                <HealthChip health={i.health} latest={null} kind="initiative" onClick={onUpdate} />
              </span>
            )}
          </Line>
        </div>
        {latest && (
          <div data-section="latest-update" className="mt-4">
            <UpdateCard update={latest} previous={previousOf(details!.updates, 0)} kind="initiative" collapsible={false}
              risks={initiativeRiskRows(projects)} onUpdate={onUpdate} />
          </div>
        )}
        <div data-section="description" className="mt-[22px]">
          <h3 className="flex h-7 items-center text-small leading-4 font-medium text-ink-3">Description</h3>
          {/* Linear's editor: the text 16 under the heading, 110 tall when short (initiative-controls.json). */}
          <div className="min-h-[110px] py-4">
            {body
              ? <div className="prose-rally text-regular text-ink-2" dangerouslySetInnerHTML={{ __html: body }} />
              : <p className="text-regular text-ink-4">{description !== undefined ? "No description" : failed ? "Couldn't load the description." : "Loading…"}</p>}
          </div>
        </div>
      </div>
      <EmbeddedProjects initiative={i} projects={projects} loading={details === undefined && !failed} />
    </section>
  );
}

/**
 * "Features" (18/500 `ink-2`) over the embedded list, 92 under the description: a wider section than the column (x378,
 * 1208 wide, centred like it), its rows reaching 30 left and 8 right. No "Display options" or "Add a project" (D23;
 * the Projects tab has the full view).
 */
function EmbeddedProjects({ initiative: i, projects, loading }: { initiative: Initiative; projects: Project[]; loading: boolean }) {
  const users = useApp((s) => s.users);
  const teams = useApp((s) => s.teams);
  const initiatives = useApp((s) => s.initiatives);
  const releases = useApp((s) => s.releases);
  const issues = useApp((s) => s.issues);
  const priority = useApp((s) => s.meta?.projectPriority ?? false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const options = useMemo(() => ({ ...normalizePmOptions(EMBEDDED, { priority }), collapsed }), [priority, collapsed]);
  const ctx = useMemo<PmContext>(() => ({ now: Date.now(), users, teams, initiatives, releases, priority, issues }),
    [users, teams, initiatives, releases, priority, issues]);
  const groups = useMemo(() => groupProjects(projects, options, ctx), [projects, options, ctx]);
  const toggle = (k: string) => setCollapsed((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  let list: ReactNode;
  if (projects.length) {
    list = (
      <div className="-mr-2 -ml-[30px] mt-1.5">
        <ProjectList label={`${i.name} features`} groups={groups} options={options} ctx={ctx} onToggleGroup={toggle} embedded />
      </div>
    );
  } else {
    list = <p className="py-2 text-small text-ink-3">{loading ? "Loading features…" : "No features in this capability."}</p>;
  }
  return (
    <div data-section="projects" className="mx-auto mt-[92px] w-[1208px] max-w-[calc(100%-76px)]">
      <h3 className="py-1.5 text-[18px] leading-[21px] font-medium text-ink-2">Features</h3>
      {list}
    </div>
  );
}

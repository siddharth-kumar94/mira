import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { INITIATIVE_STATUS_LABEL, type Initiative, type InitiativeStatus, type Priority, type Project, type ReportedHealth } from "../api/types";
import { Avatar } from "../components/Avatar";
import { dayOf, ordinalDate } from "../components/format";
import { Icon } from "../components/icons";
import { DateChip, HealthChip, HealthDot, InitiativeIcon, ProjectsDoneIcon } from "../components/pm";
import { Popover } from "../components/Popover";
import { PriorityIcon } from "../components/PriorityIcon";
import { Tabs } from "../components/Tabs";
import { IconButton } from "../components/ui";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { formatRoute, type Route } from "../route";
import { appStore, uiStore, useApp, useUi } from "../store";
import { listKey } from "../store/store";
import { sidebarTeamIds } from "../store/ui";
import {
  defaultInitiativeOptions, doneCount, groupInitiatives, healthCounts, INITIATIVE_PROPERTIES, INITIATIVE_PROPERTY_LABEL, initiativeTab,
  isDefaultInitiatives, loadInitiativeOptions, matchesInitiative, normalizeInitiativeOptions, saveInitiativeOptions, sortInitiatives,
  type InitiativeFilters, type InitiativeGroup, type InitiativeGroupOf, type InitiativeOptions, type InitiativeOrder, type InitiativeProperty,
  type InitiativesTab,
} from "./initiatives";
import { InitiativeFilterChips, InitiativesFilter } from "./InitiativesFilter";
import { Combobox, Divider, Row } from "./ProjectsDisplay";
import { go } from "./ProjectList";

const TABS: [InitiativesTab, string][] = [["active", "Active"], ["planned", "Planned"], ["all", "All capabilities"]];
const EMPTY_TAB: Record<InitiativesTab, string> = { active: "No active capabilities.", planned: "No planned capabilities.", all: "No capabilities." };

type Column = Exclude<InitiativeProperty, "id" | "description">;
/**
 * Linear's columns after Name (inventory-p4 §3.1, initiatives-controls.json), each as wide as the gap to the next one's x:
 * Status 1102, Priority 1214, Owner 1282, Target 1344, Projects 1462, Health 1527, Active Projects 1571, to the row's end at 1719.
 * Name takes the rest, so a hidden column gives its width to Name. `text` is where the header's label sits in the column:
 * Linear's sortable headers are buttons padded 6; Projects is plain; Active Projects' label lines up with its pills' dots.
 * Updated (off in Linear's default) slots in after Target.
 */
const COLUMNS: { prop: Column; label: string; width: number; text: string }[] = [
  { prop: "status", label: "Status", width: 112, text: "pl-1.5" },
  { prop: "priority", label: "Priority", width: 68, text: "pl-1.5" },
  { prop: "owner", label: "Owner", width: 62, text: "pl-1.5" },
  { prop: "target", label: "Target", width: 118, text: "pl-1.5" },
  { prop: "updated", label: "Updated", width: 110, text: "pl-1.5" },
  { prop: "projects", label: "Features", width: 65, text: "" },
  { prop: "health", label: "Health", width: 44, text: "pl-1.5" },
  { prop: "active", label: "Active features", width: 148, text: "pl-[26px]" },
];
/** Name starts 52 in (x297): the hover checkbox at 22, the 28 glyph button at 52, the name at 86. */
const ROW = "grid items-center pl-[52px]";

/** The Display popover's choices: §19.7's groupings (Priority only with the field, D38), then Linear's orderings. */
const GROUPS: [InitiativeGroup, string][] = [["none", "No grouping"], ["outcome", "Outcome"], ["initiative", "Initiative"], ["status", "Status"],
  ["owner", "Owner"], ["priority", "Priority"]];
const ORDERS: [InitiativeOrder, string][] = [["manual", "Manual"], ["priority", "Priority"], ["target", "Target date"], ["updated", "Last updated"]];

function useInitiativeOptions(priority: boolean): [InitiativeOptions, (next: Partial<InitiativeOptions>) => void] {
  const [options, setOptions] = useState(() => loadInitiativeOptions(priority));
  useEffect(() => setOptions(loadInitiativeOptions(priority)), [priority]);
  const update = useCallback((next: Partial<InitiativeOptions>) => setOptions((current) => {
    const merged = normalizeInitiativeOptions({ ...current, ...next }, priority);
    saveInitiativeOptions(merged);
    return merged;
  }), [priority]);
  return [options, update];
}

/**
 * Spec §19.7: the initiatives above the sidebar teams' projects. The header has no "New initiative" (D23); the tab row is
 * Active, Planned, All initiatives, the filter chips, then Filter and Display. No grouping by default; Outcome, Initiative (the outcome's parent), Status and Owner are options.
 */
export function InitiativesList() {
  const yours = useApp((s) => s.yourTeamIds);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const teamIds = useMemo(() => sidebarTeamIds(yours, joined, hidden).sort((a, b) => a - b), [yours, joined, hidden]);
  const key = listKey("initiatives", teamIds);
  const list = useApp((s) => s.lists[key]);
  const initiatives = useApp((s) => s.initiatives);
  const projects = useApp((s) => s.projects);
  const priority = useApp((s) => s.meta?.initiativePriority ?? false);
  const menu = useUi((u) => u.menu);
  const [tab, setTab] = useState<InitiativesTab>("active");
  const [options, setOptions] = useInitiativeOptions(priority);
  const [filters, setFilters] = useState<InitiativeFilters>({});

  // The poller doesn't refresh initiatives: load on every visit and whenever the team set changes.
  useEffect(() => {
    if (teamIds.length) void appStore.getState().loadInitiatives(teamIds);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => uiStore.getState().setVisible([]), []); // J/K have no issues to walk here

  const now = Date.now();
  const loaded = useMemo(() => (list?.ids ?? []).flatMap((id): Initiative[] => (initiatives[id] ? [initiatives[id]] : [])), [list, initiatives]);
  const children = useMemo(() => Object.values(projects), [projects]);
  const inTab = useMemo(() => loaded.filter((i) => initiativeTab(i, tab)), [loaded, tab]);
  const shown = useMemo(() => inTab.filter((i) => matchesInitiative(i, filters, priority)), [inTab, filters, priority]);
  const groups = useMemo(() => groupInitiatives(sortInitiatives(shown, options.orderBy, priority), options.groupBy, priority),
    [shown, options.orderBy, options.groupBy, priority]);

  const closeMenu = useCallback(() => uiStore.getState().setMenu(null), []);
  const changed = !isDefaultInitiatives(options, priority);
  const toggle = (m: "filter" | "display") => () => uiStore.getState().setMenu(menu === m ? null : m);
  const open = (m: "filter" | "display") => (menu === m ? "bg-pill-on! text-ink-1!" : ""); // fill-open while the popover is up
  const retry = () => void appStore.getState().loadInitiatives(teamIds);
  const toggleGroup = (k: string) => setOptions({ collapsed: options.collapsed.includes(k) ? options.collapsed.filter((x) => x !== k) : [...options.collapsed, k] });

  const body = !teamIds.length ? <Empty>Join a team to see its capabilities.</Empty>
    : !list || (list.status !== "ready" && loaded.length === 0)
      ? list?.status === "error"
        ? <Empty>Couldn't load capabilities.{" "}
            <button type="button" onClick={retry} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button></Empty>
        : <Empty>Loading capabilities…</Empty>
      : shown.length === 0
        ? <Empty>{inTab.length ? "No capabilities match this view." : EMPTY_TAB[tab]}</Empty>
        : <Table groups={groups} options={options} priority={priority} projects={children} now={now} onToggleGroup={toggleGroup} />;

  return (
    <ViewFrame title={<span className="text-ink-2">Capabilities</span>}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Linear's tab row sits at y61 (initiatives-controls.json), as the projects view's. Linear's Open sidebar isn't copied:
            Mira has no initiatives panel, so Filter and Display sit one place right (1649, 1683). */}
        <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2 pt-[2px]">
          <Tabs<InitiativesTab> label="Capabilities" tabs={TABS} value={tab} onChange={setTab} />
          <InitiativeFilterChips filters={filters} priority={priority} initiatives={loaded} onChange={setFilters} />
          <div className="ml-auto flex items-center gap-1.5">
            <Popover open={menu === "filter"} onClose={closeMenu}
              button={<IconButton label="Add filter" icon="filter" aria-expanded={menu === "filter"} onClick={toggle("filter")} className={open("filter")} />}>
              <InitiativesFilter initiatives={inTab} filters={filters} priority={priority} onChange={setFilters} onClose={closeMenu} />
            </Popover>
            <Popover open={menu === "display"} onClose={closeMenu}
              button={<IconButton label="Display options" icon="display" dot={changed} aria-expanded={menu === "display"}
                onClick={toggle("display")} className={open("display")} />}>
              <InitiativesDisplay options={options} onChange={setOptions} priority={priority} changed={changed} />
            </Popover>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    </ViewFrame>
  );
}

function Table({ groups, options, priority, projects, now, onToggleGroup }: {
  groups: InitiativeGroupOf[]; options: InitiativeOptions; priority: boolean; projects: Project[]; now: number; onToggleGroup(key: string): void;
}) {
  const props = options.properties.filter((p) => priority || p !== "priority");
  const columns = COLUMNS.filter((c) => props.includes(c.prop));
  const template = { gridTemplateColumns: `minmax(0, 1fr) ${columns.map((c) => `${c.width}px`).join(" ")}` };
  const grouped = options.groupBy !== "none" && groups[0]?.field !== "none";
  return (
    <div role="group" aria-label="Capabilities" className="flex flex-col pt-px pb-2">
      {/* Header: 32 tall at y97 (a pixel under the projects list's), 12/450 `ink-3`. */}
      <div role="row" className={`${ROW} h-8 shrink-0 text-mini font-normal text-ink-3`} style={template}>
        <span role="columnheader" className="pl-1.5">Name</span>
        {columns.map((c) => <span key={c.prop} role="columnheader" className={`truncate whitespace-nowrap ${c.text}`}>{c.label}</span>)}
      </div>
      {groups.map((g) => {
        const collapsed = grouped && options.collapsed.includes(g.key);
        const rows = !collapsed && g.initiatives.map((i) => (
          <InitiativeRow key={i.id} initiative={i} props={props} columns={columns} template={template} projects={projects} now={now} />
        ));
        if (!grouped) return <div key={g.key} role="presentation">{rows}</div>;
        return (
          <section key={g.key} aria-label={g.label}>
            <div className="mx-2 mb-0.5 flex h-(--size-group) items-center gap-1.5 rounded-control bg-hover pr-4 pl-4">
              <button type="button" aria-label={collapsed ? "Expand group" : "Collapse group"} aria-expanded={!collapsed} onClick={() => onToggleGroup(g.key)}
                className="flex size-5 items-center justify-center rounded-full text-line-caret hover:text-ink-3">
                <Icon name="caret" size={16} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
              </button>
              <GroupMark group={g} />
              <h3 className="font-medium text-ink-2">{g.label}</h3>
              <span className="text-ink-3">{g.initiatives.length}</span>
            </div>
            {rows}
          </section>
        );
      })}
    </div>
  );
}

function GroupMark({ group }: { group: InitiativeGroupOf }) {
  switch (group.field) {
    case "outcome": case "initiative": return group.value === null ? null : <InitiativeIcon size={16} />;
    case "status": return <InitiativeIcon status={group.value as InitiativeStatus} size={16} />;
    case "owner": return <Avatar user={group.value === null ? null : { id: group.value as number, name: group.label }} size={16} />;
    case "priority": return <PriorityIcon priority={group.value as Priority} />;
    default: return null;
  }
}

const SPOKEN: Record<ReportedHealth, string> = { on_track: "on track", at_risk: "at risk", off_track: "off track" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** A 12/500 control on Linear's 1px transparent border; hover as the health chip's. */
const PILL = "inline-flex shrink-0 items-center border border-transparent text-mini font-medium whitespace-nowrap hover:bg-health-hover";

function InitiativeRow({ initiative: i, props, columns, template, projects, now }: {
  initiative: Initiative; props: InitiativeProperty[]; columns: typeof COLUMNS; template: { gridTemplateColumns: string }; projects: Project[];
  now: number;
}) {
  const route: Route = { name: "initiative", key: i.key, tab: "overview" };
  const toProjects: Route = { name: "initiative", key: i.key, tab: "projects" };
  const toUpdates: Route = { name: "initiative", key: i.key, tab: "activity" };
  const overdue = i.target !== null && i.status !== "completed" && dayOf(i.target).getTime() < new Date(new Date(now).toDateString()).getTime();
  const cell = (c: Column): ReactNode => {
    switch (c) {
      // The status pill: the initiative-status icon and "Active" 12/450 `ink-1`, 28h, pad 3 6, 6 into the column; the Rally state as its tooltip.
      case "status": return (
        <span title={i.status_name} className="ml-1.5 inline-flex h-7 items-center gap-2 rounded-full px-1.5 text-mini font-normal text-ink-1">
          <InitiativeIcon status={i.status} />{INITIATIVE_STATUS_LABEL[i.status]}
        </span>
      );
      case "priority": return <span className="ml-1.5 flex size-7 items-center justify-center rounded-full"><PriorityIcon priority={i.priority} /></span>;
      // The owner's 18 avatar alone, in a 28h pill padded 6.
      case "owner": return <span className="inline-flex h-7 items-center rounded-full px-1.5"><Avatar user={i.owner} size={18} /></span>;
      case "target": return <span className="ml-[3px] flex"><DateChip iso={i.target} overdue={overdue} now={now} strong /></span>;
      case "updated": return <span className="block truncate pl-1.5 text-mini text-ink-2">{i.updated_at && ordinalDate(i.updated_at, now)}</span>;
      case "projects": {
        // The check-hexagon and "0 / 3": the done count and slash `ink-3`, the total `ink-2` (initiatives.png); a bare count with no projects.
        const { done, total } = doneCount(i, projects);
        return (
          <button type="button" aria-label={`${done} of ${plural(total, "feature")} completed. Click to view features.`} onClick={go(toProjects)}
            className={`${PILL} h-6 gap-1.5 rounded-full px-1`}>
            <ProjectsDoneIcon />
            <span className="text-ink-3">{total ? <>{`${done}\u00a0/\u00a0`}<span className="text-ink-2">{total}</span></> : done}</span>
          </button>
        );
      }
      case "health": return (
        <span onClick={go(toUpdates)} className="ml-1.5 flex">
          <HealthChip health={i.health} latest={i.latest_update} kind="initiative" now={now} iconOnly />
        </span>
      );
      // One 32×22 pill per health among the active projects: radius 12, pad 2 6 2 2, an 8px dot in a 16 box, then the count.
      case "active": return (
        <span className="ml-[23px] flex items-center gap-0.5">
          {healthCounts(i.project_health).map(({ value, count }) => (
            <button key={value} type="button" aria-label={`${plural(count, "feature")} ${SPOKEN[value]}. Click to open updates.`} onClick={go(toUpdates)}
              className={`${PILL} h-[22px] gap-px rounded-[12px] py-0.5 pr-1.5 pl-0.5 text-ink-2`}>
              <HealthDot value={value} />
              {count}
            </button>
          ))}
        </span>
      );
    }
  };
  return (
    // 58 tall; the hover is a `hover` ::before inset 8 either side, radius 8, as the projects list's.
    <a href={formatRoute(route)} onClick={go(route)} style={template}
      className={`${ROW} group relative isolate h-[58px] outline-none before:absolute before:inset-y-0 before:inset-x-2 before:-z-10 before:rounded-control before:content-[''] hover:before:bg-hover focus-visible:before:bg-hover`}>
      {/* The hover checkbox in Linear's 14×22 slot at x267. Initiatives are read-only (D23): selecting drives nothing yet. */}
      <span className="absolute top-[18px] left-[22px] flex h-[22px] w-3.5 items-center opacity-0 group-hover:opacity-100 has-checked:opacity-100">
        <input type="checkbox" aria-label="Select capability" onClick={(e) => e.stopPropagation()}
          className="ml-[3px] size-3.5 shrink-0 appearance-none rounded-[4px] border-[1.5px] border-ink-4 bg-surface checked:border-accent checked:bg-accent" />
      </span>
      <span data-col="name" className="flex min-w-0 items-center pr-1.5">
        <span data-part="glyph" className="flex size-7 shrink-0 items-center justify-center"><InitiativeIcon size={16} /></span>
        <span className="ml-1.5 flex min-w-0 flex-col gap-0.5 text-small leading-4">
          <span className="flex min-w-0 items-center gap-1.5">
            {props.includes("id") && <span className="shrink-0 font-normal text-ink-3">{i.key}</span>}
            <span data-part="name" className="truncate font-medium text-ink-2">{i.name}</span>
          </span>
          {props.includes("description") && i.summary && <span data-part="description" className="truncate font-normal text-ink-3">{i.summary}</span>}
        </span>
      </span>
      {columns.map((c) => <span key={c.prop} data-col={c.prop} className="flex min-w-0 items-center">{cell(c.prop)}</span>)}
    </a>
  );
}

/** Linear's initiatives Display popover (inventory-p4 §3.1): Grouping and Ordering, no layout tabs, the properties, "Reset" once changed. */
function InitiativesDisplay({ options, onChange, priority, changed }: {
  options: InitiativeOptions; onChange(next: Partial<InitiativeOptions>): void; priority: boolean; changed: boolean;
}) {
  const groups = priority ? GROUPS : GROUPS.filter(([g]) => g !== "priority");
  const orders = priority ? ORDERS : ORDERS.filter(([o]) => o !== "priority");
  const offered = INITIATIVE_PROPERTIES.filter((p) => priority || p !== "priority");
  return (
    <div role="dialog" aria-label="Display options"
      className={`absolute top-[33px] right-0 z-30 w-[332px] rounded-palette border border-line-popover bg-surface px-4 pt-2 shadow-menu ${changed ? "" : "pb-3"}`}>
      <Row label="Grouping"><Combobox label="Grouping" value={options.groupBy} choices={groups} onPick={(groupBy) => onChange({ groupBy })} /></Row>
      <Row label="Ordering"><Combobox label="Ordering" value={options.orderBy} choices={orders} onPick={(orderBy) => onChange({ orderBy })} /></Row>
      <Divider />
      <div className="mt-2.5 mb-3 text-mini leading-[15px] font-medium text-ink-3">Display properties</div>
      <div role="group" aria-label="Display properties" className="flex flex-wrap gap-[5px]">
        {offered.map((p) => {
          const on = options.properties.includes(p);
          return (
            <button key={p} type="button" aria-pressed={on}
              onClick={() => onChange({ properties: on ? options.properties.filter((x) => x !== p) : [...options.properties, p] })}
              className={`h-6 rounded-full border px-2 text-mini font-medium ${on ? "border-transparent bg-pill-on text-ink-1" : "border-line-menu bg-surface text-ink-3"}`}>
              {INITIATIVE_PROPERTY_LABEL[p]}
            </button>
          );
        })}
      </div>
      {changed && <div className="-mx-4 mt-3 flex h-[35px] items-center justify-end border-t border-line-menu px-2">
        <button type="button" aria-label="Reset to view default" onClick={() => onChange(defaultInitiativeOptions())}
          className="h-6 rounded-full px-2 text-mini font-medium text-ink-2 hover:bg-hover">Reset</button>
      </div>}
    </div>
  );
}

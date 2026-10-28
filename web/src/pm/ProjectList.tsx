import type { MouseEvent, ReactNode } from "react";
import type { Priority, Project, ProjectCategory } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ordinalDate } from "../components/format";
import { Icon, ProjectIcon } from "../components/icons";
import { DateChip, HealthChip, HealthIcon, InitiativeIcon, PersonChip, PiChip, ProjectStatusIcon, Sparkline } from "../components/pm";
import { PriorityIcon } from "../components/PriorityIcon";
import { labelColor, Tile } from "../components/ui";
import { formatRoute, type Route } from "../route";
import { uiStore } from "../store";
import { healthKey, isOverdue, projectTeamIds, type PmContext, type PmOptions, type PmProperty, type ProjectGroup } from "./model";

type Column = Exclude<PmProperty, "id" | "pi">;
/**
 * Linear's list columns after Name (inventory-p4 §1.4), each with its measured width: Health 1056, Priority 1192, Lead 1266,
 * Target date 1404, Issues 1530 (its header there, its count ending at 1573) and Status 1585 to the row's end at 1719. Name takes the rest, so a hidden column gives its
 * width to Name and the columns right of it don't move. Status stays last, as in Linear; the columns Linear's capture had
 * off (Teams … Labels) slot in by the spec's property order.
 */
const COLUMNS: { prop: Column; label: string; width: number; header: "pad" | "plain" }[] = [
  { prop: "health", label: "Health", width: 136, header: "pad" },
  { prop: "priority", label: "Priority", width: 74, header: "pad" },
  { prop: "teams", label: "Teams", width: 150, header: "pad" },
  { prop: "initiatives", label: "Capabilities", width: 170, header: "pad" },
  { prop: "lead", label: "Lead", width: 138, header: "plain" },
  { prop: "start", label: "Start date", width: 126, header: "pad" },
  { prop: "target", label: "Target date", width: 126, header: "pad" },
  { prop: "issues", label: "Stories", width: 55, header: "plain" },
  { prop: "created", label: "Created", width: 110, header: "pad" },
  { prop: "updated", label: "Updated", width: 110, header: "pad" },
  { prop: "completed", label: "Completed", width: 110, header: "pad" },
  { prop: "labels", label: "Labels", width: 170, header: "pad" },
  { prop: "status", label: "Status", width: 134, header: "pad" },
];
/** The Name column starts 38 in (x283): the hover checkbox sits at 16, the 28 cube button at 38, the name at 72. */
const ROW = "grid items-center pl-[38px]";
/**
 * The initiative overview's embedded list (inventory-p4 §3.2, initiative-controls.json): rows 36 tall, drawn 30 left and 8
 * right of the section (x348 → 1594), the Name column 30 in (x378) with the 22 cube button there; Health 1026, Priority
 * 1162, Lead 1236, Target date 1402 and Status 1508 to the row's end. The header reads 12/500 `ink-2`; group headers are a
 * caret at the row's edge, the name 11/450 `ink-3` and a 1px `line-2` rule.
 */
const EMBEDDED_WIDTH: Partial<Record<Column, number>> = { health: 136, priority: 74, lead: 166, target: 106, status: 86 };
const EMBEDDED_ROW = "grid items-center pl-[30px]";
/** Issue counts end where Linear's count button puts its digit (x1573), 12 before Status; the header starts the column. */
const ISSUES_END = "pr-3";

export function ProjectList({ label, groups, options, ctx, onToggleGroup, embedded = false }: {
  label: string; groups: ProjectGroup[]; options: PmOptions; ctx: PmContext; onToggleGroup(key: string): void;
  /** The initiative overview's compact list. */
  embedded?: boolean;
}) {
  const props = options.properties.filter((p) => ctx.priority || p !== "priority");
  const columns = COLUMNS.filter((c) => props.includes(c.prop))
    .map((c) => (embedded ? { ...c, width: EMBEDDED_WIDTH[c.prop] ?? c.width } : c));
  const template = { gridTemplateColumns: `minmax(0, 1fr) ${columns.map((c) => `${c.width}px`).join(" ")}` };
  const grouped = options.groupBy !== "none";
  return (
    <div role="group" aria-label={label} className={`flex flex-col ${embedded ? "" : "pb-2"}`}>
      {/* Header: 32 tall, 12/450 `ink-3` (12/500 `ink-2` embedded); labels sit where Linear's "Order by" buttons put their text (pad 6). */}
      <div role="row" className={`${embedded ? `${EMBEDDED_ROW} font-medium text-ink-2` : `${ROW} font-normal text-ink-3`} h-8 shrink-0 text-mini`} style={template}>
        <span role="columnheader" className={embedded ? "" : "pl-1.5"}>Name</span>
        {columns.map((c) => (
          <span key={c.prop} role="columnheader" className={`truncate whitespace-nowrap ${c.header === "pad" ? "pl-1.5" : ""}`}>
            {c.label}
          </span>
        ))}
      </div>
      {groups.map((g) => {
        const collapsed = grouped && options.collapsed.includes(g.key);
        const rows = !collapsed && g.projects.map((p) => (
          <ProjectRow key={p.id} project={p} props={props} columns={columns} template={template} ctx={ctx} embedded={embedded} />
        ));
        if (!grouped) return <div key={g.key} role="presentation">{rows}</div>;
        const caret = (
          <button type="button" aria-label={collapsed ? "Expand group" : "Collapse group"} aria-expanded={!collapsed} onClick={() => onToggleGroup(g.key)}
            className={`flex size-5 items-center justify-center rounded-full text-line-caret hover:text-ink-3 ${embedded ? "absolute left-0" : ""}`}>
            <Icon name="caret" size={16} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        );
        if (embedded) {
          return (
            <section key={g.key} aria-label={g.label}>
              <div className="relative mb-0.5 flex h-8 items-center pr-2 pl-[30px]">
                {caret}
                <h3 className="text-[11px] leading-[14px] font-normal text-ink-3">{g.label}</h3>
                <span aria-hidden className="ml-1.5 h-px min-w-0 flex-1 bg-line-2" />
              </div>
              {rows}
            </section>
          );
        }
        return (
          <section key={g.key} aria-label={g.label}>
            <div className="mx-2 mb-0.5 flex h-(--size-group) items-center gap-1.5 rounded-control bg-hover pr-4 pl-4">
              {caret}
              <GroupMark group={g} ctx={ctx} />
              <h3 className="font-medium text-ink-2">{g.label}</h3>
              <span className="text-ink-3">{g.projects.length}</span>
            </div>
            {rows}
          </section>
        );
      })}
    </div>
  );
}

function GroupMark({ group, ctx }: { group: ProjectGroup; ctx: PmContext }) {
  switch (group.field) {
    case "status": return <ProjectStatusIcon category={group.value as ProjectCategory} progress={0.5} />;
    case "priority": return <PriorityIcon priority={group.value as Priority} />;
    case "health": return <HealthIcon value={group.value as ReturnType<typeof healthKey>} />;
    case "lead": return <Avatar user={group.value === null ? null : ctx.users[group.value as number] ?? { id: group.value as number, name: group.label }} size={16} />;
    case "team": return <Tile id={group.value as number} name={group.label} size={16} />;
    case "initiative": return group.value === null ? null : <InitiativeIcon size={16} />;
    default: return null;
  }
}

/** Plain links: a modified click opens a new tab, a plain one navigates in place. */
export const go = (route: Route) => (e: MouseEvent) => {
  e.stopPropagation();
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  uiStore.getState().navigate(route);
};

function ProjectRow({ project: p, props, columns, template, ctx, embedded }: {
  project: Project; props: PmProperty[]; columns: typeof COLUMNS; template: { gridTemplateColumns: string }; ctx: PmContext; embedded: boolean;
}) {
  const route: Route = { name: "project", key: p.key, tab: "overview" };
  const cell = (c: Column): ReactNode => {
    switch (c) {
      case "health":
        // The chip opens the project's updates (Linear: "Click to open updates").
        return <span onClick={go({ name: "project", key: p.key, tab: "activity" })} className="flex">
          <HealthChip health={p.health} latest={p.latest_update} kind="project" now={ctx.now} />
        </span>;
      case "priority": return <span className="flex size-7 items-center justify-center rounded-full"><PriorityIcon priority={p.priority} /></span>;
      case "lead": return <PersonChip user={p.lead} />;
      case "start": return <DateChip iso={p.start} icon="start" now={ctx.now} />;
      case "target": return <DateChip iso={p.target} overdue={isOverdue(p, ctx.now)} now={ctx.now} />;
      case "issues": return <span className={`block w-full text-right text-mini font-normal text-ink-1 tabular-nums ${ISSUES_END}`}>{p.issue_count}</span>;
      case "status": return (
        <span className="flex items-center">
          <span className="flex h-7 items-center gap-2 px-1.5 text-mini font-normal text-ink-2 tabular-nums">
            <ProjectStatusIcon category={p.status_category} progress={p.progress} />{Math.round(p.progress * 100)}%
          </span>
          {/* Embedded, Status is 86 wide: Linear's cell is the icon and the % only. */}
          {!embedded && <span className="ml-1 flex"><Sparkline start={p.start} progress={p.progress} now={ctx.now} /></span>}
        </span>
      );
      case "teams": return (
        <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-mini text-ink-2">
          {projectTeamIds(p, ctx.issues).map((id) => <Tile key={id} id={id} name={ctx.teams[id]?.name ?? "Team"} size={16} />)}
          <span className="truncate">{projectTeamIds(p, ctx.issues).map((id) => ctx.teams[id]?.name ?? `Team ${id}`).join(", ")}</span>
        </span>
      );
      case "initiatives": {
        const i = p.initiative_id === null ? undefined : ctx.initiatives[p.initiative_id];
        return i ? <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-mini text-ink-2"><InitiativeIcon size={16} /><span className="truncate">{i.name}</span></span> : null;
      }
      case "created": return <span className="block truncate pl-1.5 text-mini text-ink-2">{ordinalDate(p.created_at, ctx.now)}</span>;
      case "updated": return <span className="block truncate pl-1.5 text-mini text-ink-2">{ordinalDate(p.updated_at, ctx.now)}</span>;
      case "completed": return p.completed_at && <span className="block truncate pl-1.5 text-mini text-ink-2">{ordinalDate(p.completed_at, ctx.now)}</span>;
      case "labels": return (
        <span className="flex min-w-0 items-center gap-1 px-1.5">
          {p.labels.map((l) => (
            <span key={l} className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu px-2 text-mini text-ink-3">
              <span className="size-2 rounded-full" style={{ background: labelColor(l) }} />{l}
            </span>
          ))}
        </span>
      );
    }
  };
  return (
    // 48 tall; the hover is a `hover` ::before inset 8 either side, radius 8 (measured live on Linear's team list).
    // Embedded: 36 tall, the row itself the radius-8 hover (x348 → 1594).
    <a href={formatRoute(route)} onClick={go(route)} style={template}
      className={embedded
        ? `${EMBEDDED_ROW} group relative h-9 rounded-control outline-none hover:bg-hover focus-visible:bg-hover`
        : `${ROW} group relative isolate h-12 outline-none before:absolute before:inset-y-0 before:inset-x-2 before:-z-10 before:rounded-control before:content-[''] hover:before:bg-hover focus-visible:before:bg-hover`}>
      {/* The hover checkbox: Linear's 14×22 slot at x261 (x358 embedded) holds a box drawn 14 wide centred at x271. Selecting
          projects drives nothing yet: projects are read-only (D23). */}
      <span className={`absolute flex h-[22px] w-3.5 items-center opacity-0 group-hover:opacity-100 has-checked:opacity-100 ${embedded ? "top-[7px] left-2.5" : "top-[13px] left-4"}`}>
        <input type="checkbox" aria-label="Select feature" onClick={(e) => e.stopPropagation()}
          className="ml-[3px] size-3.5 shrink-0 appearance-none rounded-[4px] border-[1.5px] border-ink-4 bg-surface checked:border-accent checked:bg-accent" />
      </span>
      <span data-col="name" className="flex min-w-0 items-center">
        {embedded
          ? <span data-part="cube" className="flex size-[22px] shrink-0 items-center justify-center"><ProjectIcon project={p} size={16} /></span>
          : <span data-part="cube" className="flex size-7 shrink-0 items-center justify-center"><ProjectIcon project={p} size={14} /></span>}
        {props.includes("id") && <span className="ml-1.5 shrink-0 text-mini text-ink-3">{p.key}</span>}
        <span className="ml-1.5 truncate text-small leading-4 font-medium text-ink-1">{p.name}</span>
        {props.includes("pi") && p.pi_id !== null && <span className="ml-3 flex"><PiChip release={ctx.releases[p.pi_id]} /></span>}
      </span>
      {columns.map((c) => <span key={c.prop} data-col={c.prop} className="flex min-w-0 items-center">{cell(c.prop)}</span>)}
    </a>
  );
}

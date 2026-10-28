import { useMemo } from "react";
import { PROJECT_STATUS_LABEL, type Project, type ProjectCategory } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ProjectIcon } from "../components/icons";
import { DateChip, HealthChip, PiChip, ProjectStatusIcon } from "../components/pm";
import { PriorityIcon } from "../components/PriorityIcon";
import { formatRoute, type Route } from "../route";
import { healthKey, isOverdue, groupProjects, type PmContext, type PmOptions, type PmProperty, type ProjectGroup } from "./model";
import { go } from "./ProjectList";

/**
 * Spec §19.5 Board (inventory-p4 §1.5): the status columns Backlog, Planned, In Progress, Completed (Canceled is cut,
 * §19.1), 354 wide from x249; the page scrolls sideways and each column scrolls on its own. Read-only (D23): no "…",
 * no "+", no "Add new project", and cards don't drag.
 */
export function ProjectBoard({ projects, options, ctx }: { projects: Project[]; options: PmOptions; ctx: PmContext }) {
  // Columns: Status is the board's only choice, whatever the list's grouping; "Show empty columns" brings back the empty ones.
  const groups = useMemo(() => groupProjects(projects, { ...options, layout: "board", groupBy: "status" }, ctx), [projects, options, ctx]);
  const props = options.properties.filter((p) => ctx.priority || p !== "priority");
  return (
    <div role="group" aria-label="Features board" className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-1">
      {groups.map((g) => <Column key={g.key} group={g} props={props} ctx={ctx} />)}
    </div>
  );
}

/**
 * A 354 column (pitch 354, 12 padding): its fill sits 4 in, radius 6 at the top, `board-column` fading toward the panel.
 * Header 50 from the board's top: the status icon at 18 in, the name 13/500 `ink-2` 10 after it, the count 13/450 `ink-3` 8 after.
 */
function Column({ group, props, ctx }: { group: ProjectGroup; props: PmProperty[]; ctx: PmContext }) {
  return (
    <section aria-label={`${group.label} column`}
      className="mx-1 mt-1 flex w-[346px] shrink-0 flex-col rounded-t-[6px] bg-linear-to-b from-board-column to-board-column/25">
      <header className="flex h-[46px] shrink-0 items-center pl-3.5">
        <ProjectStatusIcon category={group.value as ProjectCategory} progress={0.5} />
        <h3 className="ml-2.5 font-medium text-ink-2">{group.label}</h3>
        <span aria-label="Feature count" className="ml-2 font-normal text-ink-3 tabular-nums">{group.projects.length}</span>
      </header>
      <div data-column-body className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-px pb-2">
        {group.projects.map((p) => <Card key={p.id} project={p} props={props} ctx={ctx} />)}
      </div>
    </section>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "story" : "stories"}`;

/**
 * Linear's project card: 328 wide, radius 8, `surface`, the §18 card shadow with a 1px ring; 5 above and below.
 * 1. The cube (a 28 hit area 6 in), the name 13/500 `ink-2` wrapping, then 28 round marks ending 2 from the right:
 *    icon-only health (left out with no update, as Linear's), status, priority (D38) and the lead's 16 avatar.
 * 2. The target date (12/450 `ink-3`) and the PI chip in the milestone slot (§19.1), 4 apart; no row without either.
 * 3. "N issues", 12/450 `ink-3`.
 */
function Card({ project: p, props, ctx }: { project: Project; props: PmProperty[]; ctx: PmContext }) {
  const route: Route = { name: "project", key: p.key, tab: "overview" };
  const show = (prop: PmProperty) => props.includes(prop);
  const health = show("health") && healthKey(p) !== "none";
  const target = show("target") && p.target !== null;
  const release = show("pi") && p.pi_id !== null ? ctx.releases[p.pi_id] : undefined;
  const dates = target || release !== undefined;
  return (
    <a href={formatRoute(route)} onClick={go(route)}
      className="mx-px flex shrink-0 flex-col rounded-control bg-surface py-[5px] shadow-card-project outline-none focus-visible:outline focus-visible:outline-[0.5px] focus-visible:outline-focus">
      {/* The marks are 28 tall but the header is the name's height (6 + 16 a line): Linear's rows start 6 under the name. */}
      <div className="flex items-start pr-0.5 pl-1.5">
        <span data-part="cube" className="-mb-1.5 flex size-7 shrink-0 items-center justify-center"><ProjectIcon project={p} size={14} /></span>
        <span className="mr-2 ml-1 min-w-0 flex-1 pt-1.5 text-small leading-4 font-medium break-words text-ink-2">
          {show("id") && <span data-part="id" className="mr-1.5 text-mini font-normal text-ink-3">{p.key}</span>}
          <span data-part="name">{p.name}</span>
        </span>
        <span data-part="marks" className="-mb-1.5 flex shrink-0 items-center">
          {health && (
            // The chip opens the project's updates, as in the list.
            <span data-part="health" onClick={go({ name: "project", key: p.key, tab: "activity" })} className="flex">
              <HealthChip health={p.health} latest={p.latest_update} kind="project" now={ctx.now} iconOnly />
            </span>
          )}
          {show("status") && (
            <span data-part="status" role="img" aria-label={PROJECT_STATUS_LABEL[p.status_category]} title={p.status_name}
              className="flex size-7 items-center justify-center rounded-full">
              <ProjectStatusIcon category={p.status_category} progress={p.progress} />
            </span>
          )}
          {show("priority") && <span data-part="priority" className="flex size-7 items-center justify-center rounded-full"><PriorityIcon priority={p.priority} /></span>}
          {show("lead") && <span data-part="lead" className="flex size-7 items-center justify-center"><Avatar user={p.lead} size={16} /></span>}
        </span>
      </div>
      {(dates || show("issues")) && (
        <div className="mt-1.5 flex flex-col">
          {dates && (
            <div data-part="dates" className="flex items-center gap-1 px-1.5">
              {target && <DateChip iso={p.target} overdue={isOverdue(p, ctx.now)} now={ctx.now} muted />}
              {/* 2 more in: the PI's text starts where Linear's milestone diamond does (16 after the date, 12 into the card). */}
              {release && <span className="flex pl-0.5"><PiChip release={release} /></span>}
            </div>
          )}
          {show("issues") && <div data-part="issues" className="flex h-7 items-center px-3 text-mini font-normal text-ink-3">{plural(p.issue_count)}</div>}
        </div>
      )}
    </a>
  );
}

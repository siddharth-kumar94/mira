import { useState, type ReactNode } from "react";
import type { Initiative, Issue, Project, Release, Update } from "../api/types";
import { BurnUp } from "../charts/BurnUp";
import { Avatar } from "../components/Avatar";
import { shortDate } from "../components/format";
import { Icon } from "../components/icons";
import { InitiativeIcon, Legend, ProjectStatusIcon } from "../components/pm";
import { labelColor, Tile } from "../components/ui";
import { Breakdown } from "../cycles/Breakdown";
import { progressOf } from "../cycles/progress";
import { formatRoute, type ProjectTab, type Route } from "../route";
import { useApp } from "../store";
import { ordinalDate } from "./diff";
import { go } from "./ProjectList";
import { PriorityPicker, teamsLabel, ToArrow } from "./pmControls";

/** Points can be fractional; sums must not print float noise. */
const pts = (n: number) => +n.toFixed(2);

/** A 36-pitch row: the label 12/450 `ink-3` in a 90 column (x1336), the value pill at x1426. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-row={label} className="flex h-9 items-center">
      <span className="w-[90px] shrink-0 text-mini font-normal text-ink-3">{label}</span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}

/**
 * A panel (inventory-p4 §2.3): `surface`, radius 10, 1px `line-menu`, `shadow-comment`, pad 12 (6 above the header);
 * the header is "Name ▾" (13/500 `ink-3`) in a 28h radius-8 button 8 left of the content. `aside` sits on its right.
 */
function Panel({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label={title} className={`rounded-[10px] border border-line-menu bg-surface px-3 pt-1.5 shadow-comment ${open ? className : "pb-1.5"}`}>
      <div className="flex h-7 items-center">
        <button type="button" aria-label={`${open ? "Collapse" : "Expand"} ${title.toLowerCase()} section`} aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`-ml-2 flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-small leading-4 font-medium text-ink-3 hover:bg-hover ${aside ? "min-w-0 flex-1" : "w-[334px]"}`}>
          {title}
          <Icon name="caret" size={16} className={`transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
        </button>
        {aside}
      </div>
      {open && children}
    </section>
  );
}

/** Sidebar value pills: 28h, fully rounded, pad 3 6, a 16 icon 8 before 12/450 `ink-1` (project-overview-points.json). */
const PILL = "inline-flex h-7 min-w-0 shrink-0 items-center gap-2 rounded-full px-1.5 text-mini font-normal whitespace-nowrap text-ink-1";
/**
 * Spec §19.6's right sidebar (inventory-p4 §2.3; 388 wide at x1323, scrolling on its own): Properties, Progress and
 * Activity, 8 apart. Not copied (D23, §19.12): Members, Slack, Milestones, "Add dependency", "Add label", "Add initiative".
 */
export function ProjectSidebar({ project: p, issues, teamIds, initiative, release, latest, priority }: {
  project: Project; issues: Issue[]; teamIds: number[]; initiative: Initiative | undefined; release: Release | undefined;
  latest: Update | null; priority: boolean;
}) {
  const teams = useApp((s) => s.teams);
  const users = useApp((s) => s.users);
  const projects = useApp((s) => s.projects);
  const progress = progressOf(issues);
  const tab = (t: ProjectTab): Route => ({ name: "project", key: p.key, tab: t });
  const link = (t: ProjectTab, text: string) => (
    <a href={formatRoute(tab(t))} onClick={go(tab(t))} className="rounded-[4px] text-ink-3 hover:text-ink-1">{text}</a>
  );
  return (
    <aside aria-label="Feature details" className="w-[396px] shrink-0 overflow-y-auto pr-2 pb-2">
      <div className="flex w-[388px] flex-col gap-2">
        <Panel title="Properties" className="pb-2">
          <div className="mt-0.5">
            <Row label="Status">
              <span className={PILL}><ProjectStatusIcon category={p.status_category} progress={p.progress} />{p.status_name}</span>
            </Row>
            {priority && <Row label="Priority"><PriorityPicker kind="project" id={p.id} priority={p.priority} pill={PILL} /></Row>}
            <Row label="Lead">
              <span className={PILL}><Avatar user={p.lead} size={18} /><span className="truncate">{p.lead?.name ?? "No lead"}</span></span>
            </Row>
            <Row label="Dates">
              {p.start || p.target ? <>
                <span className={PILL}><Icon name="calendarStart" size={16} className="text-ink-3" />{p.start ? ordinalDate(p.start) : "No start date"}</span>
                <ToArrow className="mx-2" />
                <span className={PILL}><Icon name="calendar" size={16} className="text-ink-3" />{p.target ? ordinalDate(p.target) : "No target date"}</span>
              </> : <span className={`${PILL} text-ink-3!`}><Icon name="calendar" size={16} className="text-ink-3" />No dates</span>}
            </Row>
            <Row label="Teams">
              <span className={`${PILL} pr-2.5`}>
                <span className="flex w-4 justify-center"><Tile id={teamIds[0]} name={teams[teamIds[0]]?.name ?? "Team"} size={14} /></span>
                <span className="truncate">{teamsLabel(teamIds, teams)}</span>
              </span>
            </Row>
            <Row label="Capabilities">
              {initiative
                ? <span className={PILL}><InitiativeIcon size={16} /><span className="truncate">{initiative.name}</span></span>
                : <span className={`${PILL} text-ink-3!`}>{p.initiative_id === null ? "No capability" : "Loading…"}</span>}
            </Row>
            <Row label="PI">
              <span className={release ? PILL : `${PILL} text-ink-3!`}><Icon name="milestone" size={16} className="text-ink-3" />{release?.name ?? (p.pi_id === null ? "No PI" : "Unknown PI")}</span>
            </Row>
            <Row label="Labels">
              {p.labels.length
                ? <span className="flex min-w-0 flex-wrap items-center gap-1">
                    {p.labels.map((l) => (
                      <span key={l} className="inline-flex h-6 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu px-2 text-mini text-ink-2">
                        <span className="size-2 rounded-full" style={{ background: labelColor(l) }} />{l}
                      </span>
                    ))}
                  </span>
                : <span className={`${PILL} text-ink-3!`}><Icon name="tag" size={16} className="text-ink-3" />No labels</span>}
            </Row>
          </div>
        </Panel>
        <Panel title="Progress" className="pb-3">
          {/* Columns 122 apart from the content edge (x1336): swatch, then the label at x1346 (project-overview-points.json). */}
          <div className="mt-1.5 w-[366px]">
            <Legend scope={pts(progress.scope)} started={pts(progress.started)} completed={pts(progress.completed)} dense />
          </div>
          {/* The burn-up, 362×200: the target line from the project's own target (ruling T22-end). */}
          <div className="mt-0.5 pb-[1.5px]">
            <BurnUp target={{ kind: "project", ref: p.key }} width={362} height={200} variant="project" targetDate={p.target} />
          </div>
          <div className="mt-5">
            <Breakdown issues={issues} ctx={{ users, projects, teams }} teams only={["assignees", "labels", "teams"]} stretch />
          </div>
        </Panel>
        <Panel title="Activity" className="pb-3" aside={<span className="ml-2 shrink-0 text-mini whitespace-nowrap">{link("activity", "See all")}</span>}>
          {/* Linear's lines (rea-project-overview.json): "<author> posted an update · Oct 16 · View", then the creation. */}
          <ul className="mt-1 flex flex-col gap-2 text-mini leading-[16.8px] text-ink-3">
            {latest && (
              <li className="flex items-center gap-2">
                <Icon name="compose" size={14} />
                <span className="min-w-0">
                  <span className="font-medium text-ink-2">{latest.author?.name ?? "Someone"}</span> posted an update
                  {" · "}{shortDate(latest.created_at)}{" · "}{link("activity", "View")}
                </span>
              </li>
            )}
            <li className="flex items-center gap-2">
              <Icon name="project" size={14} />
              <span className="min-w-0">
                {p.lead && <><span className="font-medium text-ink-2">{p.lead.name}</span> </>}created the feature
                {" · "}{shortDate(p.created_at)}
              </span>
            </li>
          </ul>
        </Panel>
      </div>
    </aside>
  );
}

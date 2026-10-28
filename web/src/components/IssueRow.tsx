import { useEffect, useRef } from "react";
import type { Issue } from "../api/types";
import { uiStore, useApp, useUi } from "../store";
import type { Property } from "../views/types";
import { Avatar } from "./Avatar";
import { longDate, rangeLabel, shortDate } from "./format";
import { CycleIcon, Icon, ProjectIcon } from "./icons";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";
import { Chip, labelColor } from "./ui";

/** First two labels, then "+N" (plan ruling 9). */
export function Labels({ labels, surface = false }: { labels: string[]; surface?: boolean }) {
  if (!labels.length) return null;
  const dot = (l: string) => <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: labelColor(l) }} />;
  return (
    <>
      {labels.slice(0, 2).map((l) => <Chip key={l} surface={surface} icon={dot(l)}>{l}</Chip>)}
      {labels.length > 2 && <Chip surface={surface} title={labels.slice(2).join(", ")}>+{labels.length - 2}</Chip>}
    </>
  );
}

/** §18.3 row: checkbox, priority, ID, status, title, then labels, project, cycle, estimate, assignee, created, creator, updated. */
export function IssueRow({ issue, properties }: { issue: Issue; properties: Property[] }) {
  const selected = useUi((u) => u.selectedId === issue.id);
  const checked = useUi((u) => u.selectedIds.includes(issue.id));
  const selecting = useUi((u) => u.selectedIds.length > 0);
  const project = useApp((s) => (issue.project_id ? s.projects[issue.project_id] : undefined));
  const cycle = useApp((s) => (issue.cycle_id ? s.cycles[issue.cycle_id] : undefined));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const show = (p: Property) => properties.includes(p);
  const ui = uiStore.getState();
  const date = (label: string, iso: string) => (
    <span title={`${label} ${longDate(iso)}`} className="w-12 shrink-0 text-right text-mini text-ink-3">{shortDate(iso)}</span>
  );
  return (
    <div ref={ref} role="option" aria-selected={selected} data-issue-id={issue.id} data-team-id={issue.team_id}
      onClick={() => ui.select(issue.id)}
      onContextMenu={(e) => { e.preventDefault(); ui.openContextMenu(issue.id, e.clientX, e.clientY); }}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("input")) ui.openIssue(issue.key); }}
      className={`group flex h-(--size-row) cursor-default items-center gap-2.5 rounded-control border-[0.5px] pl-2 pr-4 transition-colors duration-150 ${selected ? "border-line-menu bg-hover" : "border-transparent hover:bg-hover"}`}>
      <span className="flex w-6 shrink-0 justify-center">
        <input type="checkbox" aria-label={`Select ${issue.key}`} checked={checked}
          onChange={() => ui.toggleSelected(issue.id)} onClick={(e) => e.stopPropagation()}
          className={`size-3.5 ${checked || selecting || selected ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`} />
      </span>
      {show("priority") && <PriorityIcon priority={issue.priority} />}
      {show("id") && <span className="w-(--id-width) shrink-0 text-ink-3">{issue.key}</span>}
      {show("status") && <StatusIcon status={issue.status} />}
      <span className="min-w-0 flex-1 truncate font-medium text-ink-1">{issue.title}</span>
      {issue.blocked && (
        <span title={issue.blocked_reason || "Blocked"} className="flex h-6 items-center gap-1 rounded-full bg-blocked/15 px-2 text-mini text-blocked">
          <Icon name="blocked" size={12} />Blocked
        </span>
      )}
      {show("labels") && <Labels labels={issue.labels} />}
      {show("project") && project && <Chip strong icon={<ProjectIcon project={project} />}>{project.name}</Chip>}
      {show("cycle") && cycle && (
        <Chip title={`${cycle.name} · ${rangeLabel(cycle)}`} icon={<CycleIcon cycle={cycle} />}>{cycle.short_name}</Chip>
      )}
      {show("estimate") && issue.estimate !== null && (
        <span className="flex shrink-0 items-center gap-1 text-mini text-ink-3"><Icon name="estimate" size={14} />{issue.estimate}</span>
      )}
      {show("assignee") && <Avatar user={issue.assignee} />}
      {show("created") && date("Created", issue.created_at)}
      {show("creator") && <Avatar user={issue.creator} />}
      {show("updated") && date("Updated", issue.updated_at)}
    </div>
  );
}

import { useMemo } from "react";
import { PRIORITY_LABEL, STATUS_LABEL } from "../api/types";
import { Avatar } from "../components/Avatar";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { sanitize } from "../editor/sanitize";
import { useApp, useUi } from "../store";

/** §18.9 peek: a read-only card top right, under the toolbar. The list stays live; J/K moves it, Enter opens, Esc/Space closes. */
export function PeekCard() {
  const id = useUi((u) => u.peekId);
  const issue = useApp((s) => (id === null ? undefined : s.issues[id]));
  const project = useApp((s) => (issue?.project_id ? s.projects[issue.project_id] : undefined));
  const cycle = useApp((s) => (issue?.cycle_id ? s.cycles[issue.cycle_id] : undefined));
  const html = useMemo(() => (issue?.description ? sanitize(issue.description) : ""), [issue?.description]);
  if (!issue) return null;
  const part = "flex min-w-0 items-center gap-1.5";
  const fixed = "flex shrink-0 items-center gap-1.5";
  return (
    <aside aria-label="Story preview"
      className="fixed right-6 top-[88px] z-30 w-(--size-peek) rounded-palette border-[0.5px] border-line-menu bg-surface p-[25px] pt-4 shadow-palette">
      <div className="font-medium text-ink-3">{issue.key}</div>
      <h2 className="mt-[1.5px] text-[18px] font-medium leading-[26px] text-ink-1">{issue.title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-3">
        <span className={part}><StatusIcon status={issue.status} />{STATUS_LABEL[issue.status]}</span>
        <span className={part}><PriorityIcon priority={issue.priority} />{PRIORITY_LABEL[issue.priority]}</span>
        <span className={part}><Avatar user={issue.assignee} />{issue.assignee?.name ?? "Unassigned"}</span>
      </div>
      {(project || cycle || issue.estimate !== null) && (
        <div className="mt-3 flex items-center gap-x-4 text-ink-3">
          {project && <span className={part}><ProjectIcon project={project} size={16} /><span className="truncate">{project.name}</span></span>}
          {cycle && <span className={fixed}><CycleIcon cycle={cycle} size={16} />{cycle.name}</span>}
          {issue.estimate !== null && <span className={fixed}><Icon name="estimate" size={14} />{issue.estimate}</span>}
        </div>
      )}
      {html
        ? <div className="prose-rally mt-4 line-clamp-[8] text-regular [font-weight:400] leading-[22.5px] text-ink-4" dangerouslySetInnerHTML={{ __html: html }} />
        : <p className="mt-4 text-regular text-ink-4">No description</p>}
    </aside>
  );
}

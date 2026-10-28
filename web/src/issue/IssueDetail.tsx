import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PRIORITY_LABEL, STATUS_LABEL, type Issue } from "../api/types";
import { Avatar } from "../components/Avatar";
import { points } from "../components/format";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { Chip, labelColor, Tile } from "../components/ui";
import { Empty } from "../components/ViewFrame";
import { DescriptionEditor } from "../editor/DescriptionEditor";
import { appStore, uiStore, useAppState } from "../store";
import type { Picker } from "../store/ui";
import { SubIssueList } from "./SubIssueList";

const pill = "inline-flex h-7 max-w-full items-center gap-2 rounded-full px-1.5 font-medium transition-colors duration-150";

function Pill({ label, onClick, unset = false, children }: { label: string; onClick?(): void; unset?: boolean; children: ReactNode }) {
  if (!onClick) return <span aria-label={label} className={`${pill} text-ink-2`}>{children}</span>;
  return <button type="button" aria-label={label} onClick={onClick} className={`${pill} hover:bg-hover ${unset ? "text-ink-3" : "text-ink-2"}`}>{children}</button>;
}

function PropGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-1 pl-2 font-medium text-ink-3">{label}</h3>
      <div className="flex flex-col items-start gap-0.5">{children}</div>
    </section>
  );
}

/** §18.10: 24/600, wraps; Enter saves, never a newline. */
function TitleField({ issue }: { issue: Issue }) {
  const [value, setValue] = useState(issue.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(issue.title), [issue.title]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const commit = () => {
    const next = value.trim().replace(/\s*\n\s*/g, " ");
    if (next && next !== issue.title) void appStore.getState().updateIssue(issue.id, { title: next });
    else setValue(issue.title);
  };
  return (
    <textarea ref={ref} aria-label="Story title" rows={1} value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      className="mb-2 block w-full resize-none overflow-hidden bg-transparent text-title font-semibold leading-8 text-ink-1" />
  );
}

/** §18.10: the content column centred at 805, the properties column at 400 with no divider. */
export function IssueDetail({ id, children }: { id: number; children?: ReactNode }) {
  const app = useAppState();
  const issue = app.issues[id];
  useEffect(() => {
    void appStore.getState().loadIssueDetail(id);
  }, [id]);
  const subs = useMemo(() => Object.values(app.subIssues).filter((t) => t.issue_id === id).sort((a, b) => a.index - b.index), [app.subIssues, id]);
  if (!issue) return <Empty>Loading…</Empty>;
  const project = issue.project_id ? app.projects[issue.project_id] : undefined;
  const cycle = issue.cycle_id ? app.cycles[issue.cycle_id] : undefined;
  const team = app.teams[issue.team_id];
  const open = (picker: Picker) => () => uiStore.getState().openPalette(picker, [id]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8">
      <div className="mx-auto flex max-w-[1254px] gap-[49px]">
      <div className="min-w-0 max-w-(--size-content) flex-1 pb-24 pt-4">
        <div className="px-[7px]">
          <TitleField issue={issue} />
          <DescriptionEditor key={issue.id} html={issue.description}
            onSave={(html) => void appStore.getState().updateIssue(id, { description: html })} />
          <SubIssueList issue={issue} subs={subs} />
          {children}
        </div>
      </div>
      <aside aria-label="Properties" className="w-(--size-props) shrink-0 pt-4">
        <PropGroup label="Properties">
          <Pill label={`Status: ${STATUS_LABEL[issue.status]}`} onClick={open("status")}><StatusIcon status={issue.status} size={16} />{STATUS_LABEL[issue.status]}</Pill>
          <Pill label={`Team: ${team?.name ?? "Team"}`}><Tile id={issue.team_id} name={team?.name ?? "Team"} size={16} />{team?.name ?? "Team"}</Pill>
          <Pill label={`Priority: ${PRIORITY_LABEL[issue.priority]}`} onClick={open("priority")} unset={issue.priority === 0}>
            <PriorityIcon priority={issue.priority} />{issue.priority === 0 ? "Priority" : PRIORITY_LABEL[issue.priority]}
          </Pill>
          <Pill label={`Assignee: ${issue.assignee?.name ?? "No assignee"}`} onClick={open("assignee")} unset={!issue.assignee}>
            <Avatar user={issue.assignee} />{issue.assignee?.name ?? "Assignee"}
          </Pill>
          <Pill label={`Estimate: ${issue.estimate === null ? "No estimate" : points(issue.estimate)}`} onClick={open("estimate")} unset={issue.estimate === null}>
            <Icon name="estimate" size={16} />{issue.estimate === null ? "Estimate" : points(issue.estimate)}
          </Pill>
          <Pill label={`Sprint: ${cycle?.name ?? "No sprint"}`} onClick={open("cycle")} unset={!cycle}>
            {cycle ? <CycleIcon cycle={cycle} size={16} /> : <Icon name="cycles" size={16} />}{cycle?.name ?? "Sprint"}
          </Pill>
          {issue.blocked && (
            <span title={issue.blocked_reason || "Blocked"} className={`${pill} bg-blocked/10 text-blocked`}><Icon name="blocked" size={16} />Blocked</span>
          )}
        </PropGroup>
        <PropGroup label="Labels">
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-1.5">
              {issue.labels.map((l) => <Chip key={l} icon={<span aria-hidden className="size-2 rounded-full" style={{ background: labelColor(l) }} />}>{l}</Chip>)}
            </div>
          )}
          <Pill label="Add labels" onClick={open("labels")} unset><Icon name="tag" size={16} />Add label</Pill>
        </PropGroup>
        <PropGroup label="Feature">
          <Pill label={`Feature: ${project?.name ?? "No feature"}`} onClick={open("project")} unset={!project}>
            <ProjectIcon project={project} size={16} /><span className="truncate">{project?.name ?? "Feature"}</span>
          </Pill>
        </PropGroup>
      </aside>
      </div>
    </div>
  );
}

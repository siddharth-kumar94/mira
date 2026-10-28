import { DndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import type { Issue } from "../api/types";
import { Avatar } from "../components/Avatar";
import { rangeLabel, shortDate, storyCount } from "../components/format";
import { GroupIcon } from "../components/GroupHeader";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { Labels } from "../components/IssueRow";
import { MenuButton } from "../components/Menu";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { Chip, IconButton } from "../components/ui";
import { uiStore, useApp, useUi } from "../store";
import { handleDragEnd, useDragSensors, type DropHandler } from "./ListLayout";
import { collisionDetection } from "./drag";
import { groupPrefill, groupTotal, withScopePrefill, type Group } from "./model";
import type { ComposerPrefill, DisplayOptions, Property } from "./types";

/** §18.4 card: ID and avatar; status and title; a chip row; then the created date. */
function Card({ issue, groupKey, properties }: { issue: Issue; groupKey: string; properties: Property[] }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, data: { groupKey } });
  const selected = useUi((u) => u.selectedId === issue.id);
  const checked = useUi((u) => u.selectedIds.includes(issue.id));
  const project = useApp((s) => (issue.project_id ? s.projects[issue.project_id] : undefined));
  const cycle = useApp((s) => (issue.cycle_id ? s.cycles[issue.cycle_id] : undefined));
  const ref = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    setNodeRef(node);
  }, [setNodeRef]);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);
  const show = (p: Property) => properties.includes(p);
  const ui = uiStore.getState();
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setRefs} {...listeners} role="option" aria-selected={selected || checked} data-issue-id={issue.id} data-team-id={issue.team_id}
      style={style} onClick={() => ui.select(issue.id)}
      onContextMenu={(e) => { e.preventDefault(); ui.openContextMenu(issue.id, e.clientX, e.clientY); }} onDoubleClick={() => ui.openIssue(issue.key)}
      className={`shrink-0 rounded-control p-2 shadow-card transition-shadow duration-150 ${checked ? "bg-selected" : "bg-surface"} ${selected ? "outline outline-[0.5px] outline-focus" : ""} ${isDragging ? "relative z-10 shadow-palette" : ""}`}>
      <div className="flex h-[18px] items-center gap-2 px-1 text-mini text-ink-3">
        {show("id") && <span>{issue.key}</span>}
        {issue.blocked && <span className="text-blocked">Blocked</span>}
        <span className="ml-auto">{show("assignee") && <Avatar user={issue.assignee} />}</span>
      </div>
      <div className="mt-1.5 flex items-start gap-2 px-1">
        {show("status") && <span className="mt-[3px]"><StatusIcon status={issue.status} /></span>}
        <span className="line-clamp-3 font-medium text-ink-1">{issue.title}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1 px-1">
        {show("priority") && <Chip surface icon={<PriorityIcon priority={issue.priority} size={14} />} title={undefined} />}
        {show("cycle") && cycle && <Chip surface title={`${cycle.name} · ${rangeLabel(cycle)}`} icon={<CycleIcon cycle={cycle} />}>{cycle.short_name}</Chip>}
        {show("project") && project && <Chip surface icon={<ProjectIcon project={project} />}>{project.name}</Chip>}
        {show("estimate") && issue.estimate !== null && <Chip surface icon={<Icon name="estimate" size={14} />}>{issue.estimate}</Chip>}
        {show("labels") && <Labels labels={issue.labels} surface />}
      </div>
      {show("created") && <div className="mt-1.5 px-1 text-mini text-ink-3">Created {shortDate(issue.created_at)}</div>}
    </div>
  );
}

function Column({ group, options, onToggleGroup, scopePrefill }: {
  group: Group; options: DisplayOptions; onToggleGroup(key: string): void; scopePrefill?: ComposerPrefill | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.key}`, data: { groupKey: group.key } });
  const total = groupTotal(group);
  const prefill = withScopePrefill(groupPrefill(group), scopePrefill);
  const add = () => uiStore.getState().openComposer(prefill);
  if (options.collapsed.includes(group.key)) {
    return (
      <section ref={setNodeRef} aria-label={`${group.label} column`} className="flex h-full w-10 shrink-0 flex-col items-center gap-2 py-[18px]">
        <button type="button" aria-label={`Expand ${group.label}`} onClick={() => onToggleGroup(group.key)} className="flex flex-col items-center gap-2 rounded-control p-1 text-ink-3 hover:bg-hover">
          <GroupIcon group={group} />
          <span className="text-mini [writing-mode:vertical-rl]">{group.label} · {group.issues.length}</span>
        </button>
      </section>
    );
  }
  return (
    <section ref={setNodeRef} aria-label={`${group.label} column`}
      className={`flex h-full w-(--size-column) shrink-0 flex-col rounded-control transition-colors duration-150 ${isOver ? "bg-hover" : ""}`}>
      <header className="flex h-[50px] shrink-0 items-center gap-1.5 pl-[18px] pr-3">
        <GroupIcon group={group} />
        <h3 className="font-medium text-ink-2">{group.label}</h3>
        <span title={"points" in total ? `${total.points} points` : storyCount(total.count)} className="flex items-center gap-1 text-ink-3">
          {"points" in total ? <><Icon name="estimate" size={14} />{total.points}</> : total.count}
        </span>
        <span className="ml-auto flex items-center">
          <MenuButton label={`${group.label} column`} align="right" width={180}
            entries={[{ id: "collapse", label: "Collapse column", onSelect: () => onToggleGroup(group.key) }]}
            button={({ open, toggle }) => <IconButton size={24} label="Open menu" icon="more" aria-expanded={open} onClick={toggle} />} />
          {prefill && <IconButton size={24} label="Create new story" icon="plus" onClick={add} />}
        </span>
      </header>
      <div data-column-body className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-[13px] pb-3">
        <SortableContext items={group.issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {group.issues.map((issue) => <Card key={issue.id} issue={issue} groupKey={group.key} properties={options.properties} />)}
        </SortableContext>
        {prefill && (
          <button type="button" aria-label="Add new story" onClick={add}
            className="mx-px flex h-7 shrink-0 items-center justify-center rounded-full border-[0.5px] border-line-menu bg-surface/50 text-ink-3 hover:bg-hover">
            <Icon name="plus" size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

/** §18.4: columns fill the height and scroll on their own; the board scrolls only sideways. */
export function BoardLayout({ label, groups, options, onDrop, onToggleGroup, scopePrefill }: {
  label: string; groups: Group[]; options: DisplayOptions; onDrop: DropHandler; onToggleGroup(key: string): void;
  scopePrefill?: ComposerPrefill | null;
}) {
  const sensors = useDragSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={(e) => handleDragEnd(e, onDrop)}>
      <div role="listbox" aria-label={label} aria-multiselectable="true" className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2">
        {groups.map((g) => <Column key={g.key} group={g} options={options} onToggleGroup={onToggleGroup} scopePrefill={scopePrefill} />)}
      </div>
    </DndContext>
  );
}

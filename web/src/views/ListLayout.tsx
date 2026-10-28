import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CSSProperties, ReactNode } from "react";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "../api/types";
import { GroupHeader } from "../components/GroupHeader";
import { IssueRow } from "../components/IssueRow";
import { collisionDetection } from "./drag";
import type { Group } from "./model";
import type { ComposerPrefill, DisplayOptions, Property } from "./types";

export type DropHandler = (issueId: number, fromKey: string, toKey: string, overId: number | null) => void;

/** Rows and groups both carry their group's key; a drop on a row also names that row. */
export function handleDragEnd(e: DragEndEvent, onDrop: DropHandler): void {
  const from = e.active.data.current?.groupKey as string | undefined;
  const to = e.over?.data.current?.groupKey as string | undefined;
  if (!e.over || !from || !to) return;
  onDrop(Number(e.active.id), from, to, typeof e.over.id === "number" ? e.over.id : null);
}

export function useDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
}

function SortableRow({ issue, groupKey, properties }: { issue: Issue; groupKey: string; properties: Property[] }) {
  // Only pointer listeners: dnd-kit's `attributes` add role="button", which makes the keyboard handler ignore Space/Enter.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, data: { groupKey } });
  return (
    <div ref={setNodeRef} {...listeners} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : ""}>
      <IssueRow issue={issue} properties={properties} />
    </div>
  );
}

function ListGroup({ group, options, onToggleGroup, scopePrefill }: {
  group: Group; options: DisplayOptions; onToggleGroup(key: string): void; scopePrefill?: ComposerPrefill | null;
}) {
  const collapsed = options.groupBy !== "none" && options.collapsed.includes(group.key);
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.key}`, data: { groupKey: group.key } });
  return (
    <section ref={setNodeRef} aria-label={group.label} className={`rounded-control ${isOver ? "bg-hover/40" : ""}`}>
      {options.groupBy !== "none" && <GroupHeader group={group} collapsed={collapsed} onToggle={() => onToggleGroup(group.key)} scopePrefill={scopePrefill} />}
      {!collapsed && <SortableContext items={group.issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {group.issues.map((issue) => <SortableRow key={issue.id} issue={issue} groupKey={group.key} properties={options.properties} />)}
      </SortableContext>}
    </section>
  );
}

export function ListLayout({ label, groups, options, onDrop, onToggleGroup, footer, scopePrefill }: {
  label: string; groups: Group[]; options: DisplayOptions; onDrop: DropHandler; onToggleGroup(key: string): void; footer?: ReactNode;
  scopePrefill?: ComposerPrefill | null;
}) {
  const sensors = useDragSensors();
  const longest = Math.max(4, ...groups.flatMap((g) => g.issues.map((i) => i.key.length)));
  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={(e) => handleDragEnd(e, onDrop)}>
      <div style={{ "--id-width": `${longest + 0.5}ch` } as CSSProperties}>
        <div role="listbox" aria-label={label} aria-multiselectable="true" className="flex flex-col pb-2">
          {groups.map((g) => <ListGroup key={g.key} group={g} options={options} onToggleGroup={onToggleGroup} scopePrefill={scopePrefill} />)}
        </div>
        {footer}
      </div>
    </DndContext>
  );
}

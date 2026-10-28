import type { Priority, Status } from "../api/types";
import { uiStore, useApp } from "../store";
import { groupPrefill, groupTotal, withScopePrefill, type Group } from "../views/model";
import type { ComposerPrefill } from "../views/types";
import { Avatar } from "./Avatar";
import { rangeLabel, storyCount } from "./format";
import { CycleIcon, Icon, ProjectIcon } from "./icons";
import { PriorityIcon } from "./PriorityIcon";
import { STATUS_COLOR, StatusIcon } from "./StatusIcon";
import { IconButton } from "./ui";

export function GroupIcon({ group }: { group: Group }) {
  const project = useApp((s) => (group.field === "project" && typeof group.value === "number" ? s.projects[group.value] : undefined));
  if (group.cycle) return <CycleIcon cycle={group.cycle} />;
  switch (group.field) {
    case "status": return <StatusIcon status={group.value as Status} />;
    case "priority": return <PriorityIcon priority={group.value as Priority} />;
    case "assignee": return <Avatar user={group.value === null ? null : { id: group.value as number, name: group.label }} />;
    case "project": return group.value === null ? null : <ProjectIcon project={project} />;
    case "focus":
      if (group.key === "f:done") return <StatusIcon status="done" mono />;
      if (group.key === "f:backlog") return <StatusIcon status="backlog" />;
      return null; // Urgent issues and Other active have no icon (inventory §1)
    default: return null;
  }
}

/**
 * §18.3: caret, icon, name, points total, cycle dates, and an always-visible "+". Linear insets the bar 8 either side
 * of the list (team-active / project-issues, t19: x253 w1458 from a 245 list, radius 8, `hover`): the caret at +10,
 * the status icon at +35 in a 16 box, the name at +58, the count's icon 7 after the name and its number 4 after that,
 * and the + 8 from the bar's right end.
 */
export function GroupHeader({ group, collapsed, onToggle, scopePrefill }: {
  group: Group; collapsed: boolean; onToggle(): void; scopePrefill?: ComposerPrefill | null;
}) {
  const total = groupTotal(group);
  const prefill = withScopePrefill(groupPrefill(group), scopePrefill);
  const tint = group.field === "status" ? `color-mix(in lch, ${STATUS_COLOR[group.value as Status]} 45%, var(--color-ink-3))` : undefined;
  return (
    <div className="mx-2 mb-0.5 flex h-(--size-group) shrink-0 items-center gap-1.5 rounded-control bg-hover pl-2 pr-2">
      <button type="button" aria-label={collapsed ? "Expand group" : "Collapse group"} aria-expanded={!collapsed} onClick={onToggle}
        className="flex size-5 items-center justify-center rounded-full text-line-caret hover:text-ink-3">
        <Icon name="caret" size={16} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      <span className="flex w-4 shrink-0 justify-center empty:hidden"><GroupIcon group={group} /></span>
      <h3 className="ml-0.5 font-medium text-ink-2">{group.label}</h3>
      <span title={"points" in total ? `${total.points} points` : storyCount(total.count)}
        className="ml-0.5 flex h-6 items-center gap-1 rounded-control text-ink-3" style={tint ? { color: tint } : undefined}>
        {"points" in total ? <><Icon name="estimate" size={14} className="-ml-px" />{total.points}</> : total.count}
      </span>
      {group.cycle && <span className="text-ink-4">{rangeLabel(group.cycle)}</span>}
      {prefill && <IconButton className="ml-auto" size={24} label="Create new story" icon="plus"
        onClick={() => uiStore.getState().openComposer(prefill)} />}
    </div>
  );
}

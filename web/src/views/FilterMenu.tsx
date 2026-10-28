import type { ReactNode } from "react";
import type { Issue } from "../api/types";
import { storyCount } from "../components/format";
import { Icon } from "../components/icons";
import { Menu, type MenuEntry } from "../components/Menu";
import { StatusIcon } from "../components/StatusIcon";
import { FIELD_LABEL, FILTER_FIELDS, fieldValues, filterOptions, toggleFilter, valueLabel, type Context } from "./model";
import type { FilterField, Filters, Scope } from "./types";

const FIELD_ICON: Record<FilterField, ReactNode> = {
  team: <Icon name="team" size={16} />, status: <StatusIcon status="backlog" size={14} />, assignee: <Icon name="assign" size={16} />,
  creator: <Icon name="creator" size={16} />, priority: <Icon name="priority" size={16} />, estimate: <Icon name="estimate" size={16} />,
  label: <Icon name="tag" size={16} />, project: <Icon name="project" size={16} />, cycle: <Icon name="cycles" size={16} />,
};

/** F opens this (§18.6): Linear's field list, each a submenu of values with counts. Picking toggles and keeps it open. */
export function FilterMenu({ issues, filters, ctx, onChange, scope, onClose }: {
  issues: Issue[]; filters: Filters; ctx: Context; onChange(f: Filters): void; scope: Scope; onClose?(): void;
}) {
  const entries: MenuEntry[] = FILTER_FIELDS
    .filter((f) => f === "divider" || f[0] !== "team" || scope.kind === "my" || scope.kind === "project")
    .map((f): MenuEntry => {
      if (f === "divider") return "divider";
      const [field, label] = f;
      return {
        id: field, label, icon: FIELD_ICON[field], filterable: true, width: 240,
        items: filterOptions(field, issues, ctx).map((o): MenuEntry => ({
          id: `${field}:${String(o.value)}`, label: o.label, keepOpen: true,
          checked: (filters[field] ?? []).includes(o.value),
          hint: storyCount(issues.filter((i) => fieldValues(i, field, ctx).includes(o.value)).length),
          onSelect: () => onChange(toggleFilter(filters, field, o.value)),
        })),
      };
    });
  return (
    <Menu label="Filter" entries={entries} placeholder="Add Filter…" inputKeys="F" onClose={onClose ?? (() => {})}
      className="absolute right-0 top-9" />
  );
}

export function FilterChips({ filters, ctx, onChange }: { filters: Filters; ctx: Context; onChange(f: Filters): void }) {
  const active = (Object.keys(FIELD_LABEL) as FilterField[]).filter((f) => filters[f]?.length);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {active.map((field) => (
        <span key={field} className="flex h-6 items-center gap-1 rounded-full border-[0.5px] border-line-menu bg-panel pl-2 pr-1 text-mini text-ink-2">
          {FIELD_LABEL[field]} is {filters[field]!.map((v) => valueLabel(field, v, ctx)).join(", ")}
          <button type="button" aria-label={`Clear ${FIELD_LABEL[field]} filter`} className="rounded-full p-0.5 text-ink-3 hover:bg-hover"
            onClick={() => {
              const next = { ...filters };
              delete next[field];
              onChange(next);
            }}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

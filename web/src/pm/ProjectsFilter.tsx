import { useState, type ReactNode } from "react";
import type { Project } from "../api/types";
import { Icon } from "../components/icons";
import { Menu, type MenuEntry } from "../components/Menu";
import {
  matchesProject, pmFilterFields, pmFieldValues, pmFilterOptions, pmValueLabel, togglePmFilter, type PmContext, type PmFilterField,
  type PmFilters,
} from "./model";

const FIELD_ICON: Record<PmFilterField | "title", ReactNode> = {
  status: <Icon name="statusDashed" size={16} />, priority: <Icon name="priority" size={16} />, labels: <Icon name="tag" size={16} />,
  teams: <Icon name="team" size={16} />, lead: <Icon name="person" size={16} />, health: <Icon name="health" size={16} />,
  dates: <Icon name="calendar" size={16} />, initiatives: <Icon name="initiatives" size={16} />, pi: <Icon name="milestone" size={16} />,
  title: <Icon name="compose" size={16} />,
};

/** Linear's sections: the property fields, then Initiatives and Milestones (the PI here), then Title. */
const SECTION_START = new Set<PmFilterField | "title">(["initiatives", "title"]);
const count = (n: number) => `${n} ${n === 1 ? "feature" : "features"}`;
const box = "absolute top-[33px] right-0 border! border-line-popover!";

/**
 * Linear's projects Filter (inventory-p4 §1.3, spec §19.5): 208 wide, the "Add Filter…" search with the F keycap, then the
 * fields, each a submenu of values with counts. Title opens a "contains" field instead.
 */
export function ProjectsFilter({ projects, filters, ctx, onChange, onClose }: {
  projects: Project[]; filters: PmFilters; ctx: PmContext; onChange(f: PmFilters): void; onClose(): void;
}) {
  const [title, setTitle] = useState<string | null>(null);
  if (title !== null) {
    return (
      <div role="dialog" aria-label="Title filter"
        className={`z-40 flex h-9 w-[240px] items-center gap-2 rounded-palette bg-surface px-3 shadow-menu ${box}`}>
        <Icon name="compose" size={16} className="text-ink-3" />
        <input autoFocus aria-label="Title contains" placeholder="Title contains…" value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              const next: PmFilters = { ...filters, title: title.trim() };
              if (!next.title) delete next.title;
              onChange(next);
              onClose();
            }
            if (e.key === "Escape") setTitle(null);
          }}
          className="min-w-0 flex-1 bg-transparent text-small font-[400] text-ink-1 placeholder:text-ink-4" />
      </div>
    );
  }
  // Counts are of the projects shown before this field's own choice, as Linear's are.
  const entries: MenuEntry[] = pmFilterFields(ctx.priority).flatMap(([field, label]): MenuEntry[] => {
    const entry = fieldEntry(field, label);
    return SECTION_START.has(field) ? ["divider", entry] : [entry];
  });
  function fieldEntry(field: PmFilterField | "title", label: string): MenuEntry {
    if (field === "title") return { id: field, label, icon: FIELD_ICON.title, keepOpen: true, onSelect: () => setTitle(filters.title ?? "") };
    const rest = { ...filters };
    delete rest[field];
    const pool = projects.filter((p) => matchesProject(p, rest, ctx));
    return {
      id: field, label, icon: FIELD_ICON[field], filterable: true, width: 240,
      items: pmFilterOptions(field, projects, ctx).map((o): MenuEntry => ({
        id: `${field}:${String(o.value)}`, label: o.label, keepOpen: true, checked: (filters[field] ?? []).includes(o.value),
        // A PI sharing its name with another carries the year before the count ("2026  4 projects").
        hint: <span className="flex gap-2">{o.hint && <span>{o.hint}</span>}<span>{count(pool.filter((p) => pmFieldValues(p, field, ctx).includes(o.value)).length)}</span></span>,
        onSelect: () => onChange(togglePmFilter(filters, field, o.value)),
      })),
    };
  }
  return <Menu label="Filter" entries={entries} placeholder="Add Filter…" inputKeys="F" width={208} shadow="menu" onClose={onClose} className={box} />;
}

/** The active filters as removable chips: "Status is Backlog, Planned", "Title contains portal". */
export function PmFilterChips({ filters, ctx, onChange }: { filters: PmFilters; ctx: PmContext; onChange(f: PmFilters): void }) {
  const chips = pmFilterFields(ctx.priority).flatMap(([field, label]): { field: PmFilterField | "title"; label: string; text: string }[] => {
    if (field === "title") return filters.title ? [{ field, label, text: `Title contains ${filters.title}` }] : [];
    const values = filters[field];
    return values?.length ? [{ field, label, text: `${label} is ${values.map((v) => pmValueLabel(field, v, ctx)).join(", ")}` }] : [];
  });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {chips.map(({ field, label, text }) => (
        <span key={field} className="flex h-6 items-center gap-1 rounded-full border-[0.5px] border-line-menu bg-panel pr-1 pl-2 text-mini text-ink-2">
          {text}
          <button type="button" aria-label={`Clear ${label} filter`} className="rounded-full p-0.5 text-ink-3 hover:bg-hover"
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

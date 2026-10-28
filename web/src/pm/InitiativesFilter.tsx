import type { ReactNode } from "react";
import type { Initiative } from "../api/types";
import { Icon } from "../components/icons";
import { Menu, type MenuEntry } from "../components/Menu";
import {
  initiativeFieldValue, initiativeFilterFields, initiativeFilterOptions, initiativeValueLabel, matchesInitiative, toggleInitiativeFilter,
  type InitiativeFilterField, type InitiativeFilters,
} from "./initiatives";

const FIELD_ICON: Record<InitiativeFilterField, ReactNode> = {
  status: <Icon name="statusDashed" size={16} />, priority: <Icon name="priority" size={16} />, owner: <Icon name="person" size={16} />,
  health: <Icon name="health" size={16} />, outcome: <Icon name="initiatives" size={16} />,
};
const count = (n: number) => `${n} ${n === 1 ? "capability" : "capabilities"}`;
const box = "absolute top-[33px] right-0 border! border-line-popover!";

/**
 * The initiatives Filter, in the projects Filter's look (spec §19.5's menu): 208 wide, the "Add Filter…" search with the F keycap,
 * then Status, Priority (with the field, D38), Owner, Health and Outcome, each a submenu of values with counts.
 */
export function InitiativesFilter({ initiatives, filters, priority, onChange, onClose }: {
  initiatives: Initiative[]; filters: InitiativeFilters; priority: boolean; onChange(f: InitiativeFilters): void; onClose(): void;
}) {
  // Counts are of the initiatives shown before this field's own choice, as Linear's are.
  const entries: MenuEntry[] = initiativeFilterFields(priority).map(([field, label]): MenuEntry => {
    const rest = { ...filters };
    delete rest[field];
    const pool = initiatives.filter((i) => matchesInitiative(i, rest, priority));
    return {
      id: field, label, icon: FIELD_ICON[field], filterable: true, width: 240,
      items: initiativeFilterOptions(field, initiatives).map((o): MenuEntry => ({
        id: `${field}:${String(o.value)}`, label: o.label, keepOpen: true, checked: (filters[field] ?? []).includes(o.value),
        hint: count(pool.filter((i) => initiativeFieldValue(i, field) === o.value).length),
        onSelect: () => onChange(toggleInitiativeFilter(filters, field, o.value)),
      })),
    };
  });
  return <Menu label="Filter" entries={entries} placeholder="Add Filter…" inputKeys="F" width={208} shadow="menu" onClose={onClose} className={box} />;
}

/** The active filters as removable chips: "Status is Active, Planned". */
export function InitiativeFilterChips({ filters, priority, initiatives, onChange }: {
  filters: InitiativeFilters; priority: boolean; initiatives: Initiative[]; onChange(f: InitiativeFilters): void;
}) {
  const chips = initiativeFilterFields(priority).flatMap(([field, label]) => {
    const values = filters[field];
    return values?.length ? [{ field, label, text: `${label} is ${values.map((v) => initiativeValueLabel(field, v, initiatives)).join(", ")}` }] : [];
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

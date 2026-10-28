import { Icon } from "../components/icons";
import { MenuButton, type MenuEntry } from "../components/Menu";
import { Switch } from "../components/ui";
import { ALL_PROPERTIES, PROPERTY_LABEL } from "./options";
import type { CompletedWindow, DisplayOptions, GroupBy, OrderBy, Scope } from "./types";

const GROUPS: [GroupBy, string][] = [
  ["focus", "Focus"], ["status", "Status"], ["assignee", "Assignee"], ["priority", "Priority"], ["project", "Feature"], ["cycle", "Sprint"], ["none", "No grouping"],
];
const ORDERS: [OrderBy, string][] = [
  ["manual", "Manual"], ["priority", "Priority"], ["updated", "Last updated"], ["created", "Created"], ["estimate", "Estimate"],
];
const WINDOWS: [CompletedWindow, string][] = [["none", "None"], ["day", "Past day"], ["week", "Past week"], ["two_weeks", "Past 2 weeks"]];

function Dropdown<T extends string>({ label, value, choices, onPick, disabled, title }: {
  label: string; value: T; choices: [T, string][]; onPick(v: T): void; disabled?: boolean; title?: string;
}) {
  const current = choices.find(([v]) => v === value)?.[1] ?? (value === "importance" ? "Importance" : value);
  const entries: MenuEntry[] = choices.map(([v, l]) => ({ id: v, label: l, checked: v === value, onSelect: () => onPick(v) }));
  return (
    <MenuButton label={label} entries={entries} width={180} align="right"
      button={({ open, toggle }) => (
        <button type="button" aria-label={`${label}: ${current}`} aria-expanded={open} disabled={disabled} title={title} onClick={toggle}
          className="flex h-6 w-[116px] items-center justify-between rounded-control border-[0.5px] border-line-menu bg-surface px-2 text-mini font-[400] text-ink-2 disabled:text-ink-4">
          <span className="truncate">{current}</span><Icon name="chevron" size={10} className="text-ink-3" />
        </button>
      )} />
  );
}

const row = "flex h-8 items-center justify-between gap-2 text-ink-3";

/** §18.5: layout tabs, Grouping and Ordering, Completed stories (My stories) or Show empty groups (teams), display properties. */
export function DisplayMenu({ options, onChange, scope }: { options: DisplayOptions; onChange(next: Partial<DisplayOptions>): void; scope: Scope }) {
  const my = scope.kind === "my";
  const focus = options.groupBy === "focus";
  const tab = (layout: DisplayOptions["layout"], label: string, icon: "list" | "board") => (
    <button type="button" role="tab" aria-selected={options.layout === layout} onClick={() => onChange({ layout })}
      className={`flex h-7 w-[129px] items-center justify-center gap-1.5 rounded-full text-mini font-medium ${options.layout === layout ? "bg-tab-on text-ink-1" : "border-[0.5px] border-line-menu bg-surface text-ink-3"}`}>
      <Icon name={icon} size={16} />{label}
    </button>
  );
  return (
    <div role="dialog" aria-label="Display options"
      className="absolute right-0 top-9 z-30 w-[300px] rounded-palette border-[0.5px] border-line-menu bg-surface px-4 py-3 shadow-palette">
      <div role="tablist" aria-label="Layout" className="mb-2 flex gap-1.5 px-0.5">{tab("list", "List", "list")}{tab("board", "Board", "board")}</div>
      <div className={row}>Grouping
        <Dropdown label="Grouping" value={options.groupBy} choices={my ? GROUPS : GROUPS.filter(([g]) => g !== "focus")} onPick={(groupBy) => onChange({ groupBy })} />
      </div>
      <div className={row}>Ordering
        {focus
          ? <Dropdown label="Ordering" value={"importance" as OrderBy} choices={[["importance", "Importance"]]} onPick={() => {}} disabled title="Ordering is disabled for Focus grouping" />
          : <Dropdown label="Ordering" value={options.orderBy} choices={ORDERS} onPick={(orderBy) => onChange({ orderBy })} />}
      </div>
      <div className="-mx-4 my-2 border-t-[0.5px] border-line-menu" />
      {my
        ? <div className={row}>Completed stories
            <Dropdown label="Completed stories" value={options.completed} choices={WINDOWS} onPick={(completed) => onChange({ completed })} />
          </div>
        : <div className={row}>Show empty groups
            <Switch label="Show empty groups" checked={options.showEmpty} onChange={(showEmpty) => onChange({ showEmpty })} />
          </div>}
      <div className="-mx-4 my-2 border-t-[0.5px] border-line-menu" />
      <div className="mb-2 text-ink-3">Display properties</div>
      <div role="group" aria-label="Display properties" className="flex flex-wrap gap-[5px]">
        {ALL_PROPERTIES.map((p) => {
          const on = options.properties.includes(p);
          return (
            <button key={p} type="button" aria-pressed={on}
              onClick={() => onChange({ properties: on ? options.properties.filter((x) => x !== p) : [...options.properties, p] })}
              className={`h-6 rounded-full px-[8.5px] text-mini font-medium ${on ? "bg-pill-on text-ink-1" : "border-[0.5px] border-line-menu bg-surface text-ink-3"}`}>
              {PROPERTY_LABEL[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

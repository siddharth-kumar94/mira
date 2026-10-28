import type { ReactNode } from "react";
import { Icon, type IconName } from "../components/icons";
import { MenuButton, type MenuEntry } from "../components/Menu";
import { Switch } from "../components/ui";
import {
  defaultPmOptions, isDefaultPm, normalizePmOptions, PM_PROPERTIES, PM_PROPERTY_LABEL, TIMELINE_PROPERTIES, type ClosedWindow, type PmGroup,
  type PmLayout, type PmOptions, type PmOrder, type PmScope,
} from "./model";

const LAYOUTS: [PmLayout, string, IconName][] = [["list", "List", "list"], ["board", "Board", "board"], ["timeline", "Timeline", "timeline"]];
/** §19.5's grouping and ordering choices, in its order. */
const GROUPS: [PmGroup, string][] = [
  ["none", "No grouping"], ["status", "Status"], ["priority", "Priority"], ["lead", "Lead"], ["team", "Team"], ["initiative", "Capability"],
  ["pi", "PI"], ["health", "Health"],
];
const ORDERS: [PmOrder, string][] = [["manual", "Manual"], ["priority", "Priority"], ["target", "Target date"], ["progress", "Progress"], ["updated", "Last updated"]];
const WINDOWS: [ClosedWindow, string][] = [["all", "All"], ["recent", "Recent"], ["none", "None"]];

/** Linear's 100×24 combobox (projects-display-controls.json): radius 8, pad 1 18 1 8, 12/400 `ink-2`, a 7-wide chevron ending 7 from the right. */
export function Combobox<T extends string | number>({ label, value, choices, onPick }: {
  label: string; value: T; choices: [T, string][]; onPick(v: T): void;
}) {
  const current = choices.find(([v]) => v === value)?.[1] ?? String(value);
  const entries: MenuEntry[] = choices.map(([v, l]) => ({ id: String(v), label: l, checked: v === value, onSelect: () => onPick(v) }));
  return (
    <MenuButton label={label} entries={entries} width={180} align="right" shadow="menu"
      button={({ open, toggle }) => (
        <button type="button" aria-label={`${label}: ${current}`} aria-expanded={open} onClick={toggle}
          className="relative flex h-6 w-[100px] shrink-0 items-center rounded-control border border-line-menu bg-surface py-px pr-[18px] pl-2 text-mini font-[400] text-ink-2 hover:bg-hover">
          <span className="truncate">{current}</span>
          <Icon name="chevron" size={16} className="absolute right-[2px] text-ink-2" />
        </button>
      )} />
  );
}

const row = "flex h-8 items-center justify-between gap-2 text-mini font-medium text-ink-3";
export const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className={row}><span>{label}</span>{children}</div>;
/** Sections are split by a 1px lch(91.9) rule across the popover (measured live). */
export const Divider = () => <div role="separator" className="-mx-4 my-2 border-t border-line-menu" />;

/**
 * Linear's projects Display popover (inventory-p4 §1.2, spec §19.5): 332 wide, radius 12, 1px `line-popover`, `shadow-menu`.
 * Layout tabs; Grouping and Ordering (Board: Columns, Rows, Ordering); Show closed features; the layout's options; the
 * display properties; "Reset". Priority choices only with the field (D38).
 */
export function ProjectsDisplay({ options, onChange, scope, priority, teams }: {
  options: PmOptions; onChange(next: Partial<PmOptions>): void; scope: PmScope; priority: boolean;
  /** Teams for "Show sprints". */
  teams: { id: number; name: string }[];
}) {
  const layout = options.layout;
  const groups = priority ? GROUPS : GROUPS.filter(([g]) => g !== "priority");
  const orders = priority ? ORDERS : ORDERS.filter(([o]) => o !== "priority");
  const offered = (layout === "timeline" ? TIMELINE_PROPERTIES : PM_PROPERTIES).filter((p) => priority || p !== "priority");
  const ordering = <Row label="Ordering"><Combobox label="Ordering" value={options.orderBy} choices={orders} onPick={(orderBy) => onChange({ orderBy })} /></Row>;
  const heading = (text: string) => <div className="pt-2 text-mini leading-[15px] font-medium text-ink-2">{text}</div>;
  const changed = !isDefaultPm(options, scope, priority);
  return (
    <div role="dialog" aria-label="Display options"
      className={`absolute top-[33px] right-0 z-30 w-[332px] rounded-palette border border-line-popover bg-surface px-4 pt-[13px] shadow-menu ${changed ? "" : "pb-3"}`}>
      <div role="tablist" aria-label="Layout" className="mb-4 flex h-8 gap-1.5 rounded-[5px] bg-surface p-0.5">
        {LAYOUTS.map(([value, label, icon]) => (
          <button key={value} type="button" role="tab" aria-selected={layout === value} onClick={() => onChange({ layout: value })}
            className={`flex h-7 w-[94px] items-center justify-center gap-1.5 rounded-full border border-line-menu text-mini font-medium ${layout === value ? "bg-tab-on text-ink-1" : "bg-surface text-ink-3 hover:bg-hover"}`}>
            <Icon name={icon} size={14} />{label}
          </button>
        ))}
      </div>
      {layout === "board"
        ? <>
            {/* Spec §19.5: Board columns are the status, its rows have no grouping. */}
            <Row label="Columns"><Combobox label="Columns" value="status" choices={[["status", "Status"]]} onPick={() => {}} /></Row>
            <Row label="Rows"><Combobox label="Rows" value="none" choices={[["none", "No grouping"]]} onPick={() => {}} /></Row>
            {ordering}
          </>
        : <>
            <Row label="Grouping"><Combobox label="Grouping" value={options.groupBy} choices={groups} onPick={(groupBy) => onChange({ groupBy })} /></Row>
            {ordering}
          </>}
      <Divider />
      <Row label="Show closed features">
        <Combobox label="Show closed features" value={options.closed} choices={WINDOWS} onPick={(closed) => onChange({ closed })} />
      </Row>
      <Divider />
      {layout === "list" && heading("List options")}
      {layout === "board" && <>
        {heading("Board options")}
        <Row label="Show empty columns"><Switch label="Show empty columns" checked={options.showEmpty} onChange={(showEmpty) => onChange({ showEmpty })} /></Row>
      </>}
      {layout === "timeline" && <>
        {heading("Timeline options")}
        <Row label="Show feature list"><Switch label="Show feature list" checked={options.showList} onChange={(showList) => onChange({ showList })} /></Row>
        <Row label="Show week numbers"><Switch label="Show week numbers" checked={options.weekNumbers} onChange={(weekNumbers) => onChange({ weekNumbers })} /></Row>
        <Row label="Show sprints">
          <Combobox label="Show sprints" value={options.cycleTeamId ?? 0}
            choices={[[0, "None"], ...teams.map((t): [number, string] => [t.id, t.name])]}
            onPick={(id) => onChange({ cycleTeamId: id === 0 ? null : id })} />
        </Row>
        {/* D37: PIs (Rally Releases) as bands; Linear has no such switch. */}
        <Row label="Show PIs"><Switch label="Show PIs" checked={options.showPis} onChange={(showPis) => onChange({ showPis })} /></Row>
      </>}
      <div className="mt-2.5 mb-3 text-mini leading-[15px] font-medium text-ink-3">Display properties</div>
      <div role="group" aria-label="Display properties" className="flex flex-wrap gap-[5px]">
        {offered.map((p) => {
          const on = options.properties.includes(p);
          return (
            <button key={p} type="button" aria-pressed={on}
              onClick={() => onChange({ properties: on ? options.properties.filter((x) => x !== p) : [...options.properties, p] })}
              className={`h-6 rounded-full border px-2 text-mini font-medium ${on ? "border-transparent bg-pill-on text-ink-1" : "border-line-menu bg-surface text-ink-3"}`}>
              {PM_PROPERTY_LABEL[p]}
            </button>
          );
        })}
      </div>
      {/* Linear shows the footer only once the view differs from its default; "Set default for everyone" is not copied (§19.5). */}
      {changed && <div className="-mx-4 mt-3 flex h-[35px] items-center justify-end border-t border-line-menu px-2">
        <button type="button" aria-label="Reset to view default" onClick={() => onChange(normalizePmOptions(defaultPmOptions(scope), { priority }))}
          className="h-6 rounded-full px-2 text-mini font-medium text-ink-2 hover:bg-hover">Reset</button>
      </div>}
    </div>
  );
}

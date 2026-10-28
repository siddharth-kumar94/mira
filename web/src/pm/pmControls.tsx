import type { ReactNode } from "react";
import type { PortfolioKind } from "../api/client";
import { PRIORITY_LABEL, type Priority } from "../api/types";
import { MenuButton } from "../components/Menu";
import { PriorityIcon } from "../components/PriorityIcon";
import { PICKER_PLACEHOLDER } from "../palette/pickers";
import { appStore } from "../store";

/** Controls shared by the project and initiative pages (spec §19.6–19.7). */

/** Linear's issue-priority order in the ⌘K picker: No priority, then Urgent … Low, keyed 0–4. */
const PICK_ORDER: Priority[] = [0, 1, 2, 3, 4];

/** Main-column pills: 28h, fully rounded, pad 3 6, the 16 icon 8 before 13/450 `ink-2`, 4 apart. */
export const PILL = "inline-flex h-7 min-w-0 shrink-0 items-center gap-2 rounded-full px-1.5 text-small font-normal whitespace-nowrap text-ink-2";

/**
 * A project's or initiative's priority (D38, ledger T13-priority): a pill that opens a priority menu in the ⌘K picker's
 * look (the filter, number keys 0–4, a check on the current value), bound to `setPmPriority`. Only rendered when the field exists.
 */
export function PriorityPicker({ kind, id, priority, pill }: { kind: PortfolioKind; id: number; priority: Priority; pill: string }) {
  const entries = () => PICK_ORDER.map((p) => ({
    id: `p${p}`, label: PRIORITY_LABEL[p], icon: <PriorityIcon priority={p} />, keys: String(p), checked: priority === p,
    onSelect: () => { if (p !== priority) void appStore.getState().setPmPriority(kind, id, p); },
  }));
  return (
    <MenuButton label="Change priority" placeholder={PICKER_PLACEHOLDER.priority} width={240} entries={entries}
      button={({ open, toggle }) => (
        <button type="button" aria-label="Change priority" aria-expanded={open} onClick={toggle}
          className={`${pill} hover:bg-hover ${open ? "bg-hover" : ""}`}>
          <PriorityIcon priority={priority} />{PRIORITY_LABEL[priority]}
        </button>
      )} />
  );
}

/** "Data Services, AI/ML Solutions": the feature's own team, then its issues' teams (ruling 13). */
export function teamsLabel(ids: number[], teams: Record<number, { name: string }>): string {
  return ids.map((id) => teams[id]?.name ?? `Team ${id}`).join(", ");
}

/** The "→" between start and target dates (a 10×7.5 arrow on the 16 grid). */
export function ToArrow({ className = "" }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-label="to" role="img" className={`shrink-0 text-ink-3 ${className}`}>
      <path d="M3.25 8h9.5M9.25 4.5 12.75 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A labelled line of the main column: the h3 (13/500 `ink-3`, 80 wide (fits "Capabilities"), pad 6 0), then its pills 16 on, wrapping 2 apart. */
export function Line({ part, label, children }: { part: string; label: string; children: ReactNode }) {
  return (
    <div data-section={part} className="flex items-start">
      <h3 className="w-[80px] shrink-0 py-1.5 text-small leading-4 font-medium text-ink-3">{label}</h3>
      <div className="ml-4 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">{children}</div>
    </div>
  );
}

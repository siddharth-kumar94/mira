import { uiStore } from "../store";
import type { Picker } from "../store/ui";

const button = "rounded-control px-2 py-1 text-ink-2 hover:bg-hover";
const ACTIONS: [Picker, string][] = [
  ["status", "Status"], ["priority", "Priority"], ["assignee", "Assignee"], ["labels", "Labels"], ["project", "Feature"],
  ["cycle", "Sprint"], ["estimate", "Estimate"],
];

/** X selects in any view and brings up this bar (spec §7). */
export function BulkBar({ ids }: { ids: number[] }) {
  const ui = uiStore.getState();
  return (
    <div role="toolbar" aria-label="Bulk actions"
      className="mx-2 mt-2 flex items-center gap-1 rounded-control border border-line-2 bg-surface px-3 py-1.5 shadow-palette">
      <span className="mr-2 font-medium text-ink-1">{ids.length} selected</span>
      {ACTIONS.map(([picker, label]) => (
        <button key={picker} type="button" className={button} onClick={() => ui.openPalette(picker, ids)}>{label}…</button>
      ))}
      <button type="button" className={`${button} ml-auto text-ink-3`} onClick={() => ui.clearSelection()}>Clear</button>
    </div>
  );
}

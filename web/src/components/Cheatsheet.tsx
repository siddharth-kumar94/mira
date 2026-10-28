import { useUi } from "../store";
import { Keys } from "./ui";

const ROWS: [string, string][] = [
  ["J K", "Move down / up"], ["Space", "Peek"], ["Enter", "Open"], ["X", "Select"], ["C", "Create story"],
  ["S", "Status"], ["P", "Priority"], ["A", "Assign to…"], ["I", "Assign to me"], ["L", "Labels"],
  ["⇧ P", "Feature"], ["⇧ C", "Sprint"], ["⇧ E", "Estimate"], ["F", "Filter"], ["⌘ B", "List / board"], ["⌘ K", "Command menu"],
  ["⌘ .", "Copy ID"], ["G M", "My stories"], ["G P", "Features"], ["G N", "Capabilities"], ["?", "This list"], ["Esc", "Back / close"],
];

export function Cheatsheet() {
  const open = useUi((u) => u.cheatsheetOpen);
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Keyboard shortcuts" className="fixed bottom-14 left-3 z-40 w-80 rounded-palette border border-line-2 bg-surface p-3 shadow-palette">
      <h2 className="mb-2 font-medium text-ink-1">Keyboard shortcuts</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {ROWS.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt><span className="flex"><Keys keys={keys} /></span></dt>
            <dd className="text-ink-2">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

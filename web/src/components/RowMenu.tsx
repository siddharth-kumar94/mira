import type { Issue, IssuePatch } from "../api/types";
import { copyIssueIds, copyIssueTitles, copyIssueUrls, issueUrl } from "../palette/copy";
import { optionIcon } from "../palette/optionIcon";
import { patchesFor, peopleLookup, pickerOptions } from "../palette/pickers";
import { appStore, uiStore, useAppState, useUi } from "../store";
import type { AppState } from "../store/store";
import type { Picker } from "../store/ui";
import { Icon, type IconName } from "./icons";
import { Menu, type MenuEntry } from "./Menu";

const PROPS: [Picker, string, string, IconName][] = [
  ["status", "Status", "S", "status"], ["priority", "Priority", "P", "priority"], ["assignee", "Assignee", "A", "assign"],
  ["labels", "Labels", "L", "tag"], ["project", "Feature", "⇧ P", "project"], ["estimate", "Estimate", "⇧ E", "estimate"],
  ["cycle", "Sprint", "⇧ C", "cycles"],
];

/** §18.7: Linear's row menu, limited to what Rally backs. Property submenus are the ⌘K pickers. */
export function rowMenuEntries(app: AppState, targets: Issue[]): MenuEntry[] {
  const write = (changes: { id: number; patch: IssuePatch }[]) => void appStore.getState().updateMany(changes);
  const blocked = targets.every((t) => t.blocked);
  return [
    ...PROPS.map(([picker, label, glyphs, icon]): MenuEntry => ({
      id: picker, label, glyphs, icon: <Icon name={icon} size={16} />, filterable: true, width: 240, onQuery: peopleLookup(picker, app),
      items: pickerOptions(picker, app, targets).map((o) => ({
        id: o.id, label: picker === "labels" ? o.id.slice(2) : o.label, hint: o.hint, keys: o.keys, checked: o.current ?? false, disabled: o.disabled,
        icon: optionIcon(o), onSelect: () => write(patchesFor(o, targets)),
      })),
    })),
    "divider",
    { id: "mark", label: "Mark as", icon: <Icon name="blocked" size={16} />, items: [
      { id: "blocked", label: "Blocked", checked: blocked, onSelect: () => write(targets.map((t) => ({ id: t.id, patch: { blocked: true } }))) },
      { id: "unblocked", label: "Unblocked", checked: targets.every((t) => !t.blocked),
        onSelect: () => write(targets.map((t) => ({ id: t.id, patch: { blocked: false } }))) },
    ] },
    "divider",
    { id: "copy", label: "Copy", icon: <Icon name="copy" size={16} />, items: [
      { id: "copy-id", label: "Copy story ID", keys: "⌘ .", onSelect: () => void copyIssueIds(targets) },
      { id: "copy-url", label: "Copy story URL", onSelect: () => void copyIssueUrls(targets) },
      { id: "copy-title", label: "Copy story title", onSelect: () => void copyIssueTitles(targets) },
    ] },
    { id: "open", label: "Open in", icon: <Icon name="open" size={16} />, items: [
      { id: "open-page", label: "Open story", keys: "Enter", onSelect: () => uiStore.getState().openIssue(targets[0].key) },
      { id: "open-tab", label: "Open in new tab", onSelect: () => void window.open(issueUrl(targets[0].key), "_blank", "noopener") },
    ] },
  ];
}

export function RowMenu() {
  const menu = useUi((u) => u.contextMenu);
  const app = useAppState();
  if (!menu) return null;
  const targets = menu.ids.map((id) => app.issues[id]).filter((i): i is Issue => Boolean(i));
  const close = () => uiStore.getState().closeContextMenu();
  if (!targets.length) return null;
  return (
    <div className="fixed inset-0 z-40" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 420) }}>
        <Menu label="Story actions" width={179} entries={rowMenuEntries(app, targets)} onClose={close} />
      </div>
    </div>
  );
}

import { copyIssueIds } from "../palette/copy";
import { appStore, uiStore } from "../store";
import type { Picker, UiState } from "../store/ui";
import type { Action } from "./shortcuts";

const PICKERS: Partial<Record<Action, Picker>> = {
  "pick-status": "status", "pick-priority": "priority", "pick-assignee": "assignee", "pick-labels": "labels",
  "pick-project": "project", "pick-cycle": "cycle", "pick-estimate": "estimate",
};

/** What a command acts on: the multi-selection, else the open page, the peeked issue, or the selected row. */
function targets(ui: UiState): number[] {
  if (ui.selectedIds.length) return ui.selectedIds;
  const route = ui.route;
  const page = route.name === "issue" ? Object.values(appStore.getState().issues).find((i) => i.key === route.key)?.id ?? null : null;
  const one = page ?? ui.peekId ?? ui.selectedId;
  return one === null ? [] : [one];
}

function move(ui: UiState, delta: number): void {
  const ids = ui.visibleIds;
  if (!ids.length) return;
  if (ui.route.name === "issue") { // §18.10: J/K step through the view the page was opened from
    const key = ui.route.key;
    const app = appStore.getState();
    const current = Object.values(app.issues).find((i) => i.key === key)?.id;
    const at = current === undefined ? -1 : ids.indexOf(current);
    const next = at < 0 ? undefined : ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
    if (next !== undefined && next !== current && app.issues[next]) {
      ui.select(next);
      ui.openIssue(app.issues[next].key, { replace: true });
    }
    return;
  }
  const at = ui.selectedId === null ? -1 : ids.indexOf(ui.selectedId);
  const next = at < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, at + delta));
  ui.select(ids[next]);
  if (ui.peekId !== null) ui.openPeek(ids[next]); // the side panel follows the selection
}

export function runAction(action: Action): void {
  const ui = uiStore.getState();
  if (action === "palette") {
    if (ui.palette.open) ui.closePalette();
    else ui.openPalette(null, targets(ui));
    return;
  }
  if (ui.palette.open || ui.composerOpen) return; // dialogs own the keyboard
  switch (action) {
    case "escape": return ui.closeTopOverlay();
    case "toggle-layout": return ui.flipLayout();
    case "cheatsheet": return ui.setCheatsheet(!ui.cheatsheetOpen);
    case "create": return ui.setComposer(true);
    case "filter": return ui.setMenu(ui.menu === "filter" ? null : "filter");
    case "go-my-issues": return ui.navigate({ name: "my", tab: "assigned" });
    case "go-projects": return ui.navigate({ name: "projects" });
    case "go-initiatives": return ui.navigate({ name: "initiatives" });
    case "down": return move(ui, 1);
    case "up": return move(ui, -1);
    case "toggle-select":
      if (ui.selectedId !== null) ui.toggleSelected(ui.selectedId);
      return;
  }
  const ids = targets(ui);
  if (!ids.length) return;
  const app = appStore.getState();
  if (action === "open-peek") return ui.openPeek(ui.peekId === ids[0] ? null : ids[0]);
  if (action === "open-page") {
    const key = app.issues[ids[0]]?.key;
    if (key) ui.openIssue(key);
    return;
  }
  if (action === "copy-id") {
    void copyIssueIds(ids.map((id) => app.issues[id]).filter(Boolean));
    return;
  }
  if (action === "assign-me") {
    const me = app.meta?.me.id;
    if (me === undefined) return;
    const mine = ids.every((id) => app.issues[id]?.assignee?.id === me);
    void app.updateIssues(ids, { assignee_id: mine ? null : me });
    return;
  }
  const picker = PICKERS[action];
  if (picker) ui.openPalette(picker, ids);
}

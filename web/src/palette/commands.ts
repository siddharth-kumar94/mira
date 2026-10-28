import type { Issue, Team } from "../api/types";
import type { IconName } from "../components/icons";
import { appStore, uiStore } from "../store";
import type { Picker } from "../store/ui";
import { copyIssueIds, copyIssueTitles, copyIssueUrls } from "./copy";

export interface Command { id: string; group: string | null; label: string; icon?: IconName; shortcut?: string; run(): void }

const PICK: Record<Picker, [string, string, IconName]> = {
  assignee: ["Assign to…", "A", "assign"], status: ["Change status…", "S", "status"], priority: ["Change priority…", "P", "priority"],
  project: ["Move to feature…", "⇧ P", "project"], labels: ["Add labels…", "L", "tag"], estimate: ["Change estimate…", "⇧ E", "estimate"],
  cycle: ["Move to sprint…", "⇧ C", "cycles"],
};

/** §18.9: Linear's contextual commands (no heading), then navigation, then Mira's own. */
export function buildCommands({ targets, teams }: { targets: Issue[]; teams: Team[] }): Command[] {
  const ui = uiStore.getState();
  const app = appStore.getState();
  const ids = targets.map((t) => t.id);
  const then = (fn: () => void) => () => {
    fn();
    uiStore.getState().closePalette();
  };
  const pick = (picker: Picker): Command => {
    const [label, shortcut, icon] = PICK[picker];
    return { id: `pick-${picker}`, group: null, label, shortcut, icon, run: () => ui.openPalette(picker, ids) };
  };
  const out: Command[] = [];
  if (targets.length) {
    const me = app.meta?.me.id;
    const mine = me !== undefined && targets.every((t) => t.assignee?.id === me);
    const blocked = targets.every((t) => t.blocked);
    out.push(
      pick("assignee"),
      { id: "assign-me", group: null, label: mine ? "Un-assign from me" : "Assign to me", shortcut: "I", icon: mine ? "unassign" : "assign",
        run: then(() => { if (me !== undefined) void app.updateIssues(ids, { assignee_id: mine ? null : me }); }) },
      pick("status"), pick("priority"), pick("project"), pick("labels"), pick("estimate"), pick("cycle"),
      { id: "toggle-blocked", group: null, label: blocked ? "Mark as unblocked" : "Mark as blocked", icon: "blocked",
        run: then(() => void app.updateIssues(ids, { blocked: !blocked })) },
      { id: "copy-id", group: null, label: "Copy story ID", shortcut: "⌘ .", icon: "copy", run: then(() => void copyIssueIds(targets)) },
      { id: "copy-url", group: null, label: "Copy story URL", icon: "link", run: then(() => void copyIssueUrls(targets)) },
      { id: "copy-title", group: null, label: "Copy story title", icon: "copy", run: then(() => void copyIssueTitles(targets)) },
    );
    if (targets.length === 1) out.push({ id: "open", group: null, label: "Open story", shortcut: "Enter", icon: "open", run: then(() => ui.openIssue(targets[0].key)) });
  }
  out.push(
    { id: "go-my", group: "Navigation", label: "Go to My stories", shortcut: "G M", icon: "myIssues", run: then(() => ui.navigate({ name: "my", tab: "assigned" })) },
    { id: "go-projects", group: "Navigation", label: "Go to Features", shortcut: "G P", icon: "project", run: then(() => ui.navigate({ name: "projects" })) },
    { id: "go-initiatives", group: "Navigation", label: "Go to Capabilities", shortcut: "G N", icon: "initiatives", run: then(() => ui.navigate({ name: "initiatives" })) },
    ...teams.map((t): Command => ({ id: `go-team-${t.id}`, group: "Navigation", label: `Go to team ${t.name}`, icon: "team",
                                   run: then(() => ui.navigate({ name: "team", teamId: t.id, tab: "active" })) })),
    { id: "create", group: "Mira", label: "Create story", shortcut: "C", icon: "compose", run: then(() => ui.openComposer(null)) },
    { id: "theme", group: "Mira", label: "Toggle theme", icon: "theme", run: then(() => ui.toggleTheme()) },
    { id: "shortcuts", group: "Mira", label: "Keyboard shortcuts", shortcut: "?", icon: "help", run: then(() => ui.setCheatsheet(true)) },
  );
  return out;
}

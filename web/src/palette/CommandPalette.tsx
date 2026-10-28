import { Command } from "cmdk";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Issue, Project, SearchResult, Team } from "../api/types";
import { Icon, ProjectIcon } from "../components/icons";
import { StatusIcon } from "../components/StatusIcon";
import { Keys, Tile } from "../components/ui";
import { appStore, uiStore, useAppState, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";
import { buildCommands } from "./commands";
import { optionIcon } from "./optionIcon";
import { PICKER_PLACEHOLDER, patchesFor, pickerOptions, type PickerOption } from "./pickers";
import { searchIssues } from "./search";

const itemClass = "flex h-(--size-palette-item) cursor-default items-center gap-3 rounded-control pl-3 pr-2.5 text-small text-ink-2 data-[selected=true]:bg-highlight data-[selected=true]:text-ink-1 data-[disabled=true]:opacity-50 [&[data-selected=true]_.icon]:text-ink-1";
const groupClass = "[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-[30px] [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:text-mini [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3";
const NO_RESULTS: SearchResult = { issues: [], teams: [], projects: [] };

/** §18.9: Linear's command menu. No dimming, a context chip, icons and one keycap per key, number-keyed pickers. */
export function CommandPalette() {
  const palette = useUi((u) => u.palette);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const app = useAppState();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SearchResult>(NO_RESULTS);
  const [labels, setLabels] = useState<string[]>([]);
  const targets = palette.targetIds.map((id) => app.issues[id]).filter((i): i is Issue => Boolean(i));
  const local = useMemo(() => searchIssues(app.issues, query), [app.issues, query]);
  const teams = useMemo(() => sidebarTeamIds(app.yourTeamIds, joined, hidden).map((id) => app.teams[id]).filter(Boolean),
    [app.yourTeamIds, app.teams, joined, hidden]);

  useEffect(() => {
    setQuery("");
    setRemote(NO_RESULTS);
    setLabels([]);
  }, [palette.open, palette.picker]);
  useEffect(() => { // Rally lookups the cache can't answer: issues, teams and projects, workspace people (D16), labels
    const text = query.trim();
    const s = appStore.getState();
    let job: (() => void) | null = null;
    if (palette.picker === "assignee" && text.length >= 2) job = () => void s.searchUsers(text);
    else if (palette.picker === "labels" && text) job = () => void s.searchLabels(text).then(setLabels);
    else if (!palette.picker && text.length >= 2) job = () => void s.searchRemote(text).then(setRemote);
    if (!job) return;
    const timer = setTimeout(job, 300);
    return () => clearTimeout(timer);
  }, [query, palette.picker]);

  if (!palette.open) return null; // follow-up: no re-render work while closed
  const ui = uiStore.getState();
  const close = () => ui.closePalette();
  const q = query.trim().toLowerCase();
  const options = palette.picker ? pickerOptions(palette.picker, app, targets, labels).filter((o) => o.label.toLowerCase().includes(q)) : [];
  const choose = (o: PickerOption) => {
    if (o.disabled) return;
    void appStore.getState().updateMany(patchesFor(o, targets));
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => { // §18.9: a number picks while the query is empty
    if (!palette.picker || query || !/^\d$/.test(e.key)) return;
    const o = options.find((x) => x.keys === e.key);
    if (o) {
      e.preventDefault();
      choose(o);
    }
  };

  let body;
  if (palette.picker) {
    body = options.map((o) => (
      <Command.Item key={o.id} value={o.id} aria-label={o.label} disabled={o.disabled} className={itemClass} onSelect={() => choose(o)}>
        <span aria-hidden className="icon flex w-4 justify-center text-ink-3">{optionIcon(o)}</span>
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {o.hint && <span className="text-mini text-ink-4">{o.hint}</span>}
        {o.current && <span data-check className="-mr-1"><Icon name="check" size={16} className="text-ink-1" /></span>}
        <Keys keys={o.keys} />
      </Command.Item>
    ));
  } else {
    const commands = buildCommands({ targets, teams }).filter((c) => c.label.toLowerCase().includes(q));
    const groups = [...new Set(commands.map((c) => c.group))];
    const issues = [...local, ...remote.issues.filter((r) => !local.some((l) => l.id === r.id))];
    const projects = q.length >= 2
      ? [...new Map([...Object.values(app.projects).filter((p) => p.name.toLowerCase().includes(q)), ...remote.projects].map((p) => [p.id, p])).values()].slice(0, 5)
      : [];
    const otherTeams = q.length >= 2 ? remote.teams.filter((t) => !teams.some((x) => x.id === t.id)) : [];
    const go = (fn: () => void) => () => { close(); fn(); };
    body = (
      <>
        {groups.map((g) => (
          <Command.Group key={g ?? "context"} heading={q ? undefined : g ?? undefined} className={groupClass}>
            {commands.filter((c) => c.group === g).map((c) => (
              <Command.Item key={c.id} value={c.id} aria-label={c.label} className={itemClass} onSelect={c.run}>
                <span aria-hidden className="icon flex w-4 justify-center text-ink-3">{c.icon && <Icon name={c.icon} size={16} />}</span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <Keys keys={c.shortcut} />
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        {q && (projects.length > 0 || otherTeams.length > 0 || issues.length > 0) && (
          <Command.Group heading={`Quick results for "${query.trim()}"`} className={groupClass}>
            {projects.map((p: Project) => (
              <Command.Item key={`p${p.id}`} value={`project-${p.id}`} className={itemClass} onSelect={go(() => ui.navigate({ name: "projects" }))}>
                <ProjectIcon project={p} size={16} /><span className="text-ink-3">Feature</span><span className="text-ink-3">›</span><span className="truncate">{p.name}</span>
              </Command.Item>
            ))}
            {otherTeams.map((t: Team) => (
              <Command.Item key={`t${t.id}`} value={`team-${t.id}`} className={itemClass} onSelect={go(() => ui.navigate({ name: "team", teamId: t.id, tab: "active" }))}>
                <Tile id={t.id} name={t.name} size={16} /><span className="text-ink-3">Team</span><span className="text-ink-3">›</span><span className="truncate">{t.name}</span>
              </Command.Item>
            ))}
            {issues.map((issue) => (
              <Command.Item key={issue.id} value={`issue-${issue.id}`} className={itemClass} onSelect={go(() => ui.openIssue(issue.key))}>
                <StatusIcon status={issue.status} /><span className="shrink-0 text-ink-3">{issue.key}</span><span className="truncate">{issue.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </>
    );
  }

  const chip = targets.length === 1 ? targets[0] : null;
  return (
    <Command.Dialog open={palette.open} onOpenChange={(open) => !open && close()} label="Command menu" shouldFilter={false} onKeyDown={onKeyDown}
      overlayClassName="fixed inset-0 z-40"
      contentClassName="fixed left-1/2 top-[130px] z-50 w-(--size-palette) -translate-x-1/2 overflow-hidden rounded-palette border-[0.5px] border-line-menu bg-surface shadow-palette">
      {targets.length > 0 && (
        <div className="px-3.5 pb-1.5 pt-3">
          <span data-context-chip className="inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-[10px] bg-highlight px-1.5 text-mini text-ink-2">
            {chip ? <><span className="font-medium">{chip.key}</span><span className="truncate">{" "}⋅ {chip.title}</span></> : `${targets.length} stories`}
            <button type="button" aria-label="Clear context" onClick={() => ui.setPaletteTargets([])} className="text-[11px] font-medium text-ink-3">⌫</button>
          </span>
        </div>
      )}
      <Command.Input value={query} onValueChange={setQuery}
        placeholder={palette.picker ? PICKER_PLACEHOLDER[palette.picker] : "Type a command or search…"}
        className="mx-1.5 h-(--size-palette-input) w-[calc(100%-12px)] bg-transparent px-3 text-small [font-weight:400] text-ink-2 placeholder:text-ink-4" />
      <Command.List className="max-h-[420px] overflow-y-auto border-t-[0.5px] border-line-menu px-1.5 pb-1 pt-1.5">
        <Command.Empty className="px-3 py-6 text-center text-ink-3">No results</Command.Empty>
        {body}
      </Command.List>
    </Command.Dialog>
  );
}

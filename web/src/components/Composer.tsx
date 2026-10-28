import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PRIORITY_LABEL, STATUS_LABEL, type Issue, type IssuePatch, type Priority, type Project, type Status } from "../api/types";
import { textToHtml } from "../editor/plain";
import { optionIcon } from "../palette/optionIcon";
import { peopleLookup, pickerOptions } from "../palette/pickers";
import { appStore, uiStore, useAppState, useUi } from "../store";
import type { AppState } from "../store/store";
import type { Picker } from "../store/ui";
import { sidebarTeamIds } from "../store/ui";
import { cycleKey } from "../views/model";
import { Avatar } from "./Avatar";
import { points } from "./format";
import { CycleIcon, Icon, ProjectIcon } from "./icons";
import { MenuButton, type MenuEntry } from "./Menu";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";
import { IconButton, Switch, Tile } from "./ui";

const LAST = (team: number) => `mira-last-project:${team}`;

export function lastProject(team: number): number | null {
  try {
    const v = Number(localStorage.getItem(LAST(team)));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function rememberProject(team: number, project: number): void {
  try {
    localStorage.setItem(LAST(team), String(project));
  } catch {
    /* storage blocked: no default next time */
  }
}

/** A story always needs a project (D15). In demo mode only [DEMO] projects can take new issues. */
export function assignableProjects(app: Pick<AppState, "projects" | "meta">, teamId: number | null): Project[] {
  if (teamId === null) return [];
  const prefix = app.meta?.writeGuard === "demo" ? app.meta.demoPrefix : null;
  return Object.values(app.projects)
    .filter((p) => p.team_id === teamId && p.status_category !== "completed" && (prefix === null || p.name.startsWith(prefix)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface Draft { status: Status; priority: Priority; assignee_id: number | null; project_id: number | null; estimate: number | null; cycle_id: number | null; labels: string[] }

/** §18.11 chips: label, picker width and placeholder (inventory §11). */
const CHIPS: [Picker, string, number, string][] = [
  ["status", "Change status", 207, "Change status…"], ["priority", "Change priority", 207, "Set priority to…"],
  ["assignee", "Change assignee", 207, "Assign to…"], ["project", "Change feature", 270, "Add to feature…"],
  ["estimate", "Change estimate", 228, "Set estimate to…"], ["labels", "Change labels", 207, "Add labels…"],
  ["cycle", "Add to sprint", 278, "Add to sprint…"],
];

/** A stand-in issue so the composer reuses the ⌘K pickers: each option's patch is applied to the draft. */
function draftIssue(teamId: number, d: Draft, app: AppState): Issue {
  const me = app.meta?.me ?? null;
  return {
    id: -1, key: "NEW", kind: "story", title: "", status: d.status, priority: d.priority, team_id: teamId,
    assignee: d.assignee_id === null ? null : app.users[d.assignee_id] ?? (me && me.id === d.assignee_id ? me : { id: d.assignee_id, name: "" }),
    creator: me, cycle_id: d.cycle_id, project_id: d.project_id, estimate: d.estimate, labels: d.labels, blocked: false, blocked_reason: "",
    description: "", rank: "", created_at: "", updated_at: "", completed_at: null, sub_issue_count: 0,
  };
}

function chipFace(picker: Picker, d: Draft, app: AppState, project: Project | undefined): { icon: ReactNode; text: string | null } {
  switch (picker) {
    case "status": return { icon: <StatusIcon status={d.status} />, text: STATUS_LABEL[d.status] };
    case "priority": return { icon: <PriorityIcon priority={d.priority} size={14} />, text: d.priority ? PRIORITY_LABEL[d.priority] : null };
    case "assignee": {
      const u = d.assignee_id === null ? null : app.users[d.assignee_id] ?? (app.meta?.me.id === d.assignee_id ? app.meta.me : { id: d.assignee_id, name: "Assignee" });
      return { icon: <Avatar user={u} size={14} />, text: u?.name ?? null };
    }
    case "project": return { icon: <ProjectIcon project={project} />, text: project?.name ?? null };
    case "estimate": return { icon: <Icon name="estimate" size={14} />, text: d.estimate === null ? null : points(d.estimate) };
    case "labels": return { icon: <Icon name="tag" size={14} />, text: d.labels.length ? d.labels.join(", ") : null };
    case "cycle": {
      const c = d.cycle_id === null ? undefined : app.cycles[d.cycle_id];
      return { icon: c ? <CycleIcon cycle={c} /> : <Icon name="cycles" size={14} />, text: c?.short_name ?? null };
    }
  }
}

const UNSET: Record<Picker, string> = { status: "Status", priority: "Priority", assignee: "Assignee", project: "Feature", estimate: "Estimate", labels: "Labels", cycle: "" };

/** The title opens holding "[DEMO] " in demo mode: put the caret after it, or typing lands in front of the prefix. */
const caretAtEnd = (el: HTMLTextAreaElement | null) => el?.setSelectionRange(el.value.length, el.value.length);

export function Composer() {
  const open = useUi((u) => u.composerOpen);
  const prefill = useUi((u) => u.composerPrefill);
  const route = useUi((u) => u.route);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const app = useAppState();
  const meta = app.meta;
  const prefix = meta?.writeGuard === "demo" ? meta.demoPrefix : "";
  const teamIds = useMemo(() => sidebarTeamIds(app.yourTeamIds, joined, hidden), [app.yourTeamIds, joined, hidden]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [title, setTitle] = useState(prefix);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Draft>({ status: "backlog", priority: 0, assignee_id: null, project_id: null, estimate: null, cycle_id: null, labels: [] });
  const [chose, setChose] = useState(false); // the person picked a project themselves
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const here = route.name === "team" ? route.teamId : null;
    setTeamId(prefill?.teamId ?? here ?? (meta?.writeGuard === "demo" ? meta.demoTeamId : null) ?? teamIds[0] ?? null);
    setTitle(prefix);
    setDescription("");
    setChose(prefill?.project_id !== undefined);
    setDraft({
      status: prefill?.status ?? (route.name === "team" && route.tab === "active" ? "todo" : "backlog"), // Todo inside Active (§8)
      priority: prefill?.priority ?? 0,
      assignee_id: prefill && "assignee_id" in prefill ? prefill.assignee_id ?? null : route.name === "my" ? meta?.me.id ?? null : null,
      project_id: prefill?.project_id ?? null, estimate: null, cycle_id: prefill?.cycle_id ?? null,
      labels: meta?.writeGuard === "demo" ? [meta.demoTag] : [],
    });
  }, [open]); // reset each time the composer opens

  useEffect(() => { // the team's projects arrive with its load
    if (open && teamId !== null && !appStore.getState().teamState[teamId]) void appStore.getState().loadTeam(teamId);
  }, [open, teamId]);

  const projects = useMemo(() => assignableProjects(app, teamId), [app.projects, app.meta, teamId]);
  const projectIds = projects.map((p) => p.id).join(",");
  useEffect(() => { // default to the last project used for this team, until the person picks one
    if (!open || teamId === null) return;
    const last = lastProject(teamId);
    setDraft((d) => ({ ...d, project_id: chose && projects.some((p) => p.id === d.project_id) ? d.project_id
      : projects.some((p) => p.id === last) ? last : projects[0]?.id ?? null }));
  }, [open, teamId, projectIds, chose]);

  const close = () => uiStore.getState().setComposer(false);
  const canSubmit = teamId !== null && draft.project_id !== null && title.trim().length > prefix.trim().length && title.startsWith(prefix) && !busy;
  const submit = async () => {
    if (!canSubmit || teamId === null || draft.project_id === null) return;
    setBusy(true);
    const created = await appStore.getState().createIssue({
      team_id: teamId, title: title.trim(), project_id: draft.project_id, status: draft.status, priority: draft.priority,
      assignee_id: draft.assignee_id, estimate: draft.estimate, cycle_id: draft.cycle_id, labels: draft.labels,
      description: description.trim() ? textToHtml(description) : undefined, position: draft.status === "backlog" ? "bottom" : "top",
    });
    setBusy(false);
    if (!created) return;
    rememberProject(teamId, draft.project_id);
    uiStore.getState().select(created.id);
    if (more) { setTitle(prefix); setDescription(""); }
    else close();
  };

  const team = teamId !== null ? app.teams[teamId] : undefined;
  const teamName = team?.name ?? "Team";
  const loaded = teamId !== null && app.teamState[teamId]?.status === "ready";
  const draftAsIssue = teamId === null ? null : draftIssue(teamId, draft, app);
  const apply = (patch: IssuePatch | null) => {
    if (!patch) return;
    if ("project_id" in patch) setChose(true);
    setDraft((d) => ({ ...d, ...(patch as Partial<Draft>) }));
  };
  const teamEntries: MenuEntry[] = teamIds.map((id) => ({
    id: `t${id}`, label: app.teams[id]?.name ?? `Team ${id}`, checked: id === teamId,
    icon: <Tile id={id} name={app.teams[id]?.name ?? "Team"} size={14} />,
    // From an ART's cycle page, another team takes its own copy of that cycle, if it has one.
    onSelect: () => {
      const twin = prefill?.cycleKey ? Object.values(app.cycles).find((c) => c.team_id === id && cycleKey(c) === prefill.cycleKey) : undefined;
      setTeamId(id); setChose(false); setDraft((d) => ({ ...d, project_id: null, cycle_id: twin?.id ?? null }));
    },
  }));

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/[0.24]" />
        <Dialog.Content aria-describedby={undefined} aria-label="Create story"
          onEscapeKeyDown={(e) => { if (e.target instanceof Element && e.target.closest('[role="menu"]')) e.preventDefault(); }} // Esc closes an open picker first, not the dialog
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
          className="fixed left-1/2 top-[130px] z-50 w-(--size-composer) -translate-x-1/2 rounded-(--radius-composer) border-[0.5px] border-line-menu bg-surface shadow-palette">
          <Dialog.Title className="sr-only">Create story</Dialog.Title>
          <div className="flex items-center gap-1.5 px-4 pt-3">
            <MenuButton label="Set team…" shadow="menu" width={217} placeholder="Set team…" entries={teamEntries}
              button={({ open: o, toggle }) => (
                <button type="button" aria-label="Set team" aria-expanded={o} onClick={toggle}
                  className="inline-flex h-6 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu bg-surface px-2 text-mini text-ink-1">
                  {teamId !== null && <Tile id={teamId} name={teamName} size={14} />}{teamName}
                </button>
              )} />
            <span aria-hidden className="text-ink-3">›</span>
            <span className="text-small text-ink-2">New story</span>
            <IconButton className="ml-auto" bordered={false} label="Close" icon="close" onClick={close} />
          </div>
          <textarea aria-label="Story title" ref={caretAtEnd} autoFocus rows={1} value={title} placeholder="Story title" onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            className="mt-[17px] block w-full resize-none bg-transparent px-4 text-[18px] font-semibold leading-[28.8px] text-ink-1 placeholder:text-ink-4" />
          <textarea aria-label="Story description" rows={3} value={description} placeholder="Add description…" onChange={(e) => setDescription(e.target.value)}
            className="mt-px block min-h-[76px] w-full resize-none bg-transparent px-4 text-regular font-normal leading-[22.5px] text-ink-2 placeholder:text-ink-4" />
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-1.5">
            {draftAsIssue && CHIPS.map(([picker, label, width, placeholder]) => {
              const face = chipFace(picker, draft, app, draft.project_id === null ? undefined : app.projects[draft.project_id]);
              const entries: MenuEntry[] = pickerOptions(picker, app, [draftAsIssue]).map((o) => ({
                id: o.id, label: picker === "labels" ? o.id.slice(2) : o.label, hint: o.hint, keys: o.keys, checked: o.current ?? false, disabled: o.disabled,
                icon: optionIcon(o), onSelect: () => apply(o.apply(draftAsIssue)),
              }));
              const unsetNote = face.text === null ? `. No ${UNSET[picker].toLowerCase() || "sprint"} is selected` : "";
              return (
                <MenuButton key={picker} shadow="menu" label={placeholder} width={width} placeholder={placeholder} entries={entries}
                  onQuery={peopleLookup(picker, app)}
                  button={({ open: o, toggle }) => (
                    <button type="button" aria-label={`${label}${unsetNote}`} aria-expanded={o} onClick={toggle}
                      className={`inline-flex h-6 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu bg-surface text-mini font-normal ${picker === "cycle" && face.text === null ? "w-8 justify-center" : "px-2"} ${face.text === null ? "text-ink-3" : "text-ink-2"}`}>
                      {face.icon}{face.text === null ? UNSET[picker] || null : <span className="max-w-[140px] truncate">{face.text}</span>}
                    </button>
                  )} />
              );
            })}
          </div>
          {loaded && projects.length === 0 && (
            <p className="px-4 pt-3 text-mini text-blocked">This team has no {prefix ? "[DEMO] " : "open "}features to add stories to.</p>
          )}
          <div className="flex items-center justify-end gap-3 px-4 pb-3 pt-6">
            <label className="flex items-center gap-2 text-mini font-normal text-ink-3">
              <Switch label="Create more" checked={more} onChange={setMore} />Create more
            </label>
            <button type="button" disabled={!canSubmit} onClick={() => void submit()}
              className="h-7 w-[93px] rounded-full bg-accent text-mini font-medium text-accent-ink disabled:opacity-50">Create story</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

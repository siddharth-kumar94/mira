import { useEffect, useState } from "react";
import { MenuButton } from "../components/Menu";
import { IconButton, Tile } from "../components/ui";
import { Empty } from "../components/ViewFrame";
import { copyIssueIds, copyIssueTitles, copyIssueUrls } from "../palette/copy";
import { appStore, uiStore, useApp, useUi } from "../store";
import { Activity } from "./Activity";
import { IssueDetail } from "./IssueDetail";

/** /issue/:key. Opens from the cache, or loads by key; an unknown key says so (review focus 2). */
export function IssuePage({ issueKey }: { issueKey: string }) {
  const id = useApp((s) => Object.values(s.issues).find((i) => i.key === issueKey)?.id ?? null);
  const issue = useApp((s) => (id === null ? undefined : s.issues[id]));
  const team = useApp((s) => (issue ? s.teams[issue.team_id] : undefined));
  const back = useUi((u) => u.backRoute);
  const [missing, setMissing] = useState<"not-found" | "error" | null>(null);
  const known = id !== null;
  useEffect(() => {
    setMissing(null);
    if (known) return;
    let live = true;
    void appStore.getState().loadIssueDetail(issueKey).then((r) => {
      if (live && typeof r !== "number") setMissing(r);
    });
    return () => {
      live = false;
    };
  }, [issueKey, known]);
  const visible = useUi((u) => u.visibleIds);
  const teams = useApp((s) => s.teams);
  const index = id === null ? -1 : visible.indexOf(id);
  const fromView = index >= 0 && (back.name === "my" || back.name === "team");
  const TAB: Record<string, string> = { assigned: "Assigned", created: "Created", active: "Active", backlog: "Backlog", all: "All stories" };
  const origin = back.name === "my" ? "My stories" : back.name === "team" ? `${teams[back.teamId]?.name ?? "Team"} › ${TAB[back.tab] ?? back.tab}` : null;
  const step = (delta: number) => () => {
    const next = visible[index + delta];
    const nextKey = next === undefined ? undefined : appStore.getState().issues[next]?.key;
    if (nextKey) { uiStore.getState().select(next); uiStore.getState().openIssue(nextKey, { replace: true }); }
  };
  const one = issue ? [issue] : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-(--size-header) shrink-0 items-center gap-2 px-[18px] font-medium">
        {fromView && origin
          ? <button type="button" onClick={() => uiStore.getState().navigate(back)} className="rounded-control text-ink-2 hover:text-ink-1">{origin}</button>
          : team && <span className="flex items-center gap-1.5 text-ink-2"><Tile id={team.id} name={team.name} size={16} />{team.name}</span>}
        <span aria-hidden className="text-ink-4">›</span>
        <span className="min-w-0 truncate text-ink-1">{issueKey}{issue && <span className="ml-2">{issue.title}</span>}</span>
        {issue && (
          <MenuButton label="Story options" width={200}
            entries={[
              { id: "copy-id", label: "Copy story ID", keys: "⌘ .", onSelect: () => void copyIssueIds(one) },
              { id: "copy-url", label: "Copy story URL", onSelect: () => void copyIssueUrls(one) },
              { id: "copy-title", label: "Copy story title", onSelect: () => void copyIssueTitles(one) },
              "divider",
              { id: "blocked", label: issue.blocked ? "Mark as unblocked" : "Mark as blocked",
                onSelect: () => void appStore.getState().updateIssue(issue.id, { blocked: !issue.blocked }) },
            ]}
            button={({ open, toggle }) => <IconButton size={24} label="Story options" icon="more" aria-expanded={open} onClick={toggle} />} />
        )}
        {fromView && (
          <span className="ml-auto flex items-center gap-1 font-normal text-ink-4">
            {index + 1} / {visible.length}
            <IconButton size={24} label="Navigate down" icon="arrowDown" disabled={index >= visible.length - 1} onClick={step(1)} />
            <IconButton size={24} label="Navigate up" icon="arrowUp" disabled={index <= 0} onClick={step(-1)} />
          </span>
        )}
      </header>
      {issue && (
        <div className="flex h-11 shrink-0 items-center justify-end gap-1.5 px-2">
          <IconButton label="Copy story URL" icon="link" onClick={() => void copyIssueUrls(one)} />
          <IconButton label="Copy story ID" icon="copy" onClick={() => void copyIssueIds(one)} />
        </div>
      )}
      {missing === "not-found" ? <Empty>Story {issueKey} not found.</Empty>
        : missing === "error" ? <Empty>Couldn't load {issueKey}.</Empty>
        : id === null ? <Empty>Loading {issueKey}…</Empty>
        : <IssueDetail key={id} id={id}><Activity issueId={id} /></IssueDetail>}
    </div>
  );
}

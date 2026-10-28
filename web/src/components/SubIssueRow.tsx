import type { SubIssue } from "../api/types";
import { appStore, uiStore, useApp } from "../store";
import { Avatar } from "./Avatar";

export function SubIssueRow({ sub, showParent = false }: { sub: SubIssue; showParent?: boolean }) {
  const parent = useApp((s) => s.issues[sub.issue_id]);
  const done = sub.status === "done";
  return (
    <div data-sub-issue-id={sub.id} className="flex h-(--size-row) items-center gap-2.5 rounded-control pl-2 pr-4 hover:bg-hover">
      <span className="flex w-6 shrink-0 justify-center">
        <input type="checkbox" aria-label={`Complete ${sub.key}`} checked={done}
          onChange={() => void appStore.getState().updateSubIssue(sub.id, { status: done ? "todo" : "done" })} />
      </span>
      <span className="w-(--id-width) shrink-0 text-ink-3">{sub.key}</span>
      <span className={`min-w-0 flex-1 truncate ${done ? "text-ink-4 line-through" : "text-ink-1"}`}>{sub.title}</span>
      {showParent && parent && (
        <button type="button" onClick={() => uiStore.getState().openIssue(parent.key)} className="text-mini text-ink-3 hover:text-ink-1">
          {parent.key}
        </button>
      )}
      {sub.hours !== null && <span className="w-10 text-right text-mini text-ink-3">{sub.hours}h</span>}
      <Avatar user={sub.assignee} />
    </div>
  );
}

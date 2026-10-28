import { useState } from "react";
import type { Issue, SubIssue } from "../api/types";
import { Icon } from "../components/icons";
import { SubIssueRow } from "../components/SubIssueRow";
import { appStore, useAppState } from "../store";

/** §18.10: the sub-issue list with its done count, then "+ Add sub-issues" opening an inline title row. */
export function SubIssueList({ issue, subs }: { issue: Issue; subs: SubIssue[] }) {
  const [adding, setAdding] = useState(false);
  const meta = useAppState().meta;
  const prefix = meta?.writeGuard === "demo" ? meta.demoPrefix : "";
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const done = subs.filter((t) => t.status === "done").length;
  const create = async () => {
    const text = title.trim();
    if (!text || text === prefix.trim() || busy) return;
    setBusy(true);
    const sub = await appStore.getState().createSubIssue(issue.id, text);
    setBusy(false);
    if (sub) setTitle(prefix);
  };
  return (
    <section aria-label="Tasks" className="mt-6" style={{ "--id-width": "8.5ch" } as React.CSSProperties}>
      {subs.length > 0 && (
        <>
          <h3 className="mb-1 flex items-center gap-2 font-medium text-ink-2">Tasks <span className="font-normal text-ink-3">{done}/{subs.length}</span></h3>
          {subs.map((t) => <SubIssueRow key={t.id} sub={t} />)}
        </>
      )}
      {adding ? (
        <input autoFocus aria-label="Task title" placeholder="Task title" value={title} readOnly={busy}
          onChange={(e) => setTitle(e.target.value)} onBlur={() => (!title.trim() || title.trim() === prefix.trim()) && setAdding(false)}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void create(); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setTitle(prefix); setAdding(false); }
          }}
          className="mt-2 h-9 w-full rounded-control border-[0.5px] border-line-menu bg-surface px-3 text-ink-1 placeholder:text-ink-4" />
      ) : (
        <button type="button" onClick={() => { setTitle((t) => t || prefix); setAdding(true); }}
          className="mt-3 inline-flex h-6 items-center gap-2 rounded-full px-1.5 text-mini font-medium text-ink-3 hover:bg-hover hover:text-ink-1">
          <Icon name="plus" size={16} />Add tasks
        </button>
      )}
    </section>
  );
}

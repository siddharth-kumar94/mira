import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ago, longDate } from "../components/format";
import { IconButton } from "../components/ui";
import { textToHtml } from "../editor/plain";
import { sanitize } from "../editor/sanitize";
import { appStore, useApp } from "../store";
import { issueKey } from "../store/store";

const EMPTY = { comments: [], activity: [] };

function Time({ iso }: { iso: string }) {
  return <time dateTime={iso} title={longDate(iso)}>{ago(iso)}</time>;
}

/** §18.10: the comment box is a card; ⌘↵ or ↑ sends; a refused post puts the text back (plan ruling 8). */
function CommentBox({ issueId }: { issueId: number }) {
  const [text, setText] = useState("");
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    const ok = await appStore.getState().postComment(issueId, textToHtml(body));
    if (!ok) setText((current) => (current ? `${body}\n${current}` : body));
  };
  return (
    <form aria-label="Comment" onSubmit={(e) => { e.preventDefault(); void send(); }}
      className="-mx-2 mt-4 rounded-control border-[0.5px] border-line-menu bg-surface px-4 py-3 shadow-comment">
      <textarea aria-label="Leave a comment" placeholder="Leave a comment…" rows={1} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
        className="block max-h-60 min-h-6 w-full resize-none [field-sizing:content] bg-transparent text-regular font-normal text-ink-1 placeholder:text-ink-4" />
      <div className="mt-2.5 flex justify-end">
        <IconButton type="submit" size={24} bordered label="Submit comment" icon="send" disabled={!text.trim()} />
      </div>
    </form>
  );
}

export function Activity({ issueId }: { issueId: number }) {
  const extras = useApp((s) => s.details[issueId] ?? EMPTY);
  // An edit made here (title, description, a property) shows in the feed: once the issue's writes have all settled,
  // the detail reloads, once for the lot.
  const writing = useApp((s) => (s.pending[issueKey(issueId)] ?? 0) > 0);
  const was = useRef({ issueId, writing });
  useEffect(() => {
    if (was.current.issueId === issueId && was.current.writing && !writing) void appStore.getState().loadIssueDetail(issueId);
    was.current = { issueId, writing };
  }, [writing, issueId]);
  const items = useMemo(() => [
    ...extras.activity.map((a) => ({ kind: "event" as const, key: `a${a.id}`, at: a.created_at, a })),
    ...extras.comments.map((c) => ({ kind: "comment" as const, key: `c${c.id}`, at: c.created_at, c })),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)), [extras]);
  return (
    <section aria-label="Activity" className="mt-8 border-t-[0.5px] border-line-menu pt-6">
      <h2 className="mb-4 text-regular font-semibold text-ink-1">Activity</h2>
      <ol className="flex flex-col gap-3">
        {items.map((item) => item.kind === "event" ? (
          <li key={item.key} data-activity="event" className="flex items-center gap-2 pl-[3px] text-mini text-ink-3">
            <Avatar user={item.a.author} size={14} />
            <span className="font-medium text-ink-2">{item.a.author?.name ?? "Someone"}</span>
            <span>{item.a.text}</span><span aria-hidden>·</span><Time iso={item.a.created_at} />
          </li>
        ) : (
          <li key={item.key} className="rounded-control border-[0.5px] border-line-menu bg-surface px-4 py-3 shadow-comment">
            <div className="mb-1.5 flex items-center gap-2 text-mini">
              <Avatar user={item.c.author} />
              <span className="font-medium text-ink-1">{item.c.author?.name ?? "Someone"}</span>
              <span className="text-ink-3"><Time iso={item.c.created_at} /></span>
            </div>
            <div className="prose-rally text-regular text-ink-2" dangerouslySetInnerHTML={{ __html: sanitize(item.c.html) }} />
          </li>
        ))}
      </ol>
      <CommentBox issueId={issueId} />
    </section>
  );
}

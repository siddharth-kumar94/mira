import { useCallback, useMemo, useRef, useState } from "react";
import { HEALTH_LABEL, type Comment, type ReportedHealth, type Update, type User } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ago, longDate, shortDate } from "../components/format";
import { ProjectIcon } from "../components/icons";
import { HealthIcon, InitiativeIcon } from "../components/pm";
import { Menu, type MenuEntry } from "../components/Menu";
import { Popover } from "../components/Popover";
import { textToHtml } from "../editor/plain";
import { sanitize } from "../editor/sanitize";
import { appStore, useApp } from "../store";
import { previousOf } from "./diff";
import { PM_NOUN } from "./health";
import { UpdateCard } from "./UpdateCard";

type Kind = "project" | "initiative";
type Mode = "comment" | "update";

const HEALTHS: ReportedHealth[] = ["on_track", "at_risk", "off_track"];
const HEALTH_TEXT = { on_track: "text-health-on", at_risk: "text-health-risk", off_track: "text-health-off" } as const;
const NO_DETAILS = { description: "", updates: [] as Update[], comments: [] as Comment[] };
/** The system line's title: "Fri Oct 16, 5:12:13 PM", as Linear's. */
const systemTime = (iso: string) => new Date(iso).toLocaleString("en-US",
  { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

/**
 * A 24h pill (12/500 `ink-2`, 1px ring, pad 0 8): the composer's health chip and its submit button
 * (project-activity-points.json; the ring is drawn as in project-activity.png).
 */
const PILL = "inline-flex h-6 shrink-0 items-center rounded-full border border-line-menu bg-surface text-mini font-medium whitespace-nowrap text-ink-2 shadow-comment";

/**
 * The health chip and its picker (inventory-p4 §2.4 #2): a dialog 175 wide, radius 12, 1px `line-menu`, 4 under the chip;
 * On track, At risk and Off track in 32 rows (13/400 `ink-2`), filtered by typing, with no number keys and no check
 * (the chip shows the current value).
 */
function HealthPicker({ kind, value, onChange }: { kind: Kind; value: ReportedHealth; onChange(h: ReportedHealth): void }) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  // Closing from inside (Esc, a choice) hands focus back to the chip; an outside click does not.
  const closeAndRestore = useCallback(() => { setOpen(false); chip.current?.focus(); }, []);
  const label = `Set ${PM_NOUN[kind]} health`;
  const entries: MenuEntry[] = HEALTHS.map((h) => ({
    id: h, label: HEALTH_LABEL[h], icon: <HealthIcon value={h} />, onSelect: () => onChange(h),
  }));
  return (
    <Popover open={open} onClose={close} button={
      // The icon sits 4 in from the ring, the label 6 after it (project-health-picker-crop.png).
      <button ref={chip} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`${PILL} flex! gap-1.5 pr-2 pl-1 hover:bg-health-hover`}>
        <HealthIcon value={value} /><span className={HEALTH_TEXT[value]}>{HEALTH_LABEL[value]}</span>
      </button>
    }>
      <div role="dialog" aria-label={label} className="absolute top-full left-0 z-40 mt-1 font-[400]">
        <Menu label={label} entries={entries} onClose={closeAndRestore} width={175} shadow="menu" typeahead className="border!" />
      </div>
    </Popover>
  );
}

/**
 * The composer card (inventory-p4 §2.4 #1, project-activity-points.json): 813 wide (4 past the column), `surface`,
 * radius 10, 1px `line-menu`, `shadow-comment`; the Comment | Update toggle and, for updates, the health chip, 12 in;
 * the plain-text editor (15/450, pad 4 16, 70 tall); then the submit pill 14 from the right and bottom.
 * An update waits for Rally ("Posting…") and keeps its text if refused (ruling 10, Review Focus 2); a comment clears at
 * once and its text comes back if refused, like the issue comment box.
 * Not copied (§19.6): "Write with Agent" and attachments.
 */
function Composer({ kind, id, latest }: { kind: Kind; id: number; latest: ReportedHealth | null }) {
  const [mode, setMode] = useState<Mode>("update");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<ReportedHealth | null>(null);
  const [posting, setPosting] = useState(false);
  const health = picked ?? latest ?? "on_track";
  const noun = PM_NOUN[kind];
  const Noun = noun[0].toUpperCase() + noun.slice(1);

  const send = async () => {
    const body = text.trim();
    if (!body || posting) return;
    const s = appStore.getState();
    if (mode === "comment") {
      setText("");
      const ok = await s.postPmComment(kind, id, textToHtml(body));
      if (!ok) setText((current) => (current ? `${body}\n${current}` : body));
      return;
    }
    setPosting(true);
    const ok = await s.postUpdate(kind, id, health, textToHtml(body));
    setPosting(false);
    if (ok) {
      setText("");
      setPicked(null); // the chip follows the new latest update
    }
  };

  const tab = (m: Mode, label: string) => (
    <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
      className={`h-6 rounded-full px-2 text-mini font-medium ${mode === m
        ? "bg-tab-on text-ink-2 shadow-[0_0_0_0.5px_var(--color-line-menu),var(--shadow-comment)]" : "text-ink-3"}`}>
      {label}
    </button>
  );
  const update = mode === "update";
  return (
    <form aria-label={update ? `${Noun} update` : "Comment"} onSubmit={(e) => { e.preventDefault(); void send(); }}
      className="-mx-1 rounded-[10px] border border-line-menu bg-surface shadow-comment">
      <div className="flex items-center gap-2 px-3 pt-3">
        <div role="tablist" aria-label="Activity type"
          className="flex h-[26px] items-center rounded-full border border-line-menu bg-surface shadow-comment">
          {tab("comment", "Comment")}{tab("update", "Update")}
        </div>
        {update && <HealthPicker kind={kind} value={health} onChange={setPicked} />}
      </div>
      <textarea aria-label={update ? `${Noun} update` : `${Noun} comment`} value={text} readOnly={posting} onChange={(e) => setText(e.target.value)}
        placeholder={update ? `Write a ${noun} update…` : "Leave a comment…"}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
        className="mt-3 block max-h-96 min-h-[70px] w-full resize-none [field-sizing:content] bg-transparent px-4 py-1 text-regular font-normal text-ink-2 placeholder:text-ink-4" />
      <div className="mt-3.5 flex justify-end pr-3.5 pb-3.5">
        <button type="submit" aria-label={update ? "Submit update" : "Submit comment"} disabled={!text.trim() || posting}
          className={`${PILL} px-2 hover:bg-hover disabled:hover:bg-surface`}>
          {update ? (posting ? "Posting…" : "Post update") : "Comment"}
        </button>
      </div>
    </form>
  );
}

/** A comment in the feed, as the issue page draws one (Linear's project comments weren't measured: the sandbox has none). */
function CommentCard({ comment: c }: { comment: Comment }) {
  const body = useMemo(() => sanitize(c.html), [c.html]);
  return (
    <div className="-mx-1 rounded-[10px] border border-line-menu bg-surface px-4 py-3 shadow-comment">
      <div className="mb-1.5 flex items-center gap-2 text-mini">
        <Avatar user={c.author} />
        <span className="font-medium text-ink-1">{c.author?.name ?? "Someone"}</span>
        <time dateTime={c.created_at} title={longDate(c.created_at)} className="text-ink-3">{ago(c.created_at)}</time>
      </div>
      <div className="prose-rally text-regular text-ink-2" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}

/**
 * The Activity tab of a project or initiative (spec §19.6, inventory-p4 §2.4): the composer, then the feed newest first —
 * update cards with their dates and comments, by date — and last the system line "[cube] <owner> created the feature · Oct 16"
 * (12/450/16.8 `ink-3`, the actor 12/500, the 14 icon 17 in). Cards are 24 apart, the system line 32 under the last.
 */
export function PmActivity({ kind, id, createdAt, owner }: { kind: Kind; id: number; createdAt: string; owner: User | null }) {
  const details = useApp((s) => s.pmDetails[`${kind}:${id}`]) ?? NO_DETAILS;
  const project = useApp((s) => (kind === "project" ? s.projects[id] : undefined));
  const latestHealth = useApp((s) => (kind === "project" ? s.projects[id] : s.initiatives[id])?.latest_update?.health ?? null);
  const { updates, comments } = details;
  const feed = useMemo(() => [
    ...updates.map((u, i) => ({ key: `update:${u.id}`, at: u.created_at, update: u, index: i })),
    ...comments.map((c) => ({ key: `comment:${c.id}`, at: c.created_at, comment: c })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [updates, comments]);
  return (
    <section aria-label={`${kind === "project" ? "Feature" : "Capability"} activity`} className="mx-auto w-(--size-content) pt-11 pb-16">
      <Composer kind={kind} id={id} latest={updates[0]?.health ?? latestHealth} />
      <ol aria-label="Activity" className="mt-6 flex flex-col gap-6">
        {feed.map((item) => (
          <li key={item.key} data-item={item.key}>
            {"update" in item
              ? <UpdateCard update={item.update} previous={previousOf(updates, item.index)} kind={kind} collapsible={false} className="-mx-1" />
              : <CommentCard comment={item.comment} />}
          </li>
        ))}
        <li data-item="created" className={`flex items-center gap-[5px] py-1 pl-[13px] text-mini leading-[16.8px] font-normal text-ink-3 ${feed.length ? "mt-2" : ""}`}>
          {kind === "project" ? <ProjectIcon project={project} size={14} /> : <InitiativeIcon size={14} />}
          <span className="min-w-0">
            {owner && <><span className="font-medium">{owner.name}</span> </>}created the {PM_NOUN[kind]}
            {" · "}<time dateTime={createdAt} title={systemTime(createdAt)}>{shortDate(createdAt)}</time>
          </span>
        </li>
      </ol>
    </section>
  );
}

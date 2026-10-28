import { useMemo, useState } from "react";
import { HEALTH_LABEL, type Update } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ago, shortDate } from "../components/format";
import { Icon } from "../components/icons";
import { HealthIcon } from "../components/pm";
import { sanitize } from "../editor/sanitize";
import { formatRoute, type Route } from "../route";
import { updateDiff, type RiskRow } from "./diff";
import { go } from "./ProjectList";

/** Linear's wording on the automatic rows: "at risk", "off track". */
const RISK_LABEL: Record<RiskRow["value"], string> = { at_risk: "at risk", off_track: "off track" };
const HEALTH_TEXT = { on_track: "text-health-on", at_risk: "text-health-risk", off_track: "text-health-off" } as const;
/** The age's title: "Oct 16, 5:12:18 PM", as Linear's. */
const fullTime = (iso: string) => new Date(iso).toLocaleString("en-US",
  { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

/**
 * Spec §19.8's update card (inventory-p4 §2.2 #7, project-overview-points.json): radius 10, 1px `line-3`, `panel`, pad
 * 8 16 16, drawn 16 past the 805 column either side (x363.5, 837 wide). The overview's cards have the "Latest update" header,
 * "Update" on its right (when `onUpdate`), and the age as "3d ago"; the Activity feed's cards show the date. A project's
 * header folds the card (`collapsible`: "Latest update ▾"); an initiative's is a plain h3 (inventory-p4 §3.2), shown
 * because it has `onUpdate`. `previous` is what `previousOf(updates, i)` resolves: the nearest earlier update with a footer.
 * `risks` are the initiative's automatic "Features · [cube] <name> at risk" rows, after the diff rows (§19.8). The Activity
 * feed's cards are drawn 4 past the column (x375.5, 813 wide, project-activity-points.json): it passes `className="-mx-1"`;
 * they pad 12 on top (the health text at y360, the body at y396, 339 the card top), where the overview card pads 8 above its header.
 * Not copied (§19.12): the "…" menu, comments on the update and reactions.
 */
export function UpdateCard({ update, previous, kind, collapsible, onUpdate, risks = [], className = "-mx-4" }: {
  update: Update; previous: Update | null; kind: "project" | "initiative"; collapsible: boolean; onUpdate?: () => void;
  risks?: RiskRow[]; className?: string;
}) {
  const [open, setOpen] = useState(true);
  const body = useMemo(() => sanitize(update.html), [update.html]);
  const rows = updateDiff(update, previous);
  const header = collapsible || onUpdate !== undefined;
  return (
    <article aria-label={`${kind === "project" ? "Feature" : "Capability"} update`}
      className={`${className} rounded-[10px] border border-line-3 bg-panel px-4 pb-4 ${header ? "pt-2" : "pt-3"}`}>
      {header && (
        <div className="flex h-7 items-center">
          {collapsible
            // 13/500 `ink-3` in a 28h radius-8 button, pad 0 6 0 8, its text on the content edge.
            ? <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
                className="-ml-2 flex h-7 items-center gap-1 rounded-[8px] pr-1.5 pl-2 text-small leading-4 font-medium text-ink-3 hover:bg-hover">
                Latest update
                <Icon name="caret" size={16} className={`transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
              </button>
            // The initiative's: an h3 on the content edge (x581, 13/500 `ink-3`, initiative-controls.json).
            : <h3 className="text-small leading-4 font-medium text-ink-3">Latest update</h3>}
          {onUpdate && (
            <button type="button" onClick={onUpdate}
              className="-mr-[7px] ml-auto flex h-7 items-center gap-1.5 rounded-full border border-transparent pr-2.5 pl-2 text-small leading-4 font-medium text-ink-3 hover:bg-hover">
              <Icon name="compose" size={14} />Update
            </button>
          )}
        </div>
      )}
      {open && <>
        {/* The byline (32 tall, 5 under the header): the health, an 18 avatar 12 on, the author 8 on, the age 10 on. */}
        <div className={`flex h-8 items-center text-small leading-4 ${header ? "mt-[5px]" : ""}`}>
          <span className="ml-px flex items-center gap-2"><HealthIcon value={update.health} />
            <span className={HEALTH_TEXT[update.health]}>{HEALTH_LABEL[update.health]}</span></span>
          <span className="ml-3 flex"><Avatar user={update.author} size={18} /></span>
          <span className="ml-2 truncate text-ink-3">{update.author?.name ?? "Someone"}</span>
          <span title={fullTime(update.created_at)} className="ml-2.5 shrink-0 text-ink-3">
            {header ? ago(update.created_at) : shortDate(update.created_at)}
          </span>
        </div>
        <div className="prose-rally mt-3 text-regular text-ink-2" dangerouslySetInnerHTML={{ __html: body }} />
        {rows.length + risks.length > 0 && (
          // The diff block: a 2px `line-3` rule, rows 12/500 (label `ink-3` in a 79 column, value `ink-2`) at a 27 pitch.
          <div className="mt-7 ml-0.5 flex flex-col gap-1.5 border-l-2 border-line-3 pb-2 text-mini leading-[15px] font-medium">
            {rows.map((r) => (
              <div key={r.label} data-diff className="flex pt-1.5 pl-3">
                <span className="min-w-[79px] shrink-0 pr-2 text-ink-3">{r.label}</span>
                <span className="text-ink-2">{r.text}</span>
              </div>
            ))}
            {/* "Features · [cube] CTDataHub + AI/ML: TNM Staging at risk": the 16 cube 6 past the value column (x681),
                the name 6 on (x703, a 12/500 `ink-2` link), then the health 12/450 `ink-3` (initiative-controls.json). */}
            {/* "Features" labels the first row only; the rest keep the empty label column, so their values stack. */}
            {risks.map((r, i) => {
              const route: Route = { name: "project", key: r.key, tab: "overview" };
              return (
                <div key={r.key} data-diff className="flex items-center pt-1.5 pl-3">
                  <span className="min-w-[79px] shrink-0 pr-2 text-ink-3">{i === 0 ? "Features" : ""}</span>
                  <span className="ml-1.5 flex min-w-0 items-center gap-1.5">
                    <Icon name="project" size={16} className="text-ink-3" />
                    <span className="min-w-0">
                      <a href={formatRoute(route)} onClick={go(route)} className="text-ink-2 hover:text-ink-1">{r.name}</a>
                      <span className="font-normal text-ink-3"> {RISK_LABEL[r.value]}</span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </>}
    </article>
  );
}

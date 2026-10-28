import { useState, type ReactNode } from "react";
import type { Issue, Priority } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Icon, ProjectIcon } from "../components/icons";
import { Ring } from "../components/pm";
import { PriorityIcon } from "../components/PriorityIcon";
import { labelColor, Tile } from "../components/ui";
import type { Context } from "../views/model";
import { breakdown, percent, type BreakdownBy, type BreakdownRow } from "./progress";

const TABS: [BreakdownBy, string][] = [
  ["assignees", "Assignees"], ["labels", "Labels"], ["priority", "Priority"], ["projects", "Features"], ["teams", "Teams"],
];
/** Points can be fractional; sums must not print float noise. */
const pts = (n: number) => +n.toFixed(2);

/** The row's avatar or icon, centred in an 18 box. */
function mark(by: BreakdownBy, row: BreakdownRow, ctx: Pick<Context, "users" | "projects" | "teams">): ReactNode {
  const none = row.key === "none";
  switch (by) {
    case "assignees": return <Avatar user={none ? null : ctx.users[Number(row.key.slice(1))] ?? { id: 0, name: row.label }} size={18} />;
    case "labels": return none ? <span className="size-2 rounded-full border border-dashed border-ink-4" />
      : <span className="size-2 rounded-full" style={{ background: labelColor(row.label) }} />;
    case "priority": return <PriorityIcon priority={(none ? 0 : Number(row.key.slice(1))) as Priority} />;
    case "projects": return <ProjectIcon project={none ? undefined : ctx.projects[Number(row.key.slice(2))]} size={16} />;
    case "teams": return <Tile id={Number(row.key.slice(1))} name={row.label} size={16} />;
  }
}

/**
 * Spec §19.4's breakdown tabs (inventory-p4 §4.2): a 402×32 pill strip, then 42-tall rows (radius 8, pad 0 10) of the
 * avatar or icon, the name 13/450 `ink-1`, a ring, "N% of", the triangle and the points. Teams only for an ART.
 */
export function Breakdown({ issues, ctx, teams, only, stretch = false }: {
  issues: Issue[]; ctx: Pick<Context, "users" | "projects" | "teams">; teams: boolean;
  /** The tabs to offer, in Linear's order (the project sidebar's are Assignees, Labels and Teams). */
  only?: BreakdownBy[];
  /** The tabs share the strip's width out by their content, as in the 362-wide project sidebar (130, 108, 108). */
  stretch?: boolean;
}) {
  const [by, setBy] = useState<BreakdownBy>("assignees");
  const tabs = TABS.filter(([t]) => (teams || t !== "teams") && (!only || only.includes(t)));
  const current = tabs.some(([t]) => t === by) ? by : "assignees";
  const rows = breakdown(issues, current, ctx);
  const unused = current === "labels" && rows.every((r) => r.key === "none");
  return (
    <div>
      <div role="tablist" aria-label="Breakdown" className="flex h-8 items-center gap-1.5 rounded-[5px] bg-surface px-0.5">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={current === t} onClick={() => setBy(t)}
            className={`h-7 ${stretch ? "flex-auto" : ""} rounded-full border-[0.5px] border-line-menu px-[14px] text-mini font-medium whitespace-nowrap transition-colors duration-150 ${current === t ? "bg-tab-on text-ink-1" : "bg-surface text-ink-3 hover:bg-hover"}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tabs.find(([t]) => t === current)?.[1]} className="mt-2">
        {unused
          ? <p className="flex h-[42px] items-center px-2.5 text-small leading-4 text-ink-3">No labels used</p>
          : <ul>
              {rows.map((r) => (
                <li key={r.key} className="flex h-[42px] items-center gap-2 rounded-[8px] px-2.5 text-small leading-4">
                  <span aria-hidden className="flex w-[18px] shrink-0 justify-center">{mark(current, r, ctx)}</span>
                  <span className="min-w-0 flex-1 truncate font-normal text-ink-1">{r.label}</span>
                  {/* Measured on cycle-breakdown-teams.png: ring, 8, "26% of" (12px), 5, the triangle, 3, the points (12px). */}
                  <span className="flex shrink-0 items-center text-mini whitespace-nowrap text-ink-3">
                    <Ring fraction={r.total > 0 ? r.done / r.total : 0} track="var(--color-line-popover)" />
                    <span className="ml-2">{percent(r.done, r.total)}% of</span>
                    <span className="ml-[5px] inline-flex"><Icon name="estimate" size={14} /></span>
                    <span className="ml-[3px]">{pts(r.total)}</span>
                  </span>
                </li>
              ))}
            </ul>}
      </div>
    </div>
  );
}

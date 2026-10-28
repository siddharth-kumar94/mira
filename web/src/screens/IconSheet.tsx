import type { ReactNode } from "react";
import { PRIORITIES, STATUSES } from "../api/types";
import { CycleIcon, ICONS, Icon, ProjectTile, type IconName } from "../components/icons";
import {
  CycleStatusIcon, DateChip, HealthChip, HealthDot, HealthIcon, InitiativeIcon, Legend, PersonChip, PiChip, ProjectStatusIcon, ProjectsDoneIcon, Ring,
  Sparkline, StatusTag,
} from "../components/pm";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { ViewFrame } from "../components/ViewFrame";
import { SHEET_HEALTH, SHEET_NOW, SHEET_UPDATE, SPRINT_PREVIEW, TILE_PROJECT } from "./sheetData";

/** /dev/icons: every icon at 4×, for the side-by-side with Linear's crops; then the PM chips at 1× (spec §19.2). */
export function IconSheet() {
  const cell = (name: string, node: ReactNode) => (
    <figure key={name} className="flex flex-col items-center gap-2 p-3 text-mini text-ink-3">{node}<figcaption>{name}</figcaption></figure>
  );
  const now = Date.parse(SPRINT_PREVIEW.current.start) + 3 * 86_400_000;
  const update = { ...SHEET_UPDATE, health: "on_track" as const };
  return (
    <ViewFrame title="Icons">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-ink-3">
        <div className="grid grid-cols-8 content-start gap-2">
          {(Object.keys(ICONS) as IconName[]).map((n) => cell(n, <Icon name={n} size={56} />))}
          {STATUSES.map((s) => cell(`status-${s}`, <StatusIcon status={s} size={56} />))}
          {cell("status-completed", <StatusIcon status="done" mono size={56} />)}
          {PRIORITIES.map((p) => cell(`priority-${p}`, <PriorityIcon priority={p} size={56} />))}
          {cell("priority-urgent-ink", <PriorityIcon priority={1} tone="ink" size={56} />)}
          {cell("cycle-current", <CycleIcon cycle={SPRINT_PREVIEW.current} now={now} size={56} />)}
          {cell("cycle-upcoming", <CycleIcon cycle={SPRINT_PREVIEW.upcoming} now={now} size={56} />)}
          {(["on_track", "at_risk", "off_track", "none"] as const).map((h) => cell(`health-${h}`, <HealthIcon value={h} size={56} />))}
          {cell("pstatus-backlog", <ProjectStatusIcon category="backlog" progress={0} size={56} />)}
          {cell("pstatus-planned", <ProjectStatusIcon category="planned" progress={0} size={56} />)}
          {cell("pstatus-started-25", <ProjectStatusIcon category="started" progress={0.25} size={56} />)}
          {cell("pstatus-started-50", <ProjectStatusIcon category="started" progress={0.5} size={56} />)}
          {cell("pstatus-completed", <ProjectStatusIcon category="completed" progress={1} size={56} />)}
          {(["backlog", "started", "completed"] as const).map((c) => cell(`project-tile-${c}`,
            <span className="inline-flex origin-center scale-[1.5] p-3"><ProjectTile project={{ ...TILE_PROJECT, status_category: c }} /></span>))}
          {cell("initiative", <InitiativeIcon size={56} />)}
          {(["planned", "active", "completed"] as const).map((s) => cell(`initiative-${s}`, <InitiativeIcon status={s} size={56} />))}
          {(["on_track", "at_risk", "off_track"] as const).map((h) => cell(`health-dot-${h}`, <HealthDot value={h} size={56} />))}
          {cell("projects-done", <span className="inline-flex origin-center scale-[3.5] p-6"><ProjectsDoneIcon /></span>)}
          {(["planned", "upcoming", "current", "past"] as const).map((s) => cell(`cycle-${s}`, <CycleStatusIcon status={s} elapsed={0.3} size={56} />))}
          {[0, 0.26, 0.6, 1].map((f) => cell(`ring-${f * 100}`, <Ring fraction={f} size={56} />))}
          {cell("sparkline-31", <span className="inline-flex origin-center scale-[1.75] p-4"><Sparkline start="2026-09-10" progress={0.31} now={SHEET_NOW} /></span>)}
        </div>
        <div data-sheet="pm" className="mt-6 flex flex-col items-start gap-3 bg-surface p-4">
          <div className="flex items-center gap-4">
            <HealthChip health={SHEET_HEALTH.off} latest={SHEET_UPDATE} kind="project" now={SHEET_NOW} />
            <HealthChip health={SHEET_HEALTH.risk} latest={SHEET_UPDATE} kind="project" now={SHEET_NOW} />
            <HealthChip health={SHEET_HEALTH.on} latest={update} kind="project" now={SHEET_NOW} />
            <HealthChip health={SHEET_HEALTH.none} latest={null} kind="project" now={SHEET_NOW} />
            <HealthChip health={SHEET_HEALTH.auto} latest={null} kind="initiative" now={SHEET_NOW} />
            <HealthChip health={SHEET_HEALTH.risk} latest={SHEET_UPDATE} kind="initiative" now={SHEET_NOW} iconOnly />
            <HealthChip health={SHEET_HEALTH.none} latest={null} kind="initiative" now={SHEET_NOW} iconOnly />
          </div>
          <div className="flex items-center gap-4">
            <PiChip release={{ id: -1, name: "PI 4", start: "2026-09-01", end: "2026-11-30", ids: [-1] }} />
            <DateChip iso="2026-10-01" overdue now={SHEET_NOW} />
            <DateChip iso="2027-02-15" now={SHEET_NOW} />
            <DateChip iso="2026-09-10" icon="start" now={SHEET_NOW} />
            <PersonChip user={{ id: -1, name: "Dana Demo" }} />
            <StatusTag>Planned</StatusTag><StatusTag>Upcoming</StatusTag><StatusTag>Current</StatusTag>
            <span className="inline-flex items-center gap-2 text-mini text-ink-2">
              <ProjectStatusIcon category="started" progress={0.31} />31%<Sparkline start="2026-09-10" progress={0.31} now={SHEET_NOW} />
            </span>
          </div>
          <div className="w-[402px]"><Legend scope={18} started={7} completed={3} percent /></div>
          <Legend scope={18} started={7} completed={3} percent layout="rows" />
        </div>
      </div>
    </ViewFrame>
  );
}

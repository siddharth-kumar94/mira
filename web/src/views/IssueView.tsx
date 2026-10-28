import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { storyCount } from "../components/format";
import { Popover } from "../components/Popover";
import { IconButton } from "../components/ui";
import { appStore, uiStore, useAppState, useUi } from "../store";
import { BoardLayout } from "./BoardLayout";
import { BulkBar } from "./BulkBar";
import { DisplayMenu } from "./DisplayMenu";
import { resolveDrop } from "./drag";
import { FilterChips, FilterMenu } from "./FilterMenu";
import { ListLayout, type DropHandler } from "./ListLayout";
import { buildGroups, inScope, matches, teamScopeIds, viewKey, type Context } from "./model";
import { isDefault, useViewOptions } from "./options";
import type { ComposerPrefill, Filters, Scope } from "./types";

const NO_FILTERS: Filters = {};

/** What grouping, filters and labels need to know about the scope: a team's or a cycle's team, an ART's children. */
export function useViewContext(scope: Scope): Context {
  const app = useAppState();
  const teamId = scope.kind === "team" || scope.kind === "cycle" ? scope.teamId : undefined;
  return useMemo<Context>(() => ({
    meId: app.meta?.me.id ?? null, now: Date.now(), users: app.users, projects: app.projects, cycles: app.cycles,
    memberIds: teamId !== undefined ? app.teamState[teamId]?.memberIds : undefined, teamId, teams: app.teams,
    // An ART shows its child teams' issues and merges their same-named, same-dated cycles (spec §19.11, D29).
    scopeTeamIds: teamId !== undefined ? teamScopeIds(teamId, app.teams) : undefined,
    mergeCycles: teamId !== undefined && app.teams[teamId]?.level === "art",
  }), [app.meta, app.users, app.projects, app.cycles, app.teams, app.teamState, teamId]);
}

/**
 * The one issue view (spec D12): a scope, plus filters, plus display options, as a list or a board. `count` puts
 * "N stories" on the left of the toolbar (§19.4), `tools` go after Display, and `aside` sits beside the issues, under it.
 * `prefill` goes under every group's "+" (a cycle page's team and cycle); a project scope's defaults to its project.
 */
export function IssueView({ scope, label, empty, tabs, footer, count = false, tools, aside, prefill }: {
  scope: Scope; label: string; empty: ReactNode; tabs?: ReactNode; footer?: ReactNode; count?: boolean; tools?: ReactNode; aside?: ReactNode;
  prefill?: ComposerPrefill;
}) {
  const app = useAppState();
  const view = viewKey(scope);
  const [options, setOptions] = useViewOptions(view, scope);
  const flip = useUi((u) => u.layoutFlip);
  const seenFlip = useRef(flip); // a flip from another view must not fire on mount
  useEffect(() => {
    if (flip === seenFlip.current) return;
    seenFlip.current = flip;
    setOptions({ layout: options.layout === "list" ? "board" : "list" });
  }, [flip]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useUi((u) => u.filters[view] ?? NO_FILTERS);
  const menu = useUi((u) => u.menu);
  const selectedIds = useUi((u) => u.selectedIds);

  const ctx = useViewContext(scope);
  const inView = useMemo(() => Object.values(app.issues).filter((i) => inScope(i, scope, ctx, options.completed)), [app.issues, scope, ctx, options.completed]);
  // ctx is passed so a Cycle filter matches by cycle (merged only with ctx.mergeCycles).
  const shown = useMemo(() => inView.filter((i) => matches(i, filters, ctx)), [inView, filters, ctx]);
  const groups = useMemo(() => buildGroups(shown, options, ctx), [shown, options, ctx]);
  // Cards and rows in a collapsed group aren't rendered, so J/K and bulk actions must not reach them.
  const ids = useMemo(() => groups
    .filter((g) => options.groupBy === "none" || !options.collapsed.includes(g.key))
    .flatMap((g) => g.issues.map((i) => i.id)), [groups, options.layout, options.groupBy, options.collapsed]);
  useEffect(() => uiStore.getState().setVisible(ids), [ids]);

  const onDrop = useCallback<DropHandler>((issueId, fromKey, toKey, overId) => {
    const s = appStore.getState();
    const issue = s.issues[issueId];
    const from = groups.find((g) => g.key === fromKey);
    const to = groups.find((g) => g.key === toKey);
    if (!issue || !from || !to) return;
    const result = resolveDrop({ issue, from, to, overId, orderBy: options.orderBy, cycles: s.cycles });
    if (result.hint) return s.pushToast(result.hint);
    if (result.patch) void s.updateIssue(issueId, result.patch);
    if (result.rank) void s.rankIssue(issueId, result.rank);
  }, [groups, options.orderBy]);

  const closeMenu = useCallback(() => uiStore.getState().setMenu(null), []);
  const toggleGroup = (key: string) => setOptions({ collapsed: options.collapsed.includes(key) ? options.collapsed.filter((k) => k !== key) : [...options.collapsed, key] });
  const toggle = (m: "filter" | "display") => () => uiStore.getState().setMenu(menu === m ? null : m);
  const setFilters = (f: Filters) => uiStore.getState().setFilters(view, f);

  const scopePrefill = prefill ?? (scope.kind === "project" ? { project_id: scope.projectId } : null);
  const body = shown.length === 0 && !options.showEmpty
    ? <div className="min-h-0 flex-1 overflow-y-auto">{empty}{footer}</div>
    : options.layout === "board"
      ? <>
        <BoardLayout label={label} groups={groups} options={options} onDrop={onDrop} onToggleGroup={toggleGroup} scopePrefill={scopePrefill} />
        {footer && <div className="shrink-0">{footer}</div>}
      </>
      : <div className="min-h-0 flex-1 overflow-y-auto"><ListLayout label={label} groups={groups} options={options} onDrop={onDrop}
        onToggleGroup={toggleGroup} footer={footer} scopePrefill={scopePrefill} /></div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2">
        {tabs}
        {count && <span className="pl-2.5 text-small leading-4 font-medium whitespace-nowrap text-ink-3">{storyCount(shown.length)}</span>}
        <FilterChips filters={filters} ctx={ctx} onChange={setFilters} />
        <div className="ml-auto flex items-center gap-1.5">
          <Popover open={menu === "filter"} onClose={closeMenu}
            button={<IconButton label="Add filter" icon="filter" aria-expanded={menu === "filter"} onClick={toggle("filter")} />}>
            <FilterMenu issues={inView} filters={filters} ctx={ctx} onChange={setFilters} scope={scope} onClose={closeMenu} />
          </Popover>
          <Popover open={menu === "display"} onClose={closeMenu}
            button={<IconButton label="Display options" icon="display" dot={!isDefault(options, scope)} aria-expanded={menu === "display"} onClick={toggle("display")} />}>
            <DisplayMenu options={options} onChange={setOptions} scope={scope} />
          </Popover>
          {tools}
        </div>
      </div>
      {selectedIds.length > 0 && <BulkBar ids={selectedIds} />}
      {aside ? <div className="flex min-h-0 flex-1"><div className="flex min-w-0 flex-1 flex-col">{body}</div>{aside}</div> : body}
    </div>
  );
}

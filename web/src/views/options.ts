import { useCallback, useEffect, useState } from "react";
import type { CompletedWindow, DisplayOptions, GroupBy, Layout, OrderBy, Property, Scope } from "./types";

/** The order Linear's Display menu lists properties in (inventory: Display menu). */
export const ALL_PROPERTIES: Property[] = [
  "id", "status", "assignee", "creator", "priority", "project", "cycle", "estimate", "labels", "created", "updated"];
/** Linear's defaults: everything but Creator and Updated (spec §18.3). */
export const DEFAULT_PROPERTIES: Property[] = ALL_PROPERTIES.filter((p) => p !== "creator" && p !== "updated");
export const PROPERTY_LABEL: Record<Property, string> = {
  priority: "Priority", id: "ID", status: "Status", labels: "Labels", project: "Feature", cycle: "Sprint",
  estimate: "Estimate", assignee: "Assignee", creator: "Creator", created: "Created", updated: "Updated",
};
const LAYOUTS: Layout[] = ["list", "board"];
const GROUPS: GroupBy[] = ["focus", "status", "assignee", "priority", "project", "cycle", "none"];
const ORDERS: OrderBy[] = ["importance", "manual", "priority", "updated", "created", "estimate"];
const WINDOWS: CompletedWindow[] = ["none", "day", "week", "two_weeks"];
const KEY = (view: string) => `mira-view:v2:${view}`; // plan ruling 4: Phase 2's options are not read

const baseOrder = (scope: Scope): OrderBy => (scope.kind === "team" && scope.tab === "backlog" ? "manual" : "priority");

/** A cycle's view doesn't show the cycle, nor a project's the project (§19.6 Issues). */
const OWN_PROPERTY: Partial<Record<Scope["kind"], Property>> = { cycle: "cycle", project: "project" };

/**
 * Linear's defaults (spec §7, D28): My issues by Focus and Importance; teams, cycles and projects by status and priority;
 * Backlog manual.
 */
export function defaultOptions(scope: Scope): DisplayOptions {
  const my = scope.kind === "my";
  const own = OWN_PROPERTY[scope.kind];
  return { layout: "list", groupBy: my ? "focus" : "status", orderBy: my ? "importance" : baseOrder(scope), showEmpty: false,
           completed: "day", collapsed: [], properties: DEFAULT_PROPERTIES.filter((p) => p !== own) };
}

/** Focus is My issues only and always orders by Importance; leaving it restores the view's default ordering (ruling 5). */
export function normalizeOptions(o: DisplayOptions, scope: Scope): DisplayOptions {
  if (o.groupBy === "focus" && scope.kind !== "my") return { ...o, groupBy: "status", orderBy: o.orderBy === "importance" ? baseOrder(scope) : o.orderBy };
  if (o.groupBy === "focus") return { ...o, orderBy: "importance" };
  return o.orderBy === "importance" ? { ...o, orderBy: baseOrder(scope) } : o;
}

/** For the Display button's dot (spec §18.2): collapsed groups and property order don't count. */
export function isDefault(o: DisplayOptions, scope: Scope): boolean {
  const d = defaultOptions(scope);
  const same = (a: Property[], b: Property[]) => a.length === b.length && a.every((p) => b.includes(p));
  return o.layout === d.layout && o.groupBy === d.groupBy && o.orderBy === d.orderBy && o.showEmpty === d.showEmpty
    && o.completed === d.completed && same(o.properties, d.properties);
}

const pick = <T,>(allowed: T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Saved options, field by field; anything missing, unknown or unreadable falls back to the default. */
export function loadOptions(view: string, scope: Scope, storage: Storage | undefined = globalThis.localStorage): DisplayOptions {
  const base = defaultOptions(scope);
  try {
    const raw = storage?.getItem(KEY(view));
    if (!raw) return base;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const props = Array.isArray(saved.properties)
      ? saved.properties.filter((p): p is Property => ALL_PROPERTIES.includes(p as Property)) : null;
    return normalizeOptions({
      layout: pick(LAYOUTS, saved.layout, base.layout),
      groupBy: pick(GROUPS, saved.groupBy, base.groupBy),
      orderBy: pick(ORDERS, saved.orderBy, base.orderBy),
      showEmpty: typeof saved.showEmpty === "boolean" ? saved.showEmpty : base.showEmpty,
      completed: pick(WINDOWS, saved.completed, base.completed),
      collapsed: Array.isArray(saved.collapsed) ? saved.collapsed.filter((k): k is string => typeof k === "string") : base.collapsed,
      properties: props && (props.length || (saved.properties as unknown[]).length === 0) ? props : base.properties,
    }, scope);
  } catch {
    return base;
  }
}

export function saveOptions(view: string, options: DisplayOptions, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY(view), JSON.stringify(options));
  } catch {
    /* storage blocked: the options last for this session */
  }
}

export function useViewOptions(view: string, scope: Scope): [DisplayOptions, (next: Partial<DisplayOptions>) => void] {
  const [options, setOptions] = useState(() => loadOptions(view, scope));
  useEffect(() => setOptions(loadOptions(view, scope)), [view]); // reload only when the view changes
  const update = useCallback((next: Partial<DisplayOptions>) => setOptions((current) => {
    const merged = normalizeOptions({ ...current, ...next }, scope);
    saveOptions(view, merged);
    return merged;
  }), [view, scope]);
  return [options, update];
}

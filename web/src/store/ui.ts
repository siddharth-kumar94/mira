import { createStore } from "zustand/vanilla";
import { formatRoute, HOME, parsePath, sameRoute, type Route } from "../route";
import type { ComposerPrefill, Filters } from "../views/types";

export type Picker = "status" | "priority" | "assignee" | "labels" | "project" | "cycle" | "estimate";
export type Menu = "display" | "filter" | null;
export interface PaletteState { open: boolean; picker: Picker | null; targetIds: number[] }
type HistoryLike = Pick<History, "pushState" | "replaceState">;

export interface UiState {
  route: Route;
  /** Where Esc and the breadcrumb go from an issue page. */
  backRoute: Route;
  /** The last screen outside settings: where "Back to app" goes. */
  appRoute: Route;
  selectedId: number | null;
  selectedIds: number[];
  peekId: number | null;
  /** The current view's rows in display order, for J/K. */
  visibleIds: number[];
  palette: PaletteState;
  composerOpen: boolean;
  composerPrefill: ComposerPrefill | null;
  cheatsheetOpen: boolean;
  menu: Menu;
  /** The row context menu (§18.7), at the pointer, over these issues. */
  contextMenu: { x: number; y: number; ids: number[] } | null;
  openContextMenu(id: number, x: number, y: number): void;
  closeContextMenu(): void;
  /** Bumped by ⌘B; the mounted issue view flips its layout (spec §18.2). */
  layoutFlip: number;
  flipLayout(): void;
  /** Filters per view key, for this session. */
  filters: Record<string, Filters>;
  joinedTeamIds: number[];
  hiddenTeamIds: number[];
  /** Collapsed sidebar sections: "workspace", "teams", "team:<id>". */
  navCollapsed: string[];
  toggleNav(key: string): void;
  theme: "light" | "dark";
  navigate(route: Route, opts?: { replace?: boolean }): void;
  syncFromLocation(path: string): void;
  openIssue(key: string, opts?: { replace?: boolean }): void;
  select(id: number | null): void;
  toggleSelected(id: number): void;
  clearSelection(): void;
  openPeek(id: number | null): void;
  setVisible(ids: number[]): void;
  openPalette(picker?: Picker | null, targetIds?: number[]): void;
  closePalette(): void;
  setPaletteTargets(ids: number[]): void;
  openComposer(prefill?: ComposerPrefill | null): void;
  setComposer(open: boolean): void;
  setCheatsheet(open: boolean): void;
  setMenu(menu: Menu): void;
  setFilters(view: string, filters: Filters): void;
  joinTeam(id: number): void;
  hideTeam(id: number): void;
  /** Leaves a joined team. Rally's own teams stay yours, so this also hides it. */
  leaveTeam(id: number): void;
  /** Takes a team off the hidden list. */
  showTeam(id: number): void;
  toggleTheme(): void;
  setTheme(theme: "light" | "dark"): void;
  closeTopOverlay(): void;
}

const THEME_KEY = "rally-poc-theme";
const JOINED_KEY = "mira-teams-joined";
const HIDDEN_KEY = "mira-teams-hidden";
const NAV_KEY = "mira-nav-collapsed";
const storage = (): Storage | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);

function readIds(key: string): number[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

function readKeys(key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep it for this session */
  }
}

/** Your teams in the sidebar (spec D6): Rally's plus joined ones, minus hidden ones. */
export function sidebarTeamIds(yours: number[], joined: number[], hidden: number[]): number[] {
  return [...new Set([...yours, ...joined])].filter((id) => !hidden.includes(id));
}

const isSettingsRoute = (r: Route): boolean => r.name === "settings" || r.name === "team-settings";

const cleared = { selectedId: null, selectedIds: [] as number[], peekId: null, menu: null, contextMenu: null };

export function createUiStore(history: HistoryLike = window.history, path: string = window.location.pathname) {
  const start = parsePath(path);
  if (start.name !== "not-found" && formatRoute(start) !== path) history.replaceState(null, "", formatRoute(start));

  return createStore<UiState>()((set, get) => {
    const moveTo = (route: Route) => {
      const current = get().route;
      const backRoute = current.name === "issue" ? get().backRoute : current;
      // Opening an issue, or returning from it to where it was opened, keeps the selection.
      const keepsSelection = route.name === "issue" || (current.name === "issue" && sameRoute(route, backRoute));
      const appRoute = isSettingsRoute(route) ? (isSettingsRoute(current) ? get().appRoute : current) : route;
      set({ route, backRoute, appRoute, ...(keepsSelection ? { peekId: null, menu: null } : cleared) });
    };
    return {
      route: start,
      backRoute: start.name === "issue" ? HOME : start,
      appRoute: isSettingsRoute(start) ? HOME : start,
      selectedId: null,
      selectedIds: [],
      peekId: null,
      visibleIds: [],
      palette: { open: false, picker: null, targetIds: [] },
      composerOpen: false,
      composerPrefill: null,
      cheatsheetOpen: false,
      menu: null,
      contextMenu: null,
      layoutFlip: 0,
      filters: {},
      joinedTeamIds: readIds(JOINED_KEY),
      hiddenTeamIds: readIds(HIDDEN_KEY),
      navCollapsed: readKeys(NAV_KEY),
      theme: storage()?.getItem(THEME_KEY) === "dark" ? "dark" : "light",
      navigate(route, opts = {}) {
        if (sameRoute(route, get().route)) return;
        const url = formatRoute(route);
        if (opts.replace) history.replaceState(null, "", url);
        else history.pushState(null, "", url);
        moveTo(route);
      },
      syncFromLocation(path) {
        const route = parsePath(path);
        if (!sameRoute(route, get().route)) moveTo(route);
      },
      openIssue: (key, opts) => get().navigate({ name: "issue", key: key.toUpperCase() }, opts),
      select: (id) => set({ selectedId: id }),
      toggleSelected: (id) =>
        set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),
      clearSelection: () => set({ selectedId: null, selectedIds: [] }),
      openPeek: (id) => set({ peekId: id }),
      // A filter can hide selected issues; bulk actions must not reach what the user can't see.
      setVisible: (ids) =>
        set((s) => {
          const kept = s.selectedIds.filter((id) => ids.includes(id));
          return { visibleIds: ids, ...(kept.length === s.selectedIds.length ? {} : { selectedIds: kept }) };
        }),
      openPalette: (picker = null, targetIds = []) => set({ palette: { open: true, picker, targetIds }, menu: null }),
      openContextMenu(id, x, y) {
        const s = get();
        const ids = s.selectedIds.includes(id) ? s.selectedIds : [id];
        set({ contextMenu: { x, y, ids }, selectedId: id, selectedIds: s.selectedIds.includes(id) ? s.selectedIds : [], palette: { open: false, picker: null, targetIds: [] }, menu: null });
      },
      closeContextMenu: () => set({ contextMenu: null }),
      setPaletteTargets: (ids) => set((s) => ({ palette: { ...s.palette, targetIds: ids } })),
      closePalette: () => set({ palette: { open: false, picker: null, targetIds: [] } }),
      openComposer: (prefill = null) => set({ composerOpen: true, composerPrefill: prefill }),
      setComposer: (open) => set(open ? { composerOpen: true, composerPrefill: null } : { composerOpen: false }),
      setCheatsheet: (open) => set({ cheatsheetOpen: open }),
      setMenu: (menu) => set({ menu }),
      flipLayout: () => set((s) => ({ layoutFlip: s.layoutFlip + 1 })),
      setFilters: (view, filters) => set((s) => ({ filters: { ...s.filters, [view]: filters } })),
      joinTeam(id) {
        const joined = [...new Set([...get().joinedTeamIds, id])];
        const hidden = get().hiddenTeamIds.filter((x) => x !== id);
        writeJson(JOINED_KEY, joined);
        writeJson(HIDDEN_KEY, hidden);
        set({ joinedTeamIds: joined, hiddenTeamIds: hidden });
      },
      hideTeam(id) {
        const hidden = [...new Set([...get().hiddenTeamIds, id])];
        writeJson(HIDDEN_KEY, hidden);
        set({ hiddenTeamIds: hidden });
      },
      leaveTeam(id) {
        const joined = get().joinedTeamIds.filter((x) => x !== id);
        const hidden = [...new Set([...get().hiddenTeamIds, id])];
        writeJson(JOINED_KEY, joined);
        writeJson(HIDDEN_KEY, hidden);
        set({ joinedTeamIds: joined, hiddenTeamIds: hidden });
      },
      showTeam(id) {
        const hidden = get().hiddenTeamIds.filter((x) => x !== id);
        writeJson(HIDDEN_KEY, hidden);
        set({ hiddenTeamIds: hidden });
      },
      toggleNav(key) {
        const cur = get().navCollapsed;
        const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
        writeJson(NAV_KEY, next);
        set({ navCollapsed: next });
      },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
      setTheme(theme) {
        try { storage()?.setItem(THEME_KEY, theme); } catch { /* blocked: keep it for this session */ }
        set({ theme });
      },
      closeTopOverlay() {
        const s = get();
        if (s.contextMenu) set({ contextMenu: null });
        else if (s.palette.open) s.closePalette();
        else if (s.composerOpen) set({ composerOpen: false });
        else if (s.cheatsheetOpen) set({ cheatsheetOpen: false });
        else if (s.menu) set({ menu: null });
        else if (s.peekId !== null) set({ peekId: null });
        else if (s.route.name === "issue") s.navigate(s.backRoute);
        else set({ selectedId: null, selectedIds: [] });
      },
    };
  });
}

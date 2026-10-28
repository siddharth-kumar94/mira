import { useMemo } from "react";
import type { Team } from "../api/types";
import type { Route, TeamTab } from "../route";
import { uiStore, useApp, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";
import { Icon, type IconName } from "./icons";
import { MenuButton, type MenuEntry } from "./Menu";
import { IconButton, Tile } from "./ui";

const item = "flex h-(--size-nav) items-center gap-1.5 rounded-control px-2 text-left font-medium transition-colors duration-150";
const cls = (on: boolean) => `${item} ${on ? "bg-selected text-ink-1" : "text-ink-3 hover:bg-sidebar-hover hover:text-ink-1"}`;
const ISSUE_TABS: TeamTab[] = ["active", "backlog", "all"];

function helpEntries(): MenuEntry[] {
  const ui = uiStore.getState();
  return [
    { id: "shortcuts", label: "Keyboard shortcuts", onSelect: () => ui.setCheatsheet(true) },
    { id: "theme", label: "Toggle theme", onSelect: () => ui.toggleTheme() },
    { id: "settings", label: "Settings", onSelect: () => ui.navigate({ name: "settings", section: "preferences" }) },
  ];
}

function NavItem({ icon, label, on, onClick, indent = false }: { icon: IconName; label: string; on: boolean; onClick(): void; indent?: boolean }) {
  return (
    <button type="button" aria-current={on ? "page" : undefined} onClick={onClick}
      className={`${cls(on)} ${indent ? "ml-[19px] w-[201px] pl-1.5" : "w-full"}`}>
      <Icon name={icon} size={14} /><span className="truncate">{label}</span>
    </button>
  );
}

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const closed = useUi((u) => u.navCollapsed.includes(id));
  return (
    <section aria-label={label} className="mt-4">
      <button type="button" aria-expanded={!closed} onClick={() => uiStore.getState().toggleNav(id)}
        className="mb-0.5 flex h-7 items-center gap-1 rounded-control pl-[9px] pr-2 text-mini font-medium text-ink-3 hover:bg-sidebar-hover">
        {label}<Icon name="caret" size={12} className={`transition-transform duration-150 ${closed ? "-rotate-90" : ""}`} />
      </button>
      {!closed && children}
    </section>
  );
}

function TeamItem({ id, team, route }: { id: number; team: Team | undefined; route: Route }) {
  const closed = useUi((u) => u.navCollapsed.includes(`team:${id}`));
  const name = team?.name ?? `Team ${id}`;
  const here = route.name === "team" && route.teamId === id ? route.tab : null;
  const ui = uiStore.getState();
  const go = (tab: TeamTab) => () => ui.navigate({ name: "team", teamId: id, tab });
  return (
    <li>
      <div className="group/team relative flex items-center">
        <button type="button" aria-expanded={!closed} onClick={() => ui.toggleNav(`team:${id}`)} className={`${cls(false)} w-full gap-[5px] pl-[9px]`}>
          <Tile id={id} name={name} size={16} />
          <span className="truncate">{name}</span>
          <Icon name="caret" size={16} className={`ml-px text-ink-4 transition-transform duration-150 ${closed ? "-rotate-90" : ""}`} />
        </button>
        <span className="absolute right-1 opacity-0 group-hover/team:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          <MenuButton label={`${name} menu`} align="right" width={160}
            entries={[{ id: "hide", label: "Hide team", onSelect: () => ui.hideTeam(id) }]}
            button={({ open, toggle }) => <IconButton size={24} label="Team menu" icon="more" aria-expanded={open} onClick={toggle} />} />
        </span>
      </div>
      {!closed && (
        <ul aria-label={`${name} views`} className="flex flex-col gap-px">
          <li><NavItem indent icon="issues" label="Stories" on={here !== null && ISSUE_TABS.includes(here)} onClick={go("active")} /></li>
          <li><NavItem indent icon="cycles" label="Sprints" on={here === "cycles"} onClick={go("cycles")} /></li>
          <li><NavItem indent icon="project" label="Features" on={here === "projects"} onClick={go("projects")} /></li>
        </ul>
      )}
    </li>
  );
}

/** §18.8: workspace header with search and compose, My issues, Workspace, Your teams, and help at the bottom. */
export function Sidebar() {
  const meta = useApp((s) => s.meta);
  const yours = useApp((s) => s.yourTeamIds);
  const teams = useApp((s) => s.teams);
  const route = useUi((u) => u.route);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const ids = useMemo(() => sidebarTeamIds(yours, joined, hidden), [yours, joined, hidden]);
  const ui = uiStore.getState();
  const ws = meta?.workspace ?? { id: 0, name: "Mira" };
  return (
    <nav aria-label="Main" className="flex w-(--size-sidebar) shrink-0 flex-col overflow-y-auto px-3 pb-3 pt-4">
      <div className="mb-2 flex h-7 items-center gap-1">
        <div className="min-w-0"><MenuButton label="Workspace menu" width={200}
          entries={() => {
            const ui = uiStore.getState();
            return [
              { id: "settings", label: "Settings", onSelect: () => ui.navigate({ name: "settings", section: "preferences" }) },
              { id: "theme", label: "Toggle theme", onSelect: () => ui.toggleTheme() },
              { id: "shortcuts", label: "Keyboard shortcuts", onSelect: () => ui.setCheatsheet(true) },
            ];
          }}
          button={({ open, toggle }) => (
            <button type="button" aria-label={`${ws.name} menu`} aria-expanded={open} onClick={toggle}
              className="flex h-7 max-w-full items-center gap-1.5 rounded-[10px] pl-[5px] pr-[9px] hover:bg-sidebar-hover">
              <Tile id={ws.id} name={ws.name} size={20} radius={8} />
              <span className="truncate font-[550] text-ink-1">{ws.name}</span>
              <Icon name="chevron" size={8} className="text-ink-3" />
            </button>
          )} /></div>
        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Search workspace" icon="search" bordered={false} onClick={() => ui.openPalette()} />
          <IconButton label="Create new story" icon="compose" className="!bg-panel !text-ink-1" onClick={() => ui.openComposer(null)} />
        </span>
      </div>
      <NavItem icon="myIssues" label="My stories" on={route.name === "my"} onClick={() => ui.navigate({ name: "my", tab: "assigned" })} />
      <Section id="workspace" label="Workspace">
        <NavItem icon="initiatives" label="Capabilities" on={route.name === "initiatives"} onClick={() => ui.navigate({ name: "initiatives" })} />
        <NavItem icon="project" label="Features" on={route.name === "projects"} onClick={() => ui.navigate({ name: "projects" })} />
      </Section>
      <Section id="teams" label="Your teams">
        {ids.length === 0
          ? <p className="px-2 text-mini text-ink-3">No teams yet. Open one from ⌘K.</p>
          : <ul className="flex flex-col gap-px">{ids.map((id) => <TeamItem key={id} id={id} team={teams[id]} route={route} />)}</ul>}
      </Section>
      <div className="mt-auto flex items-center gap-1 pt-4">
        <MenuButton label="Help" width={200} side="above" entries={helpEntries}
          button={({ open, toggle }) => <IconButton size={24} label="Open Help menu" icon="help" aria-expanded={open} onClick={toggle} />} />
      </div>
    </nav>
  );
}

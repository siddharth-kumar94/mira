import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../components/icons";
import { MenuButton, type MenuEntry } from "../components/Menu";
import { Tile } from "../components/ui";
import { MainFrame } from "../components/ViewFrame";
import type { Route, SettingsSection } from "../route";
import { uiStore, useApp, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";

/** Which nav item is current: a section, or one of your teams. */
export type SettingsNavKey = SettingsSection | { teamId: number };

interface NavItem { key: string; label: string; icon: ReactNode; route: Route }

const keyOf = (section: SettingsNavKey) => (typeof section === "string" ? section : `team:${section.teamId}`);

/** inventory-p4 §5.1: items 28 tall, radius 8, pad-left 10, a 16 icon 6 before the label, 13/500; active `selected`, hover `sidebar-hover`. */
function Item({ item, on }: { item: NavItem; on: boolean }) {
  return (
    <li>
      <button type="button" aria-current={on ? "page" : undefined} onClick={() => uiStore.getState().navigate(item.route)}
        className={`flex h-7 w-full items-center gap-1.5 rounded-control pl-2.5 pr-1 text-left text-small font-medium transition-colors duration-150 ${on ? "bg-selected text-ink-1" : "text-ink-nav hover:bg-sidebar-hover"}`}>
        {item.icon}<span data-part="label" className="truncate">{item.label}</span>
      </button>
    </li>
  );
}

/** §19.10: "‹ Back to app", a search field, then Personal, Administration and Your teams. */
function SettingsNav({ section }: { section: SettingsNavKey }) {
  const [query, setQuery] = useState("");
  const yours = useApp((s) => s.yourTeamIds);
  const teams = useApp((s) => s.teams);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const ids = useMemo(() => sidebarTeamIds(yours, joined, hidden), [yours, joined, hidden]);
  const groups: { label: string; items: NavItem[] }[] = [
    { label: "Personal", items: [
      { key: "preferences", label: "Preferences", icon: <Icon name="display" size={16} />, route: { name: "settings", section: "preferences" } },
      { key: "account", label: "Account", icon: <Icon name="person" size={16} />, route: { name: "settings", section: "account" } },
    ] },
    { label: "Administration", items: [
      { key: "teams", label: "Teams", icon: <Icon name="team" size={16} />, route: { name: "settings", section: "teams" } },
    ] },
    { label: "Your teams", items: ids.map((id) => {
      const name = teams[id]?.name ?? `Team ${id}`;
      return { key: `team:${id}`, label: name, icon: <Tile id={id} name={name} size={14} />, route: { name: "team-settings", teamId: id } };
    }) },
  ];
  const q = query.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);
  const current = keyOf(section);
  return (
    <nav aria-label="Settings" className="flex w-(--size-sidebar) shrink-0 flex-col overflow-y-auto px-3 pb-3">
      <button type="button" onClick={() => { const ui = uiStore.getState(); ui.navigate(ui.appRoute); }}
        className="ml-1 mt-4 inline-flex h-7 w-fit items-center gap-1.5 rounded-full border border-transparent pl-1.5 pr-3 text-small font-medium text-ink-nav transition-colors duration-150 hover:bg-pill-on">
        <Icon name="chevronLeft" size={14} />Back to app
      </button>
      <div className="relative mt-[12.5px]">
        <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1.5 text-ink-1" />
        <input type="search" aria-label="Search settings" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="h-7 w-full rounded-control border border-line-frame bg-surface pl-8 pr-[25px] text-small font-medium text-ink-1 shadow-comment placeholder:text-ink-nav" />
      </div>
      {shown.map((g) => (
        <section key={g.label} aria-label={g.label} className="mt-4 first-of-type:mt-[29.5px]">
          <h2 className="pl-2.5 text-small font-medium leading-4 text-ink-nav">{g.label}</h2>
          <ul className="mt-1.5 flex flex-col gap-px">{g.items.map((i) => <Item key={i.key} item={i} on={i.key === current} />)}</ul>
        </section>
      ))}
    </nav>
  );
}

/** `/settings/*` (§19.10): the settings nav in place of the app sidebar, and a centred 640 column on `panel`. */
export function SettingsShell({ section, children }: { section: SettingsNavKey; children: ReactNode }) {
  return (
    <>
      <SettingsNav section={section} />
      <MainFrame>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-[640px] max-w-full pb-16 pt-16">{children}</div>
        </div>
      </MainFrame>
    </>
  );
}

/** The page title: 24/500/32 `ink-1`, 16 in from the column (inventory-p4 §5.1). */
export function SettingsPage({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <>
      <h1 className="px-4 text-title font-medium leading-8 tracking-[-0.16px] text-ink-1">{title}</h1>
      {children}
    </>
  );
}

/** A heading (15/500/23, 32 below the title and 48 below the previous card) over a card. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-8 [&+&]:mt-12">
      <h2 className="px-4 text-regular font-medium leading-[23px] text-ink-1">{title}</h2>
      <SettingsCard className="mt-4">{children}</SettingsCard>
    </section>
  );
}

/** inventory-p4 §5.2: `surface`, radius 10, `shadow-card`. */
export function SettingsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`rounded-[10px] bg-surface shadow-card ${className}`}>{children}</ul>;
}

/** The 1px `line-frame` separator above every row but the first, inset 16. */
export const ROW_SEPARATOR = "not-first:before:absolute not-first:before:inset-x-4 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line-frame";

/** A row's 13/500 title over its 12/450 `ink-3` description. */
export function RowText({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span data-part="row-title" className="truncate text-small font-medium leading-4 text-ink-1">{title}</span>
      {description !== undefined && <span className="mt-[3px] truncate text-mini leading-[15px] text-ink-3">{description}</span>}
    </div>
  );
}

/** inventory-p4 §5.3: the 32×32 tile before a row's title (lch 94.5, radius 6), 12 before the text. */
export function SettingsIconTile({ children }: { children: ReactNode }) {
  return <span data-part="icon-tile" aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-fill-tile text-ink-3">{children}</span>;
}

/** A 66-tall row: an optional icon tile, a 13/500 title over a 12/450 `ink-3` description, the control on the right, 1px `line-frame` separators inset 16. */
export function SettingsRow({ title, description, icon, children }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return (
    <li className={`relative flex h-[66px] items-center gap-4 px-4 ${ROW_SEPARATOR}`}>
      {icon === undefined ? <RowText title={title} description={description} />
        : <div className="flex min-w-0 items-center gap-3">{icon}<RowText title={title} description={description} /></div>}
      {children !== undefined && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
    </li>
  );
}

/** A select-like button (30h, radius 8, 13/400 `ink-2`, pad 1 28 1 10, chevron on the right) that opens a menu of choices. */
export function SettingsSelect({ label, value, entries }: { label: string; value: string; entries: MenuEntry[] }) {
  return (
    <MenuButton label={label} entries={entries} align="right" width={160} shadow="menu"
      button={({ open, toggle }) => (
        <button type="button" aria-label={`${label}: ${value}`} aria-expanded={open} onClick={toggle}
          className="relative inline-flex h-[30px] items-center rounded-control border border-transparent bg-surface py-px pl-2.5 pr-7 text-small font-[400] text-ink-2 shadow-card transition-colors duration-150 hover:bg-hover-soft">
          {value}
          <Icon name="chevron" size={14} className="absolute right-2.5 text-ink-3" />
        </button>
      )} />
  );
}

/** A 32-tall text pill on the right of a row ("Customize" in Linear: 13/500 `ink-2`, pad 0 12, overhanging the row padding by 6). */
export function SettingsButton({ children, onClick, disabled }: { children: ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="-mr-1.5 inline-flex h-8 items-center rounded-full border border-transparent px-3 text-small font-medium text-ink-2 transition-colors duration-150 hover:bg-pill-on disabled:opacity-50">
      {children}
    </button>
  );
}

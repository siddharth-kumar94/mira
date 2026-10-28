import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { Popover } from "./Popover";
import { Glyphs, Keys } from "./ui";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Muted text after the label: a count ("5 issues"), a date range, a team. */
  hint?: ReactNode;
  /** A keycap shortcut ("1", "⇧ P"). A single digit also picks the item while the filter is empty (§18.9). */
  keys?: string;
  /** Bare glyph shortcut, as in the context menu (§18.7). */
  glyphs?: string;
  /** Defined for choosable values: shows a check when true, and the item reads as a checkbox. */
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  /** The hint follows the label, 8 after it, instead of sitting on the right (the cycle switcher's dates). */
  inlineHint?: boolean;
  /** A section heading above this item ("Next cycle (upcoming)"): 30 tall, pad 8 14, 12/500 `ink-3` (cycle switcher). */
  section?: string;
  /** A submenu, opening to the right. */
  items?: MenuEntry[];
  /** The submenu starts with a "Filter…" input. */
  filterable?: boolean;
  width?: number;
  /** Stay open after choosing (filters toggle several values). */
  keepOpen?: boolean;
  /** The submenu's filter text, after a pause: a lookup the cache can't answer (workspace people, D16). */
  onQuery?(q: string): void;
  onSelect?(): void;
}
export type MenuEntry = MenuItem | "divider";

interface MenuProps {
  label: string;
  entries: MenuEntry[];
  onClose(): void;
  /** A filter input at the top, with this placeholder. */
  placeholder?: string;
  /** A keycap shown in the input row ("F" on the Filter menu). */
  inputKeys?: string;
  width?: number;
  className?: string;
  style?: CSSProperties;
  /** True for a submenu: ArrowLeft closes it. */
  submenu?: boolean;
  /** "menu" is the lighter picker shadow (§18.11); the default is the palette's. */
  shadow?: "palette" | "menu";
  /** Closes the whole menu tree after a leaf is chosen (set by the parent menu). */
  onDone?(): void;
  /** No input row: typing filters the items, Backspace undoes (Linear's health picker, inventory-p4 §2.4). */
  typeahead?: boolean;
  /** Hears the filter text (trimmed) once typing pauses for 300ms, as ⌘K's remote lookups do. */
  onQuery?(q: string): void;
}

/** Linear's menus (inventory §4–6, §11): radius 12, 32px items, highlight layer, keycaps, checks, submenus. */
export function Menu({ label, entries, onClose, placeholder, inputKeys, width = 206, className = "", style, submenu = false, shadow = "palette", onDone, typeahead = false, onQuery }: MenuProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [flipLeft, setFlipLeft] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const visible = entries.filter((e) => (e === "divider" ? !q : e.label.toLowerCase().includes(q)));
  const items = visible.filter((e): e is MenuItem => e !== "divider");
  const done = onDone ?? onClose;

  useEffect(() => {
    if (placeholder === undefined) ref.current?.focus();
  }, [placeholder]);

  const text = query.trim();
  useEffect(() => {
    if (!onQuery || !text) return;
    const timer = setTimeout(() => onQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusSelf = () => (inputRef.current ?? ref.current)?.focus();

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.items) return setOpen(item.id);
    item.onSelect?.();
    if (!item.keepOpen) done();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A submenu is a DOM child: its keys are its own, not ours.
    if ((e.target as HTMLElement).closest('[role="menu"]') !== ref.current) return;
    const field = e.target instanceof HTMLInputElement ? e.target : null;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    const move = (d: number) => {
      handled();
      if (items.length) setActive((a) => (a + d + items.length) % items.length);
    };
    if (e.key === "ArrowDown") return move(1);
    if (e.key === "ArrowUp") return move(-1);
    if (e.key === "Enter") {
      handled();
      const item = items[active];
      if (item) choose(item);
      return;
    }
    if (e.key === "ArrowRight" && items[active]?.items && !(field && field.selectionStart !== field.value.length)) {
      handled();
      setOpen(items[active].id);
      return;
    }
    if (e.key === "Escape" || (submenu && e.key === "ArrowLeft" && !(field && (field.selectionStart ?? 0) > 0))) {
      handled();
      onClose();
      return;
    }
    if (typeahead && !field && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === "Backspace")) {
      handled();
      setQuery((t) => (e.key === "Backspace" ? t.slice(0, -1) : t + e.key));
      setActive(0);
      return;
    }
    if (!q && /^\d$/.test(e.key)) {
      const item = items.find((x) => x.keys === e.key);
      if (item) {
        handled();
        choose(item);
      }
      return;
    }
    // A glyph letter opens or runs the matching row (§18.7).
    if (!q && !field && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
      const item = items.find((x) => x.glyphs?.toLowerCase().includes(e.key.toLowerCase()));
      if (item) {
        handled();
        choose(item);
        return;
      }
    }
    // Global shortcuts (S, P, J, K, C, F...) never fire while a menu has focus.
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
      e.stopPropagation();
      if (!field) e.preventDefault();
    }
  };

  // A submenu that would run off the right edge opens to the left instead.
  useLayoutEffect(() => {
    // Decided from this menu's own box (the submenu's parent), not the submenu's: a flipped submenu always "fits".
    const item = items.find((x) => x.id === open);
    setFlipLeft(!!item?.items && !!ref.current && ref.current.getBoundingClientRect().right + 4 + (item.width ?? 220) > window.innerWidth);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} style={{ width, ...style }}
      className={`z-40 rounded-palette border-[0.5px] border-line-menu bg-surface pb-1 text-small ${shadow === "menu" ? "shadow-menu" : "shadow-palette"} ${placeholder === undefined ? "pt-1" : ""} ${className}`}>
      {placeholder !== undefined && (
        <div className="mb-1 flex h-9 items-center gap-2 border-b-[0.5px] border-line-menu px-3">
          <input ref={inputRef} autoFocus aria-label={placeholder} placeholder={placeholder} value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            className="min-w-0 flex-1 bg-transparent text-small font-[400] text-ink-1 placeholder:text-ink-4" />
          {inputKeys && <kbd className="flex h-[17px] min-w-[18px] items-center justify-center rounded-[4px] border-[0.5px] border-line-menu px-1 text-[11px] font-[400] text-ink-3">{inputKeys}</kbd>}
        </div>
      )}
      {typeahead && <span role="status" className="sr-only">{q ? `Showing ${items.length} of ${entries.filter((e) => e !== "divider").length} items` : "Showing all items"}</span>}
      {visible.map((e, i) => {
        if (e === "divider") return <div key={`divider-${i}`} role="separator" className="mx-0 my-[5.5px] border-t-[0.5px] border-line-menu" />;
        const index = items.indexOf(e);
        return (
          <div key={e.id} className="relative">
            {e.section && <div role="presentation" className="flex h-[30px] items-center px-[14px] text-mini font-medium text-ink-3">{e.section}</div>}
            <div role={e.checked !== undefined ? "menuitemcheckbox" : "menuitem"} aria-checked={e.checked} aria-disabled={e.disabled || undefined} aria-label={e.label}
              aria-haspopup={e.items ? "menu" : undefined} aria-expanded={e.items ? open === e.id : undefined} title={e.title}
              data-active={index === active}
              onMouseEnter={() => { setActive(index); setOpen(e.items ? e.id : null); }}
              onClick={() => choose(e)}
              className="relative isolate flex h-8 cursor-default items-center gap-2.5 pl-[13.5px] pr-[18px] text-ink-2 before:absolute before:inset-x-0 before:inset-y-0.5 before:-z-10 before:rounded-control data-[active=true]:text-ink-1 data-[active=true]:before:bg-highlight aria-disabled:opacity-50">
              {e.icon && <span aria-hidden className="flex w-4 shrink-0 justify-center text-ink-3">{e.icon}</span>}
              <span className={`min-w-0 truncate ${e.inlineHint ? "" : "flex-1"}`}>{e.label}</span>
              {e.hint && <span className={`shrink-0 text-ink-4 ${e.inlineHint ? "-ml-0.5 mr-auto" : ""}`}>{e.hint}</span>}
              {e.checked && <Icon name="check" size={16} className="text-ink-1" />}
              <Keys keys={e.keys} />
              <Glyphs keys={e.glyphs} />
              {e.items && <Icon name="chevronRight" size={12} className="ml-px text-ink-3" />}
            </div>
            {e.items && open === e.id && (
              <Menu label={e.label} entries={e.items} submenu placeholder={e.filterable ? "Filter…" : undefined} onQuery={e.onQuery}
                onClose={() => { setOpen(null); focusSelf(); }} onDone={done} width={e.width ?? 220} className={`absolute top-0 ${flipLeft ? "right-full mr-1" : "left-full ml-1"}`} />
            )}
          </div>
        );
      })}
      {items.length === 0 && <div className="px-3 py-2 text-ink-3">No results</div>}
    </div>
  );
}

/** A button that opens a Menu under it: Display dropdowns, composer chips, options menus. */
export function MenuButton({ label, entries, button, placeholder, width, align = "left", side = "below", shadow, onQuery }: {
  label: string; entries: MenuEntry[] | (() => MenuEntry[]); button: (p: { open: boolean; toggle(): void }) => ReactNode;
  placeholder?: string; width?: number; align?: "left" | "right"; side?: "below" | "above"; shadow?: "palette" | "menu";
  onQuery?(q: string): void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const trigger = useRef<HTMLSpanElement>(null);
  // Closing from inside the menu (Esc, a choice) hands focus back to the button; an outside click does not.
  const closeAndRestore = useCallback(() => {
    setOpen(false);
    trigger.current?.querySelector<HTMLElement>("button, [href], input, [tabindex]")?.focus();
  }, []);
  return (
    <Popover open={open} onClose={close} button={<span ref={trigger} className="contents">{button({ open, toggle: () => setOpen((o) => !o) })}</span>}>
      <Menu label={label} entries={typeof entries === "function" ? entries() : entries} onClose={closeAndRestore} placeholder={placeholder} onQuery={onQuery}
        width={width} shadow={shadow} className={`absolute ${side === "above" ? "bottom-full mb-1" : "top-full mt-1"} ${align === "right" ? "right-0" : "left-0"}`} />
    </Popover>
  );
}

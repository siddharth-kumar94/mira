import type { ButtonHTMLAttributes, ReactNode } from "react";
import { initials } from "./Avatar";
import { Icon, type IconName } from "./icons";

/** A 24px property chip (§18.3): fully rounded, 0.5px line-menu border, panel fill (surface on cards), 12/450 ink-3. */
/** `strong`: the project chip's 1px `line-3` border (spec §19.4, cycle-points.json). */
export function Chip({ icon, children, title, surface = false, strong = false }: {
  icon?: ReactNode; children?: ReactNode; title?: string; surface?: boolean; strong?: boolean;
}) {
  return (
    <span title={title} className={`inline-flex h-6 max-w-48 shrink-0 items-center gap-1.5 rounded-full px-2 text-mini text-ink-3 ${strong ? "border border-line-3" : "border-[0.5px] border-line-menu"} ${surface ? "bg-surface" : "bg-panel"}`}>
      {icon}
      {children !== undefined && <span className="truncate">{children}</span>}
    </span>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string; icon: IconName; size?: 24 | 28; bordered?: boolean; dot?: boolean;
};

/** Linear's round icon buttons (§18.2): 28px bordered on toolbars, 24px bare in headers and rows. */
export function IconButton({ label, icon, size = 28, bordered = size === 28, dot = false, className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-1 ${size === 28 ? "size-7" : "size-6"} ${bordered ? "border-[0.5px] border-line-menu bg-surface" : ""} ${className}`}>
      <Icon name={icon} size={14} />
      {dot && <span data-dot aria-hidden className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-focus" />}
    </button>
  );
}

const SWITCH = {
  menu: { track: "h-3.5 w-[22px]", knob: "top-0.5 size-2.5", on: "left-[10px]", off: "left-0.5" },
  settings: { track: "h-5 w-[30px]", knob: "top-[3px] size-3.5", on: "left-[13px]", off: "left-[3px]" },
} as const;

/** 22×14 in menus (§18.5), 30×20 in settings (§19.2): switch-off track, accent when on. */
export function Switch({ checked, onChange, label, size = "menu", disabled }: {
  checked: boolean; onChange(next: boolean): void; label: string; size?: keyof typeof SWITCH; disabled?: boolean;
}) {
  const s = SWITCH[size];
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative ${s.track} shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50 ${checked ? "bg-accent" : "bg-switch-off"}`}>
      <span aria-hidden className={`absolute ${s.knob} rounded-full bg-white shadow-sm transition-[left] duration-150 ${checked ? s.on : s.off}`} />
    </button>
  );
}

/** One box per key (§18.9): "⇧ P" is two keycaps, each 20×21 at 11/450 with a 0.5px border and radius 3. */
export function Keys({ keys }: { keys?: string }) {
  if (!keys) return null;
  return (
    <span className="ml-auto flex shrink-0 gap-[3px]">
      {keys.split(" ").map((k, i) => (
        <kbd key={`${k}${i}`} className="inline-flex h-[21px] min-w-5 items-center justify-center rounded-[3px] border-[0.5px] border-line-menu px-1 font-sans text-[11px] font-normal text-ink-3">{k}</kbd>
      ))}
    </span>
  );
}

/** Bare shortcut glyphs, as in Linear's context menu (§18.7). */
export function Glyphs({ keys }: { keys?: string }) {
  if (!keys) return null;
  return <span className="ml-auto shrink-0 pl-3 text-[11px] font-medium text-ink-3">{keys}</span>;
}

const TILE_COLORS = ["lch(70 60 50)", "lch(62 70 125)", "lch(58 65 30)", "lch(60 50 265)", "lch(65 45 200)", "lch(60 60 330)", "lch(72 60 85)", "lch(55 40 160)"];
export const tileColor = (id: number) => TILE_COLORS[Math.abs(id) % TILE_COLORS.length];
/** Label dots: a stable colour per name. */
export function labelColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return tileColor(h);
}

/** Teams and the workspace have no icon in Rally: an initials tile in a colour picked by id (assumption 15). */
export function Tile({ id, name, size = 16, radius }: { id: number; name: string; size?: number; radius?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center font-medium text-white"
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size / 4), background: tileColor(id), fontSize: Math.max(8, Math.round(size * 0.5)) }}>
      {initials(name).slice(0, size < 18 ? 1 : 2)}
    </span>
  );
}

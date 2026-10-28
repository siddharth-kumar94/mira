import type { User } from "../api/types";

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
}

function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ user, size = 18 }: { user: User | null; size?: number }) {
  if (!user) {
    return <span aria-label="Unassigned" className="inline-block shrink-0 rounded-full border border-dashed border-line-3" style={{ width: size, height: size }} />;
  }
  return (
    <span title={user.name} aria-label={user.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-medium text-white"
      style={{ width: size, height: size, background: `lch(60% 40 ${hue(user.name)})` }}>
      {initials(user.name)}
    </span>
  );
}

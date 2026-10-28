import { HEALTH_LABEL, type Health, type Update } from "../api/types";

/** Linear's age units, smallest first: the cut-over in seconds, the short suffix and the spoken word. */
const UNITS = [
  { below: 3600, size: 60, short: "m", long: "minute" },
  { below: 86_400, size: 3600, short: "h", long: "hour" },
  { below: 7 * 86_400, size: 86_400, short: "d", long: "day" },
  { below: 30 * 86_400, size: 7 * 86_400, short: "w", long: "week" },
  { below: 365 * 86_400, size: 30 * 86_400, short: "mo", long: "month" },
  { below: Infinity, size: 365 * 86_400, short: "y", long: "year" },
] as const;

function split(iso: string, now: number): { n: number; unit: (typeof UNITS)[number] } | null {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return null;
  const unit = UNITS.find((u) => s < u.below)!;
  return { n: Math.floor(s / unit.size), unit };
}

/** The health chip's age: "now", "5m", "2h", "3d", "2w", "4mo" (ruling 9). */
export function age(iso: string, now: number): string {
  const a = split(iso, now);
  return a ? `${a.n}${a.unit.short}` : "now";
}

/** The same age for screen readers: "just now", "1 day ago", "3 days ago". */
function spokenAge(iso: string, now: number): string {
  const a = split(iso, now);
  return a ? `${a.n} ${a.unit.long}${a.n === 1 ? "" : "s"} ago` : "just now";
}

/**
 * What the chip shows. Auto health puts "Auto" in the age slot (D36); no target is "No updates". No health at all
 * (null) means not read yet: issue-side reads carry projects without it, while the PM reads always send one.
 */
export function healthText(h: Health | null, latest: Update | null, now: number): { label: string; age: string | null; none: boolean } {
  if (!h) return { label: "", age: null, none: true };
  if (h.value === "no_target") return { label: "No updates", age: null, none: true };
  const label = HEALTH_LABEL[h.value];
  if (h.source === "auto") return { label, age: "Auto", none: false };
  return { label, age: latest ? age(latest.created_at, now) : null, none: false };
}

/** The on-screen word for a kind of update-bearing item: the kind keys stay, the words are Rally's. */
export const PM_NOUN = { project: "feature", initiative: "capability" } as const;

/**
 * Linear's aria text: "Off track, last update 3 days ago. Click to open updates." on the chip,
 * without the click hint on icon-only cells, which read "There are no updates for this feature" when empty.
 */
export function healthAria(h: Health | null, latest: Update | null, kind: "project" | "initiative", now: number, iconOnly = false): string {
  if (!h) return ""; // not read yet: nothing to say
  if (h.value === "no_target") return iconOnly ? `There are no updates for this ${PM_NOUN[kind]}` : "No updates. Click to write update.";
  const label = HEALTH_LABEL[h.value];
  const hint = latest ? "Click to open updates." : "Click to write update.";
  const said = h.source === "auto"
    ? `${label}, set automatically${h.reason ? `: ${h.reason}` : ""}`
    : latest ? `${label}, last update ${spokenAge(latest.created_at, now)}` : label;
  return iconOnly ? said : `${said}. ${hint}`;
}

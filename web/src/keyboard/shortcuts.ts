export type Action =
  | "down" | "up" | "open-peek" | "open-page" | "create" | "toggle-select" | "palette" | "cheatsheet" | "escape"
  | "filter" | "toggle-layout" | "copy-id" | "assign-me"
  | "pick-status" | "pick-priority" | "pick-assignee" | "pick-labels" | "pick-project" | "pick-cycle" | "pick-estimate"
  | "go-my-issues" | "go-projects" | "go-initiatives";

export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; target: EventTarget | null }

const SINGLE: Record<string, Action> = {
  j: "down", k: "up", " ": "open-peek", Enter: "open-page", c: "create", x: "toggle-select", "?": "cheatsheet", f: "filter",
  s: "pick-status", p: "pick-priority", a: "pick-assignee", i: "assign-me", l: "pick-labels",
};
const SHIFTED: Record<string, Action> = { p: "pick-project", c: "pick-cycle", e: "pick-estimate" };
const AFTER_G: Record<string, Action> = { m: "go-my-issues", p: "go-projects", n: "go-initiatives" };

/** Inputs you don't type into: a focused row checkbox must not swallow J/K/S/X. */
const NON_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  if (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(target.type)) return true;
  return target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/** Buttons, links and checkboxes use Space/Enter themselves. */
function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('button, a[href], [role="button"], input[type="checkbox"]') !== null;
}

/** Linear's keys (spec §10). Typing in a field never triggers a shortcut, except ⌘K and Escape. */
export function resolveKey(e: KeyLike, prefix: "g" | null): { action?: Action; prefix: "g" | null } {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return { action: "palette", prefix: null };
  if (e.key === "Escape") return { action: "escape", prefix: null };
  if (isTypingTarget(e.target)) return { prefix: null };
  if ((e.metaKey || e.ctrlKey) && e.key === ".") return { action: "copy-id", prefix: null };
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") return { action: "toggle-layout", prefix: null };
  if (e.metaKey || e.ctrlKey || e.altKey) return { prefix: null };
  if ((e.key === " " || e.key === "Enter") && isActivatable(e.target)) return { prefix: null }; // native activation wins
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; // Caps Lock sends capitals without Shift
  if (prefix === "g") return { action: AFTER_G[key], prefix: null };
  if (e.shiftKey && /^[a-z]$/.test(key)) return { action: SHIFTED[key], prefix: null }; // ⇧P, ⇧C, ⇧E
  if (key === "g") return { prefix: "g" };
  return { action: SINGLE[key], prefix: null };
}

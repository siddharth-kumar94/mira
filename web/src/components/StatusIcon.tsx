import { STATUS_LABEL, type Status } from "../api/types";

export const STATUS_COLOR: Record<Status, string> = {
  backlog: "var(--color-status-backlog)", todo: "var(--color-status-todo)", in_progress: "var(--color-status-progress)",
  in_review: "var(--color-status-review)", done: "var(--color-status-done)",
};

/** Linear's status marks (inventory §13): dashed ring, ring, ring with a half disc, ring with a 3/4 disc, filled check. */
export function StatusIcon({ status, size = 14, mono = false }: { status: Status; size?: number; mono?: boolean }) {
  const c = mono ? "var(--color-status-completed)" : STATUS_COLOR[status];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={STATUS_LABEL[status]} className="shrink-0">
      {status === "done"
        ? <circle cx="7" cy="7" r="6" fill={c} stroke={c} strokeWidth="1.5" />
        : <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={status === "backlog" ? "1.571 1.571" : undefined} />}
      {status === "in_progress" && <path d="M7 3a4 4 0 0 1 0 8z" fill={c} />}
      {status === "in_review" && <path d="M7 3a4 4 0 1 1-4 4h4z" fill={c} />}
      {status === "done" && <path d="M3.7 7.6 5.8 9.7l4.6-4.8" fill="none" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

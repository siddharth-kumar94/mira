import { PRIORITY_LABEL, type Priority } from "../api/types";

const FILLED: Record<2 | 3 | 4, number> = { 2: 3, 3: 2, 4: 1 }; // High, Medium, Low

/** Linear's priority marks at 16px (inventory §13). `tone="ink"` is the picker's highlighted Urgent. */
export function PriorityIcon({ priority, size = 16, tone = "color" }: { priority: Priority; size?: number; tone?: "color" | "ink" }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", role: "img", "aria-label": PRIORITY_LABEL[priority], className: "shrink-0" };
  if (priority === 1) {
    return (
      <svg {...common}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill={tone === "ink" ? "var(--color-ink-1)" : "var(--color-urgent)"} />
        <path d="M8 4.5v4" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.25" r="0.95" fill="white" />
      </svg>
    );
  }
  if (priority === 0) {
    return <svg {...common}><path d="M3 8h1.5M7.25 8h1.5M11.5 8h1.5" stroke="var(--color-priority)" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
  return (
    <svg {...common}>
      {[0, 1, 2].map((n) => (
        <rect key={n} x={1.5 + n * 5} y={8 - n * 3} width="3" height={6 + n * 3} rx="1"
          fill="var(--color-priority)" fillOpacity={n < FILLED[priority] ? 1 : 0.4} />
      ))}
    </svg>
  );
}

/**
 * §18.2: 28px fully rounded pills, 10px padding, 12/500, 8px apart; active tab-active fill, inactive surface with a 0.5px border.
 * `tight` is the project page's Overview / Activity / Issues (project-overview-controls.json): 4 apart, 1px borders (76, 66, 59 wide).
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, tight = false }: {
  label: string; tabs: [T, string][]; value: T; onChange(tab: T): void; tight?: boolean;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex items-center ${tight ? "gap-1" : "gap-2"}`}>
      {tabs.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`h-7 rounded-full px-2.5 text-mini font-medium transition-colors duration-150 ${value === v ? `bg-tab-active text-ink-1 ${tight ? "border border-transparent" : ""}` : `${tight ? "border" : "border-[0.5px]"} border-line-menu bg-surface text-ink-3 hover:bg-hover`}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

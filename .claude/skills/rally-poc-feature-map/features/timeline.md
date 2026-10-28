# Timeline

Last verified: f064d7ee53a4 on 2026-10-20 (live)

The Timeline layout of Features (`/projects` opens on it; a team's Features can switch to it from Display): a left panel of feature rows and a canvas of bars from planned start to target date, with a Today line and zoom. It is read-only: bars are not dragged (D24). PMs use it. It lives in `web/src/pm/ProjectTimeline.tsx` over the pure geometry in `web/src/pm/timeline.ts`. Overall: beta. It draws the user's real features, overruns and PI bands correctly, but Month and Week zoom and Show sprints were never driven live, and one band defect is known.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| timeline-canvas | Left panel (cube, name, icon-only health, status, lead; priority only with the field) and a canvas of bars with the name above each bar, uppercase month labels with day numbers, a dashed grid, and rows without dates kept with no bar | beta | UI | 51db3db | 2026-10-20 | `web/src/pm/ProjectTimeline.tsx:59`, `web/src/pm/ProjectTimeline.test.tsx::the left panel: cube, name, icon-only health, status, priority (with its field) and lead; undated projects keep their row`, `::bars: the name sits above the bar (bar top − 19); an overdue open project overruns to the today line`, `web/src/pm/timeline.test.ts::a bar spans its start day to the end of its target day`, flow `projects`, dry run scenario 7 |
| timeline-today | A Today line and an accent "OCT 20" pill in the header, the canvas centred on today on arrival and after "Today" | beta | UI | 89cac8d | 2026-10-20 | `ProjectTimeline.tsx:111`, `ProjectTimeline.tsx:188`, `timeline.test.ts::the today pill reads Linear's uppercase month and day`, `ProjectTimeline.test.tsx::the today pill reads today's month and day in capitals`, dry run scenario 7 |
| timeline-overrun | A feature whose target is past and that is not Completed extends its bar to today in a pink block with a dashed edge | beta | UI | 51db3db | 2026-10-20 | `ProjectTimeline.tsx:34-44`, `timeline.test.ts::overrun: today past the target and not Completed; Completed, on-time or target today have none`, flow `projects` (the seeded [DEMO] feature that is a week late overruns), dry run scenario 7 (overrun bars on the first screen); Linear's checker edge is a 6px approximation |
| timeline-zoom | Year, Quarter, Month and Week at 2.5, 5, 15 and 30 px per day, keys Y, Q, M, W (not while typing), ⌘⌥Z opens the menu | beta (stable pending live) | UI | 51db3db | not driven | `web/src/pm/timeline.ts:42`, `timeline.test.ts::zoom scales are Linear's, measured: a 31-day month is 77.5 at Year, then 2x, 6x and 12x`, `ProjectTimeline.test.tsx::Y, Q, M and W set the zoom, but not while typing; ⌘⌥Z opens the zoom menu`; only Year ran live; Linear labels Sundays at Month and Week where Mira labels Mondays |
| timeline-show-pis | "Show PIs" (off by default, D37) draws each Release as a full-height band with its name in the header, one per PI across team copies | beta | UI | 5e98999 | 2026-10-20 | `ProjectTimeline.tsx:82-86`, `ProjectTimeline.test.tsx::Show PIs is off by default: no bands; on, one band per PI with its name in the header (deduped across team copies)`, flow `projects` (Show PIs draws bands), dry run scenario 7 (PI 2, PI 3 and PI 4 bands); the bands come from every Release the store has seen, so a team timeline can band another team's PI |
| timeline-show-cycles | "Show sprints" draws the chosen team's iterations as lighter bands numbered in the header; it loads them when needed | beta (stable pending live) | UI | 51db3db | not driven | `ProjectTimeline.tsx:90`, `ProjectTimeline.test.tsx::Show cycles draws the chosen team's cycles, lighter, numbered in the header; it loads them when needed`; there is no retry after a failed sprints load |
| timeline-open | Clicking a bar or a row opens the feature; a bar is not draggable | stable | UI | 51db3db | 2026-10-20 | `ProjectTimeline.test.tsx::clicking a bar or a row opens the project`, flow `projects` |

## How to get to it (user POV)

1. Open "Features" under "Workspace" in the sidebar. It opens on the timeline.
2. "Today" recentres; the "Year" button changes the zoom. Display › "Show PIs" and "Show sprints" add bands.
3. Click a bar or a row to open the feature.

## Driving it

Preconditions: baseline, then `rallypoc seed`.

- **timeline-canvas**, **timeline-overrun**, **timeline-show-pis**, **timeline-open**: → `rallypoc browser run projects` → PASS: the [DEMO] features show in each layout, one overruns, Show PIs draws bands.
- **timeline-today**: → open http://127.0.0.1:5173/projects → a pill reading today's date in capitals sits on the Today line.
- **timeline-zoom**, **timeline-show-cycles**: not driven.

## Gotchas

- **The first screen is old work.** On the user's workspace the top rows are late PI 2 and PI 3 features with long pink overruns, because the list is in Rally's rank order, not date order.
- **No row virtualisation.** At Year zoom the page holds about 8,500 nodes (ledger Task 12); a very large workspace could scroll slowly.
- **Zoom keys rely on listener order**, so "g w" sets Week and the keys also fire while a menu is open (ledger Task 12).
- **Far-out-of-range bars** widen the scroll extent past the clamp of five years either side.
- **The timeline is read-only on purpose** (D24): nothing drags, so dates change only in Rally.

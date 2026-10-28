# Palette

Last verified: f064d7ee53a4 on 2026-10-20 (live)

Keyboard-first navigation and editing: the ⌘K command palette with its pickers and search, Linear's single-key shortcuts, the right-click row menu, and the sidebar (workspace, teams, sections). Everyone uses it. It lives in `web/src/palette/`, `web/src/keyboard/`, `web/src/components/RowMenu.tsx` and `web/src/components/Sidebar.tsx`. Overall: beta. The pickers and the core keys were driven live; the rest is unit-tested only.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| palette-open | ⌘K opens a palette with the selection as its context chip, no backdrop and no heading before typing; Esc closes | stable | UI | a6ba949 | 2026-10-20 | `web/src/palette/CommandPalette.tsx:19`, `web/src/palette/CommandPalette.test.tsx::no backdrop dimming; the context chip; no heading before typing; one keycap per key`, `palette/commands.test.ts::contextual commands follow Linear's order, with no heading, and their keycaps`, flow `palette` |
| palette-pickers | Status, priority, assignee, feature, sprint, estimate and labels pickers: current value checked, number keys pick, the choice is written and the palette closes; in demo mode only [DEMO] features can be chosen | stable | UI+API | a6ba949 | 2026-10-20 | `web/src/palette/pickers.ts:34`, `CommandPalette.test.tsx::a picker checks the current value; a number key picks; the choice is written and the palette closes`, `palette/pickers.test.ts::project: the targets' teams' open projects; in demo mode only [DEMO] ones can be chosen; never for defects`, flow `palette` (⌘K then P sets priority and puts it back), `check api` api:priority-round-trip, api:status-round-trip |
| palette-search | Typed queries show Quick results (features first, then stories) from the cache and `/api/search`; the assignee picker searches every workspace user | beta (stable pending live) | UI+API | a6ba949 | not driven | `web/src/palette/search.ts`, `CommandPalette.test.tsx::typed queries show Quick results: features first, then stories packed tight`, `::searching finds a cached story and opens it`, `::the assignee picker searches every workspace user`, `server/tests/test_issue_reads.py::test_search_finds_issues_teams_and_projects` |
| palette-keys-core | J/K move, X selects, Space previews, Enter opens, Esc goes back, C creates, P sets priority, ⌘K opens the palette, ⌘B switches List and Board | stable | UI | 868da15 | 2026-10-20 | `web/src/keyboard/shortcuts.ts:33`, `web/src/keyboard/shortcuts.test.ts::Linear's single keys (spec §10)`, `::⌘B toggles the layout, but not while typing`, `keyboard/actions.test.ts::J and K move through the visible rows, and an open peek follows`, flows `my-issues`, `issue-peek`, `composer`, `palette`, dry run scenarios 2 and 6 (⌘B, C) |
| palette-keys-typing | No shortcut fires while typing, except ⌘K and Esc | stable | UI | 868da15 | 2026-10-20 | `web/src/keyboard/shortcuts.ts:19`, `shortcuts.test.ts::typing never triggers a shortcut, except ⌘K and Escape`, `::buttons and checkboxes keep Space and Enter`; dry run: typing a title and a comment fired nothing |
| palette-keys-more | G then M, P or N navigate; S, L, A, I, Shift-picks (feature, sprint, estimate), F filter, ⌘. copy ID, a "?" cheatsheet | beta (stable pending live) | UI | 868da15 | not driven | `shortcuts.test.ts::G then M, P or N`, `::Shift picks project, cycle and estimate; Caps Lock alone keeps the plain meaning`, `keyboard/actions.test.ts::G M, G P, G N navigate; F toggles the filter menu`, `::I assigns to me, and un-assigns when it's already mine`, `web/src/components/Cheatsheet.tsx:11`; ⇧C, ⇧E and G then N are Mira's own (spec §16 #6) |
| palette-row-menu | Right-click a row for Linear's menu with property submenus; on a multi-selection it acts on all of them | beta (stable pending live) | UI | 4f893a4 | not driven | `web/src/components/RowMenu.tsx:48`, `web/src/components/RowMenu.test.tsx::right-click: Linear's items in order, with bare shortcut glyphs`, `::on a multi-selection the menu acts on every selected issue` |
| palette-sidebar | Workspace tile and menu, search, compose button, Workspace section (Capabilities, Features), Your teams with Stories, Sprints, Features; sections collapse and remember it; a team's "…" hides it; "Demo mode" chip while the guard is on | stable | UI | 16acf72 | 2026-10-20 | `web/src/components/Sidebar.tsx:77`, `web/src/components/Sidebar.test.tsx::the header: workspace tile and menu, search, and a compose button that opens the composer`, `::no shortcut hints; sections and teams collapse and remember it`, flows `smoke`, `my-issues`, `vocabulary` (the sidebar, screens and menus read in Rally's words, check ui 18/18 on 2026-10-20), `web/src/test/vocabulary.test.tsx::Rally's words pass`; the help menu and a team's "…" were not clicked live |

## How to get to it (user POV)

1. Press ⌘K anywhere. Type to search, or use the contextual commands and pickers; number keys pick the highlighted choice.
2. Select a row with J/K, then press P (priority), S (status), L (label), I (assign to me) and so on.
3. Right-click a row for the menu. Press "?" for the shortcut sheet.

## Driving it

Preconditions: baseline, then `rallypoc seed`.

- **palette-open**, **palette-pickers**, **palette-keys-core**: → `rallypoc browser run palette` → PASS: ⌘K with the selection as context, then P sets the priority and puts it back.
- **palette-keys-core**: → `rallypoc browser run my-issues` → PASS: J, J, K move one visible selection.
- **palette-sidebar**: → `rallypoc browser run smoke` → PASS: the app loads with the sidebar.
- **palette-search**, **palette-keys-more**, **palette-row-menu**: not driven live.

## Gotchas

- **Caps Lock alone keeps a key's plain meaning** (`shortcuts.test.ts::Shift picks project, cycle and estimate; Caps Lock alone keeps the plain meaning`); only Shift picks the Shift variants (`web/src/keyboard/shortcuts.ts:43`).
- **Space and Enter stay native on buttons and checkboxes**, so they do not preview or open a row while a button has focus (`shortcuts.ts:40`).

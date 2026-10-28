# Team stories

Last verified: f064d7ee53a4 on 2026-10-20 (live)

A team's Stories screen (`/team/<id>/active`, `/backlog`, `/all`): the shared story view as a list or a board, with Display and Filter, drag to change a property, manual rank, and a bulk bar. It lives in `web/src/screens/TeamIssues.tsx` over `web/src/views/`. Everyone uses it. Overall: beta. Board, grouping, rank and drag were driven live on the user's real data and on [DEMO] items; the list's group bars and the All tab were not.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| team-issues-tabs | Active (Todo, In Progress, In Review; no Done, D31), Backlog, All stories (100 per page by updated) | beta | UI+API | 16acf72 | 2026-10-20 | `web/src/screens/TeamIssues.tsx:16`, `web/src/views/model.ts:74`, `model.test.ts::Team tabs: Active excludes Backlog and Done (D31); Backlog is Backlog; All is everything in the team`, `screens/TeamIssues.test.tsx::an unknown team says it can't be found instead of loading forever`; dry run scenario 2 (204 Active stories) and 3 (176 Backlog); the All tab was not opened live |
| team-issues-board | Board: status columns that scroll on their own, cards with chips, `…` and `+`, collapse; dragging a card to another column changes its status | stable | UI | 68a53af | 2026-10-20 | `web/src/views/BoardLayout.tsx:114`, `web/src/views/BoardLayout.test.tsx::columns hold the viewport height and scroll on their own, below a fixed header`, `views/drag.test.ts::dropping into another group sets that group's property`, flow `team-board` (card moved Todo to In Progress and back), dry run scenario 2 |
| team-issues-assignee-groups | Group by Assignee: you first, then people by name, No assignee last, empty groups on request; dragging between groups reassigns | stable | UI | 68a53af | 2026-10-20 | `web/src/views/model.ts:186`, `model.ts:230`, `model.test.ts::assignee groups: you first, then people by name, No assignee last; empty ones are the team's people`, `IssueView.test.tsx::grouping by assignee with empty groups shows No assignee`, flow `assignee-groups` (reassign and back), dry run scenario 2: 30 people plus "No assignee" (5 stories) |
| team-issues-backlog-rank | Backlog in manual order is Rally's rank; dragging a row ranks it, persisted and shown in the same order after a reload | stable | UI+API | fe32f8a | 2026-10-20 | `web/src/store/rank.ts:9`, `web/src/store/rank.test.ts::random neighbours always get a rank between them`, `views/drag.test.ts::between rows of one group: ranks when ordered manually, explains otherwise`, flow `backlog-rank`, `check api` api:rank-round-trip, dry run scenario 3 (176 Backlog stories in rank order; a [DEMO] row ranked, reloaded, restored) |
| team-issues-list | List layout: collapsible groups with points, rows with chips, selection | beta | UI | 68a53af | 2026-10-20 | `web/src/views/ListLayout.tsx:52`, `IssueView.test.tsx::collapsing a group hides its rows and is remembered`; Linear's status-tinted group bars and caret are not copied, and the group inset differs from Linear's (ledger Tasks 9 and 19) |
| team-issues-display-filter | Display (layout, grouping, ordering, properties, show empty groups) and Filter (OR within a field, AND across), saved per view | beta | UI | 68a53af | 2026-10-20 | `web/src/views/DisplayMenu.tsx:34`, `web/src/views/FilterMenu.tsx:18`, `IssueView.test.tsx::a priority filter narrows the view, with a chip that clears it; values show counts`, `views/options.test.ts::options are saved per view under a versioned key`; Display opened and Grouping and Ordering changed live (dry run), Filter not driven |
| team-issues-bulk | X selects, the bulk bar acts on the selection through the same pickers | beta (stable pending live) | UI | 68a53af | not driven | `web/src/views/BulkBar.tsx:11`, `IssueView.test.tsx::selecting rows brings up the bulk bar, whose pickers target the selection`; flow `backlog-rank` only checks "2 selected" and Clear, no bulk write ran live |
| team-issues-art | An ART or platform team's views include its child teams, and same-named sprints with equal dates merge | beta (stable pending live) | UI | 104babd | not driven | `web/src/views/model.ts:62`, `model.test.ts::teamScopeIds: a team and all its descendants by parent, and a parent loop ends`, `::inScope with an ART: an issue of a child's child team is in the ART's Active`, `IssueView.test.tsx::ART merges same-named cycles with equal dates into one group`; neither of the user's teams is an ART |
| team-issues-sync | A 20 s poll of `/api/changes`, a 5 min full refresh, back-off after three failures, pause while the tab is hidden | beta (stable pending live) | UI+API | 1de97de | not driven | `web/src/store/poller.ts:10`, `store/poller.test.ts::polls every 20s with the last sync time and the loaded teams`, `::backs off 40s then 80s and marks data stale after three failures`; no live run watched a remote change arrive |

## How to get to it (user POV)

1. In the sidebar under "Your teams", open a team's "Stories". It opens on "Active".
2. Press ⌘B, or use the round Display button, to switch between List and Board. Use Display › Grouping to group by Assignee.
3. "Backlog" shows the backlog in Rally's rank order. Drag a row to rank it.
4. Select with X and the bulk bar appears at the bottom.

## Driving it

Preconditions: baseline, then `rallypoc seed`.

- **team-issues-board**: → `rallypoc browser run team-board` → PASS: the [DEMO] card moves to In Progress and back.
- **team-issues-assignee-groups**: → `rallypoc browser run assignee-groups` → PASS: the [DEMO] story moves to "No assignee" and back.
- **team-issues-backlog-rank**: → `rallypoc browser run backlog-rank` → PASS: the rank call answers 200, the order changes, then is restored. Also `rallypoc check api` → `api:rank-round-trip` PASS.
- **team-issues-tabs**, **team-issues-list**, **team-issues-display-filter**: → open http://127.0.0.1:5173/team/<team id>/active, ⌘B, Display › Grouping › Assignee → 30 people plus "No assignee" for AI/ML Solutions.
- **team-issues-bulk**, **team-issues-art**, **team-issues-sync**: not driven live.

## Gotchas

- **A big team loads slowly.** AI/ML Solutions (569 stories) showed "Loading AI/ML Solutions…" for about 13 s on 2026-10-20 (`proxy-team-reads`). Data Services loads in 2.5 s.
- **Active includes every Todo story, not only the sprint.** Todo means Defined with Ready on or in an iteration (spec §5.2), so AI/ML's Todo column held 173 stories (552 points), many in Sprints 4 to 6.
- **No assignee is Linear's wording.** The spec called the group "Unassigned"; Mira shows "No assignee".

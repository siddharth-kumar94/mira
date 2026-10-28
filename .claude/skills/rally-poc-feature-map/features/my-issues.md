# My stories

Last verified: f064d7ee53a4 on 2026-10-20 (live)

The landing screen (`/my/assigned`): the stories assigned to you or created by you across every team, opening in Focus. Everyone who connects a key uses it. It lives in `web/src/screens/MyIssues.tsx` and renders the shared story view (`web/src/views/IssueView.tsx`) inside the shell. Overall: beta. The data, grouping and keyboard behave and were driven on the user's real data; the list's group bars lack Linear's status tint, which is a known parity gap.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| my-issues-focus | Focus grouping: Urgent stories, then each team's current sprint, upcoming sprints, Other active, Backlog, Completed; each sprint group names its team and never merges across teams (D28, D29) | stable | UI | 77446a0 | 2026-10-20 | `web/src/views/model.ts:212`, `web/src/views/model.test.ts::Focus: urgent, each team's current cycle, upcoming cycles, other active, backlog, completed`, `::Importance: further along first, then priority, then rank; completed newest first`, flow `focus`; dry run scenario 1: 6 groups, 18 stories |
| my-issues-scope | Assigned or created by you, open or done in the Completed window, across all your teams | stable | UI+API | 16acf72 | 2026-10-20 | `web/src/views/model.ts:183`, `model.test.ts::My stories: assigned or created by you, open or done in the last 14 days, across teams`, flow `my-issues` (rows from at least two teams), dry run scenario 1 |
| my-issues-created-tab | The "Created" tab lists what you made | beta (stable pending live) | UI | 16acf72 | not driven | `web/src/screens/MyIssues.tsx:13`, `web/src/views/model.test.ts::My stories: assigned or created by you, open or done in the last 14 days, across teams`; no flow clicks it |
| my-issues-display | Display: Focus (Importance ordering disabled), Completed stories None, Past day, Past week or Past 2 weeks, properties; saved per view | beta | UI | 68a53af | 2026-10-20 | `web/src/views/DisplayMenu.tsx:13`, `DisplayMenu.tsx:52`, `web/src/views/IssueView.test.tsx::the Display menu: Focus with a disabled Importance ordering, Completed stories, properties in Linear's order`, `options.test.ts::Focus always orders by Importance`; the window was not changed live |
| my-issues-priority | Priority icons show where Rally has one (No priority is a dash) | stable | UI | 77446a0 | 2026-10-20 | `web/src/components/PriorityIcon.tsx`, dry run scenario 1: 1 Medium and 17 "No priority" icons |
| my-issues-group-bars | List group headers: caret, status or sprint icon, name, points, dates, "+" | beta | UI | cc0a043 | 2026-10-20 | `web/src/components/GroupHeader.tsx`, `web/src/views/ListLayout.tsx:52`, flow `my-issues`; Linear's status-tinted gradient bars and tinted caret are not copied, and the group count colour differs (ledger Task 19) |

## How to get to it (user POV)

1. Open http://127.0.0.1:5173. "My stories" is selected in the sidebar and the page opens on "Assigned" in Focus.
2. Press "j" to select the first row, "k" to go back, Space for the preview card and Enter to open a story.
3. The "Created" tab shows what you created. The round Display button at the top right changes the grouping and the Completed stories window.

## Driving it

Preconditions: baseline. Edits write to Rally, so use [DEMO] items.

- **my-issues-focus**, **my-issues-priority**: → `rallypoc browser run focus` → PASS: group labels in Focus order, each sprint group named with its team.
- **my-issues-scope**: → `rallypoc browser run my-issues` → PASS: rows from two teams, J/K move one visible selection.
- **my-issues-display**: → open http://127.0.0.1:5173/my/assigned, click "Display options" → the menu lists Focus, a disabled Importance ordering and Completed stories.
- **my-issues-created-tab**: not driven. Click "Created" and expect only stories you created.

## Gotchas

- **Empty Focus groups are left out.** The user's account has no Urgent stories and no Other active ones, so those two groups do not appear.
- **Focus is not a drag target** (spec §16 #14): dropping a story shows the "switch grouping" hint instead of changing it (`web/src/views/drag.ts:58`).
- **An open story in an ended sprint counts as Other active** (spec §16 #13), because Rally does not roll it forward.
- **Completed shows the last day by default**, as Linear does; bootstrap still loads 14 days (spec §16 #2).

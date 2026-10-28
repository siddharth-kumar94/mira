# Mira v2 Phase 4: scenario dry run

Date: 2026-10-20. Code: `v2/phase4` at `5e98999`, after two fixes this run found (below). Spec: `docs/specs/2026-10-16-mira-v2-linear-model-design.md` §14 (scenarios) and §15 (demo checklist).

## How it was run

- **Stack:** `rallypoc stack up`, write guard `demo` (the Demo mode chip showed on every screen). Never `--write-guard off`.
- **Data:** the user's real Rally workspace, read-only, with two teams: AI/ML Solutions and Data Services. Writes went only to `[DEMO]` items tagged `collabathon-demo` in Data Services.
- **Browser:** a new tab in the CDP Chrome on `127.0.0.1:9222` at `http://127.0.0.1:5173` (1728 x 997, DPR 2). The user's Linear tab was not touched, and the tab was closed afterwards. Screenshots are in `~/.cache/rea-research/v2cmp/mira-p4/t21/`, not in the repo.
- **Counts** are from 2026-10-20 and will drift. No ObjectIDs or personal names are recorded.

## Result

| # | Scenario | Result |
|---|---|---|
| 1 | My issues in Focus order | PASS |
| 2 | AI/ML Solutions › Issues › Active as a board, grouped by assignee | PASS |
| 3 | Backlog in manual order, dragging ranks | PASS |
| 4 | Cycles: PI 4 · Sprint 3 with scope, started, completed; issue view and panel | PASS (burn-up not built) |
| 5 | A real issue's activity; the comment box posts on a demo issue | PASS |
| 6 | C opens the composer with the last project; ⌘↵ creates | PASS after a fix |
| 7 | Initiatives, Timeline, posting At risk on the `[DEMO]` feature | PARTIAL: the initiative's own health does not change |

### 1. My issues
- **Seen:** the page opens on Assigned, in Focus. Six groups, 18 issues: PI 4 · Sprint 3 · AI/ML Solutions (6), PI 4 · Sprint 3 · Data Services (4), PI 4 · Sprint 4 · AI/ML Solutions (3), PI 4 · Sprint 4 · Data Services (1), Backlog (3), Completed (1). Ten of the 18 are the user's real issues across both teams; eight are `[DEMO]`.
- **Priority:** one issue showed a Medium priority icon; the other 17 showed "No priority".
- **Notes:** there is no Urgent group and no Other active group because the user has none. Each sprint group names its team.

### 2. AI/ML Solutions › Issues › Active, as a board
- **Seen:** ⌘B turned the list into a board with three columns: Todo (173 issues, 552 points), In Progress (28, 183) and In Review (3, 6). Columns scroll on their own. The Done column is absent (D31).
- **Group by Assignee:** Display › Grouping › Assignee gave 30 people plus "No assignee" (5 issues); 204 issues in all, matching the three columns.
- **Notes:** the group is called "No assignee", Linear's wording, where the spec says "Unassigned". Grouping and layout were put back afterwards. The team took about 13 s to load.

### 3. Backlog
- **Seen:** AI/ML Solutions › Backlog listed 176 issues, 257 points, in the same order as Rally's rank (the first 12 rows matched the API's rank order). Ordering "Manual" is the default.
- **Drag:** in Data Services › Backlog, a `[DEMO]` row was dragged above another (the order changed), the page was reloaded (the order held), then the row was dragged back (restored).
- **Not tried:** dragging a real issue. The unit tests cover the refusal (`test_rank_guard_refuses_real_issue_without_posting`); `check api` covers a real patch (`api:guard-blocks-real`, 403).

### 4. Cycles
- **Seen:** AI/ML Solutions › Cycles lists Planned, Upcoming and Current rows plus the two latest past cycles and "Show older cycles". The current cycle, PI 4 · Sprint 3, reads Scope 292, Started 48 (16%), Completed 89 (30%).
- **Cycle page:** 106 issues grouped In Review (3 points), In Progress (45), Todo (155) and Done; Started equals In Progress plus In Review. The panel has the tabs Assignees, Labels, Priority and Projects; Priority read 1 Medium and 291 No priority, which adds to 292.
- **Not there:** the burn-up (Tasks 22 and 23). The panel and the expanded row leave a blank space for it.

### 5. Issue activity and comment
- **Seen:** one of the user's real AI/ML issues opened by its URL with "created the issue" and "moved to cycle PI 4 · Sprint 3" in the activity, plus the properties sidebar.
- **Comment:** on `[DEMO] Iteration board drag to change state`, "Leave a comment" plus ⌘↵ posted at once; it was then deleted with `DELETE /api/comments/<id>` (HTTP 200), and a re-read showed 0 comments.

### 6. Composer
- **Seen:** C in Data Services › Issues › Active opened the dialog with status Todo, the title "[DEMO] ", and `[DEMO] Linear-style Rally client` already chosen (the last project used). ⌘↵ created a story in Todo with the `collabathon-demo` label and a project; the list showed it.
- **Failure found:** the first attempt produced the title "…issue[DEMO]". The caret opened at position 0, so typed text landed before the prefix, which left Create disabled for a person typing by hand. Fixed in `c927fb7` with a unit test; the retry produced "[DEMO] …" correctly. `rallypoc seed` removed both stories.

### 7. Initiatives, Timeline, At risk
- **Initiatives:** 42 Active, 15 Planned and 7 Completed (64 under All initiatives). A large AI/ML initiative shows 0 / 18 projects, an off-track health icon and the pills 4 on track and 7 off track. The first load took about 15 s.
- **Timeline:** Projects opens on the timeline for the two teams' 269 projects. 152 are past their target and not complete, and their bars run to the Today line in pink. Show PIs drew PI 2, PI 3 and PI 4 bands (turned back off afterwards).
- **Posting At risk** on `[DEMO] Linear-style Rally client` (twice, deleting it each time):
  - the project list read "At risk · now";
  - the timeline row read "At risk, last update 1 minute ago";
  - the project's health read At risk, and its Activity showed a diff "Target date moved from Dec 4th to Dec 5th";
  - the initiative page's project row read At risk once the page finished loading;
  - **the initiative's own health stayed "No updates"** (`health` = `no_target`, "No active projects") before, during and after.
- **After the delete:** `GET /api/projects/<key>` showed health On track, 1 update (the seeded one) and 0 comments.
- **Why the initiative did not move:** an initiative's Auto health counts only its started projects (D36). Both `[DEMO]` Features read "No status", which is the Backlog category. Rally's work rules refuse to start them: moving a Feature to Current PI needs Financial Work Type and Investment Category. I tried it in the seed script, Rally rejected the write, and I reverted the change.

## Fixes made during the run

1. **Composer caret (`c927fb7`).** Described under scenario 6. Test: `Composer.test.tsx::typing starts after the [DEMO] prefix: the caret opens at the end of the title` (red with the caret at 0, green after).
2. **Planned ends were a day late (`5e98999`).** The diff in scenario 7 exposed it. Rally stamps a planned end at 23:59:59 local, i.e. 04:59:59Z in winter, so reading the UTC date showed every project, initiative and PI end one day after the real day (the seed wrote Dec 4 and Mira showed Dec 5). `end_day` in `server/app/rally/mapping.py` returns the closing day. Tests: `test_end_day_is_the_day_the_planned_end_closes` and `test_project_initiative_and_release_ends_use_the_closing_day`; two existing PI fixtures changed their expected end by a day. After a restart the demo Feature's target read Dec 4.

## Verify results

- `rallypoc test`: 287 passed (pytest), 498 passed (vitest, 52 files), typecheck clean.
- `rallypoc check api`: every line PASS except `api:cycle-detail-art` SKIP (no ART in your teams) and `api:pm-priority` SKIP (no portfolio priority field).
- `rallypoc check ui`: 17 of 17 PASS.
- `rallypoc seed` ran at the end (it needed one retry after a Rally ConcurrencyConflict). Residue check: the demo Feature has its 1 seeded update and 0 comments, and no "Task 21" or "Composer flow" story remains.

## Demo checklist (§15)

1. Seed has run: yes, last at the end of this run.
2. `check api` and `check ui` pass in demo mode: yes.
3. The feature map grades every demoed area stable: **no**. Every area is `beta` (see the Open list for why), so this item needs the user's decision.
4. The presenter chooses the guard mode: not decided here.
5. After the collabathon, `scripts/cleanup_demo.py --yes` and key rotation, only when asked: not run.

## Open

1. **Scenario 7, "and its initiative".** A `[DEMO]` initiative cannot change health from an update on its Feature, because the Features cannot be started in Rally without Financial Work Type and Investment Category. Options: the seed sets those two fields (needs the allowed values from the user's Rally admin), or the scenario is reworded to the project's health in the list, the timeline and the initiative's project list. Not fixed.
2. **Cold initiative page.** On a fresh load of `/initiative/<key>`, the project rows read "No updates" for more than 16 s before showing At risk and Off track; the API already answered correctly. Cause not diagnosed.
3. **Slow reads on this workspace.** AI/ML Solutions team load 12.9 s, `GET /api/initiatives` 11 s cold, workspace projects 2.9 s. The client shows a loading line throughout.
4. **Burn-up.** Tasks 22 and 23 (D25) are not built; the cycle panel, the expanded cycle row and the project Progress panel leave an empty slot.
5. **Parity gaps** (ledger): Linear's status-tinted group bars and tinted caret are not copied; the dark theme is not measured; the select face in dark is invisible; several copy and layout choices are guessed.
6. **No ART available live.** `api:cycle-detail-art` SKIPs and the ART views are fixture-only.
7. **Project and initiative priority** is hidden because Rally has no such field (D38); the write path is untested live.
8. **Not driven on the real account:** a valid replacement key, Disconnect, the no-key Connect screen, a guard refusal on a real issue's comment or rank, the Created and All tabs, the Filter menus, bulk writes, Month and Week zoom, Show cycles, the right-click menu.
9. **Browser state.** The CDP Chrome profile keeps the Display choices made during the run (team Active layout and grouping were put back; the AI/ML Backlog ordering was set to Manual, which is also its default).

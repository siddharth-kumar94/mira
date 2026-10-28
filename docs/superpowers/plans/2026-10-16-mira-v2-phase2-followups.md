# Mira v2 Phases 1–2: open follow-ups for the Phase 4 plan

These are the review findings that were deferred during the Phase 1–2 build (`docs/superpowers/plans/2026-10-16-mira-v2-phase1-2.md`). None blocked the checkpoint. The final whole-branch review triaged them as able to wait for Phase 4.

The final fix wave already closed these, so they are not listed below:
- guard regression tests
- the ValueError → 422 handling
- HTML-escaped tag names
- unguarded `rallypoc api` writes
- board multi-select and scrolling
- pruning the selection when filtered
- the drag dead zone

## Known gaps to design for in Phase 4
- ~~**ART teams** (planning ruling 9). The server scopes an ART down to its child teams, but the client's team views match only `team_id === teamId`, so child-team issues sit in the cache unseen.~~ (closed in Phase 4)
- ~~**Update guard has no tag check.** `check_portfolio` requires only the `[DEMO]` prefix and the demo team, not the `collabathon-demo` tag. This is a user decision; see the build's rulings.~~ (closed in Phase 4)
- **Live behaviour not yet seen.**
  - Defect priority 0 is written as `null`; the live check covered stories only.
  - Artifact titles may also arrive HTML-escaped. This is unverified.

## Server
- **Rally client:** DELETE is retried on a conflict, and GET-not-retried is untested.
- **Mapping:** `_wrapped` ignores quotes. `day()` slices the UTC date, so end-of-day local dates can land a day late. Test gaps (iso, oid, ref, …).
- **PM rules:** `auto_health` counts a zero or inverted time span as 100% elapsed. `format_update` takes `health: str`. Boundary tests are missing.
- **Guard:** `check_existing(name=None)` raises AttributeError (it still blocks). There is no `[DEMO]x` (no-space) test.
- **Bootstrap:**
  - A duplicate `GET /user`.
  - Untested paths: no-`RALLY_WORKSPACE` and `team()` 404.
  - Closed teams are re-queried every time.
  - The activity scan is capped at 1000 rows.
- **Team load and changes:**
  - Silent caps at 3000 open and 1000 done issues.
  - A TeamMembers failure fails the whole load.
  - `changes()` doesn't dedupe team ids.
- **Search:** keys match exactly (no prefix search); `isdigit()` accepts non-ASCII digits.
- **Writes:**
  - A bottom-ranked create is two POSTs, so a failed rank after a successful create still reports an error.
  - `post_update` treats an unknown kind as a capability.
  - A 502 after a written update invites a duplicate on retry.
- **Portfolio:** `list_initiatives` costs about twice what it needs to. The latest-update limit (400 per batch of 50) can drop a quiet project's latest update. Initiative order is unsorted.
- **Credentials and session:**
  - The temp file is opened without `O_EXCL`/`O_NOFOLLOW`.
  - The candidate client leaks if `write_key` raises.
  - `disconnect()` without a factory reports `connected=True`.
  - No lock around connect.
  - The 422 body echoes `input`, so a key sent under a wrong field name comes back to the local client.
- **API tests:** `build_adapter`'s saved-key-over-`.env` precedence and several routes are not hit.
- **Verify CLI:**
  - `stack up` on a running stack prints the requested guard mode, not the running one.
  - Some restore assertions are weak.
  - Flows leave composer and Ready residue until `rallypoc seed` runs.
  - The assignee-groups viewport height is hardcoded.
  - A label check now fails, not skips, on unresolvable names (`"` or only special characters).
  - The tag lookup for names whose longest plain piece is very short can miss beyond 200 rows (it fails closed).

## Client
- **Rank:** `rankBetween` returns null when `hi` ends in spaces; it falls back to the server's rank.
- **Routes and UI store:**
  - Not-found keeps the raw query and fragment.
  - `HOME` is returned by reference.
  - Esc from an issue page pushes history instead of going back.
  - ~~The theme `setItem` is not wrapped in try/catch.~~ (closed in Phase 3)
- **Store:**
  - Cached sub-issues are never dropped.
  - `createIssue` isn't marked as touched, so a concurrent team load can drop the new issue.
  - Rollback compares raw patch keys, not their side-effect fields.
  - `updateSubIssue` duplicates `writeIssue`.
  - A refresh with a failing team load toasts every 5 minutes.
  - `Status` is defined in both store and types.
  - A visibility change can overlap a poll tick.
  - `createIssue` and `updateMany` are untested.
- **View options:**
  - The storage default is read outside the try.
  - A saved set of only unknown properties becomes `[]`.
  - `useViewOptions` shows the old view's options for one render.
  - A cycle label with `|` in its name is cut short.
- **Rows and board:**
  - ~~Double-clicking a row's checkbox opens the issue page.~~ (closed in Phase 3)
  - ~~The date shows before the assignee.~~ (closed in Phase 3)
  - ~~Labels are truncated at 2 with no "+N".~~ (closed in Phase 3)
  - The Labels, Cycle and Updated toggles do nothing on the board.
  - `visibleIds` isn't cleared on unmount.
  - Drop wiring is untested.
  - The empty state ignores active filters.
  - ~~The toolbar and bulk bar scroll away.~~ (closed in Phase 3)
- **Screens:**
  - No in-flight guard on All-tab paging.
  - Joined teams are fully loaded at startup just for their names.
  - ~~Placeholder wording is process jargon.~~ (closed in Phase 4)
  - ~~"Loading Team…" shows for an unknown team.~~ (closed in Phase 4)
  - Tabs lack arrow keys.
  - The issue page "Couldn't load" state has no Retry.
  - An issue opened by key is fetched twice.
- **Palette:**
  - ~~The project picker writes another team's project for a multi-team selection.~~ (closed in Phase 4)
  - Remote search results aren't cancelled.
  - ~~Clipboard errors are unhandled.~~ (closed in Phase 3)
  - ~~The palette re-renders while closed.~~ (closed in Phase 3)
  - Labels sort by code point.
  - Keyboard-only picker selection (S → Enter) is untested.
- **Composer:**
  - ~~It shows "Rally needs a project…", a Rally word on screen.~~ (closed in Phase 3)
  - ~~That warning flashes before the team load finishes.~~ (closed in Phase 3)
  - The Team select lacks a team that isn't in the sidebar.
  - ~~The estimate pill reads "1 points".~~ (closed in Phase 3)
- **Performance:** ~~with the peek open, J/K fires a full issue-detail load per keypress.~~ (closed in Phase 3)
- **Refresh:** the 5-minute refresh can unmount an open issue page for an old done issue, losing an unsaved description edit.

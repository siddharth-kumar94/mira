# Multi-surface journeys

Last verified: f064d7ee53a4 on 2026-10-20 (live)

A journey crosses areas, so it can fail where no single area file looks. Each one names the sub-feature IDs it touches, the invariant that must hold across areas, the last live result, and the commands to drive it. Journeys run in the order below, and each assumes the state the one before it left.

| ID | Journey | Areas | Last live | Result |
|---|---|---|---|---|
| j-demo-script | The collabathon demo: My stories in Focus → ⌘K priority → team board → backlog rank → story page and comment → composer | my-issues, palette, team-issues, issue-page, composer, proxy | 2026-10-20 | PASS |
| j-pm-update | A PM's path: Capabilities → Features timeline → feature Activity → post At risk on a [DEMO] feature → the chip changes → delete the update | capabilities, timeline, features, updates-health, proxy | 2026-10-20 | PARTIAL |

## j-demo-script

Touches: `my-issues-focus`, `palette-pickers`, `palette-keys-core`, `team-issues-board`, `team-issues-backlog-rank`, `issue-page-comments`, `composer-create`, `proxy-issue-writes`.

Invariants:
1. A priority set in ⌘K is the priority shown on the row and the value Rally returns on the next `GET /api/teams/<id>`.
2. A rank changed in the backlog is the order a reload shows.
3. A story made in the composer lands in the demo team with the `collabathon-demo` label.
4. After the run, `rallypoc seed` returns every `[DEMO]` item to its seeded state, and `check api` passes again.

Drive:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up
$CC seed
$CC check api
$CC check ui
$CC seed
$CC check api
$CC stack down
```

Result (2026-10-20): PASS for `check api` (every line PASS except `api:cycle-detail-art` and `api:pm-priority`, which SKIP with a reason) and `check ui` (see the dry-run doc `docs/superpowers/plans/2026-10-19-mira-v2-phase4-dry-run.md`).

## j-pm-update

Touches: `initiatives-list`, `initiatives-health-auto`, `timeline-canvas`, `timeline-overrun`, `projects-page`, `updates-post`, `updates-health-propagation`, `updates-initiative-health`, `proxy-updates`.

Invariants:
1. An At risk update on a [DEMO] Feature changes its health chip in the list, the timeline and the feature page without a reload.
2. Deleting the update restores the earlier health, and no update carrying a flow marker is left behind.
3. The capability above it changes health only when the Feature is started (Current PI or Measuring). The [DEMO] Features are not, so invariant 3 is expected to fail on the demo data (see the Open list in the dry-run doc).

Drive:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC browser run project-update   # posts At risk, checks the list chip, deletes it, checks the chip reverts
$CC browser run capabilities      # the [DEMO] capability with n / total and its pills
```

Result (2026-10-20): PARTIAL. Invariants 1 and 2 PASS in the flow and by hand (list "At risk · now", timeline "At risk, last update 1 minute ago", then On track after `DELETE /api/comments/<id>`). Invariant 3 FAIL for the [DEMO] capability: `health` stayed `no_target` ("No active features").

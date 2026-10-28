# Mira in Rally's words: open follow-ups

Findings deferred while building the vocabulary change (`docs/superpowers/plans/2026-10-20-mira-rally-vocabulary.md`). None blocked merge; the final whole-branch review triaged them. The must-fix items (module-level message constants not scanned, API field names in a 422, defect wording, one stale evidence line) were fixed in the final fix wave.

## Decisions for the owner

- **⌘K matches labels only.** Typing an old word ("cycle", "issue", "project") finds nothing; the new words match. Invisible keyword aliases would help people used to Linear, and would not show on screen. Not built.
- **Timeline layout:** the features Display popover paints under the toolbar's Today and Zoom controls (z-order), so its Timeline tab is partly covered. Found by the live `vocabulary` flow; pre-existing, not a vocabulary issue.
- **Initiative grouping** has never been driven in a browser (unit tests, server tests and `check api` only). Extending the `vocabulary` flow to pick Grouping › Initiative and check a header would move its feature-map row to stable.
- **Words still in tests only:** test titles and a few mock server strings still use the old words; they are not on screen.

## By task

### Task 1
- helper scans per text node (a word split across inline elements isn't caught); attribute surfaces beyond the five unscanned; toast hosts outside the root not scanned
- empty-root guard counts a zero-width space as content

### Task 2
- scan allow-list SAFE keyed by source text across app/ (a reused variable name isn't re-checked); no test for the singular "1 active feature"

### Task 3
- ⌘K matches labels only — old words ("cycle", "issue", "project") no longer find commands; consider invisible keyword aliases (offer to the user at the end)
- drag hint "Only stories belong to features" when dragging a defect (drag.ts:45) — wording for defects
- Step 5 no-clipping check incomplete (team Stories/Sprints/Features pages still loading at capture)
- defect row aria-label check passes when the attribute is absent (textContent/outerHTML checks cover it)

### Task 4
- store/pm.test.ts mock errors still in Linear's words ("Demo mode: only [DEMO] projects can take updates", "No such project/initiative/cycle")
- Activity.test.tsx and store.test.ts quote two different invented guard strings; the real GUARD_MESSAGE is "Demo mode: only [DEMO] items can be edited"
- IssuePage breadcrumb "My stories"/"All stories" origins untested; one store test name overclaims

### Task 5
- the "Feature N" fallback row (breakdown with an unknown project_id) is untested

### Task 6
- test titles/comments with old words; no rendered-header test grouped by Capability

### Task 7
- UpdateCard.tsx:39 and PmActivity.tsx:160 duplicate the kind→noun ternary instead of PM_NOUN; doc comments in Initiative*/UpdateCard still use old words

### Task 8
- a failed Outcome read is retried on every request (twice per /api/initiatives) with no 60s memo like pm_priority
- `allow: ["initiative"]` also allows the plural; the without-allow test doesn't pin that the expected strings are the only offenders
- fallback label shows a raw ObjectID ("Initiative 281"); server stores a missing name as "" not None; no server test for a Parent with an id but no name; store/pm.test.ts fixture still named "[DEMO] Initiative"

### Task 9
- name-blanking can hide an old word equal to a team/workspace/feature name; List-layout assumption; restored layout key not byte-identical; composer "Feature" substring assertion; settings team-page rows not covered by any flow
- in Timeline layout the features Display popover paints UNDER the toolbar's Today/Year controls (z-order) — add to a follow-up for the pm/ProjectTimeline owner; mention to the user.
- features() `current` stale if set_layout fails partway; close_nav never asserts the sidebar ended in the original state (a missing toggle is skipped silently)

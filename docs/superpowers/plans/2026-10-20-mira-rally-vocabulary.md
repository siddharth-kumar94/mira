# Mira in Rally's words: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a user reads in Mira uses Rally's words (Sprint, Feature, Capability, Story, Task), and the Capability list can be grouped by Initiative, the level above Outcome.

**Architecture:**
- It is a wording change. Layouts, icons, URLs, storage keys and code identifiers stay as they are.
- A shared test helper fails any screen that still shows an old word, so each task proves itself and later regressions are caught.
- One server addition: Capabilities carry their Outcome's parent (Rally's Program), which the client shows as the "Initiative" grouping.

**Tech Stack:** as Phases 1–4 (FastAPI + pytest; React 19 + vitest). No new dependencies.

**Spec:** `docs/specs/2026-10-16-mira-v2-linear-model-design.md`. This plan adds D39, which supersedes D2's "Linear's words only" for on-screen text. D2's layering rule (only `server/app/rally/` knows Rally's shapes) stays. §19 describes Linear's screens and keeps Linear's terms.

## Global Constraints

Every task implicitly includes these.

- **The word table.** This applies to visible text, `aria-label`, `title`, `placeholder`, toast and error text, menu and palette entries, and activity phrases. Match case and plural.

  | Old (Linear's) | New (Rally's) |
  |---|---|
  | cycle(s) | sprint(s) |
  | project(s) | feature(s) |
  | initiative(s) | capability / capabilities |
  | issue(s) | story / stories |
  | sub-issue(s) | task(s) |

  Fix articles and counts with the word: "a sprint", "a feature", "a capability", "a story", "1 story / 2 stories", "No stories".
- **Unchanged words:** Team, PI, Outcome, Label, Assignee, Estimate, Status and its values, Priority, Backlog, Health, Update, Comment, burn-up.
- **Not renamed:**
  - code identifiers: file, type, function and prop names, store keys, JSON fields;
  - URL paths such as `/issue/US1`, `/team/5/cycles` and `/project/F1`;
  - `localStorage` keys, API paths, CSS classes and `data-*` attributes;
  - user data (a story titled "Fix the project page" stays as written);
  - code comments (rename them only in lines you already edit).
- **"Initiative" is a new word.** It means the level above Outcome (Rally's Program, `P…` IDs). It appears only as the "Initiative" grouping option and its group headers on the Capability list (Task 8). Everywhere else it is a banned word.
- **A defect row also reads "Story".** Mira lists defects with stories and cannot create them.
- **Layout is not remeasured.** Longer words ("Stories", "Capabilities") may widen pills and columns. Don't chase Linear's pixel widths. Make sure nothing is clipped or overlapping; fix column widths if it is.
- **Rally writes while developing:** only `[DEMO] `-prefixed, `collabathon-demo`-tagged items in the demo team. `rallypoc stack up` runs with the write guard on; never pass `--write-guard off`.
- **Never commit** `.env`, API keys, real Rally ObjectIDs, or screenshots of real data. Test fixtures are synthetic and must not use the banned words in their data (the vocabulary helper scans rendered text).
- **Commits** end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `git -C <worktree>`, not `cd … && git`.
- **Verify** with `.claude/skills/verify-rally-poc/rallypoc test`. Baseline before this plan: pytest 313, vitest 541. Live checks only in Task 9, and only as it says.

## Review Focus

The inputs and conditions most likely to bite a person, each pinned by a test in the task that owns it.

1. **A defect row** in a list, on a board and on the story page reads "Story", never "Issue" or "Defect-as-issue". *(Task 3.)*
2. **Counts, plurals and articles:** "1 story", "2 stories", "No stories", "a feature", "a capability", "n / total features", and server text like "give teams or a capability". *(Tasks 2, 3, 6, 7.)*
3. **Saved links and saved settings still work:** `/issue/US1`, `/team/5/cycles` and `/project/F1` parse as before, and view options saved under the old storage keys still load. *(Task 3.)*
4. **Attribute text and keyboard surfaces:** `aria-label`, `title`, `placeholder`, the shortcuts cheatsheet and the ⌘K command and picker names use the new words, not just visible text. *(Tasks 1, 3, 4.)*
5. **Server messages and activity phrases** that reach toasts and the activity feed ("moved to sprint …", "created the story", guard refusals) use the new words. *(Task 2.)*
6. **"Initiative" appears only as the Program grouping:** the Capability list with that grouping allows it, and every other screen's test still bans it. A capability whose Outcome has no parent lands in "No initiative", and a failed Outcome read doesn't break the list. *(Task 8.)*

---

### Task 1: Decision D39 and the vocabulary guard

**Files:**
- Modify: `docs/specs/2026-10-16-mira-v2-linear-model-design.md`
- Create: `web/src/test/vocabulary.ts`, `web/src/test/vocabulary.test.tsx`

**Interfaces:**
- Produces: `expectRallyWords(root: ParentNode, opts?: { allow?: string[] }): void` in `web/src/test/vocabulary.ts`.
  - It throws, listing every offender with its element and attribute, if the root's visible text or its `aria-label`, `title`, `placeholder`, `alt` or `aria-description` attribute values match `/\b(sub-issues?|issues?|cycles?|projects?|initiatives?)\b/i`.
  - `allow` lists words to ignore, lower-case and singular (for example `["initiative"]`).
  - Every later task's tests call it.

- [ ] **Step 1: Write the failing test** (`web/src/test/vocabulary.test.tsx`), rendering small snippets:
  - `<p>Your stories</p>` passes.
  - `<button aria-label="Create issue">` throws, and the message names the attribute.
  - `<input placeholder="Add to project…">` throws.
  - `<span title="Show cycles">` throws.
  - `<p>Sub-issues</p>` throws.
  - `<p>Capabilities by Initiative</p>` throws, but passes with `{ allow: ["initiative"] }`.
  - A word inside another word (`"Reissue"`, `"Subprojects"`) passes.
- [ ] **Step 2: Run it and see it fail.** Run: `cd web && npx vitest --run src/test/vocabulary.test.tsx`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `expectRallyWords`.** Walk the DOM from `root` (text nodes via `textContent`, plus the named attributes). Skip `<script>` and `<style>`. Throw one `Error` listing all offenders.
- [ ] **Step 4: Spec edits.**
  - In the D2 row add "(on-screen words superseded by D39)".
  - Add **D39**: *"On screen, Mira uses Rally's words: Sprint (not Cycle), Feature (not Project), Capability (not Initiative), Story (not Issue), Task (not Sub-issue). Team, PI, Outcome, Label, Assignee, Estimate and Status are unchanged. "Initiative" is the level above Outcome (Rally's Program) and appears only as a grouping on the Capability list. Code identifiers, URLs and storage keys keep the Linear-model names. | The user's teams think in Rally's words, and Linear's words clash with them ("Project" is a team in Rally and a feature in Mira) | The user's choice (2026-10-20)."*
  - Add one line under the §19 heading: "§19 and §18 describe Linear's screens and keep Linear's terms. On screen, D39's words apply."
- [ ] **Step 5: Run** `rallypoc test`. Expected: pytest 313 and vitest 541 plus the new tests, typecheck clean.
- [ ] **Step 6: Commit** `docs+test: D39 (Rally's words on screen) and the vocabulary guard`.

---

### Task 2: Server wording

**Files:**
- Modify: `server/app/guard.py`, `server/app/main.py`, `server/app/rally/issues.py`, `server/app/rally/writes.py`, `server/app/rally/mapping.py`, `server/app/rally/portfolio.py`, `server/app/domain.py` (any message text)
- Test: update expectations in `server/tests/*`; create `server/tests/test_user_words.py`

**Interfaces:**
- Produces: no signature changes. Only strings change. The new strings are listed here and are binding:
  - **Guard:** "Demo mode: new stories can only go in the demo team"; "Demo mode: demo stories can only move under [DEMO] features in the demo team"; "Demo mode: demo stories can only move into sprints of the demo team"; "Demo mode: only {prefix} features and capabilities tagged {tag} can change".
  - **Errors:** "Sprint {id} was not found"; "Story {KEY} was not found"; "Task {id} was not found"; "a story is identified by its ID, like US1234"; "a story can't be ranked relative to itself"; "only stories belong to a feature"; "give teams or a capability"; "give a team and sprint, or a feature".
  - **Activity phrases:** "created the story"; "moved to sprint X"; "removed from sprint X"; "moved to feature X"; "removed from feature X".

- [ ] **Step 1: Write the failing tests.**
  - `test_user_words.py`: parse every file under `server/app` with `ast`. Collect the string constants (and the literal parts of f-strings) that are arguments to calls named `GuardError`, `BadRequest`, `RallyError` or `HTTPException`, plus the strings returned by `_phrase` and `activities_from_rally` in `mapping.py`. Assert none matches the banned regex from Task 1 (`sub-issues?|issues?|cycles?|projects?|initiatives?`, case-insensitive, word boundary). The failure message lists file, line and text.
  - Update the existing tests whose expected strings change: guard messages (`test_guard.py`, `test_portfolio.py`, `test_other_writes.py`), the activity phrases (`test_mapping.py`, `test_issue_reads.py`) and the 404/422 texts (`test_api.py`, `test_cycles.py`, `test_burnup.py`).
- [ ] **Step 2: Run them and see them fail.** Run: `cd server && uv run pytest -q`. Expected: the scan test fails listing the old strings, and the updated expectations fail.
- [ ] **Step 3: Change the strings** to the table above, in every file the scan names. Keep every message's meaning, status code and structure.
- [ ] **Step 4: Run** `cd server && uv run pytest -q`. Expected: all pass (313 plus the scan test).
- [ ] **Step 5: Commit** `fix(server): messages and activity phrases in Rally's words`.

---

### Task 3: Shell and the story-list layer

**Files (this task owns all words in them):**
- `web/src/App.tsx`, `web/src/Overlays.tsx`, `web/src/screens/**`, `web/src/views/**`, `web/src/keyboard/**`, `web/src/palette/**`
- `web/src/components/**` **except** `Composer.tsx` and `SubIssueRow.tsx` (Task 4)
- Their tests.

**Interfaces:**
- Consumes: `expectRallyWords` (Task 1).
- Produces: no signature changes.

What changes (apply the word table to all of it):
- **Sidebar:** "My stories"; team items "Stories", "Sprints", "Features"; the Workspace items "Capabilities" and "Features"; the help and workspace menus.
- **Tabs:** "All stories".
- **Display menu:** group and order options ("Feature", "Sprint"), and the property pills.
- **Filter menu:** fields "Feature", "Sprint", and their "No …" values.
- **Group headers, empty states and cycle-style labels.**
- **Row menu and bulk bar.**
- **Palette:** command names, picker placeholders ("Add to feature…", "Add to sprint…"), the "G then …" go-to commands, and the shortcuts cheatsheet.
- **Row and card aria text,** including the project chip title.

- [ ] **Step 1: Write the failing tests.** Add `expectRallyWords(container)` to the main render tests of: the sidebar, the issue view as a list and as a board, the Display and Filter menus open, the row menu, the bulk bar, the palette open (commands) and each picker, the cheatsheet, and the My stories and team screens' empty states. In `IssueView`/`rows` tests, add a **defect-kind** fixture row and assert its accessible name ends in "Story" wording (Review Focus 1).
  - Add to `route.test.ts`: `/issue/US1`, `/team/5/cycles` and `/project/F1` still parse as before. Add to `options.test.ts`: options saved under the existing storage key still load.
  - Add plural cases: "1 story", "2 stories", "No stories" wherever counts render.
- [ ] **Step 2: Run them and see them fail.** Run: `cd web && npx vitest --run src/views src/components src/palette src/keyboard src/screens src/App.test.tsx`.
- [ ] **Step 3: Change the strings** in the owned files. Where a label table or constant holds the word (for example `FIELD_LABEL`, `PICKER_PLACEHOLDER`, group-by labels), change the table.
- [ ] **Step 4: Run** `rallypoc test`. Expected: all pass.
- [ ] **Step 5: No-clipping check.** With the stack up, open My stories and a team's Stories, Sprints and Features in a new CDP tab (read-only). Confirm "Stories", "Capabilities" and "Features" are not truncated. Fix column widths if they are.
- [ ] **Step 6: Commit** `feat(web): shell and story lists in Rally's words`.

---

### Task 4: Story page, composer and store

**Files (this task owns all words in them):**
- `web/src/issue/**`, `web/src/editor/**`, `web/src/store/**`, `web/src/api/**`
- `web/src/components/Composer.tsx`, `web/src/components/SubIssueRow.tsx`
- Their tests.

What changes:
- **Story page and peek card:** breadcrumb, "Add tasks…" under the description, activity text, properties pills (Feature, Sprint, Estimate).
- **Task rows:** hints and aria text.
- **Composer:** "New story", "Create story", chip placeholders "Add to feature…" and "Add to sprint…", the "needs a feature" warning text.
- **Toasts and errors** raised in the store (for example "Couldn't load this story").
- **Comment box and error text** in `api/client.ts`.

- [ ] **Step 1: Write the failing tests.** Call `expectRallyWords` in the render tests of: the story page, the peek card, the activity feed, the composer (open, with each chip's picker), the task list and rows. Add store tests asserting the toast and error strings for a failed story load and a failed task create contain no banned word.
- [ ] **Step 2: Run them and see them fail.** Run: `cd web && npx vitest --run src/issue src/components/Composer.test.tsx src/store src/api`.
- [ ] **Step 3: Change the strings** in the owned files.
- [ ] **Step 4: Run** `rallypoc test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(web): story page, composer and messages in Rally's words`.

---

### Task 5: Sprints, burn-up and settings

**Files (this task owns all words in them):** `web/src/cycles/**`, `web/src/charts/**`, `web/src/settings/**`, and their tests.

What changes:
- **Sprints list:** page title and breadcrumb "Sprints", "Show older sprints", status tags.
- **Sprint page:** the switcher ("Next sprint", "Previous sprint", "Go to current sprint"), the panel's breakdown tabs ("Features" replaces Projects), empty states.
- **Burn-up:** any label with the old words.
- **Settings:**
  - the team settings rows: "Sprints" with its cadence value, "Story statuses" (was Issue statuses);
  - nav and card text.

- [ ] **Step 1: Write the failing tests.** Call `expectRallyWords` in the render tests of: the sprints list (current row expanded), the sprint page with its switcher open and each breakdown tab, the burn-up (loaded, loading, unavailable), settings Preferences, Account, Teams and team settings (loaded, loading, error, not found).
- [ ] **Step 2: Run them and see them fail.** Run: `cd web && npx vitest --run src/cycles src/charts src/settings`.
- [ ] **Step 3: Change the strings** in the owned files.
- [ ] **Step 4: Run** `rallypoc test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(web): sprints, burn-up and settings in Rally's words`.

---

### Task 6: Features (projects, timeline, feature page)

**Files (this task owns all words in them):** `web/src/pm/ProjectsView.tsx`, `ProjectList.tsx`, `ProjectBoard.tsx`, `ProjectTimeline.tsx`, `ProjectPage.tsx`, `ProjectSidebar.tsx`, `ProjectsDisplay.tsx`, `ProjectsFilter.tsx`, `model.ts`, `timeline.ts`, and their tests.

What changes:
- **List/board/timeline header:** "Features", the "All features" tab, "Show closed features".
- **Display and Filter:** "Show sprints", "Show feature list"; filter fields "Capabilities" and the like; empty states ("No features match this view.").
- **List:** column header "Stories" for the count; cards read "N stories".
- **Feature page:** tab "Stories", Properties rows "Capabilities", aria text such as "Select feature".

- [ ] **Step 1: Write the failing tests.** Call `expectRallyWords` in the render tests of: the features list, board and timeline; the Display and Filter popovers open; the zoom menu; the feature page on Overview, Activity and Stories tabs (including its sidebar); and the empty and error states. Add count cases ("1 story", "2 stories") for the cards and the Stories column.
- [ ] **Step 2: Run them and see them fail.** Run: `cd web && npx vitest --run src/pm/ProjectsView.test.tsx src/pm/ProjectBoard.test.tsx src/pm/ProjectTimeline.test.tsx src/pm/ProjectPage.test.tsx src/pm/model.test.ts src/pm/timeline.test.ts`.
- [ ] **Step 3: Change the strings** in the owned files.
- [ ] **Step 4: Run** `rallypoc test`. Expected: all pass.
- [ ] **Step 5: No-clipping check** as in Task 3 on the features list, board, timeline and a feature page.
- [ ] **Step 6: Commit** `feat(web): features in Rally's words`.

---

### Task 7: Capabilities and shared update pieces

**Files (this task owns all words in them):** `web/src/pm/InitiativesList.tsx`, `InitiativesFilter.tsx`, `InitiativePage.tsx`, `initiatives.ts`, `UpdateCard.tsx`, `PmActivity.tsx`, `pmControls.tsx`, `diff.ts`, `health.ts`, and their tests.

What changes:
- **Capability list:** page title "Capabilities", tab "All capabilities", columns "Features" and "Active features", the "n / total" aria ("0 of 3 features completed. …"), empty states, the Display and Filter menus.
- **Capability page:** tabs Overview, Activity, "Features"; the embedded features list.
- **Updates (both feature and capability pages):**
  - the composer placeholders "Write a feature update…" and "Write a capability update…";
  - system lines "created the feature" and "created the capability";
  - the diff rows "Features · [cube] <name> at risk";
  - the health aria text.

- [ ] **Step 1: Write the failing tests.** Call `expectRallyWords` in the render tests of: the capability list (tabs, rows, pills, the Display and Filter menus), the capability page on all three tabs, the update card with risk rows, and the activity composer for both kinds. Assert the exact aria strings "0 of 3 features completed. Click to view features." and "1 feature on track. Click to open updates.".
- [ ] **Step 2: Run them and see them fail.** Run: `cd web && npx vitest --run src/pm/InitiativesList.test.tsx src/pm/InitiativePage.test.tsx src/pm/initiatives.test.ts src/pm/PmActivity.test.tsx src/pm/diff.test.ts src/pm/health.test.ts`.
- [ ] **Step 3: Change the strings** in the owned files.
- [ ] **Step 4: Run** `rallypoc test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(web): capabilities and updates in Rally's words`.

---

### Task 8: Initiative as a grouping

**Files:**
- Modify (server): `server/app/domain.py`, `server/app/rally/base.py`, `server/app/rally/mapping.py`, `server/app/rally/portfolio.py`
- Modify (web): `web/src/api/types.ts`, `web/src/pm/initiatives.ts`, `web/src/pm/InitiativesList.tsx`, `web/src/test/fixtures.ts`
- Test: `server/tests/test_portfolio.py`, `server/tests/test_mapping.py`, `web/src/pm/initiatives.test.ts`, `web/src/pm/InitiativesList.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 and 7 (the files they own now carry the new words).
- Produces, server:
  - `Initiative` gains `parent_group_id: int | None = None` and `parent_group_name: str | None = None`: the Outcome's parent.
  - `RallyBase.outcome_parents(ids: Iterable[int]) -> dict[int, tuple[int, str] | None]` reads `/portfolioitem/outcome` by id with `fetch=ObjectID,Parent` and returns each id's `(parent id, parent name)` or None. It caches per session in a dict that `_reset` clears, and it queries only the ids it lacks. A `RallyError` other than 401 is logged at warning and those ids are not cached and map to None.
  - `initiative_from_rally(o, state_order, priority_field=None, parent_group: tuple[int, str] | None = None)` sets the two fields.
  - Both places that build Initiatives (`list_projects` and `_initiatives` in `portfolio.py`) look up `outcome_parents` for their `group_id`s and pass the result.
- Produces, web:
  - `Initiative.parent_group_id` and `parent_group_name` in `types.ts`.
  - `InitiativeGroup` gains `"initiative"`. The Display grouping options are: No grouping, Outcome, **Initiative**, Status, Owner, (Priority with the field).
  - Group buckets: key `initiative:<id>`, label the parent's name, sorted by name; none last under "No initiative". The group header uses the same glyph as the Outcome grouping.
  - Saved options with the old values still load.

- [ ] **Step 1: Write the failing tests.**
  - **Server:**
    - A capability whose Outcome has a Program parent gets `parent_group_id`/`parent_group_name`.
    - An Outcome with no parent gives None.
    - A second read of the same Outcome sends no second `/portfolioitem/outcome` query.
    - A failing Outcome read (403) leaves the list working, with the fields None and the lookup retried on the next call.
    - `list_projects`' `initiatives` carry the fields too (so a store merge from either read can't wipe them).
    - `_reset` clears the cache.
  - **Web:**
    - Grouping by Initiative yields labelled groups, sorted, with "No initiative" last.
    - The Display menu lists the options in the order above.
    - A capability with a missing parent name but an id still groups under its id's other members.
    - Saved options from before still load.
    - The Capability list with the Initiative grouping and its menu passes `expectRallyWords(container, { allow: ["initiative"] })`, and the same render **without** `allow` fails (this pins Review Focus 6).
- [ ] **Step 2: Run them and see them fail.** Run: `cd server && uv run pytest -q tests/test_portfolio.py tests/test_mapping.py` and `cd web && npx vitest --run src/pm/initiatives.test.ts src/pm/InitiativesList.test.tsx`.
- [ ] **Step 3: Implement** as the Interfaces say. The Outcome read is one batched query per distinct set of new Outcome ids.
- [ ] **Step 4: Run** `rallypoc test`. Expected: all pass.
- [ ] **Step 5: Live check, read-only.** With the stack up, open Capabilities, choose grouping Initiative, and confirm groups appear with names. Time the Capabilities list read before and after (`curl … /api/initiatives?teams=…`); the extra Outcome query must not add more than ~1 s on a cold first call. Record both numbers without IDs.
- [ ] **Step 6: Commit** `feat: group capabilities by initiative (the level above outcome)`.

---

### Task 9: Verify kit

**Files:** `.claude/skills/verify-rally-poc/flows.py`, `.claude/skills/verify-rally-poc/rallypoc`, `.claude/skills/verify-rally-poc/SKILL.md`

**Interfaces:** the flows find things by on-screen names. Every locator, role name, text match and assertion message in `flows.py` that contains an old word changes to the new word. API paths, route paths and JSON field names in `rallypoc` do not change.

- [ ] **Step 1: Update** every locator and expectation in the flows that uses an old word: tab, link and menu names ("Cycles" → "Sprints", "Projects" → "Features", "Initiatives" → "Capabilities", "Issues" → "Stories"), button names ("Create issue" → "Create story"), the "Show cycles" switch, aria names of rows and chips, and the settings rows. Run `rg -n -i '\b(issues?|cycles?|projects?|initiatives?)\b' .claude/skills/verify-rally-poc/flows.py` and rule on each remaining hit (code identifiers and API paths stay; on-screen names change).
- [ ] **Step 2: Add a flow `vocabulary`** that visits: My stories, a team's Stories, Sprints and Features, the features list, board and timeline, a feature page, Capabilities, a capability page, and Settings › Preferences. On each page, assert the sidebar, header, tabs and any open Display or Filter menu show none of the banned words. Test only chrome (nav, header, tab strip, menus), not data rows, because real data contains those words.
- [ ] **Step 3: Run** `rallypoc test`. Expected: pass.
- [ ] **Step 4: STOP before any live run.** The live flows and `check api`/`check ui` need `[DEMO]` data and a stack running in demo mode. The user deleted the demo data on 2026-10-20 and is currently running with the guard off. Ask the user: "To run the live flows I need to restart the stack in demo mode and run `rallypoc seed`, which recreates the [DEMO] items you deleted. OK?" If yes, then: `rallypoc stack down`, `rallypoc stack up`, `rallypoc seed`, `rallypoc check api`, `rallypoc check ui`, `rallypoc seed`; all flows must pass (the old 17 plus `vocabulary`), and the closing summary says what state the stack and demo data were left in. If no, say the flows are unrun and the unit tests are the only evidence.
- [ ] **Step 5: Commit** `test(verify): flows in Rally's words, plus a vocabulary flow`.

---

### Task 10: Docs

**Files:** `README.md`, `CLAUDE.md`, `.claude/skills/rally-poc-feature-map/features/*.md`, `.claude/skills/rally-poc-feature-map/features/README.md`

- [ ] **Step 1: Update** the on-screen labels the docs quote (the README "Screens" list, "Run it locally" steps that name screens, and every feature-map row that says "opens the Cycles tab", "My issues", "Projects", "Initiatives", and the like) to the new words. Keep the feature-map area ids and file names. Keep Linear's terms only where a row describes Linear's behaviour. Add a "Words" note to the README: a three-line table of Mira's words and Rally's field behind them (Sprint = Iteration, Feature = Feature, Capability = Capability, Story = Story / Defect, Task = Task, Initiative = the level above Outcome).
- [ ] **Step 2: Add one Gotcha** to `features/README.md`: the word list is guarded by `expectRallyWords` (web) and `test_user_words.py` (server), so a new screen must pass it.
- [ ] **Step 3: Run** `.claude/skills/rally-poc-feature-map/render-map`. Expected: exit 0. Then `rallypoc test`.
- [ ] **Step 4: Commit** `docs: README and feature map in Rally's words`.

---

## Spec coverage

| Requirement | Task |
|---|---|
| D39; D2 superseded for words | 1 |
| Cycle → Sprint, Project → Feature, Initiative → Capability, Issue → Story, Sub-issue → Task, everywhere on screen | 2 (server text), 3, 4, 5, 6, 7 (client) |
| Team, PI, Outcome, Label, Assignee, Estimate, Status unchanged; URLs, storage keys and code identifiers unchanged | Global Constraints; pinned in 3 |
| Initiative as a grouping on the Capability list | 8 |
| Outcome stays a grouping; no new screens | 7, 8 |
| Guard against regressions | 1 (helper), 2 (server scan), 9 (live flow) |
| Verify kit and docs | 9, 10 |

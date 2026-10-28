# Mira v2 Phase 3: open follow-ups

These are the review findings deferred while building Phase 3 (`docs/superpowers/plans/2026-10-16-mira-v2-phase3-linear-parity.md`). None blocked merge. The final whole-branch review triaged them all as able to wait, and the final fix wave closed the ones it marked must-fix:
- the submenu flip;
- the board footer;
- collapsed board columns in J/K;
- issue-page drafts;
- context-menu selection and key leakage;
- the demo prefix on sub-issues.

## Fix first (small, user-visible)
- ~~**Row-menu glyph keys ignore modifiers.** With the row menu focused, ⌘A, ⌘P or ⌘L open a submenu. Fix: add `!e.metaKey && !e.ctrlKey && !e.altKey` to the glyph branch in `web/src/components/Menu.tsx`.~~ (closed in Phase 4)
- ~~**Comment race on reload.** `loadIssueDetail` replaces `details[id]` wholesale. A reload landing while a comment is posting drops the temp comment, and the saved one then appears only on the next load.~~ (closed in Phase 4)
- ~~**Composer and row-menu assignee lists** show only cached people. ⌘K's assignee picker searches the whole workspace (D16).~~ (closed in Phase 4)
- ~~**The activity feed doesn't refresh** after edits made on the page itself.~~ (closed in Phase 4)

## Parity left open
- The inactive tab's soft edge. Linear's computed border is transparent, and the inventory doesn't record what draws the edge. Mira uses a 0.5px `line-menu` border. Also the Assigned tab measures 73.5px wide in Mira against 75 in Linear.
- Both issue-page columns sit 4px left of Linear's x (probably the scrollbar).
- The palette input and items are at x510.5 and 707 wide, against Linear's integer-rounded 511 and 708 (ruled acceptable).
- The visible 0.5px borders on dropdowns and off-pills, where Linear computes a transparent border.
- Issue-list group header bars: Linear paints a status-tinted gradient over the `hover` fill (team Active, In Review: `linear-gradient(90deg, lch(94.557 1.556 167.396) 0%, lch(94.44 0.5 282) 100%)`) and tints the caret (fill lch(80.94 12 167.396)). Mira's bar is the flat `hover` fill with a `line-caret` caret. The bar's inset and offsets match (Phase 4 Task 19).
- Not built: author and time links in Activity (Linear links them), and the "Ask Linear / Tab" hint (not copied, §18.12).

## Code quality
- **Server:** in `mapping.py`, "changed from [X] to []" is dropped silently. The `_CLAUSE` lookahead needs a comment. The unescape lambda could become a helper.
- **Menu:** builds its entries while closed. `indexOf` inside `map` is O(n²). Disabled items are reachable with the arrow keys. The input-row keycap duplicates `Keys` at a different size.
- **Display menu:** Focus's Importance is routed through a `Dropdown` with a dummy value. The tab width is hard-coded at 129px. The layout tabs lack tabpanel semantics.
- **`useViewOptions`:** `update` depends on the scope object's identity (memoised today).
- **`optionIcon`:** picks the estimate icon by id prefix.
- **RowMenu:** the position clamp can go negative, and the 190/420 values are magic numbers.
- **J/K paging logic** is duplicated in `keyboard/actions.ts` and `IssuePage.tsx`.
- **A direct `/issue/:key` link** loads the detail twice.
- **Display dropdowns** open with the first item highlighted, not the current value.
- **Sidebar:** the opacity-0 team "…" still takes pointer events over the caret, which matters on touch screens. The compose button uses `!important` overrides.
- **Sub-issue rows** have no priority spacer, so their IDs sit 26px left of issue IDs (ruled).
- **Small cleanups:**
  - `Keys` renders an empty keycap for a double space.
  - `Switch` has no disabled or focus style.
  - The test TZ pin uses a `globalThis` cast because `@types/node` isn't installed.

## Tests to add
- **Server:** pin the fixture ObjectID in the issue-detail activity test.
- **Store:** `createSubIssue` failure; `postComment` before details load.
- **Model:** boundaries for a cycle ending exactly now, Completed "None" through IssueView, and merged `cycleIds`.
- **Icons:** geometry beyond the In Progress radius and backlog dash count.
- **Menu:**
  - ArrowRight caret pass-through;
  - parent-with-input refocus;
  - focus restore after a choice;
  - ⌘K passing through a focused menu;
  - the submenu flip's left-edge and resize cases.
- **Board:** the collapsed-column strip; the no-prefill column; the drag-over tint.
- **Sidebar:** help menu order; reading `navCollapsed` from storage and ignoring malformed values; the team menu's focus and visibility (checked only over CDP).
- **Palette:** the multi-select chip; number keys after a query is typed; the un-assign path; keycap and check x.
- **Peek:** a tight estimate assertion; the unassigned state.
- **Issue page:**
  - the Team pill role;
  - Esc on the sub-issue row;
  - IME Enter in the title;
  - J/K clamping and a stale `visibleIds`;
  - the sub-issue cursor-at-end.
- **Comments:** a fast double ⌘↵ (no ref guard); Ctrl+Enter in the flow.
- **Composer:** Esc on the team chip and focus return; the team picker's shadow class; the unrelated-menu Esc case.
- **Flows:**
  - `issue_page`: a DELETE error in `finally` masks the original failure, and the sub-issue toggle isn't restored after a mid-flow failure.
  - `drag`: its clamp assumes the target is partly visible.
- **Process:** several tasks (3, 5, 6, 13, 15) have no recorded RED run; T15's is parked.

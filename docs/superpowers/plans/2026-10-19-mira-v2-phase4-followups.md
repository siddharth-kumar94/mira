# Mira v2 Phase 4: open follow-ups

These are the review findings deferred while building Phase 4 (`docs/superpowers/plans/2026-10-19-mira-v2-phase4.md`). None blocked merge. The final whole-branch review triaged them; its must-fix items (project health wiped by issue-side reads, "Posting…" awaiting the initiatives reload, queued writes crossing an account switch, stale burn-up docs, and three small items) were fixed in the final fix wave.

## First after merge

- **Slow reads.** `list_initiatives` calls the full `list_projects` and throws most of it away; the initiative page's Projects tab re-reads the same children; `ProjectPage` runs a full `initiative_detail` for one name pill. Live: the initiatives read takes 7–13 s and a large team load ~13 s. Slim the feature read for initiatives and carry the initiative name and key on `ProjectDetail`.
- **Real initiative name** still in the spec (§ near line 537 and its .html), the Phase 1–2 plan, and `server/tests/test_guard.py`, `test_portfolio.py` strings. Replace with generic text.
- **Null health in grouping/filtering:** `web/src/pm/model.ts` and `web/src/pm/initiatives.ts` still bucket a null health under "No updates" (PM list reads always carry health, so it shouldn't show today).

## By task (⚠ = could not be verified, needs live data or a decision)

### Task 1
- post_update/post_portfolio_comment duplicate the conversationpost create call (portfolio.py)
- no test pins the wrong-team message for check_portfolio (test_guard.py)
- TestClient import grouping in test_portfolio.py
- seeded update reads "progress 0%" (Rally rollup lag after story reset)
- seed_update's assert_demo passes the PROJECT constant, not the feature's project (seed_demo.py)

### Task 2
- _guarded_portfolio_row appends ",Tags" though PROJECT_FETCH now has Tags (duplicate fetch field)
- a detected non-enumerated attribute (no AllowedValues) sets the flag true though every write 422s
- no in-flight guard on concurrent first detection (duplicate work)
- "" for No priority unverified live (null may be needed)
- no-field bootstrap test doesn't assert the capability fetch
- a 401 on one kind discards the other kind's successful lookup (repeat lookup only)

### Task 3
- server/app/cycles.py imports iso from rally.mapping (pure module depends on rally/)
- limit=5000 per chunk in cycle stats/detail truncates silently
- test_team_load_child_teams pokes FakeClient._routes
- main.py domain import line >150 cols
- issues.py ~290 lines mixing cycle logic (split candidate)
- ⚠ Rally acceptance of StartDate equality in sibling query — verify in Task 20 live check (cycle-detail-read)

### Task 4
- fakeApi's names list is hand-kept (fixtures.ts) — type as Record<keyof Api,…>
- route.ts ID.test guard inconsistency (cosmetic)
- teams=join(",") repeated in client.ts
- no test for surplus segments under /settings/teams

### Task 5
- postUpdate/postPmComment create pmDetails with description "" when no detail loaded
- emptyData() duplicates the initial state list; postUpdate re-parses team ids from the list key
- ⚠ refresh()/poller never reload lists/cycleLists/pmDetails (PM data stale after first load) — PM screens must reload on mount

### Task 6
- ⚠ report's "pm.test.tsx changed on disk" — worktree clean at 2f75fe3, no other writer active (only Task 6 implementer was running); treated as the implementer's own edit notice.
- Phase 3 CycleIcon disagrees with CycleStatusIcon (Upcoming dotted vs solid; past ring colour; current play ink-3 vs ink-1) — row chips vs cycles list
- CycleStatusIcon hardcodes ink-4 track; cycle panel's Current track is chart-scope lch(66) — Task 9 must override
- age() throws on an unparseable timestamp (NaN) — guard with Number.isFinite; 4w and y units untested
- `num` duplicated in icons.tsx and pm.tsx; INITIATIVE glyph re-draws ICONS.initiatives
- no dark entries for health/overrun/chart-done/backlog hues (matches existing precedent)

### Task 7
- Filter menu hides Team field for team scopes, so an ART can't filter by child team

### Task 8
- Show older has no "Loading…" label during long loads (CyclesList.tsx:68)
- Legend rows swatch colour chosen by array index; re-implements amount() (pm.tsx:260)
- percent/clamp duplicated between progress.ts/CyclesList.tsx and pm.tsx
- redundant capacity condition (CyclesList.tsx:106); thin ART scope assertion and T8 some-set/none-set capacity tests
- accent rail line when the current cycle is the newest row (no next) — unreferenced

### Task 3-perf
- a failed page in the parallel fan-out doesn't cancel siblings (holds semaphore slots) — client.py:82
- fake returns the same rows for both EndDate queries; truncated/short-first-read has_older branches untested
- ended() keys on raw Name, cut_cycles on mapped name (cycle_names) — mismatched spellings could stop the read early
- deduped loadCycles returns an older promise without re-marking it latest (past 2→8→2 path)
- fixed-offset parallel pages can duplicate/miss rows if Rally data shifts mid-read (as before)

### Task 9
- row cycle chip and board-card project chip lack the measured 1px line-3 border (only row project chip has it)
- pts/clamp/elapsed helpers duplicated across Breakdown, CyclePage, CyclesList
- inScope cycle scope silently matches nothing without ctx.cycles
- CyclePage Retry lacks the stale-load guard
- FilterMenu shows Team for project scopes (unrequested, harmless)
- "N issues" counts filtered issues while the panel ignores filters (assumption to record)
- pre-existing CyclesList.test act() stderr noise
- ⚠ switcher shows "2026 PI4 Sprint 7 (IP …" not rewritten by D30's cycle_names — check the raw IP-sprint name format (Task 21 dry run or a follow-up)
- switcher lists the next/previous cycle twice (section + full list; duplicate aria-labels)
- switcher menu 10px icon gap vs 8, 4px top pad, fixed 260 width vs 233–247; "(completed)" state wording guessed
- Board Column "+" and project-scope prefill default untested directly

### Task 10
- PI filter options "PI 1" ×3 indistinguishable — add year/date hint
- ⌘-click on the Health chip opens the row href, not /activity (ProjectList.tsx:94-98)
- group by Team uses team_id only, while Teams filter/column use projectTeamIds (ruling 13)
- projects filters live in component state, lost on navigation (not per session)
- column headers don't sort (Linear's are "Order by X" buttons)
- layout-tab icons (thin outlines vs Linear's filled), combobox chevron smaller, submenu ▸ vs chevron — cross-view icon follow-up
- stale mira-filter-crop.png in report evidence; Filter/Display one slot right of Linear (no sidebar toggle, §19.5) unrecorded; hover checkbox selects nothing (D23)
- same-named PIs ending in the same year still read alike; mergeReleases keeps only the first of two disjoint known PIs; persisted PI filter values keyed by old copy ids

### Task 11
- board with Show empty columns but no matches shows the empty message, not empty columns (ProjectsView ~111)
- ProjectsView groups for the list even in board mode (duplicate work)
- `go` exported from ProjectList and imported by ProjectBoard — move to pm/nav.ts
- no test for muted date colour / completed-past-target not overdue on cards
- health <button> inside card/row <a> (invalid nesting; same as list) — whole-branch review
- dark board-column derived; card shadow ring invisible on dark — dark parity pass

### Task 12
- zoom keys rely on listener order vs g-prefix shortcuts ("g w" sets Week); fire while menus are open — route through the shared resolver
- far-out-of-range bars widen the scroll extent past the ±5y clamp (clamp bar left/right or overflow-x: clip)
- no row virtualization (~8.5k nodes at Year); Row re-renders on zoomOpen/viewHeight/cycles — memo(Row)
- barGeometry.overrun used only as a flag; width recomputed in the component
- health button inside row <a> (same as list); no retry after failed Show-cycles load
- zoom menu check-to-key gap 12 vs 6; ⌘⌥Z hint missing; day-label hide radius unmeasured; Linear labels Sundays at Month/Week, Mira Mondays

### Task 13
- two exported ordinalDate functions (diff.ts vs format.ts) plus rowDate — consolidate in format.ts
- main-column Latest update waits for the detail read while the sidebar uses p.latest_update — render latest_update until detail lands
- deep-link loadInitiative failure leaves "Loading…" forever and raises a global toast; heavy read for one name — add initiative ref to ProjectDetail later
- PriorityPicker/teamsLabel/ToArrow live in ProjectSidebar and hard-code "project" — move to pm/pmControls.tsx with kind (Task 16 needs it)
- "created the project" system line with no actor when no lead
- no test for the non-404 error state or a failing initiative fetch

### Task 14
- health picker 2–3px short (Linear 109 tall, rows 7 below top); first row highlighted on open where Linear's isn't
- no double-submit regression test (code is safe)
- mode tabs stay live while posting (hides "Posting…"; refused text lands in Comment mode) — disable the tablist while posting
- no test that Auto health gives an On track chip
- CommentCard duplicates issue comment markup and Time; border/radius and date style differ from update cards
- sr-only role=status span inside role=menu (Menu.tsx:157)
- IssuePage 'Add sub-issues…' test flaked once under full-suite load (passed on reruns)
- byline health text x418 vs Linear 416.5 (shared Task 13 byline)

### Task 15
- an empty capability-state read is cached for the session (how the ElementName bug stayed silent); TypeDef.Name is renameable — warn and don't cache on empty
- Description added to the shared INITIATIVE_FETCH (projects list and write paths pull every capability's HTML) — fetch it only in _initiatives/detail
- plain_summary keeps <style>/<script> text and breaks on comments with ">" (Word paste)
- health click on a wrapper span, not HealthChip's onClick
- Combobox/Row/Divider imported from ProjectsDisplay.tsx — move to components/
- selected tab 2px narrow (shared Tabs); initiative glyph always accent; buttons nested in row <a>
- initiatives filter chips duplicate PmFilterChips markup; filter state not persisted

### Task 16
- risk rows computed from current project health, not as of the update; Activity-feed initiative cards get no risk rows
- target pill hidden when no target while owner shows "No owner" (inconsistent; Linear showed a target)
- UpdateCard header implied by onUpdate — make an explicit prop
- detail-read failure hides card + Auto chip with no Retry; Retry test doesn't click; no tests for in-flight Auto suppression / initiative-scope retry
- embedded row name x and Status sparkline unmeasured; Projects/Activity tabs not compared

### Task 17
- Display names row is a clickable one-option menu (brief says read-only)
- nested ternary for the Teams route in App.tsx (Task 18 replaces)
- late old-session write finally-blocks still untrack/bump after reset (only matters on id collisions)
- no test for write rollback/toast after a reset

### Task 18
- searchRemote swallows errors → "No teams match"; no "Searching…" state
- useMemo mutates a ref during render (TeamsSettings.tsx:509)
- own Rally teams: switch and Leave are the same op; leaveTeam grows hiddenTeamIds over time
- cadence NaN on unparseable dates; tie rule and 10-day rounding untested
- back pill absolute inside the scroller; Team overview hover unmeasured; joined-not-loaded team shows "Team 9003"
- h1/subtitle 1.4px right of Linear — possibly a header layout offset, not the font

### Task 19
- ⚠ "Loading Team…" strike is accurate — Task 7's notFound shows "Couldn't find this team." after a 404; "Loading {name}…" only while the load runs.
- brief duplicate comment between a reload containing the saved comment and the post reply (needs a client token to remove)
- failed write + failed post-write refresh can toast twice
- icon-less group header offset unmeasured; inset test pins classes only; eslint-disable on the debounce effect lacks a note
- Linear's status-tinted gradient group bars + tinted caret; group count colour

### Task 20
- pi-chips passes with zero PI'd projects (add n_with_pi >= 1)
- settings flow hard-codes "^Data Services" (real team name) — derive from bootstrap
- initiatives flow hard-codes done=0, instant pill counts, row-centre click
- project-across-teams instant count; cycles flow accepts empty-state <p>; project-update hard-codes "On track", possibly cached sweep read
- RAW_PI_NAME misses year-less raw forms; suffix separator also takes ":"/"·" ("Sprint 3-4" → "Sprint 3 · 4"); retry loops with no pause; phase4_checks closure parameters
- `rallypoc stack restart --service` restarts both services

### Task 21
- ⚠ implementer reports two tool calls denied by the permission classifier (a read-only navigation and a [DEMO] comment post) that it retried verbatim and that then succeeded — surface to the user at finish.
- end_day assumes workspace offsets UTC−12..+11 (wrong at UTC+12..+14, misses western half-hour zones; starts read a day early east of UTC) — note in the map, or use WorkspaceConfiguration TimeZone
- seed closing_day re-implements end_day
- stable rows with undriven parts (palette-sidebar, palette-pickers); my-issues-priority evidence lacks line/test; one quoted test name mismatched (timeline.md:11)

### Task 22
- day cut is UTC while dates come from local stamps (evening changes land next day; extra point after 8pm local) — document or derive per offset
- test pokes FakeClient._routes; import order in test_rally_client.py; missing WSAPI path → 502 with no hint
- ⚠ no explicit handling; relies on Lookback closing their snapshots — unverified live
- test_burnup.py import order

### Task 23
- project scope "stairs" vs Linear's smooth sparse-sample curves — open parity gap
- mount tests written after mounts; cycles flow passes on chart OR unavailable (log which branch)
- Linear rounds the projection's corners at weekend plateaus; Mira's are sharp

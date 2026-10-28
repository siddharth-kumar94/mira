# Mira v2, Phase 3: Linear parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Phase 2 screen look and behave exactly like Linear: Focus grouping in My issues, the view chrome, list, board, display and filter menus, sidebar, ⌘K palette, peek card, issue page (with activity and comments) and composer. The values to match were measured from Linear side by side (spec §18).

**Architecture:**
- One server change: Rally revision text becomes activity events in Linear's words, in `server/app/rally/mapping.py` (D34).
- Client logic stays in pure modules: Focus grouping, Importance ordering and the completed window in `views/model.ts`, and option rules in `views/options.ts`.
- New presentational building blocks:
  - `components/icons.tsx`: Mira's own SVGs, drawn to Linear's geometry.
  - `components/ui.tsx`: chips, round icon buttons, a switch, a custom dropdown and keycaps.
- Screens are restyled on these blocks.
- Comments, activity and sub-issue creation get store methods over routes the proxy already has.

**Tech stack:** as Phases 1–2. No new dependencies. `lucide-react` is removed in the last task once nothing imports it.

**Spec:** `docs/specs/2026-10-16-mira-v2-linear-model-design.md`. §18 holds the measured values, D28–D34 the decisions, and assumptions 13–15 the open calls. Read it alongside this plan; the spec wins any conflict.

## Global Constraints

These are copied from the spec. Every task implicitly includes them.

- On screen, use Linear's words only: Issue, Team, Cycle, Project, Initiative, Label, Sub-issue, Estimate. Rally terms appear only inside the proxy (D2). This covers activity text (D34) and error copy.
- Only `server/app/rally/` knows Rally's shapes. The client sees domain objects only.
- Rally writes while developing are limited to `[DEMO] `-prefixed, `collabathon-demo`-tagged items in the demo project. `rallypoc stack up` always runs `WRITE_GUARD=demo`, and you must never pass `--write-guard off`.
- Never commit `.env`, API keys, real Rally ObjectIDs, or screenshots of real Rally data. Test fixtures are synthetic (9001, 1001, 501, …).
- **Icons are Mira's own SVGs**, drawn from the geometry in `/tmp/rea-research/v2cmp/inventory.md` (size, viewBox, stroke, shape) and its 4× crops in `/tmp/rea-research/v2cmp/icons/`.
  - Never copy Linear's SVG path data, sprites, fonts or other assets into the repo.
  - The crops are visual references only and stay in `/tmp`.
- **Measured values are binding:** sizes, paddings, radii, colors, shadows, font sizes and weights, and the order of every control, column and menu item. Sources:
  - spec §18;
  - `/tmp/rea-research/v2cmp/inventory.md`;
  - the gap lists `/tmp/rea-research/v2cmp/team-gaps.md` and `detail-gaps.md`.
  
  Where they disagree, the spec wins, then the inventory.
- Colors use the tokens in `web/src/styles/tokens.css`. A measured color with no token gets one, named for its role.
- Linear's typography already matches: 13/500 titles, 12/450 chips, Inter Variable, and the type sizes in `tokens.css`. Don't change it.
- Keyboard (§10): no shortcut fires while typing, except ⌘K and Esc. Space and Enter keep their native behaviour on buttons and checkboxes.
- Every screen keeps its URL (D18): `/my/assigned`, `/my/created`, `/team/:id/active|backlog|all`, `/issue/:key`.
- **Visual parity check:** every UI task ends with one.
  - Take Mira's screenshot with `/tmp/rea-tools/shot.sh <url> <out.png> [cdp steps]`, using the stack from `rallypoc stack up`.
  - Compare it with the named Linear reference under `/tmp/rea-research/v2cmp/`.
  - Record any remaining difference in the task report. "Looks close" is not a pass. Name each value you checked.

## Rulings made while planning

Each ruling covers a place where the spec is silent or ambiguous, with what it costs if wrong.

1. **Activity events get string ids** (`"<revision id>.<n>"`), because one Rally revision can become several events. *If wrong:* the client keys on a different field.
2. **Same-named cycles merge only behind `ctx.mergeCycles`**, which nothing sets until Phase 4's ART views. My issues and team views keep each team's cycle separate (D29). *If wrong:* one flag flips.
3. **The Cycle filter matches cycle ids**, not merged keys. In My issues its options are labelled "name · team". *If wrong:* restore the merged key behind the same flag.
4. **Display options move to a versioned storage key** (`mira-view:v2:<view>`). Old saved options are ignored once, so everyone gets the new defaults: Focus for My issues, Created on, Updated off. *If wrong:* people re-pick a few options once.
5. **Under Focus, ordering is always Importance.** Choosing another grouping restores the default ordering for that view: Priority, or Manual for Backlog. *If wrong:* one line in `normalizeOptions`.
6. **The peek card reads the issue from the cache** (title, properties and description are all in `Issue`). It never loads the issue detail. This also closes the follow-up where J/K with the peek open fetched a detail per keypress. *If wrong:* the card shows the cached description until the next poll.
7. **"+" on a group header opens the composer pre-filled** through `uiStore.openComposer(prefill)`. The prefill is a pure function of the group (`groupPrefill`). *If wrong:* the composer opens empty.
8. **Comments post optimistically.** On failure, the comment is removed, its text goes back into the box, and a toast explains why (the guard's 403 included). *If wrong:* the text is lost on a refused post.
9. **Labels on rows show the first two, then "+N"** (a Phase 2 follow-up in the same file).
10. **The Phase 2 follow-ups that live in files this plan rewrites are closed here:**
    - the date before the assignee;
    - labels truncated with no +N;
    - double-clicking a row's checkbox opens the issue;
    - the composer's Rally wording ("Rally needs a project…");
    - its "1 points";
    - its flash before the team load finishes;
    - the toolbar scrolling away.
    
    The rest stay in `docs/superpowers/plans/2026-10-16-mira-v2-phase2-followups.md` for Phase 4.

## Review Focus

These are inputs and failure modes the spec implies but no feature test would naturally exercise. Each has a test in its owning task.

1. **An open issue in an ended cycle under Focus** (Rally doesn't roll it forward). It lands in Other active, never in a "current" group or nowhere. *(Task 3.)*
2. **Saved options from Phase 2, or a saved `focus` grouping read by a team view.** The view falls back to its defaults and renders. *(Task 3.)*
3. **A 175-card board column.** The column body scrolls on its own while its header and the toolbar stay put; the page itself never scrolls vertically. *(Task 9.)*
4. **A comment refused by the write guard (403 on a real issue).** The optimistic comment disappears, its text is restored, and a toast says why. *(Tasks 2 and 16.)*
5. **Revision text with only dropped clauses, unknown fields, or values that contain commas.** There are no empty events, no crash, and no Rally field names on screen. *(Task 1.)*

---

## File structure

**Server, modified:**
- `server/app/rally/mapping.py`: `activities_from_rally` (replaces `activity_from_rally`).
- `server/app/rally/issues.py`: uses it.
- `server/app/domain.py`: `Activity.id: str`.
- Tests: `tests/test_mapping.py`, `tests/test_issue_reads.py`.

**Web, new** (under `web/src/`):
- `components/icons.tsx`: every icon as Mira's own SVG, plus `CycleIcon` and `ProjectIcon` (Task 4).
- `screens/IconSheet.tsx` and `screens/sheetData.ts`: the `/dev/icons` sheet (Task 4).
- `components/format.ts`: dates, ranges, "2h ago", "N Points" (Task 5).
- `components/ui.tsx`: `Chip`, `IconButton`, `Switch`, `Keys`, `Glyphs`, `Tile`, `tileColor`, `labelColor` (Task 5).
- `components/Menu.tsx`: `Menu` and `MenuButton` (Task 6).
- `components/RowMenu.tsx`: the row context menu (Task 11).
- `palette/optionIcon.tsx` and `palette/copy.ts` (Task 11).
- `issue/PeekCard.tsx` (Task 14).
- `editor/plain.ts`: `textToHtml` (Task 16).
- `issue/Activity.tsx`: the activity feed and comment box (Task 16).
- Tests beside each.

**Web, modified:**
- **Data and store:** `api/types.ts`, `api/client.ts`, `store/store.ts`, `store/ui.ts`, `test/fixtures.ts`, `test-setup.ts`.
- **Views:** `views/types.ts`, `views/model.ts`, `views/options.ts`, `views/drag.ts`, `views/IssueView.tsx`, `ListLayout.tsx`, `BoardLayout.tsx`, `DisplayMenu.tsx`, `FilterMenu.tsx`.
- **Components:** `components/ViewFrame.tsx`, `Tabs.tsx`, `GroupHeader.tsx`, `IssueRow.tsx`, `StatusIcon.tsx`, `PriorityIcon.tsx`, `Sidebar.tsx`, `Cheatsheet.tsx`, `Composer.tsx`, `SubIssueRow.tsx`, `Toasts.tsx`.
- **Screens:** `screens/MyIssues.tsx`, `screens/TeamIssues.tsx`.
- **Palette:** `palette/CommandPalette.tsx`, `palette/commands.ts`, `palette/pickers.ts`.
- **Issue page:** `issue/IssueDetail.tsx`, `IssuePage.tsx`, `SubIssueList.tsx`.
- **Keyboard:** `keyboard/shortcuts.ts`, `keyboard/actions.ts`.
- **App shell:** `route.ts`, `App.tsx`, `Overlays.tsx`.
- **Styles:** `styles/tokens.css`, `styles/app.css`.

**Web, deleted:** `issue/IssuePanel.tsx` (replaced by `PeekCard.tsx`), and the `lucide-react` dependency (Task 18).

**Verify kit:** `.claude/skills/verify-rally-poc/flows.py`. The existing flows move to the new control names, and two flows are added: `focus` (Task 18) and `issue-page` (Task 16, which also takes over the sub-issue round trip from `issue-peek`).

**Docs:** `README.md` (screens list), and the follow-ups file (closed items struck).

Run the server tests with `cd server && uv run pytest -q`. Run the web tests with `cd web && npx vitest --run && npm run typecheck`.

---

### Task 1: Activity in Linear's words (D34)

**Files:**
- Modify: `server/app/rally/mapping.py` (`activity_from_rally` → `activities_from_rally`)
- Modify: `server/app/rally/issues.py` (`get_issue`)
- Modify: `server/app/domain.py` (`Activity`)
- Test: `server/tests/test_mapping.py`, `server/tests/test_issue_reads.py`

**Interfaces:**
- Consumes: `cycle_names(raw) -> tuple[str, str]` (already in `mapping.py`, D30), `user_from_rally`.
- Produces: `activities_from_rally(o: Rally) -> list[Activity]`. `Activity.id` is `str` (`"<ObjectID>.<n>"`). `GET /api/issues/:ref` returns `activity` as these events, newest revision first, as Rally orders them.

- [ ] **Step 1: Write the failing tests**

In `server/tests/test_mapping.py`, change the import of `activity_from_rally` to `activities_from_rally`. Replace the existing activity test (the one asserting `(a.id, a.text) == (81, "SCHEDULE STATE changed …")`) with:

```python
@pytest.mark.parametrize("text, events", [
    ("Original revision", ["created the issue"]),
    ("SCHEDULE STATE changed from [Defined] to [In-Progress]", ["changed status from Todo to In Progress"]),
    ("SCHEDULE STATE changed from [Completed] to [Accepted], READY changed from [true] to [false]",
     ["changed status from In Review to Done"]),
    ("READY changed from [false] to [true]", ["moved to Todo"]),
    ("READY changed from [true] to [false]", ["moved to Backlog"]),
    ("OWNER added [Dana Demo]", ["assigned to Dana Demo"]),
    ("OWNER changed from [Dana Demo] to [Sam Sample]", ["assigned to Sam Sample"]),
    ("OWNER removed [Dana Demo]", ["unassigned Dana Demo"]),
    ("PRIORITY changed from [Low] to [Highest]", ["set priority to Urgent"]),
    ("PRIORITY changed from [Normal] to [High Attention]", ["set priority to High"]),
    ("PRIORITY removed [Medium]", ["removed the priority"]),
    ("ITERATION changed from [2026 PI4 Sprint 2] to [2026 PI4 Sprint 3]", ["moved to cycle PI 4 · Sprint 3"]),
    ("ITERATION removed [2026 PI4 Sprint 3]", ["removed from cycle PI 4 · Sprint 3"]),
    ("PLAN ESTIMATE changed from [3.0] to [5.0]", ["set estimate to 5"]),
    ("PLAN ESTIMATE added [0.5]", ["set estimate to 0.5"]),
    ("PLAN ESTIMATE removed [5.0]", ["removed the estimate"]),
    ("TAGS added [collabathon-demo]", ["added label collabathon-demo"]),
    ("TAGS removed [&#39;API-2022pi4]", ["removed label 'API-2022pi4"]),
    ("NAME changed from [Old] to [New, improved]", ["changed the title"]),
    ("DESCRIPTION changed from [<p>a</p>] to [<p>b</p>]", ["updated the description"]),
    ("FEATURE changed from [F1: Old] to [F2: Linear-style Rally client]", ["moved to project Linear-style Rally client"]),
    ("PORTFOLIO ITEM removed [F2: Linear-style Rally client]", ["removed from project Linear-style Rally client"]),
    ("BLOCKED changed from [false] to [true]", ["marked as blocked"]),
    ("BLOCKED changed from [true] to [false]", ["marked as unblocked"]),
    # Review focus 5: dropped clauses, unknown fields and commas inside values.
    ("RANK moved up, FLOW STATE changed from [Defined] to [In-Progress], ACCEPTED DATE added [Fri Oct 16 2026]", []),
    ("RELEASE changed from [PI 3] to [PI 4], SOME NEW FIELD added [x]", []),
    ("OWNER changed from [Smith, Jo] to [Doe, Al], PLAN ESTIMATE added [2.0]", ["assigned to Doe, Al", "set estimate to 2"]),
    ("", []),
])
def test_activity_reads_in_linears_words(text, events):
    got = activities_from_rally(rally_revision(81, text))
    assert [a.text for a in got] == events
    assert [a.id for a in got] == [f"81.{n}" for n in range(len(events))]
    assert all(a.author is not None and a.author.name == "Dana Demo" for a in got)
```

In `server/tests/test_issue_reads.py`, the detail test currently asserts:

```python
    assert [a.text for a in d.activity] == ["PLAN ESTIMATE changed from [3.0] to [5.0]"]
```

Change it to:

```python
    assert [(a.id, a.text) for a in d.activity] == [(f"{d.activity[0].id.split('.')[0]}.0", "set estimate to 5")]
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && uv run pytest -q tests/test_mapping.py tests/test_issue_reads.py`
Expected: FAIL with `ImportError: cannot import name 'activities_from_rally'`.

- [ ] **Step 3: Implement**

In `server/app/domain.py`, change `Activity.id`:

```python
class Activity(BaseModel):
    id: str
    author: User | None
    text: str
    created_at: str
```

In `server/app/rally/mapping.py`, replace `activity_from_rally` with:

```python
# A Rally revision joins clauses with ", ": "FIELD changed from [a] to [b]", "FIELD added [x]", "FIELD removed [x]".
# Values are bracketed and may hold commas, so a clause ends only at "]" followed by ", FIELD" or the end.
_CLAUSE = re.compile(r"(?:^|, )(?P<field>[A-Z][A-Z0-9_ ]*?) (?:changed from \[(?P<old>.*?)\] to \[(?P<new>.*?)\]"
                     r"|added \[(?P<added>.*?)\]|removed \[(?P<removed>.*?)\])(?=, [A-Z]|$)")
_STATUS_WORD = {"Defined": "Todo", "In-Progress": "In Progress", "Completed": "In Review", "Accepted": "Done"}
_PRIORITY_WORD = {"Highest": "Urgent", "Resolve Immediately": "Urgent", "High": "High", "High Attention": "High",
                  "Medium": "Medium", "Normal": "Medium", "Low": "Low"}
_READY_PHRASES = ("moved to Todo", "moved to Backlog")


def _number(text: str) -> str:
    try:
        n = float(text)
    except ValueError:
        return text
    return str(int(n)) if n.is_integer() else str(n)


def _project(text: str) -> str:
    return re.sub(r"^F\d+:\s*", "", text)


def _phrase(field: str, old: str | None, new: str | None, gone: str | None) -> str | None:
    """One revision clause in Linear's words (spec §18.10), or None when Linear has no word for the field."""
    if field == "SCHEDULE STATE":
        to, was = _STATUS_WORD.get(new or ""), _STATUS_WORD.get(old or "")
        if to is None:
            return None
        return f"changed status from {was} to {to}" if was else f"changed status to {to}"
    if field == "READY":
        return None if new is None else "moved to Todo" if new.lower() == "true" else "moved to Backlog"
    if field == "OWNER":
        return f"assigned to {new}" if new else f"unassigned {gone}" if gone else None
    if field in ("PRIORITY", "C_PRIORITY"):
        to = _PRIORITY_WORD.get(new or "")
        return f"set priority to {to}" if to else "removed the priority" if gone is not None else None
    if field == "ITERATION":
        if new:
            return f"moved to cycle {cycle_names(new)[0]}"
        return f"removed from cycle {cycle_names(gone)[0]}" if gone else None
    if field == "PLAN ESTIMATE":
        return f"set estimate to {_number(new)}" if new else "removed the estimate" if gone is not None else None
    if field == "TAGS":
        return f"added label {new}" if new else f"removed label {gone}" if gone else None
    if field == "NAME":
        return "changed the title"
    if field == "DESCRIPTION":
        return "updated the description"
    if field in ("FEATURE", "PORTFOLIO ITEM"):
        return f"moved to project {_project(new)}" if new else f"removed from project {_project(gone)}" if gone else None
    if field == "BLOCKED":
        return None if new is None else "marked as blocked" if new.lower() == "true" else "marked as unblocked"
    return None


def activities_from_rally(o: Rally) -> list[Activity]:
    """Spec D34: one Rally revision becomes zero or more events in Linear's words. Unknown clauses are dropped."""
    text = (o.get("Description") or "").strip()
    unescape = lambda v: None if v is None else html.unescape(v)  # noqa: E731
    if text.lower().startswith("original revision"):
        phrases = ["created the issue"]
    else:
        phrases = []
        for m in _CLAUSE.finditer(text):
            new = m["new"] if m["new"] is not None else m["added"]
            phrase = _phrase(m["field"].strip(), unescape(m["old"]), unescape(new), unescape(m["removed"]))
            if phrase:
                phrases.append(phrase)
        if any(p.startswith("changed status") for p in phrases):  # the status change already says it
            phrases = [p for p in phrases if p not in _READY_PHRASES]
    author = user_from_rally(o.get("User"))
    return [Activity(id=f"{o['ObjectID']}.{n}", author=author, text=p, created_at=o["CreationDate"])
            for n, p in enumerate(phrases)]
```

In `server/app/rally/issues.py`, import `activities_from_rally` in place of `activity_from_rally`, and in `get_issue` replace:

```python
        activity = [activity_from_rally(o) for o in revision_rows]
```

with:

```python
        activity = [a for o in revision_rows for a in activities_from_rally(o)]
```

- [ ] **Step 4: Run the server suite**

Run: `cd server && uv run pytest -q`
Expected: all pass.

- [ ] **Step 5: Check it live (read-only)**

Run, from the repo root:
- `.claude/skills/verify-rally-poc/rallypoc stack down`
- `.claude/skills/verify-rally-poc/rallypoc stack up`
- `.claude/skills/verify-rally-poc/rallypoc api GET /api/issues/US250068 --expect 200 --save act-check`

Then read `act-check.json` under `rallypoc evidence dir`. Expected: every `activity[].text` reads like the table in spec §18.10, with no upper-case Rally field names and no `[`. Paste three sample texts into the report. Don't paste issue titles or IDs.

- [ ] **Step 6: Commit**

```bash
git add server/app/domain.py server/app/rally/mapping.py server/app/rally/issues.py server/tests/test_mapping.py server/tests/test_issue_reads.py
git commit -m "Activity: Rally revisions read in Linear's words (D34)"
```

---

### Task 2: Client data for comments, activity and new sub-issues

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/api/client.ts`, `web/src/store/store.ts`, `web/src/test/fixtures.ts`
- Test: `web/src/store/store.test.ts`, `web/src/api/client.test.ts`

**Interfaces:**
- Consumes: `POST /api/issues/:id/comments {html}` → `Comment` (201). `POST /api/issues/:id/sub-issues {title, assignee_id?, hours?}` → `SubIssue` (201). Both are guarded server-side (§11).
- Produces:
  - `Activity.id: string`.
  - `interface IssueExtras { comments: Comment[]; activity: Activity[] }`.
  - `AppState.details: Record<number, IssueExtras>`, filled by `loadIssueDetail`.
  - `AppState.postComment(issueId: number, html: string): Promise<boolean>`: optimistic; resolves `false` on failure after removing the comment.
  - `AppState.createSubIssue(issueId: number, title: string): Promise<SubIssue | null>`.
  - `Api.postComment(issueId, html)` and `Api.createSubIssue(issueId, data: SubIssueCreate)`.
  - `interface SubIssueCreate { title: string; assignee_id?: number | null; hours?: number | null }`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/store/store.test.ts`. The imports also need `Comment` from `../api/types`, and `makeSubIssue` from `../test/fixtures`.

```ts
const detail = (over = {}) => ({
  issue: makeIssue(), sub_issues: [], cycles: [], projects: [], users: [],
  comments: [{ id: 91, author: DANA, html: "<p>First</p>", created_at: "2026-10-16T09:00:00.000Z" }],
  activity: [{ id: "81.0", author: DANA, text: "set estimate to 5", created_at: "2026-10-16T08:00:00.000Z" }],
  ...over,
});

test("the issue detail keeps its comments and activity", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  expect(store.getState().details[1001].comments.map((c) => c.html)).toEqual(["<p>First</p>"]);
  expect(store.getState().details[1001].activity.map((a) => a.text)).toEqual(["set estimate to 5"]);
});

test("a comment shows at once and the server copy replaces it", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  const reply = deferred<Comment>();
  api.postComment.mockReturnValueOnce(reply.promise);
  const posting = store.getState().postComment(1001, "<p>Second</p>");
  const shown = store.getState().details[1001].comments;
  expect(shown.map((c) => [c.html, c.author?.id])).toEqual([["<p>First</p>", 501], ["<p>Second</p>", 501]]);
  expect(shown[1].id).toBeLessThan(0); // a temporary id until Rally answers
  reply.resolve({ id: 92, author: DANA, html: "<p>Second</p>", created_at: "2026-10-16T12:00:00.000Z" });
  expect(await posting).toBe(true);
  expect(store.getState().details[1001].comments.map((c) => c.id)).toEqual([91, 92]);
});

test("a refused comment disappears and says why", async () => {
  // Review focus 4: the guard refuses comments on real issues.
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce(detail());
  await store.getState().loadIssueDetail(1001);
  api.postComment.mockRejectedValueOnce(new ApiError(403, "Demo mode: only [DEMO] issues can take comments"));
  expect(await store.getState().postComment(1001, "<p>Nope</p>")).toBe(false);
  expect(store.getState().details[1001].comments.map((c) => c.id)).toEqual([91]);
  expect(store.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] issues can take comments"]);
});

test("a new sub-issue joins its issue", async () => {
  const { store, api } = await readyStore();
  api.createSubIssue.mockResolvedValueOnce(makeSubIssue({ id: 4100, key: "TA4100", title: "[DEMO] New step", issue_id: 1001 }));
  const sub = await store.getState().createSubIssue(1001, "[DEMO] New step");
  expect(api.createSubIssue).toHaveBeenCalledWith(1001, { title: "[DEMO] New step" });
  expect(sub?.id).toBe(4100);
  expect(store.getState().subIssues[4100].issue_id).toBe(1001);
  expect(store.getState().issues[1001].sub_issue_count).toBe(2);
});
```

Add to `web/src/api/client.test.ts`, using the file's existing `serve` import:

```ts
test("comments and sub-issues post to their issue", async () => {
  const fetchMock = serve({
    "POST /api/issues/1001/comments": [201, { id: 92, author: null, html: "<p>x</p>", created_at: "2026-10-16T12:00:00.000Z" }],
    "POST /api/issues/1001/sub-issues": [201, { id: 4100 }],
  });
  expect((await api.postComment(1001, "<p>x</p>")).id).toBe(92);
  expect((await api.createSubIssue(1001, { title: "[DEMO] Step" })).id).toBe(4100);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ html: "<p>x</p>" });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/store/store.test.ts src/api/client.test.ts`
Expected: FAIL. `postComment`, `createSubIssue` and `details` don't exist yet.

- [ ] **Step 3: Implement**

In `web/src/api/types.ts`:

```ts
export interface Activity { id: string; author: User | null; text: string; created_at: string }
export interface SubIssueCreate { title: string; assignee_id?: number | null; hours?: number | null }
```

The first line replaces the existing `Activity`; add `SubIssueCreate` after `SubIssuePatch`.

In `web/src/api/client.ts`:
- Add `Comment` and `SubIssueCreate` to the type import.
- Add to `interface Api`:

```ts
  postComment(issueId: number, html: string): Promise<Comment>;
  createSubIssue(issueId: number, data: SubIssueCreate): Promise<SubIssue>;
```

- Add to `api`:

```ts
  postComment: (id, html) => request("POST", `/issues/${id}/comments`, { html }),
  createSubIssue: (id, data) => request("POST", `/issues/${id}/sub-issues`, data),
```

In `web/src/test/fixtures.ts`, add `"postComment", "createSubIssue"` to the `names` list in `fakeApi`.

In `web/src/store/store.ts`:
- Add `Activity` and `Comment` to the type import.
- Export `export interface IssueExtras { comments: Comment[]; activity: Activity[] }`.
- Add to `AppState`, after `subIssues`:

```ts
  /** Comments and activity per issue, from its detail load (spec §18.10). */
  details: Record<number, IssueExtras>;
```

and after `updateSubIssue`:

```ts
  /** Shows the comment at once; resolves false (comment removed, toast shown) when Rally or the guard refuses it. */
  postComment(issueId: number, html: string): Promise<boolean>;
  createSubIssue(issueId: number, title: string): Promise<SubIssue | null>;
```

Inside `createAppStore`, next to `let toastSeq = 0;`, add `let tempSeq = 0;`. In the initial state, add `details: {},` after `subIssues: {},`. In `loadIssueDetail`, replace the `set(...)` line with:

```ts
          set((s) => ({
            ...mergeRefs(s, d), ...mergeItems(s, [d.issue], d.sub_issues, started),
            details: { ...s.details, [d.issue.id]: { comments: d.comments, activity: d.activity } },
          }));
```

Then add after `updateSubIssue`:

```ts
      async postComment(issueId, html) {
        const me = get().meta?.me ?? null;
        const temp: Comment = { id: -++tempSeq, author: me, html, created_at: new Date().toISOString() };
        const edit = (fn: (cs: Comment[]) => Comment[]) => set((s) => {
          const d = s.details[issueId] ?? { comments: [], activity: [] };
          return { details: { ...s.details, [issueId]: { ...d, comments: fn(d.comments) } } };
        });
        edit((cs) => [...cs, temp]);
        try {
          const saved = await api.postComment(issueId, html);
          edit((cs) => cs.map((c) => (c.id === temp.id ? saved : c)));
          return true;
        } catch (e) {
          edit((cs) => cs.filter((c) => c.id !== temp.id));
          fail(e, () => void get().postComment(issueId, html));
          return false;
        }
      },

      async createSubIssue(issueId, title) {
        try {
          const sub = await api.createSubIssue(issueId, { title });
          putSub(sub);
          const parent = get().issues[issueId];
          if (parent) putIssue({ ...parent, sub_issue_count: parent.sub_issue_count + 1 });
          return sub;
        } catch (e) {
          fail(e);
          return null;
        }
      },
```

- [ ] **Step 4: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. (Nothing renders the new state yet. Task 14 does.)

- [ ] **Step 5: Commit**

```bash
git add web/src/api web/src/store/store.ts web/src/store/store.test.ts web/src/test/fixtures.ts
git commit -m "Store: comments, activity and new sub-issues for the issue page"
```

---

### Task 3: Focus grouping, Importance ordering, the completed window, and display options v2

**Files:**
- Modify: `web/src/views/types.ts`, `web/src/views/model.ts`, `web/src/views/options.ts`, `web/src/views/drag.ts`, `web/src/views/IssueView.tsx` (the `inScope` call and `ctx.teams` only)
- Test: `web/src/views/model.test.ts`, `web/src/views/options.test.ts`, `web/src/views/drag.test.ts`

**Interfaces:**
- Consumes: `Cycle.short_name` (D30), `Team`.
- Produces:
  - `GroupBy` gains `"focus"`. `OrderBy` gains `"importance"`. `Property` gains `"creator"` and `"created"`.
  - `type CompletedWindow = "none" | "day" | "week" | "two_weeks"`.
  - `DisplayOptions` gains `completed: CompletedWindow` and `collapsed: string[]` (group keys).
  - `Context` gains `teams: Record<number, Team>` and `mergeCycles?: boolean`.
  - `Group` gains `cycle: Cycle | null` and `teamId: number | null` (the cycle's team, for labels and the composer prefill).
  - `inScope(i, scope, ctx, completed?: CompletedWindow)`. Team Active excludes Done (D31). My issues keeps Done within `completed` (default `"two_weeks"`).
  - `groupTotal(g: Group): { points: number } | { count: number }`.
  - `groupPrefill(g: Group): ComposerPrefill | null`, with `interface ComposerPrefill { teamId?: number; status?: Status; priority?: Priority; assignee_id?: number | null; project_id?: number; cycle_id?: number | null }`, exported from `views/types.ts`.
  - `FOCUS_HINT` in `drag.ts`.
  - `DEFAULT_PROPERTIES`, `normalizeOptions(o, scope)` and `isDefault(o, scope)` in `options.ts`. `isDefault` drives the Display dot in Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/views/model.test.ts`. The file already has `NOW` (2026-10-16 12:00Z, inside SPRINT3; SPRINT4 is upcoming), `ctx` (a team view, `teamId: 9001`), `opts` and `ids`. Make three edits first:
- Add `AIML` and `DEMO_TEAM` to the fixture import, and `groupPrefill` and `groupTotal` to the model import.
- Add `teams: { 9001: DEMO_TEAM, 9002: AIML }` to `ctx`.
- Give `opts` the new fields: `({ layout: "list", groupBy: "status", orderBy: "priority", showEmpty: false, completed: "two_weeks", collapsed: [], properties: [], ...over })`.

```ts
const PAST = { ...SPRINT3, id: 300, name: "PI 4 · Sprint 2", short_name: "Sprint 2", start: "2026-09-24T04:00:00.000Z", end: "2026-10-08T03:59:59.000Z" };
const focusCtx = { ...ctx, now: NOW, teamId: undefined, cycles: { ...ctx.cycles, 300: PAST } };
const focus = opts({ groupBy: "focus", orderBy: "importance" });

test("Focus: urgent, each team's current cycle, upcoming cycles, other active, backlog, completed", () => {
  const xs = [
    makeIssue({ id: 1, priority: 1, cycle_id: 302 }),                                   // urgent beats its cycle
    makeIssue({ id: 2, cycle_id: 301, status: "todo" }),
    makeIssue({ id: 3, team_id: 9002, cycle_id: 401, status: "in_progress" }),          // AI/ML's own Sprint 3
    makeIssue({ id: 4, cycle_id: 302, status: "todo" }),
    makeIssue({ id: 5, cycle_id: null, status: "in_review" }),
    makeIssue({ id: 6, cycle_id: 300, status: "todo" }),                                // review focus 1: ended cycle
    makeIssue({ id: 7, cycle_id: null, status: "backlog" }),
    makeIssue({ id: 8, status: "done", completed_at: "2026-10-16T09:00:00.000Z" }),
  ];
  const groups = buildGroups(xs, focus, focusCtx);
  expect(groups.map((g) => [g.label, ids(g.issues)])).toEqual([
    ["Urgent issues", [1]],
    ["PI 4 · Sprint 3 · AI/ML Solutions", [3]],
    ["PI 4 · Sprint 3 · Data Services", [2]],
    ["PI 4 · Sprint 4 · Data Services", [4]],
    ["Other active", [5, 6]],
    ["Backlog", [7]],
    ["Completed", [8]],
  ]);
  expect(groups[1].cycle?.id).toBe(401);
  expect(groups[1].teamId).toBe(9002);
});

test("Importance: further along first, then priority, then rank; completed newest first", () => {
  const xs = [
    makeIssue({ id: 1, cycle_id: null, status: "todo", priority: 2, rank: "A" }),
    makeIssue({ id: 2, cycle_id: null, status: "in_progress", priority: 4, rank: "B" }),
    makeIssue({ id: 3, cycle_id: null, status: "in_review", priority: 0, rank: "C" }),
    makeIssue({ id: 4, cycle_id: null, status: "todo", priority: 0, rank: "D" }),
    makeIssue({ id: 5, cycle_id: null, status: "todo", priority: 2, rank: "0" }),
    makeIssue({ id: 6, status: "done", completed_at: "2026-10-15T09:00:00.000Z" }),
    makeIssue({ id: 7, status: "done", completed_at: "2026-10-16T09:00:00.000Z" }),
  ];
  const groups = buildGroups(xs, focus, focusCtx);
  expect(ids(groups[0].issues)).toEqual([3, 2, 5, 1, 4]);
  expect(ids(groups[1].issues)).toEqual([7, 6]);
});

test("Active has no Done (D31); My issues keeps Done inside the completed window", () => {
  const done = (hoursAgo: number) => makeIssue({ status: "done", completed_at: new Date(NOW - hoursAgo * 3600_000).toISOString() });
  const active = { kind: "team", teamId: 9001, tab: "active" } as const;
  const mine = { kind: "my", tab: "assigned" } as const;
  const c = { meId: 501, now: NOW };
  expect(inScope(done(1), active, c)).toBe(false);
  expect(inScope(makeIssue({ status: "in_review" }), active, c)).toBe(true);
  expect(inScope(done(20), mine, c, "day")).toBe(true);
  expect(inScope(done(30), mine, c, "day")).toBe(false);
  expect(inScope(done(30), mine, c, "week")).toBe(true);
  expect(inScope(done(24 * 10), mine, c, "two_weeks")).toBe(true);
  expect(inScope(done(1), mine, c, "none")).toBe(false);
  expect(inScope(makeIssue({ status: "todo" }), mine, c, "none")).toBe(true);
});

test("cycle groups keep each team's sprint separate unless merging is asked for (D29)", () => {
  const xs = [makeIssue({ id: 1, cycle_id: 301 }), makeIssue({ id: 2, team_id: 9002, cycle_id: 401 })];
  expect(buildGroups(xs, opts({ groupBy: "cycle" }), { ...ctx, teamId: undefined }).map((g) => g.label))
    .toEqual(["PI 4 · Sprint 3 · AI/ML Solutions", "PI 4 · Sprint 3 · Data Services"]); // same dates: by team name
  expect(buildGroups(xs, opts({ groupBy: "cycle" }), { ...ctx, teamId: undefined, mergeCycles: true }).map((g) => g.label))
    .toEqual(["PI 4 · Sprint 3"]);
  expect(buildGroups([xs[0]], opts({ groupBy: "cycle" }), ctx).map((g) => g.label)).toEqual(["PI 4 · Sprint 3"]); // a team view
});

test("group totals are points when any issue has an estimate, else a count", () => {
  const [g] = buildGroups([makeIssue({ id: 1, estimate: 3 }), makeIssue({ id: 2, estimate: null }), makeIssue({ id: 3, estimate: 5 })],
    opts({ groupBy: "none" }), ctx);
  expect(groupTotal(g)).toEqual({ points: 8 });
  const [h] = buildGroups([makeIssue({ estimate: null })], opts({ groupBy: "none" }), ctx);
  expect(groupTotal(h)).toEqual({ count: 1 });
});

test("a group's + pre-fills the composer with the group's value", () => {
  const xs = [makeIssue({ id: 1, priority: 1 }), makeIssue({ id: 2, cycle_id: 302, status: "todo", priority: 3 }),
              makeIssue({ id: 3, cycle_id: null, status: "backlog", priority: 3 }), makeIssue({ id: 4, cycle_id: null, status: "todo", priority: 3 })];
  const byLabel = Object.fromEntries(buildGroups(xs, focus, focusCtx).map((g) => [g.label, groupPrefill(g)]));
  expect(byLabel["Urgent issues"]).toEqual({ priority: 1 });
  expect(byLabel["PI 4 · Sprint 4 · Data Services"]).toEqual({ teamId: 9001, cycle_id: 302, status: "todo" });
  expect(byLabel["Backlog"]).toEqual({ status: "backlog" });
  expect(byLabel["Other active"]).toBeNull();
  const status = buildGroups([makeIssue({ status: "in_review" })], opts({ groupBy: "status" }), ctx);
  expect(groupPrefill(status[0])).toEqual({ status: "in_review" });
  const people = buildGroups([makeIssue({ assignee: null })], opts({ groupBy: "assignee" }), ctx);
  expect(groupPrefill(people[0])).toEqual({ assignee_id: null });
  const projects = buildGroups([makeIssue()], opts({ groupBy: "project" }), ctx);
  expect(groupPrefill(projects[0])).toEqual({ project_id: 201 });
});
```

Delete the two tests "cycle groups merge same-named sprints …" and "the Cycle filter lists a merged sprint once …". Then add:

```ts
test("the Cycle filter matches each team's cycle and names the team across teams", () => {
  const xs = [makeIssue({ id: 1, cycle_id: 301 }), makeIssue({ id: 2, team_id: 9002, cycle_id: 401 }), makeIssue({ id: 4, cycle_id: null })];
  const options = filterOptions("cycle", xs, { ...ctx, teamId: undefined });
  expect(options.map((o) => o.label)).toEqual(["PI 4 · Sprint 3 · AI/ML Solutions", "PI 4 · Sprint 3 · Data Services", "No cycle"]);
  expect(ids(xs.filter((i) => matches(i, { cycle: [301] }, ctx)))).toEqual([1]);
});
```

Replace `web/src/views/options.test.ts` with:

```ts
import { beforeEach, expect, test } from "vitest";
import { DEFAULT_PROPERTIES, defaultOptions, isDefault, loadOptions, normalizeOptions, saveOptions } from "./options";

beforeEach(() => localStorage.clear());
const active = { kind: "team", teamId: 9001, tab: "active" } as const;
const backlog = { kind: "team", teamId: 9001, tab: "backlog" } as const;
const mine = { kind: "my", tab: "assigned" } as const;

test("defaults follow Linear: My issues by Focus; teams by status and priority; Backlog manual", () => {
  expect(defaultOptions(mine)).toEqual({ layout: "list", groupBy: "focus", orderBy: "importance", showEmpty: false,
    completed: "day", collapsed: [], properties: DEFAULT_PROPERTIES });
  expect(defaultOptions(active)).toMatchObject({ groupBy: "status", orderBy: "priority" });
  expect(defaultOptions(backlog).orderBy).toBe("manual");
  expect(DEFAULT_PROPERTIES).toContain("created");
  expect(DEFAULT_PROPERTIES).not.toContain("updated");
  expect(DEFAULT_PROPERTIES).not.toContain("creator");
});

test("Focus always orders by Importance; leaving it restores the view's default ordering", () => {
  expect(normalizeOptions({ ...defaultOptions(mine), orderBy: "estimate" }, mine).orderBy).toBe("importance");
  expect(normalizeOptions({ ...defaultOptions(mine), groupBy: "status" }, mine).orderBy).toBe("priority");
  expect(normalizeOptions({ ...defaultOptions(active), groupBy: "focus", orderBy: "importance" }, active))
    .toMatchObject({ groupBy: "status", orderBy: "priority" }); // review focus 2: Focus is My issues only
});

test("options are saved per view under a versioned key", () => {
  saveOptions("team:9001:active", { ...defaultOptions(active), layout: "board", collapsed: ["todo"] });
  expect(localStorage.getItem("mira-view:v2:team:9001:active")).not.toBeNull();
  expect(loadOptions("team:9001:active", active)).toMatchObject({ layout: "board", collapsed: ["todo"] });
  expect(loadOptions("team:9001:backlog", backlog).layout).toBe("list");
});

test("Phase 2's saved options, corrupt JSON and unknown values fall back to the defaults", () => {
  // Review focus 2.
  localStorage.setItem("mira-view:my:assigned", JSON.stringify({ layout: "board", groupBy: "status" }));
  expect(loadOptions("my:assigned", mine)).toEqual(defaultOptions(mine));
  localStorage.setItem("mira-view:v2:a", "{not json");
  expect(loadOptions("a", active)).toEqual(defaultOptions(active));
  localStorage.setItem("mira-view:v2:b", JSON.stringify({ layout: "kanban", groupBy: "state", orderBy: "manual", showEmpty: "yes",
    completed: "year", collapsed: [3, "todo"], properties: ["feature", "id"] }));
  expect(loadOptions("b", active)).toEqual({ ...defaultOptions(active), orderBy: "manual", collapsed: ["todo"], properties: ["id"] });
  localStorage.setItem("mira-view:v2:c", JSON.stringify({ properties: ["feature"] }));
  expect(loadOptions("c", active).properties).toEqual(DEFAULT_PROPERTIES); // only unknown names: keep the defaults
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
  expect(loadOptions("d", active, broken)).toEqual(defaultOptions(active));
  expect(() => saveOptions("d", defaultOptions(active), broken)).not.toThrow();
});

test("isDefault ignores collapsed groups and property order", () => {
  expect(isDefault({ ...defaultOptions(mine), collapsed: ["f:done"] }, mine)).toBe(true);
  expect(isDefault({ ...defaultOptions(mine), properties: [...DEFAULT_PROPERTIES].reverse() }, mine)).toBe(true);
  expect(isDefault({ ...defaultOptions(mine), layout: "board" }, mine)).toBe(false);
});
```

In `web/src/views/drag.test.ts`:
- The `group` helper must return the new `Group` fields: `({ key, label: key, field, value, cycleIds, cycle: null, teamId: null, issues })`.
- Add `FOCUS_HINT` to the import from `./drag`.
- Add the test:

```ts
test("Focus groups are not drop targets and don't reorder", () => {
  const urgent = group("focus", "f:urgent", null, [a]);
  const other = group("focus", "f:active", null, [b, c]);
  expect(drop({ from: urgent, to: other, orderBy: "importance" }).hint).toBe(FOCUS_HINT);
  expect(drop({ issue: b, from: other, to: other, overId: 3, orderBy: "importance" }).hint).toBe(FOCUS_HINT);
  expect(drop({ issue: b, from: other, to: other, overId: 2, orderBy: "importance" })).toEqual({ patch: null, rank: null, hint: null });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/views`
Expected: FAIL on the new tests (unknown group `focus`, missing exports).

- [ ] **Step 3: Implement `views/types.ts`**

```ts
import type { Priority, Status } from "../api/types";

/** A view is a scope, plus filters, plus display options (spec §7). */
export type Layout = "list" | "board";
export type GroupBy = "focus" | "status" | "assignee" | "priority" | "project" | "cycle" | "none";
export type OrderBy = "importance" | "manual" | "priority" | "updated" | "created" | "estimate";
export type Property = "priority" | "id" | "status" | "labels" | "project" | "cycle" | "estimate" | "assignee" | "creator" | "created" | "updated";
/** My issues' "Completed issues" window (spec §18.1, assumption 2). */
export type CompletedWindow = "none" | "day" | "week" | "two_weeks";
export interface DisplayOptions {
  layout: Layout; groupBy: GroupBy; orderBy: OrderBy; showEmpty: boolean; completed: CompletedWindow;
  /** Group keys folded shut in this view (spec §18.3). */
  collapsed: string[];
  properties: Property[];
}

export type FilterField = "status" | "assignee" | "creator" | "priority" | "label" | "project" | "cycle";
/** A status, a priority, an id, a label name, or null for "none" (no assignee, no project …). */
export type FilterValue = string | number | null;
/** Values within a field are ORed; fields are ANDed. */
export type Filters = Partial<Record<FilterField, FilterValue[]>>;

export type Scope =
  | { kind: "my"; tab: "assigned" | "created" }
  | { kind: "team"; teamId: number; tab: "active" | "backlog" | "all" };

/** What a group's "+" puts into the composer (plan ruling 7). */
export interface ComposerPrefill {
  teamId?: number; status?: Status; priority?: Priority; assignee_id?: number | null; project_id?: number; cycle_id?: number | null;
}
```

- [ ] **Step 4: Implement `views/model.ts`**

Apply these changes to the current file.

**Imports and constants.** Add `Team` to the type import from `../api/types`, and add `CompletedWindow` and `ComposerPrefill` to the import from `./types`. Replace `RECENT_DONE_MS` and `LIST_STATUS_ORDER` with:

```ts
const DAY = 24 * 60 * 60 * 1000;
/** Bootstrap loads 14 days of Done (spec §6.2); the window narrows it per view (§18.1). */
export const COMPLETED_MS: Record<CompletedWindow, number> = { none: -1, day: DAY, week: 7 * DAY, two_weeks: 14 * DAY };
const PROGRESS: Status[] = ["in_review", "in_progress", "todo", "backlog", "done"]; // work in flight first
```

**`Context`.** Add:

```ts
  teams: Record<number, Team>;
  /** Same-named cycles become one group or filter value (ART views, Phase 4). Off everywhere else (D29). */
  mergeCycles?: boolean;
```

**`Group`.** Add:

```ts
  /** The cycle this group is (focus and cycle grouping), for its icon and dates. */
  cycle: Cycle | null;
  /** The team of that cycle, for the label and the composer prefill. */
  teamId: number | null;
```

**Scope helpers.** Replace `recentlyDone`, `openOrRecent` and `inScope` with:

```ts
const doneWithin = (i: Issue, window: CompletedWindow, now: number) =>
  i.completed_at !== null && now - Date.parse(i.completed_at) <= COMPLETED_MS[window];

/** Spec §4: what each issue tab contains. Active has no Done (D31); My issues keeps Done inside its window. */
export function inScope(i: Issue, scope: Scope, ctx: Pick<Context, "meId" | "now">, completed: CompletedWindow = "two_weeks"): boolean {
  if (scope.kind === "my") {
    const who = scope.tab === "assigned" ? i.assignee : i.creator;
    return who !== null && who.id === ctx.meId && (i.status !== "done" || doneWithin(i, completed, ctx.now));
  }
  if (i.team_id !== scope.teamId) return false;
  if (scope.tab === "active") return i.status !== "backlog" && i.status !== "done";
  if (scope.tab === "backlog") return i.status === "backlog";
  return true;
}
```

**`fieldValues`.** The `cycle` case becomes:

```ts
    case "cycle": {
      const cycle = i.cycle_id !== null ? ctx?.cycles[i.cycle_id] : undefined;
      return [cycle && ctx?.mergeCycles ? cycleKey(cycle) : i.cycle_id];
    }
```

and its signature is `fieldValues(i, field, ctx?: Pick<Context, "cycles" | "mergeCycles">)`. Change `matches` the same way. Update the doc comment to "With `ctx.mergeCycles`, a cycle is its merged key …".

**`comparator`.** Add the case:

```ts
    case "importance": return (a, b) => {
      if (a.status === "done" && b.status === "done") return time(b.completed_at) - time(a.completed_at) || byRank(a, b);
      return PROGRESS.indexOf(a.status) - PROGRESS.indexOf(b.status) || (a.priority || 5) - (b.priority || 5) || byRank(a, b);
    };
```

**Cycle labels.** Add before `valueLabel`:

```ts
/** "PI 4 · Sprint 3", plus " · AI/ML Solutions" when the view spans teams (D29). */
const cycleLabel = (c: Cycle, ctx: Pick<Context, "teamId" | "teams">) =>
  ctx.teamId === undefined ? `${c.name} · ${ctx.teams[c.team_id]?.name ?? "Team"}` : c.name;
```

In `valueLabel`, the `cycle` case becomes:

```ts
    case "cycle":
      if (v === null) return "No cycle";
      if (typeof v === "string") return v.split("|")[0]; // a merged cycle key
      return ctx.cycles[v] ? cycleLabel(ctx.cycles[v], ctx) : `Cycle ${v}`;
```

and add `case "focus": return "Focus";`.

**`filterOptions`.** Sort cycles by start and then label, not by label only. Replace its final `return` with:

```ts
  const byStart = (v: FilterValue) => (field === "cycle" && typeof v === "number" ? ctx.cycles[v]?.start ?? "" : "");
  return [...seen.values()].sort((a, b) => (a.value === null ? 1 : b.value === null ? -1
    : byStart(a.value).localeCompare(byStart(b.value)) || a.label.localeCompare(b.label)));
```

**Buckets.** `Bucket` becomes `Omit<Group, "issues" | "field"> & { sort: string | number }`; that's unchanged, but `Group` now has `cycle` and `teamId`. Every bucket literal therefore needs `cycle: null, teamId: null` except cycle buckets. Use a helper:

```ts
const plain = (key: string, label: string, value: FilterValue, sort: string | number): Bucket =>
  ({ key, label, value, cycleIds: [], cycle: null, teamId: null, sort });
```

and rewrite the bucket builders with it:

```ts
const statusBucket = (s: Status, layout: DisplayOptions["layout"]): Bucket =>
  plain(s, STATUS_LABEL[s], s, (layout === "board" ? STATUSES : PROGRESS).indexOf(s));
const priorityBucket = (p: Priority): Bucket => plain(`p${p}`, PRIORITY_LABEL[p], p, PRIORITIES.indexOf(p));
const userBucket = (id: number | null, ctx: Context): Bucket => id === null
  ? plain("none", "No assignee", null, LAST)
  : plain(`u${id}`, ctx.users[id]?.name ?? `Person ${id}`, id, id === ctx.meId ? "" : (ctx.users[id]?.name ?? "").toLowerCase());
const projectBucket = (id: number | null, ctx: Context): Bucket => id === null
  ? plain("none", "No project", null, LAST)
  : plain(`pr${id}`, ctx.projects[id]?.name ?? `Project ${id}`, id, (ctx.projects[id]?.name ?? "~").toLowerCase());
function cycleBucket(c: Cycle, ctx: Context, keyPrefix = ""): Bucket {
  const merged = ctx.mergeCycles ? Object.values(ctx.cycles).filter((x) => cycleKey(x) === cycleKey(c)).map((x) => x.id) : [c.id];
  return { key: keyPrefix + (ctx.mergeCycles ? cycleKey(c) : `c${c.id}`), label: ctx.mergeCycles ? c.name : cycleLabel(c, ctx),
           value: c.id, cycleIds: merged, cycle: c, teamId: c.team_id, sort: `${c.start}|${ctx.teams[c.team_id]?.name ?? ""}` };
}
/** Spec §18.1: urgent, current cycles, upcoming cycles, other active, backlog, completed. First match wins. */
function focusBucket(i: Issue, ctx: Context): Bucket {
  if (i.status === "done") return plain("f:done", "Completed", null, "5");
  if (i.priority === 1) return plain("f:urgent", "Urgent issues", null, "0");
  const c = i.cycle_id !== null ? ctx.cycles[i.cycle_id] : undefined;
  if (c && Date.parse(c.end) >= ctx.now) {
    const b = cycleBucket(c, { ...ctx, mergeCycles: false }, "f:");
    return { ...b, sort: `${Date.parse(c.start) <= ctx.now ? "1" : "2"}${b.sort}` };
  }
  if (i.status === "backlog") return plain("f:backlog", "Backlog", "backlog", "4");
  return plain("f:active", "Other active", null, "3"); // no cycle, or an ended one (assumption 13)
}
```

In `bucketFor`, add `case "focus": return focusBucket(i, ctx);`. Rewrite the `cycle` and `none` cases with `plain`:

```ts
    case "cycle": return i.cycle_id !== null && ctx.cycles[i.cycle_id] ? cycleBucket(ctx.cycles[i.cycle_id], ctx)
      : i.cycle_id === null ? plain("none", "No cycle", null, LAST) : plain(`c${i.cycle_id}`, `Cycle ${i.cycle_id}`, i.cycle_id, "~");
    case "none": return plain("all", "All issues", null, 0);
```

In `emptyBuckets`:
- Add `case "focus": return [];`.
- Change the `cycle` case's no-cycle literal to `plain("none", "No cycle", null, LAST)`.
- Dedupe merged cycle buckets by key. This already happens, because `add` keys the map.

**`buildGroups`.** Its final `map` passes the new fields:

```ts
    .map((b) => ({ key: b.key, label: b.label, field: opts.groupBy, value: b.value, cycleIds: b.cycleIds, cycle: b.cycle,
                   teamId: b.teamId, issues: b.issues }));
```

**New exports.** Add at the end:

```ts
export function groupTotal(g: Group): { points: number } | { count: number } {
  const estimated = g.issues.filter((i) => i.estimate !== null);
  return estimated.length ? { points: estimated.reduce((sum, i) => sum + (i.estimate ?? 0), 0) } : { count: g.issues.length };
}

/** Plan ruling 7: what the group's "+" pre-fills, or null where the group has no single value. */
export function groupPrefill(g: Group): ComposerPrefill | null {
  switch (g.field) {
    case "status": return { status: g.value as Status };
    case "priority": return { priority: g.value as Priority };
    case "assignee": return { assignee_id: g.value as number | null };
    case "project": return g.value === null ? null : { project_id: g.value as number };
    case "cycle": return g.cycle ? { teamId: g.cycle.team_id, cycle_id: g.cycle.id, status: "todo" } : { cycle_id: null };
    case "focus":
      if (g.key === "f:urgent") return { priority: 1 };
      if (g.key === "f:backlog") return { status: "backlog" };
      return g.cycle ? { teamId: g.cycle.team_id, cycle_id: g.cycle.id, status: "todo" } : null;
    case "none": return null;
  }
}
```

The `opts` parameter of `buildGroups`, `bucketFor` and `emptyBuckets` stays `Pick<DisplayOptions, "groupBy" | "orderBy" | "showEmpty" | "layout">`.

- [ ] **Step 5: Implement `views/options.ts`**

Replace the file with:

```ts
import { useCallback, useEffect, useState } from "react";
import type { CompletedWindow, DisplayOptions, GroupBy, Layout, OrderBy, Property, Scope } from "./types";

/** The order Linear's Display menu lists properties in (inventory: Display menu). */
export const ALL_PROPERTIES: Property[] = [
  "id", "status", "assignee", "creator", "priority", "project", "cycle", "estimate", "labels", "created", "updated"];
/** Linear's defaults: everything but Creator and Updated (spec §18.3). */
export const DEFAULT_PROPERTIES: Property[] = ALL_PROPERTIES.filter((p) => p !== "creator" && p !== "updated");
export const PROPERTY_LABEL: Record<Property, string> = {
  priority: "Priority", id: "ID", status: "Status", labels: "Labels", project: "Project", cycle: "Cycle",
  estimate: "Estimate", assignee: "Assignee", creator: "Creator", created: "Created", updated: "Updated",
};
const LAYOUTS: Layout[] = ["list", "board"];
const GROUPS: GroupBy[] = ["focus", "status", "assignee", "priority", "project", "cycle", "none"];
const ORDERS: OrderBy[] = ["importance", "manual", "priority", "updated", "created", "estimate"];
const WINDOWS: CompletedWindow[] = ["none", "day", "week", "two_weeks"];
const KEY = (view: string) => `mira-view:v2:${view}`; // plan ruling 4: Phase 2's options are not read

const baseOrder = (scope: Scope): OrderBy => (scope.kind === "team" && scope.tab === "backlog" ? "manual" : "priority");

/** Linear's defaults (spec §7, D28): My issues by Focus and Importance; teams by status and priority; Backlog manual. */
export function defaultOptions(scope: Scope): DisplayOptions {
  const my = scope.kind === "my";
  return { layout: "list", groupBy: my ? "focus" : "status", orderBy: my ? "importance" : baseOrder(scope), showEmpty: false,
           completed: "day", collapsed: [], properties: [...DEFAULT_PROPERTIES] };
}

/** Focus is My issues only and always orders by Importance; leaving it restores the view's default ordering (ruling 5). */
export function normalizeOptions(o: DisplayOptions, scope: Scope): DisplayOptions {
  if (o.groupBy === "focus" && scope.kind !== "my") return { ...o, groupBy: "status", orderBy: o.orderBy === "importance" ? baseOrder(scope) : o.orderBy };
  if (o.groupBy === "focus") return { ...o, orderBy: "importance" };
  return o.orderBy === "importance" ? { ...o, orderBy: baseOrder(scope) } : o;
}

/** For the Display button's dot (spec §18.2): collapsed groups and property order don't count. */
export function isDefault(o: DisplayOptions, scope: Scope): boolean {
  const d = defaultOptions(scope);
  const same = (a: Property[], b: Property[]) => a.length === b.length && a.every((p) => b.includes(p));
  return o.layout === d.layout && o.groupBy === d.groupBy && o.orderBy === d.orderBy && o.showEmpty === d.showEmpty
    && o.completed === d.completed && same(o.properties, d.properties);
}

const pick = <T,>(allowed: T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Saved options, field by field; anything missing, unknown or unreadable falls back to the default. */
export function loadOptions(view: string, scope: Scope, storage: Storage | undefined = globalThis.localStorage): DisplayOptions {
  const base = defaultOptions(scope);
  try {
    const raw = storage?.getItem(KEY(view));
    if (!raw) return base;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const props = Array.isArray(saved.properties)
      ? saved.properties.filter((p): p is Property => ALL_PROPERTIES.includes(p as Property)) : null;
    return normalizeOptions({
      layout: pick(LAYOUTS, saved.layout, base.layout),
      groupBy: pick(GROUPS, saved.groupBy, base.groupBy),
      orderBy: pick(ORDERS, saved.orderBy, base.orderBy),
      showEmpty: typeof saved.showEmpty === "boolean" ? saved.showEmpty : base.showEmpty,
      completed: pick(WINDOWS, saved.completed, base.completed),
      collapsed: Array.isArray(saved.collapsed) ? saved.collapsed.filter((k): k is string => typeof k === "string") : base.collapsed,
      properties: props && (props.length || (saved.properties as unknown[]).length === 0) ? props : base.properties,
    }, scope);
  } catch {
    return base;
  }
}

export function saveOptions(view: string, options: DisplayOptions, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY(view), JSON.stringify(options));
  } catch {
    /* storage blocked: the options last for this session */
  }
}

export function useViewOptions(view: string, scope: Scope): [DisplayOptions, (next: Partial<DisplayOptions>) => void] {
  const [options, setOptions] = useState(() => loadOptions(view, scope));
  useEffect(() => setOptions(loadOptions(view, scope)), [view]); // reload only when the view changes
  const update = useCallback((next: Partial<DisplayOptions>) => setOptions((current) => {
    const merged = normalizeOptions({ ...current, ...next }, scope);
    saveOptions(view, merged);
    return merged;
  }), [view, scope]);
  return [options, update];
}
```

The test "only unknown names: keep the defaults" relies on the `props.length || saved.properties.length === 0` rule. An explicitly empty saved list stays empty; a list of only unknown names falls back.

- [ ] **Step 6: Implement the Focus drag rule in `views/drag.ts`**

Add after `REORDER_HINT`:

```ts
export const FOCUS_HINT = "Focus sorts by importance. Switch Grouping to move issues";
```

In `patchFor`, add `case "focus": return FOCUS_HINT;`. At the top of `resolveDrop`, add:

```ts
  if (d.from.field === "focus" && (d.from.key !== d.to.key || (d.overId !== null && d.overId !== d.issue.id))) return explain(FOCUS_HINT);
```

- [ ] **Step 7: Wire `IssueView.tsx`**

Add `teams: app.teams` to the `ctx` memo, and `app.teams` to its dependency list. Change the `inView` memo to pass the window:

```ts
  const inView = useMemo(() => Object.values(app.issues).filter((i) => inScope(i, scope, ctx, options.completed)), [app.issues, scope, ctx, options.completed]);
```

Also fix the comment above `shown`: "ctx is passed so a Cycle filter matches by cycle (merged only with ctx.mergeCycles)."

Other places that build a `Context` or a `Group` must compile. Search for them with `grep -rn "cycleIds:" web/src` and `grep -rn "meId:" web/src --include=*.test.*`. Add `teams: {}`, or `cycle: null, teamId: null`, where the typecheck asks for them.

- [ ] **Step 8: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. If an existing IssueView or App test counted Done rows in Active, update its expectation to D31's rule. Each such change goes in the report.

- [ ] **Step 9: Commit**

```bash
git add web/src/views
git commit -m "Views: Focus grouping, Importance ordering, completed window, per-team cycles, options v2 (D28, D29, D31)"
```

---

### Task 4: Tokens, Mira's own icons, and the icon sheet

**Files:**
- Modify: `web/src/styles/tokens.css`, `web/src/styles/app.css`
- Create: `web/src/components/icons.tsx`, `web/src/screens/IconSheet.tsx`
- Modify: `web/src/components/StatusIcon.tsx`, `web/src/components/PriorityIcon.tsx`, `web/src/route.ts`, `web/src/App.tsx`
- Test: `web/src/components/icons.test.tsx`, `web/src/route.test.ts`, `web/src/components/rows.test.tsx` (the existing icon test must still pass)

**Interfaces:**
- Produces:
  - Tokens: `line-menu`, `line-caret`, `highlight`, `tab-active`, `pill-on`, `sidebar-hover`, `accent`, `accent-ink`, `switch-off`, `status-completed`, `priority`, `shadow-card`, `shadow-menu`, `shadow-comment`, `radius-composer`, and the sizes `--size-props: 400px`, `--size-content: 805px`, `--size-column: 348px`, `--size-peek: 416px`, `--size-composer: 750px`.
  - `Icon({ name: IconName, size?: number = 14, label?: string, className?: string })`, `ICONS: Record<IconName, ReactNode>`, and `type IconName`.
  - `CycleIcon({ cycle: Cycle, now?: number, size?: number })`.
  - `ProjectIcon({ project: Project | undefined, size?: number })`.
  - `StatusIcon({ status, size?, mono? })` (mono = Focus's Completed group icon).
  - `PriorityIcon({ priority, size? = 16, tone?: "color" | "ink" })`.
  - Route `{ name: "icons" }` at `/dev/icons`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/icons.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SPRINT3, SPRINT4, makeProject } from "../test/fixtures";
import { CycleIcon, ICONS, Icon, ProjectIcon, type IconName } from "./icons";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";

test("every icon draws on a 16-unit grid and hides itself unless labelled", () => {
  for (const name of Object.keys(ICONS) as IconName[]) {
    const { container, unmount } = render(<Icon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox"), name).toBe("0 0 16 16");
    expect(svg.getAttribute("aria-hidden"), name).toBe("true");
    expect(svg.getAttribute("width"), name).toBe("14");
    expect(svg.childElementCount, name).toBeGreaterThan(0);
    unmount();
  }
  render(<Icon name="filter" label="Add filter" size={16} />);
  expect(screen.getByRole("img", { name: "Add filter" })).toHaveAttribute("width", "16");
});

test("the cycle icon: elapsed arc when current, dots when upcoming, a full ring when past", () => {
  const now = Date.parse("2026-10-15T04:00:00.000Z"); // halfway through SPRINT3 (Oct 8–22)
  const current = render(<CycleIcon cycle={SPRINT3} now={now} />).container;
  expect(current.querySelector('[data-part="elapsed"]')!.getAttribute("stroke-dasharray")).toMatch(/^18\.\d+ 37\.\d+$/);
  const upcoming = render(<CycleIcon cycle={SPRINT4} now={now} />).container;
  expect(upcoming.querySelector('[data-part="dots"]')).not.toBeNull();
  const past = render(<CycleIcon cycle={SPRINT3} now={Date.parse("2026-11-01T00:00:00.000Z")} />).container;
  expect(past.querySelector('[data-part="elapsed"]')!.getAttribute("stroke-dasharray")).toMatch(/^37\.\d+ 37\.\d+$/);
});

test("projects are a cube coloured by their status category", () => {
  const { container } = render(<ProjectIcon project={makeProject({ status_category: "started" })} />);
  expect(container.querySelector("svg")!.getAttribute("style")).toContain("var(--color-status-progress)");
});

test("status and priority icons keep their names; Completed uses the monochrome done disc", () => {
  render(<><StatusIcon status="done" mono /><PriorityIcon priority={1} tone="ink" /><PriorityIcon priority={0} /></>);
  expect(screen.getByRole("img", { name: "Done" }).innerHTML).toContain("var(--color-status-completed)");
  expect(screen.getByRole("img", { name: "Urgent" }).innerHTML).toContain("var(--color-ink-1)");
  expect(screen.getByRole("img", { name: "No priority" })).toHaveAttribute("width", "16");
});
```

Add to `web/src/route.test.ts`, inside the first test's `routes` list: `{ name: "icons" }`. Then add:

```ts
test("the icon sheet lives at /dev/icons", () => {
  expect(parsePath("/dev/icons")).toEqual({ name: "icons" });
  expect(formatRoute({ name: "icons" })).toBe("/dev/icons");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/components/icons.test.tsx src/route.test.ts`
Expected: FAIL. `./icons` doesn't exist, and `/dev/icons` is not found.

- [ ] **Step 3: Tokens and focus rings**

In `web/src/styles/tokens.css`, inside `@theme`, replace the seven status and urgent lines with the measured Linear values (inventory §13), and add the new tokens after `--color-blocked`:

```css
  --color-status-backlog: lch(70.3% 3.6 260.6);
  --color-status-todo: lch(68% 0 282);
  --color-status-progress: lch(80% 90 85);
  --color-status-review: rgb(15 157 88);
  --color-status-done: lch(48% 59.3 288.4);
  --color-status-completed: lch(37.8% 1.25 282);
  --color-urgent: lch(66% 80 48);
  --color-blocked: lch(55% 70 30);
  --color-priority: lch(39.2% 1.25 282);
  --color-line-menu: lch(91.9% 0 282);
  --color-line-caret: lch(80.9% 0 282);
  --color-highlight: lch(95% 0 282);
  --color-tab-active: lch(93.5% 0.5 282);
  --color-pill-on: lch(94.9% 0.5 282);
  --color-sidebar-hover: lch(91.6% 0.5 282);
  --color-accent: lch(53% 52.26 286.91);
  --color-accent-ink: lch(100% 5 287);
  --color-switch-off: lch(82.5% 0.05 282);
```

Also add, after `--radius-palette`:

```css
  --radius-composer: 21px;
```

and after `--shadow-palette`:

```css
  --shadow-card: 0 0 0 0.5px lch(0 0 0 / 0.088), 0 3px 6px -2px lch(0 0 0 / 0.02), 0 1px 1px lch(0 0 0 / 0.04);
  --shadow-menu: 0 6px 18px lch(0 0 0 / 0.02), 0 3px 9px lch(0 0 0 / 0.04), 0 1px 1px lch(0 0 0 / 0.04);
  --shadow-comment: 0 3px 6px -2px lch(0 0 0 / 0.02), 0 1px 1px lch(0 0 0 / 0.04);
```

In `:root`, change `--size-props` to `400px`, and add:

```css
  --size-content: 805px;
  --size-column: 348px;
  --size-peek: 416px;
  --size-composer: 750px;
```

In `[data-theme="dark"]`, add the dark counterparts. These are not measured; they mirror the light roles.

```css
  --color-line-menu: #2c2d30;
  --color-line-caret: lch(45% 0 282);
  --color-highlight: lch(17% 1 282);
  --color-tab-active: lch(21% 1 282);
  --color-pill-on: lch(21% 1 282);
  --color-sidebar-hover: lch(17% 1 282);
  --color-switch-off: lch(35% 0 282);
  --color-status-completed: lch(70% 1.25 282);
  --color-priority: lch(70% 1.25 282);
```

In `web/src/styles/app.css`, after the `:focus-visible` rule, add Linear's behaviour of no outline on text fields (inventory §8, §11):

```css
input:focus-visible,
textarea:focus-visible,
[contenteditable]:focus-visible,
[role="menu"]:focus-visible {
  outline: none;
}
```

- [ ] **Step 4: Create `web/src/components/icons.tsx`**

These are Mira's own drawings: simple strokes on a 16-unit grid, written for this repo. Each shape follows the one-line description and size in inventory §13. Check each against its 4× crop in `/tmp/rea-research/v2cmp/icons/` (see Step 8) and adjust **coordinates only**. Never paste path data from Linear.

```tsx
import type { CSSProperties, ReactNode } from "react";
import type { Cycle, Project } from "../api/types";

/** Mira's own icons on a 16-unit grid, in currentColor, drawn to Linear's geometry (spec §18, inventory §13). */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const SOLID = { fill: "currentColor", stroke: "currentColor", strokeWidth: 1, strokeLinejoin: "round" } as const;
const KNOB = { fill: "var(--color-surface)", stroke: "currentColor", strokeWidth: 1.5 } as const;
const PLAY = <path d="M6.75 5.6v4.8L10.5 8z" {...SOLID} />;

export const ICONS = {
  filter: <path {...S} d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />,
  display: <><path {...S} d="M2.5 5h11M2.5 11h11" /><circle cx="6" cy="5" r="1.9" {...KNOB} /><circle cx="10" cy="11" r="1.9" {...KNOB} /></>,
  caret: <path d="M5.25 6.25h5.5L8 9.75z" {...SOLID} />,
  chevron: <path {...S} d="M4.5 6.25 8 9.75l3.5-3.5" />,
  chevronRight: <path {...S} d="M6.25 4.5 9.75 8l-3.5 3.5" />,
  plus: <path {...S} d="M8 3.25v9.5M3.25 8h9.5" />,
  more: <><circle cx="3.5" cy="8" r="1.25" fill="currentColor" /><circle cx="8" cy="8" r="1.25" fill="currentColor" /><circle cx="12.5" cy="8" r="1.25" fill="currentColor" /></>,
  compose: <><path {...S} d="M13.25 8.75v3.5a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5h3.5" /><path {...S} d="m7.25 8.75 5.5-5.5" /></>,
  search: <><circle {...S} cx="7" cy="7" r="4.5" /><path {...S} d="m10.5 10.5 3 3" /></>,
  myIssues: <><path {...S} d="M2.75 5.75v-1.5a1.5 1.5 0 0 1 1.5-1.5h1.5M10.25 2.75h1.5a1.5 1.5 0 0 1 1.5 1.5v1.5M13.25 10.25v1.5a1.5 1.5 0 0 1-1.5 1.5h-1.5M5.75 13.25h-1.5a1.5 1.5 0 0 1-1.5-1.5v-1.5" /><circle cx="8" cy="8" r="2" fill="currentColor" /></>,
  initiatives: <><circle {...S} cx="8" cy="8" r="5.75" /><path d="M8 4.75 10.75 10.5 8 9.1 5.25 10.5z" {...SOLID} /></>,
  project: <><path {...S} d="M8 1.75 13.5 4.9v6.2L8 14.25 2.5 11.1V4.9z" /><path {...S} d="M2.75 5 8 8.1 13.25 5M8 8.1v6" /></>,
  issues: <><rect {...S} x="2.25" y="2.25" width="8.5" height="8.5" rx="2" /><path {...S} d="M13.75 6.25v5.5a2 2 0 0 1-2 2h-5.5" /></>,
  cycles: <><path {...S} d="M13.75 8a5.75 5.75 0 1 1-2.6-4.8" />{PLAY}</>,
  estimate: <><path d="M8 2.5 13.75 13H2.25z" {...SOLID} fillOpacity={0.4} strokeOpacity={0.4} strokeWidth={1.25} /><path d="M8 2.5V13H2.25z" {...SOLID} strokeWidth={1.25} /></>,
  tag: <><path {...S} d="M2.5 8 5.6 3.75h6.65a1.25 1.25 0 0 1 1.25 1.25v6a1.25 1.25 0 0 1-1.25 1.25H5.6z" /><circle cx="6.5" cy="8" r="1" fill="currentColor" /></>,
  team: <><rect {...S} x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5" /><circle cx="8" cy="6.75" r="1.75" fill="currentColor" /><path {...S} d="M5 11.25c.5-1.3 1.6-2 3-2s2.5.7 3 2" /></>,
  assign: <><circle cx="7" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M2.75 13.25c.35-2.5 2-4.25 4.25-4.25.9 0 1.7.25 2.35.75M10 12.5h4M12.25 10.75 14 12.5l-1.75 1.75" /></>,
  unassign: <><circle cx="7" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M2.75 13.25c.35-2.5 2-4.25 4.25-4.25.9 0 1.7.25 2.35.75M14 11.25h-3.5a1.5 1.5 0 0 0 0 3h1M11.75 9.5 10 11.25 11.75 13" /></>,
  creator: <><circle cx="7" cy="4.75" r="2.25" fill="currentColor" /><path {...S} d="M2.75 13.25c.35-2.5 2-4.25 4.25-4.25M9.75 13.5l.4-1.6 3.1-3.1a.85.85 0 0 1 1.2 1.2l-3.1 3.1z" /></>,
  status: <><circle {...S} cx="8" cy="8" r="5.75" /><path d="M8 4.25a3.75 3.75 0 0 0 0 7.5z" fill="currentColor" /></>,
  priority: <><rect x="2" y="8.75" width="3" height="4.5" rx="1" fill="currentColor" /><rect x="6.5" y="5.75" width="3" height="7.5" rx="1" fill="currentColor" /><rect x="11" y="2.75" width="3" height="10.5" rx="1" fill="currentColor" /></>,
  link: <path {...S} d="M7 9a2.75 2.75 0 0 0 3.9 0l2-2a2.75 2.75 0 0 0-3.9-3.9l-.75.75M9 7a2.75 2.75 0 0 0-3.9 0l-2 2a2.75 2.75 0 0 0 3.9 3.9l.75-.75" />,
  copy: <><rect {...S} x="5.25" y="5.25" width="8.5" height="8.5" rx="2" /><path {...S} d="M10.75 5.25v-1a2 2 0 0 0-2-2h-4.5a2 2 0 0 0-2 2v4.5a2 2 0 0 0 2 2h1" /></>,
  send: <path {...S} d="M8 13V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  close: <path {...S} d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />,
  check: <path {...S} d="m3.5 8.5 3 3 6-6.75" />,
  list: <path {...S} d="M3 4.5h10M3 8h10M3 11.5h10" />,
  board: <><rect {...S} x="2.5" y="2.5" width="4.5" height="4.5" rx="1.25" /><rect {...S} x="9" y="2.5" width="4.5" height="4.5" rx="1.25" /><rect {...S} x="2.5" y="9" width="4.5" height="4.5" rx="1.25" /><rect {...S} x="9" y="9" width="4.5" height="4.5" rx="1.25" /></>,
  blocked: <><circle {...S} cx="8" cy="8" r="5.75" /><path {...S} d="m4 12 8-8" /></>,
  help: <><circle {...S} cx="8" cy="8" r="5.75" /><path {...S} d="M6.4 6.4a1.7 1.7 0 0 1 3.3.55c0 1.15-1.7 1.4-1.7 2.55" /><circle cx="8" cy="11.25" r=".9" fill="currentColor" /></>,
  arrowUp: <path {...S} d="M8 13V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  arrowDown: <path {...S} d="M8 3v9.5M4.25 8.75 8 12.5l3.75-3.75" />,
  open: <path {...S} d="M9.25 2.75h4v4M13 3 7.75 8.25M11.75 9.5v2.25a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5H6.5" />,
  theme: <><circle {...S} cx="8" cy="8" r="5.75" /><path d="M8 2.25a5.75 5.75 0 0 1 0 11.5z" fill="currentColor" /></>,
  settings: <><circle {...S} cx="8" cy="8" r="2" /><path {...S} d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4M12.4 12.4l-1.05-1.05M4.65 4.65 3.6 3.6" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 14, label, className = "" }: { name: IconName; size?: number; label?: string; className?: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return <svg width={size} height={size} viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...a11y}>{ICONS[name]}</svg>;
}

const R = 6;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Current: a ring whose dark arc is the time elapsed, around a play mark; upcoming: a dotted ring; past: a full ring (§18.3). */
export function CycleIcon({ cycle, now = Date.now(), size = 14 }: { cycle: Cycle; now?: number; size?: number }) {
  const start = Date.parse(cycle.start);
  const end = Date.parse(cycle.end);
  const upcoming = now < start;
  const done = now > end ? 1 : upcoming ? 0 : (now - start) / Math.max(1, end - start);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0 text-ink-3" aria-hidden>
      {upcoming
        ? <circle data-part="dots" cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="0.01 2.35" />
        : <>
            <circle cx="8" cy="8" r={R} fill="none" stroke="var(--color-ink-4)" strokeWidth="1.5" />
            <circle data-part="elapsed" cx="8" cy="8" r={R} fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeDasharray={`${(CIRCUMFERENCE * done).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`} transform="rotate(-90 8 8)" />
          </>}
      {PLAY}
    </svg>
  );
}

const PROJECT_COLOR: Record<Project["status_category"], string> = {
  backlog: "var(--color-ink-3)", planned: "var(--color-ink-3)", started: "var(--color-status-progress)", completed: "var(--color-status-done)",
};

/** Rally features have no colour: the cube takes its status category's (assumption 15). */
export function ProjectIcon({ project, size = 14 }: { project: Project | undefined; size?: number }) {
  const style: CSSProperties = { color: project ? PROJECT_COLOR[project.status_category] : "var(--color-ink-3)" };
  return <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" style={style} aria-hidden>{ICONS.project}</svg>;
}
```

- [ ] **Step 5: Redraw the status and priority icons**

Replace `web/src/components/StatusIcon.tsx` with:

```tsx
import { STATUS_LABEL, type Status } from "../api/types";

export const STATUS_COLOR: Record<Status, string> = {
  backlog: "var(--color-status-backlog)", todo: "var(--color-status-todo)", in_progress: "var(--color-status-progress)",
  in_review: "var(--color-status-review)", done: "var(--color-status-done)",
};

/** Linear's status marks (inventory §13): dashed ring, ring, ring with a half disc, ring with a 3/4 disc, filled check. */
export function StatusIcon({ status, size = 14, mono = false }: { status: Status; size?: number; mono?: boolean }) {
  const c = mono ? "var(--color-status-completed)" : STATUS_COLOR[status];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={STATUS_LABEL[status]} className="shrink-0">
      {status === "done"
        ? <circle cx="7" cy="7" r="6.25" fill={c} stroke={c} strokeWidth="1.5" />
        : <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={status === "backlog" ? "2.1 2.61" : undefined} />}
      {status === "in_progress" && <path d="M7 3a4 4 0 0 1 0 8z" fill={c} />}
      {status === "in_review" && <path d="M7 3a4 4 0 1 1-4 4h4z" fill={c} />}
      {status === "done" && <path d="M4.4 7.2 6.2 9l3.4-3.7" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
```

Replace `web/src/components/PriorityIcon.tsx` with:

```tsx
import { PRIORITY_LABEL, type Priority } from "../api/types";

const FILLED: Record<2 | 3 | 4, number> = { 2: 3, 3: 2, 4: 1 }; // High, Medium, Low

/** Linear's priority marks at 16px (inventory §13). `tone="ink"` is the picker's highlighted Urgent. */
export function PriorityIcon({ priority, size = 16, tone = "color" }: { priority: Priority; size?: number; tone?: "color" | "ink" }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", role: "img", "aria-label": PRIORITY_LABEL[priority], className: "shrink-0" };
  if (priority === 1) {
    return (
      <svg {...common}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill={tone === "ink" ? "var(--color-ink-1)" : "var(--color-urgent)"} />
        <path d="M8 4.25v4.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="1.1" fill="white" />
      </svg>
    );
  }
  if (priority === 0) {
    return <svg {...common}><path d="M2.5 8h2M7 8h2M11.5 8h2" stroke="var(--color-priority)" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
  return (
    <svg {...common}>
      {[0, 1, 2].map((n) => (
        <rect key={n} x={2 + n * 4.5} y={8.75 - n * 3} width="3" height={4.5 + n * 3} rx="1"
          fill="var(--color-priority)" fillOpacity={n < FILLED[priority] ? 1 : 0.4} />
      ))}
    </svg>
  );
}
```

`GroupHeader`, `BoardLayout`, the palette and the issue page all render `PriorityIcon` with no size. They now get 16px, which is Linear's size.

- [ ] **Step 6: The icon sheet route**

In `web/src/route.ts`:
- Add `| { name: "icons" }` to `Route`.
- In `parsePath`, before the final `return`, add `if (head === "dev" && a === "icons" && parts.length === 2) return { name: "icons" };`.
- In `formatRoute`, add `case "icons": return "/dev/icons";`.

Create `web/src/screens/IconSheet.tsx`:

```tsx
import { PRIORITIES, STATUSES } from "../api/types";
import { CycleIcon, ICONS, Icon, type IconName } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { ViewFrame } from "../components/ViewFrame";
import { SPRINT_PREVIEW } from "./sheetData";

/** /dev/icons: every icon at 4×, for the side-by-side with /tmp/rea-research/v2cmp/icons-sheet.png (plan Task 4). */
export function IconSheet() {
  const cell = (name: string, node: React.ReactNode) => (
    <figure key={name} className="flex flex-col items-center gap-2 p-3 text-mini text-ink-3">{node}<figcaption>{name}</figcaption></figure>
  );
  const now = Date.parse(SPRINT_PREVIEW.current.start) + 3 * 86_400_000;
  return (
    <ViewFrame title="Icons">
      <div className="grid grid-cols-8 gap-2 overflow-y-auto p-4 text-ink-3">
        {(Object.keys(ICONS) as IconName[]).map((n) => cell(n, <Icon name={n} size={56} />))}
        {STATUSES.map((s) => cell(`status-${s}`, <StatusIcon status={s} size={56} />))}
        {cell("status-completed", <StatusIcon status="done" mono size={56} />)}
        {PRIORITIES.map((p) => cell(`priority-${p}`, <PriorityIcon priority={p} size={56} />))}
        {cell("priority-urgent-ink", <PriorityIcon priority={1} tone="ink" size={56} />)}
        {cell("cycle-current", <CycleIcon cycle={SPRINT_PREVIEW.current} now={now} size={56} />)}
        {cell("cycle-upcoming", <CycleIcon cycle={SPRINT_PREVIEW.upcoming} now={now} size={56} />)}
      </div>
    </ViewFrame>
  );
}
```

Create `web/src/screens/sheetData.ts`. These are synthetic cycles; the sheet needs no data from Rally.

```ts
import type { Cycle } from "../api/types";

export const SPRINT_PREVIEW: Record<"current" | "upcoming", Cycle> = {
  current: { id: -1, team_id: -1, name: "PI 4 · Sprint 3", short_name: "Sprint 3", start: "2026-10-08T04:00:00.000Z", end: "2026-10-22T03:59:59.000Z" },
  upcoming: { id: -2, team_id: -1, name: "PI 4 · Sprint 4", short_name: "Sprint 4", start: "2026-10-22T04:00:00.000Z", end: "2026-11-05T03:59:59.000Z" },
};
```

In `web/src/App.tsx`, import `IconSheet`, and add `case "icons": return <IconSheet />;` to `Screen`.

- [ ] **Step 7: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. The rows test's icon names are unchanged.

- [ ] **Step 8: Visual parity check (icons)**

Run: `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/dev/icons /tmp/rea-research/v2cmp/mira-icons.png`

Open it next to `/tmp/rea-research/v2cmp/icons-sheet.png`, and for each icon next to its crop named in inventory §13. Adjust coordinates in `icons.tsx`, `StatusIcon.tsx` and `PriorityIcon.tsx` until each matches its crop in:
- stroke weight;
- proportions;
- corner rounding;
- where the fill sits.

Record in the report:
- every icon you changed and why;
- any icon still visibly different.

- [ ] **Step 9: Commit**

```bash
git add web/src/styles web/src/components/icons.tsx web/src/components/icons.test.tsx web/src/components/StatusIcon.tsx web/src/components/PriorityIcon.tsx web/src/screens/IconSheet.tsx web/src/screens/sheetData.ts web/src/route.ts web/src/route.test.ts web/src/App.tsx
git commit -m "Icons: Mira's own SVGs drawn to Linear's geometry, measured tokens, and a /dev/icons sheet"
```

---

### Task 5: Building blocks — chips, round buttons, switch, keycaps, tiles

**Files:**
- Create: `web/src/components/ui.tsx`, `web/src/components/format.ts`
- Test: `web/src/components/ui.test.tsx`

**Interfaces:**
- Consumes: `Icon`, `IconName` (Task 4); `initials` from `components/Avatar.tsx`.
- Produces:
  - `Chip({ icon?, children?, title?, surface? })`
  - `IconButton({ label, icon, size?: 24 | 28, bordered?, dot?, ...button props })`
  - `Switch({ checked, onChange, label })`
  - `Keys({ keys?: string })`: space-separated keys → one keycap each.
  - `Glyphs({ keys?: string })`: bare glyphs.
  - `Tile({ id, name, size?, radius? })`
  - `tileColor(id: number): string`
  - `labelColor(name: string): string`
  - In `format.ts`: `shortDate(iso)` ("Oct 16"), `longDate(iso)` ("Fri Oct 16, 2026, 5:12 PM"), `rangeLabel(cycle)` ("Oct 8 → Oct 21"), `pickerRange(cycle)` ("Oct 8 – Oct 21"), `ago(iso, now)` ("2h ago"), `points(n)` ("1 Point" / "5 Points").

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/ui.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SPRINT3 } from "../test/fixtures";
import { ago, pickerRange, points, rangeLabel, shortDate } from "./format";
import { Chip, IconButton, Keys, Switch, Tile, tileColor } from "./ui";

test("a chip holds an icon and truncating text", () => {
  render(<Chip title="Full name" icon={<span data-testid="i" />}>Sprint 3</Chip>);
  expect(screen.getByTitle("Full name")).toHaveTextContent("Sprint 3");
  expect(screen.getByTestId("i")).toBeInTheDocument();
});

test("round icon buttons name themselves and can carry the modified dot", () => {
  const onClick = vi.fn();
  render(<IconButton label="Display options" icon="display" dot onClick={onClick} />);
  const button = screen.getByRole("button", { name: "Display options" });
  expect(button.className).toContain("size-7");
  expect(button.querySelector("[data-dot]")).not.toBeNull();
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalled();
});

test("a switch flips and reports its state", () => {
  const onChange = vi.fn();
  render(<Switch checked={false} onChange={onChange} label="Show empty groups" />);
  const sw = screen.getByRole("switch", { name: "Show empty groups" });
  expect(sw).toHaveAttribute("aria-checked", "false");
  fireEvent.click(sw);
  expect(onChange).toHaveBeenCalledWith(true);
});

test("one keycap per key", () => {
  const { container } = render(<Keys keys="⇧ P" />);
  expect([...container.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["⇧", "P"]);
});

test("tiles take a stable colour from the id and show initials", () => {
  expect(tileColor(9001)).toBe(tileColor(9001));
  expect(tileColor(9001)).not.toBe(tileColor(9002));
  const { container } = render(<Tile id={9002} name="AI/ML Solutions" size={20} />);
  expect(container.firstElementChild).toHaveTextContent("AS");
});

test("dates, ranges, relative times and points read like Linear", () => {
  expect(shortDate("2026-10-16T14:00:00.000Z")).toBe("Oct 16");
  expect(rangeLabel(SPRINT3)).toBe("Oct 8 → Oct 21");
  expect(pickerRange(SPRINT3)).toBe("Oct 8 – Oct 21");
  const now = Date.parse("2026-10-16T12:00:00.000Z");
  expect(ago("2026-10-16T11:59:40.000Z", now)).toBe("just now");
  expect(ago("2026-10-16T10:00:00.000Z", now)).toBe("2h ago");
  expect(ago("2026-10-13T12:00:00.000Z", now)).toBe("3d ago");
  expect(ago("2026-08-01T12:00:00.000Z", now)).toBe("Aug 1");
  expect(points(1)).toBe("1 Point");
  expect(points(5)).toBe("5 Points");
});
```

The fixture dates are UTC. `rangeLabel(SPRINT3)` reads "Oct 8 → Oct 21" in US time zones, because the end is 03:59Z on the 22nd. The suite runs in the machine's zone, so pin it: add `process.env.TZ = "America/New_York";` as the first line of `web/src/test-setup.ts`, if it isn't there already.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/components/ui.test.tsx`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Create `web/src/components/format.ts`**

```ts
import type { Cycle } from "../api/types";

const MONTH_DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", MONTH_DAY);
export const longDate = (iso: string) => new Date(iso).toLocaleString("en-US",
  { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
/** Group headers (§18.3). */
export const rangeLabel = (c: Cycle) => `${shortDate(c.start)} → ${shortDate(c.end)}`;
/** Picker hints (§18.9). */
export const pickerRange = (c: Cycle) => `${shortDate(c.start)} – ${shortDate(c.end)}`;
/** Linear's estimate wording: "1 Point", "5 Points" (inventory §14.7). */
export const points = (n: number) => `${n} ${n === 1 ? "Point" : "Points"}`;

/** Activity times: "just now", "5m ago", "2h ago", "3d ago", then the date. */
export function ago(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return shortDate(iso);
}
```

In `web/src/components/IssueRow.tsx`, replace the local `shortDate` export with a re-export: `export { shortDate } from "./format";`. Anything that imported it from `IssueRow` keeps working until Task 8 rewrites the row.

- [ ] **Step 4: Create `web/src/components/ui.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { initials } from "./Avatar";
import { Icon, type IconName } from "./icons";

/** A 24px property chip (§18.3): fully rounded, 0.5px line-menu border, panel fill (surface on cards), 12/450 ink-3. */
export function Chip({ icon, children, title, surface = false }: { icon?: ReactNode; children?: ReactNode; title?: string; surface?: boolean }) {
  return (
    <span title={title} className={`inline-flex h-6 max-w-48 shrink-0 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu px-2 text-mini text-ink-3 ${surface ? "bg-surface" : "bg-panel"}`}>
      {icon}
      {children !== undefined && <span className="truncate">{children}</span>}
    </span>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string; icon: IconName; size?: 24 | 28; bordered?: boolean; dot?: boolean;
};

/** Linear's round icon buttons (§18.2): 28px bordered on toolbars, 24px bare in headers and rows. */
export function IconButton({ label, icon, size = 28, bordered = size === 28, dot = false, className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-1 ${size === 28 ? "size-7" : "size-6"} ${bordered ? "border-[0.5px] border-line-menu bg-surface" : ""} ${className}`}>
      <Icon name={icon} size={14} />
      {dot && <span data-dot aria-hidden className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-focus" />}
    </button>
  );
}

/** 22×14 (§18.5): switch-off track, accent when on. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange(next: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-3.5 w-[22px] shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-accent" : "bg-switch-off"}`}>
      <span aria-hidden className={`absolute top-0.5 size-2.5 rounded-full bg-white shadow-sm transition-[left] duration-150 ${checked ? "left-[10px]" : "left-0.5"}`} />
    </button>
  );
}

/** One box per key (§18.9): "⇧ P" is two keycaps, each 20×21 at 11/450 with a 0.5px border and radius 3. */
export function Keys({ keys }: { keys?: string }) {
  if (!keys) return null;
  return (
    <span className="ml-auto flex shrink-0 gap-[3px]">
      {keys.split(" ").map((k, i) => (
        <kbd key={`${k}${i}`} className="inline-flex h-[21px] min-w-5 items-center justify-center rounded-[3px] border-[0.5px] border-line-menu px-1 font-sans text-[11px] font-normal text-ink-3">{k}</kbd>
      ))}
    </span>
  );
}

/** Bare shortcut glyphs, as in Linear's context menu (§18.7). */
export function Glyphs({ keys }: { keys?: string }) {
  if (!keys) return null;
  return <span className="ml-auto shrink-0 pl-3 text-[11px] font-medium text-ink-3">{keys}</span>;
}

const TILE_COLORS = ["lch(70 60 50)", "lch(62 70 125)", "lch(58 65 30)", "lch(60 50 265)", "lch(65 45 200)", "lch(60 60 330)", "lch(72 60 85)", "lch(55 40 160)"];
export const tileColor = (id: number) => TILE_COLORS[Math.abs(id) % TILE_COLORS.length];
/** Label dots: a stable colour per name. */
export function labelColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return tileColor(h);
}

/** Teams and the workspace have no icon in Rally: an initials tile in a colour picked by id (assumption 15). */
export function Tile({ id, name, size = 16, radius }: { id: number; name: string; size?: number; radius?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center font-medium text-white"
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size / 4), background: tileColor(id), fontSize: Math.max(8, Math.round(size * 0.5)) }}>
      {initials(name).slice(0, size < 18 ? 1 : 2)}
    </span>
  );
}
```

The `IconButton` test looks for `[data-dot]`, which the span carries.

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ui.tsx web/src/components/ui.test.tsx web/src/components/format.ts web/src/components/IssueRow.tsx web/src/test-setup.ts
git commit -m "UI: Linear's chips, round buttons, switch, keycaps, tiles and date wording"
```

---

### Task 6: Menus — dropdowns, submenus, filter inputs, number keys

**Files:**
- Create: `web/src/components/Menu.tsx`
- Test: `web/src/components/Menu.test.tsx`

**Interfaces:**
- Consumes: `Icon`, `Keys`, `Glyphs`, `Popover`.
- Produces:
  - `interface MenuItem { id: string; label: string; icon?: ReactNode; hint?: ReactNode; keys?: string; glyphs?: string; checked?: boolean; disabled?: boolean; title?: string; items?: MenuEntry[]; filterable?: boolean; width?: number; keepOpen?: boolean; onSelect?(): void }`
  - `type MenuEntry = MenuItem | "divider"`
  - `Menu({ label, entries, onClose, placeholder?, inputKeys?, width?, className?, style?, submenu?, onDone? })`
  - `MenuButton({ label, entries, button, placeholder?, width?, align? })`
  
  `MenuButton`'s `entries` is `MenuEntry[] | (() => MenuEntry[])`, and `button` is `(p: { open: boolean; toggle(): void }) => ReactNode`. Every later menu uses these: Display, Filter, the row context menu, the sidebar menus, the issue options, and the composer chips.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/Menu.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Menu, MenuButton, type MenuEntry } from "./Menu";

const entries = (spy: (id: string) => void): MenuEntry[] => [
  { id: "backlog", label: "Backlog", keys: "1", onSelect: () => spy("backlog") },
  { id: "todo", label: "Todo", keys: "2", checked: true, onSelect: () => spy("todo") },
  "divider",
  { id: "status", label: "Status", items: [{ id: "s1", label: "In Review", onSelect: () => spy("s1") }], filterable: true },
  { id: "off", label: "Unavailable", disabled: true, onSelect: () => spy("off") },
  { id: "keep", label: "Stay open", keepOpen: true, onSelect: () => spy("keep") },
];

test("arrow keys move, Enter chooses and closes; disabled items do nothing", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  fireEvent.keyDown(menu, { key: "Enter" });
  expect(spy).toHaveBeenCalledWith("todo");
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("menuitem", { name: "Unavailable" }));
  expect(spy).not.toHaveBeenCalledWith("off");
  expect(screen.getByRole("menuitemcheckbox", { name: "Todo" })).toHaveAttribute("aria-checked", "true");
});

test("a number picks the item with that keycap while the filter is empty", () => {
  const spy = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={() => {}} placeholder="Change status…" />);
  const input = screen.getByPlaceholderText("Change status…");
  fireEvent.keyDown(input, { key: "1" });
  expect(spy).toHaveBeenCalledWith("backlog");
  fireEvent.change(input, { target: { value: "to" } });
  expect(screen.getAllByRole(/menuitem/).map((m) => m.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Todo")]));
  expect(screen.queryByRole("menuitem", { name: "Backlog" })).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull(); // dividers hide while filtering
});

test("ArrowRight opens a submenu; Escape there closes only the submenu; a leaf closes everything", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  const menu = screen.getByRole("menu", { name: "Pick" });
  for (let i = 0; i < 2; i++) fireEvent.keyDown(menu, { key: "ArrowDown" });
  fireEvent.keyDown(menu, { key: "ArrowRight" });
  const sub = screen.getByRole("menu", { name: "Status" });
  expect(within(sub).getByPlaceholderText("Filter…")).toBeInTheDocument();
  expect(fireEvent.keyDown(sub, { key: "Escape" })).toBe(false); // handled: the global Esc must not fire too
  expect(screen.queryByRole("menu", { name: "Status" })).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(menu, { key: "ArrowRight" });
  fireEvent.click(within(screen.getByRole("menu", { name: "Status" })).getByRole("menuitem", { name: "In Review" }));
  expect(spy).toHaveBeenCalledWith("s1");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("keepOpen items leave the menu open", () => {
  const spy = vi.fn();
  const onClose = vi.fn();
  render(<Menu label="Pick" entries={entries(spy)} onClose={onClose} />);
  fireEvent.click(screen.getByRole("menuitem", { name: "Stay open" }));
  expect(spy).toHaveBeenCalledWith("keep");
  expect(onClose).not.toHaveBeenCalled();
});

test("MenuButton opens its menu under the button and closes it after a choice", () => {
  const spy = vi.fn();
  render(<MenuButton label="Grouping" entries={() => entries(spy)}
    button={({ open, toggle }) => <button type="button" aria-expanded={open} onClick={toggle}>Status</button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Status" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Backlog" }));
  expect(spy).toHaveBeenCalledWith("backlog");
  expect(screen.queryByRole("menu", { name: "Grouping" })).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/components/Menu.test.tsx`
Expected: FAIL (no module).

- [ ] **Step 3: Create `web/src/components/Menu.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { Popover } from "./Popover";
import { Glyphs, Keys } from "./ui";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Muted text after the label: a count ("5 issues"), a date range, a team. */
  hint?: ReactNode;
  /** A keycap shortcut ("1", "⇧ P"). A single digit also picks the item while the filter is empty (§18.9). */
  keys?: string;
  /** Bare glyph shortcut, as in the context menu (§18.7). */
  glyphs?: string;
  /** Defined for choosable values: shows a check when true, and the item reads as a checkbox. */
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  /** A submenu, opening to the right. */
  items?: MenuEntry[];
  /** The submenu starts with a "Filter…" input. */
  filterable?: boolean;
  width?: number;
  /** Stay open after choosing (filters toggle several values). */
  keepOpen?: boolean;
  onSelect?(): void;
}
export type MenuEntry = MenuItem | "divider";

interface MenuProps {
  label: string;
  entries: MenuEntry[];
  onClose(): void;
  /** A filter input at the top, with this placeholder. */
  placeholder?: string;
  /** A keycap shown in the input row ("F" on the Filter menu). */
  inputKeys?: string;
  width?: number;
  className?: string;
  style?: CSSProperties;
  /** True for a submenu: ArrowLeft closes it. */
  submenu?: boolean;
  /** Closes the whole menu tree after a leaf is chosen (set by the parent menu). */
  onDone?(): void;
}

/** Linear's menus (inventory §4–6, §11): radius 12, 32px items, highlight layer, keycaps, checks, submenus. */
export function Menu({ label, entries, onClose, placeholder, inputKeys, width = 206, className = "", style, submenu = false, onDone }: MenuProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const visible = entries.filter((e) => (e === "divider" ? !q : e.label.toLowerCase().includes(q)));
  const items = visible.filter((e): e is MenuItem => e !== "divider");
  const done = onDone ?? onClose;

  useEffect(() => {
    if (placeholder === undefined) ref.current?.focus();
  }, [placeholder]);

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.items) return setOpen(item.id);
    item.onSelect?.();
    if (!item.keepOpen) done();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = (d: number) => {
      e.preventDefault();
      if (items.length) setActive((a) => (a + d + items.length) % items.length);
    };
    if (e.key === "ArrowDown") return move(1);
    if (e.key === "ArrowUp") return move(-1);
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) choose(item);
      return;
    }
    if (e.key === "ArrowRight" && items[active]?.items) {
      e.preventDefault();
      setOpen(items[active].id);
      return;
    }
    if (e.key === "Escape" || (submenu && e.key === "ArrowLeft")) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (!q && /^\d$/.test(e.key)) {
      const item = items.find((x) => x.keys === e.key);
      if (item) {
        e.preventDefault();
        choose(item);
      }
    }
  };

  return (
    <div ref={ref} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} style={{ width, ...style }}
      className={`z-40 rounded-palette border-[0.5px] border-line-menu bg-surface pb-1 text-small shadow-palette ${placeholder === undefined ? "pt-1" : ""} ${className}`}>
      {placeholder !== undefined && (
        <div className="mb-1 flex h-9 items-center gap-2 border-b-[0.5px] border-line-menu px-3">
          <input autoFocus aria-label={placeholder} placeholder={placeholder} value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            className="min-w-0 flex-1 bg-transparent text-small font-normal text-ink-1 placeholder:text-ink-4" />
          <Keys keys={inputKeys} />
        </div>
      )}
      {visible.map((e, i) => {
        if (e === "divider") return <div key={`divider-${i}`} role="separator" className="mx-0 my-[5.5px] border-t-[0.5px] border-line-menu" />;
        const index = items.indexOf(e);
        return (
          <div key={e.id} className="relative">
            <div role={e.checked !== undefined ? "menuitemcheckbox" : "menuitem"} aria-checked={e.checked} aria-disabled={e.disabled || undefined}
              aria-haspopup={e.items ? "menu" : undefined} aria-expanded={e.items ? open === e.id : undefined} title={e.title}
              data-active={index === active}
              onMouseEnter={() => { setActive(index); setOpen(e.items ? e.id : null); }}
              onClick={() => choose(e)}
              className="mx-1 flex h-8 cursor-default items-center gap-2.5 rounded-control px-2 text-ink-2 data-[active=true]:bg-highlight data-[active=true]:text-ink-1 aria-disabled:opacity-50">
              {e.icon && <span aria-hidden className="flex w-4 shrink-0 justify-center text-ink-3">{e.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              {e.hint && <span className="shrink-0 text-ink-4">{e.hint}</span>}
              {e.checked && <Icon name="check" size={16} className="text-ink-1" />}
              <Keys keys={e.keys} />
              <Glyphs keys={e.glyphs} />
              {e.items && <Icon name="chevronRight" size={12} className="text-ink-3" />}
            </div>
            {e.items && open === e.id && (
              <Menu label={e.label} entries={e.items} submenu placeholder={e.filterable ? "Filter…" : undefined}
                onClose={() => setOpen(null)} onDone={done} width={e.width ?? 220} className="absolute left-full top-0 ml-1" />
            )}
          </div>
        );
      })}
      {items.length === 0 && <div className="px-3 py-2 text-ink-3">No results</div>}
    </div>
  );
}

/** A button that opens a Menu under it: Display dropdowns, composer chips, options menus. */
export function MenuButton({ label, entries, button, placeholder, width, align = "left" }: {
  label: string; entries: MenuEntry[] | (() => MenuEntry[]); button: (p: { open: boolean; toggle(): void }) => ReactNode;
  placeholder?: string; width?: number; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Popover open={open} onClose={close} button={button({ open, toggle: () => setOpen((o) => !o) })}>
      <Menu label={label} entries={typeof entries === "function" ? entries() : entries} onClose={close} placeholder={placeholder}
        width={width} className={`absolute top-full mt-1 ${align === "right" ? "right-0" : "left-0"}`} />
    </Popover>
  );
}
```

- [ ] **Step 4: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Menu.tsx web/src/components/Menu.test.tsx
git commit -m "UI: Linear's menus with submenus, filter inputs, checks and number keys"
```

---

### Task 7: View chrome — breadcrumb, tabs row, round toolbar buttons, the Display dot, ⌘B

**Files:**
- Modify: `web/src/components/ViewFrame.tsx`, `web/src/components/Tabs.tsx`, `web/src/views/IssueView.tsx`, `web/src/screens/MyIssues.tsx`, `web/src/screens/TeamIssues.tsx`, `web/src/store/ui.ts`, `web/src/keyboard/shortcuts.ts`, `web/src/keyboard/actions.ts`, `.claude/skills/verify-rally-poc/flows.py` (the `display` helper)
- Test: `web/src/views/IssueView.test.tsx`, `web/src/keyboard/shortcuts.test.ts`, `web/src/App.test.tsx` (update names only)

**Interfaces:**
- Consumes: `IconButton`, `Tile`, `isDefault` (Task 3).
- Produces:
  - `ViewFrame({ title: ReactNode, actions?, children })`: row 1 only.
  - `IssueView({ scope, label, empty, tabs?: ReactNode, footer?: ReactNode })`: it renders row 2 (tabs, filter chips, "Add filter", "Display options") and scrolls its own body.
  - `TabsRow({ children })`: for loading and error states.
  - `uiStore.layoutFlip: number` and `flipLayout()`.
  - The keyboard action `"toggle-layout"` (⌘B).

- [ ] **Step 1: Write the failing tests**

In `web/src/views/IssueView.test.tsx`:
- Replace every `getByRole("button", { name: "Display" })` with `getByRole("button", { name: "Display options" })`, and every `{ name: "Filter" }` toolbar button with `{ name: "Add filter" }`.
- The first test now expects Focus groups, because My issues defaults to Focus (D28): the bootstrap's 1201 is Urgent, 1001 is in SPRINT3, and 1002 is Backlog. Replace its two expectations:

```ts
  expect(within(list).getAllByRole("region").map((r) => r.getAttribute("aria-label")))
    .toEqual(["Urgent issues", "PI 4 · Sprint 3 · Data Services", "Backlog"]);
  ...
  expect(uiStore.getState().visibleIds).toEqual([1201, 1001, 1002]);
```

If the test clock isn't inside SPRINT3, freeze it. Add `vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));` to `beforeEach`, and `vi.useRealTimers()` to `afterEach`.

- Change the localStorage keys the board tests write to `mira-view:v2:my:assigned`.

Then add:

```ts
test("the toolbar is one row: tabs on the left, round Filter and Display buttons on the right", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} tabs={<span>TABS</span>} />);
  const row = screen.getByText("TABS").parentElement!;
  expect(within(row).getByRole("button", { name: "Add filter" }).className).toContain("rounded-full");
  expect(within(row).getByRole("button", { name: "Display options" })).toBeInTheDocument();
});

test("Display shows a dot once the view differs from its defaults", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  const display = () => screen.getByRole("button", { name: "Display options" });
  expect(display().querySelector("[data-dot]")).toBeNull();
  act(() => uiStore.getState().flipLayout()); // ⌘B
  expect(screen.getByRole("region", { name: "Backlog column" })).toBeInTheDocument();
  expect(display().querySelector("[data-dot]")).not.toBeNull();
});

test("⌘B in one view doesn't flip the next view on mount", () => {
  act(() => uiStore.getState().flipLayout());
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  expect(screen.getByRole("listbox", { name: "My issues" }).querySelector('[aria-label$=" column"]')).toBeNull();
});
```

In `web/src/keyboard/shortcuts.test.ts`, add (the file has a key-event helper; follow its style):

```ts
test("⌘B toggles the layout, but not while typing", () => {
  expect(resolveKey(key({ key: "b", metaKey: true }), null).action).toBe("toggle-layout");
  const input = document.createElement("input");
  expect(resolveKey(key({ key: "b", metaKey: true, target: input }), null).action).toBeUndefined();
});
```

If the helper is named differently, use the existing one.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/views/IssueView.test.tsx src/keyboard/shortcuts.test.ts`
Expected: FAIL. The new labels, `flipLayout` and `"toggle-layout"` don't exist yet.

- [ ] **Step 3: The UI store and keys**

In `web/src/store/ui.ts`:
- Add to `UiState`:

```ts
  /** Bumped by ⌘B; the mounted issue view flips its layout (spec §18.2). */
  layoutFlip: number;
  flipLayout(): void;
```

- Initialise `layoutFlip: 0`.
- Implement `flipLayout: () => set((s) => ({ layoutFlip: s.layoutFlip + 1 })),`.

In `web/src/keyboard/shortcuts.ts`:
- Add `| "toggle-layout"` to `Action`.
- In `resolveKey`, right after the `⌘.` line (which sits below the typing check), add:

```ts
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") return { action: "toggle-layout", prefix: null };
```

In `web/src/keyboard/actions.ts`, inside the first `switch`, add `case "toggle-layout": return ui.flipLayout();`.

- [ ] **Step 4: Frame, tabs and toolbar**

Replace `web/src/components/ViewFrame.tsx` with:

```tsx
import type { ReactNode } from "react";

/** Row 1 of every screen (§18.2): the breadcrumb or title at 13/500, actions on the right. The body below owns its scrolling. */
export function ViewFrame({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-(--size-header) shrink-0 items-center gap-2 px-[18px]">
        <h1 className="flex min-w-0 items-center gap-1.5 font-medium text-ink-1">{title}</h1>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-ink-3">{children}</p>;
}

/** Row 2 without the issue view's tools: loading and error states keep their tabs (§18.2). */
export function TabsRow({ children }: { children: ReactNode }) {
  return <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2">{children}</div>;
}
```

Replace `web/src/components/Tabs.tsx` with:

```tsx
/** §18.2: 28px fully rounded pills, 10px padding, 12/500, 8px apart; active tab-active fill, inactive surface with a 0.5px border. */
export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: [T, string][]; value: T; onChange(tab: T): void }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-2">
      {tabs.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`h-7 rounded-full px-2.5 text-mini font-medium transition-colors duration-150 ${value === v ? "bg-tab-active text-ink-1" : "border-[0.5px] border-line-menu bg-surface text-ink-3 hover:bg-hover"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}
```

In `web/src/views/IssueView.tsx`:
- Imports: replace the `lucide-react` import with `import { IconButton } from "../components/ui";`. Add `useRef` to the React import, and `isDefault` to the import from `./options`.
- Remove the `tool` constant.
- Change the signature to:

```tsx
export function IssueView({ scope, label, empty, tabs, footer }: { scope: Scope; label: string; empty: ReactNode; tabs?: ReactNode; footer?: ReactNode }) {
```

- After `useViewOptions`, add the ⌘B effect:

```tsx
  const flip = useUi((u) => u.layoutFlip);
  const seenFlip = useRef(flip); // a flip from another view must not fire on mount
  useEffect(() => {
    if (flip === seenFlip.current) return;
    seenFlip.current = flip;
    setOptions({ layout: options.layout === "list" ? "board" : "list" });
  }, [flip]); // eslint-disable-line react-hooks/exhaustive-deps
```

- Replace the returned JSX with:

```tsx
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-(--size-header) shrink-0 items-center gap-2 px-2">
        {tabs}
        <FilterChips filters={filters} ctx={ctx} onChange={setFilters} />
        <div className="ml-auto flex items-center gap-1.5">
          <Popover open={menu === "filter"} onClose={closeMenu}
            button={<IconButton label="Add filter" icon="filter" aria-expanded={menu === "filter"} onClick={toggle("filter")} />}>
            <FilterMenu issues={inView} filters={filters} ctx={ctx} onChange={setFilters} />
          </Popover>
          <Popover open={menu === "display"} onClose={closeMenu}
            button={<IconButton label="Display options" icon="display" dot={!isDefault(options, scope)} aria-expanded={menu === "display"} onClick={toggle("display")} />}>
            <DisplayMenu options={options} onChange={setOptions} />
          </Popover>
        </div>
      </div>
      {selectedIds.length > 0 && <BulkBar ids={selectedIds} />}
      {shown.length === 0 && !options.showEmpty
        ? <div className="min-h-0 flex-1 overflow-y-auto">{empty}{footer}</div>
        : options.layout === "board"
          ? <BoardLayout label={label} groups={groups} options={options} onDrop={onDrop} />
          : <div className="min-h-0 flex-1 overflow-y-auto"><ListLayout label={label} groups={groups} options={options} onDrop={onDrop} />{footer}</div>}
    </div>
  );
```

The Filter menu now sits left of Display, so its panel must open to the left: Task 10 gives `FilterMenu` `right-0`. Until then, change `FilterMenu`'s class `left-0` to `right-0`.

- [ ] **Step 5: Screens**

Replace the `return` in `web/src/screens/MyIssues.tsx` with:

```tsx
  const tabs = <Tabs label="My issues" tabs={[["assigned", "Assigned"], ["created", "Created"]]} value={tab}
    onChange={(t) => uiStore.getState().navigate({ name: "my", tab: t })} />;
  return (
    <ViewFrame title="My issues">
      <IssueView scope={scope} label="My issues" tabs={tabs} empty={<Empty>{EMPTY[tab]}</Empty>}
        footer={others.length > 0 && (
          <section aria-label="Sub-issues">
            <h3 className="flex h-(--size-group) items-center rounded-control bg-hover px-4 font-medium text-ink-2">Sub-issues on others' issues</h3>
            {others.map((t) => <SubIssueRow key={t.id} sub={t} showParent />)}
          </section>
        )} />
    </ViewFrame>
  );
```

In `web/src/screens/TeamIssues.tsx`:
- Import `TabsRow` from `../components/ViewFrame`, and `Tile` from `../components/ui`.
- Replace the `return` with:

```tsx
  const tabs = <Tabs label="Issues" tabs={[["active", "Active"], ["backlog", "Backlog"], ["all", "All issues"]]} value={tab}
    onChange={(t) => ui.navigate({ name: "team", teamId, tab: t })} />;
  const crumb = (
    <>
      <button type="button" onClick={() => ui.navigate({ name: "team", teamId, tab: "active" })} className="flex items-center gap-1.5 rounded-control hover:text-ink-1">
        <Tile id={teamId} name={name} size={16} />{name}
      </button>
      <span aria-hidden className="text-ink-4">›</span>
      <span>Issues</span>
    </>
  );
  const more = tab === "all" && typeof state?.nextCursor === "number" && (
    <button type="button" onClick={() => void appStore.getState().loadTeamPage(teamId)}
      className="mx-auto my-3 block rounded-full border-[0.5px] border-line-menu bg-surface px-3 py-1 text-mini font-medium text-ink-2 hover:bg-hover">Load more</button>
  );
  return (
    <ViewFrame title={crumb}
      actions={!inSidebar && <button type="button" onClick={() => ui.joinTeam(teamId)}
        className="h-7 rounded-full border-[0.5px] border-line-menu bg-surface px-2.5 text-mini font-medium text-ink-2 hover:bg-hover">Join team</button>}>
      {state?.status === "error" ? (
        <><TabsRow>{tabs}</TabsRow><Empty>
          Couldn't load this team.{" "}
          <button type="button" onClick={() => void appStore.getState().loadTeam(teamId)} className="rounded-control px-2 py-1 text-ink-2 hover:bg-hover">Retry</button>
        </Empty></>
      ) : state?.status !== "ready" ? <><TabsRow>{tabs}</TabsRow><Empty>Loading {name}…</Empty></>
        : <IssueView scope={scope} label={`${name} ${tab}`} tabs={tabs} footer={more} empty={<Empty>{EMPTY[tab]}</Empty>} />}
    </ViewFrame>
  );
```

The existing Active empty-state text ("nothing in Todo, In Progress or In Review") already matches D31.

- [ ] **Step 6: Flows**

In `.claude/skills/verify-rally-poc/flows.py`, the `display` helper becomes:

```python
def display(page: Page) -> None:
    page.get_by_role("button", name="Display options").click()
```

The `assignee_groups` flow still uses the native Grouping select and the Show-empty checkbox. Task 10 changes both, so leave them here.

- [ ] **Step 7: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. `App.test.tsx` may look up `"Display"`, `"Filter"`, or the team title as a heading. Update those queries to the new names and roles, and list each change in the report.

- [ ] **Step 8: Visual parity check**

Run:
- `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/my/assigned /tmp/rea-research/v2cmp/t7-my.png`
- `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/team/<demo team id from rallypoc api GET /api/bootstrap --field demo_team_id>/active /tmp/rea-research/v2cmp/t7-team.png`

Compare them with `inv/my-issues.png` and `inv/team-active.png` (inventory §1–2). Measure and record:
- **Row 1:** title x and y. The title text starts 18px into the panel.
- **Row 2:** tab x, y, height and padding, plus fills and borders.
- **Toolbar buttons:** size and the 6px gap between them.

- [ ] **Step 9: Commit**

```bash
git add web/src .claude/skills/verify-rally-poc/flows.py
git commit -m "Views: Linear's breadcrumb and tabs row, round toolbar buttons, the Display dot and ⌘B"
```

---

### Task 8: List — group headers, rows, chips, collapse, and "+" to a pre-filled composer

**Files:**
- Modify: `web/src/components/GroupHeader.tsx`, `web/src/components/IssueRow.tsx`, `web/src/views/ListLayout.tsx`, `web/src/views/IssueView.tsx` (collapse wiring), `web/src/store/ui.ts`, `web/src/components/Composer.tsx` (prefill only), `web/src/components/SubIssueRow.tsx` (row spacing)
- Test: `web/src/components/rows.test.tsx`, `web/src/views/IssueView.test.tsx`, `web/src/components/Composer.test.tsx`, `web/src/store/ui.test.ts`

**Interfaces:**
- Consumes:
  - `groupTotal` and `groupPrefill` (Task 3);
  - `Chip`, `IconButton`, `labelColor` (Task 5);
  - `CycleIcon`, `ProjectIcon`, `Icon` (Task 4);
  - `shortDate`, `longDate`, `rangeLabel` (Task 5).
- Produces:
  - `uiStore.composerPrefill: ComposerPrefill | null` and `openComposer(prefill?: ComposerPrefill | null)`. `setComposer(true)` is `openComposer(null)`.
  - `GroupHeader({ group, collapsed, onToggle })`.
  - `ListLayout` gains `onToggleGroup(key: string)`.
  - The list sets the CSS variable `--id-width` (the longest key in `ch`).

- [ ] **Step 1: Write the failing tests**

Replace the row test "a row shows only the chosen properties" in `web/src/components/rows.test.tsx` with the following. It also needs `act`; `GroupHeader`; `buildGroups`; `uiStore`; `SPRINT3`, `makeProject` and `SAM` from fixtures; and `fireEvent`.

```tsx
const allOn = ["priority", "id", "status", "labels", "project", "cycle", "estimate", "assignee", "creator", "created", "updated"] as const;

test("a row shows only the chosen properties, in Linear's order, with the created date after the avatar", () => {
  appStore.setState({ projects: { 201: makeProject() }, cycles: { 301: SPRINT3 } });
  const issue = makeIssue({ labels: ["ux", "api", "infra"], creator: SAM });
  const { rerender } = render(<IssueRow issue={issue} properties={[...allOn]} />);
  for (const text of ["US1001", "[DEMO] Feature A", "Sprint 3", "ux", "api", "+1", "Oct 1"]) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByText("Sprint 3").closest("[title]")).toHaveAttribute("title", expect.stringMatching(/^PI 4 · Sprint 3 · Oct \d+ → Oct \d+$/));
  const row = screen.getByRole("option");
  const order = ["High", "US1001", "In Progress", "[DEMO] Example story", "ux", "[DEMO] Feature A", "Sprint 3", "5", "Dana Demo", "Oct 1", "Sam Sample"];
  const nodes = order.map((t) => within(row).getAllByText((_, el) => el?.getAttribute("aria-label") === t || el?.textContent === t)[0]);
  for (let i = 1; i < nodes.length; i++) expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
  rerender(<IssueRow issue={issue} properties={["id"]} />);
  expect(screen.queryByText("[DEMO] Feature A")).toBeNull();
  expect(screen.queryByRole("img", { name: "High" })).toBeNull();
  expect(screen.getByText("US1001")).toBeInTheDocument();
});

test("double-clicking the checkbox selects; it never opens the issue", () => {
  render(<IssueRow issue={makeIssue()} properties={["id"]} />);
  fireEvent.doubleClick(screen.getByRole("checkbox", { name: "Select US1001" }));
  expect(uiStore.getState().route.name).not.toBe("issue");
});

test("a group header: caret, icon, name, points total, cycle dates and a + that pre-fills the composer", () => {
  appStore.setState({ cycles: { 302: { ...SPRINT3, id: 302, start: "2026-10-22T04:00:00.000Z", end: "2026-11-05T03:59:59.000Z", name: "PI 4 · Sprint 4", short_name: "Sprint 4" } } });
  const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: {}, cycles: appStore.getState().cycles,
                teams: { 9001: { id: 9001, name: "Data Services", level: "team" as const, parent_id: null } } };
  const [group] = buildGroups([makeIssue({ cycle_id: 302, status: "todo", priority: 3, estimate: 3 }), makeIssue({ id: 2, cycle_id: 302, status: "todo", priority: 3, estimate: 5 })],
    { groupBy: "focus", orderBy: "importance", showEmpty: false, layout: "list" }, ctx);
  const onToggle = vi.fn();
  render(<GroupHeader group={group} collapsed={false} onToggle={onToggle} />);
  expect(screen.getByRole("heading", { name: "PI 4 · Sprint 4 · Data Services" })).toBeInTheDocument();
  expect(screen.getByTitle("8 points")).toHaveTextContent("8");
  expect(screen.getByText(/^Oct 22 → Nov 4$/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Collapse group" }));
  expect(onToggle).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create new issue" }));
  expect(uiStore.getState()).toMatchObject({ composerOpen: true, composerPrefill: { teamId: 9001, cycle_id: 302, status: "todo" } });
});
```

In the header test, the end `2026-11-05T03:59:59Z` reads as Nov 4 in New York. The suite's TZ is pinned in Task 5.

Add to `web/src/views/IssueView.test.tsx`:

```ts
test("collapsing a group hides its rows and is remembered", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  fireEvent.click(within(screen.getByRole("region", { name: "Backlog" })).getByRole("button", { name: "Collapse group" }));
  expect(within(screen.getByRole("region", { name: "Backlog" })).queryAllByRole("option")).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("mira-view:v2:my:assigned")!).collapsed).toEqual(["f:backlog"]);
});
```

Add to `web/src/components/Composer.test.tsx`:

```ts
test("a group's + opens the composer pre-filled", async () => {
  act(() => {
    uiStore.getState().navigate({ name: "my", tab: "assigned" });
    uiStore.getState().openComposer({ teamId: 9001, status: "in_review", priority: 1 });
  });
  render(<Composer />);
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("in_review");
  expect(screen.getByRole("combobox", { name: "Priority" })).toHaveValue("1");
  expect(screen.getByText("Data Services › New issue")).toBeInTheDocument();
});
```

Add to `web/src/store/ui.test.ts`, following its existing store-creation style:

```ts
test("setComposer(true) opens with no prefill; openComposer carries one", () => {
  const ui = createUiStore(fakeHistory(), "/my/assigned");
  ui.getState().openComposer({ status: "backlog" });
  expect(ui.getState()).toMatchObject({ composerOpen: true, composerPrefill: { status: "backlog" } });
  ui.getState().setComposer(true);
  expect(ui.getState().composerPrefill).toBeNull();
});
```

Use whatever history stub the file already defines in place of `fakeHistory()`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/components src/views src/store/ui.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: UI store prefill**

In `web/src/store/ui.ts`:
- Import `ComposerPrefill` from `../views/types`.
- Add to `UiState` `composerPrefill: ComposerPrefill | null;` and `openComposer(prefill?: ComposerPrefill | null): void;`.
- Initialise `composerPrefill: null`.
- Implement:

```ts
      openComposer: (prefill = null) => set({ composerOpen: true, composerPrefill: prefill }),
      setComposer: (open) => set(open ? { composerOpen: true, composerPrefill: null } : { composerOpen: false }),
```

- [ ] **Step 4: Composer reads the prefill (interim; Task 17 rebuilds the composer)**

In `web/src/components/Composer.tsx`:
- Read `const prefill = useUi((u) => u.composerPrefill);`.
- Add `const [cycleId, setCycleId] = useState<number | null>(null);`.
- In the open-reset effect, apply the prefill over the defaults:

```ts
    setTeamId(prefill?.teamId ?? here ?? (meta?.writeGuard === "demo" ? meta.demoTeamId : null) ?? teamIds[0] ?? null);
    setChose(prefill?.project_id !== undefined);
    setProjectId(prefill?.project_id ?? null);
    setStatus(prefill?.status ?? (route.name === "team" && route.tab === "active" ? "todo" : "backlog"));
    setPriority(prefill?.priority ?? 0);
    setAssigneeId(prefill && "assignee_id" in prefill ? prefill.assignee_id ?? null : route.name === "my" ? meta?.me.id ?? null : null);
    setCycleId(prefill?.cycle_id ?? null);
```

- Make the Status select offer every status: `STATUSES.map(...)` in place of `["backlog", "todo"]`. Import `STATUSES`.
- Add `cycle_id: cycleId` to the `createIssue` call.

- [ ] **Step 5: Group header**

Replace `web/src/components/GroupHeader.tsx` with:

```tsx
import type { Priority, Status } from "../api/types";
import { uiStore, useApp } from "../store";
import { groupPrefill, groupTotal, type Group } from "../views/model";
import { Avatar } from "./Avatar";
import { rangeLabel } from "./format";
import { CycleIcon, Icon, ProjectIcon } from "./icons";
import { PriorityIcon } from "./PriorityIcon";
import { STATUS_COLOR, StatusIcon } from "./StatusIcon";
import { IconButton } from "./ui";

export function GroupIcon({ group }: { group: Group }) {
  const project = useApp((s) => (group.field === "project" && typeof group.value === "number" ? s.projects[group.value] : undefined));
  if (group.cycle) return <CycleIcon cycle={group.cycle} />;
  switch (group.field) {
    case "status": return <StatusIcon status={group.value as Status} />;
    case "priority": return <PriorityIcon priority={group.value as Priority} />;
    case "assignee": return <Avatar user={group.value === null ? null : { id: group.value as number, name: group.label }} />;
    case "project": return group.value === null ? null : <ProjectIcon project={project} />;
    case "focus":
      if (group.key === "f:done") return <StatusIcon status="done" mono />;
      if (group.key === "f:backlog") return <StatusIcon status="backlog" />;
      return null; // Urgent issues and Other active have no icon (inventory §1)
    default: return null;
  }
}

/** §18.3: caret, icon, name, points total, cycle dates, and an always-visible "+". */
export function GroupHeader({ group, collapsed, onToggle }: { group: Group; collapsed: boolean; onToggle(): void }) {
  const total = groupTotal(group);
  const prefill = groupPrefill(group);
  const tint = group.field === "status" ? `color-mix(in lch, ${STATUS_COLOR[group.value as Status]} 45%, var(--color-ink-3))` : undefined;
  return (
    <div className="mb-0.5 flex h-(--size-group) shrink-0 items-center gap-1.5 rounded-control bg-hover pl-4 pr-4">
      <button type="button" aria-label={collapsed ? "Expand group" : "Collapse group"} aria-expanded={!collapsed} onClick={onToggle}
        className="-ml-0.5 flex size-5 items-center justify-center rounded-full text-line-caret hover:text-ink-3">
        <Icon name="caret" size={16} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      <GroupIcon group={group} />
      <h3 className="font-medium text-ink-2">{group.label}</h3>
      <span title={"points" in total ? `${total.points} points` : `${total.count} issues`}
        className="flex h-6 items-center gap-1 rounded-control px-1 text-ink-3" style={tint ? { color: tint } : undefined}>
        {"points" in total ? <><Icon name="estimate" size={14} />{total.points}</> : total.count}
      </span>
      {group.cycle && <span className="text-ink-4">{rangeLabel(group.cycle)}</span>}
      {prefill && <IconButton className="ml-auto" size={24} label="Create new issue" icon="plus"
        onClick={() => uiStore.getState().openComposer(prefill)} />}
    </div>
  );
}
```

- [ ] **Step 6: Row**

Replace `web/src/components/IssueRow.tsx` with:

```tsx
import { useEffect, useRef } from "react";
import type { Issue } from "../api/types";
import { uiStore, useApp, useUi } from "../store";
import type { Property } from "../views/types";
import { Avatar } from "./Avatar";
import { longDate, rangeLabel, shortDate } from "./format";
import { CycleIcon, Icon, ProjectIcon } from "./icons";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";
import { Chip, labelColor } from "./ui";

export { shortDate } from "./format";

/** First two labels, then "+N" (plan ruling 9). */
export function Labels({ labels, surface = false }: { labels: string[]; surface?: boolean }) {
  if (!labels.length) return null;
  const dot = (l: string) => <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: labelColor(l) }} />;
  return (
    <>
      {labels.slice(0, 2).map((l) => <Chip key={l} surface={surface} icon={dot(l)}>{l}</Chip>)}
      {labels.length > 2 && <Chip surface={surface} title={labels.slice(2).join(", ")}>+{labels.length - 2}</Chip>}
    </>
  );
}

/** §18.3 row: checkbox, priority, ID, status, title, then labels, project, cycle, estimate, assignee, created, creator, updated. */
export function IssueRow({ issue, properties }: { issue: Issue; properties: Property[] }) {
  const selected = useUi((u) => u.selectedId === issue.id);
  const checked = useUi((u) => u.selectedIds.includes(issue.id));
  const selecting = useUi((u) => u.selectedIds.length > 0);
  const project = useApp((s) => (issue.project_id ? s.projects[issue.project_id] : undefined));
  const cycle = useApp((s) => (issue.cycle_id ? s.cycles[issue.cycle_id] : undefined));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const show = (p: Property) => properties.includes(p);
  const ui = uiStore.getState();
  const date = (label: string, iso: string) => (
    <span title={`${label} ${longDate(iso)}`} className="w-12 shrink-0 text-right text-mini text-ink-3">{shortDate(iso)}</span>
  );
  return (
    <div ref={ref} role="option" aria-selected={selected} data-issue-id={issue.id} data-team-id={issue.team_id}
      onClick={() => ui.select(issue.id)}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("input")) ui.openIssue(issue.key); }}
      className={`group flex h-(--size-row) cursor-default items-center gap-2.5 rounded-control border-[0.5px] pl-2 pr-4 transition-colors duration-150 ${selected ? "border-line-menu bg-hover" : "border-transparent hover:bg-hover"}`}>
      <span className="flex w-6 shrink-0 justify-center">
        <input type="checkbox" aria-label={`Select ${issue.key}`} checked={checked}
          onChange={() => ui.toggleSelected(issue.id)} onClick={(e) => e.stopPropagation()}
          className={`size-3.5 ${checked || selecting || selected ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`} />
      </span>
      {show("priority") && <PriorityIcon priority={issue.priority} />}
      {show("id") && <span className="w-(--id-width) shrink-0 text-ink-3">{issue.key}</span>}
      {show("status") && <StatusIcon status={issue.status} />}
      <span className="min-w-0 flex-1 truncate font-medium text-ink-1">{issue.title}</span>
      {issue.blocked && (
        <span title={issue.blocked_reason || "Blocked"} className="flex h-6 items-center gap-1 rounded-full bg-blocked/15 px-2 text-mini text-blocked">
          <Icon name="blocked" size={12} />Blocked
        </span>
      )}
      {show("labels") && <Labels labels={issue.labels} />}
      {show("project") && project && <Chip icon={<ProjectIcon project={project} />}>{project.name}</Chip>}
      {show("cycle") && cycle && (
        <Chip title={`${cycle.name} · ${rangeLabel(cycle)}`} icon={<CycleIcon cycle={cycle} />}>{cycle.short_name}</Chip>
      )}
      {show("estimate") && issue.estimate !== null && (
        <span className="flex shrink-0 items-center gap-1 text-mini text-ink-3"><Icon name="estimate" size={14} />{issue.estimate}</span>
      )}
      {show("assignee") && <Avatar user={issue.assignee} />}
      {show("created") && date("Created", issue.created_at)}
      {show("creator") && <Avatar user={issue.creator} />}
      {show("updated") && date("Updated", issue.updated_at)}
    </div>
  );
}
```

In `web/src/components/SubIssueRow.tsx`, change the row class to `flex h-(--size-row) items-center gap-2.5 rounded-control pl-2 pr-4 hover:bg-hover`, and its key span to `w-(--id-width) shrink-0 text-ink-3`, so that sub-issue rows line up with issue rows.

- [ ] **Step 7: List layout with collapse and the ID column width**

In `web/src/views/ListLayout.tsx`:
- Change `ListGroup` and `ListLayout` to take `onToggleGroup(key: string)`.
- `ListGroup` renders `<GroupHeader group={group} collapsed={collapsed} onToggle={() => onToggleGroup(group.key)} />`, with `collapsed = options.collapsed.includes(group.key)`, and renders no rows when collapsed. With `groupBy: "none"` it renders no header.
- The listbox class becomes `flex flex-col pb-2`, with no padding and no gap: rows span the panel, as in Linear (inventory §1).
- Set the ID width on it:

```tsx
  const longest = Math.max(4, ...groups.flatMap((g) => g.issues.map((i) => i.key.length)));
  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={(e) => handleDragEnd(e, onDrop)}>
      <div role="listbox" aria-label={label} aria-multiselectable="true" className="flex flex-col pb-2"
        style={{ "--id-width": `${longest + 0.5}ch` } as CSSProperties}>
        {groups.map((g) => <ListGroup key={g.key} group={g} options={options} onToggleGroup={onToggleGroup} />)}
      </div>
    </DndContext>
  );
```

Import `CSSProperties` from React.

In `IssueView.tsx`, pass this to `ListLayout`:

```tsx
onToggleGroup={(key) => setOptions({ collapsed: options.collapsed.includes(key) ? options.collapsed.filter((k) => k !== key) : [...options.collapsed, key] })}
```

The board takes the same handler in Task 9. For now `BoardLayout` ignores it, so pass it to the list only.

- [ ] **Step 8: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 9: Visual parity check**

Run: `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/my/assigned /tmp/rea-research/v2cmp/t8-my.png`

Compare it with `inv/my-issues.png` and `icons/hover--row.png`. Measure with `/tmp/rea-tools/measure-points.js`, after setting `window.__points` for Mira's screenshot. Record against inventory §1:
- **Group header:** x and y, height, fill, caret position and colour, the points button, and the "+" position (16px from the right).
- **Rows:**
  - pitch;
  - the x of priority, ID, status and title;
  - chip height, border and fill;
  - the order on the right;
  - the date after the avatar.
- **Hover and selected:** the row fills.

- [ ] **Step 10: Commit**

```bash
git add web/src
git commit -m "List: Linear's group headers with points, dates and +, chip rows, collapse, and a pre-filled composer"
```

---

### Task 9: Board — viewport-height columns, headers, cards, and "Add new issue"

**Files:**
- Modify: `web/src/views/BoardLayout.tsx`, `web/src/views/IssueView.tsx` (pass `onToggleGroup`)
- Test: `web/src/views/BoardLayout.test.tsx` (new), `web/src/views/IssueView.test.tsx`

**Interfaces:**
- Consumes: `groupTotal`, `groupPrefill`, `GroupIcon`, `Chip`, `IconButton`, `Labels`, `MenuButton`, `CycleIcon`, `ProjectIcon`, `shortDate`, `rangeLabel`.
- Produces: `BoardLayout({ label, groups, options, onDrop, onToggleGroup })`. Collapsed columns share `options.collapsed` with the list.

- [ ] **Step 1: Write the failing tests**

Create `web/src/views/BoardLayout.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeIssue, makeProject, SPRINT3 } from "../test/fixtures";
import { BoardLayout } from "./BoardLayout";
import { buildGroups } from "./model";
import type { DisplayOptions } from "./types";

const options: DisplayOptions = { layout: "board", groupBy: "status", orderBy: "priority", showEmpty: false, completed: "day", collapsed: [],
  properties: ["priority", "id", "status", "labels", "project", "cycle", "estimate", "assignee", "created"] };
const ctx = { meId: 501, now: Date.parse("2026-10-16T12:00:00.000Z"), users: {}, projects: { 201: makeProject() }, cycles: { 301: SPRINT3 }, teams: {} };
const many = Array.from({ length: 175 }, (_, n) => makeIssue({ id: 5000 + n, key: `US${5000 + n}`, status: "todo", rank: `R${n}` }));

beforeEach(() => {
  appStore.setState({ projects: { 201: makeProject() }, cycles: { 301: SPRINT3 } });
  uiStore.setState(uiStore.getInitialState(), true);
});

test("columns hold the viewport height and scroll on their own, below a fixed header", () => {
  // Review focus 3: a 175-card column must not stretch the page.
  render(<BoardLayout label="Board" groups={buildGroups(many, options, ctx)} options={options} onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const board = screen.getByRole("listbox", { name: "Board" });
  expect(board.className).toContain("overflow-y-hidden");
  const column = screen.getByRole("region", { name: "Todo column" });
  expect(column.className).toContain("h-full");
  const body = column.querySelector("[data-column-body]")!;
  expect(body.className).toContain("overflow-y-auto");
  expect(body.contains(within(column).getByRole("heading", { name: "Todo" }))).toBe(false);
  expect(within(body as HTMLElement).getAllByRole("option")).toHaveLength(175);
});

test("a column header shows icon, name, points, and … and + buttons; the footer adds an issue too", () => {
  render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo", estimate: 3 })], options, ctx)} options={options}
    onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const column = screen.getByRole("region", { name: "Todo column" });
  expect(within(column).getByTitle("3 points")).toHaveTextContent("3");
  fireEvent.click(within(column).getByRole("button", { name: "Create new issue" }));
  expect(uiStore.getState().composerPrefill).toEqual({ status: "todo" });
  fireEvent.click(within(column).getByRole("button", { name: "Add new issue" }));
  expect(uiStore.getState().composerOpen).toBe(true);
});

test("a card: ID and avatar, status and title, a chip row, then the created date", () => {
  render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo", labels: ["ux"] })], options, ctx)} options={options}
    onDrop={vi.fn()} onToggleGroup={vi.fn()} />);
  const card = screen.getByRole("option", { name: /Example story/ });
  expect(card.className).toContain("shadow-card");
  for (const text of ["US1001", "Sprint 3", "[DEMO] Feature A", "ux", "Created Oct 1"]) expect(within(card).getByText(text)).toBeInTheDocument();
  expect(within(card).getByRole("img", { name: "High" })).toBeInTheDocument();
});

test("collapsing a column from its … menu", () => {
  const onToggleGroup = vi.fn();
  render(<BoardLayout label="Board" groups={buildGroups([makeIssue({ status: "todo" })], options, ctx)} options={options} onDrop={vi.fn()} onToggleGroup={onToggleGroup} />);
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Collapse column" }));
  expect(onToggleGroup).toHaveBeenCalledWith("todo");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/views/BoardLayout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `web/src/views/BoardLayout.tsx`**

```tsx
import { DndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import type { Issue } from "../api/types";
import { Avatar } from "../components/Avatar";
import { rangeLabel, shortDate } from "../components/format";
import { GroupIcon } from "../components/GroupHeader";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { Labels } from "../components/IssueRow";
import { MenuButton } from "../components/Menu";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { Chip, IconButton } from "../components/ui";
import { uiStore, useApp, useUi } from "../store";
import { handleDragEnd, useDragSensors, type DropHandler } from "./ListLayout";
import { collisionDetection } from "./drag";
import { groupPrefill, groupTotal, type Group } from "./model";
import type { DisplayOptions, Property } from "./types";

/** §18.4 card: ID and avatar; status and title; a chip row; then the created date. */
function Card({ issue, groupKey, properties }: { issue: Issue; groupKey: string; properties: Property[] }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, data: { groupKey } });
  const selected = useUi((u) => u.selectedId === issue.id);
  const checked = useUi((u) => u.selectedIds.includes(issue.id));
  const project = useApp((s) => (issue.project_id ? s.projects[issue.project_id] : undefined));
  const cycle = useApp((s) => (issue.cycle_id ? s.cycles[issue.cycle_id] : undefined));
  const ref = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    setNodeRef(node);
  }, [setNodeRef]);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);
  const show = (p: Property) => properties.includes(p);
  const ui = uiStore.getState();
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setRefs} {...listeners} role="option" aria-selected={selected || checked} data-issue-id={issue.id} data-team-id={issue.team_id}
      style={style} onClick={() => ui.select(issue.id)} onDoubleClick={() => ui.openIssue(issue.key)}
      className={`shrink-0 rounded-control p-3 shadow-card transition-shadow duration-150 ${checked ? "bg-selected" : "bg-surface"} ${selected ? "outline outline-[0.5px] outline-focus" : ""} ${isDragging ? "relative z-10 shadow-palette" : ""}`}>
      <div className="flex h-[18px] items-center gap-2 text-mini text-ink-3">
        {show("id") && <span>{issue.key}</span>}
        {issue.blocked && <span className="text-blocked">Blocked</span>}
        <span className="ml-auto">{show("assignee") && <Avatar user={issue.assignee} />}</span>
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        {show("status") && <span className="mt-[3px]"><StatusIcon status={issue.status} /></span>}
        <span className="line-clamp-3 font-medium text-ink-1">{issue.title}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {show("priority") && <Chip surface icon={<PriorityIcon priority={issue.priority} size={14} />} title={undefined} />}
        {show("cycle") && cycle && <Chip surface title={`${cycle.name} · ${rangeLabel(cycle)}`} icon={<CycleIcon cycle={cycle} />}>{cycle.short_name}</Chip>}
        {show("project") && project && <Chip surface icon={<ProjectIcon project={project} />}>{project.name}</Chip>}
        {show("estimate") && issue.estimate !== null && <Chip surface icon={<Icon name="estimate" size={14} />}>{issue.estimate}</Chip>}
        {show("labels") && <Labels labels={issue.labels} surface />}
      </div>
      {show("created") && <div className="mt-1.5 text-mini text-ink-3">Created {shortDate(issue.created_at)}</div>}
    </div>
  );
}

function Column({ group, options, onToggleGroup }: { group: Group; options: DisplayOptions; onToggleGroup(key: string): void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.key}`, data: { groupKey: group.key } });
  const total = groupTotal(group);
  const prefill = groupPrefill(group);
  const add = () => uiStore.getState().openComposer(prefill);
  if (options.collapsed.includes(group.key)) {
    return (
      <section ref={setNodeRef} aria-label={`${group.label} column`} className="flex h-full w-10 shrink-0 flex-col items-center gap-2 py-[18px]">
        <button type="button" aria-label={`Expand ${group.label}`} onClick={() => onToggleGroup(group.key)} className="flex flex-col items-center gap-2 rounded-control p-1 text-ink-3 hover:bg-hover">
          <GroupIcon group={group} />
          <span className="text-mini [writing-mode:vertical-rl]">{group.label} · {group.issues.length}</span>
        </button>
      </section>
    );
  }
  return (
    <section ref={setNodeRef} aria-label={`${group.label} column`}
      className={`flex h-full w-(--size-column) shrink-0 flex-col rounded-control transition-colors duration-150 ${isOver ? "bg-hover" : ""}`}>
      <header className="flex h-[50px] shrink-0 items-center gap-1.5 px-3">
        <GroupIcon group={group} />
        <h3 className="font-medium text-ink-2">{group.label}</h3>
        <span title={"points" in total ? `${total.points} points` : `${total.count} issues`} className="flex items-center gap-1 text-ink-3">
          {"points" in total ? <><Icon name="estimate" size={14} />{total.points}</> : total.count}
        </span>
        <span className="ml-auto flex items-center">
          <MenuButton label={`${group.label} column`} align="right" width={180}
            entries={[{ id: "collapse", label: "Collapse column", onSelect: () => onToggleGroup(group.key) }]}
            button={({ open, toggle }) => <IconButton size={24} label="Open menu" icon="more" aria-expanded={open} onClick={toggle} />} />
          {prefill && <IconButton size={24} label="Create new issue" icon="plus" onClick={add} />}
        </span>
      </header>
      <div data-column-body className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        <SortableContext items={group.issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {group.issues.map((issue) => <Card key={issue.id} issue={issue} groupKey={group.key} properties={options.properties} />)}
        </SortableContext>
        <button type="button" aria-label="Add new issue" onClick={add}
          className="flex h-7 shrink-0 items-center justify-center rounded-full border-[0.5px] border-line-menu bg-surface/50 text-ink-3 hover:bg-hover">
          <Icon name="plus" size={16} />
        </button>
      </div>
    </section>
  );
}

/** §18.4: columns fill the height and scroll on their own; the board scrolls only sideways. */
export function BoardLayout({ label, groups, options, onDrop, onToggleGroup }: {
  label: string; groups: Group[]; options: DisplayOptions; onDrop: DropHandler; onToggleGroup(key: string): void;
}) {
  const sensors = useDragSensors();
  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={(e) => handleDragEnd(e, onDrop)}>
      <div role="listbox" aria-label={label} aria-multiselectable="true" className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2">
        {groups.map((g) => <Column key={g.key} group={g} options={options} onToggleGroup={onToggleGroup} />)}
      </div>
    </DndContext>
  );
}
```

A Focus group, or a "none"/"Other active" group, has no prefill. Its "Add new issue" pill then opens the composer with `openComposer(null)`.

In `IssueView.tsx`, pass the same `onToggleGroup` handler to `BoardLayout` that `ListLayout` gets. Lift it into a `const toggleGroup = …` and use it for both.

Fix the board test in `IssueView.test.tsx` that checks `card().className` contains `"bg-selected"`. It still holds, because a checked card uses `bg-selected`.

- [ ] **Step 4: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Visual parity check and the live board flow**

Run: `/tmp/rea-tools/shot.sh "http://127.0.0.1:5173/team/<demo team id>/active" /tmp/rea-research/v2cmp/t9-board.png`. Before the shot, set the board layout once in that tab: open Display options → Board. Alternatively, pass the cdp steps `key:Meta+b wait:500`.

Compare the shot with `inv/team-board.png` and inventory §3. Record:
- column width and gap;
- header height, and the positions of "…" and "+";
- card shadow, inset and line order;
- the footer pill.

Then scroll the Todo column with the mouse wheel and confirm that its header stays put.

Run: `.claude/skills/verify-rally-poc/rallypoc browser run team-board`
Expected: PASS. The flow drags cards between the Todo and In Progress columns, which keep their names.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "Board: viewport-height columns that scroll on their own, Linear's headers and cards, Add new issue"
```

---

### Task 10: Display menu and Filter menu

**Files:**
- Modify: `web/src/views/DisplayMenu.tsx`, `web/src/views/FilterMenu.tsx`, `web/src/views/model.ts` (filter fields `team` and `estimate`), `web/src/views/types.ts`, `web/src/views/IssueView.tsx` (pass `scope` to `DisplayMenu`), `.claude/skills/verify-rally-poc/flows.py` (`assignee_groups`)
- Test: `web/src/views/IssueView.test.tsx`, `web/src/views/model.test.ts`

**Interfaces:**
- Consumes: `MenuButton`, `Menu`, `Switch`, `Icon`, `StatusIcon`, `normalizeOptions`.
- Produces:
  - `DisplayMenu({ options, onChange, scope })`.
  - `FilterMenu({ issues, filters, ctx, onChange, scope })`.
  - `FilterField` gains `"team"` and `"estimate"`.
  - `FILTER_FIELDS: (FilterField | "divider")[]` in Linear's order; consumers filter out the divider.

- [ ] **Step 1: Write the failing tests**

In `web/src/views/IssueView.test.tsx`, rewrite the three tests that drive the menus:

```ts
test("Display switches to a board and remembers it for this view", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  fireEvent.click(screen.getByRole("tab", { name: "Board" }));
  expect(screen.getByRole("region", { name: "Backlog column" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("mira-view:v2:my:assigned")!).layout).toBe("board");
});

test("the Display menu: Focus with a disabled Importance ordering, Completed issues, properties in Linear's order", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  const menu = screen.getByRole("dialog", { name: "Display options" });
  expect(within(menu).getByRole("button", { name: "Grouping: Focus" })).toBeInTheDocument();
  expect(within(menu).getByRole("button", { name: "Ordering: Importance" })).toBeDisabled();
  expect(within(menu).getByRole("button", { name: "Ordering: Importance" })).toHaveAttribute("title", "Ordering is disabled for Focus grouping");
  expect(within(menu).getByRole("button", { name: "Completed issues: Past day" })).toBeInTheDocument();
  expect(within(menu).queryByRole("switch", { name: "Show empty groups" })).toBeNull(); // team views only
  expect(within(within(menu).getByRole("group", { name: "Display properties" })).getAllByRole("button").map((b) => b.textContent))
    .toEqual(["ID", "Status", "Assignee", "Creator", "Priority", "Project", "Cycle", "Estimate", "Labels", "Created", "Updated"]);
});

test("grouping by assignee with empty groups shows No assignee", () => {
  const team = { kind: "team", teamId: 9001, tab: "active" } as const;
  serve({ "GET /api/bootstrap": makeBootstrap() });
  appStore.setState({ teamState: { 9001: { status: "ready", memberIds: [501, 502] } } });
  render(<IssueView scope={team} label="Data Services active" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Display options" }));
  fireEvent.click(screen.getByRole("button", { name: "Grouping: Status" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Assignee" }));
  fireEvent.click(screen.getByRole("switch", { name: "Show empty groups" }));
  expect(screen.getByRole("region", { name: "Dana Demo" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "No assignee" })).toBeInTheDocument();
});

test("a priority filter narrows the view, with a chip that clears it; values show counts", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  const menu = screen.getByRole("menu", { name: "Filter" });
  expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent?.trim()))
    .toEqual(["Team", "Status", "Assignee", "Creator", "Priority", "Estimate", "Labels", "Project", "Cycle"]);
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Priority" }));
  const urgent = screen.getByRole("menuitemcheckbox", { name: /Urgent/ });
  expect(urgent).toHaveTextContent("1 issue");
  fireEvent.click(urgent);
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByText("Priority is Urgent")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear Priority filter" }));
  expect(screen.getAllByRole("option")).toHaveLength(3);
});

test("a cycle filter lists each team's sprint with its team", () => {
  render(<IssueView scope={MY} label="My issues" empty={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cycle" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /PI 4 · Sprint 3 · Data Services/ }));
  expect(screen.getAllByRole("option").map((o) => o.getAttribute("data-issue-id"))).toEqual(["1001"]);
});
```

Add to `web/src/views/model.test.ts`:

```ts
test("team and estimate filter by their values", () => {
  const xs = [makeIssue({ id: 1, estimate: 3 }), makeIssue({ id: 2, team_id: 9002, estimate: null })];
  expect(ids(xs.filter((i) => matches(i, { team: [9002] })))).toEqual([2]);
  expect(ids(xs.filter((i) => matches(i, { estimate: [null] })))).toEqual([2]);
  expect(filterOptions("estimate", xs, ctx).map((o) => o.label)).toEqual(["3 Points", "No estimate"]);
  expect(filterOptions("team", xs, ctx).map((o) => o.label)).toEqual(["AI/ML Solutions", "Data Services"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/views`
Expected: FAIL.

- [ ] **Step 3: Filter fields**

In `web/src/views/types.ts`, change `FilterField` to:

```ts
export type FilterField = "team" | "status" | "assignee" | "creator" | "priority" | "estimate" | "label" | "project" | "cycle";
```

In `web/src/views/model.ts`:
- Import `points` from `../components/format`.
- Replace `FILTER_FIELDS` with:

```ts
/** Linear's Filter menu order, limited to what Rally backs (spec §18.6). "team" shows only across teams. */
export const FILTER_FIELDS: ([FilterField, string] | "divider")[] = [
  ["team", "Team"], ["status", "Status"], ["assignee", "Assignee"], ["creator", "Creator"], ["priority", "Priority"],
  ["estimate", "Estimate"], ["label", "Labels"], "divider", ["project", "Project"], ["cycle", "Cycle"],
];
export const FIELD_LABEL = Object.fromEntries(FILTER_FIELDS.filter((f) => f !== "divider")) as Record<FilterField, string>;
```

- In `fieldValues`, add `case "team": return [i.team_id];` and `case "estimate": return [i.estimate];`.
- In `valueLabel`, add `case "team": return ctx.teams[v as number]?.name ?? \`Team ${v}\`;` and `case "estimate": return v === null ? "No estimate" : points(v as number);`.
- In `filterOptions`, sort estimates numerically. Before the general sort, add:

```ts
  if (field === "estimate") return [...seen.values()].sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : (a.value as number) - (b.value as number)));
```

`FilterChips` used `FILTER_FIELDS` as `[field, label]` pairs. Update it to iterate `FILTER_FIELDS.filter((f) => f !== "divider")`. Any other user found by `grep -rn FILTER_FIELDS web/src` needs the same change.

- [ ] **Step 4: Display menu**

Replace `web/src/views/DisplayMenu.tsx` with:

```tsx
import { Icon } from "../components/icons";
import { MenuButton, type MenuEntry } from "../components/Menu";
import { Switch } from "../components/ui";
import { ALL_PROPERTIES, PROPERTY_LABEL } from "./options";
import type { CompletedWindow, DisplayOptions, GroupBy, OrderBy, Scope } from "./types";

const GROUPS: [GroupBy, string][] = [
  ["focus", "Focus"], ["status", "Status"], ["assignee", "Assignee"], ["priority", "Priority"], ["project", "Project"], ["cycle", "Cycle"], ["none", "No grouping"],
];
const ORDERS: [OrderBy, string][] = [
  ["manual", "Manual"], ["priority", "Priority"], ["updated", "Last updated"], ["created", "Created"], ["estimate", "Estimate"],
];
const WINDOWS: [CompletedWindow, string][] = [["none", "None"], ["day", "Past day"], ["week", "Past week"], ["two_weeks", "Past 2 weeks"]];

function Dropdown<T extends string>({ label, value, choices, onPick, disabled, title }: {
  label: string; value: T; choices: [T, string][]; onPick(v: T): void; disabled?: boolean; title?: string;
}) {
  const current = choices.find(([v]) => v === value)?.[1] ?? (value === "importance" ? "Importance" : value);
  const entries: MenuEntry[] = choices.map(([v, l]) => ({ id: v, label: l, checked: v === value, onSelect: () => onPick(v) }));
  return (
    <MenuButton label={label} entries={entries} width={180} align="right"
      button={({ open, toggle }) => (
        <button type="button" aria-label={`${label}: ${current}`} aria-expanded={open} disabled={disabled} title={title} onClick={toggle}
          className="flex h-6 w-[116px] items-center justify-between rounded-control border-[0.5px] border-line-menu px-2 text-mini font-normal text-ink-1 disabled:text-ink-4">
          <span className="truncate">{current}</span><Icon name="chevron" size={10} className="text-ink-3" />
        </button>
      )} />
  );
}

const row = "flex h-8 items-center justify-between gap-2 text-ink-3";

/** §18.5: layout tabs, Grouping and Ordering, Completed issues (My issues) or Show empty groups (teams), display properties. */
export function DisplayMenu({ options, onChange, scope }: { options: DisplayOptions; onChange(next: Partial<DisplayOptions>): void; scope: Scope }) {
  const my = scope.kind === "my";
  const focus = options.groupBy === "focus";
  const tab = (layout: DisplayOptions["layout"], label: string, icon: "list" | "board") => (
    <button type="button" role="tab" aria-selected={options.layout === layout} onClick={() => onChange({ layout })}
      className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full text-mini font-medium ${options.layout === layout ? "bg-highlight text-ink-1" : "border-[0.5px] border-line-menu bg-surface text-ink-3"}`}>
      <Icon name={icon} size={16} />{label}
    </button>
  );
  return (
    <div role="dialog" aria-label="Display options"
      className="absolute right-0 top-9 z-30 w-[300px] rounded-palette border-[0.5px] border-line-menu bg-surface p-3 shadow-palette">
      <div role="tablist" aria-label="Layout" className="mb-2 flex gap-2">{tab("list", "List", "list")}{tab("board", "Board", "board")}</div>
      <div className={row}>Grouping
        <Dropdown label="Grouping" value={options.groupBy} choices={my ? GROUPS : GROUPS.filter(([g]) => g !== "focus")} onPick={(groupBy) => onChange({ groupBy })} />
      </div>
      <div className={row}>Ordering
        {focus
          ? <Dropdown label="Ordering" value={"importance" as OrderBy} choices={[["importance", "Importance"]]} onPick={() => {}} disabled title="Ordering is disabled for Focus grouping" />
          : <Dropdown label="Ordering" value={options.orderBy} choices={ORDERS} onPick={(orderBy) => onChange({ orderBy })} />}
      </div>
      <div className="-mx-3 my-2 border-t-[0.5px] border-line-menu" />
      {my
        ? <div className={row}>Completed issues
            <Dropdown label="Completed issues" value={options.completed} choices={WINDOWS} onPick={(completed) => onChange({ completed })} />
          </div>
        : <div className={row}>Show empty groups
            <Switch label="Show empty groups" checked={options.showEmpty} onChange={(showEmpty) => onChange({ showEmpty })} />
          </div>}
      <div className="-mx-3 my-2 border-t-[0.5px] border-line-menu" />
      <div className="mb-2 text-ink-3">Display properties</div>
      <div role="group" aria-label="Display properties" className="flex flex-wrap gap-1.5">
        {ALL_PROPERTIES.map((p) => {
          const on = options.properties.includes(p);
          return (
            <button key={p} type="button" aria-pressed={on}
              onClick={() => onChange({ properties: on ? options.properties.filter((x) => x !== p) : [...options.properties, p] })}
              className={`h-6 rounded-full px-2.5 text-mini font-medium ${on ? "bg-pill-on text-ink-1" : "border-[0.5px] border-line-menu bg-surface text-ink-3"}`}>
              {PROPERTY_LABEL[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

`Dropdown`'s `value` type is `T`. Under Focus, the `value={"importance" as OrderBy}` cast keeps it typed.

In `IssueView.tsx`:
- Pass `scope={scope}` to `DisplayMenu`.
- Pass `scope={scope}` to `FilterMenu`.
- Point the board test at `{ name: "Backlog column" }`. Focus's board columns are its groups.

The Display menu's popover anchors to the button's `relative` wrapper, which `Popover` provides. `top-9` places it under the 28px button.

- [ ] **Step 5: Filter menu**

Replace `web/src/views/FilterMenu.tsx` with:

```tsx
import type { ReactNode } from "react";
import type { Issue } from "../api/types";
import { Icon } from "../components/icons";
import { Menu, type MenuEntry } from "../components/Menu";
import { StatusIcon } from "../components/StatusIcon";
import { FIELD_LABEL, FILTER_FIELDS, fieldValues, filterOptions, toggleFilter, valueLabel, type Context } from "./model";
import type { FilterField, Filters, Scope } from "./types";

const FIELD_ICON: Record<FilterField, ReactNode> = {
  team: <Icon name="team" size={16} />, status: <StatusIcon status="backlog" size={14} />, assignee: <Icon name="assign" size={16} />,
  creator: <Icon name="creator" size={16} />, priority: <Icon name="priority" size={16} />, estimate: <Icon name="estimate" size={16} />,
  label: <Icon name="tag" size={16} />, project: <Icon name="project" size={16} />, cycle: <Icon name="cycles" size={16} />,
};

const count = (n: number) => `${n} ${n === 1 ? "issue" : "issues"}`;

/** F opens this (§18.6): Linear's field list, each a submenu of values with counts. Picking toggles and keeps it open. */
export function FilterMenu({ issues, filters, ctx, onChange, scope, onClose }: {
  issues: Issue[]; filters: Filters; ctx: Context; onChange(f: Filters): void; scope: Scope; onClose?(): void;
}) {
  const entries: MenuEntry[] = FILTER_FIELDS
    .filter((f) => f === "divider" || f[0] !== "team" || scope.kind === "my")
    .map((f): MenuEntry => {
      if (f === "divider") return "divider";
      const [field, label] = f;
      return {
        id: field, label, icon: FIELD_ICON[field], filterable: true, width: 240,
        items: filterOptions(field, issues, ctx).map((o): MenuEntry => ({
          id: `${field}:${String(o.value)}`, label: o.label, keepOpen: true,
          checked: (filters[field] ?? []).includes(o.value),
          hint: count(issues.filter((i) => fieldValues(i, field, ctx).includes(o.value)).length),
          onSelect: () => onChange(toggleFilter(filters, field, o.value)),
        })),
      };
    });
  return (
    <Menu label="Filter" entries={entries} placeholder="Add Filter…" inputKeys="F" onClose={onClose ?? (() => {})}
      className="absolute right-0 top-9" />
  );
}

export function FilterChips({ filters, ctx, onChange }: { filters: Filters; ctx: Context; onChange(f: Filters): void }) {
  const active = (Object.keys(FIELD_LABEL) as FilterField[]).filter((f) => filters[f]?.length);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {active.map((field) => (
        <span key={field} className="flex h-6 items-center gap-1 rounded-full border-[0.5px] border-line-menu bg-panel pl-2 pr-1 text-mini text-ink-2">
          {FIELD_LABEL[field]} is {filters[field]!.map((v) => valueLabel(field, v, ctx)).join(", ")}
          <button type="button" aria-label={`Clear ${FIELD_LABEL[field]} filter`} className="rounded-full p-0.5 text-ink-3 hover:bg-hover"
            onClick={() => {
              const next = { ...filters };
              delete next[field];
              onChange(next);
            }}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
```

The submenu values' accessible names include the count, because the menu item's text is "Urgent 1 issue". That is why the tests match with a regex. In `IssueView.tsx`, render `<FilterMenu … onClose={closeMenu} />`.

- [ ] **Step 6: Flows**

In `.claude/skills/verify-rally-poc/flows.py`, replace these two lines of `assignee_groups`:

```python
    page.get_by_role("combobox", name="Grouping").select_option("assignee")
    page.get_by_role("checkbox", name="Show empty groups").check()
```

with:

```python
    page.get_by_role("button", name=re.compile(r"^Grouping: ")).click()
    page.get_by_role("menuitemcheckbox", name="Assignee").click()
    page.get_by_role("switch", name="Show empty groups").click()
```

- [ ] **Step 7: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 8: Visual parity check and live flow**

Open each menu and screenshot it:
- `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/my/assigned /tmp/rea-research/v2cmp/t10-display.png click:"Display options"`
- the same with `click:"Add filter"` → `t10-filter.png`

Compare them with `icons/display-menu--full.png`, `icons/display-menu--team.png` and `icons/filter-menu--full.png` (inventory §4–5). Record:
- panel width and radius;
- row heights and label colours;
- dropdown size;
- switch size and colours;
- pill fills;
- the order of every item.

Run: `.claude/skills/verify-rally-poc/rallypoc browser run assignee-groups`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src .claude/skills/verify-rally-poc/flows.py
git commit -m "Display and Filter menus in Linear's shape: custom dropdowns, switches, counts, team and estimate filters"
```

---

### Task 11: Pickers v2 and the row context menu

**Files:**
- Modify: `web/src/palette/pickers.ts`, `web/src/store/ui.ts`, `web/src/components/IssueRow.tsx`, `web/src/views/BoardLayout.tsx`, `web/src/Overlays.tsx`
- Create: `web/src/palette/optionIcon.tsx`, `web/src/palette/copy.ts`, `web/src/components/RowMenu.tsx`
- Test: `web/src/palette/pickers.test.ts`, `web/src/components/RowMenu.test.tsx` (new), `web/src/store/ui.test.ts`

**Interfaces:**
- Consumes: `Menu` (Task 6), `points` and `pickerRange` from `format.ts`, `Icon`, `CycleIcon`, `ProjectIcon`, `StatusIcon`, `PriorityIcon`, `Avatar`.
- Produces:
  - `PickerOption` gains `keys?: string`, `current?: boolean`, `cycle?: Cycle` and `project?: Project`.
  - `PICKER_PLACEHOLDER` uses Linear's wording (§18.9).
  - `patchesFor(o, targets)` returns the `{ id, patch }[]` to send.
  - `optionIcon(o: PickerOption): ReactNode`.
  - `copyIssueIds(issues)`, `copyIssueUrls(issues)` and `copyIssueTitles(issues)`. Each toasts "Copied" or "Couldn't copy".
  - `uiStore.contextMenu: { x: number; y: number; ids: number[] } | null`, with `openContextMenu(id, x, y)` and `closeContextMenu()`. `closeTopOverlay` closes it first.
  - `rowMenuEntries(app, targets): MenuEntry[]`.
  - `RowMenu`, mounted in `Overlays`.

- [ ] **Step 1: Write the failing tests**

In `web/src/palette/pickers.test.ts`, add `beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-16T12:00:00.000Z"), toFake: ["Date"] }));` so that "Current" doesn't depend on the day the suite runs. Then update these four tests to the new wording and order:

```ts
  expect(status.map((o) => [o.label, o.keys, o.current])).toEqual([
    ["Backlog", "1", false], ["Todo", "2", false], ["In Progress", "3", true], ["In Review", "4", false], ["Done", "5", false]]);
  ...
  expect(pickerOptions("priority", store.getState(), [issue]).map((o) => [o.label, o.keys, o.current])).toEqual([
    ["No priority", "0", false], ["Urgent", "1", false], ["High", "2", true], ["Medium", "3", false], ["Low", "4", false]]);
```

```ts
  expect(opts.map((o) => [o.label, o.hint])).toEqual([["No cycle", undefined], ["PI 4 · Sprint 3", "Oct 8 – Oct 21 · Current"], ["PI 4 · Sprint 4", "Oct 22 – Nov 4 · Upcoming"]]);
  expect(opts[1].current).toBe(true);
```

```ts
  expect(opts.map((o) => o.label)).toEqual(["No estimate", "1 Point", "2 Points", "3 Points", "5 Points", "8 Points", "13 Points", "50 Points"]);
```

The cycle test already sets the fake clock. Remove its own `vi.useFakeTimers` line, since `beforeEach` sets it now.

Create `web/src/components/RowMenu.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { RowMenu } from "./RowMenu";

let fetchMock: ReturnType<typeof serve>;
beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap(),
    "PATCH /api/issues/1001": makeIssue({ status: "in_review" }),
    "PATCH /api/issues/1002": makeIssue({ id: 1002, key: "US1002", status: "in_review" }),
  });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("right-click: Linear's items in order, with bare shortcut glyphs", () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  const menu = screen.getByRole("menu", { name: "Issue actions" });
  expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
    "StatusS", "PriorityP", "AssigneeA", "LabelsL", "Project⇧ P", "Estimate⇧ E", "Cycle⇧ C", "Mark as", "Copy", "Open in"]);
  expect(uiStore.getState().selectedId).toBe(1001);
});

test("a property submenu checks the current value and writes the choice", async () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Status/ }));
  const sub = screen.getByRole("menu", { name: "Status" });
  expect(within(sub).getByRole("menuitemcheckbox", { name: /In Progress/ })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(within(sub).getByRole("menuitemcheckbox", { name: /In Review/ }));
  expect(appStore.getState().issues[1001].status).toBe("in_review");
  expect(uiStore.getState().contextMenu).toBeNull();
});

test("on a multi-selection the menu acts on every selected issue", async () => {
  render(<RowMenu />);
  act(() => {
    uiStore.getState().toggleSelected(1001);
    uiStore.getState().toggleSelected(1002);
    uiStore.getState().openContextMenu(1002, 300, 200);
  });
  fireEvent.click(screen.getByRole("menuitem", { name: /^Status/ }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /In Review/ }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => i?.method === "PATCH")).toHaveLength(2));
});

test("Esc closes it before anything else", () => {
  render(<RowMenu />);
  act(() => uiStore.getState().openContextMenu(1001, 300, 200));
  act(() => uiStore.getState().closeTopOverlay());
  expect(screen.queryByRole("menu", { name: "Issue actions" })).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/palette/pickers.test.ts src/components/RowMenu.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Pickers v2**

In `web/src/palette/pickers.ts`:
- Import `Cycle` and `Project` from `../api/types`; `pickerRange` and `points` from `../components/format`.
- Extend `PickerOption` with:

```ts
  /** Number keycap (§18.9): status 1–5, priority 0–4. */
  keys?: string;
  /** Every target already has this value: shows the check. */
  current?: boolean;
  cycle?: Cycle;
  project?: Project;
```

- Replace `PICKER_PLACEHOLDER`:

```ts
export const PICKER_PLACEHOLDER: Record<Picker, string> = {
  status: "Change status…", priority: "Change priority to…", assignee: "Assign to…", labels: "Add labels…",
  project: "Move to project…", cycle: "Move to cycle…", estimate: "Set estimate to…",
};
```

- Add `const all = (targets: Issue[], test: (i: Issue) => boolean) => targets.length > 0 && targets.every(test);` above `pickerOptions`.
- Rewrite the cases:

```ts
    case "status":
      return STATUSES.map((s, n): PickerOption => ({ id: s, label: STATUS_LABEL[s], status: s, keys: String(n + 1),
        current: all(targets, (i) => i.status === s), apply: (i) => (i.status === s ? null : { status: s }) }));
    case "priority":
      return ([0, 1, 2, 3, 4] as Priority[]).map((p): PickerOption => ({ id: `p${p}`, label: PRIORITY_LABEL[p], priority: p, keys: String(p),
        current: all(targets, (i) => i.priority === p), apply: (i) => (i.priority === p ? null : { priority: p }) }));
```

  - **Assignee:** each option sets `current: all(targets, (i) => (i.assignee?.id ?? null) === (u?.id ?? null))`.
  - **Project:** each option sets `project: p` and `current: all(targets, (i) => i.project_id === p.id)`.
  - **Cycle:**

```ts
    case "cycle": {
      const now = Date.now();
      const cycles = Object.values(app.cycles)
        .filter((c) => teams.has(c.team_id) && Date.parse(c.end) >= now)
        .sort((a, b) => a.start.localeCompare(b.start));
      return [
        { id: "none", label: "No cycle", keys: "0", current: all(targets, (i) => i.cycle_id === null),
          apply: (i) => (i.cycle_id === null ? null : { cycle_id: null }) },
        ...cycles.map((c): PickerOption => ({
          id: `c${c.id}`, label: c.name, cycle: c, current: all(targets, (i) => i.cycle_id === c.id),
          hint: [teams.size > 1 ? app.teams[c.team_id]?.name : null, pickerRange(c), Date.parse(c.start) <= now ? "Current" : "Upcoming"]
            .filter(Boolean).join(" · "),
          apply: (i) => (i.team_id !== c.team_id || i.cycle_id === c.id ? null : { cycle_id: c.id }),
        })),
      ];
    }
```

  - **Estimate:**

```ts
    case "estimate": {
      const inUse = targets.map((t) => t.estimate).filter((e): e is number => e !== null && !ESTIMATES.includes(e));
      const values = [...new Set([...ESTIMATES, ...inUse])].sort((a, b) => a - b);
      return [
        { id: "none", label: "No estimate", current: all(targets, (i) => i.estimate === null),
          apply: (i) => (i.estimate === null ? null : { estimate: null }) },
        ...values.map((n): PickerOption => ({ id: `e${n}`, label: points(n), current: all(targets, (i) => i.estimate === n),
          apply: (i) => (i.estimate === n ? null : { estimate: n }) })),
      ];
    }
```

  - **Labels:** each option sets `current: all`, where `all` is the variable it already computes.

- Add at the end:

```ts
/** The writes one option makes over the targets; issues that already have the value are skipped. */
export function patchesFor(o: PickerOption, targets: Issue[]): { id: number; patch: IssuePatch }[] {
  return targets.flatMap((issue) => {
    const patch = o.apply(issue);
    return patch ? [{ id: issue.id, patch }] : [];
  });
}
```

In `web/src/palette/CommandPalette.tsx`, replace the inline `targets.flatMap(...)` in the picker's `onSelect` with `patchesFor(o, targets)`. Task 13 rewrites this file; the change here only keeps it compiling and correct.

Create `web/src/palette/optionIcon.tsx`:

```tsx
import type { ReactNode } from "react";
import { Avatar } from "../components/Avatar";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { labelColor } from "../components/ui";
import type { PickerOption } from "./pickers";

export function optionIcon(o: PickerOption, highlighted = false): ReactNode {
  if (o.status) return <StatusIcon status={o.status} />;
  if (o.priority !== undefined) return <PriorityIcon priority={o.priority} tone={highlighted ? "ink" : "color"} />;
  if (o.user !== undefined) return <Avatar user={o.user} />;
  if (o.cycle) return <CycleIcon cycle={o.cycle} />;
  if (o.project) return <ProjectIcon project={o.project} />;
  if (o.id.startsWith("l:")) return <span className="size-2 rounded-full" style={{ background: labelColor(o.id.slice(2)) }} />;
  if (o.id.startsWith("e") || (o.id === "none" && o.label === "No estimate")) return <Icon name="estimate" size={14} />;
  return null;
}
```

Create `web/src/palette/copy.ts`:

```ts
import type { Issue } from "../api/types";
import { appStore } from "../store";

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    appStore.getState().pushToast(`Copied ${what}`);
  } catch {
    appStore.getState().pushToast(`Couldn't copy ${what}`);
  }
}

export const issueUrl = (key: string) => `${window.location.origin}/issue/${key}`;
export const copyIssueIds = (xs: Issue[]) => copy(xs.map((i) => i.key).join(", "), xs.length > 1 ? "issue IDs" : "issue ID");
export const copyIssueUrls = (xs: Issue[]) => copy(xs.map((i) => issueUrl(i.key)).join("\n"), xs.length > 1 ? "issue URLs" : "issue URL");
export const copyIssueTitles = (xs: Issue[]) => copy(xs.map((i) => i.title).join("\n"), xs.length > 1 ? "issue titles" : "issue title");
```

In `web/src/keyboard/actions.ts`, the `copy-id` action now calls `copyIssueIds(ids.map((id) => app.issues[id]).filter(Boolean))`. This closes the follow-up about unhandled clipboard errors.

- [ ] **Step 4: The context menu**

In `web/src/store/ui.ts`:
- Add to `UiState`:

```ts
  /** The row context menu (§18.7), at the pointer, over these issues. */
  contextMenu: { x: number; y: number; ids: number[] } | null;
  openContextMenu(id: number, x: number, y: number): void;
  closeContextMenu(): void;
```

- Initialise `contextMenu: null`, and add it to `cleared`.
- Implement:

```ts
      openContextMenu(id, x, y) {
        const s = get();
        const ids = s.selectedIds.includes(id) ? s.selectedIds : [id];
        set({ contextMenu: { x, y, ids }, selectedId: id, palette: { open: false, picker: null, targetIds: [] }, menu: null });
      },
      closeContextMenu: () => set({ contextMenu: null }),
```

- In `closeTopOverlay`, add as the first branch: `if (s.contextMenu) set({ contextMenu: null }); else if (s.palette.open) …`.

Create `web/src/components/RowMenu.tsx`:

```tsx
import type { Issue, IssuePatch } from "../api/types";
import { copyIssueIds, copyIssueTitles, copyIssueUrls, issueUrl } from "../palette/copy";
import { optionIcon } from "../palette/optionIcon";
import { patchesFor, pickerOptions } from "../palette/pickers";
import { appStore, uiStore, useAppState, useUi } from "../store";
import type { AppState } from "../store/store";
import type { Picker } from "../store/ui";
import { Icon, type IconName } from "./icons";
import { Menu, type MenuEntry } from "./Menu";

const PROPS: [Picker, string, string, IconName][] = [
  ["status", "Status", "S", "status"], ["priority", "Priority", "P", "priority"], ["assignee", "Assignee", "A", "assign"],
  ["labels", "Labels", "L", "tag"], ["project", "Project", "⇧ P", "project"], ["estimate", "Estimate", "⇧ E", "estimate"],
  ["cycle", "Cycle", "⇧ C", "cycles"],
];

/** §18.7: Linear's row menu, limited to what Rally backs. Property submenus are the ⌘K pickers. */
export function rowMenuEntries(app: AppState, targets: Issue[]): MenuEntry[] {
  const write = (changes: { id: number; patch: IssuePatch }[]) => void appStore.getState().updateMany(changes);
  const blocked = targets.every((t) => t.blocked);
  return [
    ...PROPS.map(([picker, label, glyphs, icon]): MenuEntry => ({
      id: picker, label, glyphs, icon: <Icon name={icon} size={16} />, filterable: true, width: 240,
      items: pickerOptions(picker, app, targets).map((o) => ({
        id: o.id, label: o.label, hint: o.hint, keys: o.keys, checked: o.current ?? false, disabled: o.disabled,
        icon: optionIcon(o), onSelect: () => write(patchesFor(o, targets)),
      })),
    })),
    "divider",
    { id: "mark", label: "Mark as", icon: <Icon name="blocked" size={16} />, items: [
      { id: "blocked", label: "Blocked", checked: blocked, onSelect: () => write(targets.map((t) => ({ id: t.id, patch: { blocked: true } }))) },
      { id: "unblocked", label: "Unblocked", checked: targets.every((t) => !t.blocked),
        onSelect: () => write(targets.map((t) => ({ id: t.id, patch: { blocked: false } }))) },
    ] },
    "divider",
    { id: "copy", label: "Copy", icon: <Icon name="copy" size={16} />, items: [
      { id: "copy-id", label: "Copy issue ID", keys: "⌘ .", onSelect: () => void copyIssueIds(targets) },
      { id: "copy-url", label: "Copy issue URL", onSelect: () => void copyIssueUrls(targets) },
      { id: "copy-title", label: "Copy issue title", onSelect: () => void copyIssueTitles(targets) },
    ] },
    { id: "open", label: "Open in", icon: <Icon name="open" size={16} />, items: [
      { id: "open-page", label: "Open issue", keys: "Enter", onSelect: () => uiStore.getState().openIssue(targets[0].key) },
      { id: "open-tab", label: "Open in new tab", onSelect: () => void window.open(issueUrl(targets[0].key), "_blank", "noopener") },
    ] },
  ];
}

export function RowMenu() {
  const menu = useUi((u) => u.contextMenu);
  const app = useAppState();
  if (!menu) return null;
  const targets = menu.ids.map((id) => app.issues[id]).filter((i): i is Issue => Boolean(i));
  const close = () => uiStore.getState().closeContextMenu();
  if (!targets.length) return null;
  return (
    <div className="fixed inset-0 z-40" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 420) }}>
        <Menu label="Issue actions" width={179} entries={rowMenuEntries(app, targets)} onClose={close} />
      </div>
    </div>
  );
}
```

In `web/src/Overlays.tsx`, import and render `<RowMenu />` after `<Composer />`.

In `IssueRow.tsx` and in `BoardLayout.tsx`'s `Card`, add to the row or card element:

```tsx
      onContextMenu={(e) => { e.preventDefault(); ui.openContextMenu(issue.id, e.clientX, e.clientY); }}
```

The row's `role="option"` keeps the `aria-selected` behaviour.

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. `CommandPalette.test.tsx` finds the "Urgent" option by name. Task 13 gives items an `aria-label`. Until then the option's text is "Urgent1", so change that test's query to `{ name: /^Urgent/ }`.

- [ ] **Step 6: Visual parity check**

Right-click a row in Mira with cdp steps. Add a `rightclick:<x>,<y>` step to a copy of `cdp.mjs`, using `Input.dispatchMouseEvent` with `button: "right"`. Screenshot the menu, open its Status submenu, and screenshot again. Compare with `icons/context-menu--full.png` and inventory §6:
- panel width;
- item height;
- glyph style and position;
- dividers;
- submenu offset.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "Row context menu and pickers v2: Linear's order, checks on current values, number keys, Point wording"
```

---

### Task 12: Sidebar

**Files:**
- Modify: `web/src/components/Sidebar.tsx`, `web/src/store/ui.ts`
- Test: `web/src/components/Sidebar.test.tsx` (new), `web/src/App.test.tsx` (update queries only)

**Interfaces:**
- Consumes: `Icon`, `IconButton`, `Tile`, `MenuButton`.
- Produces: `uiStore.navCollapsed: string[]` (keys `"workspace"`, `"teams"`, `"team:<id>"`) and `toggleNav(key)`, persisted under `mira-nav-collapsed`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/Sidebar.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, serve } from "../test/fixtures";
import { Sidebar } from "./Sidebar";

beforeEach(async () => {
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  serve({ "GET /api/bootstrap": makeBootstrap() });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("the header: workspace tile and menu, search, and a compose button that opens the composer", () => {
  render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Create new issue" }));
  expect(uiStore.getState().composerOpen).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Demo Workspace menu" }));
  expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Settings", "Toggle theme", "Keyboard shortcuts"]);
});

test("no shortcut hints; sections and teams collapse and remember it", () => {
  const { container } = render(<Sidebar />);
  expect(container.querySelector("kbd")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  expect(screen.queryByRole("button", { name: "Initiatives" })).toBeNull();
  const teams = screen.getByRole("region", { name: "Your teams" });
  fireEvent.click(within(teams).getByRole("button", { name: "Data Services" }));
  expect(within(teams).getAllByRole("button", { name: "Issues" })).toHaveLength(1); // only AI/ML's children remain
  expect(JSON.parse(localStorage.getItem("mira-nav-collapsed")!)).toEqual(["workspace", "team:9001"]);
});

test("a team's … menu hides it", () => {
  render(<Sidebar />);
  fireEvent.click(screen.getAllByRole("button", { name: "Team menu" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Hide team" }));
  expect(uiStore.getState().hiddenTeamIds).toEqual([9001]);
});

test("the help menu at the bottom", () => {
  render(<Sidebar />);
  fireEvent.click(screen.getByRole("button", { name: "Open Help menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));
  expect(uiStore.getState().cheatsheetOpen).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/components/Sidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: UI store**

In `web/src/store/ui.ts`:
- Add `const NAV_KEY = "mira-nav-collapsed";`.
- Add `navCollapsed: string[]` and `toggleNav(key: string): void` to `UiState`.
- Initialise it from storage with a string version of `readIds`:

```ts
function readKeys(key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

- Implement `toggleNav` like `joinTeam`: compute the next list, write it with `writeIds(NAV_KEY, next as never)`, or with a string-typed twin of `writeIds`, then `set`. `writeIds` is typed for numbers, so generalise it to `writeJson(key: string, value: unknown)` and use that for all three keys.
- The theme `setItem` in `toggleTheme` also goes through `writeJson`-style try/catch. This closes a follow-up.

- [ ] **Step 4: Rewrite `web/src/components/Sidebar.tsx`**

```tsx
import { useMemo } from "react";
import type { Team } from "../api/types";
import type { Route, TeamTab } from "../route";
import { uiStore, useApp, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";
import { Icon, type IconName } from "./icons";
import { MenuButton, type MenuEntry } from "./Menu";
import { IconButton, Tile } from "./ui";

const item = "flex h-(--size-nav) items-center gap-1.5 rounded-control px-2 text-left font-medium transition-colors duration-150";
const cls = (on: boolean) => `${item} ${on ? "bg-selected text-ink-1" : "text-ink-3 hover:bg-sidebar-hover hover:text-ink-1"}`;
const ISSUE_TABS: TeamTab[] = ["active", "backlog", "all"];

function helpEntries(): MenuEntry[] {
  const ui = uiStore.getState();
  return [
    { id: "shortcuts", label: "Keyboard shortcuts", onSelect: () => ui.setCheatsheet(true) },
    { id: "theme", label: "Toggle theme", onSelect: () => ui.toggleTheme() },
    { id: "settings", label: "Settings", onSelect: () => ui.navigate({ name: "settings" }) },
  ];
}

function NavItem({ icon, label, on, onClick, indent = false }: { icon: IconName; label: string; on: boolean; onClick(): void; indent?: boolean }) {
  return (
    <button type="button" aria-current={on ? "page" : undefined} onClick={onClick}
      className={`${cls(on)} ${indent ? "ml-[19px] w-[201px] pl-1.5" : "w-full"}`}>
      <Icon name={icon} size={14} /><span className="truncate">{label}</span>
    </button>
  );
}

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const closed = useUi((u) => u.navCollapsed.includes(id));
  return (
    <section aria-label={label} className="mt-4">
      <button type="button" aria-expanded={!closed} onClick={() => uiStore.getState().toggleNav(id)}
        className="mb-0.5 flex h-7 items-center gap-1 rounded-control px-2 text-mini font-medium text-ink-3 hover:bg-sidebar-hover">
        {label}<Icon name="caret" size={12} className={`transition-transform duration-150 ${closed ? "-rotate-90" : ""}`} />
      </button>
      {!closed && children}
    </section>
  );
}

function TeamItem({ id, team, route }: { id: number; team: Team | undefined; route: Route }) {
  const closed = useUi((u) => u.navCollapsed.includes(`team:${id}`));
  const name = team?.name ?? `Team ${id}`;
  const here = route.name === "team" && route.teamId === id ? route.tab : null;
  const ui = uiStore.getState();
  const go = (tab: TeamTab) => () => ui.navigate({ name: "team", teamId: id, tab });
  return (
    <li>
      <div className="group/team relative flex items-center">
        <button type="button" aria-expanded={!closed} onClick={() => ui.toggleNav(`team:${id}`)} className={`${cls(false)} w-full gap-2 pl-[9px]`}>
          <Tile id={id} name={name} size={16} />
          <span className="truncate">{name}</span>
          <Icon name="caret" size={16} className={`text-ink-4 transition-transform duration-150 ${closed ? "-rotate-90" : ""}`} />
        </button>
        <span className="absolute right-1 hidden group-hover/team:block group-focus-within/team:block">
          <MenuButton label={`${name} menu`} align="right" width={160}
            entries={[{ id: "hide", label: "Hide team", onSelect: () => ui.hideTeam(id) }]}
            button={({ open, toggle }) => <IconButton size={24} label="Team menu" icon="more" aria-expanded={open} onClick={toggle} />} />
        </span>
      </div>
      {!closed && (
        <ul aria-label={`${name} views`} className="flex flex-col gap-px">
          <li><NavItem indent icon="issues" label="Issues" on={here !== null && ISSUE_TABS.includes(here)} onClick={go("active")} /></li>
          <li><NavItem indent icon="cycles" label="Cycles" on={here === "cycles"} onClick={go("cycles")} /></li>
          <li><NavItem indent icon="project" label="Projects" on={here === "projects"} onClick={go("projects")} /></li>
        </ul>
      )}
    </li>
  );
}

/** §18.8: workspace header with search and compose, My issues, Workspace, Your teams, and help at the bottom. */
export function Sidebar() {
  const meta = useApp((s) => s.meta);
  const yours = useApp((s) => s.yourTeamIds);
  const teams = useApp((s) => s.teams);
  const route = useUi((u) => u.route);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const ids = useMemo(() => sidebarTeamIds(yours, joined, hidden), [yours, joined, hidden]);
  const ui = uiStore.getState();
  const ws = meta?.workspace ?? { id: 0, name: "Mira" };
  return (
    <nav aria-label="Main" className="flex w-(--size-sidebar) shrink-0 flex-col overflow-y-auto px-3 pb-3 pt-4">
      <div className="mb-2 flex h-7 items-center gap-1">
        <MenuButton label="Workspace menu" width={200}
          entries={() => { const [shortcuts, theme, settings] = helpEntries(); return [settings, theme, shortcuts]; }}
          button={({ open, toggle }) => (
            <button type="button" aria-label={`${ws.name} menu`} aria-expanded={open} onClick={toggle}
              className="flex h-7 min-w-0 items-center gap-1.5 rounded-[10px] pl-[5px] pr-[9px] hover:bg-sidebar-hover">
              <Tile id={ws.id} name={ws.name} size={20} radius={8} />
              <span className="truncate font-[550] text-ink-1">{ws.name}</span>
              <Icon name="chevron" size={8} className="text-ink-3" />
            </button>
          )} />
        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Search workspace" icon="search" bordered={false} onClick={() => ui.openPalette()} />
          <IconButton label="Create new issue" icon="compose" className="!bg-panel !text-ink-1" onClick={() => ui.openComposer(null)} />
        </span>
      </div>
      <NavItem icon="myIssues" label="My issues" on={route.name === "my"} onClick={() => ui.navigate({ name: "my", tab: "assigned" })} />
      <Section id="workspace" label="Workspace">
        <NavItem icon="initiatives" label="Initiatives" on={route.name === "initiatives"} onClick={() => ui.navigate({ name: "initiatives" })} />
        <NavItem icon="project" label="Projects" on={route.name === "projects"} onClick={() => ui.navigate({ name: "projects" })} />
      </Section>
      <Section id="teams" label="Your teams">
        {ids.length === 0
          ? <p className="px-2 text-mini text-ink-3">No teams yet. Open one from ⌘K.</p>
          : <ul className="flex flex-col gap-px">{ids.map((id) => <TeamItem key={id} id={id} team={teams[id]} route={route} />)}</ul>}
      </Section>
      <div className="mt-auto flex items-center gap-1 pt-4">
        <MenuButton label="Help" width={200} side="above" entries={helpEntries}
          button={({ open, toggle }) => <IconButton size={24} label="Open Help menu" icon="help" aria-expanded={open} onClick={toggle} />} />
        {meta?.writeGuard === "demo" && (
          <span title="Only [DEMO] items can be changed" className="ml-auto rounded-full bg-hover px-2 py-0.5 text-mini text-ink-2">Demo mode</span>
        )}
      </div>
    </nav>
  );
}
```

The workspace menu lists Settings, Toggle theme, Keyboard shortcuts, in that order (§18.8). The help menu lists the same three in the opposite order.

The help button sits at the bottom of the sidebar, so its menu opens upward. In `web/src/components/Menu.tsx`, give `MenuButton` a `side` prop:

```tsx
export function MenuButton({ label, entries, button, placeholder, width, align = "left", side = "below" }: {
  label: string; entries: MenuEntry[] | (() => MenuEntry[]); button: (p: { open: boolean; toggle(): void }) => ReactNode;
  placeholder?: string; width?: number; align?: "left" | "right"; side?: "below" | "above";
}) {
```

Change its `Menu` className to:

```tsx
className={`absolute ${side === "above" ? "bottom-full mb-1" : "top-full mt-1"} ${align === "right" ? "right-0" : "left-0"}`}
```

Add to `web/src/components/Menu.test.tsx`:

```tsx
test("MenuButton can open above its button", () => {
  render(<MenuButton label="Help" side="above" entries={[{ id: "a", label: "A" }]}
    button={({ toggle }) => <button type="button" onClick={toggle}>Help</button>} />);
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  expect(screen.getByRole("menu", { name: "Help" }).className).toContain("bottom-full");
});
```

Add `web/src/components/Menu.tsx` and `Menu.test.tsx` to this task's files.

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. Update the sidebar queries in `App.test.tsx` and list them in the report. The smoke flow's `button name=/My issues/` and `region "Your teams" › button "Issues"` still match.

- [ ] **Step 6: Visual parity check**

Run: `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/team/<demo team id>/active /tmp/rea-research/v2cmp/t12-sidebar.png`, then crop the left 250px. Compare it with the sidebar in `inv/my-issues.png` and with `inv/sidebar-leaves.json` (inventory §7):
- **Header:** workspace tile size and radius, the name weight, the search and compose positions.
- **Items:** icon x 20 and label x 40.
- **Team rows:** tile x, caret placement.
- **Children:** icon x 37 and label x 51.
- **States:** the active child inset (201 wide) and the hover colour.

Tune `gap` and padding until they match, and record the final values.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "Sidebar in Linear's shape: workspace menu, search and compose, collapsing sections and teams, help menu"
```

---

### Task 13: ⌘K palette, pickers and keycaps

**Files:**
- Modify: `web/src/palette/CommandPalette.tsx`, `web/src/palette/commands.ts`, `web/src/components/Cheatsheet.tsx`, `web/src/keyboard/actions.ts` (I toggles), `web/src/store/ui.ts` (`setPaletteTargets`), `.claude/skills/verify-rally-poc/flows.py` (`palette`)
- Test: `web/src/palette/CommandPalette.test.tsx`, `web/src/palette/commands.test.ts`, `web/src/keyboard/actions.test.ts`

**Interfaces:**
- Consumes:
  - from `pickers.ts`: `pickerOptions`, `patchesFor`, `PICKER_PLACEHOLDER`;
  - `optionIcon`;
  - from `copy.ts`: `copyIssueIds`, `copyIssueUrls`, `copyIssueTitles`;
  - `Keys`, `Icon`, `ProjectIcon`, `Tile`, `StatusIcon`.
- Produces:
  - `Command { id; group: string | null; label; icon?: IconName; shortcut?: string; run() }`, where `group: null` is the unheaded contextual block.
  - `uiStore.setPaletteTargets(ids)`.
  - The `assign-me` action becomes a toggle: when every target is already yours, it un-assigns them.

- [ ] **Step 1: Write the failing tests**

Replace `web/src/palette/commands.test.ts` with:

```ts
import { beforeEach, expect, test } from "vitest";
import { appStore } from "../store";
import { makeBootstrap, makeIssue } from "../test/fixtures";
import { buildCommands } from "./commands";

beforeEach(() => appStore.setState({ ...appStore.getInitialState(), meta: { me: { id: 501, name: "Dana Demo" }, workspace: { id: 1, name: "W" },
  writeGuard: "demo", demoPrefix: "[DEMO] ", demoTag: "collabathon-demo", demoTeamId: 9001 } }, true));

test("contextual commands follow Linear's order, with no heading, and their keycaps", () => {
  const cmds = buildCommands({ targets: [makeIssue()], teams: [] }).filter((c) => c.group === null);
  expect(cmds.map((c) => [c.label, c.shortcut])).toEqual([
    ["Assign to…", "A"], ["Un-assign from me", "I"], ["Change status…", "S"], ["Change priority…", "P"], ["Move to project…", "⇧ P"],
    ["Add labels…", "L"], ["Change estimate…", "⇧ E"], ["Move to cycle…", "⇧ C"], ["Mark as blocked", undefined],
    ["Copy issue ID", "⌘ ."], ["Copy issue URL", undefined], ["Copy issue title", undefined], ["Open issue", "Enter"],
  ]);
  expect(cmds.every((c) => c.icon)).toBe(true);
});

test("Assign to me when it isn't yours; navigation and Mira's own commands keep their groups", () => {
  const cmds = buildCommands({ targets: [makeIssue({ assignee: null })], teams: makeBootstrap().teams });
  expect(cmds.find((c) => c.id === "assign-me")?.label).toBe("Assign to me");
  expect([...new Set(cmds.map((c) => c.group))]).toEqual([null, "Navigation", "Mira"]);
});
```

Replace `web/src/palette/CommandPalette.test.tsx` with:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { CommandPalette } from "./CommandPalette";

beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  serve({
    "GET /api/bootstrap": makeBootstrap(),
    "PATCH /api/issues/1001": makeIssue({ priority: 1 }),
    "GET /api/users": [{ id: 777, name: "Pat Person" }],
    "GET /api/search": { issues: [], teams: [], projects: [] },
  });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("no backdrop dimming; the context chip; no heading before typing; one keycap per key", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette(null, [1001]));
  expect(screen.getByText("US1001").closest("[data-context-chip]")).toHaveTextContent("US1001 ⋅ [DEMO] Example story");
  const project = await screen.findByRole("option", { name: "Move to project…" });
  expect([...project.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["⇧", "P"]);
  expect(document.querySelector("[cmdk-overlay]")?.className ?? "").not.toMatch(/bg-black/);
  expect(screen.queryByText("US1001", { selector: "[cmdk-group-heading]" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear context" }));
  expect(uiStore.getState().palette.targetIds).toEqual([]);
});

test("a picker checks the current value; a number key picks; the choice is written and the palette closes", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette("priority", [1001]));
  const high = await screen.findByRole("option", { name: "High" });
  expect(high.querySelector('[data-check]')).not.toBeNull();
  fireEvent.keyDown(screen.getByPlaceholderText("Change priority to…"), { key: "1" });
  expect(appStore.getState().issues[1001].priority).toBe(1);
  expect(uiStore.getState().palette.open).toBe(false);
});

test("typed queries show Quick results: projects first, then issues packed tight", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette());
  fireEvent.change(screen.getByPlaceholderText("Type a command or search…"), { target: { value: "feature" } });
  const group = await screen.findByRole("group", { name: 'Quick results for "feature"' });
  expect(within(group).getAllByRole("option")[0]).toHaveTextContent("Project›[DEMO] Feature A");
});

test("searching finds a cached issue and opens it", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette());
  fireEvent.change(screen.getByPlaceholderText("Type a command or search…"), { target: { value: "backlog one" } });
  fireEvent.click(await screen.findByRole("option", { name: /US1002/ }));
  expect(uiStore.getState().route).toEqual({ name: "issue", key: "US1002" });
});

test("the assignee picker searches every workspace user", async () => {
  render(<CommandPalette />);
  act(() => uiStore.getState().openPalette("assignee", [1001]));
  fireEvent.change(screen.getByPlaceholderText("Assign to…"), { target: { value: "pat" } });
  expect(await screen.findByRole("option", { name: "Pat Person" }, { timeout: 2000 })).toBeInTheDocument();
});
```

Add to `web/src/keyboard/actions.test.ts`:

```ts
test("I assigns to me, and un-assigns when it's already mine", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "PATCH /api/issues/1001": makeIssue({ assignee: null }) });
  ui().select(1001); // already Dana's (me)
  runAction("assign-me");
  expect(appStore.getState().issues[1001].assignee).toBeNull();
});
```

This also needs `makeIssue` in the imports.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/palette src/keyboard/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Commands**

Replace `web/src/palette/commands.ts` with:

```ts
import type { Issue, Team } from "../api/types";
import type { IconName } from "../components/icons";
import { appStore, uiStore } from "../store";
import type { Picker } from "../store/ui";
import { copyIssueIds, copyIssueTitles, copyIssueUrls } from "./copy";

export interface Command { id: string; group: string | null; label: string; icon?: IconName; shortcut?: string; run(): void }

const PICK: Record<Picker, [string, string, IconName]> = {
  assignee: ["Assign to…", "A", "assign"], status: ["Change status…", "S", "status"], priority: ["Change priority…", "P", "priority"],
  project: ["Move to project…", "⇧ P", "project"], labels: ["Add labels…", "L", "tag"], estimate: ["Change estimate…", "⇧ E", "estimate"],
  cycle: ["Move to cycle…", "⇧ C", "cycles"],
};

/** §18.9: Linear's contextual commands (no heading), then navigation, then Mira's own. */
export function buildCommands({ targets, teams }: { targets: Issue[]; teams: Team[] }): Command[] {
  const ui = uiStore.getState();
  const app = appStore.getState();
  const ids = targets.map((t) => t.id);
  const then = (fn: () => void) => () => {
    fn();
    uiStore.getState().closePalette();
  };
  const pick = (picker: Picker): Command => {
    const [label, shortcut, icon] = PICK[picker];
    return { id: `pick-${picker}`, group: null, label, shortcut, icon, run: () => ui.openPalette(picker, ids) };
  };
  const out: Command[] = [];
  if (targets.length) {
    const me = app.meta?.me.id;
    const mine = me !== undefined && targets.every((t) => t.assignee?.id === me);
    const blocked = targets.every((t) => t.blocked);
    out.push(
      pick("assignee"),
      { id: "assign-me", group: null, label: mine ? "Un-assign from me" : "Assign to me", shortcut: "I", icon: mine ? "unassign" : "assign",
        run: then(() => { if (me !== undefined) void app.updateIssues(ids, { assignee_id: mine ? null : me }); }) },
      pick("status"), pick("priority"), pick("project"), pick("labels"), pick("estimate"), pick("cycle"),
      { id: "toggle-blocked", group: null, label: blocked ? "Mark as unblocked" : "Mark as blocked", icon: "blocked",
        run: then(() => void app.updateIssues(ids, { blocked: !blocked })) },
      { id: "copy-id", group: null, label: "Copy issue ID", shortcut: "⌘ .", icon: "copy", run: then(() => void copyIssueIds(targets)) },
      { id: "copy-url", group: null, label: "Copy issue URL", icon: "link", run: then(() => void copyIssueUrls(targets)) },
      { id: "copy-title", group: null, label: "Copy issue title", icon: "copy", run: then(() => void copyIssueTitles(targets)) },
    );
    if (targets.length === 1) out.push({ id: "open", group: null, label: "Open issue", shortcut: "Enter", icon: "open", run: then(() => ui.openIssue(targets[0].key)) });
  }
  out.push(
    { id: "go-my", group: "Navigation", label: "Go to My issues", shortcut: "G M", icon: "myIssues", run: then(() => ui.navigate({ name: "my", tab: "assigned" })) },
    { id: "go-projects", group: "Navigation", label: "Go to Projects", shortcut: "G P", icon: "project", run: then(() => ui.navigate({ name: "projects" })) },
    { id: "go-initiatives", group: "Navigation", label: "Go to Initiatives", shortcut: "G N", icon: "initiatives", run: then(() => ui.navigate({ name: "initiatives" })) },
    ...teams.map((t): Command => ({ id: `go-team-${t.id}`, group: "Navigation", label: `Go to team ${t.name}`, icon: "team",
                                   run: then(() => ui.navigate({ name: "team", teamId: t.id, tab: "active" })) })),
    { id: "create", group: "Mira", label: "Create issue", shortcut: "C", icon: "compose", run: then(() => ui.openComposer(null)) },
    { id: "theme", group: "Mira", label: "Toggle theme", icon: "theme", run: then(() => ui.toggleTheme()) },
    { id: "shortcuts", group: "Mira", label: "Keyboard shortcuts", shortcut: "?", icon: "help", run: then(() => ui.setCheatsheet(true)) },
  );
  return out;
}
```

In `web/src/keyboard/actions.ts`, the `assign-me` branch becomes:

```ts
  if (action === "assign-me") {
    const me = app.meta?.me.id;
    if (me === undefined) return;
    const mine = ids.every((id) => app.issues[id]?.assignee?.id === me);
    void app.updateIssues(ids, { assignee_id: mine ? null : me });
    return;
  }
```

In `web/src/store/ui.ts`, add `setPaletteTargets(ids: number[]): void` with the implementation `set((s) => ({ palette: { ...s.palette, targetIds: ids } }))`.

- [ ] **Step 4: Palette**

Replace `web/src/palette/CommandPalette.tsx` with:

```tsx
import { Command } from "cmdk";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Issue, Project, SearchResult, Team } from "../api/types";
import { Icon, ProjectIcon } from "../components/icons";
import { StatusIcon } from "../components/StatusIcon";
import { Keys, Tile } from "../components/ui";
import { appStore, uiStore, useAppState, useUi } from "../store";
import { sidebarTeamIds } from "../store/ui";
import { buildCommands } from "./commands";
import { optionIcon } from "./optionIcon";
import { PICKER_PLACEHOLDER, patchesFor, pickerOptions, type PickerOption } from "./pickers";
import { searchIssues } from "./search";

const itemClass = "mx-0.5 flex h-(--size-palette-item) cursor-default items-center gap-3 rounded-control px-[18px] text-small text-ink-2 data-[selected=true]:bg-highlight data-[selected=true]:text-ink-1 data-[disabled=true]:opacity-50 [&[data-selected=true]_.icon]:text-ink-1";
const groupClass = "[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-[30px] [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:text-mini [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3";
const NO_RESULTS: SearchResult = { issues: [], teams: [], projects: [] };

/** §18.9: Linear's command menu. No dimming, a context chip, icons and one keycap per key, number-keyed pickers. */
export function CommandPalette() {
  const palette = useUi((u) => u.palette);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const app = useAppState();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SearchResult>(NO_RESULTS);
  const [labels, setLabels] = useState<string[]>([]);
  const targets = palette.targetIds.map((id) => app.issues[id]).filter((i): i is Issue => Boolean(i));
  const local = useMemo(() => searchIssues(app.issues, query), [app.issues, query]);
  const teams = useMemo(() => sidebarTeamIds(app.yourTeamIds, joined, hidden).map((id) => app.teams[id]).filter(Boolean),
    [app.yourTeamIds, app.teams, joined, hidden]);

  useEffect(() => {
    setQuery("");
    setRemote(NO_RESULTS);
    setLabels([]);
  }, [palette.open, palette.picker]);
  useEffect(() => { // Rally lookups the cache can't answer: issues, teams and projects, workspace people (D16), labels
    const text = query.trim();
    const s = appStore.getState();
    let job: (() => void) | null = null;
    if (palette.picker === "assignee" && text.length >= 2) job = () => void s.searchUsers(text);
    else if (palette.picker === "labels" && text) job = () => void s.searchLabels(text).then(setLabels);
    else if (!palette.picker && text.length >= 2) job = () => void s.searchRemote(text).then(setRemote);
    if (!job) return;
    const timer = setTimeout(job, 300);
    return () => clearTimeout(timer);
  }, [query, palette.picker]);

  if (!palette.open) return null; // follow-up: no re-render work while closed
  const ui = uiStore.getState();
  const close = () => ui.closePalette();
  const q = query.trim().toLowerCase();
  const options = palette.picker ? pickerOptions(palette.picker, app, targets, labels).filter((o) => o.label.toLowerCase().includes(q)) : [];
  const choose = (o: PickerOption) => {
    if (o.disabled) return;
    void appStore.getState().updateMany(patchesFor(o, targets));
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => { // §18.9: a number picks while the query is empty
    if (!palette.picker || query || !/^\d$/.test(e.key)) return;
    const o = options.find((x) => x.keys === e.key);
    if (o) {
      e.preventDefault();
      choose(o);
    }
  };

  let body;
  if (palette.picker) {
    body = options.map((o) => (
      <Command.Item key={o.id} value={o.id} aria-label={o.label} disabled={o.disabled} className={itemClass} onSelect={() => choose(o)}>
        <span aria-hidden className="icon flex w-4 justify-center text-ink-3">{optionIcon(o)}</span>
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {o.hint && <span className="text-mini text-ink-4">{o.hint}</span>}
        {o.current && <span data-check><Icon name="check" size={16} className="text-ink-1" /></span>}
        <Keys keys={o.keys} />
      </Command.Item>
    ));
  } else {
    const commands = buildCommands({ targets, teams }).filter((c) => c.label.toLowerCase().includes(q));
    const groups = [...new Set(commands.map((c) => c.group))];
    const issues = [...local, ...remote.issues.filter((r) => !local.some((l) => l.id === r.id))];
    const projects = q.length >= 2
      ? [...new Map([...Object.values(app.projects).filter((p) => p.name.toLowerCase().includes(q)), ...remote.projects].map((p) => [p.id, p])).values()].slice(0, 5)
      : [];
    const otherTeams = q.length >= 2 ? remote.teams.filter((t) => !teams.some((x) => x.id === t.id)) : [];
    const go = (fn: () => void) => () => { close(); fn(); };
    body = (
      <>
        {groups.map((g) => (
          <Command.Group key={g ?? "context"} heading={q ? undefined : g ?? undefined} className={groupClass}>
            {commands.filter((c) => c.group === g).map((c) => (
              <Command.Item key={c.id} value={c.id} aria-label={c.label} className={itemClass} onSelect={c.run}>
                <span aria-hidden className="icon flex w-4 justify-center text-ink-3">{c.icon && <Icon name={c.icon} size={16} />}</span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <Keys keys={c.shortcut} />
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        {q && (projects.length > 0 || otherTeams.length > 0 || issues.length > 0) && (
          <Command.Group heading={`Quick results for "${query.trim()}"`} className={groupClass}>
            {projects.map((p: Project) => (
              <Command.Item key={`p${p.id}`} value={`project-${p.id}`} className={itemClass} onSelect={go(() => ui.navigate({ name: "projects" }))}>
                <ProjectIcon project={p} size={16} /><span className="text-ink-3">Project</span><span className="text-ink-3">›</span><span className="truncate">{p.name}</span>
              </Command.Item>
            ))}
            {otherTeams.map((t: Team) => (
              <Command.Item key={`t${t.id}`} value={`team-${t.id}`} className={itemClass} onSelect={go(() => ui.navigate({ name: "team", teamId: t.id, tab: "active" }))}>
                <Tile id={t.id} name={t.name} size={16} /><span className="text-ink-3">Team</span><span className="text-ink-3">›</span><span className="truncate">{t.name}</span>
              </Command.Item>
            ))}
            {issues.map((issue) => (
              <Command.Item key={issue.id} value={`issue-${issue.id}`} className={itemClass} onSelect={go(() => ui.openIssue(issue.key))}>
                <StatusIcon status={issue.status} /><span className="shrink-0 text-ink-3">{issue.key}</span><span className="truncate">{issue.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </>
    );
  }

  const chip = targets.length === 1 ? targets[0] : null;
  return (
    <Command.Dialog open={palette.open} onOpenChange={(open) => !open && close()} label="Command menu" shouldFilter={false} onKeyDown={onKeyDown}
      overlayClassName="fixed inset-0 z-40"
      contentClassName="fixed left-1/2 top-[130px] z-50 w-(--size-palette) -translate-x-1/2 overflow-hidden rounded-palette border-[0.5px] border-line-menu bg-surface shadow-palette">
      {targets.length > 0 && (
        <div className="px-3 pt-3">
          <span data-context-chip className="inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-[10px] bg-highlight px-1.5 text-mini text-ink-2">
            {chip ? <><span className="font-medium">{chip.key}</span><span className="truncate">⋅ {chip.title}</span></> : `${targets.length} issues`}
            <button type="button" aria-label="Clear context" onClick={() => ui.setPaletteTargets([])} className="text-[11px] font-medium text-ink-3">⌫</button>
          </span>
        </div>
      )}
      <Command.Input value={query} onValueChange={setQuery}
        placeholder={palette.picker ? PICKER_PLACEHOLDER[palette.picker] : "Type a command or search…"}
        className="h-(--size-palette-input) w-full bg-transparent px-3 text-small font-normal text-ink-2 placeholder:text-ink-4" />
      <Command.List className="max-h-[420px] overflow-y-auto border-t-[0.5px] border-line-menu py-1">
        <Command.Empty className="px-3 py-6 text-center text-ink-3">No results</Command.Empty>
        {body}
      </Command.List>
    </Command.Dialog>
  );
}
```

The chip test expects the text "US1001 ⋅ [DEMO] Example story". The DOM gives `US1001⋅ [DEMO] Example story`, because the key and title are adjacent spans. Either put a space before the `⋅` (`{" "}⋅ {chip.title}`), or match with a regex in the test. Prefer the space, which matches Linear's rendering.

- [ ] **Step 5: Cheatsheet keycaps**

In `web/src/components/Cheatsheet.tsx`:
- Import `Keys`.
- Make the shortcut column `<dt><Keys keys={keys} /></dt>`. Drop `ml-auto` there with a wrapper: `<span className="flex">`.
- Rewrite `ROWS` with space-separated keys:

```ts
const ROWS: [string, string][] = [
  ["J K", "Move down / up"], ["Space", "Peek"], ["Enter", "Open"], ["X", "Select"], ["C", "Create issue"],
  ["S", "Status"], ["P", "Priority"], ["A", "Assign to…"], ["I", "Assign to me"], ["L", "Labels"],
  ["⇧ P", "Project"], ["⇧ C", "Cycle"], ["⇧ E", "Estimate"], ["F", "Filter"], ["⌘ B", "List / board"], ["⌘ K", "Command menu"],
  ["⌘ .", "Copy ID"], ["G M", "My issues"], ["G P", "Projects"], ["G N", "Initiatives"], ["?", "This list"], ["Esc", "Back / close"],
];
```

- [ ] **Step 6: Flows**

In `.claude/skills/verify-rally-poc/flows.py`'s `palette` flow:
- The context-chip regex becomes `re.compile(r"[·⋅] \[DEMO\] " + re.escape(DEMO_STORY))`.
- Picking a priority now uses the number key. Replace each `page.get_by_role("option", name=target, exact=True).click()` with `page.keyboard.press({"Urgent": "1", "High": "2", "Medium": "3", "Low": "4", "No priority": "0"}[target])`, and do the same for `original`.

The options' accessible names are their labels, so the option-click form would also work. The key press exercises §18.9.

- [ ] **Step 7: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 8: Visual parity check and live flow**

Run:
- `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/my/assigned /tmp/rea-research/v2cmp/t13-palette.png key:j key:Meta+k`
- then the same with `key:p` → `t13-priority.png`

Compare them with `inv/palette-ctx.png`, `inv/picker-priority.png` and `icons/palette--keycap-a.png` (inventory §8). Record:
- panel top and width;
- that there is no backdrop;
- the chip's size and radius;
- item height and icon x;
- keycap size, border and spacing;
- the check position.

Run: `.claude/skills/verify-rally-poc/rallypoc browser run palette`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src .claude/skills/verify-rally-poc/flows.py
git commit -m "⌘K in Linear's shape: no dimming, context chip, icons, keycaps, number-keyed pickers, Quick results"
```

---

### Task 14: Peek card (D32)

**Files:**
- Create: `web/src/issue/PeekCard.tsx`
- Delete: `web/src/issue/IssuePanel.tsx`
- Modify: `web/src/Overlays.tsx`, `.claude/skills/verify-rally-poc/flows.py` (`issue_peek`)
- Test: `web/src/issue/PeekCard.test.tsx` (new)

**Interfaces:**
- Consumes: `uiStore.peekId`, `CycleIcon`, `ProjectIcon`, `StatusIcon`, `PriorityIcon`, `Avatar`, `Icon`, `sanitize`.
- Produces: `PeekCard`, a read-only card at `role="complementary" aria-label="Issue preview"`. It reads only the cache (plan ruling 6).

- [ ] **Step 1: Write the failing test**

Create `web/src/issue/PeekCard.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { makeBootstrap, serve } from "../test/fixtures";
import { PeekCard } from "./PeekCard";

let fetchMock: ReturnType<typeof serve>;
beforeEach(async () => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  fetchMock = serve({ "GET /api/bootstrap": makeBootstrap() });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

test("Space shows a read-only card: key, title, status · priority · assignee, project · cycle · estimate, description", () => {
  render(<PeekCard />);
  act(() => uiStore.getState().openPeek(1001));
  const card = screen.getByRole("complementary", { name: "Issue preview" });
  for (const text of ["US1001", "[DEMO] Example story", "In Progress", "High", "Dana Demo", "[DEMO] Feature A", "PI 4 · Sprint 3", "5", "Hello"]) {
    expect(card).toHaveTextContent(text);
  }
  expect(card.querySelector("input, textarea, [contenteditable]")).toBeNull(); // read-only
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/issues/"))).toHaveLength(0); // cache only (ruling 6)
});

test("it follows the selection and closes with the peek", () => {
  render(<PeekCard />);
  act(() => uiStore.getState().openPeek(1001));
  act(() => uiStore.getState().openPeek(1002));
  expect(screen.getByRole("complementary", { name: "Issue preview" })).toHaveTextContent("[DEMO] Backlog one");
  expect(screen.getByRole("complementary", { name: "Issue preview" })).toHaveTextContent("No description");
  act(() => uiStore.getState().openPeek(null));
  expect(screen.queryByRole("complementary", { name: "Issue preview" })).toBeNull();
});
```

For the second test, give the 1002 fixture an empty description. In `makeBootstrap`, add `description: ""` to 1002's `makeIssue` overrides. No existing test reads 1002's description; confirm with `grep -rn "1002" web/src --include=*.test.*`.

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest --run src/issue/PeekCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `web/src/issue/PeekCard.tsx`**

```tsx
import { useMemo } from "react";
import { PRIORITY_LABEL, STATUS_LABEL } from "../api/types";
import { Avatar } from "../components/Avatar";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { sanitize } from "../editor/sanitize";
import { useApp, useUi } from "../store";

/** §18.9 peek: a read-only card top right, under the toolbar. The list stays live; J/K moves it, Enter opens, Esc/Space closes. */
export function PeekCard() {
  const id = useUi((u) => u.peekId);
  const issue = useApp((s) => (id === null ? undefined : s.issues[id]));
  const project = useApp((s) => (issue?.project_id ? s.projects[issue.project_id] : undefined));
  const cycle = useApp((s) => (issue?.cycle_id ? s.cycles[issue.cycle_id] : undefined));
  const html = useMemo(() => (issue?.description ? sanitize(issue.description) : ""), [issue?.description]);
  if (!issue) return null;
  const part = "flex min-w-0 items-center gap-1.5";
  return (
    <aside aria-label="Issue preview"
      className="fixed right-6 top-[88px] z-30 w-(--size-peek) rounded-palette border-[0.5px] border-line-menu bg-surface p-[25px] pt-4 shadow-palette">
      <div className="font-medium text-ink-3">{issue.key}</div>
      <h2 className="mt-1 text-[18px] font-medium leading-[26px] text-ink-1">{issue.title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-3">
        <span className={part}><StatusIcon status={issue.status} />{STATUS_LABEL[issue.status]}</span>
        <span className={part}><PriorityIcon priority={issue.priority} />{PRIORITY_LABEL[issue.priority]}</span>
        <span className={part}><Avatar user={issue.assignee} />{issue.assignee?.name ?? "Unassigned"}</span>
      </div>
      {(project || cycle || issue.estimate !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-3">
          {project && <span className={part}><ProjectIcon project={project} size={16} /><span className="truncate">{project.name}</span></span>}
          {cycle && <span className={part}><CycleIcon cycle={cycle} size={16} />{cycle.name}</span>}
          {issue.estimate !== null && <span className={part}><Icon name="estimate" size={14} />{issue.estimate}</span>}
        </div>
      )}
      {html
        ? <div className="prose-rally mt-4 line-clamp-[8] text-regular leading-[22.5px] text-ink-4" dangerouslySetInnerHTML={{ __html: html }} />
        : <p className="mt-4 text-regular text-ink-4">No description</p>}
    </aside>
  );
}
```

In `web/src/Overlays.tsx`, replace `IssuePanel` with `PeekCard`. Delete `web/src/issue/IssuePanel.tsx`.

`actions.ts` already moves the peek with J/K (`if (ui.peekId !== null) ui.openPeek(...)`), opens the page with Enter (`targets` includes `peekId`), and closes it with Esc (`closeTopOverlay`). Nothing changes there.

- [ ] **Step 4: Flow**

Replace `issue_peek` in `.claude/skills/verify-rally-poc/flows.py` with:

```python
@flow
def issue_peek(page: Page) -> None:
    """Space peeks the selected issue as a read-only card; J moves it with the selection; Esc closes."""
    page.goto(f"{WEB}/my/assigned")
    row = page.get_by_role("option", name=re.compile(PEEK_STORY))
    row.click()
    page.keyboard.press(" ")
    card = page.get_by_role("complementary", name="Issue preview")
    expect(card).to_contain_text(PEEK_STORY)
    expect(card.locator("input, textarea, [contenteditable]")).to_have_count(0)
    page.keyboard.press("j")
    expect(card).to_be_visible()
    page.keyboard.press("Escape")
    expect(card).to_be_hidden()
```

The sub-issue round trip that this flow used to do moves to `issue_page` in Task 16.

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass. Remove or adapt any App test that looked for "Open full page".

- [ ] **Step 6: Visual parity check and live flow**

Run: `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/my/assigned /tmp/rea-research/v2cmp/t14-peek.png key:j key:" "`. If `cdp.mjs` can't send a space, add a `space` step that sends `key: " "`, `code: "Space"`.

Compare it with `icons/peek--card.png` (inventory §9). Record:
- the card's x and y (right 24, top 88);
- its width and inset;
- the title size and weight;
- line spacing;
- the description colour and size.

Run: `.claude/skills/verify-rally-poc/rallypoc browser run issue-peek`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A web/src .claude/skills/verify-rally-poc/flows.py
git commit -m "Peek: Linear's read-only preview card in place of the editable side panel (D32)"
```

---

### Task 15: Issue page — header, pager, layout, title, properties, sub-issues

**Files:**
- Modify: `web/src/issue/IssuePage.tsx`, `web/src/issue/IssueDetail.tsx`, `web/src/issue/SubIssueList.tsx`, `web/src/keyboard/actions.ts` (J/K steps the page), `web/src/store/ui.ts` (`openIssue` takes options)
- Test: `web/src/issue/IssuePage.test.tsx`, `web/src/keyboard/actions.test.ts`

**Interfaces:**
- Consumes: `IconButton`, `MenuButton`, `Tile`, `Chip`, `labelColor`, `points`, `copy*`, `createSubIssue` (Task 2), `CycleIcon`, `ProjectIcon`.
- Produces:
  - `openIssue(key, opts?: { replace?: boolean })`.
  - The issue page breadcrumb shows the origin view, with a pager over `visibleIds`.
  - `IssueDetail` lays out a centred 805 column and a 400 properties column.
  - `SubIssueList({ issue, subs })`, with "Add sub-issues".

- [ ] **Step 1: Write the failing tests**

In `web/src/issue/IssuePage.test.tsx`:
- In the first test, keep the property button names, but check the order of the properties column:

```ts
  const props = screen.getByRole("complementary", { name: "Properties" });
  expect(within(props).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Properties", "Labels", "Project"]);
  expect(within(props).getAllByLabelText(/^(Status|Team|Priority|Assignee|Estimate|Cycle): /).map((e) => e.getAttribute("aria-label")))
    .toEqual(["Status: In Progress", "Team: Data Services", "Priority: High", "Assignee: Dana Demo", "Estimate: 5 Points", "Cycle: PI 4 · Sprint 3"]);
  expect(screen.getByRole("textbox", { name: "Issue title" }).tagName).toBe("TEXTAREA");
```

  The issue's team must resolve, so serve the bootstrap with `teams` and use `makeBootstrap({ issues: [] })`, which already includes teams.
- Replace the breadcrumb test with:

```ts
test("the breadcrumb is where you came from, with a pager through that view", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/issues/1002": { ...detail, issue: makeIssue({ id: 1002, key: "US1002", status: "backlog", cycle_id: null }) },
          "GET /api/issues/1001": detail });
  await appStore.getState().load();
  uiStore.getState().navigate({ name: "team", teamId: 9001, tab: "backlog" });
  uiStore.getState().setVisible([1001, 1002]);
  uiStore.getState().openIssue("US1002");
  render(<IssuePage issueKey="US1002" />);
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Navigate up" }));
  expect(uiStore.getState().route).toEqual({ name: "issue", key: "US1001" });
  fireEvent.click(screen.getByRole("button", { name: "Data Services › Backlog" }));
  expect(uiStore.getState().route).toEqual({ name: "team", teamId: 9001, tab: "backlog" });
});

test("Add sub-issues opens a title row; Enter creates it and keeps the row open", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap(), "GET /api/issues/1001": detail,
          "POST /api/issues/1001/sub-issues": [201, makeSubIssue({ id: 4100, key: "TA4100", title: "[DEMO] Step two" })] });
  await appStore.getState().load();
  render(<IssuePage issueKey="US1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Add sub-issues" }));
  const input = screen.getByRole("textbox", { name: "Sub-issue title" });
  fireEvent.change(input, { target: { value: "[DEMO] Step two" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText("[DEMO] Step two")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Sub-issue title" })).toHaveValue("");
});
```

Add `within` to the testing-library import.

Add to `web/src/keyboard/actions.test.ts`:

```ts
test("on an issue page J and K step through the view it was opened from", () => {
  ui().navigate({ name: "my", tab: "assigned" });
  ui().openIssue("US1201");
  runAction("down");
  expect(ui().route).toEqual({ name: "issue", key: "US1002" });
  runAction("up");
  runAction("up");
  expect(ui().route).toEqual({ name: "issue", key: "US1001" });
  expect(ui().backRoute).toEqual({ name: "my", tab: "assigned" });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/issue src/keyboard/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Stepping through issues**

In `web/src/store/ui.ts`, change `openIssue` to `openIssue(key: string, opts?: { replace?: boolean }): void`, implemented as `(key, opts) => get().navigate({ name: "issue", key: key.toUpperCase() }, opts)`.

In `web/src/keyboard/actions.ts`, in `move`, right after `if (!ids.length) return;`, add:

```ts
  if (ui.route.name === "issue") { // §18.10: J/K step through the view the page was opened from
    const key = ui.route.key;
    const app = appStore.getState();
    const current = Object.values(app.issues).find((i) => i.key === key)?.id;
    const at = current === undefined ? -1 : ids.indexOf(current);
    const next = at < 0 ? undefined : ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
    if (next !== undefined && next !== current && app.issues[next]) {
      ui.select(next);
      ui.openIssue(app.issues[next].key, { replace: true });
    }
    return;
  }
```

`moveTo` keeps `backRoute` when going from one issue page to another, and it already keeps the selection for issue routes. `visibleIds` survives the issue page because nothing clears it on unmount.

- [ ] **Step 4: Issue page header**

Replace the `return` of `web/src/issue/IssuePage.tsx`, and add the imports it needs:

```tsx
  const visible = useUi((u) => u.visibleIds);
  const teams = useApp((s) => s.teams);
  const index = id === null ? -1 : visible.indexOf(id);
  const fromView = index >= 0 && (back.name === "my" || back.name === "team");
  const TAB: Record<string, string> = { assigned: "Assigned", created: "Created", active: "Active", backlog: "Backlog", all: "All issues" };
  const origin = back.name === "my" ? "My issues" : back.name === "team" ? `${teams[back.teamId]?.name ?? "Team"} › ${TAB[back.tab] ?? back.tab}` : null;
  const ui = uiStore.getState();
  const step = (delta: number) => () => {
    const next = visible[index + delta];
    const nextKey = next === undefined ? undefined : appStore.getState().issues[next]?.key;
    if (nextKey) { ui.select(next); ui.openIssue(nextKey, { replace: true }); }
  };
  const one = issue ? [issue] : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-(--size-header) shrink-0 items-center gap-2 px-[18px] font-medium">
        {fromView && origin
          ? <button type="button" onClick={() => ui.navigate(back)} className="rounded-control text-ink-2 hover:text-ink-1">{origin}</button>
          : team && <span className="flex items-center gap-1.5 text-ink-2"><Tile id={team.id} name={team.name} size={16} />{team.name}</span>}
        <span aria-hidden className="text-ink-4">›</span>
        <span className="min-w-0 truncate text-ink-1">{issueKey}{issue && <span className="ml-2">{issue.title}</span>}</span>
        {issue && (
          <MenuButton label="Issue options" width={200}
            entries={[
              { id: "copy-id", label: "Copy issue ID", keys: "⌘ .", onSelect: () => void copyIssueIds(one) },
              { id: "copy-url", label: "Copy issue URL", onSelect: () => void copyIssueUrls(one) },
              { id: "copy-title", label: "Copy issue title", onSelect: () => void copyIssueTitles(one) },
              "divider",
              { id: "blocked", label: issue.blocked ? "Mark as unblocked" : "Mark as blocked",
                onSelect: () => void appStore.getState().updateIssue(issue.id, { blocked: !issue.blocked }) },
            ]}
            button={({ open, toggle }) => <IconButton size={24} label="Issue options" icon="more" aria-expanded={open} onClick={toggle} />} />
        )}
        {fromView && (
          <span className="ml-auto flex items-center gap-1 font-normal text-ink-4">
            {index + 1} / {visible.length}
            <IconButton size={24} label="Navigate down" icon="arrowDown" disabled={index >= visible.length - 1} onClick={step(1)} />
            <IconButton size={24} label="Navigate up" icon="arrowUp" disabled={index <= 0} onClick={step(-1)} />
          </span>
        )}
      </header>
      {issue && (
        <div className="flex h-11 shrink-0 items-center justify-end gap-1.5 px-2">
          <IconButton label="Copy issue URL" icon="link" onClick={() => void copyIssueUrls(one)} />
          <IconButton label="Copy issue ID" icon="copy" onClick={() => void copyIssueIds(one)} />
        </div>
      )}
      {missing === "not-found" ? <Empty>Issue {issueKey} not found.</Empty>
        : missing === "error" ? <Empty>Couldn't load {issueKey}.</Empty>
        : id === null ? <Empty>Loading {issueKey}…</Empty>
        : <IssueDetail id={id} />}
    </div>
  );
```

The imports are:
- `Tile` and `IconButton` from `../components/ui`;
- `MenuButton` from `../components/Menu`;
- the `copy*` helpers from `../palette/copy`.

Remove the `lucide-react` import.

- [ ] **Step 5: Issue detail layout and properties**

Replace `web/src/issue/IssueDetail.tsx` with:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PRIORITY_LABEL, STATUS_LABEL, type Issue } from "../api/types";
import { Avatar } from "../components/Avatar";
import { points } from "../components/format";
import { CycleIcon, Icon, ProjectIcon } from "../components/icons";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { Chip, labelColor, Tile } from "../components/ui";
import { Empty } from "../components/ViewFrame";
import { DescriptionEditor } from "../editor/DescriptionEditor";
import { appStore, uiStore, useAppState } from "../store";
import type { Picker } from "../store/ui";
import { SubIssueList } from "./SubIssueList";

const pill = "inline-flex h-7 max-w-full items-center gap-2 rounded-full px-1.5 font-medium text-ink-2 transition-colors duration-150";

function Pill({ label, onClick, unset = false, children }: { label: string; onClick?(): void; unset?: boolean; children: ReactNode }) {
  if (!onClick) return <span aria-label={label} className={pill}>{children}</span>;
  return <button type="button" aria-label={label} onClick={onClick} className={`${pill} hover:bg-hover ${unset ? "text-ink-3" : ""}`}>{children}</button>;
}

function PropGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-1 pl-2 font-medium text-ink-3">{label}</h3>
      <div className="flex flex-col items-start gap-0.5">{children}</div>
    </section>
  );
}

/** §18.10: 24/600, wraps; Enter saves, never a newline. */
function TitleField({ issue }: { issue: Issue }) {
  const [value, setValue] = useState(issue.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(issue.title), [issue.title]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const commit = () => {
    const next = value.trim().replace(/\s*\n\s*/g, " ");
    if (next && next !== issue.title) void appStore.getState().updateIssue(issue.id, { title: next });
    else setValue(issue.title);
  };
  return (
    <textarea ref={ref} aria-label="Issue title" rows={1} value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      className="mb-2 block w-full resize-none overflow-hidden bg-transparent text-title font-semibold leading-8 text-ink-1" />
  );
}

/** §18.10: the content column centred at 805, the properties column at 400 with no divider. */
export function IssueDetail({ id, children }: { id: number; children?: ReactNode }) {
  const app = useAppState();
  const issue = app.issues[id];
  useEffect(() => {
    void appStore.getState().loadIssueDetail(id);
  }, [id]);
  const subs = useMemo(() => Object.values(app.subIssues).filter((t) => t.issue_id === id).sort((a, b) => a.index - b.index), [app.subIssues, id]);
  if (!issue) return <Empty>Loading…</Empty>;
  const project = issue.project_id ? app.projects[issue.project_id] : undefined;
  const cycle = issue.cycle_id ? app.cycles[issue.cycle_id] : undefined;
  const team = app.teams[issue.team_id];
  const open = (picker: Picker) => () => uiStore.getState().openPalette(picker, [id]);
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="min-w-0 flex-1 px-8 pb-24 pt-4">
        <div className="mx-auto max-w-(--size-content) px-[7px]">
          <TitleField issue={issue} />
          <DescriptionEditor key={issue.id} html={issue.description}
            onSave={(html) => void appStore.getState().updateIssue(id, { description: html })} />
          <SubIssueList issue={issue} subs={subs} />
          {children}
        </div>
      </div>
      <aside aria-label="Properties" className="w-(--size-props) shrink-0 px-2 pt-4">
        <PropGroup label="Properties">
          <Pill label={`Status: ${STATUS_LABEL[issue.status]}`} onClick={open("status")}><StatusIcon status={issue.status} />{STATUS_LABEL[issue.status]}</Pill>
          <Pill label={`Team: ${team?.name ?? "Team"}`}><Tile id={issue.team_id} name={team?.name ?? "Team"} size={16} />{team?.name ?? "Team"}</Pill>
          <Pill label={`Priority: ${PRIORITY_LABEL[issue.priority]}`} onClick={open("priority")} unset={issue.priority === 0}>
            <PriorityIcon priority={issue.priority} />{issue.priority === 0 ? "Priority" : PRIORITY_LABEL[issue.priority]}
          </Pill>
          <Pill label={`Assignee: ${issue.assignee?.name ?? "No assignee"}`} onClick={open("assignee")} unset={!issue.assignee}>
            <Avatar user={issue.assignee} />{issue.assignee?.name ?? "Assignee"}
          </Pill>
          <Pill label={`Estimate: ${issue.estimate === null ? "No estimate" : points(issue.estimate)}`} onClick={open("estimate")} unset={issue.estimate === null}>
            <Icon name="estimate" size={16} />{issue.estimate === null ? "Estimate" : points(issue.estimate)}
          </Pill>
          <Pill label={`Cycle: ${cycle?.name ?? "No cycle"}`} onClick={open("cycle")} unset={!cycle}>
            {cycle ? <CycleIcon cycle={cycle} size={16} /> : <Icon name="cycles" size={16} />}{cycle?.name ?? "Cycle"}
          </Pill>
          {issue.blocked && (
            <span title={issue.blocked_reason || "Blocked"} className={`${pill} bg-blocked/10 text-blocked`}><Icon name="blocked" size={16} />Blocked</span>
          )}
        </PropGroup>
        <PropGroup label="Labels">
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-1.5">
              {issue.labels.map((l) => <Chip key={l} icon={<span aria-hidden className="size-2 rounded-full" style={{ background: labelColor(l) }} />}>{l}</Chip>)}
            </div>
          )}
          <Pill label="Add labels" onClick={open("labels")} unset><Icon name="tag" size={16} />Add label</Pill>
        </PropGroup>
        <PropGroup label="Project">
          <Pill label={`Project: ${project?.name ?? "No project"}`} onClick={open("project")} unset={!project}>
            <ProjectIcon project={project} size={16} /><span className="truncate">{project?.name ?? "Project"}</span>
          </Pill>
        </PropGroup>
      </aside>
    </div>
  );
}
```

The `children` slot is where Task 16 adds the activity feed: `IssuePage` renders `<IssueDetail id={id}><Activity issueId={id} /></IssueDetail>`.

The first page test looks for the buttons `Status: In Progress`, `Priority: High`, `Assignee: Dana Demo`, `Project: [DEMO] Feature A` and `Cycle: PI 4 · Sprint 3`. These names are unchanged. Team is a labelled `span`.

- [ ] **Step 6: Sub-issues with "Add sub-issues"**

Replace `web/src/issue/SubIssueList.tsx` with:

```tsx
import { useState } from "react";
import type { Issue, SubIssue } from "../api/types";
import { Icon } from "../components/icons";
import { SubIssueRow } from "../components/SubIssueRow";
import { appStore } from "../store";

/** §18.10: the sub-issue list with its done count, then "+ Add sub-issues" opening an inline title row. */
export function SubIssueList({ issue, subs }: { issue: Issue; subs: SubIssue[] }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const done = subs.filter((t) => t.status === "done").length;
  const create = async () => {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    const sub = await appStore.getState().createSubIssue(issue.id, text);
    setBusy(false);
    if (sub) setTitle("");
  };
  return (
    <section aria-label="Sub-issues" className="mt-6" style={{ "--id-width": "8.5ch" } as React.CSSProperties}>
      {subs.length > 0 && (
        <>
          <h3 className="mb-1 flex items-center gap-2 font-medium text-ink-2">Sub-issues <span className="font-normal text-ink-3">{done}/{subs.length}</span></h3>
          {subs.map((t) => <SubIssueRow key={t.id} sub={t} />)}
        </>
      )}
      {adding ? (
        <input autoFocus aria-label="Sub-issue title" placeholder="Sub-issue title" value={title} disabled={busy}
          onChange={(e) => setTitle(e.target.value)} onBlur={() => !title.trim() && setAdding(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void create(); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setTitle(""); setAdding(false); }
          }}
          className="mt-2 h-9 w-full rounded-control border-[0.5px] border-line-menu bg-surface px-3 text-ink-1 placeholder:text-ink-4" />
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-3 inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-mini font-medium text-ink-3 hover:bg-hover hover:text-ink-1">
          <Icon name="plus" size={12} />Add sub-issues
        </button>
      )}
    </section>
  );
}
```

Escape in the input must not leave the page. The global handler skips events whose `defaultPrevented` is set, so the input's `preventDefault` keeps Escape from triggering the page's own Esc.

- [ ] **Step 7: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 8: Visual parity check**

Open a demo issue. Click its row in My issues, then press Enter:
- `/tmp/rea-tools/shot.sh http://127.0.0.1:5173/my/assigned /tmp/rea-research/v2cmp/t15-page.png key:j key:Enter wait:1500`

Compare it with `inv/issue-page.png` and inventory §10. Record:
- the breadcrumb and pager;
- the row 2 buttons;
- the content column x and width (791 inside 805);
- the title size and weight;
- the properties column x and width (400);
- pill heights, padding and icon size;
- the section headings;
- the "Add sub-issues" pill.

- [ ] **Step 9: Commit**

```bash
git add web/src
git commit -m "Issue page in Linear's shape: origin breadcrumb and pager, wrapping title, 400px properties, Add sub-issues (D33)"
```

---

### Task 16: Activity feed and comment box

**Files:**
- Create: `web/src/issue/Activity.tsx`, `web/src/editor/plain.ts`
- Modify: `web/src/issue/IssuePage.tsx` (render `Activity` inside `IssueDetail`), `.claude/skills/verify-rally-poc/flows.py` (new `issue_page` flow)
- Test: `web/src/issue/Activity.test.tsx` (new), `web/src/editor/plain.test.ts` (new)

**Interfaces:**
- Consumes: `details`, `postComment` (Task 2), `ago`, `longDate`, `Avatar`, `IconButton`, `sanitize`.
- Produces:
  - `Activity({ issueId })`: the feed, then the comment box.
  - `textToHtml(text: string): string`: escaped paragraphs and line breaks.

- [ ] **Step 1: Write the failing tests**

Create `web/src/editor/plain.test.ts`:

```ts
import { expect, test } from "vitest";
import { textToHtml } from "./plain";

test("plain text becomes escaped paragraphs with line breaks", () => {
  expect(textToHtml("Hi <b>there</b>\nnext line\n\nNew para & more")).toBe("<p>Hi &lt;b&gt;there&lt;/b&gt;<br>next line</p><p>New para &amp; more</p>");
});
```

Create `web/src/issue/Activity.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { DANA, makeBootstrap, serve } from "../test/fixtures";
import { Activity } from "./Activity";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-16T12:00:00.000Z") });
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function load(routes: Record<string, unknown> = {}) {
  serve({ "GET /api/bootstrap": makeBootstrap(), ...routes });
  await appStore.getState().load();
  appStore.setState({ details: { 1001: {
    comments: [{ id: 91, author: DANA, html: "<p>Looks good</p>", created_at: "2026-10-16T09:00:00.000Z" }],
    activity: [
      { id: "81.0", author: DANA, text: "set estimate to 5", created_at: "2026-10-16T10:00:00.000Z" },
      { id: "80.0", author: DANA, text: "created the issue", created_at: "2026-10-16T08:00:00.000Z" },
    ] } } });
}

test("events and comments interleave oldest first, in Linear's words", async () => {
  await load();
  render(<Activity issueId={1001} />);
  expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items[0]).toContain("created the issue");
  expect(items[1]).toContain("Looks good");
  expect(items[2]).toContain("set estimate to 5");
  expect(items[2]).toContain("2h ago");
});

test("⌘↵ posts the comment at once; the box clears", async () => {
  await load({ "POST /api/issues/1001/comments": [201, { id: 92, author: DANA, html: "<p>Ship it</p>", created_at: "2026-10-16T12:00:00.000Z" }] });
  render(<Activity issueId={1001} />);
  const box = screen.getByRole("textbox", { name: "Leave a comment" });
  fireEvent.change(box, { target: { value: "Ship it" } });
  fireEvent.keyDown(box, { key: "Enter", metaKey: true });
  expect(screen.getByText("Ship it")).toBeInTheDocument();
  expect(box).toHaveValue("");
  await waitFor(() => expect(appStore.getState().details[1001].comments.map((c) => c.id)).toEqual([91, 92]));
});

test("a refused comment comes back into the box, with a toast", async () => {
  // Review focus 4.
  await load({ "POST /api/issues/1001/comments": [403, { error: "Demo mode: only [DEMO] issues can take comments" }] });
  render(<Activity issueId={1001} />);
  const box = screen.getByRole("textbox", { name: "Leave a comment" });
  fireEvent.change(box, { target: { value: "Not allowed" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit comment" })); });
  await waitFor(() => expect(box).toHaveValue("Not allowed"));
  expect(screen.queryByText("Not allowed", { selector: "p" })).toBeNull();
  expect(appStore.getState().toasts.map((t) => t.message)).toEqual(["Demo mode: only [DEMO] issues can take comments"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/issue/Activity.test.tsx src/editor/plain.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `web/src/editor/plain.ts`:

```ts
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A comment or composer description typed as plain text, as the HTML Rally stores (blank line = paragraph). */
export function textToHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
}
```

Create `web/src/issue/Activity.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Avatar } from "../components/Avatar";
import { ago, longDate } from "../components/format";
import { IconButton } from "../components/ui";
import { textToHtml } from "../editor/plain";
import { sanitize } from "../editor/sanitize";
import { appStore, useApp } from "../store";

const EMPTY = { comments: [], activity: [] };

function Time({ iso }: { iso: string }) {
  return <time dateTime={iso} title={longDate(iso)}>{ago(iso)}</time>;
}

/** §18.10: the comment box is a card; ⌘↵ or ↑ sends; a refused post puts the text back (plan ruling 8). */
function CommentBox({ issueId }: { issueId: number }) {
  const [text, setText] = useState("");
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    const ok = await appStore.getState().postComment(issueId, textToHtml(body));
    if (!ok) setText((current) => current || body);
  };
  return (
    <form aria-label="Comment" onSubmit={(e) => { e.preventDefault(); void send(); }}
      className="mt-4 rounded-control border-[0.5px] border-line-menu bg-surface px-4 py-3 shadow-comment">
      <textarea aria-label="Leave a comment" placeholder="Leave a comment…" rows={2} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
        className="block w-full resize-none bg-transparent text-regular font-normal text-ink-1 placeholder:text-ink-4" />
      <div className="flex justify-end">
        <IconButton type="submit" size={24} bordered label="Submit comment" icon="send" disabled={!text.trim()} />
      </div>
    </form>
  );
}

export function Activity({ issueId }: { issueId: number }) {
  const extras = useApp((s) => s.details[issueId] ?? EMPTY);
  const items = useMemo(() => [
    ...extras.activity.map((a) => ({ kind: "event" as const, key: `a${a.id}`, at: a.created_at, a })),
    ...extras.comments.map((c) => ({ kind: "comment" as const, key: `c${c.id}`, at: c.created_at, c })),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)), [extras]);
  return (
    <section aria-label="Activity" className="mt-8 border-t-[0.5px] border-line-menu pt-6">
      <h2 className="mb-4 text-regular font-semibold text-ink-1">Activity</h2>
      <ol className="flex flex-col gap-3">
        {items.map((item) => item.kind === "event" ? (
          <li key={item.key} className="flex items-center gap-2 pl-[3px] text-mini text-ink-3">
            <Avatar user={item.a.author} size={14} />
            <span className="font-medium text-ink-2">{item.a.author?.name ?? "Someone"}</span>
            <span>{item.a.text}</span><span aria-hidden>·</span><Time iso={item.a.created_at} />
          </li>
        ) : (
          <li key={item.key} className="rounded-control border-[0.5px] border-line-menu bg-surface px-4 py-3 shadow-comment">
            <div className="mb-1.5 flex items-center gap-2 text-mini">
              <Avatar user={item.c.author} />
              <span className="font-medium text-ink-1">{item.c.author?.name ?? "Someone"}</span>
              <span className="text-ink-3"><Time iso={item.c.created_at} /></span>
            </div>
            <div className="prose-rally text-regular text-ink-2" dangerouslySetInnerHTML={{ __html: sanitize(item.c.html) }} />
          </li>
        ))}
      </ol>
      <CommentBox issueId={issueId} />
    </section>
  );
}
```

In `web/src/issue/IssuePage.tsx`, render `<IssueDetail id={id}><Activity issueId={id} /></IssueDetail>`.

In the refusal test, the store removes the optimistic comment and toasts, and `CommentBox` restores the text. The optimistic text appears in a `<p>`, built by `textToHtml`, while pending. The test then checks that no `<p>` with the text remains.

- [ ] **Step 4: The issue-page flow**

Add to `.claude/skills/verify-rally-poc/flows.py`:

```python
@flow
def issue_page(page: Page) -> None:
    """Enter opens the page: activity in Linear's words, a sub-issue round trip, and a comment posted then removed."""
    page.goto(f"{WEB}/my/assigned")
    page.get_by_role("option", name=re.compile(PEEK_STORY)).click()
    page.keyboard.press("Enter")
    expect(page.get_by_role("heading", name="Activity")).to_be_visible()
    feed = page.get_by_role("region", name="Activity")
    assert not re.search(r"\b[A-Z]{3,}( [A-Z]+)* (changed|added|removed)\b|\[", feed.inner_text()), "Rally wording in the activity feed"
    task = page.get_by_role("checkbox", name=re.compile(r"^Complete TA")).first
    before = task.is_checked()
    is_sub = lambda r: "/api/sub-issues/" in r.url and r.request.method == "PATCH"
    with page.expect_response(is_sub) as first:
        task.click()
    assert first.value.status == 200, f"sub-issue PATCH returned {first.value.status}"
    with page.expect_response(is_sub):
        task.click()
    expect(task).to_be_checked(checked=before)
    box = page.get_by_role("textbox", name="Leave a comment")
    box.fill("[DEMO] flow comment")
    with page.expect_response(lambda r: r.url.endswith("/comments") and r.request.method == "POST") as posted:
        box.press("Meta+Enter")
    assert posted.value.status == 201, f"comment POST returned {posted.value.status}"
    expect(feed.get_by_text("[DEMO] flow comment")).to_be_visible()
    removed = httpx.delete(f"{WEB}/api/comments/{posted.value.json()['id']}", timeout=60)  # leave no residue
    assert removed.status_code == 200, f"comment DELETE returned {removed.status_code}"
```

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Visual parity check and live flow**

Screenshot a demo issue's page scrolled to its activity. Compare it with `inv/issue-page.png` and inventory §10 items 5–7. Record:
- the heading size;
- the event-line font, avatar size and gaps;
- the comment card's radius, border, shadow and padding;
- the placeholder;
- the send button.

Run: `.claude/skills/verify-rally-poc/rallypoc browser run issue-page`
Expected: PASS. The comment is posted on a `[DEMO]` story and deleted again.

- [ ] **Step 7: Commit**

```bash
git add web/src .claude/skills/verify-rally-poc/flows.py
git commit -m "Issue page: Activity in Linear's words with comments, and the comment card with optimistic posting"
```

---

### Task 17: Composer in Linear's shape

**Files:**
- Modify: `web/src/components/Composer.tsx`, `.claude/skills/verify-rally-poc/flows.py` (`composer`)
- Test: `web/src/components/Composer.test.tsx` (rewritten)

**Interfaces:**
- Consumes: `pickerOptions`, `PickerOption`, `optionIcon`, `MenuButton`, `Switch`, `Tile`, `IconButton`, `textToHtml`, `points`, `assignableProjects` and `lastProject` (kept from the current file), `composerPrefill`.
- Produces: `Composer` (same mount point). Each chip's picker is a dropdown under the chip, with the widths and placeholders in §18.11.

- [ ] **Step 1: Write the failing tests**

Replace `web/src/components/Composer.test.tsx` with:

```tsx
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Route } from "../route";
import { appStore, uiStore } from "../store";
import { makeBootstrap, makeIssue, makeProject, makeTeamLoad, serve } from "../test/fixtures";
import { Composer } from "./Composer";

let fetchMock: ReturnType<typeof serve>;
beforeEach(async () => {
  localStorage.clear();
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
  fetchMock = serve({
    "GET /api/bootstrap": makeBootstrap(),
    "GET /api/teams/9001": makeTeamLoad({ projects: [makeProject(), makeProject({ id: 203, key: "F203", name: "[DEMO] Feature B" })] }),
    "GET /api/teams/9002": makeTeamLoad({ team: { id: 9002, name: "AI/ML Solutions", level: "team", parent_id: null }, projects: [] }),
    "POST /api/issues": [201, makeIssue({ id: 1600, key: "US1600", title: "[DEMO] New one", status: "todo" })],
  });
  await appStore.getState().load();
});
afterEach(() => vi.unstubAllGlobals());

const openIn = (route: Route) => act(() => {
  uiStore.getState().navigate(route);
  uiStore.getState().setComposer(true);
});
const chip = (name: RegExp) => screen.getByRole("button", { name });

test("Linear's dialog: team chip, New issue, Close; title and description; seven chips; Create more and Create issue", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  const dialog = screen.getByRole("dialog", { name: "Create issue" });
  expect(dialog.className).toContain("rounded-(--radius-composer)");
  expect(within(dialog).getByRole("button", { name: "Set team" })).toHaveTextContent("Data Services");
  expect(within(dialog).getByText("New issue")).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox", { name: "Issue title" })).toHaveValue("[DEMO] ");
  expect(within(dialog).getByRole("textbox", { name: "Issue description" })).toHaveAttribute("placeholder", "Add description…");
  expect(within(dialog).getAllByRole("button", { name: /^(Change|Add to cycle)/ }).map((b) => b.getAttribute("aria-label")?.split(".")[0]))
    .toEqual(["Change status", "Change priority", "Change assignee", "Change project", "Change estimate", "Change labels", "Add to cycle"]);
  expect(chip(/^Change status/)).toHaveTextContent("Todo"); // inside Active (spec §8)
  expect(within(dialog).getByRole("switch", { name: "Create more" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
  await waitFor(() => expect(chip(/^Change project/)).toHaveTextContent("[DEMO] Feature A"));
});

test("a chip opens its picker under it; choosing sets the value; numbers pick", async () => {
  openIn({ name: "my", tab: "assigned" });
  render(<Composer />);
  expect(chip(/^Change assignee/)).toHaveTextContent("Dana Demo"); // you, from My issues
  fireEvent.click(chip(/^Change priority/));
  fireEvent.keyDown(screen.getByPlaceholderText("Set priority to…"), { key: "2" });
  expect(chip(/^Change priority/)).toHaveTextContent("High");
  fireEvent.click(chip(/^Change estimate/));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^5 Points/ }));
  expect(chip(/^Change estimate/)).toHaveTextContent("5 Points");
});

test("Create stays disabled until the title says more than the prefix", () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  const create = screen.getByRole("button", { name: "Create issue" });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Issue title"), { target: { value: "No prefix" } });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Issue title"), { target: { value: "[DEMO] Fine" } });
  expect(create).toBeEnabled();
});

test("⌘↵ creates with team, project, description and chips, and remembers the project", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  await waitFor(() => expect(chip(/^Change project/)).toHaveTextContent("[DEMO] Feature A"));
  fireEvent.change(screen.getByLabelText("Issue description"), { target: { value: "Line one" } });
  const title = screen.getByLabelText("Issue title");
  fireEvent.change(title, { target: { value: "[DEMO] New one" } });
  fireEvent.keyDown(title, { key: "Enter", metaKey: true });
  await waitFor(() => expect(uiStore.getState().composerOpen).toBe(false));
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toMatchObject({ team_id: 9001, project_id: 201, title: "[DEMO] New one", status: "todo",
    description: "<p>Line one</p>", position: "top" });
  expect(localStorage.getItem("mira-last-project:9001")).toBe("201");
});

test("Create more keeps it open with the same team and chips, and a fresh title", async () => {
  openIn({ name: "team", teamId: 9001, tab: "active" });
  render(<Composer />);
  await waitFor(() => expect(chip(/^Change project/)).toHaveTextContent("[DEMO] Feature A"));
  fireEvent.click(screen.getByRole("switch", { name: "Create more" }));
  fireEvent.change(screen.getByLabelText("Issue title"), { target: { value: "[DEMO] New one" } });
  fireEvent.click(screen.getByRole("button", { name: "Create issue" }));
  await waitFor(() => expect(screen.getByLabelText("Issue title")).toHaveValue("[DEMO] "));
  expect(uiStore.getState().composerOpen).toBe(true);
  expect(chip(/^Change project/)).toHaveTextContent("[DEMO] Feature A");
});

test("a team with no projects says so in Linear's words, and only once the team has loaded", async () => {
  act(() => {
    uiStore.getState().navigate({ name: "my", tab: "assigned" });
    uiStore.getState().openComposer({ teamId: 9002 });
  });
  render(<Composer />);
  expect(screen.queryByText(/no \[DEMO\] projects/)).toBeNull(); // not before the load answers
  expect(await screen.findByText("This team has no [DEMO] projects to add issues to.")).toBeInTheDocument();
  expect(screen.queryByText(/Rally/)).toBeNull();
});

test("a group's + opens the composer pre-filled", () => {
  act(() => {
    uiStore.getState().navigate({ name: "my", tab: "assigned" });
    uiStore.getState().openComposer({ teamId: 9001, status: "in_review", priority: 1 });
  });
  render(<Composer />);
  expect(chip(/^Change status/)).toHaveTextContent("In Review");
  expect(chip(/^Change priority/)).toHaveTextContent("Urgent");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest --run src/components/Composer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `web/src/components/Composer.tsx`**

Keep `lastProject`, `rememberProject` and `assignableProjects` exactly as they are. Replace the `Composer` function, and adjust the imports to:

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PRIORITY_LABEL, STATUS_LABEL, type Issue, type IssuePatch, type Priority, type Project, type Status } from "../api/types";
import { textToHtml } from "../editor/plain";
import { optionIcon } from "../palette/optionIcon";
import { pickerOptions } from "../palette/pickers";
import { appStore, uiStore, useAppState, useUi } from "../store";
import type { AppState } from "../store/store";
import type { Picker } from "../store/ui";
import { sidebarTeamIds } from "../store/ui";
import { Avatar } from "./Avatar";
import { points } from "./format";
import { CycleIcon, Icon, ProjectIcon } from "./icons";
import { MenuButton, type MenuEntry } from "./Menu";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";
import { IconButton, Switch, Tile } from "./ui";
```

Then:

```tsx
interface Draft { status: Status; priority: Priority; assignee_id: number | null; project_id: number | null; estimate: number | null; cycle_id: number | null; labels: string[] }

/** §18.11 chips: label, picker width and placeholder (inventory §11). */
const CHIPS: [Picker, string, number, string][] = [
  ["status", "Change status", 207, "Change status…"], ["priority", "Change priority", 207, "Set priority to…"],
  ["assignee", "Change assignee", 207, "Assign to…"], ["project", "Change project", 270, "Add to project…"],
  ["estimate", "Change estimate", 228, "Set estimate to…"], ["labels", "Change labels", 207, "Add labels…"],
  ["cycle", "Add to cycle", 278, "Add to cycle…"],
];

/** A stand-in issue so the composer reuses the ⌘K pickers: each option's patch is applied to the draft. */
function draftIssue(teamId: number, d: Draft, app: AppState): Issue {
  const me = app.meta?.me ?? null;
  return {
    id: -1, key: "NEW", kind: "story", title: "", status: d.status, priority: d.priority, team_id: teamId,
    assignee: d.assignee_id === null ? null : app.users[d.assignee_id] ?? (me && me.id === d.assignee_id ? me : { id: d.assignee_id, name: "" }),
    creator: me, cycle_id: d.cycle_id, project_id: d.project_id, estimate: d.estimate, labels: d.labels, blocked: false, blocked_reason: "",
    description: "", rank: "", created_at: "", updated_at: "", completed_at: null, sub_issue_count: 0,
  };
}

function chipFace(picker: Picker, d: Draft, app: AppState, project: Project | undefined): { icon: ReactNode; text: string | null } {
  switch (picker) {
    case "status": return { icon: <StatusIcon status={d.status} />, text: STATUS_LABEL[d.status] };
    case "priority": return { icon: <PriorityIcon priority={d.priority} size={14} />, text: d.priority ? PRIORITY_LABEL[d.priority] : null };
    case "assignee": {
      const u = d.assignee_id === null ? null : app.users[d.assignee_id] ?? app.meta?.me ?? null;
      return { icon: <Avatar user={u} size={14} />, text: u?.name ?? null };
    }
    case "project": return { icon: <ProjectIcon project={project} />, text: project?.name ?? null };
    case "estimate": return { icon: <Icon name="estimate" size={14} />, text: d.estimate === null ? null : points(d.estimate) };
    case "labels": return { icon: <Icon name="tag" size={14} />, text: d.labels.length ? d.labels.join(", ") : null };
    case "cycle": {
      const c = d.cycle_id === null ? undefined : app.cycles[d.cycle_id];
      return { icon: c ? <CycleIcon cycle={c} /> : <Icon name="cycles" size={14} />, text: c?.short_name ?? null };
    }
  }
}

const UNSET: Record<Picker, string> = { status: "Status", priority: "Priority", assignee: "Assignee", project: "Project", estimate: "Estimate", labels: "Labels", cycle: "" };

export function Composer() {
  const open = useUi((u) => u.composerOpen);
  const prefill = useUi((u) => u.composerPrefill);
  const route = useUi((u) => u.route);
  const joined = useUi((u) => u.joinedTeamIds);
  const hidden = useUi((u) => u.hiddenTeamIds);
  const app = useAppState();
  const meta = app.meta;
  const prefix = meta?.writeGuard === "demo" ? meta.demoPrefix : "";
  const teamIds = useMemo(() => sidebarTeamIds(app.yourTeamIds, joined, hidden), [app.yourTeamIds, joined, hidden]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [title, setTitle] = useState(prefix);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Draft>({ status: "backlog", priority: 0, assignee_id: null, project_id: null, estimate: null, cycle_id: null, labels: [] });
  const [chose, setChose] = useState(false); // the person picked a project themselves
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const here = route.name === "team" ? route.teamId : null;
    setTeamId(prefill?.teamId ?? here ?? (meta?.writeGuard === "demo" ? meta.demoTeamId : null) ?? teamIds[0] ?? null);
    setTitle(prefix);
    setDescription("");
    setChose(prefill?.project_id !== undefined);
    setDraft({
      status: prefill?.status ?? (route.name === "team" && route.tab === "active" ? "todo" : "backlog"), // Todo inside Active (§8)
      priority: prefill?.priority ?? 0,
      assignee_id: prefill && "assignee_id" in prefill ? prefill.assignee_id ?? null : route.name === "my" ? meta?.me.id ?? null : null,
      project_id: prefill?.project_id ?? null, estimate: null, cycle_id: prefill?.cycle_id ?? null,
      labels: meta?.writeGuard === "demo" ? [meta.demoTag] : [],
    });
  }, [open]); // reset each time the composer opens

  useEffect(() => { // the team's projects arrive with its load
    if (open && teamId !== null && !appStore.getState().teamState[teamId]) void appStore.getState().loadTeam(teamId);
  }, [open, teamId]);

  const projects = useMemo(() => assignableProjects(app, teamId), [app.projects, app.meta, teamId]);
  const projectIds = projects.map((p) => p.id).join(",");
  useEffect(() => { // default to the last project used for this team, until the person picks one
    if (!open || teamId === null) return;
    const last = lastProject(teamId);
    setDraft((d) => ({ ...d, project_id: chose && projects.some((p) => p.id === d.project_id) ? d.project_id
      : projects.some((p) => p.id === last) ? last : projects[0]?.id ?? null }));
  }, [open, teamId, projectIds, chose]);

  const close = () => uiStore.getState().setComposer(false);
  const canSubmit = teamId !== null && draft.project_id !== null && title.trim().length > prefix.trim().length && title.startsWith(prefix) && !busy;
  const submit = async () => {
    if (!canSubmit || teamId === null || draft.project_id === null) return;
    setBusy(true);
    const created = await appStore.getState().createIssue({
      team_id: teamId, title: title.trim(), project_id: draft.project_id, status: draft.status, priority: draft.priority,
      assignee_id: draft.assignee_id, estimate: draft.estimate, cycle_id: draft.cycle_id, labels: draft.labels,
      description: description.trim() ? textToHtml(description) : undefined, position: draft.status === "backlog" ? "bottom" : "top",
    });
    setBusy(false);
    if (!created) return;
    rememberProject(teamId, draft.project_id);
    uiStore.getState().select(created.id);
    if (more) { setTitle(prefix); setDescription(""); }
    else close();
  };

  const team = teamId !== null ? app.teams[teamId] : undefined;
  const teamName = team?.name ?? "Team";
  const loaded = teamId !== null && app.teamState[teamId]?.status === "ready";
  const draftAsIssue = teamId === null ? null : draftIssue(teamId, draft, app);
  const apply = (patch: IssuePatch | null) => {
    if (!patch) return;
    if ("project_id" in patch) setChose(true);
    setDraft((d) => ({ ...d, ...(patch as Partial<Draft>) }));
  };
  const teamEntries: MenuEntry[] = teamIds.map((id) => ({
    id: `t${id}`, label: app.teams[id]?.name ?? `Team ${id}`, checked: id === teamId,
    icon: <Tile id={id} name={app.teams[id]?.name ?? "Team"} size={14} />,
    onSelect: () => { setTeamId(id); setChose(false); setDraft((d) => ({ ...d, project_id: null, cycle_id: null })); },
  }));

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/[0.24]" />
        <Dialog.Content aria-describedby={undefined} aria-label="Create issue"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
          className="fixed left-1/2 top-[130px] z-50 w-(--size-composer) -translate-x-1/2 rounded-(--radius-composer) border-[0.5px] border-line-menu bg-surface shadow-palette">
          <Dialog.Title className="sr-only">Create issue</Dialog.Title>
          <div className="flex items-center gap-1.5 px-4 pt-3">
            <MenuButton label="Set team…" width={217} placeholder="Set team…" entries={teamEntries}
              button={({ open: o, toggle }) => (
                <button type="button" aria-label="Set team" aria-expanded={o} onClick={toggle}
                  className="inline-flex h-6 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu bg-surface px-2 text-mini text-ink-1">
                  {teamId !== null && <Tile id={teamId} name={teamName} size={14} />}{teamName}
                </button>
              )} />
            <span aria-hidden className="text-ink-3">›</span>
            <span className="text-small text-ink-2">New issue</span>
            <IconButton className="ml-auto" bordered={false} label="Close" icon="close" onClick={close} />
          </div>
          <textarea aria-label="Issue title" autoFocus rows={1} value={title} placeholder="Issue title" onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            className="mt-2 block w-full resize-none bg-transparent px-4 text-[18px] font-semibold leading-[28.8px] text-ink-1 placeholder:text-ink-4" />
          <textarea aria-label="Issue description" rows={3} value={description} placeholder="Add description…" onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block min-h-[76px] w-full resize-none bg-transparent px-4 text-regular font-normal leading-[22.5px] text-ink-2 placeholder:text-ink-4" />
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            {draftAsIssue && CHIPS.map(([picker, label, width, placeholder]) => {
              const face = chipFace(picker, draft, app, draft.project_id === null ? undefined : app.projects[draft.project_id]);
              const entries: MenuEntry[] = pickerOptions(picker, app, [draftAsIssue]).map((o) => ({
                id: o.id, label: o.label, hint: o.hint, keys: o.keys, checked: o.current ?? false, disabled: o.disabled,
                icon: optionIcon(o), onSelect: () => apply(o.apply(draftAsIssue)),
              }));
              const unsetNote = face.text === null ? `. No ${UNSET[picker].toLowerCase() || "cycle"} is selected` : "";
              return (
                <MenuButton key={picker} label={placeholder} width={width} placeholder={placeholder} entries={entries}
                  button={({ open: o, toggle }) => (
                    <button type="button" aria-label={`${label}${unsetNote}`} aria-expanded={o} onClick={toggle}
                      className={`inline-flex h-6 items-center gap-1.5 rounded-full border-[0.5px] border-line-menu bg-surface text-mini font-normal ${picker === "cycle" && face.text === null ? "w-8 justify-center" : "px-2"} ${face.text === null ? "text-ink-3" : "text-ink-2"}`}>
                      {face.icon}{face.text ?? (UNSET[picker] || null)}
                    </button>
                  )} />
              );
            })}
          </div>
          {loaded && projects.length === 0 && (
            <p className="px-4 pt-3 text-mini text-blocked">This team has no {prefix ? "[DEMO] " : "open "}projects to add issues to.</p>
          )}
          <div className="flex items-center justify-end gap-3 px-4 pb-3 pt-6">
            <label className="flex items-center gap-2 text-mini font-normal text-ink-3">
              <Switch label="Create more" checked={more} onChange={setMore} />Create more
            </label>
            <button type="button" disabled={!canSubmit} onClick={() => void submit()}
              className="h-7 rounded-full bg-accent px-3 text-mini font-medium text-accent-ink disabled:opacity-50">Create issue</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`assignableProjects` is still the composer's source of truth for which projects are allowed. `pickerOptions("project")` already disables non-`[DEMO]` projects in demo mode, and limits the list to the draft's team, so the two agree.

The draft's labels start with the demo tag in demo mode, because the guard requires it on new issues. The labels picker shows the tag as "Required in demo mode", and it can't be removed.

- [ ] **Step 4: Flow**

Replace the composer checks in `.claude/skills/verify-rally-poc/flows.py`:

```python
    title = page.get_by_label("Issue title")
    expect(title).to_have_value("[DEMO] ")
    expect(page.get_by_role("button", name=re.compile(r"^Change status"))).to_contain_text("Todo")
    expect(page.get_by_role("button", name=re.compile(r"^Change project"))).not_to_contain_text("Project")
```

- [ ] **Step 5: Run the web suite and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Visual parity check and live flow**

Run: `/tmp/rea-tools/shot.sh "http://127.0.0.1:5173/team/<demo team id>/active" /tmp/rea-research/v2cmp/t17-composer.png key:c wait:800`. Then open the Status and Cycle chips, and screenshot each.

Compare them with `inv/composer-*.png`, `icons/composer--{header,chips,footer}.png` and `icons/composer-picker--{status,cycle,team}.png` (inventory §11). Record:
- the dialog's x, y, width and radius, and the backdrop darkness;
- the header chip;
- the title and description fonts;
- chip height, gap and order;
- picker widths, placeholders and item order;
- the switch;
- the Create button's size and colour.

Run: `.claude/skills/verify-rally-poc/rallypoc browser run composer`
Expected: PASS. `rallypoc seed` later removes the created `[DEMO]` issue, as before.

- [ ] **Step 7: Commit**

```bash
git add web/src .claude/skills/verify-rally-poc/flows.py
git commit -m "Composer in Linear's shape: team chip, description, chip pickers under each chip, Create more (D33)"
```

---

### Task 18: Focus flow, clean-up, docs, and the whole-app parity sweep

**Files:**
- Modify: `.claude/skills/verify-rally-poc/flows.py` (new `focus` flow), `web/src/components/Toasts.tsx` (last `lucide-react` user), `web/package.json` and `web/package-lock.json` (remove `lucide-react`), `README.md`, `docs/superpowers/plans/2026-10-16-mira-v2-phase2-followups.md`
- Test: the full suites, plus `rallypoc check api` and `check ui`

**Interfaces:**
- Consumes: everything above.
- Produces: a branch where every Phase 2 screen matches Linear, verified end to end.

- [ ] **Step 1: The Focus flow**

Add to `.claude/skills/verify-rally-poc/flows.py`:

```python
@flow
def focus(page: Page) -> None:
    """Scenario 1 (D28): My issues in Focus order, each team's sprint its own group, with dates and points."""
    page.goto(f"{WEB}/my/assigned")
    listbox = page.get_by_role("listbox", name="My issues")
    expect(listbox.get_by_role("option").first).to_be_visible()
    labels = listbox.get_by_role("region").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    order = ["Urgent issues", "PI ", "Other active", "Backlog", "Completed"]
    ranks = [next(i for i, o in enumerate(order) if label.startswith(o) or (o == "PI " and " · " in label)) for label in labels]
    assert ranks == sorted(ranks), f"groups out of Focus order: {labels}"
    sprints = [l for l in labels if " · " in l]
    assert all(l.count(" · ") >= 2 for l in sprints), f"cycle groups must name their team: {sprints}"
    expect(page.get_by_role("button", name=re.compile(r"^Grouping: |^Display options"))).to_be_visible()
```

Add `"focus"` to whatever list `rallypoc check ui` runs; read the CLI to find it. Add `"issue-page"` there too, because Task 16 added that flow. Confirm both are registered with `rallypoc browser run all`.

- [ ] **Step 2: Remove lucide-react**

Run: `grep -rn "lucide-react" web/src`
Expected: only `web/src/components/Toasts.tsx`. Every other importer was rewritten. In `Toasts.tsx`, replace `<X size={14} />` with `<Icon name="close" size={14} />` and import `Icon` from `./icons`. Then:

Run: `cd web && npm uninstall lucide-react && grep -rn "lucide" src package.json`
Expected: no matches.

- [ ] **Step 3: Docs**

`README.md`:
- **Screens:** say My issues opens in Focus.
- **Board:** columns scroll on their own.
- **Space:** opens a preview card.
- **Issue page:** has activity, comments and "Add sub-issues".
- **Composer and right-click:** the composer's chips open pickers, and right-click opens Linear's row menu.
- **Shortcuts:** add ⌘B to the list.

In `docs/superpowers/plans/2026-10-16-mira-v2-phase2-followups.md`, strike through each item closed by this plan (ruling 10, plus the ones closed along the way), with "(closed in Phase 3)":
- the date before the assignee;
- labels truncated with no +N;
- double-clicking a row's checkbox;
- the composer's Rally wording, its "1 points" and its flash;
- the toolbar scrolling away;
- clipboard errors;
- the theme `setItem`;
- the palette re-rendering while closed;
- the peek's J/K detail loads.

- [ ] **Step 4: Full verification**

Run, from the repo root:
- `.claude/skills/verify-rally-poc/rallypoc test`
- `.claude/skills/verify-rally-poc/rallypoc stack down`
- `.claude/skills/verify-rally-poc/rallypoc stack up`
- `.claude/skills/verify-rally-poc/rallypoc check api`
- `.claude/skills/verify-rally-poc/rallypoc check ui`

Expected:
- pytest, vitest and typecheck all pass;
- `check api` passes every check;
- `check ui` passes every flow, including `focus` and `issue-page`.

Paste the summary lines into the report.

- [ ] **Step 5: Whole-app parity sweep**

For each screen and state below, take Mira's screenshot with `/tmp/rea-tools/shot.sh` and set it beside its Linear reference:

| Mira | Linear reference |
|---|---|
| My issues | `inv/my-issues.png` |
| team Active list | `inv/team-active.png` |
| board | `inv/team-board.png` |
| Display menu (My and team) | `icons/display-menu--full.png`, `icons/display-menu--team.png` |
| Filter menu, and its Status submenu | `icons/filter-menu--full.png`, `inv/filter-status.png` |
| right-click menu | `icons/context-menu--full.png` |
| sidebar | the sidebar in `inv/my-issues.png` |
| ⌘K, empty and with a query | `inv/palette-ctx.png`, `inv/palette-query.png` |
| status and priority pickers | `inv/picker-status.png`, `inv/picker-priority.png` |
| peek | `icons/peek--card.png` |
| issue page | `inv/issue-page.png` |
| composer and its Status and Cycle pickers | `inv/composer-*.png` |

Write `/tmp/rea-research/v2cmp/phase3-parity.md` with one line per screen: matches, or the remaining differences with measured values. Fix any difference that a measured value in spec §18 or the inventory settles, and commit those fixes before the final commit. Report anything you leave as is, and why.

- [ ] **Step 6: Commit**

```bash
git add -A .claude/skills/verify-rally-poc/flows.py web README.md docs/superpowers/plans/2026-10-16-mira-v2-phase2-followups.md
git commit -m "Phase 3: Focus flow, lucide removed, docs and follow-ups updated; parity sweep against Linear"
```

---

## Run it

```bash
.claude/skills/verify-rally-poc/rallypoc stack up     # proxy :8787 with WRITE_GUARD=demo, web :5173
open http://127.0.0.1:5173/my/assigned
```

## Test it

```bash
cd server && uv run pytest -q
cd web && npx vitest --run && npm run typecheck
.claude/skills/verify-rally-poc/rallypoc check api
.claude/skills/verify-rally-poc/rallypoc check ui
```

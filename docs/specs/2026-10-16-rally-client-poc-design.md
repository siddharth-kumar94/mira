# Rally client POC: design

Status: approved in conversation on 2026-10-16, section by section. This document is the written record for review before the implementation plan.

## 1. What it is

A web app that makes Rally feel like Linear: fast, keyboard-first, and calm to look at. Rally stays the record of truth. The app stores nothing of its own beyond a browser cache; every read comes from Rally and every write goes straight back to it.

It is a proof of concept for an MSK collabathon the week of 2026-10-19. The long-term goal is a tool every MSK Rally user could adopt, and eventually a replacement for Rally itself (§13). The POC proves the interface, not the platform.

**Success means** a live demo, on one laptop, against the real Rally workspace, where four workflows feel clearly better than Rally (§4):

1. My Work and the ⌘K command palette.
2. The story editor.
3. The iteration board.
4. Backlog grooming.

They are listed in build order. If time runs short, backlog grooming is cut first (D4).

## 2. Decisions and why

| # | Decision | Why |
|---|---|---|
| D1 | A React frontend plus a thin local FastAPI proxy, with an optimistic client cache. | Rally may not allow browser calls from other origins (CORS), the API key stays off the page, and the cache gives most of Linear's speed for a fraction of a sync engine's cost. |
| D2 | All Rally knowledge lives in one server adapter. The frontend sees only a small domain model. | Replacing Rally later (§13) then means replacing the server, not the UI. |
| D3 | Each user's own Rally API key, sent in the `ZSESSIONID` header. No SSO for the POC. | Rally's revision history credits the real person (verified, §6.4). The key also avoids Rally's write-token endpoint, which hangs under MSK's SSO (§6.4). |
| D4 | Build order: My Work + ⌘K, story editor, iteration board, backlog grooming. | Each step reuses the one before it. Ranking has the most Rally quirks, so it goes last and is the first cut. |
| D5 | A server-side write guard. In development mode it refuses any write to an item that is not in Team - Data Services or is not `[DEMO]`-labelled. | A UI bug can't reorder real backlogs. The guard sits on the server so no client path can skip it. |
| D6 | Linear's design language, our own implementation: Inter, Lucide icons, our own CSS and tokens. | Ideas, layout and measurements are fair to learn from. Linear's code, CSS and assets are not ours to copy. |
| D7 | Rally's vocabulary for data (US1234, Iteration, Feature, Defined → Accepted), Linear's conventions for interaction. | Users recognise their own work, and the interaction is where Linear is better. |
| D8 | Rank instead of priority. No priority column. | The team never fills in Rally's `c_Priority` field (0 of 200 stories, §6.3). |
| D9 | Labels come from Rally tags. | `c_Labels` is never used (0 of 200 stories). Tags are Rally's native mechanism. |
| D10 | Build on Rally's documented `v2.0` API, not the `v2.x` alias that Rally's own UI calls. | `v2.0` is the public contract. The queries we need work on it (§6.2). |
| D11 | Polling every 20 seconds with `LastUpdateDate`, and last write wins. | Rally has no push channel we can use. A conflict prompt isn't worth building for a demo. |
| D12 | A light theme first, dark theme second. | The light theme is what we measured (§5). Dark follows by mirroring Linear's light/dark background pairs. |
| D13 | Demo data hangs from its own `[DEMO]` portfolio chain: Program > Outcome > Capability > Features. | Rally requires a parent at every level. The chain touches nothing real, and cleanup deletes one tree (§10). |
| D14 | Verification uses `project-verify-kit` from `ygivenx/agent-skills`, and spec review uses `review-spec-page`. | The verify CLI and feature map keep each workflow honestly graded while we build. |

## 3. Architecture

```
Browser (React)                     Local server (FastAPI)              Rally
┌───────────────────────────┐       ┌──────────────────────────┐       ┌────────┐
│ Views: My Work · Board ·  │       │ Domain API  /api/...     │       │        │
│ Backlog · Issue editor ·  │ ─────▶├──────────────────────────┤ HTTPS │ WSAPI  │
│ ⌘K palette                │ JSON  │ Write guard              │ ─────▶│  v2.0  │
├───────────────────────────┤ ◀──── ├──────────────────────────┤       │        │
│ Store: normalized cache + │       │ Rally adapter            │       │        │
│ mutation queue + poller   │       │                          │       │        │
└───────────────────────────┘       └──────────────────────────┘       └────────┘
```

The system has four units, each with one job:

1. **Rally adapter (server).** The only code that knows WSAPI: `_ref` links, `ObjectID` versus `FormattedID`, `ScheduleState`, query syntax, project scoping, and `rankAbove`/`rankBelow`. It converts Rally objects to and from the domain model: `Issue` (story or defect), `Task`, `Feature`, `Iteration`, `User`.
2. **Domain API (server).** `GET /api/bootstrap`, `GET /api/changes?since=`, `GET /api/issues/:id`, `POST /api/issues`, `PATCH /api/issues/:id`, `POST /api/issues/:id/rank`, `PATCH /api/tasks/:id`. The responses are domain objects, never Rally-shaped ones.
3. **Write guard (server).** It checks every write before the adapter sends it (D5). A setting turns it off for real use.
4. **Client store (browser).** A normalized cache keyed by Rally `ObjectID`. Every view is a filter over it. A per-item mutation queue applies edits instantly and reconciles them with Rally's answer (§7). A poller merges remote changes.

**Stack:**
- **Frontend:** React, TypeScript, Vite, Tailwind, Radix primitives, `cmdk` for ⌘K, `dnd-kit` for drag and drop, TipTap for the editor, DOMPurify for HTML.
- **Proxy:** FastAPI with `httpx` (async). Configuration comes from `.env` (§9.3).

## 4. Screens and interaction

**Layout:** a 244px left sidebar with My Work, the current iteration, Backlog, and the demo features. The main area is an inset panel holding the active view.

1. **My Work.** Stories, defects and tasks you own in the current iteration, grouped by state. Each row shows a state glyph, the ID, title, feature, estimate and owner avatar.
2. **Issue view.** `Space` opens a side panel and `Enter` opens the full page. It has two columns:
   - **Left:** the title, the TipTap description editor, and the story's tasks as a checklist with to-do hours.
   - **Right:** a 240px properties column of pill buttons for state, owner, iteration, feature, estimate, tags and blocked.
3. **Iteration board.** The same data with a `List ⇄ Board` toggle. Columns are schedule states, and dragging a card changes its state. The header shows `iterationstatus` totals as a thin segmented bar of points by state, plus blocked.
4. **Backlog.** The team's unscheduled stories and defects in rank order.
   - Drag to rank.
   - `X` multi-selects, which brings up a bulk action bar: move to iteration, change state, set owner.
5. **⌘K.** Context first:
   - With an item selected, the palette opens with that item as a chip and lists its actions first, each showing its shortcut.
   - Navigation and search come after. Search runs on the cache first, then falls back to a Rally query.

**Keyboard (Linear's conventions):**

| Key | Action |
|---|---|
| `J` / `K` | Move down / up |
| `C` | Create |
| `S` | State |
| `A` | Owner |
| `I` | Iteration |
| `E` | Estimate |
| `T` | Tags |
| `X` | Select |
| `G` then `M` / `B` / `L` | Go to My Work / Board / Backlog |
| `?` | Shortcut cheatsheet |

**Not in the POC:** discussions, attachments, portfolio rollups, test cases.

## 5. Design tokens

These values were measured from Linear's live web app on 2026-10-16, through computed styles, and are restated as our own tokens (D6). Colors are in LCH. Every gray carries hue 282, a slight blue-violet tint.

| Token | Value | Used for |
|---|---|---|
| `font.family` | Inter Variable | Everything |
| `font.weight.normal` / `medium` | 450 / 500 | Body / labels, titles in rows |
| `font.size.mini` | 12px | Tabs, section labels, dates |
| `font.size.small` | 13px | Rows, sidebar items, palette items, properties |
| `font.size.regular` | 15px, line height 24px | Descriptions |
| `font.size.title` | 24px | Issue title on the issue page |
| `layout.sidebar` | 244px | Sidebar width |
| `layout.header` | 44px | View header |
| `layout.row` | 44px | List rows |
| `layout.groupHeader` | 36px | State group header |
| `layout.navItem` | 28px, radius 8px | Sidebar items |
| `layout.pill` | 28px, radius 9999px, padding 0 10px | View tabs, property buttons |
| `color.text.1` … `4` | L 10, 20, 39, 65 | Primary → quaternary text |
| `color.bg.app` | `#efeff0` (light), `#09090a` (dark) | Sidebar and app background |
| `color.bg.panel` | L 98 | Inset content panel |
| `color.border` | L 95, 88, 84 | Hairline, default, strong |
| `color.focus` | `#6d78d5`, 1px | Focus ring |
| `motion.quick` / `hover` / `regular` / `slow` | 100 / 150 / 250 / 350 ms | Toggles / color changes / panels / large moves |
| `motion.ease` | ease-out (quint) | All transitions |
| `palette` | 720px wide, radius 12px, 0.5px border, three layered soft shadows | ⌘K |
| `palette.input` / `item` | 40px / 46px | ⌘K |

## 6. Rally API mapping

### 6.1 Observed traffic

REA captures of Rally's own UI (iteration status, backlog, user stories) on 2026-10-16 showed three things:

- **One query for every list.** `artifact?types=HierarchicalRequirement,Defect,...` returns stories and defects together, ordered by `DragAndDropRank ASC`.
- **Iteration totals come precomputed.** `iterationstatus` returns summed defined, in-progress, completed and accepted points, blocked amounts, and task and defect counts.
- **View settings live in `preference` objects.** We ignore them and keep our own.

### 6.2 Queries we use (verified on v2.0)

| Need | Request |
|---|---|
| Current user | `GET /user` |
| Current iteration | `GET /iteration?project=P&projectScopeUp=false&projectScopeDown=false&query=((StartDate <= today) AND (EndDate >= today))` |
| My Work | `GET /artifact?types=HierarchicalRequirement,Defect&query=((Owner = currentuser) AND (Iteration = I))&order=DragAndDropRank ASC` |
| Backlog | `GET /artifact?types=HierarchicalRequirement,Defect&query=((Release = null) AND (Iteration = null))&order=DragAndDropRank ASC&pagesize=200` |
| Totals | `GET /iterationstatus?query=(Name = ...)` with `fetch=sum:[...]` |
| Changes | `GET /artifact?...&query=(LastUpdateDate > T)` |
| Update | `POST /hierarchicalrequirement/{oid}?fetch=...` with `{"HierarchicalRequirement": {...}}` |
| Rank | `POST /hierarchicalrequirement/{oid}?rankAbove={ref}` (or `rankBelow`, `rankTo=BOTTOM`) |

**Project scoping.** Rally scopes queries *up* the project tree by default. A plain current-iteration query returned five "2026 PI4 Sprint 3" iterations, belonging to MSK, Platforms, Platform - Data, ART - Data and Team - Data Services. Every query passes `projectScopeUp=false`, and iterations are filtered by project.

### 6.3 Team data facts (Team - Data Services, 200 stories sampled)

- **Schedule states:** Defined, In-Progress, Completed, Accepted.
- **Estimates:** Fibonacci only: 1, 2, 3, 5, 8.
- **Parents:** every story has a Feature parent.
- **Unused custom fields:** `c_Priority` and `c_Labels` are always empty. Other custom fields (`c_JiraStoryLink` and others) look like Jira migration leftovers and are not shown.
- **No acceptance-criteria field exists,** so the editor shows only the description.

### 6.4 Write behavior (verified with demo items)

- **State changes:** setting `ScheduleState` also updates `FlowState` and its date fields. We send only `ScheduleState`.
- **Ranking:** `rankAbove` placed US255364 directly above US255362.
- **New items go to the top of the backlog by default.** Creating from the bottom of the backlog sends `rankTo=BOTTOM`.
- **Attribution:** revision history credits the API key's owner.
- **Parents are required:**
  - A story needs a `UnifiedParent` (a Feature or a parent story).
  - A Feature needs a Capability.
  - A Capability needs an Outcome.
  - Story creation in the UI therefore requires choosing a feature.
- **Write tokens:** `security/authorize` never answers under an SSO browser session. API-key auth doesn't need it.

## 7. Data flow

**Loading.**
1. The client calls `GET /api/bootstrap`.
2. The proxy runs the §6.2 context, My Work, backlog and totals queries in parallel, at most four at a time, then fetches the features and tasks those results reference.
3. The client normalizes everything into the store.

**Writes.**
1. The edit is applied to the cache instantly.
2. The client sends `PATCH /api/issues/:id`.
3. The write guard checks the item.
4. The adapter writes to Rally.
5. Rally's returned object replaces the cached copy, so the server wins.
6. On failure, the edit rolls back and Rally's message is shown in a toast (§8).

Writes are queued per item, so they arrive in the order they were made.

**Ranking.** A drop sends the new neighbor, `{above: X}` or `{below: X}`. The returned `DragAndDropRank` re-sorts the list.

**Polling.**
- Every 20 seconds (D11), `GET /api/changes?since=T` returns items updated since the last poll, and the client merges them.
- Polling pauses while the tab is hidden.
- If an item changes in Rally while a local edit is in flight, the local edit settles first and then Rally's version wins.

**Descriptions.** Rally stores HTML. The client sanitizes it with DOMPurify on load, TipTap edits it, and HTML is written back.

## 8. Error handling

| Failure | What the user sees | Behavior |
|---|---|---|
| Rally rejects a write | Toast with Rally's message | Optimistic edit rolls back |
| Rally slow or unreachable (15s proxy timeout) | Toast with **Retry** for writes. For reads, a "Showing cached data" banner | Cache kept. Polling backs off 20s → 40s → 80s and stays silent until three failures in a row |
| Bad or missing API key (401) | Full-screen "Set `RALLY_API_KEY` in `.env`" | No requests until the proxy restarts |
| Write guard blocks an item (403) | "Development mode: only [DEMO] items can be edited" | Rolled back, and logged on the proxy |
| Proxy not running | "Local server isn't running" banner | Client retries every 5s |

## 9. Testing and verification

### 9.1 Verify kit

The first build task runs `project-verify-kit` on this repo. That produces `.claude/skills/verify-rally-poc` and `rally-poc-feature-map`, which provide:

- **`verify up` / `verify down`:** start and stop the proxy and the frontend.
- **`verify api`:**
  - Bootstrap returns the `[DEMO]` items.
  - The guard rejects a non-demo item.
  - A state change round-trips on US255359 and is reverted.
  - A rank change round-trips on the demo backlog and is reverted.
- **`verify ui`:** Playwright drives My Work, J/K, ⌘K, the board and the backlog, and saves a screenshot of each.
- **The feature map:** one area per workflow in §1. Nothing is graded working until it has been driven live.

### 9.2 Unit tests

- **Proxy:** `pytest` on the adapter's mapping, using recorded Rally JSON fixtures, with no live calls.
- **Client:** `vitest` on the store: optimistic apply, rollback, per-item ordering, rank merge.

### 9.3 Configuration

`.env` is never committed, and `.env.example` holds placeholders:

| Setting | Meaning |
|---|---|
| `RALLY_API_KEY` | The user's own full-access key |
| `RALLY_BASE_URL` | `https://rally1.rallydev.com/slm/webservice/v2.0` |
| `RALLY_WORKSPACE` | Workspace ObjectID |
| `RALLY_PROJECT` | Project ObjectID (Team - Data Services for the demo) |
| `WRITE_GUARD` | `demo` (default) or `off` |

## 10. Demo data

All demo data was created on 2026-10-16 in Team - Data Services by Siddharth Kumar. Every item has a `[DEMO]` name prefix, the `collabathon-demo` tag, and a "Safe to delete" description.

| Kind | IDs |
|---|---|
| Portfolio chain | P764 > O2657 > C12182, each "[DEMO] Collabathon Rally client POC" |
| Features | F43487 "[DEMO] Linear-style Rally client", F43488 "[DEMO] Rally sync reliability" |
| Current-sprint stories | US255357–US255361: Defined, In-Progress ×2, Completed, Accepted |
| Backlog stories | US255362–US255364 |
| Tasks | TA78005, TA78006 on US255357 |

The seeding script moves into `scripts/seed_demo.py`. It is idempotent: re-running reuses items by name. `scripts/cleanup_demo.py` deletes tasks, then stories, then features, then the chain, and only touches items that carry both the prefix and the tag.

## 11. Before launch: the demo checklist

1. The `[DEMO]` data is reset to its seeded states with `scripts/seed_demo.py`.
2. `verify api` and `verify ui` pass.
3. The feature map grades all demoed workflows as working.
4. The demo laptop has a full-access API key in `.env`, and `WRITE_GUARD=demo`.
5. After the collabathon, `scripts/cleanup_demo.py` has run and the API key has been deleted.

## 12. Assumptions made without the user (tweak these)

1. The demo runs on one laptop, with one user's API key. Multi-user hosting is out of scope.
2. "Current iteration" means the Data Services iteration whose date range contains today.
3. My Work shows stories and defects you own, plus tasks you own on other people's stories.
4. The backlog cap of 200 items is enough for Data Services.
5. A 20-second poll is fresh enough for a demo.
6. Story creation picks a feature from the demo features by default, because Rally requires a parent.
7. Rally's HTML descriptions survive a TipTap round-trip without losing formatting that matters.

## 13. Known gaps

- **No multi-user story.** Each user runs their own proxy with their own key. Hosting it for MSK needs SSO, key storage and a security review.
- **Last write wins.** Two people editing the same story within a poll window can overwrite each other without warning.
- **The proxy is Rally-shaped underneath.** Replacing Rally means a real sync engine and a database (approach 3 from the brainstorm). D2 keeps that door open but doesn't build it.
- **Ranking across pages is untested.** Ranking is verified within one page. Dragging between items more than 200 apart is not.
- **Defects and tasks are second-class.** They're shown and their state can change, but the editor is tuned for stories.
- **The dark theme is unmeasured.** It mirrors Linear's light/dark background pairs but wasn't measured from the live app.
- **Linear's board view wasn't captured.** Our board follows Linear's list conventions and the design tokens.

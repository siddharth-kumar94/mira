# Mira v2: Linear's model over Rally: design

Status: approved in conversation on 2026-10-16, section by section. This revises the organizing model of `docs/specs/2026-10-16-rally-client-poc-design.md` (v1).

Amended 2026-10-16 after the checkpoint (D28–D34, §18). The user asked for the interface to "look exactly like Linear". Every Phase 2 screen was compared side by side with Linear (screenshots and measurements). The issue page and composer were pulled forward from Phase 4 so they are built once, in Linear's shape.

Amended 2026-10-19 for Phase 4 (D35–D38, §19). Cycles, the PM layer and settings were measured against Linear the same way, and checked against the user's real Rally data.

What v1 got right and keeps:
- the local proxy
- the Rally adapter as the only code that knows Rally
- the write guard
- the optimistic client store
- the design tokens
- the verify kit

What v1 got wrong and replaces: it scoped everything to one Rally project, built Rally-shaped screens, and used Rally's words.

## 1. What this is and why v2

v1 built Linear's *interaction* (keyboard, palette, polish) on Rally's *structure*: one project, sprint-scoped Rally screens, and Rally vocabulary. When the user ran it against their real data, My Work showed only demo items, because their real work lives in two teams and v1 read one. v1 copied Rally when the goal was Linear.

v2 adopts **Linear's organizing model**: My issues across every team, teams as views over the work, one issue view with display options, cycles and projects as lenses, and initiatives for portfolio work. **Rally becomes storage only.** Every screen and word follows Linear. Rally is translated in the proxy and never shown.

Who it is for:
- **Individual contributors:** their work across teams, triage, and keyboard-first editing.
- **PMs:** portfolio progress, health, timeline and updates.

Success means the acceptance scenarios in §14 work on the user's real Rally data.

## 2. Decisions and why

| # | Decision | Why |
|---|---|---|
| D1 | Linear's information architecture: My issues across teams; Teams → Issues / Cycles / Projects; Workspace → Initiatives / Projects | The user chose "full Linear model". v1's single-project, Rally-shaped structure hid the user's own work |
| D2 | Linear vocabulary on screen (on-screen words superseded by D39): Issue, Team, Cycle, Project, Initiative, Label, Sub-issue, Estimate | The user chose Linear words. Rally terms appear only inside the proxy |
| D3 | Rally formatted IDs stay as issue IDs (US250068) | They are the real identifiers people use in Slack and email |
| D4 | Issue statuses map through Rally's Ready flag (§5.2) | Keeps status independent of cycles, as in Linear. Ready is unused today (0 of 450 open stories) |
| D5 | Priority is read and written: `c_Priority` for stories, `Priority` for defects | AI/ML Solutions already uses `c_Priority` on about 19% of open stories (Highest/High/Medium/Low) |
| D6 | Your teams = projects where you owned or created issues in the last 120 days, plus Rally memberships. Join or hide is stored in the browser | Rally memberships are stale. The user's only membership is a team they don't work in |
| D7 | Teams may be ART- or platform-level projects. Their views include child teams | PMs work at ART level |
| D8 | Cycles = the team's own iterations. Current, upcoming or past is decided by dates. ~~Same-named sprints merge in cross-team views~~ Amended by D29: each team's cycle is its own group in My issues; only ART views merge their child teams' same-named cycles (§9.2) | Iteration State is always "Planning". All teams share the PI4 Sprint 1–5 cadence |
| D9 | Projects = Rally Features. Initiatives = Capabilities (on-screen word: Capability, D39), grouped by their parent Outcome | Features have a lead, dates, rollups and span teams; capabilities group features, like Linear initiatives |
| D10 | Data loads per scope: bootstrap, then a team on first open, then the "All" tab a page at a time. Poll every 20s, with a full refresh of each loaded team every 5 minutes | AI/ML Solutions alone has 5,124 stories. Linear-style whole-workspace sync is not possible over WSAPI |
| D11 | The client sorts by Rally's rank strings and places items optimistically by computing a midpoint string | Verified: server rank order equals code-point order over 375, 1,000 and 171-item samples, including across teams |
| D12 | One issue-view component everywhere, with Linear's display options and filters. Dropping into a group sets that property. Dropping between rows ranks, but only when the view is ordered manually | This is Linear's model, and it replaces v1's three separate screens |
| D13 | The issue page has Activity (Rally revision history) and Comments (Rally discussion posts) | The user's choice. Linear's issue page is built around them |
| D14 | Rally connection happens in the app: a pasted key is validated and stored in `~/.config/mira/credentials` with mode 0600. `.env` is a fallback | The user's choice. It removes the need to edit `.env` |
| D15 | A story always needs a project. The composer requires one and defaults to the last one used for that team | Rally requires a parent (UnifiedParent) on stories |
| D16 | The assignee picker searches all workspace users by name | Verified: `/user` search works for a regular user (2,228 users) |
| D17 | Linear's shortcuts as shown in Linear's own palette (C, S, P, A, I, L, ⇧P, F, ⌘.). ⇧C (cycle) and ⇧E (estimate) are ours | v1 used I for iteration, which collides with Linear's "assign to me" |
| D18 | Every screen has a URL (history routing) | Refresh, back and sharing work as they do in Linear |
| D19 | The proxy retries Rally concurrency-conflict errors once | Seen live during seeding |
| D20 | The write guard is extended to every new write type. The verify CLI always runs the stack with the guard on | The user's `.env` now sets the guard off. Checks must never touch real work |
| D21 | Project and initiative updates are Rally discussion posts with a recognizable header and a machine footer (§9.3) | Linear records health through updates. Rally has no update object, but it does have discussions |
| D22 | Health: the latest update's health wins. With no update, the calculated health shows, marked "Auto" (§9.4) | The user's choice. PMs get a signal on day one, and it becomes Linear-accurate as people post |
| D23 | Projects and initiatives are read-only, apart from posting updates | Editing them is PO/RTE work done in Rally, and outside the POC |
| D24 | Timeline is read-only, with PIs (Rally Releases) as time bands | Linear lets you drag dates. Editing dates is outside the POC (D23) |
| D25 | The burn-up chart (Rally Lookback API) is a stretch goal: Phase 4's last task, and the first cut if time runs short | It's the single largest piece. Progress numbers cover the need without it. Confirmed by the user on 2026-10-19 |
| D26 | Inbox, saved Views, Triage, Canceled, Due dates, sub-grouping, relations other than Blocked, and moving issues between teams are all cut | Rally has nothing to back them, or the cost is high for a POC (§17) |
| D27 | The build pauses at a checkpoint after Phase 2 so the user can try it on real data | v1 had no user checkpoint before the full build, which is why this redo was needed |
| D28 | My issues defaults to Linear's **Focus** grouping with **Importance** ordering (§18.1) | Linear's My issues reads in order of cycle; the user called this out as "the nice thing with linear" |
| D29 | Same-named cycles of different teams stay separate groups in My issues, labelled with the team | The user's choice, "like Linear". Linear shows two "Cycle 2" groups for two teams |
| D30 | Cycle names are split in the proxy: `name` "PI 4 · Sprint 3" for headers and pickers, `short_name` "Sprint 3" for chips. The year is dropped; an IP sprint reads "IP Sprint". Other names pass through | The user's choice. Rally packs year, PI and sprint into one string. Built and verified live on 2026-10-16 |
| D31 | A team's Active tab is Todo, In Progress and In Review only. Done is under All, and in My issues' Completed group | The user's choice, "like Linear". Recent Done added a 128-issue group to AI/ML's Active |
| D32 | Space opens Linear's read-only preview card, not an editable side panel | The user's choice. Editing stays on keys, ⌘K and the full page |
| D33 | The issue page and composer are rebuilt in Linear's shape now (§18.10, §18.11), not in Phase 4 | The user's choice, so they are built once |
| D34 | Activity reads in Linear's words. The proxy translates Rally revision clauses and drops the ones Linear has no word for | Rally's revision text ("SCHEDULE STATE changed from [Defined] to [In-Progress]") is Rally vocabulary (D2) |
| D35 | In demo mode, posting a project or initiative update needs the `collabathon-demo` tag on that feature or capability as well as the `[DEMO] ` prefix and the demo team, the same rule as issues | The user's choice (2026-10-19). Phase 2 shipped the update guard with the prefix and team only |
| D36 | Calculated health stays (D22), drawn in Linear's health chip with "Auto" in the age slot ("At risk · Auto"). With no target date, the chip is Linear's "No updates" with a dashed circle | The user's choice (2026-10-19). Linear has no Auto health; this keeps D22's day-one signal in Linear's look |
| D37 | The timeline has Linear's "Show cycles" option plus Mira's own "Show PIs" switch, which draws Rally Releases as bands. Show PIs is off by default | The user's choice (2026-10-19). Linear has no PI bands; this revises D24's always-on bands |
| D38 | Projects and initiatives show Linear's priority only when the workspace has a priority field on portfolio items: a custom dropdown on Feature or Capability named Priority (`c_Priority` or similar) with §5.3's story values. When present it is shown and editable, the one exception to D23, under the D35 guard. When absent, the column, property, filter and picker are hidden | The user's choice (2026-10-19). Rally has no such field today (§19.1); a workspace admin can add one, and Mira picks it up without a code change |
| D39 | On screen, Mira uses Rally's words: Sprint (not Cycle), Feature (not Project), Capability (not Initiative), Story (not Issue), Task (not Sub-issue). Team, PI, Outcome, Label, Assignee, Estimate and Status are unchanged. "Initiative" is the level above Outcome (Rally's Program) and appears only as a grouping on the Capability list. Code identifiers, URLs and storage keys keep the Linear-model names. | The user's teams think in Rally's words, and Linear's words clash with them ("Project" is a team in Rally and a feature in Mira). The user's choice (2026-10-20) |

## 3. Grounding: facts this design rests on

These were all checked on 2026-10-16. Rally was queried read-only through the user's own API key. Linear was explored in the user's sandbox workspace, including sample PM data created there.

### 3.1 Rally

- **Teams:**
  - The user owns open work in **Team - AI/ML Solutions** (8 items) and **Team - Data Services** (10).
  - Their only Rally membership is a different team, so membership can't define "your teams".
- **Scale:**
  - AI/ML Solutions: 375 open stories (164 unscheduled), 5,124 in total, and 607 accepted in the last 90 days.
  - Data Services: 75 open, 1,276 in total.
- **Workflow:** both teams use ScheduleState Defined → In-Progress → Completed → Accepted. Their FlowStates mirror those exactly.
- **Iterations:** both teams have 2-week sprints named "2026 PI4 Sprint 1–5". Iteration State is always "Planning".
- **Releases:** "PI4 2026" runs Sep 10 – Dec 31. 190 of AI/ML's 200 open features are assigned to a release.
- **Fields in use:**

  | Field | Usage |
  |---|---|
  | `c_Priority` | Used by AI/ML (Highest 1, High 15, Medium 31, Low 24 of 375 open) |
  | Ready | Unused (0 of 450 open stories) |
  | Blocked | 6 open stories |
  | Tags | PI tags and team tags. 82 open AI/ML stories have at least one |
  | Discussions | 1 post in 90 days |
  | Estimates | Fibonacci, with occasional 0 and 50 |
  | Owners | 34 distinct owners on open AI/ML stories; 72 open stories are unowned |
  | Parent/child stories | None |

- **Required fields on create:**
  - Stories need FlowState, ScheduleState, **UnifiedParent**, Project and Name.
  - Defects need FlowState, ScheduleState, State, Project and Name.
  - Tasks need WorkProduct, TaskIndex, State and Name.
- **Portfolio:**
  - Features have Owner, PlannedStart/EndDate, PercentDoneByStoryPlanEstimate, leaf story counts and Release. Their states are Funnel, Analyzing, Roadmap, Next PI, Current PI, Measuring, Done.
  - Capabilities roll features up (one has 18 child features and is 88% done) and sit under Outcomes, which sit under Programs.
  - Features carry a risk flag, `c_UncommittedOpenRisk`.
  - **118 of AI/ML's 200 open features are past their planned end date.**
- **Rank:** DragAndDropRank strings are printable ASCII and unique. Server order equals code-point order (§2 D11).
- **Users:** `/user` is searchable by name for a regular user. The user has Editor rights on about 200 projects.

### 3.2 Linear (as observed)

- **My issues:** tabs Assigned / Created / Subscribed / Activity, across all teams.
- **Team:** Home, Issues (Active / Backlog / All issues), Cycles (current, upcoming), Projects, Views.
- **Display options:** List / Board; Grouping, Sub-grouping, Ordering; "Order completed by recency"; Show sub-issues; Show empty groups; display properties (ID, Status, Assignee, Creator, Priority, Project, Due date, Milestone, Labels, Links, Time in status, Created, Updated).
- **Filter (F):** Status, Assignee, Creator, Priority, Labels, Relations, Dates, Project, Project properties, Subscribers, Content, Links, Template.
- **Composer:** "Team › New issue", Issue title, Add description, pills Backlog / Priority / Assignee / Labels / more, attachment, Create more, Create issue.
- **Default team statuses:** Backlog, Todo, In Progress, Done, Canceled, Duplicate. "In Review" is a common custom addition.
- **Projects list:** Name with next milestone and date, Health, Priority, Lead, Target date, Issues, status with % and a sparkline. Display options add List / Board / **Timeline**, show closed projects, and a column chooser.
- **Project page:**
  - Overview: properties; the latest update card (health, text, and an automatic "since last update" change summary); milestones with % of points; a Progress panel (Scope, Started, Completed) with a burn-up.
  - Activity: a Comment / Update toggle with a health picker.
  - Issues.
- **Health:** set only by people, through updates. Projects with no update show an empty health circle.
- **Timeline:** bars from start to target, milestone diamonds, a today line, overruns past target shown as red dashes, Year zoom, Today button.
- **Initiatives:**
  - Switched on in settings.
  - List tabs: Active / Planned / All.
  - Columns: Status, Priority, Owner, Target, Projects done/total, Health, and active-project health dots.
  - The page has an update card that lists projects at risk.
  - Nesting initiatives is an Enterprise-plan feature.
- **Cycle page side panel:** Capacity, Days to start, Scope, broken down by Assignees / Labels / Priority / Projects / Teams.
- **Palette shortcuts:** A assign, I assign to me, S status, P priority, ⇧P add to project, L labels, ⇧D due date, ⌘. copy ID.

## 4. Information architecture

**Sidebar:**
- Workspace header (Rally workspace name) and a search button.
- **My issues.**
- **Workspace:** Initiatives, Projects.
- **Your teams:** one entry per team, each expanding to **Issues · Cycles · Projects**.
- Bottom: Settings, and a "Demo mode" chip whenever the write guard is on.

**What each issue tab contains:**

| View | Contents |
|---|---|
| My issues › Assigned | Issues and sub-issues assigned to you, not Done, plus Done within the "Completed issues" window (§18.1). Workspace-wide |
| My issues › Created | The same rule, for issues you created |
| Team › Issues › Active | Todo, In Progress, In Review (D31) |
| Team › Issues › Backlog | Backlog status |
| Team › Issues › All | Everything, a page at a time |
| Team › Cycles | Current, upcoming and previous cycles. A cycle opens to its issue view and side panel |
| Team › Projects, Workspace › Projects | The projects list (§9) |
| Workspace › Initiatives | The initiatives list (§9) |

## 5. Domain model and Rally mapping

The client sees only these shapes. The adapter in the proxy translates to and from Rally (v1's D2 still holds).

### 5.1 Entities

| Entity | Fields |
|---|---|
| User | id, name |
| Team | id, name (with "Team - " removed), level (team or ART), parent id |
| Cycle | id, team id, name, short name (D30), start, end. When: current, upcoming or past, by date |
| Project | id, key (F-number), name, status name, status category, lead, start, target, progress, issue counts, PI, initiative id, health, latest update |
| Initiative | id, key, name, status, owner, target, progress, project counts, group (outcome), health, latest update |
| Issue | id, key, kind (story or defect), title, status, priority, assignee, creator, team, cycle, project, estimate, labels, blocked, blocked reason, description, rank, created, updated, completed, sub-issue counts |
| Sub-issue | id, key, title, status, assignee, issue id, hours |
| Comment | id, author, html, created |
| Activity | id, author, text, created |
| Update | id, author, health, html, created, progress then, target then |

### 5.2 Issue status

**Reading**

| Rally | Status |
|---|---|
| Defined, Ready off, no iteration | Backlog |
| Defined, and Ready on or in an iteration | Todo |
| In-Progress | In Progress |
| Completed | In Review |
| Accepted | Done |

**Writing**

| Chosen status | Rally write |
|---|---|
| Backlog | ScheduleState Defined, Ready off, Iteration cleared |
| Todo | ScheduleState Defined, Ready on, Iteration unchanged |
| In Progress | In-Progress |
| In Review | Completed |
| Done | Accepted |

Every choice is reversible, and the status shown always equals the one chosen. Adding a Backlog issue to a cycle makes it Todo, and removing a cycle from a Todo issue whose Ready flag is off makes it Backlog.

**Sub-issues:** Defined → Todo, In-Progress → In Progress, Completed → Done.

### 5.3 Priority

| Linear | Story `c_Priority` | Defect `Priority` |
|---|---|---|
| Urgent | Highest | Resolve Immediately |
| High | High | High Attention |
| Medium | Medium | Normal |
| Low | Low | Low |
| No priority | empty | empty |

An unrecognized value displays as No priority and is never written unless the user changes the priority.

### 5.4 Other mappings

| Linear | Rally |
|---|---|
| Assignee / Creator | Owner / CreatedBy |
| Team | Project (a team, or an ART/platform with its child teams) |
| Cycle | Iteration in that project |
| Project | Feature (`Feature` ancestor, else `PortfolioItem`) |
| Initiative (group) | Capability (Outcome) |
| Project status | Feature State shown under its own name, in a Linear category: Funnel and Analyzing → Backlog; Roadmap and Next PI → Planned; Current PI and Measuring → Started; Done → Completed |
| Initiative status | Capability State: Done → Completed; Developing and later → Active; earlier → Planned |
| Label | Tag |
| Estimate | PlanEstimate (points) |
| Blocked | Blocked + BlockedReason |
| Sub-issue | Task |
| Comment | ConversationPost on the issue |
| Activity | RevisionHistory revisions |
| PI | Release |

### 5.5 Rank

- `rank` is DragAndDropRank. Views sort it as a string.
- A drop computes a temporary key strictly between the two neighbors (printable ASCII midpoint). The server's returned rank then replaces it.
- Writes use `rankAbove` / `rankBelow`, or `rankTo=BOTTOM` on create.

## 6. Proxy API and loading

### 6.1 Session

| Route | Behavior |
|---|---|
| `GET /api/session` | Returns `{connected, me, workspace, write_guard}`. Makes no Rally call when no key is set |
| `POST /api/session {api_key}` | Validates the key with `GET /user`, writes `~/.config/mira/credentials` (mode 0600), and swaps the client. The key is never echoed or logged |
| `DELETE /api/session` | Disconnects |

### 6.2 Reads

| Route | Returns |
|---|---|
| `GET /api/bootstrap` | You; your teams; your assigned and created issues and sub-issues, workspace-wide (open, plus done in the last 14 days); the cycles, projects and people they reference; server time |
| `GET /api/teams/:id` | Open issues, done issues from the last 2 cycles, cycles, open projects, people |
| `GET /api/teams/:id/issues?cursor=` | The All tab, 100 issues per page, sorted by updated |
| `GET /api/issues/:id` | Issue, sub-issues, comments, activity |
| `GET /api/projects?scope=` | Projects in scope, with rollups, PI, initiative, and latest update |
| `GET /api/projects/:id` | Overview, issues across teams, activity |
| `GET /api/initiatives?scope=` | Capabilities with outcome groups, rollups, project health counts, latest update |
| `GET /api/initiatives/:id` | Overview, projects, activity |
| `GET /api/releases` | PIs, for timeline bands |
| `GET /api/search?q=` | Issues across the workspace, plus teams and projects by name |
| `GET /api/users?q=` | Workspace users by name |
| `GET /api/changes?since=&teams=` | Issues and sub-issues updated since a time, for your issues and the loaded teams |

### 6.3 Writes

| Route | Body |
|---|---|
| `POST /api/issues` | team, title, project (required), status, priority, assignee, labels, cycle, estimate, description, position |
| `PATCH /api/issues/:id` | title, status, priority, assignee, cycle, project, estimate, labels, blocked, blocked_reason, description |
| `POST /api/issues/:id/rank` | above or below |
| `POST /api/issues/:id/sub-issues` | title, assignee, hours |
| `PATCH /api/sub-issues/:id` | title, status, assignee, hours |
| `POST /api/issues/:id/comments` | html |
| `POST /api/tags` | name |
| `POST /api/projects/:id/updates` and `POST /api/initiatives/:id/updates` | health, html |

### 6.4 Sync and limits

- **Polling:** every 20s, covering your issues and every loaded team.
  - It pauses while the tab is hidden, and backs off 20s → 40s → 80s on failure.
  - Data is marked stale after 3 consecutive failures.
- **Full refresh:** every loaded team gets a full refresh every 5 minutes. This catches deletions and moves out of scope.
- **Rally limits:** at most 4 concurrent Rally requests, a 15s timeout, and one retry on concurrency-conflict errors.
- **Speed budgets:**
  - Bootstrap in under 2s.
  - A team's first open in under 3s (AI/ML: about 375 issues, 2 pages).
  - The projects list for a team in under 3s.
  - Edits appear instantly.

## 7. Client architecture

**Store:**
- One entity cache for users, teams, cycles, projects, initiatives, issues and sub-issues.
- Load state per team.
- v1's write queue, field-level rollback, `touched` stale-read guard and change merging are kept.
- v1's order lists and "membership" logic are removed.

**Views:**
- A view is a **scope**, plus **filters**, plus **display options**:
  - **Scopes:** My Assigned or Created; a team's Active, Backlog or All; a cycle; a project; an initiative's projects; the workspace projects.
  - **Filters**, as chips: team (My issues), status, assignee, creator, priority, estimate, label, project, cycle, and, for projects, status, health, lead, PI and initiative.
  - **Display options:**
    - For issues: layout (List / Board), group by (focus, status, assignee, priority, project, cycle, none), order by (manual, priority, updated, created, estimate; importance, locked, under focus), show empty groups, completed issues (My issues only), row properties.
    - For projects: layout (List / Board / Timeline), group by (status, lead, team, initiative, PI, health, none), order by (manual, target, progress, updated), show closed (none, recent, all), columns.
  - Options are saved per view in localStorage.
  - Defaults follow Linear: group by status and order by priority. Backlog orders manually. My issues groups by focus (D28).

**Drag rules:**

| Drop | Result |
|---|---|
| Into another group | Patches that group's property (status, assignee, priority, cycle or project) |
| Between rows, in a manually ordered view | Ranks the issue |
| Between rows, in any other ordering | Reordering is disabled; a hint says to switch to manual |

**Selection:**
- J/K, Space and Enter work in every list.
- X multi-selects in any view, which brings up the bulk bar (status, priority, assignee, labels, project, cycle, estimate).

**Routing:** history-based URLs such as `/my/assigned`, `/team/:key/active`, `/team/:key/cycles/:id`, `/project/:key`, `/initiative/:key` and `/issue/:key`.

## 8. Screens

§18 supersedes this section's issue row, board, issue page and composer where they differ. §19 supersedes its connect, settings and cycle page.

- **Connect:** shown on first run, or when no key is set. A centered card with a key field and a link to Rally's key page, ending in "Connected as <you> · <workspace>".
- **Settings:** account, workspace, guard mode (read-only display), teams (join, hide), theme.
- **Issue row:** priority icon, ID, status icon, title, then labels, project, cycle, estimate, assignee, date. Display properties toggle each one.
  - **Status icons:** dashed circle for Backlog, open circle for Todo, half-filled yellow for In Progress, three-quarter green for In Review, filled check for Done.
  - **Priority icons:** three dashes for none, 1–3 bars for Low to High, an orange square with "!" for Urgent.
- **Board:** columns are groups, and cards show the same properties.
- **Issue page:**
  - Breadcrumb (Team › ID), title, description (sanitized as in v1), sub-issues with an add row, then **Activity** with the **comment box**.
  - The right column has pills for status, priority, assignee, labels, project, cycle, estimate and blocked.
  - Space opens the same content as a side panel.
- **Composer:**
  - Team › New issue, title, description.
  - **Status** defaults to Backlog, or Todo inside Active or a cycle.
  - **Priority.**
  - **Assignee** defaults to you from My issues.
  - **Labels.**
  - **Project** is required and defaults to the last one used for that team.
  - **Cycle** defaults to the current cycle inside a cycle view.
  - **Estimate.**
  - Create more; ⌘↵ to create.
- **Cycle page:** the issue view, plus a side panel with points in scope, started and completed, days left, and breakdown tabs (Assignees / Labels / Priority / Projects).

## 9. PM layer

### 9.1 Screens

§19 supersedes this section where they differ.

- **Projects list:**
  - **Columns:** name with its PI chip, health, lead, target, issues, and status with % done.
  - **Grouping and ordering:** as in §7.
  - **Board:** columns by status category.
- **Timeline:**
  - Bars from planned start to planned end, with PI bands, a today line, Quarter / Year zoom and a Today button.
  - Overruns past the target show as red dashed extensions.
  - Rows group by the current grouping. It is read-only.
- **Project page:**
  - **Overview:** description, properties, PI, teams involved, the latest update card, and the Progress panel (scope, started, completed points). The burn-up is a stretch goal (D25).
  - **Activity:** updates and comments, with a Comment / **Update** toggle and a health picker.
  - **Issues:** the issue view scoped to the project, across teams.
- **Initiatives list:**
  - Tabs: Active / Planned / All.
  - Columns: status, owner, target, projects done/total, health, active-project health dots.
  - Grouped by outcome.
- **Initiative page:**
  - **Overview:** properties, the latest update card with an automatic "projects at risk" line, description.
  - **Projects:** the projects view scoped to this initiative.
  - **Activity.**

### 9.2 Teams for PMs

Joining an ART- or platform-level project makes it a team whose views include all child teams. Projects and initiatives are scoped to it, and same-named cycles across its children merge into one.

### 9.3 Updates

An update is a ConversationPost on the Feature or Capability, laid out as:

```html
<p><b>Mira update · At risk</b></p>
<p>…the author's text…</p>
<p><i>progress 37% · target 2027-01-01</i></p>
```

- The header identifies the post as an update. Health is parsed from it.
- The footer records progress and target at posting time, so the next update can show "since last update" changes (for example "37% → 52%, target unchanged").
- Posts without the header are plain comments.

### 9.4 Health

**Which health shows:** the latest update's health wins. With no update, the calculated health shows, marked "Auto", with its reason on hover.

**The calculated rule, in order:**

| Health | Condition |
|---|---|
| No target | No planned end date |
| Off track | Past the planned end date and not Done |
| At risk | Progress more than 25 points behind the share of time elapsed, or it has blocked open stories, or `c_UncommittedOpenRisk` is set |
| On track | Otherwise |

Initiative health is the latest initiative update, else the worst health among its active projects, marked "Auto".

## 10. Keyboard

| Key | Action |
|---|---|
| C | Create issue |
| S | Status |
| P | Priority |
| A | Assign to… |
| I | Assign to me |
| L | Labels |
| ⇧P | Project |
| ⇧C | Cycle (ours) |
| ⇧E | Estimate (ours) |
| X | Select |
| J / K | Move |
| Space | Peek |
| Enter | Open |
| Esc | Back / close |
| F | Filter |
| ⌘K | Command palette |
| ⌘. | Copy ID |
| G then M | My issues |
| G then P | Projects |
| G then N | Initiatives |
| ? | Shortcuts |

Teams are opened from ⌘K ("Go to team…"). v1's typing safety stays: no shortcut fires while typing, except ⌘K and Esc, and Space/Enter keep their native behavior on buttons and checkboxes.

## 11. Write guard and safety

- **Demo mode** (`WRITE_GUARD=demo`): writes are allowed only to items in the configured demo project whose name starts with `[DEMO] ` and that carry the `collabathon-demo` tag. This covers every write type:
  - **Issues:** create, patch and rank. Their targets (project, cycle) must also be demo-project items, and the project must have the demo prefix.
  - **Sub-issues:** create and patch, under demo issues only.
  - **Comments:** on demo issues only.
  - **Updates:** on `[DEMO]` features and capabilities that carry the `collabathon-demo` tag only (D35).
  - **Tags:** no tag creation in demo mode.
- **Off mode:** everything is allowed.
- **Verify CLI:** `rallypoc stack up` always starts the proxy with `WRITE_GUARD=demo`, as an environment variable that overrides `.env`. Live use is `rallypoc stack up --write-guard off`. `check api`, `check ui` and the flows refuse to run unless the stack is in demo mode.
- **Credentials:** the key file is created with mode 0600 and never logged. The proxy keeps v1's TrustedHost check (127.0.0.1 and localhost only).

## 12. Verification and testing

**Unit tests:**
- **Mapping:** tables of tests:
  - Status in both directions, for every combination of ScheduleState, Ready and iteration.
  - Priority for stories and defects, including unknown values.
  - Project and initiative status categories.
  - Cycle merging, health rules, and update header/footer parsing.
  - The rank midpoint, including random-string property tests.
- **Adapter and API:** fake-Rally tests for every route, including:
  - Workspace scope for My issues, team scope for team loads, and child scope for ART teams.
  - Each guard rule refusing, with no Rally write made.
  - Session: key validation, file mode 0600, and the key never echoed.
- **Client:**
  - View logic: scope membership, filters, sorting, grouping, empty groups.
  - Drag rules as pure functions.
  - Display-option persistence.
  - Linear shortcut map and typing safety.
  - Composer defaults and its required project.
  - The health display (reported versus Auto).

**Live checks, on [DEMO] items only, with the guard on:**
- **Bootstrap:** shows both of the user's teams. Real AI/ML issues load (read-only assertion).
- **Round trips:**
  - Backlog ⇄ Todo through Ready, and every status.
  - Priority.
  - Adding and removing a label.
  - A comment, posted and then deleted.
  - A sub-issue, created and then deleted.
  - A project update on a `[DEMO]` feature (health shows, then is removed).
  - Rank.

**Browser flows:**
- My issues across teams.
- Board drag to change status.
- Dragging between assignee groups to reassign.
- Backlog manual rank.
- A cycle panel.
- The projects list and timeline.
- A project across teams.
- An update with health.
- An issue comment.
- The composer.
- The pickers.
- Connect, with an invalid key showing an error. The valid path is exercised by the stack itself.

**Feature map areas** (replacing v1's): proxy, connect & settings, my-issues, team-issues, issue-page, composer, palette, cycles, projects, initiatives, timeline, updates & health.

**Seed:** the `[DEMO]` dataset gains a spread of priorities, labels, Backlog and Todo (Ready on and off, in and out of the sprint), one blocked story, planned dates on the demo features, and a demo update.

## 13. Build phases and checkpoint

Phases 1 and 2 get their own implementation plan. Phase 4's plan is written after the checkpoint, so that it starts from the user's feedback rather than from guesses.

1. **Phase 1, server:**
   - Domain and mapping v2, rank midpoint, multi-scope reads, new writes, guard extensions, session/connect.
   - Projects, initiatives and releases reads.
   - Updates parsing.
   - CLI guard-on rule; `check api` v2.
2. **Phase 2, client core:**
   - Routing, sidebar with teams.
   - The issue-view component (list, board, display options, filters, drag rules).
   - My issues; team Issues (Active, Backlog, All).
   - New row and icons, and the Linear shortcut map.
3. **✋ Checkpoint.** Work stops. The user runs scenarios 1–3 (§14) on their real data, in whichever guard mode they choose, and their feedback is folded into the spec and plan before Phase 4. Done 2026-10-16; the feedback is §18.
   - **Phase 3, Linear parity (§18):** its own plan. Focus grouping, the view chrome, list, board, display menu, sidebar, palette, peek, and the issue page and composer in Linear's shape, including activity and comments.
4. **Phase 4, everything else:**
   - Pickers and bulk bar polish (the issue page and composer moved to Phase 3, D33).
   - Cycles pages.
   - PM layer: projects list, timeline, project page, initiatives, updates & health, ART teams.
   - Connect and Settings UI.
   - Seed update, flows, feature map, and a dry run of all scenarios.
   - The burn-up is last, and is the first cut if time runs short.

## 14. Acceptance scenarios

These come from the user's real data on 2026-10-16. Counts will drift.

1. **My issues** shows the user's real open issues across AI/ML Solutions and Data Services, plus demo items, in Focus order: urgent, then each team's current sprint, upcoming sprints, other active, backlog and completed. Priority icons show where they're set.
2. **AI/ML Solutions › Issues › Active**, as a board, shows the team's sprint work. Grouping by assignee shows the team's people plus an Unassigned group.
3. **Backlog**, ordered manually, shows the team's backlog in Rally's rank order, and dragging ranks it.
4. **Cycles** shows PI4 Sprint 3 with scope, started and completed points. A cycle's issue view and its panel breakdowns work.
5. Opening one of the user's real issues shows its activity. The comment box posts (on demo issues with the guard on).
6. **C** opens the composer with the last project pre-selected, and ⌘↵ creates the issue.
7. **Initiatives** shows the user's capability-level initiatives, such as "AI/ML 2026 - Agentic Platform" with its projects, rollup and health dots. **Timeline** shows AI/ML features across PI4 with overruns marked. Posting **At risk** on a `[DEMO]` feature changes its health in the list, the timeline and its initiative.

## 15. Before launch: the demo checklist

1. `rallypoc seed` has been run, and the `[DEMO]` data is in its seeded state.
2. `rallypoc check api` and `rallypoc check ui` pass, with the stack in demo mode.
3. The feature map grades every demoed area stable.
4. The presenter has decided the guard mode for the live demo. In demo mode, real issues are read-only and the "Demo mode" chip is visible.
5. After the collabathon, `scripts/cleanup_demo.py --yes` is run and the API key is rotated, but only when the user asks.

## 16. Assumptions made without the user (tweak these)

1. "Your teams" uses a 120-day activity window.
2. ~~"Recently done" means the last 14 days, for both My issues and Active.~~ Amended: Active shows no Done (D31). My issues' "Completed issues" window offers None, Past day, Past week and Past 2 weeks, defaulting to Past day as observed in Linear; bootstrap still loads 14 days.
3. A team load brings done issues from the last 2 cycles. Older ones come from the All tab.
4. The All tab is 100 issues per page, sorted by updated.
5. The full team refresh runs every 5 minutes, and the poll every 20 seconds.
6. ⇧C (cycle), ⇧E (estimate) and G then N (initiatives) are our own shortcuts.
7. The estimate picker offers 1, 2, 3, 5, 8, 13 and No estimate, and shows any other existing value as it is.
8. Same-named cycles merge in ART views only when their dates match too. My issues never merges them (D29).
13. In Focus, an open issue whose cycle has ended (Rally doesn't roll it forward) counts as Other active.
14. Focus is not a drag target: the view orders by importance, so drag shows the existing "switch grouping" hint.
15. Teams and the workspace have no icon in Rally. Mira draws a tile with the initials, colored from a fixed 8-color palette by id. Projects get a cube icon colored by status category.
9. A Ready marker appearing on Rally's own boards is acceptable.
10. The "At risk" threshold is 25 points behind the share of time elapsed.
11. ~~Initiatives are grouped by their parent outcome.~~ Amended: no grouping by default, as in Linear; Outcome is a grouping option (§19.7). Programs aren't shown.
16. A cycle shows "N% of capacity" only when its Iteration has a PlannedVelocity. On 2026-10-19 that was 9 of 200 recent iterations.
12. Projects and initiatives from other ARTs appear only when a user joins that ART or one of its teams.

## 17. Known gaps

- **No Inbox.** Rally has no notification feed. "Subscribed" and "Activity" in My issues are cut for the same reason.
- **Cut from Linear:** saved Views, Triage, the Canceled status, due dates, sub-grouping, and relations other than Blocked.
- **Projects and initiatives are read-only** apart from updates. Dates, status and leads are edited in Rally.
- **Moving an issue to another team isn't supported.**
- **The burn-up chart is a stretch goal.** Without it, progress is shown as numbers and a bar.
- **Deletions and moves out of a scope** appear only at the 5-minute refresh.
- **Last write wins** between people, with no conflict prompt.
- **Defects can't be created.** Teams have 0 open defects, and creation makes stories only.
- **Task estimates are hours.** That's Rally's model, unlike Linear's points on sub-issues.
- **Calculated health will show many projects Off track at first**, because 118 of AI/ML's 200 open features have stale planned dates. That's a true signal about Rally's data hygiene, not a bug.
- **Single user per proxy.** Hosting Mira for MSK still needs SSO, per-user key storage and a security review.

## 18. Checkpoint feedback: Linear parity (Phase 3)

Measured side by side with Linear on 2026-10-16, at 1728 CSS px wide, and inventoried control by control with REA (accessibility trees for names and order) plus computed-style scripts. The inventory is `/tmp/rea-research/v2cmp/inventory.md`, kept outside the repo. Values are CSS px; colors use Mira's tokens where one exists. Typography (13/500 titles, 12/450 chips), the 44px row pitch, 36px group headers, 28px nav and pill rows, and the palette box already match and don't change.

### 18.1 Focus grouping and Importance ordering (D28, D29)

Groups, in this order. Each issue lands in the first group that takes it.

| Group | Takes | Label |
|---|---|---|
| Urgent issues | priority Urgent, not Done | "Urgent issues" |
| Current cycle | not Done, cycle where start ≤ now ≤ end. One group per cycle (so per team) | cycle `name` · team name, with dates "Oct 8 → Oct 21" |
| Upcoming cycles | not Done, cycle starting after now. One group per cycle, by start date, then team name | the same |
| Other active | Todo, In Progress or In Review, with no cycle or an ended one | "Other active" |
| Backlog | Backlog | "Backlog" |
| Completed | Done within the Completed issues window | "Completed" |

- **Importance** (the only ordering under Focus; the Ordering control shows it, disabled): In Review, In Progress, Todo, Backlog; then priority Urgent → Low → none; then rank. Completed sorts by completion time, newest first.
- **Completed issues** display option, My issues only: None, Past day (default), Past week, Past 2 weeks.
- Focus is offered in My issues only. Team views keep status as their default.
- Focus groups are not drop targets (assumption 14).

### 18.2 View chrome (every issue view)

The exact names, order and values are in the inventory (`/tmp/rea-research/v2cmp/inventory.md`, §1–2), captured with REA.

- **Header row (44px):**
  - Team views show a breadcrumb: the team tile, "AI/ML Solutions", "›", "Issues", at 13/500.
  - My issues shows "My issues".
- **Second row (28px tall):**
  - The tabs are on the left, as 28px fully rounded pills with 10px padding and 12/500 text, spaced 8px apart.
    - My issues: Assigned, Created.
    - Team: Active, Backlog, All issues.
    - The active tab uses the `tab-active` fill with `ink-1` text.
    - Inactive tabs use the `surface` fill with a 0.5px `line-menu` border and `ink-3` text.
  - On the right are 28×28 round icon buttons, `surface` with a 0.5px border and a 14px `ink-3` icon:
    1. "Add filter" (funnel)
    2. "Display options" (sliders)
- **Display dot:** the Display button shows a blue dot (`focus`) when the view's options differ from its defaults.
- **⌘B** switches List ⇄ Board.

### 18.3 List

- **Group header:** 36px tall, radius 8, `hover` fill. Left to right:
  1. A "Collapse group" button: a 20×20 hit area with a 16px filled down-pointing caret in `line-caret`, visible at rest.
  2. The group icon at 14px: status, priority, avatar, project cube, cycle icon, or the monochrome done disc for Focus's Completed.
  3. The name at 13/500.
  4. The **points total**: a 34×24 radius-8 button holding the estimate triangle and the sum of estimates. When no issue has an estimate, it shows the issue count instead.
  5. In cycle groups, the dates "Oct 8 → Oct 21" in `ink-4`.
  6. On the far right, a 24px round "Create new issue" "+", **always visible**. It opens the composer pre-filled with the group's value: status, priority, assignee, project or cycle. Urgent pre-fills the priority, and Backlog the status. Focus's Other active and Completed groups have no "+".
- **Collapsed groups** are remembered per view, with the display options.
- **Row (44px pitch).** Left to right:
  1. The checkbox, hidden until hover or selection.
  2. Priority icon (16px).
  3. ID, 13/450 `ink-3`, auto width.
  4. Status icon (14px).
  5. Title, 13/500 `ink-1`.
  6. A spacer.
  7. Labels: the first two, then "+N".
  8. Project chip.
  9. Cycle chip.
  10. Estimate.
  11. Assignee avatar (18px).
  12. The created date, 12px `ink-3` ("Oct 16").
  13. The creator avatar, only when Creator is on.
  14. The updated date, only when Updated is on.
- **Row hover** fills the whole row with `hover`, with rounded ends. A selected row has a 0.5px border, radius 8 and the `hover` fill.
- **Chips:** 24px tall, fully rounded, 8px padding, a 0.5px `line-menu` border, `panel` fill, 12/450 `ink-3`.
  - Project chip: the cube icon, colored by status category (assumption 15), plus the name.
  - Cycle chip: the cycle icon plus `short_name` (D30), with the full name and dates as its tooltip.
  - Estimate: the triangle icon plus the number, with no pill.
- **Cycle icon:**
  - Current: a ring with a small play triangle at the centre; the ring's gap shows the time left.
  - Upcoming: a dotted ring with the play triangle.
  - Past: a full ring.
- **Created** and **Creator** are new row properties. Defaults on: priority, ID, status, labels, project, cycle, estimate, assignee, created. Creator and Updated default off. The display-options storage key is versioned, so saved options reset to these defaults once.

### 18.4 Board

- **Columns:**
  - 348px wide with 12px padding and no gap between them. They fill the viewport height and each scrolls on its own; the board itself scrolls only sideways. (Today a 175-card column is 19,669px tall and its header scrolls away.)
  - Each column ends with an "Add new issue" pill: full width, 28px, fully rounded, `surface` at 50%, a 0.5px `line-menu` border and a centred "+". It sits 8px after the last card.
- **Column header:** 50px tall, 18px/12px padding. Left to right:
  1. Status icon.
  2. Name at 13/500.
  3. Points total, as in §18.3.
  4. On the right, 24px round buttons: "…" ("Open menu": Collapse column; a collapsed column is a 40px strip showing its icon, name and count) then "+" ("Create new issue").
- **Card:** `surface`, radius 8, no border, 12px inset. Its shadow is `0 0 0 0.5px lch(0 0 0 / .088), 0 3px 6px -2px lch(0 0 0 / .02), 0 1px 1px lch(0 0 0 / .04)`. Lines:
  1. ID (12/450 `ink-3`), with an 18px avatar at the top right.
  2. Status icon and title, 13/500, wrapping.
  3. A chip row, 10px below, gap 4: priority (a 24×24 icon chip), cycle, project, estimate, labels. Card chips use the `surface` fill with a 0.5px border.
  4. "Created Oct 16", 12px `ink-3`, when Created is on.
- 8px between cards (unchanged).

### 18.5 Display menu

The panel is about 300 wide, radius 12, with the palette shadow. Top to bottom:

1. **Layout tabs:** "List" (three-lines icon) and "Board" (2×2 squares icon), each 129×28, fully rounded, 12/500. On: `highlight` fill and `ink-1`. Off: `surface`, a 0.5px border, `ink-3`.
2. **Label rows:** the label at 13/450 `ink-3`, and on the right a 116×24 custom dropdown (radius 8, 0.5px border, 12/400, a 10×5 chevron). The dropdowns are keyboard navigable; there are no native selects.
   1. **Grouping:** Focus (My issues only), Status, Assignee, Priority, Project, Cycle, No grouping.
   2. **Ordering:** Manual, Priority, Last updated, Created, Estimate.
      - Under Focus it reads "Importance", disabled, with the tooltip "Ordering is disabled for Focus grouping".
3. A 0.5px divider.
4. **My issues only:** "Completed issues", a dropdown of None, Past day, Past week, Past 2 weeks.
5. **Team views only:** "Show empty groups", a 22×14 switch (track `switch-off`; `accent` when on).
6. A divider.
7. **"Display properties"** label, then 24px fully rounded 12/500 pills in Linear's order: ID, Status, Assignee, Creator, Priority, Project, Cycle, Estimate, Labels, Created, Updated.
   - On: `pill-on` fill and `ink-1`.
   - Off: `surface`, a 0.5px border, `ink-3`.

### 18.6 Filter menu (F)

- **Panel:** 206 wide, radius 12, opening under the button.
- **Input row:** "Add Filter…" (13/400) with an "F" keycap.
- **Items:** 32px tall, 13/400 `ink-2`, a 16px `ink-3` icon, and "▶" for a submenu. In Linear's order, with only what Mira can back:
  1. Team (My issues only)
  2. Status
  3. Assignee
  4. Creator
  5. Priority
  6. Estimate
  7. Labels
  8. — divider —
  9. Project
  10. Cycle
- **Submenu:** opens to the right. It has a "Filter…" input, then 32px items showing the value's icon, its name and an issue count in `ink-4` ("5 issues"). Clicking a value toggles it, and a selected value shows a check.
- **Active filters** show as chips after the tabs, as today, restyled to the §18.3 chips.

### 18.7 Row context menu (right-click)

- **Panel:** 179 wide, radius 12, 32px items. Shortcuts are bare glyphs at 11/500 `ink-3`, right-aligned, with no keycap box.
- **Items, in order:**
  1. Status `S` ▶
  2. Priority `P` ▶
  3. Assignee `A` ▶
  4. Labels `L` ▶
  5. Project `⇧ P` ▶
  6. Estimate `⇧ E` ▶
  7. Cycle `⇧ C` ▶
  8. — divider —
  9. Mark as ▶ (Blocked / Unblocked)
  10. — divider —
  11. Copy ▶ (Copy issue ID `⌘ .`, Copy issue URL, Copy issue title)
  12. Open in ▶ (Open issue, Open in new tab)
- **Property submenus** list the same options as the ⌘K pickers (§18.8), with the current value checked.
- Right-clicking a row that isn't selected selects it first. With a multi-selection, the menu acts on every selected issue.

### 18.8 Sidebar

- **Workspace header:**
  - A 20×20 tile (radius 8, white 11px initials, assumption 15), the name at 13/550, and an 8px chevron. The chevron opens a menu: Settings, Toggle theme, Keyboard shortcuts.
  - On the right:
    - a 28px round "Search workspace" (magnifier);
    - a 28px round "Create new issue" compose button (`panel` fill, 0.5px border, a square-with-pencil icon) that opens the composer.
- **Top item:** "My issues" with its viewfinder icon. Items are 220 wide and 28px tall, radius 8, with a 14px icon at x20 and a 13/500 label at x40. There are **no shortcut hints**.
- **Sections:** "Workspace" ▾ (Initiatives, Projects) and "Your teams" ▾. Each label is 12/500 `ink-3` with a caret after it, and collapses.
- **Team row:** a team tile in the team's colour, the name, then a 16px caret after the name. On hover, a 24px round "…" "Team menu" (Hide team) appears. The children are indented, with a 14px icon at x37 and the label at x51: Issues (two squares), Cycles (ring and play), Projects (cube).
- **States:**
  - The active item starts at its own indent (201 wide for a child), with the `selected` fill and `ink-1` text and icon.
  - Hover is `sidebar-hover` (lch 91.6), radius 8.
- **Bottom:** the "Demo mode" chip whenever the guard is on, and a 24px round "?" "Open Help menu": Keyboard shortcuts, Toggle theme, Settings.
- Collapsed sections and teams are remembered in the browser.

### 18.9 ⌘K palette, pickers and peek

- **Palette:**
  - Box: 720 wide, top at 130px, radius 12, a 0.5px `line-menu` border, palette shadow. **No backdrop dimming** and no focus outline on the input.
  - **Context chip:** 22px, radius 10, `highlight` fill, 6px padding, "US1001 ⋅ title" (the key at 12/500), and a trailing "⌫" that clears the context.
  - **Input:** 40px, 13/400, placeholder "Type a command or search…".
  - **Items:** 46px, no group heading before you type, a 16px `ink-3` icon and a 13/450 `ink-2` label. The highlighted item gets a `highlight` layer (radius 8, inset 2px 0) and `ink-1` text and icon.
  - **Contextual commands, in order:**
    1. Assign to… `A`
    2. Assign to me / Un-assign from me `I` (the second when it's assigned to you)
    3. Change status… `S`
    4. Change priority… `P`
    5. Move to project… `⇧ P`
    6. Add labels… `L`
    7. Change estimate… `⇧ E`
    8. Move to cycle… `⇧ C`
    9. Mark as blocked / Mark as unblocked
    10. Copy issue ID `⌘ .`
    11. Copy issue URL
    12. Copy issue title
    13. Open issue `Enter`
    
    Navigation commands (Go to My issues `G M`, Go to Projects `G P`, Go to Initiatives `G N`, Go to team …) and Mira's own (Create issue `C`, Toggle theme, Keyboard shortcuts `?`) follow.
  - **Keycaps:** one box per key, 20×21, min-width 20, 4px padding, 11/450 `ink-3`, a 0.5px `line-menu` border, radius 3, 3px apart. The cheatsheet uses the same keycap.
  - **Typed query:** 30px group headings at 12/500 `ink-3`.
    - "Quick results for "<q>"" lists projects as a cube, "Project", "›" and the name; teams as a tile, "Team", "›" and the name; then issues as status icon, key (`ink-3`) and title, about 8px apart.
    - Matching commands come first, under no heading.
- **Pickers (S, P, A, L, ⇧P, ⇧E, ⇧C, or through the palette):**
  - They use the palette panel and its context chip, with placeholders "Change status…", "Change priority to…", "Assign to…", "Add labels…", "Move to project…", "Set estimate to…", "Move to cycle…".
  - Items are 46px with their icon.
  - **Number keycaps:** status Backlog 1, Todo 2, In Progress 3, In Review 4, Done 5; priority No priority 0, Urgent 1, High 2, Medium 3, Low 4. Pressing the number picks the item.
  - The current value shows a 16px check left of its keycap, in `ink-1`.
  - Estimates read "1 Point", "N Points".
  - Cycles read "PI 4 · Sprint 3", followed by "Oct 8 – Oct 21" muted and "Current" or "Upcoming".
- **Peek (D32):** Space toggles a read-only card, anchored top right under the toolbar.
  - **Box:** 416 wide, sized to its content, radius 12, a 0.5px `line-menu` border, `surface`, palette shadow, a 25px inset. There's no backdrop, and the list stays live.
  - **Behaviour:**
    - J/K moves the selection, and the card follows.
    - The property shortcuts edit the selected issue, and the card updates.
    - Enter opens the full page; Esc or Space closes the card.
  - **Lines:**
    1. Key, 13/500 `ink-3`.
    2. Title, 18/500 `ink-1`, wrapping.
    3. Status icon and name, priority icon and name, then avatar and assignee, at 13/450 `ink-3` with 16px gaps. Linear also shows time in status; Rally doesn't supply it, so it's omitted.
    4. Project cube and name, cycle icon and `name`, estimate triangle and number.
    5. The description, 15/400 with 22.5 line height, `ink-4`, clamped to 8 lines, or "No description".

### 18.10 Issue page (D33)

- **Header row (44px):**
  - The breadcrumb is **the view the issue was opened from** ("My issues" or "AI/ML Solutions › Active"), then "›", then key and title at 13/500.
  - Then a 24px round "…" "Issue options" menu: Copy issue ID, Copy issue URL, Copy issue title, Mark as blocked / unblocked.
  - On the far right, the pager "3 / 10" (13/450 `ink-4`) with 24px "Navigate down" ↓ and "Navigate up" ↑. J/K do the same, stepping through the view's issues in order.
  - A direct link with no origin view shows the team ("AI/ML Solutions"), and no pager.
- **Row 2, right-aligned:** 28px round buttons, "Copy issue URL" (link icon) and "Copy issue ID" (two squares).
- **Layout:** the content column is 791 wide, centred in an 805 column. The properties column on the right is 400px, with no divider and no background. On narrower windows the content column shrinks first.
- **Content column, in order:**
  1. **Title:** 24/600, line height 32, wrapping. It's an auto-growing field: Enter saves, and it never inserts a newline.
  2. **Description:** 15/450, placeholder "Add description…".
  3. **"Add sub-issues":** a "+" pill, 12/500, 24px, fully rounded, 6px padding. It opens an inline title row (Enter creates, Esc cancels). Existing sub-issues list above it, with their done count.
  4. A divider, then an **Activity** heading (15/600).
  5. **The feed:** events and comments interleaved oldest first.
     - An event line: a 14px avatar, the name, and "<text> · 2h ago" at 12/450 `ink-3`. The time's tooltip is the full date.
     - A comment: avatar, name and time, then the sanitized html.
  6. **The comment box**, last:
     - A `surface` card: radius 8, a 0.5px `line-menu` border, shadow `0 3px 6px -2px lch(0 0 0/.02), 0 1px 1px lch(0 0 0/.04)`, padding 12/16.
     - "Leave a comment…" at 15/450.
     - A 24px round "Submit comment" ↑ button at the bottom right. ⌘↵ also sends.
     - Posting is optimistic and subject to the write guard (§11).
- **Properties column:** section headings at 13/500 `ink-3` with 8px left padding. Rows are hug-width buttons: 28px, fully rounded, 6px padding, 13/500 `ink-2`, a 16px icon.
  - **Properties:**
    1. Status
    2. Team (read-only, D26)
    3. Priority ("Priority" when unset)
    4. Assignee ("Assignee" when unset)
    5. Estimate ("8 Points"; "Estimate" when unset)
    6. Cycle (cycle icon and `name`; "Cycle" when unset)
    7. Blocked, shown only when the issue is blocked: a red pill whose tooltip is the reason.
  - **Labels:** chips with a colour dot, and an "Add label" button with a tag icon.
  - **Project:** cube icon and name.
  - Clicking a property opens its picker (§18.9).
- **Activity translation (D34)**, in the proxy. Rally clauses look like `FIELD changed from [a] to [b]`, `FIELD added [x]`, `FIELD removed [x]` and `Original revision`.

  | Rally field | Activity text |
  |---|---|
  | Original revision | created the issue |
  | SCHEDULE STATE | changed status from A to B (Defined → Todo, In-Progress → In Progress, Completed → In Review, Accepted → Done) |
  | READY | moved to Backlog / moved to Todo |
  | OWNER | assigned to X / unassigned X |
  | C_PRIORITY, PRIORITY | set priority to X (§5.3 names) |
  | ITERATION | moved to cycle X / removed from cycle X (`name` per D30) |
  | PLAN ESTIMATE | set estimate to N / removed the estimate |
  | TAGS | added label X / removed label X |
  | NAME | changed the title |
  | DESCRIPTION | updated the description |
  | FEATURE, PORTFOLIO ITEM | moved to project X |
  | BLOCKED | marked as blocked / marked as unblocked |

  Any other clause (rank, release, flow state, dates and the like) is dropped. A revision with no clause left is not shown. Several clauses in one revision become several events.

### 18.11 Composer (D33)

- **Dialog "Create issue":** 750 wide, top at 130px, **radius 21**, a 0.5px `line-menu` border, palette shadow. The backdrop is **24% black**.
- **Header:**
  1. A "Set team" chip: 24px, fully rounded, `surface`, 0.5px border, the team tile and name at 12/450. It opens a team dropdown listing "AI/ML Solutions" and "Data Services".
  2. "›" in `ink-3`, then "New issue" at 13/450.
  3. On the right, a 28px round "Close" ×.
- **Title:** 18/600, line height 28.8, placeholder "Issue title", with no border or focus outline. It still starts with "[DEMO] " while the guard is on.
- **Description:** the description editor, 15/450, placeholder "Add description…", about 76px tall.
- **Chip row:** 24px chips, fully rounded, `surface`, 0.5px border, a 14px icon, 12/450, about 6px apart.
  1. Status ("Backlog")
  2. Priority ("Priority")
  3. Assignee (avatar and name, or "Assignee")
  4. Project ("Project")
  5. Estimate ("Estimate")
  6. Labels ("Labels")
  7. Cycle (icon only, 32 wide, unless set)
  
  Unset chips show the property name in `ink-3`; set ones show the value in `ink-2`.
- **Chip pickers:** a dropdown under the chip, not the palette.
  - Box: radius 12, shadow `lch(0 0 0/.02) 0 6px 18px, lch(0 0 0/.04) 0 3px 9px, lch(0 0 0/.04) 0 1px 1px`.
  - A filter input, 32px items, a number keycap on the right, and the current value checked.
  - Widths and placeholders:

    | Chip | Width | Placeholder |
    |---|---|---|
    | Status | 207 | "Change status…" |
    | Priority | 207 | "Set priority to…" |
    | Assignee | 207 | "Assign to…" |
    | Project | 270 | "Add to project…" |
    | Estimate | 228 | "Set estimate to…" |
    | Labels | 207 | "Add labels…" |
    | Cycle | 278 | "Add to cycle…" |

  - The options are the same as the ⌘K pickers'.
- **Footer:** on the right, a "Create more" 22×14 switch with a 12/400 `ink-3` label, then "Create issue" (93×28, fully rounded, `accent`, white 12/500). There's no Cancel button and no keycap hint: Esc or Close cancels, and ⌘↵ creates. With "Create more" on, the composer stays open after creating, keeping the team, project and chips.
- The defaults of §8 still apply, and Project is still required.

### 18.12 Not copied

Rally has nothing behind these, or D26 cuts them:
- Inbox, Agent, Views, favorites, subscribe and notifications.
- "Ask Linear", copy git branch, "Copy as prompt" and Markdown copies.
- Milestones, due dates, sub-grouping, ordering direction, "Order completed by recency" (Focus's Completed always sorts by recency), sub-issue display options and time in status.
- The team's Home and Views items, "Add new view", and the issue views' side-panel button (its breakdowns come with the Phase 4 cycle page).
- The issue page's reactions and attachments, and the composer's attach, expand and "More actions" buttons.
- Moving an issue to another team.
- The Filter menu's AI, advanced, agent, relations, dates, subscribers, content, links and template filters.

## 19. Phase 4: Linear parity for cycles, the PM layer and settings

§19 and §18 describe Linear's screens and keep Linear's terms. On screen, D39's words apply.

Measured on 2026-10-19 in the Linear sandbox at 1728 CSS px wide, the same frame as §18, using REA accessibility trees for names and order and computed-style scripts for geometry and colour. The inventory is `~/.cache/rea-research/v2cmp/inventory-p4.md`, kept outside the repo; build tasks read it for exact values. This section records what Mira builds and where it departs from Linear. Typography, row pitches and the §18 chrome carry over.

### 19.1 Rulings from real data

Checked against the user's Rally workspace on 2026-10-19 (counts only, read-only).

| Linear has | Rally data | Mira does |
|---|---|---|
| Project and initiative **priority** | Features (149 fields) and Capabilities (145) have no priority field. The nearest, WSJF and its inputs, are all at Rally's defaults (scores 0; Business Value, Time Criticality and RR/OE 1) | D38: shown when a priority custom field exists, hidden otherwise. The proxy reads the type definitions once per session and reports `project_priority` and `initiative_priority` in bootstrap |
| **Milestones** (list, board, timeline diamonds, project sections) | 0 of 200 open AI/ML features have a Rally Milestone; 184 have a Release (PI) | The PI chip takes the next-milestone slot, styled the same: 12/450 `ink-3`, no border. Milestone sections, panels and diamonds are left out |
| Cycle **capacity** | 9 of 200 recent Iterations have a PlannedVelocity | "N% of capacity" shows only when it is set (§16 #16) |
| Five **project statuses** | Feature States, in §5.4's categories | Board columns and the status icons use Linear's names for the categories: Backlog, Planned, In Progress (§5.4's Started), Completed. Canceled is cut (D26). The status pill shows the Rally State name ("Current PI") with its category's icon |
| No **Auto** health | — | D36 |
| No **PI bands** | Releases | D37 |

### 19.2 Shared pieces

- **New tokens:** `line-popover` lch(90.55); `shadow-popover`; `seg-active` lch(95.54); `fill-open` lch(94.85); `fill-tag` lch(92.44), also the person-chip hover; `hover-soft` lch(96.5); `switch-off` lch(82.48); `line-grid` lch(95.24), dashed; `line-frame` lch(89.84). Health colours: on track lch(60 64.37 141.95); at risk lch(72 90 85) for text and lch(80 90 85) for icons and "Started"; off track lch(50 73 29), and lch(58 73 29) for overruns and target lines. Chart colours: completed lch(48 59.31 288.43), scope lch(66 1 282). Dark-theme values are derived the same way as §18's.
- **Health chip:** 24h, fully rounded, pad 0 8. The health icon (16), the label in the health colour, then the age "· 3d" at 0.7 alpha. Hover lch(64.64/0.125). Auto health puts "Auto" in the age slot (D36), with the reason in the tooltip. Icon-only variants (28 round) are used on board cards, timeline rows and initiative rows. Each has Linear's aria text ("Off track, last update 3 days ago. Click to open updates.").
- **Popovers:** Display and Filter popovers take `line-popover`, `shadow-popover` and radius 12. The header button reads `fill-open` while its popover is open.
- **Display-property pills** (24h, fully rounded; on lch(94.86) `ink-1`, off white `ink-4`), **layout tabs** (94×28 in a white strip, active `seg-active`) and **switches** (22×14 in menus, 30×20 in settings; on `accent`, off `switch-off`).
- **Icons:** Mira draws its own from the inventory's descriptions (§7 there): the three health icons and the dashed "no updates" circle; the project cube and its 36px tile; the four project-status hexagons; the initiative glyph and its Active status; the projects done/total hexagon; the three cycle icons (Planned, Upcoming, Current), the capacity ring and the rail dot; the estimate triangle; start and target calendars and the overdue calendar; the update pencil-square; the team and link glyphs. They join `/dev/icons`. No Linear SVG or artwork is copied.

### 19.3 Cycles list (`/team/:key/cycles`)

- **Header:** the breadcrumb (team tile, team name, "›", "Cycles"). No tabs or filter.
- **Rows** are the team's Iterations, newest at the top, 70 tall, radius 8, with `hover` behind them and 1px separators:
  1. The cycle icon: Planned (future, not next), Upcoming (the next one) or Current.
  2. The name, as D30 ("PI 4 · Sprint 3"), 13/500 `ink-2`.
  3. On the right: the status tag (13/450 `ink-3` on `fill-tag`, radius 2) for Planned, Upcoming and Current only.
  4. The capacity ring with "N% of capacity", when the Iteration has a PlannedVelocity.
  5. The estimate triangle, the scope in points, then "scope".
- **Left rail:** two-line date labels ("Nov / 16", 12/450 `ink-4`), a 1px line in `accent` from the current cycle to the next and grey elsewhere, and 9px dots (filled `accent` for current).
- **Current cycle** is expanded: Scope, Started (• %) and Completed (• %) on the right, and the inline burn-up on the left once §19.9 lands. Before then the expanded row shows the legend only.
- Past cycles show the 2 most recent; the rest load with "Show older cycles".

### 19.4 Cycle page (`/team/:key/cycles/:id`), superseding §8's

- **Breadcrumb:** team › Cycles › the cycle switcher ("[icon] PI 4 · Sprint 3 ⌄", 12/500), which lists the team's cycles with "Next cycle" and "Previous cycle" first.
- **Second row:** "N issues" (13/500 `ink-3`) on the left; Filter, Display and the side-panel toggle on the right.
- **Issue view:** the §18 list or board, scoped to the cycle, grouped by status. Rows show the project chip (24h, radius 48, 1px `line-3`, `panel` fill).
- **Side panel** (428 wide, one `surface` card, open by default):
  1. The status tag (Current, Upcoming or Planned) and the date range "Oct 19 → Nov 1" in one lch(94.5) pill, read-only.
  2. The cycle icon and name (15/600).
  3. **Progress:** Scope, Started (• %) and Completed (• %) in points. The burn-up (402 wide, weekends hatched) comes with §19.9. There is no days-left figure, as in Linear.
  4. **Breakdown tabs:** Assignees, Labels, Priority, Projects, Teams. Rows are 42 tall: the avatar or icon, the name 13/450 `ink-1`, then a ring and "N% of" with the triangle and points. Teams shows only in ART views; "No labels used" when empty.
- Not copied: the cycle options menu, favourites, "Add document or link…", and date editing.

### 19.5 Projects (`/projects`, `/team/:key/projects`)

- **Header:** "Projects" (the team version is a breadcrumb). No "New project" button (D23). The tab row has "All projects". Filter and Display sit on the right; there is no side-panel toggle.
- **Priority (D38):** wherever this section lists Priority, it appears only when the field exists. It uses the issue priority icons, 28 round, aria "No Priority", and the ⌘K priority picker.
- **Display popover** (332 wide):
  - Layout tabs List / Board / Timeline. The workspace defaults to Timeline, a team to List.
  - Grouping (none, status, priority, lead, team, initiative, PI, health), ordering (manual, priority, target date, progress, updated), and "Show closed projects" (All, Recent, None).
  - Board adds Columns (status) and Rows (none). Timeline options: Show project list, Show week numbers, Show cycles (a team picker), and **Show PIs** (D37).
  - Display properties, from Linear's set less what Rally can't back: ID, PI, Priority, Status, Health, Teams, Initiatives, Lead, Start date, Target date, Issues, Created, Updated, Completed, Labels.
  - Footer: "Reset". "Set default for everyone" is not copied.
- **Filter menu:** Status, Priority, Labels, Teams, Lead, Health, Dates, Initiatives, PI, and Title. AI, advanced, members, creator, relations and template filters are not copied.
- **List** columns, in Linear's order: Name · Health · Priority · Lead · Target date · Issues · Status.
  - Rows 48 tall: the hover checkbox; the cube (14) in the status category's colour; the name 13/500 `ink-1`; the PI chip in the milestone slot.
  - Health is the health chip. Lead is a 16 avatar plus the name in a 28h chip. Target date has the calendar icon, or the overdue calendar when past target and not Completed.
  - Issues is the count. Status is the status icon, the % done and a 32×16 accent sparkline of progress (none at 0%).
- **Board:** columns Backlog, Planned, In Progress, Completed (354 wide; the page scrolls sideways), each with its icon, name and count. No "+" or "…" (D23). Cards (328 wide, the §18 card shadow): the cube, the name (wraps), icon-only health, status and priority, the lead avatar; the target date and PI chip; "N issues".
- **Timeline:**
  - The left panel (320 wide, "Show project list") has rows at a 72 pitch: the cube, the name, icon-only health, status and priority, and the lead avatar.
  - Canvas on `panel`, with "Today" and "Zoom" pills on the top right. Zoom offers Year, Quarter, Month and Week, keys Y, Q, M and W.
  - The header has uppercase month labels and day or week numbers, with a right-edge fade. Week columns are `line-grid` dashed.
  - The today line is 1px accent, fading downward at 0.6 opacity, with an "OCT 19" accent pill in the header.
  - Bars span planned start to target: 24 tall, radius 6, `surface`, 1px `line-3`, with the name above the bar (13/500 `ink-2`). Hover is lch(94.85).
  - An **overrun** (today past target, not Completed) extends the bar to today: the pink gradient with the red checker edge.
  - **Show PIs** draws each Release as a full-height band with its name in the header (D37). **Show cycles** draws the chosen team's Iterations the same way, lighter.
  - Read-only, as D24.

### 19.6 Project page (`/project/:key`)

- **Header (44):** the cube and name; "Copy page URL" on the right. Tabs Overview, Activity, Issues. The side-panel toggle sits on the right, with Filter and Display added on Issues.
- **Overview, main column** (805 wide), in Linear's order:
  1. The icon tile (36).
  2. The name (24/600).
  3. No summary: Rally has no summary field.
  4. The **Properties** row: status, priority, lead, start → target, teams.
  5. **Initiatives:** the parent capability's pill.
  6. The **Latest update** card (§19.8).
  7. **Description**, sanitized as in v1.
  8. No Resources or Milestones sections.
- **Overview, right sidebar** (388 wide, panels on `surface` with 1px `line-menu` and `shadow-comment`, 8 apart):
  - **Properties:** Status, Priority, Lead, Dates, Teams, Initiatives, PI, Labels, as 36-pitch rows.
  - **Progress:** the legend (Scope, Started, Completed in points), the burn-up once §19.9 lands, then Assignees, Labels and Teams breakdowns as in §19.4.
  - **Activity:** the latest update link and "See all".
- **Activity tab:**
  - The composer card has the Comment | Update segmented toggle, with **Update** selected by default.
  - In Update mode it has the health chip, which defaults to the current reported health (On track when it is Auto), and the placeholder "Write a project update…". The button is "Post update".
  - In Comment mode the placeholder is "Leave a comment…" and the button is "Submit comment".
  - The health picker is On track, At risk and Off track, with no number keys.
  - The feed is newest first: update cards with absolute dates, comments, and system lines ("[cube] <owner> created the project · Oct 16") from the Feature's creation date.
  - Not copied: "Write with Agent", attachments and reactions.
- **Issues tab:** the issue view scoped to the project across teams, grouped by status. Rows show the cycle chip in place of the project chip.

### 19.7 Initiatives (`/initiatives`, `/initiative/:key`)

- **List:**
  - Tabs Active, Planned, All initiatives. No "New initiative" (D23).
  - Columns: Name · Status · Priority · Owner · Target · Projects · Health · Active Projects.
  - Rows are 58 tall:
    - the initiative glyph;
    - the name 13/500 over a one-line description 13/450 `ink-3`;
    - the status pill;
    - priority;
    - the owner avatar;
    - the target calendar;
    - "n / total" projects completed, with the hexagon;
    - icon-only health;
    - one pill per health among active projects (an 8px dot and the count, aria "1 project on track. Click to open updates.").
  - No grouping by default. Grouping offers Outcome, Status and Owner.
- **Initiative page:**
  - Header: the glyph and name, "Copy page URL". Tabs Overview, Activity, Projects. The details panel is closed by default, so content is centred at 805 wide.
  - Overview: the icon tile and the name, then the Properties row (status, priority, owner, target) and the latest update card. Under the card come Description and an embedded **Projects** list (Name, Health, Priority, Lead, Target date, Status) grouped by project status.
  - Activity: as §19.6, with "Write an initiative update…".
  - Projects: §19.5's view, scoped to the initiative.
  - Health is D36's: the latest update, else the worst health among active projects, marked Auto.

### 19.8 Updates and health

- **Update card:** radius 10, 1px `line-3`, `panel` fill, pad 8 16 16.
  - The header is "Latest update ▾" with "Update" on the right.
  - The byline: the health icon and label, an 18 avatar, the author, and "3d ago" with the full time as a title.
  - The body is 15/450/24 `ink-2`.
- **Diff block:** a left-ruled block under the body, built from §9.3's footer against the previous update:
  - "Target date · moved from Dec 1st to Jan 1st, 2027" or "· set to …";
  - "Progress since Oct 16 · 37% → 52%".
  - On initiatives, one "Projects · [cube] <name> at risk" (or "off track") row per active project whose health is worse than on track.
- **Guard (D35):** posting an update, or changing a project or initiative's priority (D38), needs the `[DEMO] ` prefix, the demo team and the `collabathon-demo` tag on the Feature or Capability. The seed tags its demo feature and capability.
- After posting, the project's health updates in the list, timeline, board and its initiative without a reload.

### 19.9 Burn-up (D25, last task)

- **Data:** the Lookback API, giving daily snapshots of the scope's stories (PlanEstimate, ScheduleState) from the cycle or project start to today.
- **Lines:** scope (grey line plus area) and started (yellow), with completed in accent. A today marker with dots. On projects, a target-date line in lch(58 73 29) with a dashed fill past it.
- **Cycles:** weekends hatched, plus a dashed accent projection to the cycle end.
- **Axis:** labels 12/400 `ink-3` at the start, today and the end.
- **Where it goes:** the expanded current cycle (§19.3), the cycle panel (§19.4) and the project Progress panel (§19.6).
- If Lookback fails or times out, the legend numbers stay and the chart area says "Burn-up unavailable".

### 19.10 Settings and connect (superseding §8's)

- **Shell:** `/settings/*` replaces the sidebar with a settings nav (244 wide):
  - "‹ Back to app", then a search field (220×28, 1px `line-frame`).
  - Nav items are 28 tall, 13/500 lch(37.78); active lch(89.54) with `ink-1`, hover lch(91.64).
  - Mira's sections: **Personal** (Preferences, Account), **Administration** (Teams), and **Your teams** (one item per sidebar team).
- **Content:** a centred 640 column on `panel`. The h1 is 24/500. Cards are `surface`, radius 10, `shadow-card`, with 66-tall rows (a 13/500 title over a 12/450 `ink-3` description, the control on the right, 1px `line-frame` separators).
- **Preferences:**
  - Interface theme (Light / Dark select).
  - Display names (Full name).
  - A **Write guard** row: "Demo mode: only [DEMO] items change" or "Off: changes write to Rally", read-only, with "Change it with rallypoc stack up" as the description. Linear has no counterpart, so it uses the Preferences row style.
- **Account:** "Connected as <name> · <workspace>". Then the Rally API key row (masked, with "Change key" opening the connect card) and "Disconnect".
- **Teams:** every workspace team in one card. Each row has the team tile, the name and "ART" or "Team", then Join / Leave and a "Show in sidebar" switch (the existing joined and hidden lists).
- **Team settings** (`/settings/teams/:key`): "‹ Teams", the team name as h1, and "Team overview ›". One card of read-only link rows (32 icon tile, title and description, value and "›"):
  - Members (N members);
  - Issue statuses (5 statuses);
  - Cycles (the cadence, from Iteration lengths);
  - Child teams (ART only).
- **Connect** (no key): the same centred 640 column with no nav. A card holds the "Connect Mira to Rally" title, the key field, the "Get a key in Rally" link and "Connect". An invalid key shows an inline error under the field; success shows "Connected as <you> · <workspace>" and goes to My issues.

### 19.11 ART teams

As §9.2: a joined ART or platform is a team whose views include its child teams. Projects, initiatives and cycles scope to it. Same-named cycles with matching dates merge (§16 #8), and the cycle panel's Teams tab breaks the scope down by child team.

### 19.12 Not copied in Phase 4

- New project and new initiative; editing project or initiative properties, dates or status (D23; priority is D38's exception); timeline dragging (D24).
- Milestones for projects and initiatives (§19.1); the Canceled status (D26). Priority shows only per D38.
- Project and initiative summaries (Rally has no field), favourites, notifications, "Copy as …", "Add document or link…" (Resources), Slack and members rows, dependencies, predictions.
- "Write with Agent", reactions and attachments on updates; "Set default for everyone".
- Settings sections Rally can't back: notifications, security, integrations, billing, labels, templates, SLAs and the rest of Linear's nav.

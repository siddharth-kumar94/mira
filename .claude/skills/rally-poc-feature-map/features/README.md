# Rally POC feature map

One file per product area. Each file says what exists, how mature it is, how a user reaches it, and how to drive it through `rallypoc` (the verify-rally-poc skill, at `.claude/skills/verify-rally-poc/rallypoc`). Use the map to answer questions without re-reading the whole codebase. Use the source to settle anything the map does not cover or that may have changed.

Scope: `server/` (proxy, adapter), `web/` (client), `scripts/` (demo data). Rally itself is out of scope. The areas are spec §12's, replacing v1's five.

## Maturity rubric

Grade each sub-feature against the highest rung it fully meets. Every grade needs evidence (a file:line, a test name, or a `rallypoc` result).

| Grade | Meaning | Must be true |
|---|---|---|
| `deferred` | Out of scope by decision | Listed as deferred in CLAUDE.md or a plan, or no code and a doc says later |
| `stub` | Code exists but does not do the job | Endpoint crashes, a UI branch can never render, a field is never populated, or the only caller is dead code |
| `api-only` | Works, but no UI reaches it | Route works when called. Nothing in the frontend calls it from a reachable page |
| `beta` | A user can reach it and the happy path works | Reachable from the UI. A known defect, an untested path, or missing coverage keeps it from `stable` |
| `stable` | Safe to rely on | Reachable from the UI, covered by passing tests, no open known defect, and driven live in the local stack (`Live` column has a date) |

Rules:
- Grade what the code does, not what docs or commit messages claim.
- A known defect caps the grade at `beta`, however polished the rest is. Put the defect under Gotchas.
- Source-only review can propose `stable`, but only a live drive confirms it. Until then, write `beta (stable pending live)`.
- Role gating is part of the feature. If the UI shows a control that the API rejects for that role, it is a defect.
- Flags: a feature merged but off by default keeps its grade, and the row's `What` names the flag and its default. Code on an unmerged branch is not in the map; list it under "Unmerged" below.

## Deployed or not

Maturity describes the code at the commit in each file's `Last verified` line. Whether a deployed environment runs that code is a separate question. Each row has a `Since` column (the commit that introduced or last materially changed it). To answer "is this live on <env>?":

1. Run `rallypoc aws status` (read-only). It prints what each service runs and the commits on HEAD that the environment lacks.
2. If the row's `Since` commit is in that undeployed list, the environment runs the older behaviour.
3. If credentials are expired, say so and fall back to the snapshot below, with its date.

Snapshot (not deployed, 2026-10-20):
- Nothing is deployed. The POC runs on one laptop against the real Rally workspace.

## Unmerged

Phase 4 (`v2/phase4`, everything after 53e187f) is not merged to `main` yet. This map is written on that branch and grades it, so Phase 4 rows describe code that `main` does not have. The burn-up (Tasks 22 and 23) is built and graded `beta` in the sprints and features areas.

## Test evidence

"Tests pass" in this map means a local `rallypoc test` run at the file's `Last verified` commit. It does not mean CI is green. There is no CI for the POC. Every test result in this map is a local `rallypoc test` run.

## Baseline preconditions for driving

Every "Driving it" section assumes this, unless its own `Preconditions:` line says otherwise:

```bash
export RALLY_POC_VERIFY_INSTANCE=<task>   # your own instance: the default is shared by every session in this checkout
CC=.claude/skills/verify-rally-poc/rallypoc
$CC doctor                 # tools, platform emulation, ports; if your instance is UP and you did not start it, pick another name
$CC stack up               # local copy of the deployment, waits for health
$CC seed                   # synthetic users / data only
```

## Driving conventions

- One labelled bullet per sub-feature: **sub-feature-id**: action → exact command → observable result. The result must be something a check can see: an HTTP status, a JSON field, visible text, a row count.
- Prefer the user's surface. Use the browser driver for UI features, the API driver for API-only ones, and read-only DB queries only to confirm state the UI does not show.
- Never change data with SQL. If a state can only be reached by editing the DB, that is a finding.
- Locators: prefer role+name. When the UI has no accessible name, note it under Gotchas and use the documented fallback.
- Role checks: run the same action as each role with the expected failure status, or check the UI hides the control.
- Paid or shared services (LLM, cloud) are never called by default. A paid probe runs only after the user agrees to the cost.
- Synthetic data only. Never put real identifiers in the map or in evidence.

## Proof and skip reporting

For each sub-feature you drive, record one line:

```
<sub-feature-id>  PASS|FAIL|SKIP  <evidence path or observed value>  <one-line reason if FAIL/SKIP>
```

Evidence lands in `$($CC evidence dir)`, per instance, and survives `cleanup` but not a reboot. A SKIP needs a reason ("needs a cloud workspace", "needs user approval for cost"). Never write PASS for something you only read about.

## Feature entry contract

Every feature file has this shape, in this order:

```markdown
# <Area name>

Last verified: <commit sha12> on <YYYY-MM-DD> (<source | live>)

<One paragraph: what the area is for, which roles use it, where it lives in the UI, overall maturity.>

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| area-thing | ... | beta | UI+API | 8f2676b6 | 2026-10-05 / not driven | `path/router.py:42`, `tests/test_x.py::test_y` |

## How to get to it (user POV)

<Numbered steps from login, with on-screen labels in quotes.>

## Driving it

Preconditions: <baseline, plus anything else>

- **area-thing**: <action> → `rallypoc ...` → <observable result>

## Gotchas

- <defects, traps, things that look broken but are by design. Each with a file:line.>
```

Table rows have exactly 7 cells (`render-map` fails on any other count). `Surface` starts with `UI`, `API`, `WS` or `infra`. `Live` is `<date>`, `<date> FAIL`, or `not driven`. IDs are kebab-case, prefixed with the area, and stable. Rename only together with every reference in `multi-surface-journeys.md`. Areas with no UI (infra, runtime services) say "no user path" under How to get to it.

## Gotchas

- **Mira uses Rally's words, and a test guards the list.** The words (Sprint, Feature, Capability, Story, Task; "Initiative" only as the Capability list's grouping) are checked by `expectRallyWords` (web: `web/src/test/vocabulary.ts`) and `server/tests/test_user_words.py`, plus the `vocabulary` browser flow. A new screen or message must use Rally's words and pass them. Area ids, file names, URLs and code keep the older names (`/issue/US1`, `/team/5/cycles`, `/project/F1`), so a row's id can say "cycles" while its text says "sprints".

## Index

| File | Area | Roles | Overall (2026-10-20) |
|---|---|---|---|
| [proxy.md](proxy.md) | FastAPI proxy, Rally adapter, mapping | all | beta |
| [connect-settings.md](connect-settings.md) | Connect card, Settings (Preferences, Account, Teams, team page) | all | beta |
| [my-issues.md](my-issues.md) | My stories in Focus, Assigned and Created | all | beta |
| [team-issues.md](team-issues.md) | Team Stories: Active, Backlog, All; list, board, grouping, rank, bulk | all | beta |
| [issue-page.md](issue-page.md) | Story page, preview card, activity, comments, tasks | all | beta |
| [composer.md](composer.md) | Create story dialog | all | beta |
| [palette.md](palette.md) | ⌘K palette, pickers, shortcuts, row menu, sidebar | all | beta |
| [cycles.md](cycles.md) | Sprints list and page, progress, breakdowns, burn-up | all | beta |
| [projects.md](projects.md) | Features list, board, feature page, burn-up | PM | beta |
| [initiatives.md](initiatives.md) | Capabilities list and page | PM | beta |
| [timeline.md](timeline.md) | Features timeline, zoom, overruns, PI and sprint bands | PM | beta |
| [updates-health.md](updates-health.md) | Updates, comments, health chip, Auto health | PM | beta |
| [multi-surface-journeys.md](multi-surface-journeys.md) | Journeys across areas | all | see file |

## Sweep order

Areas build on each other's data. Sweep in this order so each one starts with what it needs:

1. proxy
2. connect-settings
3. my-issues
4. team-issues
5. issue-page
6. composer
7. palette
8. sprints
9. features
10. timeline
11. capabilities
12. updates-health

Run this after a feature change, or when a freshness check finds drift.

# Mira
**M**SK's **I**n-house **R**ally **A**lternative

A Linear-style app over Rally. Rally stays the record of truth; Mira is the friendlier way in: My stories (opens in Focus) across every
team, team views with list and board, Linear's keyboard, sprints, and features, capabilities and a timeline for PMs.

- Design: `docs/specs/2026-10-16-mira-v2-linear-model-design.md`
- Build plan (Phases 1–2): `docs/superpowers/plans/2026-10-16-mira-v2-phase1-2.md`
- Build plan (Phase 3, Linear parity): `docs/superpowers/plans/2026-10-16-mira-v2-phase3-linear-parity.md`
- Build plan (Phase 4, cycles, the PM layer and settings): `docs/superpowers/plans/2026-10-19-mira-v2-phase4.md`
- Phase 4 scenario dry run on real data: `docs/superpowers/plans/2026-10-19-mira-v2-phase4-dry-run.md`
- What exists and how mature it is: the feature map, `.claude/skills/rally-poc-feature-map/features/README.md`

## Screens

- My stories opens in Focus: urgent, each team's sprint, other active, backlog, completed.
- Board columns scroll on their own.
- Space opens a preview card of the selected story.
- The story page has activity, comments and "Add tasks".
- The composer's chips open pickers, and right-click opens Linear's row menu.
- Shortcuts: J/K move, Space previews, Enter opens, P/S/L/C set fields, X selects, ⌘K opens the palette, ⌘B switches between List and Board.
- Sprints: a team's sprints with a date rail, scope, started and completed points; a sprint page with its stories and a panel of progress and breakdowns by assignee, label, priority and feature.
- Features: the workspace's (a timeline) or a team's (a list) as List, Board or Timeline, with Display and Filter. A feature page has an overview, an Activity tab for updates and comments, and its stories across teams.
- Capabilities: Active, Planned and All, with a feature rollup and health pills; a capability page with its latest update and its features. Display can group them by Outcome or by Initiative (the level above Outcome).
- Timeline: bars from planned start to target, a Today line, overruns in pink, zoom (Y, Q, M, W), and PI bands under "Show PIs".
- Updates and health: post On track, At risk or Off track from a feature's Activity tab. A feature without an update shows a calculated health marked "Auto". Updates and comments on features and capabilities only post to `[DEMO]` items while the guard is on.
- Settings (from the workspace menu): Preferences (theme, display names, the write guard, read-only), Account (who you are connected as, change or disconnect the key) and Teams (join, leave, show in the sidebar).
- Burn-up charts (from Rally's Lookback API): on the current sprint's row in the Sprints list, in a sprint page's Progress panel (with a projection and weekends hatched), and in a feature's Progress panel (with its target date). If Lookback fails, the chart's space says "Burn-up unavailable" and the numbers stay.
- Features and capabilities are read-only apart from updates, comments and, where Rally has the field, priority.

## Words

Mira uses Rally's words, not Linear's. Rally's field behind each word:

| Mira says | Rally calls it | Note |
|---|---|---|
| Sprint | Iteration | Names read "PI 4 · Sprint 3" |
| Feature | Feature (`F…`) | A planned piece of work that holds stories |
| Capability | Capability (`C…`) | Sits above features |
| Story | User Story / Defect (`US…` / `DE…`) | Defects list as stories; Mira cannot create them |
| Task | Task (`TA…`) | A story's checklist; estimates are hours |
| Team | Team (a Rally Project) | Unchanged |
| PI | Release | Unchanged |
| Outcome | Outcome (`O…`) | A grouping on the Capability list |
| Initiative | Program (`P…`), the level above Outcome | A grouping on the Capability list only |

Label, Assignee, Estimate, Status and Priority are unchanged. URLs and code keep the older names (`/issue/US1`, `/team/5/cycles`, `/project/F1`, `/initiative/C1`), so saved links and saved view options still work.

## Run it locally

Mira is two processes on your laptop: a small FastAPI proxy that talks to Rally with your API key (port 8787), and the React app (port 5173). The key never reaches the browser.

**You need:** [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for you), Node 20.19 or newer, and a Full Access Rally API key (rally1.rallydev.com → Profile → API Keys).

1. **Configure.** From the repo root, `cp .env.example .env` and set:
   - `RALLY_API_KEY`: your key. `.env` is gitignored; never commit it.
   - `RALLY_WORKSPACE`: your workspace's ObjectID, the number in its Rally URL.
   - `RALLY_PROJECT`: the ObjectID of the team where demo stories may be created (the "demo team"), the number in `…/project/<id>`.
   - Leave `WRITE_GUARD=demo` as it is. See [The write guard](#the-write-guard).
2. **Install.** `(cd server && uv sync)` and `(cd web && npm install)`.
3. **Start.** `.claude/skills/verify-rally-poc/rallypoc stack up`. It starts both processes, waits until they answer, and prints `stack: up (write guard demo)`.
4. **Open** http://127.0.0.1:5173.

Stop it with `rallypoc stack down`; `rallypoc stack status` and `rallypoc stack logs` show what's running.
Without the helper, run the proxy with `cd server && WRITE_GUARD=demo uv run uvicorn app.main:app --host 127.0.0.1 --port 8787`
and the app with `cd web && npm run dev`.

If the app shows "Connect Mira to Rally", the proxy has no usable key: paste a key on that card, or check `RALLY_API_KEY` in the repo-root `.env`, restart with `rallypoc stack down` then `up`, and reload.
To change the key of a connected app, open Settings › Account › Change key. The key is saved in `~/.config/mira/credentials` (mode 600), outside the repo, and never reaches the browser.

## The write guard

**The guard is on by default.** In demo mode (`WRITE_GUARD=demo`) Mira only writes to items whose title starts with `[DEMO] ` and that carry the
`collabathon-demo` tag, in the demo team. Everything else in Rally is read-only, so you can click around your real work without changing it.
The sidebar shows a "Demo mode" chip while it's on.

`rallypoc stack up` always starts in demo mode, whatever `.env` says. To edit your real stories, restart on purpose:

```
rallypoc stack down
rallypoc stack up --write-guard off
```

Settings › Preferences shows the guard as a read-only row ("Demo mode" or "Off"); nothing in the app turns it off.

With the guard off, every change you make (status, priority, assignee, sprint, comments, bulk edits, and feature and capability updates) writes straight to Rally.
Go back with `rallypoc stack down`, then `rallypoc stack up`. The verify checks and browser flows refuse to run with the guard off.

## Test it

`rallypoc test` (pytest, vitest, typecheck), then `rallypoc check api` and `rallypoc check ui` with the stack up. `check ui` creates a [DEMO] composer story and leaves a Ready flag set on a [DEMO] story; `rallypoc seed` resets both.
The Phase 4 checks post and delete a [DEMO] feature update and comments, so run `rallypoc seed` after them too.

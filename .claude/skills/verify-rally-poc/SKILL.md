---
name: verify-rally-poc
description: Use when verifying a Rally POC change end to end, before or after deploying, when reproducing a deployed-only bug locally, when checking that CI, migrations or infrastructure code still pass, or when asked to test, smoke-test, QA or prove a feature works.
---

# Verify Rally POC

All verification goes through one CLI, `rallypoc`, in this directory. It runs a local copy of the real deployment and gives a command for every check we use.

```bash
CC=.claude/skills/verify-rally-poc/rallypoc   # from the repo root
$CC --help ; $CC <command> --help            # every command has examples
```

**Core rule:** if `rallypoc` can run a check, run it that way. Do not hand-roll `curl`, `docker compose` or `psql` for something it covers. Commands echo what they run (`+` lines). Exit codes: 0 pass, 1 check failed, 2 usage or precondition error (the message says how to fix it).

The CLI contract every project's CLI follows is in the project-verify-kit skill (`references/cli-contract.md`). For what to drive per feature, read the rally-poc-feature-map skill.

## What it mirrors

Nothing is deployed. The POC runs on one laptop and talks to the real Rally workspace, so there is no IaC to diff and `rallypoc parity check` prints "not applicable".

| Piece | Local process |
|---|---|
| Proxy (FastAPI, `server/`) | `uv run uvicorn app.main:app` on 127.0.0.1:8787 |
| Web client (Vite, `web/`) | `npm run dev` on 127.0.0.1:5173, proxying `/api` |
| Rally | The real Rally workspace via the key saved by the app (~/.config/mira/credentials) or RALLY_API_KEY in .env. `stack up` always starts the proxy with WRITE_GUARD=demo; `--write-guard off` is for live use, and the checks refuse to run with it |

## Launch

```bash
$CC doctor          # tools, platform emulation, ports, other sessions' containers (leave those alone)
$CC stack up        # proxy + web, guard on (demo); waits for /api/health and the web root
$CC seed            # resets the [DEMO] items in Rally (approved exception below)
```

Name your instance before anything that mutates: `export RALLY_POC_VERIFY_INSTANCE=<task>`. If `doctor` shows your instance UP and you did not start it, another session did: pick another name. Never `stack down` a stack you did not start.

## Drive

| Need | Command |
|---|---|
| Call the proxy | `$CC api GET /api/bootstrap --expect 200 --field me.name` (POST, PATCH and DELETE require the write guard on and a connected proxy; the CLI refuses otherwise, and the request echo redacts `api_key`) |
| Phase 4 coverage | `check api` also reads sprints, features, capabilities and PI chips, round-trips a feature comment and priority (`pm-priority` skips without a portfolio priority field), and sends `not-a-key` to `POST /api/session` (401, still connected). `check ui` adds the flows `cycles` (the Sprints page), `projects` (Features), `project-update`, `project-across-teams`, `initiatives` (Capabilities), `settings` and `connect`; each writes only [DEMO] items and undoes it, and `connect` never clicks Disconnect. The `vocabulary` flow writes nothing: it visits My stories, a team's Stories, Sprints and Features (list, board, timeline), a feature, Capabilities, a capability and Settings › Preferences, and fails if the chrome (sidebar, header, tab strip, column headers, open Display and Filter menus) shows issue, sub-issue, cycle, project or initiative (the Capability list's "Initiative" grouping excepted). It saves the sidebar sections and the layout it changes and puts them back |
| Wait for a value | `$CC api GET /api/health --field ok --until True` |
| Live API checks (spec §12) | `$CC check api` (refuses unless the guard is on) |
| One browser flow / all flows | `$CC browser run my-issues` / `$CC check ui` |
| Screenshot + accessibility tree | `$CC browser snapshot /` |
| Logs | `$CC stack logs --service server` |
| Rally unreachable | Stop the network or point `RALLY_BASE_URL` at `http://127.0.0.1:9` in `.env`, then `$CC stack restart`. Expect 502/504 from the proxy and the "Showing cached data" banner |

## CI parity

There is no CI for the POC. Run `$CC test` (pytest, vitest, typecheck) before every commit.

## Deployed-environment parity

Nothing is deployed, so `$CC aws status` prints "not applicable". Things local cannot reproduce: multi-user use (each user runs their own proxy with their own key), and network conditions between MSK and Rally other than this laptop's.

## Never without asking

Never do any of these without the user's explicit go-ahead:
- push images, update services, run tasks in a real account;
- IaC `plan` or `apply` against the real workspace;
- paid probes (LLM, cloud);
- any SQL write;
- commits;
- any write against a deployed environment's app.

**Approved exception (2026-10-16, by the user):** writes to Rally are allowed only for `[DEMO]`-prefixed items tagged `collabathon-demo` in the configured `RALLY_PROJECT` (Team - Data Services). `$CC seed`, `$CC check api`, and UI flows that change demo items use this exception. Anything else in Rally is read-only. `scripts/cleanup_demo.py --yes` deletes the demo tree, so run it only when the user asks.

A go-ahead counts only if it names the action. "Do whatever you need" names nothing: ask, listing the exact actions. Approval for one action does not carry over to the next. Use synthetic data only.

## Evidence

`$CC evidence dir` is `/tmp/rally-poc-verify/<instance>/evidence/`. It holds test logs, screenshots, API captures and probe output. It survives `cleanup`. Cite these paths in the report.

## Cleanup

```bash
$CC cleanup            # removes only what this instance started; keeps evidence
```

Run cleanup after every session, including failed ones, unless the user is keeping the instance.

## Report shape

1. **Verdict**: PASS / FAIL / PARTIAL, with the commit, platform and instance.
2. **Checks**: a table of check | command | result | evidence path.
3. **Deployed-environment differences**: the cannot-reproduce list, plus anything specific to this change.
4. **Findings**: ranked blocker / should-fix / nit, each with a file:line.
5. **Needs the user**: approvals, expired credentials, decisions.

## Common mistakes

| Mistake | Instead |
|---|---|
| Writing a plan and calling it verification | Run the commands; report what they printed |
| "Unit tests pass" as proof of an LLM or cloud fix | Those tests mock the client. Drive it locally with failure injection, and probe for real only with approval |
| Fixing data with SQL to get unstuck | Find the UI or API path; report the gap |
| Forgetting cleanup after a failed run | `$CC cleanup` is always safe |

## Keeping this skill true

- New or renamed pipeline step: extend the parity/wiring check so an uncovered step fails.
- New failure mode found while verifying: add a probe spec or UI flow so it is repeatable.
- A documented command fails: fix the CLI, not the report.

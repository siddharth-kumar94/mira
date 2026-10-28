# Rally Client POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Linear-style web client over Rally, with Rally kept as the record of truth, ready to demo four workflows: My Work + ⌘K, the story editor, the iteration board, and backlog grooming.

**Architecture:** A React/TypeScript/Vite frontend keeps a normalized optimistic cache and polls for changes. It talks only to a local FastAPI proxy. Inside the proxy, a Rally adapter is the only code that knows WSAPI, and a write guard limits development writes to `[DEMO]` items. Verification goes through a `project-verify-kit` CLI (`rallypoc`) and a graded feature map.

**Tech Stack:**
- **Proxy:** Python 3.12 (via `uv`), FastAPI, httpx, pydantic v2, pytest.
- **Frontend:** React 19, Vite 8, TypeScript 5, Tailwind 4, zustand 5, cmdk 1, dnd-kit, TipTap 3, DOMPurify, lucide-react, vitest.
- **Verification:** Playwright (Python) inside the verify CLI.

**Spec:** `docs/specs/2026-10-16-rally-client-poc-design.md`, approved 2026-10-16. Read it before starting. Section references below (§N) point into it.

## Global Constraints

**Runtime and ports**
- Python: `requires-python = ">=3.12"`. The system `python3` is 3.9, so always run Python through `uv run`.
- Node: 22 or newer (25.2.1 is installed).
- Ports: the proxy listens on `127.0.0.1:8787` and the web dev server on `127.0.0.1:5173`. Vite proxies `/api` to the proxy.

**Rally access**
- Rally base URL: `https://rally1.rallydev.com/slm/webservice/v2.0`. Use the documented `v2.0` API, never `v2.x` (D10).
- Every project-scoped Rally query passes `project=/project/{RALLY_PROJECT}&projectScopeUp=false&projectScopeDown=false` (§6.2).
- Auth: the user's own API key in the `ZSESSIONID` header. Never call `security/authorize` (D3, §6.4).

**Writes**
- Writes are allowed only to items in `RALLY_PROJECT` whose name starts with `[DEMO] ` and that carry the tag `collabathon-demo`. `WRITE_GUARD=demo` is the default and enforces this (D5).
- The guard's refusal message is exactly `Development mode: only [DEMO] items can be edited`.

**Data and secrets**
- Never commit `.env`, API keys, or real Rally ObjectIDs. Test fixtures use synthetic IDs and the host `rally.example`.
- Rally vocabulary in the UI: US/DE IDs, Iteration, Feature, and the states `Defined`, `In-Progress`, `Completed`, `Accepted` (D7).
- No priority column (D8). Labels are Rally tags (D9).

**Look and feel**
- No Linear assets: use Inter via `@fontsource-variable/inter`, icons from `lucide-react`, and our own CSS (D6).
- Design tokens are exactly the §5 table. Task 1 writes them to `web/src/styles/tokens.css`.

**Timing and limits**
- Proxy: at most 4 concurrent Rally requests, with a 15s timeout.
- Client: poll every 20s, back off 20s → 40s → 80s, and mark data stale after 3 consecutive failures. When the proxy is down, retry every 5s (§7, §8).
- Backlog cap: 200 items.

**Commits**
- End every commit message with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Run `gitleaks git --staged --redact -v` before every commit, and commit only if it's clean.

## Spec deviations (decided while planning)

1. **Iteration totals are computed in the client** from the loaded iteration issues, instead of calling `iterationstatus` (§4.3, §6.1). That endpoint was only observed on `v2.x`. Summing `estimate` by state over the iteration's top-level items gives the same numbers without an extra request.
2. **Order arrays instead of rank strings.** The client keeps `iteration_order` and `backlog_order` arrays exactly as Rally returns them (ordered by `DragAndDropRank`). It never sorts by the rank strings, because Rally's collation of those strings is unknown. `/api/changes` returns fresh order arrays on every poll.
3. **Verify command names.** The spec's `verify up/down`, `verify api` and `verify ui` (§9.1) become the kit's contract commands: `rallypoc stack up|down`, `rallypoc check api` and `rallypoc check ui`.
4. **Pickers live in the palette.** `S`/`A`/`I`/`E`/`T` open a picker inside the ⌘K palette (one component), the way Linear does.
5. **Live checks find demo items by name, not FormattedID**, so re-seeding never breaks them.

## Review Focus

1. **A patch that strips the `[DEMO] ` prefix or the `collabathon-demo` tag from a demo item.** Expected: refused with 403 before any Rally write. Pinned in Task 5 (`test_patch_cannot_strip_prefix`, `test_patch_cannot_drop_demo_tag`) and Task 6 (`test_update_issue_refuses_prefix_strip_without_posting`).
2. **Two quick edits to the same issue, where the first fails.** Expected: only the first edit's field rolls back, and the second edit's optimistic value stays. Pinned in Task 8 (`keeps a later edit when an earlier one fails`).
3. **A poll that arrives while a local edit is in flight.** Expected: it must not overwrite the optimistic value. Rally's version wins only after the edit settles. Pinned in Task 9 (`applyChanges skips items with edits in flight`).
4. **A Rally description containing `<script>`, `onerror=` or `javascript:` links.** Expected: it is sanitized before rendering or editing. Pinned in Task 12 (`sanitize.test.ts`).
5. **Pressing a shortcut key (`s`, `j`, `c`…) while typing in an input or the description editor.** Expected: the key types the letter and no shortcut fires. Pinned in Task 10 (`isTypingTarget` and `resolveKey` tests).

## File structure

```
rally-linear-poc/
  .env.example                 placeholders only (§9.3)
  README.md, CLAUDE.md
  server/                      FastAPI proxy (uv project)
    pyproject.toml, .python-version
    app/config.py              Settings from repo-root .env
    app/domain.py              domain models + request bodies (no Rally shapes)
    app/mapping.py             pure Rally <-> domain conversions, fetch lists, query helpers
    app/rally_client.py        httpx client: auth header, timeout, concurrency cap, error envelope, paging
    app/guard.py               WriteGuard + GuardError
    app/adapter.py             RallyAdapter: every Rally query/write, returns domain objects
    app/main.py                FastAPI app factory, routes, error mapping
    tests/fixtures.py          synthetic Rally objects
    tests/test_*.py
  web/                         React client
    src/api/types.ts           domain types (mirror of server/app/domain.py)
    src/api/client.ts          fetch wrapper + ApiError
    src/store/patch.ts         optimistic apply / field-level revert
    src/store/membership.ts    which list (iteration/backlog) an issue belongs to
    src/store/store.ts         app store: load, writes, queue, toasts, changes merge
    src/store/poller.ts        20s poll with backoff and stale flag
    src/store/ui.ts            UI state: view, selection, overlays, theme, feature filter
    src/store/selectors.ts     derived lists: My Work groups, board columns, backlog, totals, search
    src/store/index.ts         singleton stores + React hooks
    src/keyboard/shortcuts.ts  pure key resolution
    src/keyboard/useShortcuts.ts  global listener hook
    src/keyboard/actions.ts    maps actions to store calls
    src/components/*.tsx       StateGlyph, Avatar, IssueRow, TaskRow, Sidebar, Toasts, StatusBanner, SetupScreen, Cheatsheet, Composer
    src/views/registry.ts      registered views (sidebar + routing)
    src/views/MyWork.tsx, Board.tsx, Backlog.tsx, BulkBar.tsx
    src/palette/commands.ts, pickers.ts, CommandPalette.tsx
    src/issue/IssueDetail.tsx, IssuePanel.tsx, IssuePage.tsx, TaskList.tsx
    src/editor/sanitize.ts, DescriptionEditor.tsx
    src/Overlays.tsx, App.tsx, main.tsx
    src/styles/tokens.css, app.css
    src/test/fixtures.ts       makeIssue/makeTask/makeBootstrap/fakeApi/deferred
  scripts/rally_demo.py        shared helpers + demo-only write guard
  scripts/seed_demo.py         create or reset the [DEMO] dataset (§10)
  scripts/cleanup_demo.py      list / delete the [DEMO] dataset
  .claude/skills/verify-rally-poc/   SKILL.md, rallypoc (uv script), flows.py
  .claude/skills/rally-poc-feature-map/  SKILL.md, render-map, features/*.md
```

---

### Task 1: Repo skeleton (proxy health endpoint, web shell, tokens, config)

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`, `README.md`, `CLAUDE.md`
- Create: `server/pyproject.toml`, `server/.python-version`, `server/app/__init__.py`, `server/app/config.py`, `server/app/main.py`, `server/tests/__init__.py`, `server/tests/test_health.py`
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/App.test.tsx`, `web/src/test-setup.ts`, `web/src/styles/tokens.css`, `web/src/styles/app.css`
- Local only, never committed: `.env`

**Interfaces:**
- Produces: `app.config.Settings` (fields below), `app.main.create_app()` serving `GET /api/health` → `{"ok": true}`. Task 7 replaces `main.py`. The web app builds with Tailwind tokens `bg-app`, `bg-panel`, `bg-hover`, `bg-selected`, `bg-surface`, `text-ink-1..4`, `border-line-1..3`, `text-mini|small|regular|title`, `rounded-control|palette`, `shadow-palette`, `ease-out-quint`, plus the CSS variables `--size-*`.

- [ ] **Step 1: Extend `.gitignore`**

Replace the file with:

```gitignore
.env
.env.*
!.env.example
docs/specs/*.html
node_modules/
__pycache__/
.venv/
.pytest_cache/
web/dist/
.DS_Store
```

- [ ] **Step 2: Write the failing proxy test**

`server/pyproject.toml`:

```toml
[project]
name = "rally-poc-server"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.143",
  "httpx>=0.28",
  "pydantic>=2.14",
  "pydantic-settings>=2.16",
  "uvicorn>=0.54",
]

[dependency-groups]
dev = ["pytest>=9.1", "pytest-asyncio>=1.4"]

[tool.uv]
package = false

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
```

`server/.python-version`:

```
3.12
```

`server/app/__init__.py` and `server/tests/__init__.py`: empty files.

`server/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_needs_no_rally():
    with TestClient(create_app()) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd server && uv run pytest -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`. The first run also downloads Python 3.12 and creates `.venv`.

- [ ] **Step 4: Write config and the minimal app**

`server/app/config.py`:

```python
"""Proxy settings, read from the repo-root .env (never committed)."""
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    rally_api_key: str = ""
    rally_base_url: str = "https://rally1.rallydev.com/slm/webservice/v2.0"
    rally_workspace: int = 0
    rally_project: int = 0
    write_guard: Literal["demo", "off"] = "demo"
    demo_prefix: str = "[DEMO] "
    demo_tag: str = "collabathon-demo"
    rally_timeout_s: float = 15.0
    rally_max_concurrency: int = 4
```

`server/app/main.py`:

```python
"""FastAPI app factory. Task 7 adds the domain API."""
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Rally POC proxy")

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd server && uv run pytest -q`
Expected: `1 passed`.

- [ ] **Step 6: Create the web project and install dependencies**

`web/package.json`:

```json
{
  "name": "rally-poc-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 5173 --strictPort",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  }
}
```

Run:

```bash
cd web
npm install react@^19.3 react-dom@^19.3 @fontsource-variable/inter@^5.3
npm install -D vite@^8.3 @vitejs/plugin-react@^6.1 typescript@^5 @types/react @types/react-dom \
  tailwindcss@^4.3 @tailwindcss/vite@^4.3 vitest@^5.0 jsdom@^30.1 \
  @testing-library/react@^16.3 @testing-library/jest-dom @testing-library/user-event
```

Expected: `added N packages`, with no `ERESOLVE` errors.

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`web/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"], css: false },
});
```

`web/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rally POC</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write the failing web test**

`web/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders the app name", () => {
  render(<App />);
  expect(screen.getByText("Rally POC")).toBeInTheDocument();
});
```

Run: `cd web && npx vitest --run`
Expected: FAIL with `Failed to resolve import "./App"`.

- [ ] **Step 8: Write the tokens, styles, entry point and App**

`web/src/styles/tokens.css` restates the spec's §5 table as our own tokens. Colors and type sizes go in `@theme`, so Tailwind generates utilities for them. Layout sizes are plain CSS variables, used as `w-(--size-sidebar)`.

```css
@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-weight-normal: 450;
  --font-weight-medium: 500;
  --text-mini: 12px;
  --text-small: 13px;
  --text-regular: 15px;
  --text-regular--line-height: 24px;
  --text-title: 24px;

  --color-app: #efeff0;
  --color-panel: lch(98% 0.5 282);
  --color-surface: lch(100% 0 282);
  --color-hover: lch(94.4% 0.5 282);
  --color-selected: lch(89.5% 0.5 282);
  --color-ink-1: lch(10% 0 282);
  --color-ink-2: lch(20% 1.25 282);
  --color-ink-3: lch(39% 1.25 282);
  --color-ink-4: lch(65% 1.25 282);
  --color-line-1: lch(95% 0 282);
  --color-line-2: lch(88% 0 282);
  --color-line-3: lch(84% 0 282);
  --color-focus: #6d78d5;
  --color-state-defined: lch(65% 1.25 282);
  --color-state-progress: lch(75% 70 85);
  --color-state-completed: lch(55% 60 285);
  --color-state-accepted: lch(60% 55 145);
  --color-blocked: lch(55% 70 30);

  --radius-control: 8px;
  --radius-palette: 12px;
  --shadow-palette: 0 9px 48px lch(0 0 0 / 0.08), 0 6px 24px lch(0 0 0 / 0.1), 0 1px 1px lch(0 0 0 / 0.04);
  --ease-out-quint: cubic-bezier(0.23, 1, 0.32, 1);
}

:root {
  --size-sidebar: 244px;
  --size-header: 44px;
  --size-row: 44px;
  --size-group: 36px;
  --size-nav: 28px;
  --size-pill: 28px;
  --size-props: 240px;
  --size-palette: 720px;
  --size-palette-input: 40px;
  --size-palette-item: 46px;
  --motion-quick: 100ms;
  --motion-hover: 150ms;
  --motion-regular: 250ms;
  --motion-slow: 350ms;
}

/* D12: dark mirrors Linear's light/dark background pairs; not measured (spec §13). */
[data-theme="dark"] {
  --color-app: #09090a;
  --color-panel: #121213;
  --color-surface: lch(12% 1 282);
  --color-hover: lch(15% 1 282);
  --color-selected: lch(21% 1 282);
  --color-ink-1: lch(96% 0 282);
  --color-ink-2: lch(86% 1 282);
  --color-ink-3: lch(62% 1.25 282);
  --color-ink-4: lch(42% 1.25 282);
  --color-line-1: #1a1b1d;
  --color-line-2: #212224;
  --color-line-3: #2c2d30;
}
```

`web/src/styles/app.css`:

```css
@import "tailwindcss";
@import "./tokens.css";

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 450;
  font-size: var(--text-small);
  color: var(--color-ink-1);
  background: var(--color-app);
  -webkit-font-smoothing: antialiased;
}

:focus-visible {
  outline: 1px solid var(--color-focus);
  outline-offset: 1px;
}
```

`web/src/main.tsx`:

```tsx
import "@fontsource-variable/inter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`web/src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="flex h-full items-center justify-center bg-app text-small text-ink-2">Rally POC</main>
  );
}
```

- [ ] **Step 9: Run the web checks**

Run: `cd web && npx vitest --run && npm run typecheck && npm run build`
Expected: `1 passed`, then typecheck exits 0 with no output, then `vite build` prints `built in`.

- [ ] **Step 10: Write `.env.example`, create the local `.env`, and write the docs**

`.env.example`:

```bash
# Copy to .env (never commit .env). Spec §9.3.
RALLY_API_KEY=
RALLY_BASE_URL=https://rally1.rallydev.com/slm/webservice/v2.0
RALLY_WORKSPACE=0
RALLY_PROJECT=0
WRITE_GUARD=demo
```

Create `.env` from the user's existing key and the saved IDs. This prints nothing secret:

```bash
{ grep '^RALLY_API_KEY=' ~/.env; cat ~/.config/rally-poc/ids.env; \
  echo 'RALLY_BASE_URL=https://rally1.rallydev.com/slm/webservice/v2.0'; echo 'WRITE_GUARD=demo'; } > .env
chmod 600 .env
cut -d= -f1 .env
```

Expected: five key names (`RALLY_API_KEY`, `RALLY_WORKSPACE`, `RALLY_PROJECT`, `RALLY_BASE_URL`, `WRITE_GUARD`) and no values.

`README.md`:

````markdown
# Rally POC

A Linear-style client for Rally. Rally stays the record of truth. Design: `docs/specs/2026-10-16-rally-client-poc-design.md`.

## Run

```bash
cp .env.example .env    # then set RALLY_API_KEY (full access), RALLY_WORKSPACE, RALLY_PROJECT
(cd server && uv run uvicorn app.main:app --host 127.0.0.1 --port 8787) &
(cd web && npm install && npm run dev)
```

Open http://127.0.0.1:5173. While `WRITE_GUARD=demo`, only `[DEMO]` items tagged `collabathon-demo` can be changed.

Verification: `.claude/skills/verify-rally-poc/rallypoc --help`.
````

`CLAUDE.md`:

```markdown
# Rally POC

Linear-style client over Rally WSAPI v2.0. Spec: `docs/specs/2026-10-16-rally-client-poc-design.md`. Plan: `docs/superpowers/plans/2026-10-16-rally-client-poc.md`.

- `server/`: FastAPI proxy (uv, Python 3.12). Tests: `cd server && uv run pytest -q`.
- `web/`: React + Vite. Tests: `cd web && npx vitest --run && npm run typecheck`.
- Only `server/app/adapter.py` and `server/app/mapping.py` know Rally's shapes. The frontend sees domain objects only.
- Rally writes: only `[DEMO] `-prefixed, `collabathon-demo`-tagged items in `RALLY_PROJECT`. `WRITE_GUARD=demo` enforces this. Never switch it off while developing.
- Never commit `.env`, API keys or real Rally ObjectIDs. Test fixtures are synthetic.
```

- [ ] **Step 11: Smoke-run both servers by hand**

```bash
(cd server && uv run uvicorn app.main:app --host 127.0.0.1 --port 8787 > /tmp/rally-poc-t1-server.log 2>&1 &)
(cd web && npm run dev > /tmp/rally-poc-t1-web.log 2>&1 &)
sleep 6
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1:5173/ | grep -o '<title>Rally POC</title>'
curl -s http://127.0.0.1:5173/api/health
pkill -f 'uvicorn app.main:app' ; pkill -f 'vite --host 127.0.0.1 --port 5173'
```

Expected: `{"ok":true}`, then `<title>Rally POC</title>`, then `{"ok":true}` again, this time through the Vite proxy.

- [ ] **Step 12: Commit**

```bash
git add -A
gitleaks git --staged --redact -v
git status --short   # .env must NOT be listed
git commit -m "Add proxy and web skeleton with design tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Verify kit, `rallypoc` CLI, and demo-data scripts

**Files:**
- Create (by scaffold): `.claude/skills/verify-rally-poc/SKILL.md`, `.claude/skills/rally-poc-feature-map/{SKILL.md,render-map,features/README.md,features/multi-surface-journeys.md}`
- Create: `.claude/skills/verify-rally-poc/rallypoc`, `.claude/skills/verify-rally-poc/flows.py`
- Create: `scripts/rally_demo.py`, `scripts/seed_demo.py`, `scripts/cleanup_demo.py`
- Create: `.claude/skills/rally-poc-feature-map/features/rally-proxy.md`
- Modify: `.claude/skills/verify-rally-poc/SKILL.md` (fill the blanks), `.claude/skills/rally-poc-feature-map/features/README.md`, `.claude/skills/rally-poc-feature-map/features/multi-surface-journeys.md`

**Interfaces:**
- Consumes: `GET /api/health` (Task 1).
- Produces:
  - **CLI commands:** `rallypoc doctor`, `stack up|down|status|logs|restart`, `api METHOD PATH [--json] [--expect] [--field] [--until] [--save]`, `browser run <flow|all>|snapshot <path>|install`, `test`, `seed`, `evidence dir|list`, `cleanup`, `report`, plus the not-applicable `db`/`ci`/`aws`/`parity`.
  - **Helpers for later tasks:** `record(args, check, result, evidence, reason)` and `api_call(method, path, body)` → `(status, json)`, both used by `check` in Task 7.
  - **Browser flows:** `flows.FLOWS: dict[str, Callable[[Page], None]]`, registered with the `@flow` decorator, and `flows.WEB`.
  - **`scripts/rally_demo.py`:** `PREFIX`, `TAG`, `NOTE`, `PROJECT`, `call`, `query`, `short`, `assert_demo`, `demo_tag_ref`, `current_iteration`.

- [ ] **Step 1: Run the scaffold**

```bash
~/Documents/GitHub/agent-skills/skills/project-verify-kit/bin/scaffold --repo . --name rally-poc --title "Rally POC" --cli rallypoc
ls .claude/skills
```

Expected: `rally-poc-feature-map  verify-rally-poc`.

- [ ] **Step 2: Write the CLI**

`.claude/skills/verify-rally-poc/rallypoc` (then run `chmod +x` on it):

```python
#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.28", "playwright>=1.64"]
# ///
"""rallypoc: verify CLI for the Rally POC (project-verify-kit contract). Run from the repo root.

Examples:
  rallypoc doctor
  rallypoc stack up                 # proxy on :8787, web on :5173, waits for health
  rallypoc api GET /api/health --expect 200 --field ok
  rallypoc browser install          # once: Chromium for Playwright
  rallypoc browser run smoke        # one flow; `all` runs every flow
  rallypoc test                     # pytest + vitest + typecheck
  rallypoc seed                     # reset [DEMO] data in Rally (approved exception, see SKILL.md)
  rallypoc cleanup

Exit codes: 0 pass, 1 check failed, 2 usage or precondition error.
"""
import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROXY = "http://127.0.0.1:8787"
WEB = "http://127.0.0.1:5173"
SERVICES = {
    "server": {"cmd": ["uv", "run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8787"],
               "cwd": ROOT / "server", "port": 8787, "health": f"{PROXY}/api/health"},
    "web": {"cmd": ["npm", "run", "dev"], "cwd": ROOT / "web", "port": 5173, "health": f"{WEB}/"},
}
NOT_APPLICABLE = {
    "db": "no database: Rally is the record of truth",
    "ci": "no CI is configured for the POC",
    "aws": "nothing is deployed; the POC runs on one laptop",
    "parity": "nothing is deployed, so there is nothing to mirror",
}


class Fail(Exception):
    """A check failed (exit 1)."""


class Usage(Exception):
    """A usage or precondition error (exit 2). The message says how to fix it."""


def instance(args) -> str:
    return args.instance or os.environ.get("RALLY_POC_VERIFY_INSTANCE", "default")


def state_dir(args) -> Path:
    d = Path("/tmp/rally-poc-verify") / instance(args)
    for sub in ("pids", "logs", "evidence"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    return d


def echo(cmd) -> None:
    print("+ " + (cmd if isinstance(cmd, str) else " ".join(map(str, cmd))), flush=True)


def run(cmd, cwd=ROOT) -> int:
    echo(cmd)
    return subprocess.call(cmd, cwd=cwd)


def record(args, check: str, result: str, evidence="", reason: str = "") -> None:
    line = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "check": check,
            "result": result, "evidence": str(evidence), "reason": reason}
    with open(state_dir(args) / "evidence" / "results.jsonl", "a") as f:
        f.write(json.dumps(line) + "\n")
    print(f"{check}  {result}  {evidence}  {reason}".rstrip())


def port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def pid_of(args, name: str) -> int | None:
    f = state_dir(args) / "pids" / f"{name}.pid"
    if not f.exists():
        return None
    pid = int(f.read_text())
    try:
        os.kill(pid, 0)
        return pid
    except ProcessLookupError:
        f.unlink()
        return None


def api_call(method: str, path: str, body=None) -> tuple[int, object]:
    echo(f"{method} {PROXY}{path}" + (f" {json.dumps(body)}" if body is not None else ""))
    try:
        r = httpx.request(method, PROXY + path, json=body, timeout=60)
    except httpx.HTTPError as e:
        raise Usage(f"proxy not reachable ({e.__class__.__name__}); run `rallypoc stack up`")
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text


def pick(data, path: str):
    cur = data
    for part in path.replace("]", "").replace("[", ".").split("."):
        if part:
            cur = cur[int(part)] if isinstance(cur, list) else cur[part]
    return cur


# ---------- doctor ----------
def cmd_doctor(args) -> None:
    problems = []
    for tool in ("uv", "node", "npm"):
        if not shutil.which(tool):
            problems.append(f"{tool} not found on PATH")
    if shutil.which("node"):
        node = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()
        print(f"node {node}")
        if int(node.lstrip("v").split(".")[0]) < 22:
            problems.append(f"node {node} is older than 22")
    env = ROOT / ".env"
    if not env.exists():
        problems.append("no .env: copy .env.example to .env and fill RALLY_API_KEY, RALLY_WORKSPACE, RALLY_PROJECT")
    else:
        keys = {line.split("=", 1)[0] for line in env.read_text().splitlines() if "=" in line and not line.startswith("#")}
        problems += [f".env is missing {k}" for k in ("RALLY_API_KEY", "RALLY_WORKSPACE", "RALLY_PROJECT") if k not in keys]
    if not (ROOT / "web" / "node_modules").exists():
        problems.append("web/node_modules missing: cd web && npm install")
    for name, svc in SERVICES.items():
        ours = pid_of(args, name)
        state = "UP (this instance)" if ours else ("BUSY (not this instance)" if port_open(svc["port"]) else "free")
        print(f"port {svc['port']} ({name}): {state}")
        if state.startswith("BUSY"):
            problems.append(f"port {svc['port']} is used by another process or instance; leave it alone")
    for p in problems:
        print(f"problem: {p}")
    if problems:
        raise Usage(f"{len(problems)} problem(s) above")
    print("doctor: ok")


# ---------- stack ----------
def wait_http(url: str, timeout: float, name: str) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if httpx.get(url, timeout=2).status_code < 500:
                print(f"{name}: healthy ({url})")
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise Fail(f"{name} did not become healthy at {url}; see `rallypoc stack logs`")


def stack_up(args) -> None:
    d = state_dir(args)
    for name, svc in SERVICES.items():
        if pid_of(args, name):
            print(f"{name}: already up")
            continue
        if port_open(svc["port"]):
            raise Usage(f"port {svc['port']} is busy and not ours; run `rallypoc doctor`")
        log_path = d / "logs" / f"{name}.log"
        echo(f"(cd {svc['cwd'].relative_to(ROOT)} && {' '.join(svc['cmd'])}) >> {log_path}")
        with open(log_path, "ab") as log:
            p = subprocess.Popen(svc["cmd"], cwd=svc["cwd"], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        (d / "pids" / f"{name}.pid").write_text(str(p.pid))
    for name, svc in SERVICES.items():
        wait_http(svc["health"], 90, name)
    print("stack: up")


def stack_down(args) -> None:
    for name in SERVICES:
        pid = pid_of(args, name)
        if not pid:
            print(f"{name}: not running (this instance)")
            continue
        echo(f"kill -TERM -{pid}")
        os.killpg(pid, signal.SIGTERM)
        for _ in range(40):
            try:
                os.kill(pid, 0)
                time.sleep(0.25)
            except ProcessLookupError:
                break
        (state_dir(args) / "pids" / f"{name}.pid").unlink(missing_ok=True)
        print(f"{name}: stopped")


def stack_status(args) -> None:
    unhealthy = 0
    for name, svc in SERVICES.items():
        pid = pid_of(args, name)
        healthy = False
        if pid:
            try:
                healthy = httpx.get(svc["health"], timeout=2).status_code < 500
            except httpx.HTTPError:
                pass
        print(f"{name}: {'UP' if pid else 'DOWN'}{' healthy' if healthy else ''}")
        unhealthy += 0 if healthy else 1
    if unhealthy:
        raise Fail(f"{unhealthy} service(s) not healthy")


def stack_logs(args) -> None:
    for name in [args.service] if args.service else list(SERVICES):
        f = state_dir(args) / "logs" / f"{name}.log"
        print(f"==> {f}")
        if f.exists():
            print("\n".join(f.read_text(errors="replace").splitlines()[-args.lines:]))


def cmd_stack(args) -> None:
    if args.action == "restart":
        stack_down(args)
        stack_up(args)
        return
    {"up": stack_up, "down": stack_down, "status": stack_status, "logs": stack_logs}[args.action](args)


# ---------- api ----------
def cmd_api(args) -> None:
    body = json.loads(args.json) if args.json else None
    deadline = time.time() + args.timeout
    while True:
        status, data = api_call(args.method, args.path, body)
        try:
            value = pick(data, args.field) if args.field else data
        except (KeyError, IndexError, TypeError, ValueError):
            value = None
        ok = (args.expect is None or status == args.expect) and (
            args.until is None or str(value) == args.until or json.dumps(value) == args.until)
        if ok or args.until is None or time.time() > deadline:
            break
        time.sleep(1)
    print(f"HTTP {status}")
    print(value[:6000] if isinstance(value, str) else json.dumps(value, indent=1)[:6000])
    if args.save:
        out = state_dir(args) / "evidence" / f"{args.save}.json"
        out.write_text(json.dumps(data, indent=1))
        print(f"saved {out}")
    if not ok:
        raise Fail(f"expected status {args.expect}" + (f" and {args.field} == {args.until}" if args.until else ""))


# ---------- browser ----------
def cmd_browser(args) -> None:
    if args.action == "install":
        if run([sys.executable, "-m", "playwright", "install", "chromium"]) != 0:
            raise Fail("playwright install failed")
        return
    from playwright.sync_api import sync_playwright

    sys.path.insert(0, str(HERE))
    import flows

    ev = state_dir(args) / "evidence"
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception as e:  # noqa: BLE001 - any launch failure means the browser is missing
            raise Usage(f"Chromium for Playwright is not installed ({e.__class__.__name__}); run `rallypoc browser install`")
        try:
            if args.action == "snapshot":
                page = browser.new_page(viewport={"width": 1280, "height": 800})
                echo(f"goto {flows.WEB}{args.target}")
                page.goto(flows.WEB + args.target)
                page.wait_for_load_state("networkidle")
                slug = args.target.strip("/").replace("/", "-") or "root"
                page.screenshot(path=str(ev / f"snapshot-{slug}.png"))
                (ev / f"snapshot-{slug}.aria.yaml").write_text(page.locator("body").aria_snapshot())
                print(f"saved {ev / f'snapshot-{slug}.png'} and .aria.yaml")
                return
            names = list(flows.FLOWS) if args.target == "all" else [args.target]
            unknown = [n for n in names if n not in flows.FLOWS]
            if unknown:
                raise Usage(f"unknown flow {unknown[0]!r}; flows: {', '.join(flows.FLOWS)}")
            failed = 0
            for name in names:
                page = browser.new_page(viewport={"width": 1280, "height": 800})
                shot = ev / f"flow-{name}.png"
                echo(f"flow {name}")
                try:
                    flows.FLOWS[name](page)
                    result, reason = "PASS", ""
                except Exception as e:  # noqa: BLE001 - report every failure as FAIL with its first line
                    result, reason = "FAIL", f"{e.__class__.__name__}: {str(e).splitlines()[0][:200] if str(e) else ''}"
                    failed += 1
                page.screenshot(path=str(shot))
                page.close()
                record(args, f"browser:{name}", result, shot, reason)
            if failed:
                raise Fail(f"{failed} flow(s) failed")
        finally:
            browser.close()


# ---------- test / seed / evidence / cleanup / report ----------
def cmd_test(args) -> None:
    steps = [(["uv", "run", "pytest", "-q"], ROOT / "server"),
             (["npx", "vitest", "--run"], ROOT / "web"),
             (["npm", "run", "typecheck"], ROOT / "web")]
    failed = 0
    for cmd, cwd in steps:
        code = run(cmd, cwd)
        record(args, "test:" + " ".join(cmd), "PASS" if code == 0 else "FAIL")
        failed += code != 0
    if failed:
        raise Fail(f"{failed} test step(s) failed")


def cmd_seed(args) -> None:
    print("seed writes only [DEMO] items tagged collabathon-demo in RALLY_PROJECT (approved exception, see SKILL.md)")
    if run(["uv", "run", "--quiet", "--script", "scripts/seed_demo.py"]) != 0:
        raise Fail("seed failed")


def cmd_evidence(args) -> None:
    ev = state_dir(args) / "evidence"
    if args.action == "dir":
        print(ev)
    else:
        for f in sorted(ev.iterdir()):
            print(f"{f.stat().st_size:>9}  {f}")


def cmd_cleanup(args) -> None:
    stack_down(args)
    print(f"evidence kept at {state_dir(args) / 'evidence'}")


def cmd_report(args) -> None:
    f = state_dir(args) / "evidence" / "results.jsonl"
    rows = [json.loads(line) for line in f.read_text().splitlines()] if f.exists() else []
    latest: dict[str, dict] = {}
    for r in rows:
        latest[r["check"]] = r
    sha = subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    fails = [r for r in latest.values() if r["result"] == "FAIL"]
    verdict = "FAIL" if fails else ("PASS" if latest else "PARTIAL")
    print(f"1. **Verdict**: {verdict} at {sha}, platform {sys.platform}, instance {instance(args)}\n")
    print("2. **Checks**\n\n| check | result | evidence | reason |\n|---|---|---|---|")
    for r in latest.values():
        print(f"| {r['check']} | {r['result']} | {r['evidence']} | {r['reason']} |")
    print("\n3. **Deployed-environment differences**: nothing is deployed. The POC talks to the real Rally workspace "
          "directly, so Rally behaviour is the real thing, and multi-user hosting is untested (spec §13).")
    print("4. **Findings**: <ranked blocker / should-fix / nit with file:line>")
    print("5. **Needs the user**: <approvals, expired API key, decisions>")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="rallypoc", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--instance", help="names this run (default: $RALLY_POC_VERIFY_INSTANCE or 'default')")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="check tools, ports and .env").set_defaults(fn=cmd_doctor)
    s = sub.add_parser("stack", help="start/stop the proxy and web dev server", epilog="example: rallypoc stack up")
    s.add_argument("action", choices=["up", "down", "status", "logs", "restart"])
    s.add_argument("--service", choices=list(SERVICES))
    s.add_argument("--lines", type=int, default=50)
    s.set_defaults(fn=cmd_stack)
    a = sub.add_parser("api", help="call the proxy",
                       epilog="examples: rallypoc api GET /api/bootstrap --expect 200 --field me.name\n"
                              "          rallypoc api GET /api/health --until true --field ok")
    a.add_argument("method", choices=["GET", "POST", "PATCH", "DELETE"])
    a.add_argument("path")
    a.add_argument("--json", help="request body as JSON")
    a.add_argument("--expect", type=int, help="expected HTTP status")
    a.add_argument("--field", help="dotted path to print/compare, e.g. issues[0].name")
    a.add_argument("--until", help="poll until --field equals this value")
    a.add_argument("--timeout", type=float, default=30)
    a.add_argument("--save", help="save the response to evidence/<name>.json")
    a.set_defaults(fn=cmd_api)
    b = sub.add_parser("browser", help="Playwright flows and snapshots",
                       epilog="examples: rallypoc browser run all | rallypoc browser snapshot / | rallypoc browser install")
    b.add_argument("action", choices=["run", "snapshot", "install"])
    b.add_argument("target", nargs="?", default="all", help="flow name or 'all' (run); URL path (snapshot)")
    b.set_defaults(fn=cmd_browser)
    sub.add_parser("test", help="pytest + vitest + typecheck").set_defaults(fn=cmd_test)
    sub.add_parser("seed", help="create or reset the [DEMO] data in Rally").set_defaults(fn=cmd_seed)
    e = sub.add_parser("evidence", help="where evidence lives")
    e.add_argument("action", choices=["dir", "list"])
    e.set_defaults(fn=cmd_evidence)
    sub.add_parser("cleanup", help="stop this instance's processes; keep evidence").set_defaults(fn=cmd_cleanup)
    sub.add_parser("report", help="print the report skeleton with latest results").set_defaults(fn=cmd_report)
    for name, reason in NOT_APPLICABLE.items():
        n = sub.add_parser(name, help=f"not applicable: {reason}")
        n.add_argument("rest", nargs="*")
        n.set_defaults(fn=lambda _args, r=reason: print(f"not applicable: {r}"))
    args = p.parse_args(argv)
    try:
        args.fn(args)
        return 0
    except Fail as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return 1
    except Usage as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Write the first browser flow**

`.claude/skills/verify-rally-poc/flows.py`:

```python
"""Playwright flows for `rallypoc browser run <flow>`. Each drives the real app and raises on failure."""
from collections.abc import Callable

from playwright.sync_api import Page, expect

WEB = "http://127.0.0.1:5173"
FLOWS: dict[str, Callable[[Page], None]] = {}


def flow(fn: Callable[[Page], None]) -> Callable[[Page], None]:
    FLOWS[fn.__name__.replace("_", "-")] = fn
    return fn


@flow
def smoke(page: Page) -> None:
    page.goto(WEB)
    expect(page.get_by_text("Rally POC")).to_be_visible()
```

- [ ] **Step 4: Write the demo-data scripts**

`scripts/rally_demo.py`:

```python
"""Shared helpers for the [DEMO] data scripts: .env loading, Rally calls, and the demo-only write guard.

Writes are allowed only in RALLY_PROJECT and only for items whose name starts with "[DEMO] ".
"""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "[DEMO] "
TAG = "collabathon-demo"
NOTE = "<p><b>DEMO data</b> for the Rally/Linear collabathon POC. Safe to delete.</p>"


def load_env() -> dict[str, str]:
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip("'\"")
    return env


ENV = load_env()
BASE = ENV.get("RALLY_BASE_URL", "https://rally1.rallydev.com/slm/webservice/v2.0")
PROJECT = f"/project/{ENV['RALLY_PROJECT']}"
SCOPE = f"project={PROJECT}&projectScopeUp=false&projectScopeDown=false"


def call(method: str, path: str, body: dict | None = None) -> dict:
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(
        url, method=method, data=None if body is None else json.dumps(body).encode(),
        headers={"ZSESSIONID": ENV["RALLY_API_KEY"], "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    res = next(iter(j.values())) if len(j) == 1 else j
    if isinstance(res, dict) and res.get("Errors"):
        raise RuntimeError(f"{method} {path}: {'; '.join(res['Errors'])}")
    return j


def q(s: str) -> str:
    return urllib.parse.quote(s)


def short(ref: str) -> str:
    return ref.split("/webservice/v2.0", 1)[-1]


def assert_demo(name: str, project: str = PROJECT) -> None:
    if not name.startswith(PREFIX):
        raise RuntimeError(f"refusing write without {PREFIX!r} prefix: {name}")
    if project != PROJECT:
        raise RuntimeError(f"refusing write outside {PROJECT}: {project}")


def query(type_path: str, query_str: str = "", fetch: str = "ObjectID,FormattedID,Name",
          order: str | None = None, scoped: bool = True) -> list[dict]:
    params = [SCOPE] if scoped else []
    params += [f"fetch={fetch}", "pagesize=200"]
    if query_str:
        params.append(f"query={q(query_str)}")
    if order:
        params.append(f"order={q(order)}")
    return call("GET", f"/{type_path}?{'&'.join(params)}")["QueryResult"]["Results"]


def demo_tag_ref(create: bool = False) -> str | None:
    rows = query("tag", f'(Name = "{TAG}")', fetch="Name", scoped=False)
    if rows:
        return short(rows[0]["_ref"])
    if not create:
        return None
    return short(call("POST", "/tag/create", {"Tag": {"Name": TAG}})["CreateResult"]["Object"]["_ref"])


def current_iteration() -> dict | None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    rows = query("iteration", f'((StartDate <= "{now}") AND (EndDate >= "{now}"))', fetch="ObjectID,Name,StartDate,EndDate")
    return rows[0] if rows else None
```

`scripts/seed_demo.py`:

```python
#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Create or reset the [DEMO] dataset (spec §10). Idempotent: items are found by name and reset to seeded values."""
import sys

from rally_demo import NOTE, PROJECT, assert_demo, call, current_iteration, demo_tag_ref, q, query, short

CHAIN = [("portfolioitem/program", "PortfolioItem/Program"),
         ("portfolioitem/outcome", "PortfolioItem/Outcome"),
         ("portfolioitem/capability", "PortfolioItem/Capability")]
CHAIN_NAME = "[DEMO] Collabathon Rally client POC"
FEATURES = ["[DEMO] Linear-style Rally client", "[DEMO] Rally sync reliability"]
# (name, feature index, schedule state, plan estimate, in current sprint?)
STORIES = [
    ("[DEMO] My Work view with keyboard navigation", 0, "In-Progress", 5, True),
    ("[DEMO] Command palette (⌘K) actions", 0, "In-Progress", 3, True),
    ("[DEMO] Story editor with HTML round-trip", 0, "Defined", 5, True),
    ("[DEMO] Iteration board drag to change state", 0, "Completed", 3, True),
    ("[DEMO] Optimistic writes with rollback", 1, "Accepted", 2, True),
    ("[DEMO] Backlog drag-to-rank", 0, "Defined", 8, False),
    ("[DEMO] Poll Rally for remote changes", 1, "Defined", 3, False),
    ("[DEMO] Bulk move stories to an iteration", 0, "Defined", 5, False),
]
TASKS = [("[DEMO] Fetch working set from proxy", 3), ("[DEMO] Wire J/K and S shortcuts", 2)]


def upsert(type_path: str, type_key: str, fields: dict, reset: tuple[str, ...] = ()) -> dict:
    assert_demo(fields["Name"], fields["Project"])
    rows = query(type_path, f'(Name = "{fields["Name"]}")')
    if rows:
        obj = rows[0]
        if reset:
            call("POST", f"/{type_path}/{obj['ObjectID']}", {type_key: {k: fields[k] for k in reset}})
            print(f"reset   {obj['FormattedID']} {fields['Name']}")
        else:
            print(f"exists  {obj['FormattedID']} {fields['Name']}")
        return obj
    obj = call("POST", f"/{type_path}/create?fetch=ObjectID,FormattedID,Name", {type_key: fields})["CreateResult"]["Object"]
    print(f"created {obj['FormattedID']} {fields['Name']}")
    return obj


def main() -> int:
    tags = [{"_ref": demo_tag_ref(create=True)}]
    iteration = current_iteration()
    if not iteration:
        print("no current iteration in the project; cannot seed sprint stories", file=sys.stderr)
        return 1
    me = short(call("GET", "/user?fetch=ObjectID")["User"]["_ref"])
    parent = None
    for type_path, type_key in CHAIN:
        fields = {"Name": CHAIN_NAME, "Project": PROJECT, "Description": NOTE, "Tags": tags}
        if parent:
            fields["Parent"] = short(parent["_ref"])
        parent = upsert(type_path, type_key, fields)
    features = [upsert("portfolioitem/feature", "PortfolioItem/Feature",
                       {"Name": n, "Project": PROJECT, "Parent": short(parent["_ref"]), "Description": NOTE, "Tags": tags})
                for n in FEATURES]
    stories = []
    for name, fi, state, estimate, in_sprint in STORIES:
        fields = {"Name": name, "Project": PROJECT, "Owner": me, "PortfolioItem": short(features[fi]["_ref"]),
                  "Iteration": short(iteration["_ref"]) if in_sprint else None, "ScheduleState": state,
                  "PlanEstimate": estimate, "Description": NOTE, "Tags": tags}
        stories.append(upsert("hierarchicalrequirement", "HierarchicalRequirement", fields,
                              reset=("Iteration", "ScheduleState", "PlanEstimate", "Owner")))
    for name, todo in TASKS:
        upsert("task", "Task", {"Name": name, "Project": PROJECT, "Owner": me, "WorkProduct": short(stories[0]["_ref"]),
                                "State": "Defined", "ToDo": todo, "Estimate": todo, "Description": NOTE, "Tags": tags},
               reset=("State", "ToDo"))
    backlog = [s for s, spec in zip(stories, STORIES) if not spec[4]]
    for above, below in zip(backlog, backlog[1:]):
        call("POST", f"/hierarchicalrequirement/{below['ObjectID']}?rankBelow={q(short(above['_ref']))}",
             {"HierarchicalRequirement": {}})
    print(f"backlog order reset; sprint: {iteration['Name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`scripts/cleanup_demo.py`:

```python
#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""List, then with --yes delete, every [DEMO] item in the project: tasks, stories, features, then the chain."""
import sys

from rally_demo import PREFIX, TAG, assert_demo, call, query, short

ORDER = ["task", "hierarchicalrequirement", "defect", "portfolioitem/feature",
         "portfolioitem/capability", "portfolioitem/outcome", "portfolioitem/program"]


def main() -> int:
    yes = "--yes" in sys.argv
    total = 0
    for type_path in ORDER:
        rows = query(type_path, f'((Name contains "{PREFIX.strip()}") AND (Tags.Name = "{TAG}"))',
                     fetch="ObjectID,FormattedID,Name,Project")
        for r in rows:
            if not r["Name"].startswith(PREFIX):
                continue
            assert_demo(r["Name"], short(r["Project"]["_ref"]))
            total += 1
            if yes:
                call("DELETE", f"/{type_path}/{r['ObjectID']}")
                print(f"deleted      {r['FormattedID']} {r['Name']}")
            else:
                print(f"would delete {r['FormattedID']} {r['Name']}")
    suffix = "" if yes else " (dry run; pass --yes to delete)"
    print(f"{total} item(s){suffix}. The workspace tag {TAG!r} is left in place.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Run `chmod +x scripts/seed_demo.py scripts/cleanup_demo.py .claude/skills/verify-rally-poc/rallypoc`.

- [ ] **Step 5: Fill in the verify skill's blanks**

In `.claude/skills/verify-rally-poc/SKILL.md`, make these replacements (the template text is quoted exactly):

1. Replace `<!-- table: deployed resource | local stand-in, one row per service, datastore, proxy, LLM/cloud service. The parity check must diff this against the IaC and exit 1 on drift. -->` with:

```markdown
Nothing is deployed. The POC runs on one laptop and talks to the real Rally workspace, so there is no IaC to diff and `rallypoc parity check` prints "not applicable".

| Piece | Local process |
|---|---|
| Proxy (FastAPI, `server/`) | `uv run uvicorn app.main:app` on 127.0.0.1:8787 |
| Web client (Vite, `web/`) | `npm run dev` on 127.0.0.1:5173, proxying `/api` |
| Rally | The real Rally workspace via `RALLY_API_KEY` in `.env`. `WRITE_GUARD=demo` limits writes to `[DEMO]` items |
```

2. In the Launch block, replace `$CC stack up        # build -> up -> migrate -> health` with `$CC stack up        # proxy + web, waits for /api/health and the web root`, and replace `$CC seed            # synthetic data only` with `$CC seed            # resets the [DEMO] items in Rally (approved exception below)`.

3. Replace `<!-- table: need | command. api as a role, browser flow, poll with --until, logs, db query (read-only), failure injection -->` with:

```markdown
| Need | Command |
|---|---|
| Call the proxy | `$CC api GET /api/bootstrap --expect 200 --field me.name` |
| Wait for a value | `$CC api GET /api/health --field ok --until True` |
| Live API checks (spec §9.1) | `$CC check api` |
| One browser flow / all flows | `$CC browser run my-work` / `$CC check ui` |
| Screenshot + accessibility tree | `$CC browser snapshot /` |
| Logs | `$CC stack logs --service server` |
| Rally unreachable | Stop the network or point `RALLY_BASE_URL` at `http://127.0.0.1:9` in `.env`, then `$CC stack restart`. Expect 502/504 from the proxy and the "Showing cached data" banner |
```

4. Replace `<!-- table: CI job or practice | command -->` with `There is no CI for the POC. Run \`$CC test\` (pytest, vitest, typecheck) before every commit.`

5. Replace `<!-- read-only status command; deploy rehearsal if any; "Things local cannot reproduce" list to include in every report -->` with:

```markdown
Nothing is deployed, so `$CC aws status` prints "not applicable". Things local cannot reproduce: multi-user use (each user runs their own proxy with their own key), and network conditions between MSK and Rally other than this laptop's.
```

6. Under "## Never without asking", after the line `- any write against a deployed environment's app.`, add:

```markdown

**Approved exception (2026-10-16, by the user):** writes to Rally are allowed only for `[DEMO]`-prefixed items tagged `collabathon-demo` in the configured `RALLY_PROJECT` (Team - Data Services). `$CC seed`, `$CC check api`, and UI flows that change demo items use this exception. Anything else in Rally is read-only. `scripts/cleanup_demo.py --yes` deletes the demo tree, so run it only when the user asks.
```

- [ ] **Step 6: Fill in the feature map README, journeys and the first area**

In `.claude/skills/rally-poc-feature-map/features/README.md`, make these replacements:

1. `Scope: <!-- which directories and services this map covers, and what it deliberately leaves out -->` → `Scope: \`server/\` (proxy, adapter, write guard), \`web/\` (client), \`scripts/\` (demo data). Rally itself is out of scope.`
2. Replace the `Snapshot (\`aws status\`, <YYYY-MM-DD>):` line and the bullet under it with:

```markdown
Snapshot (not deployed, 2026-10-16):
- Nothing is deployed. The POC runs on one laptop against the real Rally workspace.
```

3. `<!-- open PRs / branches whose code is NOT in the entries, with a one-line description each. Refresh with \`{{CLI}} scope list\`. -->` (with `rallypoc` substituted for `{{CLI}}` by the scaffold) → `None.`
4. Replace the sentence that begins `State here what CI actually does today` with `There is no CI for the POC. Every test result in this map is a local \`rallypoc test\` run.`
5. In the Index table, replace the header date placeholder `<YYYY-MM-DD>` with `2026-10-16`, and the row `| [example.md](example.md) | One-line scope | all | beta |` with `| [rally-proxy.md](rally-proxy.md) | FastAPI proxy, Rally adapter, write guard | all | beta |`.
6. Under "## Sweep order", replace `1. example` with `1. rally-proxy`.

Replace `.claude/skills/rally-poc-feature-map/features/multi-surface-journeys.md` with:

```markdown
# Multi-surface journeys

Last verified: (none yet) on 2026-10-16 (source)

A journey crosses areas, so it can fail where no single area file looks. Each one names the sub-feature IDs it touches, the invariant that must hold across areas, the last live result, and the commands to drive it. Journeys run in the order below, and each assumes the state the one before it left.

| ID | Journey | Areas | Last live | Result |
|---|---|---|---|---|
```

The area file `.claude/skills/rally-poc-feature-map/features/rally-proxy.md` is written in Step 9, after the code commit, so its `Since` hash is real. This is the heredoc Step 9 runs:

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/rally-proxy.md <<EOF
# Rally proxy

Last verified: $SHA on $TODAY (live)

The local FastAPI process between the web client and Rally. It holds the API key, maps Rally objects to domain objects, and refuses non-demo writes while \`WRITE_GUARD=demo\`. No user sees it directly. Overall: beta while only the health endpoint exists.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| rally-proxy-health | \`GET /api/health\` answers without touching Rally | stable | API | $SHA | $TODAY | \`server/tests/test_health.py::test_health_needs_no_rally\` |

## How to get to it (user POV)

No user path. The web client calls it.

## Driving it

Preconditions: baseline.

- **rally-proxy-health**: check health → \`rallypoc api GET /api/health --expect 200 --field ok\` → prints \`true\`

## Gotchas

- **Single instance.** The ports are fixed (8787/5173), so only one verify instance can run at a time.
EOF
````

- [ ] **Step 7: Drive the CLI**

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC --help | head -5
$CC doctor
$CC stack up
$CC api GET /api/health --expect 200 --field ok
$CC browser install
$CC browser run smoke
$CC test
$CC seed
uv run --quiet --script scripts/cleanup_demo.py      # dry run only: lists, deletes nothing
$CC stack down
.claude/skills/rally-poc-feature-map/render-map
```

Expected:
- `doctor: ok`
- `stack: up`
- `HTTP 200` and `true`
- `browser:smoke  PASS  /tmp/rally-poc-verify/default/evidence/flow-smoke.png`
- Three `PASS` test lines.
- Seed prints an `exists` or `reset` line for each of the 15 items (no `created`, because the data already exists), then `backlog order reset; sprint: …`.
- Cleanup prints `15 item(s) (dry run; pass --yes to delete)`: 3 chain + 2 features + 8 stories + 2 tasks. Every listed name starts with `[DEMO] `.
- render-map exits 0 and prints `wrote /tmp/rally-poc-feature-map.html: 0 sub-features, 0 areas, 0 journeys`. The area file is written in Step 9.

- [ ] **Step 8: Commit the kit and scripts**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add verify kit, rallypoc CLI and demo-data scripts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Write the area file with the real hash, render, commit**

Run the `rally-proxy.md` heredoc from Step 6, then:

```bash
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the rally-proxy area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Expected: render-map writes `1 sub-features, 1 areas`.

---
### Task 3: Domain model and Rally mapping

**Files:**
- Create: `server/app/domain.py`, `server/app/mapping.py`
- Create: `server/tests/fixtures.py`, `server/tests/test_mapping.py`

**Interfaces:**
- Produces:
  - **Domain models in `app.domain`:** `User`, `Iteration`, `Feature`, `Issue`, `Task`, `Project`, `Bootstrap`, `Changes`, `IssueDetail`, `IssuePatch`, `TaskPatch`, `IssueCreate`, `RankRequest`, plus the literals `ScheduleState`, `TaskState` and `IssueKind`. Field names are exactly as in the code below. `web/src/api/types.ts` (Task 8) mirrors them.
  - **`app.mapping` converters:** `oid(value) -> int | None`, `ref(type_path, id) -> str | None`, `user_from_rally`, `tag_names`, `issue_from_rally`, `task_from_rally`, `iteration_from_rally`, `feature_from_rally`, `issue_patch_to_rally(patch, kind, tag_refs=None) -> dict`, `task_patch_to_rally(patch) -> dict`.
  - **`app.mapping` query helpers:** `quoted(value)`, `or_query(clauses)`, `and_query(clauses)`, `iso(dt) -> str`.
  - **`app.mapping` constants:** `KIND_BY_TYPE`, `TYPE_PATH`, `TYPE_KEY`, `ISSUE_FETCH`, `TASK_FETCH`, `ITERATION_FETCH`, `FEATURE_FETCH`.
  - **`tests.fixtures`:** `BASE`, `PROJECT_ID`, `WORKSPACE_ID`, `DEMO_TAG`, `ME`, `tags(*names)`, `ref_obj(path)`, `rally_story(**over)`, `rally_defect(**over)`, `rally_task(**over)`, `rally_iteration(...)`, `rally_feature(...)`, `operation_result(obj)`, `create_result(obj)`.

- [ ] **Step 1: Write the synthetic fixtures**

`server/tests/fixtures.py`:

```python
"""Synthetic Rally WSAPI objects shaped like the real responses (spec §6). No real identifiers."""
BASE = "https://rally.example/slm/webservice/v2.0"
PROJECT_ID = 9001
WORKSPACE_ID = 8001
DEMO_TAG = "collabathon-demo"
ME = {"_ref": f"{BASE}/user/501", "_refObjectName": "Dana Demo", "ObjectID": 501, "DisplayName": "Dana Demo"}


def ref_obj(path: str, name: str | None = None) -> dict:
    obj = {"_ref": f"{BASE}/{path}"}
    if name:
        obj["_refObjectName"] = name
    return obj


def tags(*names: str) -> dict:
    return {"Count": len(names),
            "_tagsNameArray": [{"Name": n, "_ref": f"{BASE}/tag/{7000 + i}"} for i, n in enumerate(names)]}


def rally_story(**over) -> dict:
    base = {
        "_type": "HierarchicalRequirement", "_ref": f"{BASE}/hierarchicalrequirement/1001",
        "ObjectID": 1001, "FormattedID": "US1001", "Name": "[DEMO] Example story", "ScheduleState": "In-Progress",
        "Owner": ref_obj("user/501", "Dana Demo"), "Iteration": ref_obj("iteration/301", "Sprint 3"), "Release": None,
        "Feature": ref_obj("portfolioitem/feature/201", "[DEMO] Feature A"),
        "PortfolioItem": ref_obj("portfolioitem/feature/201"), "Project": ref_obj(f"project/{PROJECT_ID}", "Demo Team"),
        "PlanEstimate": 5.0, "Blocked": False, "Tags": tags(DEMO_TAG), "Description": "<p>Hello</p>",
        "LastUpdateDate": "2026-10-16T06:25:17.000Z", "DirectChildrenCount": 0,
    }
    base.update(over)
    return base


def rally_defect(**over) -> dict:
    base = rally_story(_type="Defect", _ref=f"{BASE}/defect/1101", ObjectID=1101, FormattedID="DE1101",
                       Name="[DEMO] Example defect", Feature=None, Owner=None)
    del base["PortfolioItem"], base["DirectChildrenCount"]
    base.update(over)
    return base


def rally_task(**over) -> dict:
    base = {
        "_type": "Task", "_ref": f"{BASE}/task/4001", "ObjectID": 4001, "FormattedID": "TA4001",
        "Name": "[DEMO] Example task", "State": "Defined", "Owner": ref_obj("user/501", "Dana Demo"), "ToDo": 3.0,
        "WorkProduct": ref_obj("hierarchicalrequirement/1001"), "Project": ref_obj(f"project/{PROJECT_ID}"),
        "Tags": tags(DEMO_TAG), "LastUpdateDate": "2026-10-16T06:25:17.000Z", "TaskIndex": 0,
    }
    base.update(over)
    return base


def rally_iteration(object_id: int, name: str, start: str, end: str) -> dict:
    return {"_ref": f"{BASE}/iteration/{object_id}", "ObjectID": object_id, "Name": name, "StartDate": start, "EndDate": end}


def rally_feature(object_id: int, formatted_id: str, name: str) -> dict:
    return {"_ref": f"{BASE}/portfolioitem/feature/{object_id}", "ObjectID": object_id, "FormattedID": formatted_id, "Name": name}


def operation_result(obj: dict) -> dict:
    return {"OperationResult": {"Errors": [], "Warnings": [], "Object": obj}}


def create_result(obj: dict) -> dict:
    return {"CreateResult": {"Errors": [], "Warnings": [], "Object": obj}}
```

- [ ] **Step 2: Write the failing mapping tests**

`server/tests/test_mapping.py`:

```python
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.domain import IssuePatch, RankRequest, TaskPatch
from app.mapping import (and_query, issue_from_rally, issue_patch_to_rally, iso, oid, or_query, quoted,
                         task_from_rally, task_patch_to_rally, user_from_rally)
from tests.fixtures import BASE, DEMO_TAG, PROJECT_ID, rally_defect, rally_story, rally_task, tags


def test_story_maps_to_issue():
    issue = issue_from_rally(rally_story())
    assert issue.id == 1001 and issue.formatted_id == "US1001" and issue.kind == "story"
    assert issue.state == "In-Progress"
    assert issue.owner is not None and issue.owner.id == 501 and issue.owner.name == "Dana Demo"
    assert issue.iteration_id == 301 and issue.release_id is None
    assert issue.feature_id == 201 and issue.project_id == PROJECT_ID
    assert issue.estimate == 5.0 and issue.blocked is False and issue.tags == [DEMO_TAG]
    assert issue.description == "<p>Hello</p>" and issue.has_children is False


def test_defect_has_no_feature_and_may_be_unowned():
    issue = issue_from_rally(rally_defect())
    assert issue.kind == "defect" and issue.feature_id is None and issue.owner is None


def test_missing_tags_and_description_become_empty():
    issue = issue_from_rally(rally_story(Tags=None, Description=None))
    assert issue.tags == [] and issue.description == ""


def test_story_without_feature_ancestor_falls_back_to_portfolio_item():
    issue = issue_from_rally(rally_story(Feature=None))
    assert issue.feature_id == 201


def test_oid_reads_objects_and_refs():
    assert oid({"ObjectID": 7}) == 7
    assert oid({"_ref": f"{BASE}/iteration/301"}) == 301
    assert oid(f"{BASE}/user/501") == 501
    assert oid(None) is None


def test_user_from_rally_handles_null():
    assert user_from_rally(None) is None


def test_patch_maps_only_fields_that_were_set():
    assert issue_patch_to_rally(IssuePatch(state="Completed"), "story") == {"ScheduleState": "Completed"}


def test_patch_null_owner_and_iteration_clear_them():
    out = issue_patch_to_rally(IssuePatch(owner_id=None, iteration_id=None), "story")
    assert out == {"Owner": None, "Iteration": None}


def test_patch_refs_use_type_paths():
    out = issue_patch_to_rally(IssuePatch(owner_id=502, iteration_id=302, feature_id=202), "story")
    assert out == {"Owner": "/user/502", "Iteration": "/iteration/302", "PortfolioItem": "/portfolioitem/feature/202"}


def test_defects_cannot_take_a_feature():
    with pytest.raises(ValueError, match="only stories"):
        issue_patch_to_rally(IssuePatch(feature_id=202), "defect")


def test_tags_need_resolved_refs():
    with pytest.raises(ValueError, match="resolve tag names"):
        issue_patch_to_rally(IssuePatch(tags=["ux"]), "story")
    out = issue_patch_to_rally(IssuePatch(tags=["ux"]), "story", tag_refs=["/tag/7005"])
    assert out == {"Tags": [{"_ref": "/tag/7005"}]}


def test_patch_rejects_null_for_required_fields_and_unknown_fields():
    with pytest.raises(ValidationError):
        IssuePatch(state=None)
    with pytest.raises(ValidationError):
        IssuePatch.model_validate({"priority": "High"})
    with pytest.raises(ValidationError):
        TaskPatch(name=None)


def test_rank_request_needs_exactly_one_side():
    with pytest.raises(ValidationError):
        RankRequest()
    with pytest.raises(ValidationError):
        RankRequest(above=1, below=2)
    assert RankRequest(below=3).below == 3


def test_task_maps_and_patches():
    task = task_from_rally(rally_task(Tags=tags()))
    assert task.id == 4001 and task.issue_id == 1001 and task.state == "Defined" and task.todo == 3.0 and task.tags == []
    assert task_patch_to_rally(TaskPatch(state="Completed", todo=0)) == {"State": "Completed", "ToDo": 0}


def test_query_helpers_nest_binary_clauses():
    assert or_query(["ObjectID = 1"]) == "(ObjectID = 1)"
    assert or_query(["A = 1", "B = 2", "C = 3"]) == "(((A = 1) OR (B = 2)) OR (C = 3))"
    assert and_query(["A = 1", "B = 2"]) == "((A = 1) AND (B = 2))"
    assert quoted("ux") == '"ux"'
    with pytest.raises(ValueError):
        quoted('bad"tag')


def test_iso_matches_rally_format():
    assert iso(datetime(2026, 10, 16, 6, 25, 17, 120000, tzinfo=timezone.utc)) == "2026-10-16T06:25:17.120Z"
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd server && uv run pytest tests/test_mapping.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.domain'`.

- [ ] **Step 4: Write the domain model**

`server/app/domain.py`:

```python
"""Domain model shared by the API and the adapter. Nothing here knows Rally's shapes (spec D2)."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

ScheduleState = Literal["Defined", "In-Progress", "Completed", "Accepted"]
TaskState = Literal["Defined", "In-Progress", "Completed"]
IssueKind = Literal["story", "defect"]


class User(BaseModel):
    id: int
    name: str


class Iteration(BaseModel):
    id: int
    name: str
    start: str
    end: str


class Feature(BaseModel):
    id: int
    formatted_id: str
    name: str


class Project(BaseModel):
    id: int
    name: str


class Issue(BaseModel):
    id: int
    formatted_id: str
    kind: IssueKind
    name: str
    state: ScheduleState
    owner: User | None
    iteration_id: int | None
    release_id: int | None
    feature_id: int | None
    project_id: int
    estimate: float | None
    blocked: bool
    tags: list[str]
    description: str
    updated_at: str
    has_children: bool


class Task(BaseModel):
    id: int
    formatted_id: str
    name: str
    state: TaskState
    owner: User | None
    todo: float | None
    issue_id: int
    project_id: int
    tags: list[str]
    updated_at: str


class Bootstrap(BaseModel):
    me: User
    project: Project
    write_guard: Literal["demo", "off"]
    demo_prefix: str
    demo_tag: str
    current_iteration_id: int | None
    iterations: list[Iteration]
    users: list[User]
    features: list[Feature]
    issues: list[Issue]
    tasks: list[Task]
    iteration_order: list[int]
    backlog_order: list[int]
    server_time: str


class Changes(BaseModel):
    issues: list[Issue]
    tasks: list[Task]
    iteration_order: list[int]
    backlog_order: list[int]
    server_time: str


class IssueDetail(BaseModel):
    issue: Issue
    tasks: list[Task]


def _reject_nulls(model: BaseModel, fields: tuple[str, ...]) -> None:
    for name in model.model_fields_set:
        if name in fields and getattr(model, name) is None:
            raise ValueError(f"'{name}' cannot be null")


class IssuePatch(BaseModel):
    """Only fields that are present are changed. `null` clears owner, iteration, feature or estimate."""

    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    state: ScheduleState | None = None
    owner_id: int | None = None
    iteration_id: int | None = None
    feature_id: int | None = None
    estimate: float | None = None
    blocked: bool | None = None
    tags: list[str] | None = None
    description: str | None = None

    @model_validator(mode="after")
    def required_fields_are_not_null(self) -> "IssuePatch":
        _reject_nulls(self, ("name", "state", "blocked", "tags", "description"))
        return self


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    state: TaskState | None = None
    owner_id: int | None = None
    todo: float | None = None

    @model_validator(mode="after")
    def required_fields_are_not_null(self) -> "TaskPatch":
        _reject_nulls(self, ("name", "state"))
        return self


class IssueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    feature_id: int
    iteration_id: int | None = None
    estimate: float | None = None
    description: str = ""
    position: Literal["top", "bottom"] = "top"


class RankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    above: int | None = None
    below: int | None = None

    @model_validator(mode="after")
    def exactly_one_side(self) -> "RankRequest":
        if (self.above is None) == (self.below is None):
            raise ValueError("give exactly one of 'above' or 'below'")
        return self
```

- [ ] **Step 5: Write the mapping**

`server/app/mapping.py`:

```python
"""Pure conversions between Rally WSAPI objects and the domain model (spec §6). No I/O."""
from datetime import datetime, timezone
from typing import Any

from .domain import Feature, Issue, IssuePatch, Iteration, Task, TaskPatch, User

Rally = dict[str, Any]

KIND_BY_TYPE = {"HierarchicalRequirement": "story", "Defect": "defect"}
TYPE_PATH = {"story": "hierarchicalrequirement", "defect": "defect"}
TYPE_KEY = {"story": "HierarchicalRequirement", "defect": "Defect"}

ISSUE_FETCH = ",".join([
    "ObjectID", "FormattedID", "Name", "ScheduleState", "Owner", "Iteration", "Release", "Feature", "PortfolioItem",
    "Project", "PlanEstimate", "Blocked", "Tags", "Description", "LastUpdateDate", "DirectChildrenCount",
])
TASK_FETCH = "ObjectID,FormattedID,Name,State,Owner,ToDo,WorkProduct,Project,Tags,LastUpdateDate,TaskIndex"
ITERATION_FETCH = "ObjectID,Name,StartDate,EndDate"
FEATURE_FETCH = "ObjectID,FormattedID,Name"

_ISSUE_FIELDS = {"name": "Name", "state": "ScheduleState", "estimate": "PlanEstimate", "blocked": "Blocked",
                 "description": "Description"}
_TASK_FIELDS = {"name": "Name", "state": "State", "todo": "ToDo"}


def oid(value: Any) -> int | None:
    """ObjectID from an object, a ref object or a ref URL. None for null."""
    if value is None:
        return None
    if isinstance(value, dict):
        if value.get("ObjectID") is not None:
            return int(value["ObjectID"])
        value = value.get("_ref")
        if value is None:
            return None
    return int(str(value).rstrip("/").rsplit("/", 1)[-1])


def ref(type_path: str, object_id: int | None) -> str | None:
    return None if object_id is None else f"/{type_path}/{object_id}"


def user_from_rally(obj: Rally | None) -> User | None:
    if not obj:
        return None
    return User(id=oid(obj), name=obj.get("_refObjectName") or obj.get("DisplayName") or "")


def tag_names(tags: Rally | None) -> list[str]:
    return [t["Name"] for t in (tags or {}).get("_tagsNameArray", [])]


def issue_from_rally(o: Rally) -> Issue:
    kind = KIND_BY_TYPE[o["_type"]]
    feature = o.get("Feature") or (o.get("PortfolioItem") if kind == "story" else None)
    return Issue(
        id=int(o["ObjectID"]), formatted_id=o["FormattedID"], kind=kind, name=o["Name"], state=o["ScheduleState"],
        owner=user_from_rally(o.get("Owner")), iteration_id=oid(o.get("Iteration")), release_id=oid(o.get("Release")),
        feature_id=oid(feature), project_id=oid(o["Project"]), estimate=o.get("PlanEstimate"),
        blocked=bool(o.get("Blocked")), tags=tag_names(o.get("Tags")), description=o.get("Description") or "",
        updated_at=o["LastUpdateDate"], has_children=bool(o.get("DirectChildrenCount")),
    )


def task_from_rally(o: Rally) -> Task:
    return Task(
        id=int(o["ObjectID"]), formatted_id=o["FormattedID"], name=o["Name"], state=o["State"],
        owner=user_from_rally(o.get("Owner")), todo=o.get("ToDo"), issue_id=oid(o["WorkProduct"]),
        project_id=oid(o["Project"]), tags=tag_names(o.get("Tags")), updated_at=o["LastUpdateDate"],
    )


def iteration_from_rally(o: Rally) -> Iteration:
    return Iteration(id=int(o["ObjectID"]), name=o["Name"], start=o["StartDate"], end=o["EndDate"])


def feature_from_rally(o: Rally) -> Feature:
    return Feature(id=int(o["ObjectID"]), formatted_id=o["FormattedID"], name=o["Name"])


def issue_patch_to_rally(patch: IssuePatch, kind: str, tag_refs: list[str] | None = None) -> Rally:
    data = patch.model_dump(exclude_unset=True)
    out: Rally = {_ISSUE_FIELDS[k]: v for k, v in data.items() if k in _ISSUE_FIELDS}
    if "owner_id" in data:
        out["Owner"] = ref("user", data["owner_id"])
    if "iteration_id" in data:
        out["Iteration"] = ref("iteration", data["iteration_id"])
    if "feature_id" in data:
        if kind != "story":
            raise ValueError("only stories have a feature")
        out["PortfolioItem"] = ref("portfolioitem/feature", data["feature_id"])
    if "tags" in data:
        if tag_refs is None:
            raise ValueError("resolve tag names to refs before mapping tags")
        out["Tags"] = [{"_ref": r} for r in tag_refs]
    return out


def task_patch_to_rally(patch: TaskPatch) -> Rally:
    data = patch.model_dump(exclude_unset=True)
    out: Rally = {_TASK_FIELDS[k]: v for k, v in data.items() if k in _TASK_FIELDS}
    if "owner_id" in data:
        out["Owner"] = ref("user", data["owner_id"])
    return out


def quoted(value: str) -> str:
    if '"' in value:
        raise ValueError("values may not contain double quotes")
    return f'"{value}"'


def _join(clauses: list[str], op: str) -> str:
    if not clauses:
        raise ValueError("a query needs at least one clause")
    q = f"({clauses[0]})"
    for clause in clauses[1:]:
        q = f"({q} {op} ({clause}))"
    return q


def or_query(clauses: list[str]) -> str:
    """Rally needs binary nesting: ((a) OR (b)) OR (c)."""
    return _join(clauses, "OR")


def and_query(clauses: list[str]) -> str:
    return _join(clauses, "AND")


def iso(dt: datetime) -> str:
    """Rally's timestamp format: 2026-10-16T06:25:17.120Z."""
    u = dt.astimezone(timezone.utc)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd server && uv run pytest -q`
Expected: `17 passed`: 16 mapping tests plus the health test.

- [ ] **Step 7: Commit**

```bash
git add server/app/domain.py server/app/mapping.py server/tests/fixtures.py server/tests/test_mapping.py
gitleaks git --staged --redact -v
git commit -m "Add domain model and Rally mapping

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rally HTTP client

**Files:**
- Create: `server/app/rally_client.py`, `server/tests/test_rally_client.py`

**Interfaces:**
- Produces:
  - `RallyError(status: int, message: str)`, an exception with `.status` and `.message`.
  - `RallyClient(base_url, api_key, *, timeout=15.0, max_concurrency=4, transport=None)`, with the async methods `get(path, params=None) -> dict`, `post(path, body, params=None) -> dict`, `delete(path) -> dict`, `query(path, params, *, limit=200) -> list[dict]` and `aclose()`.
- Error mapping (spec §8):

  | Condition | Status |
  |---|---|
  | No key configured | 401 `RALLY_API_KEY is not set in .env` |
  | HTTP 401 | 401 `Rally rejected the API key` |
  | Timeout | 504 `Rally didn't respond in time` |
  | Transport error | 502 |
  | Non-JSON response | 502 |
  | Other HTTP error | 502 |
  | `Errors` in the response envelope | 422 with the errors joined by `; ` |

- [ ] **Step 1: Write the failing tests**

`server/tests/test_rally_client.py`:

```python
import asyncio

import httpx
import pytest

from app.rally_client import RallyClient, RallyError
from tests.fixtures import BASE


def make(handler, **kw) -> RallyClient:
    return RallyClient(BASE, kw.pop("api_key", "test-key"), transport=httpx.MockTransport(handler), **kw)


def page(rows, total):
    return {"QueryResult": {"Errors": [], "Warnings": [], "TotalResultCount": total, "StartIndex": 1, "Results": rows}}


async def test_sends_key_header_and_joins_base_url():
    seen = {}

    def handler(request: httpx.Request):
        seen["key"] = request.headers["ZSESSIONID"]
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"User": {"ObjectID": 1}})

    client = make(handler)
    body = await client.get("/user", {"fetch": "ObjectID"})
    await client.aclose()
    assert seen == {"key": "test-key", "url": f"{BASE}/user?fetch=ObjectID"}
    assert body == {"User": {"ObjectID": 1}}


async def test_missing_key_is_401_without_a_request():
    calls = []
    client = make(lambda r: calls.append(r) or httpx.Response(200, json={}), api_key="")
    with pytest.raises(RallyError) as e:
        await client.get("/user")
    assert e.value.status == 401 and "RALLY_API_KEY" in e.value.message and calls == []


async def test_errors_envelope_is_422_with_rally_message():
    client = make(lambda r: httpx.Response(200, json={"OperationResult": {"Errors": ["Validation error: X", "Y"], "Warnings": []}}))
    with pytest.raises(RallyError) as e:
        await client.post("/hierarchicalrequirement/1", {"HierarchicalRequirement": {}})
    assert e.value.status == 422 and e.value.message == "Validation error: X; Y"


async def test_http_401_is_reported_as_bad_key():
    client = make(lambda r: httpx.Response(401, text="Unauthorized"))
    with pytest.raises(RallyError) as e:
        await client.get("/user")
    assert e.value.status == 401 and e.value.message == "Rally rejected the API key"


async def test_timeout_is_504():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(RallyError) as e:
        await make(handler).get("/user")
    assert e.value.status == 504 and e.value.message == "Rally didn't respond in time"


async def test_connect_error_is_502():
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(RallyError) as e:
        await make(handler).get("/user")
    assert e.value.status == 502


async def test_non_json_is_502():
    with pytest.raises(RallyError) as e:
        await make(lambda r: httpx.Response(200, text="<html>")).get("/user")
    assert e.value.status == 502


async def test_query_pages_until_total():
    starts = []

    def handler(request):
        start = int(request.url.params["start"])
        starts.append(start)
        rows = [{"ObjectID": n} for n in range(start, min(start + 2, 4))]  # server pages by 2
        return httpx.Response(200, json=page(rows, 3))

    rows = await make(handler).query("/artifact", {"query": "(A = 1)"})
    assert [r["ObjectID"] for r in rows] == [1, 2, 3] and starts == [1, 3]


async def test_query_respects_limit():
    sizes = []

    def handler(request):
        size = int(request.url.params["pagesize"])
        sizes.append(size)
        start = int(request.url.params["start"])
        return httpx.Response(200, json=page([{"ObjectID": start + i} for i in range(size)], 500))

    rows = await make(handler).query("/artifact", {}, limit=250)
    assert len(rows) == 250 and sizes == [200, 50]


async def test_concurrency_is_capped():
    live = peak = 0

    async def handler(request):
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        await asyncio.sleep(0.01)
        live -= 1
        return httpx.Response(200, json={"User": {}})

    client = make(handler, max_concurrency=2)
    await asyncio.gather(*(client.get("/user") for _ in range(10)))
    assert peak == 2
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd server && uv run pytest tests/test_rally_client.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.rally_client'`.

- [ ] **Step 3: Write the client**

`server/app/rally_client.py`:

```python
"""Thin async client for Rally WSAPI v2.0: API-key auth, timeout, concurrency cap, error envelope, paging."""
import asyncio
from typing import Any

import httpx


class RallyError(Exception):
    """A Rally failure the API turns into an HTTP status with Rally's message (spec §8)."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class RallyClient:
    def __init__(self, base_url: str, api_key: str, *, timeout: float = 15.0, max_concurrency: int = 4,
                 transport: httpx.AsyncBaseTransport | None = None):
        self._api_key = api_key
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + "/", timeout=timeout, transport=transport,
            headers={"ZSESSIONID": api_key, "Accept": "application/json", "Content-Type": "application/json"})
        self._sem = asyncio.Semaphore(max_concurrency)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> dict:
        return await self._send("GET", path, params=params)

    async def post(self, path: str, body: dict, params: dict[str, Any] | None = None) -> dict:
        return await self._send("POST", path, params=params, json=body)

    async def delete(self, path: str) -> dict:
        return await self._send("DELETE", path)

    async def query(self, path: str, params: dict[str, Any], *, limit: int = 200) -> list[dict]:
        """Page through a collection until Rally's total or `limit`, whichever comes first."""
        results: list[dict] = []
        start = 1
        while True:
            body = await self.get(path, {**params, "start": start, "pagesize": min(200, limit - len(results))})
            qr = body["QueryResult"]
            results += qr["Results"]
            if not qr["Results"] or len(results) >= min(qr["TotalResultCount"], limit):
                return results
            start += len(qr["Results"])

    async def _send(self, method: str, path: str, **kw: Any) -> dict:
        if not self._api_key:
            raise RallyError(401, "RALLY_API_KEY is not set in .env")
        async with self._sem:
            try:
                response = await self._http.request(method, path.lstrip("/"), **kw)
            except httpx.TimeoutException:
                raise RallyError(504, "Rally didn't respond in time") from None
            except httpx.TransportError as e:
                raise RallyError(502, f"Couldn't reach Rally ({e.__class__.__name__})") from None
        if response.status_code == 401:
            raise RallyError(401, "Rally rejected the API key")
        if response.status_code >= 400:
            raise RallyError(502, f"Rally returned HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError:
            raise RallyError(502, "Rally returned a non-JSON response") from None
        envelope = next(iter(body.values())) if isinstance(body, dict) and len(body) == 1 else None
        if isinstance(envelope, dict) and envelope.get("Errors"):
            raise RallyError(422, "; ".join(envelope["Errors"]))
        return body
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd server && uv run pytest -q`
Expected: `27 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/app/rally_client.py server/tests/test_rally_client.py
gitleaks git --staged --redact -v
git commit -m "Add Rally HTTP client with error mapping, paging and concurrency cap

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Write guard

**Files:**
- Create: `server/app/guard.py`, `server/tests/test_guard.py`

**Interfaces:**
- Produces:
  - `GuardError(Exception)`. The API maps it to 403.
  - `WriteGuard(mode: str, project_id: int, prefix: str, tag: str)`, a frozen dataclass with:
    - `.active -> bool`
    - `.check_existing(*, name, tags, project_id)`
    - `.check_patch(changes: dict)`, where `changes = patch.model_dump(exclude_unset=True)`
    - `.check_create(name)`
  - `GUARD_MESSAGE = "Development mode: only [DEMO] items can be edited"`

- [ ] **Step 1: Write the failing tests**

`server/tests/test_guard.py`:

```python
import pytest

from app.guard import GUARD_MESSAGE, GuardError, WriteGuard

GUARD = WriteGuard("demo", 9001, "[DEMO] ", "collabathon-demo")
OFF = WriteGuard("off", 9001, "[DEMO] ", "collabathon-demo")


def test_demo_item_in_project_passes():
    GUARD.check_existing(name="[DEMO] Story", tags=["collabathon-demo"], project_id=9001)


@pytest.mark.parametrize("name,tags,project", [
    ("Real story", ["collabathon-demo"], 9001),      # no prefix
    ("[DEMO] Story", [], 9001),                       # no tag
    ("[DEMO] Story", ["collabathon-demo"], 9002),     # other project
    ("[DEMO]Story", ["collabathon-demo"], 9001),      # prefix without the space
])
def test_non_demo_items_are_refused(name, tags, project):
    with pytest.raises(GuardError) as e:
        GUARD.check_existing(name=name, tags=tags, project_id=project)
    assert GUARD_MESSAGE in str(e.value) or "demo project" in str(e.value)


def test_refusal_message_is_the_spec_text():
    with pytest.raises(GuardError, match=r"^Development mode: only \[DEMO\] items can be edited$"):
        GUARD.check_existing(name="Real story", tags=[], project_id=9001)


def test_patch_cannot_strip_prefix():
    with pytest.raises(GuardError, match="keep the \\[DEMO\\] prefix"):
        GUARD.check_patch({"name": "Renamed without prefix"})


def test_patch_cannot_drop_demo_tag():
    with pytest.raises(GuardError, match="keep the collabathon-demo tag"):
        GUARD.check_patch({"tags": ["ux"]})


def test_ordinary_patch_passes():
    GUARD.check_patch({"state": "Completed", "name": "[DEMO] Renamed", "tags": ["collabathon-demo", "ux"]})


def test_create_needs_prefix():
    with pytest.raises(GuardError, match="new items need"):
        GUARD.check_create("No prefix")
    GUARD.check_create("[DEMO] New")


def test_off_mode_allows_everything():
    OFF.check_existing(name="Real", tags=[], project_id=1)
    OFF.check_patch({"name": "x", "tags": []})
    OFF.check_create("x")
    assert OFF.active is False and GUARD.active is True
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd server && uv run pytest tests/test_guard.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.guard'`.

- [ ] **Step 3: Write the guard**

`server/app/guard.py`:

```python
"""Development-mode write guard (spec D5): only [DEMO]-labelled items in the configured project may change."""
from dataclasses import dataclass

GUARD_MESSAGE = "Development mode: only [DEMO] items can be edited"


class GuardError(Exception):
    """A write the guard refused. The API answers 403 with this message."""


@dataclass(frozen=True)
class WriteGuard:
    mode: str  # "demo" or "off"
    project_id: int
    prefix: str
    tag: str

    @property
    def active(self) -> bool:
        return self.mode == "demo"

    def check_existing(self, *, name: str, tags: list[str], project_id: int) -> None:
        if not self.active:
            return
        if project_id != self.project_id:
            raise GuardError("Development mode: only items in the demo project can be edited")
        if not name.startswith(self.prefix) or self.tag not in tags:
            raise GuardError(GUARD_MESSAGE)

    def check_patch(self, changes: dict) -> None:
        if not self.active:
            return
        if "name" in changes and not str(changes["name"]).startswith(self.prefix):
            raise GuardError(f"Development mode: demo items must keep the {self.prefix.strip()} prefix")
        if "tags" in changes and self.tag not in (changes["tags"] or []):
            raise GuardError(f"Development mode: demo items must keep the {self.tag} tag")

    def check_create(self, name: str) -> None:
        if self.active and not name.startswith(self.prefix):
            raise GuardError(f"Development mode: new items need the {self.prefix.strip()} prefix")
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd server && uv run pytest -q`
Expected: `38 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/app/guard.py server/tests/test_guard.py
gitleaks git --staged --redact -v
git commit -m "Add development-mode write guard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Rally adapter

**Files:**
- Create: `server/app/adapter.py`, `server/tests/fake_client.py`, `server/tests/test_adapter.py`

**Interfaces:**
- Consumes:
  - `RallyClient.get/post/query` and `RallyError` (Task 4).
  - `WriteGuard` and `GuardError` (Task 5).
  - The mapping and domain names (Task 3).
  - `Settings` (Task 1). In tests, build it with `Settings(_env_file=None, ...)` so the real `.env` is never read.
- Produces: `RallyAdapter(client, settings, guard, clock=None)`, with async methods:
  - `bootstrap() -> Bootstrap`
  - `changes(since: str) -> Changes`
  - `get_issue(issue_id) -> IssueDetail`
  - `update_issue(issue_id, patch: IssuePatch) -> Issue`
  - `create_issue(data: IssueCreate) -> Issue`
  - `rank_issue(issue_id, req: RankRequest) -> Issue`
  - `update_task(task_id, patch: TaskPatch) -> Task`
  - `aclose()`

- [ ] **Step 1: Write the fake client**

`server/tests/fake_client.py`:

```python
"""Stands in for RallyClient in adapter tests. The first route matching (kind, path, query substring) answers."""


class FakeClient:
    def __init__(self):
        self.calls: list[tuple[str, str, dict, dict | None]] = []
        self._routes: list[tuple[str, str, str | None, object]] = []

    def on(self, kind: str, path: str, response, query_has: str | None = None) -> "FakeClient":
        self._routes.append((kind, path, query_has, response))
        return self

    def _answer(self, kind, path, params, body):
        params = dict(params or {})
        self.calls.append((kind, path, params, body))
        for k, p, needle, response in self._routes:
            if k == kind and p == path and (needle is None or needle in params.get("query", "")):
                if isinstance(response, Exception):
                    raise response
                return response(params, body) if callable(response) else response
        raise AssertionError(f"unexpected {kind} {path} {params}")

    async def get(self, path, params=None):
        return self._answer("GET", path, params, None)

    async def post(self, path, body, params=None):
        return self._answer("POST", path, params, body)

    async def query(self, path, params, *, limit=200):
        return self._answer("QUERY", path, params, None)

    async def aclose(self):
        pass

    def posts(self):
        return [c for c in self.calls if c[0] == "POST"]
```

- [ ] **Step 2: Write the failing adapter tests**

`server/tests/test_adapter.py`:

```python
from datetime import datetime, timezone

import pytest

from app.adapter import RallyAdapter
from app.config import Settings
from app.domain import IssueCreate, IssuePatch, RankRequest, TaskPatch
from app.guard import GuardError, WriteGuard
from app.rally_client import RallyError
from tests.fake_client import FakeClient
from tests.fixtures import (BASE, DEMO_TAG, ME, PROJECT_ID, WORKSPACE_ID, create_result, operation_result,
                            rally_defect, rally_feature, rally_iteration, rally_story, rally_task, tags)

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
SPRINT = rally_iteration(301, "Sprint 3", "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z")
NEXT = rally_iteration(302, "Sprint 4", "2026-10-22T04:00:00.000Z", "2026-11-05T03:59:59.000Z")


def make_adapter(client: FakeClient, mode: str = "demo") -> RallyAdapter:
    settings = Settings(_env_file=None, rally_api_key="k", rally_workspace=WORKSPACE_ID, rally_project=PROJECT_ID,
                        write_guard=mode)
    return RallyAdapter(client, settings, WriteGuard(mode, PROJECT_ID, "[DEMO] ", DEMO_TAG), clock=lambda: NOW)


def bootstrap_client(iterations=(SPRINT, NEXT)) -> FakeClient:
    c = FakeClient()
    c.on("GET", "/user", {"User": ME})
    c.on("GET", f"/project/{PROJECT_ID}", {"Project": {"ObjectID": PROJECT_ID, "Name": "Demo Team"}})
    c.on("QUERY", "/iteration", list(iterations))
    c.on("QUERY", "/artifact", [rally_story(), rally_defect()], query_has="Iteration = /iteration/301")
    c.on("QUERY", "/artifact", [
        rally_story(ObjectID=1002, FormattedID="US1002", Iteration=None, ScheduleState="Defined"),
        rally_story(ObjectID=1003, FormattedID="US1003", Iteration=None, DirectChildrenCount=2),
    ], query_has="Release = null")
    c.on("QUERY", "/task", [rally_task()], query_has="Iteration = /iteration/301")
    c.on("QUERY", f"/project/{PROJECT_ID}/TeamMembers", [{"_ref": f"{BASE}/user/502", "_refObjectName": "Sam Sample"}])
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(201, "F201", "[DEMO] Feature A")])
    return c


async def test_bootstrap_picks_current_iteration_and_orders():
    b = await make_adapter(bootstrap_client()).bootstrap()
    assert b.me.id == 501 and b.project.name == "Demo Team"
    assert b.current_iteration_id == 301 and [i.id for i in b.iterations] == [301, 302]
    assert b.iteration_order == [1001, 1101]
    assert b.backlog_order == [1002]                       # 1003 has children: not a backlog row
    assert {i.id for i in b.issues} == {1001, 1101, 1002}
    assert [u.name for u in b.users] == ["Dana Demo", "Sam Sample"]
    assert [f.formatted_id for f in b.features] == ["F201"]
    assert len(b.tasks) == 1 and b.write_guard == "demo" and b.demo_tag == DEMO_TAG
    assert b.server_time == "2026-10-16T11:59:30.000Z"     # 30s before now, for clock skew


async def test_bootstrap_without_current_iteration():
    c = bootstrap_client(iterations=(NEXT,))
    b = await make_adapter(c).bootstrap()
    assert b.current_iteration_id is None and b.iteration_order == [] and b.tasks == []
    assert not any("Iteration = /iteration" in call[2].get("query", "") for call in c.calls)


async def test_bootstrap_scopes_every_project_query():
    c = bootstrap_client()
    await make_adapter(c).bootstrap()
    scoped = [call for call in c.calls if call[0] == "QUERY" and call[1] in ("/artifact", "/iteration", "/task")]
    assert scoped
    for _, _, params, _ in scoped:
        assert params["project"] == f"/project/{PROJECT_ID}"
        assert params["projectScopeUp"] == "false" and params["projectScopeDown"] == "false"


async def test_update_issue_maps_patch_and_returns_fresh():
    c = FakeClient()
    c.on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    c.on("POST", "/hierarchicalrequirement/1001", operation_result(rally_story(ScheduleState="Completed", Owner=None)))
    issue = await make_adapter(c).update_issue(1001, IssuePatch(state="Completed", owner_id=None))
    _, _, params, body = c.posts()[0]
    assert body == {"HierarchicalRequirement": {"ScheduleState": "Completed", "Owner": None}}
    assert params["fetch"].startswith("ObjectID,FormattedID")
    assert issue.state == "Completed" and issue.owner is None


async def test_update_issue_refuses_non_demo_without_posting():
    c = FakeClient().on("QUERY", "/artifact", [rally_story(Name="Real story", Tags=tags())], query_has="ObjectID = 1001")
    with pytest.raises(GuardError):
        await make_adapter(c).update_issue(1001, IssuePatch(estimate=5))
    assert c.posts() == []


async def test_update_issue_refuses_prefix_strip_without_posting():
    c = FakeClient().on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    with pytest.raises(GuardError):
        await make_adapter(c).update_issue(1001, IssuePatch(name="No prefix"))
    assert c.posts() == []


async def test_guard_off_allows_real_items():
    c = FakeClient()
    c.on("QUERY", "/artifact", [rally_story(Name="Real story", Tags=tags())], query_has="ObjectID = 1001")
    c.on("POST", "/hierarchicalrequirement/1001", operation_result(rally_story(Name="Real story", Tags=tags())))
    await make_adapter(c, mode="off").update_issue(1001, IssuePatch(estimate=3))
    assert len(c.posts()) == 1


async def test_update_issue_resolves_tag_names():
    c = FakeClient()
    c.on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}, {"_ref": f"{BASE}/tag/7005", "Name": "ux"}])
    c.on("POST", "/hierarchicalrequirement/1001", operation_result(rally_story()))
    await make_adapter(c).update_issue(1001, IssuePatch(tags=[DEMO_TAG, "ux"]))
    assert c.posts()[0][3] == {"HierarchicalRequirement": {"Tags": [{"_ref": "/tag/7000"}, {"_ref": "/tag/7005"}]}}


async def test_unknown_tag_is_422():
    c = FakeClient()
    c.on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}])
    with pytest.raises(RallyError) as e:
        await make_adapter(c).update_issue(1001, IssuePatch(tags=[DEMO_TAG, "nope"]))
    assert e.value.status == 422 and "nope" in e.value.message


async def test_missing_issue_is_404():
    c = FakeClient().on("QUERY", "/artifact", [], query_has="ObjectID = 1")
    with pytest.raises(RallyError) as e:
        await make_adapter(c).get_issue(1)
    assert e.value.status == 404


async def test_rank_above_uses_target_type_path():
    c = FakeClient()
    c.on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    c.on("QUERY", "/artifact", [rally_defect()], query_has="ObjectID = 1101")
    c.on("POST", "/hierarchicalrequirement/1001", operation_result(rally_story()))
    await make_adapter(c).rank_issue(1001, RankRequest(above=1101))
    _, path, params, body = c.posts()[0]
    assert params["rankAbove"] == "/defect/1101" and body == {"HierarchicalRequirement": {}}


async def test_rank_relative_to_itself_is_rejected():
    c = FakeClient()
    with pytest.raises(ValueError):
        await make_adapter(c).rank_issue(1001, RankRequest(below=1001))
    assert c.calls == []


async def test_create_adds_demo_tag_owner_and_ranks_bottom():
    c = FakeClient()
    c.on("GET", "/user", {"User": ME})
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}])
    c.on("POST", "/hierarchicalrequirement/create", create_result(rally_story(ObjectID=1009, FormattedID="US1009")))
    c.on("POST", "/hierarchicalrequirement/1009", operation_result(rally_story(ObjectID=1009, FormattedID="US1009")))
    issue = await make_adapter(c).create_issue(IssueCreate(name="[DEMO] New", feature_id=201, position="bottom"))
    fields = c.posts()[0][3]["HierarchicalRequirement"]
    assert fields["Tags"] == [{"_ref": "/tag/7000"}] and fields["Owner"] == "/user/501"
    assert fields["PortfolioItem"] == "/portfolioitem/feature/201" and fields["Project"] == f"/project/{PROJECT_ID}"
    assert c.posts()[1][2]["rankTo"] == "BOTTOM" and issue.formatted_id == "US1009"


async def test_create_without_prefix_is_refused():
    c = FakeClient()
    with pytest.raises(GuardError):
        await make_adapter(c).create_issue(IssueCreate(name="New", feature_id=201))
    assert c.posts() == []


async def test_changes_rejects_bad_since():
    c = FakeClient()
    with pytest.raises(ValueError):
        await make_adapter(c).changes("yesterday")
    assert c.calls == []


async def test_changes_returns_updates_and_fresh_orders():
    c = FakeClient()
    c.on("QUERY", "/iteration", [SPRINT, NEXT])
    c.on("QUERY", "/artifact", [rally_story()], query_has="LastUpdateDate >")
    c.on("QUERY", "/artifact", [{"ObjectID": 1001}, {"ObjectID": 1101}], query_has="Iteration = /iteration/301")
    c.on("QUERY", "/artifact", [{"ObjectID": 1002, "DirectChildrenCount": 0}, {"ObjectID": 1003, "DirectChildrenCount": 1}],
         query_has="Release = null")
    c.on("QUERY", "/task", [], query_has="LastUpdateDate >")
    ch = await make_adapter(c).changes("2026-10-16T11:00:00.000Z")
    assert [i.id for i in ch.issues] == [1001]
    assert ch.iteration_order == [1001, 1101] and ch.backlog_order == [1002]
    assert ch.server_time == "2026-10-16T11:59:30.000Z"


async def test_get_issue_includes_tasks():
    c = FakeClient()
    c.on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    c.on("QUERY", "/task", [rally_task()], query_has="WorkProduct = /hierarchicalrequirement/1001")
    detail = await make_adapter(c).get_issue(1001)
    assert detail.issue.id == 1001 and [t.id for t in detail.tasks] == [4001]


async def test_update_task_is_guarded_and_mapped():
    c = FakeClient()
    c.on("QUERY", "/task", [rally_task()], query_has="ObjectID = 4001")
    c.on("QUERY", "/task", [rally_task(ObjectID=4002, Name="Real task", Tags=tags())], query_has="ObjectID = 4002")
    c.on("POST", "/task/4001", operation_result(rally_task(State="Completed")))
    task = await make_adapter(c).update_task(4001, TaskPatch(state="Completed"))
    assert task.state == "Completed" and c.posts()[0][3] == {"Task": {"State": "Completed"}}
    with pytest.raises(GuardError):
        await make_adapter(c).update_task(4002, TaskPatch(state="Completed"))
    assert len(c.posts()) == 1


async def test_referenced_features_are_looked_up_workspace_wide():
    c = bootstrap_client()
    await make_adapter(c).bootstrap()
    feature_calls = [call for call in c.calls if call[1] == "/portfolioitem/feature"]
    by_id = next(call for call in feature_calls if "ObjectID = 201" in call[2]["query"])
    assert "project" not in by_id[2] and by_id[2]["workspace"] == f"/workspace/{WORKSPACE_ID}"
    demo = next(call for call in feature_calls if "Name contains" in call[2]["query"])
    assert demo[2]["project"] == f"/project/{PROJECT_ID}"

```

- [ ] **Step 3: Run them and confirm they fail**

Run: `cd server && uv run pytest tests/test_adapter.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.adapter'`.

- [ ] **Step 4: Write the adapter**

`server/app/adapter.py`:

```python
"""RallyAdapter: every Rally query and write the proxy makes (spec §6, §7). Returns domain objects only."""
import asyncio
import re
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from .config import Settings
from .domain import (Bootstrap, Changes, Feature, Issue, IssueCreate, IssueDetail, IssuePatch, Iteration, Project,
                     RankRequest, Task, TaskPatch, User)
from .guard import WriteGuard
from .mapping import (FEATURE_FETCH, ISSUE_FETCH, ITERATION_FETCH, TASK_FETCH, TYPE_KEY, TYPE_PATH, feature_from_rally,
                      iso, issue_from_rally, issue_patch_to_rally, iteration_from_rally, oid, or_query, quoted,
                      task_from_rally, task_patch_to_rally, user_from_rally)
from .rally_client import RallyClient, RallyError

BACKLOG_QUERY = '(((Release = null) AND (Iteration = null)) AND (ScheduleState != "Accepted"))'
SINCE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$")
CLOCK_SKEW = timedelta(seconds=30)
FEATURE_CHUNK = 50


async def _nothing() -> list:
    return []


class RallyAdapter:
    def __init__(self, client: RallyClient, settings: Settings, guard: WriteGuard,
                 clock: Callable[[], datetime] | None = None):
        self.client = client
        self.settings = settings
        self.guard = guard
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.project_ref = f"/project/{settings.rally_project}"
        self.workspace_ref = f"/workspace/{settings.rally_workspace}"
        self._me: User | None = None
        self._iterations_known = False
        self._current_iteration_id: int | None = None

    async def aclose(self) -> None:
        await self.client.aclose()

    # ---------- query helpers ----------
    def _scope(self, **params: str) -> dict[str, str]:
        return {"workspace": self.workspace_ref, "project": self.project_ref, "projectScopeUp": "false",
                "projectScopeDown": "false", **params}

    async def _artifacts(self, query: str, fetch: str = ISSUE_FETCH, limit: int = 200) -> list[dict]:
        params = self._scope(types="HierarchicalRequirement,Defect", fetch=fetch, query=query, order="DragAndDropRank ASC")
        return await self.client.query("/artifact", params, limit=limit)

    async def _tasks(self, query: str, limit: int = 400) -> list[dict]:
        return await self.client.query("/task", self._scope(fetch=TASK_FETCH, query=query, order="TaskIndex"), limit=limit)

    async def _artifact(self, issue_id: int) -> dict:
        rows = await self._artifacts(f"(ObjectID = {int(issue_id)})", limit=1)
        if not rows:
            raise RallyError(404, f"Item {issue_id} was not found in this project")
        return rows[0]

    async def _me_user(self) -> User:
        if self._me is None:
            body = await self.client.get("/user", {"fetch": "ObjectID,DisplayName"})
            self._me = user_from_rally(body["User"])
        return self._me

    async def _iterations(self, now: datetime) -> tuple[list[Iteration], Iteration | None]:
        params = self._scope(fetch=ITERATION_FETCH, query=f'(EndDate >= "{iso(now)}")', order="StartDate ASC")
        iterations = [iteration_from_rally(o) for o in await self.client.query("/iteration", params, limit=20)]
        current = next((i for i in iterations if i.start <= iso(now) <= i.end), None)
        self._iterations_known = True
        self._current_iteration_id = current.id if current else None
        return iterations, current

    async def _features(self, ids: list[int]) -> list[Feature]:
        lookups = [
            self.client.query("/portfolioitem/feature", {
                "workspace": self.workspace_ref, "fetch": FEATURE_FETCH,
                "query": or_query([f"ObjectID = {i}" for i in ids[n:n + FEATURE_CHUNK]])}, limit=FEATURE_CHUNK)
            for n in range(0, len(ids), FEATURE_CHUNK)
        ]
        demo_query = f"(Name contains {quoted(self.settings.demo_prefix.strip())})"
        lookups.append(self.client.query("/portfolioitem/feature", self._scope(fetch=FEATURE_FETCH, query=demo_query), limit=50))
        rows = [row for batch in await asyncio.gather(*lookups) for row in batch]
        return list({f.id: f for f in map(feature_from_rally, rows)}.values())

    async def _tag_refs(self, names: list[str]) -> list[str]:
        if not names:
            return []
        params = {"workspace": self.workspace_ref, "fetch": "Name", "query": or_query([f"Name = {quoted(n)}" for n in names])}
        rows = await self.client.query("/tag", params, limit=len(names) * 2)
        by_name = {r["Name"]: f"/tag/{oid(r)}" for r in rows}
        missing = [n for n in names if n not in by_name]
        if missing:
            raise RallyError(422, f"Unknown tag: {missing[0]}")
        return [by_name[n] for n in names]

    # ---------- reads ----------
    async def bootstrap(self) -> Bootstrap:
        now = self.clock()
        me, project_body, (iterations, current) = await asyncio.gather(
            self._me_user(), self.client.get(self.project_ref, {"fetch": "ObjectID,Name"}), self._iterations(now))
        sprint_rows, backlog_rows, task_rows, member_rows = await asyncio.gather(
            self._artifacts(f"(Iteration = /iteration/{current.id})") if current else _nothing(),
            self._artifacts(BACKLOG_QUERY),
            self._tasks(f"(Iteration = /iteration/{current.id})") if current else _nothing(),
            self.client.query(f"{self.project_ref}/TeamMembers", {"fetch": "ObjectID,DisplayName"}, limit=200),
        )
        sprint = [issue_from_rally(o) for o in sprint_rows]
        backlog = [i for i in map(issue_from_rally, backlog_rows) if not i.has_children]
        issues = list({i.id: i for i in sprint + backlog}.values())
        tasks = [task_from_rally(o) for o in task_rows]
        features = await self._features(sorted({i.feature_id for i in issues if i.feature_id}))
        people = [me, *map(user_from_rally, member_rows), *(i.owner for i in issues), *(t.owner for t in tasks)]
        users = {u.id: u for u in people if u}
        project = project_body["Project"]
        return Bootstrap(
            me=me, project=Project(id=int(project["ObjectID"]), name=project["Name"]),
            write_guard=self.settings.write_guard, demo_prefix=self.settings.demo_prefix, demo_tag=self.settings.demo_tag,
            current_iteration_id=current.id if current else None, iterations=iterations,
            users=sorted(users.values(), key=lambda u: u.name.lower()), features=features, issues=issues, tasks=tasks,
            iteration_order=[i.id for i in sprint], backlog_order=[i.id for i in backlog],
            server_time=iso(now - CLOCK_SKEW),
        )

    async def changes(self, since: str) -> Changes:
        if not SINCE_RE.match(since):
            raise ValueError("since must be an ISO time like 2026-10-16T06:25:17.000Z")
        now = self.clock()
        if not self._iterations_known:
            await self._iterations(now)
        cur = self._current_iteration_id
        issue_rows, task_rows, sprint_ids, backlog_ids = await asyncio.gather(
            self._artifacts(f'(LastUpdateDate > "{since}")'),
            self._tasks(f'(LastUpdateDate > "{since}")', limit=200),
            self._artifacts(f"(Iteration = /iteration/{cur})", fetch="ObjectID") if cur else _nothing(),
            self._artifacts(BACKLOG_QUERY, fetch="ObjectID,DirectChildrenCount"),
        )
        return Changes(
            issues=[issue_from_rally(o) for o in issue_rows], tasks=[task_from_rally(o) for o in task_rows],
            iteration_order=[int(o["ObjectID"]) for o in sprint_ids],
            backlog_order=[int(o["ObjectID"]) for o in backlog_ids if not o.get("DirectChildrenCount")],
            server_time=iso(now - CLOCK_SKEW),
        )

    async def get_issue(self, issue_id: int) -> IssueDetail:
        issue = issue_from_rally(await self._artifact(issue_id))
        tasks = await self._tasks(f"(WorkProduct = /{TYPE_PATH[issue.kind]}/{issue.id})")
        return IssueDetail(issue=issue, tasks=[task_from_rally(o) for o in tasks])

    # ---------- writes ----------
    async def update_issue(self, issue_id: int, patch: IssuePatch) -> Issue:
        current = issue_from_rally(await self._artifact(issue_id))
        self.guard.check_existing(name=current.name, tags=current.tags, project_id=current.project_id)
        changes = patch.model_dump(exclude_unset=True)
        self.guard.check_patch(changes)
        tag_refs = await self._tag_refs(changes["tags"]) if "tags" in changes else None
        fields = issue_patch_to_rally(patch, current.kind, tag_refs)
        body = await self.client.post(f"/{TYPE_PATH[current.kind]}/{issue_id}", {TYPE_KEY[current.kind]: fields},
                                      {"fetch": ISSUE_FETCH})
        return issue_from_rally(body["OperationResult"]["Object"])

    async def rank_issue(self, issue_id: int, req: RankRequest) -> Issue:
        target_id = req.above if req.above is not None else req.below
        if target_id == issue_id:
            raise ValueError("an item can't be ranked relative to itself")
        current_row, target_row = await asyncio.gather(self._artifact(issue_id), self._artifact(target_id))
        current, target = issue_from_rally(current_row), issue_from_rally(target_row)
        self.guard.check_existing(name=current.name, tags=current.tags, project_id=current.project_id)
        side = "rankAbove" if req.above is not None else "rankBelow"
        body = await self.client.post(f"/{TYPE_PATH[current.kind]}/{issue_id}", {TYPE_KEY[current.kind]: {}},
                                      {side: f"/{TYPE_PATH[target.kind]}/{target.id}", "fetch": ISSUE_FETCH})
        return issue_from_rally(body["OperationResult"]["Object"])

    async def create_issue(self, data: IssueCreate) -> Issue:
        self.guard.check_create(data.name)
        me = await self._me_user()
        fields: dict = {"Name": data.name, "Project": self.project_ref, "Owner": f"/user/{me.id}",
                        "PortfolioItem": f"/portfolioitem/feature/{data.feature_id}", "Description": data.description}
        if data.iteration_id is not None:
            fields["Iteration"] = f"/iteration/{data.iteration_id}"
        if data.estimate is not None:
            fields["PlanEstimate"] = data.estimate
        if self.guard.active:
            fields["Tags"] = [{"_ref": r} for r in await self._tag_refs([self.settings.demo_tag])]
        body = await self.client.post("/hierarchicalrequirement/create", {"HierarchicalRequirement": fields},
                                      {"fetch": ISSUE_FETCH})
        created = body["CreateResult"]["Object"]
        if data.position == "bottom":  # Rally ranks new items at the top by default (spec §6.4)
            body = await self.client.post(f"/hierarchicalrequirement/{created['ObjectID']}", {"HierarchicalRequirement": {}},
                                          {"rankTo": "BOTTOM", "fetch": ISSUE_FETCH})
            created = body["OperationResult"]["Object"]
        return issue_from_rally(created)

    async def update_task(self, task_id: int, patch: TaskPatch) -> Task:
        rows = await self._tasks(f"(ObjectID = {int(task_id)})", limit=1)
        if not rows:
            raise RallyError(404, f"Task {task_id} was not found in this project")
        task = task_from_rally(rows[0])
        self.guard.check_existing(name=task.name, tags=task.tags, project_id=task.project_id)
        self.guard.check_patch(patch.model_dump(exclude_unset=True))
        body = await self.client.post(f"/task/{task_id}", {"Task": task_patch_to_rally(patch)}, {"fetch": TASK_FETCH})
        return task_from_rally(body["OperationResult"]["Object"])
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd server && uv run pytest -q`
Expected: `57 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/app/adapter.py server/tests/fake_client.py server/tests/test_adapter.py
gitleaks git --staged --redact -v
git commit -m "Add Rally adapter for bootstrap, changes and guarded writes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Domain API, error mapping, and `rallypoc check api`

**Files:**
- Modify: `server/app/main.py` (full replacement below)
- Create: `server/tests/test_api.py`
- Modify: `.claude/skills/verify-rally-poc/rallypoc` (add `check api`)
- Modify: `.claude/skills/rally-poc-feature-map/features/rally-proxy.md`

**Interfaces:**
- Consumes: `RallyAdapter` (Task 6), `GuardError` (Task 5), `RallyError` (Task 4), and `Settings` (Task 1).
- Produces these HTTP routes, all JSON:

  | Route | Body | Returns |
  |---|---|---|
  | `GET /api/health` | | `{ok}` |
  | `GET /api/bootstrap` | | `Bootstrap` |
  | `GET /api/changes?since=ISO` | | `Changes` |
  | `GET /api/issues/{id}` | | `IssueDetail` |
  | `POST /api/issues` | `IssueCreate` | `Issue`, status 201 |
  | `PATCH /api/issues/{id}` | `IssuePatch` | `Issue` |
  | `POST /api/issues/{id}/rank` | `RankRequest` | `Issue` |
  | `PATCH /api/tasks/{id}` | `TaskPatch` | `Task` |

  Errors come back as `{"error": "<message>"}`:
  - `RallyError` keeps its own status.
  - `GuardError` → 403.
  - `ValueError` → 422.

  FastAPI's own body validation returns 422 with a `{"detail": [...]}` list.
- Also produces `create_app(adapter=None)`. The adapter is built from `Settings()` at startup when none is given.

- [ ] **Step 1: Write the failing API tests**

`server/tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from app.domain import Bootstrap, IssueDetail, Project, User
from app.guard import GUARD_MESSAGE, GuardError
from app.main import create_app
from app.mapping import issue_from_rally, task_from_rally
from app.rally_client import RallyError
from tests.fixtures import rally_story, rally_task


def issue(**over):
    return issue_from_rally(rally_story(**over))


class FakeAdapter:
    def __init__(self, **behaviour):
        self.behaviour = behaviour
        self.calls: list[tuple] = []
        self.closed = False

    async def _do(self, name, *args):
        self.calls.append((name, *args))
        b = self.behaviour[name]
        if isinstance(b, Exception):
            raise b
        return b(*args) if callable(b) else b

    async def bootstrap(self):
        return await self._do("bootstrap")

    async def changes(self, since):
        return await self._do("changes", since)

    async def get_issue(self, issue_id):
        return await self._do("get_issue", issue_id)

    async def update_issue(self, issue_id, patch):
        return await self._do("update_issue", issue_id, patch)

    async def create_issue(self, data):
        return await self._do("create_issue", data)

    async def rank_issue(self, issue_id, req):
        return await self._do("rank_issue", issue_id, req)

    async def update_task(self, task_id, patch):
        return await self._do("update_task", task_id, patch)

    async def aclose(self):
        self.closed = True


def client_for(adapter: FakeAdapter) -> TestClient:
    return TestClient(create_app(adapter))


def test_bootstrap_route_returns_domain_json():
    b = Bootstrap(me=User(id=501, name="Dana Demo"), project=Project(id=9001, name="Demo Team"), write_guard="demo",
                  demo_prefix="[DEMO] ", demo_tag="collabathon-demo", current_iteration_id=301, iterations=[], users=[],
                  features=[], issues=[issue()], tasks=[], iteration_order=[1001], backlog_order=[],
                  server_time="2026-10-16T11:59:30.000Z")
    with client_for(FakeAdapter(bootstrap=b)) as c:
        body = c.get("/api/bootstrap").json()
    assert body["me"]["name"] == "Dana Demo" and body["issues"][0]["formatted_id"] == "US1001"
    assert "_ref" not in str(body)  # no Rally shapes leak out


def test_patch_passes_only_set_fields():
    seen = []
    adapter = FakeAdapter(update_issue=lambda issue_id, patch: (seen.append(patch.model_dump(exclude_unset=True)), issue())[1])
    with client_for(adapter) as c:
        r = c.patch("/api/issues/1001", json={"owner_id": None})
    assert r.status_code == 200 and seen == [{"owner_id": None}]


def test_guard_error_is_403_with_message():
    with client_for(FakeAdapter(update_issue=GuardError(GUARD_MESSAGE))) as c:
        r = c.patch("/api/issues/1001", json={"estimate": 3})
    assert r.status_code == 403 and r.json() == {"error": GUARD_MESSAGE}


def test_rally_timeout_is_504():
    with client_for(FakeAdapter(bootstrap=RallyError(504, "Rally didn't respond in time"))) as c:
        r = c.get("/api/bootstrap")
    assert r.status_code == 504 and r.json() == {"error": "Rally didn't respond in time"}


def test_bad_key_is_401():
    with client_for(FakeAdapter(bootstrap=RallyError(401, "Rally rejected the API key"))) as c:
        assert c.get("/api/bootstrap").status_code == 401


def test_value_error_is_422():
    with client_for(FakeAdapter(changes=ValueError("since must be an ISO time"))) as c:
        r = c.get("/api/changes", params={"since": "yesterday"})
    assert r.status_code == 422 and r.json() == {"error": "since must be an ISO time"}


def test_rank_needs_exactly_one_side():
    with client_for(FakeAdapter(rank_issue=lambda i, req: issue())) as c:
        assert c.post("/api/issues/1001/rank", json={"above": 1, "below": 2}).status_code == 422
        assert c.post("/api/issues/1001/rank", json={}).status_code == 422
        assert c.post("/api/issues/1001/rank", json={"above": 1002}).status_code == 200


def test_patch_rejects_unknown_and_null_fields():
    with client_for(FakeAdapter(update_issue=lambda i, p: issue())) as c:
        assert c.patch("/api/issues/1001", json={"priority": "High"}).status_code == 422
        assert c.patch("/api/issues/1001", json={"state": None}).status_code == 422


def test_create_returns_201():
    with client_for(FakeAdapter(create_issue=lambda data: issue(Name=data.name))) as c:
        r = c.post("/api/issues", json={"name": "[DEMO] New", "feature_id": 201})
    assert r.status_code == 201 and r.json()["name"] == "[DEMO] New"


def test_issue_detail_and_task_patch():
    detail = IssueDetail(issue=issue(), tasks=[task_from_rally(rally_task())])
    adapter = FakeAdapter(get_issue=detail, update_task=lambda tid, p: task_from_rally(rally_task(State="Completed")))
    with client_for(adapter) as c:
        assert c.get("/api/issues/1001").json()["tasks"][0]["id"] == 4001
        assert c.patch("/api/tasks/4001", json={"state": "Completed"}).json()["state"] == "Completed"


def test_lifespan_closes_adapter():
    adapter = FakeAdapter()
    with client_for(adapter) as c:
        c.get("/api/health")
    assert adapter.closed is True
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd server && uv run pytest tests/test_api.py -q`
Expected: FAIL with `TypeError: create_app() takes 0 positional arguments but 1 was given`.

- [ ] **Step 3: Replace `server/app/main.py`**

```python
"""FastAPI app: the domain API in front of the Rally adapter (spec §3)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .adapter import RallyAdapter
from .config import Settings
from .domain import Bootstrap, Changes, Issue, IssueCreate, IssueDetail, IssuePatch, RankRequest, Task, TaskPatch
from .guard import GuardError, WriteGuard
from .rally_client import RallyClient, RallyError

log = logging.getLogger("rally_poc")


def build_adapter(settings: Settings) -> RallyAdapter:
    client = RallyClient(settings.rally_base_url, settings.rally_api_key, timeout=settings.rally_timeout_s,
                         max_concurrency=settings.rally_max_concurrency)
    guard = WriteGuard(settings.write_guard, settings.rally_project, settings.demo_prefix, settings.demo_tag)
    return RallyAdapter(client, settings, guard)


def create_app(adapter: RallyAdapter | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.adapter = adapter or build_adapter(Settings())
        yield
        await app.state.adapter.aclose()

    app = FastAPI(title="Rally POC proxy", lifespan=lifespan)

    @app.exception_handler(RallyError)
    async def rally_error(_: Request, e: RallyError) -> JSONResponse:
        return JSONResponse({"error": e.message}, status_code=e.status)

    @app.exception_handler(GuardError)
    async def guard_error(request: Request, e: GuardError) -> JSONResponse:
        log.warning("write guard blocked %s %s: %s", request.method, request.url.path, e)
        return JSONResponse({"error": str(e)}, status_code=403)

    @app.exception_handler(ValueError)
    async def bad_value(_: Request, e: ValueError) -> JSONResponse:
        return JSONResponse({"error": str(e)}, status_code=422)

    def rally(request: Request) -> RallyAdapter:
        return request.app.state.adapter

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/api/bootstrap", response_model=Bootstrap)
    async def bootstrap(request: Request):
        return await rally(request).bootstrap()

    @app.get("/api/changes", response_model=Changes)
    async def changes(request: Request, since: str):
        return await rally(request).changes(since)

    @app.get("/api/issues/{issue_id}", response_model=IssueDetail)
    async def get_issue(request: Request, issue_id: int):
        return await rally(request).get_issue(issue_id)

    @app.post("/api/issues", response_model=Issue, status_code=201)
    async def create_issue(request: Request, data: IssueCreate):
        return await rally(request).create_issue(data)

    @app.patch("/api/issues/{issue_id}", response_model=Issue)
    async def update_issue(request: Request, issue_id: int, patch: IssuePatch):
        return await rally(request).update_issue(issue_id, patch)

    @app.post("/api/issues/{issue_id}/rank", response_model=Issue)
    async def rank_issue(request: Request, issue_id: int, req: RankRequest):
        return await rally(request).rank_issue(issue_id, req)

    @app.patch("/api/tasks/{task_id}", response_model=Task)
    async def update_task(request: Request, task_id: int, patch: TaskPatch):
        return await rally(request).update_task(task_id, patch)

    return app


app = create_app()
```

- [ ] **Step 4: Run every server test**

Run: `cd server && uv run pytest -q`
Expected: `68 passed`. `test_health.py` still passes: with no adapter injected, the lifespan builds a real one from `Settings()` and never calls Rally for `/api/health`.

- [ ] **Step 5: Add `check api` to the CLI**

In `.claude/skills/verify-rally-poc/rallypoc`, insert this block immediately above `def main(argv=None) -> int:`:

```python
# ---------- check ----------
DEMO_STATE_STORY = "[DEMO] Story editor with HTML round-trip"


def _demo_ids(b: dict) -> set[int]:
    return {i["id"] for i in b["issues"] if i["name"].startswith(b["demo_prefix"]) and b["demo_tag"] in i["tags"]}


def check_api(args) -> None:
    """Spec §9.1 live API checks. Writes touch only [DEMO] items and are reverted."""
    failed = 0

    def verdict(name: str, ok: bool, evidence="", reason: str = "") -> None:
        nonlocal failed
        record(args, f"api:{name}", "PASS" if ok else "FAIL", evidence, "" if ok else reason)
        failed += not ok

    status, b = api_call("GET", "/api/bootstrap")
    if status != 200:
        raise Fail(f"bootstrap returned HTTP {status}: {b}")
    saved = state_dir(args) / "evidence" / "check-api-bootstrap.json"
    saved.write_text(json.dumps(b, indent=1))
    demo = _demo_ids(b)
    verdict("bootstrap-demo", len(demo) >= 8, saved, f"{len(demo)} [DEMO] issues loaded, expected 8; run `rallypoc seed`")

    real = next((i for i in b["issues"] if i["id"] not in demo), None)
    if real is None:
        record(args, "api:guard-blocks-real", "SKIP", "", "no non-demo issue in the sprint or backlog")
    else:
        # A no-op patch (same estimate): even if the guard were broken, Rally would see no change.
        s, body = api_call("PATCH", f"/api/issues/{real['id']}", {"estimate": real["estimate"]})
        verdict("guard-blocks-real", s == 403, f"HTTP {s}", f"expected 403, got {s}: {body}")

    story = next((i for i in b["issues"] if i["id"] in demo and i["name"] == DEMO_STATE_STORY), None)
    if story is None:
        verdict("state-round-trip", False, "", f"{DEMO_STATE_STORY!r} not loaded; run `rallypoc seed`")
    else:
        original = story["state"]
        target = "Defined" if original == "In-Progress" else "In-Progress"
        s1, i1 = api_call("PATCH", f"/api/issues/{story['id']}", {"state": target})
        s2, i2 = api_call("PATCH", f"/api/issues/{story['id']}", {"state": original})
        ok = s1 == 200 and i1.get("state") == target and s2 == 200 and i2.get("state") == original
        verdict("state-round-trip", ok, f"{original} -> {target} -> {original}", f"HTTP {s1}/{s2}: {i1} / {i2}")

    order = b["backlog_order"]
    demo_backlog = [x for x in order if x in demo]
    if len(demo_backlog) < 2:
        verdict("rank-round-trip", False, "", "need two [DEMO] backlog stories; run `rallypoc seed`")
    else:
        first, last = demo_backlog[0], demo_backlog[-1]
        at = order.index(last)
        restore = {"below": order[at - 1]} if at > 0 else {"above": order[at + 1]}
        s1, _ = api_call("POST", f"/api/issues/{last}/rank", {"above": first})
        _, ch = api_call("GET", f"/api/changes?since={b['server_time']}")
        moved = [x for x in ch["backlog_order"] if x in (first, last)] == [last, first]
        s2, _ = api_call("POST", f"/api/issues/{last}/rank", restore)
        _, ch2 = api_call("GET", f"/api/changes?since={b['server_time']}")
        side, neighbor = next(iter(restore.items()))
        o2 = ch2["backlog_order"]
        restored = last in o2 and neighbor in o2 and o2.index(last) == o2.index(neighbor) + (1 if side == "below" else -1)
        verdict("rank-round-trip", s1 == 200 and moved and s2 == 200 and restored,
                f"moved={moved} restored={restored}", f"HTTP {s1}/{s2}")
    if failed:
        raise Fail(f"{failed} API check(s) failed")


CHECKS = {"api": check_api}


def cmd_check(args) -> None:
    CHECKS[args.what](args)
```

In `main()`, add the subparser after the `seed` line:

```python
    c = sub.add_parser("check", help="the spec's live checks (§9.1)", epilog="examples: rallypoc check api")
    c.add_argument("what", choices=list(CHECKS))
    c.set_defaults(fn=cmd_check)
```

- [ ] **Step 6: Drive the API live against the demo data**

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up
$CC api GET /api/bootstrap --expect 200 --field project.name
$CC api GET /api/bootstrap --expect 200 --field current_iteration_id
$CC check api
$CC api GET '/api/changes?since=yesterday' --expect 422
$CC stack down
```

Expected:
- `"Team - Data Services"`.
- A number, not `null`.
- Four `api:` lines that all say `PASS`. `guard-blocks-real` may say `SKIP` if the sprint and backlog contain no real items.
- `HTTP 422`.

If `bootstrap-demo` fails with a Rally error (`422`), read the message in the response. The likeliest cause is a query clause, so fix `BACKLOG_QUERY` or the scope parameters and add a regression test.

- [ ] **Step 7: Commit the code**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add domain API routes, error mapping and live API checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Update the rally-proxy area and commit**

Replace `.claude/skills/rally-poc-feature-map/features/rally-proxy.md` using this heredoc. Each row's `Live` is `$TODAY` only if its `check api` line was PASS. Write `not driven` for create and task-patch, which are driven in Task 12.

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/rally-proxy.md <<EOF
# Rally proxy

Last verified: $SHA on $TODAY (live)

The local FastAPI process between the web client and Rally. It holds the API key, maps Rally objects to domain objects (\`server/app/mapping.py\`), and refuses non-demo writes while \`WRITE_GUARD=demo\` (\`server/app/guard.py\`). No user sees it directly. Overall: stable for reads, state changes and ranking; beta for create and task edits until the UI drives them.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| rally-proxy-health | \`GET /api/health\` answers without touching Rally | stable | API | $SHA | $TODAY | \`server/tests/test_health.py::test_health_needs_no_rally\` |
| rally-proxy-bootstrap | Loads me, project, iterations, sprint + backlog issues, tasks, features, users in parallel | stable | API | $SHA | $TODAY | \`server/tests/test_adapter.py::test_bootstrap_picks_current_iteration_and_orders\`, \`rallypoc check api\` bootstrap-demo |
| rally-proxy-changes | Items updated since T, plus fresh sprint/backlog order | stable | API | $SHA | $TODAY | \`test_adapter.py::test_changes_returns_updates_and_fresh_orders\`, rank-round-trip |
| rally-proxy-patch | \`PATCH /api/issues/:id\` maps set fields to Rally and returns the fresh issue | stable | API | $SHA | $TODAY | \`test_adapter.py::test_update_issue_maps_patch_and_returns_fresh\`, state-round-trip |
| rally-proxy-rank | \`POST /api/issues/:id/rank\` with above/below | stable | API | $SHA | $TODAY | \`test_adapter.py::test_rank_above_uses_target_type_path\`, rank-round-trip |
| rally-proxy-create | \`POST /api/issues\` creates a story, tags it, ranks top/bottom | beta (stable pending live) | API | $SHA | not driven | \`test_adapter.py::test_create_adds_demo_tag_owner_and_ranks_bottom\` |
| rally-proxy-task-patch | \`PATCH /api/tasks/:id\` | beta (stable pending live) | API | $SHA | not driven | \`test_adapter.py::test_update_task_is_guarded_and_mapped\` |
| rally-proxy-guard | Refuses writes to non-demo items with 403 before Rally sees them | stable | API | $SHA | $TODAY | \`server/tests/test_guard.py\`, guard-blocks-real |

## How to get to it (user POV)

No user path. The web client calls it.

## Driving it

Preconditions: baseline, plus \`rallypoc seed\` if the demo data was changed by hand.

- **rally-proxy-health**: check health → \`rallypoc api GET /api/health --expect 200 --field ok\` → \`true\`
- **rally-proxy-bootstrap**, **rally-proxy-patch**, **rally-proxy-rank**, **rally-proxy-changes** and **rally-proxy-guard**: → \`rallypoc check api\` → four \`api:\` lines PASS
- **rally-proxy-create**: create from the composer (Task 12 flow \`composer\`) → \`rallypoc browser run composer\` → PASS

## Gotchas

- **Single instance.** The ports are fixed (8787/5173), so only one verify instance can run at a time.
- **Proxy restart forgets "me" and the current iteration.** \`changes()\` re-reads iterations when it has none (\`server/app/adapter.py\`), so the first poll after a restart costs one extra request.
- **The guard check needs a real item loaded.** If the sprint and backlog hold only demo items, \`guard-blocks-real\` is SKIP, not PASS.
EOF
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the rally-proxy API after live checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Expected: render-map reports `8 sub-features, 1 areas`.

---
### Task 8: Client types, API client, and the store's core (load, optimistic edits, rollback)

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`, `web/src/api/client.test.ts`
- Create: `web/src/store/patch.ts`, `web/src/store/membership.ts`, `web/src/store/store.ts`, `web/src/store/store.test.ts`
- Create: `web/src/test/fixtures.ts`
- Run: `cd web && npm install zustand@^5.0`

**Interfaces:**
- Consumes: the domain JSON from Task 7. `types.ts` mirrors `server/app/domain.py` field for field.
- Produces:
  - **`api/client.ts`:** `ApiError(status, message)`, `OFFLINE`, `errorFrom(status, data)`, `interface Api { bootstrap; changes(since); issue(id); patchIssue(id, patch); createIssue(data); rankIssue(id, req); patchTask(id, patch) }` and `api: Api`.
  - **`store/patch.ts`:** `applyIssuePatch(issue, patch, users)`, `revertIssueFields(current, before, patch)`, `applyTaskPatch(task, patch, users)`, `revertTaskFields(current, before, patch)`.
  - **`store/membership.ts`:** `inIteration(issue, currentIterationId)`, `inBacklog(issue)`, `reconcileOrders({iterationOrder, backlogOrder, currentIterationId}, issue)`.
  - **`store/store.ts`:** `createAppStore(api): AppStore`, the `AppState` interface (state plus actions, exactly as below), the types `Status`, `OrderList`, `Toast`, `Meta`, plus `asApiError` and `stateFromBootstrap(b)` (used by component tests to seed state).
  - **`test/fixtures.ts`:** `DANA`, `SAM`, `makeIssue`, `makeTask`, `makeBootstrap`, `fakeApi`, `deferred`, `readyStore`.

- [ ] **Step 1: Install zustand and write the types**

Run: `cd web && npm install zustand@^5.0`

`web/src/api/types.ts`:

```ts
// Mirrors server/app/domain.py. Rally shapes never reach the client (spec D2).
export type ScheduleState = "Defined" | "In-Progress" | "Completed" | "Accepted";
export const SCHEDULE_STATES: ScheduleState[] = ["Defined", "In-Progress", "Completed", "Accepted"];
export type TaskState = "Defined" | "In-Progress" | "Completed";

export interface User { id: number; name: string }
export interface Iteration { id: number; name: string; start: string; end: string }
export interface Feature { id: number; formatted_id: string; name: string }
export interface Project { id: number; name: string }

export interface Issue {
  id: number;
  formatted_id: string;
  kind: "story" | "defect";
  name: string;
  state: ScheduleState;
  owner: User | null;
  iteration_id: number | null;
  release_id: number | null;
  feature_id: number | null;
  project_id: number;
  estimate: number | null;
  blocked: boolean;
  tags: string[];
  description: string;
  updated_at: string;
  has_children: boolean;
}

export interface Task {
  id: number;
  formatted_id: string;
  name: string;
  state: TaskState;
  owner: User | null;
  todo: number | null;
  issue_id: number;
  project_id: number;
  tags: string[];
  updated_at: string;
}

export interface Bootstrap {
  me: User;
  project: Project;
  write_guard: "demo" | "off";
  demo_prefix: string;
  demo_tag: string;
  current_iteration_id: number | null;
  iterations: Iteration[];
  users: User[];
  features: Feature[];
  issues: Issue[];
  tasks: Task[];
  iteration_order: number[];
  backlog_order: number[];
  server_time: string;
}

export interface Changes {
  issues: Issue[];
  tasks: Task[];
  iteration_order: number[];
  backlog_order: number[];
  server_time: string;
}

export interface IssueDetail { issue: Issue; tasks: Task[] }

export interface IssuePatch {
  name?: string;
  state?: ScheduleState;
  owner_id?: number | null;
  iteration_id?: number | null;
  feature_id?: number | null;
  estimate?: number | null;
  blocked?: boolean;
  tags?: string[];
  description?: string;
}

export interface TaskPatch { name?: string; state?: TaskState; owner_id?: number | null; todo?: number | null }

export interface IssueCreate {
  name: string;
  feature_id: number;
  iteration_id?: number | null;
  estimate?: number | null;
  description?: string;
  position?: "top" | "bottom";
}

export type RankRequest = { above: number } | { below: number };
```

- [ ] **Step 2: Write the failing API-client tests**

`web/src/api/client.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";
import { api, ApiError, errorFrom, OFFLINE } from "./client";

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }))));

test("a network failure means the local server is down", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  await expect(api.bootstrap()).rejects.toEqual(new ApiError(0, OFFLINE));
});

test("the proxy's error message is kept with its status", async () => {
  respond(403, { error: "Development mode: only [DEMO] items can be edited" });
  const err = await api.patchIssue(1, { estimate: 3 }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 403, message: "Development mode: only [DEMO] items can be edited" });
});

test("FastAPI validation details are joined", () => {
  expect(errorFrom(422, { detail: [{ msg: "a" }, { msg: "b" }] }).message).toBe("a; b");
});

test("a bodiless 5xx comes from Vite's dev proxy, so the local server is down", () => {
  expect(errorFrom(502, null)).toEqual(new ApiError(0, OFFLINE));
});

test("a 504 with a body is Rally being slow, not the local server", () => {
  expect(errorFrom(504, { error: "Rally didn't respond in time" })).toMatchObject({ status: 504 });
});

test("requests use the domain routes", async () => {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response("{}", { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  await api.rankIssue(5, { above: 6 });
  await api.changes("2026-10-16T11:59:30.000Z");
  expect(fetchMock.mock.calls[0]).toEqual(["/api/issues/5/rank", expect.objectContaining({ method: "POST", body: '{"above":6}' })]);
  expect(fetchMock.mock.calls[1][0]).toBe("/api/changes?since=2026-10-16T11%3A59%3A30.000Z");
});
```

Run: `cd web && npx vitest --run src/api`
Expected: FAIL with `Failed to resolve import "./client"`.

- [ ] **Step 3: Write the API client**

`web/src/api/client.ts`:

```ts
import type { Bootstrap, Changes, Issue, IssueCreate, IssueDetail, IssuePatch, RankRequest, Task, TaskPatch } from "./types";

export const OFFLINE = "Local server isn't running";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Api {
  bootstrap(): Promise<Bootstrap>;
  changes(since: string): Promise<Changes>;
  issue(id: number): Promise<IssueDetail>;
  patchIssue(id: number, patch: IssuePatch): Promise<Issue>;
  createIssue(data: IssueCreate): Promise<Issue>;
  rankIssue(id: number, req: RankRequest): Promise<Issue>;
  patchTask(id: number, patch: TaskPatch): Promise<Task>;
}

export function errorFrom(status: number, data: unknown): ApiError {
  const body = (data ?? {}) as { error?: unknown; detail?: unknown };
  if (typeof body.error === "string") return new ApiError(status, body.error);
  if (Array.isArray(body.detail)) {
    return new ApiError(status, body.detail.map((d: { msg?: string }) => d.msg ?? "invalid").join("; "));
  }
  if (typeof body.detail === "string") return new ApiError(status, body.detail);
  // Vite's dev proxy answers 5xx with no JSON body when the FastAPI process is down.
  if (status >= 500) return new ApiError(0, OFFLINE);
  return new ApiError(status, `Request failed (${status})`);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;
  throw errorFrom(res.status, data);
}

export const api: Api = {
  bootstrap: () => request("GET", "/bootstrap"),
  changes: (since) => request("GET", `/changes?since=${encodeURIComponent(since)}`),
  issue: (id) => request("GET", `/issues/${id}`),
  patchIssue: (id, patch) => request("PATCH", `/issues/${id}`, patch),
  createIssue: (data) => request("POST", "/issues", data),
  rankIssue: (id, req) => request("POST", `/issues/${id}/rank`, req),
  patchTask: (id, patch) => request("PATCH", `/tasks/${id}`, patch),
};
```

Run: `cd web && npx vitest --run src/api`
Expected: `6 passed`.

- [ ] **Step 4: Write the test fixtures**

`web/src/test/fixtures.ts`:

```ts
import { vi, type Mocked } from "vitest";
import type { Api } from "../api/client";
import type { Bootstrap, Issue, Task, User } from "../api/types";
import { createAppStore } from "../store/store";

export const DANA: User = { id: 501, name: "Dana Demo" };
export const SAM: User = { id: 502, name: "Sam Sample" };

export function makeIssue(over: Partial<Issue> = {}): Issue {
  return {
    id: 1001, formatted_id: "US1001", kind: "story", name: "[DEMO] Example story", state: "In-Progress", owner: DANA,
    iteration_id: 301, release_id: null, feature_id: 201, project_id: 9001, estimate: 5, blocked: false,
    tags: ["collabathon-demo"], description: "<p>Hello</p>", updated_at: "2026-10-16T06:25:17.000Z", has_children: false,
    ...over,
  };
}

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 4001, formatted_id: "TA4001", name: "[DEMO] Example task", state: "Defined", owner: DANA, todo: 3,
    issue_id: 1001, project_id: 9001, tags: ["collabathon-demo"], updated_at: "2026-10-16T06:25:17.000Z", ...over,
  };
}

export function makeBootstrap(over: Partial<Bootstrap> = {}): Bootstrap {
  const sprint = [
    makeIssue(),
    makeIssue({ id: 1101, formatted_id: "DE1101", kind: "defect", name: "[DEMO] Example defect", owner: SAM, feature_id: null, state: "Defined", estimate: 2 }),
  ];
  const backlog = [
    makeIssue({ id: 1002, formatted_id: "US1002", iteration_id: null, state: "Defined", name: "[DEMO] First backlog" }),
    makeIssue({ id: 1003, formatted_id: "US1003", iteration_id: null, state: "Defined", name: "[DEMO] Second backlog" }),
  ];
  return {
    me: DANA, project: { id: 9001, name: "Demo Team" }, write_guard: "demo", demo_prefix: "[DEMO] ", demo_tag: "collabathon-demo",
    current_iteration_id: 301,
    iterations: [
      { id: 301, name: "Sprint 3", start: "2026-10-08T04:00:00.000Z", end: "2026-10-22T03:59:59.000Z" },
      { id: 302, name: "Sprint 4", start: "2026-10-22T04:00:00.000Z", end: "2026-11-05T03:59:59.000Z" },
    ],
    users: [DANA, SAM], features: [{ id: 201, formatted_id: "F201", name: "[DEMO] Feature A" }],
    issues: [...sprint, ...backlog], tasks: [makeTask()],
    iteration_order: [1001, 1101], backlog_order: [1002, 1003], server_time: "2026-10-16T11:59:30.000Z",
    ...over,
  };
}

export function fakeApi(): Mocked<Api> {
  const notStubbed = (name: string) => vi.fn(() => Promise.reject(new Error(`${name} not stubbed`)));
  return {
    bootstrap: notStubbed("bootstrap"), changes: notStubbed("changes"), issue: notStubbed("issue"),
    patchIssue: notStubbed("patchIssue"), createIssue: notStubbed("createIssue"), rankIssue: notStubbed("rankIssue"),
    patchTask: notStubbed("patchTask"),
  } as unknown as Mocked<Api>;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function readyStore(api: Mocked<Api> = fakeApi(), bootstrap: Bootstrap = makeBootstrap()) {
  api.bootstrap.mockResolvedValueOnce(bootstrap);
  const store = createAppStore(api);
  await store.getState().load();
  return { store, api };
}
```

- [ ] **Step 5: Write the failing store tests**

`web/src/store/store.test.ts`:

```ts
import { expect, test, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Issue } from "../api/types";
import { deferred, fakeApi, makeBootstrap, makeIssue, readyStore, SAM } from "../test/fixtures";
import { createAppStore } from "./store";

test("load normalizes the bootstrap", async () => {
  const { store } = await readyStore();
  const s = store.getState();
  expect(s.status).toBe("ready");
  expect(Object.keys(s.issues).map(Number).sort()).toEqual([1001, 1002, 1003, 1101]);
  expect(s.iterationOrder).toEqual([1001, 1101]);
  expect(s.backlogOrder).toEqual([1002, 1003]);
  expect(s.meta).toMatchObject({ writeGuard: "demo", demoPrefix: "[DEMO] ", demoTag: "collabathon-demo" });
  expect(s.currentIterationId).toBe(301);
  expect(s.lastSync).toBe("2026-10-16T11:59:30.000Z");
});

test.each([
  [401, "needs-key"],
  [0, "offline"],
  [500, "error"],
] as const)("load failure %i -> %s", async (status, expected) => {
  const api = fakeApi();
  api.bootstrap.mockRejectedValueOnce(new ApiError(status, "boom"));
  const store = createAppStore(api);
  await store.getState().load();
  expect(store.getState()).toMatchObject({ status: expected, error: "boom" });
});

test("an edit shows instantly, then the server copy replaces it", async () => {
  const { store, api } = await readyStore();
  const d = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(d.promise);
  const done = store.getState().updateIssue(1001, { state: "Completed" });
  expect(store.getState().issues[1001].state).toBe("Completed");
  d.resolve(makeIssue({ state: "Completed", updated_at: "2026-10-16T12:00:01.000Z" }));
  await done;
  expect(store.getState().issues[1001].updated_at).toBe("2026-10-16T12:00:01.000Z");
  expect(store.getState().pending).toEqual({});
});

test("a failed edit reverts only its fields and offers a retry", async () => {
  const { store, api } = await readyStore();
  api.patchIssue.mockRejectedValueOnce(new ApiError(403, "Development mode: only [DEMO] items can be edited"));
  await store.getState().updateIssue(1001, { estimate: 8 });
  const s = store.getState();
  expect(s.issues[1001].estimate).toBe(5);
  expect(s.toasts).toHaveLength(1);
  expect(s.toasts[0].message).toBe("Development mode: only [DEMO] items can be edited");
  api.patchIssue.mockResolvedValueOnce(makeIssue({ estimate: 8 }));
  s.toasts[0].retry?.();
  await vi.waitFor(() => expect(store.getState().issues[1001].estimate).toBe(8));
});

test("keeps a later edit when an earlier one fails", async () => {
  const { store, api } = await readyStore();
  const first = deferred<Issue>();
  const second = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const p1 = store.getState().updateIssue(1001, { state: "Completed" });
  const p2 = store.getState().updateIssue(1001, { owner_id: null });
  expect(store.getState().issues[1001]).toMatchObject({ state: "Completed", owner: null });
  first.reject(new ApiError(422, "nope"));
  await p1;
  expect(store.getState().issues[1001].state).toBe("In-Progress"); // first edit rolled back
  expect(store.getState().issues[1001].owner).toBeNull();          // second edit survives
  second.resolve(makeIssue({ owner: null }));
  await p2;
  expect(store.getState().issues[1001]).toMatchObject({ state: "In-Progress", owner: null });
});

test("edits to one issue are sent in order", async () => {
  const { store, api } = await readyStore();
  const first = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(first.promise).mockResolvedValueOnce(makeIssue({ state: "Accepted" }));
  const p1 = store.getState().updateIssue(1001, { state: "Completed" });
  const p2 = store.getState().updateIssue(1001, { state: "Accepted" });
  await vi.waitFor(() => expect(api.patchIssue).toHaveBeenCalledTimes(1));
  first.resolve(makeIssue({ state: "Completed" }));
  await Promise.all([p1, p2]);
  expect(api.patchIssue.mock.calls[1]).toEqual([1001, { state: "Accepted" }]);
  expect(store.getState().issues[1001].state).toBe("Accepted");
});

test("moving an issue out of the sprint updates both lists at once", async () => {
  const { store, api } = await readyStore();
  api.patchIssue.mockResolvedValueOnce(makeIssue({ iteration_id: null }));
  const done = store.getState().updateIssue(1001, { iteration_id: null });
  expect(store.getState().iterationOrder).toEqual([1101]);
  expect(store.getState().backlogOrder).toEqual([1001, 1002, 1003]);
  await done;
  expect(store.getState().backlogOrder).toEqual([1001, 1002, 1003]);
});

test("an owner change uses the known user's name", async () => {
  const { store, api } = await readyStore();
  api.patchIssue.mockReturnValueOnce(new Promise<Issue>(() => {}));
  void store.getState().updateIssue(1001, { owner_id: SAM.id });
  expect(store.getState().issues[1001].owner).toEqual(SAM);
});

test("toasts can be dismissed", async () => {
  const { store } = await readyStore();
  store.getState().pushToast("hello");
  const id = store.getState().toasts[0].id;
  store.getState().dismissToast(id);
  expect(store.getState().toasts).toEqual([]);
});

test("bootstrap with no sprint still loads", async () => {
  const { store } = await readyStore(fakeApi(), makeBootstrap({ current_iteration_id: null, iteration_order: [] }));
  expect(store.getState()).toMatchObject({ status: "ready", currentIterationId: null, iterationOrder: [] });
});
```

Run: `cd web && npx vitest --run src/store`
Expected: FAIL with `Failed to resolve import "./store"`.

- [ ] **Step 6: Write `patch.ts` and `membership.ts`**

`web/src/store/patch.ts`:

```ts
import type { Issue, IssuePatch, Task, TaskPatch, User } from "../api/types";

const ownerFor = (id: number | null | undefined, users: Record<number, User>): User | null =>
  id == null ? null : (users[id] ?? { id, name: "" });

export function applyIssuePatch(issue: Issue, patch: IssuePatch, users: Record<number, User>): Issue {
  const next: Issue = { ...issue };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.state !== undefined) next.state = patch.state;
  if ("owner_id" in patch) next.owner = ownerFor(patch.owner_id, users);
  if ("iteration_id" in patch) next.iteration_id = patch.iteration_id ?? null;
  if ("feature_id" in patch) next.feature_id = patch.feature_id ?? null;
  if ("estimate" in patch) next.estimate = patch.estimate ?? null;
  if (patch.blocked !== undefined) next.blocked = patch.blocked;
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.description !== undefined) next.description = patch.description;
  return next;
}

const ISSUE_FIELD: Record<keyof IssuePatch, keyof Issue> = {
  name: "name", state: "state", owner_id: "owner", iteration_id: "iteration_id", feature_id: "feature_id",
  estimate: "estimate", blocked: "blocked", tags: "tags", description: "description",
};

/** Put back only the fields this patch touched, so a later in-flight edit keeps its optimistic value. */
export function revertIssueFields(current: Issue, before: Issue, patch: IssuePatch): Issue {
  const next = { ...current } as Record<keyof Issue, unknown>;
  for (const key of Object.keys(patch) as (keyof IssuePatch)[]) {
    const field = ISSUE_FIELD[key];
    next[field] = before[field];
  }
  return next as unknown as Issue;
}

export function applyTaskPatch(task: Task, patch: TaskPatch, users: Record<number, User>): Task {
  const next: Task = { ...task };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.state !== undefined) next.state = patch.state;
  if ("owner_id" in patch) next.owner = ownerFor(patch.owner_id, users);
  if ("todo" in patch) next.todo = patch.todo ?? null;
  return next;
}

const TASK_FIELD: Record<keyof TaskPatch, keyof Task> = { name: "name", state: "state", owner_id: "owner", todo: "todo" };

export function revertTaskFields(current: Task, before: Task, patch: TaskPatch): Task {
  const next = { ...current } as Record<keyof Task, unknown>;
  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) {
    const field = TASK_FIELD[key];
    next[field] = before[field];
  }
  return next as unknown as Task;
}
```

`web/src/store/membership.ts`:

```ts
import type { Issue } from "../api/types";

export interface Orders { iterationOrder: number[]; backlogOrder: number[] }

export function inIteration(issue: Issue, currentIterationId: number | null): boolean {
  return currentIterationId !== null && issue.iteration_id === currentIterationId;
}

/** Same rule as the proxy's BACKLOG_QUERY plus the has-children filter. */
export function inBacklog(issue: Issue): boolean {
  return issue.iteration_id === null && issue.release_id === null && issue.state !== "Accepted" && !issue.has_children;
}

/** Add or remove one issue from the order lists after a local change. New sprint items go last, new backlog items first. */
export function reconcileOrders(state: Orders & { currentIterationId: number | null }, issue: Issue): Orders {
  let { iterationOrder, backlogOrder } = state;
  const wantSprint = inIteration(issue, state.currentIterationId);
  if (wantSprint && !iterationOrder.includes(issue.id)) iterationOrder = [...iterationOrder, issue.id];
  if (!wantSprint && iterationOrder.includes(issue.id)) iterationOrder = iterationOrder.filter((x) => x !== issue.id);
  const wantBacklog = inBacklog(issue);
  if (wantBacklog && !backlogOrder.includes(issue.id)) backlogOrder = [issue.id, ...backlogOrder];
  if (!wantBacklog && backlogOrder.includes(issue.id)) backlogOrder = backlogOrder.filter((x) => x !== issue.id);
  return { iterationOrder, backlogOrder };
}
```

- [ ] **Step 7: Write the store**

`web/src/store/store.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import { ApiError, type Api } from "../api/client";
import type {
  Bootstrap, Changes, Feature, Issue, IssueCreate, IssuePatch, Iteration, RankRequest, Task, TaskPatch, User,
} from "../api/types";
import { inBacklog, inIteration, reconcileOrders } from "./membership";
import { applyIssuePatch, applyTaskPatch, revertIssueFields, revertTaskFields } from "./patch";

export type Status = "loading" | "ready" | "needs-key" | "offline" | "error";
export type OrderList = "backlog" | "iteration";
export interface Toast { id: number; message: string; retry?: () => void }
export interface Meta {
  me: User;
  project: { id: number; name: string };
  writeGuard: "demo" | "off";
  demoPrefix: string;
  demoTag: string;
}

export interface AppState {
  status: Status;
  error: string | null;
  meta: Meta | null;
  currentIterationId: number | null;
  issues: Record<number, Issue>;
  tasks: Record<number, Task>;
  features: Record<number, Feature>;
  iterations: Record<number, Iteration>;
  users: Record<number, User>;
  iterationOrder: number[];
  backlogOrder: number[];
  lastSync: string | null;
  stale: boolean;
  toasts: Toast[];
  /** In-flight mutation counts: "issue:<id>", "task:<id>", and "rank". */
  pending: Record<string, number>;
  load(): Promise<void>;
  applyChanges(changes: Changes): void;
  updateIssue(id: number, patch: IssuePatch): Promise<void>;
  updateIssues(ids: number[], patch: IssuePatch): Promise<void>;
  rankIssue(id: number, req: RankRequest, list: OrderList): Promise<void>;
  createIssue(data: IssueCreate): Promise<Issue | null>;
  loadIssueDetail(id: number): Promise<void>;
  updateTask(id: number, patch: TaskPatch): Promise<void>;
  pushToast(message: string, retry?: () => void): void;
  dismissToast(id: number): void;
  setStale(stale: boolean): void;
}

export type AppStore = StoreApi<AppState>;

export function asApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(-1, e instanceof Error ? e.message : String(e));
}

const byId = <T extends { id: number }>(xs: T[]): Record<number, T> => Object.fromEntries(xs.map((x) => [x.id, x]));
const issueKey = (id: number) => `issue:${id}`;
const taskKey = (id: number) => `task:${id}`;
const RANK = "rank";

export function stateFromBootstrap(b: Bootstrap): Partial<AppState> {
  return {
    status: "ready",
    error: null,
    meta: { me: b.me, project: b.project, writeGuard: b.write_guard, demoPrefix: b.demo_prefix, demoTag: b.demo_tag },
    currentIterationId: b.current_iteration_id,
    issues: byId(b.issues),
    tasks: byId(b.tasks),
    features: byId(b.features),
    iterations: byId(b.iterations),
    users: byId(b.users),
    iterationOrder: b.iteration_order,
    backlogOrder: b.backlog_order,
    lastSync: b.server_time,
    stale: false,
  };
}

export function createAppStore(api: Api): AppStore {
  const queues = new Map<string, Promise<void>>();
  let toastSeq = 0;

  return createStore<AppState>()((set, get) => {
    const bump = (key: string, delta: number) =>
      set((s) => {
        const n = (s.pending[key] ?? 0) + delta;
        const pending = { ...s.pending };
        if (n > 0) pending[key] = n;
        else delete pending[key];
        return { pending };
      });

    /** One queue per item: its writes reach Rally in the order they were made (spec §7). */
    const enqueue = (key: string, job: () => Promise<void>): Promise<void> => {
      const next = (queues.get(key) ?? Promise.resolve()).then(job);
      queues.set(key, next);
      void next.then(() => {
        if (queues.get(key) === next) queues.delete(key);
      });
      return next;
    };

    const putIssue = (issue: Issue) =>
      set((s) => ({ issues: { ...s.issues, [issue.id]: issue }, ...reconcileOrders(s, issue) }));
    const putTask = (task: Task) => set((s) => ({ tasks: { ...s.tasks, [task.id]: task } }));
    /** True when no later write for this key is still queued, so the server copy is the latest truth. */
    const lastInQueue = (key: string) => (get().pending[key] ?? 0) <= 1;
    const fail = (e: unknown, retry?: () => void) => get().pushToast(asApiError(e).message, retry);

    return {
      status: "loading",
      error: null,
      meta: null,
      currentIterationId: null,
      issues: {},
      tasks: {},
      features: {},
      iterations: {},
      users: {},
      iterationOrder: [],
      backlogOrder: [],
      lastSync: null,
      stale: false,
      toasts: [],
      pending: {},

      async load() {
        set({ status: "loading", error: null });
        try {
          set(stateFromBootstrap(await api.bootstrap()));
        } catch (e) {
          const err = asApiError(e);
          set({ status: err.status === 401 ? "needs-key" : err.status === 0 ? "offline" : "error", error: err.message });
        }
      },

      applyChanges(changes) {
        set((s) => {
          const issues = { ...s.issues };
          for (const issue of changes.issues) if (!s.pending[issueKey(issue.id)]) issues[issue.id] = issue;
          const tasks = { ...s.tasks };
          for (const task of changes.tasks) if (!s.pending[taskKey(task.id)]) tasks[task.id] = task;
          const ranking = (s.pending[RANK] ?? 0) > 0;
          let orders = {
            iterationOrder: ranking ? s.iterationOrder : changes.iteration_order,
            backlogOrder: ranking ? s.backlogOrder : changes.backlog_order,
          };
          for (const key of Object.keys(s.pending)) {
            const local = key.startsWith("issue:") ? issues[Number(key.slice(6))] : undefined;
            if (local) orders = reconcileOrders({ ...orders, currentIterationId: s.currentIterationId }, local);
          }
          return { issues, tasks, ...orders, lastSync: changes.server_time, stale: false };
        });
      },

      updateIssue(id, patch) {
        const before = get().issues[id];
        if (!before) return Promise.resolve();
        putIssue(applyIssuePatch(before, patch, get().users));
        const key = issueKey(id);
        bump(key, 1);
        return enqueue(key, async () => {
          try {
            const fresh = await api.patchIssue(id, patch);
            if (lastInQueue(key)) putIssue(fresh);
          } catch (e) {
            putIssue(revertIssueFields(get().issues[id], before, patch));
            fail(e, () => void get().updateIssue(id, patch));
          } finally {
            bump(key, -1);
          }
        });
      },

      async updateIssues(ids, patch) {
        await Promise.all(ids.map((id) => get().updateIssue(id, patch)));
      },

      rankIssue(id, req, list) {
        const targetId = "above" in req ? req.above : req.below;
        const field = list === "backlog" ? "backlogOrder" : "iterationOrder";
        const before = get()[field];
        const from = before.indexOf(id);
        if (targetId === id || from < 0 || !before.includes(targetId)) return Promise.resolve();
        const moved = before.filter((x) => x !== id);
        const at = moved.indexOf(targetId);
        moved.splice("above" in req ? at : at + 1, 0, id);
        set({ [field]: moved } as Partial<AppState>);
        const key = issueKey(id);
        bump(key, 1);
        bump(RANK, 1);
        return enqueue(key, async () => {
          try {
            const fresh = await api.rankIssue(id, req);
            if (lastInQueue(key)) set((s) => ({ issues: { ...s.issues, [id]: fresh } }));
          } catch (e) {
            set((s) => {
              const order = s[field].filter((x) => x !== id);
              order.splice(Math.min(from, order.length), 0, id);
              return { [field]: order } as Partial<AppState>;
            });
            fail(e, () => void get().rankIssue(id, req, list));
          } finally {
            bump(key, -1);
            bump(RANK, -1);
          }
        });
      },

      async createIssue(data) {
        try {
          const issue = await api.createIssue(data);
          set((s) => {
            const place = (order: number[]) => (data.position === "bottom" ? [...order, issue.id] : [issue.id, ...order]);
            return {
              issues: { ...s.issues, [issue.id]: issue },
              iterationOrder: inIteration(issue, s.currentIterationId) ? place(s.iterationOrder) : s.iterationOrder,
              backlogOrder: inBacklog(issue) ? place(s.backlogOrder) : s.backlogOrder,
            };
          });
          return issue;
        } catch (e) {
          fail(e);
          return null;
        }
      },

      async loadIssueDetail(id) {
        try {
          const detail = await api.issue(id);
          set((s) => ({
            issues: s.pending[issueKey(id)] ? s.issues : { ...s.issues, [id]: detail.issue },
            tasks: { ...s.tasks, ...byId(detail.tasks.filter((t) => !s.pending[taskKey(t.id)])) },
          }));
        } catch (e) {
          fail(e);
        }
      },

      updateTask(id, patch) {
        const before = get().tasks[id];
        if (!before) return Promise.resolve();
        putTask(applyTaskPatch(before, patch, get().users));
        const key = taskKey(id);
        bump(key, 1);
        return enqueue(key, async () => {
          try {
            const fresh = await api.patchTask(id, patch);
            if (lastInQueue(key)) putTask(fresh);
          } catch (e) {
            putTask(revertTaskFields(get().tasks[id], before, patch));
            fail(e, () => void get().updateTask(id, patch));
          } finally {
            bump(key, -1);
          }
        });
      },

      pushToast(message, retry) {
        set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, message, retry }] }));
      },

      dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },

      setStale(stale) {
        set({ stale });
      },
    };
  });
}
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: `19 passed` across the three test files (App 1, client 6, store 12), and typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add client types, API client and optimistic store core

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Store ranking, creation, tasks, change merging, and the poller

**Files:**
- Create: `web/src/store/store2.test.ts`, `web/src/store/poller.ts`, `web/src/store/poller.test.ts`
- No change to `store.ts`. Its `rankIssue`, `createIssue`, `updateTask`, `loadIssueDetail` and `applyChanges` were written in Task 8. This task pins their behavior with tests, and adds the poller.

**Interfaces:**
- Consumes: `createAppStore`, `AppStore` (Task 8), and `Api.changes`.
- Produces: `startPoller(store: AppStore, api: Pick<Api, "changes">, opts?: { intervalMs?: number; maxBackoffMs?: number; staleAfterFailures?: number }): () => void`. It returns a stop function.

- [ ] **Step 1: Write the store behavior tests**

`web/src/store/store2.test.ts`:

```ts
import { expect, test } from "vitest";
import { ApiError } from "../api/client";
import type { Changes, Issue } from "../api/types";
import { deferred, makeIssue, makeTask, readyStore } from "../test/fixtures";

const changes = (over: Partial<Changes> = {}): Changes => ({
  issues: [], tasks: [], iteration_order: [1001, 1101], backlog_order: [1002, 1003],
  server_time: "2026-10-16T12:00:30.000Z", ...over,
});

test("rank moves the item at once and keeps it on success", async () => {
  const { store, api } = await readyStore();
  api.rankIssue.mockResolvedValueOnce(makeIssue({ id: 1003, iteration_id: null, state: "Defined" }));
  const done = store.getState().rankIssue(1003, { above: 1002 }, "backlog");
  expect(store.getState().backlogOrder).toEqual([1003, 1002]);
  await done;
  expect(api.rankIssue).toHaveBeenCalledWith(1003, { above: 1002 });
  expect(store.getState().backlogOrder).toEqual([1003, 1002]);
});

test("rank below puts the item after the target", async () => {
  const { store, api } = await readyStore();
  api.rankIssue.mockResolvedValueOnce(makeIssue());
  await store.getState().rankIssue(1001, { below: 1101 }, "iteration");
  expect(store.getState().iterationOrder).toEqual([1101, 1001]);
});

test("a failed rank puts the item back and toasts", async () => {
  const { store, api } = await readyStore();
  api.rankIssue.mockRejectedValueOnce(new ApiError(504, "Rally didn't respond in time"));
  await store.getState().rankIssue(1003, { above: 1002 }, "backlog");
  expect(store.getState().backlogOrder).toEqual([1002, 1003]);
  expect(store.getState().toasts[0]).toMatchObject({ message: "Rally didn't respond in time" });
  expect(store.getState().toasts[0].retry).toBeTypeOf("function");
});

test("ranking relative to itself or a missing item sends nothing", async () => {
  const { store, api } = await readyStore();
  await store.getState().rankIssue(1002, { above: 1002 }, "backlog");
  await store.getState().rankIssue(1002, { above: 9999 }, "backlog");
  expect(api.rankIssue).not.toHaveBeenCalled();
});

test("applyChanges replaces items and orders", async () => {
  const { store } = await readyStore();
  store.getState().applyChanges(changes({ issues: [makeIssue({ name: "[DEMO] Renamed in Rally" })], iteration_order: [1101, 1001] }));
  const s = store.getState();
  expect(s.issues[1001].name).toBe("[DEMO] Renamed in Rally");
  expect(s.iterationOrder).toEqual([1101, 1001]);
  expect(s.lastSync).toBe("2026-10-16T12:00:30.000Z");
});

test("applyChanges skips items with edits in flight", async () => {
  const { store, api } = await readyStore();
  const d = deferred<Issue>();
  api.patchIssue.mockReturnValueOnce(d.promise);
  const done = store.getState().updateIssue(1001, { state: "Completed" });
  store.getState().applyChanges(changes({ issues: [makeIssue({ state: "Defined" })] }));
  expect(store.getState().issues[1001].state).toBe("Completed"); // the poll did not clobber the local edit
  d.resolve(makeIssue({ state: "Completed" }));
  await done;
  store.getState().applyChanges(changes({ issues: [makeIssue({ state: "Accepted" })] }));
  expect(store.getState().issues[1001].state).toBe("Accepted"); // after it settles, Rally wins
});

test("applyChanges keeps the local order while a rank is in flight", async () => {
  const { store, api } = await readyStore();
  api.rankIssue.mockReturnValueOnce(new Promise<Issue>(() => {}));
  void store.getState().rankIssue(1003, { above: 1002 }, "backlog");
  store.getState().applyChanges(changes({ backlog_order: [1002, 1003] }));
  expect(store.getState().backlogOrder).toEqual([1003, 1002]);
});

test("applyChanges keeps local membership for an item being moved", async () => {
  const { store, api } = await readyStore();
  api.patchIssue.mockReturnValueOnce(new Promise<Issue>(() => {}));
  void store.getState().updateIssue(1001, { iteration_id: null });
  store.getState().applyChanges(changes()); // Rally still says 1001 is in the sprint
  expect(store.getState().iterationOrder).toEqual([1101]);
  expect(store.getState().backlogOrder[0]).toBe(1001);
});

test("createIssue places the new story by position and list", async () => {
  const { store, api } = await readyStore();
  api.createIssue.mockResolvedValueOnce(makeIssue({ id: 1009, iteration_id: null, state: "Defined" }));
  await store.getState().createIssue({ name: "[DEMO] New", feature_id: 201, position: "bottom" });
  expect(store.getState().backlogOrder).toEqual([1002, 1003, 1009]);
  api.createIssue.mockResolvedValueOnce(makeIssue({ id: 1010 }));
  await store.getState().createIssue({ name: "[DEMO] Sprint item", feature_id: 201, iteration_id: 301 });
  expect(store.getState().iterationOrder).toEqual([1010, 1001, 1101]);
});

test("a failed create toasts and returns null", async () => {
  const { store, api } = await readyStore();
  api.createIssue.mockRejectedValueOnce(new ApiError(422, "HierarchicalRequirement.UnifiedParent should not be null"));
  expect(await store.getState().createIssue({ name: "[DEMO] x", feature_id: 0 })).toBeNull();
  expect(store.getState().toasts[0].message).toContain("UnifiedParent");
});

test("task edits are optimistic and revert on failure", async () => {
  const { store, api } = await readyStore();
  api.patchTask.mockRejectedValueOnce(new ApiError(403, "Development mode: only [DEMO] items can be edited"));
  const done = store.getState().updateTask(4001, { state: "Completed" });
  expect(store.getState().tasks[4001].state).toBe("Completed");
  await done;
  expect(store.getState().tasks[4001].state).toBe("Defined");
});

test("loadIssueDetail merges the issue's tasks", async () => {
  const { store, api } = await readyStore();
  api.issue.mockResolvedValueOnce({ issue: makeIssue({ id: 1002, iteration_id: null }), tasks: [makeTask({ id: 4009, issue_id: 1002 })] });
  await store.getState().loadIssueDetail(1002);
  expect(store.getState().tasks[4009].issue_id).toBe(1002);
  expect(store.getState().tasks[4001]).toBeDefined();
});
```

Run: `cd web && npx vitest --run src/store/store2.test.ts`
Expected: `12 passed`. Task 8 already implemented this behavior. If a test fails, fix `store.ts` instead of the test, since the tests restate spec §7.

- [ ] **Step 2: Write the failing poller tests**

`web/src/store/poller.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Changes } from "../api/types";
import { readyStore } from "../test/fixtures";
import { startPoller } from "./poller";

const empty: Changes = { issues: [], tasks: [], iteration_order: [1001, 1101], backlog_order: [1002, 1003], server_time: "2026-10-16T12:00:30.000Z" };
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => vi.useRealTimers());

test("polls every 20s with the last sync time", async () => {
  const { store, api } = await readyStore();
  api.changes.mockResolvedValue(empty);
  const stop = startPoller(store, api);
  await vi.advanceTimersByTimeAsync(19_999);
  expect(api.changes).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.changes).toHaveBeenCalledWith("2026-10-16T11:59:30.000Z");
  await vi.advanceTimersByTimeAsync(20_000);
  expect(api.changes).toHaveBeenLastCalledWith("2026-10-16T12:00:30.000Z");
  stop();
});

test("backs off 40s then 80s and marks data stale after three failures", async () => {
  const { store, api } = await readyStore();
  api.changes.mockRejectedValue(new ApiError(504, "Rally didn't respond in time"));
  const stop = startPoller(store, api);
  await vi.advanceTimersByTimeAsync(20_000); // failure 1
  expect(api.changes).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(40_000); // failure 2
  expect(api.changes).toHaveBeenCalledTimes(2);
  expect(store.getState().stale).toBe(false);
  await vi.advanceTimersByTimeAsync(80_000); // failure 3
  expect(api.changes).toHaveBeenCalledTimes(3);
  expect(store.getState().stale).toBe(true);
  await vi.advanceTimersByTimeAsync(80_000); // capped at 80s
  expect(api.changes).toHaveBeenCalledTimes(4);
  api.changes.mockResolvedValue(empty);
  await vi.advanceTimersByTimeAsync(80_000);
  expect(store.getState().stale).toBe(false);
  await vi.advanceTimersByTimeAsync(20_000); // back to 20s after a success
  expect(api.changes).toHaveBeenCalledTimes(6);
  stop();
});

test("pauses while the tab is hidden and polls on return", async () => {
  const { store, api } = await readyStore();
  api.changes.mockResolvedValue(empty);
  const stop = startPoller(store, api);
  visibility = "hidden";
  await vi.advanceTimersByTimeAsync(60_000);
  expect(api.changes).not.toHaveBeenCalled();
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(api.changes).toHaveBeenCalledTimes(1);
  stop();
});

test("stop cancels future polls", async () => {
  const { store, api } = await readyStore();
  api.changes.mockResolvedValue(empty);
  startPoller(store, api)();
  await vi.advanceTimersByTimeAsync(100_000);
  expect(api.changes).not.toHaveBeenCalled();
});
```

Run: `cd web && npx vitest --run src/store/poller.test.ts`
Expected: FAIL with `Failed to resolve import "./poller"`.

- [ ] **Step 3: Write the poller**

`web/src/store/poller.ts`:

```ts
import type { Api } from "../api/client";
import type { AppStore } from "./store";

export interface PollerOptions { intervalMs?: number; maxBackoffMs?: number; staleAfterFailures?: number }

/** Spec §7/§8: poll every 20s, back off 20s → 40s → 80s, mark stale after 3 failures, pause while hidden. */
export function startPoller(store: AppStore, api: Pick<Api, "changes">, opts: PollerOptions = {}): () => void {
  const interval = opts.intervalMs ?? 20_000;
  const maxBackoff = opts.maxBackoffMs ?? 80_000;
  const staleAfter = opts.staleAfterFailures ?? 3;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void tick(), ms);
  };

  async function tick() {
    if (document.visibilityState === "hidden") return; // resumed by the visibilitychange listener
    const { status, lastSync } = store.getState();
    if (status !== "ready" || !lastSync) {
      schedule(interval);
      return;
    }
    try {
      store.getState().applyChanges(await api.changes(lastSync));
      failures = 0;
      schedule(interval);
    } catch {
      failures += 1;
      if (failures >= staleAfter) store.getState().setStale(true);
      schedule(Math.min(interval * 2 ** failures, maxBackoff));
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule(0);
  };
  document.addEventListener("visibilitychange", onVisibility);
  schedule(interval);

  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
```

- [ ] **Step 4: Run all web tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: `35 passed` (19 from Task 8, plus 12 store and 4 poller tests), and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Pin store ranking, creation and change-merge behavior; add poller

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: App shell, My Work, and keyboard navigation

**Files:**
- Create: `web/src/store/ui.ts`, `web/src/store/selectors.ts`, `web/src/store/index.ts`
- Create: `web/src/keyboard/shortcuts.ts`, `web/src/keyboard/useShortcuts.ts`, `web/src/keyboard/actions.ts`
- Create: `web/src/components/StateGlyph.tsx`, `Avatar.tsx`, `IssueRow.tsx`, `TaskRow.tsx`, `ViewFrame.tsx`, `GroupHeader.tsx`, `Sidebar.tsx`, `Toasts.tsx`, `StatusBanner.tsx`, `SetupScreen.tsx`, `Cheatsheet.tsx`
- Create: `web/src/views/registry.ts`, `web/src/views/MyWork.tsx`, `web/src/Overlays.tsx`
- Modify: `web/src/App.tsx` (full replacement), `web/src/App.test.tsx` (full replacement), `web/src/test/fixtures.ts` (add `serve`)
- Create tests: `web/src/keyboard/shortcuts.test.ts`, `web/src/keyboard/actions.test.ts`, `web/src/store/selectors.test.ts`
- Modify: `.claude/skills/verify-rally-poc/flows.py`
- Create: `.claude/skills/rally-poc-feature-map/features/my-work.md`
- Run: `cd web && npm install lucide-react@^1.58`

**Interfaces:**
- Consumes: `createAppStore`, `stateFromBootstrap`, `AppState` (Task 8), `startPoller` (Task 9), and `api` (Task 8).
- Produces:
  - **`store/ui.ts`:** `createUiStore()`, plus the types `UiState`, `View` (`"my-work" | "board" | "backlog"`) and `Picker` (`"state" | "owner" | "iteration" | "estimate" | "tags" | "feature"`).
  - **`store/index.ts`:** the singletons `appStore` and `uiStore`, and the hooks `useApp(selector)`, `useUi(selector)` and `useAppState()`.
  - **`store/selectors.ts`:** `SelectorState`, `sprintIssues`, `backlogIssues`, `myWorkGroups`, `myTasksElsewhere`, `boardColumns`, `iterationTotals`, `visibleIds`, `searchIssues` and `demoFeatures`.
  - **`keyboard`:** `resolveKey`, `isTypingTarget`, the `Action` type, `useShortcuts(onAction)` and `runAction(action)`.
  - **`views/registry.ts`:** `VIEWS: ViewDef[]` and `hasView(id)`. Tasks 13 and 14 append entries.
  - **`Overlays.tsx`:** renders every overlay. Tasks 11 and 12 add theirs.
  - **Components:** `IssueRow({issue, multi?})`, `TaskRow({task, showParent?})`, `ViewFrame({title, subtitle?, actions?, children})`, `GroupHeader({state, count})`, `StateGlyph({state, size?})`, `Avatar({user, size?})`.
  - **Test fixture:** `serve(routes)`, where a route key is `"METHOD /api/path"` and the value is either a body or `[status, body]`. It returns the fetch mock.

- [ ] **Step 1: Install icons and extend the fixtures**

Run: `cd web && npm install lucide-react@^1.58`

Append to `web/src/test/fixtures.ts`:

```ts
type Route = unknown | [number, unknown];

/** Stub global fetch: keys are "METHOD /api/path" (query string ignored); values are a body or [status, body]. */
export function serve(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input).split("?")[0]}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: `unrouted ${key}` }), { status: 404 });
    const route = routes[key];
    const [status, body] = Array.isArray(route) && typeof route[0] === "number" ? route : [200, route];
    return new Response(JSON.stringify(body), { status: status as number });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
```

- [ ] **Step 2: Write the failing pure tests (shortcuts, selectors, actions)**

`web/src/keyboard/shortcuts.test.ts`:

```ts
import { expect, test } from "vitest";
import { isTypingTarget, resolveKey, type KeyLike } from "./shortcuts";

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key: k, metaKey: false, ctrlKey: false, altKey: false, target: document.body, ...over,
});

test("letters map to Linear-style actions", () => {
  expect(resolveKey(key("j"), null)).toEqual({ action: "down", prefix: null });
  expect(resolveKey(key("k"), null).action).toBe("up");
  expect(resolveKey(key("s"), null).action).toBe("pick-state");
  expect(resolveKey(key("a"), null).action).toBe("pick-owner");
  expect(resolveKey(key(" "), null).action).toBe("open-peek");
  expect(resolveKey(key("Enter"), null).action).toBe("open-page");
  expect(resolveKey(key("?"), null).action).toBe("cheatsheet");
});

test("g then m, b or l switches view", () => {
  const first = resolveKey(key("g"), null);
  expect(first).toEqual({ prefix: "g" });
  expect(resolveKey(key("m"), first.prefix).action).toBe("go-my-work");
  expect(resolveKey(key("b"), "g").action).toBe("go-board");
  expect(resolveKey(key("l"), "g").action).toBe("go-backlog");
  expect(resolveKey(key("z"), "g")).toEqual({ action: undefined, prefix: null });
});

test("typing in an input never triggers shortcuts", () => {
  const input = document.createElement("input");
  for (const k of ["s", "j", "c", "x", "g", "?", " "]) expect(resolveKey(key(k, { target: input }), null).action).toBeUndefined();
  expect(resolveKey(key("m", { target: input }), "g").action).toBeUndefined();
});

test("typing in the description editor never triggers shortcuts", () => {
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  const paragraph = document.createElement("p");
  editor.appendChild(paragraph);
  expect(isTypingTarget(paragraph)).toBe(true);
  expect(resolveKey(key("s", { target: paragraph }), null).action).toBeUndefined();
});

test("⌘K and Escape work even while typing", () => {
  const input = document.createElement("textarea");
  expect(resolveKey(key("k", { metaKey: true, target: input }), null).action).toBe("palette");
  expect(resolveKey(key("k", { ctrlKey: true }), null).action).toBe("palette");
  expect(resolveKey(key("Escape", { target: input }), null).action).toBe("escape");
});

test("modified letters are left to the browser", () => {
  expect(resolveKey(key("c", { metaKey: true }), null).action).toBeUndefined();
  expect(resolveKey(key("s", { altKey: true }), null).action).toBeUndefined();
});
```

`web/src/store/selectors.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeBootstrap, makeIssue, makeTask, SAM } from "../test/fixtures";
import {
  backlogIssues, boardColumns, iterationTotals, myTasksElsewhere, myWorkGroups, searchIssues, type SelectorState, visibleIds,
} from "./selectors";
import { stateFromBootstrap } from "./store";

const data = (over = {}) => stateFromBootstrap(makeBootstrap(over)) as SelectorState;

test("My Work shows only my sprint items, grouped in state order", () => {
  const groups = myWorkGroups(data());
  expect(groups.map((g) => [g.state, g.issues.map((i) => i.id)])).toEqual([["In-Progress", [1001]]]);
});

test("a feature filter narrows every list", () => {
  expect(myWorkGroups(data(), 999)).toEqual([]);
  expect(backlogIssues(data(), 201).map((i) => i.id)).toEqual([1002, 1003]);
});

test("tasks I own on other people's stories are listed separately", () => {
  const s = data({ tasks: [makeTask(), makeTask({ id: 4002, issue_id: 1101 })] });
  expect(myTasksElsewhere(s).map((t) => t.id)).toEqual([4002]);
});

test("visible ids follow each view's on-screen order", () => {
  const s = data();
  expect(visibleIds(s, "my-work", null)).toEqual([1001]);
  expect(visibleIds(s, "board", null)).toEqual([1101, 1001]); // Defined column first
  expect(visibleIds(s, "backlog", null)).toEqual([1002, 1003]);
});

test("board columns always include all four states", () => {
  expect(boardColumns(data()).map((c) => [c.state, c.issues.length])).toEqual([
    ["Defined", 1], ["In-Progress", 1], ["Completed", 0], ["Accepted", 0],
  ]);
});

test("iteration totals sum estimates by state and blocked", () => {
  const s = data({
    issues: [makeIssue(), makeIssue({ id: 1101, owner: SAM, state: "Defined", estimate: 2, blocked: true })],
    iteration_order: [1001, 1101], backlog_order: [],
  });
  expect(iterationTotals(s)).toEqual({ byState: { Defined: 2, "In-Progress": 5, Completed: 0, Accepted: 0 }, blocked: 2, total: 7 });
});

test("search ranks exact IDs first, then prefixes, then substrings", () => {
  const s = data();
  expect(searchIssues(s, "us1002").map((i) => i.id)).toEqual([1002]);
  expect(searchIssues(s, "backlog").map((i) => i.id)).toEqual([1002, 1003]);
  expect(searchIssues(s, "   ")).toEqual([]);
});
```

`web/src/keyboard/actions.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue } from "../test/fixtures";
import { runAction } from "./actions";

beforeEach(() => {
  const b = makeBootstrap();
  b.issues.push(makeIssue({ id: 1004, formatted_id: "US1004", state: "Defined", name: "[DEMO] Third" }));
  b.iteration_order = [1001, 1101, 1004];
  appStore.setState(stateFromBootstrap(b));
  uiStore.setState(uiStore.getInitialState(), true);
});

test("j and k move through My Work in on-screen order", () => {
  runAction("down");
  expect(uiStore.getState().selectedId).toBe(1004); // Defined group comes first
  runAction("down");
  expect(uiStore.getState().selectedId).toBe(1001);
  runAction("down");
  expect(uiStore.getState().selectedId).toBe(1001); // stays on the last row
  runAction("up");
  expect(uiStore.getState().selectedId).toBe(1004);
});

test("S opens the state picker for the selected item", () => {
  uiStore.getState().select(1001);
  runAction("pick-state");
  expect(uiStore.getState().palette).toEqual({ open: true, picker: "state", targetIds: [1001] });
});

test("pickers need a target", () => {
  runAction("pick-owner");
  expect(uiStore.getState().palette.open).toBe(false);
});

test("X multi-selects only in the backlog", () => {
  uiStore.getState().select(1001);
  runAction("toggle-select");
  expect(uiStore.getState().selectedIds).toEqual([]);
  uiStore.setState({ view: "backlog", selectedId: 1002 });
  runAction("toggle-select");
  expect(uiStore.getState().selectedIds).toEqual([1002]);
});

test("open dialogs own the keyboard", () => {
  uiStore.getState().setComposer(true);
  runAction("down");
  expect(uiStore.getState().selectedId).toBeNull();
});

test("g m switches back to My Work", () => {
  uiStore.setState({ view: "backlog" });
  runAction("go-my-work");
  expect(uiStore.getState().view).toBe("my-work");
});

test("Escape closes the top overlay, then clears selection", () => {
  uiStore.getState().select(1001);
  runAction("open-peek");
  expect(uiStore.getState().peekId).toBe(1001);
  runAction("escape");
  expect(uiStore.getState().peekId).toBeNull();
  runAction("escape");
  expect(uiStore.getState().selectedId).toBeNull();
});
```

Run: `cd web && npx vitest --run src/keyboard src/store/selectors.test.ts`
Expected: FAIL with `Failed to resolve import "./shortcuts"` (and similar for the others).

- [ ] **Step 3: Write the UI store, selectors and store hooks**

`web/src/store/ui.ts`:

```ts
import { createStore } from "zustand/vanilla";

export type View = "my-work" | "board" | "backlog";
export type Picker = "state" | "owner" | "iteration" | "estimate" | "tags" | "feature";
export interface PaletteState { open: boolean; picker: Picker | null; targetIds: number[] }

export interface UiState {
  view: View;
  selectedId: number | null;
  selectedIds: number[];
  peekId: number | null;
  pageId: number | null;
  featureFilter: number | null;
  palette: PaletteState;
  composerOpen: boolean;
  cheatsheetOpen: boolean;
  theme: "light" | "dark";
  setView(view: View): void;
  select(id: number | null): void;
  toggleSelected(id: number): void;
  clearSelection(): void;
  openPeek(id: number | null): void;
  openPage(id: number | null): void;
  setFeatureFilter(id: number | null): void;
  openPalette(picker?: Picker | null, targetIds?: number[]): void;
  closePalette(): void;
  setComposer(open: boolean): void;
  setCheatsheet(open: boolean): void;
  toggleTheme(): void;
  closeTopOverlay(): void;
}

const THEME_KEY = "rally-poc-theme";
const savedTheme = (): "light" | "dark" =>
  typeof localStorage !== "undefined" && localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";

export function createUiStore() {
  return createStore<UiState>()((set, get) => ({
    view: "my-work",
    selectedId: null,
    selectedIds: [],
    peekId: null,
    pageId: null,
    featureFilter: null,
    palette: { open: false, picker: null, targetIds: [] },
    composerOpen: false,
    cheatsheetOpen: false,
    theme: savedTheme(),
    setView: (view) => set({ view, selectedId: null, selectedIds: [], peekId: null, pageId: null }),
    select: (id) => set({ selectedId: id }),
    toggleSelected: (id) =>
      set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),
    clearSelection: () => set({ selectedId: null, selectedIds: [] }),
    openPeek: (id) => set({ peekId: id }),
    openPage: (id) => set({ pageId: id, peekId: null }),
    setFeatureFilter: (id) => set({ featureFilter: id, selectedId: null, selectedIds: [] }),
    openPalette: (picker = null, targetIds = []) => set({ palette: { open: true, picker, targetIds } }),
    closePalette: () => set({ palette: { open: false, picker: null, targetIds: [] } }),
    setComposer: (open) => set({ composerOpen: open }),
    setCheatsheet: (open) => set({ cheatsheetOpen: open }),
    toggleTheme: () => {
      const theme = get().theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, theme);
      set({ theme });
    },
    closeTopOverlay: () => {
      const s = get();
      if (s.palette.open) s.closePalette();
      else if (s.composerOpen) set({ composerOpen: false });
      else if (s.cheatsheetOpen) set({ cheatsheetOpen: false });
      else if (s.peekId !== null) set({ peekId: null });
      else if (s.pageId !== null) set({ pageId: null });
      else set({ selectedId: null, selectedIds: [] });
    },
  }));
}
```

`web/src/store/selectors.ts`:

```ts
import { SCHEDULE_STATES, type Feature, type Issue, type ScheduleState, type Task } from "../api/types";
import type { AppState } from "./store";
import type { View } from "./ui";

export type SelectorState = Pick<
  AppState, "issues" | "tasks" | "features" | "iterationOrder" | "backlogOrder" | "meta" | "currentIterationId"
>;
export interface Group { state: ScheduleState; issues: Issue[] }
export interface Totals { byState: Record<ScheduleState, number>; blocked: number; total: number }

const pick = (s: SelectorState, ids: number[]) => ids.map((id) => s.issues[id]).filter((i): i is Issue => Boolean(i));
const inFeature = (feature: number | null) => (i: Issue) => feature === null || i.feature_id === feature;

export function sprintIssues(s: SelectorState, feature: number | null = null): Issue[] {
  return pick(s, s.iterationOrder).filter(inFeature(feature));
}

export function backlogIssues(s: SelectorState, feature: number | null = null): Issue[] {
  return pick(s, s.backlogOrder).filter(inFeature(feature));
}

export function myWorkGroups(s: SelectorState, feature: number | null = null): Group[] {
  const me = s.meta?.me.id;
  const mine = sprintIssues(s, feature).filter((i) => i.owner?.id === me);
  return SCHEDULE_STATES.map((state) => ({ state, issues: mine.filter((i) => i.state === state) })).filter((g) => g.issues.length);
}

/** Spec assumption 3: tasks I own on stories someone else owns, in the current sprint. */
export function myTasksElsewhere(s: SelectorState): Task[] {
  const me = s.meta?.me.id;
  return Object.values(s.tasks).filter((t) => {
    const parent = s.issues[t.issue_id];
    return t.owner?.id === me && parent !== undefined && parent.owner?.id !== me && s.iterationOrder.includes(t.issue_id);
  });
}

export function boardColumns(s: SelectorState, feature: number | null = null): Group[] {
  const items = sprintIssues(s, feature);
  return SCHEDULE_STATES.map((state) => ({ state, issues: items.filter((i) => i.state === state) }));
}

export function iterationTotals(s: SelectorState): Totals {
  const byState: Record<ScheduleState, number> = { Defined: 0, "In-Progress": 0, Completed: 0, Accepted: 0 };
  let blocked = 0;
  for (const issue of sprintIssues(s)) {
    const points = issue.estimate ?? 0;
    byState[issue.state] += points;
    if (issue.blocked) blocked += points;
  }
  return { byState, blocked, total: Object.values(byState).reduce((a, b) => a + b, 0) };
}

export function visibleIds(s: SelectorState, view: View, feature: number | null): number[] {
  if (view === "my-work") return myWorkGroups(s, feature).flatMap((g) => g.issues.map((i) => i.id));
  if (view === "board") return boardColumns(s, feature).flatMap((c) => c.issues.map((i) => i.id));
  return backlogIssues(s, feature).map((i) => i.id);
}

export function searchIssues(s: SelectorState, query: string, limit = 8): Issue[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (i: Issue) => {
    const id = i.formatted_id.toLowerCase();
    const name = i.name.toLowerCase();
    if (id === q) return 0;
    if (id.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    return name.includes(q) || id.includes(q) ? 3 : -1;
  };
  return Object.values(s.issues)
    .map((i) => [score(i), i] as const)
    .filter(([sc]) => sc >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].formatted_id.localeCompare(b[1].formatted_id))
    .slice(0, limit)
    .map(([, i]) => i);
}

export function demoFeatures(s: SelectorState): Feature[] {
  const prefix = s.meta?.demoPrefix ?? "[DEMO] ";
  return Object.values(s.features).filter((f) => f.name.startsWith(prefix));
}
```

`web/src/store/index.ts`:

```ts
import { useStore } from "zustand";
import { api } from "../api/client";
import { createAppStore, type AppState } from "./store";
import { createUiStore, type UiState } from "./ui";

export const appStore = createAppStore(api);
export const uiStore = createUiStore();

export const useApp = <T,>(selector: (s: AppState) => T): T => useStore(appStore, selector);
export const useUi = <T,>(selector: (s: UiState) => T): T => useStore(uiStore, selector);
/** Whole app state. Derive lists with useMemo; never return fresh arrays from a selector (zustand v5 needs stable snapshots). */
export const useAppState = (): AppState => useStore(appStore, (s) => s);
```

- [ ] **Step 4: Write the keyboard modules**

`web/src/keyboard/shortcuts.ts`:

```ts
export type Action =
  | "down" | "up" | "open-peek" | "open-page" | "create" | "toggle-select" | "palette" | "cheatsheet" | "escape"
  | "pick-state" | "pick-owner" | "pick-iteration" | "pick-estimate" | "pick-tags"
  | "go-my-work" | "go-board" | "go-backlog";

export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: EventTarget | null }

const SINGLE: Record<string, Action> = {
  j: "down", k: "up", " ": "open-peek", Enter: "open-page", c: "create", x: "toggle-select", "?": "cheatsheet",
  s: "pick-state", a: "pick-owner", i: "pick-iteration", e: "pick-estimate", t: "pick-tags",
};
const AFTER_G: Record<string, Action> = { m: "go-my-work", b: "go-board", l: "go-backlog" };

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/** Linear's conventions (spec §4). Typing in a field never triggers a shortcut, except ⌘K and Escape. */
export function resolveKey(e: KeyLike, prefix: "g" | null): { action?: Action; prefix: "g" | null } {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return { action: "palette", prefix: null };
  if (e.key === "Escape") return { action: "escape", prefix: null };
  if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return { prefix: null };
  if (prefix === "g") return { action: AFTER_G[e.key], prefix: null };
  if (e.key === "g") return { prefix: "g" };
  return { action: SINGLE[e.key], prefix: null };
}
```

`web/src/keyboard/useShortcuts.ts`:

```ts
import { useEffect, useLayoutEffect, useRef } from "react";
import { resolveKey, type Action } from "./shortcuts";

export function useShortcuts(onAction: (action: Action) => void): void {
  const handler = useRef(onAction);
  useLayoutEffect(() => {
    handler.current = onAction;
  });
  useEffect(() => {
    let prefix: "g" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // a dialog (palette, composer) already handled it
      const result = resolveKey(e, prefix);
      prefix = result.prefix;
      clearTimeout(timer);
      if (prefix) timer = setTimeout(() => (prefix = null), 1000);
      if (result.action) {
        e.preventDefault();
        handler.current(result.action);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, []);
}
```

`web/src/keyboard/actions.ts`:

```ts
import { appStore, uiStore } from "../store";
import { visibleIds } from "../store/selectors";
import type { Picker, UiState, View } from "../store/ui";
import { hasView } from "../views/registry";
import type { Action } from "./shortcuts";

function targets(ui: UiState): number[] {
  if (ui.selectedIds.length) return ui.selectedIds;
  const one = ui.pageId ?? ui.peekId ?? ui.selectedId;
  return one === null ? [] : [one];
}

function move(ui: UiState, delta: number): void {
  const ids = visibleIds(appStore.getState(), ui.view, ui.featureFilter);
  if (!ids.length) return;
  const at = ui.selectedId === null ? -1 : ids.indexOf(ui.selectedId);
  const next = at < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, at + delta));
  ui.select(ids[next]);
  if (ui.peekId !== null) ui.openPeek(ids[next]); // the side panel follows the selection
}

export function runAction(action: Action): void {
  const ui = uiStore.getState();
  if (action === "palette") {
    if (ui.palette.open) ui.closePalette();
    else ui.openPalette(null, targets(ui));
    return;
  }
  if (ui.palette.open || ui.composerOpen) return; // dialogs own the keyboard
  if (action === "escape") return ui.closeTopOverlay();
  if (action === "cheatsheet") return ui.setCheatsheet(!ui.cheatsheetOpen);
  if (action === "create") return ui.setComposer(true);
  if (action === "go-my-work" || action === "go-board" || action === "go-backlog") {
    const view = action.slice(3) as View;
    if (hasView(view)) ui.setView(view);
    return;
  }
  if (action === "down" || action === "up") return move(ui, action === "down" ? 1 : -1);
  if (action === "toggle-select") {
    if (ui.view === "backlog" && ui.selectedId !== null) ui.toggleSelected(ui.selectedId);
    return;
  }
  const ids = targets(ui);
  if (!ids.length) return;
  if (action === "open-peek") return ui.openPeek(ui.peekId === ids[0] ? null : ids[0]);
  if (action === "open-page") return ui.openPage(ids[0]);
  ui.openPalette(action.slice(5) as Picker, ids); // pick-state | pick-owner | pick-iteration | pick-estimate | pick-tags
}
```

- [ ] **Step 5: Write the components**

`web/src/components/StateGlyph.tsx`:

```tsx
import type { ScheduleState } from "../api/types";

export const STATE_COLOR: Record<ScheduleState, string> = {
  Defined: "var(--color-state-defined)",
  "In-Progress": "var(--color-state-progress)",
  Completed: "var(--color-state-completed)",
  Accepted: "var(--color-state-accepted)",
};

export function StateGlyph({ state, size = 14 }: { state: ScheduleState; size?: number }) {
  const c = STATE_COLOR[state];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={state} className="shrink-0">
      <circle cx="7" cy="7" r="5.5" fill={state === "Accepted" ? c : "none"} stroke={c} strokeWidth="1.5"
        strokeDasharray={state === "Defined" ? "2 1.6" : undefined} />
      {state === "In-Progress" && <path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill={c} />}
      {state === "Completed" && <circle cx="7" cy="7" r="3.5" fill={c} />}
      {state === "Accepted" && (
        <path d="M4.6 7.2 6.3 8.8 9.4 5.6" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
```

`web/src/components/Avatar.tsx`:

```tsx
import type { User } from "../api/types";

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
}

function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ user, size = 18 }: { user: User | null; size?: number }) {
  if (!user) {
    return <span aria-label="Unassigned" className="inline-block shrink-0 rounded-full border border-dashed border-line-3" style={{ width: size, height: size }} />;
  }
  return (
    <span title={user.name} aria-label={user.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-medium text-white"
      style={{ width: size, height: size, background: `lch(60% 40 ${hue(user.name)})` }}>
      {initials(user.name)}
    </span>
  );
}
```

`web/src/components/IssueRow.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { Issue } from "../api/types";
import { uiStore, useApp, useUi } from "../store";
import { Avatar } from "./Avatar";
import { StateGlyph } from "./StateGlyph";

export function IssueRow({ issue, multi = false }: { issue: Issue; multi?: boolean }) {
  const selected = useUi((u) => u.selectedId === issue.id);
  const checked = useUi((u) => u.selectedIds.includes(issue.id));
  const feature = useApp((s) => (issue.feature_id ? s.features[issue.feature_id] : undefined));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  return (
    <div ref={ref} role="option" aria-selected={selected} data-issue-id={issue.id}
      onClick={() => uiStore.getState().select(issue.id)}
      onDoubleClick={() => uiStore.getState().openPage(issue.id)}
      className={`flex h-(--size-row) cursor-default items-center gap-2 rounded-control px-3 transition-colors duration-150 ${selected ? "bg-hover" : "hover:bg-hover/60"}`}>
      {multi && (
        <input type="checkbox" aria-label={`Select ${issue.formatted_id}`} checked={checked}
          onChange={() => uiStore.getState().toggleSelected(issue.id)} onClick={(e) => e.stopPropagation()} />
      )}
      <span className="w-16 shrink-0 text-ink-3">{issue.formatted_id}</span>
      <StateGlyph state={issue.state} />
      <span className="min-w-0 flex-1 truncate font-medium text-ink-1">{issue.name}</span>
      {issue.blocked && <span className="rounded-full bg-blocked/15 px-2 text-mini text-blocked">Blocked</span>}
      {feature && <span className="max-w-48 truncate rounded-full border border-line-2 px-2 text-mini text-ink-3">{feature.name}</span>}
      {issue.estimate !== null && <span className="w-6 text-right text-mini text-ink-3">{issue.estimate}</span>}
      <Avatar user={issue.owner} />
    </div>
  );
}
```

`web/src/components/TaskRow.tsx`:

```tsx
import type { Task } from "../api/types";
import { appStore, useApp } from "../store";

export function TaskRow({ task, showParent = false }: { task: Task; showParent?: boolean }) {
  const parent = useApp((s) => s.issues[task.issue_id]);
  const done = task.state === "Completed";
  return (
    <div className="flex h-9 items-center gap-2 rounded-control px-3 hover:bg-hover/60">
      <input type="checkbox" aria-label={`Complete ${task.formatted_id}`} checked={done}
        onChange={() => void appStore.getState().updateTask(task.id, { state: done ? "Defined" : "Completed" })} />
      <span className="w-16 shrink-0 text-ink-3">{task.formatted_id}</span>
      <span className={`min-w-0 flex-1 truncate ${done ? "text-ink-4 line-through" : "text-ink-1"}`}>{task.name}</span>
      {showParent && parent && <span className="text-mini text-ink-3">{parent.formatted_id}</span>}
      {task.todo !== null && <span className="w-10 text-right text-mini text-ink-3">{task.todo}h</span>}
    </div>
  );
}
```

`web/src/components/ViewFrame.tsx`:

```tsx
import type { ReactNode } from "react";

export function ViewFrame({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-(--size-header) shrink-0 items-center gap-2 border-b border-line-1 px-4">
        <h1 className="font-medium text-ink-1">{title}</h1>
        {subtitle && <span className="text-ink-3">· {subtitle}</span>}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-ink-3">{children}</p>;
}
```

`web/src/components/GroupHeader.tsx`:

```tsx
import type { ScheduleState } from "../api/types";
import { StateGlyph } from "./StateGlyph";

export function GroupHeader({ state, count }: { state: ScheduleState; count: number }) {
  return (
    <div className="flex h-(--size-group) items-center gap-2 rounded-control bg-hover/70 px-3">
      <StateGlyph state={state} />
      <span className="font-medium text-ink-2">{state}</span>
      <span className="text-ink-3">{count}</span>
    </div>
  );
}
```

`web/src/components/Sidebar.tsx`:

```tsx
import { Keyboard, Moon, Sun } from "lucide-react";
import { useMemo } from "react";
import { uiStore, useAppState, useUi } from "../store";
import { demoFeatures } from "../store/selectors";
import { VIEWS } from "../views/registry";

const item = "flex h-(--size-nav) w-full items-center gap-2 rounded-control px-2 text-left font-medium transition-colors duration-150";

export function Sidebar() {
  const app = useAppState();
  const view = useUi((u) => u.view);
  const filter = useUi((u) => u.featureFilter);
  const theme = useUi((u) => u.theme);
  const features = useMemo(() => demoFeatures(app), [app]);
  const ui = uiStore.getState();
  const prefix = app.meta?.demoPrefix ?? "";
  return (
    <nav aria-label="Main" className="flex w-(--size-sidebar) shrink-0 flex-col gap-5 px-3 py-3">
      <div className="flex h-(--size-nav) items-center px-2 font-medium text-ink-1">{app.meta?.project.name ?? "Rally POC"}</div>
      <ul className="flex flex-col gap-0.5">
        {VIEWS.map((v) => (
          <li key={v.id}>
            <button type="button" aria-current={view === v.id ? "page" : undefined} onClick={() => ui.setView(v.id)}
              className={`${item} ${view === v.id ? "bg-selected text-ink-1" : "text-ink-3 hover:bg-hover hover:text-ink-1"}`}>
              <v.icon size={14} />
              <span className="flex-1">{v.label}</span>
              <kbd className="text-mini font-normal text-ink-4">{v.shortcut}</kbd>
            </button>
          </li>
        ))}
      </ul>
      {features.length > 0 && (
        <section aria-label="Features">
          <h2 className="mb-1 px-2 text-mini font-medium text-ink-3">Features</h2>
          <ul className="flex flex-col gap-0.5">
            {features.map((f) => (
              <li key={f.id}>
                <button type="button" aria-pressed={filter === f.id} onClick={() => ui.setFeatureFilter(filter === f.id ? null : f.id)}
                  className={`${item} ${filter === f.id ? "bg-selected text-ink-1" : "text-ink-3 hover:bg-hover hover:text-ink-1"}`}>
                  <span className="truncate">{f.name.replace(prefix, "")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-auto flex gap-1">
        <button type="button" aria-label="Toggle theme" onClick={() => ui.toggleTheme()} className="rounded-control p-2 text-ink-3 hover:bg-hover">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button type="button" aria-label="Keyboard shortcuts" onClick={() => ui.setCheatsheet(true)} className="rounded-control p-2 text-ink-3 hover:bg-hover">
          <Keyboard size={14} />
        </button>
      </div>
    </nav>
  );
}
```

`web/src/components/Toasts.tsx`:

```tsx
import { X } from "lucide-react";
import { useEffect } from "react";
import { appStore, useApp } from "../store";
import type { Toast } from "../store/store";

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    if (toast.retry) return; // keep retryable errors until acted on
    const timer = setTimeout(() => appStore.getState().dismissToast(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const dismiss = () => appStore.getState().dismissToast(toast.id);
  return (
    <div className="flex items-start gap-2 rounded-control border border-line-2 bg-surface px-3 py-2 text-ink-2 shadow-palette">
      <span className="flex-1">{toast.message}</span>
      {toast.retry && (
        <button type="button" className="font-medium text-ink-1" onClick={() => { dismiss(); toast.retry?.(); }}>Retry</button>
      )}
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-ink-3"><X size={14} /></button>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
```

`web/src/components/StatusBanner.tsx`:

```tsx
import { useApp } from "../store";

export function StatusBanner() {
  const status = useApp((s) => s.status);
  const stale = useApp((s) => s.stale);
  const text = status === "offline" ? "Local server isn't running. Retrying every 5 seconds…"
    : stale ? "Showing cached data. Rally isn't responding." : null;
  if (!text) return null;
  return <div role="alert" className="border-b border-line-1 bg-hover px-4 py-1.5 text-mini text-ink-2">{text}</div>;
}
```

`web/src/components/SetupScreen.tsx`:

```tsx
import { useApp } from "../store";

export function SetupScreen() {
  const error = useApp((s) => s.error);
  return (
    <main className="flex h-full items-center justify-center bg-app">
      <div className="w-[440px] rounded-palette border border-line-2 bg-surface p-6 shadow-palette">
        <h1 className="mb-2 text-regular font-medium text-ink-1">Set RALLY_API_KEY in .env</h1>
        <p className="mb-3 text-ink-2">{error}</p>
        <ol className="list-decimal space-y-1 pl-5 text-ink-2">
          <li>Create a Full Access key at rally1.rallydev.com → Profile → API Keys.</li>
          <li>Put it in the repo-root <code>.env</code> as <code>RALLY_API_KEY=…</code>.</li>
          <li>Restart the proxy, then reload this page.</li>
        </ol>
      </div>
    </main>
  );
}
```

`web/src/components/Cheatsheet.tsx`:

```tsx
import { useUi } from "../store";

const ROWS: [string, string][] = [
  ["J / K", "Move down / up"], ["Space", "Peek"], ["Enter", "Open"], ["C", "Create story"], ["S", "State"],
  ["A", "Owner"], ["I", "Iteration"], ["E", "Estimate"], ["T", "Tags"], ["X", "Select (backlog)"],
  ["G then M / B / L", "My Work / Board / Backlog"], ["⌘K", "Command palette"], ["?", "This list"], ["Esc", "Close"],
];

export function Cheatsheet() {
  const open = useUi((u) => u.cheatsheetOpen);
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Keyboard shortcuts" className="fixed bottom-14 left-3 z-40 w-72 rounded-palette border border-line-2 bg-surface p-3 shadow-palette">
      <h2 className="mb-2 font-medium text-ink-1">Keyboard shortcuts</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {ROWS.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt className="text-mini text-ink-3">{keys}</dt>
            <dd className="text-ink-2">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 6: Write the view registry, My Work, overlays and App**

`web/src/views/registry.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ComponentType } from "react";
import type { View } from "../store/ui";
import { MyWork } from "./MyWork";

export interface ViewDef { id: View; label: string; icon: LucideIcon; shortcut: string; component: ComponentType }

export const VIEWS: ViewDef[] = [
  { id: "my-work", label: "My Work", icon: Inbox, shortcut: "G M", component: MyWork },
];

export const hasView = (id: View): boolean => VIEWS.some((v) => v.id === id);
```

`web/src/views/MyWork.tsx`:

```tsx
import { useMemo } from "react";
import { GroupHeader } from "../components/GroupHeader";
import { IssueRow } from "../components/IssueRow";
import { TaskRow } from "../components/TaskRow";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { useAppState, useUi } from "../store";
import { myTasksElsewhere, myWorkGroups } from "../store/selectors";

export function MyWork() {
  const app = useAppState();
  const filter = useUi((u) => u.featureFilter);
  const groups = useMemo(() => myWorkGroups(app, filter), [app, filter]);
  const tasks = useMemo(() => myTasksElsewhere(app), [app]);
  const iteration = app.currentIterationId !== null ? app.iterations[app.currentIterationId] : undefined;
  return (
    <ViewFrame title="My Work" subtitle={iteration?.name}>
      {!iteration ? (
        <Empty>No current iteration in {app.meta?.project.name}.</Empty>
      ) : groups.length === 0 && tasks.length === 0 ? (
        <Empty>Nothing assigned to you in {iteration.name}.</Empty>
      ) : (
        <div role="listbox" aria-label="My Work" className="flex flex-col gap-1">
          {groups.map((g) => (
            <section key={g.state} aria-label={g.state}>
              <GroupHeader state={g.state} count={g.issues.length} />
              {g.issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
            </section>
          ))}
          {tasks.length > 0 && (
            <section aria-label="Tasks on other stories">
              <h3 className="flex h-(--size-group) items-center px-3 font-medium text-ink-2">Tasks on other stories</h3>
              {tasks.map((t) => <TaskRow key={t.id} task={t} showParent />)}
            </section>
          )}
        </div>
      )}
    </ViewFrame>
  );
}
```

`web/src/Overlays.tsx`:

```tsx
import { Cheatsheet } from "./components/Cheatsheet";
import { Toasts } from "./components/Toasts";

export function Overlays() {
  return (
    <>
      <Cheatsheet />
      <Toasts />
    </>
  );
}
```

Replace `web/src/App.tsx`:

```tsx
import { useEffect } from "react";
import { api } from "./api/client";
import { Sidebar } from "./components/Sidebar";
import { SetupScreen } from "./components/SetupScreen";
import { StatusBanner } from "./components/StatusBanner";
import { Empty } from "./components/ViewFrame";
import { runAction } from "./keyboard/actions";
import { useShortcuts } from "./keyboard/useShortcuts";
import { Overlays } from "./Overlays";
import { appStore, useApp, useUi } from "./store";
import { startPoller } from "./store/poller";
import { VIEWS } from "./views/registry";

export function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const view = useUi((u) => u.view);
  const theme = useUi((u) => u.theme);

  useEffect(() => {
    void appStore.getState().load();
    return startPoller(appStore, api);
  }, []);
  useEffect(() => {
    if (status !== "offline") return;
    const timer = setInterval(() => void appStore.getState().load(), 5000); // spec §8: retry every 5s
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useShortcuts(runAction);

  if (status === "needs-key") return <SetupScreen />;
  const Current = (VIEWS.find((v) => v.id === view) ?? VIEWS[0]).component;
  return (
    <div className="flex h-full bg-app text-small text-ink-1">
      <Sidebar />
      <main className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-control border border-line-2 bg-panel">
        <StatusBanner />
        {status === "loading" && <Empty>Loading Rally…</Empty>}
        {status === "offline" && <Empty>Waiting for the local server…</Empty>}
        {status === "error" && <Empty>{error}</Empty>}
        {status === "ready" && <Current />}
      </main>
      <Overlays />
    </div>
  );
}
```

Replace `web/src/App.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { appStore, uiStore } from "./store";
import { makeBootstrap, serve } from "./test/fixtures";

beforeEach(() => {
  appStore.setState(appStore.getInitialState(), true);
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

test("loads Rally data and shows My Work grouped by state", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap() });
  render(<App />);
  expect(await screen.findByRole("option", { name: /Example story/ })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "In-Progress" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Example defect/ })).not.toBeInTheDocument(); // Sam's, not mine
  expect(screen.getByRole("navigation", { name: "Main" })).toHaveTextContent("Demo Team");
});

test("a rejected API key shows the setup screen", async () => {
  serve({ "GET /api/bootstrap": [401, { error: "Rally rejected the API key" }] });
  render(<App />);
  expect(await screen.findByText("Set RALLY_API_KEY in .env")).toBeInTheDocument();
  expect(screen.getByText("Rally rejected the API key")).toBeInTheDocument();
});

test("j selects the first row", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap() });
  render(<App />);
  const row = await screen.findByRole("option", { name: /Example story/ });
  fireEvent.keyDown(window, { key: "j" });
  expect(row).toHaveAttribute("aria-selected", "true");
});

test("no current iteration explains itself", async () => {
  serve({ "GET /api/bootstrap": makeBootstrap({ current_iteration_id: null, iteration_order: [] }) });
  render(<App />);
  expect(await screen.findByText("No current iteration in Demo Team.")).toBeInTheDocument();
});
```

- [ ] **Step 7: Run all web tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected:
- `58 passed`: 35 earlier, minus the old App test, plus App 4, shortcuts 6, selectors 7 and actions 7.
- Typecheck exits 0.

If typecheck reports a missing `lucide-react` export, find the nearest icon name in `web/node_modules/lucide-react/dist/lucide-react.d.ts` and use it.

- [ ] **Step 8: Add browser flows and drive them live**

In `.claude/skills/verify-rally-poc/flows.py`, add `import re` at the top, replace the `smoke` flow, and add `my_work`:

```python
@flow
def smoke(page: Page) -> None:
    page.goto(WEB)
    expect(page.get_by_role("navigation", name="Main")).to_be_visible()
    expect(page.get_by_role("button", name=re.compile("My Work"))).to_be_visible()


@flow
def my_work(page: Page) -> None:
    page.goto(WEB)
    row = page.get_by_role("option", name=re.compile(r"My Work view with keyboard navigation"))
    expect(row).to_be_visible()
    page.keyboard.press("j")
    selected = page.locator('[role="option"][aria-selected="true"]')
    expect(selected).to_have_count(1)
    first = selected.get_attribute("data-issue-id")
    page.keyboard.press("j")
    expect(selected).to_have_count(1)
    assert selected.get_attribute("data-issue-id") != first, "j did not move the selection"
    page.keyboard.press("k")
    expect(selected).to_have_attribute("data-issue-id", first)
```

Run:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up && $CC browser run smoke && $CC browser run my-work && $CC stack down
```

Expected: `browser:smoke  PASS` and `browser:my-work  PASS`. Open `$( $CC evidence dir )/flow-my-work.png` and check it shows the sidebar, the "My Work · 2026 PI4 Sprint 3" header, and [DEMO] rows grouped by state.

- [ ] **Step 9: Commit the code**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add app shell, My Work view and keyboard navigation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Map the My Work area and commit**

Add the index row `| [my-work.md](my-work.md) | My Work list, shell, keyboard navigation | all | stable |` to the README's Index table. Add the line `2. my-work` under its "Sweep order". Then:

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/my-work.md <<EOF
# My Work

Last verified: $SHA on $TODAY (live)

The landing view: your stories and defects in the current iteration, grouped by schedule state, plus tasks you own on other people's stories. It lives in \`web/src/views/MyWork.tsx\`, inside the shell (\`web/src/App.tsx\`, \`web/src/components/Sidebar.tsx\`). Overall: stable.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| my-work-list | My sprint items grouped Defined → Accepted | stable | UI+API | $SHA | $TODAY | \`web/src/store/selectors.test.ts\`, \`web/src/App.test.tsx\`, flow my-work |
| my-work-tasks-elsewhere | Tasks I own on stories others own | beta (stable pending live) | UI+API | $SHA | not driven | \`selectors.test.ts\` "tasks I own on other people's stories" |
| my-work-keyboard | J/K move, Space peek, Enter open, G then M/B/L, ?, Esc | stable | UI | $SHA | $TODAY | \`web/src/keyboard/shortcuts.test.ts\`, \`actions.test.ts\`, flow my-work |
| my-work-feature-filter | Sidebar feature buttons filter every view | beta (stable pending live) | UI | $SHA | not driven | \`selectors.test.ts\` "a feature filter narrows every list" |
| my-work-status-screens | Setup screen on 401, offline banner with 5s retry, stale banner | beta (stable pending live) | UI | $SHA | not driven | \`App.test.tsx\` "a rejected API key shows the setup screen" |

## How to get to it (user POV)

1. Open http://127.0.0.1:5173. "My Work" is selected in the sidebar.
2. Press "j" to select the first row.

## Driving it

Preconditions: baseline.

- **my-work-list** and **my-work-keyboard**: → \`rallypoc browser run my-work\` → PASS, screenshot \`flow-my-work.png\`
- **my-work-status-screens**: set \`RALLY_API_KEY=bad\` in \`.env\`, then \`rallypoc stack restart\` and \`rallypoc browser snapshot /\` → the page reads "Set RALLY_API_KEY in .env". Restore the key afterwards.

## Gotchas

- **Typing never triggers shortcuts** except ⌘K and Esc (\`web/src/keyboard/shortcuts.ts\`). If a key "does nothing", check focus first.
- **My Work is only the current iteration.** Items you own elsewhere in the backlog are not listed.
EOF
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the My Work area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Command palette (⌘K) with pickers and Rally search

**Files:**
- Modify: `server/app/adapter.py` (add `search`), `server/app/main.py` (add the `/api/search` route), `server/tests/test_adapter.py`, `server/tests/test_api.py`
- Modify: `web/src/api/client.ts` (add `search`), `web/src/test/fixtures.ts` (stub `search` in `fakeApi`), `web/src/store/store.ts` (add `searchRemote`), `web/src/test-setup.ts` (jsdom polyfills)
- Create: `web/src/palette/pickers.ts`, `web/src/palette/commands.ts`, `web/src/palette/CommandPalette.tsx`
- Create tests: `web/src/palette/pickers.test.ts`, `web/src/palette/commands.test.ts`, `web/src/palette/CommandPalette.test.tsx`
- Modify: `web/src/Overlays.tsx`, `.claude/skills/verify-rally-poc/flows.py`
- Create: `.claude/skills/rally-poc-feature-map/features/command-palette.md`
- Run: `cd web && npm install cmdk@^1.1`

**Interfaces:**
- Consumes: `UiState.palette`, `Picker`, `openPalette` and `closePalette` (Task 10); `searchIssues` and `useAppState` (Task 10); `updateIssue` and `updateIssues` (Task 8).
- Produces:
  - **Server:** `RallyAdapter.search(text, limit=10) -> list[Issue]` and `GET /api/search?q=` → `Issue[]`.
  - **Client:** `Api.search(q): Promise<Issue[]>` and `AppState.searchRemote(q): Promise<Issue[]>`, which merges results into `issues` without touching the orders.
  - **Pickers:** `pickerOptions(picker, app, targets): PickerOption[]`, where `PickerOption = { id, label, hint?, disabled?, apply(issue): IssuePatch | null }`. A `null` patch means "nothing to change for this item".
  - **Commands:** `buildCommands(ctx): Command[]`, where `Command = { id, group, label, shortcut?, run(): void }`.
  - **Component:** `CommandPalette`.

- [ ] **Step 1: Add search to the proxy, test first**

Append to `server/tests/test_adapter.py`:

```python
async def test_search_matches_names_and_formatted_ids():
    c = FakeClient().on("QUERY", "/artifact", [rally_story()])
    adapter = make_adapter(c)
    found = await adapter.search("us1001")
    query = c.calls[0][2]["query"]
    assert 'Name contains "us1001"' in query and 'FormattedID = "US1001"' in query
    assert [i.id for i in found] == [1001]
    await adapter.search("keyboard nav")
    assert "FormattedID" not in c.calls[1][2]["query"]


async def test_search_ignores_short_text():
    c = FakeClient()
    assert await make_adapter(c).search(" a ") == [] and c.calls == []
```

Append to `server/tests/test_api.py`:

```python
def test_search_route():
    with client_for(FakeAdapter(search=lambda q: [issue(Name=f"[DEMO] {q}")])) as c:
        r = c.get("/api/search", params={"q": "palette"})
    assert r.status_code == 200 and r.json()[0]["name"] == "[DEMO] palette"
```

Also add this method to the `FakeAdapter` class in `test_api.py`:

```python
    async def search(self, q):
        return await self._do("search", q)
```

Run: `cd server && uv run pytest -q`
Expected: FAIL with `AttributeError: 'RallyAdapter' object has no attribute 'search'` and a 404 for `/api/search`.

In `server/app/adapter.py`, add below `SINCE_RE`:

```python
FORMATTED_ID_RE = re.compile(r"^[A-Za-z]{1,3}\d+$")
```

Add this method to `RallyAdapter`, after `get_issue`:

```python
    async def search(self, text: str, limit: int = 10) -> list[Issue]:
        """Rally fallback for ⌘K when the cache has few hits (spec §4.5)."""
        text = text.strip()
        if len(text) < 2:
            return []
        clauses = [f"Name contains {quoted(text)}"]
        if FORMATTED_ID_RE.match(text):
            clauses.append(f"FormattedID = {quoted(text.upper())}")
        return [issue_from_rally(o) for o in await self._artifacts(or_query(clauses), limit=limit)]
```

In `server/app/main.py`, add after the `get_issue` route:

```python
    @app.get("/api/search", response_model=list[Issue])
    async def search(request: Request, q: str):
        return await rally(request).search(q)
```

Run: `cd server && uv run pytest -q`
Expected: `71 passed`.

- [ ] **Step 2: Add search to the client and store**

Run: `cd web && npm install cmdk@^1.1`

In `web/src/api/client.ts`:
- Add `search(q: string): Promise<Issue[]>;` to `interface Api`.
- Add `search: (q) => request("GET", \`/search?q=${encodeURIComponent(q)}\`),` to the `api` object.

In `web/src/test/fixtures.ts`, add `search: notStubbed("search"),` to the object `fakeApi` returns.

In `web/src/store/store.ts`:
- Add `searchRemote(q: string): Promise<Issue[]>;` to `AppState`, after `loadIssueDetail`.
- Add this implementation after `loadIssueDetail`:

```ts
      async searchRemote(q) {
        try {
          const found = await api.search(q);
          set((s) => ({ issues: { ...byId(found), ...s.issues } })); // local copies (maybe mid-edit) win
          return found;
        } catch {
          return [];
        }
      },
```

Replace `web/src/test-setup.ts` with this. cmdk, Radix and dnd-kit need these browser APIs, which jsdom lacks:

```ts
import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
```

- [ ] **Step 3: Write the failing picker and command tests**

`web/src/palette/pickers.test.ts`:

```ts
import { expect, test } from "vitest";
import type { AppState } from "../store/store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue } from "../test/fixtures";
import { pickerOptions } from "./pickers";

const app = stateFromBootstrap(makeBootstrap()) as AppState;
const story = makeIssue();

test("state picker lists Rally's four states", () => {
  expect(pickerOptions("state", app, [story]).map((o) => o.label)).toEqual(["Defined", "In-Progress", "Completed", "Accepted"]);
  expect(pickerOptions("state", app, [story])[2].apply(story)).toEqual({ state: "Completed" });
});

test("estimate picker is Fibonacci plus none", () => {
  const opts = pickerOptions("estimate", app, [story]);
  expect(opts.map((o) => o.id)).toEqual(["1", "2", "3", "5", "8", "none"]);
  expect(opts[5].apply(story)).toEqual({ estimate: null });
});

test("owner picker starts with Unassigned and marks me", () => {
  const opts = pickerOptions("owner", app, [story]);
  expect(opts[0]).toMatchObject({ label: "Unassigned" });
  expect(opts.find((o) => o.label === "Dana Demo")?.hint).toBe("You");
  expect(opts[0].apply(story)).toEqual({ owner_id: null });
});

test("iteration picker offers the backlog first and marks the current sprint", () => {
  const opts = pickerOptions("iteration", app, [story]);
  expect(opts[0]).toMatchObject({ label: "No iteration (backlog)" });
  expect(opts.find((o) => o.label === "Sprint 3")?.hint).toBe("Current");
});

test("tags picker toggles per item and protects the demo tag", () => {
  const tagged = makeIssue({ tags: ["collabathon-demo", "ux"] });
  const opts = pickerOptions("tags", { ...app, issues: { ...app.issues, [tagged.id]: tagged } } as AppState, [tagged]);
  const ux = opts.find((o) => o.id === "ux")!;
  expect(ux.label).toBe("Remove ux");
  expect(ux.apply(tagged)).toEqual({ tags: ["collabathon-demo"] });
  expect(opts.find((o) => o.id === "collabathon-demo")).toMatchObject({ disabled: true });
});

test("feature picker applies to stories only", () => {
  const opts = pickerOptions("feature", app, [story]);
  expect(opts[0].apply(story)).toEqual({ feature_id: 201 });
  expect(opts[0].apply(makeIssue({ kind: "defect" }))).toBeNull();
});
```

`web/src/palette/commands.test.ts`:

```ts
import { beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue } from "../test/fixtures";
import { VIEWS } from "../views/registry";
import { buildCommands } from "./commands";

beforeEach(() => {
  appStore.setState(stateFromBootstrap(makeBootstrap()));
  uiStore.setState(uiStore.getInitialState(), true);
});

test("with an item selected, its actions come first", () => {
  const cmds = buildCommands({ targets: [makeIssue()], views: VIEWS });
  expect(cmds[0].group).toBe("US1001");
  expect(cmds.slice(0, 3).map((c) => [c.label, c.shortcut])).toEqual([
    ["Change state…", "S"], ["Assign to…", "A"], ["Assign to me", undefined],
  ]);
});

test("picker commands keep the palette open on that picker", () => {
  buildCommands({ targets: [makeIssue()], views: VIEWS }).find((c) => c.id === "pick-state")!.run();
  expect(uiStore.getState().palette).toEqual({ open: true, picker: "state", targetIds: [1001] });
});

test("assign to me updates every target", () => {
  const spy = vi.spyOn(appStore.getState(), "updateIssues").mockResolvedValue();
  buildCommands({ targets: [makeIssue(), makeIssue({ id: 1002 })], views: VIEWS }).find((c) => c.id === "assign-me")!.run();
  expect(spy).toHaveBeenCalledWith([1001, 1002], { owner_id: 501 });
});

test("without a selection, navigation and create come first", () => {
  const cmds = buildCommands({ targets: [], views: VIEWS });
  expect(cmds[0]).toMatchObject({ group: "Navigation", label: "Go to My Work", shortcut: "G M" });
  expect(cmds.some((c) => c.id === "create")).toBe(true);
});
```

Run: `cd web && npx vitest --run src/palette`
Expected: FAIL with `Failed to resolve import "./pickers"`.

- [ ] **Step 4: Write pickers and commands**

`web/src/palette/pickers.ts`:

```ts
import { SCHEDULE_STATES, type Issue, type IssuePatch } from "../api/types";
import type { AppState } from "../store/store";
import type { Picker } from "../store/ui";

export interface PickerOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** The change for one item, or null when this item needs none. */
  apply(issue: Issue): IssuePatch | null;
}

export const PICKER_PLACEHOLDER: Record<Picker, string> = {
  state: "Change state…", owner: "Assign to…", iteration: "Move to iteration…", estimate: "Set estimate…",
  tags: "Add or remove tags…", feature: "Move to feature…",
};

const FIBONACCI = [1, 2, 3, 5, 8];

export function pickerOptions(picker: Picker, app: AppState, targets: Issue[]): PickerOption[] {
  switch (picker) {
    case "state":
      return SCHEDULE_STATES.map((state) => ({ id: state, label: state, apply: () => ({ state }) }));
    case "owner":
      return [
        { id: "none", label: "Unassigned", apply: () => ({ owner_id: null }) },
        ...Object.values(app.users)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((u) => ({ id: String(u.id), label: u.name, hint: u.id === app.meta?.me.id ? "You" : undefined, apply: () => ({ owner_id: u.id }) })),
      ];
    case "iteration":
      return [
        { id: "none", label: "No iteration (backlog)", apply: () => ({ iteration_id: null }) },
        ...Object.values(app.iterations)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((it) => ({ id: String(it.id), label: it.name, hint: it.id === app.currentIterationId ? "Current" : undefined, apply: () => ({ iteration_id: it.id }) })),
      ];
    case "estimate":
      return [
        ...FIBONACCI.map((n) => ({ id: String(n), label: `${n} points`, apply: () => ({ estimate: n }) })),
        { id: "none", label: "No estimate", apply: () => ({ estimate: null }) },
      ];
    case "feature":
      return Object.values(app.features)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({ id: String(f.id), label: f.name, hint: f.formatted_id, apply: (i: Issue) => (i.kind === "story" ? { feature_id: f.id } : null) }));
    case "tags": {
      const demoTag = app.meta?.writeGuard === "demo" ? app.meta.demoTag : null;
      const names = new Set<string>(Object.values(app.issues).flatMap((i) => i.tags));
      if (app.meta) names.add(app.meta.demoTag);
      return [...names].sort().map((tag) => {
        const all = targets.length > 0 && targets.every((i) => i.tags.includes(tag));
        return {
          id: tag,
          label: `${all ? "Remove" : "Add"} ${tag}`,
          hint: tag === demoTag ? "Required in development mode" : undefined,
          disabled: tag === demoTag,
          apply: (i: Issue) => {
            const has = i.tags.includes(tag);
            if (all) return has ? { tags: i.tags.filter((t) => t !== tag) } : null;
            return has ? null : { tags: [...i.tags, tag] };
          },
        };
      });
    }
  }
}
```

`web/src/palette/commands.ts`:

```ts
import type { Issue } from "../api/types";
import { appStore, uiStore } from "../store";
import type { ViewDef } from "../views/registry";

export interface Command { id: string; group: string; label: string; shortcut?: string; run(): void }

/** Context first (spec §4.5): the selected items' actions, then navigation and app commands. */
export function buildCommands({ targets, views }: { targets: Issue[]; views: ViewDef[] }): Command[] {
  const ui = uiStore.getState();
  const app = appStore.getState();
  const ids = targets.map((t) => t.id);
  const out: Command[] = [];
  if (targets.length) {
    const group = targets.length === 1 ? targets[0].formatted_id : `${targets.length} items`;
    const blocked = targets.every((t) => t.blocked);
    out.push(
      { id: "pick-state", group, label: "Change state…", shortcut: "S", run: () => ui.openPalette("state", ids) },
      { id: "pick-owner", group, label: "Assign to…", shortcut: "A", run: () => ui.openPalette("owner", ids) },
      {
        id: "assign-me", group, label: "Assign to me",
        run: () => {
          if (app.meta) void app.updateIssues(ids, { owner_id: app.meta.me.id });
          ui.closePalette();
        },
      },
      { id: "pick-iteration", group, label: "Move to iteration…", shortcut: "I", run: () => ui.openPalette("iteration", ids) },
      { id: "pick-estimate", group, label: "Set estimate…", shortcut: "E", run: () => ui.openPalette("estimate", ids) },
      { id: "pick-tags", group, label: "Edit tags…", shortcut: "T", run: () => ui.openPalette("tags", ids) },
      { id: "pick-feature", group, label: "Move to feature…", run: () => ui.openPalette("feature", ids) },
      {
        id: "toggle-blocked", group, label: blocked ? "Unblock" : "Mark blocked",
        run: () => {
          void app.updateIssues(ids, { blocked: !blocked });
          ui.closePalette();
        },
      },
    );
    if (targets.length === 1) {
      const only = targets[0];
      out.push(
        { id: "open", group, label: "Open", shortcut: "Enter", run: () => { ui.closePalette(); ui.openPage(only.id); } },
        { id: "copy-id", group, label: "Copy ID", run: () => { void navigator.clipboard?.writeText(only.formatted_id); ui.closePalette(); } },
      );
    }
  }
  for (const v of views) {
    out.push({ id: `go-${v.id}`, group: "Navigation", label: `Go to ${v.label}`, shortcut: v.shortcut, run: () => { ui.closePalette(); ui.setView(v.id); } });
  }
  out.push(
    { id: "create", group: "Rally", label: "Create story", shortcut: "C", run: () => { ui.closePalette(); ui.setComposer(true); } },
    { id: "theme", group: "Rally", label: "Toggle theme", run: () => { ui.toggleTheme(); ui.closePalette(); } },
    { id: "shortcuts", group: "Rally", label: "Keyboard shortcuts", shortcut: "?", run: () => { ui.closePalette(); ui.setCheatsheet(true); } },
  );
  return out;
}
```

Run: `cd web && npx vitest --run src/palette/pickers.test.ts src/palette/commands.test.ts`
Expected: `10 passed`.

- [ ] **Step 5: Write the palette component, test first**

`web/src/palette/CommandPalette.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { CommandPalette } from "./CommandPalette";

beforeEach(() => {
  appStore.setState(stateFromBootstrap(makeBootstrap()));
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

test("opens with the selected item as a chip and its actions first", () => {
  uiStore.getState().openPalette(null, [1001]);
  render(<CommandPalette />);
  expect(screen.getByPlaceholderText("Type a command or search…")).toBeInTheDocument();
  expect(screen.getByText("US1001 · [DEMO] Example story")).toBeInTheDocument();
  expect(screen.getAllByRole("option")[0]).toHaveTextContent("Change state…");
});

test("typing an ID finds the issue in the cache", () => {
  uiStore.getState().openPalette();
  render(<CommandPalette />);
  fireEvent.change(screen.getByPlaceholderText("Type a command or search…"), { target: { value: "US1002" } });
  expect(screen.getByRole("option", { name: /US1002/ })).toBeInTheDocument();
});

test("choosing a state writes it for every target and closes", async () => {
  const fetchMock = serve({ "PATCH /api/issues/1001": makeIssue({ state: "Completed" }) });
  uiStore.getState().openPalette("state", [1001]);
  render(<CommandPalette />);
  fireEvent.click(screen.getByRole("option", { name: /Completed/ }));
  expect(appStore.getState().issues[1001].state).toBe("Completed");
  expect(uiStore.getState().palette.open).toBe(false);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/issues/1001", expect.objectContaining({ method: "PATCH", body: '{"state":"Completed"}' })));
});
```

Run: `cd web && npx vitest --run src/palette/CommandPalette.test.tsx`
Expected: FAIL with `Failed to resolve import "./CommandPalette"`.

`web/src/palette/CommandPalette.tsx`:

```tsx
import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";
import type { Issue } from "../api/types";
import { StateGlyph } from "../components/StateGlyph";
import { appStore, uiStore, useAppState, useUi } from "../store";
import { searchIssues } from "../store/selectors";
import { VIEWS } from "../views/registry";
import { buildCommands } from "./commands";
import { PICKER_PLACEHOLDER, pickerOptions } from "./pickers";

const itemClass = "flex h-(--size-palette-item) cursor-default items-center gap-3 rounded-control px-3 text-small text-ink-1 data-[selected=true]:bg-hover data-[disabled=true]:opacity-50";
const groupClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-mini [&_[cmdk-group-heading]]:text-ink-3";

function Kbd({ keys }: { keys?: string }) {
  if (!keys) return null;
  return (
    <span className="ml-auto flex gap-1">
      {keys.split(" ").map((k) => <kbd key={k} className="rounded border border-line-2 px-1.5 text-mini text-ink-3">{k}</kbd>)}
    </span>
  );
}

export function CommandPalette() {
  const palette = useUi((u) => u.palette);
  const app = useAppState();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Issue[]>([]);
  const targets = palette.targetIds.map((id) => app.issues[id]).filter((i): i is Issue => Boolean(i));
  const local = useMemo(() => searchIssues(app, query), [app, query]);

  useEffect(() => {
    setQuery("");
    setRemote([]);
  }, [palette.open, palette.picker]);
  useEffect(() => {
    if (palette.picker || query.trim().length < 3 || local.length >= 3) return setRemote([]);
    const timer = setTimeout(() => void appStore.getState().searchRemote(query).then(setRemote), 300);
    return () => clearTimeout(timer);
  }, [query, local.length, palette.picker]);

  const close = () => uiStore.getState().closePalette();
  const q = query.trim().toLowerCase();
  const chip = targets.length === 1 ? `${targets[0].formatted_id} · ${targets[0].name}` : targets.length ? `${targets.length} items` : null;

  let body;
  if (palette.picker) {
    const options = pickerOptions(palette.picker, app, targets).filter((o) => o.label.toLowerCase().includes(q));
    body = options.map((o) => (
      <Command.Item key={o.id} value={o.id} disabled={o.disabled} className={itemClass}
        onSelect={() => {
          for (const issue of targets) {
            const patch = o.apply(issue);
            if (patch) void appStore.getState().updateIssue(issue.id, patch);
          }
          close();
        }}>
        {palette.picker === "state" && <StateGlyph state={o.id as Issue["state"]} />}
        <span>{o.label}</span>
        {o.hint && <span className="ml-auto text-mini text-ink-3">{o.hint}</span>}
      </Command.Item>
    ));
  } else {
    const commands = buildCommands({ targets, views: VIEWS }).filter((c) => c.label.toLowerCase().includes(q));
    const groups = [...new Set(commands.map((c) => c.group))];
    const remoteOnly = remote.filter((r) => !local.some((l) => l.id === r.id));
    const issueItem = (issue: Issue) => (
      <Command.Item key={issue.id} value={`issue-${issue.id}`} className={itemClass} onSelect={() => { close(); uiStore.getState().openPage(issue.id); }}>
        <StateGlyph state={issue.state} />
        <span className="w-16 text-ink-3">{issue.formatted_id}</span>
        <span className="truncate">{issue.name}</span>
      </Command.Item>
    );
    body = (
      <>
        {groups.map((g) => (
          <Command.Group key={g} heading={g} className={groupClass}>
            {commands.filter((c) => c.group === g).map((c) => (
              <Command.Item key={c.id} value={c.id} className={itemClass} onSelect={c.run}>
                <span>{c.label}</span>
                <Kbd keys={c.shortcut} />
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        {local.length > 0 && <Command.Group heading="Issues" className={groupClass}>{local.map(issueItem)}</Command.Group>}
        {remoteOnly.length > 0 && <Command.Group heading="From Rally" className={groupClass}>{remoteOnly.map(issueItem)}</Command.Group>}
      </>
    );
  }

  return (
    <Command.Dialog open={palette.open} onOpenChange={(open) => !open && close()} label="Command palette" shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-black/10"
      contentClassName="fixed left-1/2 top-[14%] z-50 w-(--size-palette) -translate-x-1/2 overflow-hidden rounded-palette border-[0.5px] border-line-2 bg-surface shadow-palette">
      {chip && (
        <div className="px-3 pt-3">
          <span className="rounded-full bg-hover px-2 py-0.5 text-mini text-ink-2">{chip}</span>
        </div>
      )}
      <Command.Input value={query} onValueChange={setQuery}
        placeholder={palette.picker ? PICKER_PLACEHOLDER[palette.picker] : "Type a command or search…"}
        className="h-(--size-palette-input) w-full bg-transparent px-3 text-small text-ink-1 outline-none placeholder:text-ink-4" />
      <Command.List className="max-h-[420px] overflow-y-auto border-t border-line-1 p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-ink-3">No results</Command.Empty>
        {body}
      </Command.List>
    </Command.Dialog>
  );
}
```

Replace `web/src/Overlays.tsx`:

```tsx
import { Cheatsheet } from "./components/Cheatsheet";
import { Toasts } from "./components/Toasts";
import { CommandPalette } from "./palette/CommandPalette";

export function Overlays() {
  return (
    <>
      <CommandPalette />
      <Cheatsheet />
      <Toasts />
    </>
  );
}
```

- [ ] **Step 6: Run all web tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: `71 passed` (58 plus pickers 6, commands 4 and palette 3), and typecheck exits 0.

- [ ] **Step 7: Add the palette flow and drive it live**

Append to `flows.py`:

```python
@flow
def palette(page: Page) -> None:
    page.goto(WEB)
    row = page.get_by_role("option", name=re.compile(r"Story editor with HTML round-trip"))
    expect(row).to_be_visible()
    row.click()
    page.keyboard.press("Meta+k")
    box = page.get_by_placeholder("Type a command or search…")
    expect(box).to_be_visible()
    expect(page.get_by_text(re.compile(r"· \[DEMO\] Story editor with HTML round-trip"))).to_be_visible()
    page.keyboard.press("Escape")
    expect(box).to_be_hidden()
    row.click()
    page.keyboard.press("s")                                   # state picker straight from the keyboard
    page.get_by_role("option", name="In-Progress").click()
    expect(row.get_by_role("img", name="In-Progress")).to_be_visible()
    page.keyboard.press("s")
    page.get_by_role("option", name="Defined").click()         # put it back (spec §10 seeded state)
    expect(row.get_by_role("img", name="Defined")).to_be_visible()
    page.keyboard.press("Meta+k")
    box.fill("Backlog drag")
    expect(page.get_by_role("option", name=re.compile(r"Backlog drag-to-rank"))).to_be_visible()
    page.keyboard.press("Escape")
```

Run:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up && $CC browser run palette && $CC api GET '/api/search?q=Backlog' --expect 200 --field 0.name && $CC stack down
```

Expected:
- `browser:palette  PASS`.
- The search call prints a `[DEMO] …` name, which shows the Rally fallback is reachable.

- [ ] **Step 8: Commit the code**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add command palette with pickers and Rally search fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Map the palette area and commit**

Add the index row `| [command-palette.md](command-palette.md) | ⌘K actions, pickers, search | all | stable |` and the sweep line `3. command-palette`. Then:

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/command-palette.md <<EOF
# Command palette

Last verified: $SHA on $TODAY (live)

⌘K opens a context-first palette. With an item selected, its actions come first, then navigation and app commands, then issue search: the cache first, Rally after 300 ms when the cache has fewer than three hits. S/A/I/E/T open the same palette as a picker. Code: \`web/src/palette/\`. Overall: stable.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| palette-context-actions | Selected item's actions first, with its chip | stable | UI | $SHA | $TODAY | \`web/src/palette/commands.test.ts\`, flow palette |
| palette-state-picker | S / "Change state…" writes ScheduleState for every target | stable | UI+API | $SHA | $TODAY | \`CommandPalette.test.tsx\` "choosing a state…", flow palette |
| palette-other-pickers | Owner, iteration, estimate, tags, feature pickers | beta (stable pending live) | UI+API | $SHA | not driven | \`web/src/palette/pickers.test.ts\` |
| palette-search-cache | Find by ID or title in loaded data | stable | UI | $SHA | $TODAY | \`selectors.test.ts\` search, flow palette |
| palette-search-rally | Rally fallback via \`GET /api/search\` | beta (stable pending live) | UI+API | $SHA | $TODAY | \`server/tests/test_adapter.py::test_search_matches_names_and_formatted_ids\` |

## How to get to it (user POV)

1. In any view, select a row and press ⌘K, or press S, A, I, E or T for a picker.

## Driving it

Preconditions: baseline.

- **palette-context-actions**, **palette-state-picker** and **palette-search-cache**: → \`rallypoc browser run palette\` → PASS
- **palette-search-rally**: → \`rallypoc api GET '/api/search?q=Backlog' --expect 200 --field 0.name\` → a \`[DEMO]\` name

## Gotchas

- **The demo tag cannot be removed** while \`WRITE_GUARD=demo\`. The tags picker disables it, and the proxy would refuse it anyway (\`server/app/guard.py\`).
- **Feature changes skip defects.** Defects have no feature parent, so the feature picker leaves them unchanged.
EOF
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the command palette area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: Issue view (peek panel and full page), story editor, tasks, and the composer

**Files:**
- Run: `cd web && npm install @tiptap/react@^3.32 @tiptap/pm@^3.32 @tiptap/starter-kit@^3.32 dompurify@^3.4 @radix-ui/react-dialog`
- Create: `web/src/editor/sanitize.ts`, `web/src/editor/sanitize.test.ts`, `web/src/editor/DescriptionEditor.tsx`
- Create: `web/src/issue/IssueDetail.tsx`, `web/src/issue/TaskList.tsx`, `web/src/issue/IssuePanel.tsx`, `web/src/issue/IssuePage.tsx`, `web/src/issue/IssueDetail.test.tsx`
- Create: `web/src/components/Composer.tsx`, `web/src/components/Composer.test.tsx`
- Modify: `web/src/Overlays.tsx`, `web/src/App.tsx`, `web/src/styles/app.css`
- Modify: `scripts/seed_demo.py`, so it removes extra `[DEMO]` stories and resets descriptions
- Modify: `.claude/skills/verify-rally-poc/flows.py`
- Create: `.claude/skills/rally-poc-feature-map/features/story-editor.md`. Modify: `rally-proxy.md`.

**Interfaces:**
- Consumes:
  - From Task 8: `updateIssue`, `updateTask`, `loadIssueDetail` and `createIssue`.
  - From Task 10: `openPalette`, `openPeek`, `openPage`, `setComposer`, `select`, `demoFeatures`, `TaskRow`, `StateGlyph` and `Avatar`.
- Produces:
  - **Sanitizing:** `sanitize(html): string` and `editableInline(html): boolean`.
  - **Components:** `DescriptionEditor({html, onSave})`, `IssueDetail({id})`, `IssuePanel`, `IssuePage({id})` and `Composer`.
  - **Accessible names** later flows rely on:
    - Property pills: `"State: <state>"`, `"Owner: <name|Unassigned>"`, `"Iteration: <name|No iteration>"`, `"Estimate: <n|No estimate>"`, `"Feature: <name|No feature>"`, `"Tags: <list|No tags>"`, `"Blocked: Yes|No"`.
    - Fields and regions: the title input `"Title"`, the editor `"Description"`, the panel `"Issue preview"`, and the composer fields `"Story name"`, `"Feature"`, `"Estimate"`.

- [ ] **Step 1: Install dependencies and write the failing sanitizer tests**

Run the npm install from the Files list.

`web/src/editor/sanitize.test.ts`:

```ts
import { expect, test } from "vitest";
import { editableInline, sanitize } from "./sanitize";

test("scripts and event handlers are removed", () => {
  const out = sanitize('<p onclick="x()">Hi<img src="x" onerror="alert(1)"><script>alert(2)</script></p>');
  expect(out).not.toMatch(/script|onerror|onclick/);
  expect(out).toContain("<p>Hi");
});

test("javascript: links lose their href", () => {
  expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
});

test("normal links open safely in a new tab", () => {
  const out = sanitize('<a href="https://example.com">x</a>');
  expect(out).toContain('target="_blank"');
  expect(out).toContain('rel="noopener noreferrer"');
});

test("Rally's usual formatting survives", () => {
  const html = "<p><b>Bold</b> <i>it</i></p><ul><li>one</li></ul>";
  expect(sanitize(html)).toBe(html);
});

test("inline styles and iframes are dropped", () => {
  expect(sanitize('<p style="color:red">x</p><iframe src="https://example.com"></iframe>')).toBe("<p>x</p>");
});

test("descriptions with tables are not edited inline", () => {
  expect(editableInline("<p>ok</p>")).toBe(true);
  expect(editableInline("<table><tbody><tr><td>c</td></tr></tbody></table>")).toBe(false);
});
```

Run: `cd web && npx vitest --run src/editor`
Expected: FAIL with `Failed to resolve import "./sanitize"`.

- [ ] **Step 2: Write the sanitizer and the editor**

`web/src/editor/sanitize.ts`:

```ts
import DOMPurify from "dompurify";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Rally descriptions are HTML written by anyone with edit rights. Sanitize before rendering or editing. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
    FORBID_ATTR: ["style"],
  });
}

/** TipTap's StarterKit has no tables; editing such a description would silently drop them (spec assumption 7). */
export function editableInline(html: string): boolean {
  return !/<table/i.test(html);
}
```

`web/src/editor/DescriptionEditor.tsx`:

```tsx
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { editableInline, sanitize } from "./sanitize";

const SAVE_AFTER_MS = 1000;

/** Saves only after the user actually edits, so an untouched Rally description is never re-serialized. */
export function DescriptionEditor({ html, onSave }: { html: string; onSave(html: string): void }) {
  const clean = useMemo(() => sanitize(html), [html]);
  const editable = editableInline(clean);
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
  });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = (value: string) => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    onSaveRef.current(sanitize(value));
  };

  const editor = useEditor({
    extensions: [StarterKit],
    content: clean,
    editable,
    editorProps: {
      attributes: { class: "prose-rally min-h-24 py-2 text-regular text-ink-2 outline-none", "aria-label": "Description" },
    },
    onUpdate: ({ editor: e }) => {
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(e.getHTML()), SAVE_AFTER_MS);
    },
    onBlur: ({ editor: e }) => flush(e.getHTML()),
  });

  // A newer description from Rally (a poll) replaces the content unless the user is mid-edit.
  useEffect(() => {
    if (editor && !editor.isFocused && !dirty.current) editor.commands.setContent(clean, { emitUpdate: false });
  }, [clean, editor]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div>
      <EditorContent editor={editor} />
      {!editable && <p className="text-mini text-ink-3">This description has a table. Edit it in Rally.</p>}
    </div>
  );
}
```

Append to `web/src/styles/app.css`. Tailwind's preflight removes list and table styles, so we put them back for descriptions:

```css
.prose-rally p { margin: 0 0 8px; }
.prose-rally ul { list-style: disc; padding-left: 20px; margin: 0 0 8px; }
.prose-rally ol { list-style: decimal; padding-left: 20px; margin: 0 0 8px; }
.prose-rally a { color: var(--color-focus); text-decoration: underline; }
.prose-rally table { border-collapse: collapse; margin: 0 0 8px; }
.prose-rally td, .prose-rally th { border: 1px solid var(--color-line-2); padding: 4px 8px; }
.prose-rally code { font-family: ui-monospace, monospace; font-size: 12px; background: var(--color-hover); padding: 1px 4px; border-radius: 4px; }
.prose-rally p.is-editor-empty:first-child::before { content: "Add a description…"; color: var(--color-ink-4); float: left; height: 0; pointer-events: none; }
```

Run: `cd web && npx vitest --run src/editor`
Expected: `6 passed`.

- [ ] **Step 3: Write the failing issue-view tests**

`web/src/issue/IssueDetail.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue, makeTask, serve } from "../test/fixtures";
import { IssueDetail } from "./IssueDetail";

vi.mock("../editor/DescriptionEditor", () => ({
  DescriptionEditor: ({ html }: { html: string }) => <div data-testid="editor">{html}</div>,
}));

const detail = { issue: makeIssue(), tasks: [makeTask(), makeTask({ id: 4002, formatted_id: "TA4002", name: "[DEMO] Second task", state: "Completed", todo: 0 })] };

beforeEach(() => {
  appStore.setState(stateFromBootstrap(makeBootstrap()));
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

test("properties are pills that open the matching picker", () => {
  serve({ "GET /api/issues/1001": detail });
  render(<IssueDetail id={1001} />);
  expect(screen.getByRole("button", { name: "Owner: Dana Demo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Iteration: Sprint 3" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Feature: [DEMO] Feature A" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "State: In-Progress" }));
  expect(uiStore.getState().palette).toEqual({ open: true, picker: "state", targetIds: [1001] });
});

test("the story's tasks load with a to-do total", async () => {
  serve({ "GET /api/issues/1001": detail });
  render(<IssueDetail id={1001} />);
  expect(await screen.findByText("[DEMO] Second task")).toBeInTheDocument();
  expect(screen.getByText("1/2 · 3h to do")).toBeInTheDocument();
});

test("renaming saves on blur", async () => {
  const fetchMock = serve({ "GET /api/issues/1001": detail, "PATCH /api/issues/1001": makeIssue({ name: "[DEMO] Renamed" }) });
  render(<IssueDetail id={1001} />);
  const title = screen.getByLabelText("Title");
  fireEvent.change(title, { target: { value: "[DEMO] Renamed" } });
  fireEvent.blur(title);
  await vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/issues/1001", expect.objectContaining({ method: "PATCH", body: '{"name":"[DEMO] Renamed"}' })));
});

test("blocked toggles from its pill", async () => {
  const fetchMock = serve({ "GET /api/issues/1001": detail, "PATCH /api/issues/1001": makeIssue({ blocked: true }) });
  render(<IssueDetail id={1001} />);
  fireEvent.click(screen.getByRole("button", { name: "Blocked: No" }));
  expect(screen.getByRole("button", { name: "Blocked: Yes" })).toBeInTheDocument();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/issues/1001", expect.objectContaining({ body: '{"blocked":true}' })));
});
```

`web/src/components/Composer.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { Composer } from "./Composer";

beforeEach(() => {
  appStore.setState(stateFromBootstrap(makeBootstrap()));
  uiStore.setState(uiStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

test("starts with the demo prefix and the first demo feature", () => {
  uiStore.getState().setComposer(true);
  render(<Composer />);
  expect(screen.getByLabelText("Story name")).toHaveValue("[DEMO] ");
  expect(screen.getByLabelText("Feature")).toHaveValue("201");
  expect(screen.getByRole("button", { name: /Create story/ })).toBeDisabled();
});

test("creates in the current sprint and selects the new story", async () => {
  const fetchMock = serve({ "POST /api/issues": [201, makeIssue({ id: 1009, formatted_id: "US1009", name: "[DEMO] Composer story" })] });
  uiStore.getState().setComposer(true);
  render(<Composer />);
  fireEvent.change(screen.getByLabelText("Story name"), { target: { value: "[DEMO] Composer story" } });
  fireEvent.click(screen.getByRole("button", { name: /Create story/ }));
  await vi.waitFor(() => expect(uiStore.getState().selectedId).toBe(1009));
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
    name: "[DEMO] Composer story", feature_id: 201, estimate: null, iteration_id: 301, position: "top",
  });
  expect(uiStore.getState().composerOpen).toBe(false);
});

test("from the backlog it creates at the bottom, outside the sprint", async () => {
  const fetchMock = serve({ "POST /api/issues": [201, makeIssue({ id: 1010, iteration_id: null, state: "Defined" })] });
  uiStore.setState({ view: "backlog" });
  uiStore.getState().setComposer(true);
  render(<Composer />);
  fireEvent.change(screen.getByLabelText("Story name"), { target: { value: "[DEMO] Later" } });
  fireEvent.keyDown(screen.getByLabelText("Story name"), { key: "Enter", metaKey: true });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({ iteration_id: null, position: "bottom" });
});
```

Run: `cd web && npx vitest --run src/issue src/components/Composer.test.tsx`
Expected: FAIL with `Failed to resolve import "./IssueDetail"` and `"./Composer"`.

- [ ] **Step 4: Write the issue view**

`web/src/issue/TaskList.tsx`:

```tsx
import type { Task } from "../api/types";
import { TaskRow } from "../components/TaskRow";

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.state === "Completed").length;
  const todo = tasks.reduce((sum, t) => sum + (t.state === "Completed" ? 0 : t.todo ?? 0), 0);
  return (
    <section aria-label="Tasks" className="mt-8">
      <h3 className="mb-1 flex items-center gap-2 px-3 font-medium text-ink-2">
        Tasks <span className="font-normal text-ink-3">{done}/{tasks.length} · {todo}h to do</span>
      </h3>
      {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
    </section>
  );
}
```

`web/src/issue/IssueDetail.tsx`:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Issue } from "../api/types";
import { Avatar } from "../components/Avatar";
import { StateGlyph } from "../components/StateGlyph";
import { Empty } from "../components/ViewFrame";
import { DescriptionEditor } from "../editor/DescriptionEditor";
import { appStore, uiStore, useAppState } from "../store";
import type { Picker } from "../store/ui";
import { TaskList } from "./TaskList";

function Pill({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="flex h-(--size-pill) w-full items-center gap-2 rounded-full px-2.5 text-left font-medium text-ink-2 transition-colors duration-150 hover:bg-hover">
      {children}
    </button>
  );
}

function PropGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1 px-2 font-medium text-ink-3">{label}</h3>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function TitleInput({ issue }: { issue: Issue }) {
  const [value, setValue] = useState(issue.name);
  useEffect(() => setValue(issue.name), [issue.name]);
  const commit = () => {
    const next = value.trim();
    if (next && next !== issue.name) void appStore.getState().updateIssue(issue.id, { name: next });
    else setValue(issue.name);
  };
  return (
    <input aria-label="Title" value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="mb-4 w-full bg-transparent text-title font-medium text-ink-1 outline-none" />
  );
}

export function IssueDetail({ id }: { id: number }) {
  const app = useAppState();
  const issue = app.issues[id];
  useEffect(() => {
    void appStore.getState().loadIssueDetail(id);
  }, [id]);
  const tasks = useMemo(() => Object.values(app.tasks).filter((t) => t.issue_id === id), [app.tasks, id]);
  if (!issue) return <Empty>Loading…</Empty>;
  const feature = issue.feature_id ? app.features[issue.feature_id] : undefined;
  const iteration = issue.iteration_id ? app.iterations[issue.iteration_id] : undefined;
  const open = (picker: Picker) => uiStore.getState().openPalette(picker, [id]);
  const estimate = issue.estimate === null ? "No estimate" : `${issue.estimate}`;
  const tags = issue.tags.join(", ") || "No tags";
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mb-2 text-ink-3">{issue.formatted_id}</div>
        <TitleInput issue={issue} />
        <DescriptionEditor key={issue.id} html={issue.description}
          onSave={(html) => void appStore.getState().updateIssue(id, { description: html })} />
        <TaskList tasks={tasks} />
      </div>
      <aside aria-label="Properties" className="w-(--size-props) shrink-0 overflow-y-auto border-l border-line-1 px-3 py-8">
        <PropGroup label="Properties">
          <Pill label={`State: ${issue.state}`} onClick={() => open("state")}><StateGlyph state={issue.state} />{issue.state}</Pill>
          <Pill label={`Owner: ${issue.owner?.name ?? "Unassigned"}`} onClick={() => open("owner")}>
            <Avatar user={issue.owner} />{issue.owner?.name ?? "Unassigned"}
          </Pill>
          <Pill label={`Iteration: ${iteration?.name ?? "No iteration"}`} onClick={() => open("iteration")}>{iteration?.name ?? "No iteration"}</Pill>
          <Pill label={`Estimate: ${estimate}`} onClick={() => open("estimate")}>{estimate}{issue.estimate !== null && " pts"}</Pill>
          <Pill label={`Blocked: ${issue.blocked ? "Yes" : "No"}`} onClick={() => void appStore.getState().updateIssue(id, { blocked: !issue.blocked })}>
            {issue.blocked ? <span className="text-blocked">Blocked</span> : "Not blocked"}
          </Pill>
        </PropGroup>
        <PropGroup label="Feature">
          <Pill label={`Feature: ${feature?.name ?? "No feature"}`} onClick={() => open("feature")}>
            <span className="truncate">{feature?.name ?? "No feature"}</span>
          </Pill>
        </PropGroup>
        <PropGroup label="Tags">
          <Pill label={`Tags: ${tags}`} onClick={() => open("tags")}><span className="truncate">{tags}</span></Pill>
        </PropGroup>
      </aside>
    </div>
  );
}
```

`web/src/issue/IssuePanel.tsx`:

```tsx
import { X } from "lucide-react";
import { uiStore, useUi } from "../store";
import { IssueDetail } from "./IssueDetail";

export function IssuePanel() {
  const id = useUi((u) => u.peekId);
  if (id === null) return null;
  return (
    <aside aria-label="Issue preview" className="fixed bottom-2 right-2 top-2 z-30 flex w-[640px] flex-col overflow-hidden rounded-control border border-line-2 bg-panel shadow-palette">
      <header className="flex h-(--size-header) shrink-0 items-center gap-2 border-b border-line-1 px-3">
        <button type="button" onClick={() => uiStore.getState().openPage(id)} className="rounded-control px-2 py-1 text-ink-3 hover:bg-hover hover:text-ink-1">
          Open full page
        </button>
        <button type="button" aria-label="Close preview" onClick={() => uiStore.getState().openPeek(null)} className="ml-auto rounded-control p-1.5 text-ink-3 hover:bg-hover">
          <X size={14} />
        </button>
      </header>
      <IssueDetail id={id} />
    </aside>
  );
}
```

`web/src/issue/IssuePage.tsx`:

```tsx
import { ChevronRight } from "lucide-react";
import { uiStore, useApp, useUi } from "../store";
import { VIEWS } from "../views/registry";
import { IssueDetail } from "./IssueDetail";

export function IssuePage({ id }: { id: number }) {
  const issue = useApp((s) => s.issues[id]);
  const view = useUi((u) => u.view);
  const back = VIEWS.find((v) => v.id === view)?.label ?? "Back";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-(--size-header) shrink-0 items-center gap-2 border-b border-line-1 px-4">
        <button type="button" onClick={() => uiStore.getState().openPage(null)} className="text-ink-3 hover:text-ink-1">{back}</button>
        <ChevronRight size={14} className="text-ink-4" />
        <span className="font-medium text-ink-1">{issue?.formatted_id}</span>
        <span className="truncate text-ink-3">{issue?.name}</span>
      </header>
      <IssueDetail id={id} />
    </div>
  );
}
```

`web/src/components/Composer.tsx`:

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { appStore, uiStore, useAppState, useUi } from "../store";
import { demoFeatures } from "../store/selectors";

const field = "h-(--size-pill) rounded-full border border-line-2 bg-transparent px-2.5 text-small text-ink-2";

export function Composer() {
  const open = useUi((u) => u.composerOpen);
  const view = useUi((u) => u.view);
  const app = useAppState();
  const prefix = app.meta?.writeGuard === "demo" ? app.meta.demoPrefix : "";
  const features = useMemo(() => {
    const demo = demoFeatures(app);
    return [...demo, ...Object.values(app.features).filter((f) => !demo.includes(f))];
  }, [app]);
  const [name, setName] = useState(prefix);
  const [featureId, setFeatureId] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [inSprint, setInSprint] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(prefix);
    setFeatureId(features[0]?.id ?? null);
    setEstimate(null);
    setInSprint(view !== "backlog" && app.currentIterationId !== null);
  }, [open]); // reset each time the composer opens

  const close = () => uiStore.getState().setComposer(false);
  const canSubmit = name.trim().length > prefix.trim().length && featureId !== null && !busy;
  const submit = async () => {
    if (!canSubmit || featureId === null) return;
    setBusy(true);
    const created = await appStore.getState().createIssue({
      name: name.trim(), feature_id: featureId, estimate,
      iteration_id: inSprint ? app.currentIterationId : null, position: view === "backlog" ? "bottom" : "top",
    });
    setBusy(false);
    if (created) {
      close();
      uiStore.getState().select(created.id);
    }
  };
  const sprint = app.currentIterationId !== null ? app.iterations[app.currentIterationId] : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/10" />
        <Dialog.Content aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          className="fixed left-1/2 top-[14%] z-50 w-[560px] -translate-x-1/2 rounded-palette border-[0.5px] border-line-2 bg-surface p-4 shadow-palette">
          <Dialog.Title className="mb-3 font-medium text-ink-3">New story in {app.meta?.project.name}</Dialog.Title>
          <input aria-label="Story name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
            className="mb-3 w-full bg-transparent text-regular font-medium text-ink-1 outline-none" />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Feature" value={featureId ?? ""} onChange={(e) => setFeatureId(Number(e.target.value))} className={field}>
              {features.map((f) => <option key={f.id} value={f.id}>{f.formatted_id} {f.name}</option>)}
            </select>
            <select aria-label="Estimate" value={estimate ?? ""} onChange={(e) => setEstimate(e.target.value ? Number(e.target.value) : null)} className={field}>
              <option value="">No estimate</option>
              {[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>{n} points</option>)}
            </select>
            {sprint && (
              <label className="flex items-center gap-1.5 text-ink-2">
                <input type="checkbox" checked={inSprint} onChange={(e) => setInSprint(e.target.checked)} /> Add to {sprint.name}
              </label>
            )}
          </div>
          {features.length === 0 && <p className="mt-3 text-mini text-blocked">Rally needs a feature for every story, and none are loaded.</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-control px-3 py-1.5 text-ink-3 hover:bg-hover">Cancel</button>
            <button type="button" disabled={!canSubmit} onClick={() => void submit()}
              className="rounded-control bg-ink-1 px-3 py-1.5 font-medium text-surface disabled:opacity-40">
              Create story <kbd className="ml-1 text-mini opacity-70">⌘↵</kbd>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Replace `web/src/Overlays.tsx`:

```tsx
import { Cheatsheet } from "./components/Cheatsheet";
import { Composer } from "./components/Composer";
import { Toasts } from "./components/Toasts";
import { IssuePanel } from "./issue/IssuePanel";
import { CommandPalette } from "./palette/CommandPalette";

export function Overlays() {
  return (
    <>
      <IssuePanel />
      <CommandPalette />
      <Composer />
      <Cheatsheet />
      <Toasts />
    </>
  );
}
```

In `web/src/App.tsx`:
1. Add `import { IssuePage } from "./issue/IssuePage";`.
2. Add `const pageId = useUi((u) => u.pageId);` after the `view` line.
3. Replace `{status === "ready" && <Current />}` with `{status === "ready" && (pageId !== null ? <IssuePage id={pageId} /> : <Current />)}`.

- [ ] **Step 5: Run all web tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: `84 passed` (71 plus sanitize 6, IssueDetail 4 and Composer 3), and typecheck exits 0.

- [ ] **Step 6: Make the seed script reset descriptions and remove extra demo stories**

In `scripts/seed_demo.py`:
1. Change the import line to `from rally_demo import NOTE, PREFIX, PROJECT, TAG, assert_demo, call, current_iteration, demo_tag_ref, q, query, short`.
2. In the story upsert, change `reset=("Iteration", "ScheduleState", "PlanEstimate", "Owner")` to `reset=("Iteration", "ScheduleState", "PlanEstimate", "Owner", "Description")`.
3. Insert this before the `backlog = [...]` line:

```python
    # UI flows (composer) create extra [DEMO] stories; the seeded set is the source of truth.
    keep = {spec[0] for spec in STORIES}
    extras = query("hierarchicalrequirement", f'((Name contains "[DEMO]") AND (Tags.Name = "{TAG}"))',
                   fetch="ObjectID,FormattedID,Name,Project")
    for r in extras:
        if r["Name"].startswith(PREFIX) and r["Name"] not in keep:
            assert_demo(r["Name"], short(r["Project"]["_ref"]))
            call("DELETE", f"/hierarchicalrequirement/{r['ObjectID']}")
            print(f"removed {r['FormattedID']} {r['Name']} (not part of the seeded set)")
```

- [ ] **Step 7: Add the issue and composer flows and drive them live**

Append to `flows.py`:

```python
@flow
def issue(page: Page) -> None:
    page.goto(WEB)
    row = page.get_by_role("option", name=re.compile(r"My Work view with keyboard navigation"))
    row.click()
    page.keyboard.press(" ")
    panel = page.get_by_role("complementary", name="Issue preview")
    expect(panel).to_be_visible()
    expect(panel.get_by_role("button", name=re.compile(r"^State: "))).to_be_visible()
    task = panel.get_by_role("checkbox", name=re.compile(r"^Complete TA")).first
    expect(task).to_be_visible()
    before = task.is_checked()
    with page.expect_response(lambda r: "/api/tasks/" in r.url and r.request.method == "PATCH") as first:
        task.click()
    assert first.value.status == 200, f"task PATCH returned {first.value.status}"
    with page.expect_response(lambda r: "/api/tasks/" in r.url and r.request.method == "PATCH"):
        task.click()
    expect(task).to_be_checked(checked=before)
    editor = panel.get_by_label("Description")
    editor.click()
    page.keyboard.press("End")
    page.keyboard.type(" Edited by the issue flow.")
    with page.expect_response(lambda r: "/api/issues/" in r.url and r.request.method == "PATCH") as saved:
        panel.get_by_label("Title").click()  # blur saves; `rallypoc seed` restores the description
    assert saved.value.status == 200, f"description PATCH returned {saved.value.status}"
    page.keyboard.press("Escape")
    expect(panel).to_be_hidden()


@flow
def composer(page: Page) -> None:
    page.goto(WEB)
    page.wait_for_selector('[role="option"]')
    page.keyboard.press("c")
    name = page.get_by_label("Story name")
    expect(name).to_have_value("[DEMO] ")
    name.fill("[DEMO] Composer flow check")
    with page.expect_response(lambda r: r.url.endswith("/api/issues") and r.request.method == "POST") as created:
        page.keyboard.press("Meta+Enter")
    assert created.value.status == 201, f"create returned {created.value.status}"
    expect(page.get_by_role("option", name=re.compile("Composer flow check")).first).to_be_visible()
```

Run:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up
$CC browser run issue && $CC browser run composer
$CC seed        # expect a "removed … [DEMO] Composer flow check" line and a reset description
$CC stack down
```

Expected: `browser:issue  PASS`, then `browser:composer  PASS`, then seed prints `removed USnnnnnn [DEMO] Composer flow check (not part of the seeded set)`.

- [ ] **Step 8: Commit the code**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add issue peek/page, story editor, task list and composer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Map the story editor, mark the proxy create and task rows as driven, and commit**

In `rally-proxy.md`, change the `rally-proxy-create` and `rally-proxy-task-patch` rows: maturity becomes `stable` and Live becomes today's date (`date +%F`). The flows `composer` and `issue` drove them.

Add the index row `| [story-editor.md](story-editor.md) | Issue peek/page, properties, description, tasks, composer | all | stable |` and the sweep line `4. story-editor`. Then:

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/story-editor.md <<EOF
# Story editor

Last verified: $SHA on $TODAY (live)

One issue view in two sizes: Space opens a side panel and Enter opens the full page (\`web/src/issue/\`). The left column holds the title, the description (TipTap, sanitized with DOMPurify) and the tasks. The right column holds property pills that open the palette pickers. C opens the composer (\`web/src/components/Composer.tsx\`). Overall: stable.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| story-editor-peek | Space opens a side panel that follows J/K | stable | UI | $SHA | $TODAY | \`web/src/keyboard/actions.test.ts\`, flow issue |
| story-editor-page | Enter or double-click opens the full page with a breadcrumb back | beta (stable pending live) | UI | $SHA | not driven | \`web/src/issue/IssuePage.tsx\` |
| story-editor-properties | Pills for state, owner, iteration, estimate, blocked, feature, tags | stable | UI+API | $SHA | $TODAY | \`web/src/issue/IssueDetail.test.tsx\`, flow issue |
| story-editor-title | Rename on blur or Enter | beta (stable pending live) | UI+API | $SHA | not driven | \`IssueDetail.test.tsx\` "renaming saves on blur" |
| story-editor-description | Sanitized HTML editing, saved 1s after typing stops or on blur | stable | UI+API | $SHA | $TODAY | \`web/src/editor/sanitize.test.ts\`, flow issue |
| story-editor-tasks | Task checklist with a to-do total; checking completes the task in Rally | stable | UI+API | $SHA | $TODAY | \`IssueDetail.test.tsx\` tasks, flow issue |
| story-editor-composer | C creates a story under a feature, in the sprint or at the backlog bottom | stable | UI+API | $SHA | $TODAY | \`web/src/components/Composer.test.tsx\`, flow composer |

## How to get to it (user POV)

1. Select a row and press Space for the panel, or Enter for the full page.
2. Press C anywhere to create a story.

## Driving it

Preconditions: baseline. Run \`rallypoc seed\` afterwards to remove the composer's story and restore the description.

- **story-editor-peek**, **story-editor-properties**, **story-editor-description** and **story-editor-tasks**: → \`rallypoc browser run issue\` → PASS
- **story-editor-composer**: → \`rallypoc browser run composer\` → PASS, then \`rallypoc seed\` prints \`removed … Composer flow check\`

## Gotchas

- **Descriptions with tables are read-only here** (\`web/src/editor/sanitize.ts\`, \`editableInline\`). StarterKit would drop the table on save.
- **An untouched description is never written back.** The editor saves only after a real edit (\`DescriptionEditor.tsx\`), so opening an item doesn't rewrite Rally's HTML.
- **Rally requires a feature.** The composer stays disabled until one is chosen. With no features loaded, it explains why.
EOF
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the story editor area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Iteration board

**Files:**
- Run: `cd web && npm install @dnd-kit/core@^6.3 @dnd-kit/sortable@^10.0 @dnd-kit/utilities@^3.2`
- Create: `web/src/views/Board.tsx`, `web/src/components/TotalsBar.tsx`, `web/src/views/Board.test.tsx`
- Modify: `web/src/views/registry.ts`, `.claude/skills/verify-rally-poc/flows.py`
- Create: `.claude/skills/rally-poc-feature-map/features/iteration-board.md`

**Interfaces:**
- Consumes: `boardColumns`, `iterationTotals`, `Group` and `Totals` (Task 10); `updateIssue` (Task 8); `STATE_COLOR` (Task 10, `StateGlyph.tsx`).
- Produces:
  - `stateForDrop(issue, overId): ScheduleState | null`, `Board` and `TotalsBar({totals})`.
  - Accessible names: columns are regions named `"<State> column"`, and cards are `option`s.
  - A `drag(page, source, target)` helper in `flows.py`, reused in Task 14.

- [ ] **Step 1: Write the failing tests**

`web/src/views/Board.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue } from "../test/fixtures";
import { Board, stateForDrop } from "./Board";

beforeEach(() => {
  appStore.setState(stateFromBootstrap(makeBootstrap()));
  uiStore.setState(uiStore.getInitialState(), true);
});

test("a drop changes state only on a different column", () => {
  const issue = makeIssue();
  expect(stateForDrop(issue, "Completed")).toBe("Completed");
  expect(stateForDrop(issue, "In-Progress")).toBeNull();
  expect(stateForDrop(issue, 1002)).toBeNull();
  expect(stateForDrop(issue, undefined)).toBeNull();
});

test("four columns with the team's sprint items and the totals line", () => {
  render(<Board />);
  for (const state of ["Defined", "In-Progress", "Completed", "Accepted"]) {
    expect(screen.getByRole("region", { name: `${state} column` })).toBeInTheDocument();
  }
  expect(within(screen.getByRole("region", { name: "Defined column" })).getByText("[DEMO] Example defect")).toBeInTheDocument();
  expect(screen.getByText("Defined 2 · In-Progress 5 · Completed 0 · Accepted 0 pts · Blocked 0")).toBeInTheDocument();
});

test("no current iteration explains itself", () => {
  appStore.setState(stateFromBootstrap(makeBootstrap({ current_iteration_id: null, iteration_order: [] })));
  render(<Board />);
  expect(screen.getByText("No current iteration in Demo Team.")).toBeInTheDocument();
});
```

Run: `cd web && npx vitest --run src/views/Board.test.tsx`
Expected: FAIL with `Failed to resolve import "./Board"`.

- [ ] **Step 2: Write the totals bar and the board**

`web/src/components/TotalsBar.tsx`:

```tsx
import { SCHEDULE_STATES } from "../api/types";
import type { Totals } from "../store/selectors";
import { STATE_COLOR } from "./StateGlyph";

export function TotalsBar({ totals }: { totals: Totals }) {
  const total = totals.total || 1;
  return (
    <div className="px-3 pt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-line-1" aria-hidden>
        {SCHEDULE_STATES.map((s) => (
          <div key={s} style={{ width: `${(totals.byState[s] / total) * 100}%`, background: STATE_COLOR[s] }} />
        ))}
      </div>
      <p className="mt-1.5 text-mini text-ink-3">
        {SCHEDULE_STATES.map((s) => `${s} ${totals.byState[s]}`).join(" · ")} pts · Blocked {totals.blocked}
      </p>
    </div>
  );
}
```

`web/src/views/Board.tsx`:

```tsx
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { SCHEDULE_STATES, type Issue, type ScheduleState } from "../api/types";
import { Avatar } from "../components/Avatar";
import { StateGlyph } from "../components/StateGlyph";
import { TotalsBar } from "../components/TotalsBar";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { appStore, uiStore, useAppState, useUi } from "../store";
import { boardColumns, iterationTotals, type Group } from "../store/selectors";

export function stateForDrop(issue: Issue, overId: string | number | null | undefined): ScheduleState | null {
  const target = SCHEDULE_STATES.find((s) => s === overId);
  return target && target !== issue.state ? target : null;
}

function Card({ issue }: { issue: Issue }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: issue.id });
  const selected = useUi((u) => u.selectedId === issue.id);
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} role="option" aria-selected={selected} data-issue-id={issue.id}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => uiStore.getState().select(issue.id)} onDoubleClick={() => uiStore.getState().openPage(issue.id)}
      className={`rounded-control border bg-surface p-2.5 transition-shadow duration-150 ${selected ? "border-focus" : "border-line-2"} ${isDragging ? "relative z-10 shadow-palette" : ""}`}>
      <div className="mb-1 flex items-center gap-2 text-mini text-ink-3">
        <span>{issue.formatted_id}</span>
        {issue.blocked && <span className="text-blocked">Blocked</span>}
        <span className="ml-auto">{issue.estimate ?? ""}</span>
      </div>
      <div className="mb-2 line-clamp-2 font-medium text-ink-1">{issue.name}</div>
      <Avatar user={issue.owner} />
    </div>
  );
}

function Column({ group }: { group: Group }) {
  const { setNodeRef, isOver } = useDroppable({ id: group.state });
  return (
    <section ref={setNodeRef} aria-label={`${group.state} column`}
      className={`flex min-h-40 flex-col gap-2 rounded-control p-2 transition-colors duration-150 ${isOver ? "bg-hover" : "bg-hover/40"}`}>
      <header className="flex h-8 items-center gap-2 px-1">
        <StateGlyph state={group.state} />
        <span className="font-medium text-ink-2">{group.state}</span>
        <span className="text-ink-3">{group.issues.length}</span>
      </header>
      {group.issues.map((issue) => <Card key={issue.id} issue={issue} />)}
    </section>
  );
}

export function Board() {
  const app = useAppState();
  const filter = useUi((u) => u.featureFilter);
  const columns = useMemo(() => boardColumns(app, filter), [app, filter]);
  const totals = useMemo(() => iterationTotals(app), [app]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const iteration = app.currentIterationId !== null ? app.iterations[app.currentIterationId] : undefined;
  const onDragEnd = (e: DragEndEvent) => {
    const issue = appStore.getState().issues[Number(e.active.id)];
    const next = issue ? stateForDrop(issue, e.over?.id) : null;
    if (issue && next) void appStore.getState().updateIssue(issue.id, { state: next });
  };
  if (!iteration) {
    return <ViewFrame title="Board"><Empty>No current iteration in {app.meta?.project.name}.</Empty></ViewFrame>;
  }
  return (
    <ViewFrame title="Board" subtitle={iteration.name}>
      <TotalsBar totals={totals} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div role="listbox" aria-label="Board" className="grid grid-cols-4 gap-2 p-2">
          {columns.map((c) => <Column key={c.state} group={c} />)}
        </div>
      </DndContext>
    </ViewFrame>
  );
}
```

Replace `web/src/views/registry.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Columns3, Inbox } from "lucide-react";
import type { ComponentType } from "react";
import type { View } from "../store/ui";
import { Board } from "./Board";
import { MyWork } from "./MyWork";

export interface ViewDef { id: View; label: string; icon: LucideIcon; shortcut: string; component: ComponentType }

export const VIEWS: ViewDef[] = [
  { id: "my-work", label: "My Work", icon: Inbox, shortcut: "G M", component: MyWork },
  { id: "board", label: "Board", icon: Columns3, shortcut: "G B", component: Board },
];

export const hasView = (id: View): boolean => VIEWS.some((v) => v.id === id);
```

- [ ] **Step 3: Run all web tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: `87 passed`, and typecheck exits 0.

- [ ] **Step 4: Add the board flow and drive it live**

Append to `flows.py`:

```python
def drag(page: Page, source, target) -> None:
    """Pointer drag that dnd-kit recognises: press, move past the 4px threshold, glide to the target, release."""
    s, t = source.bounding_box(), target.bounding_box()
    sx, sy = s["x"] + s["width"] / 2, s["y"] + s["height"] / 2
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 8, sy + 8, steps=3)
    page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, steps=12)
    page.mouse.up()


@flow
def board(page: Page) -> None:
    page.goto(WEB)
    page.wait_for_selector('[role="option"]')
    page.keyboard.press("g")
    page.keyboard.press("b")
    for state in ("Defined", "In-Progress", "Completed", "Accepted"):
        expect(page.get_by_role("region", name=f"{state} column")).to_be_visible()
    defined = page.get_by_role("region", name="Defined column")
    progress = page.get_by_role("region", name="In-Progress column")
    card = lambda column: column.get_by_role("option", name=re.compile("Story editor with HTML round-trip"))
    expect(card(defined)).to_be_visible()
    with page.expect_response(lambda r: "/api/issues/" in r.url and r.request.method == "PATCH") as moved:
        drag(page, card(defined), progress)
    assert moved.value.status == 200, f"state PATCH returned {moved.value.status}"
    expect(card(progress)).to_be_visible()
    with page.expect_response(lambda r: "/api/issues/" in r.url and r.request.method == "PATCH"):
        drag(page, card(progress), defined)  # put it back to the seeded state
    expect(card(defined)).to_be_visible()
```

Run:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up && $CC browser run board && $CC stack down
```

Expected: `browser:board  PASS`. The screenshot shows four columns and the totals line.

- [ ] **Step 5: Commit the code**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add iteration board with drag-to-change-state and totals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Map the board and commit**

Add the index row `| [iteration-board.md](iteration-board.md) | Sprint kanban, drag to change state, totals | all | stable |` and the sweep line `5. iteration-board`. Then:

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/iteration-board.md <<EOF
# Iteration board

Last verified: $SHA on $TODAY (live)

The current sprint as four schedule-state columns (\`web/src/views/Board.tsx\`). Dragging a card to another column writes its ScheduleState. A thin bar on top sums points by state, plus blocked, computed in the client from the loaded sprint items (plan deviation 1). Overall: stable.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| board-columns | Defined / In-Progress / Completed / Accepted with counts | stable | UI | $SHA | $TODAY | \`web/src/views/Board.test.tsx\`, flow board |
| board-drag-state | Drag a card across columns → ScheduleState write | stable | UI+API | $SHA | $TODAY | \`Board.test.tsx\` "a drop changes state…", flow board |
| board-totals | Points by state plus blocked, as a segmented bar | stable | UI | $SHA | $TODAY | \`web/src/store/selectors.test.ts\` totals, \`Board.test.tsx\` |

## How to get to it (user POV)

1. Press "g" then "b", or click "Board" in the sidebar.

## Driving it

Preconditions: baseline.

- **board-columns**, **board-drag-state** and **board-totals**: → \`rallypoc browser run board\` → PASS

## Gotchas

- **Totals count top-level sprint items only.** They match Rally's iteration status for stories and defects, but leave out test sets.
- **No reordering within a column.** A drop only changes state. Ranking happens in the backlog.
EOF
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the iteration board area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Backlog grooming (drag to rank, multi-select, bulk actions)

**Files:**
- Create: `web/src/views/Backlog.tsx`, `web/src/views/BulkBar.tsx`, `web/src/views/Backlog.test.tsx`
- Modify: `web/src/views/registry.ts`, `.claude/skills/verify-rally-poc/flows.py`
- Create: `.claude/skills/rally-poc-feature-map/features/backlog.md`

**Interfaces:**
- Consumes: `backlogIssues` (Task 10); `rankIssue` and `updateIssues` (Task 8); `IssueRow` with `multi` (Task 10); `openPalette` and `clearSelection` (Task 10); `drag` (Task 13 `flows.py`).
- Produces:
  - `rankRequestFor(order, activeId, overId): RankRequest | null`, `Backlog`, and `BulkBar({ids})`.
  - Accessible names: the listbox `"Backlog"`, the toolbar `"Bulk actions"`, and the button `"Move to <sprint>"`.

- [ ] **Step 1: Write the failing tests**

`web/src/views/Backlog.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appStore, uiStore } from "../store";
import { stateFromBootstrap } from "../store/store";
import { makeBootstrap, makeIssue, serve } from "../test/fixtures";
import { Backlog, rankRequestFor } from "./Backlog";

beforeEach(() => {
  appStore.setState(stateFromBootstrap(makeBootstrap()));
  uiStore.setState({ ...uiStore.getInitialState(), view: "backlog" }, true);
});
afterEach(() => vi.unstubAllGlobals());

test("moving down ranks below the target; moving up ranks above it", () => {
  expect(rankRequestFor([1, 2, 3], 1, 3)).toEqual({ below: 3 });
  expect(rankRequestFor([1, 2, 3], 3, 1)).toEqual({ above: 1 });
});

test("dropping on itself or outside the list sends nothing", () => {
  expect(rankRequestFor([1, 2, 3], 2, 2)).toBeNull();
  expect(rankRequestFor([1, 2, 3], 2, 9)).toBeNull();
});

test("rows follow Rally's rank order and have checkboxes", () => {
  render(<Backlog />);
  expect(screen.getAllByRole("option").map((r) => r.getAttribute("data-issue-id"))).toEqual(["1002", "1003"]);
  expect(screen.getByLabelText("Select US1002")).toBeInTheDocument();
});

test("bulk move sends one write per story and clears the selection", async () => {
  const fetchMock = serve({
    "PATCH /api/issues/1002": makeIssue({ id: 1002, iteration_id: 301 }),
    "PATCH /api/issues/1003": makeIssue({ id: 1003, iteration_id: 301 }),
  });
  uiStore.setState({ selectedIds: [1002, 1003] });
  render(<Backlog />);
  expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toHaveTextContent("2 selected");
  fireEvent.click(screen.getByRole("button", { name: "Move to Sprint 3" }));
  expect(uiStore.getState().selectedIds).toEqual([]);
  expect(appStore.getState().backlogOrder).toEqual([]);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

test("bulk state opens the picker for all selected stories", () => {
  uiStore.setState({ selectedIds: [1002, 1003] });
  render(<Backlog />);
  fireEvent.click(screen.getByRole("button", { name: "State…" }));
  expect(uiStore.getState().palette).toEqual({ open: true, picker: "state", targetIds: [1002, 1003] });
});
```

Run: `cd web && npx vitest --run src/views/Backlog.test.tsx`
Expected: FAIL with `Failed to resolve import "./Backlog"`.

- [ ] **Step 2: Write the bulk bar and the backlog**

`web/src/views/BulkBar.tsx`:

```tsx
import { appStore, uiStore, useApp } from "../store";

const button = "rounded-control px-2 py-1 text-ink-2 hover:bg-hover";

export function BulkBar({ ids }: { ids: number[] }) {
  const sprint = useApp((s) => (s.currentIterationId !== null ? s.iterations[s.currentIterationId] : undefined));
  const ui = uiStore.getState();
  return (
    <div role="toolbar" aria-label="Bulk actions"
      className="mx-2 mb-2 flex items-center gap-1 rounded-control border border-line-2 bg-surface px-3 py-1.5 shadow-palette">
      <span className="mr-2 font-medium text-ink-1">{ids.length} selected</span>
      {sprint && (
        <button type="button" className={button}
          onClick={() => {
            void appStore.getState().updateIssues(ids, { iteration_id: sprint.id });
            ui.clearSelection();
          }}>
          Move to {sprint.name}
        </button>
      )}
      <button type="button" className={button} onClick={() => ui.openPalette("state", ids)}>State…</button>
      <button type="button" className={button} onClick={() => ui.openPalette("owner", ids)}>Owner…</button>
      <button type="button" className={button} onClick={() => ui.openPalette("iteration", ids)}>Iteration…</button>
      <button type="button" className={`${button} ml-auto text-ink-3`} onClick={() => ui.clearSelection()}>Clear</button>
    </div>
  );
}
```

`web/src/views/Backlog.tsx`:

```tsx
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import type { Issue, RankRequest } from "../api/types";
import { IssueRow } from "../components/IssueRow";
import { Empty, ViewFrame } from "../components/ViewFrame";
import { appStore, useAppState, useUi } from "../store";
import { backlogIssues } from "../store/selectors";
import { BulkBar } from "./BulkBar";

/** Dropping onto a row: moving down lands below it, moving up lands above it. */
export function rankRequestFor(order: number[], activeId: number, overId: number): RankRequest | null {
  if (activeId === overId) return null;
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0) return null;
  return from < to ? { below: overId } : { above: overId };
}

function SortableRow({ issue }: { issue: Issue }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : ""}>
      <IssueRow issue={issue} multi />
    </div>
  );
}

export function Backlog() {
  const app = useAppState();
  const filter = useUi((u) => u.featureFilter);
  const selectedIds = useUi((u) => u.selectedIds);
  const issues = useMemo(() => backlogIssues(app, filter), [app, filter]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const req = rankRequestFor(issues.map((i) => i.id), Number(e.active.id), Number(e.over.id));
    if (req) void appStore.getState().rankIssue(Number(e.active.id), req, "backlog");
  };
  return (
    <ViewFrame title="Backlog" subtitle={`${issues.length} unscheduled`}>
      {selectedIds.length > 0 && <BulkBar ids={selectedIds} />}
      {issues.length === 0 ? (
        <Empty>The backlog is empty.</Empty>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div role="listbox" aria-label="Backlog" aria-multiselectable="true" className="flex flex-col">
              {issues.map((issue) => <SortableRow key={issue.id} issue={issue} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </ViewFrame>
  );
}
```

Replace `web/src/views/registry.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { Columns3, Inbox, ListOrdered } from "lucide-react";
import type { ComponentType } from "react";
import type { View } from "../store/ui";
import { Backlog } from "./Backlog";
import { Board } from "./Board";
import { MyWork } from "./MyWork";

export interface ViewDef { id: View; label: string; icon: LucideIcon; shortcut: string; component: ComponentType }

export const VIEWS: ViewDef[] = [
  { id: "my-work", label: "My Work", icon: Inbox, shortcut: "G M", component: MyWork },
  { id: "board", label: "Board", icon: Columns3, shortcut: "G B", component: Board },
  { id: "backlog", label: "Backlog", icon: ListOrdered, shortcut: "G L", component: Backlog },
];

export const hasView = (id: View): boolean => VIEWS.some((v) => v.id === id);
```

- [ ] **Step 3: Run all web tests and typecheck**

Run: `cd web && npx vitest --run && npm run typecheck`
Expected: `92 passed`, and typecheck exits 0.

- [ ] **Step 4: Add the backlog flow and drive it live**

Append to `flows.py`:

```python
@flow
def backlog(page: Page) -> None:
    page.goto(WEB)
    page.wait_for_selector('[role="option"]')
    page.keyboard.press("g")
    page.keyboard.press("l")
    listbox = page.get_by_role("listbox", name="Backlog")
    names = ["Backlog drag-to-rank", "Poll Rally for remote changes", "Bulk move stories to an iteration"]
    rows = [listbox.get_by_role("option", name=re.compile(n)) for n in names]
    for r in rows:
        expect(r).to_be_visible()
    demo_ids = {int(r.get_attribute("data-issue-id")) for r in rows}

    def order() -> list[int]:
        ids = listbox.locator('[role="option"]').evaluate_all("els => els.map(e => Number(e.dataset.issueId))")
        return [i for i in ids if i in demo_ids]

    def row(issue_id: int):
        return listbox.locator(f'[role="option"][data-issue-id="{issue_id}"]')

    rows[0].click()
    page.keyboard.press("x")
    page.keyboard.press("j")
    page.keyboard.press("x")
    expect(page.get_by_role("toolbar", name="Bulk actions")).to_contain_text("2 selected")
    page.get_by_role("button", name="Clear").click()

    seeded = order()
    first, last = seeded[0], seeded[-1]
    with page.expect_response(lambda r: r.url.endswith(f"/api/issues/{last}/rank")) as ranked:
        drag(page, row(last), row(first))
    assert ranked.value.status == 200, f"rank returned {ranked.value.status}"
    moved = order()
    assert moved.index(last) < moved.index(first), f"rank did not move: {moved}"
    with page.expect_response(lambda r: r.url.endswith(f"/api/issues/{last}/rank")):
        drag(page, row(last), row(seeded[-2]))  # moving down onto the old neighbour ranks below it: original order
    assert order() == seeded, f"order not restored: {order()}"
```

Run:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up && $CC browser run backlog && $CC stack down
```

Expected: `browser:backlog  PASS`.

- [ ] **Step 5: Commit the code**

```bash
git add -A
gitleaks git --staged --redact -v
git commit -m "Add backlog with drag-to-rank, multi-select and bulk actions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Map the backlog and commit**

Add the index row `| [backlog.md](backlog.md) | Rank-ordered backlog, drag to rank, bulk actions | all | stable |` and the sweep line `6. backlog`. Then:

````bash
SHA=$(git rev-parse --short=12 HEAD); TODAY=$(date +%F)
cat > .claude/skills/rally-poc-feature-map/features/backlog.md <<EOF
# Backlog

Last verified: $SHA on $TODAY (live)

The team's unscheduled stories and defects in Rally rank order (\`web/src/views/Backlog.tsx\`). Drag a row to rank it. The client sends the new neighbour and the proxy turns it into \`rankAbove\`/\`rankBelow\`. X multi-selects, which brings up a bulk bar (\`web/src/views/BulkBar.tsx\`). Overall: stable.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| backlog-list | Unscheduled, unaccepted leaf items in Rally rank order | stable | UI+API | $SHA | $TODAY | \`web/src/views/Backlog.test.tsx\`, flow backlog |
| backlog-drag-rank | Drag to rank, optimistic, rolled back on failure | stable | UI+API | $SHA | $TODAY | \`Backlog.test.tsx\` rankRequestFor, \`web/src/store/store2.test.ts\` rank, flow backlog |
| backlog-multi-select | X or the checkbox selects rows; the bulk bar shows the count | stable | UI | $SHA | $TODAY | flow backlog |
| backlog-bulk-actions | Move to sprint, or state/owner/iteration pickers for every selected row | beta (stable pending live) | UI+API | $SHA | not driven | \`Backlog.test.tsx\` bulk tests |

## How to get to it (user POV)

1. Press "g" then "l", or click "Backlog" in the sidebar.
2. Drag rows, or press "x" on rows to select them.

## Driving it

Preconditions: baseline, plus \`rallypoc seed\` so the three demo backlog stories are adjacent and in seeded order.

- **backlog-list**, **backlog-drag-rank** and **backlog-multi-select**: → \`rallypoc browser run backlog\` → PASS (ranks one demo story and restores it)

## Gotchas

- **Capped at 200 items** (spec assumption 4). Ranking past the loaded page is untested (spec §13).
- **Ranking under a feature filter is relative to visible neighbours.** That's correct in Rally, but hidden items between them keep their place.
EOF
.claude/skills/rally-poc-feature-map/render-map
git add -A && gitleaks git --staged --redact -v
git commit -m "Map the backlog area

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `check ui`, the demo journey, and a full dry run of the demo checklist

**Files:**
- Modify: `.claude/skills/verify-rally-poc/rallypoc` (add `check ui`)
- Modify: `.claude/skills/rally-poc-feature-map/features/multi-surface-journeys.md`, `features/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: every flow from Tasks 2 and 10–14, `check api` (Task 7), and every feature-map area.
- Produces: `rallypoc check ui`, which runs every flow, and the journey `j-demo-script`.

- [ ] **Step 1: Add `check ui`**

In `.claude/skills/verify-rally-poc/rallypoc`, replace `CHECKS = {"api": check_api}` with:

```python
def check_ui(args) -> None:
    """Spec §9.1: drive every Playwright flow and save a screenshot of each."""
    args.action, args.target = "run", "all"
    cmd_browser(args)


CHECKS = {"api": check_api, "ui": check_ui}
```

- [ ] **Step 2: Write the demo journey**

Replace the table and everything below it in `multi-surface-journeys.md` with:

````markdown
| ID | Journey | Areas | Last live | Result |
|---|---|---|---|---|
| j-demo-script | The collabathon demo: My Work → ⌘K state change → board → backlog rank → issue edit | my-work, command-palette, iteration-board, backlog, story-editor, rally-proxy | not driven | not driven |

## j-demo-script

Touches: `my-work-list`, `my-work-keyboard`, `palette-state-picker`, `board-drag-state`, `backlog-drag-rank`, `story-editor-properties`, `rally-proxy-patch`, `rally-proxy-rank`, `rally-proxy-changes`.

Invariants:
1. A state set in ⌘K is the state shown in the board column, and the state Rally returns on the next `/api/changes`.
2. A rank changed in the backlog is the order `/api/changes` returns, so a reload shows the same order.
3. After the run, `rallypoc seed` returns every `[DEMO]` item to its seeded state, and `check api` passes again.

Drive:

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
$CC stack up
$CC seed
$CC check api
$CC check ui
$CC seed
$CC check api
$CC stack down
```

Result: not driven yet.
````

- [ ] **Step 3: Finish the README index and add the two CLAUDE.md lines**

In `features/README.md`:
- Check that the Index has six rows: rally-proxy, my-work, command-palette, story-editor, iteration-board and backlog.
- Check that "Sweep order" lists 1–6 in that order.

Append to `CLAUDE.md`:

```markdown
- Before answering a question about what this app does or how mature a feature is, use the `rally-poc-feature-map` skill.
- Verify every change with `.claude/skills/verify-rally-poc/rallypoc` (`test`, `check api`, `check ui`). Don't hand-roll curl or Playwright for what it covers.
```

- [ ] **Step 4: Run the whole demo checklist (spec §11, items 1–4)**

```bash
CC=.claude/skills/verify-rally-poc/rallypoc
export RALLY_POC_VERIFY_INSTANCE=demo-dry-run
$CC doctor
$CC test
$CC stack up
$CC seed                 # §11.1: demo data reset to seeded states
$CC check api            # §11.2
$CC check ui             # §11.2
$CC seed                 # restore anything the flows changed
$CC check api
grep -c '^WRITE_GUARD=demo$' .env   # §11.4: expect 1
.claude/skills/rally-poc-feature-map/render-map --open   # §11.3: every demoed row is stable
$CC report > "$($CC evidence dir)/report.md"
$CC stack down
```

Expected:
- `doctor: ok`, and every `test:` line PASS.
- Every `api:` and `browser:` line PASS. That's 7 flows: smoke, my-work, palette, issue, composer, board and backlog.
- `1` from the grep.
- The map page shows no FAIL.
- `report.md` starts with `**Verdict**: PASS`.

If anything FAILs:
1. Stop.
2. Read its evidence screenshot or response.
3. Fix the cause in the owning task's code, adding a test that pins it.
4. Rerun from `$CC test`.

- [ ] **Step 5: Record the journey result and commit**

In `multi-surface-journeys.md`:
- Set the `j-demo-script` row's `Last live` to today's date and `Result` to `PASS`.
- Set `Result:` under the section to `Result (<today>): PASS, see /tmp/rally-poc-verify/demo-dry-run/evidence/report.md`.
- Bump the file's `Last verified` line.

```bash
.claude/skills/rally-poc-feature-map/render-map
git add -A
gitleaks git --staged --redact -v
git commit -m "Add check ui, the demo journey, and record the dry run

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Leave §11.5 for after the collabathon**

Do not run `scripts/cleanup_demo.py --yes` or delete the API key now. Both happen after the event, when the user asks (spec §11.5, and "Never without asking" in the verify skill).

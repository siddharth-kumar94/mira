# Mira

Linear's model over Rally WSAPI v2.0. Spec: `docs/specs/2026-10-16-mira-v2-linear-model-design.md`. Plans: `docs/superpowers/plans/2026-10-16-mira-v2-phase1-2.md` (Phases 1–2), `docs/superpowers/plans/2026-10-16-mira-v2-phase3-linear-parity.md` (Phase 3) and `docs/superpowers/plans/2026-10-19-mira-v2-phase4.md` (Phase 4; its scenario dry run is `docs/superpowers/plans/2026-10-19-mira-v2-phase4-dry-run.md`). (v1: `docs/specs/2026-10-16-rally-client-poc-design.md`.)

- `server/`: FastAPI proxy (uv, Python 3.12). Tests: `cd server && uv run pytest -q`.
- `web/`: React + Vite. Tests: `cd web && npx vitest --run && npm run typecheck`.
- Only `server/app/rally/` knows Rally's shapes. The frontend sees domain objects only, and the app speaks Rally's words (Sprint, Feature, Capability, Story, Task; see the README's Words table); URLs and code keep the older names.
- Rally writes while developing: the app has no write guard, so every edit goes straight to Rally. Touch only `[DEMO] `-prefixed, `collabathon-demo`-tagged items in `RALLY_PROJECT`.
- Never commit `.env`, API keys or real Rally ObjectIDs. Test fixtures are synthetic.
- Before answering a question about what this app does or how mature a feature is, use the `rally-poc-feature-map` skill (twelve areas, graded at 2026-10-20; the sprint and feature burn-ups are built and graded beta).
- Verify every change with `.claude/skills/verify-rally-poc/rallypoc` (`test`, `check api`, `check ui`). Do not hand-roll curl or Playwright for what it covers.

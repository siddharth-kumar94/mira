---
name: rally-poc-feature-map
description: Use when answering any question about Rally POC (does a feature exist, how mature or tested it is, who can use it, how a user reaches it, whether a deployed environment runs it, how to prove it works), when onboarding someone to it, or after changing a feature so the map stays true.
---

# Rally POC feature map

`features/` describes every product area at the behaviour level. For each area it records what exists, the maturity grade with evidence, how a user gets there, and how to drive it with `rallypoc` (the verify-rally-poc skill). `features/README.md` holds the rubric, the entry contract and the index. Read it first.

To show someone the map, run `.claude/skills/rally-poc-feature-map/render-map --open`. It turns `features/*.md` into one self-contained page at `/tmp/rally-poc-feature-map.html`, with tiles by maturity, filters, a journey overlay and per-row detail. It reads the markdown and never edits it, so re-run it after any edit. It exits non-zero when a table row breaks the contract.

**Core rule:** the map is a fast index. The source is the authority. Every answer cites file:line or test evidence and says how fresh it is.

## Answering a question

1. **Find the area.** Use the index in `features/README.md`. For questions that span areas, use `features/multi-surface-journeys.md`.
2. **Read the feature file.** Use the `Sub-features` table for the grade and evidence and `Gotchas` for traps. Don't stop at the first row that looks right.
3. **Check freshness.** Evidence paths are often short, so check the area's directories: `git log --oneline <Last verified sha>..HEAD -- <area dirs>`. Then run `git status --short` for uncommitted changes. If anything touched those paths, re-read the cited source before answering, and update the file (see Maintain).
4. **Deployed?** The grade describes the code at `Last verified`, not what an environment runs. Run `rallypoc aws status` (read-only), then compare against the row's `Since` commit. If credentials are expired, or you may not call AWS, say so and use the README snapshot with its date. Write "the environment runs code with this defect", never "I saw it there" unless you drove it there.
5. **Answer** in this shape:
   - **Answer:** yes/no/partly, in one or two sentences.
   - **Maturity:** the grade and the reason (`beta`: works from the UI, but <gotcha>).
   - **Who:** roles, and whether the UI and the API agree.
   - **Where:** the UI path in on-screen labels, or "API only: `METHOD /path`".
   - **Deployed:** deployed, not deployed, or unknown, plus how you know.
   - **Evidence:** file:line, test names, the date of the last live drive.
   - **Confidence:** high / medium / low, and what would raise it.

For a quick question, fold these into a few sentences, but keep the maturity, the deployed status and at least one piece of evidence. If the map has no entry, answer from the source, label the answer `unmapped`, and add the row.

Evidence paths name the instance that produced them (`/tmp/rally-poc-verify/<instance>/evidence/`). `/tmp` is cleared on reboot. The feature files record the observed values, so a missing evidence file means "not re-checkable", not "failed".

## Grades in one line

`deferred` (out of scope by decision) < `stub` (code exists, doesn't do the job) < `api-only` (works, no UI reaches it) < `beta` (reachable, happy path works, a defect or coverage gap) < `stable` (reachable, tests pass, no known defect, driven live). Any known defect caps a sub-feature at `beta`. A source-only review writes `beta (stable pending live)`.

**Tests passing ≠ CI green.** Say which one the evidence is (`rallypoc ci status` shows what CI really did).

## Maintain

Run this after a feature change, or when step 3 of "Answering" finds drift.

1. **Source wave**, in parallel and read-only: one subagent per affected area file. Each re-reads the cited source and tests, re-grades every row, and returns its changes and its top defects. Give each the README contract. Subagents never mutate the shared stack.
2. **Live pass**, sequential, in the README sweep order:
   ```bash
   export RALLY_POC_VERIFY_INSTANCE=map-$(date +%Y%m%d)
   CC=.claude/skills/verify-rally-poc/rallypoc
   $CC doctor && $CC stack up && $CC seed
   ```
   Then run each file's "Driving it" bullets exactly. Capture ids with the API driver and wait for async work with its `--until`; never `sleep`. Record one `<id> PASS|FAIL|SKIP <evidence> <reason>` line per bullet. Put dates in `Live` only for rows that PASSed.
3. **Close each file** as one of three outcomes: **clean** (bump `Last verified`), **changed** (rows or gotchas updated, with new evidence), **blocked** (say what blocks it and leave the grade).
4. **Finish.** Update the README index `Overall` column and the deployed snapshot; run `render-map` to confirm the contract still parses; run `rallypoc cleanup`.

## Common mistakes

| Mistake | Instead |
|---|---|
| Grading from docs, CLAUDE.md or commit messages | Grade what the code does; cite file:line |
| "It's on the branch, so it's live" | Deployed environments lag the branch; check `aws status` against `Since` |
| Writing `stable` from source reading | `beta (stable pending live)` until a live PASS |
| Answering from a stale file | Run the freshness check first |
| "Tests cover it" without naming them | Name the test function |
| Treating a visible button as permission | Role gating is enforced in the API; a mismatch is a defect |
| Fixing data with SQL to drive a feature | Use the UI or API path. If only SQL reaches the state, report it as a finding |
| Putting account IDs, ARNs or internal hostnames in the map | Names only |

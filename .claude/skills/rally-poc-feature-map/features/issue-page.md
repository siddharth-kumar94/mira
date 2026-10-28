# Story page

Last verified: f064d7ee53a4 on 2026-10-20 (live)

One story: the full page at `/issue/<key>` and the read-only preview card (Space) over any list or board. The page has the title, a description editor, tasks, the activity feed with comments, and the properties sidebar. Everyone uses it. It lives in `web/src/issue/` and `web/src/editor/`. Overall: beta. Reading, activity, comments and tasks were driven live; editing properties and the description from the page were not.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| issue-page-open | Open by URL, key or Enter; breadcrumb is the view you came from with a pager through it; an unknown key says so | stable | UI+API | 95483a4 | 2026-10-20 | `web/src/issue/IssuePage.tsx:11`, `web/src/issue/IssuePage.test.tsx::a story opened by its URL loads by key and shows its properties`, `::the breadcrumb is where you came from, with a pager through that view`, `::an unknown story says so instead of loading forever`, flow `issue-page`, dry run scenario 5 (a real AI/ML story opened by key) |
| issue-page-activity | Activity in Rally's words ("created the story", "moved to sprint PI 4 · Sprint 3") from Rally's revisions, interleaved with comments | stable | UI+API | 15d6606 | 2026-10-20 | `web/src/issue/Activity.tsx:39`, `server/app/rally/mapping.py:445`, `Activity.test.tsx::events and comments interleave oldest first, in Rally's words`, `server/tests/test_mapping.py::test_activity_reads_in_linears_words`, `test_issue_reads.py::test_issue_detail_by_key_has_sub_issues_comments_and_activity`, dry run scenario 5: two events on the user's real story |
| issue-page-comments | The box posts with ⌘↵: shown at once, a refused post comes back into the box with a toast; Rally comments only on [DEMO] items with the guard on | stable | UI+API | 15d6606 | 2026-10-20 | `Activity.test.tsx::⌘↵ posts the comment at once; the box clears`, `::a refused comment comes back into the box, with a toast`, `server/tests/test_other_writes.py::test_comment_writes_on_real_items_are_refused`, flow `issue-page` (comment posted, then removed), `check api` api:comment-round-trip, dry run scenario 5: posted on a [DEMO] story, deleted with `DELETE /api/comments/<id>`, 0 comments after |
| issue-page-sub-issues | "Add tasks" opens a title row; Enter creates it and keeps the row open; delete; in demo mode the title carries the prefix | stable | UI+API | 95483a4 | 2026-10-20 | `web/src/issue/SubIssueList.tsx:8`, `IssuePage.test.tsx::Add tasks opens a title row; Enter creates it and keeps the row open`, `server/tests/test_other_writes.py::test_create_sub_issue_under_demo_issue`, flow `issue-page` (task round trip), `check api` api:sub-issue-round-trip |
| issue-page-properties | Sidebar: status, team, priority, assignee, estimate, sprint, labels, feature, each editable | beta (stable pending live) | UI+API | 95483a4 | 2026-10-20 | `web/src/issue/IssueDetail.tsx:55`, `Activity.test.tsx::an edit made on the page reloads the detail once it settles, so the feed shows it`; the properties were read live, but no edit was made from the page (priority was edited from ⌘K in flow `palette`) |
| issue-page-description | Rich description editor with sanitized HTML that round-trips to Rally | beta (stable pending live) | UI+API | cd448b0 | not driven | `web/src/editor/DescriptionEditor.tsx:9`, `web/src/editor/sanitize.ts:11`, `web/src/editor/sanitize.test.ts`, `DescriptionEditor.test.tsx`; no Phase 4 flow edits a description |
| issue-page-peek | Space shows a read-only preview card (key, title, status, priority, assignee, feature, sprint, estimate, description) that follows J/K and closes on Esc | stable | UI | 1330d24 | 2026-10-20 | `web/src/issue/PeekCard.tsx:11`, `web/src/issue/PeekCard.test.tsx::Space shows a read-only card: key, title, status · priority · assignee, feature · sprint · estimate, description`, flow `issue-peek` |

## How to get to it (user POV)

1. From any list, board or search result, select a story and press Enter, or click it.
2. Or open http://127.0.0.1:5173/issue/<key> directly.
3. Press Space on a selected row for the preview card, "j" or "k" to move it, Esc to close.
4. Type in "Leave a comment" and press ⌘↵ to post.

## Driving it

Preconditions: baseline, then `rallypoc seed`.

- **issue-page-open**, **issue-page-activity**, **issue-page-comments**, **issue-page-sub-issues**: → `rallypoc browser run issue-page` → PASS: activity in Rally's words, a task created and removed, a comment posted then removed.
- **issue-page-peek**: → `rallypoc browser run issue-peek` → PASS.
- **issue-page-comments** against the proxy: → `rallypoc check api` → `api:comment-round-trip` PASS (created, deleted HTTP 200).
- **issue-page-properties**, **issue-page-description**: not driven from the page.

## Gotchas

- **Task estimates are hours.** Tasks are Rally Tasks, so their estimate is hours, unlike Linear's points (spec §17).
- **Comments on real stories are refused.** The guard answers 403 and the box gets its text back, so a person trying it sees a toast, not a posted comment.

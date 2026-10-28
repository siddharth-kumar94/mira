# Composer

Last verified: f064d7ee53a4 on 2026-10-20 (live)

The "Create story" dialog, in Linear's shape: team chip, title, description and seven chips (status, priority, assignee, feature, estimate, labels, sprint), with "Create more" and "Create story". C opens it from anywhere, the sidebar compose button opens it, and a group's "+" opens it pre-filled. A story always needs a feature (D15), and Rally only makes stories (no defects). Everyone uses it. It lives in `web/src/components/Composer.tsx`. Overall: stable for the create path, beta for the chips that were not driven.

## Sub-features

| ID | What it does | Maturity | Surface | Since | Live | Evidence |
|---|---|---|---|---|---|---|
| composer-open | C opens it on the current team, status Todo inside Active else Backlog, assignee you in My stories | stable | UI | c927fb7 | 2026-10-20 | `web/src/components/Composer.tsx:92`, `Composer.tsx:90`, `web/src/components/Composer.test.tsx::the dialog: team chip, New story, Close; title and description; seven chips; Create more and Create story`, `::typing starts after the [DEMO] prefix: the caret opens at the end of the title`, flow `composer`, dry run scenario 6 |
| composer-project-default | A feature is required; the last feature used for the team is pre-selected until you pick one | stable | UI | 95483a4 | 2026-10-20 | `Composer.tsx:20-40`, `Composer.test.tsx::⌘↵ creates with team, project, description and chips, and remembers the project`, `::a team with no features says so in Rally's words, and only once the team has loaded`, flow `composer`, dry run scenario 6 ("[DEMO] Linear-style Rally client" was pre-selected) |
| composer-create | ⌘↵ or "Create story" posts the story (201); Create stays disabled until the title says something; the new story appears in the list | stable | UI+API | 95483a4 | 2026-10-20 | `Composer.tsx:140`, `Composer.test.tsx::Create stays disabled until the title says something`, `server/tests/test_issue_writes.py::test_create_maps_fields`, flow `composer`, dry run scenario 6 (a story created in the demo team, tagged `collabathon-demo`, removed by `rallypoc seed`) |
| composer-chips | Seven chips open the same pickers as ⌘K (numbers pick, Esc closes the picker before the dialog) | beta (stable pending live) | UI | 95483a4 | 2026-10-20 | `Composer.test.tsx::a chip opens its picker under it; choosing sets the value; numbers pick`, `::Esc closes an open picker first, then the dialog`, `::typing two letters in the assignee list searches the whole workspace (D16)`; flow `composer` reads the status and feature chips only |
| composer-create-more | "Create more" keeps the dialog open with the same team and chips and a fresh title | beta (stable pending live) | UI | 95483a4 | not driven | `Composer.tsx:226`, `Composer.test.tsx::Create more keeps it open with the same team and chips, and a fresh title` |
| composer-prefill | A group's "+" (and a sprint page's "+") pre-fills the group's value, the sprint and its team | beta (stable pending live) | UI | 68a53af | not driven | `web/src/views/model.test.ts::a group's + pre-fills the composer with the group's value`, `Composer.test.tsx::a group's + opens the composer pre-filled`, `::from an ART's cycle page, another team takes its own copy of the cycle; without the key, the cycle is cleared`, `web/src/cycles/CyclePage.test.tsx::a status group's + puts the new issue in this cycle, on the cycle's team` |

## How to get to it (user POV)

1. Press "c" in any list or board, or press the compose button next to the search icon in the sidebar header.
2. Type the title, pick a feature if the pre-selected one is wrong, and press ⌘↵.
3. A group header's "+" opens the same dialog already set to that group.

## Driving it

Preconditions: baseline, then `rallypoc seed`.

- **composer-open**, **composer-project-default**, **composer-create**: → `rallypoc browser run composer` → PASS: Todo, a [DEMO] feature chosen, ⌘↵ answers 201 and the row appears. Then `rallypoc seed`, which removes the created story.
- **composer-chips**, **composer-create-more**, **composer-prefill**: not driven.

## Gotchas

- **Typing used to land in front of the prefix.** Before `c927fb7` the caret opened at position 0, so a person who pressed C and typed got "Title[DEMO] " and a disabled Create button. Flow `composer` hid it because it uses Playwright's `fill`, which replaces the whole value. Fixed; the test is `Composer.test.tsx::typing starts after the [DEMO] prefix`.
- **Every `check ui` run leaves a story** that only `rallypoc seed` removes.

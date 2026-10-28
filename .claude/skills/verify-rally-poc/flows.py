"""Playwright flows for `rallypoc browser run <flow>` (Mira v2, Phase 2). Each drives the real app and raises on failure.

Flows change only [DEMO] items, and the CLI refuses to run them unless the proxy's write guard is on (spec §11)."""
import re
import time
from collections.abc import Callable
from functools import cache

import httpx
from playwright.sync_api import Locator, Page, TimeoutError as PlaywrightTimeout, expect

WEB = "http://127.0.0.1:5173"
FLOWS: dict[str, Callable[[Page], None]] = {}
DEMO_STORY = "Story editor with HTML round-trip"       # seeded: Todo (Defined, in the sprint), owned by you
PEEK_STORY = "My Work view with keyboard navigation"     # seeded: In Progress, with two tasks
BACKLOG = ["Backlog drag-to-rank", "Poll Rally for remote changes", "Bulk move stories to an iteration"]
PRIORITY = re.compile(r"^(Urgent|High|Medium|Low|No priority)$")


def flow(fn: Callable[[Page], None]) -> Callable[[Page], None]:
    FLOWS[fn.__name__.replace("_", "-")] = fn
    return fn


@cache
def bootstrap() -> dict:
    return httpx.get(f"{WEB}/api/bootstrap", timeout=60).json()


@cache
def demo() -> dict:
    b = bootstrap()
    return {"team": b["demo_team_id"], "me": b["me"]["name"]}


def drag(page: Page, source, target) -> None:
    """Pointer drag that dnd-kit recognises: press, move past the 4px threshold, glide to the target, release."""
    source.scroll_into_view_if_needed()  # board columns scroll on their own; the card may sit below the fold
    s, t = source.bounding_box(), target.bounding_box()
    height = page.viewport_size["height"]
    t = {**t, "y": max(t["y"], 0), "height": min(t["height"], height - max(t["y"], 0), 400)}  # aim at the visible part of a tall column
    sx, sy = s["x"] + s["width"] / 2, s["y"] + s["height"] / 2
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 8, sy + 8, steps=3)
    page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, steps=12)
    page.mouse.up()


def is_patch(r) -> bool:
    return "/api/issues/" in r.url and r.request.method == "PATCH"


def display(page: Page) -> None:
    page.get_by_role("button", name="Display options").click()


def team_view(page: Page, tab: str) -> None:
    page.goto(f"{WEB}/team/{demo()['team']}/{tab}")
    page.wait_for_selector('[role="option"]')


@flow
def smoke(page: Page) -> None:
    page.goto(WEB)
    expect(page).to_have_url(re.compile(r"/my/assigned$"))
    nav = page.get_by_role("navigation", name="Main")
    expect(nav.get_by_role("button", name=re.compile("My stories"))).to_be_visible()
    expect(nav.get_by_role("region", name="Your teams").get_by_role("button", name="Stories").first).to_be_visible()


@flow
def my_issues(page: Page) -> None:
    """Scenario 1: your stories across teams, in Focus order; J/K moves a visible selection."""
    page.goto(f"{WEB}/my/assigned")
    rows = page.get_by_role("listbox", name="My stories").get_by_role("option")
    expect(rows.first).to_be_visible()
    teams = set(rows.evaluate_all("els => els.map(e => e.dataset.teamId)"))
    assert len(teams) >= 2, f"My stories shows one team only: {teams}"
    page.keyboard.press("j")
    selected = page.locator('[role="option"][aria-selected="true"]')
    expect(selected).to_have_count(1)
    first = selected.get_attribute("data-issue-id")
    page.wait_for_timeout(300)  # the 150ms background transition
    bg = "e => getComputedStyle(e).backgroundColor"
    other = page.locator('[role="option"][aria-selected="false"]').first
    assert selected.evaluate(bg) != other.evaluate(bg), "selected row looks the same as an unselected row"
    page.keyboard.press("j")
    expect(selected).not_to_have_attribute("data-issue-id", first)
    page.keyboard.press("k")
    expect(selected).to_have_attribute("data-issue-id", first)


@flow
def team_board(page: Page) -> None:
    """Scenario 2: Active as a board; dragging a card to another column changes its status."""
    team_view(page, "active")
    display(page)
    page.get_by_role("tab", name="Board", exact=True).click()
    page.keyboard.press("Escape")
    todo = page.get_by_role("region", name="Todo column")
    progress = page.get_by_role("region", name="In Progress column")
    card = lambda column: column.get_by_role("option", name=re.compile(DEMO_STORY))
    expect(card(todo)).to_be_visible()
    with page.expect_response(is_patch) as moved:
        drag(page, card(todo), progress)
    assert moved.value.status == 200, f"status PATCH returned {moved.value.status}"
    expect(card(progress)).to_be_visible()
    with page.expect_response(is_patch) as back:
        drag(page, card(progress), todo)  # back to Todo; this also sets Ready, which `rallypoc seed` resets
    assert back.value.status == 200, f"restore PATCH returned {back.value.status}"
    expect(card(todo)).to_be_visible()


@flow
def assignee_groups(page: Page) -> None:
    """Scenario 2: group by assignee with empty groups; dragging between groups reassigns, then puts it back."""
    me = demo()["me"]
    page.set_viewport_size({"width": 1280, "height": 2400})  # one group per assignee: "No assignee" is ~2000px below yours
    team_view(page, "active")
    display(page)
    page.get_by_role("button", name=re.compile(r"^Grouping: ")).click()
    page.get_by_role("menuitemcheckbox", name="Assignee").click()
    page.get_by_role("switch", name="Show empty groups").click()
    page.keyboard.press("Escape")
    mine = page.get_by_role("region", name=me, exact=True)
    nobody = page.get_by_role("region", name="No assignee", exact=True)
    row = lambda group: group.get_by_role("option", name=re.compile(DEMO_STORY))
    expect(row(mine)).to_be_visible()
    with page.expect_response(is_patch) as moved:
        drag(page, row(mine), nobody)
    assert moved.value.status == 200, f"assignee PATCH returned {moved.value.status}"
    expect(row(nobody)).to_be_visible()
    with page.expect_response(is_patch) as back:
        drag(page, row(nobody), mine)
    assert back.value.status == 200, f"restore PATCH returned {back.value.status}"
    expect(row(mine)).to_be_visible()


@flow
def backlog_rank(page: Page) -> None:
    """Scenario 3: Backlog in manual order follows Rally's rank; X multi-selects; dragging ranks, then restores."""
    team_view(page, "backlog")
    listbox = page.get_by_role("listbox", name=re.compile(r"backlog$"))
    rows = [listbox.get_by_role("option", name=re.compile(n)) for n in BACKLOG]
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
    page.wait_for_timeout(300)
    assert order() == seeded, f"order not restored: {order()}"


@flow
def palette(page: Page) -> None:
    """⌘K with the selection as context, then P (priority) straight from the keyboard; puts the priority back."""
    team_view(page, "active")
    row = page.get_by_role("option", name=re.compile(DEMO_STORY))
    row.click()
    page.keyboard.press("Meta+k")
    box = page.get_by_placeholder("Type a command or search…")
    expect(box).to_be_visible()
    expect(page.get_by_text(re.compile(r"[·⋅] \[DEMO\] " + re.escape(DEMO_STORY)))).to_be_visible()
    page.keyboard.press("Escape")
    expect(box).to_be_hidden()
    original = row.get_by_role("img", name=PRIORITY).get_attribute("aria-label")
    target = "High" if original != "High" else "Low"
    page.keyboard.press("p")
    with page.expect_response(is_patch) as changed:
        page.keyboard.press({"Urgent": "1", "High": "2", "Medium": "3", "Low": "4", "No priority": "0"}[target])
    assert changed.value.status == 200, f"priority PATCH returned {changed.value.status}"
    expect(row.get_by_role("img", name=target, exact=True)).to_be_visible()
    page.keyboard.press("p")
    with page.expect_response(is_patch) as restored:  # wait for it: closing the page would drop the write
        page.keyboard.press({"Urgent": "1", "High": "2", "Medium": "3", "Low": "4", "No priority": "0"}[original])
    assert restored.value.status == 200, f"restore PATCH returned {restored.value.status}"
    page.keyboard.press("Meta+k")
    box.fill("Backlog drag")
    expect(page.get_by_role("option", name=re.compile(r"Backlog drag-to-rank"))).to_be_visible()
    page.keyboard.press("Escape")


@flow
def composer(page: Page) -> None:
    """C in a team view: that team, Todo, a [DEMO] feature chosen; ⌘↵ creates (`rallypoc seed` removes it)."""
    team_view(page, "active")
    page.keyboard.press("c")
    title = page.get_by_label("Story title")
    expect(title).to_have_value("[DEMO] ")
    expect(page.get_by_role("button", name=re.compile(r"^Change status"))).to_contain_text("Todo")
    expect(page.get_by_role("button", name=re.compile(r"^Change feature"))).not_to_contain_text("Feature")
    title.fill("[DEMO] Composer flow check")
    with page.expect_response(lambda r: r.url.endswith("/api/issues") and r.request.method == "POST") as created:
        page.keyboard.press("Meta+Enter")
    assert created.value.status == 201, f"create returned {created.value.status}"
    expect(page.get_by_role("option", name=re.compile("Composer flow check")).first).to_be_visible()


@flow
def issue_peek(page: Page) -> None:
    """Space peeks the selected story as a read-only card; J moves it with the selection; Esc closes."""
    page.goto(f"{WEB}/my/assigned")
    row = page.get_by_role("option", name=re.compile(PEEK_STORY))
    row.click()
    page.keyboard.press(" ")
    card = page.get_by_role("complementary", name="Story preview")
    expect(card).to_contain_text(PEEK_STORY)
    expect(card.locator("input, textarea, [contenteditable]")).to_have_count(0)
    page.keyboard.press("j")
    expect(card).to_be_visible()
    page.keyboard.press("Escape")
    expect(card).to_be_hidden()


@flow
def issue_page(page: Page) -> None:
    """Enter opens the page: activity in Linear's words, a task round trip, and a comment posted then removed."""
    page.goto(f"{WEB}/my/assigned")
    page.get_by_role("option", name=re.compile(PEEK_STORY)).click()
    page.keyboard.press("Enter")
    expect(page.get_by_role("heading", name="Activity")).to_be_visible()
    feed = page.get_by_role("region", name="Activity")
    verbs = ("created the story", "changed status", "moved to", "assigned to", "unassigned", "set priority", "removed the priority",
             "removed from", "set estimate", "removed the estimate", "added label", "removed label", "changed the title",
             "updated the description", "marked as")
    events = feed.locator('[data-activity="event"]')
    expect(events.first, "the demo story has no activity events; the flow would pass vacuously").to_be_visible()
    for i in range(events.count()):
        line = events.nth(i).inner_text()
        assert not re.search(r"(changed from|added|removed) \[|\b[A-Z]{3,}( [A-Z]+)* (changed|added|removed)\b", line), f"Rally wording in an event: {line!r}"
        assert any(v in line for v in verbs), f"event is not in Linear's words: {line!r}"
    task = page.get_by_role("checkbox", name=re.compile(r"^Complete TA")).first
    before = task.is_checked()
    is_sub = lambda r: "/api/sub-issues/" in r.url and r.request.method == "PATCH"
    with page.expect_response(is_sub) as first:
        task.click()
    assert first.value.status == 200, f"task PATCH returned {first.value.status}"
    with page.expect_response(is_sub):
        task.click()
    expect(task).to_be_checked(checked=before)
    box = page.get_by_role("textbox", name="Leave a comment")
    box.fill("[DEMO] flow comment")
    with page.expect_response(lambda r: r.url.endswith("/comments") and r.request.method == "POST") as posted:
        box.press("Meta+Enter")
    assert posted.value.status == 201, f"comment POST returned {posted.value.status}"
    try:
        expect(feed.get_by_text("[DEMO] flow comment")).to_be_visible()
    finally:  # leave no residue
        removed = httpx.delete(f"{WEB}/api/comments/{posted.value.json()['id']}", timeout=60)
    assert removed.status_code == 200, f"comment DELETE returned {removed.status_code}"


@flow
def focus(page: Page) -> None:
    """Scenario 1 (D28): My stories in Focus order, each team's sprint its own group (named with its team)."""
    page.goto(f"{WEB}/my/assigned")
    listbox = page.get_by_role("listbox", name="My stories")
    expect(listbox.get_by_role("option").first).to_be_visible()
    labels = listbox.get_by_role("region").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    assert labels, "no groups rendered"
    order = ["Urgent stories", "PI ", "Other active", "Backlog", "Completed"]

    def rank(label: str) -> int:
        for i, o in enumerate(order):
            if label.startswith(o) or (o == "PI " and " · " in label):
                return i
        raise AssertionError(f"unknown Focus group {label!r}; expected one of {order}")

    ranks = [rank(label) for label in labels]
    assert ranks == sorted(ranks), f"groups out of Focus order: {labels}"
    sprints = [l for l in labels if " · " in l]
    assert all(l.count(" · ") >= 2 for l in sprints), f"sprint groups must name their team: {sprints}"
    expect(page.get_by_role("button", name=re.compile(r"^Grouping: |^Display options"))).to_be_visible()


# ---------- Phase 4: sprints, features, capabilities, settings ----------
DEMO_PROJECT = "[DEMO] Linear-style Rally client"      # seeded: a Feature with an update, target in the future, six stories
OVERRUN_PROJECT = "[DEMO] Rally sync reliability"      # seeded: target a week ago, so its bar overruns
DEMO_INITIATIVE = "[DEMO] Collabathon Rally client POC"  # seeded: the Capability above both
LOAD = 45_000  # ms: the portfolio reads take 3-10 s and sometimes more (Rally answers them in pages)


@cache
def portfolio() -> dict:
    """The [DEMO] features and capability, by name (read-only), so flows can target them by id and key."""
    d = httpx.get(f"{WEB}/api/projects?teams={demo()['team']}", timeout=60).json()
    i = httpx.get(f"{WEB}/api/initiatives?teams={demo()['team']}", timeout=60).json()
    projects = {p["name"]: p for p in d["projects"] if p["name"].startswith("[DEMO] ")}
    initiatives = {x["name"]: x for x in i["initiatives"] if x["name"].startswith("[DEMO] ")}
    for name in (DEMO_PROJECT, OVERRUN_PROJECT):
        assert name in projects, f"seeded feature {name!r} is missing; run `rallypoc seed`"
    assert DEMO_INITIATIVE in initiatives, f"seeded capability {DEMO_INITIATIVE!r} is missing; run `rallypoc seed`"
    return {"projects": projects, "initiative": initiatives[DEMO_INITIATIVE]}


def set_layout(page: Page, layout: str) -> None:
    """The features' Display popover: pick List, Board or Timeline, then close the popover."""
    page.get_by_role("button", name="Display options").click()
    page.get_by_role("dialog", name="Display options").get_by_role("tab", name=layout, exact=True).click()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog", name="Display options")).to_be_hidden()


def burnup_shown(where: Locator, label: str) -> None:
    """Spec §19.9: the burn-up drew, or (ruling 15) its space says "Burn-up unavailable". Lookback can take seconds."""
    chart = where.get_by_role("img", name="Burn-up chart").or_(where.get_by_text("Burn-up unavailable", exact=True))
    expect(chart.first, f"{label}: no burn-up and no \"Burn-up unavailable\"").to_be_visible(timeout=LOAD)


@flow
def cycles(page: Page) -> None:
    """The demo team's Sprints: a Current row (with its burn-up) opens the sprint page, whose panel has the burn-up and
    breakdown tabs that all show a list."""
    page.goto(f"{WEB}/team/{demo()['team']}/cycles")
    current = page.get_by_role("link", name=re.compile(r"\bCurrent\b")).first
    expect(current).to_be_visible()
    expect(current).to_contain_text("PI ")
    burnup_shown(current, "the current sprint row")
    current.click()
    expect(page).to_have_url(re.compile(rf"/team/{demo()['team']}/cycles/\d+$"))
    panel = page.get_by_role("complementary", name="Sprint details")
    expect(panel).to_be_visible()
    burnup_shown(panel.get_by_role("region", name="Progress"), "the sprint panel")
    expect(page.get_by_role("option", name=re.compile(r"\[DEMO\]")).first).to_be_visible()
    tabs = panel.get_by_role("tablist", name="Breakdown").get_by_role("tab")
    names = [t.strip() for t in tabs.all_inner_texts()]
    assert names[:4] == ["Assignees", "Labels", "Priority", "Features"], f"breakdown tabs: {names}"  # a fifth, Teams, is for ARTs
    for name in names:
        panel.get_by_role("tab", name=name, exact=True).click()
        expect(panel.get_by_role("tab", name=name, exact=True)).to_have_attribute("aria-selected", "true")
        shown = panel.get_by_role("tabpanel", name=name)
        expect(shown).to_be_visible()
        expect(shown.locator("li, p").first, f"the {name} tab is empty").to_be_visible()


@flow
def projects(page: Page) -> None:
    """Workspace Features as List, Board, then Timeline: the [DEMO] features show in each, one overruns; Show PIs draws bands."""
    p = portfolio()["projects"]
    page.goto(f"{WEB}/projects")
    expect(page.get_by_role("group", name="Features timeline")).to_be_visible(timeout=LOAD)  # Timeline is the default
    set_layout(page, "List")
    listing = page.get_by_role("group", name="Features", exact=True)
    for name in (DEMO_PROJECT, OVERRUN_PROJECT):
        expect(listing.get_by_role("link", name=re.compile(re.escape(name))).first).to_be_visible()
    set_layout(page, "Board")
    board = page.get_by_role("group", name="Features board")
    for name in (DEMO_PROJECT, OVERRUN_PROJECT):
        expect(board.get_by_role("link", name=re.compile(re.escape(name))).first).to_be_visible()
    set_layout(page, "Timeline")
    timeline = page.get_by_role("group", name="Features timeline")
    row = lambda name: timeline.locator(f'[data-project="{p[name]["id"]}"]')
    for name in (DEMO_PROJECT, OVERRUN_PROJECT):
        expect(row(name).get_by_text(name, exact=True).first).to_be_attached()
    expect(row(OVERRUN_PROJECT).locator('[data-part="overrun"]')).to_have_count(1)
    expect(row(DEMO_PROJECT).locator('[data-part="overrun"]')).to_have_count(0)
    page.get_by_role("button", name="Display options").click()
    pis = page.get_by_role("switch", name="Show PIs")
    expect(pis).to_have_attribute("aria-checked", "false")
    try:
        pis.click()
        expect(pis).to_have_attribute("aria-checked", "true")
        expect(timeline.locator('[data-part="pi-band"]').first).to_be_attached()
    finally:
        if pis.get_attribute("aria-checked") == "true":
            pis.click()
    expect(timeline.locator('[data-part="pi-band"]')).to_have_count(0)


def sweep_updates(key: str, marker: str) -> list[int]:
    """Delete every update on a [DEMO] feature whose text carries the flow's marker (and so is not seed data)."""
    gone = []
    for u in httpx.get(f"{WEB}/api/projects/{key}", timeout=60).json()["updates"]:
        if marker in u["html"]:
            assert httpx.delete(f"{WEB}/api/comments/{u['id']}", timeout=60).status_code == 200, f"update {u['id']} was left behind"
            gone.append(u["id"])
    return gone


@flow
def project_update(page: Page) -> None:
    """Post an At risk update from the feature's Activity; the list chip says At risk; delete it and the chip reverts."""
    project = portfolio()["projects"][DEMO_PROJECT]
    key, marker = project["key"], "[DEMO] flow update"
    page.goto(f"{WEB}/project/{key}/activity")
    form = page.get_by_role("form", name="Feature update")
    expect(form).to_be_visible()
    chip = lambda: page.get_by_role("link", name=re.compile(re.escape(DEMO_PROJECT))).first.get_by_role("button", name=re.compile(r"health|Click to"))
    before = project["health"]["value"]
    try:
        form.get_by_role("button", name="Set feature health").click()
        page.get_by_role("menuitem", name="At risk").click()
        form.get_by_role("textbox", name="Feature update").fill(marker)
        with page.expect_response(lambda r: r.url.endswith(f"/api/projects/{key}/updates") and r.request.method == "POST") as posted:
            form.get_by_role("button", name="Submit update").click()
        assert posted.value.status == 201, f"update POST returned {posted.value.status}"
        expect(page.get_by_role("article", name="Feature update").first).to_contain_text(marker)
        page.goto(f"{WEB}/projects")
        set_layout(page, "List")
        expect(chip()).to_contain_text("At risk", timeout=LOAD)
    finally:
        removed = sweep_updates(key, marker)
    assert removed, "the posted update was not found to delete"
    page.goto(f"{WEB}/projects")
    set_layout(page, "List")
    expect(chip()).to_contain_text("On track", timeout=LOAD)
    expect(chip()).not_to_contain_text("At risk")
    now = httpx.get(f"{WEB}/api/projects?teams={demo()['team']}", timeout=60).json()["projects"]
    assert next(x["health"]["value"] for x in now if x["id"] == project["id"]) == before, "health did not revert after the delete"


@flow
def project_across_teams(page: Page) -> None:
    """The [DEMO] feature's Stories tab lists its [DEMO] stories under their status groups."""
    key = portfolio()["projects"][DEMO_PROJECT]["key"]
    page.goto(f"{WEB}/project/{key}")
    page.get_by_role("tab", name="Stories", exact=True).click()
    expect(page).to_have_url(re.compile(rf"/project/{key}/issues$"))
    rows = page.get_by_role("option", name=re.compile(r"\[DEMO\]"))
    expect(rows.first).to_be_visible()
    stories = httpx.get(f"{WEB}/api/projects/{key}", timeout=60).json()["issues"]
    assert rows.count() == len(stories), f"{rows.count()} rows for {len(stories)} stories"
    wanted = {"backlog": "Backlog", "todo": "Todo", "in_progress": "In Progress", "in_review": "In Review", "done": "Done"}
    for status in {s["status"] for s in stories}:
        expect(page.get_by_role("region", name=re.compile(rf"^{wanted[status]}\b")).first, f"no {wanted[status]} group").to_be_visible()


@flow
def initiatives(page: Page) -> None:
    """Capabilities › All shows the [DEMO] capability with "n / total" and health pills; its page has the three tabs."""
    i = portfolio()["initiative"]
    page.goto(f"{WEB}/initiatives")
    page.get_by_role("tab", name="All capabilities", exact=True).click()
    row = page.get_by_role("link", name=re.compile(re.escape(DEMO_INITIATIVE))).first
    expect(row).to_be_visible(timeout=LOAD)
    done = 0  # nothing in the demo capability is completed
    expect(row.get_by_role("button", name=re.compile(rf"^{done} of {i['project_count']} features? completed"))).to_be_visible()
    expect(row).to_contain_text(re.compile(rf"{done}\s*/\s*{i['project_count']}"))
    pills = lambda r: r.get_by_role("button", name=re.compile(r"Click to open updates"))
    # The pills count the capability's started features by health; the seeded features are not started, so it has none.
    assert pills(row).count() == len(set(i["project_health"])), f"{pills(row).count()} pills for {i['project_health']}"
    assert pills(page.get_by_role("link")).count() >= 1, "no capability on the page shows a health pill"
    row.click()
    expect(page).to_have_url(re.compile(rf"/initiative/{i['key']}"))
    tabs = page.get_by_role("tablist", name="Capability")
    assert [t.strip() for t in tabs.get_by_role("tab").all_inner_texts()] == ["Overview", "Activity", "Features"]
    for name, suffix in (("Activity", "/activity"), ("Features", "/projects"), ("Overview", "")):
        tabs.get_by_role("tab", name=name, exact=True).click()
        expect(tabs.get_by_role("tab", name=name, exact=True)).to_have_attribute("aria-selected", "true")
        expect(page).to_have_url(re.compile(rf"/initiative/{i['key']}{suffix}$"))


@flow
def settings(page: Page) -> None:
    """Preferences shows Demo mode; the theme select flips data-theme and is put back; Teams lists the demo team."""
    page.goto(f"{WEB}/settings/preferences")
    expect(page.get_by_text("Demo mode")).to_be_visible()
    html = page.locator("html")
    original = html.get_attribute("data-theme") or "light"
    other = "Dark" if original == "light" else "Light"
    try:
        page.get_by_role("button", name=re.compile(r"^Interface theme: ")).click()
        page.get_by_role("menuitemcheckbox", name=other).click()
        expect(html).to_have_attribute("data-theme", other.lower())
    finally:
        page.get_by_role("button", name=re.compile(r"^Interface theme: ")).click()
        page.get_by_role("menuitemcheckbox", name=original.capitalize()).click()
    expect(html).to_have_attribute("data-theme", original)
    page.goto(f"{WEB}/settings/teams")
    expect(page.get_by_role("button", name=re.compile(r"^Data Services")).first).to_be_visible()


@flow
def connect(page: Page) -> None:
    """Settings › Account › Change key with an invalid key: Rally rejects it and Mira stays connected. Never Disconnect."""
    page.goto(f"{WEB}/settings/account")
    page.get_by_role("button", name="Change key").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_role("heading", name="Connect Mira to Rally")).to_be_visible()
    dialog.get_by_label("Rally API key").fill("not-a-key")
    with page.expect_response(lambda r: r.url.endswith("/api/session") and r.request.method == "POST") as tried:
        dialog.get_by_role("button", name="Connect").click()
    assert tried.value.status == 401, f"POST /api/session returned {tried.value.status}"
    expect(dialog.get_by_role("alert")).to_have_text("Rally rejected that key")
    assert httpx.get(f"{WEB}/api/session", timeout=60).json()["connected"] is True, "the proxy lost its session"
    page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    expect(page.get_by_text(re.compile(r"^Connected as "))).to_be_visible()


# ---------- Rally's words: the chrome carries no Linear word ----------
BANNED = re.compile(r"\b(sub-issues?|issues?|cycles?|projects?|initiatives?)\b", re.I)  # the web vocabulary helper's list (web/src/test/vocabulary.ts)
# Every text node and the aria-label, title, placeholder and alt of each element at or under the roots.
SCAN_JS = """roots => {
  const out = [];
  const visit = (n) => {
    if (n.nodeType === 3) {
      const t = (n.textContent || "").trim();
      if (t) out.push({where: "text", text: t});
    } else if (n.nodeType === 1) {
      const tag = n.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return;
      for (const a of ["aria-label", "title", "placeholder", "alt", "aria-description"]) {
        const v = (n.getAttribute(a) || "").trim();
        if (v) out.push({where: `<${tag}> ${a}`, text: v});
      }
      n.childNodes.forEach(visit);
    }
  };
  roots.forEach(visit);
  return out;
}"""
DISPLAY_DIALOG = '[role="dialog"][aria-label="Display options"]'
FILTER_MENU = '[role="menu"][aria-label="Filter"]'
GROUPING_MENU = '[role="menu"][aria-label="Grouping"]'


def chrome(page: Page, where: str, selector: str, *, has=(), data=(), allow=()) -> None:
    """Fail unless `selector` matches, holds exactly the `has` texts (so the scan looked at the right element, not an empty
    one), and none of its text or labels carries a Linear word. `data` names (teams, a feature) are blanked first, since the
    chrome shows them; `allow` is whole texts that may read as a banned word (the Capability list's "Initiative" grouping)."""
    roots = page.locator(selector)
    expect(roots.first, f"{where}: nothing on the page matches {selector!r}").to_be_visible(timeout=LOAD)
    deadline = time.monotonic() + LOAD / 1000
    while True:  # a page can show its frame before its contents: wait for the expected texts
        items = roots.evaluate_all(SCAN_JS)
        texts = {i["text"] for i in items}
        missing = [h for h in has if h not in texts]
        if (items and not missing) or time.monotonic() > deadline:
            break
        page.wait_for_timeout(250)
    assert items, f"{where}: {selector!r} matched but holds no text or labels, so there is nothing to check"
    assert not missing, f"{where}: {selector!r} lacks {missing}; found {sorted(texts)[:25]}"
    names = sorted((n for n in data if n), key=len, reverse=True)
    bad = []
    for i in items:
        if i["text"] in allow:
            continue
        text = i["text"]
        for n in names:
            text = text.replace(n, " ")
        hits = [m.group(0) for m in BANNED.finditer(text)]
        if hits:
            bad.append(f"  {i['where']}: {i['text']!r} ({', '.join(hits)})")
    assert not bad, f"{where}: Linear words in the chrome:\n" + "\n".join(bad)


def press(target: Locator, step: str) -> None:
    """Click, and on failure say which step could not be done (a bare Playwright timeout does not)."""
    try:
        target.click(timeout=15_000)
    except PlaywrightTimeout as e:
        raise AssertionError(f"could not click {step}: {str(e).splitlines()[0]}") from e


def dismiss(page: Page, popup: str, button: Locator) -> None:
    """Close a Display or Filter popover: Esc, and the toggle button if Esc left it open (clicking first could reopen it)."""
    page.keyboard.press("Escape")
    try:
        expect(page.locator(popup)).to_have_count(0, timeout=1500)
    except AssertionError:
        press(button, f"the toggle to close {popup}")
        expect(page.locator(popup)).to_have_count(0)


def menus(page: Page, where: str, *, data=(), allow=(), grouping: bool = False) -> None:
    """Open Display options, then Add filter, and check each open popover. `grouping` also opens the Grouping dropdown."""
    for name, popup, label in (("Display options", DISPLAY_DIALOG, "Display menu"), ("Add filter", FILTER_MENU, "Filter menu")):
        button = page.get_by_role("button", name=name, exact=True)
        expect(button, f"{where}: no {name!r} button").to_be_visible(timeout=LOAD)
        press(button, f"{where}: the {name!r} button")
        # `allow` (the Initiative grouping) is for the Display dialog and its Grouping menu only; the Filter menu never gets it.
        chrome(page, f"{where}: {label}", popup, data=data, allow=allow if popup == DISPLAY_DIALOG else ())
        if grouping and popup == DISPLAY_DIALOG:
            press(page.get_by_role("button", name=re.compile(r"^Grouping: ")), f"{where}: the Grouping dropdown")
            chrome(page, f"{where}: Grouping choices", GROUPING_MENU, data=data, allow=allow)
            page.keyboard.press("Escape")
        dismiss(page, popup, button)


def wait_teams(nav: Locator) -> None:
    """The nav's buttons render before the team list does: wait for a team toggle (or the "No teams yet" note) once sections are open."""
    team = nav.locator('li > div > button[aria-expanded]').or_(nav.get_by_text("No teams yet."))
    expect(team.first, "the sidebar never showed its teams").to_be_visible(timeout=LOAD)


def open_nav(page: Page) -> list[str]:
    """Expand the sidebar sections and teams so every nav label is on the page; returns the toggles it opened."""
    nav = page.locator('nav[aria-label="Main"]')
    expect(nav.get_by_role("button", name="My stories")).to_be_visible(timeout=LOAD)
    opened: list[str] = []
    for selector in ('section > button[aria-expanded="false"]', 'li > div > button[aria-expanded="false"]'):  # sections, then the teams inside
        if selector.startswith("li"):
            wait_teams(nav)  # the sections are open now; the team list loads separately from the nav frame
        shut = nav.locator(selector)
        for _ in range(20):
            if not shut.count():
                break
            opened.append(shut.first.inner_text().strip())
            press(shut.first, f"the sidebar toggle {opened[-1]!r}")
    return opened


def close_nav(page: Page, opened: list[str]) -> None:
    """Put the sidebar toggles `open_nav` opened back as the user had them (the collapse state is saved in the browser)."""
    nav = page.locator('nav[aria-label="Main"]')
    expect(nav.get_by_role("button", name="My stories")).to_be_visible(timeout=LOAD)
    wait_teams(nav)
    for text in reversed(opened):  # teams were opened last; collapsing a section first would hide their toggles
        open_now = nav.locator('section > button[aria-expanded="true"], li > div > button[aria-expanded="true"]')
        toggle = open_now.filter(has_text=re.compile(rf"^\s*{re.escape(text)}\s*$"))
        if toggle.count():
            press(toggle.first, f"the sidebar toggle {text!r} (restoring it)")


@flow
def vocabulary(page: Page) -> None:
    """Spec D39: the chrome (sidebar, header or breadcrumb, tab strip, column headers, open Display and Filter menus) of My
    stories, a team's Stories, Sprints and Features (list, board, timeline), a feature, Capabilities, a capability and
    Settings › Preferences carries none of: sub-issue, issue, cycle, project, initiative. Data rows are not scanned."""
    team, me = demo()["team"], demo()["me"]
    b = bootstrap()
    data = [b["workspace"]["name"], me, *(t["name"] for t in b["teams"])]
    feature = next(iter(httpx.get(f"{WEB}/api/projects?teams={team}", timeout=60).json()["projects"]), None)
    assert feature, "the demo team has no feature to open; the feature page would go unchecked"
    capability = next((c for c in httpx.get(f"{WEB}/api/initiatives?teams={team}", timeout=60).json()["initiatives"] if c["project_count"] > 0), None)
    assert capability, "no capability with a feature under it; the capability page would go unchecked"
    opened: list[str] = []

    def scan(where: str, *, header, tabs=(), columns=False, extra=()) -> None:
        d = [*data, *extra]
        chrome(page, f"{where}: sidebar", 'nav[aria-label="Main"]', data=d,
               has=["My stories", "Workspace", "Your teams", "Capabilities", "Features", "Stories", "Sprints"])
        chrome(page, f"{where}: header", "main header", has=header, data=d)
        if tabs:
            chrome(page, f"{where}: tab strip", 'main [role="tablist"]', has=tabs, data=d)
        if columns:
            chrome(page, f"{where}: column headers", 'main [role="columnheader"]', has=["Name"], data=d)

    def visit(where: str, path: str, **kw) -> None:
        page.goto(f"{WEB}{path}")
        opened.extend(open_nav(page))
        scan(where, **kw)

    def features(where: str, path: str) -> None:
        """A Features page in each layout; the layout it started in is put back."""
        visit(where, path, header=["Features"], tabs=["All features"])
        press(page.get_by_role("button", name="Display options", exact=True), f"{where}: the Display options button")
        original = page.locator(DISPLAY_DIALOG).get_by_role("tab", selected=True).inner_text().strip()
        assert original in ("List", "Board", "Timeline"), f"{where}: cannot tell which layout is showing ({original!r})"
        dismiss(page, DISPLAY_DIALOG, page.get_by_role("button", name="Display options", exact=True))
        current = original

        def show(layout: str) -> None:
            """Switch layouts, but never click the tab already showing: in Timeline the toolbar's Today and Year controls
            sit over the popover's Timeline tab, so that click cannot land (and is not needed)."""
            nonlocal current
            if layout != current:
                try:
                    set_layout(page, layout)
                except PlaywrightTimeout as e:
                    raise AssertionError(f"{where}: could not switch from {current} to {layout}: {str(e).splitlines()[0]}") from e
                current = layout

        try:
            for layout in ("List", "Board", "Timeline"):
                show(layout)
                scan(f"{where} ({layout})", header=["Features"], tabs=["All features"], columns=layout == "List")
                menus(page, f"{where} ({layout})", data=data)
        finally:
            show(original)

    try:
        visit("My stories", "/my/assigned", header=["My stories"], tabs=["Assigned", "Created"])
        menus(page, "My stories", data=data)
        visit("Stories", f"/team/{team}/active", header=["Stories"], tabs=["Active", "Backlog", "All stories"])
        menus(page, "Stories", data=data)
        visit("Sprints", f"/team/{team}/cycles", header=["Sprints"])
        features("Team features", f"/team/{team}/projects")
        features("Workspace features", "/projects")

        visit("Feature", f"/project/{feature['key']}", header=["Copy page URL"], tabs=["Overview", "Activity", "Stories"], extra=[feature["name"]])
        press(page.get_by_role("tablist", name="Feature").get_by_role("tab", name="Stories", exact=True), "the feature's Stories tab")
        expect(page).to_have_url(re.compile(rf"/project/{feature['key']}/issues$"))
        scan("Feature stories", header=["Copy page URL"], tabs=["Overview", "Activity", "Stories"], extra=[feature["name"]])
        menus(page, "Feature stories", data=[*data, feature["name"]])

        visit("Capabilities", "/initiatives", header=["Capabilities"], tabs=["Active", "Planned", "All capabilities"])
        press(page.get_by_role("tab", name="All capabilities", exact=True), "the All capabilities tab")  # Active may be empty, and an empty list has no column headers
        chrome(page, "Capabilities: column headers", 'main [role="columnheader"]', has=["Name"], data=data)
        menus(page, "Capabilities", data=data, allow={"Initiative", "Grouping: Initiative"}, grouping=True)  # the Program grouping option is the one allowed use

        visit("Capability", f"/initiative/{capability['key']}", header=["Copy page URL"], tabs=["Overview", "Activity", "Features"], extra=[capability["name"]])
        press(page.get_by_role("tablist", name="Capability").get_by_role("tab", name="Features", exact=True), "the capability's Features tab")
        expect(page).to_have_url(re.compile(rf"/initiative/{capability['key']}/projects$"))
        scan("Capability features", header=["Copy page URL"], tabs=["Overview", "Activity", "Features"], columns=True, extra=[capability["name"]])
        menus(page, "Capability features", data=[*data, capability["name"]])

        page.goto(f"{WEB}/settings/preferences")
        chrome(page, "Settings: nav", 'nav[aria-label="Settings"]', has=["Back to app", "Personal", "Preferences", "Administration"], data=data)
        chrome(page, "Settings: Preferences", "main", has=["Preferences", "Interface theme"], data=data)
    finally:
        if opened:
            page.goto(f"{WEB}/my/assigned")
            close_nav(page, opened)

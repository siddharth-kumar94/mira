from datetime import date

import pytest

from app.domain import Comment, Project, User
from app.pm import auto_health, format_update, initiative_health, project_health, split_posts, update_from_comment

DANA = User(id=501, name="Dana Demo")


def post(html: str, pid: int = 1) -> Comment:
    return Comment(id=pid, author=DANA, html=html, created_at="2026-10-16T09:00:00.000Z")


def test_update_round_trip():
    html = format_update("at_risk", "<p>Waiting on the vendor.</p>", 0.37, "2027-01-01")
    assert html == ("<p><b>Mira update · At risk</b></p><p>Waiting on the vendor.</p>"
                    "<p><i>progress 37% · target 2027-01-01</i></p>")
    u = update_from_comment(post(html))
    assert (u.health, u.html, u.progress, u.target) == ("at_risk", "<p>Waiting on the vendor.</p>", 0.37, "2027-01-01")


def test_update_parse_tolerates_rally_rewriting_html():
    html = ("<p><strong>Mira update &middot; Off track</strong></p><p>Late.</p><br>"
            "<p><em>progress 5% &middot; target none</em></p>")
    u = update_from_comment(post(html))
    assert (u.health, u.html, u.progress, u.target) == ("off_track", "<p>Late.</p><br>", 0.05, None)


def test_update_without_footer_and_plain_comments():
    u = update_from_comment(post("<p><b>Mira update · On track</b></p><p>Fine</p>"))
    assert u.health == "on_track" and u.progress is None and u.target is None
    assert update_from_comment(post("<p>Mira update · On track</p>")) is None  # not bold: a plain comment
    assert update_from_comment(post("<p>Looks good</p>")) is None


def test_split_posts_keeps_order():
    posts = [post(format_update("on_track", "", 0.5, None), 3), post("<p>c</p>", 2), post(format_update("at_risk", "", 0.4, None), 1)]
    updates, comments = split_posts(posts)
    assert [u.id for u in updates] == [3, 1] and [c.id for c in comments] == [2]


TODAY = date(2026, 10, 16)


@pytest.mark.parametrize("kw, value, reason", [
    (dict(target=None), "no_target", "No planned end date"),
    (dict(target="2026-10-01"), "off_track", "Past its target date (2026-10-01)"),
    (dict(target="2026-10-01", done=True), "on_track", "Done"),
    (dict(start="2026-09-01", target="2026-11-01", progress=0.10), "at_risk", "10% done with 74% of the time gone"),
    (dict(start="2026-09-01", target="2026-11-01", progress=0.60), "on_track", "On track"),
    (dict(target="2026-12-31", blocked=2), "at_risk", "2 blocked stories"),
    (dict(target="2026-12-31", blocked=1), "at_risk", "1 blocked story"),
    (dict(target="2026-12-31", risk=True), "at_risk", "Flagged with an open risk"),
    (dict(target="2026-12-31"), "on_track", "On track"),
])
def test_auto_health(kw, value, reason):
    args = dict(target=None, start=None, today=TODAY, done=False, progress=0.0, blocked=0, risk=False) | kw
    h = auto_health(**args)
    assert (h.value, h.source, h.reason) == (value, "auto", reason)


def project(**over) -> Project:
    base = dict(id=201, key="F201", name="[DEMO] A", status_name="Current PI", status_category="started", lead=None,
                start="2026-09-01", target="2026-12-31", progress=0.4, issue_count=1, done_count=0, points=1,
                done_points=0, pi_id=None, initiative_id=251, team_id=9001, risk=False, updated_at="x")
    return Project(**(base | over))


def test_reported_health_wins_over_auto():
    latest = update_from_comment(post(format_update("off_track", "", 0.4, "2026-12-31")))
    h = project_health(project(), today=TODAY, blocked=0, latest=latest)
    assert (h.value, h.source, h.reason) == ("off_track", "update", "Reported 2026-10-16")
    assert project_health(project(), today=TODAY, blocked=0, latest=None).source == "auto"


def test_initiative_health():
    assert initiative_health(None, []).value == "no_target"
    h = initiative_health(None, ["on_track", "off_track", "at_risk"])
    assert (h.value, h.source, h.reason) == ("off_track", "auto", "Worst of 3 active features")
    latest = update_from_comment(post(format_update("on_track", "", 0.5, None)))
    assert initiative_health(latest, ["off_track"]).value == "on_track"

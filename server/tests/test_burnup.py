from datetime import date

import pytest

from app.burnup import series
from app.domain import BadRequest, Snapshot
from datetime import datetime, timezone
from app.rally.client import RallyError
from tests.adapter_kit import NOW, make_adapter, standard
from tests.fake_client import FakeClient
from tests.fixtures import ART_ID, WORKSPACE_ID, rally_feature, rally_iteration, rally_team

OPEN = "9999-01-01T00:00:00.000Z"


def snap(oid, estimate, state, frm, to=OPEN):
    return {"ObjectID": oid, "PlanEstimate": estimate, "ScheduleState": state,
            "_ValidFrom": f"2026-10-{frm}.000Z" if isinstance(frm, str) else frm,
            "_ValidTo": f"2026-10-{to}.000Z" if to != OPEN else OPEN}


def dom(oid, points, status, frm, to=None):
    stamp = lambda t: None if t is None else datetime.fromisoformat(f"2026-10-{t}.000+00:00")
    return Snapshot(id=oid, valid_from=stamp(frm), valid_to=stamp(to), points=points, status=status)


def lines(points):
    return [p.scope for p in points], [p.started for p in points], [p.completed for p in points]


def test_a_story_added_started_then_accepted():
    snapshots = [dom(1, 3, "todo", "02T09:00:00", "03T10:00:00"), dom(1, 3, "in_progress", "03T10:00:00", "04T15:00:00"),
                 dom(1, 3, "in_review", "04T15:00:00", "05T11:00:00"), dom(1, 3, "done", "05T11:00:00")]
    points = series(snapshots, date(2026, 10, 1), date(2026, 10, 5), date(2026, 10, 20))
    assert [p.day for p in points] == [f"2026-10-0{d}" for d in range(1, 6)]
    assert lines(points) == ([0, 3, 3, 3, 3], [0, 0, 3, 3, 0], [0, 0, 0, 0, 3])


def test_a_reestimate_changes_scope_from_that_day():
    snapshots = [dom(1, 3, "todo", "01T08:00:00", "03T08:00:00"), dom(1, 5, "todo", "03T08:00:00"), dom(2, 0, "todo", "01T08:00:00")]
    assert lines(series(snapshots, date(2026, 10, 1), date(2026, 10, 4), date(2026, 10, 4)))[0] == [3, 3, 5, 5]


def test_a_snapshot_closed_within_one_day_is_never_seen_at_a_day_end():
    snapshots = [dom(1, 8, "todo", "02T08:00:00", "02T09:00:00")]
    assert lines(series(snapshots, date(2026, 10, 1), date(2026, 10, 3), date(2026, 10, 3)))[0] == [0, 0, 0]


def test_points_stop_at_today_and_at_the_end():
    snapshots = [dom(1, 2, "todo", "01T00:00:00")]
    assert len(series(snapshots, date(2026, 10, 1), date(2026, 10, 14), date(2026, 10, 4))) == 4
    assert len(series(snapshots, date(2026, 10, 1), date(2026, 10, 3), date(2026, 10, 20))) == 3


def test_a_cycle_that_has_not_started_has_no_points():
    assert series([dom(1, 2, "todo", "01T00:00:00")], date(2026, 10, 10), date(2026, 10, 20), date(2026, 10, 9)) == []


def test_other_statuses_count_in_scope_only():
    snapshots = [dom(1, 2, "backlog", "01T00:00:00"), dom(2, 4, "in_progress", "01T00:00:00")]
    assert lines(series(snapshots, date(2026, 10, 1), date(2026, 10, 1), date(2026, 10, 1))) == ([6], [4], [0])


def test_snapshot_from_rally_reads_state_estimate_and_open_end():
    from app.rally.mapping import snapshot_from_rally
    closed = snap(1, 3, "Completed", "03T10:00:00", "04T15:00:00")
    s1, s2 = snapshot_from_rally(closed), snapshot_from_rally(snap(2, None, "Defined", "03T10:00:00"))
    assert (s1.status, s1.points, s1.valid_to) == ("in_review", 3, datetime(2026, 10, 4, 15, tzinfo=timezone.utc))
    assert (s2.status, s2.points, s2.valid_to) == ("backlog", 0, None)
    assert snapshot_from_rally(snap(3, 1, "Accepted", "03T10:00:00")).status == "done"
    assert snapshot_from_rally(snap(4, 1, "Odd custom state", "03T10:00:00")).status == "backlog"


# ---- adapter ----

SPRINT = "2026 PI4 Sprint 3"


def burnup_client(snapshots=None) -> FakeClient:
    art = rally_team(ART_ID, "Clinical ART", children=2)
    c = standard(FakeClient())
    c.on("QUERY", "/project", [art], query_has="ObjectID = 9000")
    c.on("QUERY", "/iteration", [rally_iteration(501, SPRINT, "2026-10-12T04:00:00.000Z", "2026-10-26T03:59:59.000Z", project=9001)],
         query_has="ObjectID = 501")
    c.on("QUERY", "/iteration", [rally_iteration(501, SPRINT, "2026-10-12T04:00:00.000Z", "2026-10-26T03:59:59.000Z", project=9001),
                                 rally_iteration(502, SPRINT, "2026-10-12T04:00:00.000Z", "2026-10-26T03:59:59.000Z", project=9002),
                                 rally_iteration(503, "Other", "2026-10-26T04:00:00.000Z", "2026-11-09T04:00:00.000Z", project=9002)],
         query_has="Name =")
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(PlannedStartDate="2026-10-13T04:00:00.000Z",
                                                           PlannedEndDate="2026-10-31T03:59:59.000Z")], query_has="ObjectID = 201")
    c.on("LOOKBACK", f"/workspace/{WORKSPACE_ID}", snapshots if snapshots is not None else [
        {"ObjectID": 1, "PlanEstimate": 3, "ScheduleState": "In-Progress", "_ValidFrom": "2026-10-13T09:00:00.000Z", "_ValidTo": OPEN}])
    return c


async def test_cycle_burnup_asks_lookback_for_every_sibling_and_runs_to_today():
    c = burnup_client()
    out = await make_adapter(c).burnup(ART_ID, 501, None)
    assert (out.start, out.end) == ("2026-10-12", "2026-10-25")  # the 23:59:59-local end closes on the 25th
    assert [p.day for p in out.points] == ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]  # NOW is the 16th
    assert lines(out.points) == ([0, 3, 3, 3, 3], [0, 3, 3, 3, 3], [0, 0, 0, 0, 0])
    [body] = c.lookbacks()
    assert body == {"find": {"$or": [{"_TypeHierarchy": "HierarchicalRequirement", "Children": None}, {"_TypeHierarchy": "Defect"}],
                             "Iteration": {"$in": [501, 502]}, "_ValidTo": {"$gt": "2026-10-12T00:00:00.000Z"}},
                    "fields": ["ObjectID", "PlanEstimate", "ScheduleState", "_ValidFrom", "_ValidTo"], "hydrate": ["ScheduleState"]}


async def test_project_burnup_reads_leaf_stories_from_the_planned_start():
    c = burnup_client()
    out = await make_adapter(c).burnup(None, None, "201")
    assert (out.start, out.end) == ("2026-10-13", "2026-10-30") and len(out.points) == 4
    [body] = c.lookbacks()
    assert body["find"] == {"_TypeHierarchy": "HierarchicalRequirement", "_ItemHierarchy": 201, "Children": None,
                            "_ValidTo": {"$gt": "2026-10-13T00:00:00.000Z"}}


async def test_project_without_planned_dates_looks_30_days_back_to_today():
    c = burnup_client()
    c._routes = [r for r in c._routes if r[1] != "/portfolioitem/feature"]
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(PlannedStartDate=None, PlannedEndDate=None)], query_has="ObjectID = 201")
    out = await make_adapter(c).burnup(None, None, "201")
    assert (out.start, out.end) == ("2026-09-16", "2026-10-16") and len(out.points) == 31


async def test_project_past_its_target_still_runs_to_today():
    c = burnup_client()
    c._routes = [r for r in c._routes if r[1] != "/portfolioitem/feature"]
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(PlannedStartDate="2026-10-01T04:00:00.000Z",
                                                           PlannedEndDate="2026-10-05T04:00:00.000Z")], query_has="ObjectID = 201")
    out = await make_adapter(c).burnup(None, None, "201")
    assert out.end == "2026-10-16" and out.points[-1].day == "2026-10-16"


async def test_lookback_failure_passes_through_as_502():
    c = burnup_client()
    c._routes = [r for r in c._routes if r[0] != "LOOKBACK"]
    c.on("LOOKBACK", f"/workspace/{WORKSPACE_ID}", RallyError(502, "Burn-up unavailable"))
    with pytest.raises(RallyError) as e:
        await make_adapter(c).burnup(ART_ID, 501, None)
    assert e.value.status == 502


async def test_an_empty_project_ref_is_rejected():
    for ref in ("", "  "):
        with pytest.raises(BadRequest):
            await make_adapter(FakeClient()).burnup(None, None, ref)


@pytest.mark.parametrize("args", [(None, None, None), (ART_ID, 501, "F201"), (ART_ID, None, None), (None, 501, None), (ART_ID, None, "F201")])
async def test_exactly_one_target_is_required(args):
    with pytest.raises(BadRequest):
        await make_adapter(FakeClient()).burnup(*args)


def test_route_answers_points_and_rejects_two_targets():
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app(make_adapter(burnup_client()))) as client:
        r = client.get(f"/api/burnup?team={ART_ID}&cycle=501")
        assert r.status_code == 200 and r.json()["start"] == "2026-10-12" and len(r.json()["points"]) == 5
        assert r.json()["points"][1] == {"day": "2026-10-13", "scope": 3.0, "started": 3.0, "completed": 0.0}
        both = client.get(f"/api/burnup?team={ART_ID}&cycle=501&project=F201")
        assert both.status_code == 422
        assert client.get("/api/burnup").status_code == 422
        assert client.get("/api/burnup?cycle=501").status_code == 422
        assert client.get("/api/burnup?project=").status_code == 422

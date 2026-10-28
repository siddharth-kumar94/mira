import pytest

from app.cycles import cut_cycles, stats_for
from app.domain import Cycle, Issue
from app.rally.client import RallyError
from app.rally.mapping import cycle_from_rally
from tests.adapter_kit import NOW, make_adapter, standard
from tests.fake_client import FakeClient
from tests.fixtures import (ART_ID, OTHER_TEAM_ID, rally_iteration, rally_story, rally_team, ref_obj)

DAY = "2026-10-{:02d}T04:00:00.000Z"


def issue(estimate, status, cycle_id=501) -> Issue:
    return Issue(id=1, key="US1", kind="story", title="t", status=status, priority=0, assignee=None, creator=None,
                 team_id=1, cycle_id=cycle_id, project_id=None, estimate=estimate, labels=[], blocked=False,
                 blocked_reason="", description="", rank="", created_at="", updated_at="", completed_at=None,
                 sub_issue_count=0)


def cycle(i, name, start, end, team=1) -> Cycle:
    return Cycle(id=i, team_id=team, name=name, short_name=name, start=start, end=end)


def test_stats_for_points():
    issues = [issue(3, "in_progress"), issue(5, "in_review"), issue(2, "done"), issue(None, "todo")]
    [s] = stats_for([501], issues)
    assert (s.cycle_id, s.scope, s.started, s.completed, s.issue_count) == (501, 10, 8, 2, 4)


def test_stats_for_empty_cycle():
    [s] = stats_for([501], [issue(3, "done", cycle_id=502)])
    assert (s.scope, s.started, s.completed, s.issue_count) == (0, 0, 0, 0)
    assert stats_for([], []) == []


def test_cut_cycles_keeps_future_current_and_two_past():
    cycles = [cycle(1, "S1", "2026-09-01T04:00:00.000Z", "2026-09-14T04:00:00.000Z"),
              cycle(2, "S2", "2026-09-15T04:00:00.000Z", "2026-09-28T04:00:00.000Z"),
              cycle(3, "S3", "2026-09-29T04:00:00.000Z", "2026-10-12T04:00:00.000Z"),
              cycle(4, "S4", "2026-10-13T04:00:00.000Z", "2026-10-26T04:00:00.000Z"),  # contains NOW (Oct 16)
              cycle(5, "S5", "2026-10-27T04:00:00.000Z", "2026-11-09T04:00:00.000Z"),
              cycle(6, "S6", "2026-11-10T04:00:00.000Z", "2026-11-23T04:00:00.000Z")]
    kept, older = cut_cycles(cycles, NOW, 2)
    assert [c.id for c in kept] == [2, 3, 4, 5, 6] and older is True
    kept, older = cut_cycles(cycles, NOW, 3)
    assert len(kept) == 6 and older is False
    kept, older = cut_cycles(cycles, NOW, 0)
    assert [c.id for c in kept] == [4, 5, 6] and older is True


def test_cut_cycles_art_counts_keys():
    rows = []
    for n, (start, end) in enumerate([("2026-08-01T04:00:00.000Z", "2026-08-14T04:00:00.000Z"),
                                      ("2026-08-15T04:00:00.000Z", "2026-08-28T04:00:00.000Z"),
                                      ("2026-08-29T04:00:00.000Z", "2026-09-11T04:00:00.000Z")]):
        for team in (10, 11):
            rows.append(cycle(n * 10 + team, f"S{n}", start, end, team))
    kept, older = cut_cycles(rows, NOW, 2)
    assert {c.name for c in kept} == {"S1", "S2"} and len(kept) == 4 and older is True
    kept, older = cut_cycles(rows, NOW, 3)
    assert len(kept) == 6 and older is False


def test_cut_cycles_past_larger_than_the_ended_count_returns_all_of_them():
    cycles = [cycle(n, f"S{n}", f"2026-0{n}-01T04:00:00.000Z", f"2026-0{n}-14T04:00:00.000Z") for n in range(1, 6)]
    for past in (5, 6, 7, 9, 50):
        kept, older = cut_cycles(cycles, NOW, past)
        assert [c.id for c in kept] == [1, 2, 3, 4, 5] and older is False, past
    assert cut_cycles(cycles, NOW, 0) == ([], True)


def test_capacity_read():
    base = rally_iteration(501, "Sprint 1", DAY.format(1), DAY.format(14))
    assert cycle_from_rally({**base, "PlannedVelocity": 20}).capacity == 20.0
    assert cycle_from_rally({**base, "PlannedVelocity": 0}).capacity is None
    assert cycle_from_rally({**base, "PlannedVelocity": None}).capacity is None
    assert cycle_from_rally(base).capacity is None


def cycles_client(team=None, rows=(), stories=()) -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/project", [team or rally_team(OTHER_TEAM_ID, "Team - AI/ML Solutions")])
    c.on("QUERY", "/iteration", list(rows))
    c.on("QUERY", "/artifact", list(stories))
    return c


async def test_team_cycles_queries_scope_down_for_art():
    art = rally_team(OTHER_TEAM_ID, "Clinical ART", children=2)
    c = cycles_client(art, [rally_iteration(501, "Sprint 1", DAY.format(1), DAY.format(30))])
    out = await make_adapter(c).team_cycles(OTHER_TEAM_ID)
    assert len(c.queries("/iteration")) == 2
    for _, _, params, _ in c.queries("/iteration"):
        assert params["projectScopeDown"] == "true" and params["project"] == f"/project/{OTHER_TEAM_ID}"
    assert [x.id for x in out.cycles] == [501] and out.has_older is False
    plain = cycles_client(rows=[rally_iteration(501, "Sprint 1", DAY.format(1), DAY.format(30))])
    await make_adapter(plain).team_cycles(OTHER_TEAM_ID)
    assert plain.queries("/iteration")[0][2]["projectScopeDown"] == "false"


async def test_team_cycles_stats_are_chunked_and_mapped():
    rows = [rally_iteration(500 + n, f"Sprint {n}", DAY.format(1), DAY.format(30)) for n in range(1, 4)]
    stories = [rally_story(ObjectID=1, PlanEstimate=3, ScheduleState="In-Progress", Iteration=ref_obj("iteration/501")),
               rally_story(ObjectID=2, PlanEstimate=2, ScheduleState="Accepted", Iteration=ref_obj("iteration/501")),
               rally_story(ObjectID=3, PlanEstimate=None, ScheduleState="Defined", Iteration=ref_obj("iteration/502"))]
    c = cycles_client(rows=rows, stories=stories)
    out = await make_adapter(c).team_cycles(OTHER_TEAM_ID)
    assert [s.cycle_id for s in out.stats] == [501, 502, 503]
    assert [(s.scope, s.started, s.completed, s.issue_count) for s in out.stats] == [(5, 3, 2, 2), (0, 0, 0, 1), (0, 0, 0, 0)]
    [(_, _, params, _)] = c.queries("/artifact")
    assert params["types"] == "HierarchicalRequirement,Defect" and params["fetch"] == "ObjectID,PlanEstimate,ScheduleState,Ready,Iteration,Project"
    assert "iteration/501" in params["query"] and "iteration/503" in params["query"]


async def test_team_cycles_reads_iterations_around_now_not_all_history():
    rows = [rally_iteration(501, "Sprint 1", DAY.format(1), DAY.format(30))]
    art = rally_team(OTHER_TEAM_ID, "Clinical ART", children=2)
    c = cycles_client(art, rows)
    await make_adapter(c).team_cycles(OTHER_TEAM_ID)
    queries = [params for _, _, params, _ in c.queries("/iteration")]
    stamp = NOW.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    assert sorted(q["query"] for q in queries) == [f'(EndDate < "{stamp}")', f'(EndDate >= "{stamp}")']
    ended = next(q for q in queries if "EndDate <" in q["query"])
    assert ended["order"] == "EndDate DESC"
    assert all(q["projectScopeDown"] == "true" and "ObjectID > 0" not in q["query"] for q in queries)


async def test_team_cycles_reads_further_back_when_the_first_read_is_all_copies_of_one_cycle():
    def ended(i, name, month):
        return rally_iteration(i, name, f"2026-0{month}-01T04:00:00.000Z", f"2026-0{month}-14T04:00:00.000Z")

    c = cycles_client()

    def answer(params, body):
        if "EndDate >=" in params["query"]:
            return []
        limit = c.sizes[-1][1]  # a first page full of one cycle's copies (an ART), then the wider read
        return [ended(1000 + n, "Sprint 3", 3) for n in range(limit)] if limit <= 200 else [
            ended(1, "Sprint 3", 3), ended(2, "Sprint 2", 2), ended(3, "Sprint 1", 1)]

    c._routes.insert(0, ("QUERY", "/iteration", None, answer))
    out = await make_adapter(c).team_cycles(OTHER_TEAM_ID, past=2)
    assert sorted({x.name for x in out.cycles}) == ["Sprint 2", "Sprint 3"] and out.has_older is True
    assert [limit for path, limit, _ in c.sizes if path == "/iteration"] == [1000, 200, 1000]


async def test_team_cycles_stats_use_big_pages():
    rows = [rally_iteration(501, "Sprint 1", DAY.format(1), DAY.format(30))]
    c = cycles_client(rows=rows)
    await make_adapter(c).team_cycles(OTHER_TEAM_ID)
    assert [(limit, pagesize) for path, limit, pagesize in c.sizes if path == "/artifact"] == [(5000, 2000)]


async def test_cycle_stats_ask_only_for_the_team_not_every_team_sharing_the_sprint():
    """Rally matches `Iteration = X` against every team's same-named, same-dated iteration, so an unscoped read pulls the
    whole train's stories (thousands of rows, nearly all discarded). The read carries the team, and an ART's children."""
    rows = [rally_iteration(501, "Sprint 1", DAY.format(1), DAY.format(30))]
    plain = cycles_client(rows=rows)
    await make_adapter(plain).team_cycles(OTHER_TEAM_ID)
    [(_, _, params, _)] = plain.queries("/artifact")
    assert params["project"] == f"/project/{OTHER_TEAM_ID}" and params["projectScopeUp"] == "false" and params["projectScopeDown"] == "false"
    art = cycles_client(rally_team(OTHER_TEAM_ID, "Clinical ART", children=2), rows)
    await make_adapter(art).team_cycles(OTHER_TEAM_ID)
    [(_, _, params, _)] = art.queries("/artifact")
    assert params["project"] == f"/project/{OTHER_TEAM_ID}" and params["projectScopeDown"] == "true"


async def test_team_cycles_rejects_out_of_range_past():
    a = make_adapter(cycles_client())
    for past in (-1, 51):
        with pytest.raises(ValueError):
            await a.team_cycles(OTHER_TEAM_ID, past)


def detail_client() -> FakeClient:
    art = rally_team(ART_ID, "Clinical ART", children=2)
    c = standard(FakeClient())
    c.on("QUERY", "/project", [art], query_has="ObjectID = 9000")
    c.on("QUERY", "/project", [rally_team(9001, "Team - A", parent=ART_ID), rally_team(9002, "Team - B", parent=ART_ID)],
         query_has="ObjectID = 9001")
    c.on("QUERY", "/iteration", [rally_iteration(501, "2026 PI4 Sprint 3", DAY.format(1), DAY.format(14), project=9001)],
         query_has="ObjectID = 501")
    c.on("QUERY", "/iteration", [rally_iteration(501, "2026 PI4 Sprint 3", DAY.format(1), DAY.format(14), project=9001),
                                 rally_iteration(502, "2026 PI4 Sprint 3", DAY.format(1), DAY.format(14), project=9002),
                                 rally_iteration(503, "2026 PI4 Sprint 3", DAY.format(15), DAY.format(28), project=9002)],
         query_has="Name =")
    c.on("QUERY", "/iteration", [], query_has="ObjectID = 999")
    c.on("QUERY", "/artifact", [rally_story(ObjectID=1, Iteration=ref_obj("iteration/501"), Project=ref_obj("project/9001")),
                                rally_story(ObjectID=2, FormattedID="US2", Iteration=ref_obj("iteration/502"),
                                            Project=ref_obj("project/9002"))])
    c.on("QUERY", "/portfolioitem/feature", [])
    return c


async def test_cycle_detail_merges_siblings():
    c = detail_client()
    out = await make_adapter(c).cycle_detail(ART_ID, 501)
    assert out.cycle.id == 501 and [x.id for x in out.siblings] == [501, 502]
    assert [i.id for i in out.issues] == [1, 2]
    sibling_query = next(q for _, _, q, _ in c.queries("/iteration") if "Name =" in q["query"])
    assert q_has(sibling_query["query"], "2026 PI4 Sprint 3", DAY.format(1), DAY.format(14))  # same name and dates, asked of Rally
    assert sibling_query["projectScopeDown"] == "true"
    [(_, _, params, _)] = c.queries("/artifact")
    assert params["query"] == "((Iteration = /iteration/501) OR (Iteration = /iteration/502))"
    assert "503" not in params["query"]
    assert params["project"] == f"/project/{ART_ID}" and params["projectScopeDown"] == "true"
    assert [t.id for t in out.teams] == [9001, 9002]


def q_has(query, *parts):
    return all(p in query for p in parts)


async def test_cycle_detail_404():
    with pytest.raises(RallyError) as e:
        await make_adapter(detail_client()).cycle_detail(ART_ID, 999)
    assert e.value.status == 404 and e.value.message == "Sprint 999 was not found"


def test_team_cycles_past_out_of_range_is_a_422_through_the_api():
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app(make_adapter(cycles_client()))) as c:
        r = c.get(f"/api/teams/{OTHER_TEAM_ID}/cycles?past=51")
        assert r.status_code == 422 and "past" in r.json()["error"]
        assert c.get(f"/api/teams/{OTHER_TEAM_ID}/cycles?past=50").status_code == 200

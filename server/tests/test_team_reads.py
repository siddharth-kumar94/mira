import pytest

from app.domain import Cycle
from app.rally.issues import done_window_start
from tests.adapter_kit import NOW, make_adapter, standard
from tests.fake_client import FakeClient
from tests.fixtures import (OTHER_TEAM_ID, PROJECT_ID, rally_feature, rally_iteration, rally_story, rally_task, rally_team,
                            ref_obj)

S2 = rally_iteration(300, "2026 PI4 Sprint 2", "2026-09-24T04:00:00.000Z", "2026-10-08T03:59:59.000Z", project=OTHER_TEAM_ID)
S3 = rally_iteration(301, "2026 PI4 Sprint 3", "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z", project=OTHER_TEAM_ID)
S4 = rally_iteration(302, "2026 PI4 Sprint 4", "2026-10-22T04:00:00.000Z", "2026-11-05T03:59:59.000Z", project=OTHER_TEAM_ID)
REAL = dict(Project=ref_obj(f"project/{OTHER_TEAM_ID}"), Name="Real", Tags={"_tagsNameArray": []})


def team_client(team=None) -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/project", [team or rally_team(OTHER_TEAM_ID, "Team - AI/ML Solutions")])
    c.on("QUERY", "/iteration", [S2, S3, S4], query_has="EndDate >=")
    c.on("QUERY", "/iteration", [], query_has="ObjectID")
    c.on("QUERY", "/artifact", [rally_story(**REAL), rally_story(ObjectID=1002, FormattedID="US1002", Owner=None, **REAL)],
         query_has='ScheduleState < "Accepted"')
    c.on("QUERY", "/artifact", [rally_story(ObjectID=1003, FormattedID="US1003", ScheduleState="Accepted",
                                            AcceptedDate="2026-10-01T00:00:00.000Z", **REAL)], query_has="AcceptedDate >=")
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(Project=ref_obj(f"project/{OTHER_TEAM_ID}"))], query_has="State = null")
    c.on("QUERY", "/portfolioitem/feature", [], query_has="ObjectID")
    c.on("QUERY", f"/project/{OTHER_TEAM_ID}/TeamMembers", [{"_ref": "u/502", "ObjectID": 502, "_refObjectName": "Sam Sample"}])
    return c


async def test_team_load_scopes_to_the_team_and_brings_recent_done():
    c = team_client()
    load = await make_adapter(c).team_load(OTHER_TEAM_ID)
    assert load.team.name == "AI/ML Solutions"
    assert [i.key for i in load.issues] == ["US1001", "US1002", "US1003"]
    assert [cy.id for cy in load.cycles] == [300, 301, 302]
    assert [p.key for p in load.projects] == ["F201"] and load.member_ids == [502]
    assert [u.name for u in load.users] == ["Dana Demo", "Sam Sample"]
    for _, _, params, _ in c.queries("/artifact"):
        assert params["project"] == f"/project/{OTHER_TEAM_ID}" and params["projectScopeDown"] == "false"
    done = next(call for call in c.queries("/artifact") if "AcceptedDate" in call[2]["query"])[2]
    assert done["query"] == '(AcceptedDate >= "2026-09-24T04:00:00.000Z")'  # previous cycle's start: the last 2 cycles
    assert not [call for call in c.queries("/portfolioitem/feature") if "ObjectID" in call[2]["query"]]  # F201 known


async def test_an_art_scopes_down():
    c = team_client(team=rally_team(OTHER_TEAM_ID, "Clinical ART", children=2))
    await make_adapter(c).team_load(OTHER_TEAM_ID)
    assert all(call[2]["projectScopeDown"] == "true" for call in c.queries("/artifact"))


def cycle(i, start):
    return Cycle(id=i, team_id=1, name=str(i), short_name=str(i), start=start, end=start)


def test_done_window_start():
    assert done_window_start([], NOW) == "2026-10-02T12:00:00.000Z"  # 14 days
    assert done_window_start([cycle(3, "2026-10-08T04:00:00.000Z")], NOW) == "2026-10-02T12:00:00.000Z"
    cycles = [cycle(2, "2026-09-24T04:00:00.000Z"), cycle(3, "2026-10-08T04:00:00.000Z"), cycle(4, "2026-10-22T04:00:00.000Z")]
    assert done_window_start(cycles, NOW) == "2026-09-24T04:00:00.000Z"


async def test_unknown_team_is_404():
    c = standard(FakeClient()).on("QUERY", "/project", [])
    from app.rally.client import RallyError
    with pytest.raises(RallyError) as e:
        await make_adapter(c).team_load(123)
    assert e.value.status == 404


async def test_all_tab_pages_by_updated():
    c = team_client()
    c.on("PAGE", "/artifact", ([rally_story(**REAL)], 101))
    page = await make_adapter(c).team_issues(OTHER_TEAM_ID, cursor=1)
    assert [i.key for i in page.issues] == ["US1001"] and page.next_cursor == 2
    call = next(x for x in c.calls if x[0] == "PAGE")[2]
    assert (call["order"], call["pagesize"], call["start"]) == ("LastUpdateDate DESC", 100, 1)
    c2 = team_client().on("PAGE", "/artifact", ([rally_story(**REAL)], 1))
    assert (await make_adapter(c2).team_issues(OTHER_TEAM_ID, cursor=1)).next_cursor is None
    with pytest.raises(ValueError):
        await make_adapter(c2).team_issues(OTHER_TEAM_ID, cursor=0)


async def test_changes_cover_mine_and_loaded_teams():
    c = team_client()
    c.on("QUERY", "/artifact", [rally_story(Name="[DEMO] moved")], query_has="LastUpdateDate >")
    c.on("QUERY", "/task", [rally_task()])
    ch = await make_adapter(c).changes("2026-10-16T11:59:00.000Z", [OTHER_TEAM_ID])
    assert [i.title for i in ch.issues] == ["[DEMO] moved"] and [s.id for s in ch.sub_issues] == [4001]
    artifact_queries = [call[2] for call in c.queries("/artifact")]
    assert any("project" not in q and "currentuser" in q["query"] for q in artifact_queries)
    assert any(q.get("project") == f"/project/{OTHER_TEAM_ID}" for q in artifact_queries)
    assert ch.server_time == "2026-10-16T11:59:30.000Z"


async def test_changes_validate_input():
    a = make_adapter(team_client())
    with pytest.raises(ValueError):
        await a.changes("yesterday", [])
    with pytest.raises(ValueError):
        await a.changes("2026-10-16T11:59:00.000Z", list(range(21)))


async def test_team_load_child_teams():
    from tests.fixtures import ART_ID
    c = team_client(team=rally_team(ART_ID, "Clinical ART", children=2))
    c._routes.insert(0, ("QUERY", "/project", "Parent =", [rally_team(9001, "Team - A", parent=ART_ID),
                                                           rally_team(OTHER_TEAM_ID, "Team - B", parent=ART_ID),
                                                           rally_team(9003, "Team - Old", parent=ART_ID, state="Closed")]))
    c.on("QUERY", f"/project/{ART_ID}/TeamMembers", [])
    load = await make_adapter(c).team_load(ART_ID)
    assert [t.id for t in load.child_teams] == [9001, OTHER_TEAM_ID] and [t.name for t in load.child_teams] == ["A", "B"]
    parents = [q[2]["query"] for q in c.queries("/project") if "Parent" in q[2]["query"]]
    assert parents == [f"(Parent = /project/{ART_ID})"]  # leaf teams are not asked for children
    plain = team_client()
    assert (await make_adapter(plain).team_load(OTHER_TEAM_ID)).child_teams == []
    assert not [q for q in plain.queries("/project") if "Parent" in q[2]["query"]]

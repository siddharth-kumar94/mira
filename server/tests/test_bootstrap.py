from app.rally.client import RallyError
from app.rally.mapping import PROJECT_FETCH
from tests.adapter_kit import NOW, make_adapter, priority_attribute, standard
from tests.fake_client import FakeClient
from tests.fixtures import (BASE, OTHER_TEAM_ID, PROJECT_ID, WORKSPACE_ID, rally_feature, rally_iteration, rally_story,
                            rally_task, rally_team, ref_obj)

SPRINT = rally_iteration(301, "2026 PI4 Sprint 3", "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z")


def bootstrap_client(feature=(), capability=(), **over) -> FakeClient:
    c = standard(FakeClient(), feature, capability)
    mine = over.get("mine", [
        rally_story(),
        rally_story(ObjectID=1201, FormattedID="US1201", Name="Real work", Tags={"_tagsNameArray": []},
                    Project=ref_obj(f"project/{OTHER_TEAM_ID}"), Iteration=None, Feature=None, PortfolioItem=None,
                    ScheduleState="Defined"),
    ])
    c.on("QUERY", "/artifact", over.get("activity", [{"Project": ref_obj(f"project/{OTHER_TEAM_ID}")}]),
         query_has="LastUpdateDate >")
    c.on("QUERY", "/artifact", mine, query_has="ScheduleState <")
    c.on("QUERY", "/artifact", over.get("parents", [rally_story(ObjectID=1300, FormattedID="US1300", Name="Someone else's",
                                                                Owner=ref_obj("user/502", "Sam Sample"))]),
         query_has="ObjectID = 1300")
    c.on("QUERY", "/user/501/TeamMemberships", over.get("memberships", [{"ObjectID": 9050}]))
    c.on("QUERY", "/task", over.get("tasks", [rally_task(ObjectID=4002, WorkProduct=ref_obj("hierarchicalrequirement/1300"))]))
    c.on("QUERY", "/project", over.get("teams", [
        rally_team(PROJECT_ID, "Team - Data Services"), rally_team(OTHER_TEAM_ID, "Team - AI/ML Solutions"),
        rally_team(9050, "Team - DataLine", state="Closed")]))
    c.on("QUERY", "/iteration", [SPRINT])
    c.on("QUERY", "/portfolioitem/feature", over.get("projects", [rally_feature()]))
    return c


async def test_bootstrap_is_workspace_wide_and_lists_your_teams():
    c = bootstrap_client()
    b = await make_adapter(c).bootstrap()
    assert b.me.name == "Dana Demo" and b.workspace.name == "Demo Workspace"
    assert [t.name for t in b.teams] == ["Data Services", "AI/ML Solutions"]  # the closed membership is dropped
    assert {i.key for i in b.issues} == {"US1001", "US1201", "US1300"}       # US1300 is a sub-issue's parent
    assert [s.id for s in b.sub_issues] == [4002]
    assert [cy.id for cy in b.cycles] == [301] and [p.key for p in b.projects] == ["F201"]
    assert [u.name for u in b.users] == ["Dana Demo", "Sam Sample"]
    assert PROJECT_ID in [t.id for t in b.teams]
    assert b.server_time == "2026-10-16T11:59:30.000Z"
    mine = next(call for call in c.queries("/artifact") if "ScheduleState <" in call[2]["query"])[2]
    assert "project" not in mine and mine["workspace"] == f"/workspace/{WORKSPACE_ID}"
    assert mine["query"] == ('(((Owner = currentuser) OR (CreatedBy = currentuser)) AND '
                             '((ScheduleState < "Accepted") OR (AcceptedDate > "2026-10-02T12:00:00.000Z")))')


async def test_your_teams_use_120_days_of_activity_memberships_and_the_demo_team():
    c = bootstrap_client()
    ids = await make_adapter(c).your_team_ids(NOW)
    assert ids == sorted({OTHER_TEAM_ID, 9050, PROJECT_ID})
    activity = next(call for call in c.queries("/artifact") if "LastUpdateDate >" in call[2]["query"])[2]
    assert '"2026-06-18T12:00:00.000Z"' in activity["query"] and activity["fetch"] == "Project"


async def test_a_user_with_no_activity_gets_empty_lists():
    """Review focus 1: a working key with nothing to show must not crash."""
    c = bootstrap_client(mine=[], activity=[], memberships=[], tasks=[], parents=[], teams=[rally_team(PROJECT_ID, "Team - Data Services")])
    b = await make_adapter(c).bootstrap()
    assert b.issues == [] and b.sub_issues == [] and b.cycles == [] and b.projects == []
    assert [t.id for t in b.teams] == [PROJECT_ID]
    assert not c.queries("/iteration") and not c.queries("/portfolioitem/feature")  # no empty OR queries


async def test_params_scope_down_only_for_an_art():
    a = make_adapter(standard(FakeClient()))
    from app.domain import Team
    team = await a.params(Team(id=9001, name="x", level="team", parent_id=None))
    art = await a.params(Team(id=9000, name="y", level="art", parent_id=None))
    assert (team["project"], team["projectScopeUp"], team["projectScopeDown"]) == ("/project/9001", "false", "false")
    assert art["projectScopeDown"] == "true"
    assert "project" not in await a.params()


async def test_by_ids_chunks_by_fifty():
    c = standard(FakeClient()).on("QUERY", "/iteration", [])
    await make_adapter(c).by_ids("/iteration", "ObjectID", range(1, 121))
    assert len(c.queries("/iteration")) == 3


async def test_bootstrap_says_whether_projects_and_initiatives_have_a_priority():
    c = bootstrap_client(feature=[priority_attribute("Highest", "High", "Low")], projects=[rally_feature(c_Priority="High")])
    b = await make_adapter(c).bootstrap()
    assert (b.project_priority, b.initiative_priority) == (True, False)
    assert [p.priority for p in b.projects] == [2]
    assert all("c_Priority" in call[2]["fetch"].split(",") for call in c.queries("/portfolioitem/feature"))


async def test_bootstrap_without_a_priority_field_hides_the_controls_and_keeps_the_fetch():
    c = bootstrap_client()
    b = await make_adapter(c).bootstrap()
    assert (b.project_priority, b.initiative_priority) == (False, False)
    assert {call[2]["fetch"] for call in c.queries("/portfolioitem/feature")} == {PROJECT_FETCH}
    assert [p.priority for p in b.projects] == [0]


async def test_bootstrap_survives_a_failed_type_definition_read():
    c = bootstrap_client()
    c._routes.insert(0, ("QUERY", "/typedefinition", None, RallyError(403, "Rally returned HTTP 403")))
    b = await make_adapter(c).bootstrap()
    assert (b.project_priority, b.initiative_priority) == (False, False) and [p.key for p in b.projects] == ["F201"]
    assert {call[2]["fetch"] for call in c.queries("/portfolioitem/feature")} == {PROJECT_FETCH}

import pytest

from app.domain import IssueCreate, IssuePatch, RankRequest
from app.rally.client import RallyError
from tests.adapter_kit import make_adapter, standard
from tests.fake_client import FakeClient
from tests.fixtures import (BASE, DEMO_TAG, OTHER_TEAM_ID, PROJECT_ID, create_result, operation_result, rally_defect,
                            rally_feature, rally_iteration, rally_story, ref_obj, tags)

REAL = dict(Name="Real story", Tags=tags(), Project=ref_obj(f"project/{OTHER_TEAM_ID}"))


def client_with(story) -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/artifact", [story], query_has=f"ObjectID = {story['ObjectID']}")
    c.on("POST", f"/hierarchicalrequirement/{story['ObjectID']}", lambda p, b: operation_result(story))
    c.on("POST", f"/defect/{story['ObjectID']}", lambda p, b: operation_result(story))
    return c


async def test_status_todo_writes_ready():
    c = client_with(rally_story())
    await make_adapter(c).update_issue(1001, IssuePatch(status="todo"))
    assert c.posts()[0][3] == {"HierarchicalRequirement": {"ScheduleState": "Defined", "Ready": True}}


async def test_status_backlog_clears_ready_and_cycle_and_priority_on_defect():
    c = client_with(rally_defect())
    await make_adapter(c).update_issue(1101, IssuePatch(status="backlog", priority=1))
    assert c.posts()[0][3] == {"Defect": {"ScheduleState": "Defined", "Ready": False, "Iteration": None,
                                          "Priority": "Resolve Immediately"}}


async def test_labels_resolve_and_unknown_is_422():
    c = client_with(rally_story())
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}, {"_ref": f"{BASE}/tag/7005", "Name": "ux"}])
    a = make_adapter(c)
    await a.update_issue(1001, IssuePatch(labels=[DEMO_TAG, "ux"]))
    assert c.posts()[0][3] == {"HierarchicalRequirement": {"Tags": [{"_ref": "/tag/7000"}, {"_ref": "/tag/7005"}]}}
    with pytest.raises(RallyError) as e:
        await a.update_issue(1001, IssuePatch(labels=[DEMO_TAG, "nope"]))
    assert e.value.status == 422 and e.value.message == "Unknown label: nope"


async def test_labels_with_html_escaped_rally_names_resolve():
    c = client_with(rally_story())
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}, {"_ref": f"{BASE}/tag/7007", "Name": "&#39;API-2022pi4"}])
    await make_adapter(c).update_issue(1001, IssuePatch(labels=[DEMO_TAG, "'API-2022pi4"]))
    assert c.posts()[0][3] == {"HierarchicalRequirement": {"Tags": [{"_ref": "/tag/7000"}, {"_ref": "/tag/7007"}]}}
    assert c.queries("/tag")[0][2]["query"] == '((Name = "collabathon-demo") OR (Name contains "API-2022pi4"))'


async def test_rank_above_a_defect():
    c = client_with(rally_story())
    c.on("QUERY", "/artifact", [rally_defect()], query_has="ObjectID = 1101")
    await make_adapter(c).rank_issue(1001, RankRequest(above=1101))
    _, path, params, body = c.posts()[0]
    assert path == "/hierarchicalrequirement/1001" and params["rankAbove"] == "/defect/1101" and body == {"HierarchicalRequirement": {}}
    with pytest.raises(ValueError):
        await make_adapter(c).rank_issue(1001, RankRequest(below=1001))


def create_client(created=None) -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/portfolioitem/feature", [rally_feature()])
    c.on("QUERY", "/iteration", [rally_iteration(301, "Sprint 3", "a", "b")])
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}])
    c.on("POST", "/hierarchicalrequirement/create", create_result(created or rally_story(ObjectID=1500, FormattedID="US1500")))
    c.on("POST", "/hierarchicalrequirement/1500", operation_result(rally_story(ObjectID=1500, FormattedID="US1500")))
    return c


async def test_create_maps_fields():
    c = create_client()
    issue = await make_adapter(c).create_issue(IssueCreate(
        team_id=PROJECT_ID, title="[DEMO] New", project_id=201, status="todo", priority=2, assignee_id=501,
        cycle_id=301, estimate=3, description="<p>d</p>"))
    assert issue.key == "US1500"
    assert c.posts()[0][3] == {"HierarchicalRequirement": {
        "Name": "[DEMO] New", "Project": f"/project/{PROJECT_ID}", "PortfolioItem": "/portfolioitem/feature/201",
        "Description": "<p>d</p>", "ScheduleState": "Defined", "Ready": True, "Iteration": "/iteration/301",
        "c_Priority": "High", "Owner": "/user/501", "PlanEstimate": 3.0}}
    assert len(c.posts()) == 1  # top is Rally's default: no extra rank write


async def test_create_bottom_ranks_and_backlog_is_unready():
    c = create_client()
    await make_adapter(c).create_issue(IssueCreate(team_id=PROJECT_ID, title="[DEMO] B", project_id=201, position="bottom"))
    fields = c.posts()[0][3]["HierarchicalRequirement"]
    assert (fields["ScheduleState"], fields["Ready"], fields["Iteration"]) == ("Defined", False, None) and "Owner" not in fields
    assert c.posts()[1][2]["rankTo"] == "BOTTOM"



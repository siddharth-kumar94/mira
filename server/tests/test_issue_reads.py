import pytest

from app.rally.client import RallyError
from tests.adapter_kit import make_adapter, standard
from tests.fake_client import FakeClient
from tests.fixtures import rally_feature, rally_iteration, rally_post, rally_revision, rally_story, rally_task, rally_team

SPRINT = rally_iteration(301, "Sprint 3", "2026-10-08T04:00:00.000Z", "2026-10-22T03:59:59.000Z")


def detail_client() -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/artifact", [rally_story()], query_has='FormattedID = "US1001"')
    c.on("QUERY", "/artifact", [rally_story()], query_has="ObjectID = 1001")
    c.on("QUERY", "/artifact", [], query_has="FormattedID")
    c.on("QUERY", "/task", [rally_task()])
    c.on("QUERY", "/conversationpost", [rally_post(91, "<p>First</p>")])
    c.on("QUERY", "/revisionhistory/8801/Revisions", [rally_revision(81, "PLAN ESTIMATE changed from [3.0] to [5.0]")])
    c.on("QUERY", "/iteration", [SPRINT])
    c.on("QUERY", "/portfolioitem/feature", [rally_feature()])
    return c


async def test_issue_detail_by_key_has_sub_issues_comments_and_activity():
    c = detail_client()
    d = await make_adapter(c).get_issue("US1001")
    assert d.issue.key == "US1001" and [s.key for s in d.sub_issues] == ["TA4001"]
    assert [x.html for x in d.comments] == ["<p>First</p>"]
    assert [(a.id, a.text) for a in d.activity] == [(f"{d.activity[0].id.split('.')[0]}.0", "set estimate to 5")]
    assert [cy.id for cy in d.cycles] == [301] and [p.key for p in d.projects] == ["F201"]
    post_query = c.queries("/conversationpost")[0][2]
    assert post_query["query"] == "(Artifact = /hierarchicalrequirement/1001)" and post_query["order"] == "CreationDate ASC"
    assert "project" not in c.queries("/artifact")[0][2]  # issues open from anywhere in the workspace


async def test_lowercase_key_and_object_id_both_resolve():
    """Review focus 2."""
    c = detail_client()
    assert (await make_adapter(c).get_issue("us1001")).issue.id == 1001
    assert (await make_adapter(c).get_issue("1001")).issue.key == "US1001"


async def test_unknown_or_malformed_issue():
    c = detail_client()
    with pytest.raises(RallyError) as e:
        await make_adapter(c).get_issue("US999999")
    assert e.value.status == 404 and e.value.message == "Story US999999 was not found"
    with pytest.raises(ValueError):
        await make_adapter(c).get_issue("../user")


async def test_search_finds_issues_teams_and_projects():
    c = standard(FakeClient())
    c.on("QUERY", "/artifact", [rally_story()])
    c.on("QUERY", "/project", [rally_team(9002, "Team - AI/ML Solutions")])
    c.on("QUERY", "/portfolioitem/feature", [rally_feature()])
    r = await make_adapter(c).search("us1001")
    assert [i.key for i in r.issues] == ["US1001"] and [t.name for t in r.teams] == ["AI/ML Solutions"]
    assert [p.key for p in r.projects] == ["F201"]
    assert c.queries("/artifact")[0][2]["query"] == '((Name contains "us1001") OR (FormattedID = "US1001"))'
    assert (await make_adapter(c).search(" x ")).issues == []


async def test_users_and_labels_search_the_workspace():
    c = standard(FakeClient())
    c.on("QUERY", "/user", [{"ObjectID": 502, "_refObjectName": "Sam Sample"}])
    c.on("QUERY", "/tag", [{"Name": "ux"}, {"Name": "PI4"}])
    a = make_adapter(c)
    assert [u.name for u in await a.users("sam")] == ["Sam Sample"]
    assert c.queries("/user")[0][2]["query"] == '((DisplayName contains "sam") AND (Disabled = false))'
    assert await a.users("s") == []
    assert await a.labels("u") == ["ux", "PI4"]
    assert c.queries("/tag")[0][2]["query"] == '((Name contains "u") AND (Archived = false))'
    await a.labels("")
    assert c.queries("/tag")[1][2]["query"] == "(Archived = false)"


async def test_labels_search_unescapes_names_and_filters_on_the_plain_text():
    c = standard(FakeClient())
    c.on("QUERY", "/tag", [{"Name": "&#39;API-2022pi4"}, {"Name": "API-2022pi4"}, {"Name": "xAPI-2022"}])
    assert await make_adapter(c).labels("'API") == ["'API-2022pi4"]
    assert c.queries("/tag")[0][2]["query"] == '((Name contains "API") AND (Archived = false))'

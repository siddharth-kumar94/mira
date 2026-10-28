import pytest

from app.domain import CommentCreate, SubIssueCreate, SubIssuePatch, TagCreate
from app.rally.client import RallyError
from tests.adapter_kit import make_adapter, standard
from tests.fake_client import FakeClient
from tests.fixtures import (BASE, DEMO_TAG, OTHER_TEAM_ID, create_result, operation_result, rally_feature, rally_post,
                            rally_story, rally_task, ref_obj, tags)

REAL_STORY = rally_story(Name="Real story", Tags=tags(), Project=ref_obj(f"project/{OTHER_TEAM_ID}"))


def client(story=None, task=None, post=None) -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/artifact", [story or rally_story()], query_has="ObjectID = 1001")
    c.on("QUERY", "/task", [task or rally_task()], query_has="ObjectID = 4001")
    c.on("QUERY", "/tag", [{"_ref": f"{BASE}/tag/7000", "Name": DEMO_TAG}])
    c.on("POST", "/task/create", create_result(rally_task(ObjectID=4009, FormattedID="TA4009", Name="[DEMO] sub")))
    c.on("POST", "/task/4001", operation_result(rally_task(State="Completed")))
    c.on("DELETE", "/task/4001", {"OperationResult": {"Errors": [], "Warnings": []}})
    c.on("POST", "/conversationpost/create", create_result(rally_post(95, "<p>Nice</p>")))
    c.on("QUERY", "/conversationpost", [post or rally_post(95, "<p>Nice</p>")], query_has="ObjectID = 95")
    c.on("DELETE", "/conversationpost/95", {"OperationResult": {"Errors": [], "Warnings": []}})
    c.on("GET", "/hierarchicalrequirement/1001", {"HierarchicalRequirement": story or rally_story()})
    c.on("GET", "/portfolioitem/feature/201", {"PortfolioItem/Feature": rally_feature()})
    return c


def no_writes(c: FakeClient) -> bool:
    return not [x for x in c.calls if x[0] in ("POST", "DELETE")]


async def test_create_sub_issue():
    c = client()
    s = await make_adapter(c).create_sub_issue(1001, SubIssueCreate(title="[DEMO] sub", assignee_id=501, hours=2))
    assert s.key == "TA4009"
    assert c.posts()[0][3] == {"Task": {"Name": "[DEMO] sub", "WorkProduct": "/hierarchicalrequirement/1001",
                                        "Project": "/project/9001", "State": "Defined", "Owner": "/user/501",
                                        "Estimate": 2.0, "ToDo": 2.0}}


async def test_update_and_delete_sub_issue():
    c = client()
    a = make_adapter(c)
    assert (await a.update_sub_issue(4001, SubIssuePatch(status="done"))).status == "done"
    assert c.posts()[0][3] == {"Task": {"State": "Completed"}}
    await a.delete_sub_issue(4001)
    assert [x[1] for x in c.calls if x[0] == "DELETE"] == ["/task/4001"]


async def test_missing_sub_issue_is_404():
    c = standard(FakeClient()).on("QUERY", "/task", [])
    with pytest.raises(RallyError) as e:
        await make_adapter(c).update_sub_issue(4001, SubIssuePatch(status="done"))
    assert e.value.status == 404
    assert no_writes(c)


async def test_comment_post_and_delete():
    c = client()
    a = make_adapter(c)
    comment = await a.add_comment(1001, CommentCreate(html="<p>Nice</p>"))
    assert comment.id == 95 and c.posts()[0][3] == {"ConversationPost": {
        "Artifact": "/hierarchicalrequirement/1001", "Text": "<p>Nice</p>"}}
    await a.delete_comment(95)
    assert [x[1] for x in c.calls if x[0] == "DELETE"] == ["/conversationpost/95"]


async def test_deleting_an_update_on_a_demo_project_is_allowed():
    c = client(post=rally_post(95, "<p><b>Mira update · At risk</b></p>", artifact="portfolioitem/feature/201"))
    await make_adapter(c).delete_comment(95)
    assert [x[1] for x in c.calls if x[0] == "DELETE"] == ["/conversationpost/95"]




async def test_existing_tag_names_are_reused_and_new_ones_created():
    c = standard(FakeClient()).on("QUERY", "/tag", [{"Name": "ux"}])
    assert (await make_adapter(c).create_tag(TagCreate(name="ux"))).name == "ux" and c.posts() == []
    c2 = standard(FakeClient()).on("QUERY", "/tag", []).on("POST", "/tag/create", create_result({"Name": "new"}))
    assert (await make_adapter(c2).create_tag(TagCreate(name="new"))).name == "new"

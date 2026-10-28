import pytest

from app.domain import CommentCreate, SubIssueCreate, SubIssuePatch, TagCreate
from app.guard import GuardError
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


async def test_create_sub_issue_under_demo_issue():
    c = client()
    s = await make_adapter(c).create_sub_issue(1001, SubIssueCreate(title="[DEMO] sub", assignee_id=501, hours=2))
    assert s.key == "TA4009"
    assert c.posts()[0][3] == {"Task": {"Name": "[DEMO] sub", "WorkProduct": "/hierarchicalrequirement/1001",
                                        "Project": "/project/9001", "State": "Defined", "Owner": "/user/501",
                                        "Estimate": 2.0, "ToDo": 2.0, "Tags": [{"_ref": "/tag/7000"}]}}


async def test_sub_issue_writes_are_guarded():
    c = client(story=REAL_STORY, task=rally_task(Name="Real task", Tags=tags()))
    a = make_adapter(c)
    with pytest.raises(GuardError):
        await a.create_sub_issue(1001, SubIssueCreate(title="[DEMO] sub"))
    with pytest.raises(GuardError):
        await a.update_sub_issue(4001, SubIssuePatch(status="done"))
    with pytest.raises(GuardError):
        await a.delete_sub_issue(4001)
    assert no_writes(c)
    c2 = client()
    with pytest.raises(GuardError, match="prefix"):
        await make_adapter(c2).create_sub_issue(1001, SubIssueCreate(title="no prefix"))
    assert no_writes(c2)


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


async def test_comment_writes_on_real_items_are_refused():
    c = client(story=REAL_STORY)
    with pytest.raises(GuardError):
        await make_adapter(c).add_comment(1001, CommentCreate(html="<p>x</p>"))
    with pytest.raises(GuardError):
        await make_adapter(c).delete_comment(95)
    assert no_writes(c)


async def test_deleting_an_update_on_a_demo_project_is_allowed():
    c = client(post=rally_post(95, "<p><b>Mira update · At risk</b></p>", artifact="portfolioitem/feature/201"))
    await make_adapter(c).delete_comment(95)
    assert [x[1] for x in c.calls if x[0] == "DELETE"] == ["/conversationpost/95"]


async def test_deleting_an_update_on_a_real_portfolio_item_is_refused():
    real_feature = rally_feature(object_id=202, formatted_id="F202", name="Real feature",
                                 Project=ref_obj(f"project/{OTHER_TEAM_ID}"))
    c = standard(FakeClient())
    c.on("QUERY", "/conversationpost", [rally_post(95, "<p>x</p>", artifact="portfolioitem/feature/202")],
         query_has="ObjectID = 95")
    c.on("GET", "/portfolioitem/feature/202", {"PortfolioItem/Feature": real_feature})
    c.on("DELETE", "/conversationpost/95", {"OperationResult": {"Errors": [], "Warnings": []}})
    with pytest.raises(GuardError):
        await make_adapter(c).delete_comment(95)
    assert no_writes(c)


async def test_sub_issue_title_patch_needs_the_demo_prefix():
    c = client()
    with pytest.raises(GuardError, match="prefix"):
        await make_adapter(c).update_sub_issue(4001, SubIssuePatch(title="no prefix"))
    assert no_writes(c)
    await make_adapter(c).update_sub_issue(4001, SubIssuePatch(title="[DEMO] renamed"))
    assert c.posts()[0][3] == {"Task": {"Name": "[DEMO] renamed"}}


async def test_demo_named_and_tagged_sub_issue_in_another_team_is_refused():
    elsewhere = rally_task(Project=ref_obj(f"project/{OTHER_TEAM_ID}"))
    c = client(task=elsewhere)
    a = make_adapter(c)
    with pytest.raises(GuardError, match="demo team"):
        await a.update_sub_issue(4001, SubIssuePatch(status="done"))
    with pytest.raises(GuardError, match="demo team"):
        await a.delete_sub_issue(4001)
    assert no_writes(c)


async def test_tags_cannot_be_created_in_demo_mode_and_existing_names_are_reused():
    c0 = client()
    with pytest.raises(GuardError):
        await make_adapter(c0).create_tag(TagCreate(name="ux"))
    assert no_writes(c0)
    c = standard(FakeClient()).on("QUERY", "/tag", [{"Name": "ux"}])
    assert (await make_adapter(c, mode="off").create_tag(TagCreate(name="ux"))).name == "ux" and c.posts() == []
    c2 = standard(FakeClient()).on("QUERY", "/tag", []).on("POST", "/tag/create", create_result({"Name": "new"}))
    assert (await make_adapter(c2, mode="off").create_tag(TagCreate(name="new"))).name == "new"

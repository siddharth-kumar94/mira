from datetime import timedelta

import pytest

from fastapi.testclient import TestClient

from app.domain import PortfolioPatch, UpdateCreate
from app.main import create_app
from app.pm import format_update
from app.rally.client import RallyError
from app.rally.mapping import INITIATIVE_FETCH, PROJECT_FETCH
from tests.adapter_kit import NOW, attribute, make_adapter, priority_attribute, standard
from tests.fake_client import FakeClient
from tests.fixtures import (ME, OTHER_TEAM_ID, WORKSPACE_ID, PROJECT_ID, create_result, operation_result, rally_capability, rally_feature,
                            rally_post, rally_release, rally_story, rally_team, ref_obj, tags)

LATE = rally_feature(202, "F202", "Late feature", PlannedEndDate="2026-09-30T04:00:00.000Z",
                     Project=ref_obj(f"project/{OTHER_TEAM_ID}"), Parent=ref_obj("portfolioitem/capability/251"))
UPDATE = rally_post(96, format_update("at_risk", "<p>Vendor slip</p>", 0.4, "2026-12-31"), artifact="portfolioitem/feature/201",
                    created="2026-10-15T09:00:00.000Z")

# The capability fixture's Outcome (271), under a Program (Rally's level above Outcome, shown as "Initiative").
OUTCOME = {"ObjectID": 271, "Parent": ref_obj("portfolioitem/program/281", "[DEMO] Program")}


def portfolio_client(capability_rows=None, **typedefs) -> FakeClient:
    c = standard(FakeClient(), **typedefs)
    c.on("QUERY", "/project", [rally_team(PROJECT_ID, "Team - Demo"), rally_team(OTHER_TEAM_ID, "Team - AI/ML Solutions")])
    c.on("QUERY", "/portfolioitem/feature", [rally_feature()], query_has="Parent = /portfolioitem/capability")
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(), LATE], query_has="State = null")
    c.on("QUERY", "/portfolioitem/feature", [rally_feature()], query_has='FormattedID = "F201"')
    c.on("QUERY", "/portfolioitem/feature", [], query_has="FormattedID")
    c.on("QUERY", "/hierarchicalrequirement", [{"Feature": ref_obj("portfolioitem/feature/202")}], query_has="Blocked = true")
    c.on("QUERY", "/hierarchicalrequirement", [rally_story()], query_has="Feature = /portfolioitem/feature/201")
    c.on("QUERY", "/conversationpost", [UPDATE], query_has='Text contains "Mira update"')
    c.on("QUERY", "/conversationpost", [UPDATE, rally_post(97, "<p>plain</p>", artifact="portfolioitem/feature/201")])
    c.on("QUERY", "/portfolioitem/capability", capability_rows or [rally_capability()])
    c.on("QUERY", "/portfolioitem/outcome", [OUTCOME])
    # Rally matches a State's type by TypeDef.Name; TypeDef.ElementName finds nothing, so every initiative read Planned.
    c.on("QUERY", "/state", [{"Name": "Discovery", "OrderIndex": 2}, {"Name": "Developing", "OrderIndex": 3}],
         query_has='TypeDef.Name = "Capability"')
    c.on("QUERY", "/iteration", [])
    c.on("QUERY", "/release", [rally_release(701, "PI4 2026", "2026-09-10T04:00:00.000Z", "2026-12-31T04:59:59.000Z")])
    return c


async def test_project_list_has_health_from_updates_else_auto():
    c = portfolio_client()
    listing = await make_adapter(c).list_projects([PROJECT_ID, OTHER_TEAM_ID])
    by_key = {p.key: p for p in listing.projects}
    assert set(by_key) == {"F201", "F202"}
    reported, late = by_key["F201"], by_key["F202"]
    assert (reported.health.value, reported.health.source) == ("at_risk", "update")
    assert reported.latest_update.html == "<p>Vendor slip</p>"
    assert (late.health.value, late.health.source) == ("off_track", "auto")
    assert [i.key for i in listing.initiatives] == ["C251"] and {t.id for t in listing.teams} == {PROJECT_ID, OTHER_TEAM_ID}


async def test_blocked_counts_are_cached_for_a_minute():
    c = portfolio_client()
    a = make_adapter(c)
    await a.blocked_counts()
    await a.blocked_counts()
    assert len(c.queries("/hierarchicalrequirement")) == 1


async def test_projects_of_one_initiative():
    c = portfolio_client()
    listing = await make_adapter(c).list_projects([], initiative_id=251)
    assert [p.key for p in listing.projects] == ["F201"]
    with pytest.raises(ValueError):
        await make_adapter(c).list_projects([])


async def test_project_detail_splits_updates_from_comments():
    c = portfolio_client()
    d = await make_adapter(c).project_detail("f201")
    assert d.project.key == "F201" and d.description == "<p>Feature notes</p>"
    assert [i.key for i in d.issues] == ["US1001"]
    assert [u.id for u in d.updates] == [96] and [x.id for x in d.comments] == [97]
    with pytest.raises(RallyError) as e:
        await make_adapter(c).project_detail("F999")
    assert e.value.status == 404


async def test_initiatives_roll_up_active_project_health():
    c = portfolio_client()
    listing = await make_adapter(c).list_initiatives([PROJECT_ID])
    (i,) = listing.initiatives
    assert (i.key, i.status, i.group_name) == ("C251", "active", "[DEMO] Outcome")
    assert i.project_health == ["at_risk"] and (i.health.value, i.health.source) == ("at_risk", "auto")


async def test_initiative_detail():
    c = portfolio_client()
    d = await make_adapter(c).initiative_detail("251")
    assert d.initiative.key == "C251" and d.description == "<p>Capability notes</p>"
    assert [p.key for p in d.projects] == ["F201"]


PI4_DEMO = rally_release(701, "PI4 2026", "2026-09-10T04:00:00.000Z", "2026-12-31T04:59:59.000Z")
PI4_AIML = rally_release(702, "2026 PI4", "2026-09-10T04:00:00.000Z", "2026-12-31T04:59:59.000Z")  # the other team's copy
PI1_OLD = rally_release(650, "PI1 2024", "2024-01-04T05:00:00.000Z", "2024-03-28T04:00:00.000Z")


async def test_releases_merge_the_same_pi_across_teams_keeping_every_id():
    c = portfolio_client()
    c._routes.insert(0, ("QUERY", "/release", None,
                         lambda params, body: [PI4_AIML] if params.get("project") == f"/project/{OTHER_TEAM_ID}" else [PI4_DEMO]))
    rel = await make_adapter(c).releases([PROJECT_ID, OTHER_TEAM_ID])
    assert [(r.name, r.start, r.end, r.id, r.ids) for r in rel] == [("PI 4", "2026-09-10", "2026-12-30", 701, [701, 702])]


async def test_project_list_carries_the_pis_its_projects_point_at():
    # Projects in two teams point at their own team's copy of PI 4, and one at an old PI past any recent window.
    old = rally_feature(203, "F203", "Old feature", Release=ref_obj("release/650"), Project=ref_obj(f"project/{OTHER_TEAM_ID}"))
    late = {**LATE, "Release": ref_obj("release/702")}
    c = portfolio_client()
    c._routes.insert(0, ("QUERY", "/portfolioitem/feature", None, [rally_feature(), late, old]))
    c._routes.insert(0, ("QUERY", "/release", None, [PI4_DEMO, PI4_AIML, PI1_OLD]))
    listing = await make_adapter(c).list_projects([PROJECT_ID, OTHER_TEAM_ID])
    assert {p.key: p.pi_id for p in listing.projects} == {"F201": 701, "F202": 702, "F203": 650}
    assert [(r.name, r.ids) for r in listing.releases] == [("PI 1", [650]), ("PI 4", [701, 702])]
    (call,) = c.queries("/release")
    assert "project" not in call[2] and all(f"ObjectID = {i}" in call[2]["query"] for i in (650, 701, 702))  # by id, no cap


async def test_details_carry_their_projects_pis():
    c = portfolio_client()
    assert [r.ids for r in (await make_adapter(c).project_detail("F201")).releases] == [[701]]
    assert [r.ids for r in (await make_adapter(c).initiative_detail("251")).releases] == [[701]]


async def test_post_update_writes_header_body_and_footer():
    c = portfolio_client()
    c.on("POST", "/conversationpost/create", lambda p, b: create_result(rally_post(98, b["ConversationPost"]["Text"], artifact="portfolioitem/feature/201")))
    u = await make_adapter(c).post_update("project", "F201", UpdateCreate(health="at_risk", html="<p>Slipping</p>"))
    body = c.posts()[0][3]["ConversationPost"]
    assert body == {"Artifact": "/portfolioitem/feature/201", "Text": (
        "<p><b>Mira update · At risk</b></p><p>Slipping</p><p><i>progress 40% · target 2026-12-31</i></p>")}
    assert (u.id, u.health, u.html, u.progress, u.target) == (98, "at_risk", "<p>Slipping</p>", 0.4, "2026-12-31")


UNTAGGED = rally_feature(9001, "F9001", "[DEMO] F", Tags=tags())


def feature_client(row: dict) -> FakeClient:
    c = standard(FakeClient())
    c.on("QUERY", "/portfolioitem/feature", [row], query_has="FormattedID")
    c.on("POST", "/conversationpost/create", lambda p, b: create_result(rally_post(
        98, b["ConversationPost"]["Text"], artifact="portfolioitem/feature/9001")))
    return c


def api_post(adapter, path: str, body: dict):
    with TestClient(create_app(adapter)) as http:
        return http.post(path, json=body)


def test_post_update_on_an_untagged_feature():
    c = feature_client(UNTAGGED)
    r = api_post(make_adapter(c), "/api/projects/F9001/updates", {"health": "on_track"})
    assert r.status_code == 201
    assert len(c.posts()) == 1


def test_project_comment_round_trip():
    c = feature_client(rally_feature(9001, "F9001", "[DEMO] F"))
    r = api_post(make_adapter(c), "/api/projects/F9001/comments", {"html": "<p>[DEMO] hi</p>"})
    assert r.status_code == 201 and r.json()["html"] == "<p>[DEMO] hi</p>"
    (post,) = c.posts()
    assert post[3] == {"ConversationPost": {"Artifact": "/portfolioitem/feature/9001", "Text": "<p>[DEMO] hi</p>"}}


def test_initiative_comment_on_a_tagged_demo_capability():
    c = standard(FakeClient())
    c.on("QUERY", "/portfolioitem/capability", [rally_capability()], query_has="ObjectID = 251")
    c.on("POST", "/conversationpost/create", lambda p, b: create_result(rally_post(
        99, b["ConversationPost"]["Text"], artifact="portfolioitem/capability/251")))
    r = api_post(make_adapter(c), "/api/initiatives/251/comments", {"html": "<p>[DEMO] hi</p>"})
    assert r.status_code == 201
    assert c.posts()[0][3]["ConversationPost"]["Artifact"] == "/portfolioitem/capability/251"


def test_comment_on_an_untagged_feature():
    c = feature_client(UNTAGGED)
    assert api_post(make_adapter(c), "/api/projects/F9001/comments", {"html": "<p>x</p>"}).status_code == 201


# ---------- D38: priority on projects and initiatives, when Rally has the field ----------
ALLOWED = ("Highest", "High", "Medium", "Low")
NOISE = [attribute("Name", "Name", custom=False), attribute("c_Risk", "Risk")]


async def test_detects_priority_field():
    c = portfolio_client(feature=[*NOISE, priority_attribute(*ALLOWED)], capability=NOISE)
    a = make_adapter(c)
    found = await a.pm_priority()
    assert found["feature"].element == "c_Priority" and found["feature"].allowed == list(ALLOWED)  # the blank choice is dropped
    assert found["capability"] is None
    assert (await a.project_fetch()).split(",")[-1] == "c_Priority" and await a.initiative_fetch() == INITIATIVE_FETCH
    attribute_query = c.queries("/typedefinition/101/Attributes")[0][2]
    assert attribute_query["fetch"] == "ElementName,Name,Custom,AllowedValues"
    assert c.queries("/typedefinition")[0][2]["fetch"] == "Attributes"


async def test_priority_is_detected_once_per_session_and_forgotten_on_reset():
    c = portfolio_client(feature=[priority_attribute(*ALLOWED)])
    a = make_adapter(c)
    await a.pm_priority()
    await a.pm_priority()
    assert len(c.queries("/typedefinition")) == 2  # Feature and Capability, once
    a._reset()
    await a.pm_priority()
    assert len(c.queries("/typedefinition")) == 4


async def test_no_priority_field():
    c = portfolio_client(feature=NOISE, capability=NOISE)
    a = make_adapter(c)
    assert await a.pm_priority() == {"feature": None, "capability": None}
    assert await a.project_fetch() == PROJECT_FETCH
    await a.list_projects([PROJECT_ID])
    assert {call[2]["fetch"] for call in c.queries("/portfolioitem/feature")} == {PROJECT_FETCH}


async def test_ignores_noncustom_priority():
    c = portfolio_client(feature=[attribute("Priority", "Priority", custom=False, allowed=ALLOWED)])
    assert (await make_adapter(c).pm_priority())["feature"] is None


async def test_picks_a_custom_attribute_named_priority():
    c = portfolio_client(feature=[attribute("c_BusinessPriority", "Priority", allowed=ALLOWED)])
    assert (await make_adapter(c).pm_priority())["feature"].element == "c_BusinessPriority"


async def test_project_priority_is_fetched_and_read():
    c = portfolio_client(feature=[priority_attribute(*ALLOWED)])
    listing = await make_adapter(c).list_projects([PROJECT_ID, OTHER_TEAM_ID])
    assert all("c_Priority" in call[2]["fetch"].split(",") for call in c.queries("/portfolioitem/feature"))
    assert {p.key: p.priority for p in listing.projects} == {"F201": 0, "F202": 0}  # the fixtures carry no value
    c = standard(FakeClient(), feature=[priority_attribute(*ALLOWED)])
    c.on("QUERY", "/portfolioitem/feature", [rally_feature(c_Priority="High")], query_has="FormattedID")
    c.on("QUERY", "/project", [rally_team(PROJECT_ID, "Team - Demo")])
    c.on("QUERY", "/hierarchicalrequirement", [])
    c.on("QUERY", "/conversationpost", [])
    c.on("QUERY", "/release", [])
    assert (await make_adapter(c).project_detail("F201")).project.priority == 2


def priority_client(row: dict, allowed=ALLOWED, **typedefs) -> FakeClient:
    c = standard(FakeClient(), feature=[priority_attribute(*allowed)] if allowed is not None else [], **typedefs)
    c.on("QUERY", "/portfolioitem/feature", [row], query_has="FormattedID")
    c.on("QUERY", "/hierarchicalrequirement", [])
    c.on("QUERY", "/conversationpost", [])
    c.on("POST", f"/portfolioitem/feature/{row['ObjectID']}",
         lambda p, b: operation_result({**row, **b["PortfolioItem/Feature"]}))
    return c


def api_patch(adapter, path: str, body: dict):
    with TestClient(create_app(adapter)) as http:
        return http.patch(path, json=body)


async def test_set_project_priority_writes_allowed_value():
    c = priority_client(rally_feature(9001, "F9001", "[DEMO] F"))
    project = await make_adapter(c).set_portfolio_priority("project", "F9001", PortfolioPatch(priority=1))
    (post,) = c.posts()
    assert post[1] == "/portfolioitem/feature/9001" and post[3] == {"PortfolioItem/Feature": {"c_Priority": "Highest"}}
    assert "c_Priority" in post[2]["fetch"].split(",")
    assert (project.key, project.priority) == ("F9001", 1) and project.health is not None


async def test_set_project_priority_none_writes_empty():
    c = priority_client(rally_feature(9001, "F9001", "[DEMO] F", c_Priority="High"))
    project = await make_adapter(c).set_portfolio_priority("project", "F9001", PortfolioPatch(priority=0))
    assert c.posts()[0][3] == {"PortfolioItem/Feature": {"c_Priority": ""}} and project.priority == 0


def test_set_priority_without_field_is_422():
    c = priority_client(rally_feature(9001, "F9001", "[DEMO] F"), allowed=None)
    r = api_patch(make_adapter(c), "/api/projects/F9001", {"priority": 2})
    assert r.status_code == 422 and r.json() == {"error": "This workspace has no priority field for features"}
    r = api_patch(make_adapter(c), "/api/initiatives/C251", {"priority": 2})
    assert r.status_code == 422 and r.json() == {"error": "This workspace has no priority field for capabilities"}
    assert c.posts() == []


def test_set_priority_the_field_does_not_allow_is_422():
    c = priority_client(rally_feature(9001, "F9001", "[DEMO] F"), allowed=("High", "Low"))
    r = api_patch(make_adapter(c), "/api/projects/F9001", {"priority": 1})
    assert r.status_code == 422 and r.json() == {"error": "That priority isn't available in Rally"}
    assert c.posts() == []


def test_priority_patch_takes_only_a_priority():
    c = priority_client(rally_feature(9001, "F9001", "[DEMO] F"))
    for body in ({}, {"priority": 5}, {"priority": 1, "name": "x"}):
        assert api_patch(make_adapter(c), "/api/projects/F9001", body).status_code == 422
    assert c.posts() == []


def test_project_priority_round_trip_over_the_api():
    c = priority_client(rally_feature(9001, "F9001", "[DEMO] F"))
    r = api_patch(make_adapter(c), "/api/projects/F9001", {"priority": 2})
    assert r.status_code == 200 and r.json()["priority"] == 2 and r.json()["key"] == "F9001"


def test_set_initiative_priority_rereads_the_initiative():
    row = {**rally_capability(), "c_Priority": "Low"}
    c = portfolio_client([row], capability=[priority_attribute(*ALLOWED)])
    c.on("POST", "/portfolioitem/capability/251", lambda p, b: row.update(b["PortfolioItem/Capability"]) or operation_result(row))
    r = api_patch(make_adapter(c), "/api/initiatives/C251", {"priority": 1})
    assert c.posts()[0][3] == {"PortfolioItem/Capability": {"c_Priority": "Highest"}}
    assert r.status_code == 200 and (r.json()["key"], r.json()["priority"]) == ("C251", 1)


class Flaky:
    """A `/typedefinition` answer that fails until `ok` is set, then answers like Feature without a priority field."""
    def __init__(self, error: Exception):
        self.error, self.ok = error, False

    def __call__(self, params, body):
        if not self.ok:
            raise self.error
        return []


def failing_typedefs(error: Exception) -> tuple[FakeClient, Flaky]:
    c = FakeClient()
    c.on("GET", "/user", {"User": ME}).on("GET", f"/workspace/{WORKSPACE_ID}", {"Workspace": {"ObjectID": WORKSPACE_ID, "Name": "W"}})
    flaky = Flaky(error)
    c.on("QUERY", "/typedefinition", flaky)
    return c, flaky


async def test_a_failed_type_definition_read_means_no_field_not_no_app(caplog):
    c, _ = failing_typedefs(RallyError(403, "Rally returned HTTP 403"))
    a = make_adapter(c)
    with caplog.at_level("WARNING", logger="mira"):
        assert await a.pm_priority() == {"feature": None, "capability": None}
    assert await a.project_fetch() == PROJECT_FETCH and await a.initiative_fetch() == INITIATIVE_FETCH
    assert "priority" in caplog.text and "403" in caplog.text


async def test_a_failed_type_definition_read_is_retried_after_a_minute_not_on_every_call():
    now = [NOW]
    c, flaky = failing_typedefs(RallyError(502, "Couldn't reach Rally (ConnectError)"))
    a = make_adapter(c, clock=lambda: now[0])
    await a.pm_priority()
    await a.pm_priority()
    assert len(c.queries("/typedefinition")) == 2  # Feature and Capability, once each
    now[0] += timedelta(seconds=61)
    await a.pm_priority()
    assert len(c.queries("/typedefinition")) == 4  # retried after the TTL, still failing
    flaky.ok = True
    now[0] += timedelta(seconds=61)
    assert await a.pm_priority() == {"feature": None, "capability": None}
    assert len(c.queries("/typedefinition")) == 6
    now[0] += timedelta(hours=1)
    await a.pm_priority()
    assert len(c.queries("/typedefinition")) == 6  # a success is kept for the session


async def test_only_the_failed_kind_is_retried():
    now = [NOW]
    c = standard(FakeClient(), feature=[priority_attribute(*ALLOWED)])
    c._routes = [r for r in c._routes if not (r[1] == "/typedefinition" and "Capability" in (r[2] or ""))]
    boom = RallyError(503, "Rally returned HTTP 503")
    c.on("QUERY", "/typedefinition", boom, query_has="Capability")
    a = make_adapter(c, clock=lambda: now[0])
    found = await a.pm_priority()
    assert found["feature"].element == "c_Priority" and found["capability"] is None
    now[0] += timedelta(seconds=61)
    await a.pm_priority()
    assert [call[2]["query"] for call in c.queries("/typedefinition")].count('(TypePath = "PortfolioItem/Feature")') == 1


async def test_a_rejected_key_still_fails_the_type_definition_read():
    c, _ = failing_typedefs(RallyError(401, "Rally rejected the API key"))
    with pytest.raises(RallyError) as e:
        await make_adapter(c).pm_priority()
    assert e.value.status == 401


async def test_capabilities_carry_their_outcomes_parent():
    c = portfolio_client()
    (i,) = (await make_adapter(c).list_initiatives([PROJECT_ID])).initiatives
    assert (i.group_id, i.parent_group_id, i.parent_group_name) == (271, 281, "[DEMO] Program")
    (call,) = c.queries("/portfolioitem/outcome")
    assert call[2]["fetch"] == "ObjectID,Parent" and call[2]["query"] == "(ObjectID = 271)"


async def test_feature_list_capabilities_carry_their_outcomes_parent_too():
    """Both reads fill the fields, so a store merge from either can't wipe them."""
    listing = await make_adapter(portfolio_client()).list_projects([PROJECT_ID, OTHER_TEAM_ID])
    assert [(i.parent_group_id, i.parent_group_name) for i in listing.initiatives] == [(281, "[DEMO] Program")]


async def test_an_outcome_with_no_parent_gives_none():
    c = portfolio_client()
    c._routes.insert(0, ("QUERY", "/portfolioitem/outcome", None, [{"ObjectID": 271, "Parent": None}]))
    (i,) = (await make_adapter(c).list_initiatives([PROJECT_ID])).initiatives
    assert (i.group_id, i.parent_group_id, i.parent_group_name) == (271, None, None)


async def test_a_capability_with_no_outcome_asks_nothing():
    c = portfolio_client(capability_rows=[rally_capability(Parent=None)])
    (i,) = (await make_adapter(c).list_initiatives([PROJECT_ID])).initiatives
    assert (i.group_id, i.parent_group_id) == (None, None) and c.queries("/portfolioitem/outcome") == []


async def test_outcome_parents_are_read_once_per_session_and_forgotten_on_reset():
    c = portfolio_client()
    a = make_adapter(c)
    await a.list_initiatives([PROJECT_ID])
    await a.list_projects([PROJECT_ID])
    assert await a.outcome_parents([271]) == {271: (281, "[DEMO] Program")}
    assert len(c.queries("/portfolioitem/outcome")) == 1
    a._reset()
    await a.outcome_parents([271])
    assert len(c.queries("/portfolioitem/outcome")) == 2


async def test_outcome_parents_ask_only_for_the_ids_they_lack():
    c = portfolio_client()
    c._routes.insert(0, ("QUERY", "/portfolioitem/outcome", None, [OUTCOME, {"ObjectID": 272, "Parent": None}]))
    a = make_adapter(c)
    await a.outcome_parents([271])
    assert await a.outcome_parents([271, 272]) == {271: (281, "[DEMO] Program"), 272: None}
    assert [call[2]["query"] for call in c.queries("/portfolioitem/outcome")] == ["(ObjectID = 271)", "(ObjectID = 272)"]


async def test_a_failed_outcome_read_leaves_the_list_working_and_is_retried(caplog):
    c = portfolio_client()
    c._routes.insert(0, ("QUERY", "/portfolioitem/outcome", None, RallyError(403, "Rally returned HTTP 403")))
    a = make_adapter(c)
    with caplog.at_level("WARNING", logger="mira"):
        (i,) = (await a.list_initiatives([PROJECT_ID])).initiatives
    assert (i.key, i.group_name, i.parent_group_id, i.parent_group_name) == ("C251", "[DEMO] Outcome", None, None)
    assert "403" in caplog.text
    tried = len(c.queries("/portfolioitem/outcome"))  # the feature read and the capability read each tried (nothing kept)
    assert tried == 2
    c._routes.pop(0)
    (i,) = (await a.list_initiatives([PROJECT_ID])).initiatives
    assert i.parent_group_name == "[DEMO] Program" and len(c.queries("/portfolioitem/outcome")) == tried + 1


async def test_a_rejected_key_still_fails_the_outcome_read():
    c = portfolio_client()
    c._routes.insert(0, ("QUERY", "/portfolioitem/outcome", None, RallyError(401, "Rally rejected the API key")))
    with pytest.raises(RallyError) as e:
        await make_adapter(c).list_initiatives([PROJECT_ID])
    assert e.value.status == 401

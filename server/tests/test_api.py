from fastapi.testclient import TestClient

from app.domain import BadRequest, Session, User
from app.main import create_app, parse_ids
from app.rally.client import RallyError
from app.rally.mapping import initiative_from_rally, issue_from_rally, project_from_rally
from tests.fixtures import rally_capability, rally_feature, rally_story

import pytest


class FakeAdapter:
    """Any method named in `behaviour` exists; its value is returned (or raised, or called with the args)."""

    def __init__(self, **behaviour):
        self.behaviour = behaviour
        self.calls: list[tuple] = []
        self.closed = False

    def __getattr__(self, name):
        if name.startswith("_") or name not in self.behaviour:
            raise AttributeError(name)

        async def call(*args):
            self.calls.append((name, *args))
            b = self.behaviour[name]
            if isinstance(b, Exception):
                raise b
            return b(*args) if callable(b) else b
        return call

    async def aclose(self):
        self.closed = True


def issue():
    return issue_from_rally(rally_story())


def client_for(adapter) -> TestClient:
    return TestClient(create_app(adapter))


def test_parse_ids():
    assert parse_ids("") == [] and parse_ids("1, 2,3") == [1, 2, 3]
    with pytest.raises(ValueError):
        parse_ids("1,x")


def test_bad_request_is_a_422_with_its_message():
    with client_for(FakeAdapter(team_load=BadRequest("cursor starts at 1"))) as c:
        r = c.get("/api/teams/9001")
    assert r.status_code == 422 and r.json() == {"error": "cursor starts at 1"}


def test_unexpected_value_error_is_a_logged_500(caplog):
    with client_for(FakeAdapter(team_load=ValueError("invalid literal for int(): '_SECRET123'"))) as c:
        with caplog.at_level("ERROR", logger="mira"):
            r = c.get("/api/teams/9001")
    assert r.status_code == 500 and r.json() == {"error": "Something went wrong reading Rally data"}
    assert "_SECRET123" not in r.text
    assert any(rec.exc_info and rec.levelname == "ERROR" for rec in caplog.records)


def test_session_routes_never_echo_the_key():
    session = Session(connected=True, me=User(id=501, name="Dana Demo"))
    adapter = FakeAdapter(session=session, connect=session, disconnect=Session(connected=False))
    with client_for(adapter) as c:
        assert c.get("/api/session").json()["connected"] is True
        r = c.post("/api/session", json={"api_key": "_SECRET123"})
        assert r.status_code == 200 and "_SECRET123" not in r.text
        assert c.delete("/api/session").json()["connected"] is False
    assert ("connect", "_SECRET123") in adapter.calls


def test_rejected_key_is_401_and_not_echoed():
    with client_for(FakeAdapter(connect=RallyError(401, "Rally rejected that key"))) as c:
        r = c.post("/api/session", json={"api_key": "_SECRET123"})
    assert r.status_code == 401 and r.json() == {"error": "Rally rejected that key"} and "_SECRET123" not in r.text


def test_reads_pass_parsed_arguments():
    page = {"issues": [], "next_cursor": None, "cycles": [], "projects": [], "users": []}
    changes = {**page, "sub_issues": [], "server_time": "2026-10-16T11:59:30.000Z"}
    del changes["next_cursor"]
    adapter = FakeAdapter(team_issues=page, changes=changes, users=[], labels=["ux"], releases=[])
    with client_for(adapter) as c:
        assert c.get("/api/teams/9002/issues?cursor=101").status_code == 200
        assert c.get("/api/changes?since=2026-10-16T11:59:00.000Z&teams=9001,9002").status_code == 200
        assert c.get("/api/labels?q=u").json() == ["ux"]
        assert c.get("/api/releases?teams=9001").status_code == 200
        assert c.get("/api/changes?since=x&teams=a").status_code == 422
    assert ("team_issues", 9002, 101) in adapter.calls
    assert ("changes", "2026-10-16T11:59:00.000Z", [9001, 9002]) in adapter.calls


def test_issue_ref_is_passed_through_as_text():
    detail = {"issue": issue().model_dump(), "sub_issues": [], "comments": [], "activity": [], "cycles": [],
              "projects": [], "users": []}
    adapter = FakeAdapter(get_issue=detail)
    with client_for(adapter) as c:
        body = c.get("/api/issues/us1001").json()
    assert body["issue"]["key"] == "US1001" and adapter.calls == [("get_issue", "us1001")]
    assert "_ref" not in str(body)


def test_patch_passes_only_set_fields():
    seen = []
    adapter = FakeAdapter(update_issue=lambda i, p: (seen.append(p.model_dump(exclude_unset=True)), issue())[1])
    with client_for(adapter) as c:
        assert c.patch("/api/issues/1001", json={"assignee_id": None}).status_code == 200
        assert c.patch("/api/issues/1001", json={"status": "backlog", "cycle_id": 301}).status_code == 422
        assert c.patch("/api/issues/1001", json={"state": "Defined"}).status_code == 422  # v1 field names are gone
    assert seen == [{"assignee_id": None}]


def test_writes_and_deletes():
    adapter = FakeAdapter(delete_comment=None, delete_sub_issue=None, create_tag={"name": "ux"},
                          post_update=lambda kind, ref, body: {"id": 98, "author": None, "health": body.health, "html": "",
                                                               "created_at": "t", "progress": 0.4, "target": None})
    with client_for(adapter) as c:
        assert c.delete("/api/comments/95").json() == {"ok": True}
        assert c.delete("/api/sub-issues/4001").json() == {"ok": True}
        assert c.post("/api/tags", json={"name": "ux"}).status_code == 201
        r = c.post("/api/projects/F201/updates", json={"health": "at_risk", "html": "<p>x</p>"})
        assert r.status_code == 201 and r.json()["health"] == "at_risk"
        assert c.post("/api/initiatives/C251/updates", json={"health": "nope"}).status_code == 422
    assert ("post_update", "project", "F201") == adapter.calls[-1][:3]


def test_portfolio_comments_answer_201_and_forward_the_kind():
    comment = {"id": 99, "author": None, "html": "<p>hi</p>", "created_at": "t"}
    adapter = FakeAdapter(post_portfolio_comment=lambda kind, ref, body: comment)
    with client_for(adapter) as c:
        assert c.post("/api/projects/F201/comments", json={"html": "<p>hi</p>"}).status_code == 201
        assert c.post("/api/initiatives/C251/comments", json={"html": "<p>hi</p>"}).json()["id"] == 99
        assert c.post("/api/projects/F201/comments", json={"html": ""}).status_code == 422
    assert [call[:3] for call in adapter.calls] == [("post_portfolio_comment", "project", "F201"),
                                                    ("post_portfolio_comment", "initiative", "C251")]


def test_portfolio_priority_patch_forwards_the_kind_and_only_a_priority():
    seen = []
    project, initiative = project_from_rally(rally_feature()), initiative_from_rally(rally_capability(), {})
    adapter = FakeAdapter(set_portfolio_priority=lambda kind, ref, body: (
        seen.append((kind, ref, body.priority)), project if kind == "project" else initiative)[1])
    with client_for(adapter) as c:
        assert c.patch("/api/projects/F201", json={"priority": 3}).json()["key"] == "F201"
        assert c.patch("/api/initiatives/C251", json={"priority": 0}).json()["key"] == "C251"
        assert c.patch("/api/initiatives/C251", json={"priority": 5}).status_code == 422
        assert c.patch("/api/projects/F201", json={"name": "x"}).status_code == 422
        assert c.patch("/api/projects/F201", json={}).status_code == 422
    assert seen == [("project", "F201", 3), ("initiative", "C251", 0)]


def test_rally_errors_keep_status():
    adapter = FakeAdapter(team_load=RallyError(404, "Team 1 was not found"))
    with client_for(adapter) as c:
        assert c.get("/api/teams/1").status_code == 404


def test_adapter_is_closed_on_shutdown():
    adapter = FakeAdapter()
    with client_for(adapter):
        pass
    assert adapter.closed


def test_cycle_routes_pass_the_team_cycle_and_past():
    from app.domain import CycleList
    adapter = FakeAdapter(team_cycles=CycleList(cycles=[], stats=[], has_older=False),
                          cycle_detail=RallyError(404, "Sprint 9 was not found"))
    with client_for(adapter) as c:
        assert c.get("/api/teams/5/cycles").json() == {"cycles": [], "stats": [], "has_older": False}
        assert c.get("/api/teams/5/cycles?past=7").status_code == 200
        r = c.get("/api/teams/5/cycles/9")
        assert r.status_code == 404 and r.json() == {"error": "Sprint 9 was not found"}
    assert [call for call in adapter.calls if call[0] == "team_cycles"] == [("team_cycles", 5, 2), ("team_cycles", 5, 7)]
